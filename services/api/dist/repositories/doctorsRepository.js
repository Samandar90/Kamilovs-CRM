"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockDoctorsRepository = void 0;
const mockDatabase_1 = require("./mockDatabase");
const toDoctor = (row) => {
    const serviceIds = (0, mockDatabase_1.getMockDb)()
        .doctorServices.filter((item) => item.doctorId === row.id)
        .map((item) => item.serviceId);
    return { ...row, serviceIds };
};
class MockDoctorsRepository {
    async findAll() {
        return [...(0, mockDatabase_1.getMockDb)().doctors]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(toDoctor);
    }
    async findById(id) {
        const doctor = (0, mockDatabase_1.getMockDb)().doctors.find((item) => item.id === id);
        return doctor ? toDoctor(doctor) : null;
    }
    async create(payload) {
        const { serviceIds = [], ...doctorData } = payload;
        const created = {
            id: (0, mockDatabase_1.nextId)(),
            createdAt: new Date().toISOString(),
            ...doctorData,
        };
        const db = (0, mockDatabase_1.getMockDb)();
        db.doctors.push(created);
        db.doctorServices = db.doctorServices.filter((item) => item.doctorId !== created.id);
        serviceIds.forEach((serviceId) => {
            db.doctorServices.push({ doctorId: created.id, serviceId });
        });
        return toDoctor(created);
    }
    async update(id, payload) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.doctors.findIndex((item) => item.id === id);
        if (idx < 0)
            return null;
        const { serviceIds, ...doctorData } = payload;
        db.doctors[idx] = { ...db.doctors[idx], ...doctorData };
        if (serviceIds !== undefined) {
            db.doctorServices = db.doctorServices.filter((item) => item.doctorId !== id);
            serviceIds.forEach((serviceId) => {
                db.doctorServices.push({ doctorId: id, serviceId });
            });
        }
        return toDoctor(db.doctors[idx]);
    }
    async delete(id) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.doctors.findIndex((item) => item.id === id);
        if (idx < 0)
            return false;
        db.doctors[idx] = { ...db.doctors[idx], active: false };
        return true;
    }
}
exports.MockDoctorsRepository = MockDoctorsRepository;
