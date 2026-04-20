"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpensesService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const numbers_1 = require("../utils/numbers");
const normalizeAmount = (value) => (0, numbers_1.roundMoney2)((0, numbers_1.parseRequiredMoney)(value, "amount"));
const normalizeText = (value) => value.trim();
const assertIsoDate = (value, fieldName) => {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
        throw new errorHandler_1.ApiError(400, `Поле ${fieldName} должно быть корректной датой`);
    }
};
class ExpensesService {
    constructor(expensesRepository) {
        this.expensesRepository = expensesRepository;
    }
    async list(_auth, filters = {}) {
        return this.expensesRepository.findAll(filters);
    }
    async create(_auth, payload) {
        const amount = normalizeAmount(payload.amount);
        const category = normalizeText(payload.category);
        const description = payload.description ? normalizeText(payload.description) : null;
        assertIsoDate(payload.paidAt, "paidAt");
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new errorHandler_1.ApiError(400, "Сумма расхода должна быть больше нуля");
        }
        if (!category) {
            throw new errorHandler_1.ApiError(400, "Категория обязательна");
        }
        return this.expensesRepository.create({
            amount,
            category,
            description,
            paidAt: payload.paidAt,
        });
    }
    async update(_auth, id, payload) {
        if (payload.amount !== undefined) {
            const amount = normalizeAmount(payload.amount);
            if (!Number.isFinite(amount) || amount <= 0) {
                throw new errorHandler_1.ApiError(400, "Сумма расхода должна быть больше нуля");
            }
            payload.amount = amount;
        }
        if (payload.category !== undefined) {
            const category = normalizeText(payload.category);
            if (!category) {
                throw new errorHandler_1.ApiError(400, "Категория обязательна");
            }
            payload.category = category;
        }
        if (payload.paidAt !== undefined) {
            assertIsoDate(payload.paidAt, "paidAt");
        }
        if (payload.description !== undefined && payload.description !== null) {
            payload.description = normalizeText(payload.description);
        }
        return this.expensesRepository.update(id, payload);
    }
    async delete(_auth, id) {
        return this.expensesRepository.delete(id);
    }
}
exports.ExpensesService = ExpensesService;
