"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresReportsRepository = void 0;
const database_1 = require("../../config/database");
const env_1 = require("../../config/env");
const numbers_1 = require("../../utils/numbers");
const num = (v) => (0, numbers_1.parseMoneyColumn)(v, 0);
const formatYmdInTimeZone = (isoNow, timeZone) => new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
}).format(isoNow);
const addDaysYmd = (ymd, deltaDays) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
    const x = new Date(t);
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
};
/** Payments: calendar end uses exclusive upper bound; full timestamps use inclusive end. */
const PAYMENT_TIME = `
  ($1::timestamptz IS NULL OR p.created_at >= $1::timestamptz)
  AND ($2::timestamptz IS NULL OR p.created_at < $2::timestamptz)
  AND ($3::timestamptz IS NULL OR p.created_at <= $3::timestamptz)
`;
const INVOICE_TIME = `
  ($1::timestamptz IS NULL OR inv.created_at >= $1::timestamptz)
  AND ($2::timestamptz IS NULL OR inv.created_at < $2::timestamptz)
  AND ($3::timestamptz IS NULL OR inv.created_at <= $3::timestamptz)
`;
const APPOINTMENT_TIME = `
  ($1::timestamptz IS NULL OR a.start_at >= $1::timestamptz)
  AND ($2::timestamptz IS NULL OR a.start_at < $2::timestamptz)
  AND ($3::timestamptz IS NULL OR a.start_at <= $3::timestamptz)
`;
class PostgresReportsRepository {
    async resolveBounds(range) {
        const tz = env_1.env.reportsTimezone;
        const df = range.dateFrom?.trim() ?? "";
        const dt = range.dateTo?.trim() ?? "";
        const r = await database_1.dbPool.query(`
        SELECT
          CASE
            WHEN trim(coalesce($2::text, '')) = '' THEN NULL::timestamptz
            WHEN trim($2) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (trim($2)::date AT TIME ZONE $1::text)
            ELSE trim($2)::timestamptz
          END AS from_inclusive,
          CASE
            WHEN trim(coalesce($3::text, '')) = '' THEN NULL::timestamptz
            WHEN trim($3) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN ((trim($3)::date + interval '1 day') AT TIME ZONE $1::text)
            ELSE NULL::timestamptz
          END AS to_exclusive,
          CASE
            WHEN trim(coalesce($3::text, '')) = '' THEN NULL::timestamptz
            WHEN trim($3) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN NULL::timestamptz
            ELSE trim($3)::timestamptz
          END AS to_inclusive
      `, [tz, df || null, dt || null]);
        return r.rows[0];
    }
    boundTriplet(b) {
        return [b.from_inclusive, b.to_exclusive, b.to_inclusive];
    }
    async getRevenueReport(granularity, range) {
        const b = await this.resolveBounds(range);
        const tz = env_1.env.reportsTimezone;
        const truncUnit = granularity === "day" ? "day" : granularity === "week" ? "week" : "month";
        const t = this.boundTriplet(b);
        const result = await database_1.dbPool.query(`
        SELECT
          to_char(
            date_trunc($4::text, p.created_at AT TIME ZONE $5::text),
            'YYYY-MM-DD'
          ) AS period_start,
          COALESCE(SUM(GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))), 0)::float8 AS total_revenue
        FROM payments p
        INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
        WHERE i.status NOT IN ('cancelled', 'refunded')
          AND p.deleted_at IS NULL
          AND ${PAYMENT_TIME}
        GROUP BY 1
        ORDER BY 1
      `, [...t, truncUnit, tz]);
        return result.rows.map((row) => ({
            periodStart: row.period_start,
            totalRevenue: num(row.total_revenue),
        }));
    }
    async getPaymentsByMethodReport(range) {
        const b = await this.resolveBounds(range);
        const t = this.boundTriplet(b);
        const result = await database_1.dbPool.query(`
        SELECT
          CASE WHEN p.method = 'cash' THEN 'cash' ELSE 'card' END AS method,
          COALESCE(SUM(GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))), 0)::float8 AS total_amount
        FROM payments p
        INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
        WHERE i.status NOT IN ('cancelled', 'refunded')
          AND p.deleted_at IS NULL
          AND ${PAYMENT_TIME}
        GROUP BY 1
        ORDER BY 1
      `, t);
        return result.rows.map((row) => ({
            method: row.method,
            totalAmount: num(row.total_amount),
        }));
    }
    async getInvoicesStatusSummaryReport(range) {
        const b = await this.resolveBounds(range);
        const t = this.boundTriplet(b);
        const result = await database_1.dbPool.query(`
        SELECT
          inv.status,
          COUNT(*)::int AS cnt,
          COALESCE(SUM(inv.total), 0)::float8 AS total_amount
        FROM invoices inv
        WHERE inv.deleted_at IS NULL
          AND ${INVOICE_TIME}
        GROUP BY inv.status
        ORDER BY inv.status
      `, t);
        return result.rows.map((row) => ({
            status: row.status,
            count: num(row.cnt),
            totalAmount: num(row.total_amount),
        }));
    }
    async getRevenueByDoctor(range) {
        const b = await this.resolveBounds(range);
        const t = this.boundTriplet(b);
        const result = await database_1.dbPool.query(`
        SELECT
          a.doctor_id,
          MAX(COALESCE(NULLIF(TRIM(d.full_name), ''), '—')) AS doctor_name,
          COALESCE(SUM(GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))), 0)::float8 AS total_revenue
        FROM payments p
        INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
        LEFT JOIN appointments a ON a.id = i.appointment_id AND a.deleted_at IS NULL
        LEFT JOIN doctors d ON d.id = a.doctor_id
        WHERE i.status NOT IN ('cancelled', 'refunded')
          AND p.deleted_at IS NULL
          AND ${PAYMENT_TIME}
        GROUP BY a.doctor_id
        ORDER BY total_revenue DESC
      `, t);
        return result.rows.map((row) => ({
            doctorId: row.doctor_id != null ? Number(row.doctor_id) : null,
            doctorName: row.doctor_name,
            totalRevenue: num(row.total_revenue),
        }));
    }
    async getRevenueByService(range) {
        const b = await this.resolveBounds(range);
        const t = this.boundTriplet(b);
        const result = await database_1.dbPool.query(`
        SELECT
          a.service_id,
          MAX(COALESCE(NULLIF(TRIM(s.name), ''), '—')) AS service_name,
          COALESCE(SUM(GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))), 0)::float8 AS total_revenue
        FROM payments p
        INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
        LEFT JOIN appointments a ON a.id = i.appointment_id AND a.deleted_at IS NULL
        LEFT JOIN services s ON s.id = a.service_id
        WHERE i.status NOT IN ('cancelled', 'refunded')
          AND p.deleted_at IS NULL
          AND ${PAYMENT_TIME}
        GROUP BY a.service_id
        ORDER BY total_revenue DESC
      `, t);
        return result.rows.map((row) => ({
            serviceId: row.service_id != null ? Number(row.service_id) : null,
            serviceName: row.service_name,
            totalRevenue: num(row.total_revenue),
        }));
    }
    async getReportMetrics(range) {
        const b = await this.resolveBounds(range);
        const t = this.boundTriplet(b);
        const [payRes, apptRes] = await Promise.all([
            database_1.dbPool.query(`
          SELECT
            COALESCE(SUM(GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))), 0)::float8 AS s,
            COALESCE(
              SUM(
                CASE
                  WHEN GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0)) > 0
                    THEN 1
                  ELSE 0
                END
              ),
              0
            )::int AS c
          FROM payments p
          INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
          WHERE i.status NOT IN ('cancelled', 'refunded')
            AND p.deleted_at IS NULL
            AND ${PAYMENT_TIME}
        `, t),
            database_1.dbPool.query(`
          SELECT COUNT(*)::int AS c
          FROM appointments a
          WHERE a.deleted_at IS NULL
            AND ${APPOINTMENT_TIME}
        `, t),
        ]);
        return {
            totalPaymentsAmount: num(payRes.rows[0]?.s ?? 0),
            paymentsCount: num(payRes.rows[0]?.c ?? 0),
            appointmentsCount: num(apptRes.rows[0]?.c ?? 0),
        };
    }
    async getReportsSummary() {
        const tz = env_1.env.reportsTimezone;
        const [totalsRes, byDayRes, byDoctorRes, byServiceRes] = await Promise.all([
            database_1.dbPool.query(`
        WITH b1 AS (
          SELECT
            $1::text AS tz,
            (now() AT TIME ZONE $1::text)::date AS today_d
        ),
        b2 AS (
          SELECT
            b1.tz,
            b1.today_d,
            b1.today_d - 1 AS yest_d,
            (date_trunc('week', now() AT TIME ZONE b1.tz))::date AS week_start_d,
            (date_trunc('month', now() AT TIME ZONE b1.tz))::date AS month_start_d
          FROM b1
        ),
        b3 AS (
          SELECT
            b2.*,
            LEAST(
              (b2.month_start_d::timestamp AT TIME ZONE b2.tz),
              (b2.week_start_d::timestamp AT TIME ZONE b2.tz),
              ((b2.today_d - 1)::timestamp AT TIME ZONE b2.tz)
            ) AS lower_ts
          FROM b2
        ),
        pay AS (
          SELECT
            GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0)) AS net,
            (p.created_at AT TIME ZONE (SELECT tz FROM b3 LIMIT 1))::date AS pay_d
          FROM payments p
          INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
          WHERE p.deleted_at IS NULL
            AND i.status NOT IN ('cancelled', 'refunded')
            AND p.created_at >= (SELECT lower_ts FROM b3 LIMIT 1)
        )
        SELECT
          COALESCE(SUM(pay.net) FILTER (WHERE pay.pay_d = b3.today_d), 0)::float8 AS revenue_today,
          COALESCE(SUM(pay.net) FILTER (WHERE pay.pay_d = b3.yest_d), 0)::float8 AS revenue_yesterday,
          COALESCE(
            SUM(pay.net) FILTER (
              WHERE pay.pay_d >= b3.week_start_d AND pay.pay_d <= b3.today_d
            ),
            0
          )::float8 AS revenue_week,
          COALESCE(
            SUM(pay.net) FILTER (
              WHERE pay.pay_d >= (b3.week_start_d - 7) AND pay.pay_d < b3.week_start_d
            ),
            0
          )::float8 AS revenue_previous_week,
          COALESCE(
            SUM(pay.net) FILTER (
              WHERE pay.pay_d >= b3.month_start_d AND pay.pay_d <= b3.today_d
            ),
            0
          )::float8 AS revenue_month
        FROM b3
        LEFT JOIN pay ON TRUE
        GROUP BY b3.today_d, b3.yest_d, b3.week_start_d, b3.month_start_d
        `, [tz]),
            database_1.dbPool.query(`
        WITH b AS (
          SELECT (now() AT TIME ZONE $1::text)::date AS today_d
        ),
        series AS (
          SELECT gs::date AS day
          FROM b,
            generate_series(b.today_d - 29, b.today_d, interval '1 day') AS gs
        ),
        agg AS (
          SELECT
            (p.created_at AT TIME ZONE $1::text)::date AS d,
            SUM(GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0)))::numeric AS amt
          FROM payments p
          INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
          WHERE p.deleted_at IS NULL
            AND i.status NOT IN ('cancelled', 'refunded')
            AND (p.created_at AT TIME ZONE $1::text)::date >= (SELECT today_d - 29 FROM b)
            AND (p.created_at AT TIME ZONE $1::text)::date <= (SELECT today_d FROM b)
          GROUP BY 1
        )
        SELECT
          to_char(s.day, 'YYYY-MM-DD') AS date,
          COALESCE(a.amt, 0)::float8 AS amount
        FROM series s
        LEFT JOIN agg a ON a.d = s.day
        ORDER BY s.day
        `, [tz]),
            database_1.dbPool.query(`
        WITH b AS (
          SELECT (now() AT TIME ZONE $1::text)::date AS today_d
        )
        SELECT
          MAX(COALESCE(NULLIF(TRIM(d.full_name), ''), '—')) AS doctor_name,
          COALESCE(
            SUM(GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))),
            0
          )::float8 AS amount
        FROM payments p
        INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
        LEFT JOIN appointments a ON a.id = i.appointment_id AND a.deleted_at IS NULL
        LEFT JOIN doctors d ON d.id = a.doctor_id
        WHERE p.deleted_at IS NULL
          AND i.status NOT IN ('cancelled', 'refunded')
          AND (p.created_at AT TIME ZONE $1::text)::date >= (SELECT today_d - 29 FROM b)
          AND (p.created_at AT TIME ZONE $1::text)::date <= (SELECT today_d FROM b)
        GROUP BY a.doctor_id
        HAVING COALESCE(SUM(GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))), 0) > 0
        ORDER BY amount DESC
        LIMIT 5
        `, [tz]),
            database_1.dbPool.query(`
        WITH b AS (
          SELECT (now() AT TIME ZONE $1::text)::date AS today_d
        )
        SELECT
          MAX(
            CASE
              WHEN ii.service_id IS NULL THEN 'Без услуги'
              ELSE COALESCE(NULLIF(TRIM(s.name), ''), '—')
            END
          ) AS service_name,
          COUNT(DISTINCT ii.id)::int AS cnt,
          COALESCE(
            SUM(
              GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))
              * (ii.line_total::numeric / NULLIF(ls.lines_sum, 0))
            ),
            0
          )::float8 AS amount
        FROM payments p
        INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
        INNER JOIN invoice_items ii ON ii.invoice_id = i.id
        INNER JOIN LATERAL (
          SELECT COALESCE(SUM(i2.line_total), 0)::numeric AS lines_sum
          FROM invoice_items i2
          WHERE i2.invoice_id = i.id
        ) ls ON ls.lines_sum > 0
        LEFT JOIN services s ON s.id = ii.service_id
        WHERE p.deleted_at IS NULL
          AND i.status NOT IN ('cancelled', 'refunded')
          AND (p.created_at AT TIME ZONE $1::text)::date >= (SELECT today_d - 29 FROM b)
          AND (p.created_at AT TIME ZONE $1::text)::date <= (SELECT today_d FROM b)
        GROUP BY ii.service_id
        HAVING COALESCE(
          SUM(
            GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))
            * (ii.line_total::numeric / NULLIF(ls.lines_sum, 0))
          ),
          0
        ) > 0
        ORDER BY amount DESC
        LIMIT 5
        `, [tz]),
        ]);
        const t = totalsRes.rows[0];
        return {
            revenueToday: num(t?.revenue_today ?? 0),
            revenueYesterday: num(t?.revenue_yesterday ?? 0),
            revenueWeek: num(t?.revenue_week ?? 0),
            revenuePreviousWeek: num(t?.revenue_previous_week ?? 0),
            revenueMonth: num(t?.revenue_month ?? 0),
            revenueByDay: byDayRes.rows.map((r) => ({ date: r.date, amount: num(r.amount) })),
            revenueByDoctor: byDoctorRes.rows.map((r) => ({
                doctorName: r.doctor_name ?? "—",
                amount: num(r.amount),
            })),
            revenueByService: byServiceRes.rows.map((r) => ({
                serviceName: r.service_name ?? "—",
                amount: num(r.amount),
                count: Math.round(num(r.cnt)),
            })),
        };
    }
    async getRecommendationsAnalytics() {
        const tz = env_1.env.reportsTimezone;
        const dateTo = formatYmdInTimeZone(new Date(), tz);
        const dateFrom = addDaysYmd(dateTo, -6);
        const [metrics, byDoctor, byService, points, countRes, todayRes, unpaidRes, loadsRes,] = await Promise.all([
            this.getReportMetrics({}),
            this.getRevenueByDoctor({}),
            this.getRevenueByService({}),
            this.getRevenueReport("day", { dateFrom, dateTo }),
            database_1.dbPool.query(`
          SELECT COUNT(*)::int AS c
          FROM payments p
          INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
          WHERE i.status NOT IN ('cancelled', 'refunded')
            AND p.deleted_at IS NULL
        `),
            database_1.dbPool.query(`
          SELECT COALESCE(SUM(GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))), 0)::float8 AS total
          FROM payments p
          INNER JOIN invoices i ON i.id = p.invoice_id AND i.deleted_at IS NULL
          WHERE i.status NOT IN ('cancelled', 'refunded')
            AND p.deleted_at IS NULL
            AND date_trunc('day', p.created_at AT TIME ZONE $1::text)
              = date_trunc('day', now() AT TIME ZONE $1::text)
        `, [tz]),
            database_1.dbPool.query(`
          SELECT COUNT(*)::int AS c
          FROM invoices inv
          WHERE inv.deleted_at IS NULL
            AND inv.status IN ('issued', 'partially_paid')
        `),
            database_1.dbPool.query(`
          WITH doc AS (
            SELECT
              d.id,
              MAX(COALESCE(NULLIF(TRIM(d.full_name), ''), 'Врач #' || d.id::text)) AS doctor_name,
              COUNT(*)::int AS cnt
            FROM appointments a
            INNER JOIN doctors d ON d.id = a.doctor_id
            WHERE a.deleted_at IS NULL
              AND d.deleted_at IS NULL
              AND a.start_at >= (now() - interval '30 days')
            GROUP BY d.id
          ),
          tot AS (
            SELECT COALESCE(SUM(cnt), 0)::int AS total FROM doc
          )
          SELECT doc.doctor_name,
            CASE
              WHEN tot.total > 0 THEN ROUND((doc.cnt::numeric / tot.total::numeric) * 100, 1)::float8
              ELSE 0::float8
            END AS load_pct
          FROM doc
          CROSS JOIN tot
          ORDER BY doc.cnt DESC
          LIMIT 8
        `),
        ]);
        const pointMap = new Map(points.map((p) => [p.periodStart, p.totalRevenue]));
        const dailyRevenueLast7Days = [];
        for (let i = 6; i >= 0; i -= 1) {
            const ymd = addDaysYmd(dateTo, -i);
            dailyRevenueLast7Days.push(num(pointMap.get(ymd) ?? 0));
        }
        const topD = byDoctor[0];
        const topS = byService[0];
        const topDoctor = topD && (topD.totalRevenue > 0 || topD.doctorName)
            ? { name: topD.doctorName ?? "—", revenue: num(topD.totalRevenue) }
            : null;
        const topService = topS && (topS.totalRevenue > 0 || topS.serviceName)
            ? { name: topS.serviceName ?? "—", revenue: num(topS.totalRevenue) }
            : null;
        return {
            qualifyingPaymentsCount: num(countRes.rows[0]?.c ?? 0),
            revenueTotal: metrics.totalPaymentsAmount,
            revenueToday: num(todayRes.rows[0]?.total ?? 0),
            topDoctor,
            topService,
            unpaidInvoicesCount: num(unpaidRes.rows[0]?.c ?? 0),
            dailyRevenueLast7Days,
            doctorLoads: loadsRes.rows.map((r) => ({
                doctorName: r.doctor_name,
                loadPct: num(r.load_pct),
            })),
        };
    }
}
exports.PostgresReportsRepository = PostgresReportsRepository;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvcmVwb3NpdG9yaWVzL3Bvc3RncmVzL1Bvc3RncmVzUmVwb3J0c1JlcG9zaXRvcnkudHMiLCJzb3VyY2VzIjpbIkM6L1VzZXJzL3VzZXIvRGVza3RvcC9jcm0gdjEuOC9zZXJ2aWNlcy9hcGkvc3JjL3JlcG9zaXRvcmllcy9wb3N0Z3Jlcy9Qb3N0Z3Jlc1JlcG9ydHNSZXBvc2l0b3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQWFBLG9EQUErQztBQUMvQywwQ0FBdUM7QUFDdkMsaURBQXVEO0FBUXZELE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBa0IsRUFBVSxFQUFFLENBQUMsSUFBQSwwQkFBZ0IsRUFBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFFbkUsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLE1BQVksRUFBRSxRQUFnQixFQUFVLEVBQUUsQ0FDckUsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRTtJQUMvQixRQUFRO0lBQ1IsSUFBSSxFQUFFLFNBQVM7SUFDZixLQUFLLEVBQUUsU0FBUztJQUNoQixHQUFHLEVBQUUsU0FBUztDQUNmLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFcEIsTUFBTSxVQUFVLEdBQUcsQ0FBQyxHQUFXLEVBQUUsU0FBaUIsRUFBVSxFQUFFO0lBQzVELE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzdDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsU0FBUyxHQUFHLFFBQVUsQ0FBQztJQUN6RCxNQUFNLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxD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QUksRUFBRSxJQUFJLENBQUMsV0FBVyxJQUFJLEdBQUcsRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRTtZQUNwRSxDQUFDLENBQUMsSUFBSSxDQUFDO1FBRVgsT0FBTztZQUNMLHVCQUF1QixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdEQsWUFBWSxFQUFFLE9BQU8sQ0FBQyxtQkFBbUI7WUFDekMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLENBQUM7WUFDL0MsU0FBUztZQUNULFVBQVU7WUFDVixtQkFBbUIsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25ELHFCQUFxQjtZQUNyQixXQUFXLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3JDLFVBQVUsRUFBRSxDQUFDLENBQUMsV0FBVztnQkFDekIsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO2FBQ3pCLENBQUMsQ0FBQztTQUNKLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUFuaUJELDhEQW1pQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IElSZXBvcnRzUmVwb3NpdG9yeSB9IGZyb20gXCIuLi9pbnRlcmZhY2VzL0lSZXBvcnRzUmVwb3NpdG9yeVwiO1xyXG5pbXBvcnQgdHlwZSB7IFJlY29tbWVuZGF0aW9uc0FuYWx5dGljc0RhdGEgfSBmcm9tIFwiLi4vaW50ZXJmYWNlcy9haVJlY29tbWVuZGF0aW9uc1R5cGVzXCI7XHJcbmltcG9ydCB0eXBlIHtcclxuICBJbnZvaWNlU3RhdHVzU3VtbWFyeVJvdyxcclxuICBQYXltZW50c0J5TWV0aG9kUm93LFxyXG4gIFJlcG9ydE1ldHJpY3MsXHJcbiAgUmVwb3J0c0RhdGVSYW5nZSxcclxuICBSZXBvcnRzR3JhbnVsYXJpdHksXHJcbiAgUmVwb3J0c1N1bW1hcnlEYXRhLFxyXG4gIFJldmVudWVCeURvY3RvclJvdyxcclxuICBSZXZlbnVlQnlTZXJ2aWNlUm93LFxyXG4gIFJldmVudWVQb2ludCxcclxufSBmcm9tIFwiLi4vaW50ZXJmYWNlcy9iaWxsaW5nVHlwZXNcIjtcclxuaW1wb3J0IHsgZGJQb29sIH0gZnJvbSBcIi4uLy4uL2NvbmZpZy9kYXRhYmFzZVwiO1xyXG5pbXBvcnQgeyBlbnYgfSBmcm9tIFwiLi4vLi4vY29uZmlnL2VudlwiO1xyXG5pbXBvcnQgeyBwYXJzZU1vbmV5Q29sdW1uIH0gZnJvbSBcIi4uLy4uL3V0aWxzL251bWJlcnNcIjtcclxuXHJcbnR5cGUgQm91bmRSb3cgPSB7XHJcbiAgZnJvbV9pbmNsdXNpdmU6IERhdGUgfCBudWxsO1xyXG4gIHRvX2V4Y2x1c2l2ZTogRGF0ZSB8IG51bGw7XHJcbiAgdG9faW5jbHVzaXZlOiBEYXRlIHwgbnVsbDtcclxufTtcclxuXHJcbmNvbnN0IG51bSA9ICh2OiBzdHJpbmcgfCBudW1iZXIpOiBudW1iZXIgPT4gcGFyc2VNb25leUNvbHVtbih2LCAwKTtcclxuXHJcbmNvbnN0IGZvcm1hdFltZEluVGltZVpvbmUgPSAoaXNvTm93OiBEYXRlLCB0aW1lWm9uZTogc3RyaW5nKTogc3RyaW5nID0+XHJcbiAgbmV3IEludGwuRGF0ZVRpbWVGb3JtYXQoXCJlbi1DQVwiLCB7XHJcbiAgICB0aW1lWm9uZSxcclxuICAgIHllYXI6IFwibnVtZXJpY1wiLFxyXG4gICAgbW9udGg6IFwiMi1kaWdpdFwiLFxyXG4gICAgZGF5OiBcIjItZGlnaXRcIixcclxuICB9KS5mb3JtYXQoaXNvTm93KTtcclxuXHJcbmNvbnN0IGFkZERheXNZbWQgPSAoeW1kOiBzdHJpbmcsIGRlbHRhRGF5czogbnVtYmVyKTogc3RyaW5nID0+IHtcclxuICBjb25zdCBbeSwgbSwgZF0gPSB5bWQuc3BsaXQoXCItXCIpLm1hcChOdW1iZXIpO1xyXG4gIGNvbnN0IHQgPSBEYXRlLlVUQyh5LCBtIC0gMSwgZCkgKyBkZWx0YURheXMgKiA4Nl80MDBfMDAwO1xyXG4gIGNvbnN0IHggPSBuZXcgRGF0ZSh0KTtcclxuICByZXR1cm4gYCR7eC5nZXRVVENGdWxsWWVhcigpfS0ke1N0cmluZyh4LmdldFVUQ01vbnRoKCkgKyAxKS5wYWRTdGFydCgyLCBcIjBcIil9LSR7U3RyaW5nKHguZ2V0VVRDRGF0ZSgpKS5wYWRTdGFydCgyLCBcIjBcIil9YDtcclxufTtcclxuXHJcbi8qKiBQYXltZW50czogY2FsZW5kYXIgZW5kIHVzZXMgZXhjbHVzaXZlIHVwcGVyIGJvdW5kOyBmdWxsIHRpbWVzdGFtcHMgdXNlIGluY2x1c2l2ZSBlbmQuICovXHJcbmNvbnN0IFBBWU1FTlRfVElNRSA9IGBcclxuICAoJDE6OnRpbWVzdGFtcHR6IElTIE5VTEwgT1IgcC5jcmVhdGVkX2F0ID49ICQxOjp0aW1lc3RhbXB0eilcclxuICBBTkQgKCQyOjp0aW1lc3RhbXB0eiBJUyBOVUxMIE9SIHAuY3JlYXRlZF9hdCA8ICQyOjp0aW1lc3RhbXB0eilcclxuICBBTkQgKCQzOjp0aW1lc3RhbXB0eiBJUyBOVUxMIE9SIHAuY3JlYXRlZF9hdCA8PSAkMzo6dGltZXN0YW1wdHopXHJcbmA7XHJcblxyXG5jb25zdCBJTlZPSUNFX1RJTUUgPSBgXHJcbiAgKCQxOjp0aW1lc3RhbXB0eiBJUyBOVUxMIE9SIGludi5jcmVhdGVkX2F0ID49ICQxOjp0aW1lc3RhbXB0eilcclxuICBBTkQgKCQyOjp0aW1lc3RhbXB0eiBJUyBOVUxMIE9SIGludi5jcmVhdGVkX2F0IDwgJDI6OnRpbWVzdGFtcHR6KVxyXG4gIEFORCAoJDM6OnRpbWVzdGFtcHR6IElTIE5VTEwgT1IgaW52LmNyZWF0ZWRfYXQgPD0gJDM6OnRpbWVzdGFtcHR6KVxyXG5gO1xyXG5cclxuY29uc3QgQVBQT0lOVE1FTlRfVElNRSA9IGBcclxuICAoJDE6OnRpbWVzdGFtcHR6IElTIE5VTEwgT1IgYS5zdGFydF9hdCA+PSAkMTo6dGltZXN0YW1wdHopXHJcbiAgQU5EICgkMjo6dGltZXN0YW1wdHogSVMgTlVMTCBPUiBhLnN0YXJ0X2F0IDwgJDI6OnRpbWVzdGFtcHR6KVxyXG4gIEFORCAoJDM6OnRpbWVzdGFtcHR6IElTIE5VTEwgT1IgYS5zdGFydF9hdCA8PSAkMzo6dGltZXN0YW1wdHopXHJcbmA7XHJcblxyXG5leHBvcnQgY2xhc3MgUG9zdGdyZXNSZXBvcnRzUmVwb3NpdG9yeSBpbXBsZW1lbnRzIElSZXBvcnRzUmVwb3NpdG9yeSB7XHJcbiAgcHJpdmF0ZSBhc3luYyByZXNvbHZlQm91bmRzKHJhbmdlOiBSZXBvcnRzRGF0ZVJhbmdlKTogUHJvbWlzZTxCb3VuZFJvdz4ge1xyXG4gICAgY29uc3QgdHogPSBlbnYucmVwb3J0c1RpbWV6b25lO1xyXG4gICAgY29uc3QgZGYgPSByYW5nZS5kYXRlRnJvbT8udHJpbSgpID8/IFwiXCI7XHJcbiAgICBjb25zdCBkdCA9IHJhbmdlLmRhdGVUbz8udHJpbSgpID8/IFwiXCI7XHJcbiAgICBjb25zdCByID0gYXdhaXQgZGJQb29sLnF1ZXJ5PEJvdW5kUm93PihcclxuICAgICAgYFxyXG4gICAgICAgIFNFTEVDVFxyXG4gICAgICAgICAgQ0FTRVxyXG4gICAgICAgICAgICBXSEVOIHRyaW0oY29hbGVzY2UoJDI6OnRleHQsICcnKSkgPSAnJyBUSEVOIE5VTEw6OnRpbWVzdGFtcHR6XHJcbiAgICAgICAgICAgIFdIRU4gdHJpbSgkMikgfiAnXlxcXFxkezR9LVxcXFxkezJ9LVxcXFxkezJ9JCcgVEhFTiAodHJpbSgkMik6OmRhdGUgQVQgVElNRSBaT05FICQxOjp0ZXh0KVxyXG4gICAgICAgICAgICBFTFNFIHRyaW0oJDIpOjp0aW1lc3RhbXB0elxyXG4gICAgICAgICAgRU5EIEFTIGZyb21faW5jbHVzaXZlLFxyXG4gICAgICAgICAgQ0FTRVxyXG4gICAgICAgICAgICBXSEVOIHRyaW0oY29hbGVzY2UoJDM6OnRleHQsICcnKSkgPSAnJyBUSEVOIE5VTEw6OnRpbWVzdGFtcHR6XHJcbiAgICAgICAgICAgIFdIRU4gdHJpbSgkMykgfiAnXlxcXFxkezR9LVxcXFxkezJ9LVxcXFxkezJ9JCcgVEhFTiAoKHRyaW0oJDMpOjpkYXRlICsgaW50ZXJ2YWwgJzEgZGF5JykgQVQgVElNRSBaT05FICQxOjp0ZXh0KVxyXG4gICAgICAgICAgICBFTFNFIE5VTEw6OnRpbWVzdGFtcHR6XHJcbiAgICAgICAgICBFTkQgQVMgdG9fZXhjbHVzaXZlLFxyXG4gICAgICAgICAgQ0FTRVxyXG4gICAgICAgICAgICBXSEVOIHRyaW0oY29hbGVzY2UoJDM6OnRleHQsICcnKSkgPSAnJyBUSEVOIE5VTEw6OnRpbWVzdGFtcHR6XHJcbiAgICAgICAgICAgIFdIRU4gdHJpbSgkMykgfiAnXlxcXFxkezR9LVxcXFxkezJ9LVxcXFxkezJ9JCcgVEhFTiBOVUxMOjp0aW1lc3RhbXB0elxyXG4gICAgICAgICAgICBFTFNFIHRyaW0oJDMpOjp0aW1lc3RhbXB0elxyXG4gICAgICAgICAgRU5EIEFTIHRvX2luY2x1c2l2ZVxyXG4gICAgICBgLFxyXG4gICAgICBbdHosIGRmIHx8IG51bGwsIGR0IHx8IG51bGxdXHJcbiAgICApO1xyXG4gICAgcmV0dXJuIHIucm93c1swXTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYm91bmRUcmlwbGV0KGI6IEJvdW5kUm93KTogW0RhdGUgfCBudWxsLCBEYXRlIHwgbnVsbCwgRGF0ZSB8IG51bGxdIHtcclxuICAgIHJldHVybiBbYi5mcm9tX2luY2x1c2l2ZSwgYi50b19leGNsdXNpdmUsIGIudG9faW5jbHVzaXZlXTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGdldFJldmVudWVSZXBvcnQoXHJcbiAgICBncmFudWxhcml0eTogUmVwb3J0c0dyYW51bGFyaXR5LFxyXG4gICAgcmFuZ2U6IFJlcG9ydHNEYXRlUmFuZ2VcclxuICApOiBQcm9taXNlPFJldmVudWVQb2ludFtdPiB7XHJcbiAgICBjb25zdCBiID0gYXdhaXQgdGhpcy5yZXNvbHZlQm91bmRzKHJhbmdlKTtcclxuICAgIGNvbnN0IHR6ID0gZW52LnJlcG9ydHNUaW1lem9uZTtcclxuICAgIGNvbnN0IHRydW5jVW5pdCA9XHJcbiAgICAgIGdyYW51bGFyaXR5ID09PSBcImRheVwiID8gXCJkYXlcIiA6IGdyYW51bGFyaXR5ID09PSBcIndlZWtcIiA/IFwid2Vla1wiIDogXCJtb250aFwiO1xyXG4gICAgY29uc3QgdCA9IHRoaXMuYm91bmRUcmlwbGV0KGIpO1xyXG5cclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiUG9vbC5xdWVyeTx7IHBlcmlvZF9zdGFydDogc3RyaW5nOyB0b3RhbF9yZXZlbnVlOiBzdHJpbmcgfCBudW1iZXIgfT4oXHJcbiAgICAgIGBcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIHRvX2NoYXIoXHJcbiAgICAgICAgICAgIGRhdGVfdHJ1bmMoJDQ6OnRleHQsIHAuY3JlYXRlZF9hdCBBVCBUSU1FIFpPTkUgJDU6OnRleHQpLFxyXG4gICAgICAgICAgICAnWVlZWS1NTS1ERCdcclxuICAgICAgICAgICkgQVMgcGVyaW9kX3N0YXJ0LFxyXG4gICAgICAgICAgQ09BTEVTQ0UoU1VNKEdSRUFURVNUKDA6Om51bWVyaWMsIHAuYW1vdW50IC0gQ09BTEVTQ0UocC5yZWZ1bmRlZF9hbW91bnQsIDApKSksIDApOjpmbG9hdDggQVMgdG90YWxfcmV2ZW51ZVxyXG4gICAgICAgIEZST00gcGF5bWVudHMgcFxyXG4gICAgICAgIElOTkVSIEpPSU4gaW52b2ljZXMgaSBPTiBpLmlkID0gcC5pbnZvaWNlX2lkIEFORCBpLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgIFdIRVJFIGkuc3RhdHVzIE5PVCBJTiAoJ2NhbmNlbGxlZCcsICdyZWZ1bmRlZCcpXHJcbiAgICAgICAgICBBTkQgcC5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgIEFORCAke1BBWU1FTlRfVElNRX1cclxuICAgICAgICBHUk9VUCBCWSAxXHJcbiAgICAgICAgT1JERVIgQlkgMVxyXG4gICAgICBgLFxyXG4gICAgICBbLi4udCwgdHJ1bmNVbml0LCB0el1cclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdC5yb3dzLm1hcCgocm93KSA9PiAoe1xyXG4gICAgICBwZXJpb2RTdGFydDogcm93LnBlcmlvZF9zdGFydCxcclxuICAgICAgdG90YWxSZXZlbnVlOiBudW0ocm93LnRvdGFsX3JldmVudWUpLFxyXG4gICAgfSkpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZ2V0UGF5bWVudHNCeU1ldGhvZFJlcG9ydChyYW5nZTogUmVwb3J0c0RhdGVSYW5nZSk6IFByb21pc2U8UGF5bWVudHNCeU1ldGhvZFJvd1tdPiB7XHJcbiAgICBjb25zdCBiID0gYXdhaXQgdGhpcy5yZXNvbHZlQm91bmRzKHJhbmdlKTtcclxuICAgIGNvbnN0IHQgPSB0aGlzLmJvdW5kVHJpcGxldChiKTtcclxuXHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYlBvb2wucXVlcnk8eyBtZXRob2Q6IHN0cmluZzsgdG90YWxfYW1vdW50OiBzdHJpbmcgfCBudW1iZXIgfT4oXHJcbiAgICAgIGBcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIENBU0UgV0hFTiBwLm1ldGhvZCA9ICdjYXNoJyBUSEVOICdjYXNoJyBFTFNFICdjYXJkJyBFTkQgQVMgbWV0aG9kLFxyXG4gICAgICAgICAgQ09BTEVTQ0UoU1VNKEdSRUFURVNUKDA6Om51bWVyaWMsIHAuYW1vdW50IC0gQ09BTEVTQ0UocC5yZWZ1bmRlZF9hbW91bnQsIDApKSksIDApOjpmbG9hdDggQVMgdG90YWxfYW1vdW50XHJcbiAgICAgICAgRlJPTSBwYXltZW50cyBwXHJcbiAgICAgICAgSU5ORVIgSk9JTiBpbnZvaWNlcyBpIE9OIGkuaWQgPSBwLmludm9pY2VfaWQgQU5EIGkuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgV0hFUkUgaS5zdGF0dXMgTk9UIElOICgnY2FuY2VsbGVkJywgJ3JlZnVuZGVkJylcclxuICAgICAgICAgIEFORCBwLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgQU5EICR7UEFZTUVOVF9USU1FfVxyXG4gICAgICAgIEdST1VQIEJZIDFcclxuICAgICAgICBPUkRFUiBCWSAxXHJcbiAgICAgIGAsXHJcbiAgICAgIHRcclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdC5yb3dzLm1hcCgocm93KSA9PiAoe1xyXG4gICAgICBtZXRob2Q6IHJvdy5tZXRob2QgYXMgUGF5bWVudHNCeU1ldGhvZFJvd1tcIm1ldGhvZFwiXSxcclxuICAgICAgdG90YWxBbW91bnQ6IG51bShyb3cudG90YWxfYW1vdW50KSxcclxuICAgIH0pKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGdldEludm9pY2VzU3RhdHVzU3VtbWFyeVJlcG9ydChcclxuICAgIHJhbmdlOiBSZXBvcnRzRGF0ZVJhbmdlXHJcbiAgKTogUHJvbWlzZTxJbnZvaWNlU3RhdHVzU3VtbWFyeVJvd1tdPiB7XHJcbiAgICBjb25zdCBiID0gYXdhaXQgdGhpcy5yZXNvbHZlQm91bmRzKHJhbmdlKTtcclxuICAgIGNvbnN0IHQgPSB0aGlzLmJvdW5kVHJpcGxldChiKTtcclxuXHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYlBvb2wucXVlcnk8e1xyXG4gICAgICBzdGF0dXM6IHN0cmluZztcclxuICAgICAgY250OiBzdHJpbmcgfCBudW1iZXI7XHJcbiAgICAgIHRvdGFsX2Ftb3VudDogc3RyaW5nIHwgbnVtYmVyO1xyXG4gICAgfT4oXHJcbiAgICAgIGBcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIGludi5zdGF0dXMsXHJcbiAgICAgICAgICBDT1VOVCgqKTo6aW50IEFTIGNudCxcclxuICAgICAgICAgIENPQUxFU0NFKFNVTShpbnYudG90YWwpLCAwKTo6ZmxvYXQ4IEFTIHRvdGFsX2Ftb3VudFxyXG4gICAgICAgIEZST00gaW52b2ljZXMgaW52XHJcbiAgICAgICAgV0hFUkUgaW52LmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgQU5EICR7SU5WT0lDRV9USU1FfVxyXG4gICAgICAgIEdST1VQIEJZIGludi5zdGF0dXNcclxuICAgICAgICBPUkRFUiBCWSBpbnYuc3RhdHVzXHJcbiAgICAgIGAsXHJcbiAgICAgIHRcclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdC5yb3dzLm1hcCgocm93KSA9PiAoe1xyXG4gICAgICBzdGF0dXM6IHJvdy5zdGF0dXMsXHJcbiAgICAgIGNvdW50OiBudW0ocm93LmNudCksXHJcbiAgICAgIHRvdGFsQW1vdW50OiBudW0ocm93LnRvdGFsX2Ftb3VudCksXHJcbiAgICB9KSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBnZXRSZXZlbnVlQnlEb2N0b3IocmFuZ2U6IFJlcG9ydHNEYXRlUmFuZ2UpOiBQcm9taXNlPFJldmVudWVCeURvY3RvclJvd1tdPiB7XHJcbiAgICBjb25zdCBiID0gYXdhaXQgdGhpcy5yZXNvbHZlQm91bmRzKHJhbmdlKTtcclxuICAgIGNvbnN0IHQgPSB0aGlzLmJvdW5kVHJpcGxldChiKTtcclxuXHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYlBvb2wucXVlcnk8e1xyXG4gICAgICBkb2N0b3JfaWQ6IHN0cmluZyB8IG51bWJlciB8IG51bGw7XHJcbiAgICAgIGRvY3Rvcl9uYW1lOiBzdHJpbmcgfCBudWxsO1xyXG4gICAgICB0b3RhbF9yZXZlbnVlOiBzdHJpbmcgfCBudW1iZXI7XHJcbiAgICB9PihcclxuICAgICAgYFxyXG4gICAgICAgIFNFTEVDVFxyXG4gICAgICAgICAgYS5kb2N0b3JfaWQsXHJcbiAgICAgICAgICBNQVgoQ09BTEVTQ0UoTlVMTElGKFRSSU0oZC5mdWxsX25hbWUpLCAnJyksICfigJQnKSkgQVMgZG9jdG9yX25hbWUsXHJcbiAgICAgICAgICBDT0FMRVNDRShTVU0oR1JFQVRFU1QoMDo6bnVtZXJpYywgcC5hbW91bnQgLSBDT0FMRVNDRShwLnJlZnVuZGVkX2Ftb3VudCwgMCkpKSwgMCk6OmZsb2F0OCBBUyB0b3RhbF9yZXZlbnVlXHJcbiAgICAgICAgRlJPTSBwYXltZW50cyBwXHJcbiAgICAgICAgSU5ORVIgSk9JTiBpbnZvaWNlcyBpIE9OIGkuaWQgPSBwLmludm9pY2VfaWQgQU5EIGkuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgTEVGVCBKT0lOIGFwcG9pbnRtZW50cyBhIE9OIGEuaWQgPSBpLmFwcG9pbnRtZW50X2lkIEFORCBhLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgIExFRlQgSk9JTiBkb2N0b3JzIGQgT04gZC5pZCA9IGEuZG9jdG9yX2lkXHJcbiAgICAgICAgV0hFUkUgaS5zdGF0dXMgTk9UIElOICgnY2FuY2VsbGVkJywgJ3JlZnVuZGVkJylcclxuICAgICAgICAgIEFORCBwLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgQU5EICR7UEFZTUVOVF9USU1FfVxyXG4gICAgICAgIEdST1VQIEJZIGEuZG9jdG9yX2lkXHJcbiAgICAgICAgT1JERVIgQlkgdG90YWxfcmV2ZW51ZSBERVNDXHJcbiAgICAgIGAsXHJcbiAgICAgIHRcclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdC5yb3dzLm1hcCgocm93KSA9PiAoe1xyXG4gICAgICBkb2N0b3JJZDogcm93LmRvY3Rvcl9pZCAhPSBudWxsID8gTnVtYmVyKHJvdy5kb2N0b3JfaWQpIDogbnVsbCxcclxuICAgICAgZG9jdG9yTmFtZTogcm93LmRvY3Rvcl9uYW1lLFxyXG4gICAgICB0b3RhbFJldmVudWU6IG51bShyb3cudG90YWxfcmV2ZW51ZSksXHJcbiAgICB9KSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBnZXRSZXZlbnVlQnlTZXJ2aWNlKHJhbmdlOiBSZXBvcnRzRGF0ZVJhbmdlKTogUHJvbWlzZTxSZXZlbnVlQnlTZXJ2aWNlUm93W10+IHtcclxuICAgIGNvbnN0IGIgPSBhd2FpdCB0aGlzLnJlc29sdmVCb3VuZHMocmFuZ2UpO1xyXG4gICAgY29uc3QgdCA9IHRoaXMuYm91bmRUcmlwbGV0KGIpO1xyXG5cclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiUG9vbC5xdWVyeTx7XHJcbiAgICAgIHNlcnZpY2VfaWQ6IHN0cmluZyB8IG51bWJlciB8IG51bGw7XHJcbiAgICAgIHNlcnZpY2VfbmFtZTogc3RyaW5nIHwgbnVsbDtcclxuICAgICAgdG90YWxfcmV2ZW51ZTogc3RyaW5nIHwgbnVtYmVyO1xyXG4gICAgfT4oXHJcbiAgICAgIGBcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIGEuc2VydmljZV9pZCxcclxuICAgICAgICAgIE1BWChDT0FMRVNDRShOVUxMSUYoVFJJTShzLm5hbWUpLCAnJyksICfigJQnKSkgQVMgc2VydmljZV9uYW1lLFxyXG4gICAgICAgICAgQ09BTEVTQ0UoU1VNKEdSRUFURVNUKDA6Om51bWVyaWMsIHAuYW1vdW50IC0gQ09BTEVTQ0UocC5yZWZ1bmRlZF9hbW91bnQsIDApKSksIDApOjpmbG9hdDggQVMgdG90YWxfcmV2ZW51ZVxyXG4gICAgICAgIEZST00gcGF5bWVudHMgcFxyXG4gICAgICAgIElOTkVSIEpPSU4gaW52b2ljZXMgaSBPTiBpLmlkID0gcC5pbnZvaWNlX2lkIEFORCBpLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgIExFRlQgSk9JTiBhcHBvaW50bWVudHMgYSBPTiBhLmlkID0gaS5hcHBvaW50bWVudF9pZCBBTkQgYS5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICBMRUZUIEpPSU4gc2VydmljZXMgcyBPTiBzLmlkID0gYS5zZXJ2aWNlX2lkXHJcbiAgICAgICAgV0hFUkUgaS5zdGF0dXMgTk9UIElOICgnY2FuY2VsbGVkJywgJ3JlZnVuZGVkJylcclxuICAgICAgICAgIEFORCBwLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgQU5EICR7UEFZTUVOVF9USU1FfVxyXG4gICAgICAgIEdST1VQIEJZIGEuc2VydmljZV9pZFxyXG4gICAgICAgIE9SREVSIEJZIHRvdGFsX3JldmVudWUgREVTQ1xyXG4gICAgICBgLFxyXG4gICAgICB0XHJcbiAgICApO1xyXG5cclxuICAgIHJldHVybiByZXN1bHQucm93cy5tYXAoKHJvdykgPT4gKHtcclxuICAgICAgc2VydmljZUlkOiByb3cuc2VydmljZV9pZCAhPSBudWxsID8gTnVtYmVyKHJvdy5zZXJ2aWNlX2lkKSA6IG51bGwsXHJcbiAgICAgIHNlcnZpY2VOYW1lOiByb3cuc2VydmljZV9uYW1lLFxyXG4gICAgICB0b3RhbFJldmVudWU6IG51bShyb3cudG90YWxfcmV2ZW51ZSksXHJcbiAgICB9KSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBnZXRSZXBvcnRNZXRyaWNzKHJhbmdlOiBSZXBvcnRzRGF0ZVJhbmdlKTogUHJvbWlzZTxSZXBvcnRNZXRyaWNzPiB7XHJcbiAgICBjb25zdCBiID0gYXdhaXQgdGhpcy5yZXNvbHZlQm91bmRzKHJhbmdlKTtcclxuICAgIGNvbnN0IHQgPSB0aGlzLmJvdW5kVHJpcGxldChiKTtcclxuXHJcbiAgICBjb25zdCBbcGF5UmVzLCBhcHB0UmVzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcclxuICAgICAgZGJQb29sLnF1ZXJ5PHsgczogc3RyaW5nIHwgbnVtYmVyOyBjOiBzdHJpbmcgfCBudW1iZXIgfT4oXHJcbiAgICAgICAgYFxyXG4gICAgICAgICAgU0VMRUNUXHJcbiAgICAgICAgICAgIENPQUxFU0NFKFNVTShHUkVBVEVTVCgwOjpudW1lcmljLCBwLmFtb3VudCAtIENPQUxFU0NFKHAucmVmdW5kZWRfYW1vdW50LCAwKSkpLCAwKTo6ZmxvYXQ4IEFTIHMsXHJcbiAgICAgICAgICAgIENPQUxFU0NFKFxyXG4gICAgICAgICAgICAgIFNVTShcclxuICAgICAgICAgICAgICAgIENBU0VcclxuICAgICAgICAgICAgICAgICAgV0hFTiBHUkVBVEVTVCgwOjpudW1lcmljLCBwLmFtb3VudCAtIENPQUxFU0NFKHAucmVmdW5kZWRfYW1vdW50LCAwKSkgPiAwXHJcbiAgICAgICAgICAgICAgICAgICAgVEhFTiAxXHJcbiAgICAgICAgICAgICAgICAgIEVMU0UgMFxyXG4gICAgICAgICAgICAgICAgRU5EXHJcbiAgICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgICAwXHJcbiAgICAgICAgICAgICk6OmludCBBUyBjXHJcbiAgICAgICAgICBGUk9NIHBheW1lbnRzIHBcclxuICAgICAgICAgIElOTkVSIEpPSU4gaW52b2ljZXMgaSBPTiBpLmlkID0gcC5pbnZvaWNlX2lkIEFORCBpLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgV0hFUkUgaS5zdGF0dXMgTk9UIElOICgnY2FuY2VsbGVkJywgJ3JlZnVuZGVkJylcclxuICAgICAgICAgICAgQU5EIHAuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIEFORCAke1BBWU1FTlRfVElNRX1cclxuICAgICAgICBgLFxyXG4gICAgICAgIHRcclxuICAgICAgKSxcclxuICAgICAgZGJQb29sLnF1ZXJ5PHsgYzogc3RyaW5nIHwgbnVtYmVyIH0+KFxyXG4gICAgICAgIGBcclxuICAgICAgICAgIFNFTEVDVCBDT1VOVCgqKTo6aW50IEFTIGNcclxuICAgICAgICAgIEZST00gYXBwb2ludG1lbnRzIGFcclxuICAgICAgICAgIFdIRVJFIGEuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIEFORCAke0FQUE9JTlRNRU5UX1RJTUV9XHJcbiAgICAgICAgYCxcclxuICAgICAgICB0XHJcbiAgICAgICksXHJcbiAgICBdKTtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICB0b3RhbFBheW1lbnRzQW1vdW50OiBudW0ocGF5UmVzLnJvd3NbMF0/LnMgPz8gMCksXHJcbiAgICAgIHBheW1lbnRzQ291bnQ6IG51bShwYXlSZXMucm93c1swXT8uYyA/PyAwKSxcclxuICAgICAgYXBwb2ludG1lbnRzQ291bnQ6IG51bShhcHB0UmVzLnJvd3NbMF0/LmMgPz8gMCksXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZ2V0UmVwb3J0c1N1bW1hcnkoKTogUHJvbWlzZTxSZXBvcnRzU3VtbWFyeURhdGE+IHtcclxuICAgIGNvbnN0IHR6ID0gZW52LnJlcG9ydHNUaW1lem9uZTtcclxuXHJcbiAgICBjb25zdCBbdG90YWxzUmVzLCBieURheVJlcywgYnlEb2N0b3JSZXMsIGJ5U2VydmljZVJlc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXHJcbiAgICAgIGRiUG9vbC5xdWVyeTx7XHJcbiAgICAgICAgcmV2ZW51ZV90b2RheTogc3RyaW5nIHwgbnVtYmVyO1xyXG4gICAgICAgIHJldmVudWVfeWVzdGVyZGF5OiBzdHJpbmcgfCBudW1iZXI7XHJcbiAgICAgICAgcmV2ZW51ZV93ZWVrOiBzdHJpbmcgfCBudW1iZXI7XHJcbiAgICAgICAgcmV2ZW51ZV9wcmV2aW91c193ZWVrOiBzdHJpbmcgfCBudW1iZXI7XHJcbiAgICAgICAgcmV2ZW51ZV9tb250aDogc3RyaW5nIHwgbnVtYmVyO1xyXG4gICAgICB9PihcclxuICAgICAgICBgXHJcbiAgICAgICAgV0lUSCBiMSBBUyAoXHJcbiAgICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgICAgJDE6OnRleHQgQVMgdHosXHJcbiAgICAgICAgICAgIChub3coKSBBVCBUSU1FIFpPTkUgJDE6OnRleHQpOjpkYXRlIEFTIHRvZGF5X2RcclxuICAgICAgICApLFxyXG4gICAgICAgIGIyIEFTIChcclxuICAgICAgICAgIFNFTEVDVFxyXG4gICAgICAgICAgICBiMS50eixcclxuICAgICAgICAgICAgYjEudG9kYXlfZCxcclxuICAgICAgICAgICAgYjEudG9kYXlfZCAtIDEgQVMgeWVzdF9kLFxyXG4gICAgICAgICAgICAoZGF0ZV90cnVuYygnd2VlaycsIG5vdygpIEFUIFRJTUUgWk9ORSBiMS50eikpOjpkYXRlIEFTIHdlZWtfc3RhcnRfZCxcclxuICAgICAgICAgICAgKGRhdGVfdHJ1bmMoJ21vbnRoJywgbm93KCkgQVQgVElNRSBaT05FIGIxLnR6KSk6OmRhdGUgQVMgbW9udGhfc3RhcnRfZFxyXG4gICAgICAgICAgRlJPTSBiMVxyXG4gICAgICAgICksXHJcbiAgICAgICAgYjMgQVMgKFxyXG4gICAgICAgICAgU0VMRUNUXHJcbiAgICAgICAgICAgIGIyLiosXHJcbiAgICAgICAgICAgIExFQVNUKFxyXG4gICAgICAgICAgICAgIChiMi5tb250aF9zdGFydF9kOjp0aW1lc3RhbXAgQVQgVElNRSBaT05FIGIyLnR6KSxcclxuICAgICAgICAgICAgICAoYjIud2Vla19zdGFydF9kOjp0aW1lc3RhbXAgQVQgVElNRSBaT05FIGIyLnR6KSxcclxuICAgICAgICAgICAgICAoKGIyLnRvZGF5X2QgLSAxKTo6dGltZXN0YW1wIEFUIFRJTUUgWk9ORSBiMi50eilcclxuICAgICAgICAgICAgKSBBUyBsb3dlcl90c1xyXG4gICAgICAgICAgRlJPTSBiMlxyXG4gICAgICAgICksXHJcbiAgICAgICAgcGF5IEFTIChcclxuICAgICAgICAgIFNFTEVDVFxyXG4gICAgICAgICAgICBHUkVBVEVTVCgwOjpudW1lcmljLCBwLmFtb3VudCAtIENPQUxFU0NFKHAucmVmdW5kZWRfYW1vdW50LCAwKSkgQVMgbmV0LFxyXG4gICAgICAgICAgICAocC5jcmVhdGVkX2F0IEFUIFRJTUUgWk9ORSAoU0VMRUNUIHR6IEZST00gYjMgTElNSVQgMSkpOjpkYXRlIEFTIHBheV9kXHJcbiAgICAgICAgICBGUk9NIHBheW1lbnRzIHBcclxuICAgICAgICAgIElOTkVSIEpPSU4gaW52b2ljZXMgaSBPTiBpLmlkID0gcC5pbnZvaWNlX2lkIEFORCBpLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgV0hFUkUgcC5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgICAgQU5EIGkuc3RhdHVzIE5PVCBJTiAoJ2NhbmNlbGxlZCcsICdyZWZ1bmRlZCcpXHJcbiAgICAgICAgICAgIEFORCBwLmNyZWF0ZWRfYXQgPj0gKFNFTEVDVCBsb3dlcl90cyBGUk9NIGIzIExJTUlUIDEpXHJcbiAgICAgICAgKVxyXG4gICAgICAgIFNFTEVDVFxyXG4gICAgICAgICAgQ09BTEVTQ0UoU1VNKHBheS5uZXQpIEZJTFRFUiAoV0hFUkUgcGF5LnBheV9kID0gYjMudG9kYXlfZCksIDApOjpmbG9hdDggQVMgcmV2ZW51ZV90b2RheSxcclxuICAgICAgICAgIENPQUxFU0NFKFNVTShwYXkubmV0KSBGSUxURVIgKFdIRVJFIHBheS5wYXlfZCA9IGIzLnllc3RfZCksIDApOjpmbG9hdDggQVMgcmV2ZW51ZV95ZXN0ZXJkYXksXHJcbiAgICAgICAgICBDT0FMRVNDRShcclxuICAgICAgICAgICAgU1VNKHBheS5uZXQpIEZJTFRFUiAoXHJcbiAgICAgICAgICAgICAgV0hFUkUgcGF5LnBheV9kID49IGIzLndlZWtfc3RhcnRfZCBBTkQgcGF5LnBheV9kIDw9IGIzLnRvZGF5X2RcclxuICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgMFxyXG4gICAgICAgICAgKTo6ZmxvYXQ4IEFTIHJldmVudWVfd2VlayxcclxuICAgICAgICAgIENPQUxFU0NFKFxyXG4gICAgICAgICAgICBTVU0ocGF5Lm5ldCkgRklMVEVSIChcclxuICAgICAgICAgICAgICBXSEVSRSBwYXkucGF5X2QgPj0gKGIzLndlZWtfc3RhcnRfZCAtIDcpIEFORCBwYXkucGF5X2QgPCBiMy53ZWVrX3N0YXJ0X2RcclxuICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgMFxyXG4gICAgICAgICAgKTo6ZmxvYXQ4IEFTIHJldmVudWVfcHJldmlvdXNfd2VlayxcclxuICAgICAgICAgIENPQUxFU0NFKFxyXG4gICAgICAgICAgICBTVU0ocGF5Lm5ldCkgRklMVEVSIChcclxuICAgICAgICAgICAgICBXSEVSRSBwYXkucGF5X2QgPj0gYjMubW9udGhfc3RhcnRfZCBBTkQgcGF5LnBheV9kIDw9IGIzLnRvZGF5X2RcclxuICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgMFxyXG4gICAgICAgICAgKTo6ZmxvYXQ4IEFTIHJldmVudWVfbW9udGhcclxuICAgICAgICBGUk9NIGIzXHJcbiAgICAgICAgTEVGVCBKT0lOIHBheSBPTiBUUlVFXHJcbiAgICAgICAgR1JPVVAgQlkgYjMudG9kYXlfZCwgYjMueWVzdF9kLCBiMy53ZWVrX3N0YXJ0X2QsIGIzLm1vbnRoX3N0YXJ0X2RcclxuICAgICAgICBgLFxyXG4gICAgICAgIFt0el1cclxuICAgICAgKSxcclxuICAgICAgZGJQb29sLnF1ZXJ5PHsgZGF0ZTogc3RyaW5nOyBhbW91bnQ6IHN0cmluZyB8IG51bWJlciB9PihcclxuICAgICAgICBgXHJcbiAgICAgICAgV0lUSCBiIEFTIChcclxuICAgICAgICAgIFNFTEVDVCAobm93KCkgQVQgVElNRSBaT05FICQxOjp0ZXh0KTo6ZGF0ZSBBUyB0b2RheV9kXHJcbiAgICAgICAgKSxcclxuICAgICAgICBzZXJpZXMgQVMgKFxyXG4gICAgICAgICAgU0VMRUNUIGdzOjpkYXRlIEFTIGRheVxyXG4gICAgICAgICAgRlJPTSBiLFxyXG4gICAgICAgICAgICBnZW5lcmF0ZV9zZXJpZXMoYi50b2RheV9kIC0gMjksIGIudG9kYXlfZCwgaW50ZXJ2YWwgJzEgZGF5JykgQVMgZ3NcclxuICAgICAgICApLFxyXG4gICAgICAgIGFnZyBBUyAoXHJcbiAgICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgICAgKHAuY3JlYXRlZF9hdCBBVCBUSU1FIFpPTkUgJDE6OnRleHQpOjpkYXRlIEFTIGQsXHJcbiAgICAgICAgICAgIFNVTShHUkVBVEVTVCgwOjpudW1lcmljLCBwLmFtb3VudCAtIENPQUxFU0NFKHAucmVmdW5kZWRfYW1vdW50LCAwKSkpOjpudW1lcmljIEFTIGFtdFxyXG4gICAgICAgICAgRlJPTSBwYXltZW50cyBwXHJcbiAgICAgICAgICBJTk5FUiBKT0lOIGludm9pY2VzIGkgT04gaS5pZCA9IHAuaW52b2ljZV9pZCBBTkQgaS5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgIFdIRVJFIHAuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIEFORCBpLnN0YXR1cyBOT1QgSU4gKCdjYW5jZWxsZWQnLCAncmVmdW5kZWQnKVxyXG4gICAgICAgICAgICBBTkQgKHAuY3JlYXRlZF9hdCBBVCBUSU1FIFpPTkUgJDE6OnRleHQpOjpkYXRlID49IChTRUxFQ1QgdG9kYXlfZCAtIDI5IEZST00gYilcclxuICAgICAgICAgICAgQU5EIChwLmNyZWF0ZWRfYXQgQVQgVElNRSBaT05FICQxOjp0ZXh0KTo6ZGF0ZSA8PSAoU0VMRUNUIHRvZGF5X2QgRlJPTSBiKVxyXG4gICAgICAgICAgR1JPVVAgQlkgMVxyXG4gICAgICAgIClcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIHRvX2NoYXIocy5kYXksICdZWVlZLU1NLUREJykgQVMgZGF0ZSxcclxuICAgICAgICAgIENPQUxFU0NFKGEuYW10LCAwKTo6ZmxvYXQ4IEFTIGFtb3VudFxyXG4gICAgICAgIEZST00gc2VyaWVzIHNcclxuICAgICAgICBMRUZUIEpPSU4gYWdnIGEgT04gYS5kID0gcy5kYXlcclxuICAgICAgICBPUkRFUiBCWSBzLmRheVxyXG4gICAgICAgIGAsXHJcbiAgICAgICAgW3R6XVxyXG4gICAgICApLFxyXG4gICAgICBkYlBvb2wucXVlcnk8eyBkb2N0b3JfbmFtZTogc3RyaW5nIHwgbnVsbDsgYW1vdW50OiBzdHJpbmcgfCBudW1iZXIgfT4oXHJcbiAgICAgICAgYFxyXG4gICAgICAgIFdJVEggYiBBUyAoXHJcbiAgICAgICAgICBTRUxFQ1QgKG5vdygpIEFUIFRJTUUgWk9ORSAkMTo6dGV4dCk6OmRhdGUgQVMgdG9kYXlfZFxyXG4gICAgICAgIClcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIE1BWChDT0FMRVNDRShOVUxMSUYoVFJJTShkLmZ1bGxfbmFtZSksICcnKSwgJ+KAlCcpKSBBUyBkb2N0b3JfbmFtZSxcclxuICAgICAgICAgIENPQUxFU0NFKFxyXG4gICAgICAgICAgICBTVU0oR1JFQVRFU1QoMDo6bnVtZXJpYywgcC5hbW91bnQgLSBDT0FMRVNDRShwLnJlZnVuZGVkX2Ftb3VudCwgMCkpKSxcclxuICAgICAgICAgICAgMFxyXG4gICAgICAgICAgKTo6ZmxvYXQ4IEFTIGFtb3VudFxyXG4gICAgICAgIEZST00gcGF5bWVudHMgcFxyXG4gICAgICAgIElOTkVSIEpPSU4gaW52b2ljZXMgaSBPTiBpLmlkID0gcC5pbnZvaWNlX2lkIEFORCBpLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgIExFRlQgSk9JTiBhcHBvaW50bWVudHMgYSBPTiBhLmlkID0gaS5hcHBvaW50bWVudF9pZCBBTkQgYS5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICBMRUZUIEpPSU4gZG9jdG9ycyBkIE9OIGQuaWQgPSBhLmRvY3Rvcl9pZFxyXG4gICAgICAgIFdIRVJFIHAuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICBBTkQgaS5zdGF0dXMgTk9UIElOICgnY2FuY2VsbGVkJywgJ3JlZnVuZGVkJylcclxuICAgICAgICAgIEFORCAocC5jcmVhdGVkX2F0IEFUIFRJTUUgWk9ORSAkMTo6dGV4dCk6OmRhdGUgPj0gKFNFTEVDVCB0b2RheV9kIC0gMjkgRlJPTSBiKVxyXG4gICAgICAgICAgQU5EIChwLmNyZWF0ZWRfYXQgQVQgVElNRSBaT05FICQxOjp0ZXh0KTo6ZGF0ZSA8PSAoU0VMRUNUIHRvZGF5X2QgRlJPTSBiKVxyXG4gICAgICAgIEdST1VQIEJZIGEuZG9jdG9yX2lkXHJcbiAgICAgICAgSEFWSU5HIENPQUxFU0NFKFNVTShHUkVBVEVTVCgwOjpudW1lcmljLCBwLmFtb3VudCAtIENPQUxFU0NFKHAucmVmdW5kZWRfYW1vdW50LCAwKSkpLCAwKSA+IDBcclxuICAgICAgICBPUkRFUiBCWSBhbW91bnQgREVTQ1xyXG4gICAgICAgIExJTUlUIDVcclxuICAgICAgICBgLFxyXG4gICAgICAgIFt0el1cclxuICAgICAgKSxcclxuICAgICAgZGJQb29sLnF1ZXJ5PHsgc2VydmljZV9uYW1lOiBzdHJpbmcgfCBudWxsOyBhbW91bnQ6IHN0cmluZyB8IG51bWJlcjsgY250OiBzdHJpbmcgfCBudW1iZXIgfT4oXHJcbiAgICAgICAgYFxyXG4gICAgICAgIFdJVEggYiBBUyAoXHJcbiAgICAgICAgICBTRUxFQ1QgKG5vdygpIEFUIFRJTUUgWk9ORSAkMTo6dGV4dCk6OmRhdGUgQVMgdG9kYXlfZFxyXG4gICAgICAgIClcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIE1BWChcclxuICAgICAgICAgICAgQ0FTRVxyXG4gICAgICAgICAgICAgIFdIRU4gaWkuc2VydmljZV9pZCBJUyBOVUxMIFRIRU4gJ9CR0LXQtyDRg9GB0LvRg9Cz0LgnXHJcbiAgICAgICAgICAgICAgRUxTRSBDT0FMRVNDRShOVUxMSUYoVFJJTShzLm5hbWUpLCAnJyksICfigJQnKVxyXG4gICAgICAgICAgICBFTkRcclxuICAgICAgICAgICkgQVMgc2VydmljZV9uYW1lLFxyXG4gICAgICAgICAgQ09VTlQoRElTVElOQ1QgaWkuaWQpOjppbnQgQVMgY250LFxyXG4gICAgICAgICAgQ09BTEVTQ0UoXHJcbiAgICAgICAgICAgIFNVTShcclxuICAgICAgICAgICAgICBHUkVBVEVTVCgwOjpudW1lcmljLCBwLmFtb3VudCAtIENPQUxFU0NFKHAucmVmdW5kZWRfYW1vdW50LCAwKSlcclxuICAgICAgICAgICAgICAqIChpaS5saW5lX3RvdGFsOjpudW1lcmljIC8gTlVMTElGKGxzLmxpbmVzX3N1bSwgMCkpXHJcbiAgICAgICAgICAgICksXHJcbiAgICAgICAgICAgIDBcclxuICAgICAgICAgICk6OmZsb2F0OCBBUyBhbW91bnRcclxuICAgICAgICBGUk9NIHBheW1lbnRzIHBcclxuICAgICAgICBJTk5FUiBKT0lOIGludm9pY2VzIGkgT04gaS5pZCA9IHAuaW52b2ljZV9pZCBBTkQgaS5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICBJTk5FUiBKT0lOIGludm9pY2VfaXRlbXMgaWkgT04gaWkuaW52b2ljZV9pZCA9IGkuaWRcclxuICAgICAgICBJTk5FUiBKT0lOIExBVEVSQUwgKFxyXG4gICAgICAgICAgU0VMRUNUIENPQUxFU0NFKFNVTShpMi5saW5lX3RvdGFsKSwgMCk6Om51bWVyaWMgQVMgbGluZXNfc3VtXHJcbiAgICAgICAgICBGUk9NIGludm9pY2VfaXRlbXMgaTJcclxuICAgICAgICAgIFdIRVJFIGkyLmludm9pY2VfaWQgPSBpLmlkXHJcbiAgICAgICAgKSBscyBPTiBscy5saW5lc19zdW0gPiAwXHJcbiAgICAgICAgTEVGVCBKT0lOIHNlcnZpY2VzIHMgT04gcy5pZCA9IGlpLnNlcnZpY2VfaWRcclxuICAgICAgICBXSEVSRSBwLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgQU5EIGkuc3RhdHVzIE5PVCBJTiAoJ2NhbmNlbGxlZCcsICdyZWZ1bmRlZCcpXHJcbiAgICAgICAgICBBTkQgKHAuY3JlYXRlZF9hdCBBVCBUSU1FIFpPTkUgJDE6OnRleHQpOjpkYXRlID49IChTRUxFQ1QgdG9kYXlfZCAtIDI5IEZST00gYilcclxuICAgICAgICAgIEFORCAocC5jcmVhdGVkX2F0IEFUIFRJTUUgWk9ORSAkMTo6dGV4dCk6OmRhdGUgPD0gKFNFTEVDVCB0b2RheV9kIEZST00gYilcclxuICAgICAgICBHUk9VUCBCWSBpaS5zZXJ2aWNlX2lkXHJcbiAgICAgICAgSEFWSU5HIENPQUxFU0NFKFxyXG4gICAgICAgICAgU1VNKFxyXG4gICAgICAgICAgICBHUkVBVEVTVCgwOjpudW1lcmljLCBwLmFtb3VudCAtIENPQUxFU0NFKHAucmVmdW5kZWRfYW1vdW50LCAwKSlcclxuICAgICAgICAgICAgKiAoaWkubGluZV90b3RhbDo6bnVtZXJpYyAvIE5VTExJRihscy5saW5lc19zdW0sIDApKVxyXG4gICAgICAgICAgKSxcclxuICAgICAgICAgIDBcclxuICAgICAgICApID4gMFxyXG4gICAgICAgIE9SREVSIEJZIGFtb3VudCBERVNDXHJcbiAgICAgICAgTElNSVQgNVxyXG4gICAgICAgIGAsXHJcbiAgICAgICAgW3R6XVxyXG4gICAgICApLFxyXG4gICAgXSk7XHJcblxyXG4gICAgY29uc3QgdCA9IHRvdGFsc1Jlcy5yb3dzWzBdO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcmV2ZW51ZVRvZGF5OiBudW0odD8ucmV2ZW51ZV90b2RheSA/PyAwKSxcclxuICAgICAgcmV2ZW51ZVllc3RlcmRheTogbnVtKHQ/LnJldmVudWVfeWVzdGVyZGF5ID8/IDApLFxyXG4gICAgICByZXZlbnVlV2VlazogbnVtKHQ/LnJldmVudWVfd2VlayA/PyAwKSxcclxuICAgICAgcmV2ZW51ZVByZXZpb3VzV2VlazogbnVtKHQ/LnJldmVudWVfcHJldmlvdXNfd2VlayA/PyAwKSxcclxuICAgICAgcmV2ZW51ZU1vbnRoOiBudW0odD8ucmV2ZW51ZV9tb250aCA/PyAwKSxcclxuICAgICAgcmV2ZW51ZUJ5RGF5OiBieURheVJlcy5yb3dzLm1hcCgocikgPT4gKHsgZGF0ZTogci5kYXRlLCBhbW91bnQ6IG51bShyLmFtb3VudCkgfSkpLFxyXG4gICAgICByZXZlbnVlQnlEb2N0b3I6IGJ5RG9jdG9yUmVzLnJvd3MubWFwKChyKSA9PiAoe1xyXG4gICAgICAgIGRvY3Rvck5hbWU6IHIuZG9jdG9yX25hbWUgPz8gXCLigJRcIixcclxuICAgICAgICBhbW91bnQ6IG51bShyLmFtb3VudCksXHJcbiAgICAgIH0pKSxcclxuICAgICAgcmV2ZW51ZUJ5U2VydmljZTogYnlTZXJ2aWNlUmVzLnJvd3MubWFwKChyKSA9PiAoe1xyXG4gICAgICAgIHNlcnZpY2VOYW1lOiByLnNlcnZpY2VfbmFtZSA/PyBcIuKAlFwiLFxyXG4gICAgICAgIGFtb3VudDogbnVtKHIuYW1vdW50KSxcclxuICAgICAgICBjb3VudDogTWF0aC5yb3VuZChudW0oci5jbnQpKSxcclxuICAgICAgfSkpLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGdldFJlY29tbWVuZGF0aW9uc0FuYWx5dGljcygpOiBQcm9taXNlPFJlY29tbWVuZGF0aW9uc0FuYWx5dGljc0RhdGE+IHtcclxuICAgIGNvbnN0IHR6ID0gZW52LnJlcG9ydHNUaW1lem9uZTtcclxuICAgIGNvbnN0IGRhdGVUbyA9IGZvcm1hdFltZEluVGltZVpvbmUobmV3IERhdGUoKSwgdHopO1xyXG4gICAgY29uc3QgZGF0ZUZyb20gPSBhZGREYXlzWW1kKGRhdGVUbywgLTYpO1xyXG5cclxuICAgIGNvbnN0IFtcclxuICAgICAgbWV0cmljcyxcclxuICAgICAgYnlEb2N0b3IsXHJcbiAgICAgIGJ5U2VydmljZSxcclxuICAgICAgcG9pbnRzLFxyXG4gICAgICBjb3VudFJlcyxcclxuICAgICAgdG9kYXlSZXMsXHJcbiAgICAgIHVucGFpZFJlcyxcclxuICAgICAgbG9hZHNSZXMsXHJcbiAgICBdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xyXG4gICAgICB0aGlzLmdldFJlcG9ydE1ldHJpY3Moe30pLFxyXG4gICAgICB0aGlzLmdldFJldmVudWVCeURvY3Rvcih7fSksXHJcbiAgICAgIHRoaXMuZ2V0UmV2ZW51ZUJ5U2VydmljZSh7fSksXHJcbiAgICAgIHRoaXMuZ2V0UmV2ZW51ZVJlcG9ydChcImRheVwiLCB7IGRhdGVGcm9tLCBkYXRlVG8gfSksXHJcbiAgICAgIGRiUG9vbC5xdWVyeTx7IGM6IHN0cmluZyB8IG51bWJlciB9PihcclxuICAgICAgICBgXHJcbiAgICAgICAgICBTRUxFQ1QgQ09VTlQoKik6OmludCBBUyBjXHJcbiAgICAgICAgICBGUk9NIHBheW1lbnRzIHBcclxuICAgICAgICAgIElOTkVSIEpPSU4gaW52b2ljZXMgaSBPTiBpLmlkID0gcC5pbnZvaWNlX2lkIEFORCBpLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgV0hFUkUgaS5zdGF0dXMgTk9UIElOICgnY2FuY2VsbGVkJywgJ3JlZnVuZGVkJylcclxuICAgICAgICAgICAgQU5EIHAuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgYFxyXG4gICAgICApLFxyXG4gICAgICBkYlBvb2wucXVlcnk8eyB0b3RhbDogc3RyaW5nIHwgbnVtYmVyIH0+KFxyXG4gICAgICAgIGBcclxuICAgICAgICAgIFNFTEVDVCBDT0FMRVNDRShTVU0oR1JFQVRFU1QoMDo6bnVtZXJpYywgcC5hbW91bnQgLSBDT0FMRVNDRShwLnJlZnVuZGVkX2Ftb3VudCwgMCkpKSwgMCk6OmZsb2F0OCBBUyB0b3RhbFxyXG4gICAgICAgICAgRlJPTSBwYXltZW50cyBwXHJcbiAgICAgICAgICBJTk5FUiBKT0lOIGludm9pY2VzIGkgT04gaS5pZCA9IHAuaW52b2ljZV9pZCBBTkQgaS5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgIFdIRVJFIGkuc3RhdHVzIE5PVCBJTiAoJ2NhbmNlbGxlZCcsICdyZWZ1bmRlZCcpXHJcbiAgICAgICAgICAgIEFORCBwLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICBBTkQgZGF0ZV90cnVuYygnZGF5JywgcC5jcmVhdGVkX2F0IEFUIFRJTUUgWk9ORSAkMTo6dGV4dClcclxuICAgICAgICAgICAgICA9IGRhdGVfdHJ1bmMoJ2RheScsIG5vdygpIEFUIFRJTUUgWk9ORSAkMTo6dGV4dClcclxuICAgICAgICBgLFxyXG4gICAgICAgIFt0el1cclxuICAgICAgKSxcclxuICAgICAgZGJQb29sLnF1ZXJ5PHsgYzogc3RyaW5nIHwgbnVtYmVyIH0+KFxyXG4gICAgICAgIGBcclxuICAgICAgICAgIFNFTEVDVCBDT1VOVCgqKTo6aW50IEFTIGNcclxuICAgICAgICAgIEZST00gaW52b2ljZXMgaW52XHJcbiAgICAgICAgICBXSEVSRSBpbnYuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIEFORCBpbnYuc3RhdHVzIElOICgnaXNzdWVkJywgJ3BhcnRpYWxseV9wYWlkJylcclxuICAgICAgICBgXHJcbiAgICAgICksXHJcbiAgICAgIGRiUG9vbC5xdWVyeTx7IGRvY3Rvcl9uYW1lOiBzdHJpbmc7IGxvYWRfcGN0OiBzdHJpbmcgfCBudW1iZXIgfT4oXHJcbiAgICAgICAgYFxyXG4gICAgICAgICAgV0lUSCBkb2MgQVMgKFxyXG4gICAgICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgICAgICBkLmlkLFxyXG4gICAgICAgICAgICAgIE1BWChDT0FMRVNDRShOVUxMSUYoVFJJTShkLmZ1bGxfbmFtZSksICcnKSwgJ9CS0YDQsNGHICMnIHx8IGQuaWQ6OnRleHQpKSBBUyBkb2N0b3JfbmFtZSxcclxuICAgICAgICAgICAgICBDT1VOVCgqKTo6aW50IEFTIGNudFxyXG4gICAgICAgICAgICBGUk9NIGFwcG9pbnRtZW50cyBhXHJcbiAgICAgICAgICAgIElOTkVSIEpPSU4gZG9jdG9ycyBkIE9OIGQuaWQgPSBhLmRvY3Rvcl9pZFxyXG4gICAgICAgICAgICBXSEVSRSBhLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICAgIEFORCBkLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICAgIEFORCBhLnN0YXJ0X2F0ID49IChub3coKSAtIGludGVydmFsICczMCBkYXlzJylcclxuICAgICAgICAgICAgR1JPVVAgQlkgZC5pZFxyXG4gICAgICAgICAgKSxcclxuICAgICAgICAgIHRvdCBBUyAoXHJcbiAgICAgICAgICAgIFNFTEVDVCBDT0FMRVNDRShTVU0oY250KSwgMCk6OmludCBBUyB0b3RhbCBGUk9NIGRvY1xyXG4gICAgICAgICAgKVxyXG4gICAgICAgICAgU0VMRUNUIGRvYy5kb2N0b3JfbmFtZSxcclxuICAgICAgICAgICAgQ0FTRVxyXG4gICAgICAgICAgICAgIFdIRU4gdG90LnRvdGFsID4gMCBUSEVOIFJPVU5EKChkb2MuY250OjpudW1lcmljIC8gdG90LnRvdGFsOjpudW1lcmljKSAqIDEwMCwgMSk6OmZsb2F0OFxyXG4gICAgICAgICAgICAgIEVMU0UgMDo6ZmxvYXQ4XHJcbiAgICAgICAgICAgIEVORCBBUyBsb2FkX3BjdFxyXG4gICAgICAgICAgRlJPTSBkb2NcclxuICAgICAgICAgIENST1NTIEpPSU4gdG90XHJcbiAgICAgICAgICBPUkRFUiBCWSBkb2MuY250IERFU0NcclxuICAgICAgICAgIExJTUlUIDhcclxuICAgICAgICBgXHJcbiAgICAgICksXHJcbiAgICBdKTtcclxuXHJcbiAgICBjb25zdCBwb2ludE1hcCA9IG5ldyBNYXAocG9pbnRzLm1hcCgocCkgPT4gW3AucGVyaW9kU3RhcnQsIHAudG90YWxSZXZlbnVlXSkpO1xyXG4gICAgY29uc3QgZGFpbHlSZXZlbnVlTGFzdDdEYXlzOiBudW1iZXJbXSA9IFtdO1xyXG4gICAgZm9yIChsZXQgaSA9IDY7IGkgPj0gMDsgaSAtPSAxKSB7XHJcbiAgICAgIGNvbnN0IHltZCA9IGFkZERheXNZbWQoZGF0ZVRvLCAtaSk7XHJcbiAgICAgIGRhaWx5UmV2ZW51ZUxhc3Q3RGF5cy5wdXNoKG51bShwb2ludE1hcC5nZXQoeW1kKSA/PyAwKSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdG9wRCA9IGJ5RG9jdG9yWzBdO1xyXG4gICAgY29uc3QgdG9wUyA9IGJ5U2VydmljZVswXTtcclxuICAgIGNvbnN0IHRvcERvY3RvciA9XHJcbiAgICAgIHRvcEQgJiYgKHRvcEQudG90YWxSZXZlbnVlID4gMCB8fCB0b3BELmRvY3Rvck5hbWUpXHJcbiAgICAgICAgPyB7IG5hbWU6IHRvcEQuZG9jdG9yTmFtZSA/PyBcIuKAlFwiLCByZXZlbnVlOiBudW0odG9wRC50b3RhbFJldmVudWUpIH1cclxuICAgICAgICA6IG51bGw7XHJcbiAgICBjb25zdCB0b3BTZXJ2aWNlID1cclxuICAgICAgdG9wUyAmJiAodG9wUy50b3RhbFJldmVudWUgPiAwIHx8IHRvcFMuc2VydmljZU5hbWUpXHJcbiAgICAgICAgPyB7IG5hbWU6IHRvcFMuc2VydmljZU5hbWUgPz8gXCLigJRcIiwgcmV2ZW51ZTogbnVtKHRvcFMudG90YWxSZXZlbnVlKSB9XHJcbiAgICAgICAgOiBudWxsO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHF1YWxpZnlpbmdQYXltZW50c0NvdW50OiBudW0oY291bnRSZXMucm93c1swXT8uYyA/PyAwKSxcclxuICAgICAgcmV2ZW51ZVRvdGFsOiBtZXRyaWNzLnRvdGFsUGF5bWVudHNBbW91bnQsXHJcbiAgICAgIHJldmVudWVUb2RheTogbnVtKHRvZGF5UmVzLnJvd3NbMF0/LnRvdGFsID8/IDApLFxyXG4gICAgICB0b3BEb2N0b3IsXHJcbiAgICAgIHRvcFNlcnZpY2UsXHJcbiAgICAgIHVucGFpZEludm9pY2VzQ291bnQ6IG51bSh1bnBhaWRSZXMucm93c1swXT8uYyA/PyAwKSxcclxuICAgICAgZGFpbHlSZXZlbnVlTGFzdDdEYXlzLFxyXG4gICAgICBkb2N0b3JMb2FkczogbG9hZHNSZXMucm93cy5tYXAoKHIpID0+ICh7XHJcbiAgICAgICAgZG9jdG9yTmFtZTogci5kb2N0b3JfbmFtZSxcclxuICAgICAgICBsb2FkUGN0OiBudW0oci5sb2FkX3BjdCksXHJcbiAgICAgIH0pKSxcclxuICAgIH07XHJcbiAgfVxyXG59XHJcbiJdfQ==