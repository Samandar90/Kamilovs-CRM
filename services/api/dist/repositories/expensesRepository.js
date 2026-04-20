"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockExpensesRepository = void 0;
const mockDatabase_1 = require("./mockDatabase");
const toExpense = (row) => ({
    id: row.id,
    amount: row.amount,
    category: row.category,
    description: row.description,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
});
class MockExpensesRepository {
    async findAll(filters = {}) {
        const { dateFrom, dateTo, category } = filters;
        return (0, mockDatabase_1.getMockDb)()
            .expenses.filter((row) => !row.deletedAt)
            .filter((row) => {
            if (category && row.category !== category)
                return false;
            if (dateFrom && row.paidAt < dateFrom)
                return false;
            if (dateTo && row.paidAt > dateTo)
                return false;
            return true;
        })
            .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
            .map(toExpense);
    }
    async create(input) {
        const row = {
            id: (0, mockDatabase_1.nextId)(),
            amount: input.amount,
            category: input.category,
            description: input.description ?? null,
            paidAt: input.paidAt,
            createdAt: new Date().toISOString(),
            deletedAt: null,
        };
        (0, mockDatabase_1.getMockDb)().expenses.push(row);
        return toExpense(row);
    }
    async update(id, input) {
        const db = (0, mockDatabase_1.getMockDb)();
        const index = db.expenses.findIndex((row) => row.id === id && !row.deletedAt);
        if (index < 0)
            return null;
        db.expenses[index] = {
            ...db.expenses[index],
            amount: input.amount ?? db.expenses[index].amount,
            category: input.category ?? db.expenses[index].category,
            description: input.description ?? db.expenses[index].description,
            paidAt: input.paidAt ?? db.expenses[index].paidAt,
        };
        return toExpense(db.expenses[index]);
    }
    async delete(id) {
        const db = (0, mockDatabase_1.getMockDb)();
        const index = db.expenses.findIndex((row) => row.id === id && !row.deletedAt);
        if (index < 0)
            return false;
        db.expenses[index] = { ...db.expenses[index], deletedAt: new Date().toISOString() };
        return true;
    }
}
exports.MockExpensesRepository = MockExpensesRepository;
