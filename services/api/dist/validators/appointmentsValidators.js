"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUpdateAppointmentPrice = exports.validateCancelAppointment = exports.validateUpdateAppointment = exports.validateCreateAppointment = exports.validateAppointmentIdParam = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const appointmentsRepository_1 = require("../repositories/appointmentsRepository");
const localDateTime_1 = require("../utils/localDateTime");
const appointmentTimestamps_1 = require("../utils/appointmentTimestamps");
const numbers_1 = require("../utils/numbers");
const APPOINTMENT_STATUS_SET = new Set(appointmentsRepository_1.APPOINTMENT_STATUSES);
const MAX_NOTES_LENGTH = 2000;
const MAX_DIAGNOSIS_LENGTH = 1000;
const MAX_TREATMENT_LENGTH = 2000;
const MAX_CANCEL_REASON_LENGTH = 1000;
const parsePositiveInteger = (value) => {
    const n = (0, numbers_1.parseNumericInput)(value);
    if (n === null)
        return null;
    const t = Math.trunc(n);
    if (t <= 0 || t !== n)
        return null;
    return t;
};
const isValidDateTime = (value) => {
    if (typeof value !== "string" || value.trim() === "") {
        return false;
    }
    return (0, appointmentTimestamps_1.tryParseAppointmentTimestampForDb)(value) !== null;
};
const ensureDateRangeIsValid = (startAt, endAt) => {
    const start = (0, localDateTime_1.parseLocalDateTime)(startAt);
    const end = (0, localDateTime_1.parseLocalDateTime)(endAt);
    if (!start || !end) {
        throw new errorHandler_1.ApiError(400, "Fields 'startAt' and 'endAt' must be in format YYYY-MM-DD HH:mm:ss");
    }
    if (end.getTime() <= start.getTime()) {
        throw new errorHandler_1.ApiError(400, "Field 'endAt' must be greater than 'startAt'");
    }
};
const validateOptionalNotes = (notes) => {
    if (notes === undefined || notes === null) {
        return;
    }
    if (typeof notes !== "string") {
        throw new errorHandler_1.ApiError(400, "Field 'notes' must be a string or null");
    }
    if (notes.trim().length > MAX_NOTES_LENGTH) {
        throw new errorHandler_1.ApiError(400, `Field 'notes' must be at most ${MAX_NOTES_LENGTH} characters`);
    }
};
const validateOptionalCancelReason = (cancelReason) => {
    if (cancelReason === undefined || cancelReason === null) {
        return;
    }
    if (typeof cancelReason !== "string") {
        throw new errorHandler_1.ApiError(400, "Field 'cancelReason' must be a string or null");
    }
    if (cancelReason.trim().length > MAX_CANCEL_REASON_LENGTH) {
        throw new errorHandler_1.ApiError(400, `Field 'cancelReason' must be at most ${MAX_CANCEL_REASON_LENGTH} characters`);
    }
};
const validateOptionalDiagnosis = (diagnosis) => {
    if (diagnosis === undefined || diagnosis === null) {
        return;
    }
    if (typeof diagnosis !== "string") {
        throw new errorHandler_1.ApiError(400, "Field 'diagnosis' must be a string or null");
    }
    if (diagnosis.trim().length > MAX_DIAGNOSIS_LENGTH) {
        throw new errorHandler_1.ApiError(400, `Field 'diagnosis' must be at most ${MAX_DIAGNOSIS_LENGTH} characters`);
    }
};
const validateOptionalTreatment = (treatment) => {
    if (treatment === undefined || treatment === null) {
        return;
    }
    if (typeof treatment !== "string") {
        throw new errorHandler_1.ApiError(400, "Field 'treatment' must be a string or null");
    }
    if (treatment.trim().length > MAX_TREATMENT_LENGTH) {
        throw new errorHandler_1.ApiError(400, `Field 'treatment' must be at most ${MAX_TREATMENT_LENGTH} characters`);
    }
};
const validateStatus = (status) => {
    if (typeof status !== "string" || !APPOINTMENT_STATUS_SET.has(status)) {
        throw new errorHandler_1.ApiError(400, `Field 'status' must be one of: ${appointmentsRepository_1.APPOINTMENT_STATUSES.join(", ")}`);
    }
};
const validateOptionalPrice = (price) => {
    if (price === undefined || price === null) {
        return;
    }
    const parsed = (0, numbers_1.parseNumericInput)(price);
    if (parsed === null || parsed < 0) {
        throw new errorHandler_1.ApiError(400, "Поле «цена» должно быть неотрицательным числом");
    }
};
const validateAppointmentIdParam = (req, _res, next) => {
    const parsedId = parsePositiveInteger(req.params.id);
    if (!parsedId) {
        throw new errorHandler_1.ApiError(400, "Path param 'id' must be a positive integer");
    }
    next();
};
exports.validateAppointmentIdParam = validateAppointmentIdParam;
const validateCreateAppointment = (req, _res, next) => {
    const { patientId, doctorId, serviceId, startAt, endAt, status, diagnosis, treatment, notes, price, } = req.body ?? {};
    if (!parsePositiveInteger(patientId)) {
        throw new errorHandler_1.ApiError(400, "Field 'patientId' must be a positive integer");
    }
    if (!parsePositiveInteger(doctorId)) {
        throw new errorHandler_1.ApiError(400, "Field 'doctorId' must be a positive integer");
    }
    if (!parsePositiveInteger(serviceId)) {
        throw new errorHandler_1.ApiError(400, "Field 'serviceId' must be a positive integer");
    }
    if (!isValidDateTime(startAt)) {
        throw new errorHandler_1.ApiError(400, "Field 'startAt' must be in format YYYY-MM-DD HH:mm:ss");
    }
    if (endAt !== undefined) {
        throw new errorHandler_1.ApiError(400, "Field 'endAt' is calculated automatically from service duration");
    }
    validateStatus(status);
    validateOptionalDiagnosis(diagnosis);
    validateOptionalTreatment(treatment);
    validateOptionalNotes(notes);
    validateOptionalPrice(price);
    next();
};
exports.validateCreateAppointment = validateCreateAppointment;
const validateUpdateAppointment = (req, _res, next) => {
    const { patientId, doctorId, serviceId, startAt, endAt, status, diagnosis, treatment, notes, } = req.body ?? {};
    if (patientId !== undefined && !parsePositiveInteger(patientId)) {
        throw new errorHandler_1.ApiError(400, "Field 'patientId' must be a positive integer");
    }
    if (doctorId !== undefined && !parsePositiveInteger(doctorId)) {
        throw new errorHandler_1.ApiError(400, "Field 'doctorId' must be a positive integer");
    }
    if (serviceId !== undefined && !parsePositiveInteger(serviceId)) {
        throw new errorHandler_1.ApiError(400, "Field 'serviceId' must be a positive integer");
    }
    if (startAt !== undefined && !isValidDateTime(startAt)) {
        throw new errorHandler_1.ApiError(400, "Field 'startAt' must be in format YYYY-MM-DD HH:mm:ss");
    }
    if (endAt !== undefined) {
        throw new errorHandler_1.ApiError(400, "Field 'endAt' is calculated automatically from service duration");
    }
    if (status !== undefined) {
        validateStatus(status);
    }
    validateOptionalDiagnosis(diagnosis);
    validateOptionalTreatment(treatment);
    validateOptionalNotes(notes);
    next();
};
exports.validateUpdateAppointment = validateUpdateAppointment;
const validateCancelAppointment = (req, _res, next) => {
    const { reason, cancelReason, ...rest } = req.body ?? {};
    if (Object.keys(rest).length > 0) {
        throw new errorHandler_1.ApiError(400, "Only field 'reason' is allowed");
    }
    if (reason !== undefined && cancelReason !== undefined) {
        throw new errorHandler_1.ApiError(400, "Use only one field: 'reason'");
    }
    validateOptionalCancelReason(reason ?? cancelReason);
    next();
};
exports.validateCancelAppointment = validateCancelAppointment;
const validateUpdateAppointmentPrice = (req, _res, next) => {
    const { price, ...rest } = req.body ?? {};
    if (Object.keys(rest).length > 0) {
        throw new errorHandler_1.ApiError(400, "Only field 'price' is allowed");
    }
    if (price === undefined) {
        throw new errorHandler_1.ApiError(400, "Field 'price' is required");
    }
    validateOptionalPrice(price);
    next();
};
exports.validateUpdateAppointmentPrice = validateUpdateAppointmentPrice;
