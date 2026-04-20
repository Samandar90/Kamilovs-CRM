import {
  type IPatientsRepository,
} from "../repositories/interfaces/IPatientsRepository";
import {
  type IAppointmentsRepository,
} from "../repositories/interfaces/IAppointmentsRepository";
import type {
  Patient,
  PatientCreateInput,
  PatientUpdateInput,
} from "../repositories/interfaces/coreTypes";
import type { AuthTokenPayload } from "../repositories/interfaces/userTypes";
import { roleHasPermissionKey } from "../auth/permissions";
import { ApiError } from "../middleware/errorHandler";
import { getEffectiveDoctorId, isDoctorScopedRole } from "./clinicalDataScope";

const normalizeTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim();
};

const normalizePhone = (phone: string | null | undefined): string | null => {
  if (phone === undefined || phone === null) return null;
  // Keep leading plus, drop separators and spaces.
  return phone.trim().replace(/(?!^\+)[^\d]/g, "");
};

const maskPatientForCashier = (patient: Patient): Patient => ({
  id: patient.id,
  fullName: patient.fullName,
  phone: patient.phone,
  gender: null,
  birthDate: null,
  source: null,
  notes: null,
  createdAt: patient.createdAt,
});

export class PatientsService {
  constructor(
    private readonly patientsRepository: IPatientsRepository,
    private readonly appointmentsRepository: IAppointmentsRepository
  ) {}

  async list(
    auth: AuthTokenPayload,
    options?: { search?: string }
  ): Promise<Patient[]> {
    const search = normalizeTrimmedString(options?.search);
    const filters = search ? { search } : {};

    if (search) {
      if (isDoctorScopedRole(auth.role)) {
        const appointments = await this.appointmentsRepository.findAll({
          doctorId: getEffectiveDoctorId(auth),
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

    if (!isDoctorScopedRole(auth.role)) {
      const rows = await this.patientsRepository.findAll(filters);
      if (auth.role === "cashier") {
        return rows.map(maskPatientForCashier);
      }
      return rows;
    }
    const appointments = await this.appointmentsRepository.findAll({
      doctorId: getEffectiveDoctorId(auth),
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

  async create(auth: AuthTokenPayload, payload: PatientCreateInput): Promise<Patient> {
    if (!roleHasPermissionKey(auth.role, "PATIENT_CREATE")) {
      if (isDoctorScopedRole(auth.role)) {
        throw new ApiError(403, "Врачи и медсёстры не могут создавать карточки пациентов");
      }
      throw new ApiError(403, "Недостаточно прав для этого действия");
    }
    const fullName = normalizeTrimmedString(payload.fullName) ?? payload.fullName;
    const phone = normalizePhone(payload.phone);

    const notesNorm =
      payload.notes === undefined || payload.notes === null
        ? null
        : (normalizeTrimmedString(payload.notes) || null);

    const normalizedPayload: PatientCreateInput = {
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

  async getById(auth: AuthTokenPayload, id: number): Promise<Patient | null> {
    const patient = await this.patientsRepository.findById(id);
    if (!patient) {
      return null;
    }
    if (!isDoctorScopedRole(auth.role)) {
      if (auth.role === "cashier") {
        return maskPatientForCashier(patient);
      }
      return patient;
    }
    const linked = await this.appointmentsRepository.findAll({
      doctorId: getEffectiveDoctorId(auth),
      patientId: id,
    });
    if (linked.length === 0) {
      return null;
    }
    return patient;
  }

  async update(
    auth: AuthTokenPayload,
    id: number,
    payload: PatientUpdateInput
  ): Promise<Patient | null> {
    if (!roleHasPermissionKey(auth.role, "PATIENT_UPDATE")) {
      if (isDoctorScopedRole(auth.role)) {
        throw new ApiError(403, "Врачи и медсёстры не могут редактировать демографию пациентов");
      }
      throw new ApiError(403, "Недостаточно прав для этого действия");
    }
    const normalizedPayload: PatientUpdateInput = {
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

  async delete(auth: AuthTokenPayload, id: number): Promise<boolean> {
    if (!roleHasPermissionKey(auth.role, "PATIENT_DELETE")) {
      if (isDoctorScopedRole(auth.role)) {
        throw new ApiError(403, "Врачи и медсёстры не могут архивировать пациентов");
      }
      throw new ApiError(403, "Недостаточно прав для этого действия");
    }
    return this.patientsRepository.delete(id);
  }
}

