"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToggleTwoFactorBody = exports.validateChangeUserPassword = exports.validateUpdateUser = exports.validateCreateUser = exports.validateUserIdParam = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const userTypes_1 = require("../repositories/interfaces/userTypes");
const parsePositiveInteger = (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
};
const validateUserIdParam = (req, _res, next) => {
    if (!parsePositiveInteger(req.params.id)) {
        throw new errorHandler_1.ApiError(400, "Path param 'id' must be a positive integer");
    }
    next();
};
exports.validateUserIdParam = validateUserIdParam;
const validateRole = (role, isOptional) => {
    if (role === undefined && isOptional)
        return;
    if (typeof role !== "string" ||
        !userTypes_1.USER_MANAGEMENT_ROLES.includes(role)) {
        throw new errorHandler_1.ApiError(400, `Field 'role' must be one of: ${userTypes_1.USER_MANAGEMENT_ROLES.join(", ")}`);
    }
};
const validateCreateUser = (req, _res, next) => {
    const { username, password, role, isActive, is_active, fullName, full_name, doctorId, doctor_id, } = req.body ?? {};
    if (typeof username !== "string" || username.trim() === "") {
        throw new errorHandler_1.ApiError(400, "Field 'username' is required");
    }
    if (typeof password !== "string" || password.length < 6) {
        throw new errorHandler_1.ApiError(400, "Field 'password' must be at least 6 characters");
    }
    const resolvedFullName = typeof fullName === "string" ? fullName : full_name;
    if (typeof resolvedFullName !== "string" || resolvedFullName.trim() === "") {
        throw new errorHandler_1.ApiError(400, "Field 'full_name' is required");
    }
    validateRole(role, false);
    if (role === "doctor" || role === "nurse") {
        const raw = doctorId ?? doctor_id;
        if (raw === undefined || raw === null || raw === "") {
            throw new errorHandler_1.ApiError(400, "Для роли врач или медсестра обязателен doctor_id");
        }
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0) {
            throw new errorHandler_1.ApiError(400, "Поле doctor_id должно быть положительным целым числом");
        }
    }
    const resolvedIsActive = isActive ?? is_active;
    if (resolvedIsActive !== undefined && typeof resolvedIsActive !== "boolean") {
        throw new errorHandler_1.ApiError(400, "Field 'isActive' must be boolean");
    }
    next();
};
exports.validateCreateUser = validateCreateUser;
const validateUpdateUser = (req, _res, next) => {
    const { role, isActive, is_active, fullName, full_name, doctorId, doctor_id } = req.body ?? {};
    const resolvedFullName = fullName ?? full_name;
    if (resolvedFullName !== undefined &&
        (typeof resolvedFullName !== "string" || resolvedFullName.trim() === "")) {
        throw new errorHandler_1.ApiError(400, "Field 'full_name' must be non-empty string");
    }
    validateRole(role, true);
    const rawDoctor = doctorId ?? doctor_id;
    if (rawDoctor !== undefined && rawDoctor !== null && rawDoctor !== "") {
        const id = Number(rawDoctor);
        if (!Number.isInteger(id) || id <= 0) {
            throw new errorHandler_1.ApiError(400, "Поле doctor_id должно быть положительным целым числом");
        }
    }
    const resolvedIsActive = isActive ?? is_active;
    if (resolvedIsActive !== undefined && typeof resolvedIsActive !== "boolean") {
        throw new errorHandler_1.ApiError(400, "Field 'isActive' must be boolean");
    }
    next();
};
exports.validateUpdateUser = validateUpdateUser;
const validateChangeUserPassword = (req, _res, next) => {
    const { password } = req.body ?? {};
    if (typeof password !== "string" || password.length < 6) {
        throw new errorHandler_1.ApiError(400, "Field 'password' must be at least 6 characters");
    }
    next();
};
exports.validateChangeUserPassword = validateChangeUserPassword;
const validateToggleTwoFactorBody = (req, _res, next) => {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
        throw new errorHandler_1.ApiError(400, "Field 'enabled' must be boolean");
    }
    next();
};
exports.validateToggleTwoFactorBody = validateToggleTwoFactorBody;
