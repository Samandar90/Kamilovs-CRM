"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockAppointmentsRepository = exports.APPOINTMENT_STATUSES = void 0;
const coreTypes_1 = require("./interfaces/coreTypes");
Object.defineProperty(exports, "APPOINTMENT_STATUSES", { enumerable: true, get: function () { return coreTypes_1.APPOINTMENT_STATUSES; } });
const mockDatabase_1 = require("./mockDatabase");
const toAppointment = (row) => ({ ...row });
class MockAppointmentsRepository {
    async findAll(filters = {}) {
        return (0, mockDatabase_1.getMockDb)()
            .appointments.filter((row) => {
            if (filters.patientId !== undefined && row.patientId !== filters.patientId)
                return false;
            if (filters.doctorId !== undefined && row.doctorId !== filters.doctorId)
                return false;
            if (filters.serviceId !== undefined && row.serviceId !== filters.serviceId)
                return false;
            if (filters.status !== undefined && row.status !== filters.status)
                return false;
            if (filters.startFrom !== undefined && row.startAt < filters.startFrom)
                return false;
            const upper = filters.startTo ?? filters.endTo;
            if (upper !== undefined && row.startAt > upper)
                return false;
            return true;
        })
            .sort((a, b) => b.startAt.localeCompare(a.startAt))
            .map(toAppointment);
    }
    async findById(id) {
        const found = (0, mockDatabase_1.getMockDb)().appointments.find((item) => item.id === id);
        return found ? toAppointment(found) : null;
    }
    async create(input) {
        const now = new Date().toISOString();
        const created = {
            id: (0, mockDatabase_1.nextId)(),
            patientId: input.patientId,
            doctorId: input.doctorId,
            serviceId: input.serviceId,
            price: input.price ?? null,
            startAt: input.startAt,
            endAt: input.endAt,
            status: input.status,
            cancelReason: input.cancelReason ?? null,
            cancelledAt: null,
            cancelledBy: null,
            diagnosis: input.diagnosis ?? null,
            treatment: input.treatment ?? null,
            notes: input.notes ?? null,
            createdAt: now,
            updatedAt: now,
        };
        (0, mockDatabase_1.getMockDb)().appointments.push(created);
        return toAppointment(created);
    }
    async update(id, input) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.appointments.findIndex((item) => item.id === id);
        if (idx < 0)
            return null;
        db.appointments[idx] = { ...db.appointments[idx], ...input, updatedAt: new Date().toISOString() };
        return toAppointment(db.appointments[idx]);
    }
    async updatePrice(id, price) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.appointments.findIndex((item) => item.id === id);
        if (idx < 0)
            return null;
        db.appointments[idx] = { ...db.appointments[idx], price, updatedAt: new Date().toISOString() };
        return toAppointment(db.appointments[idx]);
    }
    async cancel(id, cancelReason, cancelledBy) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.appointments.findIndex((item) => item.id === id);
        if (idx < 0)
            return null;
        db.appointments[idx] = {
            ...db.appointments[idx],
            status: "cancelled",
            cancelReason,
            cancelledAt: new Date().toISOString(),
            cancelledBy,
            updatedAt: new Date().toISOString(),
        };
        return toAppointment(db.appointments[idx]);
    }
    async delete(id) {
        const db = (0, mockDatabase_1.getMockDb)();
        const before = db.appointments.length;
        db.appointments = db.appointments.filter((item) => item.id !== id);
        return db.appointments.length < before;
    }
    async findConflicting(doctorId, startAt, endAt, excludeAppointmentId) {
        const active = new Set([
            "scheduled",
            "confirmed",
            "arrived",
            "in_consultation",
        ]);
        return (0, mockDatabase_1.getMockDb)().appointments.some((row) => {
            if (row.doctorId !== doctorId)
                return false;
            if (excludeAppointmentId !== undefined && row.id === excludeAppointmentId)
                return false;
            if (!active.has(row.status))
                return false;
            return row.startAt < endAt && row.endAt > startAt;
        });
    }
    async patientExists(id) {
        return (0, mockDatabase_1.getMockDb)().patients.some((item) => item.id === id && item.deletedAt === null);
    }
    async doctorExists(id) {
        return (0, mockDatabase_1.getMockDb)().doctors.some((item) => item.id === id);
    }
    async serviceExists(id) {
        return (0, mockDatabase_1.getMockDb)().services.some((item) => item.id === id);
    }
    async isServiceActive(serviceId) {
        const found = (0, mockDatabase_1.getMockDb)().services.find((item) => item.id === serviceId);
        return found ? found.active === true : false;
    }
    async getServiceDuration(serviceId) {
        const found = (0, mockDatabase_1.getMockDb)().services.find((item) => item.id === serviceId);
        return found ? found.duration : null;
    }
    async getServicePrice(serviceId) {
        const found = (0, mockDatabase_1.getMockDb)().services.find((item) => item.id === serviceId);
        return found ? found.price : null;
    }
    async isServiceAssignedToDoctor(serviceId, doctorId) {
        return (0, mockDatabase_1.getMockDb)().doctorServices.some((item) => item.serviceId === serviceId && item.doctorId === doctorId);
    }
}
exports.MockAppointmentsRepository = MockAppointmentsRepository;
