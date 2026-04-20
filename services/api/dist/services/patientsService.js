"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatientsService = void 0;
const permissions_1 = require("../auth/permissions");
const errorHandler_1 = require("../middleware/errorHandler");
const clinicalDataScope_1 = require("./clinicalDataScope");
const normalizeTrimmedString = (value) => {
    if (typeof value !== "string") {
        return undefined;
    }
    return value.trim();
};
const normalizePhone = (phone) => {
    if (phone === undefined || phone === null)
        return null;
    // Keep leading plus, drop separators and spaces.
    return phone.trim().replace(/(?!^\+)[^\d]/g, "");
};
const maskPatientForCashier = (patient) => ({
    id: patient.id,
    fullName: patient.fullName,
    phone: patient.phone,
    gender: null,
    birthDate: null,
    source: null,
    notes: null,
    createdAt: patient.createdAt,
});
class PatientsService {
    constructor(patientsRepository, appointmentsRepository) {
        this.patientsRepository = patientsRepository;
        this.appointmentsRepository = appointmentsRepository;
    }
    async list(auth, options) {
        const search = normalizeTrimmedString(options?.search);
        const filters = search ? { search } : {};
        if (search) {
            if ((0, clinicalDataScope_1.isDoctorScopedRole)(auth.role)) {
                const appointments = await this.appointmentsRepository.findAll({
                    doctorId: (0, clinicalDataScope_1.getEffectiveDoctorId)(auth),
                });
                // patientId попадает в patients.findAll → ANY($1::bigint[]); лишние значения режутся в PostgresPatientsRepository.
                const ids = [...new Set(appointments.map((a) => a.patientId))];
                if (ids.length === 0) {
                    return [];
                }
                const rows = await this.patientsRepository.findAll({
                    ids,
                    search,
                    includeDeleted: true,
                });
                return rows;
            }
            const rows = await this.patientsRepository.findAll({ search });
            if (auth.role === "cashier") {
                return rows.map(maskPatientForCashier);
            }
            return rows;
        }
        if (!(0, clinicalDataScope_1.isDoctorScopedRole)(auth.role)) {
            const rows = await this.patientsRepository.findAll(filters);
            if (auth.role === "cashier") {
                return rows.map(maskPatientForCashier);
            }
            return rows;
        }
        const appointments = await this.appointmentsRepository.findAll({
            doctorId: (0, clinicalDataScope_1.getEffectiveDoctorId)(auth),
        });
        // patientId → ANY(bigint[]); см. санитизацию в PostgresPatientsRepository.findAll.
        const ids = [...new Set(appointments.map((a) => a.patientId))];
        if (ids.length === 0) {
            return [];
        }
        return this.patientsRepository.findAll({
            ids,
            includeDeleted: true,
            ...filters,
        });
    }
    async create(auth, payload) {
        if (!(0, permissions_1.roleHasPermissionKey)(auth.role, "PATIENT_CREATE")) {
            if ((0, clinicalDataScope_1.isDoctorScopedRole)(auth.role)) {
                throw new errorHandler_1.ApiError(403, "Врачи и медсёстры не могут создавать карточки пациентов");
            }
            throw new errorHandler_1.ApiError(403, "Недостаточно прав для этого действия");
        }
        const fullName = normalizeTrimmedString(payload.fullName) ?? payload.fullName;
        const phone = normalizePhone(payload.phone);
        const notesNorm = payload.notes === undefined || payload.notes === null
            ? null
            : (normalizeTrimmedString(payload.notes) || null);
        const normalizedPayload = {
            ...payload,
            fullName,
            phone: phone ?? null,
            birthDate: payload.birthDate ?? null,
            gender: payload.gender ?? null,
            source: payload.source ?? null,
            notes: notesNorm,
        };
        return this.patientsRepository.create(normalizedPayload);
    }
    async getById(auth, id) {
        const patient = await this.patientsRepository.findById(id);
        if (!patient) {
            return null;
        }
        if (!(0, clinicalDataScope_1.isDoctorScopedRole)(auth.role)) {
            if (auth.role === "cashier") {
                return maskPatientForCashier(patient);
            }
            return patient;
        }
        const linked = await this.appointmentsRepository.findAll({
            doctorId: (0, clinicalDataScope_1.getEffectiveDoctorId)(auth),
            patientId: id,
        });
        if (linked.length === 0) {
            return null;
        }
        return patient;
    }
    async update(auth, id, payload) {
        if (!(0, permissions_1.roleHasPermissionKey)(auth.role, "PATIENT_UPDATE")) {
            if ((0, clinicalDataScope_1.isDoctorScopedRole)(auth.role)) {
                throw new errorHandler_1.ApiError(403, "Врачи и медсёстры не могут редактировать демографию пациентов");
            }
            throw new errorHandler_1.ApiError(403, "Недостаточно прав для этого действия");
        }
        const normalizedPayload = {
            ...payload,
        };
        if (payload.fullName !== undefined) {
            normalizedPayload.fullName =
                normalizeTrimmedString(payload.fullName) ?? payload.fullName;
        }
        if (payload.phone !== undefined) {
            normalizedPayload.phone = normalizePhone(payload.phone);
        }
        if (payload.source !== undefined) {
            normalizedPayload.source = payload.source;
        }
        if (payload.notes !== undefined) {
            normalizedPayload.notes =
                payload.notes === null ? null : normalizeTrimmedString(payload.notes) || null;
        }
        return this.patientsRepository.update(id, normalizedPayload);
    }
    async delete(auth, id) {
        if (!(0, permissions_1.roleHasPermissionKey)(auth.role, "PATIENT_DELETE")) {
            if ((0, clinicalDataScope_1.isDoctorScopedRole)(auth.role)) {
                throw new errorHandler_1.ApiError(403, "Врачи и медсёстры не могут архивировать пациентов");
            }
            throw new errorHandler_1.ApiError(403, "Недостаточно прав для этого действия");
        }
        return this.patientsRepository.delete(id);
    }
}
exports.PatientsService = PatientsService;
