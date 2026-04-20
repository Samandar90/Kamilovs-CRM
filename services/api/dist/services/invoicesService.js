"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoicesService = void 0;
const aiCacheService_1 = require("../ai/aiCacheService");
const env_1 = require("../config/env");
const errorHandler_1 = require("../middleware/errorHandler");
const billingTypes_1 = require("../repositories/interfaces/billingTypes");
const numbers_1 = require("../utils/numbers");
const TERMINAL_STATUSES = new Set(["paid", "cancelled", "refunded"]);
const ALLOWED_STATUS_TRANSITIONS = {
    draft: ["issued", "cancelled"],
    issued: ["partially_paid", "paid", "cancelled"],
    partially_paid: ["paid", "cancelled", "refunded"],
    paid: ["refunded"],
    cancelled: [],
    refunded: [],
};
const roundMoney = (value) => {
    const n = (0, numbers_1.parseNumericInput)(value);
    if (n === null) {
        throw new errorHandler_1.ApiError(400, "Некорректная денежная сумма");
    }
    return (0, numbers_1.roundMoney2)(n);
};
const normalizeInvoiceNumber = (value) => {
    if (typeof value !== "string" || value.trim() === "") {
        return `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    return value.trim();
};
/**
 * Количество — не денежная сумма: нельзя округлять до 2 знаков (иначе 0.847 → 0.85 и падают проверки / 400).
 */
const parseLineQuantity = (value, index) => {
    const n = (0, numbers_1.parseNumericInput)(value);
    if (n === null || n <= 0) {
        throw new errorHandler_1.ApiError(400, `Item at index ${index}: 'quantity' must be greater than 0`);
    }
    return n;
};
const parseServiceId = (value, index) => {
    const n = (0, numbers_1.parseNumericInput)(value);
    const parsed = n != null ? Math.trunc(n) : NaN;
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new errorHandler_1.ApiError(400, `Item at index ${index}: 'serviceId' must be a positive integer`);
    }
    return parsed;
};
const resolveLineItemsFromServices = async (servicesRepository, rawItems) => {
    const result = [];
    for (let index = 0; index < rawItems.length; index++) {
        const line = rawItems[index];
        const serviceId = parseServiceId(line.serviceId, index);
        const quantity = parseLineQuantity(line.quantity, index);
        const service = await servicesRepository.findById(serviceId);
        if (!service) {
            throw new errorHandler_1.ApiError(404, `Service ${serviceId} not found`);
        }
        const rawPrice = line.price !== undefined && line.price !== null
            ? line.price
            : line.unitPrice !== undefined && line.unitPrice !== null
                ? line.unitPrice
                : service.price;
        const unitPrice = (0, numbers_1.roundMoney2)((0, numbers_1.parseRequiredMoney)(rawPrice, "price"));
        if (typeof unitPrice !== "number" || Number.isNaN(unitPrice)) {
            throw new Error("Invalid price before insert");
        }
        if (unitPrice <= 0) {
            throw new errorHandler_1.ApiError(400, `Service ${serviceId} has invalid price`);
        }
        const description = typeof line.description === "string" && line.description.trim() !== ""
            ? line.description.trim()
            : service.name;
        const lineTotal = roundMoney(quantity * unitPrice);
        result.push({
            serviceId,
            description,
            quantity,
            unitPrice,
            lineTotal,
        });
    }
    // eslint-disable-next-line no-console
    console.log("FINAL INVOICE ITEMS:", result);
    return result;
};
const computeTotals = (items, discountInput) => {
    const subtotal = roundMoney(items.reduce((acc, item) => acc + roundMoney(item.lineTotal), 0));
    const discount = roundMoney(discountInput ?? 0);
    const total = roundMoney(subtotal - discount);
    if (discount < 0) {
        throw new errorHandler_1.ApiError(400, "Field 'discount' must be greater than or equal to 0");
    }
    if (discount > subtotal + 1e-6) {
        throw new errorHandler_1.ApiError(400, "Скидка не может превышать сумму позиций (subtotal)");
    }
    if (total < 0) {
        throw new errorHandler_1.ApiError(400, "Invoice total cannot be negative");
    }
    return { subtotal, discount, total };
};
const ensurePatientExists = async (invoicesRepository, patientId) => {
    const exists = await invoicesRepository.patientExists(patientId);
    if (!exists) {
        throw new errorHandler_1.ApiError(404, "Patient not found");
    }
};
const ensureAppointmentForInvoice = async (invoicesRepository, appointmentId, patientId) => {
    if (appointmentId === undefined || appointmentId === null) {
        throw new errorHandler_1.ApiError(400, "Field 'appointmentId' is required");
    }
    const appointmentFound = await invoicesRepository.appointmentExists(appointmentId);
    if (!appointmentFound) {
        throw new errorHandler_1.ApiError(404, "Appointment not found");
    }
    const appointmentPatientId = await invoicesRepository.getAppointmentPatientId(appointmentId);
    if (appointmentPatientId === null) {
        throw new errorHandler_1.ApiError(404, "Appointment not found");
    }
    if (appointmentPatientId !== patientId) {
        throw new errorHandler_1.ApiError(400, "Invoice patient must match appointment patient");
    }
};
const ensureStatusTransitionAllowed = (currentStatus, nextStatus) => {
    if (currentStatus === nextStatus) {
        return;
    }
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
    if (!allowed.includes(nextStatus)) {
        throw new errorHandler_1.ApiError(400, `Invalid invoice status transition: '${currentStatus}' -> '${nextStatus}'`);
    }
};
class InvoicesService {
    constructor(invoicesRepository, servicesRepository) {
        this.invoicesRepository = invoicesRepository;
        this.servicesRepository = servicesRepository;
    }
    async list(_auth, filters = {}) {
        return this.invoicesRepository.findAll(filters);
    }
    async getById(_auth, id) {
        return this.invoicesRepository.findById(id);
    }
    async create(_auth, payload) {
        if (!Array.isArray(payload.items) || payload.items.length === 0) {
            throw new errorHandler_1.ApiError(400, "Field 'items' must contain at least one line with a service");
        }
        if (payload.paidAmount !== undefined) {
            throw new errorHandler_1.ApiError(400, "Field 'paidAmount' cannot be set when creating an invoice — use payments");
        }
        const status = payload.status ?? "draft";
        if (!billingTypes_1.INVOICE_STATUSES.includes(status)) {
            throw new errorHandler_1.ApiError(400, "Invalid invoice status");
        }
        const discount = roundMoney(payload.discount ?? 0);
        const number = normalizeInvoiceNumber(payload.number);
        const patientIdRaw = (0, numbers_1.parseNumericInput)(payload.patientId);
        const patientId = patientIdRaw != null ? Math.trunc(patientIdRaw) : NaN;
        const appointmentIdRaw = payload.appointmentId ?? null;
        const appointmentId = appointmentIdRaw === null || appointmentIdRaw === undefined
            ? null
            : (() => {
                const n = (0, numbers_1.parseNumericInput)(appointmentIdRaw);
                return n != null ? Math.trunc(n) : NaN;
            })();
        if (!Number.isInteger(patientId) || patientId <= 0) {
            throw new errorHandler_1.ApiError(400, "Field 'patientId' must be a positive integer");
        }
        if (appointmentId === null || !Number.isInteger(appointmentId) || appointmentId <= 0) {
            throw new errorHandler_1.ApiError(400, "Field 'appointmentId' is required and must be a positive integer");
        }
        await ensurePatientExists(this.invoicesRepository, patientId);
        await ensureAppointmentForInvoice(this.invoicesRepository, appointmentId, patientId);
        const resolvedItems = await resolveLineItemsFromServices(this.servicesRepository, payload.items);
        const totals = computeTotals(resolvedItems, discount);
        const invoiceInput = {
            number,
            patientId,
            appointmentId,
            status,
            subtotal: totals.subtotal,
            discount: totals.discount,
            total: totals.total,
            paidAmount: 0,
        };
        if (env_1.env.debugInvoiceCreate) {
            // eslint-disable-next-line no-console
            console.log("[InvoicesService.create] normalized invoiceInput + resolvedItems", JSON.stringify({ invoiceInput, resolvedItems }));
        }
        // eslint-disable-next-line no-console
        console.log("INVOICE INSERT DATA:", JSON.stringify({
            patientId,
            appointmentId,
            status,
            items: resolvedItems,
        }, null, 2));
        try {
            const created = await this.invoicesRepository.create(invoiceInput, resolvedItems);
            const fullInvoice = await this.invoicesRepository.findById(created.id);
            if (!fullInvoice) {
                throw new errorHandler_1.ApiError(500, "Failed to load created invoice");
            }
            (0, aiCacheService_1.invalidateClinicFactsCache)();
            return fullInvoice;
        }
        catch (err) {
            const pg = err;
            if (pg.code === "23505") {
                const d = (pg.detail ?? "").toLowerCase();
                if (pg.constraint === "uq_invoices_active_appointment" || d.includes("appointment_id")) {
                    throw new errorHandler_1.ApiError(409, "An open invoice already exists for this appointment (cancel it or complete payment first)");
                }
                throw new errorHandler_1.ApiError(409, "Invoice number already exists");
            }
            throw err;
        }
    }
    async update(auth, id, payload) {
        if (payload.paidAmount !== undefined) {
            throw new errorHandler_1.ApiError(400, "Field 'paidAmount' cannot be updated via invoices API — use payments");
        }
        if (auth.role === "cashier") {
            const restricted = payload.number !== undefined ||
                payload.patientId !== undefined ||
                payload.appointmentId !== undefined ||
                payload.discount !== undefined ||
                payload.items !== undefined;
            if (restricted) {
                throw new errorHandler_1.ApiError(403, "Кассир может менять только статус счёта; позиции и реквизиты недоступны");
            }
            if (payload.status === undefined) {
                throw new errorHandler_1.ApiError(400, "Для кассира укажите поле status");
            }
        }
        const current = await this.invoicesRepository.findById(id);
        if (!current) {
            return null;
        }
        const hasAnyUpdateField = payload.number !== undefined ||
            payload.patientId !== undefined ||
            payload.appointmentId !== undefined ||
            payload.status !== undefined ||
            payload.discount !== undefined ||
            payload.items !== undefined;
        if (!hasAnyUpdateField) {
            throw new errorHandler_1.ApiError(400, "At least one field must be provided for update");
        }
        if (payload.items !== undefined && TERMINAL_STATUSES.has(current.status)) {
            throw new errorHandler_1.ApiError(400, "Cannot modify invoice items after paid, refunded, or cancelled status");
        }
        const nextStatus = payload.status ?? current.status;
        ensureStatusTransitionAllowed(current.status, nextStatus);
        const nextPatientId = payload.patientId ?? current.patientId;
        const nextAppointmentId = payload.appointmentId !== undefined ? payload.appointmentId : current.appointmentId;
        if (payload.appointmentId !== undefined || payload.patientId !== undefined) {
            await ensurePatientExists(this.invoicesRepository, nextPatientId);
            await ensureAppointmentForInvoice(this.invoicesRepository, nextAppointmentId, nextPatientId);
        }
        let effectiveItems;
        let replaceLineItems;
        if (payload.items !== undefined) {
            effectiveItems = await resolveLineItemsFromServices(this.servicesRepository, payload.items);
            replaceLineItems = effectiveItems;
        }
        else {
            effectiveItems = current.items.map((item) => ({
                serviceId: item.serviceId,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal,
            }));
        }
        if (effectiveItems.length === 0) {
            throw new errorHandler_1.ApiError(400, "Invoice must contain at least one item");
        }
        const nextDiscount = payload.discount ?? current.discount;
        const totals = computeTotals(effectiveItems, nextDiscount);
        const nextPaidAmount = roundMoney(current.paidAmount);
        if (nextPaidAmount > totals.total) {
            throw new errorHandler_1.ApiError(400, "Current payments exceed recomputed invoice total — void payments or adjust line items");
        }
        const updatePayload = {
            number: payload.number !== undefined
                ? normalizeInvoiceNumber(payload.number)
                : undefined,
            patientId: payload.patientId !== undefined ? nextPatientId : undefined,
            appointmentId: payload.appointmentId !== undefined ? nextAppointmentId ?? null : undefined,
            status: nextStatus,
            subtotal: totals.subtotal,
            discount: totals.discount,
            total: totals.total,
        };
        try {
            const updated = await this.invoicesRepository.update(id, updatePayload, replaceLineItems);
            if (!updated) {
                return null;
            }
            const fullInvoice = await this.invoicesRepository.findById(id);
            if (!fullInvoice) {
                throw new errorHandler_1.ApiError(500, "Failed to load updated invoice");
            }
            (0, aiCacheService_1.invalidateClinicFactsCache)();
            return fullInvoice;
        }
        catch (err) {
            const pg = err;
            if (pg.code === "23505") {
                const d = (pg.detail ?? "").toLowerCase();
                if (pg.constraint === "uq_invoices_active_appointment" || d.includes("appointment_id")) {
                    throw new errorHandler_1.ApiError(409, "An open invoice already exists for this appointment (cancel it or complete payment first)");
                }
                throw new errorHandler_1.ApiError(409, "Invoice number already exists");
            }
            throw err;
        }
    }
    async delete(_auth, id) {
        const ok = await this.invoicesRepository.delete(id);
        if (ok)
            (0, aiCacheService_1.invalidateClinicFactsCache)();
        return ok;
    }
}
exports.InvoicesService = InvoicesService;
