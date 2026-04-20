import { ApiError } from "../../middleware/errorHandler";
import { sanitizeNumericString } from "./sanitizeNumericString";

/**
 * Унифицированный разбор денежных и числовых значений из API, форм, query, JSON.
 * Возвращает null если значение пустое или не распознано (не бросает).
 */
export function parseNumericInput(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return null;
  }
  const str = sanitizeNumericString(String(value));
  if (str === "" || str === "-" || str === "." || str === "-.") {
    return null;
  }
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

/** Алиас для денег — та же логика, явное имя в сервисах. */
export const parseMoneyInput = parseNumericInput;

/**
 * Значение из PostgreSQL NUMERIC (node-pg часто отдаёт строку). Без NaN.
 * Обёртка над parseNumericInput для использования в mapRow.
 */
export function parseNumericFromPg(value: string | number | null | undefined): number | null {
  return parseNumericInput(value);
}

export function parseRequiredNumber(value: unknown, fieldName: string): number {
  const n = parseNumericInput(value);
  if (n === null) {
    throw new ApiError(400, `Некорректное числовое значение поля: ${fieldName}`);
  }
  return n;
}

export function parseRequiredMoney(value: unknown, fieldName: string): number {
  return parseRequiredNumber(value, fieldName);
}

/** Неотрицательная сумма из БД (fallback при невалидной строке). */
export function parseNonNegativeMoneyFromPg(value: string | number | null | undefined, fallback = 0): number {
  const n = parseNumericInput(value);
  return n != null && n >= 0 ? n : fallback;
}

/** @deprecated используйте parseNonNegativeMoneyFromPg */
export const parseRequiredMoneyFromPg = parseNonNegativeMoneyFromPg;
