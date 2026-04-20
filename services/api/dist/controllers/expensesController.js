"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteExpenseController = exports.updateExpenseController = exports.createExpenseController = exports.listExpensesController = void 0;
const container_1 = require("../container");
const errorHandler_1 = require("../middleware/errorHandler");
const requestAuth_1 = require("../utils/requestAuth");
const parsePositiveId = (idRaw) => {
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
        throw new errorHandler_1.ApiError(400, "Параметр id должен быть положительным целым числом");
    }
    return id;
};
const readQueryString = (value) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const listExpensesController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const rows = await container_1.services.expenses.list(auth, {
        dateFrom: readQueryString(req.query.dateFrom),
        dateTo: readQueryString(req.query.dateTo),
        category: readQueryString(req.query.category),
    });
    return res.status(200).json(rows);
};
exports.listExpensesController = listExpensesController;
const createExpenseController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const created = await container_1.services.expenses.create(auth, req.body);
    return res.status(201).json(created);
};
exports.createExpenseController = createExpenseController;
const updateExpenseController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = parsePositiveId(req.params.id);
    const updated = await container_1.services.expenses.update(auth, id, req.body);
    if (!updated) {
        throw new errorHandler_1.ApiError(404, "Расход не найден");
    }
    return res.status(200).json(updated);
};
exports.updateExpenseController = updateExpenseController;
const deleteExpenseController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = parsePositiveId(req.params.id);
    const deleted = await container_1.services.expenses.delete(auth, id);
    if (!deleted) {
        throw new errorHandler_1.ApiError(404, "Расход не найден");
    }
    return res.status(200).json({ success: true, id });
};
exports.deleteExpenseController = deleteExpenseController;
