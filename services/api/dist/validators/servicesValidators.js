"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUpdateService = exports.validateCreateService = exports.validateServiceIdParam = void 0;
const serviceCategories_1 = require("../constants/serviceCategories");
const errorHandler_1 = require("../middleware/errorHandler");
const parsePositiveIntegerParam = (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
};
const validateServiceIdParam = (req, _res, next) => {
    if (!parsePositiveIntegerParam(req.params.id)) {
        throw new errorHandler_1.ApiError(400, "Path param 'id' must be a positive integer");
    }
    next();
};
exports.validateServiceIdParam = validateServiceIdParam;
const parsePositiveFiniteNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) {
            return n;
        }
    }
    return null;
};
const parsePositiveIntMinutes = (value) => {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isInteger(n) && n > 0) {
            return n;
        }
    }
    return null;
};
const normalizeDoctorIds = (value) => {
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new errorHandler_1.ApiError(400, "Field 'doctorIds' must be an array of positive integers");
    }
    const out = [];
    for (const el of value) {
        const n = typeof el === "number" ? el : Number(el);
        if (!Number.isInteger(n) || n <= 0) {
            throw new errorHandler_1.ApiError(400, "Field 'doctorIds' must be an array of positive integers");
        }
        out.push(n);
    }
    return [...new Set(out)].sort((a, b) => a - b);
};
const validateCreateService = (req, _res, next) => {
    const body = req.body ?? {};
    const { name, category, active } = body;
    if (typeof name !== "string" || name.trim() === "") {
        throw new errorHandler_1.ApiError(400, "Field 'name' must be a non-empty string");
    }
    if (typeof category !== "string" || category.trim() === "") {
        throw new errorHandler_1.ApiError(400, "Field 'category' must be a non-empty string");
    }
    const cat = category.trim();
    if (!(0, serviceCategories_1.isValidServiceCategory)(cat)) {
        throw new errorHandler_1.ApiError(400, `Field 'category' must be one of: ${serviceCategories_1.SERVICE_CATEGORIES.join(", ")}`);
    }
    const price = parsePositiveFiniteNumber(body.price);
    if (price === null) {
        throw new errorHandler_1.ApiError(400, "Field 'price' must be a number greater than 0");
    }
    const duration = parsePositiveIntMinutes(body.duration);
    if (duration === null) {
        throw new errorHandler_1.ApiError(400, "Field 'duration' must be a positive integer (minutes)");
    }
    if (typeof active !== "boolean") {
        throw new errorHandler_1.ApiError(400, "Field 'active' must be a boolean");
    }
    const doctorIds = normalizeDoctorIds(body.doctorIds);
    const normalized = {
        name: name.trim(),
        category: cat,
        price,
        duration,
        active,
        doctorIds,
    };
    req.body = normalized;
    next();
};
exports.validateCreateService = validateCreateService;
const validateUpdateService = (req, _res, next) => {
    const body = req.body ?? {};
    const out = {};
    let provided = 0;
    if (body.name !== undefined) {
        provided += 1;
        if (typeof body.name !== "string" || body.name.trim() === "") {
            throw new errorHandler_1.ApiError(400, "Field 'name' must be a non-empty string");
        }
        out.name = body.name.trim();
    }
    if (body.category !== undefined) {
        provided += 1;
        if (typeof body.category !== "string" || body.category.trim() === "") {
            throw new errorHandler_1.ApiError(400, "Field 'category' must be a non-empty string");
        }
        const cat = body.category.trim();
        if (!(0, serviceCategories_1.isValidServiceCategory)(cat)) {
            throw new errorHandler_1.ApiError(400, `Field 'category' must be one of: ${serviceCategories_1.SERVICE_CATEGORIES.join(", ")}`);
        }
        out.category = cat;
    }
    if (body.price !== undefined) {
        provided += 1;
        const price = parsePositiveFiniteNumber(body.price);
        if (price === null) {
            throw new errorHandler_1.ApiError(400, "Field 'price' must be a number greater than 0");
        }
        out.price = price;
    }
    if (body.duration !== undefined) {
        provided += 1;
        const duration = parsePositiveIntMinutes(body.duration);
        if (duration === null) {
            throw new errorHandler_1.ApiError(400, "Field 'duration' must be a positive integer (minutes)");
        }
        out.duration = duration;
    }
    if (body.active !== undefined) {
        provided += 1;
        if (typeof body.active !== "boolean") {
            throw new errorHandler_1.ApiError(400, "Field 'active' must be a boolean");
        }
        out.active = body.active;
    }
    if (body.doctorIds !== undefined) {
        provided += 1;
        out.doctorIds = normalizeDoctorIds(body.doctorIds);
    }
    if (provided === 0) {
        throw new errorHandler_1.ApiError(400, "At least one field must be provided for update");
    }
    req.body = out;
    next();
};
exports.validateUpdateService = validateUpdateService;
