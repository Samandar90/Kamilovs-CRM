"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoctorsService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const validateServiceLinks = async (servicesRepository, serviceIds) => {
    if (serviceIds === undefined) {
        return;
    }
    for (const serviceId of serviceIds) {
        const service = await servicesRepository.findById(serviceId);
        if (!service) {
            throw new errorHandler_1.ApiError(400, `Service with id ${serviceId} does not exist`);
        }
    }
};
class DoctorsService {
    constructor(doctorsRepository, servicesRepository) {
        this.doctorsRepository = doctorsRepository;
        this.servicesRepository = servicesRepository;
    }
    async list(auth) {
        if (auth.role === "doctor") {
            if (auth.doctorId == null) {
                throw new errorHandler_1.ApiError(403, "Account is not linked to a doctor profile");
            }
            const self = await this.doctorsRepository.findById(auth.doctorId);
            return self ? [self] : [];
        }
        if (auth.role === "nurse") {
            if (auth.nurseDoctorId == null) {
                throw new errorHandler_1.ApiError(403, "Медсестра не привязана к врачу");
            }
            const supervisor = await this.doctorsRepository.findById(auth.nurseDoctorId);
            return supervisor ? [supervisor] : [];
        }
        return this.doctorsRepository.findAll();
    }
    async getById(auth, id) {
        if (auth.role === "doctor") {
            if (auth.doctorId == null) {
                throw new errorHandler_1.ApiError(403, "Account is not linked to a doctor profile");
            }
            if (id !== auth.doctorId) {
                return null;
            }
        }
        if (auth.role === "nurse") {
            if (auth.nurseDoctorId == null) {
                throw new errorHandler_1.ApiError(403, "Медсестра не привязана к врачу");
            }
            if (id !== auth.nurseDoctorId) {
                return null;
            }
        }
        return this.doctorsRepository.findById(id);
    }
    async create(_auth, payload) {
        await validateServiceLinks(this.servicesRepository, payload.serviceIds);
        return this.doctorsRepository.create(payload);
    }
    async update(_auth, id, payload) {
        await validateServiceLinks(this.servicesRepository, payload.serviceIds);
        return this.doctorsRepository.update(id, payload);
    }
    async delete(_auth, id) {
        return this.doctorsRepository.delete(id);
    }
}
exports.DoctorsService = DoctorsService;
