/**
 * Общие SQL-фрагменты для AI (топ-врач, счета и т.д.).
 * Агрегаты выручки за день / 7д / всё время: см. `revenueMetricsSql.ts` — там же логика, что в PostgresReportsRepository.
 */

/** Net-сумма одной строки payment (учёт частичного возврата). */
export const sqlNetPayment = (pAlias = "p"): string =>
  `GREATEST(${pAlias}.amount::numeric - COALESCE(${pAlias}.refunded_amount, 0), 0)`;

/** Условие: счёт не удалён и не в финальных «плохих» статусах для выручки. */
export const sqlInvoiceValidForRevenue = (iAlias = "i"): string =>
  `${iAlias}.deleted_at IS NULL AND ${iAlias}.status NOT IN ('cancelled', 'refunded')`;

/** Дата в таймзоне клиники (REPORTS_TIMEZONE), для сравнения календарных дней. */
export const sqlLocalDate = (tsExpr: string, tzParam = "$1"): string =>
  `(${tsExpr} AT TIME ZONE ${tzParam}::text)::date`;

export const sqlTodayLocal = (tzParam = "$1"): string => `(now() AT TIME ZONE ${tzParam}::text)::date`;
