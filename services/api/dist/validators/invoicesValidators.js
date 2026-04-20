"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUpdateInvoice = exports.validateCreateInvoice = exports.validateInvoiceIdParam = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const invoicesRepository_1 = require("../repositories/invoicesRepository");
const numbers_1 = require("../utils/numbers");
const INVOICE_STATUS_SET = new Set(invoicesRepository_1.INVOICE_STATUSES);
const parsePositiveInteger = (value) => {
    const n = (0, numbers_1.parseNumericInput)(value);
    if (n === null)
        return null;
    const t = Math.trunc(n);
    if (t <= 0 || t !== n)
        return null;
    return t;
};
const parseNonNegativeNumber = (value) => {
    const n = (0, numbers_1.parseNumericInput)(value);
    if (n === null || n < 0)
        return null;
    return n;
};
const validateStatus = (status) => {
    if (typeof status !== "string" || !INVOICE_STATUS_SET.has(status)) {
        throw new errorHandler_1.ApiError(400, `Field 'status' must be one of: ${invoicesRepository_1.INVOICE_STATUSES.join(", ")}`);
    }
};
/** Line items: serviceId + quantity required. unitPrice from client is ignored (server uses services.price). */
const validateItems = (items, requireNonEmpty) => {
    if (!Array.isArray(items)) {
        throw new errorHandler_1.ApiError(400, "Field 'items' must be an array");
    }
    if (requireNonEmpty && items.length === 0) {
        throw new errorHandler_1.ApiError(400, "Field 'items' must contain at least one item");
    }
    items.forEach((item, index) => {
        if (!item || typeof item !== "object") {
            throw new errorHandler_1.ApiError(400, `Item at index ${index} must be an object`);
        }
        const entry = item;
        if (!parsePositiveInteger(entry.serviceId)) {
            throw new errorHandler_1.ApiError(400, `Item at index ${index}: 'serviceId' must be a positive integer`);
        }
        /** Цена строки с UI игнорируется при расчёте, но если пришла — должна быть числом ≥ 0. */
        if ("unitPrice" in entry && entry.unitPrice !== undefined && entry.unitPrice !== null) {
            if (parseNonNegativeNumber(entry.unitPrice) === null) {
                throw new errorHandler_1.ApiError(400, `Item at index ${index}: 'unitPrice' must be a number >= 0`);
            }
        }
        if ("price" in entry && entry.price !== undefined && entry.price !== null) {
            if (parseNonNegativeNumber(entry.price) === null) {
                throw new errorHandler_1.ApiError(400, `Item at index ${index}: 'price' must be a number >= 0`);
            }
        }
        if (entry.description !== undefined &&
            entry.description !== null &&
            (typeof entry.description !== "string" || entry.description.trim() === "")) {
            throw new errorHandler_1.ApiError(400, `Item at index ${index}: when provided, 'description' must be a non-empty string`);
        }
        const quantity = parseNonNegativeNumber(entry.quantity);
        if (quantity === null || quantity <= 0) {
            throw new errorHandler_1.ApiError(400, `Item at index ${index}: 'quantity' must be greater than 0`);
        }
    });
};
const validateInvoiceIdParam = (req, _res, next) => {
    const parsedId = parsePositiveInteger(req.params.id);
    if (!parsedId) {
        throw new errorHandler_1.ApiError(400, "Path param 'id' must be a positive integer");
    }
    next();
};
exports.validateInvoiceIdParam = validateInvoiceIdParam;
const validateCreateInvoice = (req, _res, next) => {
    const { number, patientId, appointmentId, status, discount, paidAmount, items, } = req.body ?? {};
    if (number !== undefined && (typeof number !== "string" || number.trim() === "")) {
        throw new errorHandler_1.ApiError(400, "Field 'number' must be a non-empty string");
    }
    if (!parsePositiveInteger(patientId)) {
        throw new errorHandler_1.ApiError(400, "Field 'patientId' must be a positive integer");
    }
    if (!parsePositiveInteger(appointmentId)) {
        throw new errorHandler_1.ApiError(400, "Field 'appointmentId' is required and must be a positive integer");
    }
    if (status !== undefined) {
        validateStatus(status);
    }
    if (discount !== undefined && parseNonNegativeNumber(discount) === null) {
        throw new errorHandler_1.ApiError(400, "Field 'discount' must be greater than or equal to 0");
    }
    if (paidAmount !== undefined) {
        throw new errorHandler_1.ApiError(400, "Field 'paidAmount' is not accepted on create — use payments API");
    }
    validateItems(items, true);
    next();
};
exports.validateCreateInvoice = validateCreateInvoice;
const validateUpdateInvoice = (req, _res, next) => {
    const { number, patientId, appointmentId, status, discount, paidAmount, items, } = req.body ?? {};
    const hasAnyField = number !== undefined ||
        patientId !== undefined ||
        appointmentId !== undefined ||
        status !== undefined ||
        discount !== undefined ||
        paidAmount !== undefined ||
        items !== undefined;
    if (!hasAnyField) {
        throw new errorHandler_1.ApiError(400, "At least one field must be provided for update");
    }
    if (number !== undefined && (typeof number !== "string" || number.trim() === "")) {
        throw new errorHandler_1.ApiError(400, "Field 'number' must be a non-empty string");
    }
    if (patientId !== undefined && !parsePositiveInteger(patientId)) {
        throw new errorHandler_1.ApiError(400, "Field 'patientId' must be a positive integer");
    }
    if (appointmentId !== undefined && appointmentId !== null && !parsePositiveInteger(appointmentId)) {
        throw new errorHandler_1.ApiError(400, "Field 'appointmentId' must be a positive integer or null");
    }
    if (status !== undefined) {
        validateStatus(status);
    }
    if (discount !== undefined && parseNonNegativeNumber(discount) === null) {
        throw new errorHandler_1.ApiError(400, "Field 'discount' must be greater than or equal to 0");
    }
    if (paidAmount !== undefined) {
        throw new errorHandler_1.ApiError(400, "Field 'paidAmount' cannot be updated via invoices API — use payments");
    }
    if (items !== undefined) {
        validateItems(items, true);
    }
    next();
};
exports.validateUpdateInvoice = validateUpdateInvoice;
