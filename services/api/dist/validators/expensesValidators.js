"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUpdateExpense = exports.validateCreateExpense = exports.validateExpenseIdParam = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const parsePositiveInteger = (value) => {
    if (typeof value !== "string" && typeof value !== "number")
        return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
};
const parsePositiveNumber = (value) => {
    if (typeof value !== "string" && typeof value !== "number")
        return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return null;
    return parsed;
};
const isValidDate = (value) => {
    if (typeof value !== "string")
        return false;
    return Number.isFinite(Date.parse(value));
};
const validateExpenseIdParam = (req, _res, next) => {
    if (!parsePositiveInteger(req.params.id)) {
        throw new errorHandler_1.ApiError(400, "Параметр id должен быть положительным целым числом");
    }
    next();
};
exports.validateExpenseIdParam = validateExpenseIdParam;
const validateCreateExpense = (req, _res, next) => {
    const { amount, category, paidAt } = req.body ?? {};
    if (!parsePositiveNumber(amount)) {
        throw new errorHandler_1.ApiError(400, "Сумма расхода должна быть больше нуля");
    }
    if (typeof category !== "string" || !category.trim()) {
        throw new errorHandler_1.ApiError(400, "Категория обязательна");
    }
    if (!isValidDate(paidAt)) {
        throw new errorHandler_1.ApiError(400, "Поле paidAt должно быть корректной датой");
    }
    next();
};
exports.validateCreateExpense = validateCreateExpense;
const validateUpdateExpense = (req, _res, next) => {
    const body = req.body ?? {};
    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
        throw new errorHandler_1.ApiError(400, "Тело запроса не может быть пустым");
    }
    if (body.amount !== undefined && !parsePositiveNumber(body.amount)) {
        throw new errorHandler_1.ApiError(400, "Сумма расхода должна быть больше нуля");
    }
    if (body.category !== undefined && (typeof body.category !== "string" || !body.category.trim())) {
        throw new errorHandler_1.ApiError(400, "Категория обязательна");
    }
    if (body.paidAt !== undefined && !isValidDate(body.paidAt)) {
        throw new errorHandler_1.ApiError(400, "Поле paidAt должно быть корректной датой");
    }
    next();
};
exports.validateUpdateExpense = validateUpdateExpense;
