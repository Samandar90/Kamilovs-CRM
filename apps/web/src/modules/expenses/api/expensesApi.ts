import { requestJson } from "../../../api/http";

export type Expense = {
  id: number;
  amount: number;
  category: string;
  description: string | null;
  paidAt: string;
  createdAt: string;
  deletedAt: string | null;
};

export type ExpensePayload = {
  amount: number;
  category: string;
  description?: string | null;
  paidAt: string;
};

export type ExpensesFilters = {
  dateFrom?: string;
  dateTo?: string;
  category?: string;
};

const buildQuery = (filters: ExpensesFilters): string => {
  const query = new URLSearchParams();
  if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) query.set("dateTo", filters.dateTo);
  if (filters.category) query.set("category", filters.category);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
};

export const expensesApi = {
  list: (filters: ExpensesFilters = {}) =>
    requestJson<Expense[]>(`/api/expenses${buildQuery(filters)}`),
  create: (payload: ExpensePayload) =>
    requestJson<Expense>("/api/expenses", { method: "POST", body: payload }),
  update: (id: number, payload: Partial<ExpensePayload>) =>
    requestJson<Expense>(`/api/expenses/${id}`, { method: "PUT", body: payload }),
  remove: (id: number) =>
    requestJson<{ success: boolean; id: number }>(`/api/expenses/${id}`, { method: "DELETE" }),
};

