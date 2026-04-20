import { ApiError } from "../middleware/errorHandler";
import type { IExpensesRepository } from "../repositories/interfaces/IExpensesRepository";
import type {
  Expense,
  ExpenseCreateInput,
  ExpenseFilters,
  ExpenseUpdateInput,
} from "../repositories/interfaces/expensesTypes";
import type { AuthTokenPayload } from "../repositories/interfaces/userTypes";
import { parseRequiredMoney, roundMoney2 } from "../utils/numbers";

const normalizeAmount = (value: unknown): number =>
  roundMoney2(parseRequiredMoney(value, "amount"));

const normalizeText = (value: string): string => value.trim();

const assertIsoDate = (value: string, fieldName: string): void => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new ApiError(400, `Поле ${fieldName} должно быть корректной датой`);
  }
};

export class ExpensesService {
  constructor(private readonly expensesRepository: IExpensesRepository) {}

  async list(_auth: AuthTokenPayload, filters: ExpenseFilters = {}): Promise<Expense[]> {
    return this.expensesRepository.findAll(filters);
  }

  async create(_auth: AuthTokenPayload, payload: ExpenseCreateInput): Promise<Expense> {
    const amount = normalizeAmount(payload.amount);
    const category = normalizeText(payload.category);
    const description = payload.description ? normalizeText(payload.description) : null;
    assertIsoDate(payload.paidAt, "paidAt");

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, "Сумма расхода должна быть больше нуля");
    }
    if (!category) {
      throw new ApiError(400, "Категория обязательна");
    }

    return this.expensesRepository.create({
      amount,
      category,
      description,
      paidAt: payload.paidAt,
    });
  }

  async update(_auth: AuthTokenPayload, id: number, payload: ExpenseUpdateInput): Promise<Expense | null> {
    if (payload.amount !== undefined) {
      const amount = normalizeAmount(payload.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ApiError(400, "Сумма расхода должна быть больше нуля");
      }
      payload.amount = amount;
    }

    if (payload.category !== undefined) {
      const category = normalizeText(payload.category);
      if (!category) {
        throw new ApiError(400, "Категория обязательна");
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

  async delete(_auth: AuthTokenPayload, id: number): Promise<boolean> {
    return this.expensesRepository.delete(id);
  }
}

