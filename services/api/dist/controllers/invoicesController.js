"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteInvoiceController = exports.updateInvoiceController = exports.createInvoiceController = exports.getInvoiceByIdController = exports.listInvoicesController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const invoicesRepository_1 = require("../repositories/invoicesRepository");
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const INVOICE_STATUS_SET = new Set(invoicesRepository_1.INVOICE_STATUSES);
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
const listInvoicesController = async (req, res) => {
    const patientId = parsePositiveQueryId(req.query.patientId, "patientId");
    const appointmentId = parsePositiveQueryId(req.query.appointmentId, "appointmentId");
    const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    if (rawStatus !== undefined && !INVOICE_STATUS_SET.has(rawStatus)) {
        throw new errorHandler_1.ApiError(400, `Query param 'status' must be one of: ${invoicesRepository_1.INVOICE_STATUSES.join(", ")}`);
    }
    const status = rawStatus;
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const invoices = await container_1.services.invoices.list(auth, {
        patientId,
        appointmentId,
        status,
    });
    return res.status(200).json(invoices);
};
exports.listInvoicesController = listInvoicesController;
const getInvoiceByIdController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const invoice = await container_1.services.invoices.getById(auth, id);
    if (!invoice) {
        throw new errorHandler_1.ApiError(404, "Invoice not found");
    }
    return res.status(200).json(invoice);
};
exports.getInvoiceByIdController = getInvoiceByIdController;
const createInvoiceController = async (req, res) => {
    // eslint-disable-next-line no-console
    console.log("CREATE INVOICE BODY:", JSON.stringify(req.body, null, 2));
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const created = await container_1.services.invoices.create(auth, req.body);
    return res.status(201).json(created);
};
exports.createInvoiceController = createInvoiceController;
const updateInvoiceController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const updated = await container_1.services.invoices.update(auth, id, req.body);
    if (!updated) {
        throw new errorHandler_1.ApiError(404, "Invoice not found");
    }
    return res.status(200).json(updated);
};
exports.updateInvoiceController = updateInvoiceController;
const deleteInvoiceController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const deleted = await container_1.services.invoices.delete(auth, id);
    if (!deleted) {
        throw new errorHandler_1.ApiError(404, "Invoice not found");
    }
    return res.status(200).json({
        success: true,
        deleted: true,
        id,
    });
};
exports.deleteInvoiceController = deleteInvoiceController;
