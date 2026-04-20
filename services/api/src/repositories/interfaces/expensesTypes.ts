export type Expense = {
  id: number;
  amount: number;
  category: string;
  description: string | null;
  paidAt: string;
  createdAt: string;
  deletedAt: string | null;
};

export type ExpenseFilters = {
  dateFrom?: string;
  dateTo?: string;
  category?: string;
};

export type ExpenseCreateInput = {
  amount: number;
  category: string;
  description?: string | null;
  paidAt: string;
};

export type ExpenseUpdateInput = Partial<ExpenseCreateInput>;

