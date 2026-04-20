const MAX_UZ_DIGITS = 12; // 998 + 9 национальных

/** +998 (XX) XXX-XX-XX из цифр 998 + до 9 цифр. */
function formatUz998Digits(digits998: string): string {
  const d = digits998.slice(0, MAX_UZ_DIGITS);
  if (!d.startsWith("998")) {
    return d.length ? `+${d}` : "";
  }
  const n = d.slice(3);
  if (n.length === 0) return "+998 (";
  const a = n.slice(0, 2);
  let s = "+998 (" + a;
  if (a.length < 2) return s;
  s += ") ";
  const b = n.slice(2, 5);
  s += b;
  if (n.length <= 5) return s;
  const c = n.slice(5, 7);
  s += `-${c}`;
  if (n.length <= 7) return s;
  const e = n.slice(7, 9);
  s += `-${e}`;
  return s;
}

/** Для номеров в БД без кода 998 (например +7…) — без шаблона UZ. */
function formatStoredNonUz(digits: string): string {
  if (!digits) return "";
  return `+${digits}`;
}

/**
 * Маска при вводе: всегда Узбекистан `+998 (__) ___-__-__`.
 * Локальный ввод без 998 дополняется префиксом 998.
 */
export function formatPhoneMaskInput(raw: string): string {
  if (!raw.trim()) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (!digits.startsWith("998")) {
    digits = "998" + digits;
  }
  return formatUz998Digits(digits);
}

/**
 * Отображение в поле при загрузке из API: 998… → маска UZ, иначе `+цифры`.
 */
export function formatStoredPhoneForInput(stored: string | null | undefined): string {
  if (!stored?.trim()) return "";
  const digits = stored.replace(/\D/g, "").slice(0, 15);
  if (!digits) return "";
  if (digits.startsWith("998")) {
    return formatUz998Digits(digits.slice(0, MAX_UZ_DIGITS));
  }
  return formatStoredNonUz(digits);
}

/** Значение для API: + и цифры (до 15). */
export function phoneToApiValue(masked: string): string {
  const d = masked.replace(/\D/g, "").slice(0, 15);
  if (!d) return "";
  return `+${d}`;
}
