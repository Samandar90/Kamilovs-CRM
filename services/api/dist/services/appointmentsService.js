"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppointmentsService = void 0;
const aiCacheService_1 = require("../ai/aiCacheService");
const permissions_1 = require("../auth/permissions");
const errorHandler_1 = require("../middleware/errorHandler");
const clinicalDataScope_1 = require("./clinicalDataScope");
const appointmentTimestamps_1 = require("../utils/appointmentTimestamps");
const localDateTime_1 = require("../utils/localDateTime");
const numbers_1 = require("../utils/numbers");
const ACTIVE_APPOINTMENT_STATUSES = new Set([
    "scheduled",
    "confirmed",
    "arrived",
    "in_consultation",
]);
const ALLOWED_STATUS_TRANSITIONS = {
    scheduled: ["confirmed", "arrived", "cancelled", "no_show"],
    confirmed: ["arrived", "in_consultation", "completed", "cancelled", "no_show"],
    arrived: ["in_consultation", "completed", "cancelled", "no_show"],
    in_consultation: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
    no_show: [],
};
const normalizeOptionalString = (value) => {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
};
const normalizeOptionalPrice = (value) => {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    const parsed = (0, numbers_1.parseNumericInput)(value);
    if (parsed === null || parsed < 0) {
        throw new errorHandler_1.ApiError(400, "Поле «цена» должно быть числом не меньше 0");
    }
    return Math.round(parsed);
};
const ensureRelatedEntitiesExist = async (appointmentsRepository, patientId, doctorId, serviceId, options) => {
    const [patientFound, doctorFound, serviceFound] = await Promise.all([
        appointmentsRepository.patientExists(patientId),
        appointmentsRepository.doctorExists(doctorId),
        appointmentsRepository.serviceExists(serviceId),
    ]);
    if (!patientFound) {
        throw new errorHandler_1.ApiError(404, "Patient not found");
    }
    if (!doctorFound) {
        throw new errorHandler_1.ApiError(404, "Doctor not found");
    }
    if (!serviceFound) {
        throw new errorHandler_1.ApiError(404, "Service not found");
    }
    if (options.requireActiveService) {
        const active = await appointmentsRepository.isServiceActive(serviceId);
        if (!active) {
            throw new errorHandler_1.ApiError(400, "Service is inactive or not available for booking");
        }
    }
    const serviceAssigned = await appointmentsRepository.isServiceAssignedToDoctor(serviceId, doctorId);
    if (!serviceAssigned) {
        throw new errorHandler_1.ApiError(400, "Selected service is not assigned to selected doctor");
    }
};
const ensureNoDoctorConflict = async (appointmentsRepository, doctorId, startAt, endAt, excludeAppointmentId) => {
    const hasConflict = await appointmentsRepository.findConflicting(doctorId, startAt, endAt, excludeAppointmentId);
    if (hasConflict) {
        throw new errorHandler_1.ApiError(409, "Doctor already has an appointment in this time slot");
    }
};
const ensureValidDateRange = (startAt, endAt) => {
    const start = (0, localDateTime_1.parseLocalDateTime)(startAt);
    const end = (0, localDateTime_1.parseLocalDateTime)(endAt);
    if (!start || !end || end.getTime() <= start.getTime()) {
        throw new errorHandler_1.ApiError(400, "Field 'endAt' must be greater than 'startAt'");
    }
};
const ensureStartAtNotInPast = (startAt) => {
    const start = (0, localDateTime_1.parseLocalDateTime)(startAt);
    if (!start) {
        throw new errorHandler_1.ApiError(400, "Field 'startAt' must be in format YYYY-MM-DD HH:mm:ss");
    }
    if (start.getTime() < Date.now()) {
        throw new errorHandler_1.ApiError(400, "Cannot create appointment in the past");
    }
};
const addMinutesToLocalDateTime = (localDateTime, durationMinutes) => {
    const start = (0, localDateTime_1.parseLocalDateTime)(localDateTime);
    if (!start) {
        throw new errorHandler_1.ApiError(400, "Field 'startAt' must be in format YYYY-MM-DD HH:mm:ss");
    }
    const end = new Date(start.getTime());
    end.setMinutes(end.getMinutes() + durationMinutes);
    return (0, localDateTime_1.formatLocalDateTime)(end);
};
const enforceDoctorSelfScopeOnWrite = (auth, doctorId) => {
    if (!(0, clinicalDataScope_1.isDoctorScopedRole)(auth.role)) {
        return;
    }
    if (doctorId !== (0, clinicalDataScope_1.getEffectiveDoctorId)(auth)) {
        throw new errorHandler_1.ApiError(403, "Можно работать только с записями своего врача");
    }
};
const ensureStatusTransitionAllowed = (currentStatus, nextStatus) => {
    if (currentStatus === nextStatus) {
        return;
    }
    const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[currentStatus];
    if (!allowedNextStatuses.includes(nextStatus)) {
        throw new errorHandler_1.ApiError(400, `Invalid status transition: '${currentStatus}' -> '${nextStatus}'`);
    }
};
const normalizeCreateInput = (payload) => {
    return {
        ...payload,
        price: normalizeOptionalPrice(payload.price),
        diagnosis: normalizeOptionalString(payload.diagnosis) ?? null,
        treatment: normalizeOptionalString(payload.treatment) ?? null,
        notes: normalizeOptionalString(payload.notes) ?? null,
    };
};
const normalizeUpdateInput = (payload) => {
    const normalized = { ...payload };
    if (payload.price !== undefined) {
        normalized.price = normalizeOptionalPrice(payload.price);
    }
    if (payload.diagnosis !== undefined) {
        normalized.diagnosis = normalizeOptionalString(payload.diagnosis);
    }
    if (payload.treatment !== undefined) {
        normalized.treatment = normalizeOptionalString(payload.treatment);
    }
    if (payload.notes !== undefined) {
        normalized.notes = normalizeOptionalString(payload.notes);
    }
    return normalized;
};
class AppointmentsService {
    constructor(appointmentsRepository) {
        this.appointmentsRepository = appointmentsRepository;
    }
    async list(auth, filters = {}) {
        const scoped = (0, clinicalDataScope_1.mergeAppointmentFiltersForUser)(auth, filters);
        const safeFilters = { ...scoped };
        const from = (0, appointmentTimestamps_1.assertOptionalAppointmentTimestampForDb)(scoped.startFrom, "startFrom");
        const rawUpper = scoped.startTo ?? scoped.endTo;
        const to = (0, appointmentTimestamps_1.assertOptionalAppointmentTimestampForDb)(rawUpper, "startTo");
        if (from != null) {
            safeFilters.startFrom = from;
        }
        else {
            delete safeFilters.startFrom;
        }
        if (to != null) {
            safeFilters.startTo = to;
        }
        else {
            delete safeFilters.startTo;
        }
        delete safeFilters.endTo;
        const rows = await this.appointmentsRepository.findAll(safeFilters);
        if (!(0, clinicalDataScope_1.shouldRedactAppointmentClinicalFields)(auth.role)) {
            return rows;
        }
        return rows.map(clinicalDataScope_1.redactAppointmentClinicalFields);
    }
    async getById(auth, id) {
        const row = await this.appointmentsRepository.findById(id);
        if (!row) {
            return null;
        }
        if (!(0, clinicalDataScope_1.canReadAppointment)(auth, row)) {
            return null;
        }
        if ((0, clinicalDataScope_1.shouldRedactAppointmentClinicalFields)(auth.role)) {
            return (0, clinicalDataScope_1.redactAppointmentClinicalFields)(row);
        }
        return row;
    }
    async create(auth, payload) {
        if (!(0, permissions_1.roleHasPermissionKey)(auth.role, "APPOINTMENT_CREATE")) {
            throw new errorHandler_1.ApiError(403, "Недостаточно прав для этого действия");
        }
        const normalizedPayload = normalizeCreateInput(payload);
        normalizedPayload.startAt = (0, appointmentTimestamps_1.assertAppointmentTimestampForDb)(normalizedPayload.startAt, "startAt");
        (0, clinicalDataScope_1.assertAppointmentClinicalWriteAllowed)(auth, {
            diagnosis: normalizedPayload.diagnosis ?? undefined,
            treatment: normalizedPayload.treatment ?? undefined,
            notes: normalizedPayload.notes ?? undefined,
        });
        enforceDoctorSelfScopeOnWrite(auth, normalizedPayload.doctorId);
        ensureStartAtNotInPast(normalizedPayload.startAt);
        await ensureRelatedEntitiesExist(this.appointmentsRepository, normalizedPayload.patientId, normalizedPayload.doctorId, normalizedPayload.serviceId, { requireActiveService: true });
        const duration = await this.appointmentsRepository.getServiceDuration(normalizedPayload.serviceId);
        if (!duration || duration <= 0) {
            throw new errorHandler_1.ApiError(400, "Service duration must be configured and greater than 0");
        }
        const computedEndAt = addMinutesToLocalDateTime(normalizedPayload.startAt, duration);
        ensureValidDateRange(normalizedPayload.startAt, computedEndAt);
        const servicePrice = await this.appointmentsRepository.getServicePrice(normalizedPayload.serviceId);
        if (servicePrice === null || servicePrice < 0) {
            throw new errorHandler_1.ApiError(400, "Service price is invalid");
        }
        const payloadToCreate = {
            ...normalizedPayload,
            price: normalizedPayload.price ?? Math.round(servicePrice),
            endAt: computedEndAt,
        };
        if (ACTIVE_APPOINTMENT_STATUSES.has(payloadToCreate.status)) {
            await ensureNoDoctorConflict(this.appointmentsRepository, payloadToCreate.doctorId, payloadToCreate.startAt, payloadToCreate.endAt);
        }
        const created = await this.appointmentsRepository.create(payloadToCreate);
        (0, aiCacheService_1.invalidateClinicFactsCache)();
        if ((0, clinicalDataScope_1.shouldRedactAppointmentClinicalFields)(auth.role)) {
            return (0, clinicalDataScope_1.redactAppointmentClinicalFields)(created);
        }
        return created;
    }
    async update(auth, id, payload) {
        const current = await this.appointmentsRepository.findById(id);
        if (!current) {
            return null;
        }
        if (!(0, clinicalDataScope_1.canReadAppointment)(auth, current)) {
            return null;
        }
        const normalizedPayload = normalizeUpdateInput(payload);
        if (normalizedPayload.startAt !== undefined) {
            normalizedPayload.startAt = (0, appointmentTimestamps_1.assertAppointmentTimestampForDb)(normalizedPayload.startAt, "startAt");
        }
        (0, clinicalDataScope_1.assertAppointmentClinicalWriteAllowed)(auth, {
            diagnosis: normalizedPayload.diagnosis,
            treatment: normalizedPayload.treatment,
            notes: normalizedPayload.notes,
        });
        const isClinicalStaff = (0, clinicalDataScope_1.isDoctorScopedRole)(auth.role);
        if (isClinicalStaff) {
            const schedulingKeys = [
                "patientId",
                "doctorId",
                "serviceId",
                "startAt",
                "price",
            ];
            for (const key of schedulingKeys) {
                if (normalizedPayload[key] === undefined)
                    continue;
                const nextVal = normalizedPayload[key];
                const curVal = current[key];
                if (nextVal !== curVal) {
                    throw new errorHandler_1.ApiError(403, "Нельзя менять пациента, врача, услугу, время или цену записи для этой роли");
                }
            }
        }
        else if (normalizedPayload.price !== undefined &&
            !(0, permissions_1.canSetAppointmentCommercialPrice)(auth.role)) {
            throw new errorHandler_1.ApiError(403, "Недостаточно прав для изменения цены записи");
        }
        if (Object.keys(normalizedPayload).length === 0) {
            throw new errorHandler_1.ApiError(400, "At least one field must be provided for update");
        }
        const mergedStatus = normalizedPayload.status ?? current.status;
        const mergedPatientId = normalizedPayload.patientId ?? current.patientId;
        const mergedDoctorId = normalizedPayload.doctorId ?? current.doctorId;
        enforceDoctorSelfScopeOnWrite(auth, mergedDoctorId);
        const mergedServiceId = normalizedPayload.serviceId ?? current.serviceId;
        const mergedStartAt = normalizedPayload.startAt ?? current.startAt;
        let mergedEndAt = current.endAt;
        const shouldRecalculateEndAt = normalizedPayload.startAt !== undefined || normalizedPayload.serviceId !== undefined;
        if (shouldRecalculateEndAt) {
            const duration = await this.appointmentsRepository.getServiceDuration(mergedServiceId);
            if (!duration || duration <= 0) {
                throw new errorHandler_1.ApiError(400, "Service duration must be configured and greater than 0");
            }
            const recalculatedEndAt = addMinutesToLocalDateTime(mergedStartAt, duration);
            ensureValidDateRange(mergedStartAt, recalculatedEndAt);
            normalizedPayload.endAt = recalculatedEndAt;
            mergedEndAt = recalculatedEndAt;
        }
        ensureValidDateRange(mergedStartAt, mergedEndAt);
        ensureStatusTransitionAllowed(current.status, mergedStatus);
        await ensureRelatedEntitiesExist(this.appointmentsRepository, mergedPatientId, mergedDoctorId, mergedServiceId, { requireActiveService: normalizedPayload.serviceId !== undefined });
        if (ACTIVE_APPOINTMENT_STATUSES.has(mergedStatus)) {
            await ensureNoDoctorConflict(this.appointmentsRepository, mergedDoctorId, mergedStartAt, mergedEndAt, id);
        }
        const updated = await this.appointmentsRepository.update(id, normalizedPayload);
        if (updated)
            (0, aiCacheService_1.invalidateClinicFactsCache)();
        if (!updated) {
            return null;
        }
        if ((0, clinicalDataScope_1.shouldRedactAppointmentClinicalFields)(auth.role)) {
            return (0, clinicalDataScope_1.redactAppointmentClinicalFields)(updated);
        }
        return updated;
    }
    async cancel(auth, id, cancelReason) {
        const current = await this.appointmentsRepository.findById(id);
        if (!current) {
            return null;
        }
        if (!(0, clinicalDataScope_1.canReadAppointment)(auth, current)) {
            return null;
        }
        if (current.status === "completed") {
            throw new errorHandler_1.ApiError(400, "Completed appointment cannot be cancelled");
        }
        if (current.status === "cancelled") {
            throw new errorHandler_1.ApiError(400, "Appointment already cancelled");
        }
        const cancelled = await this.appointmentsRepository.cancel(id, cancelReason ?? null, auth.userId);
        if (cancelled) {
            (0, aiCacheService_1.invalidateClinicFactsCache)();
        }
        if (!cancelled) {
            return null;
        }
        if ((0, clinicalDataScope_1.shouldRedactAppointmentClinicalFields)(auth.role)) {
            return (0, clinicalDataScope_1.redactAppointmentClinicalFields)(cancelled);
        }
        return cancelled;
    }
    async updatePrice(auth, id, price) {
        if (!(0, permissions_1.canSetAppointmentCommercialPrice)(auth.role)) {
            throw new errorHandler_1.ApiError(403, "Недостаточно прав для изменения цены записи");
        }
        const current = await this.appointmentsRepository.findById(id);
        if (!current) {
            return null;
        }
        if (!(0, clinicalDataScope_1.canReadAppointment)(auth, current)) {
            return null;
        }
        if (current.status === "cancelled") {
            throw new errorHandler_1.ApiError(400, "Нельзя менять цену у отмененной записи");
        }
        if (current.status === "completed") {
            throw new errorHandler_1.ApiError(400, "Нельзя менять цену у завершенной записи");
        }
        const normalizedPrice = normalizeOptionalPrice(price);
        if (normalizedPrice === null || normalizedPrice === undefined) {
            throw new errorHandler_1.ApiError(400, "Field 'price' must be a number greater than or equal to 0");
        }
        const updated = await this.appointmentsRepository.updatePrice(id, normalizedPrice);
        if (updated) {
            (0, aiCacheService_1.invalidateClinicFactsCache)();
        }
        if (!updated) {
            return null;
        }
        if ((0, clinicalDataScope_1.shouldRedactAppointmentClinicalFields)(auth.role)) {
            return (0, clinicalDataScope_1.redactAppointmentClinicalFields)(updated);
        }
        return updated;
    }
    async delete(auth, id) {
        const current = await this.appointmentsRepository.findById(id);
        if (!current) {
            return false;
        }
        if (!(0, clinicalDataScope_1.canReadAppointment)(auth, current)) {
            return false;
        }
        const ok = await this.appointmentsRepository.delete(id);
        if (ok)
            (0, aiCacheService_1.invalidateClinicFactsCache)();
        return ok;
    }
    /**
     * Проверка пересечения с активными записями врача для выбранного слота.
     * `date` — YYYY-MM-DD, `time` — HH:mm:ss (или HH:mm — нормализуйте на уровне контроллера).
     */
    async checkAvailability(auth, params) {
        enforceDoctorSelfScopeOnWrite(auth, params.doctorId);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
            throw new errorHandler_1.ApiError(400, "Query param 'date' must be YYYY-MM-DD");
        }
        const normalizedTime = params.time.length === 5 ? `${params.time}:00` : params.time;
        if (!/^\d{2}:\d{2}:\d{2}$/.test(normalizedTime)) {
            throw new errorHandler_1.ApiError(400, "Query param 'time' must be HH:mm or HH:mm:ss");
        }
        const startAtRaw = `${params.date} ${normalizedTime}`;
        const startAt = (0, appointmentTimestamps_1.tryParseAppointmentTimestampForDb)(startAtRaw);
        if (!startAt) {
            throw new errorHandler_1.ApiError(400, "Invalid date or time");
        }
        const doctorFound = await this.appointmentsRepository.doctorExists(params.doctorId);
        if (!doctorFound) {
            throw new errorHandler_1.ApiError(404, "Doctor not found");
        }
        const duration = await this.appointmentsRepository.getServiceDuration(params.serviceId);
        if (!duration || duration <= 0) {
            throw new errorHandler_1.ApiError(400, "Service duration must be configured and greater than 0");
        }
        const endAt = addMinutesToLocalDateTime(startAt, duration);
        ensureValidDateRange(startAt, endAt);
        const hasConflict = await this.appointmentsRepository.findConflicting(params.doctorId, startAt, endAt);
        return { available: !hasConflict };
    }
}
exports.AppointmentsService = AppointmentsService;
