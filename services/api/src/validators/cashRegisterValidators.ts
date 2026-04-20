import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../middleware/errorHandler";
import {
  CASH_ENTRY_METHODS,
  CASH_ENTRY_TYPES,
} from "../repositories/cashRegisterRepository";

const CASH_ENTRY_METHOD_SET = new Set<string>(CASH_ENTRY_METHODS);
const CASH_ENTRY_TYPE_SET = new Set<string>(CASH_ENTRY_TYPES);

const parsePositiveInteger = (value: unknown): number | null => {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const parseNonNegativeNumber = (value: unknown): number | null => {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
};

export const validateShiftIdParam = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const parsedId = parsePositiveInteger(req.params.id);
  if (!parsedId) {
    throw new ApiError(400, "Параметр id должен быть положительным целым числом");
  }

  next();
};

export const validateOpenShift = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const { openedBy, openingBalance, notes } = req.body ?? {};

  if (openedBy !== undefined && openedBy !== null && !parsePositiveInteger(openedBy)) {
    throw new ApiError(400, "Поле openedBy должно быть положительным целым числом или null");
  }

  if (
    openingBalance !== undefined &&
    parseNonNegativeNumber(openingBalance) === null
  ) {
    throw new ApiError(400, "Начальный остаток не может быть отрицательным");
  }

  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    throw new ApiError(400, "Поле notes должно быть строкой или null");
  }

  next();
};

export const validateCloseShift = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const { closedBy, notes } = req.body ?? {};

  if (closedBy !== undefined && closedBy !== null && !parsePositiveInteger(closedBy)) {
    throw new ApiError(400, "Поле closedBy должно быть положительным целым числом или null");
  }

  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    throw new ApiError(400, "Поле notes должно быть строкой или null");
  }

  next();
};

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

export const validateEntriesQuery = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const { shiftId, method, type, dateFrom, dateTo } = req.query;

  if (shiftId !== undefined && !parsePositiveInteger(shiftId)) {
    throw new ApiError(400, "Параметр shiftId должен быть положительным целым числом");
  }

  if (dateFrom !== undefined) {
    if (typeof dateFrom !== "string" || !DATE_YMD.test(dateFrom.trim())) {
      throw new ApiError(400, "Параметр dateFrom должен быть YYYY-MM-DD");
    }
  }
  if (dateTo !== undefined) {
    if (typeof dateTo !== "string" || !DATE_YMD.test(dateTo.trim())) {
      throw new ApiError(400, "Параметр dateTo должен быть YYYY-MM-DD");
    }
  }

  if (method !== undefined) {
    if (typeof method !== "string" || !CASH_ENTRY_METHOD_SET.has(method)) {
      throw new ApiError(
        400,
        `Параметр method должен быть одним из: ${CASH_ENTRY_METHODS.join(", ")}`
      );
    }
  }

  if (type !== undefined) {
    if (typeof type !== "string" || !CASH_ENTRY_TYPE_SET.has(type)) {
      throw new ApiError(
        400,
        `Параметр type должен быть одним из: ${CASH_ENTRY_TYPES.join(", ")}`
      );
    }
  }

  next();
};
