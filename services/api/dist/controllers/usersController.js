"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeUserPasswordController = exports.toggleUserActiveController = exports.deleteUserController = exports.updateUserController = exports.createUserController = exports.getUserByIdController = exports.listUsersController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const userTypes_1 = require("../repositories/interfaces/userTypes");
const parseRole = (value) => {
    if (typeof value !== "string")
        return undefined;
    return userTypes_1.USER_MANAGEMENT_ROLES.includes(value)
        ? value
        : undefined;
};
const parseDoctorIdBody = (body) => {
    const raw = body.doctorId ?? body.doctor_id;
    if (raw === undefined || raw === null || raw === "")
        return undefined;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0)
        return undefined;
    return id;
};
const listUsersController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const users = await container_1.services.users.getAllUsers(auth, {
        role: parseRole(req.query.role),
        isActive: typeof req.query.isActive === "string"
            ? req.query.isActive === "true"
            : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    return res.status(200).json(users);
};
exports.listUsersController = listUsersController;
const getUserByIdController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const user = await container_1.services.users.getUserById(auth, Number(req.params.id));
    if (!user)
        throw new errorHandler_1.ApiError(404, "User not found");
    return res.status(200).json(user);
};
exports.getUserByIdController = getUserByIdController;
const createUserController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const body = req.body ?? {};
    const doctorId = parseDoctorIdBody(body);
    const created = await container_1.services.users.createUser(auth, {
        username: body.username,
        password: body.password,
        fullName: body.fullName ?? body.full_name,
        role: body.role,
        isActive: body.isActive ?? body.is_active,
        ...(doctorId !== undefined ? { doctorId } : {}),
    });
    return res.status(201).json(created);
};
exports.createUserController = createUserController;
const updateUserController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const body = req.body ?? {};
    const doctorId = parseDoctorIdBody(body);
    const updated = await container_1.services.users.updateUser(auth, Number(req.params.id), {
        fullName: body.fullName ?? body.full_name,
        role: body.role,
        isActive: body.isActive ?? body.is_active,
        ...(doctorId !== undefined ? { doctorId } : {}),
    });
    if (!updated)
        throw new errorHandler_1.ApiError(404, "User not found");
    return res.status(200).json(updated);
};
exports.updateUserController = updateUserController;
const deleteUserController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const deleted = await container_1.services.users.deleteUser(auth, Number(req.params.id));
    if (!deleted)
        throw new errorHandler_1.ApiError(404, "User not found");
    return res.status(200).json({ success: true, id: Number(req.params.id) });
};
exports.deleteUserController = deleteUserController;
const toggleUserActiveController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const updated = await container_1.services.users.toggleUserActive(auth, Number(req.params.id));
    if (!updated)
        throw new errorHandler_1.ApiError(404, "User not found");
    return res.status(200).json(updated);
};
exports.toggleUserActiveController = toggleUserActiveController;
const changeUserPasswordController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const body = req.body ?? {};
    const updated = await container_1.services.users.changeUserPassword(auth, Number(req.params.id), String(body.password ?? ""));
    if (!updated)
        throw new errorHandler_1.ApiError(404, "User not found");
    return res.status(200).json(updated);
};
exports.changeUserPasswordController = changeUserPasswordController;
