"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockPatientsRepository = void 0;
const mockDatabase_1 = require("./mockDatabase");
const toPatient = (row) => ({
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    gender: row.gender,
    birthDate: row.birthDate,
    source: row.source ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
});
const isActive = (row) => row.deletedAt === null;
const PATIENT_SEARCH_LIMIT = 20;
const matchesPatientSearch = (row, term) => {
    const q = term.trim().toLowerCase();
    if (!q)
        return true;
    const name = row.fullName.toLowerCase();
    const phone = (row.phone ?? "").toLowerCase();
    return name.includes(q) || phone.includes(q);
};
class MockPatientsRepository {
    async findAll(filters = {}) {
        let rows = [...(0, mockDatabase_1.getMockDb)().patients];
        const includeDeleted = filters.includeDeleted === true;
        const searchTerm = typeof filters.search === "string" ? filters.search.trim() : "";
        const hasSearch = searchTerm.length > 0;
        if (!includeDeleted || hasSearch) {
            rows = rows.filter(isActive);
        }
        if (filters.ids !== undefined) {
            const allowed = new Set(filters.ids);
            rows = rows.filter((row) => allowed.has(row.id));
        }
        if (hasSearch) {
            rows = rows.filter((row) => matchesPatientSearch(row, searchTerm));
        }
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (hasSearch) {
            rows = rows.slice(0, PATIENT_SEARCH_LIMIT);
        }
        return rows.map(toPatient);
    }
    async findById(id) {
        const found = (0, mockDatabase_1.getMockDb)().patients.find((item) => item.id === id);
        return found ? toPatient(found) : null;
    }
    async create(payload) {
        const created = {
            id: (0, mockDatabase_1.nextId)(),
            fullName: payload.fullName,
            phone: payload.phone,
            gender: payload.gender,
            birthDate: payload.birthDate,
            source: payload.source ?? null,
            notes: payload.notes ?? null,
            createdAt: new Date().toISOString(),
            deletedAt: null,
        };
        (0, mockDatabase_1.getMockDb)().patients.push(created);
        return toPatient(created);
    }
    async update(id, payload) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.patients.findIndex((item) => item.id === id);
        if (idx < 0)
            return null;
        if (!isActive(db.patients[idx]))
            return null;
        db.patients[idx] = { ...db.patients[idx], ...payload };
        return toPatient(db.patients[idx]);
    }
    async delete(id) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.patients.findIndex((item) => item.id === id);
        if (idx < 0)
            return false;
        if (!isActive(db.patients[idx]))
            return false;
        db.patients[idx] = {
            ...db.patients[idx],
            deletedAt: new Date().toISOString(),
        };
        return true;
    }
}
exports.MockPatientsRepository = MockPatientsRepository;
