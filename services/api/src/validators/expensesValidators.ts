import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";

const parsePositiveInteger = (value: unknown): number | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const parsePositiveNumber = (value: unknown): number | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const isValidDate = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  return Number.isFinite(Date.parse(value));
};

export const validateExpenseIdParam = (req: Request, _res: Response, next: NextFunction) => {
  if (!parsePositiveInteger(req.params.id)) {
    throw new ApiError(400, "Параметр id должен быть положительным целым числом");
  }
  next();
};

export const validateCreateExpense = (req: Request, _res: Response, next: NextFunction) => {
  const { amount, category, paidAt } = req.body ?? {};

  if (!parsePositiveNumber(amount)) {
    throw new ApiError(400, "Сумма расхода должна быть больше нуля");
  }
  if (typeof category !== "string" || !category.trim()) {
    throw new ApiError(400, "Категория обязательна");
  }
  if (!isValidDate(paidAt)) {
    throw new ApiError(400, "Поле paidAt должно быть корректной датой");
  }

  next();
};

export const validateUpdateExpense = (req: Request, _res: Response, next: NextFunction) => {
  const body = req.body ?? {};
  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    throw new ApiError(400, "Тело запроса не может быть пустым");
  }

  if (body.amount !== undefined && !parsePositiveNumber(body.amount)) {
    throw new ApiError(400, "Сумма расхода должна быть больше нуля");
  }
  if (body.category !== undefined && (typeof body.category !== "string" || !body.category.trim())) {
    throw new ApiError(400, "Категория обязательна");
  }
  if (body.paidAt !== undefined && !isValidDate(body.paidAt)) {
    throw new ApiError(400, "Поле paidAt должно быть корректной датой");
  }

  next();
};

