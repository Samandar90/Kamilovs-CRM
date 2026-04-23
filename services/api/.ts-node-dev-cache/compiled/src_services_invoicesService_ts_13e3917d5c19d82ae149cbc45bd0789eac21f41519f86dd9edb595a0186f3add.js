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
        if (unitPrice < 0) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvc2VydmljZXMvaW52b2ljZXNTZXJ2aWNlLnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9zZXJ2aWNlcy9pbnZvaWNlc1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEseURBQWtFO0FBQ2xFLHVDQUFvQztBQUNwQyw2REFBc0Q7QUFDdEQsMEVBU2lEO0FBSWpELDhDQUFzRjtBQUV0RixNQUFNLGlCQUFpQixHQUFHLElBQUksR0FBRyxDQUFnQixDQUFDLE1BQU0sRUFBRSxXQUFXLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUVwRixNQUFNLDBCQUEwQixHQUEyQztJQUN6RSxLQUFLLEVBQUUsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDO0lBQzlCLE1BQU0sRUFBRSxDQUFDLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxXQUFXLENBQUM7SUFDL0MsY0FBYyxFQUFFLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUM7SUFDakQsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDO0lBQ2xCLFNBQVMsRUFBRSxFQUFFO0lBQ2IsUUFBUSxFQUFFLEVBQUU7Q0FDYixDQUFDO0FBaUNGLE1BQU0sVUFBVSxHQUFHLENBQUMsS0FBYyxFQUFVLEVBQUU7SUFDNUMsTUFBTSxDQUFDLEdBQUcsSUFBQSwyQkFBaUIsRUFBQyxLQUFLLENBQUMsQ0FBQztJQUNuQyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNmLE1BQU0sSUFBSSx1QkFBUSxDQUFDLEdBQUcsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFDRCxPQUFPLElBQUEscUJBQVcsRUFBQyxDQUFDLENBQUMsQ0FBQztBQUN4QixDQUFDLENBQUM7QUFFRixNQUFNLHNCQUFzQixHQUFHLENBQUMsS0FBYyxFQUFV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Q3JDLE9BQU8sRUFBRSxDQUFDO0lBQ1osQ0FBQztDQUNGO0FBelBELDBDQXlQQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGludmFsaWRhdGVDbGluaWNGYWN0c0NhY2hlIH0gZnJvbSBcIi4uL2FpL2FpQ2FjaGVTZXJ2aWNlXCI7XHJcbmltcG9ydCB7IGVudiB9IGZyb20gXCIuLi9jb25maWcvZW52XCI7XHJcbmltcG9ydCB7IEFwaUVycm9yIH0gZnJvbSBcIi4uL21pZGRsZXdhcmUvZXJyb3JIYW5kbGVyXCI7XHJcbmltcG9ydCB7XHJcbiAgSU5WT0lDRV9TVEFUVVNFUyxcclxuICB0eXBlIEludm9pY2UsXHJcbiAgdHlwZSBJbnZvaWNlQ3JlYXRlSW5wdXQsXHJcbiAgdHlwZSBJbnZvaWNlRmlsdGVycyxcclxuICB0eXBlIEludm9pY2VJdGVtSW5wdXQsXHJcbiAgdHlwZSBJbnZvaWNlU3RhdHVzLFxyXG4gIHR5cGUgSW52b2ljZVN1bW1hcnksXHJcbiAgdHlwZSBJbnZvaWNlVXBkYXRlSW5wdXQsXHJcbn0gZnJvbSBcIi4uL3JlcG9zaXRvcmllcy9pbnRlcmZhY2VzL2JpbGxpbmdUeXBlc1wiO1xyXG5pbXBvcnQgdHlwZSB7IElJbnZvaWNlc1JlcG9zaXRvcnkgfSBmcm9tIFwiLi4vcmVwb3NpdG9yaWVzL2ludGVyZmFjZXMvSUludm9pY2VzUmVwb3NpdG9yeVwiO1xyXG5pbXBvcnQgdHlwZSB7IElTZXJ2aWNlc1JlcG9zaXRvcnkgfSBmcm9tIFwiLi4vcmVwb3NpdG9yaWVzL2ludGVyZmFjZXMvSVNlcnZpY2VzUmVwb3NpdG9yeVwiO1xyXG5pbXBvcnQgdHlwZSB7IEF1dGhUb2tlblBheWxvYWQgfSBmcm9tIFwiLi4vcmVwb3NpdG9yaWVzL2ludGVyZmFjZXMvdXNlclR5cGVzXCI7XHJcbmltcG9ydCB7IHBhcnNlTnVtZXJpY0lucHV0LCBwYXJzZVJlcXVpcmVkTW9uZXksIHJvdW5kTW9uZXkyIH0gZnJvbSBcIi4uL3V0aWxzL251bWJlcnNcIjtcclxuXHJcbmNvbnN0IFRFUk1JTkFMX1NUQVRVU0VTID0gbmV3IFNldDxJbnZvaWNlU3RhdHVzPihbXCJwYWlkXCIsIFwiY2FuY2VsbGVkXCIsIFwicmVmdW5kZWRcIl0pO1xyXG5cclxuY29uc3QgQUxMT1dFRF9TVEFUVVNfVFJBTlNJVElPTlM6IFJlY29yZDxJbnZvaWNlU3RhdHVzLCBJbnZvaWNlU3RhdHVzW10+ID0ge1xyXG4gIGRyYWZ0OiBbXCJpc3N1ZWRcIiwgXCJjYW5jZWxsZWRcIl0sXHJcbiAgaXNzdWVkOiBbXCJwYXJ0aWFsbHlfcGFpZFwiLCBcInBhaWRcIiwgXCJjYW5jZWxsZWRcIl0sXHJcbiAgcGFydGlhbGx5X3BhaWQ6IFtcInBhaWRcIiwgXCJjYW5jZWxsZWRcIiwgXCJyZWZ1bmRlZFwiXSxcclxuICBwYWlkOiBbXCJyZWZ1bmRlZFwiXSxcclxuICBjYW5jZWxsZWQ6IFtdLFxyXG4gIHJlZnVuZGVkOiBbXSxcclxufTtcclxuXHJcbi8qKiBSYXcgbGluZSDQuNC3IEhUVFAgKNC60L3QvtC/0LrQsCDCq9Ch0YfRkdGCwrsg0LzQvtC20LXRgiDQv9GA0LjRgdC70LDRgtGMIHByaWNlL3VuaXRQcmljZSDRgdGC0YDQvtC60L7QuSDRgSDQv9GA0L7QsdC10LvQsNC80LgpLiAqL1xyXG50eXBlIFJhd0ludm9pY2VMaW5lSW5wdXQgPSB7XHJcbiAgc2VydmljZUlkPzogdW5rbm93bjtcclxuICBxdWFudGl0eT86IHVua25vd247XHJcbiAgZGVzY3JpcHRpb24/OiB1bmtub3duO1xyXG4gIHVuaXRQcmljZT86IHVua25vd247XHJcbiAgcHJpY2U/OiB1bmtub3duO1xyXG59O1xyXG5cclxudHlwZSBDcmVhdGVJbnZvaWNlUGF5bG9hZCA9IHtcclxuICBudW1iZXI/OiBzdHJpbmc7XHJcbiAgcGF0aWVudElkOiBudW1iZXI7XHJcbiAgYXBwb2ludG1lbnRJZD86IG51bWJlciB8IG51bGw7XHJcbiAgc3RhdHVzPzogSW52b2ljZVN0YXR1cztcclxuICBkaXNjb3VudD86IG51bWJlcjtcclxuICAvKiogSWdub3JlZCDigJQgdXNlIHBheW1lbnRzIEFQSSBvbmx5ICovXHJcbiAgcGFpZEFtb3VudD86IG51bWJlcjtcclxuICBpdGVtczogUmF3SW52b2ljZUxpbmVJbnB1dFtdO1xyXG59O1xyXG5cclxudHlwZSBVcGRhdGVJbnZvaWNlUGF5bG9hZCA9IHtcclxuICBudW1iZXI/OiBzdHJpbmc7XHJcbiAgcGF0aWVudElkPzogbnVtYmVyO1xyXG4gIGFwcG9pbnRtZW50SWQ/OiBudW1iZXIgfCBudWxsO1xyXG4gIHN0YXR1cz86IEludm9pY2VTdGF0dXM7XHJcbiAgZGlzY291bnQ/OiBudW1iZXI7XHJcbiAgLyoqIE5vdCBhY2NlcHRlZCDigJQgcGFpZCBhbW91bnQgaXMgbWFuYWdlZCB2aWEgcGF5bWVudHMgKi9cclxuICBwYWlkQW1vdW50PzogbnVtYmVyO1xyXG4gIGl0ZW1zPzogUmF3SW52b2ljZUxpbmVJbnB1dFtdO1xyXG59O1xyXG5cclxuY29uc3Qgcm91bmRNb25leSA9ICh2YWx1ZTogdW5rbm93bik6IG51bWJlciA9PiB7XHJcbiAgY29uc3QgbiA9IHBhcnNlTnVtZXJpY0lucHV0KHZhbHVlKTtcclxuICBpZiAobiA9PT0gbnVsbCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCLQndC10LrQvtGA0YDQtdC60YLQvdCw0Y8g0LTQtdC90LXQttC90LDRjyDRgdGD0LzQvNCwXCIpO1xyXG4gIH1cclxuICByZXR1cm4gcm91bmRNb25leTIobik7XHJcbn07XHJcblxyXG5jb25zdCBub3JtYWxpemVJbnZvaWNlTnVtYmVyID0gKHZhbHVlOiB1bmtub3duKTogc3RyaW5nID0+IHtcclxuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiIHx8IHZhbHVlLnRyaW0oKSA9PT0gXCJcIikge1xyXG4gICAgcmV0dXJuIGBJTlYtJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpfWA7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gdmFsdWUudHJpbSgpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqINCa0L7Qu9C40YfQtdGB0YLQstC+IOKAlCDQvdC1INC00LXQvdC10LbQvdCw0Y8g0YHRg9C80LzQsDog0L3QtdC70YzQt9GPINC+0LrRgNGD0LPQu9GP0YLRjCDQtNC+IDIg0LfQvdCw0LrQvtCyICjQuNC90LDRh9C1IDAuODQ3IOKGkiAwLjg1INC4INC/0LDQtNCw0Y7RgiDQv9GA0L7QstC10YDQutC4IC8gNDAwKS5cclxuICovXHJcbmNvbnN0IHBhcnNlTGluZVF1YW50aXR5ID0gKHZhbHVlOiB1bmtub3duLCBpbmRleDogbnVtYmVyKTogbnVtYmVyID0+IHtcclxuICBjb25zdCBuID0gcGFyc2VOdW1lcmljSW5wdXQodmFsdWUpO1xyXG4gIGlmIChuID09PSBudWxsIHx8IG4gPD0gMCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgYEl0ZW0gYXQgaW5kZXggJHtpbmRleH06ICdxdWFudGl0eScgbXVzdCBiZSBncmVhdGVyIHRoYW4gMGApO1xyXG4gIH1cclxuICByZXR1cm4gbjtcclxufTtcclxuXHJcbmNvbnN0IHBhcnNlU2VydmljZUlkID0gKHZhbHVlOiB1bmtub3duLCBpbmRleDogbnVtYmVyKTogbnVtYmVyID0+IHtcclxuICBjb25zdCBuID0gcGFyc2VOdW1lcmljSW5wdXQodmFsdWUpO1xyXG4gIGNvbnN0IHBhcnNlZCA9IG4gIT0gbnVsbCA/IE1hdGgudHJ1bmMobikgOiBOYU47XHJcbiAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhcnNlZCkgfHwgcGFyc2VkIDw9IDApIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIGBJdGVtIGF0IGluZGV4ICR7aW5kZXh9OiAnc2VydmljZUlkJyBtdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlcmApO1xyXG4gIH1cclxuICByZXR1cm4gcGFyc2VkO1xyXG59O1xyXG5cclxuY29uc3QgcmVzb2x2ZUxpbmVJdGVtc0Zyb21TZXJ2aWNlcyA9IGFzeW5jIChcclxuICBzZXJ2aWNlc1JlcG9zaXRvcnk6IElTZXJ2aWNlc1JlcG9zaXRvcnksXHJcbiAgcmF3SXRlbXM6IFJhd0ludm9pY2VMaW5lSW5wdXRbXVxyXG4pOiBQcm9taXNlPEludm9pY2VJdGVtSW5wdXRbXT4gPT4ge1xyXG4gIGNvbnN0IHJlc3VsdDogSW52b2ljZUl0ZW1JbnB1dFtdID0gW107XHJcblxyXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCByYXdJdGVtcy5sZW5ndGg7IGluZGV4KyspIHtcclxuICAgIGNvbnN0IGxpbmUgPSByYXdJdGVtc1tpbmRleF07XHJcbiAgICBjb25zdCBzZXJ2aWNlSWQgPSBwYXJzZVNlcnZpY2VJZChsaW5lLnNlcnZpY2VJZCwgaW5kZXgpO1xyXG4gICAgY29uc3QgcXVhbnRpdHkgPSBwYXJzZUxpbmVRdWFudGl0eShsaW5lLnF1YW50aXR5LCBpbmRleCk7XHJcblxyXG4gICAgY29uc3Qgc2VydmljZSA9IGF3YWl0IHNlcnZpY2VzUmVwb3NpdG9yeS5maW5kQnlJZChzZXJ2aWNlSWQpO1xyXG4gICAgaWYgKCFzZXJ2aWNlKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDQsIGBTZXJ2aWNlICR7c2VydmljZUlkfSBub3QgZm91bmRgKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByYXdQcmljZTogdW5rbm93biA9XHJcbiAgICAgIGxpbmUucHJpY2UgIT09IHVuZGVmaW5lZCAmJiBsaW5lLnByaWNlICE9PSBudWxsXHJcbiAgICAgICAgPyBsaW5lLnByaWNlXHJcbiAgICAgICAgOiBsaW5lLnVuaXRQcmljZSAhPT0gdW5kZWZpbmVkICYmIGxpbmUudW5pdFByaWNlICE9PSBudWxsXHJcbiAgICAgICAgICA/IGxpbmUudW5pdFByaWNlXHJcbiAgICAgICAgICA6IHNlcnZpY2UucHJpY2U7XHJcblxyXG4gICAgY29uc3QgdW5pdFByaWNlID0gcm91bmRNb25leTIocGFyc2VSZXF1aXJlZE1vbmV5KHJhd1ByaWNlLCBcInByaWNlXCIpKTtcclxuXHJcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh1bml0UHJpY2UpKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIGBJdGVtIGF0IGluZGV4ICR7aW5kZXh9OiBpbnZhbGlkIHVuaXQgcHJpY2UgYmVmb3JlIGluc2VydGApO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh1bml0UHJpY2UgPCAwKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIGBTZXJ2aWNlICR7c2VydmljZUlkfSBoYXMgaW52YWxpZCBwcmljZWApO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGRlc2NyaXB0aW9uID1cclxuICAgICAgdHlwZW9mIGxpbmUuZGVzY3JpcHRpb24gPT09IFwic3RyaW5nXCIgJiYgbGluZS5kZXNjcmlwdGlvbi50cmltKCkgIT09IFwiXCJcclxuICAgICAgICA/IGxpbmUuZGVzY3JpcHRpb24udHJpbSgpXHJcbiAgICAgICAgOiBzZXJ2aWNlLm5hbWU7XHJcblxyXG4gICAgY29uc3QgbGluZVRvdGFsID0gcm91bmRNb25leShxdWFudGl0eSAqIHVuaXRQcmljZSk7XHJcblxyXG4gICAgcmVzdWx0LnB1c2goe1xyXG4gICAgICBzZXJ2aWNlSWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uLFxyXG4gICAgICBxdWFudGl0eSxcclxuICAgICAgdW5pdFByaWNlLFxyXG4gICAgICBsaW5lVG90YWwsXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgY29uc29sZS5sb2coXCJGSU5BTCBJTlZPSUNFIElURU1TOlwiLCByZXN1bHQpO1xyXG5cclxuICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuY29uc3QgY29tcHV0ZVRvdGFscyA9IChcclxuICBpdGVtczogSW52b2ljZUl0ZW1JbnB1dFtdLFxyXG4gIGRpc2NvdW50SW5wdXQ6IG51bWJlciB8IHVuZGVmaW5lZFxyXG4pOiB7IHN1YnRvdGFsOiBudW1iZXI7IGRpc2NvdW50OiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfSA9PiB7XHJcbiAgY29uc3Qgc3VidG90YWwgPSByb3VuZE1vbmV5KFxyXG4gICAgaXRlbXMucmVkdWNlKChhY2MsIGl0ZW0pID0+IGFjYyArIHJvdW5kTW9uZXkoaXRlbS5saW5lVG90YWwpLCAwKVxyXG4gICk7XHJcbiAgY29uc3QgZGlzY291bnQgPSByb3VuZE1vbmV5KGRpc2NvdW50SW5wdXQgPz8gMCk7XHJcbiAgY29uc3QgdG90YWwgPSByb3VuZE1vbmV5KHN1YnRvdGFsIC0gZGlzY291bnQpO1xyXG5cclxuICBpZiAoZGlzY291bnQgPCAwKSB7XHJcbiAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkZpZWxkICdkaXNjb3VudCcgbXVzdCBiZSBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gMFwiKTtcclxuICB9XHJcblxyXG4gIGlmIChkaXNjb3VudCA+IHN1YnRvdGFsICsgMWUtNikge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCLQodC60LjQtNC60LAg0L3QtSDQvNC+0LbQtdGCINC/0YDQtdCy0YvRiNCw0YLRjCDRgdGD0LzQvNGDINC/0L7Qt9C40YbQuNC5IChzdWJ0b3RhbClcIik7XHJcbiAgfVxyXG5cclxuICBpZiAodG90YWwgPCAwKSB7XHJcbiAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkludm9pY2UgdG90YWwgY2Fubm90IGJlIG5lZ2F0aXZlXCIpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHsgc3VidG90YWwsIGRpc2NvdW50LCB0b3RhbCB9O1xyXG59O1xyXG5cclxuY29uc3QgZW5zdXJlUGF0aWVudEV4aXN0cyA9IGFzeW5jIChcclxuICBpbnZvaWNlc1JlcG9zaXRvcnk6IElJbnZvaWNlc1JlcG9zaXRvcnksXHJcbiAgcGF0aWVudElkOiBudW1iZXJcclxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgY29uc3QgZXhpc3RzID0gYXdhaXQgaW52b2ljZXNSZXBvc2l0b3J5LnBhdGllbnRFeGlzdHMocGF0aWVudElkKTtcclxuICBpZiAoIWV4aXN0cykge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwNCwgXCJQYXRpZW50IG5vdCBmb3VuZFwiKTtcclxuICB9XHJcbn07XHJcblxyXG5jb25zdCBlbnN1cmVBcHBvaW50bWVudEZvckludm9pY2UgPSBhc3luYyAoXHJcbiAgaW52b2ljZXNSZXBvc2l0b3J5OiBJSW52b2ljZXNSZXBvc2l0b3J5LFxyXG4gIGFwcG9pbnRtZW50SWQ6IG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQsXHJcbiAgcGF0aWVudElkOiBudW1iZXJcclxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgaWYgKGFwcG9pbnRtZW50SWQgPT09IHVuZGVmaW5lZCB8fCBhcHBvaW50bWVudElkID09PSBudWxsKSB7XHJcbiAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkZpZWxkICdhcHBvaW50bWVudElkJyBpcyByZXF1aXJlZFwiKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGFwcG9pbnRtZW50Rm91bmQgPSBhd2FpdCBpbnZvaWNlc1JlcG9zaXRvcnkuYXBwb2ludG1lbnRFeGlzdHMoYXBwb2ludG1lbnRJZCk7XHJcbiAgaWYgKCFhcHBvaW50bWVudEZvdW5kKSB7XHJcbiAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDA0LCBcIkFwcG9pbnRtZW50IG5vdCBmb3VuZFwiKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGFwcG9pbnRtZW50UGF0aWVudElkID0gYXdhaXQgaW52b2ljZXNSZXBvc2l0b3J5LmdldEFwcG9pbnRtZW50UGF0aWVudElkKGFwcG9pbnRtZW50SWQpO1xyXG4gIGlmIChhcHBvaW50bWVudFBhdGllbnRJZCA9PT0gbnVsbCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwNCwgXCJBcHBvaW50bWVudCBub3QgZm91bmRcIik7XHJcbiAgfVxyXG5cclxuICBpZiAoYXBwb2ludG1lbnRQYXRpZW50SWQgIT09IHBhdGllbnRJZCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJJbnZvaWNlIHBhdGllbnQgbXVzdCBtYXRjaCBhcHBvaW50bWVudCBwYXRpZW50XCIpO1xyXG4gIH1cclxufTtcclxuXHJcbmNvbnN0IGVuc3VyZVN0YXR1c1RyYW5zaXRpb25BbGxvd2VkID0gKFxyXG4gIGN1cnJlbnRTdGF0dXM6IEludm9pY2VTdGF0dXMsXHJcbiAgbmV4dFN0YXR1czogSW52b2ljZVN0YXR1c1xyXG4pOiB2b2lkID0+IHtcclxuICBpZiAoY3VycmVudFN0YXR1cyA9PT0gbmV4dFN0YXR1cykge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgYWxsb3dlZCA9IEFMTE9XRURfU1RBVFVTX1RSQU5TSVRJT05TW2N1cnJlbnRTdGF0dXNdO1xyXG4gIGlmICghYWxsb3dlZC5pbmNsdWRlcyhuZXh0U3RhdHVzKSkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKFxyXG4gICAgICA0MDAsXHJcbiAgICAgIGBJbnZhbGlkIGludm9pY2Ugc3RhdHVzIHRyYW5zaXRpb246ICcke2N1cnJlbnRTdGF0dXN9JyAtPiAnJHtuZXh0U3RhdHVzfSdgXHJcbiAgICApO1xyXG4gIH1cclxufTtcclxuXHJcbmV4cG9ydCBjbGFzcyBJbnZvaWNlc1NlcnZpY2Uge1xyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnZvaWNlc1JlcG9zaXRvcnk6IElJbnZvaWNlc1JlcG9zaXRvcnksXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlcnZpY2VzUmVwb3NpdG9yeTogSVNlcnZpY2VzUmVwb3NpdG9yeVxyXG4gICkge31cclxuXHJcbiAgYXN5bmMgbGlzdChcclxuICAgIF9hdXRoOiBBdXRoVG9rZW5QYXlsb2FkLFxyXG4gICAgZmlsdGVyczogSW52b2ljZUZpbHRlcnMgPSB7fVxyXG4gICk6IFByb21pc2U8SW52b2ljZVN1bW1hcnlbXT4ge1xyXG4gICAgcmV0dXJuIHRoaXMuaW52b2ljZXNSZXBvc2l0b3J5LmZpbmRBbGwoZmlsdGVycyk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBnZXRCeUlkKF9hdXRoOiBBdXRoVG9rZW5QYXlsb2FkLCBpZDogbnVtYmVyKTogUHJvbWlzZTxJbnZvaWNlIHwgbnVsbD4ge1xyXG4gICAgcmV0dXJuIHRoaXMuaW52b2ljZXNSZXBvc2l0b3J5LmZpbmRCeUlkKGlkKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGNyZWF0ZShfYXV0aDogQXV0aFRva2VuUGF5bG9hZCwgcGF5bG9hZDogQ3JlYXRlSW52b2ljZVBheWxvYWQpOiBQcm9taXNlPEludm9pY2U+IHtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShwYXlsb2FkLml0ZW1zKSB8fCBwYXlsb2FkLml0ZW1zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkZpZWxkICdpdGVtcycgbXVzdCBjb250YWluIGF0IGxlYXN0IG9uZSBsaW5lIHdpdGggYSBzZXJ2aWNlXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChwYXlsb2FkLnBhaWRBbW91bnQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkZpZWxkICdwYWlkQW1vdW50JyBjYW5ub3QgYmUgc2V0IHdoZW4gY3JlYXRpbmcgYW4gaW52b2ljZSDigJQgdXNlIHBheW1lbnRzXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHN0YXR1cyA9IHBheWxvYWQuc3RhdHVzID8/IFwiZHJhZnRcIjtcclxuICAgIGlmICghSU5WT0lDRV9TVEFUVVNFUy5pbmNsdWRlcyhzdGF0dXMpKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiSW52YWxpZCBpbnZvaWNlIHN0YXR1c1wiKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkaXNjb3VudCA9IHJvdW5kTW9uZXkocGF5bG9hZC5kaXNjb3VudCA/PyAwKTtcclxuICAgIGNvbnN0IG51bWJlciA9IG5vcm1hbGl6ZUludm9pY2VOdW1iZXIocGF5bG9hZC5udW1iZXIpO1xyXG4gICAgY29uc3QgcGF0aWVudElkUmF3ID0gcGFyc2VOdW1lcmljSW5wdXQocGF5bG9hZC5wYXRpZW50SWQpO1xyXG4gICAgY29uc3QgcGF0aWVudElkID0gcGF0aWVudElkUmF3ICE9IG51bGwgPyBNYXRoLnRydW5jKHBhdGllbnRJZFJhdykgOiBOYU47XHJcbiAgICBjb25zdCBhcHBvaW50bWVudElkUmF3ID0gcGF5bG9hZC5hcHBvaW50bWVudElkID8/IG51bGw7XHJcbiAgICBjb25zdCBhcHBvaW50bWVudElkID1cclxuICAgICAgYXBwb2ludG1lbnRJZFJhdyA9PT0gbnVsbCB8fCBhcHBvaW50bWVudElkUmF3ID09PSB1bmRlZmluZWRcclxuICAgICAgICA/IG51bGxcclxuICAgICAgICA6ICgoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG4gPSBwYXJzZU51bWVyaWNJbnB1dChhcHBvaW50bWVudElkUmF3KTtcclxuICAgICAgICAgICAgcmV0dXJuIG4gIT0gbnVsbCA/IE1hdGgudHJ1bmMobikgOiBOYU47XHJcbiAgICAgICAgICB9KSgpO1xyXG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhdGllbnRJZCkgfHwgcGF0aWVudElkIDw9IDApIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJGaWVsZCAncGF0aWVudElkJyBtdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlclwiKTtcclxuICAgIH1cclxuICAgIGlmIChhcHBvaW50bWVudElkID09PSBudWxsIHx8ICFOdW1iZXIuaXNJbnRlZ2VyKGFwcG9pbnRtZW50SWQpIHx8IGFwcG9pbnRtZW50SWQgPD0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkZpZWxkICdhcHBvaW50bWVudElkJyBpcyByZXF1aXJlZCBhbmQgbXVzdCBiZSBhIHBvc2l0aXZlIGludGVnZXJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgZW5zdXJlUGF0aWVudEV4aXN0cyh0aGlzLmludm9pY2VzUmVwb3NpdG9yeSwgcGF0aWVudElkKTtcclxuICAgIGF3YWl0IGVuc3VyZUFwcG9pbnRtZW50Rm9ySW52b2ljZSh0aGlzLmludm9pY2VzUmVwb3NpdG9yeSwgYXBwb2ludG1lbnRJZCwgcGF0aWVudElkKTtcclxuXHJcbiAgICBjb25zdCByZXNvbHZlZEl0ZW1zID0gYXdhaXQgcmVzb2x2ZUxpbmVJdGVtc0Zyb21TZXJ2aWNlcyh0aGlzLnNlcnZpY2VzUmVwb3NpdG9yeSwgcGF5bG9hZC5pdGVtcyk7XHJcbiAgICBjb25zdCB0b3RhbHMgPSBjb21wdXRlVG90YWxzKHJlc29sdmVkSXRlbXMsIGRpc2NvdW50KTtcclxuXHJcbiAgICBjb25zdCBpbnZvaWNlSW5wdXQ6IEludm9pY2VDcmVhdGVJbnB1dCA9IHtcclxuICAgICAgbnVtYmVyLFxyXG4gICAgICBwYXRpZW50SWQsXHJcbiAgICAgIGFwcG9pbnRtZW50SWQsXHJcbiAgICAgIHN0YXR1cyxcclxuICAgICAgc3VidG90YWw6IHRvdGFscy5zdWJ0b3RhbCxcclxuICAgICAgZGlzY291bnQ6IHRvdGFscy5kaXNjb3VudCxcclxuICAgICAgdG90YWw6IHRvdGFscy50b3RhbCxcclxuICAgICAgcGFpZEFtb3VudDogMCxcclxuICAgIH07XHJcblxyXG4gICAgaWYgKGVudi5kZWJ1Z0ludm9pY2VDcmVhdGUpIHtcclxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgICAgY29uc29sZS5sb2coXHJcbiAgICAgICAgXCJbSW52b2ljZXNTZXJ2aWNlLmNyZWF0ZV0gbm9ybWFsaXplZCBpbnZvaWNlSW5wdXQgKyByZXNvbHZlZEl0ZW1zXCIsXHJcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoeyBpbnZvaWNlSW5wdXQsIHJlc29sdmVkSXRlbXMgfSlcclxuICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5sb2coXHJcbiAgICAgIFwiSU5WT0lDRSBJTlNFUlQgREFUQTpcIixcclxuICAgICAgSlNPTi5zdHJpbmdpZnkoeyBpdGVtczogcmVzb2x2ZWRJdGVtcyB9LCBudWxsLCAyKVxyXG4gICAgKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjcmVhdGVkID0gYXdhaXQgdGhpcy5pbnZvaWNlc1JlcG9zaXRvcnkuY3JlYXRlKGludm9pY2VJbnB1dCwgcmVzb2x2ZWRJdGVtcyk7XHJcbiAgICAgIGNvbnN0IGZ1bGxJbnZvaWNlID0gYXdhaXQgdGhpcy5pbnZvaWNlc1JlcG9zaXRvcnkuZmluZEJ5SWQoY3JlYXRlZC5pZCk7XHJcbiAgICAgIGlmICghZnVsbEludm9pY2UpIHtcclxuICAgICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNTAwLCBcIkZhaWxlZCB0byBsb2FkIGNyZWF0ZWQgaW52b2ljZVwiKTtcclxuICAgICAgfVxyXG4gICAgICBpbnZhbGlkYXRlQ2xpbmljRmFjdHNDYWNoZSgpO1xyXG4gICAgICByZXR1cm4gZnVsbEludm9pY2U7XHJcbiAgICB9IGNhdGNoIChlcnI6IHVua25vd24pIHtcclxuICAgICAgY29uc3QgcGcgPSBlcnIgYXMgeyBjb2RlPzogc3RyaW5nOyBjb25zdHJhaW50Pzogc3RyaW5nOyBkZXRhaWw/OiBzdHJpbmcgfTtcclxuICAgICAgaWYgKHBnLmNvZGUgPT09IFwiMjM1MDVcIikge1xyXG4gICAgICAgIGNvbnN0IGQgPSAocGcuZGV0YWlsID8/IFwiXCIpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgaWYgKHBnLmNvbnN0cmFpbnQgPT09IFwidXFfaW52b2ljZXNfYWN0aXZlX2FwcG9pbnRtZW50XCIgfHwgZC5pbmNsdWRlcyhcImFwcG9pbnRtZW50X2lkXCIpKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoXHJcbiAgICAgICAgICAgIDQwOSxcclxuICAgICAgICAgICAgXCJBbiBvcGVuIGludm9pY2UgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgYXBwb2ludG1lbnQgKGNhbmNlbCBpdCBvciBjb21wbGV0ZSBwYXltZW50IGZpcnN0KVwiXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDA5LCBcIkludm9pY2UgbnVtYmVyIGFscmVhZHkgZXhpc3RzXCIpO1xyXG4gICAgICB9XHJcbiAgICAgIHRocm93IGVycjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIHVwZGF0ZShcclxuICAgIGF1dGg6IEF1dGhUb2tlblBheWxvYWQsXHJcbiAgICBpZDogbnVtYmVyLFxyXG4gICAgcGF5bG9hZDogVXBkYXRlSW52b2ljZVBheWxvYWRcclxuICApOiBQcm9taXNlPEludm9pY2UgfCBudWxsPiB7XHJcbiAgICBpZiAocGF5bG9hZC5wYWlkQW1vdW50ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJGaWVsZCAncGFpZEFtb3VudCcgY2Fubm90IGJlIHVwZGF0ZWQgdmlhIGludm9pY2VzIEFQSSDigJQgdXNlIHBheW1lbnRzXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChhdXRoLnJvbGUgPT09IFwiY2FzaGllclwiKSB7XHJcbiAgICAgIGNvbnN0IHJlc3RyaWN0ZWQgPVxyXG4gICAgICAgIHBheWxvYWQubnVtYmVyICE9PSB1bmRlZmluZWQgfHxcclxuICAgICAgICBwYXlsb2FkLnBhdGllbnRJZCAhPT0gdW5kZWZpbmVkIHx8XHJcbiAgICAgICAgcGF5bG9hZC5hcHBvaW50bWVudElkICE9PSB1bmRlZmluZWQgfHxcclxuICAgICAgICBwYXlsb2FkLmRpc2NvdW50ICE9PSB1bmRlZmluZWQgfHxcclxuICAgICAgICBwYXlsb2FkLml0ZW1zICE9PSB1bmRlZmluZWQ7XHJcbiAgICAgIGlmIChyZXN0cmljdGVkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKFxyXG4gICAgICAgICAgNDAzLFxyXG4gICAgICAgICAgXCLQmtCw0YHRgdC40YAg0LzQvtC20LXRgiDQvNC10L3Rj9GC0Ywg0YLQvtC70YzQutC+INGB0YLQsNGC0YPRgSDRgdGH0ZHRgtCwOyDQv9C+0LfQuNGG0LjQuCDQuCDRgNC10LrQstC40LfQuNGC0Ysg0L3QtdC00L7RgdGC0YPQv9C90YtcIlxyXG4gICAgICAgICk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHBheWxvYWQuc3RhdHVzID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcItCU0LvRjyDQutCw0YHRgdC40YDQsCDRg9C60LDQttC40YLQtSDQv9C+0LvQtSBzdGF0dXNcIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgdGhpcy5pbnZvaWNlc1JlcG9zaXRvcnkuZmluZEJ5SWQoaWQpO1xyXG4gICAgaWYgKCFjdXJyZW50KSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGhhc0FueVVwZGF0ZUZpZWxkID1cclxuICAgICAgcGF5bG9hZC5udW1iZXIgIT09IHVuZGVmaW5lZCB8fFxyXG4gICAgICBwYXlsb2FkLnBhdGllbnRJZCAhPT0gdW5kZWZpbmVkIHx8XHJcbiAgICAgIHBheWxvYWQuYXBwb2ludG1lbnRJZCAhPT0gdW5kZWZpbmVkIHx8XHJcbiAgICAgIHBheWxvYWQuc3RhdHVzICE9PSB1bmRlZmluZWQgfHxcclxuICAgICAgcGF5bG9hZC5kaXNjb3VudCAhPT0gdW5kZWZpbmVkIHx8XHJcbiAgICAgIHBheWxvYWQuaXRlbXMgIT09IHVuZGVmaW5lZDtcclxuXHJcbiAgICBpZiAoIWhhc0FueVVwZGF0ZUZpZWxkKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiQXQgbGVhc3Qgb25lIGZpZWxkIG11c3QgYmUgcHJvdmlkZWQgZm9yIHVwZGF0ZVwiKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAocGF5bG9hZC5pdGVtcyAhPT0gdW5kZWZpbmVkICYmIFRFUk1JTkFMX1NUQVRVU0VTLmhhcyhjdXJyZW50LnN0YXR1cykpIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKFxyXG4gICAgICAgIDQwMCxcclxuICAgICAgICBcIkNhbm5vdCBtb2RpZnkgaW52b2ljZSBpdGVtcyBhZnRlciBwYWlkLCByZWZ1bmRlZCwgb3IgY2FuY2VsbGVkIHN0YXR1c1wiXHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbmV4dFN0YXR1cyA9IHBheWxvYWQuc3RhdHVzID8/IGN1cnJlbnQuc3RhdHVzO1xyXG4gICAgZW5zdXJlU3RhdHVzVHJhbnNpdGlvbkFsbG93ZWQoY3VycmVudC5zdGF0dXMsIG5leHRTdGF0dXMpO1xyXG5cclxuICAgIGNvbnN0IG5leHRQYXRpZW50SWQgPSBwYXlsb2FkLnBhdGllbnRJZCA/PyBjdXJyZW50LnBhdGllbnRJZDtcclxuICAgIGNvbnN0IG5leHRBcHBvaW50bWVudElkID1cclxuICAgICAgcGF5bG9hZC5hcHBvaW50bWVudElkICE9PSB1bmRlZmluZWQgPyBwYXlsb2FkLmFwcG9pbnRtZW50SWQgOiBjdXJyZW50LmFwcG9pbnRtZW50SWQ7XHJcblxyXG4gICAgaWYgKHBheWxvYWQuYXBwb2ludG1lbnRJZCAhPT0gdW5kZWZpbmVkIHx8IHBheWxvYWQucGF0aWVudElkICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgYXdhaXQgZW5zdXJlUGF0aWVudEV4aXN0cyh0aGlzLmludm9pY2VzUmVwb3NpdG9yeSwgbmV4dFBhdGllbnRJZCk7XHJcbiAgICAgIGF3YWl0IGVuc3VyZUFwcG9pbnRtZW50Rm9ySW52b2ljZShcclxuICAgICAgICB0aGlzLmludm9pY2VzUmVwb3NpdG9yeSxcclxuICAgICAgICBuZXh0QXBwb2ludG1lbnRJZCxcclxuICAgICAgICBuZXh0UGF0aWVudElkXHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IGVmZmVjdGl2ZUl0ZW1zOiBJbnZvaWNlSXRlbUlucHV0W107XHJcbiAgICBsZXQgcmVwbGFjZUxpbmVJdGVtczogSW52b2ljZUl0ZW1JbnB1dFtdIHwgdW5kZWZpbmVkO1xyXG5cclxuICAgIGlmIChwYXlsb2FkLml0ZW1zICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgZWZmZWN0aXZlSXRlbXMgPSBhd2FpdCByZXNvbHZlTGluZUl0ZW1zRnJvbVNlcnZpY2VzKHRoaXMuc2VydmljZXNSZXBvc2l0b3J5LCBwYXlsb2FkLml0ZW1zKTtcclxuICAgICAgcmVwbGFjZUxpbmVJdGVtcyA9IGVmZmVjdGl2ZUl0ZW1zO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZWZmZWN0aXZlSXRlbXMgPSBjdXJyZW50Lml0ZW1zLm1hcCgoaXRlbSkgPT4gKHtcclxuICAgICAgICBzZXJ2aWNlSWQ6IGl0ZW0uc2VydmljZUlkLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxyXG4gICAgICAgIHF1YW50aXR5OiBpdGVtLnF1YW50aXR5LFxyXG4gICAgICAgIHVuaXRQcmljZTogaXRlbS51bml0UHJpY2UsXHJcbiAgICAgICAgbGluZVRvdGFsOiBpdGVtLmxpbmVUb3RhbCxcclxuICAgICAgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChlZmZlY3RpdmVJdGVtcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJJbnZvaWNlIG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgaXRlbVwiKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBuZXh0RGlzY291bnQgPSBwYXlsb2FkLmRpc2NvdW50ID8/IGN1cnJlbnQuZGlzY291bnQ7XHJcbiAgICBjb25zdCB0b3RhbHMgPSBjb21wdXRlVG90YWxzKGVmZmVjdGl2ZUl0ZW1zLCBuZXh0RGlzY291bnQpO1xyXG5cclxuICAgIGNvbnN0IG5leHRQYWlkQW1vdW50ID0gcm91bmRNb25leShjdXJyZW50LnBhaWRBbW91bnQpO1xyXG4gICAgaWYgKG5leHRQYWlkQW1vdW50ID4gdG90YWxzLnRvdGFsKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcihcclxuICAgICAgICA0MDAsXHJcbiAgICAgICAgXCJDdXJyZW50IHBheW1lbnRzIGV4Y2VlZCByZWNvbXB1dGVkIGludm9pY2UgdG90YWwg4oCUIHZvaWQgcGF5bWVudHMgb3IgYWRqdXN0IGxpbmUgaXRlbXNcIlxyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHVwZGF0ZVBheWxvYWQ6IEludm9pY2VVcGRhdGVJbnB1dCA9IHtcclxuICAgICAgbnVtYmVyOlxyXG4gICAgICAgIHBheWxvYWQubnVtYmVyICE9PSB1bmRlZmluZWRcclxuICAgICAgICAgID8gbm9ybWFsaXplSW52b2ljZU51bWJlcihwYXlsb2FkLm51bWJlcilcclxuICAgICAgICAgIDogdW5kZWZpbmVkLFxyXG4gICAgICBwYXRpZW50SWQ6IHBheWxvYWQucGF0aWVudElkICE9PSB1bmRlZmluZWQgPyBuZXh0UGF0aWVudElkIDogdW5kZWZpbmVkLFxyXG4gICAgICBhcHBvaW50bWVudElkOiBwYXlsb2FkLmFwcG9pbnRtZW50SWQgIT09IHVuZGVmaW5lZCA/IG5leHRBcHBvaW50bWVudElkID8/IG51bGwgOiB1bmRlZmluZWQsXHJcbiAgICAgIHN0YXR1czogbmV4dFN0YXR1cyxcclxuICAgICAgc3VidG90YWw6IHRvdGFscy5zdWJ0b3RhbCxcclxuICAgICAgZGlzY291bnQ6IHRvdGFscy5kaXNjb3VudCxcclxuICAgICAgdG90YWw6IHRvdGFscy50b3RhbCxcclxuICAgIH07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgdXBkYXRlZCA9IGF3YWl0IHRoaXMuaW52b2ljZXNSZXBvc2l0b3J5LnVwZGF0ZShpZCwgdXBkYXRlUGF5bG9hZCwgcmVwbGFjZUxpbmVJdGVtcyk7XHJcbiAgICAgIGlmICghdXBkYXRlZCkge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBmdWxsSW52b2ljZSA9IGF3YWl0IHRoaXMuaW52b2ljZXNSZXBvc2l0b3J5LmZpbmRCeUlkKGlkKTtcclxuICAgICAgaWYgKCFmdWxsSW52b2ljZSkge1xyXG4gICAgICAgIHRocm93IG5ldyBBcGlFcnJvcig1MDAsIFwiRmFpbGVkIHRvIGxvYWQgdXBkYXRlZCBpbnZvaWNlXCIpO1xyXG4gICAgICB9XHJcbiAgICAgIGludmFsaWRhdGVDbGluaWNGYWN0c0NhY2hlKCk7XHJcbiAgICAgIHJldHVybiBmdWxsSW52b2ljZTtcclxuICAgIH0gY2F0Y2ggKGVycjogdW5rbm93bikge1xyXG4gICAgICBjb25zdCBwZyA9IGVyciBhcyB7IGNvZGU/OiBzdHJpbmc7IGNvbnN0cmFpbnQ/OiBzdHJpbmc7IGRldGFpbD86IHN0cmluZyB9O1xyXG4gICAgICBpZiAocGcuY29kZSA9PT0gXCIyMzUwNVwiKSB7XHJcbiAgICAgICAgY29uc3QgZCA9IChwZy5kZXRhaWwgPz8gXCJcIikudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBpZiAocGcuY29uc3RyYWludCA9PT0gXCJ1cV9pbnZvaWNlc19hY3RpdmVfYXBwb2ludG1lbnRcIiB8fCBkLmluY2x1ZGVzKFwiYXBwb2ludG1lbnRfaWRcIikpIHtcclxuICAgICAgICAgIHRocm93IG5ldyBBcGlFcnJvcihcclxuICAgICAgICAgICAgNDA5LFxyXG4gICAgICAgICAgICBcIkFuIG9wZW4gaW52b2ljZSBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBhcHBvaW50bWVudCAoY2FuY2VsIGl0IG9yIGNvbXBsZXRlIHBheW1lbnQgZmlyc3QpXCJcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDksIFwiSW52b2ljZSBudW1iZXIgYWxyZWFkeSBleGlzdHNcIik7XHJcbiAgICAgIH1cclxuICAgICAgdGhyb3cgZXJyO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgZGVsZXRlKF9hdXRoOiBBdXRoVG9rZW5QYXlsb2FkLCBpZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICBjb25zdCBvayA9IGF3YWl0IHRoaXMuaW52b2ljZXNSZXBvc2l0b3J5LmRlbGV0ZShpZCk7XHJcbiAgICBpZiAob2spIGludmFsaWRhdGVDbGluaWNGYWN0c0NhY2hlKCk7XHJcbiAgICByZXR1cm4gb2s7XHJcbiAgfVxyXG59XHJcbiJdfQ==