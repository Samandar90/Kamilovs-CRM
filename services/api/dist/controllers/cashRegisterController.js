"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentShiftSummaryController = exports.getShiftByIdController = exports.shiftHistoryController = exports.closeCurrentShiftController = exports.closeShiftController = exports.getActiveShiftController = exports.openShiftController = exports.listCashEntriesController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const cashRegisterRepository_1 = require("../repositories/cashRegisterRepository");
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const parseAllowedQueryValue = (value, allowed) => {
    if (typeof value !== "string")
        return undefined;
    return allowed.includes(value) ? value : undefined;
};
const parsePositiveQueryShiftId = (value) => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new errorHandler_1.ApiError(400, "Параметр shiftId должен быть положительным целым числом");
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new errorHandler_1.ApiError(400, "Параметр shiftId должен быть положительным целым числом");
    }
    return parsed;
};
const listCashEntriesController = async (req, res) => {
    const shiftId = parsePositiveQueryShiftId(req.query.shiftId);
    const type = parseAllowedQueryValue(req.query.type, cashRegisterRepository_1.CASH_ENTRY_TYPES);
    const method = parseAllowedQueryValue(req.query.method, cashRegisterRepository_1.CASH_ENTRY_METHODS);
    const dateFrom = typeof req.query.dateFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateFrom.trim())
        ? req.query.dateFrom.trim()
        : undefined;
    const dateTo = typeof req.query.dateTo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateTo.trim())
        ? req.query.dateTo.trim()
        : undefined;
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const entries = await container_1.services.cashRegister.listEntries(auth, {
        shiftId,
        type,
        method,
        dateFrom,
        dateTo,
    });
    return res.status(200).json(entries);
};
exports.listCashEntriesController = listCashEntriesController;
const openShiftController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const opened = await container_1.services.cashRegister.openShift(auth, req.body);
    return res.status(201).json(opened);
};
exports.openShiftController = openShiftController;
const getActiveShiftController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const activeShift = await container_1.services.cashRegister.getActiveShift(auth);
    return res.status(200).json(activeShift);
};
exports.getActiveShiftController = getActiveShiftController;
const closeShiftController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const shiftId = Number(req.params.id);
    const closed = await container_1.services.cashRegister.closeShift(auth, shiftId, req.body);
    return res.status(200).json(closed);
};
exports.closeShiftController = closeShiftController;
/** POST /shift/close — закрыть активную смену (без id в URL). */
const closeCurrentShiftController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const active = await container_1.services.cashRegister.getActiveShift(auth);
    if (!active) {
        throw new errorHandler_1.ApiError(409, "Нет активной смены");
    }
    const closed = await container_1.services.cashRegister.closeShift(auth, active.id, req.body);
    return res.status(200).json(closed);
};
exports.closeCurrentShiftController = closeCurrentShiftController;
const shiftHistoryController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const history = await container_1.services.cashRegister.getShiftHistory(auth);
    return res.status(200).json(history);
};
exports.shiftHistoryController = shiftHistoryController;
const getShiftByIdController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const shiftId = Number(req.params.id);
    const shift = await container_1.services.cashRegister.getShiftById(auth, shiftId);
    return res.status(200).json(shift);
};
exports.getShiftByIdController = getShiftByIdController;
const getCurrentShiftSummaryController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const summary = await container_1.services.cashRegister.getCurrentShiftSummary(auth);
    return res.status(200).json(summary);
};
exports.getCurrentShiftSummaryController = getCurrentShiftSummaryController;
