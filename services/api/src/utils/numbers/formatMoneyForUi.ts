/**
 * Только для ответов/логов — не использовать как источник для INSERT/UPDATE.
 */
export function formatMoneyForUi(value: unknown, locale = "ru-RU", currencyLabel = "сум"): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return `${n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currencyLabel}`;
}
