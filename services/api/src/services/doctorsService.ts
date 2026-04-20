import {
  type IDoctorsRepository,
} from "../repositories/interfaces/IDoctorsRepository";
import { type IServicesRepository } from "../repositories/interfaces/IServicesRepository";
import type {
  Doctor,
  DoctorCreateInput,
  DoctorUpdateInput,
} from "../repositories/interfaces/coreTypes";
import type { AuthTokenPayload } from "../repositories/interfaces/userTypes";
import { ApiError } from "../middleware/errorHandler";

const validateServiceLinks = async (
  servicesRepository: IServicesRepository,
  serviceIds: number[] | undefined
): Promise<void> => {
  if (serviceIds === undefined) {
    return;
  }
  for (const serviceId of serviceIds) {
    const service = await servicesRepository.findById(serviceId);
    if (!service) {
      throw new ApiError(400, `Service with id ${serviceId} does not exist`);
    }
  }
};

export class DoctorsService {
  constructor(
    private readonly doctorsRepository: IDoctorsRepository,
    private readonly servicesRepository: IServicesRepository
  ) {}

  async list(auth: AuthTokenPayload): Promise<Doctor[]> {
    if (auth.role === "doctor") {
      if (auth.doctorId == null) {
        throw new ApiError(403, "Account is not linked to a doctor profile");
      }
      const self = await this.doctorsRepository.findById(auth.doctorId);
      return self ? [self] : [];
    }
    if (auth.role === "nurse") {
      if (auth.nurseDoctorId == null) {
        throw new ApiError(403, "Медсестра не привязана к врачу");
      }
      const supervisor = await this.doctorsRepository.findById(auth.nurseDoctorId);
      return supervisor ? [supervisor] : [];
    }
    return this.doctorsRepository.findAll();
  }

  async getById(auth: AuthTokenPayload, id: number): Promise<Doctor | null> {
    if (auth.role === "doctor") {
      if (auth.doctorId == null) {
        throw new ApiError(403, "Account is not linked to a doctor profile");
      }
      if (id !== auth.doctorId) {
        return null;
      }
    }
    if (auth.role === "nurse") {
      if (auth.nurseDoctorId == null) {
        throw new ApiError(403, "Медсестра не привязана к врачу");
      }
      if (id !== auth.nurseDoctorId) {
        return null;
      }
    }
    return this.doctorsRepository.findById(id);
  }

  async create(_auth: AuthTokenPayload, payload: DoctorCreateInput): Promise<Doctor> {
    await validateServiceLinks(this.servicesRepository, payload.serviceIds);
    return this.doctorsRepository.create(payload);
  }

  async update(
    _auth: AuthTokenPayload,
    id: number,
    payload: DoctorUpdateInput
  ): Promise<Doctor | null> {
    await validateServiceLinks(this.servicesRepository, payload.serviceIds);
    return this.doctorsRepository.update(id, payload);
  }

  async delete(_auth: AuthTokenPayload, id: number): Promise<boolean> {
    return this.doctorsRepository.delete(id);
  }
}

