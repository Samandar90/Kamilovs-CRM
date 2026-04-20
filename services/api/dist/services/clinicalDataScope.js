"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDoctorScopedRole = isDoctorScopedRole;
exports.getEffectiveDoctorId = getEffectiveDoctorId;
exports.mergeAppointmentFiltersForUser = mergeAppointmentFiltersForUser;
exports.canReadAppointment = canReadAppointment;
exports.shouldRedactAppointmentClinicalFields = shouldRedactAppointmentClinicalFields;
exports.redactAppointmentClinicalFields = redactAppointmentClinicalFields;
exports.assertAppointmentClinicalWriteAllowed = assertAppointmentClinicalWriteAllowed;
const errorHandler_1 = require("../middleware/errorHandler");
const SCOPED_BY_DOCTOR_ROLES = ["doctor", "nurse"];
/** Roles that must not receive diagnosis / treatment / notes in API responses. */
const APPOINTMENT_CLINICAL_HIDDEN_ROLES = [
    "cashier",
    "accountant",
    "director",
    "operator",
];
/** Roles allowed to set diagnosis or treatment on appointments. */
const APPOINTMENT_CLINICAL_WRITE_ROLES = [
    "superadmin",
    "manager",
    "doctor",
    "nurse",
];
function isDoctorScopedRole(role) {
    return SCOPED_BY_DOCTOR_ROLES.includes(role);
}
/**
 * Врач: `users.doctor_id` → JWT `doctorId`.
 * Медсестра: `nurses.doctor_id` → JWT `nurseDoctorId`.
 */
function getEffectiveDoctorId(auth) {
    if (auth.role === "doctor") {
        if (auth.doctorId == null) {
            throw new errorHandler_1.ApiError(403, "Account is not linked to a doctor profile");
        }
        return auth.doctorId;
    }
    if (auth.role === "nurse") {
        if (auth.nurseDoctorId == null) {
            throw new errorHandler_1.ApiError(403, "Медсестра не привязана к врачу");
        }
        return auth.nurseDoctorId;
    }
    throw new errorHandler_1.ApiError(500, "getEffectiveDoctorId called for non-scoped role");
}
/** Merges query filters with mandatory doctor scope for clinical roles. */
function mergeAppointmentFiltersForUser(auth, filters) {
    if (!isDoctorScopedRole(auth.role)) {
        return { ...filters };
    }
    return { ...filters, doctorId: getEffectiveDoctorId(auth) };
}
/** Returns false if the caller must not see this appointment (use 404 at call site). */
function canReadAppointment(auth, appointment) {
    if (!isDoctorScopedRole(auth.role)) {
        return true;
    }
    return appointment.doctorId === getEffectiveDoctorId(auth);
}
function shouldRedactAppointmentClinicalFields(role) {
    return APPOINTMENT_CLINICAL_HIDDEN_ROLES.includes(role);
}
function redactAppointmentClinicalFields(appointment) {
    return {
        ...appointment,
        diagnosis: null,
        treatment: null,
        notes: null,
    };
}
function assertAppointmentClinicalWriteAllowed(auth, payload) {
    if (payload.diagnosis === undefined &&
        payload.treatment === undefined &&
        payload.notes === undefined) {
        return;
    }
    if (!APPOINTMENT_CLINICAL_WRITE_ROLES.includes(auth.role)) {
        throw new errorHandler_1.ApiError(403, "Недостаточно прав для изменения клинических полей записи (диагноз, лечение, примечания)");
    }
}
