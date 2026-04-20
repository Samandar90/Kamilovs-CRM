import type {
  Expense,
  ExpenseCreateInput,
  ExpenseFilters,
  ExpenseUpdateInput,
} from "./expensesTypes";

export interface IExpensesRepository {
  findAll(filters?: ExpenseFilters): Promise<Expense[]>;
  create(input: ExpenseCreateInput): Promise<Expense>;
  update(id: number, input: ExpenseUpdateInput): Promise<Expense | null>;
  delete(id: number): Promise<boolean>;
}

