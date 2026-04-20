"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashRegisterService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const numbers_1 = require("../utils/numbers");
const roundMoney = (value) => {
    const n = (0, numbers_1.parseNumericInput)(value);
    return (0, numbers_1.roundMoney2)(n ?? 0);
};
const normalizeOptionalString = (value) => {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
};
class CashRegisterService {
    constructor(cashRegisterRepository) {
        this.cashRegisterRepository = cashRegisterRepository;
    }
    async openShift(_auth, payload) {
        const existingActive = await this.cashRegisterRepository.findActiveShift();
        if (existingActive) {
            throw new errorHandler_1.ApiError(409, "Смена уже открыта");
        }
        const openingBalance = roundMoney(payload.openingBalance);
        if (openingBalance < 0) {
            throw new errorHandler_1.ApiError(400, "Начальный остаток не может быть отрицательным");
        }
        return this.cashRegisterRepository.openShift({
            openedBy: payload.openedBy ?? null,
            openingBalance,
            notes: normalizeOptionalString(payload.notes) ?? null,
        });
    }
    async getActiveShift(_auth) {
        return this.cashRegisterRepository.findActiveShift();
    }
    async closeShift(_auth, shiftId, payload) {
        const shift = await this.cashRegisterRepository.findShiftById(shiftId);
        if (!shift) {
            throw new errorHandler_1.ApiError(404, "Смена не найдена");
        }
        if (shift.closedAt) {
            throw new errorHandler_1.ApiError(409, "Смена уже закрыта");
        }
        const entries = await this.cashRegisterRepository.findEntries({ shiftId });
        const totals = entries.reduce((acc, entry) => {
            if (entry.type === "payment" || entry.type === "manual_in") {
                acc.inflow = roundMoney(acc.inflow + entry.amount);
            }
            else if (entry.type === "refund" || entry.type === "manual_out") {
                acc.outflow = roundMoney(acc.outflow + entry.amount);
            }
            else if (entry.type === "void") {
                acc.inflow = roundMoney(acc.inflow + entry.amount);
            }
            return acc;
        }, { inflow: 0, outflow: 0 });
        const closingBalance = roundMoney(shift.openingBalance + totals.inflow - totals.outflow);
        if (closingBalance < 0) {
            throw new errorHandler_1.ApiError(409, "Итоговый остаток не может быть отрицательным");
        }
        const closed = await this.cashRegisterRepository.closeShift(shiftId, {
            closedBy: payload.closedBy ?? null,
            closingBalance,
            notes: normalizeOptionalString(payload.notes),
        });
        if (!closed) {
            throw new errorHandler_1.ApiError(409, "Не удалось закрыть смену");
        }
        return closed;
    }
    async getShiftHistory(_auth) {
        return this.cashRegisterRepository.findShiftHistory();
    }
    async getShiftById(_auth, shiftId) {
        const shift = await this.cashRegisterRepository.findShiftById(shiftId);
        if (!shift) {
            throw new errorHandler_1.ApiError(404, "Смена не найдена");
        }
        return shift;
    }
    async listEntries(_auth, filters = {}) {
        if (filters.shiftId !== undefined) {
            return this.cashRegisterRepository.findEntriesWithContext(filters);
        }
        const activeShift = await this.cashRegisterRepository.findActiveShift();
        if (!activeShift) {
            return [];
        }
        return this.cashRegisterRepository.findEntriesWithContext({
            ...filters,
            shiftId: activeShift.id,
        });
    }
    async getCurrentShiftSummary(_auth) {
        const shift = await this.cashRegisterRepository.findActiveShift();
        if (!shift) {
            return null;
        }
        const entries = await this.cashRegisterRepository.findEntries({ shiftId: shift.id });
        let totalIncome = 0;
        let totalOutflow = 0;
        let totalCash = 0;
        let totalCard = 0;
        for (const entry of entries) {
            if (entry.type === "payment" || entry.type === "manual_in") {
                totalIncome = roundMoney(totalIncome + entry.amount);
                if (entry.method === "cash")
                    totalCash = roundMoney(totalCash + entry.amount);
                else
                    totalCard = roundMoney(totalCard + entry.amount);
            }
            else if (entry.type === "refund" || entry.type === "manual_out") {
                totalOutflow = roundMoney(totalOutflow + entry.amount);
            }
            else if (entry.type === "void") {
                totalIncome = roundMoney(totalIncome + entry.amount);
                if (entry.method === "cash")
                    totalCash = roundMoney(totalCash + entry.amount);
                else
                    totalCard = roundMoney(totalCard + entry.amount);
            }
        }
        const closingBalancePreview = roundMoney(shift.openingBalance + totalIncome - totalOutflow);
        return {
            shiftId: shift.id,
            openingBalance: shift.openingBalance,
            totalIncome,
            totalCash,
            totalCard,
            operationsCount: entries.length,
            closingBalancePreview,
        };
    }
}
exports.CashRegisterService = CashRegisterService;
