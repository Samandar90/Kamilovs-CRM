import type { IExpensesRepository } from "./interfaces/IExpensesRepository";
import type {
  Expense,
  ExpenseCreateInput,
  ExpenseFilters,
  ExpenseUpdateInput,
} from "./interfaces/expensesTypes";
import { getMockDb, nextId } from "./mockDatabase";

const toExpense = (row: {
  id: number;
  amount: number;
  category: string;
  description: string | null;
  paidAt: string;
  createdAt: string;
  deletedAt: string | null;
}): Expense => ({
  id: row.id,
  amount: row.amount,
  category: row.category,
  description: row.description,
  paidAt: row.paidAt,
  createdAt: row.createdAt,
  deletedAt: row.deletedAt,
});

export class MockExpensesRepository implements IExpensesRepository {
  async findAll(filters: ExpenseFilters = {}): Promise<Expense[]> {
    const { dateFrom, dateTo, category } = filters;
    return getMockDb()
      .expenses.filter((row) => !row.deletedAt)
      .filter((row) => {
        if (category && row.category !== category) return false;
        if (dateFrom && row.paidAt < dateFrom) return false;
        if (dateTo && row.paidAt > dateTo) return false;
        return true;
      })
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
      .map(toExpense);
  }

  async create(input: ExpenseCreateInput): Promise<Expense> {
    const row = {
      id: nextId(),
      amount: input.amount,
      category: input.category,
      description: input.description ?? null,
      paidAt: input.paidAt,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    getMockDb().expenses.push(row);
    return toExpense(row);
  }

  async update(id: number, input: ExpenseUpdateInput): Promise<Expense | null> {
    const db = getMockDb();
    const index = db.expenses.findIndex((row) => row.id === id && !row.deletedAt);
    if (index < 0) return null;

    db.expenses[index] = {
      ...db.expenses[index],
      amount: input.amount ?? db.expenses[index].amount,
      category: input.category ?? db.expenses[index].category,
      description: input.description ?? db.expenses[index].description,
      paidAt: input.paidAt ?? db.expenses[index].paidAt,
    };
    return toExpense(db.expenses[index]);
  }

  async delete(id: number): Promise<boolean> {
    const db = getMockDb();
    const index = db.expenses.findIndex((row) => row.id === id && !row.deletedAt);
    if (index < 0) return false;
    db.expenses[index] = { ...db.expenses[index], deletedAt: new Date().toISOString() };
    return true;
  }
}

