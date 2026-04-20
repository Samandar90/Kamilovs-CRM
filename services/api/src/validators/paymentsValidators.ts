import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../middleware/errorHandler";
import { PAYMENT_METHODS } from "../repositories/paymentsRepository";
import { parseNumericInput } from "../utils/numbers";

const PAYMENT_METHOD_SET = new Set<string>(PAYMENT_METHODS);

const parsePositiveInteger = (value: unknown): number | null => {
  const n = parseNumericInput(value);
  if (n === null) return null;
  const t = Math.trunc(n);
  if (t <= 0 || t !== n) return null;
  return t;
};

const parsePositiveNumber = (value: unknown): number | null => {
  const n = parseNumericInput(value);
  if (n === null || n <= 0) return null;
  return n;
};

export const validatePaymentIdParam = (
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

export const validateCreatePayment = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  if (req.body == null || typeof req.body !== "object") {
    req.body = {};
  }
  const body = req.body as Record<string, unknown>;
  const { invoiceId, amount, method } = body;
  const rawKey = body.idempotencyKey;

  if (!parsePositiveInteger(invoiceId)) {
    throw new ApiError(400, "Поле invoiceId должно быть положительным целым числом");
  }

  if (!parsePositiveNumber(amount)) {
    throw new ApiError(400, "Сумма оплаты должна быть больше нуля");
  }

  if (typeof method !== "string" || !PAYMENT_METHOD_SET.has(method)) {
    throw new ApiError(
      400,
      `Поле method должно быть одним из: ${PAYMENT_METHODS.join(", ")}`
    );
  }

  if (rawKey !== undefined && rawKey !== null) {
    if (typeof rawKey !== "string") {
      throw new ApiError(400, "Поле idempotencyKey должно быть строкой");
    }
    const trimmed = rawKey.trim();
    if (trimmed.length > 255) {
      throw new ApiError(400, "Поле idempotencyKey слишком длинное (макс. 255 символов)");
    }
    if (trimmed.length === 0) {
      delete body.idempotencyKey;
    } else {
      body.idempotencyKey = trimmed;
    }
  }

  next();
};

export const validateRefundPayment = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const { reason, amount } = req.body ?? {};
  if (typeof reason !== "string" || reason.trim().length < 3) {
    throw new ApiError(400, "Укажите причину возврата (не менее 3 символов)");
  }

  if (amount !== undefined && amount !== null && amount !== "") {
    const n = parseNumericInput(amount);
    if (n === null || n <= 0) {
      throw new ApiError(400, "Некорректная сумма возврата");
    }
  }

  next();
};
