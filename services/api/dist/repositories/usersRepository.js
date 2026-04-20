"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockUsersRepository = void 0;
const mockDatabase_1 = require("./mockDatabase");
const toUser = (record) => ({
    id: record.id,
    username: record.username,
    password: record.password,
    fullName: record.fullName,
    role: record.role,
    isActive: record.isActive,
    lastLoginAt: record.lastLoginAt ?? null,
    failedLoginAttempts: record.failedLoginAttempts ?? 0,
    lockedUntil: record.lockedUntil ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    ...(record.doctorId !== undefined && record.doctorId !== null
        ? { doctorId: record.doctorId }
        : {}),
});
class MockUsersRepository {
    async findAll(filters = {}) {
        const search = filters.search?.trim().toLowerCase();
        return (0, mockDatabase_1.getMockDb)()
            .users.filter((user) => {
            if (user.deletedAt)
                return false;
            if (filters.role !== undefined && user.role !== filters.role)
                return false;
            if (filters.isActive !== undefined && user.isActive !== filters.isActive)
                return false;
            if (search) {
                if (!user.username.toLowerCase().includes(search) &&
                    !user.fullName.toLowerCase().includes(search)) {
                    return false;
                }
            }
            return true;
        })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(toUser);
    }
    async findById(id) {
        const found = (0, mockDatabase_1.getMockDb)().users.find((user) => user.id === id && !user.deletedAt);
        return found ? toUser(found) : null;
    }
    async findByUsername(username) {
        const found = (0, mockDatabase_1.getMockDb)().users.find((user) => user.username.toLowerCase() === username.toLowerCase() && user.isActive
            && !user.deletedAt);
        return found ? toUser(found) : null;
    }
    async findByUsernameIncludingInactive(username) {
        const found = (0, mockDatabase_1.getMockDb)().users.find((user) => user.username.toLowerCase() === username.toLowerCase());
        return found ? toUser(found) : null;
    }
    async findActiveDoctorUserIdByDoctorProfile(doctorId, excludeUserId) {
        const found = (0, mockDatabase_1.getMockDb)().users.find((user) => !user.deletedAt &&
            user.role === "doctor" &&
            user.doctorId === doctorId &&
            (excludeUserId === undefined || user.id !== excludeUserId));
        return found ? found.id : null;
    }
    async create(data) {
        const now = new Date().toISOString();
        const created = {
            id: (0, mockDatabase_1.nextId)(),
            username: data.username,
            password: data.password,
            fullName: data.fullName,
            role: data.role,
            isActive: data.isActive ?? true,
            ...(data.role === "doctor" && data.doctorId != null ? { doctorId: data.doctorId } : {}),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        (0, mockDatabase_1.getMockDb)().users.push(created);
        return toUser(created);
    }
    async update(id, data) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.users.findIndex((user) => user.id === id);
        if (idx < 0)
            return null;
        const prev = db.users[idx];
        const merged = {
            ...prev,
            updatedAt: new Date().toISOString(),
        };
        if (data.fullName !== undefined)
            merged.fullName = data.fullName;
        if (data.role !== undefined)
            merged.role = data.role;
        if (data.isActive !== undefined)
            merged.isActive = data.isActive;
        if (data.doctorId !== undefined) {
            if (data.doctorId === null) {
                delete merged.doctorId;
            }
            else {
                merged.doctorId = data.doctorId;
            }
        }
        db.users[idx] = merged;
        return toUser(db.users[idx]);
    }
    async delete(id) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.users.findIndex((user) => user.id === id && !user.deletedAt);
        if (idx < 0)
            return false;
        db.users[idx] = {
            ...db.users[idx],
            deletedAt: new Date().toISOString(),
            isActive: false,
            updatedAt: new Date().toISOString(),
        };
        return true;
    }
    async toggleActive(id) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.users.findIndex((user) => user.id === id && !user.deletedAt);
        if (idx < 0)
            return null;
        db.users[idx] = {
            ...db.users[idx],
            isActive: !db.users[idx].isActive,
            updatedAt: new Date().toISOString(),
        };
        return toUser(db.users[idx]);
    }
    async updatePassword(id, passwordHash) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.users.findIndex((user) => user.id === id && !user.deletedAt);
        if (idx < 0)
            return null;
        db.users[idx] = {
            ...db.users[idx],
            password: passwordHash,
            updatedAt: new Date().toISOString(),
        };
        return toUser(db.users[idx]);
    }
    async updateSecurityState(id, patch) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.users.findIndex((user) => user.id === id && !user.deletedAt);
        if (idx < 0)
            return null;
        db.users[idx] = {
            ...db.users[idx],
            ...patch,
            updatedAt: new Date().toISOString(),
        };
        return toUser(db.users[idx]);
    }
}
exports.MockUsersRepository = MockUsersRepository;
