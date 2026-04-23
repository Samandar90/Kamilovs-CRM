const GROUP = 3;
const MAX_INTEGER_DIGITS = 15;

function formatIntegerPart(absTrunc: number): string {
  if (!Number.isFinite(absTrunc) || absTrunc < 0) return "0";
  const s = String(absTrunc);
  const parts: string[] = [];
  for (let i = s.length; i > 0; i -= GROUP) {
    parts.unshift(s.slice(Math.max(0, i - GROUP), i));
  }
  return parts.join(" ");
}

/**
 * Группы по 3 цифры, разделитель — пробел. Дробная часть до 2 знаков через точку (только если не .00).
 */
export function formatMoney(value: number | string): string {
  const n = typeof value === "string" ? parseMoney(value) : value;
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const intPart = Math.trunc(abs);
  const frac = Math.round((abs - intPart) * 100);
  const intStr = formatIntegerPart(intPart);
  if (frac === 0) return sign + intStr;
  return `${sign}${intStr}.${String(frac).padStart(2, "0")}`;
}

/**
 * Разбор отображаемой строки (пробелы, запятая/точка как десятичный разделитель).
 */
export function parseMoney(value: string): number {
  if (value == null) return 0;
  const trimmed = String(value).trim();
  if (trimmed === "") return 0;
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  const cleaned = normalized.replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Только цифры (для целых сумм в инпуте). */
export function sanitizeMoneyInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, MAX_INTEGER_DIGITS);
}

export function moneyDigitCountBeforeCaret(display: string, caret: number): number {
  return display.slice(0, Math.max(0, caret)).replace(/\D/g, "").length;
}

export function moneyCaretAfterDigitCount(display: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < display.length; i++) {
    if (/\d/.test(display[i])) {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return display.length;
}
