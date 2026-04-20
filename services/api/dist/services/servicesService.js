"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServicesService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const numbers_1 = require("../utils/numbers");
class ServicesService {
    constructor(servicesRepository) {
        this.servicesRepository = servicesRepository;
    }
    async list(auth, filters = {}) {
        const effective = { ...filters };
        if (auth.role === "doctor") {
            if (auth.doctorId == null) {
                throw new errorHandler_1.ApiError(403, "Account is not linked to a doctor profile");
            }
            effective.doctorId = auth.doctorId;
            effective.activeOnly = true;
        }
        else if (auth.role === "nurse") {
            if (auth.nurseDoctorId == null) {
                throw new errorHandler_1.ApiError(403, "Медсестра не привязана к врачу");
            }
            effective.doctorId = auth.nurseDoctorId;
            effective.activeOnly = true;
        }
        else if (effective.doctorId !== undefined) {
            effective.activeOnly = true;
        }
        return this.servicesRepository.findAll(effective);
    }
    async getById(auth, id) {
        const row = await this.servicesRepository.findById(id);
        if (!row) {
            return null;
        }
        if (auth.role === "doctor") {
            if (auth.doctorId == null) {
                throw new errorHandler_1.ApiError(403, "Account is not linked to a doctor profile");
            }
            const assigned = await this.servicesRepository.isServiceAssignedToDoctor(id, auth.doctorId);
            return assigned ? row : null;
        }
        if (auth.role === "nurse") {
            if (auth.nurseDoctorId == null) {
                throw new errorHandler_1.ApiError(403, "Медсестра не привязана к врачу");
            }
            const assigned = await this.servicesRepository.isServiceAssignedToDoctor(id, auth.nurseDoctorId);
            return assigned ? row : null;
        }
        return row;
    }
    async create(_auth, payload) {
        const price = (0, numbers_1.parseRequiredMoney)(payload.price, "price");
        const d = (0, numbers_1.parseNumericInput)(payload.duration);
        if (d === null || d <= 0) {
            throw new errorHandler_1.ApiError(400, "Поле «длительность» должно быть положительным числом");
        }
        const duration = Math.round(d);
        return this.servicesRepository.create({
            ...payload,
            price,
            duration,
        });
    }
    async update(_auth, id, payload) {
        const next = { ...payload };
        if (payload.price !== undefined) {
            next.price = (0, numbers_1.parseRequiredMoney)(payload.price, "price");
        }
        if (payload.duration !== undefined) {
            const d = (0, numbers_1.parseNumericInput)(payload.duration);
            if (d === null || d <= 0) {
                throw new errorHandler_1.ApiError(400, "Поле «длительность» должно быть положительным числом");
            }
            next.duration = Math.round(d);
        }
        return this.servicesRepository.update(id, next);
    }
    async delete(_auth, id) {
        return this.servicesRepository.delete(id);
    }
    async isServiceAssignedToDoctor(_auth, serviceId, doctorId) {
        return this.servicesRepository.isServiceAssignedToDoctor(serviceId, doctorId);
    }
}
exports.ServicesService = ServicesService;
