"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const userTypes_1 = require("../repositories/interfaces/userTypes");
const password_1 = require("../utils/password");
const userSanitizer_1 = require("../utils/userSanitizer");
const isRoleValid = (role) => {
    return userTypes_1.USER_MANAGEMENT_ROLES.includes(role);
};
class UsersService {
    constructor(usersRepository, doctorsRepository, nursesRepository) {
        this.usersRepository = usersRepository;
        this.doctorsRepository = doctorsRepository;
        this.nursesRepository = nursesRepository;
    }
    async enrichPublicUser(user) {
        const base = (0, userSanitizer_1.toPublicUser)(user);
        if (user.role !== "nurse") {
            return base;
        }
        const nid = await this.nursesRepository.findDoctorIdByUserId(user.id);
        return { ...base, nurseDoctorId: nid };
    }
    async getAllUsers(_auth, filters = {}) {
        try {
            const users = await this.usersRepository.findAll(filters);
            const out = [];
            for (const u of users) {
                out.push(await this.enrichPublicUser(u));
            }
            return out;
        }
        catch (_error) {
            throw new errorHandler_1.ApiError(500, "Ошибка загрузки пользователей");
        }
    }
    async getUserById(_auth, id) {
        const user = await this.usersRepository.findById(id);
        return user ? await this.enrichPublicUser(user) : null;
    }
    async createUser(_auth, data) {
        if (_auth.role !== "superadmin") {
            throw new errorHandler_1.ApiError(403, "Only superadmin can create users");
        }
        if (!isRoleValid(data.role)) {
            throw new errorHandler_1.ApiError(400, "Invalid user role");
        }
        if (typeof data.password !== "string" || data.password.length < 6) {
            throw new errorHandler_1.ApiError(400, "Password must be at least 6 characters");
        }
        if (data.role === "doctor") {
            if (data.doctorId == null || !Number.isInteger(data.doctorId) || data.doctorId <= 0) {
                throw new errorHandler_1.ApiError(400, "Для роли врач обязательно поле doctor_id");
            }
            const doctor = await this.doctorsRepository.findById(data.doctorId);
            if (!doctor) {
                throw new errorHandler_1.ApiError(400, "Врач с указанным doctor_id не найден");
            }
            const taken = await this.usersRepository.findActiveDoctorUserIdByDoctorProfile(data.doctorId);
            if (taken !== null) {
                throw new errorHandler_1.ApiError(409, "На выбранного врача уже заведён пользователь с ролью врач");
            }
        }
        if (data.role === "nurse") {
            if (data.doctorId == null || !Number.isInteger(data.doctorId) || data.doctorId <= 0) {
                throw new errorHandler_1.ApiError(400, "Для роли медсестра обязательно поле doctor_id");
            }
            const doctor = await this.doctorsRepository.findById(data.doctorId);
            if (!doctor) {
                throw new errorHandler_1.ApiError(400, "Врач с указанным doctor_id не найден");
            }
        }
        const existing = await this.usersRepository.findByUsernameIncludingInactive(data.username);
        if (existing) {
            throw new errorHandler_1.ApiError(409, "Username already exists");
        }
        const created = await this.usersRepository.create({
            username: data.username,
            password: await (0, password_1.hashPassword)(data.password),
            fullName: data.fullName,
            role: data.role,
            isActive: data.isActive ?? true,
            doctorId: data.role === "doctor" ? data.doctorId : null,
        });
        if (data.role === "nurse") {
            await this.nursesRepository.upsert(created.id, data.doctorId);
            return { ...(0, userSanitizer_1.toPublicUser)(created), nurseDoctorId: data.doctorId };
        }
        return (0, userSanitizer_1.toPublicUser)(created);
    }
    async updateUser(_auth, id, data) {
        if (_auth.role !== "superadmin") {
            throw new errorHandler_1.ApiError(403, "Only superadmin can update users");
        }
        const current = await this.usersRepository.findById(id);
        if (!current)
            return null;
        if (data.role !== undefined && !isRoleValid(data.role)) {
            throw new errorHandler_1.ApiError(400, "Invalid user role");
        }
        if (data.fullName !== undefined && data.fullName.trim() === "") {
            throw new errorHandler_1.ApiError(400, "Field 'fullName' must be non-empty string");
        }
        const nextRole = data.role ?? current.role;
        let nurseDoctorToBind = null;
        if (nextRole === "nurse") {
            const raw = data.doctorId !== undefined
                ? data.doctorId
                : await this.nursesRepository.findDoctorIdByUserId(id);
            if (raw == null || !Number.isInteger(raw) || raw <= 0) {
                throw new errorHandler_1.ApiError(400, "Для роли медсестра укажите doctor_id");
            }
            const d = await this.doctorsRepository.findById(raw);
            if (!d) {
                throw new errorHandler_1.ApiError(400, "Врач с указанным doctor_id не найден");
            }
            nurseDoctorToBind = raw;
        }
        const patch = { ...data };
        if (nextRole === "doctor") {
            const rawDoctorId = data.doctorId !== undefined ? data.doctorId : current.doctorId ?? null;
            if (rawDoctorId == null || !Number.isInteger(rawDoctorId) || rawDoctorId <= 0) {
                throw new errorHandler_1.ApiError(400, "Для роли врач укажите doctor_id (профиль врача)");
            }
            const doctor = await this.doctorsRepository.findById(rawDoctorId);
            if (!doctor) {
                throw new errorHandler_1.ApiError(400, "Врач с указанным doctor_id не найден");
            }
            const taken = await this.usersRepository.findActiveDoctorUserIdByDoctorProfile(rawDoctorId, id);
            if (taken !== null) {
                throw new errorHandler_1.ApiError(409, "На выбранного врача уже заведён другой пользователь с ролью врач");
            }
            patch.doctorId = rawDoctorId;
        }
        else if (current.role === "doctor") {
            patch.doctorId = null;
        }
        const updated = await this.usersRepository.update(id, patch);
        if (!updated)
            return null;
        if (nextRole === "nurse") {
            await this.nursesRepository.upsert(id, nurseDoctorToBind);
        }
        else if (current.role === "nurse") {
            await this.nursesRepository.deleteByUserId(id);
        }
        return this.enrichPublicUser(updated);
    }
    async deleteUser(_auth, id) {
        if (_auth.role !== "superadmin") {
            throw new errorHandler_1.ApiError(403, "Only superadmin can delete users");
        }
        await this.nursesRepository.deleteByUserId(id);
        return this.usersRepository.delete(id);
    }
    async toggleUserActive(_auth, id) {
        if (_auth.role !== "superadmin") {
            throw new errorHandler_1.ApiError(403, "Only superadmin can toggle user activity");
        }
        const updated = await this.usersRepository.toggleActive(id);
        return updated ? await this.enrichPublicUser(updated) : null;
    }
    async changeUserPassword(_auth, id, newPassword) {
        if (_auth.role !== "superadmin") {
            throw new errorHandler_1.ApiError(403, "Only superadmin can change user passwords");
        }
        if (typeof newPassword !== "string" || newPassword.length < 6) {
            throw new errorHandler_1.ApiError(400, "Password must be at least 6 characters");
        }
        const updated = await this.usersRepository.updatePassword(id, await (0, password_1.hashPassword)(newPassword));
        return updated ? await this.enrichPublicUser(updated) : null;
    }
}
exports.UsersService = UsersService;
