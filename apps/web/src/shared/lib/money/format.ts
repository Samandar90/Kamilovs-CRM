/** Только отображение — не использовать как значение для API. */
export function formatMoney(value: number, locale = "ru-RU"): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** С подписью «сум» для UZS в интерфейсе клиники. */
export function formatMoneySum(value: number, locale = "ru-RU"): string {
  return `${formatMoney(value, locale)} сум`;
}
