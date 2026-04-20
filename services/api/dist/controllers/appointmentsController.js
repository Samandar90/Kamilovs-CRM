"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAppointmentController = exports.updateAppointmentPriceController = exports.cancelAppointmentController = exports.updateAppointmentController = exports.createAppointmentController = exports.getAppointmentByIdController = exports.listAppointmentsController = exports.checkAvailabilityController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const appointmentsRepository_1 = require("../repositories/appointmentsRepository");
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const numbers_1 = require("../utils/numbers");
const APPOINTMENT_STATUS_SET = new Set(appointmentsRepository_1.APPOINTMENT_STATUSES);
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
const checkAvailabilityController = async (req, res) => {
    const doctorId = parsePositiveQueryId(req.query.doctorId, "doctorId");
    const serviceId = parsePositiveQueryId(req.query.serviceId, "serviceId");
    const date = typeof req.query.date === "string" ? req.query.date.trim() : "";
    const timeRaw = typeof req.query.time === "string" ? req.query.time.trim() : "";
    if (doctorId === undefined) {
        throw new errorHandler_1.ApiError(400, "Query param 'doctorId' is required");
    }
    if (serviceId === undefined) {
        throw new errorHandler_1.ApiError(400, "Query param 'serviceId' is required");
    }
    if (!date || !timeRaw) {
        throw new errorHandler_1.ApiError(400, "Query params 'date' and 'time' are required");
    }
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const result = await container_1.services.appointments.checkAvailability(auth, {
        doctorId,
        serviceId,
        date,
        time: timeRaw,
    });
    return res.status(200).json(result);
};
exports.checkAvailabilityController = checkAvailabilityController;
const listAppointmentsController = async (req, res) => {
    const patientId = parsePositiveQueryId(req.query.patientId, "patientId");
    const doctorId = parsePositiveQueryId(req.query.doctorId, "doctorId");
    const serviceId = parsePositiveQueryId(req.query.serviceId, "serviceId");
    const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    if (rawStatus !== undefined && !APPOINTMENT_STATUS_SET.has(rawStatus)) {
        throw new errorHandler_1.ApiError(400, `Query param 'status' must be one of: ${appointmentsRepository_1.APPOINTMENT_STATUSES.join(", ")}`);
    }
    const status = rawStatus;
    const startFromRaw = typeof req.query.startFrom === "string" ? req.query.startFrom.trim() : undefined;
    const startToRaw = typeof req.query.startTo === "string" ? req.query.startTo.trim() : undefined;
    const endToRaw = typeof req.query.endTo === "string" ? req.query.endTo.trim() : undefined;
    const startFrom = startFromRaw === "" ? undefined : startFromRaw;
    const startTo = startToRaw === "" ? undefined : startToRaw;
    const endTo = endToRaw === "" ? undefined : endToRaw;
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const appointments = await container_1.services.appointments.list(auth, {
        patientId,
        doctorId,
        serviceId,
        status,
        startFrom,
        startTo,
        endTo,
    });
    return res.status(200).json(appointments);
};
exports.listAppointmentsController = listAppointmentsController;
const getAppointmentByIdController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const appointment = await container_1.services.appointments.getById(auth, id);
    if (!appointment) {
        throw new errorHandler_1.ApiError(404, "Appointment not found");
    }
    return res.status(200).json(appointment);
};
exports.getAppointmentByIdController = getAppointmentByIdController;
const createAppointmentController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const created = await container_1.services.appointments.create(auth, req.body);
    return res.status(201).json(created);
};
exports.createAppointmentController = createAppointmentController;
const updateAppointmentController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const updated = await container_1.services.appointments.update(auth, id, req.body);
    if (!updated) {
        throw new errorHandler_1.ApiError(404, "Appointment not found");
    }
    return res.status(200).json(updated);
};
exports.updateAppointmentController = updateAppointmentController;
const cancelAppointmentController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const reason = typeof req.body?.reason === "string"
        ? req.body.reason
        : typeof req.body?.cancelReason === "string"
            ? req.body.cancelReason
            : undefined;
    const updated = await container_1.services.appointments.cancel(auth, id, reason);
    if (!updated) {
        throw new errorHandler_1.ApiError(404, "Appointment not found");
    }
    return res.status(200).json(updated);
};
exports.cancelAppointmentController = cancelAppointmentController;
const updateAppointmentPriceController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const price = Math.round((0, numbers_1.parseRequiredMoney)(req.body?.price, "price"));
    const updated = await container_1.services.appointments.updatePrice(auth, id, price);
    if (!updated) {
        throw new errorHandler_1.ApiError(404, "Appointment not found");
    }
    return res.status(200).json(updated);
};
exports.updateAppointmentPriceController = updateAppointmentPriceController;
const deleteAppointmentController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const deleted = await container_1.services.appointments.delete(auth, id);
    if (!deleted) {
        throw new errorHandler_1.ApiError(404, "Appointment not found");
    }
    // Project API style returns JSON bodies for delete actions.
    return res.status(200).json({
        success: true,
        deleted: true,
        id,
    });
};
exports.deleteAppointmentController = deleteAppointmentController;
