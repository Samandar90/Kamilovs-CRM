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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvc2VydmljZXMvYXBwb2ludG1lbnRzU2VydmljZS50cyIsInNvdXJjZXMiOlsiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvc2VydmljZXMvYXBwb2ludG1lbnRzU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFXQSx5REFBa0U7QUFDbEUscURBQTZGO0FBQzdGLDZEQUFzRDtBQUN0RCwyREFRNkI7QUFDN0IsMEVBSXdDO0FBQ3hDLDBEQUdnQztBQUNoQyw4Q0FBcUQ7QUFFckQsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsQ0FBb0I7SUFDN0QsV0FBVztJQUNYLFdBQVc7SUFDWCxTQUFTO0lBQ1QsaUJBQWlCO0NBQ2xCLENBQUMsQ0FBQztBQUVILE1BQU0sMEJBQTBCLEdBQW1EO0lBQ2pGLFNBQVMsRUFBRSxDQUFDLFdBQVcsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFNBQVMsQ0FBQztJQUMzRCxTQUFTLEVBQUUsQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxTQUFTLENBQUM7SUFDOUUsT0FBTyxFQUFFLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxTQUFTLENBQUM7SUFDakUsZUFBZSxFQUFFLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQztJQUMzQyxTQUFTLEVBQUUsRUFBRTtJQUNiLFNBQVMsRUFBRSxFQUFFO0lBQ2IsT0FBTyxFQUFFLEVBQUU7Q0FDWixDQUFDO0FBRUYsTUFBTSx1QkFBdUIsR0FBRyxDQUM5QixLQUFjLEVBQ2EsRUFBRTtJQUM3QixJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUN4QixPQUFPLFNBQVMsQ0FBQztJQUNuQixDQUFDO0lBQ0QsSUFBSSxLQUFLLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDbkIsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQ0QsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM5QixPQUFPLFNBQVMsQ0FBQztJQUNuQixDQUFDO0lBRUQsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzdCLE9BQU8sT0FBTyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7QUFDekMsQ0FBQyxDQUFDO0FBRUYsTUFBTSxzQkFBc0IsR0FBRyxDQUM3QixLQUFjLEVBQ2EsRUFBRTtJQUM3QixJQUFJLEtBQUssS0FBSyxTQUFTO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFDMUMsSUFBSSxLQUFLLEtBQUssSUFBSTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ2hDLE1BQU0sTUFBTSxHQUFHLElBQUEsMkJBQWlCLEVBQUMsS0FBSyxDQUFDLENBQUM7SUFDeEMsSUFBSSxNQUFNLEtBQUssSUFBSSxJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsQyxNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsNENBQTRDLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzVCLENBQUMsQ0FBQztBQUVGLE1BQU0sMEJBQTBCLEdBQUcsS0FBSyxFQUN0QyxzQkFBK0MsRUFDL0MsU0FBaUIsRUFDakIsUUFBZ0IsRUFDaEIsU0FBaUIsRUFDakIsT0FBMEMsRUFDM0IsRUFBRTtJQUNqQixNQUFNLENBQUMsWUFBWSxFQUFFLFdBQVcsRUFBRSxZQUFZLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUM7UUFDbEUsc0JBQXNCLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQztRQUMvQyxzQkFBc0IsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDO1FBQzdDLHNCQUFzQixDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUM7S0FDaEQsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ2xCLE1BQU0sSUFBSSx1QkFBUSxDQUFDLEdBQUcsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFDRCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDakIsTUFBTSxJQUFJLHVCQUFRLENBQUMsR0FBRyxFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUNELElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQixNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRUQsSUFBSSxPQUFPLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUNqQyxNQUFNLE1BQU0sR0FBRyxNQUFNLHNCQUFzQixDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN2RSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDWixNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsa0RBQWtELENBQUMsQ0FBQztRQUM5RSxDQUFDO0lBQ0gsQ0FBQztJQUVELE1BQU0sZUFBZSxHQUFHLE1BQU0sc0JBQXNCLENBQUMseUJBQXlCLENBQzVFLFNBQVMsRUFDVCxRQUFRLENBQ1QsQ0FBQztJQUNGLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUNyQixNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUscURBQXFELENBQUMsQ0FBQztJQUNqRixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxzQkFBc0IsR0FBRyxLQUFLLEVBQ2xDLHNCQUErQyxFQUMvQyxRQUFnQixFQUNoQixPQUFlLEVBQ2YsS0FBYSxFQUNiLG9CQUE2QixFQUNkLEVBQUU7SUFDakIsTUFBTSxXQUFXLEdBQUcsTUFBTSxzQkFBc0IsQ0FBQyxlQUFlLENBQzlELFFBQVEsRUFDUixPQUFPLEVBQ1AsS0FBSyxFQUNMLG9CQUFvQixDQUNyQixDQUFDO0lBRUYsSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUNoQixNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUscURBQXFELENBQUMsQ0FBQztJQUNqRixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLE9BQWUsRUFBRSxLQUFhLEVBQVEsRUFBRTtJQUNwRSxNQUFNLEtBQUssR0FBRyxJQUFBLGtDQUFrQixFQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFDLE1BQU0sR0FBRyxHQUFHLElBQUEsa0NBQWtCLEVBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsT0FBTyxFQUFFLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7UUFDdkQsTUFBTSxJQUFJLHVCQUFRLENBQUMsR0FBRyxFQUFFLDhDQUE4QyxDQUFDLENBQUM7SUFDMUUsQ0FBQztBQUNILENBQUMsQ0FBQztBQUVGLE1BQU0sc0JBQXNCLEdBQUcsQ0FBQyxPQUFlLEVBQVEsRUFBRTtJQUN2RCxNQUFNLEtBQUssR0FBRyxJQUFBLGtDQUFrQixFQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNYLE1BQU0sSUFBSSx1QkFBUSxDQUFDLEdBQUcsRUFBRSx1REFBdUQsQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUFDRCxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztRQUNqQyxNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztJQUNuRSxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBR0YsTUFBTSx5QkFBeUIsR0FBRyxDQUNoQyxhQUFxQixFQUNyQixlQUF1QixFQUNmLEVBQUU7SUFDVixNQUFNLEtBQUssR0FBRyxJQUFBLGtDQUFrQixFQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ2hELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNYLE1BQU0sSUFBSSx1QkFBUSxDQUFDLEdBQUcsRUFBRSx1REFBdUQsQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUFDRCxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUN0QyxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsR0FBRyxlQUFlLENBQUMsQ0FBQztJQUNuRCxPQUFPLElBQUEsbUNBQW1CLEVBQUMsR0FBRyxDQUFDLENBQUM7QUFDbEMsQ0FBQyxDQUFDO0FBRUYsTUFBTSw2QkFBNkIsR0FBRyxDQUNwQyxJQUFzQixFQUN0QixRQUFnQixFQUNWLEVBQUU7SUFDUixJQUFJLENBQUMsSUFBQSxzQ0FBa0IsRUFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUNuQyxPQUFPO0lBQ1QsQ0FBQztJQUNELElBQUksUUFBUSxLQUFLLElBQUEsd0NBQW9CLEVBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUM1QyxNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsK0NBQStDLENBQUMsQ0FBQztJQUMzRSxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSw2QkFBNkIsR0FBRyxDQUNwQyxhQUFnQyxFQUNoQyxVQUE2QixFQUN2QixFQUFFO0lBQ1IsSUFBSSxhQUFhLEtBQUssVUFBVSxFQUFFLENBQUM7UUFDakMsT0FBTztJQUNULENBQUM7SUFFRCxNQUFNLG1CQUFtQixHQUFHLDBCQUEwQixDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3RFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztRQUM5QyxNQUFNLElBQUksdUJBQVEsQ0FDaEIsR0FBRyxFQUNILCtCQUErQixhQUFhLFNBQVMsVUFBVSxHQUFHLENBQ25FLENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxvQkFBb0IsR0FBRyxDQUMzQixPQUErQixFQUNQLEVBQUU7SUFDMUIsT0FBTztRQUNMLEdBQUcsT0FBTztRQUNWLEtBQUssRUFBRSxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQzVDLFNBQVMsRUFBRSx1QkFBdUIsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLElBQUksSUFBSTtRQUM3RCxTQUFTLEVBQUUsdUJBQXVCLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLElBQUk7UUFDN0QsS0FBSyxFQUFFLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJO0tBQ3RELENBQUM7QUFDSixDQUFDLENBQUM7QUFFRixNQUFNLG9CQUFvQixHQUFHLENBQzNCLE9BQStCLEVBQ1AsRUFBRTtJQUMxQixNQUFNLFVBQVUsR0FBMkIsRUFBRSxHQUFHLE9BQU8sRUFBRSxDQUFDO0lBQzFELElBQUksT0FBTyxDQUFDLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUNoQyxVQUFVLENBQUMsS0FBSyxHQUFHLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBQ0QsSUFBSSxPQUFPLENBQUMsU0FBUyxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ3BDLFVBQVUsQ0FBQyxTQUFTLEdBQUcsdUJBQXVCLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFDRCxJQUFJLE9BQU8sQ0FBQyxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDcEMsVUFBVSxDQUFDLFNBQVMsR0FBRyx1QkFBdUIsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQUNELElBQUksT0FBTyxDQUFDLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUNoQyxVQUFVLENBQUMsS0FBSyxHQUFHLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBQ0QsT0FBTyxVQUFVLENBQUM7QUFDcEIsQ0FBQyxDQUFDO0FBRUYsTUFBYSxtQkFBbUI7SUFDOUIsWUFBNkIsc0JBQStDO1FBQS9DLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBeUI7SUFBRyxDQUFDO0lBRWhGLEtBQUssQ0FBQyxJQUFJLENBQ1IsSUFBc0IsRUFDdEIsVUFBOEIsRUFBRTtRQUVoQyxNQUFNLE1BQU0sR0FBRyxJQUFBLGtEQUE4QixFQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM3RCxNQUFNLFdBQVcsR0FBdUIsRUFBRSxHQUFHLE1BQU0sRUFBRSxDQUFDO1FBQ3RELE1BQU0sSUFBSSxHQUFHLElBQUEsK0RBQXVDLEVBQ2xELE1BQU0sQ0FBQyxTQUFTLEVBQ2hCLFdBQVcsQ0FDWixDQUFDO1FBQ0YsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ2hELE1BQU0sRUFBRSxHQUFHLElBQUEsK0RBQXVDLEVBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3hFLElBQUksSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ2pCLFdBQVcsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQy9CLENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxXQUFXLENBQUMsU0FBUyxDQUFDO1FBQy9CLENBQUM7UUFDRCxJQUFJLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNmLFdBQVcsQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQzNCLENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxXQUFXLENBQUMsT0FBTyxDQUFDO1FBQzdCLENBQUM7UUFDRCxPQUFPLFdBQVcsQ0FBQyxLQUFLLENBQUM7UUFFekIsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3BFLElBQUksQ0FBQyxJQUFBLHlEQUFxQyxFQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3RELE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxtREFBK0IsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLElBQXNCLEVBQUUsRUFBVTtRQUM5QyxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ1QsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxDQUFDLElBQUEsc0NBQWtCLEVBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbkMsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxJQUFBLHlEQUFxQyxFQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3JELE9BQU8sSUFBQSxtREFBK0IsRUFBQyxHQUFHLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUM7SUFDYixDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQU0sQ0FDVixJQUFzQixFQUN0QixPQUErQjtRQUUvQixJQUFJLENBQUMsSUFBQSxrQ0FBb0IsRUFBQyxJQUFJLENBQUMsSUFBSSxFQUFFLG9CQUFvQixDQUFDLEVBQUUsQ0FBQztZQUMzRCxNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsc0NBQXNDLENBQUMsQ0FBQztRQUNsRSxDQUFDO1FBQ0QsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN4RCxpQkFBaUIsQ0FBQyxPQUFPLEdBQUcsSUFBQSx1REFBK0IsRUFDekQsaUJBQWlCLENBQUMsT0FBTyxFQUN6QixTQUFTLENBQ1YsQ0FBQztRQUNGLElBQUEseURBQXFDLEVBQUMsSUFBSSxFQUFFO1lBQzFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxTQUFTLElBQUksU0FBUztZQUNuRCxTQUFTLEVBQUUsaUJBQWlCLENBQUMsU0FBUyxJQUFJLFNBQVM7WUFDbkQsS0FBSyxFQUFFLGlCQUFpQixDQUFDLEtBQUssSUFBSSxTQUFTO1NBQzVDLENBQUMsQ0FBQztRQUNILDZCQUE2QixDQUFDLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNoRSxzQkFBc0IsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVsRCxNQUFNLDBCQUEwQixDQUM5QixJQUFJLENBQUMsc0JBQXNCLEVBQzNCLGlCQUFpQixDQUFDLFNBQVMsRUFDM0IsaUJBQWlCLENBQUMsUUFBUSxFQUMxQixpQkFBaUIsQ0FBQyxTQUFTLEVBQzNCLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLENBQy9CLENBQUM7UUFFRixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxrQkFBa0IsQ0FDbkUsaUJBQWlCLENBQUMsU0FBUyxDQUM1QixDQUFDO1FBQ0YsSUFBSSxDQUFDLFFBQVEsSUFBSSxRQUFRLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDL0IsTUFBTSxJQUFJLHVCQUFRLENBQUMsR0FBRyxFQUFFLHdEQUF3RCxDQUFDLENBQUM7UUFDcEYsQ0FBQztRQUNELE1BQU0sYUFBYSxHQUFHLHlCQUF5QixDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNyRixvQkFBb0IsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDL0QsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsZUFBZSxDQUNwRSxpQkFBaUIsQ0FBQyxTQUFTLENBQzVCLENBQUM7UUFDRixJQUFJLFlBQVksS0FBSyxJQUFJLElBQUksWUFBWSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzlDLE1BQU0sSUFBSSx1QkFBUSxDQUFDLEdBQUcsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFFRCxNQUFNLGVBQWUsR0FBMkI7WUFDOUMsR0FBRyxpQkFBaUI7WUFDcEIsS0FBSyxFQUFFLGlCQUFpQixDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQztZQUMxRCxLQUFLLEVBQUUsYUFBYTtTQUNyQixDQUFDO1FBRUYsSUFBSSwyQkFBMkIsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDNUQsTUFBTSxzQkFBc0IsQ0FDMUIsSUFBSSxDQUFDLHNCQUFzQixFQUMzQixlQUFlLENBQUMsUUFBUSxFQUN4QixlQUFlLENBQUMsT0FBTyxFQUN2QixlQUFlLENBQUMsS0FBSyxDQUN0QixDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUMxRSxJQUFBLDJDQUEwQixHQUFFLENBQUM7UUFDN0IsSUFBSSxJQUFBLHlEQUFxQyxFQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3JELE9BQU8sSUFBQSxtREFBK0IsRUFBQyxPQUFPLENBQUMsQ0FBQztRQUNsRCxDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQ1YsSUFBc0IsRUFDdEIsRUFBVSxFQUNWLE9BQStCO1FBRS9CLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFDRCxJQUFJLENBQUMsSUFBQSxzQ0FBa0IsRUFBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN2QyxPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFFRCxNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3hELElBQUksaUJBQWlCLENBQUMsT0FBTyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQzVDLGlCQUFpQixDQUFDLE9BQU8sR0FBRyxJQUFBLHVEQUErQixFQUN6RCxpQkFBaUIsQ0FBQyxPQUFPLEVBQ3pCLFNBQVMsQ0FDVixDQUFDO1FBQ0osQ0FBQztRQUNELElBQUEseURBQXFDLEVBQUMsSUFBSSxFQUFFO1lBQzFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxTQUFTO1lBQ3RDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxTQUFTO1lBQ3RDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxLQUFLO1NBQy9CLENBQUMsQ0FBQztRQUVILE1BQU0sZUFBZSxHQUFHLElBQUEsc0NBQWtCLEVBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RELElBQUksZUFBZSxFQUFFLENBQUM7WUFDcEIsTUFBTSxjQUFjLEdBQXFDO2dCQUN2RCxXQUFXO2dCQUNYLFVBQVU7Z0JBQ1YsV0FBVztnQkFDWCxTQUFTO2dCQUNULE9BQU87YUFDUixDQUFDO1lBQ0YsS0FBSyxNQUFNLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztnQkFDakMsSUFBSSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxTQUFTO29CQUFFLFNBQVM7Z0JBQ25ELE1BQU0sT0FBTyxHQUFHLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN2QyxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBd0IsQ0FBWSxDQUFDO2dCQUM1RCxJQUFJLE9BQU8sS0FBSyxNQUFNLEVBQUUsQ0FBQztvQkFDdkIsTUFBTSxJQUFJLHVCQUFRLENBQ2hCLEdBQUcsRUFDSCw0RUFBNEUsQ0FDN0UsQ0FBQztnQkFDSixDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7YUFBTSxJQUNMLGlCQUFpQixDQUFDLEtBQUssS0FBSyxTQUFTO1lBQ3JDLENBQUMsSUFBQSw4Q0FBZ0MsRUFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQzVDLENBQUM7WUFDRCxNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztRQUN6RSxDQUFDO1FBRUQsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2hELE1BQU0sSUFBSSx1QkFBUSxDQUFDLEdBQUcsRUFBRSxnREFBZ0QsQ0FBQyxDQUFDO1FBQzVFLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQztRQUNoRSxNQUFNLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQyxTQUFTLElBQUksT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUN6RSxNQUFNLGNBQWMsR0FBRyxpQkFBaUIsQ0FBQyxRQUFRLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQztRQUN0RSw2QkFBNkIsQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDcEQsTUFBTSxlQUFlLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxJQUFJLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDekUsTUFBTSxhQUFhLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUM7UUFDbkUsSUFBSSxXQUFXLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztRQUVoQyxNQUFNLHNCQUFzQixHQUMxQixpQkFBaUIsQ0FBQyxPQUFPLEtBQUssU0FBUyxJQUFJLGlCQUFpQixDQUFDLFNBQVMsS0FBSyxTQUFTLENBQUM7UUFFdkYsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQzNCLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3ZGLElBQUksQ0FBQyxRQUFRLElBQUksUUFBUSxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUMvQixNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsd0RBQXdELENBQUMsQ0FBQztZQUNwRixDQUFDO1lBQ0QsTUFBTSxpQkFBaUIsR0FBRyx5QkFBeUIsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDN0Usb0JBQW9CLENBQUMsYUFBYSxFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFDdkQsaUJBQWlCLENBQUMsS0FBSyxHQUFHLGlCQUFpQixDQUFDO1lBQzVDLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQztRQUNsQyxDQUFDO1FBRUQsb0JBQW9CLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ2pELDZCQUE2QixDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFFNUQsTUFBTSwwQkFBMEIsQ0FDOUIsSUFBSSxDQUFDLHNCQUFzQixFQUMzQixlQUFlLEVBQ2YsY0FBYyxFQUNkLGVBQWUsRUFDZixFQUFFLG9CQUFvQixFQUFFLGlCQUFpQixDQUFDLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FDcEUsQ0FBQztRQUVGLElBQUksMkJBQTJCLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7WUFDbEQsTUFBTSxzQkFBc0IsQ0FDMUIsSUFBSSxDQUFDLHNCQUFzQixFQUMzQixjQUFjLEVBQ2QsYUFBYSxFQUNiLFdBQVcsRUFDWCxFQUFFLENBQ0gsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDaEYsSUFBSSxPQUFPO1lBQUUsSUFBQSwyQ0FBMEIsR0FBRSxDQUFDO1FBQzFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUNELElBQUksSUFBQSx5REFBcUMsRUFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNyRCxPQUFPLElBQUEsbURBQStCLEVBQUMsT0FBTyxDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUNWLElBQXNCLEVBQ3RCLEVBQVUsRUFDVixZQUE0QjtRQUU1QixNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2IsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxDQUFDLElBQUEsc0NBQWtCLEVBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDdkMsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQ25DLE1BQU0sSUFBSSx1QkFBUSxDQUFDLEdBQUcsRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1FBQ3ZFLENBQUM7UUFDRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDbkMsTUFBTSxJQUFJLHVCQUFRLENBQUMsR0FBRyxFQUFFLCtCQUErQixDQUFDLENBQUM7UUFDM0QsQ0FBQztRQUNELE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FDeEQsRUFBRSxFQUNGLFlBQVksSUFBSSxJQUFJLEVBQ3BCLElBQUksQ0FBQyxNQUFNLENBQ1osQ0FBQztRQUNGLElBQUksU0FBUyxFQUFFLENBQUM7WUFDZCxJQUFBLDJDQUEwQixHQUFFLENBQUM7UUFDL0IsQ0FBQztRQUNELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNmLE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUNELElBQUksSUFBQSx5REFBcUMsRUFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNyRCxPQUFPLElBQUEsbURBQStCLEVBQUMsU0FBUyxDQUFDLENBQUM7UUFDcEQsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ25CLENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVyxDQUNmLElBQXNCLEVBQ3RCLEVBQVUsRUFDVixLQUFhO1FBRWIsSUFBSSxDQUFDLElBQUEsOENBQWdDLEVBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDakQsTUFBTSxJQUFJLHVCQUFRLENBQUMsR0FBRyxFQUFFLDZDQUE2QyxDQUFDLENBQUM7UUFDekUsQ0FBQztRQUNELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFDRCxJQUFJLENBQUMsSUFBQSxzQ0FBa0IsRUFBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN2QyxPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFDRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDbkMsTUFBTSxJQUFJLHVCQUFRLENBQUMsR0FBRyxFQUFFLHdDQUF3QyxDQUFDLENBQUM7UUFDcEUsQ0FBQztRQUNELElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUNuQyxNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUseUNBQXlDLENBQUMsQ0FBQztRQUNyRSxDQUFDO1FBQ0QsTUFBTSxlQUFlLEdBQUcsc0JBQXNCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdEQsSUFBSSxlQUFlLEtBQUssSUFBSSxJQUFJLGVBQWUsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUM5RCxNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsMkRBQTJELENBQUMsQ0FBQztRQUN2RixDQUFDO1FBQ0QsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUNuRixJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osSUFBQSwyQ0FBMEIsR0FBRSxDQUFDO1FBQy9CLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFDRCxJQUFJLElBQUEseURBQXFDLEVBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDckQsT0FBTyxJQUFBLG1EQUErQixFQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2xELENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQztJQUNqQixDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFzQixFQUFFLEVBQVU7UUFDN0MsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUNELElBQUksQ0FBQyxJQUFBLHNDQUFrQixFQUFDLElBQUksRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUNELE1BQU0sRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN4RCxJQUFJLEVBQUU7WUFBRSxJQUFBLDJDQUEwQixHQUFFLENBQUM7UUFDckMsT0FBTyxFQUFFLENBQUM7SUFDWixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLGlCQUFpQixDQUNyQixJQUFzQixFQUN0QixNQUEyRTtRQUUzRSw2QkFBNkIsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRXJELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDN0MsTUFBTSxJQUFJLHVCQUFRLENBQUMsR0FBRyxFQUFFLHVDQUF1QyxDQUFDLENBQUM7UUFDbkUsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUNsQixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQy9ELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUNoRCxNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsOENBQThDLENBQUMsQ0FBQztRQUMxRSxDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUEseURBQWlDLEVBQUMsVUFBVSxDQUFDLENBQUM7UUFDOUQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2IsTUFBTSxJQUFJLHVCQUFRLENBQUMsR0FBRyxFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDcEYsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLE1BQU0sSUFBSSx1QkFBUSxDQUFDLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDeEYsSUFBSSxDQUFDLFFBQVEsSUFBSSxRQUFRLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDL0IsTUFBTSxJQUFJLHVCQUFRLENBQUMsR0FBRyxFQUFFLHdEQUF3RCxDQUFDLENBQUM7UUFDcEYsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLHlCQUF5QixDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztRQUMzRCxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFckMsTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsZUFBZSxDQUNuRSxNQUFNLENBQUMsUUFBUSxFQUNmLE9BQU8sRUFDUCxLQUFLLENBQ04sQ0FBQztRQUVGLE9BQU8sRUFBRSxTQUFTLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNyQyxDQUFDO0NBQ0Y7QUF0V0Qsa0RBc1dDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcclxuICB0eXBlIElBcHBvaW50bWVudHNSZXBvc2l0b3J5LFxyXG59IGZyb20gXCIuLi9yZXBvc2l0b3JpZXMvaW50ZXJmYWNlcy9JQXBwb2ludG1lbnRzUmVwb3NpdG9yeVwiO1xyXG5pbXBvcnQgdHlwZSB7XHJcbiAgQXBwb2ludG1lbnQsXHJcbiAgQXBwb2ludG1lbnRDcmVhdGVJbnB1dCxcclxuICBBcHBvaW50bWVudEZpbHRlcnMsXHJcbiAgQXBwb2ludG1lbnRTdGF0dXMsXHJcbiAgQXBwb2ludG1lbnRVcGRhdGVJbnB1dCxcclxufSBmcm9tIFwiLi4vcmVwb3NpdG9yaWVzL2ludGVyZmFjZXMvY29yZVR5cGVzXCI7XHJcbmltcG9ydCB0eXBlIHsgQXV0aFRva2VuUGF5bG9hZCB9IGZyb20gXCIuLi9yZXBvc2l0b3JpZXMvaW50ZXJmYWNlcy91c2VyVHlwZXNcIjtcclxuaW1wb3J0IHsgaW52YWxpZGF0ZUNsaW5pY0ZhY3RzQ2FjaGUgfSBmcm9tIFwiLi4vYWkvYWlDYWNoZVNlcnZpY2VcIjtcclxuaW1wb3J0IHsgY2FuU2V0QXBwb2ludG1lbnRDb21tZXJjaWFsUHJpY2UsIHJvbGVIYXNQZXJtaXNzaW9uS2V5IH0gZnJvbSBcIi4uL2F1dGgvcGVybWlzc2lvbnNcIjtcclxuaW1wb3J0IHsgQXBpRXJyb3IgfSBmcm9tIFwiLi4vbWlkZGxld2FyZS9lcnJvckhhbmRsZXJcIjtcclxuaW1wb3J0IHtcclxuICBhc3NlcnRBcHBvaW50bWVudENsaW5pY2FsV3JpdGVBbGxvd2VkLFxyXG4gIGNhblJlYWRBcHBvaW50bWVudCxcclxuICBnZXRFZmZlY3RpdmVEb2N0b3JJZCxcclxuICBpc0RvY3RvclNjb3BlZFJvbGUsXHJcbiAgbWVyZ2VBcHBvaW50bWVudEZpbHRlcnNGb3JVc2VyLFxyXG4gIHJlZGFjdEFwcG9pbnRtZW50Q2xpbmljYWxGaWVsZHMsXHJcbiAgc2hvdWxkUmVkYWN0QXBwb2ludG1lbnRDbGluaWNhbEZpZWxkcyxcclxufSBmcm9tIFwiLi9jbGluaWNhbERhdGFTY29wZVwiO1xyXG5pbXBvcnQge1xyXG4gIGFzc2VydEFwcG9pbnRtZW50VGltZXN0YW1wRm9yRGIsXHJcbiAgYXNzZXJ0T3B0aW9uYWxBcHBvaW50bWVudFRpbWVzdGFtcEZvckRiLFxyXG4gIHRyeVBhcnNlQXBwb2ludG1lbnRUaW1lc3RhbXBGb3JEYixcclxufSBmcm9tIFwiLi4vdXRpbHMvYXBwb2ludG1lbnRUaW1lc3RhbXBzXCI7XHJcbmltcG9ydCB7XHJcbiAgZm9ybWF0TG9jYWxEYXRlVGltZSxcclxuICBwYXJzZUxvY2FsRGF0ZVRpbWUsXHJcbn0gZnJvbSBcIi4uL3V0aWxzL2xvY2FsRGF0ZVRpbWVcIjtcclxuaW1wb3J0IHsgcGFyc2VOdW1lcmljSW5wdXQgfSBmcm9tIFwiLi4vdXRpbHMvbnVtYmVyc1wiO1xyXG5cclxuY29uc3QgQUNUSVZFX0FQUE9JTlRNRU5UX1NUQVRVU0VTID0gbmV3IFNldDxBcHBvaW50bWVudFN0YXR1cz4oW1xyXG4gIFwic2NoZWR1bGVkXCIsXHJcbiAgXCJjb25maXJtZWRcIixcclxuICBcImFycml2ZWRcIixcclxuICBcImluX2NvbnN1bHRhdGlvblwiLFxyXG5dKTtcclxuXHJcbmNvbnN0IEFMTE9XRURfU1RBVFVTX1RSQU5TSVRJT05TOiBSZWNvcmQ8QXBwb2ludG1lbnRTdGF0dXMsIEFwcG9pbnRtZW50U3RhdHVzW10+ID0ge1xyXG4gIHNjaGVkdWxlZDogW1wiY29uZmlybWVkXCIsIFwiYXJyaXZlZFwiLCBcImNhbmNlbGxlZFwiLCBcIm5vX3Nob3dcIl0sXHJcbiAgY29uZmlybWVkOiBbXCJhcnJpdmVkXCIsIFwiaW5fY29uc3VsdGF0aW9uXCIsIFwiY29tcGxldGVkXCIsIFwiY2FuY2VsbGVkXCIsIFwibm9fc2hvd1wiXSxcclxuICBhcnJpdmVkOiBbXCJpbl9jb25zdWx0YXRpb25cIiwgXCJjb21wbGV0ZWRcIiwgXCJjYW5jZWxsZWRcIiwgXCJub19zaG93XCJdLFxyXG4gIGluX2NvbnN1bHRhdGlvbjogW1wiY29tcGxldGVkXCIsIFwiY2FuY2VsbGVkXCJdLFxyXG4gIGNvbXBsZXRlZDogW10sXHJcbiAgY2FuY2VsbGVkOiBbXSxcclxuICBub19zaG93OiBbXSxcclxufTtcclxuXHJcbmNvbnN0IG5vcm1hbGl6ZU9wdGlvbmFsU3RyaW5nID0gKFxyXG4gIHZhbHVlOiB1bmtub3duXHJcbik6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQgPT4ge1xyXG4gIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gIH1cclxuICBpZiAodmFsdWUgPT09IG51bGwpIHtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSB7XHJcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKTtcclxuICByZXR1cm4gdHJpbW1lZCA9PT0gXCJcIiA/IG51bGwgOiB0cmltbWVkO1xyXG59O1xyXG5cclxuY29uc3Qgbm9ybWFsaXplT3B0aW9uYWxQcmljZSA9IChcclxuICB2YWx1ZTogdW5rbm93blxyXG4pOiBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkID0+IHtcclxuICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHVuZGVmaW5lZDtcclxuICBpZiAodmFsdWUgPT09IG51bGwpIHJldHVybiBudWxsO1xyXG4gIGNvbnN0IHBhcnNlZCA9IHBhcnNlTnVtZXJpY0lucHV0KHZhbHVlKTtcclxuICBpZiAocGFyc2VkID09PSBudWxsIHx8IHBhcnNlZCA8IDApIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwi0J/QvtC70LUgwqvRhtC10L3QsMK7INC00L7Qu9C20L3QviDQsdGL0YLRjCDRh9C40YHQu9C+0Lwg0L3QtSDQvNC10L3RjNGI0LUgMFwiKTtcclxuICB9XHJcbiAgcmV0dXJuIE1hdGgucm91bmQocGFyc2VkKTtcclxufTtcclxuXHJcbmNvbnN0IGVuc3VyZVJlbGF0ZWRFbnRpdGllc0V4aXN0ID0gYXN5bmMgKFxyXG4gIGFwcG9pbnRtZW50c1JlcG9zaXRvcnk6IElBcHBvaW50bWVudHNSZXBvc2l0b3J5LFxyXG4gIHBhdGllbnRJZDogbnVtYmVyLFxyXG4gIGRvY3RvcklkOiBudW1iZXIsXHJcbiAgc2VydmljZUlkOiBudW1iZXIsXHJcbiAgb3B0aW9uczogeyByZXF1aXJlQWN0aXZlU2VydmljZTogYm9vbGVhbiB9XHJcbik6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gIGNvbnN0IFtwYXRpZW50Rm91bmQsIGRvY3RvckZvdW5kLCBzZXJ2aWNlRm91bmRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xyXG4gICAgYXBwb2ludG1lbnRzUmVwb3NpdG9yeS5wYXRpZW50RXhpc3RzKHBhdGllbnRJZCksXHJcbiAgICBhcHBvaW50bWVudHNSZXBvc2l0b3J5LmRvY3RvckV4aXN0cyhkb2N0b3JJZCksXHJcbiAgICBhcHBvaW50bWVudHNSZXBvc2l0b3J5LnNlcnZpY2VFeGlzdHMoc2VydmljZUlkKSxcclxuICBdKTtcclxuXHJcbiAgaWYgKCFwYXRpZW50Rm91bmQpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDQsIFwiUGF0aWVudCBub3QgZm91bmRcIik7XHJcbiAgfVxyXG4gIGlmICghZG9jdG9yRm91bmQpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDQsIFwiRG9jdG9yIG5vdCBmb3VuZFwiKTtcclxuICB9XHJcbiAgaWYgKCFzZXJ2aWNlRm91bmQpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDQsIFwiU2VydmljZSBub3QgZm91bmRcIik7XHJcbiAgfVxyXG5cclxuICBpZiAob3B0aW9ucy5yZXF1aXJlQWN0aXZlU2VydmljZSkge1xyXG4gICAgY29uc3QgYWN0aXZlID0gYXdhaXQgYXBwb2ludG1lbnRzUmVwb3NpdG9yeS5pc1NlcnZpY2VBY3RpdmUoc2VydmljZUlkKTtcclxuICAgIGlmICghYWN0aXZlKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiU2VydmljZSBpcyBpbmFjdGl2ZSBvciBub3QgYXZhaWxhYmxlIGZvciBib29raW5nXCIpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY29uc3Qgc2VydmljZUFzc2lnbmVkID0gYXdhaXQgYXBwb2ludG1lbnRzUmVwb3NpdG9yeS5pc1NlcnZpY2VBc3NpZ25lZFRvRG9jdG9yKFxyXG4gICAgc2VydmljZUlkLFxyXG4gICAgZG9jdG9ySWRcclxuICApO1xyXG4gIGlmICghc2VydmljZUFzc2lnbmVkKSB7XHJcbiAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIlNlbGVjdGVkIHNlcnZpY2UgaXMgbm90IGFzc2lnbmVkIHRvIHNlbGVjdGVkIGRvY3RvclwiKTtcclxuICB9XHJcbn07XHJcblxyXG5jb25zdCBlbnN1cmVOb0RvY3RvckNvbmZsaWN0ID0gYXN5bmMgKFxyXG4gIGFwcG9pbnRtZW50c1JlcG9zaXRvcnk6IElBcHBvaW50bWVudHNSZXBvc2l0b3J5LFxyXG4gIGRvY3RvcklkOiBudW1iZXIsXHJcbiAgc3RhcnRBdDogc3RyaW5nLFxyXG4gIGVuZEF0OiBzdHJpbmcsXHJcbiAgZXhjbHVkZUFwcG9pbnRtZW50SWQ/OiBudW1iZXJcclxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgY29uc3QgaGFzQ29uZmxpY3QgPSBhd2FpdCBhcHBvaW50bWVudHNSZXBvc2l0b3J5LmZpbmRDb25mbGljdGluZyhcclxuICAgIGRvY3RvcklkLFxyXG4gICAgc3RhcnRBdCxcclxuICAgIGVuZEF0LFxyXG4gICAgZXhjbHVkZUFwcG9pbnRtZW50SWRcclxuICApO1xyXG5cclxuICBpZiAoaGFzQ29uZmxpY3QpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDksIFwiRG9jdG9yIGFscmVhZHkgaGFzIGFuIGFwcG9pbnRtZW50IGluIHRoaXMgdGltZSBzbG90XCIpO1xyXG4gIH1cclxufTtcclxuXHJcbmNvbnN0IGVuc3VyZVZhbGlkRGF0ZVJhbmdlID0gKHN0YXJ0QXQ6IHN0cmluZywgZW5kQXQ6IHN0cmluZyk6IHZvaWQgPT4ge1xyXG4gIGNvbnN0IHN0YXJ0ID0gcGFyc2VMb2NhbERhdGVUaW1lKHN0YXJ0QXQpO1xyXG4gIGNvbnN0IGVuZCA9IHBhcnNlTG9jYWxEYXRlVGltZShlbmRBdCk7XHJcbiAgaWYgKCFzdGFydCB8fCAhZW5kIHx8IGVuZC5nZXRUaW1lKCkgPD0gc3RhcnQuZ2V0VGltZSgpKSB7XHJcbiAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkZpZWxkICdlbmRBdCcgbXVzdCBiZSBncmVhdGVyIHRoYW4gJ3N0YXJ0QXQnXCIpO1xyXG4gIH1cclxufTtcclxuXHJcbmNvbnN0IGVuc3VyZVN0YXJ0QXROb3RJblBhc3QgPSAoc3RhcnRBdDogc3RyaW5nKTogdm9pZCA9PiB7XHJcbiAgY29uc3Qgc3RhcnQgPSBwYXJzZUxvY2FsRGF0ZVRpbWUoc3RhcnRBdCk7XHJcbiAgaWYgKCFzdGFydCkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJGaWVsZCAnc3RhcnRBdCcgbXVzdCBiZSBpbiBmb3JtYXQgWVlZWS1NTS1ERCBISDptbTpzc1wiKTtcclxuICB9XHJcbiAgaWYgKHN0YXJ0LmdldFRpbWUoKSA8IERhdGUubm93KCkpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiQ2Fubm90IGNyZWF0ZSBhcHBvaW50bWVudCBpbiB0aGUgcGFzdFwiKTtcclxuICB9XHJcbn07XHJcblxyXG5cclxuY29uc3QgYWRkTWludXRlc1RvTG9jYWxEYXRlVGltZSA9IChcclxuICBsb2NhbERhdGVUaW1lOiBzdHJpbmcsXHJcbiAgZHVyYXRpb25NaW51dGVzOiBudW1iZXJcclxuKTogc3RyaW5nID0+IHtcclxuICBjb25zdCBzdGFydCA9IHBhcnNlTG9jYWxEYXRlVGltZShsb2NhbERhdGVUaW1lKTtcclxuICBpZiAoIXN0YXJ0KSB7XHJcbiAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkZpZWxkICdzdGFydEF0JyBtdXN0IGJlIGluIGZvcm1hdCBZWVlZLU1NLUREIEhIOm1tOnNzXCIpO1xyXG4gIH1cclxuICBjb25zdCBlbmQgPSBuZXcgRGF0ZShzdGFydC5nZXRUaW1lKCkpO1xyXG4gIGVuZC5zZXRNaW51dGVzKGVuZC5nZXRNaW51dGVzKCkgKyBkdXJhdGlvbk1pbnV0ZXMpO1xyXG4gIHJldHVybiBmb3JtYXRMb2NhbERhdGVUaW1lKGVuZCk7XHJcbn07XHJcblxyXG5jb25zdCBlbmZvcmNlRG9jdG9yU2VsZlNjb3BlT25Xcml0ZSA9IChcclxuICBhdXRoOiBBdXRoVG9rZW5QYXlsb2FkLFxyXG4gIGRvY3RvcklkOiBudW1iZXJcclxuKTogdm9pZCA9PiB7XHJcbiAgaWYgKCFpc0RvY3RvclNjb3BlZFJvbGUoYXV0aC5yb2xlKSkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBpZiAoZG9jdG9ySWQgIT09IGdldEVmZmVjdGl2ZURvY3RvcklkKGF1dGgpKSB7XHJcbiAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAzLCBcItCc0L7QttC90L4g0YDQsNCx0L7RgtCw0YLRjCDRgtC+0LvRjNC60L4g0YEg0LfQsNC/0LjRgdGP0LzQuCDRgdCy0L7QtdCz0L4g0LLRgNCw0YfQsFwiKTtcclxuICB9XHJcbn07XHJcblxyXG5jb25zdCBlbnN1cmVTdGF0dXNUcmFuc2l0aW9uQWxsb3dlZCA9IChcclxuICBjdXJyZW50U3RhdHVzOiBBcHBvaW50bWVudFN0YXR1cyxcclxuICBuZXh0U3RhdHVzOiBBcHBvaW50bWVudFN0YXR1c1xyXG4pOiB2b2lkID0+IHtcclxuICBpZiAoY3VycmVudFN0YXR1cyA9PT0gbmV4dFN0YXR1cykge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgYWxsb3dlZE5leHRTdGF0dXNlcyA9IEFMTE9XRURfU1RBVFVTX1RSQU5TSVRJT05TW2N1cnJlbnRTdGF0dXNdO1xyXG4gIGlmICghYWxsb3dlZE5leHRTdGF0dXNlcy5pbmNsdWRlcyhuZXh0U3RhdHVzKSkge1xyXG4gICAgdGhyb3cgbmV3IEFwaUVycm9yKFxyXG4gICAgICA0MDAsXHJcbiAgICAgIGBJbnZhbGlkIHN0YXR1cyB0cmFuc2l0aW9uOiAnJHtjdXJyZW50U3RhdHVzfScgLT4gJyR7bmV4dFN0YXR1c30nYFxyXG4gICAgKTtcclxuICB9XHJcbn07XHJcblxyXG5jb25zdCBub3JtYWxpemVDcmVhdGVJbnB1dCA9IChcclxuICBwYXlsb2FkOiBBcHBvaW50bWVudENyZWF0ZUlucHV0XHJcbik6IEFwcG9pbnRtZW50Q3JlYXRlSW5wdXQgPT4ge1xyXG4gIHJldHVybiB7XHJcbiAgICAuLi5wYXlsb2FkLFxyXG4gICAgcHJpY2U6IG5vcm1hbGl6ZU9wdGlvbmFsUHJpY2UocGF5bG9hZC5wcmljZSksXHJcbiAgICBkaWFnbm9zaXM6IG5vcm1hbGl6ZU9wdGlvbmFsU3RyaW5nKHBheWxvYWQuZGlhZ25vc2lzKSA/PyBudWxsLFxyXG4gICAgdHJlYXRtZW50OiBub3JtYWxpemVPcHRpb25hbFN0cmluZyhwYXlsb2FkLnRyZWF0bWVudCkgPz8gbnVsbCxcclxuICAgIG5vdGVzOiBub3JtYWxpemVPcHRpb25hbFN0cmluZyhwYXlsb2FkLm5vdGVzKSA/PyBudWxsLFxyXG4gIH07XHJcbn07XHJcblxyXG5jb25zdCBub3JtYWxpemVVcGRhdGVJbnB1dCA9IChcclxuICBwYXlsb2FkOiBBcHBvaW50bWVudFVwZGF0ZUlucHV0XHJcbik6IEFwcG9pbnRtZW50VXBkYXRlSW5wdXQgPT4ge1xyXG4gIGNvbnN0IG5vcm1hbGl6ZWQ6IEFwcG9pbnRtZW50VXBkYXRlSW5wdXQgPSB7IC4uLnBheWxvYWQgfTtcclxuICBpZiAocGF5bG9hZC5wcmljZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICBub3JtYWxpemVkLnByaWNlID0gbm9ybWFsaXplT3B0aW9uYWxQcmljZShwYXlsb2FkLnByaWNlKTtcclxuICB9XHJcbiAgaWYgKHBheWxvYWQuZGlhZ25vc2lzICE9PSB1bmRlZmluZWQpIHtcclxuICAgIG5vcm1hbGl6ZWQuZGlhZ25vc2lzID0gbm9ybWFsaXplT3B0aW9uYWxTdHJpbmcocGF5bG9hZC5kaWFnbm9zaXMpO1xyXG4gIH1cclxuICBpZiAocGF5bG9hZC50cmVhdG1lbnQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgbm9ybWFsaXplZC50cmVhdG1lbnQgPSBub3JtYWxpemVPcHRpb25hbFN0cmluZyhwYXlsb2FkLnRyZWF0bWVudCk7XHJcbiAgfVxyXG4gIGlmIChwYXlsb2FkLm5vdGVzICE9PSB1bmRlZmluZWQpIHtcclxuICAgIG5vcm1hbGl6ZWQubm90ZXMgPSBub3JtYWxpemVPcHRpb25hbFN0cmluZyhwYXlsb2FkLm5vdGVzKTtcclxuICB9XHJcbiAgcmV0dXJuIG5vcm1hbGl6ZWQ7XHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgQXBwb2ludG1lbnRzU2VydmljZSB7XHJcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBhcHBvaW50bWVudHNSZXBvc2l0b3J5OiBJQXBwb2ludG1lbnRzUmVwb3NpdG9yeSkge31cclxuXHJcbiAgYXN5bmMgbGlzdChcclxuICAgIGF1dGg6IEF1dGhUb2tlblBheWxvYWQsXHJcbiAgICBmaWx0ZXJzOiBBcHBvaW50bWVudEZpbHRlcnMgPSB7fVxyXG4gICk6IFByb21pc2U8QXBwb2ludG1lbnRbXT4ge1xyXG4gICAgY29uc3Qgc2NvcGVkID0gbWVyZ2VBcHBvaW50bWVudEZpbHRlcnNGb3JVc2VyKGF1dGgsIGZpbHRlcnMpO1xyXG4gICAgY29uc3Qgc2FmZUZpbHRlcnM6IEFwcG9pbnRtZW50RmlsdGVycyA9IHsgLi4uc2NvcGVkIH07XHJcbiAgICBjb25zdCBmcm9tID0gYXNzZXJ0T3B0aW9uYWxBcHBvaW50bWVudFRpbWVzdGFtcEZvckRiKFxyXG4gICAgICBzY29wZWQuc3RhcnRGcm9tLFxyXG4gICAgICBcInN0YXJ0RnJvbVwiXHJcbiAgICApO1xyXG4gICAgY29uc3QgcmF3VXBwZXIgPSBzY29wZWQuc3RhcnRUbyA/PyBzY29wZWQuZW5kVG87XHJcbiAgICBjb25zdCB0byA9IGFzc2VydE9wdGlvbmFsQXBwb2ludG1lbnRUaW1lc3RhbXBGb3JEYihyYXdVcHBlciwgXCJzdGFydFRvXCIpO1xyXG4gICAgaWYgKGZyb20gIT0gbnVsbCkge1xyXG4gICAgICBzYWZlRmlsdGVycy5zdGFydEZyb20gPSBmcm9tO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZGVsZXRlIHNhZmVGaWx0ZXJzLnN0YXJ0RnJvbTtcclxuICAgIH1cclxuICAgIGlmICh0byAhPSBudWxsKSB7XHJcbiAgICAgIHNhZmVGaWx0ZXJzLnN0YXJ0VG8gPSB0bztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGRlbGV0ZSBzYWZlRmlsdGVycy5zdGFydFRvO1xyXG4gICAgfVxyXG4gICAgZGVsZXRlIHNhZmVGaWx0ZXJzLmVuZFRvO1xyXG5cclxuICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB0aGlzLmFwcG9pbnRtZW50c1JlcG9zaXRvcnkuZmluZEFsbChzYWZlRmlsdGVycyk7XHJcbiAgICBpZiAoIXNob3VsZFJlZGFjdEFwcG9pbnRtZW50Q2xpbmljYWxGaWVsZHMoYXV0aC5yb2xlKSkge1xyXG4gICAgICByZXR1cm4gcm93cztcclxuICAgIH1cclxuICAgIHJldHVybiByb3dzLm1hcChyZWRhY3RBcHBvaW50bWVudENsaW5pY2FsRmllbGRzKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGdldEJ5SWQoYXV0aDogQXV0aFRva2VuUGF5bG9hZCwgaWQ6IG51bWJlcik6IFByb21pc2U8QXBwb2ludG1lbnQgfCBudWxsPiB7XHJcbiAgICBjb25zdCByb3cgPSBhd2FpdCB0aGlzLmFwcG9pbnRtZW50c1JlcG9zaXRvcnkuZmluZEJ5SWQoaWQpO1xyXG4gICAgaWYgKCFyb3cpIHtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBpZiAoIWNhblJlYWRBcHBvaW50bWVudChhdXRoLCByb3cpKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgaWYgKHNob3VsZFJlZGFjdEFwcG9pbnRtZW50Q2xpbmljYWxGaWVsZHMoYXV0aC5yb2xlKSkge1xyXG4gICAgICByZXR1cm4gcmVkYWN0QXBwb2ludG1lbnRDbGluaWNhbEZpZWxkcyhyb3cpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJvdztcclxuICB9XHJcblxyXG4gIGFzeW5jIGNyZWF0ZShcclxuICAgIGF1dGg6IEF1dGhUb2tlblBheWxvYWQsXHJcbiAgICBwYXlsb2FkOiBBcHBvaW50bWVudENyZWF0ZUlucHV0XHJcbiAgKTogUHJvbWlzZTxBcHBvaW50bWVudD4ge1xyXG4gICAgaWYgKCFyb2xlSGFzUGVybWlzc2lvbktleShhdXRoLnJvbGUsIFwiQVBQT0lOVE1FTlRfQ1JFQVRFXCIpKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDMsIFwi0J3QtdC00L7RgdGC0LDRgtC+0YfQvdC+INC/0YDQsNCyINC00LvRjyDRjdGC0L7Qs9C+INC00LXQudGB0YLQstC40Y9cIik7XHJcbiAgICB9XHJcbiAgICBjb25zdCBub3JtYWxpemVkUGF5bG9hZCA9IG5vcm1hbGl6ZUNyZWF0ZUlucHV0KHBheWxvYWQpO1xyXG4gICAgbm9ybWFsaXplZFBheWxvYWQuc3RhcnRBdCA9IGFzc2VydEFwcG9pbnRtZW50VGltZXN0YW1wRm9yRGIoXHJcbiAgICAgIG5vcm1hbGl6ZWRQYXlsb2FkLnN0YXJ0QXQsXHJcbiAgICAgIFwic3RhcnRBdFwiXHJcbiAgICApO1xyXG4gICAgYXNzZXJ0QXBwb2ludG1lbnRDbGluaWNhbFdyaXRlQWxsb3dlZChhdXRoLCB7XHJcbiAgICAgIGRpYWdub3Npczogbm9ybWFsaXplZFBheWxvYWQuZGlhZ25vc2lzID8/IHVuZGVmaW5lZCxcclxuICAgICAgdHJlYXRtZW50OiBub3JtYWxpemVkUGF5bG9hZC50cmVhdG1lbnQgPz8gdW5kZWZpbmVkLFxyXG4gICAgICBub3Rlczogbm9ybWFsaXplZFBheWxvYWQubm90ZXMgPz8gdW5kZWZpbmVkLFxyXG4gICAgfSk7XHJcbiAgICBlbmZvcmNlRG9jdG9yU2VsZlNjb3BlT25Xcml0ZShhdXRoLCBub3JtYWxpemVkUGF5bG9hZC5kb2N0b3JJZCk7XHJcbiAgICBlbnN1cmVTdGFydEF0Tm90SW5QYXN0KG5vcm1hbGl6ZWRQYXlsb2FkLnN0YXJ0QXQpO1xyXG5cclxuICAgIGF3YWl0IGVuc3VyZVJlbGF0ZWRFbnRpdGllc0V4aXN0KFxyXG4gICAgICB0aGlzLmFwcG9pbnRtZW50c1JlcG9zaXRvcnksXHJcbiAgICAgIG5vcm1hbGl6ZWRQYXlsb2FkLnBhdGllbnRJZCxcclxuICAgICAgbm9ybWFsaXplZFBheWxvYWQuZG9jdG9ySWQsXHJcbiAgICAgIG5vcm1hbGl6ZWRQYXlsb2FkLnNlcnZpY2VJZCxcclxuICAgICAgeyByZXF1aXJlQWN0aXZlU2VydmljZTogdHJ1ZSB9XHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGR1cmF0aW9uID0gYXdhaXQgdGhpcy5hcHBvaW50bWVudHNSZXBvc2l0b3J5LmdldFNlcnZpY2VEdXJhdGlvbihcclxuICAgICAgbm9ybWFsaXplZFBheWxvYWQuc2VydmljZUlkXHJcbiAgICApO1xyXG4gICAgaWYgKCFkdXJhdGlvbiB8fCBkdXJhdGlvbiA8PSAwKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiU2VydmljZSBkdXJhdGlvbiBtdXN0IGJlIGNvbmZpZ3VyZWQgYW5kIGdyZWF0ZXIgdGhhbiAwXCIpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY29tcHV0ZWRFbmRBdCA9IGFkZE1pbnV0ZXNUb0xvY2FsRGF0ZVRpbWUobm9ybWFsaXplZFBheWxvYWQuc3RhcnRBdCwgZHVyYXRpb24pO1xyXG4gICAgZW5zdXJlVmFsaWREYXRlUmFuZ2Uobm9ybWFsaXplZFBheWxvYWQuc3RhcnRBdCwgY29tcHV0ZWRFbmRBdCk7XHJcbiAgICBjb25zdCBzZXJ2aWNlUHJpY2UgPSBhd2FpdCB0aGlzLmFwcG9pbnRtZW50c1JlcG9zaXRvcnkuZ2V0U2VydmljZVByaWNlKFxyXG4gICAgICBub3JtYWxpemVkUGF5bG9hZC5zZXJ2aWNlSWRcclxuICAgICk7XHJcbiAgICBpZiAoc2VydmljZVByaWNlID09PSBudWxsIHx8IHNlcnZpY2VQcmljZSA8IDApIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJTZXJ2aWNlIHByaWNlIGlzIGludmFsaWRcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcGF5bG9hZFRvQ3JlYXRlOiBBcHBvaW50bWVudENyZWF0ZUlucHV0ID0ge1xyXG4gICAgICAuLi5ub3JtYWxpemVkUGF5bG9hZCxcclxuICAgICAgcHJpY2U6IG5vcm1hbGl6ZWRQYXlsb2FkLnByaWNlID8/IE1hdGgucm91bmQoc2VydmljZVByaWNlKSxcclxuICAgICAgZW5kQXQ6IGNvbXB1dGVkRW5kQXQsXHJcbiAgICB9O1xyXG5cclxuICAgIGlmIChBQ1RJVkVfQVBQT0lOVE1FTlRfU1RBVFVTRVMuaGFzKHBheWxvYWRUb0NyZWF0ZS5zdGF0dXMpKSB7XHJcbiAgICAgIGF3YWl0IGVuc3VyZU5vRG9jdG9yQ29uZmxpY3QoXHJcbiAgICAgICAgdGhpcy5hcHBvaW50bWVudHNSZXBvc2l0b3J5LFxyXG4gICAgICAgIHBheWxvYWRUb0NyZWF0ZS5kb2N0b3JJZCxcclxuICAgICAgICBwYXlsb2FkVG9DcmVhdGUuc3RhcnRBdCxcclxuICAgICAgICBwYXlsb2FkVG9DcmVhdGUuZW5kQXRcclxuICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjcmVhdGVkID0gYXdhaXQgdGhpcy5hcHBvaW50bWVudHNSZXBvc2l0b3J5LmNyZWF0ZShwYXlsb2FkVG9DcmVhdGUpO1xyXG4gICAgaW52YWxpZGF0ZUNsaW5pY0ZhY3RzQ2FjaGUoKTtcclxuICAgIGlmIChzaG91bGRSZWRhY3RBcHBvaW50bWVudENsaW5pY2FsRmllbGRzKGF1dGgucm9sZSkpIHtcclxuICAgICAgcmV0dXJuIHJlZGFjdEFwcG9pbnRtZW50Q2xpbmljYWxGaWVsZHMoY3JlYXRlZCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gY3JlYXRlZDtcclxuICB9XHJcblxyXG4gIGFzeW5jIHVwZGF0ZShcclxuICAgIGF1dGg6IEF1dGhUb2tlblBheWxvYWQsXHJcbiAgICBpZDogbnVtYmVyLFxyXG4gICAgcGF5bG9hZDogQXBwb2ludG1lbnRVcGRhdGVJbnB1dFxyXG4gICk6IFByb21pc2U8QXBwb2ludG1lbnQgfCBudWxsPiB7XHJcbiAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgdGhpcy5hcHBvaW50bWVudHNSZXBvc2l0b3J5LmZpbmRCeUlkKGlkKTtcclxuICAgIGlmICghY3VycmVudCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGlmICghY2FuUmVhZEFwcG9pbnRtZW50KGF1dGgsIGN1cnJlbnQpKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXlsb2FkID0gbm9ybWFsaXplVXBkYXRlSW5wdXQocGF5bG9hZCk7XHJcbiAgICBpZiAobm9ybWFsaXplZFBheWxvYWQuc3RhcnRBdCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIG5vcm1hbGl6ZWRQYXlsb2FkLnN0YXJ0QXQgPSBhc3NlcnRBcHBvaW50bWVudFRpbWVzdGFtcEZvckRiKFxyXG4gICAgICAgIG5vcm1hbGl6ZWRQYXlsb2FkLnN0YXJ0QXQsXHJcbiAgICAgICAgXCJzdGFydEF0XCJcclxuICAgICAgKTtcclxuICAgIH1cclxuICAgIGFzc2VydEFwcG9pbnRtZW50Q2xpbmljYWxXcml0ZUFsbG93ZWQoYXV0aCwge1xyXG4gICAgICBkaWFnbm9zaXM6IG5vcm1hbGl6ZWRQYXlsb2FkLmRpYWdub3NpcyxcclxuICAgICAgdHJlYXRtZW50OiBub3JtYWxpemVkUGF5bG9hZC50cmVhdG1lbnQsXHJcbiAgICAgIG5vdGVzOiBub3JtYWxpemVkUGF5bG9hZC5ub3RlcyxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGlzQ2xpbmljYWxTdGFmZiA9IGlzRG9jdG9yU2NvcGVkUm9sZShhdXRoLnJvbGUpO1xyXG4gICAgaWYgKGlzQ2xpbmljYWxTdGFmZikge1xyXG4gICAgICBjb25zdCBzY2hlZHVsaW5nS2V5czogKGtleW9mIEFwcG9pbnRtZW50VXBkYXRlSW5wdXQpW10gPSBbXHJcbiAgICAgICAgXCJwYXRpZW50SWRcIixcclxuICAgICAgICBcImRvY3RvcklkXCIsXHJcbiAgICAgICAgXCJzZXJ2aWNlSWRcIixcclxuICAgICAgICBcInN0YXJ0QXRcIixcclxuICAgICAgICBcInByaWNlXCIsXHJcbiAgICAgIF07XHJcbiAgICAgIGZvciAoY29uc3Qga2V5IG9mIHNjaGVkdWxpbmdLZXlzKSB7XHJcbiAgICAgICAgaWYgKG5vcm1hbGl6ZWRQYXlsb2FkW2tleV0gPT09IHVuZGVmaW5lZCkgY29udGludWU7XHJcbiAgICAgICAgY29uc3QgbmV4dFZhbCA9IG5vcm1hbGl6ZWRQYXlsb2FkW2tleV07XHJcbiAgICAgICAgY29uc3QgY3VyVmFsID0gY3VycmVudFtrZXkgYXMga2V5b2YgQXBwb2ludG1lbnRdIGFzIHVua25vd247XHJcbiAgICAgICAgaWYgKG5leHRWYWwgIT09IGN1clZhbCkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKFxyXG4gICAgICAgICAgICA0MDMsXHJcbiAgICAgICAgICAgIFwi0J3QtdC70YzQt9GPINC80LXQvdGP0YLRjCDQv9Cw0YbQuNC10L3RgtCwLCDQstGA0LDRh9CwLCDRg9GB0LvRg9Cz0YMsINCy0YDQtdC80Y8g0LjQu9C4INGG0LXQvdGDINC30LDQv9C40YHQuCDQtNC70Y8g0Y3RgtC+0Lkg0YDQvtC70LhcIlxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoXHJcbiAgICAgIG5vcm1hbGl6ZWRQYXlsb2FkLnByaWNlICE9PSB1bmRlZmluZWQgJiZcclxuICAgICAgIWNhblNldEFwcG9pbnRtZW50Q29tbWVyY2lhbFByaWNlKGF1dGgucm9sZSlcclxuICAgICkge1xyXG4gICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAzLCBcItCd0LXQtNC+0YHRgtCw0YLQvtGH0L3QviDQv9GA0LDQsiDQtNC70Y8g0LjQt9C80LXQvdC10L3QuNGPINGG0LXQvdGLINC30LDQv9C40YHQuFwiKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoT2JqZWN0LmtleXMobm9ybWFsaXplZFBheWxvYWQpLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIkF0IGxlYXN0IG9uZSBmaWVsZCBtdXN0IGJlIHByb3ZpZGVkIGZvciB1cGRhdGVcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbWVyZ2VkU3RhdHVzID0gbm9ybWFsaXplZFBheWxvYWQuc3RhdHVzID8/IGN1cnJlbnQuc3RhdHVzO1xyXG4gICAgY29uc3QgbWVyZ2VkUGF0aWVudElkID0gbm9ybWFsaXplZFBheWxvYWQucGF0aWVudElkID8/IGN1cnJlbnQucGF0aWVudElkO1xyXG4gICAgY29uc3QgbWVyZ2VkRG9jdG9ySWQgPSBub3JtYWxpemVkUGF5bG9hZC5kb2N0b3JJZCA/PyBjdXJyZW50LmRvY3RvcklkO1xyXG4gICAgZW5mb3JjZURvY3RvclNlbGZTY29wZU9uV3JpdGUoYXV0aCwgbWVyZ2VkRG9jdG9ySWQpO1xyXG4gICAgY29uc3QgbWVyZ2VkU2VydmljZUlkID0gbm9ybWFsaXplZFBheWxvYWQuc2VydmljZUlkID8/IGN1cnJlbnQuc2VydmljZUlkO1xyXG4gICAgY29uc3QgbWVyZ2VkU3RhcnRBdCA9IG5vcm1hbGl6ZWRQYXlsb2FkLnN0YXJ0QXQgPz8gY3VycmVudC5zdGFydEF0O1xyXG4gICAgbGV0IG1lcmdlZEVuZEF0ID0gY3VycmVudC5lbmRBdDtcclxuXHJcbiAgICBjb25zdCBzaG91bGRSZWNhbGN1bGF0ZUVuZEF0ID1cclxuICAgICAgbm9ybWFsaXplZFBheWxvYWQuc3RhcnRBdCAhPT0gdW5kZWZpbmVkIHx8IG5vcm1hbGl6ZWRQYXlsb2FkLnNlcnZpY2VJZCAhPT0gdW5kZWZpbmVkO1xyXG5cclxuICAgIGlmIChzaG91bGRSZWNhbGN1bGF0ZUVuZEF0KSB7XHJcbiAgICAgIGNvbnN0IGR1cmF0aW9uID0gYXdhaXQgdGhpcy5hcHBvaW50bWVudHNSZXBvc2l0b3J5LmdldFNlcnZpY2VEdXJhdGlvbihtZXJnZWRTZXJ2aWNlSWQpO1xyXG4gICAgICBpZiAoIWR1cmF0aW9uIHx8IGR1cmF0aW9uIDw9IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAwLCBcIlNlcnZpY2UgZHVyYXRpb24gbXVzdCBiZSBjb25maWd1cmVkIGFuZCBncmVhdGVyIHRoYW4gMFwiKTtcclxuICAgICAgfVxyXG4gICAgICBjb25zdCByZWNhbGN1bGF0ZWRFbmRBdCA9IGFkZE1pbnV0ZXNUb0xvY2FsRGF0ZVRpbWUobWVyZ2VkU3RhcnRBdCwgZHVyYXRpb24pO1xyXG4gICAgICBlbnN1cmVWYWxpZERhdGVSYW5nZShtZXJnZWRTdGFydEF0LCByZWNhbGN1bGF0ZWRFbmRBdCk7XHJcbiAgICAgIG5vcm1hbGl6ZWRQYXlsb2FkLmVuZEF0ID0gcmVjYWxjdWxhdGVkRW5kQXQ7XHJcbiAgICAgIG1lcmdlZEVuZEF0ID0gcmVjYWxjdWxhdGVkRW5kQXQ7XHJcbiAgICB9XHJcblxyXG4gICAgZW5zdXJlVmFsaWREYXRlUmFuZ2UobWVyZ2VkU3RhcnRBdCwgbWVyZ2VkRW5kQXQpO1xyXG4gICAgZW5zdXJlU3RhdHVzVHJhbnNpdGlvbkFsbG93ZWQoY3VycmVudC5zdGF0dXMsIG1lcmdlZFN0YXR1cyk7XHJcblxyXG4gICAgYXdhaXQgZW5zdXJlUmVsYXRlZEVudGl0aWVzRXhpc3QoXHJcbiAgICAgIHRoaXMuYXBwb2ludG1lbnRzUmVwb3NpdG9yeSxcclxuICAgICAgbWVyZ2VkUGF0aWVudElkLFxyXG4gICAgICBtZXJnZWREb2N0b3JJZCxcclxuICAgICAgbWVyZ2VkU2VydmljZUlkLFxyXG4gICAgICB7IHJlcXVpcmVBY3RpdmVTZXJ2aWNlOiBub3JtYWxpemVkUGF5bG9hZC5zZXJ2aWNlSWQgIT09IHVuZGVmaW5lZCB9XHJcbiAgICApO1xyXG5cclxuICAgIGlmIChBQ1RJVkVfQVBQT0lOVE1FTlRfU1RBVFVTRVMuaGFzKG1lcmdlZFN0YXR1cykpIHtcclxuICAgICAgYXdhaXQgZW5zdXJlTm9Eb2N0b3JDb25mbGljdChcclxuICAgICAgICB0aGlzLmFwcG9pbnRtZW50c1JlcG9zaXRvcnksXHJcbiAgICAgICAgbWVyZ2VkRG9jdG9ySWQsXHJcbiAgICAgICAgbWVyZ2VkU3RhcnRBdCxcclxuICAgICAgICBtZXJnZWRFbmRBdCxcclxuICAgICAgICBpZFxyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHVwZGF0ZWQgPSBhd2FpdCB0aGlzLmFwcG9pbnRtZW50c1JlcG9zaXRvcnkudXBkYXRlKGlkLCBub3JtYWxpemVkUGF5bG9hZCk7XHJcbiAgICBpZiAodXBkYXRlZCkgaW52YWxpZGF0ZUNsaW5pY0ZhY3RzQ2FjaGUoKTtcclxuICAgIGlmICghdXBkYXRlZCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGlmIChzaG91bGRSZWRhY3RBcHBvaW50bWVudENsaW5pY2FsRmllbGRzKGF1dGgucm9sZSkpIHtcclxuICAgICAgcmV0dXJuIHJlZGFjdEFwcG9pbnRtZW50Q2xpbmljYWxGaWVsZHModXBkYXRlZCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdXBkYXRlZDtcclxuICB9XHJcblxyXG4gIGFzeW5jIGNhbmNlbChcclxuICAgIGF1dGg6IEF1dGhUb2tlblBheWxvYWQsXHJcbiAgICBpZDogbnVtYmVyLFxyXG4gICAgY2FuY2VsUmVhc29uPzogc3RyaW5nIHwgbnVsbFxyXG4gICk6IFByb21pc2U8QXBwb2ludG1lbnQgfCBudWxsPiB7XHJcbiAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgdGhpcy5hcHBvaW50bWVudHNSZXBvc2l0b3J5LmZpbmRCeUlkKGlkKTtcclxuICAgIGlmICghY3VycmVudCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGlmICghY2FuUmVhZEFwcG9pbnRtZW50KGF1dGgsIGN1cnJlbnQpKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgaWYgKGN1cnJlbnQuc3RhdHVzID09PSBcImNvbXBsZXRlZFwiKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiQ29tcGxldGVkIGFwcG9pbnRtZW50IGNhbm5vdCBiZSBjYW5jZWxsZWRcIik7XHJcbiAgICB9XHJcbiAgICBpZiAoY3VycmVudC5zdGF0dXMgPT09IFwiY2FuY2VsbGVkXCIpIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJBcHBvaW50bWVudCBhbHJlYWR5IGNhbmNlbGxlZFwiKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGNhbmNlbGxlZCA9IGF3YWl0IHRoaXMuYXBwb2ludG1lbnRzUmVwb3NpdG9yeS5jYW5jZWwoXHJcbiAgICAgIGlkLFxyXG4gICAgICBjYW5jZWxSZWFzb24gPz8gbnVsbCxcclxuICAgICAgYXV0aC51c2VySWRcclxuICAgICk7XHJcbiAgICBpZiAoY2FuY2VsbGVkKSB7XHJcbiAgICAgIGludmFsaWRhdGVDbGluaWNGYWN0c0NhY2hlKCk7XHJcbiAgICB9XHJcbiAgICBpZiAoIWNhbmNlbGxlZCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGlmIChzaG91bGRSZWRhY3RBcHBvaW50bWVudENsaW5pY2FsRmllbGRzKGF1dGgucm9sZSkpIHtcclxuICAgICAgcmV0dXJuIHJlZGFjdEFwcG9pbnRtZW50Q2xpbmljYWxGaWVsZHMoY2FuY2VsbGVkKTtcclxuICAgIH1cclxuICAgIHJldHVybiBjYW5jZWxsZWQ7XHJcbiAgfVxyXG5cclxuICBhc3luYyB1cGRhdGVQcmljZShcclxuICAgIGF1dGg6IEF1dGhUb2tlblBheWxvYWQsXHJcbiAgICBpZDogbnVtYmVyLFxyXG4gICAgcHJpY2U6IG51bWJlclxyXG4gICk6IFByb21pc2U8QXBwb2ludG1lbnQgfCBudWxsPiB7XHJcbiAgICBpZiAoIWNhblNldEFwcG9pbnRtZW50Q29tbWVyY2lhbFByaWNlKGF1dGgucm9sZSkpIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMywgXCLQndC10LTQvtGB0YLQsNGC0L7Rh9C90L4g0L/RgNCw0LIg0LTQu9GPINC40LfQvNC10L3QtdC90LjRjyDRhtC10L3RiyDQt9Cw0L/QuNGB0LhcIik7XHJcbiAgICB9XHJcbiAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgdGhpcy5hcHBvaW50bWVudHNSZXBvc2l0b3J5LmZpbmRCeUlkKGlkKTtcclxuICAgIGlmICghY3VycmVudCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGlmICghY2FuUmVhZEFwcG9pbnRtZW50KGF1dGgsIGN1cnJlbnQpKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgaWYgKGN1cnJlbnQuc3RhdHVzID09PSBcImNhbmNlbGxlZFwiKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwi0J3QtdC70YzQt9GPINC80LXQvdGP0YLRjCDRhtC10L3RgyDRgyDQvtGC0LzQtdC90LXQvdC90L7QuSDQt9Cw0L/QuNGB0LhcIik7XHJcbiAgICB9XHJcbiAgICBpZiAoY3VycmVudC5zdGF0dXMgPT09IFwiY29tcGxldGVkXCIpIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCLQndC10LvRjNC30Y8g0LzQtdC90Y/RgtGMINGG0LXQvdGDINGDINC30LDQstC10YDRiNC10L3QvdC+0Lkg0LfQsNC/0LjRgdC4XCIpO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgbm9ybWFsaXplZFByaWNlID0gbm9ybWFsaXplT3B0aW9uYWxQcmljZShwcmljZSk7XHJcbiAgICBpZiAobm9ybWFsaXplZFByaWNlID09PSBudWxsIHx8IG5vcm1hbGl6ZWRQcmljZSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiRmllbGQgJ3ByaWNlJyBtdXN0IGJlIGEgbnVtYmVyIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byAwXCIpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgdXBkYXRlZCA9IGF3YWl0IHRoaXMuYXBwb2ludG1lbnRzUmVwb3NpdG9yeS51cGRhdGVQcmljZShpZCwgbm9ybWFsaXplZFByaWNlKTtcclxuICAgIGlmICh1cGRhdGVkKSB7XHJcbiAgICAgIGludmFsaWRhdGVDbGluaWNGYWN0c0NhY2hlKCk7XHJcbiAgICB9XHJcbiAgICBpZiAoIXVwZGF0ZWQpIHtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBpZiAoc2hvdWxkUmVkYWN0QXBwb2ludG1lbnRDbGluaWNhbEZpZWxkcyhhdXRoLnJvbGUpKSB7XHJcbiAgICAgIHJldHVybiByZWRhY3RBcHBvaW50bWVudENsaW5pY2FsRmllbGRzKHVwZGF0ZWQpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHVwZGF0ZWQ7XHJcbiAgfVxyXG5cclxuICBhc3luYyBkZWxldGUoYXV0aDogQXV0aFRva2VuUGF5bG9hZCwgaWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgY29uc3QgY3VycmVudCA9IGF3YWl0IHRoaXMuYXBwb2ludG1lbnRzUmVwb3NpdG9yeS5maW5kQnlJZChpZCk7XHJcbiAgICBpZiAoIWN1cnJlbnQpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgaWYgKCFjYW5SZWFkQXBwb2ludG1lbnQoYXV0aCwgY3VycmVudCkpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgb2sgPSBhd2FpdCB0aGlzLmFwcG9pbnRtZW50c1JlcG9zaXRvcnkuZGVsZXRlKGlkKTtcclxuICAgIGlmIChvaykgaW52YWxpZGF0ZUNsaW5pY0ZhY3RzQ2FjaGUoKTtcclxuICAgIHJldHVybiBvaztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqINCf0YDQvtCy0LXRgNC60LAg0L/QtdGA0LXRgdC10YfQtdC90LjRjyDRgSDQsNC60YLQuNCy0L3Ri9C80Lgg0LfQsNC/0LjRgdGP0LzQuCDQstGA0LDRh9CwINC00LvRjyDQstGL0LHRgNCw0L3QvdC+0LPQviDRgdC70L7RgtCwLlxyXG4gICAqIGBkYXRlYCDigJQgWVlZWS1NTS1ERCwgYHRpbWVgIOKAlCBISDptbTpzcyAo0LjQu9C4IEhIOm1tIOKAlCDQvdC+0YDQvNCw0LvQuNC30YPQudGC0LUg0L3QsCDRg9GA0L7QstC90LUg0LrQvtC90YLRgNC+0LvQu9C10YDQsCkuXHJcbiAgICovXHJcbiAgYXN5bmMgY2hlY2tBdmFpbGFiaWxpdHkoXHJcbiAgICBhdXRoOiBBdXRoVG9rZW5QYXlsb2FkLFxyXG4gICAgcGFyYW1zOiB7IGRvY3RvcklkOiBudW1iZXI7IHNlcnZpY2VJZDogbnVtYmVyOyBkYXRlOiBzdHJpbmc7IHRpbWU6IHN0cmluZyB9XHJcbiAgKTogUHJvbWlzZTx7IGF2YWlsYWJsZTogYm9vbGVhbiB9PiB7XHJcbiAgICBlbmZvcmNlRG9jdG9yU2VsZlNjb3BlT25Xcml0ZShhdXRoLCBwYXJhbXMuZG9jdG9ySWQpO1xyXG5cclxuICAgIGlmICghL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvLnRlc3QocGFyYW1zLmRhdGUpKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiUXVlcnkgcGFyYW0gJ2RhdGUnIG11c3QgYmUgWVlZWS1NTS1ERFwiKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBub3JtYWxpemVkVGltZSA9XHJcbiAgICAgIHBhcmFtcy50aW1lLmxlbmd0aCA9PT0gNSA/IGAke3BhcmFtcy50aW1lfTowMGAgOiBwYXJhbXMudGltZTtcclxuICAgIGlmICghL15cXGR7Mn06XFxkezJ9OlxcZHsyfSQvLnRlc3Qobm9ybWFsaXplZFRpbWUpKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiUXVlcnkgcGFyYW0gJ3RpbWUnIG11c3QgYmUgSEg6bW0gb3IgSEg6bW06c3NcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc3RhcnRBdFJhdyA9IGAke3BhcmFtcy5kYXRlfSAke25vcm1hbGl6ZWRUaW1lfWA7XHJcbiAgICBjb25zdCBzdGFydEF0ID0gdHJ5UGFyc2VBcHBvaW50bWVudFRpbWVzdGFtcEZvckRiKHN0YXJ0QXRSYXcpO1xyXG4gICAgaWYgKCFzdGFydEF0KSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDAsIFwiSW52YWxpZCBkYXRlIG9yIHRpbWVcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZG9jdG9yRm91bmQgPSBhd2FpdCB0aGlzLmFwcG9pbnRtZW50c1JlcG9zaXRvcnkuZG9jdG9yRXhpc3RzKHBhcmFtcy5kb2N0b3JJZCk7XHJcbiAgICBpZiAoIWRvY3RvckZvdW5kKSB7XHJcbiAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDQsIFwiRG9jdG9yIG5vdCBmb3VuZFwiKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkdXJhdGlvbiA9IGF3YWl0IHRoaXMuYXBwb2ludG1lbnRzUmVwb3NpdG9yeS5nZXRTZXJ2aWNlRHVyYXRpb24ocGFyYW1zLnNlcnZpY2VJZCk7XHJcbiAgICBpZiAoIWR1cmF0aW9uIHx8IGR1cmF0aW9uIDw9IDApIHtcclxuICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCJTZXJ2aWNlIGR1cmF0aW9uIG11c3QgYmUgY29uZmlndXJlZCBhbmQgZ3JlYXRlciB0aGFuIDBcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZW5kQXQgPSBhZGRNaW51dGVzVG9Mb2NhbERhdGVUaW1lKHN0YXJ0QXQsIGR1cmF0aW9uKTtcclxuICAgIGVuc3VyZVZhbGlkRGF0ZVJhbmdlKHN0YXJ0QXQsIGVuZEF0KTtcclxuXHJcbiAgICBjb25zdCBoYXNDb25mbGljdCA9IGF3YWl0IHRoaXMuYXBwb2ludG1lbnRzUmVwb3NpdG9yeS5maW5kQ29uZmxpY3RpbmcoXHJcbiAgICAgIHBhcmFtcy5kb2N0b3JJZCxcclxuICAgICAgc3RhcnRBdCxcclxuICAgICAgZW5kQXRcclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIHsgYXZhaWxhYmxlOiAhaGFzQ29uZmxpY3QgfTtcclxuICB9XHJcbn1cclxuXHJcbiJdfQ==