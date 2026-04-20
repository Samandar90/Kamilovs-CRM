import { dbPool } from "../config/database";
import { env } from "../config/env";
import {
  SQL_PAYMENTS_REVENUE_7D,
  SQL_PAYMENTS_REVENUE_TODAY,
} from "./revenueMetricsSql";

/**
 * Выручка за сегодня / 7 дней — та же формула, что в `revenueMetricsSql` и PostgresReportsRepository:
 * payments + invoices (не cancelled/refunded), net-сумма, день в REPORTS_TIMEZONE.
 */
export async function getRevenueToday(): Promise<number> {
  const tz = env.reportsTimezone;
  const res = await dbPool.query<{ total: string }>(SQL_PAYMENTS_REVENUE_TODAY, [tz]);
  return Number(res.rows[0]?.total ?? 0);
}

/**
 * Сумма оплат за последние 7 календарных дней включая сегодня (в TZ клиники).
 */
export async function getRevenue7Days(): Promise<number> {
  const tz = env.reportsTimezone;
  const res = await dbPool.query<{ total: string }>(SQL_PAYMENTS_REVENUE_7D, [tz]);
  return Number(res.rows[0]?.total ?? 0);
}
