/**
 * Выручка AI = та же бизнес-логика, что и в PostgresReportsRepository (отчёты / metrics):
 * - payments + invoices (счёт не удалён, не cancelled/refunded)
 * - net: GREATEST(0, amount - COALESCE(refunded_amount, 0))
 * - календарный день в REPORTS_TIMEZONE (Asia/Tashkent): date_trunc + AT TIME ZONE $1
 *   (тот же приём, что в getRecommendationsAnalytics / todayRes в PostgresReportsRepository)
 *
 * Dashboard на клиенте суммирует payment.amount за «сегодня» в локальной зоне браузера;
 * на сервере источник истины для CRM — отчётная зона env.reportsTimezone.
 */

const tz = "$1";

/** Net-оплата одной строки (как в отчётах). */
export const SQL_AI_NET_PAYMENT = `GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))`;

/** База: только оплаты по учтённым счетам (как reports metrics). */
export const SQL_AI_PAYMENTS_BASE = `
FROM payments p
INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
WHERE p.deleted_at IS NULL
  AND i.status NOT IN ('cancelled', 'refunded')
`;

/** Сегодня = тот же предикат дня, что в PostgresReportsRepository (todayRes). */
export const SQL_AI_TODAY_PREDICATE = `
  AND date_trunc('day', p.created_at AT TIME ZONE ${tz}::text)
      = date_trunc('day', now() AT TIME ZONE ${tz}::text)
`;

/** Последние 7 календарных дней включая сегодня (в TZ клиники). */
export const SQL_AI_LAST_7D_PREDICATE = `
  AND date_trunc('day', p.created_at AT TIME ZONE ${tz}::text)
      >= date_trunc('day', now() AT TIME ZONE ${tz}::text) - interval '6 days'
  AND date_trunc('day', p.created_at AT TIME ZONE ${tz}::text)
      <= date_trunc('day', now() AT TIME ZONE ${tz}::text)
`;

export const SQL_PAYMENTS_REVENUE_TODAY = `
SELECT COALESCE(SUM(${SQL_AI_NET_PAYMENT}), 0)::text AS total
${SQL_AI_PAYMENTS_BASE}
${SQL_AI_TODAY_PREDICATE}
`;

export const SQL_PAYMENTS_REVENUE_7D = `
SELECT COALESCE(SUM(${SQL_AI_NET_PAYMENT}), 0)::text AS total
${SQL_AI_PAYMENTS_BASE}
${SQL_AI_LAST_7D_PREDICATE}
`;

export const SQL_PAYMENTS_REVENUE_TOTAL = `
SELECT COALESCE(SUM(${SQL_AI_NET_PAYMENT}), 0)::text AS total
${SQL_AI_PAYMENTS_BASE}
`;

export const SQL_PAYMENTS_COUNT_TODAY = `
SELECT COALESCE(SUM(
  CASE WHEN ${SQL_AI_NET_PAYMENT} > 0 THEN 1 ELSE 0 END
), 0)::text AS c
${SQL_AI_PAYMENTS_BASE}
${SQL_AI_TODAY_PREDICATE}
`;

export const SQL_PAYMENTS_COUNT_7D = `
SELECT COALESCE(SUM(
  CASE WHEN ${SQL_AI_NET_PAYMENT} > 0 THEN 1 ELSE 0 END
), 0)::text AS c
${SQL_AI_PAYMENTS_BASE}
${SQL_AI_LAST_7D_PREDICATE}
`;

/** Hybrid intent: сумма + count за сегодня. */
export const SQL_PAYMENTS_REVENUE_TODAY_HYBRID = `
SELECT COALESCE(SUM(${SQL_AI_NET_PAYMENT}), 0)::text AS total,
       COALESCE(SUM(
         CASE WHEN ${SQL_AI_NET_PAYMENT} > 0 THEN 1 ELSE 0 END
       ), 0)::text AS cnt
${SQL_AI_PAYMENTS_BASE}
${SQL_AI_TODAY_PREDICATE}
`;

/** Средняя дневная выручка за 7 дней (сумма / 7). */
export const SQL_AVG_DAILY_REVENUE_7D = `
SELECT (
  COALESCE(SUM(${SQL_AI_NET_PAYMENT}), 0)::float8 / 7.0
) AS avg
${SQL_AI_PAYMENTS_BASE}
${SQL_AI_LAST_7D_PREDICATE}
`;

/** 7 календарных дней до окна «последние 7 дней»: от (сегодня−13) до (сегодня−7) в TZ клиники. */
export const SQL_AI_PREV_7D_PREDICATE = `
  AND date_trunc('day', p.created_at AT TIME ZONE ${tz}::text)
      >= date_trunc('day', now() AT TIME ZONE ${tz}::text) - interval '13 days'
  AND date_trunc('day', p.created_at AT TIME ZONE ${tz}::text)
      <= date_trunc('day', now() AT TIME ZONE ${tz}::text) - interval '7 days'
`;

export const SQL_PAYMENTS_REVENUE_PREV_7D = `
SELECT COALESCE(SUM(${SQL_AI_NET_PAYMENT}), 0)::text AS total
${SQL_AI_PAYMENTS_BASE}
${SQL_AI_PREV_7D_PREDICATE}
`;
