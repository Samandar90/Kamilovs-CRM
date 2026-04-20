"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRevenueToday = getRevenueToday;
exports.getRevenue7Days = getRevenue7Days;
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const revenueMetricsSql_1 = require("./revenueMetricsSql");
/**
 * Выручка за сегодня / 7 дней — та же формула, что в `revenueMetricsSql` и PostgresReportsRepository:
 * payments + invoices (не cancelled/refunded), net-сумма, день в REPORTS_TIMEZONE.
 */
async function getRevenueToday() {
    const tz = env_1.env.reportsTimezone;
    const res = await database_1.dbPool.query(revenueMetricsSql_1.SQL_PAYMENTS_REVENUE_TODAY, [tz]);
    return Number(res.rows[0]?.total ?? 0);
}
/**
 * Сумма оплат за последние 7 календарных дней включая сегодня (в TZ клиники).
 */
async function getRevenue7Days() {
    const tz = env_1.env.reportsTimezone;
    const res = await database_1.dbPool.query(revenueMetricsSql_1.SQL_PAYMENTS_REVENUE_7D, [tz]);
    return Number(res.rows[0]?.total ?? 0);
}
