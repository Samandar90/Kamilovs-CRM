"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CASH_ENTRY_METHODS = exports.CASH_ENTRY_TYPES = exports.PAYMENT_METHODS = exports.INVOICE_STATUSES = void 0;
exports.normalizePaymentMethod = normalizePaymentMethod;
exports.INVOICE_STATUSES = [
    "draft",
    "issued",
    "partially_paid",
    "paid",
    "cancelled",
    "refunded",
];
exports.PAYMENT_METHODS = ["cash", "card"];
/** Для ответов API: всё кроме cash считается «Терминал» (в т.ч. бывший bank_transfer / безнал). */
function normalizePaymentMethod(raw) {
    return raw === "cash" ? "cash" : "card";
}
exports.CASH_ENTRY_TYPES = [
    "payment",
    "refund",
    "manual_in",
    "manual_out",
    /** Сторно аннулирования платежа (отрицательная сумма уменьшает чистый приход смены). */
    "void",
];
exports.CASH_ENTRY_METHODS = ["cash", "card"];
