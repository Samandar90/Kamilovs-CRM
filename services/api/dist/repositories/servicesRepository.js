"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockServicesRepository = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const mockDatabase_1 = require("./mockDatabase");
const collectDoctorIds = (serviceId) => [...new Set((0, mockDatabase_1.getMockDb)().doctorServices.filter((r) => r.serviceId === serviceId).map((r) => r.doctorId))].sort((a, b) => a - b);
const toService = (row) => ({
    ...row,
    doctorIds: collectDoctorIds(row.id),
});
const assertMockDoctorsExist = (doctorIds) => {
    const db = (0, mockDatabase_1.getMockDb)();
    for (const id of new Set(doctorIds)) {
        if (!db.doctors.some((d) => d.id === id)) {
            throw new errorHandler_1.ApiError(400, "One or more doctorIds are invalid or deleted");
        }
    }
};
class MockServicesRepository {
    async findAll(filters = {}) {
        let rows = [...(0, mockDatabase_1.getMockDb)().services];
        if (filters.activeOnly === true) {
            rows = rows.filter((row) => row.active);
        }
        if (filters.doctorId !== undefined) {
            const linkedServiceIds = new Set((0, mockDatabase_1.getMockDb)()
                .doctorServices.filter((row) => row.doctorId === filters.doctorId)
                .map((row) => row.serviceId));
            rows = rows.filter((row) => linkedServiceIds.has(row.id));
        }
        return rows.sort((a, b) => a.name.localeCompare(b.name)).map(toService);
    }
    async findById(id) {
        const found = (0, mockDatabase_1.getMockDb)().services.find((item) => item.id === id);
        return found ? toService(found) : null;
    }
    async create(payload) {
        const { doctorIds = [], ...rest } = payload;
        assertMockDoctorsExist(doctorIds);
        const created = {
            id: (0, mockDatabase_1.nextId)(),
            createdAt: new Date().toISOString(),
            ...rest,
        };
        (0, mockDatabase_1.getMockDb)().services.push(created);
        const db = (0, mockDatabase_1.getMockDb)();
        for (const doctorId of [...new Set(doctorIds)].sort((a, b) => a - b)) {
            db.doctorServices.push({ doctorId, serviceId: created.id });
        }
        return toService(created);
    }
    async update(id, payload) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.services.findIndex((item) => item.id === id);
        if (idx < 0)
            return null;
        const { doctorIds, ...scalarPart } = payload;
        if (doctorIds !== undefined) {
            assertMockDoctorsExist(doctorIds);
        }
        if (Object.keys(scalarPart).length > 0) {
            db.services[idx] = { ...db.services[idx], ...scalarPart };
        }
        if (doctorIds !== undefined) {
            db.doctorServices = db.doctorServices.filter((item) => item.serviceId !== id);
            for (const doctorId of [...new Set(doctorIds)].sort((a, b) => a - b)) {
                db.doctorServices.push({ doctorId, serviceId: id });
            }
        }
        return toService(db.services[idx]);
    }
    async delete(id) {
        const db = (0, mockDatabase_1.getMockDb)();
        const before = db.services.length;
        db.services = db.services.filter((item) => item.id !== id);
        db.doctorServices = db.doctorServices.filter((item) => item.serviceId !== id);
        return db.services.length < before;
    }
    async isServiceAssignedToDoctor(serviceId, doctorId) {
        return (0, mockDatabase_1.getMockDb)().doctorServices.some((row) => row.serviceId === serviceId && row.doctorId === doctorId);
    }
}
exports.MockServicesRepository = MockServicesRepository;
