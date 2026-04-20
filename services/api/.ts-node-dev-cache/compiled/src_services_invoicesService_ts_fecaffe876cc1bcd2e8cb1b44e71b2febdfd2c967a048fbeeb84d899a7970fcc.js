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
        if (!Number.isFinite(unitPrice)) {
            throw new errorHandler_1.ApiError(400, `Item at index ${index}: invalid unit price before insert`);
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
        console.log("INVOICE INSERT DATA:", JSON.stringify({ items: resolvedItems }, null, 2));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvc2VydmljZXMvaW52b2ljZXNTZXJ2aWNlLnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9zZXJ2aWNlcy9pbnZvaWNlc1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEseURBQWtFO0FBQ2xFLHVDQUFvQztBQUNwQyw2REFBc0Q7QUFDdEQsMEVBU2lEO0FBSWpELDhDQUFzRjtBQUV0RixNQUFNLGlCQUFpQixHQUFHLElBQUksR0FBRyxDQUFnQixDQUFDLE1BQU0sRUFBRSxXQUFXLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUVwRixNQUFNLDBCQUEwQixHQUEyQztJQUN6RSxLQUFLLEVBQUUsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDO0lBQzlCLE1BQU0sRUFBRSxDQUFDLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxXQUFXLENBQUM7SUFDL0MsY0FBYyxFQUFFLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUM7SUFDakQsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDO0lBQ2xCLFNBQVMsRUFBRSxFQUFFO0lBQ2IsUUFBUSxFQUFFLEVBQUU7Q0FDYixDQUFDO0FBaUNGLE1BQU0sVUFBVSxHQUFHLENBQUMsS0FBYyxFQUFVLEVBQUU7SUFDNUMsTUFBTSxDQUFDLEdBQUcsSUFBQSwyQkFBaUIsRUFBQyxLQUFLLENBQUMsQ0FBQztJQUNuQyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNmLE1BQU0sSUFBSSx1QkFBUSxDQUFDLEdBQUcsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFDRCxPQUFPLElBQUEscUJBQVcsRUFBQyxDQUFDLENBQUMsQ0FBQztBQUN4QixDQUFDLENBQUM7QUFFRixNQUFNLHNCQUFzQixHQUFHLENBQUMsS0FBYyxFQUFV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Q3JDLE9BQU8sRUFBRSxDQUFDO0lBQ1osQ0FBQztDQUNGO0FBelBELDBDQXlQQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGludmFsaWRhdGVDbGluaWNGYWN0c0NhY2hlIH0gZnJvbSBcIi4uL2FpL2FpQ2FjaGVTZXJ2aWNlXCI7XHJcbmltcG9ydCB7IGVudiB9IGZyb20gXCIuLi9jb25maWcvZW52XCI7XHJcbmltcG9ydCB7IEFwaUVycm9yIH0gZnJvbSBcIi4uL21pZGRsZXdhcmUvZXJyb3JIYW5kbGVyXCI7XHJcbmltcG9ydCB7XHJcbiAgSU5WT0lDRV9TVEFUVVNFUyxcclxuICB0eXBlIEludm9pY2UsXHJcbiAgdHlwZSBJbnZvaWNlQ3JlYXRlSW5wdXQsXHJcbiAgdHlwZSBJbnZvaWNlRmlsdGVycyxcclxuICB0eXBlIEludm9pY2VJdGVtSW5wdXQsXHJcbiAgdHlwZSBJbnZvaWNlU3RhdHVzLFxyXG4gIHR5cGUgSW52b2ljZVN1bW1hcnksXHJcbiAgdHlwZSBJbnZvaWNlVXBkYXRlSW5wdXQsXHJcbn0gZnJvbSBcIi4uL3JlcG9zaXRvcmllcy9pbnRlcmZhY2VzL2JpbGxpbmdUeXBlc1wiO1xyXG5pbXBvcnQgdHlwZSB7IElJbnZvaWNlc1JlcG9zaXRvcnkgfSBmcm9tIFwiLi4vcmVwb3NpdG9yaWVzL2ludGVyZmFjZXMvSUludm9pY2VzUmVwb3NpdG9yeVwiO1xyXG5pbXBvcnQgdHlwZSB7IElTZXJ2aWNlc1JlcG9zaXRvcnkgfSBmcm9tIFwiLi4vcmVwb3NpdG9yaWVzL2ludGVyZmFjZXMvSVNlcnZpY2VzUmVwb3NpdG9yeVwiO1xyXG5pbXBvcnQgdHlwZSB7IEF1dGhUb2tlblBheWxvYWQgfSBmcm9tIFwiLi4vcmVwb3NpdG9yaWVzL2ludGVyZmFjZXMvdXNlclR5cGVzXCI7XHJcbmltcG9ydCB7IHBhcnNlTnVtZXJpY0lucHV0LCBwYXJzZVJlcXVpcmVkTW9uZXksIHJvdW5kTW9uZXkyIH0gZnJvbSBcIi4uL3V0aWxzL251bWJlcnNcIjtcclxuXHJcbmNvbnN0IFRFUk1JTkFMX1NUQVRVU0VTID0gbmV3IFNldDxJbnZvaWNlU3RhdHVzPihbXCJwYWlkXCIsIFwiY2FuY2VsbGVkXCIsIFwicmVmdW5kZWRcIl0pO1xyXG5cclxuY29uc3QgQUxMT1dFRF9TVEFUVVNfVFJBTlNJVElPTlM6IFJlY29yZDxJbnZvaWNlU3RhdHVzLCBJbnZvaWNlU3RhdHVzW10+ID0ge1xyXG4gIGRyYWZ0OiBbXCJpc3N1ZWRcIiwgXCJjYW5jZWxsZWRcIl0sXHJcbiAgaXNzdWVkOiBbXCJwYXJ0aWFsbHlfcGFpZFwiLCBcInBhaWRcIiwgXCJjYW5jZWxsZWRcIl0sXHJcbiAgcGFydGlhbGx5X3BhaWQ6IFtcInBhaWRcIiwgXCJjYW5jZWxsZWRcIiwgXCJyZWZ1bmRlZFwiXSxcclxuICBwYWlkOiBbXCJyZWZ1bmRlZFwiXSxcclxuICBjYW5jZWxsZWQ6IFtdLFxyXG4gIHJlZnVuZGVkOiBbXSxcclxufTtcclxuXHJcbi8qKiBSYXcgbGluZSDQuNC3IEhUVFAgKNC60L3QvtC/0LrQsCDCq9Ch0YfRkdGCwrsg0LzQvtC20LXRgiDQv9GA0LjRgdC70LDRgtGMIHByaWNlL3VuaXRQcmljZSDRgdGC0YDQvtC60L7QuSDRgSDQv9GA0L7QsdC10LvQsNC80LgpLiAqL1xyXG50eXBlIFJhd0ludm9pY2VMaW5lSW5wdXQgPSB7XHJcbiAgc2VydmljZUlkPzogdW5rbm93bjtcclxuICBxdWFudGl0eT86IHVua25vd247XHJcbiAgZGVzY3JpcHRpb24/OiB1bmtub3duO1xyXG4gIHVuaXRQcmljZT86IHVua25vd247XHJcbiAgcHJpY2U/OiB1bmtub3duO1xyXG59O1xyXG5cclxudHlwZSBDcmVhdGVJbnZvaWNlUGF5bG9hZCA9IHtcclxuICBudW1iZXI/OiBzdHJpbmc7XHJcbiAgcGF0aWVudElkOiBudW1iZXI7XHJcbiAgYXBwb2ludG1lbnRJZD86IG51bWJlciB8IG51bGw7XHJcbiAgc3RhdHVzPzogSW52b2ljZVN0YXR1cztcclxuICBkaXNjb3VudD86IG51bWJlcjtcclxuICAvKiogSWdub3JlZCDigJQgdXNlIHBheW1lbnRzIEFQSSBvbmx5ICovXHJcbiAgcGFpZEFtb3VudD86IG51bWJlcjtcclxuICBpdGVtczogUmF3SW52b2ljZUxpbmVJbnB1dFtdO1xyXG59O1xyXG5cclxudHlwZSBVcGRhdGVJbnZvaWNlUGF5bG9hZCA9IHtcclxuICBudW1iZXI/OiBzdHJpbmc7XHJcbiAgcGF0aWVudElkPzogbnVtYmVyO1xyXG4gIGFwcG9pbnRtZW50SWQ/OiBudW1iZXIgfCBudWxsO1xyXG4gIHN0YXR1cz86IEludm9pY2VTdGF0dXM7XHJcbiAgZGlzY291bnQ/OiBudW1iZXI7XHJcbiAgLyoqIE5vdCBhY2NlcHRlZCDigJQgcGFpZCBhbW91bnQgaXMgbWFuYWdlZCB2aWEgcGF5bWVudHMgKi9cclxuICBwYWlkQW1vdW50PzogbnVtYmVyO1xyXG4gIGl0ZW1zPzogUmF3SW52b2ljZUxpbmVJbnB1dFtdO1xyXG59O1xyXG5cclxuY29uc3Qgcm91bmRNb25leSA9ICh2YWx1ZTogdW5rbm93bik6IG51bWJlciA9PiB7XHJcbiAgY29uc3QgbiA9IHBhcnNlTnVtZXJpY0lucHV0KHZhbHVlKTtcclxuICBpZiAobiA9PT0gbnVsbCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCLQndC10LrQvtGA0YDQtdC60YLQvdCw0Y8g0LTQtdC90LXQttC90LDRjyDRgdGD0LzQvNCwXCIpO1xyXG4gIH1cclxuICByZXR1cm4gcm91bmRNb25leTIobik7XHJcbn07XHJcblxyXG5jb25zdCBub3JtYWxpemVJbnZvaWNlTnVtYmVyID0gKHZhbHVlOiB1bmtub3duKTogc3RyaW5nID0+IHtcclxuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiIHx8IHZhbHVlLnRyaW0oKSA9PT0gXCJcIikge1xyXG4gICAgcmV0dXJuIGBJTlYtJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpfWA7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gdmFsdWUudHJpbSgpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqINCa0L7Qu9C40YfQtdGB0YLQstC+IOKAlCDQvdC1INC00LXQvdC10LbQvdCw0Y8g0YHRg9C80LzQsDog0L3QtdC70YzQt9GPINC+0LrRgNGD0LPQu9GP0YLRjCDQtNC+IDIg0LfQvdCw0LrQvtCyICjQuNC90LDRh9C1IDAuODQ3IOKGkiAwLjg1INC4INC/0LDQtNCw0Y7RgiDQv9GA0L7QstC10YDQutC4IC8gNDAwKS5cclxuICovXHJcbmNvbnN0IHBhcnNlTGluZVF1YW50aXR5ID0gKHZhbHVlOiB1bmtub3duLCBpbmRleDogbnVtYmVyKTogbnVtYmVyID0+IHtcclxuICBjb25zdCBuID0gcGFyc2VOdW1lcmljSW5wdXQodmFsdWUpO1xyXG4gIGlmIChuID09PSBudWxsIHx8IG4gPD0gMCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgYEl0ZW0gYXQgaW5kZXggJHtpbmRleH06ICdxdWFudGl0eScgbXVzdCBiZSBncmVhdGVyIHRoYW4gMGApO1xyXG4gIH1cclxuICByZXR1cm4gbjtcclxufTtcclxuXHJcbmNvbnN0IHBhcnNlU2VydmljZUlkID0gKHZhbHVlOiB1bmtub3duLCBpbmRleDogbnVtYmVyKTogbnVtYmVyID0+IHtcclxuICBjb25zdCBuID0gcGFyc2VOdW1lcmljSW5wdXQodmFsdWUpO1xyXG4gIGNvbnN0IHBhcnNlZCA9IG4gIT0gbnVsbCA/IE1hdGgudHJ1bmMobikgOiBOYU47XHJcbiAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhcnNlZCkgfHwgcGFyc2VkIDw9IDApIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIGBJdGVtIGF0IGluZGV4ICR7aW5kZXh9OiAnc2VydmljZUlkJyBtdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlcmApO1xyXG4gIH1cclxuICByZXR1cm4gcGFyc2VkO1xyXG59O1xyXG5cclxuY29uc3QgcmVzb2x2ZUxpbmVJdGVtc0Zyb21TZXJ2aWNlcyA9IGFzeW5jIChcclxuICBzZXJ2aWNlc1JlcG9zaXRvcnk6IElTZXJ2aWNlc1JlcG9zaXRvcnksXHJcbiAgcmF3SXRlbXM6IFJhd0ludm9pY2VMaW5lSW5wdXRbXVxyXG4pOiBQcm9taXNlPEludm9pY2VJdGVtSW5wdXRbXT4gPT4ge1xyXG4gIGNvbnN0IHJlc3VsdDogSW52b2ljZUl0ZW1JbnB1dFtdID0gW107XHJcblxyXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCByYXdJdGVtcy5sZW5ndGg7IGluZGV4KyspIHtcclxuICAgIGNvbnN0IGxpbmUgPSByYXdJdGVtc1tpbmRleF07XHJcbiAgICBjb25zdCBzZXJ2aWNlSWQgPSBwYXJzZVNlcnZpY2VJZChsaW5lLnNlcnZpY2VJZCwgaW5kZXgpO1xyXG4gICAgY29uc3QgcXVhbnRpdHkgPSBwYXJzZUxpbmVRdWFudGl0eShsaW5lLnF1YW50aXR5LCBpbmRleCk7XHJcblxyXG4gICAgY29uc3Qgc2VydmljZSA9IGF3YWl0IHNlcnZpY2VzUmVwb3NpdG9yeS5maW5kQnlJZChzZXJ2aWNlSWQpO1xyXG4gICAgaWYgKCFzZXJ2aWNlKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDQsIGBTZXJ2aWNlICR7c2VydmljZUlkfSBub3QgZm91bmRgKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByYXdQcmljZTogdW5rbm93biA9XHJcbiAgICAgIGxpbmUucHJpY2UgIT09IHVuZGVmaW5lZCAmJiBsaW5lLnByaWNlICE9PSBudWxsXHJcbiAgICAgICAgPyBsaW5lLnByaWNlXHJcbiAgICAgICAgOiBsaW5lLnVuaXRQcmljZSAhPT0gdW5kZWZpbmVkICYmIGxpbmUudW5pdFByaWNlICE9PSBudWxsXHJcbiAgICAgICAgICA/IGxpbmUudW5pdFByaWNlXHJcbiAgICAgICAgICA6IHNlcnZpY2UucHJpY2U7XHJcblxyXG4gICAgY29uc3QgdW5pdFByaWNlID0gcm91bmRNb25leTIocGFyc2VSZXF1aXJlZE1vbmV5KHJhd1ByaWNlLCBcInByaWNlXCIpKTtcclxuXHJcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh1bml0UHJpY2UpKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIGBJdGVtIGF0IGluZGV4ICR7aW5kZXh9OiBpbnZhbGlkIHVuaXQgcHJpY2UgYmVmb3JlIGluc2VydGApO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh1bml0UHJpY2UgPD0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBgU2VydmljZSAke3NlcnZpY2VJZH0gaGFzIGludmFsaWQgcHJpY2VgKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkZXNjcmlwdGlvbiA9XHJcbiAgICAgIHR5cGVvZiBsaW5lLmRlc2NyaXB0aW9uID09PSBcInN0cmluZ1wiICYmIGxpbmUuZGVzY3JpcHRpb24udHJpbSgpICE9PSBcIlwiXHJcbiAgICAgICAgPyBsaW5lLmRlc2NyaXB0aW9uLnRyaW0oKVxyXG4gICAgICAgIDogc2VydmljZS5uYW1lO1xyXG5cclxuICAgIGNvbnN0IGxpbmVUb3RhbCA9IHJvdW5kTW9uZXkocXVhbnRpdHkgKiB1bml0UHJpY2UpO1xyXG5cclxuICAgIHJlc3VsdC5wdXNoKHtcclxuICAgICAgc2VydmljZUlkLFxyXG4gICAgICBkZXNjcmlwdGlvbixcclxuICAgICAgcXVhbnRpdHksXHJcbiAgICAgIHVuaXRQcmljZSxcclxuICAgICAgbGluZVRvdGFsLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gIGNvbnNvbGUubG9nKFwiRklOQUwgSU5WT0lDRSBJVEVNUzpcIiwgcmVzdWx0KTtcclxuXHJcbiAgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbmNvbnN0IGNvbXB1dGVUb3RhbHMgPSAoXHJcbiAgaXRlbXM6IEludm9pY2VJdGVtSW5wdXRbXSxcclxuICBkaXNjb3VudElucHV0OiBudW1iZXIgfCB1bmRlZmluZWRcclxuKTogeyBzdWJ0b3RhbDogbnVtYmVyOyBkaXNjb3VudDogbnVtYmVyOyB0b3RhbDogbnVtYmVyIH0gPT4ge1xyXG4gIGNvbnN0IHN1YnRvdGFsID0gcm91bmRNb25leShcclxuICAgIGl0ZW1zLnJlZHVjZSgoYWNjLCBpdGVtKSA9PiBhY2MgKyByb3VuZE1vbmV5KGl0ZW0ubGluZVRvdGFsKSwgMClcclxuICApO1xyXG4gIGNvbnN0IGRpc2NvdW50ID0gcm91bmRNb25leShkaXNjb3VudElucHV0ID8/IDApO1xyXG4gIGNvbnN0IHRvdGFsID0gcm91bmRNb25leShzdWJ0b3RhbCAtIGRpc2NvdW50KTtcclxuXHJcbiAgaWYgKGRpc2NvdW50IDwgMCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJGaWVsZCAnZGlzY291bnQnIG11c3QgYmUgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIDBcIik7XHJcbiAgfVxyXG5cclxuICBpZiAoZGlzY291bnQgPiBzdWJ0b3RhbCArIDFlLTYpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwi0KHQutC40LTQutCwINC90LUg0LzQvtC20LXRgiDQv9GA0LXQstGL0YjQsNGC0Ywg0YHRg9C80LzRgyDQv9C+0LfQuNGG0LjQuSAoc3VidG90YWwpXCIpO1xyXG4gIH1cclxuXHJcbiAgaWYgKHRvdGFsIDwgMCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJJbnZvaWNlIHRvdGFsIGNhbm5vdCBiZSBuZWdhdGl2ZVwiKTtcclxuICB9XHJcblxyXG4gIHJldHVybiB7IHN1YnRvdGFsLCBkaXNjb3VudCwgdG90YWwgfTtcclxufTtcclxuXHJcbmNvbnN0IGVuc3VyZVBhdGllbnRFeGlzdHMgPSBhc3luYyAoXHJcbiAgaW52b2ljZXNSZXBvc2l0b3J5OiBJSW52b2ljZXNSZXBvc2l0b3J5LFxyXG4gIHBhdGllbnRJZDogbnVtYmVyXHJcbik6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gIGNvbnN0IGV4aXN0cyA9IGF3YWl0IGludm9pY2VzUmVwb3NpdG9yeS5wYXRpZW50RXhpc3RzKHBhdGllbnRJZCk7XHJcbiAgaWYgKCFleGlzdHMpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDQsIFwiUGF0aWVudCBub3QgZm91bmRcIik7XHJcbiAgfVxyXG59O1xyXG5cclxuY29uc3QgZW5zdXJlQXBwb2ludG1lbnRGb3JJbnZvaWNlID0gYXN5bmMgKFxyXG4gIGludm9pY2VzUmVwb3NpdG9yeTogSUludm9pY2VzUmVwb3NpdG9yeSxcclxuICBhcHBvaW50bWVudElkOiBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkLFxyXG4gIHBhdGllbnRJZDogbnVtYmVyXHJcbik6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gIGlmIChhcHBvaW50bWVudElkID09PSB1bmRlZmluZWQgfHwgYXBwb2ludG1lbnRJZCA9PT0gbnVsbCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJGaWVsZCAnYXBwb2ludG1lbnRJZCcgaXMgcmVxdWlyZWRcIik7XHJcbiAgfVxyXG5cclxuICBjb25zdCBhcHBvaW50bWVudEZvdW5kID0gYXdhaXQgaW52b2ljZXNSZXBvc2l0b3J5LmFwcG9pbnRtZW50RXhpc3RzKGFwcG9pbnRtZW50SWQpO1xyXG4gIGlmICghYXBwb2ludG1lbnRGb3VuZCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwNCwgXCJBcHBvaW50bWVudCBub3QgZm91bmRcIik7XHJcbiAgfVxyXG5cclxuICBjb25zdCBhcHBvaW50bWVudFBhdGllbnRJZCA9IGF3YWl0IGludm9pY2VzUmVwb3NpdG9yeS5nZXRBcHBvaW50bWVudFBhdGllbnRJZChhcHBvaW50bWVudElkKTtcclxuICBpZiAoYXBwb2ludG1lbnRQYXRpZW50SWQgPT09IG51bGwpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDQsIFwiQXBwb2ludG1lbnQgbm90IGZvdW5kXCIpO1xyXG4gIH1cclxuXHJcbiAgaWYgKGFwcG9pbnRtZW50UGF0aWVudElkICE9PSBwYXRpZW50SWQpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiSW52b2ljZSBwYXRpZW50IG11c3QgbWF0Y2ggYXBwb2ludG1lbnQgcGF0aWVudFwiKTtcclxuICB9XHJcbn07XHJcblxyXG5jb25zdCBlbnN1cmVTdGF0dXNUcmFuc2l0aW9uQWxsb3dlZCA9IChcclxuICBjdXJyZW50U3RhdHVzOiBJbnZvaWNlU3RhdHVzLFxyXG4gIG5leHRTdGF0dXM6IEludm9pY2VTdGF0dXNcclxuKTogdm9pZCA9PiB7XHJcbiAgaWYgKGN1cnJlbnRTdGF0dXMgPT09IG5leHRTdGF0dXMpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGNvbnN0IGFsbG93ZWQgPSBBTExPV0VEX1NUQVRVU19UUkFOU0lUSU9OU1tjdXJyZW50U3RhdHVzXTtcclxuICBpZiAoIWFsbG93ZWQuaW5jbHVkZXMobmV4dFN0YXR1cykpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcihcclxuICAgICAgNDAwLFxyXG4gICAgICBgSW52YWxpZCBpbnZvaWNlIHN0YXR1cyB0cmFuc2l0aW9uOiAnJHtjdXJyZW50U3RhdHVzfScgLT4gJyR7bmV4dFN0YXR1c30nYFxyXG4gICAgKTtcclxuICB9XHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgSW52b2ljZXNTZXJ2aWNlIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW52b2ljZXNSZXBvc2l0b3J5OiBJSW52b2ljZXNSZXBvc2l0b3J5LFxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZXJ2aWNlc1JlcG9zaXRvcnk6IElTZXJ2aWNlc1JlcG9zaXRvcnlcclxuICApIHt9XHJcblxyXG4gIGFzeW5jIGxpc3QoXHJcbiAgICBfYXV0aDogQXV0aFRva2VuUGF5bG9hZCxcclxuICAgIGZpbHRlcnM6IEludm9pY2VGaWx0ZXJzID0ge31cclxuICApOiBQcm9taXNlPEludm9pY2VTdW1tYXJ5W10+IHtcclxuICAgIHJldHVybiB0aGlzLmludm9pY2VzUmVwb3NpdG9yeS5maW5kQWxsKGZpbHRlcnMpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZ2V0QnlJZChfYXV0aDogQXV0aFRva2VuUGF5bG9hZCwgaWQ6IG51bWJlcik6IFByb21pc2U8SW52b2ljZSB8IG51bGw+IHtcclxuICAgIHJldHVybiB0aGlzLmludm9pY2VzUmVwb3NpdG9yeS5maW5kQnlJZChpZCk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBjcmVhdGUoX2F1dGg6IEF1dGhUb2tlblBheWxvYWQsIHBheWxvYWQ6IENyZWF0ZUludm9pY2VQYXlsb2FkKTogUHJvbWlzZTxJbnZvaWNlPiB7XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocGF5bG9hZC5pdGVtcykgfHwgcGF5bG9hZC5pdGVtcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJGaWVsZCAnaXRlbXMnIG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgbGluZSB3aXRoIGEgc2VydmljZVwiKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAocGF5bG9hZC5wYWlkQW1vdW50ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJGaWVsZCAncGFpZEFtb3VudCcgY2Fubm90IGJlIHNldCB3aGVuIGNyZWF0aW5nIGFuIGludm9pY2Ug4oCUIHVzZSBwYXltZW50c1wiKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzdGF0dXMgPSBwYXlsb2FkLnN0YXR1cyA/PyBcImRyYWZ0XCI7XHJcbiAgICBpZiAoIUlOVk9JQ0VfU1RBVFVTRVMuaW5jbHVkZXMoc3RhdHVzKSkge1xyXG4gICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkludmFsaWQgaW52b2ljZSBzdGF0dXNcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZGlzY291bnQgPSByb3VuZE1vbmV5KHBheWxvYWQuZGlzY291bnQgPz8gMCk7XHJcbiAgICBjb25zdCBudW1iZXIgPSBub3JtYWxpemVJbnZvaWNlTnVtYmVyKHBheWxvYWQubnVtYmVyKTtcclxuICAgIGNvbnN0IHBhdGllbnRJZFJhdyA9IHBhcnNlTnVtZXJpY0lucHV0KHBheWxvYWQucGF0aWVudElkKTtcclxuICAgIGNvbnN0IHBhdGllbnRJZCA9IHBhdGllbnRJZFJhdyAhPSBudWxsID8gTWF0aC50cnVuYyhwYXRpZW50SWRSYXcpIDogTmFOO1xyXG4gICAgY29uc3QgYXBwb2ludG1lbnRJZFJhdyA9IHBheWxvYWQuYXBwb2ludG1lbnRJZCA/PyBudWxsO1xyXG4gICAgY29uc3QgYXBwb2ludG1lbnRJZCA9XHJcbiAgICAgIGFwcG9pbnRtZW50SWRSYXcgPT09IG51bGwgfHwgYXBwb2ludG1lbnRJZFJhdyA9PT0gdW5kZWZpbmVkXHJcbiAgICAgICAgPyBudWxsXHJcbiAgICAgICAgOiAoKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBuID0gcGFyc2VOdW1lcmljSW5wdXQoYXBwb2ludG1lbnRJZFJhdyk7XHJcbiAgICAgICAgICAgIHJldHVybiBuICE9IG51bGwgPyBNYXRoLnRydW5jKG4pIDogTmFOO1xyXG4gICAgICAgICAgfSkoKTtcclxuICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcihwYXRpZW50SWQpIHx8IHBhdGllbnRJZCA8PSAwKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiRmllbGQgJ3BhdGllbnRJZCcgbXVzdCBiZSBhIHBvc2l0aXZlIGludGVnZXJcIik7XHJcbiAgICB9XHJcbiAgICBpZiAoYXBwb2ludG1lbnRJZCA9PT0gbnVsbCB8fCAhTnVtYmVyLmlzSW50ZWdlcihhcHBvaW50bWVudElkKSB8fCBhcHBvaW50bWVudElkIDw9IDApIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJGaWVsZCAnYXBwb2ludG1lbnRJZCcgaXMgcmVxdWlyZWQgYW5kIG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IGVuc3VyZVBhdGllbnRFeGlzdHModGhpcy5pbnZvaWNlc1JlcG9zaXRvcnksIHBhdGllbnRJZCk7XHJcbiAgICBhd2FpdCBlbnN1cmVBcHBvaW50bWVudEZvckludm9pY2UodGhpcy5pbnZvaWNlc1JlcG9zaXRvcnksIGFwcG9pbnRtZW50SWQsIHBhdGllbnRJZCk7XHJcblxyXG4gICAgY29uc3QgcmVzb2x2ZWRJdGVtcyA9IGF3YWl0IHJlc29sdmVMaW5lSXRlbXNGcm9tU2VydmljZXModGhpcy5zZXJ2aWNlc1JlcG9zaXRvcnksIHBheWxvYWQuaXRlbXMpO1xyXG4gICAgY29uc3QgdG90YWxzID0gY29tcHV0ZVRvdGFscyhyZXNvbHZlZEl0ZW1zLCBkaXNjb3VudCk7XHJcblxyXG4gICAgY29uc3QgaW52b2ljZUlucHV0OiBJbnZvaWNlQ3JlYXRlSW5wdXQgPSB7XHJcbiAgICAgIG51bWJlcixcclxuICAgICAgcGF0aWVudElkLFxyXG4gICAgICBhcHBvaW50bWVudElkLFxyXG4gICAgICBzdGF0dXMsXHJcbiAgICAgIHN1YnRvdGFsOiB0b3RhbHMuc3VidG90YWwsXHJcbiAgICAgIGRpc2NvdW50OiB0b3RhbHMuZGlzY291bnQsXHJcbiAgICAgIHRvdGFsOiB0b3RhbHMudG90YWwsXHJcbiAgICAgIHBhaWRBbW91bnQ6IDAsXHJcbiAgICB9O1xyXG5cclxuICAgIGlmIChlbnYuZGVidWdJbnZvaWNlQ3JlYXRlKSB7XHJcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICAgIGNvbnNvbGUubG9nKFxyXG4gICAgICAgIFwiW0ludm9pY2VzU2VydmljZS5jcmVhdGVdIG5vcm1hbGl6ZWQgaW52b2ljZUlucHV0ICsgcmVzb2x2ZWRJdGVtc1wiLFxyXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHsgaW52b2ljZUlucHV0LCByZXNvbHZlZEl0ZW1zIH0pXHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgIGNvbnNvbGUubG9nKFxyXG4gICAgICBcIklOVk9JQ0UgSU5TRVJUIERBVEE6XCIsXHJcbiAgICAgIEpTT04uc3RyaW5naWZ5KHsgaXRlbXM6IHJlc29sdmVkSXRlbXMgfSwgbnVsbCwgMilcclxuICAgICk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY3JlYXRlZCA9IGF3YWl0IHRoaXMuaW52b2ljZXNSZXBvc2l0b3J5LmNyZWF0ZShpbnZvaWNlSW5wdXQsIHJlc29sdmVkSXRlbXMpO1xyXG4gICAgICBjb25zdCBmdWxsSW52b2ljZSA9IGF3YWl0IHRoaXMuaW52b2ljZXNSZXBvc2l0b3J5LmZpbmRCeUlkKGNyZWF0ZWQuaWQpO1xyXG4gICAgICBpZiAoIWZ1bGxJbnZvaWNlKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDUwMCwgXCJGYWlsZWQgdG8gbG9hZCBjcmVhdGVkIGludm9pY2VcIik7XHJcbiAgICAgIH1cclxuICAgICAgaW52YWxpZGF0ZUNsaW5pY0ZhY3RzQ2FjaGUoKTtcclxuICAgICAgcmV0dXJuIGZ1bGxJbnZvaWNlO1xyXG4gICAgfSBjYXRjaCAoZXJyOiB1bmtub3duKSB7XHJcbiAgICAgIGNvbnN0IHBnID0gZXJyIGFzIHsgY29kZT86IHN0cmluZzsgY29uc3RyYWludD86IHN0cmluZzsgZGV0YWlsPzogc3RyaW5nIH07XHJcbiAgICAgIGlmIChwZy5jb2RlID09PSBcIjIzNTA1XCIpIHtcclxuICAgICAgICBjb25zdCBkID0gKHBnLmRldGFpbCA/PyBcIlwiKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGlmIChwZy5jb25zdHJhaW50ID09PSBcInVxX2ludm9pY2VzX2FjdGl2ZV9hcHBvaW50bWVudFwiIHx8IGQuaW5jbHVkZXMoXCJhcHBvaW50bWVudF9pZFwiKSkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKFxyXG4gICAgICAgICAgICA0MDksXHJcbiAgICAgICAgICAgIFwiQW4gb3BlbiBpbnZvaWNlIGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGFwcG9pbnRtZW50IChjYW5jZWwgaXQgb3IgY29tcGxldGUgcGF5bWVudCBmaXJzdClcIlxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwOSwgXCJJbnZvaWNlIG51bWJlciBhbHJlYWR5IGV4aXN0c1wiKTtcclxuICAgICAgfVxyXG4gICAgICB0aHJvdyBlcnI7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyB1cGRhdGUoXHJcbiAgICBhdXRoOiBBdXRoVG9rZW5QYXlsb2FkLFxyXG4gICAgaWQ6IG51bWJlcixcclxuICAgIHBheWxvYWQ6IFVwZGF0ZUludm9pY2VQYXlsb2FkXHJcbiAgKTogUHJvbWlzZTxJbnZvaWNlIHwgbnVsbD4ge1xyXG4gICAgaWYgKHBheWxvYWQucGFpZEFtb3VudCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiRmllbGQgJ3BhaWRBbW91bnQnIGNhbm5vdCBiZSB1cGRhdGVkIHZpYSBpbnZvaWNlcyBBUEkg4oCUIHVzZSBwYXltZW50c1wiKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoYXV0aC5yb2xlID09PSBcImNhc2hpZXJcIikge1xyXG4gICAgICBjb25zdCByZXN0cmljdGVkID1cclxuICAgICAgICBwYXlsb2FkLm51bWJlciAhPT0gdW5kZWZpbmVkIHx8XHJcbiAgICAgICAgcGF5bG9hZC5wYXRpZW50SWQgIT09IHVuZGVmaW5lZCB8fFxyXG4gICAgICAgIHBheWxvYWQuYXBwb2ludG1lbnRJZCAhPT0gdW5kZWZpbmVkIHx8XHJcbiAgICAgICAgcGF5bG9hZC5kaXNjb3VudCAhPT0gdW5kZWZpbmVkIHx8XHJcbiAgICAgICAgcGF5bG9hZC5pdGVtcyAhPT0gdW5kZWZpbmVkO1xyXG4gICAgICBpZiAocmVzdHJpY3RlZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBBcGlFcnJvcihcclxuICAgICAgICAgIDQwMyxcclxuICAgICAgICAgIFwi0JrQsNGB0YHQuNGAINC80L7QttC10YIg0LzQtdC90Y/RgtGMINGC0L7Qu9GM0LrQviDRgdGC0LDRgtGD0YEg0YHRh9GR0YLQsDsg0L/QvtC30LjRhtC40Lgg0Lgg0YDQtdC60LLQuNC30LjRgtGLINC90LXQtNC+0YHRgtGD0L/QvdGLXCJcclxuICAgICAgICApO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChwYXlsb2FkLnN0YXR1cyA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCLQlNC70Y8g0LrQsNGB0YHQuNGA0LAg0YPQutCw0LbQuNGC0LUg0L/QvtC70LUgc3RhdHVzXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgY3VycmVudCA9IGF3YWl0IHRoaXMuaW52b2ljZXNSZXBvc2l0b3J5LmZpbmRCeUlkKGlkKTtcclxuICAgIGlmICghY3VycmVudCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBoYXNBbnlVcGRhdGVGaWVsZCA9XHJcbiAgICAgIHBheWxvYWQubnVtYmVyICE9PSB1bmRlZmluZWQgfHxcclxuICAgICAgcGF5bG9hZC5wYXRpZW50SWQgIT09IHVuZGVmaW5lZCB8fFxyXG4gICAgICBwYXlsb2FkLmFwcG9pbnRtZW50SWQgIT09IHVuZGVmaW5lZCB8fFxyXG4gICAgICBwYXlsb2FkLnN0YXR1cyAhPT0gdW5kZWZpbmVkIHx8XHJcbiAgICAgIHBheWxvYWQuZGlzY291bnQgIT09IHVuZGVmaW5lZCB8fFxyXG4gICAgICBwYXlsb2FkLml0ZW1zICE9PSB1bmRlZmluZWQ7XHJcblxyXG4gICAgaWYgKCFoYXNBbnlVcGRhdGVGaWVsZCkge1xyXG4gICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkF0IGxlYXN0IG9uZSBmaWVsZCBtdXN0IGJlIHByb3ZpZGVkIGZvciB1cGRhdGVcIik7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHBheWxvYWQuaXRlbXMgIT09IHVuZGVmaW5lZCAmJiBURVJNSU5BTF9TVEFUVVNFUy5oYXMoY3VycmVudC5zdGF0dXMpKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcihcclxuICAgICAgICA0MDAsXHJcbiAgICAgICAgXCJDYW5ub3QgbW9kaWZ5IGludm9pY2UgaXRlbXMgYWZ0ZXIgcGFpZCwgcmVmdW5kZWQsIG9yIGNhbmNlbGxlZCBzdGF0dXNcIlxyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG5leHRTdGF0dXMgPSBwYXlsb2FkLnN0YXR1cyA/PyBjdXJyZW50LnN0YXR1cztcclxuICAgIGVuc3VyZVN0YXR1c1RyYW5zaXRpb25BbGxvd2VkKGN1cnJlbnQuc3RhdHVzLCBuZXh0U3RhdHVzKTtcclxuXHJcbiAgICBjb25zdCBuZXh0UGF0aWVudElkID0gcGF5bG9hZC5wYXRpZW50SWQgPz8gY3VycmVudC5wYXRpZW50SWQ7XHJcbiAgICBjb25zdCBuZXh0QXBwb2ludG1lbnRJZCA9XHJcbiAgICAgIHBheWxvYWQuYXBwb2ludG1lbnRJZCAhPT0gdW5kZWZpbmVkID8gcGF5bG9hZC5hcHBvaW50bWVudElkIDogY3VycmVudC5hcHBvaW50bWVudElkO1xyXG5cclxuICAgIGlmIChwYXlsb2FkLmFwcG9pbnRtZW50SWQgIT09IHVuZGVmaW5lZCB8fCBwYXlsb2FkLnBhdGllbnRJZCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIGF3YWl0IGVuc3VyZVBhdGllbnRFeGlzdHModGhpcy5pbnZvaWNlc1JlcG9zaXRvcnksIG5leHRQYXRpZW50SWQpO1xyXG4gICAgICBhd2FpdCBlbnN1cmVBcHBvaW50bWVudEZvckludm9pY2UoXHJcbiAgICAgICAgdGhpcy5pbnZvaWNlc1JlcG9zaXRvcnksXHJcbiAgICAgICAgbmV4dEFwcG9pbnRtZW50SWQsXHJcbiAgICAgICAgbmV4dFBhdGllbnRJZFxyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBlZmZlY3RpdmVJdGVtczogSW52b2ljZUl0ZW1JbnB1dFtdO1xyXG4gICAgbGV0IHJlcGxhY2VMaW5lSXRlbXM6IEludm9pY2VJdGVtSW5wdXRbXSB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICBpZiAocGF5bG9hZC5pdGVtcyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIGVmZmVjdGl2ZUl0ZW1zID0gYXdhaXQgcmVzb2x2ZUxpbmVJdGVtc0Zyb21TZXJ2aWNlcyh0aGlzLnNlcnZpY2VzUmVwb3NpdG9yeSwgcGF5bG9hZC5pdGVtcyk7XHJcbiAgICAgIHJlcGxhY2VMaW5lSXRlbXMgPSBlZmZlY3RpdmVJdGVtcztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGVmZmVjdGl2ZUl0ZW1zID0gY3VycmVudC5pdGVtcy5tYXAoKGl0ZW0pID0+ICh7XHJcbiAgICAgICAgc2VydmljZUlkOiBpdGVtLnNlcnZpY2VJZCxcclxuICAgICAgICBkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbixcclxuICAgICAgICBxdWFudGl0eTogaXRlbS5xdWFudGl0eSxcclxuICAgICAgICB1bml0UHJpY2U6IGl0ZW0udW5pdFByaWNlLFxyXG4gICAgICAgIGxpbmVUb3RhbDogaXRlbS5saW5lVG90YWwsXHJcbiAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZWZmZWN0aXZlSXRlbXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiSW52b2ljZSBtdXN0IGNvbnRhaW4gYXQgbGVhc3Qgb25lIGl0ZW1cIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbmV4dERpc2NvdW50ID0gcGF5bG9hZC5kaXNjb3VudCA/PyBjdXJyZW50LmRpc2NvdW50O1xyXG4gICAgY29uc3QgdG90YWxzID0gY29tcHV0ZVRvdGFscyhlZmZlY3RpdmVJdGVtcywgbmV4dERpc2NvdW50KTtcclxuXHJcbiAgICBjb25zdCBuZXh0UGFpZEFtb3VudCA9IHJvdW5kTW9uZXkoY3VycmVudC5wYWlkQW1vdW50KTtcclxuICAgIGlmIChuZXh0UGFpZEFtb3VudCA+IHRvdGFscy50b3RhbCkge1xyXG4gICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoXHJcbiAgICAgICAgNDAwLFxyXG4gICAgICAgIFwiQ3VycmVudCBwYXltZW50cyBleGNlZWQgcmVjb21wdXRlZCBpbnZvaWNlIHRvdGFsIOKAlCB2b2lkIHBheW1lbnRzIG9yIGFkanVzdCBsaW5lIGl0ZW1zXCJcclxuICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB1cGRhdGVQYXlsb2FkOiBJbnZvaWNlVXBkYXRlSW5wdXQgPSB7XHJcbiAgICAgIG51bWJlcjpcclxuICAgICAgICBwYXlsb2FkLm51bWJlciAhPT0gdW5kZWZpbmVkXHJcbiAgICAgICAgICA/IG5vcm1hbGl6ZUludm9pY2VOdW1iZXIocGF5bG9hZC5udW1iZXIpXHJcbiAgICAgICAgICA6IHVuZGVmaW5lZCxcclxuICAgICAgcGF0aWVudElkOiBwYXlsb2FkLnBhdGllbnRJZCAhPT0gdW5kZWZpbmVkID8gbmV4dFBhdGllbnRJZCA6IHVuZGVmaW5lZCxcclxuICAgICAgYXBwb2ludG1lbnRJZDogcGF5bG9hZC5hcHBvaW50bWVudElkICE9PSB1bmRlZmluZWQgPyBuZXh0QXBwb2ludG1lbnRJZCA/PyBudWxsIDogdW5kZWZpbmVkLFxyXG4gICAgICBzdGF0dXM6IG5leHRTdGF0dXMsXHJcbiAgICAgIHN1YnRvdGFsOiB0b3RhbHMuc3VidG90YWwsXHJcbiAgICAgIGRpc2NvdW50OiB0b3RhbHMuZGlzY291bnQsXHJcbiAgICAgIHRvdGFsOiB0b3RhbHMudG90YWwsXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBhd2FpdCB0aGlzLmludm9pY2VzUmVwb3NpdG9yeS51cGRhdGUoaWQsIHVwZGF0ZVBheWxvYWQsIHJlcGxhY2VMaW5lSXRlbXMpO1xyXG4gICAgICBpZiAoIXVwZGF0ZWQpIHtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZnVsbEludm9pY2UgPSBhd2FpdCB0aGlzLmludm9pY2VzUmVwb3NpdG9yeS5maW5kQnlJZChpZCk7XHJcbiAgICAgIGlmICghZnVsbEludm9pY2UpIHtcclxuICAgICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNTAwLCBcIkZhaWxlZCB0byBsb2FkIHVwZGF0ZWQgaW52b2ljZVwiKTtcclxuICAgICAgfVxyXG4gICAgICBpbnZhbGlkYXRlQ2xpbmljRmFjdHNDYWNoZSgpO1xyXG4gICAgICByZXR1cm4gZnVsbEludm9pY2U7XHJcbiAgICB9IGNhdGNoIChlcnI6IHVua25vd24pIHtcclxuICAgICAgY29uc3QgcGcgPSBlcnIgYXMgeyBjb2RlPzogc3RyaW5nOyBjb25zdHJhaW50Pzogc3RyaW5nOyBkZXRhaWw/OiBzdHJpbmcgfTtcclxuICAgICAgaWYgKHBnLmNvZGUgPT09IFwiMjM1MDVcIikge1xyXG4gICAgICAgIGNvbnN0IGQgPSAocGcuZGV0YWlsID8/IFwiXCIpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgaWYgKHBnLmNvbnN0cmFpbnQgPT09IFwidXFfaW52b2ljZXNfYWN0aXZlX2FwcG9pbnRtZW50XCIgfHwgZC5pbmNsdWRlcyhcImFwcG9pbnRtZW50X2lkXCIpKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoXHJcbiAgICAgICAgICAgIDQwOSxcclxuICAgICAgICAgICAgXCJBbiBvcGVuIGludm9pY2UgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgYXBwb2ludG1lbnQgKGNhbmNlbCBpdCBvciBjb21wbGV0ZSBwYXltZW50IGZpcnN0KVwiXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDA5LCBcIkludm9pY2UgbnVtYmVyIGFscmVhZHkgZXhpc3RzXCIpO1xyXG4gICAgICB9XHJcbiAgICAgIHRocm93IGVycjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIGRlbGV0ZShfYXV0aDogQXV0aFRva2VuUGF5bG9hZCwgaWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgY29uc3Qgb2sgPSBhd2FpdCB0aGlzLmludm9pY2VzUmVwb3NpdG9yeS5kZWxldGUoaWQpO1xyXG4gICAgaWYgKG9rKSBpbnZhbGlkYXRlQ2xpbmljRmFjdHNDYWNoZSgpO1xyXG4gICAgcmV0dXJuIG9rO1xyXG4gIH1cclxufVxyXG4iXX0=