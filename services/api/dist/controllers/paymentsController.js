"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundPaymentController = exports.deletePaymentController = exports.createPaymentController = exports.getPaymentByIdController = exports.listPaymentsController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const paymentsRepository_1 = require("../repositories/paymentsRepository");
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const PAYMENT_METHOD_SET = new Set(paymentsRepository_1.PAYMENT_METHODS);
const parsePositiveQueryId = (value, fieldName) => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new errorHandler_1.ApiError(400, `Query param '${fieldName}' must be a positive integer`);
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new errorHandler_1.ApiError(400, `Query param '${fieldName}' must be a positive integer`);
    }
    return parsed;
};
const listPaymentsController = async (req, res) => {
    const invoiceId = parsePositiveQueryId(req.query.invoiceId, "invoiceId");
    const rawMethod = typeof req.query.method === "string" ? req.query.method : undefined;
    if (rawMethod !== undefined && !PAYMENT_METHOD_SET.has(rawMethod)) {
        throw new errorHandler_1.ApiError(400, `Query param 'method' must be one of: ${paymentsRepository_1.PAYMENT_METHODS.join(", ")}`);
    }
    const method = rawMethod;
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const payments = await container_1.services.payments.list(auth, {
        invoiceId,
        method,
    });
    return res.status(200).json(payments);
};
exports.listPaymentsController = listPaymentsController;
const getPaymentByIdController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const payment = await container_1.services.payments.getById(auth, id);
    if (!payment) {
        throw new errorHandler_1.ApiError(404, "Payment not found");
    }
    return res.status(200).json(payment);
};
exports.getPaymentByIdController = getPaymentByIdController;
const createPaymentController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const created = await container_1.services.payments.create(auth, req.body);
    return res.status(201).json(created);
};
exports.createPaymentController = createPaymentController;
const deletePaymentController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const voidReason = typeof req.body?.voidReason === "string" ? req.body.voidReason : undefined;
    const deleted = await container_1.services.payments.delete(auth, id, voidReason);
    if (!deleted) {
        throw new errorHandler_1.ApiError(404, "Платёж не найден");
    }
    return res.status(200).json({
        success: true,
        deleted: true,
        id,
    });
};
exports.deletePaymentController = deletePaymentController;
const refundPaymentController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
    const rawAmount = req.body?.amount;
    const parsedAmount = rawAmount !== undefined && rawAmount !== null && rawAmount !== ""
        ? Number(rawAmount)
        : undefined;
    await container_1.services.payments.refund(auth, id, {
        reason,
        amount: parsedAmount !== undefined && Number.isFinite(parsedAmount) ? parsedAmount : undefined,
    });
    return res.status(200).json({ success: true, id });
};
exports.refundPaymentController = refundPaymentController;
