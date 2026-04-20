"use strict";
/**
 * Общие SQL-фрагменты для AI (топ-врач, счета и т.д.).
 * Агрегаты выручки за день / 7д / всё время: см. `revenueMetricsSql.ts` — там же логика, что в PostgresReportsRepository.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqlTodayLocal = exports.sqlLocalDate = exports.sqlInvoiceValidForRevenue = exports.sqlNetPayment = void 0;
/** Net-сумма одной строки payment (учёт частичного возврата). */
const sqlNetPayment = (pAlias = "p") => `GREATEST(${pAlias}.amount::numeric - COALESCE(${pAlias}.refunded_amount, 0), 0)`;
exports.sqlNetPayment = sqlNetPayment;
/** Условие: счёт не удалён и не в финальных «плохих» статусах для выручки. */
const sqlInvoiceValidForRevenue = (iAlias = "i") => `${iAlias}.deleted_at IS NULL AND ${iAlias}.status NOT IN ('cancelled', 'refunded')`;
exports.sqlInvoiceValidForRevenue = sqlInvoiceValidForRevenue;
/** Дата в таймзоне клиники (REPORTS_TIMEZONE), для сравнения календарных дней. */
const sqlLocalDate = (tsExpr, tzParam = "$1") => `(${tsExpr} AT TIME ZONE ${tzParam}::text)::date`;
exports.sqlLocalDate = sqlLocalDate;
const sqlTodayLocal = (tzParam = "$1") => `(now() AT TIME ZONE ${tzParam}::text)::date`;
exports.sqlTodayLocal = sqlTodayLocal;
