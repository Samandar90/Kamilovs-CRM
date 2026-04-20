"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const env_1 = require("../config/env");
const errorHandler_1 = require("../middleware/errorHandler");
const node_crypto_1 = require("node:crypto");
const aiCacheService_1 = require("../ai/aiCacheService");
const numbers_1 = require("../utils/numbers");
const roundMoney = (value) => {
    const n = (0, numbers_1.parseNumericInput)(value);
    if (n === null) {
        throw new errorHandler_1.ApiError(400, "Некорректная денежная сумма");
    }
    return (0, numbers_1.roundMoney2)(n);
};
const deriveInvoiceStatusFromPayment = (currentStatus, total, paidAmount) => {
    if (currentStatus === "cancelled" || currentStatus === "refunded") {
        return currentStatus;
    }
    if (paidAmount === total) {
        return "paid";
    }
    if (paidAmount > 0 && paidAmount < total) {
        return "partially_paid";
    }
    if (paidAmount === 0) {
        if (currentStatus === "paid" || currentStatus === "partially_paid") {
            return "issued";
        }
        return currentStatus;
    }
    return currentStatus;
};
class PaymentsService {
    constructor(paymentsRepository, cashRegisterRepository) {
        this.paymentsRepository = paymentsRepository;
        this.cashRegisterRepository = cashRegisterRepository;
    }
    async list(_auth, filters = {}) {
        return this.paymentsRepository.findAll(filters);
    }
    async getById(_auth, id) {
        return this.paymentsRepository.findById(id);
    }
    async create(_auth, payload) {
        const amount = roundMoney(payload.amount);
        if (amount <= 0) {
            throw new errorHandler_1.ApiError(400, "Сумма оплаты должна быть больше нуля");
        }
        const clientSupplied = typeof payload.idempotencyKey === "string" &&
            payload.idempotencyKey.trim().length > 0;
        const resolvedIdempotencyKey = clientSupplied
            ? payload.idempotencyKey.trim()
            : (0, node_crypto_1.randomUUID)();
        if (clientSupplied) {
            const existing = await this.paymentsRepository.findActivePaymentByIdempotencyKey(_auth.userId, resolvedIdempotencyKey);
            if (existing) {
                if (existing.invoiceId !== payload.invoiceId ||
                    roundMoney(existing.amount) !== amount ||
                    existing.method !== payload.method) {
                    throw new errorHandler_1.ApiError(409, "Ключ идемпотентности уже использован с другими параметрами");
                }
                return existing;
            }
        }
        let activeShift = await this.cashRegisterRepository.findActiveShift();
        if (!activeShift && env_1.env.cashRegisterAutoOpenDev) {
            try {
                activeShift = await this.cashRegisterRepository.openShift({
                    openedBy: null,
                    openingBalance: 0,
                    notes: "Auto-opened (CASH_REGISTER_AUTO_OPEN_DEV=true)",
                });
            }
            catch {
                activeShift = await this.cashRegisterRepository.findActiveShift();
            }
        }
        if (!activeShift) {
            throw new errorHandler_1.ApiError(409, "Сначала откройте кассовую смену");
        }
        const invoice = await this.paymentsRepository.findInvoiceByIdForPayment(payload.invoiceId);
        if (!invoice) {
            throw new errorHandler_1.ApiError(404, "Счёт не найден");
        }
        if (invoice.status === "cancelled" || invoice.status === "refunded") {
            throw new errorHandler_1.ApiError(409, "Нельзя принять оплату по отменённому или возвращённому счёту");
        }
        if (invoice.status === "draft") {
            throw new errorHandler_1.ApiError(409, "Нельзя оплатить черновик — сначала выставьте счёт");
        }
        if (invoice.status === "paid") {
            throw new errorHandler_1.ApiError(409, "Счет уже оплачен");
        }
        const remaining = roundMoney(invoice.total - invoice.paidAmount);
        if (remaining <= 0) {
            throw new errorHandler_1.ApiError(409, "Счет уже оплачен");
        }
        if (amount > remaining) {
            throw new errorHandler_1.ApiError(409, "Сумма оплаты превышает остаток");
        }
        const paymentInput = {
            invoiceId: payload.invoiceId,
            amount,
            method: payload.method,
            idempotencyKey: resolvedIdempotencyKey,
            idempotencyKeyClientSupplied: clientSupplied,
            createdByUserId: _auth.userId,
        };
        const newPaidAmount = roundMoney(invoice.paidAmount + amount);
        const nextStatus = deriveInvoiceStatusFromPayment(invoice.status, invoice.total, newPaidAmount);
        const createdPayment = await this.paymentsRepository.createPaymentAndUpdateInvoice(paymentInput, nextStatus);
        await this.cashRegisterRepository.createCashRegisterEntry({
            shiftId: activeShift.id,
            paymentId: createdPayment.id,
            type: "payment",
            amount,
            method: payload.method,
            note: `Оплата по счёту #${invoice.id}`,
        });
        (0, aiCacheService_1.invalidateClinicFactsCache)();
        return createdPayment;
    }
    /**
     * Возврат оплаты (полный или частичный): учёт refunded_amount, пересчёт счёта, запись refund в кассе.
     */
    async refund(_auth, paymentId, payload) {
        const reason = payload.reason.trim();
        if (reason.length < 3) {
            throw new errorHandler_1.ApiError(400, "Укажите причину возврата (не менее 3 символов)");
        }
        const payment = await this.paymentsRepository.findById(paymentId);
        if (!payment) {
            throw new errorHandler_1.ApiError(404, "Платёж не найден");
        }
        const remainingRefundable = roundMoney(payment.amount - (payment.refundedAmount ?? 0));
        if (remainingRefundable <= 0) {
            throw new errorHandler_1.ApiError(409, "Платёж уже возвращён");
        }
        let refundAmount;
        if (payload.amount !== undefined && payload.amount !== null) {
            refundAmount = roundMoney(payload.amount);
            if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
                throw new errorHandler_1.ApiError(400, "Некорректная сумма возврата");
            }
            if (refundAmount > remainingRefundable + 1e-9) {
                throw new errorHandler_1.ApiError(400, "Некорректная сумма возврата");
            }
        }
        else {
            refundAmount = remainingRefundable;
        }
        let activeShift = await this.cashRegisterRepository.findActiveShift();
        if (!activeShift && env_1.env.cashRegisterAutoOpenDev) {
            try {
                activeShift = await this.cashRegisterRepository.openShift({
                    openedBy: null,
                    openingBalance: 0,
                    notes: "Auto-opened (CASH_REGISTER_AUTO_OPEN_DEV=true)",
                });
            }
            catch {
                activeShift = await this.cashRegisterRepository.findActiveShift();
            }
        }
        if (!activeShift) {
            throw new errorHandler_1.ApiError(409, "Сначала откройте кассовую смену");
        }
        const invoice = await this.paymentsRepository.findInvoiceByIdForPayment(payment.invoiceId);
        if (!invoice) {
            throw new errorHandler_1.ApiError(404, "Счёт не найден");
        }
        if (invoice.status === "cancelled" || invoice.status === "refunded") {
            throw new errorHandler_1.ApiError(409, "Невозможно выполнить возврат");
        }
        if (refundAmount > invoice.paidAmount + 1e-9) {
            throw new errorHandler_1.ApiError(400, "Некорректная сумма возврата");
        }
        const newPaidAmount = roundMoney(invoice.paidAmount - refundAmount);
        if (newPaidAmount < -1e-9) {
            throw new errorHandler_1.ApiError(400, "Некорректная сумма возврата");
        }
        const nextStatus = deriveInvoiceStatusFromPayment(invoice.status, invoice.total, newPaidAmount);
        const cashNote = `Возврат по оплате #${payment.id}: ${reason}`;
        const { cashWrittenInRepo } = await this.paymentsRepository.applyRefund({
            paymentId: payment.id,
            refundAmount,
            reason,
            invoiceId: invoice.id,
            newInvoiceStatus: nextStatus,
            shiftId: activeShift.id,
            method: payment.method,
            cashNote,
        });
        if (!cashWrittenInRepo) {
            await this.cashRegisterRepository.createCashRegisterEntry({
                shiftId: activeShift.id,
                paymentId: payment.id,
                type: "refund",
                amount: refundAmount,
                method: payment.method,
                note: cashNote,
            });
        }
        (0, aiCacheService_1.invalidateClinicFactsCache)();
    }
    async delete(_auth, id, voidReason) {
        const normalizedVoidReason = typeof voidReason === "string" && voidReason.trim() !== ""
            ? voidReason.trim()
            : null;
        const payment = await this.paymentsRepository.findById(id);
        if (!payment) {
            return false;
        }
        const invoice = await this.paymentsRepository.findInvoiceByIdForPayment(payment.invoiceId);
        if (!invoice) {
            throw new errorHandler_1.ApiError(404, "Счёт не найден");
        }
        const effectivePaid = roundMoney(payment.amount - (payment.refundedAmount ?? 0));
        const newPaidAmount = roundMoney(invoice.paidAmount - effectivePaid);
        if (newPaidAmount < 0) {
            throw new errorHandler_1.ApiError(409, "Нельзя аннулировать платёж: итоговая сумма оплат станет недопустимой");
        }
        const nextStatus = deriveInvoiceStatusFromPayment(invoice.status, invoice.total, newPaidAmount);
        const result = await this.paymentsRepository.deletePaymentUpdateInvoiceWithOptionalCash({
            paymentId: id,
            voidReason: normalizedVoidReason,
            invoiceId: invoice.id,
            nextInvoiceStatus: nextStatus,
            invoicePaidAmountAfterDelete: newPaidAmount,
        });
        if (!result.deleted) {
            return false;
        }
        if (effectivePaid > 1e-9) {
            const activeShift = await this.cashRegisterRepository.findActiveShift();
            if (activeShift) {
                await this.cashRegisterRepository.createCashRegisterEntry({
                    shiftId: activeShift.id,
                    paymentId: id,
                    type: "void",
                    amount: roundMoney(-effectivePaid),
                    method: payment.method,
                    note: `Аннулирование платежа #${payment.id}`,
                });
            }
            else {
                console.warn(`[payments] Аннулирование платежа #${id}: активная смена не открыта, кассовая сторно-запись не создана`);
            }
        }
        (0, aiCacheService_1.invalidateClinicFactsCache)();
        return true;
    }
}
exports.PaymentsService = PaymentsService;
