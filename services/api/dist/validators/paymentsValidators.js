"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRefundPayment = exports.validateCreatePayment = exports.validatePaymentIdParam = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const paymentsRepository_1 = require("../repositories/paymentsRepository");
const numbers_1 = require("../utils/numbers");
const PAYMENT_METHOD_SET = new Set(paymentsRepository_1.PAYMENT_METHODS);
const parsePositiveInteger = (value) => {
    const n = (0, numbers_1.parseNumericInput)(value);
    if (n === null)
        return null;
    const t = Math.trunc(n);
    if (t <= 0 || t !== n)
        return null;
    return t;
};
const parsePositiveNumber = (value) => {
    const n = (0, numbers_1.parseNumericInput)(value);
    if (n === null || n <= 0)
        return null;
    return n;
};
const validatePaymentIdParam = (req, _res, next) => {
    const parsedId = parsePositiveInteger(req.params.id);
    if (!parsedId) {
        throw new errorHandler_1.ApiError(400, "Параметр id должен быть положительным целым числом");
    }
    next();
};
exports.validatePaymentIdParam = validatePaymentIdParam;
const validateCreatePayment = (req, _res, next) => {
    if (req.body == null || typeof req.body !== "object") {
        req.body = {};
    }
    const body = req.body;
    const { invoiceId, amount, method } = body;
    const rawKey = body.idempotencyKey;
    if (!parsePositiveInteger(invoiceId)) {
        throw new errorHandler_1.ApiError(400, "Поле invoiceId должно быть положительным целым числом");
    }
    if (!parsePositiveNumber(amount)) {
        throw new errorHandler_1.ApiError(400, "Сумма оплаты должна быть больше нуля");
    }
    if (typeof method !== "string" || !PAYMENT_METHOD_SET.has(method)) {
        throw new errorHandler_1.ApiError(400, `Поле method должно быть одним из: ${paymentsRepository_1.PAYMENT_METHODS.join(", ")}`);
    }
    if (rawKey !== undefined && rawKey !== null) {
        if (typeof rawKey !== "string") {
            throw new errorHandler_1.ApiError(400, "Поле idempotencyKey должно быть строкой");
        }
        const trimmed = rawKey.trim();
        if (trimmed.length > 255) {
            throw new errorHandler_1.ApiError(400, "Поле idempotencyKey слишком длинное (макс. 255 символов)");
        }
        if (trimmed.length === 0) {
            delete body.idempotencyKey;
        }
        else {
            body.idempotencyKey = trimmed;
        }
    }
    next();
};
exports.validateCreatePayment = validateCreatePayment;
const validateRefundPayment = (req, _res, next) => {
    const { reason, amount } = req.body ?? {};
    if (typeof reason !== "string" || reason.trim().length < 3) {
        throw new errorHandler_1.ApiError(400, "Укажите причину возврата (не менее 3 символов)");
    }
    if (amount !== undefined && amount !== null && amount !== "") {
        const n = (0, numbers_1.parseNumericInput)(amount);
        if (n === null || n <= 0) {
            throw new errorHandler_1.ApiError(400, "Некорректная сумма возврата");
        }
    }
    next();
};
exports.validateRefundPayment = validateRefundPayment;
