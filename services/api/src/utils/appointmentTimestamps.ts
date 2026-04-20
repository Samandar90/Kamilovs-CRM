import { ApiError } from "../middleware/errorHandler";
import { formatLocalDateTime, parseLocalDateTime } from "./localDateTime";

/**
 * Парсит дату/время записи в канонический вид `YYYY-MM-DD HH:mm:ss` (локальное «стеночное» время)
 * для привязки к PostgreSQL `::timestamptz`.
 * На вход допускается ISO 8601 и смежные форматы, разбираемые `Date.parse`.
 */
export function tryParseAppointmentTimestampForDb(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const local = parseLocalDateTime(trimmed);
  if (local) {
    return formatLocalDateTime(local);
  }

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return null;
  }

  return formatLocalDateTime(d);
}

export function assertAppointmentTimestampForDb(
  value: unknown,
  fieldName: string
): string {
  if (value === undefined || value === null) {
    throw new ApiError(400, `Поле '${fieldName}' обязательно`);
  }
  if (typeof value !== "string") {
    throw new ApiError(400, `Поле '${fieldName}' должно быть строкой`);
  }

  const parsed = tryParseAppointmentTimestampForDb(value);
  if (parsed === null) {
    throw new ApiError(
      400,
      `Поле '${fieldName}': укажите корректную дату и время (YYYY-MM-DD HH:mm:ss или ISO 8601)`
    );
  }

  return parsed;
}

/** Пустое / отсутствующее значение → `null` (в SQL не биндить). */
export function assertOptionalAppointmentTimestampForDb(
  value: unknown,
  fieldName: string
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, `Поле '${fieldName}' должно быть строкой`);
  }
  if (value.trim() === "") {
    return null;
  }

  const parsed = tryParseAppointmentTimestampForDb(value);
  if (parsed === null) {
    throw new ApiError(
      400,
      `Поле '${fieldName}': укажите корректную дату и время (YYYY-MM-DD HH:mm:ss или ISO 8601)`
    );
  }

  return parsed;
}
