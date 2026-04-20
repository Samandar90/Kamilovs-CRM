import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { INVOICE_STATUSES } from "../repositories/invoicesRepository";
import { parseNumericInput } from "../utils/numbers";

const INVOICE_STATUS_SET = new Set<string>(INVOICE_STATUSES);

const parsePositiveInteger = (value: unknown): number | null => {
  const n = parseNumericInput(value);
  if (n === null) return null;
  const t = Math.trunc(n);
  if (t <= 0 || t !== n) return null;
  return t;
};

const parseNonNegativeNumber = (value: unknown): number | null => {
  const n = parseNumericInput(value);
  if (n === null || n < 0) return null;
  return n;
};

const validateStatus = (status: unknown): void => {
  if (typeof status !== "string" || !INVOICE_STATUS_SET.has(status)) {
    throw new ApiError(
      400,
      `Field 'status' must be one of: ${INVOICE_STATUSES.join(", ")}`
    );
  }
};

/** Line items: serviceId + quantity required. unitPrice from client is ignored (server uses services.price). */
const validateItems = (items: unknown, requireNonEmpty: boolean): void => {
  if (!Array.isArray(items)) {
    throw new ApiError(400, "Field 'items' must be an array");
  }

  if (requireNonEmpty && items.length === 0) {
    throw new ApiError(400, "Field 'items' must contain at least one item");
  }

  items.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      throw new ApiError(400, `Item at index ${index} must be an object`);
    }

    const entry = item as Record<string, unknown>;

    if (!parsePositiveInteger(entry.serviceId)) {
      throw new ApiError(400, `Item at index ${index}: 'serviceId' must be a positive integer`);
    }

    /** Цена строки с UI игнорируется при расчёте, но если пришла — должна быть числом ≥ 0. */
    if ("unitPrice" in entry && entry.unitPrice !== undefined && entry.unitPrice !== null) {
      if (parseNonNegativeNumber(entry.unitPrice) === null) {
        throw new ApiError(400, `Item at index ${index}: 'unitPrice' must be a number >= 0`);
      }
    }
    if ("price" in entry && entry.price !== undefined && entry.price !== null) {
      if (parseNonNegativeNumber(entry.price) === null) {
        throw new ApiError(400, `Item at index ${index}: 'price' must be a number >= 0`);
      }
    }

    if (
      entry.description !== undefined &&
      entry.description !== null &&
      (typeof entry.description !== "string" || entry.description.trim() === "")
    ) {
      throw new ApiError(
        400,
        `Item at index ${index}: when provided, 'description' must be a non-empty string`
      );
    }

    const quantity = parseNonNegativeNumber(entry.quantity);
    if (quantity === null || quantity <= 0) {
      throw new ApiError(400, `Item at index ${index}: 'quantity' must be greater than 0`);
    }
  });
};

export const validateInvoiceIdParam = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const parsedId = parsePositiveInteger(req.params.id);
  if (!parsedId) {
    throw new ApiError(400, "Path param 'id' must be a positive integer");
  }

  next();
};

export const validateCreateInvoice = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const {
    number,
    patientId,
    appointmentId,
    status,
    discount,
    paidAmount,
    items,
  } = req.body ?? {};

  if (number !== undefined && (typeof number !== "string" || number.trim() === "")) {
    throw new ApiError(400, "Field 'number' must be a non-empty string");
  }

  if (!parsePositiveInteger(patientId)) {
    throw new ApiError(400, "Field 'patientId' must be a positive integer");
  }

  if (!parsePositiveInteger(appointmentId)) {
    throw new ApiError(400, "Field 'appointmentId' is required and must be a positive integer");
  }

  if (status !== undefined) {
    validateStatus(status);
  }

  if (discount !== undefined && parseNonNegativeNumber(discount) === null) {
    throw new ApiError(400, "Field 'discount' must be greater than or equal to 0");
  }

  if (paidAmount !== undefined) {
    throw new ApiError(400, "Field 'paidAmount' is not accepted on create — use payments API");
  }

  validateItems(items, true);
  next();
};

export const validateUpdateInvoice = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const {
    number,
    patientId,
    appointmentId,
    status,
    discount,
    paidAmount,
    items,
  } = req.body ?? {};

  const hasAnyField =
    number !== undefined ||
    patientId !== undefined ||
    appointmentId !== undefined ||
    status !== undefined ||
    discount !== undefined ||
    paidAmount !== undefined ||
    items !== undefined;

  if (!hasAnyField) {
    throw new ApiError(400, "At least one field must be provided for update");
  }

  if (number !== undefined && (typeof number !== "string" || number.trim() === "")) {
    throw new ApiError(400, "Field 'number' must be a non-empty string");
  }

  if (patientId !== undefined && !parsePositiveInteger(patientId)) {
    throw new ApiError(400, "Field 'patientId' must be a positive integer");
  }

  if (appointmentId !== undefined && appointmentId !== null && !parsePositiveInteger(appointmentId)) {
    throw new ApiError(400, "Field 'appointmentId' must be a positive integer or null");
  }

  if (status !== undefined) {
    validateStatus(status);
  }

  if (discount !== undefined && parseNonNegativeNumber(discount) === null) {
    throw new ApiError(400, "Field 'discount' must be greater than or equal to 0");
  }

  if (paidAmount !== undefined) {
    throw new ApiError(400, "Field 'paidAmount' cannot be updated via invoices API — use payments");
  }

  if (items !== undefined) {
    validateItems(items, true);
  }

  next();
};
