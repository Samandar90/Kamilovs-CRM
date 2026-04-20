import type { Request, Response } from "express";
import { services } from "../container";
import { ApiError } from "../middleware/errorHandler";
import { getAuthPayload } from "../utils/requestAuth";

const parsePositiveId = (idRaw: string): number => {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, "Параметр id должен быть положительным целым числом");
  }
  return id;
};

const readQueryString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const listExpensesController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const rows = await services.expenses.list(auth, {
    dateFrom: readQueryString(req.query.dateFrom),
    dateTo: readQueryString(req.query.dateTo),
    category: readQueryString(req.query.category),
  });
  return res.status(200).json(rows);
};

export const createExpenseController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const created = await services.expenses.create(auth, req.body);
  return res.status(201).json(created);
};

export const updateExpenseController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const id = parsePositiveId(req.params.id);
  const updated = await services.expenses.update(auth, id, req.body);
  if (!updated) {
    throw new ApiError(404, "Расход не найден");
  }
  return res.status(200).json(updated);
};

export const deleteExpenseController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const id = parsePositiveId(req.params.id);
  const deleted = await services.expenses.delete(auth, id);
  if (!deleted) {
    throw new ApiError(404, "Расход не найден");
  }
  return res.status(200).json({ success: true, id });
};

