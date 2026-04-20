"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockPaymentsRepository = exports.PAYMENT_METHODS = void 0;
const billingTypes_1 = require("./interfaces/billingTypes");
Object.defineProperty(exports, "PAYMENT_METHODS", { enumerable: true, get: function () { return billingTypes_1.PAYMENT_METHODS; } });
const errorHandler_1 = require("../middleware/errorHandler");
const mockDatabase_1 = require("./mockDatabase");
class MockPaymentsRepository {
    async findAll(filters = {}) {
        return (0, mockDatabase_1.getMockDb)()
            .payments.filter((row) => {
            if (row.deletedAt)
                return false;
            if (filters.invoiceId !== undefined && row.invoiceId !== filters.invoiceId)
                return false;
            if (filters.method !== undefined &&
                (0, billingTypes_1.normalizePaymentMethod)(String(row.method)) !== filters.method) {
                return false;
            }
            return true;
        })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((row) => ({
            ...row,
            method: (0, billingTypes_1.normalizePaymentMethod)(String(row.method)),
        }));
    }
    async findById(id) {
        const found = (0, mockDatabase_1.getMockDb)().payments.find((row) => row.id === id && !row.deletedAt);
        return found
            ? { ...found, method: (0, billingTypes_1.normalizePaymentMethod)(String(found.method)) }
            : null;
    }
    async findByIdIncludingVoided(id) {
        const found = (0, mockDatabase_1.getMockDb)().payments.find((row) => row.id === id);
        return found
            ? { ...found, method: (0, billingTypes_1.normalizePaymentMethod)(String(found.method)) }
            : null;
    }
    async findActivePaymentByIdempotencyKey(userId, key) {
        const row = (0, mockDatabase_1.getMockDb)().payments.find((p) => p.createdBy === userId &&
            p.idempotencyKey === key &&
            p.idempotencyKeyClientSupplied &&
            !p.deletedAt);
        return row
            ? { ...row, method: (0, billingTypes_1.normalizePaymentMethod)(String(row.method)) }
            : null;
    }
    async create(input) {
        const now = new Date().toISOString();
        const created = {
            id: (0, mockDatabase_1.nextId)(),
            invoiceId: input.invoiceId,
            amount: input.amount,
            refundedAmount: 0,
            method: input.method,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            voidReason: null,
            idempotencyKey: input.idempotencyKey,
            idempotencyKeyClientSupplied: input.idempotencyKeyClientSupplied,
            createdBy: input.createdByUserId,
        };
        (0, mockDatabase_1.getMockDb)().payments.push(created);
        return { ...created };
    }
    async createPaymentAndUpdateInvoice(input, nextInvoiceStatus) {
        const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
        if (input.idempotencyKeyClientSupplied) {
            const existing = await this.findActivePaymentByIdempotencyKey(input.createdByUserId, input.idempotencyKey);
            if (existing) {
                if (existing.invoiceId !== input.invoiceId ||
                    Math.abs(existing.amount - input.amount) > 1e-9 ||
                    existing.method !== input.method) {
                    throw new errorHandler_1.ApiError(409, "Ключ идемпотентности уже использован с другими параметрами");
                }
                return existing;
            }
        }
        const inv = await this.findInvoiceByIdForPayment(input.invoiceId);
        if (!inv) {
            throw new errorHandler_1.ApiError(404, "Счёт не найден");
        }
        const paidSoFar = inv.paidAmount;
        const remaining = roundMoney(inv.total - paidSoFar);
        if (input.amount <= 0) {
            throw new errorHandler_1.ApiError(400, "Сумма оплаты должна быть больше нуля");
        }
        if (input.amount > remaining + 1e-6) {
            throw new errorHandler_1.ApiError(409, "Сумма оплаты превышает остаток");
        }
        const payment = await this.create(input);
        const newPaid = roundMoney(paidSoFar + input.amount);
        await this.updateInvoicePaymentState(input.invoiceId, newPaid, nextInvoiceStatus);
        return payment;
    }
    async delete(id, voidReason) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.payments.findIndex((row) => row.id === id && !row.deletedAt);
        if (idx < 0)
            return false;
        db.payments[idx] = {
            ...db.payments[idx],
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            voidReason,
        };
        return true;
    }
    async deletePaymentUpdateInvoiceWithOptionalCash(input) {
        const deleted = await this.delete(input.paymentId, input.voidReason);
        if (!deleted) {
            return { deleted: false };
        }
        const updated = await this.updateInvoicePaymentState(input.invoiceId, input.invoicePaidAmountAfterDelete, input.nextInvoiceStatus);
        if (!updated) {
            throw new errorHandler_1.ApiError(404, "Счёт не найден");
        }
        return { deleted: true };
    }
    async findInvoiceByIdForPayment(id) {
        const found = (0, mockDatabase_1.getMockDb)().invoices.find((row) => row.id === id && !row.deletedAt);
        if (!found)
            return null;
        return {
            id: found.id,
            status: found.status,
            total: found.total,
            paidAmount: found.paidAmount,
        };
    }
    async updateInvoicePaymentState(invoiceId, paidAmount, status) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.invoices.findIndex((row) => row.id === invoiceId && !row.deletedAt);
        if (idx < 0)
            return false;
        db.invoices[idx] = {
            ...db.invoices[idx],
            paidAmount,
            status,
            updatedAt: new Date().toISOString(),
        };
        return true;
    }
    async applyRefund(input) {
        const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
        const db = (0, mockDatabase_1.getMockDb)();
        const payment = db.payments.find((p) => p.id === input.paymentId && !p.deletedAt);
        if (!payment) {
            throw new errorHandler_1.ApiError(404, "Платёж не найден");
        }
        const refunded = payment.refundedAmount ?? 0;
        const remaining = roundMoney(payment.amount - refunded);
        if (remaining <= 0) {
            throw new errorHandler_1.ApiError(409, "Платёж уже возвращён");
        }
        if (input.refundAmount > remaining + 1e-9) {
            throw new errorHandler_1.ApiError(400, "Некорректная сумма возврата");
        }
        const invoice = db.invoices.find((i) => i.id === input.invoiceId && !i.deletedAt);
        if (!invoice) {
            throw new errorHandler_1.ApiError(404, "Счёт не найден");
        }
        payment.refundedAmount = roundMoney(refunded + input.refundAmount);
        payment.updatedAt = new Date().toISOString();
        if (payment.refundedAmount + 1e-6 >= payment.amount) {
            payment.deletedAt = new Date().toISOString();
            payment.voidReason = input.reason;
        }
        const newPaid = roundMoney(invoice.paidAmount - input.refundAmount);
        invoice.paidAmount = newPaid;
        invoice.status = input.newInvoiceStatus;
        invoice.updatedAt = new Date().toISOString();
        return { cashWrittenInRepo: false };
    }
}
exports.MockPaymentsRepository = MockPaymentsRepository;
