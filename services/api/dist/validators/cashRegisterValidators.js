"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEntriesQuery = exports.validateCloseShift = exports.validateOpenShift = exports.validateShiftIdParam = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const cashRegisterRepository_1 = require("../repositories/cashRegisterRepository");
const CASH_ENTRY_METHOD_SET = new Set(cashRegisterRepository_1.CASH_ENTRY_METHODS);
const CASH_ENTRY_TYPE_SET = new Set(cashRegisterRepository_1.CASH_ENTRY_TYPES);
const parsePositiveInteger = (value) => {
    if (typeof value !== "string" && typeof value !== "number") {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
};
const parseNonNegativeNumber = (value) => {
    if (typeof value !== "string" && typeof value !== "number") {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }
    return parsed;
};
const validateShiftIdParam = (req, _res, next) => {
    const parsedId = parsePositiveInteger(req.params.id);
    if (!parsedId) {
        throw new errorHandler_1.ApiError(400, "Параметр id должен быть положительным целым числом");
    }
    next();
};
exports.validateShiftIdParam = validateShiftIdParam;
const validateOpenShift = (req, _res, next) => {
    const { openedBy, openingBalance, notes } = req.body ?? {};
    if (openedBy !== undefined && openedBy !== null && !parsePositiveInteger(openedBy)) {
        throw new errorHandler_1.ApiError(400, "Поле openedBy должно быть положительным целым числом или null");
    }
    if (openingBalance !== undefined &&
        parseNonNegativeNumber(openingBalance) === null) {
        throw new errorHandler_1.ApiError(400, "Начальный остаток не может быть отрицательным");
    }
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
        throw new errorHandler_1.ApiError(400, "Поле notes должно быть строкой или null");
    }
    next();
};
exports.validateOpenShift = validateOpenShift;
const validateCloseShift = (req, _res, next) => {
    const { closedBy, notes } = req.body ?? {};
    if (closedBy !== undefined && closedBy !== null && !parsePositiveInteger(closedBy)) {
        throw new errorHandler_1.ApiError(400, "Поле closedBy должно быть положительным целым числом или null");
    }
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
        throw new errorHandler_1.ApiError(400, "Поле notes должно быть строкой или null");
    }
    next();
};
exports.validateCloseShift = validateCloseShift;
const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;
const validateEntriesQuery = (req, _res, next) => {
    const { shiftId, method, type, dateFrom, dateTo } = req.query;
    if (shiftId !== undefined && !parsePositiveInteger(shiftId)) {
        throw new errorHandler_1.ApiError(400, "Параметр shiftId должен быть положительным целым числом");
    }
    if (dateFrom !== undefined) {
        if (typeof dateFrom !== "string" || !DATE_YMD.test(dateFrom.trim())) {
            throw new errorHandler_1.ApiError(400, "Параметр dateFrom должен быть YYYY-MM-DD");
        }
    }
    if (dateTo !== undefined) {
        if (typeof dateTo !== "string" || !DATE_YMD.test(dateTo.trim())) {
            throw new errorHandler_1.ApiError(400, "Параметр dateTo должен быть YYYY-MM-DD");
        }
    }
    if (method !== undefined) {
        if (typeof method !== "string" || !CASH_ENTRY_METHOD_SET.has(method)) {
            throw new errorHandler_1.ApiError(400, `Параметр method должен быть одним из: ${cashRegisterRepository_1.CASH_ENTRY_METHODS.join(", ")}`);
        }
    }
    if (type !== undefined) {
        if (typeof type !== "string" || !CASH_ENTRY_TYPE_SET.has(type)) {
            throw new errorHandler_1.ApiError(400, `Параметр type должен быть одним из: ${cashRegisterRepository_1.CASH_ENTRY_TYPES.join(", ")}`);
        }
    }
    next();
};
exports.validateEntriesQuery = validateEntriesQuery;
