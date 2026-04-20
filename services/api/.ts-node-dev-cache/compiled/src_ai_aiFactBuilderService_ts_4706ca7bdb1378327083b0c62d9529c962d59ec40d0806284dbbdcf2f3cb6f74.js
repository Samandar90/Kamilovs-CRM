"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiFactBuilderService = void 0;
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const mockDatabase_1 = require("../repositories/mockDatabase");
const aiSql_1 = require("./aiSql");
const revenueMetricsSql_1 = require("./revenueMetricsSql");
const aiTypes_1 = require("./aiTypes");
const sqlInvoicePaidSum = (invoiceAlias) => `COALESCE((SELECT SUM(${(0, aiSql_1.sqlNetPayment)("p")}) FROM payments p WHERE p.invoice_id = ${invoiceAlias}.id AND p.deleted_at IS NULL), 0)::numeric`;
/** Имя врача в SQL: в БД только `doctors.full_name`. */
const SQL_DOCTOR_LABEL = `COALESCE(NULLIF(TRIM(d.full_name), ''), 'Врач #' || d.id::text)`;
const net = (0, aiSql_1.sqlNetPayment)("p");
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
class AiFactBuilderService {
    async queryPg(query, values = [], queryName) {
        const inferred = queryName ??
            query
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 96);
        try {
            return await database_1.dbPool.query(query, values);
        }
        catch (error) {
            console.error("[AI SQL ERROR]", inferred, error);
            throw error;
        }
    }
    /** Одна строка результата; при ошибке SQL — fallback, чтобы не обнулять весь снимок. */
    async safeQueryPgRow(label, query, values, fallback) {
        try {
            const r = await this.queryPg(query, values, label);
            return r.rows[0] ?? fallback;
        }
        catch (error) {
            console.error(`[AI FACTS] ${label} failed`, error);
            return fallback;
        }
    }
    async getClinicSnapshot() {
        try {
            if (env_1.env.dataProvider === "postgres") {
                const tz = env_1.env.reportsTimezone;
                const t = [tz];
                const [revenueTodayRes, revenue7dRes, revenueTotalRes, payCntTodayRes, payCnt7dRes, unpaidRes, topDoctorRes, topServiceRes, countsRes, cashShiftRes, apptTodayRes, apptDoneRes, apptSchedRes, noShowRes, avg7Derived,] = await Promise.all([
                    this.safeQueryPgRow("revenue_today_dashboard", revenueMetricsSql_1.SQL_PAYMENTS_REVENUE_TODAY, t, { total: "0" }),
                    this.safeQueryPgRow("revenue_7d_dashboard", revenueMetricsSql_1.SQL_PAYMENTS_REVENUE_7D, t, { total: "0" }),
                    this.safeQueryPgRow("revenue_total_dashboard", revenueMetricsSql_1.SQL_PAYMENTS_REVENUE_TOTAL, t, { total: "0" }),
                    this.safeQueryPgRow("pay_count_today_dashboard", revenueMetricsSql_1.SQL_PAYMENTS_COUNT_TODAY, t, { c: "0" }),
                    this.safeQueryPgRow("pay_count_7d_dashboard", revenueMetricsSql_1.SQL_PAYMENTS_COUNT_7D, t, { c: "0" }),
                    this.safeQueryPgRow("unpaid_invoices_dashboard", `
          SELECT COUNT(*)::text AS cnt,
                 COALESCE(SUM(GREATEST(inv.total::numeric - ${sqlInvoicePaidSum("inv")}, 0)), 0)::text AS total
          FROM invoices inv
          WHERE inv.deleted_at IS NULL
            AND inv.status IN ('draft','issued','partially_paid')
            AND GREATEST(inv.total::numeric - ${sqlInvoicePaidSum("inv")}, 0) > 0
          `, t, { cnt: "0", total: "0" }),
                    this.safeQueryPgRow("top_doctor_dashboard", `
          SELECT sub.name, sub.total::text AS total FROM (
            SELECT
              d.id,
              MAX(${SQL_DOCTOR_LABEL}) AS name,
              COALESCE(SUM(${net}), 0) AS total
            FROM doctors d
            INNER JOIN appointments a ON a.doctor_id = d.id AND a.deleted_at IS NULL
            INNER JOIN invoices i ON i.appointment_id = a.id AND i.deleted_at IS NULL
            INNER JOIN payments p ON p.invoice_id = i.id AND p.deleted_at IS NULL
            WHERE ${(0, aiSql_1.sqlInvoiceValidForRevenue)("i")}
            GROUP BY d.id
          ) sub
          ORDER BY sub.total DESC NULLS LAST
          LIMIT 1
          `, t, { name: "", total: "0" }),
                    this.safeQueryPgRow("top_service_dashboard", `
          SELECT s.name, COALESCE(SUM(${net}), 0)::text AS total
          FROM services s
          INNER JOIN appointments a ON a.service_id = s.id AND a.deleted_at IS NULL
          INNER JOIN invoices i ON i.appointment_id = a.id AND i.deleted_at IS NULL
          INNER JOIN payments p ON p.invoice_id = i.id AND p.deleted_at IS NULL
          WHERE ${(0, aiSql_1.sqlInvoiceValidForRevenue)("i")}
          GROUP BY s.id, s.name
          ORDER BY COALESCE(SUM(${net}), 0) DESC NULLS LAST
          LIMIT 1
          `, t, { name: "", total: "0" }),
                    this.safeQueryPgRow("counts_dashboard", `
          SELECT
            (SELECT COUNT(*) FROM doctors WHERE COALESCE(active, true) = true)::text AS doctors,
            (SELECT COUNT(*) FROM services WHERE COALESCE(active, true) = true)::text AS services,
            (SELECT COUNT(*) FROM appointments WHERE deleted_at IS NULL)::text AS appointments
          `, t, { doctors: "0", services: "0", appointments: "0" }),
                    this.safeQueryPgRow("cash_shift_dashboard", `SELECT id::text FROM cash_register_shifts WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`, t, { id: "" }),
                    this.safeQueryPgRow("appt_today_dashboard", `
          SELECT COUNT(*)::text AS cnt
          FROM appointments a
          WHERE a.deleted_at IS NULL
            AND ${(0, aiSql_1.sqlLocalDate)("a.start_at")} = ${(0, aiSql_1.sqlTodayLocal)()}
          `, t, { cnt: "0" }),
                    this.safeQueryPgRow("appt_done_dashboard", `
          SELECT COUNT(*)::text AS cnt
          FROM appointments a
          WHERE a.deleted_at IS NULL
            AND a.status = 'completed'
            AND ${(0, aiSql_1.sqlLocalDate)("a.start_at")} = ${(0, aiSql_1.sqlTodayLocal)()}
          `, t, { cnt: "0" }),
                    this.safeQueryPgRow("appt_sched_dashboard", `
          SELECT COUNT(*)::text AS cnt
          FROM appointments a
          WHERE a.deleted_at IS NULL
            AND a.status IN ('scheduled','confirmed','arrived','in_consultation')
            AND ${(0, aiSql_1.sqlLocalDate)("a.start_at")} = ${(0, aiSql_1.sqlTodayLocal)()}
          `, t, { cnt: "0" }),
                    this.safeQueryPgRow("noshow_dashboard", `
          SELECT COUNT(*)::text AS cnt
          FROM appointments a
          WHERE a.deleted_at IS NULL
            AND a.status IN ('cancelled','no_show')
            AND a.start_at >= (now() - interval '30 days')
          `, t, { cnt: "0" }),
                    this.safeQueryPgRow("avg_daily_revenue_7d_dashboard", revenueMetricsSql_1.SQL_AVG_DAILY_REVENUE_7D, t, { avg: "0" }),
                ]);
                const revenueToday = Number(revenueTodayRes.total ?? 0);
                const revenue7d = Number(revenue7dRes.total ?? 0);
                const revenueTotal = Number(revenueTotalRes.total ?? 0);
                const paymentsCountToday = Number(payCntTodayRes.c ?? 0);
                const paymentsCount7d = Number(payCnt7dRes.c ?? 0);
                // eslint-disable-next-line no-console
                console.log("[AI FACTS] revenueToday:", revenueToday);
                // eslint-disable-next-line no-console
                console.log("[AI FACTS] revenue7d:", revenue7d);
                // eslint-disable-next-line no-console
                console.log("[AI FACTS] paymentsCountToday:", paymentsCountToday);
                // eslint-disable-next-line no-console
                console.log("[AI FACTS] source used:", `payments+invoices net; p.created_at; date_trunc+AT TIME ZONE; TZ=${tz}; (aligned with reports metrics)`);
                const avgCheckToday = paymentsCountToday > 0 ? round2(revenueToday / paymentsCountToday) : 0;
                const avgCheck7d = paymentsCount7d > 0 ? round2(revenue7d / paymentsCount7d) : 0;
                return {
                    revenueToday,
                    revenue7d,
                    revenueTotal,
                    unpaidCount: Number(unpaidRes.cnt ?? 0),
                    unpaidTotal: Number(unpaidRes.total ?? 0),
                    avgCheckToday,
                    avgCheck7d,
                    paymentsCountToday,
                    paymentsCount7d,
                    topDoctorName: topDoctorRes.name?.trim() ? topDoctorRes.name : null,
                    topDoctorTotal: Number(topDoctorRes.total ?? 0),
                    topServiceName: topServiceRes.name?.trim() ? topServiceRes.name : null,
                    topServiceTotal: Number(topServiceRes.total ?? 0),
                    doctorsCount: Number(countsRes.doctors ?? 0),
                    servicesCount: Number(countsRes.services ?? 0),
                    appointmentsCount: Number(countsRes.appointments ?? 0),
                    appointmentsToday: Number(apptTodayRes.cnt ?? 0),
                    appointmentsCompletedToday: Number(apptDoneRes.cnt ?? 0),
                    appointmentsScheduledToday: Number(apptSchedRes.cnt ?? 0),
                    noShowOrCancelled30d: Number(noShowRes.cnt ?? 0),
                    avgDailyRevenue7Days: Number(avg7Derived.avg ?? 0),
                    cashShiftOpen: Boolean(cashShiftRes.id),
                };
            }
            const db = (0, mockDatabase_1.getMockDb)();
            const today = new Date().toDateString();
            const isValidInv = (inv) => inv.deletedAt === null && inv.status !== "cancelled" && inv.status !== "refunded";
            const netPay = (p) => Math.max(0, p.amount - (p.refundedAmount ?? 0));
            const inLocalDay = (iso, dayStr) => {
                const d = new Date(iso);
                return d.toDateString() === dayStr;
            };
            const inLast7LocalDays = (iso) => {
                const d = new Date(iso);
                for (let i = 0; i < 7; i += 1) {
                    const x = new Date();
                    x.setHours(0, 0, 0, 0);
                    x.setDate(x.getDate() - i);
                    if (d.toDateString() === x.toDateString())
                        return true;
                }
                return false;
            };
            let revenueToday = 0;
            let revenue7d = 0;
            let revenueTotal = 0;
            let paymentsCountToday = 0;
            let paymentsCount7d = 0;
            /** Как Postgres: оплаты по счетам (не cancelled/refunded), net-сумма. */
            db.payments.forEach((p) => {
                if (p.deletedAt)
                    return;
                const inv = db.invoices.find((i) => i.id === p.invoiceId);
                if (!inv || !isValidInv(inv))
                    return;
                const n = netPay(p);
                revenueTotal += n;
                if (inLocalDay(p.createdAt, today)) {
                    revenueToday += n;
                    if (n > 0)
                        paymentsCountToday += 1;
                }
                if (inLast7LocalDays(p.createdAt)) {
                    revenue7d += n;
                    if (n > 0)
                        paymentsCount7d += 1;
                }
            });
            // eslint-disable-next-line no-console
            console.log("[AI FACTS] revenueToday:", revenueToday);
            // eslint-disable-next-line no-console
            console.log("[AI FACTS] revenue7d:", revenue7d);
            // eslint-disable-next-line no-console
            console.log("[AI FACTS] paymentsCountToday:", paymentsCountToday);
            // eslint-disable-next-line no-console
            console.log("[AI FACTS] source used: mock DB; payments+invoices net (aligned with reports)");
            const unpaidInvoices = db.invoices.filter((i) => i.deletedAt === null &&
                ["draft", "issued", "partially_paid"].includes(i.status) &&
                Math.max(0, i.total - i.paidAmount) > 0);
            const unpaidTotal = unpaidInvoices.reduce((acc, i) => acc + Math.max(0, i.total - i.paidAmount), 0);
            const doctorRevenue = new Map();
            const serviceRevenue = new Map();
            db.payments.forEach((p) => {
                if (p.deletedAt)
                    return;
                const inv = db.invoices.find((i) => i.id === p.invoiceId);
                if (!inv || !isValidInv(inv) || !inv.appointmentId)
                    return;
                const ap = db.appointments.find((a) => a.id === inv.appointmentId);
                if (!ap)
                    return;
                doctorRevenue.set(ap.doctorId, (doctorRevenue.get(ap.doctorId) ?? 0) + netPay(p));
                serviceRevenue.set(ap.serviceId, (serviceRevenue.get(ap.serviceId) ?? 0) + netPay(p));
            });
            const topDoctorEntry = [...doctorRevenue.entries()].sort((a, b) => b[1] - a[1])[0];
            const topServiceEntry = [...serviceRevenue.entries()].sort((a, b) => b[1] - a[1])[0];
            const appointmentsToday = db.appointments.filter((a) => new Date(a.startAt).toDateString() === today).length;
            const appointmentsCompletedToday = db.appointments.filter((a) => a.status === "completed" && new Date(a.startAt).toDateString() === today).length;
            const appointmentsScheduledToday = db.appointments.filter((a) => ["scheduled", "confirmed", "arrived", "in_consultation"].includes(a.status) &&
                new Date(a.startAt).toDateString() === today).length;
            const noShowOrCancelled30d = db.appointments.filter((a) => {
                if (!["cancelled", "no_show"].includes(a.status))
                    return false;
                return new Date(a.startAt).getTime() >= Date.now() - 30 * 86400000;
            }).length;
            const avgCheckToday = paymentsCountToday > 0 ? round2(revenueToday / paymentsCountToday) : 0;
            const avgCheck7d = paymentsCount7d > 0 ? round2(revenue7d / paymentsCount7d) : 0;
            return {
                revenueToday,
                revenue7d,
                revenueTotal,
                unpaidCount: unpaidInvoices.length,
                unpaidTotal,
                avgCheckToday,
                avgCheck7d,
                paymentsCountToday,
                paymentsCount7d,
                topDoctorName: topDoctorEntry ? db.doctors.find((d) => d.id === topDoctorEntry[0])?.name ?? null : null,
                topDoctorTotal: topDoctorEntry?.[1] ?? 0,
                topServiceName: topServiceEntry ? db.services.find((s) => s.id === topServiceEntry[0])?.name ?? null : null,
                topServiceTotal: topServiceEntry?.[1] ?? 0,
                doctorsCount: db.doctors.filter((d) => d.active).length,
                servicesCount: db.services.filter((s) => s.active).length,
                appointmentsCount: db.appointments.length,
                appointmentsToday,
                appointmentsCompletedToday,
                appointmentsScheduledToday,
                noShowOrCancelled30d,
                avgDailyRevenue7Days: revenue7d / 7,
                cashShiftOpen: db.cashRegisterShifts.some((s) => !s.closedAt),
            };
        }
        catch (error) {
            console.error("[AI FACT BUILDER] getClinicSnapshot failed", error);
            return (0, aiTypes_1.createEmptyClinicFactsSnapshot)();
        }
    }
    async fetchHybridData(intent) {
        if (env_1.env.dataProvider === "postgres") {
            const tz = env_1.env.reportsTimezone;
            const t = [tz];
            const netP = (0, aiSql_1.sqlNetPayment)("p");
            switch (intent) {
                case "revenue": {
                    const row = await this.safeQueryPgRow("hybrid_revenue_today_dashboard", revenueMetricsSql_1.SQL_PAYMENTS_REVENUE_TODAY_HYBRID, t, { total: "0", cnt: "0" });
                    const total = Number(row.total ?? 0);
                    const paymentsCountToday = Number(row.cnt ?? 0);
                    return { total, revenueToday: total, paymentsCountToday };
                }
                case "unpaid": {
                    const summary = await this.queryPg(`
            SELECT COUNT(*)::text AS cnt,
                   COALESCE(SUM(GREATEST(inv.total::numeric - ${sqlInvoicePaidSum("inv")}, 0)), 0)::text AS total
            FROM invoices inv
            WHERE inv.deleted_at IS NULL
              AND inv.status IN ('draft','issued','partially_paid')
              AND GREATEST(inv.total::numeric - ${sqlInvoicePaidSum("inv")}, 0) > 0
            `, t);
                    const rows = await this.queryPg(`
            SELECT inv.number,
                   GREATEST(inv.total::numeric - ${sqlInvoicePaidSum("inv")}, 0)::text AS remainder
            FROM invoices inv
            WHERE inv.deleted_at IS NULL
              AND inv.status IN ('draft','issued','partially_paid')
              AND GREATEST(inv.total::numeric - ${sqlInvoicePaidSum("inv")}, 0) > 0
            ORDER BY inv.created_at DESC
            LIMIT 5
            `, t);
                    return {
                        count: Number(summary.rows[0]?.cnt ?? 0),
                        unpaidCount: Number(summary.rows[0]?.cnt ?? 0),
                        unpaidTotal: Number(summary.rows[0]?.total ?? 0),
                        recentInvoices: rows.rows.map((r) => ({
                            number: r.number,
                            remainder: Number(r.remainder),
                        })),
                    };
                }
                case "top_doctor": {
                    const row = await this.queryPg(`
            WITH doctor_totals AS (
              SELECT
                d.id,
                MAX(${SQL_DOCTOR_LABEL}) AS name,
                COALESCE(SUM(${netP}), 0) AS total
              FROM doctors d
              INNER JOIN appointments a ON a.doctor_id = d.id AND a.deleted_at IS NULL
              INNER JOIN invoices i ON i.appointment_id = a.id AND i.deleted_at IS NULL
              INNER JOIN payments p ON p.invoice_id = i.id AND p.deleted_at IS NULL
              WHERE ${(0, aiSql_1.sqlInvoiceValidForRevenue)("i")}
              GROUP BY d.id
            ),
            grand AS (SELECT COALESCE(SUM(total), 0) AS all_total FROM doctor_totals)
            SELECT dt.name,
                   dt.total::text AS total,
                   CASE WHEN g.all_total > 0 THEN ROUND((dt.total / g.all_total) * 100, 2)::text ELSE '0' END AS share
            FROM doctor_totals dt
            CROSS JOIN grand g
            ORDER BY dt.total DESC NULLS LAST
            LIMIT 1
            `, t);
                    return {
                        topDoctor: row.rows[0]
                            ? {
                                name: row.rows[0].name,
                                total: Number(row.rows[0].total),
                                share: Number(row.rows[0].share ?? 0),
                            }
                            : null,
                    };
                }
                case "top_service": {
                    const row = await this.queryPg(`
            SELECT s.name, COALESCE(SUM(${netP}), 0)::text AS total
            FROM services s
            INNER JOIN appointments a ON a.service_id = s.id AND a.deleted_at IS NULL
            INNER JOIN invoices i ON i.appointment_id = a.id AND i.deleted_at IS NULL
            INNER JOIN payments p ON p.invoice_id = i.id AND p.deleted_at IS NULL
            WHERE ${(0, aiSql_1.sqlInvoiceValidForRevenue)("i")}
            GROUP BY s.id, s.name
            ORDER BY COALESCE(SUM(${netP}), 0) DESC NULLS LAST
            LIMIT 1
            `, t);
                    return {
                        topService: row.rows[0]
                            ? { name: row.rows[0].name, total: Number(row.rows[0].total) }
                            : null,
                    };
                }
                case "cash_status": {
                    const row = await this.queryPg(`SELECT id::text, opened_at::text
             FROM cash_register_shifts
             WHERE closed_at IS NULL
             ORDER BY opened_at DESC
             LIMIT 1`, t);
                    return {
                        cashShiftOpen: Boolean(row.rows[0]),
                        currentShift: row.rows[0] ?? null,
                    };
                }
                case "health": {
                    const snap = await this.getClinicSnapshot();
                    return {
                        revenueToday: snap.revenueToday,
                        unpaidCount: snap.unpaidCount,
                        topDoctor: snap.topDoctorName
                            ? { name: snap.topDoctorName, total: snap.topDoctorTotal }
                            : null,
                        topService: snap.topServiceName
                            ? { name: snap.topServiceName, total: snap.topServiceTotal }
                            : null,
                        appointmentsToday: snap.appointmentsToday,
                        avgDailyRevenue7Days: snap.avgDailyRevenue7Days,
                        avgCheckToday: snap.avgCheckToday,
                        avgCheck7d: snap.avgCheck7d,
                        noShowOrCancelled30d: snap.noShowOrCancelled30d,
                    };
                }
                default:
                    return {};
            }
        }
        const snap = await this.getClinicSnapshot();
        if (intent === "revenue") {
            return { total: snap.revenueToday, revenueToday: snap.revenueToday };
        }
        if (intent === "unpaid") {
            const unpaidInvoices = (0, mockDatabase_1.getMockDb)().invoices.filter((i) => i.deletedAt === null &&
                ["draft", "issued", "partially_paid"].includes(i.status) &&
                Math.max(0, i.total - i.paidAmount) > 0);
            return {
                count: unpaidInvoices.length,
                unpaidCount: unpaidInvoices.length,
                unpaidTotal: unpaidInvoices.reduce((a, i) => a + Math.max(0, i.total - i.paidAmount), 0),
                recentInvoices: unpaidInvoices.slice(0, 5).map((i) => ({
                    number: i.number,
                    remainder: Math.max(0, i.total - i.paidAmount),
                })),
            };
        }
        if (intent === "top_doctor") {
            const doctorRevenue = new Map();
            (0, mockDatabase_1.getMockDb)().payments.forEach((p) => {
                if (p.deletedAt)
                    return;
                const inv = (0, mockDatabase_1.getMockDb)().invoices.find((i) => i.id === p.invoiceId);
                if (!inv?.appointmentId || inv.status === "cancelled" || inv.status === "refunded")
                    return;
                const ap = (0, mockDatabase_1.getMockDb)().appointments.find((a) => a.id === inv.appointmentId);
                if (!ap)
                    return;
                doctorRevenue.set(ap.doctorId, (doctorRevenue.get(ap.doctorId) ?? 0) + netPay(p));
            });
            const top = [...doctorRevenue.entries()].sort((a, b) => b[1] - a[1])[0];
            const totalRevenue = [...doctorRevenue.values()].reduce((acc, v) => acc + v, 0);
            return {
                topDoctor: top
                    ? {
                        name: (0, mockDatabase_1.getMockDb)().doctors.find((d) => d.id === top[0])?.name ?? "—",
                        total: top[1],
                        share: totalRevenue > 0 ? Math.round((top[1] / totalRevenue) * 10000) / 100 : 0,
                    }
                    : null,
            };
        }
        if (intent === "top_service") {
            const serviceRevenue = new Map();
            (0, mockDatabase_1.getMockDb)().payments.forEach((p) => {
                if (p.deletedAt)
                    return;
                const inv = (0, mockDatabase_1.getMockDb)().invoices.find((i) => i.id === p.invoiceId);
                if (!inv?.appointmentId || inv.status === "cancelled" || inv.status === "refunded")
                    return;
                const ap = (0, mockDatabase_1.getMockDb)().appointments.find((a) => a.id === inv.appointmentId);
                if (!ap)
                    return;
                serviceRevenue.set(ap.serviceId, (serviceRevenue.get(ap.serviceId) ?? 0) + netPay(p));
            });
            const top = [...serviceRevenue.entries()].sort((a, b) => b[1] - a[1])[0];
            return {
                topService: top
                    ? { name: (0, mockDatabase_1.getMockDb)().services.find((s) => s.id === top[0])?.name ?? "—", total: top[1] }
                    : null,
            };
        }
        if (intent === "cash_status") {
            const currentShift = (0, mockDatabase_1.getMockDb)().cashRegisterShifts.find((s) => !s.closedAt) ?? null;
            return { cashShiftOpen: Boolean(currentShift), currentShift };
        }
        if (intent === "health") {
            return {
                revenueToday: snap.revenueToday,
                unpaidCount: snap.unpaidCount,
                topDoctor: snap.topDoctorName
                    ? { name: snap.topDoctorName, total: snap.topDoctorTotal }
                    : null,
                topService: snap.topServiceName
                    ? { name: snap.topServiceName, total: snap.topServiceTotal }
                    : null,
                appointmentsToday: snap.appointmentsToday,
                avgDailyRevenue7Days: snap.avgDailyRevenue7Days,
                avgCheckToday: snap.avgCheckToday,
                avgCheck7d: snap.avgCheck7d,
                noShowOrCancelled30d: snap.noShowOrCancelled30d,
            };
        }
        return {};
    }
    async buildStructuredContext(snapshot) {
        try {
            if (env_1.env.dataProvider === "postgres") {
                const doctorsRows = await this.queryPg(`
          SELECT
            COALESCE(NULLIF(TRIM(full_name), ''), 'Врач #' || id::text) AS name,
            NULLIF(TRIM(specialty), '') AS specialty
          FROM doctors
          WHERE deleted_at IS NULL
            AND COALESCE(active, true) = true
          ORDER BY full_name ASC
          LIMIT 12
          `);
                const servicesRows = await this.queryPg(`
          SELECT
            name,
            CASE WHEN price IS NULL THEN NULL ELSE price::text END AS price
          FROM services
          WHERE deleted_at IS NULL
            AND COALESCE(active, true) = true
          ORDER BY name ASC
          LIMIT 12
          `);
                const doctors = doctorsRows.rows.map((d) => ({
                    name: d.name,
                    specialty: d.specialty,
                }));
                const activeServices = servicesRows.rows.map((s) => ({
                    name: s.name,
                    price: s.price == null ? null : Number(s.price),
                }));
                return {
                    revenueToday: snapshot.revenueToday,
                    revenue7d: snapshot.revenue7d,
                    unpaidInvoicesCount: snapshot.unpaidCount,
                    unpaidInvoicesAmount: snapshot.unpaidTotal,
                    appointmentsToday: snapshot.appointmentsToday,
                    completedToday: snapshot.appointmentsCompletedToday,
                    pendingToday: snapshot.appointmentsScheduledToday,
                    avgCheckToday: snapshot.avgCheckToday,
                    avgCheck7d: snapshot.avgCheck7d,
                    topDoctor: snapshot.topDoctorName,
                    cashShiftStatus: snapshot.cashShiftOpen ? "open" : "closed",
                    noShow30d: snapshot.noShowOrCancelled30d,
                    doctors,
                    activeServices,
                };
            }
            const db = (0, mockDatabase_1.getMockDb)();
            const doctors = db.doctors
                .filter((d) => d.active)
                .slice(0, 12)
                .map((d) => ({ name: d.name, specialty: d.speciality }));
            const activeServices = db.services
                .filter((s) => s.active)
                .slice(0, 12)
                .map((s) => ({ name: s.name, price: Number(s.price) }));
            return {
                revenueToday: snapshot.revenueToday,
                revenue7d: snapshot.revenue7d,
                unpaidInvoicesCount: snapshot.unpaidCount,
                unpaidInvoicesAmount: snapshot.unpaidTotal,
                appointmentsToday: snapshot.appointmentsToday,
                completedToday: snapshot.appointmentsCompletedToday,
                pendingToday: snapshot.appointmentsScheduledToday,
                avgCheckToday: snapshot.avgCheckToday,
                avgCheck7d: snapshot.avgCheck7d,
                topDoctor: snapshot.topDoctorName,
                cashShiftStatus: snapshot.cashShiftOpen ? "open" : "closed",
                noShow30d: snapshot.noShowOrCancelled30d,
                doctors,
                activeServices,
            };
        }
        catch (error) {
            console.error("[AI FACT BUILDER] buildStructuredContext failed", error);
            return {
                revenueToday: snapshot.revenueToday,
                revenue7d: snapshot.revenue7d,
                unpaidInvoicesCount: snapshot.unpaidCount,
                unpaidInvoicesAmount: snapshot.unpaidTotal,
                appointmentsToday: snapshot.appointmentsToday,
                completedToday: snapshot.appointmentsCompletedToday,
                pendingToday: snapshot.appointmentsScheduledToday,
                avgCheckToday: snapshot.avgCheckToday,
                avgCheck7d: snapshot.avgCheck7d,
                topDoctor: snapshot.topDoctorName,
                cashShiftStatus: snapshot.cashShiftOpen ? "open" : "closed",
                noShow30d: snapshot.noShowOrCancelled30d,
                doctors: [],
                activeServices: [],
            };
        }
    }
    enrichData(intent, data) {
        const next = { ...data };
        if (intent === "revenue") {
            const total = Number(next.total ?? next.revenueToday ?? 0);
            const pct = Number(next.paymentsCountToday ?? 0);
            if (total === 0 && pct === 0)
                next.note = "no_payments_today";
        }
        if (intent === "top_doctor") {
            const topDoctor = (next.topDoctor ?? null);
            const share = Number(topDoctor?.share ?? 0);
            if (share > 80)
                next.risk = "Один врач генерирует почти всю выручку";
        }
        if (intent === "unpaid") {
            const count = Number(next.count ?? next.unpaidCount ?? 0);
            if (count > 0)
                next.problem = "Есть неоплаченные счета";
        }
        return next;
    }
}
exports.AiFactBuilderService = AiFactBuilderService;
function netPay(p) {
    return Math.max(0, p.amount - (p.refundedAmount ?? 0));
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvYWkvYWlGYWN0QnVpbGRlclNlcnZpY2UudHMiLCJzb3VyY2VzIjpbIkM6L1VzZXJzL3VzZXIvRGVza3RvcC9jcm0gdjEuOC9zZXJ2aWNlcy9hcGkvc3JjL2FpL2FpRmFjdEJ1aWxkZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLGlEQUE0QztBQUM1Qyx1Q0FBb0M7QUFDcEMsK0RBQXlEO0FBRXpELG1DQUFnRztBQUNoRywyREFRNkI7QUFDN0IsdUNBT21CO0FBRW5CLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxZQUFvQixFQUFVLEVBQUUsQ0FDekQsd0JBQXdCLElBQUEscUJBQWEsRUFBQyxHQUFHLENBQUMsMENBQTBDLFlBQVksNENBQTRDLENBQUM7QUFFL0ksd0RBQXdEO0FBQ3hELE1BQU0sZ0JBQWdCLEdBQUcsaUVBQWlFLENBQUM7QUFJM0YsTUFBTSxHQUFHLEdBQUcsSUFBQSxxQkFBYSxFQUFDLEdBQUcsQ0FBQyxDQUFDO0FBRS9CLFNBQVMsTUFBTSxDQUFDLENBQVM7SUFDdkIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUM7QUFDdEQsQ0FBQztBQUVELE1BQWEsb0JBQW9CO0lBQ3ZCLEtBQUssQ0FBQyxPQUFPLENBQ25CLEtBQWEsRUFDYixTQUFvQixFQUFFLEVBQ3RCLFNBQWtCO1FBRWxCLE1BQU0sUUFBUSxHQUNaLFNBQVM7WUFDVCxLQUFLO2lCQUNGLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDO2lCQUNwQixJQUFJLEVBQUU7aUJBQ04sS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNsQixJQUFJLENBQUM7WUFDSCxPQUFPLE1BQU0saUJBQU0sQ0FBQyxLQUFLLENBQUksS0FBSyxFQUFFLE1B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R0FBRyxLQUFLLENBQUM7Z0JBQUUsSUFBSSxDQUFDLElBQUksR0FBRyxtQkFBbUIsQ0FBQztRQUNoRSxDQUFDO1FBQ0QsSUFBSSxNQUFNLEtBQUssWUFBWSxFQUFFLENBQUM7WUFDNUIsTUFBTSxTQUFTLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBOEIsQ0FBQztZQUN4RSxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM1QyxJQUFJLEtBQUssR0FBRyxFQUFFO2dCQUFFLElBQUksQ0FBQyxJQUFJLEdBQUcsd0NBQXdDLENBQUM7UUFDdkUsQ0FBQztRQUNELElBQUksTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3hCLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDMUQsSUFBSSxLQUFLLEdBQUcsQ0FBQztnQkFBRSxJQUFJLENBQUMsT0FBTyxHQUFHLHlCQUF5QixDQUFDO1FBQzFELENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7Q0FDRjtBQXB0QkQsb0RBb3RCQztBQUVELFNBQVMsTUFBTSxDQUFDLENBQThDO0lBQzVELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxjQUFjLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN6RCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZGJQb29sIH0gZnJvbSBcIi4uL2NvbmZpZy9kYXRhYmFzZVwiO1xyXG5pbXBvcnQgeyBlbnYgfSBmcm9tIFwiLi4vY29uZmlnL2VudlwiO1xyXG5pbXBvcnQgeyBnZXRNb2NrRGIgfSBmcm9tIFwiLi4vcmVwb3NpdG9yaWVzL21vY2tEYXRhYmFzZVwiO1xyXG5pbXBvcnQgdHlwZSB7IFF1ZXJ5UmVzdWx0Um93IH0gZnJvbSBcInBnXCI7XHJcbmltcG9ydCB7IHNxbEludm9pY2VWYWxpZEZvclJldmVudWUsIHNxbExvY2FsRGF0ZSwgc3FsTmV0UGF5bWVudCwgc3FsVG9kYXlMb2NhbCB9IGZyb20gXCIuL2FpU3FsXCI7XHJcbmltcG9ydCB7XHJcbiAgU1FMX0FWR19EQUlMWV9SRVZFTlVFXzdELFxyXG4gIFNRTF9QQVlNRU5UU19DT1VOVF83RCxcclxuICBTUUxfUEFZTUVOVFNfQ09VTlRfVE9EQVksXHJcbiAgU1FMX1BBWU1FTlRTX1JFVkVOVUVfN0QsXHJcbiAgU1FMX1BBWU1FTlRTX1JFVkVOVUVfVE9EQVksXHJcbiAgU1FMX1BBWU1FTlRTX1JFVkVOVUVfVE9EQVlfSFlCUklELFxyXG4gIFNRTF9QQVlNRU5UU19SRVZFTlVFX1RPVEFMLFxyXG59IGZyb20gXCIuL3JldmVudWVNZXRyaWNzU3FsXCI7XHJcbmltcG9ydCB7XHJcbiAgY3JlYXRlRW1wdHlDbGluaWNGYWN0c1NuYXBzaG90LFxyXG4gIHR5cGUgQWlBc3Npc3RhbnRTdHJ1Y3R1cmVkQ29udGV4dCxcclxuICB0eXBlIEFpQ29udGV4dERvY3Rvckl0ZW0sXHJcbiAgdHlwZSBBaUNvbnRleHRTZXJ2aWNlSXRlbSxcclxuICB0eXBlIEFpRGF0YUludGVudCxcclxuICB0eXBlIENsaW5pY0ZhY3RzU25hcHNob3QsXHJcbn0gZnJvbSBcIi4vYWlUeXBlc1wiO1xyXG5cclxuY29uc3Qgc3FsSW52b2ljZVBhaWRTdW0gPSAoaW52b2ljZUFsaWFzOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuICBgQ09BTEVTQ0UoKFNFTEVDVCBTVU0oJHtzcWxOZXRQYXltZW50KFwicFwiKX0pIEZST00gcGF5bWVudHMgcCBXSEVSRSBwLmludm9pY2VfaWQgPSAke2ludm9pY2VBbGlhc30uaWQgQU5EIHAuZGVsZXRlZF9hdCBJUyBOVUxMKSwgMCk6Om51bWVyaWNgO1xyXG5cclxuLyoqINCY0LzRjyDQstGA0LDRh9CwINCyIFNRTDog0LIg0JHQlCDRgtC+0LvRjNC60L4gYGRvY3RvcnMuZnVsbF9uYW1lYC4gKi9cclxuY29uc3QgU1FMX0RPQ1RPUl9MQUJFTCA9IGBDT0FMRVNDRShOVUxMSUYoVFJJTShkLmZ1bGxfbmFtZSksICcnKSwgJ9CS0YDQsNGHICMnIHx8IGQuaWQ6OnRleHQpYDtcclxuXHJcbmV4cG9ydCB0eXBlIHsgQWlEYXRhSW50ZW50IH0gZnJvbSBcIi4vYWlUeXBlc1wiO1xyXG5cclxuY29uc3QgbmV0ID0gc3FsTmV0UGF5bWVudChcInBcIik7XHJcblxyXG5mdW5jdGlvbiByb3VuZDIobjogbnVtYmVyKTogbnVtYmVyIHtcclxuICByZXR1cm4gTWF0aC5yb3VuZCgobiArIE51bWJlci5FUFNJTE9OKSAqIDEwMCkgLyAxMDA7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBBaUZhY3RCdWlsZGVyU2VydmljZSB7XHJcbiAgcHJpdmF0ZSBhc3luYyBxdWVyeVBnPFQgZXh0ZW5kcyBRdWVyeVJlc3VsdFJvdz4oXHJcbiAgICBxdWVyeTogc3RyaW5nLFxyXG4gICAgdmFsdWVzOiB1bmtub3duW10gPSBbXSxcclxuICAgIHF1ZXJ5TmFtZT86IHN0cmluZ1xyXG4gICk6IFByb21pc2U8eyByb3dzOiBUW10gfT4ge1xyXG4gICAgY29uc3QgaW5mZXJyZWQgPVxyXG4gICAgICBxdWVyeU5hbWUgPz9cclxuICAgICAgcXVlcnlcclxuICAgICAgICAucmVwbGFjZSgvXFxzKy9nLCBcIiBcIilcclxuICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgLnNsaWNlKDAsIDk2KTtcclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiBhd2FpdCBkYlBvb2wucXVlcnk8VD4ocXVlcnksIHZhbHVlcyk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiW0FJIFNRTCBFUlJPUl1cIiwgaW5mZXJyZWQsIGVycm9yKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKiog0J7QtNC90LAg0YHRgtGA0L7QutCwINGA0LXQt9GD0LvRjNGC0LDRgtCwOyDQv9GA0Lgg0L7RiNC40LHQutC1IFNRTCDigJQgZmFsbGJhY2ssINGH0YLQvtCx0Ysg0L3QtSDQvtCx0L3Rg9C70Y/RgtGMINCy0LXRgdGMINGB0L3QuNC80L7Qui4gKi9cclxuICBwcml2YXRlIGFzeW5jIHNhZmVRdWVyeVBnUm93PFQgZXh0ZW5kcyBRdWVyeVJlc3VsdFJvdz4oXHJcbiAgICBsYWJlbDogc3RyaW5nLFxyXG4gICAgcXVlcnk6IHN0cmluZyxcclxuICAgIHZhbHVlczogdW5rbm93bltdLFxyXG4gICAgZmFsbGJhY2s6IFRcclxuICApOiBQcm9taXNlPFQ+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHIgPSBhd2FpdCB0aGlzLnF1ZXJ5UGc8VD4ocXVlcnksIHZhbHVlcywgbGFiZWwpO1xyXG4gICAgICByZXR1cm4gci5yb3dzWzBdID8/IGZhbGxiYWNrO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihgW0FJIEZBQ1RTXSAke2xhYmVsfSBmYWlsZWRgLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiBmYWxsYmFjaztcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIGdldENsaW5pY1NuYXBzaG90KCk6IFByb21pc2U8Q2xpbmljRmFjdHNTbmFwc2hvdD4ge1xyXG4gICAgdHJ5IHtcclxuICAgIGlmIChlbnYuZGF0YVByb3ZpZGVyID09PSBcInBvc3RncmVzXCIpIHtcclxuICAgICAgY29uc3QgdHogPSBlbnYucmVwb3J0c1RpbWV6b25lO1xyXG4gICAgICBjb25zdCB0ID0gW3R6XTtcclxuXHJcbiAgICAgIGNvbnN0IFtcclxuICAgICAgICByZXZlbnVlVG9kYXlSZXMsXHJcbiAgICAgICAgcmV2ZW51ZTdkUmVzLFxyXG4gICAgICAgIHJldmVudWVUb3RhbFJlcyxcclxuICAgICAgICBwYXlDbnRUb2RheVJlcyxcclxuICAgICAgICBwYXlDbnQ3ZFJlcyxcclxuICAgICAgICB1bnBhaWRSZXMsXHJcbiAgICAgICAgdG9wRG9jdG9yUmVzLFxyXG4gICAgICAgIHRvcFNlcnZpY2VSZXMsXHJcbiAgICAgICAgY291bnRzUmVzLFxyXG4gICAgICAgIGNhc2hTaGlmdFJlcyxcclxuICAgICAgICBhcHB0VG9kYXlSZXMsXHJcbiAgICAgICAgYXBwdERvbmVSZXMsXHJcbiAgICAgICAgYXBwdFNjaGVkUmVzLFxyXG4gICAgICAgIG5vU2hvd1JlcyxcclxuICAgICAgICBhdmc3RGVyaXZlZCxcclxuICAgICAgXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcclxuICAgICAgICB0aGlzLnNhZmVRdWVyeVBnUm93PHsgdG90YWw6IHN0cmluZyB9PihcclxuICAgICAgICAgIFwicmV2ZW51ZV90b2RheV9kYXNoYm9hcmRcIixcclxuICAgICAgICAgIFNRTF9QQVlNRU5UU19SRVZFTlVFX1RPREFZLFxyXG4gICAgICAgICAgdCxcclxuICAgICAgICAgIHsgdG90YWw6IFwiMFwiIH1cclxuICAgICAgICApLFxyXG4gICAgICAgIHRoaXMuc2FmZVF1ZXJ5UGdSb3c8eyB0b3RhbDogc3RyaW5nIH0+KFxyXG4gICAgICAgICAgXCJyZXZlbnVlXzdkX2Rhc2hib2FyZFwiLFxyXG4gICAgICAgICAgU1FMX1BBWU1FTlRTX1JFVkVOVUVfN0QsXHJcbiAgICAgICAgICB0LFxyXG4gICAgICAgICAgeyB0b3RhbDogXCIwXCIgfVxyXG4gICAgICAgICksXHJcbiAgICAgICAgdGhpcy5zYWZlUXVlcnlQZ1Jvdzx7IHRvdGFsOiBzdHJpbmcgfT4oXHJcbiAgICAgICAgICBcInJldmVudWVfdG90YWxfZGFzaGJvYXJkXCIsXHJcbiAgICAgICAgICBTUUxfUEFZTUVOVFNfUkVWRU5VRV9UT1RBTCxcclxuICAgICAgICAgIHQsXHJcbiAgICAgICAgICB7IHRvdGFsOiBcIjBcIiB9XHJcbiAgICAgICAgKSxcclxuICAgICAgICB0aGlzLnNhZmVRdWVyeVBnUm93PHsgYzogc3RyaW5nIH0+KFwicGF5X2NvdW50X3RvZGF5X2Rhc2hib2FyZFwiLCBTUUxfUEFZTUVOVFNfQ09VTlRfVE9EQVksIHQsIHsgYzogXCIwXCIgfSksXHJcbiAgICAgICAgdGhpcy5zYWZlUXVlcnlQZ1Jvdzx7IGM6IHN0cmluZyB9PihcInBheV9jb3VudF83ZF9kYXNoYm9hcmRcIiwgU1FMX1BBWU1FTlRTX0NPVU5UXzdELCB0LCB7IGM6IFwiMFwiIH0pLFxyXG4gICAgICAgIHRoaXMuc2FmZVF1ZXJ5UGdSb3c8eyBjbnQ6IHN0cmluZzsgdG90YWw6IHN0cmluZyB9PihcclxuICAgICAgICAgIFwidW5wYWlkX2ludm9pY2VzX2Rhc2hib2FyZFwiLFxyXG4gICAgICAgICAgYFxyXG4gICAgICAgICAgU0VMRUNUIENPVU5UKCopOjp0ZXh0IEFTIGNudCxcclxuICAgICAgICAgICAgICAgICBDT0FMRVNDRShTVU0oR1JFQVRFU1QoaW52LnRvdGFsOjpudW1lcmljIC0gJHtzcWxJbnZvaWNlUGFpZFN1bShcImludlwiKX0sIDApKSwgMCk6OnRleHQgQVMgdG90YWxcclxuICAgICAgICAgIEZST00gaW52b2ljZXMgaW52XHJcbiAgICAgICAgICBXSEVSRSBpbnYuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIEFORCBpbnYuc3RhdHVzIElOICgnZHJhZnQnLCdpc3N1ZWQnLCdwYXJ0aWFsbHlfcGFpZCcpXHJcbiAgICAgICAgICAgIEFORCBHUkVBVEVTVChpbnYudG90YWw6Om51bWVyaWMgLSAke3NxbEludm9pY2VQYWlkU3VtKFwiaW52XCIpfSwgMCkgPiAwXHJcbiAgICAgICAgICBgLFxyXG4gICAgICAgICAgdCxcclxuICAgICAgICAgIHsgY250OiBcIjBcIiwgdG90YWw6IFwiMFwiIH1cclxuICAgICAgICApLFxyXG4gICAgICAgIHRoaXMuc2FmZVF1ZXJ5UGdSb3c8eyBuYW1lOiBzdHJpbmc7IHRvdGFsOiBzdHJpbmcgfT4oXHJcbiAgICAgICAgICBcInRvcF9kb2N0b3JfZGFzaGJvYXJkXCIsXHJcbiAgICAgICAgICBgXHJcbiAgICAgICAgICBTRUxFQ1Qgc3ViLm5hbWUsIHN1Yi50b3RhbDo6dGV4dCBBUyB0b3RhbCBGUk9NIChcclxuICAgICAgICAgICAgU0VMRUNUXHJcbiAgICAgICAgICAgICAgZC5pZCxcclxuICAgICAgICAgICAgICBNQVgoJHtTUUxfRE9DVE9SX0xBQkVMfSkgQVMgbmFtZSxcclxuICAgICAgICAgICAgICBDT0FMRVNDRShTVU0oJHtuZXR9KSwgMCkgQVMgdG90YWxcclxuICAgICAgICAgICAgRlJPTSBkb2N0b3JzIGRcclxuICAgICAgICAgICAgSU5ORVIgSk9JTiBhcHBvaW50bWVudHMgYSBPTiBhLmRvY3Rvcl9pZCA9IGQuaWQgQU5EIGEuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIElOTkVSIEpPSU4gaW52b2ljZXMgaSBPTiBpLmFwcG9pbnRtZW50X2lkID0gYS5pZCBBTkQgaS5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgICAgSU5ORVIgSk9JTiBwYXltZW50cyBwIE9OIHAuaW52b2ljZV9pZCA9IGkuaWQgQU5EIHAuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIFdIRVJFICR7c3FsSW52b2ljZVZhbGlkRm9yUmV2ZW51ZShcImlcIil9XHJcbiAgICAgICAgICAgIEdST1VQIEJZIGQuaWRcclxuICAgICAgICAgICkgc3ViXHJcbiAgICAgICAgICBPUkRFUiBCWSBzdWIudG90YWwgREVTQyBOVUxMUyBMQVNUXHJcbiAgICAgICAgICBMSU1JVCAxXHJcbiAgICAgICAgICBgLFxyXG4gICAgICAgICAgdCxcclxuICAgICAgICAgIHsgbmFtZTogXCJcIiwgdG90YWw6IFwiMFwiIH1cclxuICAgICAgICApLFxyXG4gICAgICAgIHRoaXMuc2FmZVF1ZXJ5UGdSb3c8eyBuYW1lOiBzdHJpbmc7IHRvdGFsOiBzdHJpbmcgfT4oXHJcbiAgICAgICAgICBcInRvcF9zZXJ2aWNlX2Rhc2hib2FyZFwiLFxyXG4gICAgICAgICAgYFxyXG4gICAgICAgICAgU0VMRUNUIHMubmFtZSwgQ09BTEVTQ0UoU1VNKCR7bmV0fSksIDApOjp0ZXh0IEFTIHRvdGFsXHJcbiAgICAgICAgICBGUk9NIHNlcnZpY2VzIHNcclxuICAgICAgICAgIElOTkVSIEpPSU4gYXBwb2ludG1lbnRzIGEgT04gYS5zZXJ2aWNlX2lkID0gcy5pZCBBTkQgYS5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgIElOTkVSIEpPSU4gaW52b2ljZXMgaSBPTiBpLmFwcG9pbnRtZW50X2lkID0gYS5pZCBBTkQgaS5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgIElOTkVSIEpPSU4gcGF5bWVudHMgcCBPTiBwLmludm9pY2VfaWQgPSBpLmlkIEFORCBwLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgV0hFUkUgJHtzcWxJbnZvaWNlVmFsaWRGb3JSZXZlbnVlKFwiaVwiKX1cclxuICAgICAgICAgIEdST1VQIEJZIHMuaWQsIHMubmFtZVxyXG4gICAgICAgICAgT1JERVIgQlkgQ09BTEVTQ0UoU1VNKCR7bmV0fSksIDApIERFU0MgTlVMTFMgTEFTVFxyXG4gICAgICAgICAgTElNSVQgMVxyXG4gICAgICAgICAgYCxcclxuICAgICAgICAgIHQsXHJcbiAgICAgICAgICB7IG5hbWU6IFwiXCIsIHRvdGFsOiBcIjBcIiB9XHJcbiAgICAgICAgKSxcclxuICAgICAgICB0aGlzLnNhZmVRdWVyeVBnUm93PHsgZG9jdG9yczogc3RyaW5nOyBzZXJ2aWNlczogc3RyaW5nOyBhcHBvaW50bWVudHM6IHN0cmluZyB9PihcclxuICAgICAgICAgIFwiY291bnRzX2Rhc2hib2FyZFwiLFxyXG4gICAgICAgICAgYFxyXG4gICAgICAgICAgU0VMRUNUXHJcbiAgICAgICAgICAgIChTRUxFQ1QgQ09VTlQoKikgRlJPTSBkb2N0b3JzIFdIRVJFIENPQUxFU0NFKGFjdGl2ZSwgdHJ1ZSkgPSB0cnVlKTo6dGV4dCBBUyBkb2N0b3JzLFxyXG4gICAgICAgICAgICAoU0VMRUNUIENPVU5UKCopIEZST00gc2VydmljZXMgV0hFUkUgQ09BTEVTQ0UoYWN0aXZlLCB0cnVlKSA9IHRydWUpOjp0ZXh0IEFTIHNlcnZpY2VzLFxyXG4gICAgICAgICAgICAoU0VMRUNUIENPVU5UKCopIEZST00gYXBwb2ludG1lbnRzIFdIRVJFIGRlbGV0ZWRfYXQgSVMgTlVMTCk6OnRleHQgQVMgYXBwb2ludG1lbnRzXHJcbiAgICAgICAgICBgLFxyXG4gICAgICAgICAgdCxcclxuICAgICAgICAgIHsgZG9jdG9yczogXCIwXCIsIHNlcnZpY2VzOiBcIjBcIiwgYXBwb2ludG1lbnRzOiBcIjBcIiB9XHJcbiAgICAgICAgKSxcclxuICAgICAgICB0aGlzLnNhZmVRdWVyeVBnUm93PHsgaWQ6IHN0cmluZyB9PihcclxuICAgICAgICAgIFwiY2FzaF9zaGlmdF9kYXNoYm9hcmRcIixcclxuICAgICAgICAgIGBTRUxFQ1QgaWQ6OnRleHQgRlJPTSBjYXNoX3JlZ2lzdGVyX3NoaWZ0cyBXSEVSRSBjbG9zZWRfYXQgSVMgTlVMTCBPUkRFUiBCWSBvcGVuZWRfYXQgREVTQyBMSU1JVCAxYCxcclxuICAgICAgICAgIHQsXHJcbiAgICAgICAgICB7IGlkOiBcIlwiIH1cclxuICAgICAgICApLFxyXG4gICAgICAgIHRoaXMuc2FmZVF1ZXJ5UGdSb3c8eyBjbnQ6IHN0cmluZyB9PihcclxuICAgICAgICAgIFwiYXBwdF90b2RheV9kYXNoYm9hcmRcIixcclxuICAgICAgICAgIGBcclxuICAgICAgICAgIFNFTEVDVCBDT1VOVCgqKTo6dGV4dCBBUyBjbnRcclxuICAgICAgICAgIEZST00gYXBwb2ludG1lbnRzIGFcclxuICAgICAgICAgIFdIRVJFIGEuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIEFORCAke3NxbExvY2FsRGF0ZShcImEuc3RhcnRfYXRcIil9ID0gJHtzcWxUb2RheUxvY2FsKCl9XHJcbiAgICAgICAgICBgLFxyXG4gICAgICAgICAgdCxcclxuICAgICAgICAgIHsgY250OiBcIjBcIiB9XHJcbiAgICAgICAgKSxcclxuICAgICAgICB0aGlzLnNhZmVRdWVyeVBnUm93PHsgY250OiBzdHJpbmcgfT4oXHJcbiAgICAgICAgICBcImFwcHRfZG9uZV9kYXNoYm9hcmRcIixcclxuICAgICAgICAgIGBcclxuICAgICAgICAgIFNFTEVDVCBDT1VOVCgqKTo6dGV4dCBBUyBjbnRcclxuICAgICAgICAgIEZST00gYXBwb2ludG1lbnRzIGFcclxuICAgICAgICAgIFdIRVJFIGEuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIEFORCBhLnN0YXR1cyA9ICdjb21wbGV0ZWQnXHJcbiAgICAgICAgICAgIEFORCAke3NxbExvY2FsRGF0ZShcImEuc3RhcnRfYXRcIil9ID0gJHtzcWxUb2RheUxvY2FsKCl9XHJcbiAgICAgICAgICBgLFxyXG4gICAgICAgICAgdCxcclxuICAgICAgICAgIHsgY250OiBcIjBcIiB9XHJcbiAgICAgICAgKSxcclxuICAgICAgICB0aGlzLnNhZmVRdWVyeVBnUm93PHsgY250OiBzdHJpbmcgfT4oXHJcbiAgICAgICAgICBcImFwcHRfc2NoZWRfZGFzaGJvYXJkXCIsXHJcbiAgICAgICAgICBgXHJcbiAgICAgICAgICBTRUxFQ1QgQ09VTlQoKik6OnRleHQgQVMgY250XHJcbiAgICAgICAgICBGUk9NIGFwcG9pbnRtZW50cyBhXHJcbiAgICAgICAgICBXSEVSRSBhLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICBBTkQgYS5zdGF0dXMgSU4gKCdzY2hlZHVsZWQnLCdjb25maXJtZWQnLCdhcnJpdmVkJywnaW5fY29uc3VsdGF0aW9uJylcclxuICAgICAgICAgICAgQU5EICR7c3FsTG9jYWxEYXRlKFwiYS5zdGFydF9hdFwiKX0gPSAke3NxbFRvZGF5TG9jYWwoKX1cclxuICAgICAgICAgIGAsXHJcbiAgICAgICAgICB0LFxyXG4gICAgICAgICAgeyBjbnQ6IFwiMFwiIH1cclxuICAgICAgICApLFxyXG4gICAgICAgIHRoaXMuc2FmZVF1ZXJ5UGdSb3c8eyBjbnQ6IHN0cmluZyB9PihcclxuICAgICAgICAgIFwibm9zaG93X2Rhc2hib2FyZFwiLFxyXG4gICAgICAgICAgYFxyXG4gICAgICAgICAgU0VMRUNUIENPVU5UKCopOjp0ZXh0IEFTIGNudFxyXG4gICAgICAgICAgRlJPTSBhcHBvaW50bWVudHMgYVxyXG4gICAgICAgICAgV0hFUkUgYS5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgICAgQU5EIGEuc3RhdHVzIElOICgnY2FuY2VsbGVkJywnbm9fc2hvdycpXHJcbiAgICAgICAgICAgIEFORCBhLnN0YXJ0X2F0ID49IChub3coKSAtIGludGVydmFsICczMCBkYXlzJylcclxuICAgICAgICAgIGAsXHJcbiAgICAgICAgICB0LFxyXG4gICAgICAgICAgeyBjbnQ6IFwiMFwiIH1cclxuICAgICAgICApLFxyXG4gICAgICAgIHRoaXMuc2FmZVF1ZXJ5UGdSb3c8eyBhdmc6IHN0cmluZyB9PihcclxuICAgICAgICAgIFwiYXZnX2RhaWx5X3JldmVudWVfN2RfZGFzaGJvYXJkXCIsXHJcbiAgICAgICAgICBTUUxfQVZHX0RBSUxZX1JFVkVOVUVfN0QsXHJcbiAgICAgICAgICB0LFxyXG4gICAgICAgICAgeyBhdmc6IFwiMFwiIH1cclxuICAgICAgICApLFxyXG4gICAgICBdKTtcclxuXHJcbiAgICAgIGNvbnN0IHJldmVudWVUb2RheSA9IE51bWJlcihyZXZlbnVlVG9kYXlSZXMudG90YWwgPz8gMCk7XHJcbiAgICAgIGNvbnN0IHJldmVudWU3ZCA9IE51bWJlcihyZXZlbnVlN2RSZXMudG90YWwgPz8gMCk7XHJcbiAgICAgIGNvbnN0IHJldmVudWVUb3RhbCA9IE51bWJlcihyZXZlbnVlVG90YWxSZXMudG90YWwgPz8gMCk7XHJcbiAgICAgIGNvbnN0IHBheW1lbnRzQ291bnRUb2RheSA9IE51bWJlcihwYXlDbnRUb2RheVJlcy5jID8/IDApO1xyXG4gICAgICBjb25zdCBwYXltZW50c0NvdW50N2QgPSBOdW1iZXIocGF5Q250N2RSZXMuYyA/PyAwKTtcclxuXHJcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICAgIGNvbnNvbGUubG9nKFwiW0FJIEZBQ1RTXSByZXZlbnVlVG9kYXk6XCIsIHJldmVudWVUb2RheSk7XHJcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICAgIGNvbnNvbGUubG9nKFwiW0FJIEZBQ1RTXSByZXZlbnVlN2Q6XCIsIHJldmVudWU3ZCk7XHJcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICAgIGNvbnNvbGUubG9nKFwiW0FJIEZBQ1RTXSBwYXltZW50c0NvdW50VG9kYXk6XCIsIHBheW1lbnRzQ291bnRUb2RheSk7XHJcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICAgIGNvbnNvbGUubG9nKFxyXG4gICAgICAgIFwiW0FJIEZBQ1RTXSBzb3VyY2UgdXNlZDpcIixcclxuICAgICAgICBgcGF5bWVudHMraW52b2ljZXMgbmV0OyBwLmNyZWF0ZWRfYXQ7IGRhdGVfdHJ1bmMrQVQgVElNRSBaT05FOyBUWj0ke3R6fTsgKGFsaWduZWQgd2l0aCByZXBvcnRzIG1ldHJpY3MpYFxyXG4gICAgICApO1xyXG4gICAgICBjb25zdCBhdmdDaGVja1RvZGF5ID1cclxuICAgICAgICBwYXltZW50c0NvdW50VG9kYXkgPiAwID8gcm91bmQyKHJldmVudWVUb2RheSAvIHBheW1lbnRzQ291bnRUb2RheSkgOiAwO1xyXG4gICAgICBjb25zdCBhdmdDaGVjazdkID0gcGF5bWVudHNDb3VudDdkID4gMCA/IHJvdW5kMihyZXZlbnVlN2QgLyBwYXltZW50c0NvdW50N2QpIDogMDtcclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgcmV2ZW51ZVRvZGF5LFxyXG4gICAgICAgIHJldmVudWU3ZCxcclxuICAgICAgICByZXZlbnVlVG90YWwsXHJcbiAgICAgICAgdW5wYWlkQ291bnQ6IE51bWJlcih1bnBhaWRSZXMuY250ID8/IDApLFxyXG4gICAgICAgIHVucGFpZFRvdGFsOiBOdW1iZXIodW5wYWlkUmVzLnRvdGFsID8/IDApLFxyXG4gICAgICAgIGF2Z0NoZWNrVG9kYXksXHJcbiAgICAgICAgYXZnQ2hlY2s3ZCxcclxuICAgICAgICBwYXltZW50c0NvdW50VG9kYXksXHJcbiAgICAgICAgcGF5bWVudHNDb3VudDdkLFxyXG4gICAgICAgIHRvcERvY3Rvck5hbWU6IHRvcERvY3RvclJlcy5uYW1lPy50cmltKCkgPyB0b3BEb2N0b3JSZXMubmFtZSA6IG51bGwsXHJcbiAgICAgICAgdG9wRG9jdG9yVG90YWw6IE51bWJlcih0b3BEb2N0b3JSZXMudG90YWwgPz8gMCksXHJcbiAgICAgICAgdG9wU2VydmljZU5hbWU6IHRvcFNlcnZpY2VSZXMubmFtZT8udHJpbSgpID8gdG9wU2VydmljZVJlcy5uYW1lIDogbnVsbCxcclxuICAgICAgICB0b3BTZXJ2aWNlVG90YWw6IE51bWJlcih0b3BTZXJ2aWNlUmVzLnRvdGFsID8/IDApLFxyXG4gICAgICAgIGRvY3RvcnNDb3VudDogTnVtYmVyKGNvdW50c1Jlcy5kb2N0b3JzID8/IDApLFxyXG4gICAgICAgIHNlcnZpY2VzQ291bnQ6IE51bWJlcihjb3VudHNSZXMuc2VydmljZXMgPz8gMCksXHJcbiAgICAgICAgYXBwb2ludG1lbnRzQ291bnQ6IE51bWJlcihjb3VudHNSZXMuYXBwb2ludG1lbnRzID8/IDApLFxyXG4gICAgICAgIGFwcG9pbnRtZW50c1RvZGF5OiBOdW1iZXIoYXBwdFRvZGF5UmVzLmNudCA/PyAwKSxcclxuICAgICAgICBhcHBvaW50bWVudHNDb21wbGV0ZWRUb2RheTogTnVtYmVyKGFwcHREb25lUmVzLmNudCA/PyAwKSxcclxuICAgICAgICBhcHBvaW50bWVudHNTY2hlZHVsZWRUb2RheTogTnVtYmVyKGFwcHRTY2hlZFJlcy5jbnQgPz8gMCksXHJcbiAgICAgICAgbm9TaG93T3JDYW5jZWxsZWQzMGQ6IE51bWJlcihub1Nob3dSZXMuY250ID8/IDApLFxyXG4gICAgICAgIGF2Z0RhaWx5UmV2ZW51ZTdEYXlzOiBOdW1iZXIoYXZnN0Rlcml2ZWQuYXZnID8/IDApLFxyXG4gICAgICAgIGNhc2hTaGlmdE9wZW46IEJvb2xlYW4oY2FzaFNoaWZ0UmVzLmlkKSxcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkYiA9IGdldE1vY2tEYigpO1xyXG4gICAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvRGF0ZVN0cmluZygpO1xyXG5cclxuICAgIGNvbnN0IGlzVmFsaWRJbnYgPSAoaW52OiAodHlwZW9mIGRiLmludm9pY2VzKVswXSk6IGJvb2xlYW4gPT5cclxuICAgICAgaW52LmRlbGV0ZWRBdCA9PT0gbnVsbCAmJiBpbnYuc3RhdHVzICE9PSBcImNhbmNlbGxlZFwiICYmIGludi5zdGF0dXMgIT09IFwicmVmdW5kZWRcIjtcclxuXHJcbiAgICBjb25zdCBuZXRQYXkgPSAocDogKHR5cGVvZiBkYi5wYXltZW50cylbMF0pOiBudW1iZXIgPT5cclxuICAgICAgTWF0aC5tYXgoMCwgcC5hbW91bnQgLSAocC5yZWZ1bmRlZEFtb3VudCA/PyAwKSk7XHJcblxyXG4gICAgY29uc3QgaW5Mb2NhbERheSA9IChpc286IHN0cmluZywgZGF5U3RyOiBzdHJpbmcpOiBib29sZWFuID0+IHtcclxuICAgICAgY29uc3QgZCA9IG5ldyBEYXRlKGlzbyk7XHJcbiAgICAgIHJldHVybiBkLnRvRGF0ZVN0cmluZygpID09PSBkYXlTdHI7XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGluTGFzdDdMb2NhbERheXMgPSAoaXNvOiBzdHJpbmcpOiBib29sZWFuID0+IHtcclxuICAgICAgY29uc3QgZCA9IG5ldyBEYXRlKGlzbyk7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNzsgaSArPSAxKSB7XHJcbiAgICAgICAgY29uc3QgeCA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgeC5zZXRIb3VycygwLCAwLCAwLCAwKTtcclxuICAgICAgICB4LnNldERhdGUoeC5nZXREYXRlKCkgLSBpKTtcclxuICAgICAgICBpZiAoZC50b0RhdGVTdHJpbmcoKSA9PT0geC50b0RhdGVTdHJpbmcoKSkgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfTtcclxuXHJcbiAgICBsZXQgcmV2ZW51ZVRvZGF5ID0gMDtcclxuICAgIGxldCByZXZlbnVlN2QgPSAwO1xyXG4gICAgbGV0IHJldmVudWVUb3RhbCA9IDA7XHJcbiAgICBsZXQgcGF5bWVudHNDb3VudFRvZGF5ID0gMDtcclxuICAgIGxldCBwYXltZW50c0NvdW50N2QgPSAwO1xyXG5cclxuICAgIC8qKiDQmtCw0LogUG9zdGdyZXM6INC+0L/Qu9Cw0YLRiyDQv9C+INGB0YfQtdGC0LDQvCAo0L3QtSBjYW5jZWxsZWQvcmVmdW5kZWQpLCBuZXQt0YHRg9C80LzQsC4gKi9cclxuICAgIGRiLnBheW1lbnRzLmZvckVhY2goKHApID0+IHtcclxuICAgICAgaWYgKHAuZGVsZXRlZEF0KSByZXR1cm47XHJcbiAgICAgIGNvbnN0IGludiA9IGRiLmludm9pY2VzLmZpbmQoKGkpID0+IGkuaWQgPT09IHAuaW52b2ljZUlkKTtcclxuICAgICAgaWYgKCFpbnYgfHwgIWlzVmFsaWRJbnYoaW52KSkgcmV0dXJuO1xyXG4gICAgICBjb25zdCBuID0gbmV0UGF5KHApO1xyXG4gICAgICByZXZlbnVlVG90YWwgKz0gbjtcclxuICAgICAgaWYgKGluTG9jYWxEYXkocC5jcmVhdGVkQXQsIHRvZGF5KSkge1xyXG4gICAgICAgIHJldmVudWVUb2RheSArPSBuO1xyXG4gICAgICAgIGlmIChuID4gMCkgcGF5bWVudHNDb3VudFRvZGF5ICs9IDE7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGluTGFzdDdMb2NhbERheXMocC5jcmVhdGVkQXQpKSB7XHJcbiAgICAgICAgcmV2ZW51ZTdkICs9IG47XHJcbiAgICAgICAgaWYgKG4gPiAwKSBwYXltZW50c0NvdW50N2QgKz0gMTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5sb2coXCJbQUkgRkFDVFNdIHJldmVudWVUb2RheTpcIiwgcmV2ZW51ZVRvZGF5KTtcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICBjb25zb2xlLmxvZyhcIltBSSBGQUNUU10gcmV2ZW51ZTdkOlwiLCByZXZlbnVlN2QpO1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgIGNvbnNvbGUubG9nKFwiW0FJIEZBQ1RTXSBwYXltZW50c0NvdW50VG9kYXk6XCIsIHBheW1lbnRzQ291bnRUb2RheSk7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5sb2coXCJbQUkgRkFDVFNdIHNvdXJjZSB1c2VkOiBtb2NrIERCOyBwYXltZW50cytpbnZvaWNlcyBuZXQgKGFsaWduZWQgd2l0aCByZXBvcnRzKVwiKTtcclxuXHJcbiAgICBjb25zdCB1bnBhaWRJbnZvaWNlcyA9IGRiLmludm9pY2VzLmZpbHRlcihcclxuICAgICAgKGkpID0+XHJcbiAgICAgICAgaS5kZWxldGVkQXQgPT09IG51bGwgJiZcclxuICAgICAgICBbXCJkcmFmdFwiLCBcImlzc3VlZFwiLCBcInBhcnRpYWxseV9wYWlkXCJdLmluY2x1ZGVzKGkuc3RhdHVzKSAmJlxyXG4gICAgICAgIE1hdGgubWF4KDAsIGkudG90YWwgLSBpLnBhaWRBbW91bnQpID4gMFxyXG4gICAgKTtcclxuICAgIGNvbnN0IHVucGFpZFRvdGFsID0gdW5wYWlkSW52b2ljZXMucmVkdWNlKChhY2MsIGkpID0+IGFjYyArIE1hdGgubWF4KDAsIGkudG90YWwgLSBpLnBhaWRBbW91bnQpLCAwKTtcclxuXHJcbiAgICBjb25zdCBkb2N0b3JSZXZlbnVlID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcclxuICAgIGNvbnN0IHNlcnZpY2VSZXZlbnVlID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcclxuICAgIGRiLnBheW1lbnRzLmZvckVhY2goKHApID0+IHtcclxuICAgICAgaWYgKHAuZGVsZXRlZEF0KSByZXR1cm47XHJcbiAgICAgIGNvbnN0IGludiA9IGRiLmludm9pY2VzLmZpbmQoKGkpID0+IGkuaWQgPT09IHAuaW52b2ljZUlkKTtcclxuICAgICAgaWYgKCFpbnYgfHwgIWlzVmFsaWRJbnYoaW52KSB8fCAhaW52LmFwcG9pbnRtZW50SWQpIHJldHVybjtcclxuICAgICAgY29uc3QgYXAgPSBkYi5hcHBvaW50bWVudHMuZmluZCgoYSkgPT4gYS5pZCA9PT0gaW52LmFwcG9pbnRtZW50SWQpO1xyXG4gICAgICBpZiAoIWFwKSByZXR1cm47XHJcbiAgICAgIGRvY3RvclJldmVudWUuc2V0KGFwLmRvY3RvcklkLCAoZG9jdG9yUmV2ZW51ZS5nZXQoYXAuZG9jdG9ySWQpID8/IDApICsgbmV0UGF5KHApKTtcclxuICAgICAgc2VydmljZVJldmVudWUuc2V0KGFwLnNlcnZpY2VJZCwgKHNlcnZpY2VSZXZlbnVlLmdldChhcC5zZXJ2aWNlSWQpID8/IDApICsgbmV0UGF5KHApKTtcclxuICAgIH0pO1xyXG4gICAgY29uc3QgdG9wRG9jdG9yRW50cnkgPSBbLi4uZG9jdG9yUmV2ZW51ZS5lbnRyaWVzKCldLnNvcnQoKGEsIGIpID0+IGJbMV0gLSBhWzFdKVswXTtcclxuICAgIGNvbnN0IHRvcFNlcnZpY2VFbnRyeSA9IFsuLi5zZXJ2aWNlUmV2ZW51ZS5lbnRyaWVzKCldLnNvcnQoKGEsIGIpID0+IGJbMV0gLSBhWzFdKVswXTtcclxuXHJcbiAgICBjb25zdCBhcHBvaW50bWVudHNUb2RheSA9IGRiLmFwcG9pbnRtZW50cy5maWx0ZXIoXHJcbiAgICAgIChhKSA9PiBuZXcgRGF0ZShhLnN0YXJ0QXQpLnRvRGF0ZVN0cmluZygpID09PSB0b2RheVxyXG4gICAgKS5sZW5ndGg7XHJcbiAgICBjb25zdCBhcHBvaW50bWVudHNDb21wbGV0ZWRUb2RheSA9IGRiLmFwcG9pbnRtZW50cy5maWx0ZXIoXHJcbiAgICAgIChhKSA9PiBhLnN0YXR1cyA9PT0gXCJjb21wbGV0ZWRcIiAmJiBuZXcgRGF0ZShhLnN0YXJ0QXQpLnRvRGF0ZVN0cmluZygpID09PSB0b2RheVxyXG4gICAgKS5sZW5ndGg7XHJcbiAgICBjb25zdCBhcHBvaW50bWVudHNTY2hlZHVsZWRUb2RheSA9IGRiLmFwcG9pbnRtZW50cy5maWx0ZXIoXHJcbiAgICAgIChhKSA9PlxyXG4gICAgICAgIFtcInNjaGVkdWxlZFwiLCBcImNvbmZpcm1lZFwiLCBcImFycml2ZWRcIiwgXCJpbl9jb25zdWx0YXRpb25cIl0uaW5jbHVkZXMoYS5zdGF0dXMpICYmXHJcbiAgICAgICAgbmV3IERhdGUoYS5zdGFydEF0KS50b0RhdGVTdHJpbmcoKSA9PT0gdG9kYXlcclxuICAgICkubGVuZ3RoO1xyXG4gICAgY29uc3Qgbm9TaG93T3JDYW5jZWxsZWQzMGQgPSBkYi5hcHBvaW50bWVudHMuZmlsdGVyKChhKSA9PiB7XHJcbiAgICAgIGlmICghW1wiY2FuY2VsbGVkXCIsIFwibm9fc2hvd1wiXS5pbmNsdWRlcyhhLnN0YXR1cykpIHJldHVybiBmYWxzZTtcclxuICAgICAgcmV0dXJuIG5ldyBEYXRlKGEuc3RhcnRBdCkuZ2V0VGltZSgpID49IERhdGUubm93KCkgLSAzMCAqIDg2XzQwMF8wMDA7XHJcbiAgICB9KS5sZW5ndGg7XHJcblxyXG4gICAgY29uc3QgYXZnQ2hlY2tUb2RheSA9XHJcbiAgICAgIHBheW1lbnRzQ291bnRUb2RheSA+IDAgPyByb3VuZDIocmV2ZW51ZVRvZGF5IC8gcGF5bWVudHNDb3VudFRvZGF5KSA6IDA7XHJcbiAgICBjb25zdCBhdmdDaGVjazdkID0gcGF5bWVudHNDb3VudDdkID4gMCA/IHJvdW5kMihyZXZlbnVlN2QgLyBwYXltZW50c0NvdW50N2QpIDogMDtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXZlbnVlVG9kYXksXHJcbiAgICAgIHJldmVudWU3ZCxcclxuICAgICAgcmV2ZW51ZVRvdGFsLFxyXG4gICAgICB1bnBhaWRDb3VudDogdW5wYWlkSW52b2ljZXMubGVuZ3RoLFxyXG4gICAgICB1bnBhaWRUb3RhbCxcclxuICAgICAgYXZnQ2hlY2tUb2RheSxcclxuICAgICAgYXZnQ2hlY2s3ZCxcclxuICAgICAgcGF5bWVudHNDb3VudFRvZGF5LFxyXG4gICAgICBwYXltZW50c0NvdW50N2QsXHJcbiAgICAgIHRvcERvY3Rvck5hbWU6IHRvcERvY3RvckVudHJ5ID8gZGIuZG9jdG9ycy5maW5kKChkKSA9PiBkLmlkID09PSB0b3BEb2N0b3JFbnRyeVswXSk/Lm5hbWUgPz8gbnVsbCA6IG51bGwsXHJcbiAgICAgIHRvcERvY3RvclRvdGFsOiB0b3BEb2N0b3JFbnRyeT8uWzFdID8/IDAsXHJcbiAgICAgIHRvcFNlcnZpY2VOYW1lOiB0b3BTZXJ2aWNlRW50cnkgPyBkYi5zZXJ2aWNlcy5maW5kKChzKSA9PiBzLmlkID09PSB0b3BTZXJ2aWNlRW50cnlbMF0pPy5uYW1lID8/IG51bGwgOiBudWxsLFxyXG4gICAgICB0b3BTZXJ2aWNlVG90YWw6IHRvcFNlcnZpY2VFbnRyeT8uWzFdID8/IDAsXHJcbiAgICAgIGRvY3RvcnNDb3VudDogZGIuZG9jdG9ycy5maWx0ZXIoKGQpID0+IGQuYWN0aXZlKS5sZW5ndGgsXHJcbiAgICAgIHNlcnZpY2VzQ291bnQ6IGRiLnNlcnZpY2VzLmZpbHRlcigocykgPT4gcy5hY3RpdmUpLmxlbmd0aCxcclxuICAgICAgYXBwb2ludG1lbnRzQ291bnQ6IGRiLmFwcG9pbnRtZW50cy5sZW5ndGgsXHJcbiAgICAgIGFwcG9pbnRtZW50c1RvZGF5LFxyXG4gICAgICBhcHBvaW50bWVudHNDb21wbGV0ZWRUb2RheSxcclxuICAgICAgYXBwb2ludG1lbnRzU2NoZWR1bGVkVG9kYXksXHJcbiAgICAgIG5vU2hvd09yQ2FuY2VsbGVkMzBkLFxyXG4gICAgICBhdmdEYWlseVJldmVudWU3RGF5czogcmV2ZW51ZTdkIC8gNyxcclxuICAgICAgY2FzaFNoaWZ0T3BlbjogZGIuY2FzaFJlZ2lzdGVyU2hpZnRzLnNvbWUoKHMpID0+ICFzLmNsb3NlZEF0KSxcclxuICAgIH07XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiW0FJIEZBQ1QgQlVJTERFUl0gZ2V0Q2xpbmljU25hcHNob3QgZmFpbGVkXCIsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIGNyZWF0ZUVtcHR5Q2xpbmljRmFjdHNTbmFwc2hvdCgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgZmV0Y2hIeWJyaWREYXRhKGludGVudDogQWlEYXRhSW50ZW50KTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4ge1xyXG4gICAgaWYgKGVudi5kYXRhUHJvdmlkZXIgPT09IFwicG9zdGdyZXNcIikge1xyXG4gICAgICBjb25zdCB0eiA9IGVudi5yZXBvcnRzVGltZXpvbmU7XHJcbiAgICAgIGNvbnN0IHQgPSBbdHpdO1xyXG4gICAgICBjb25zdCBuZXRQID0gc3FsTmV0UGF5bWVudChcInBcIik7XHJcblxyXG4gICAgICBzd2l0Y2ggKGludGVudCkge1xyXG4gICAgICAgIGNhc2UgXCJyZXZlbnVlXCI6IHtcclxuICAgICAgICAgIGNvbnN0IHJvdyA9IGF3YWl0IHRoaXMuc2FmZVF1ZXJ5UGdSb3c8eyB0b3RhbDogc3RyaW5nOyBjbnQ6IHN0cmluZyB9PihcclxuICAgICAgICAgICAgXCJoeWJyaWRfcmV2ZW51ZV90b2RheV9kYXNoYm9hcmRcIixcclxuICAgICAgICAgICAgU1FMX1BBWU1FTlRTX1JFVkVOVUVfVE9EQVlfSFlCUklELFxyXG4gICAgICAgICAgICB0LFxyXG4gICAgICAgICAgICB7IHRvdGFsOiBcIjBcIiwgY250OiBcIjBcIiB9XHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgY29uc3QgdG90YWwgPSBOdW1iZXIocm93LnRvdGFsID8/IDApO1xyXG4gICAgICAgICAgY29uc3QgcGF5bWVudHNDb3VudFRvZGF5ID0gTnVtYmVyKHJvdy5jbnQgPz8gMCk7XHJcbiAgICAgICAgICByZXR1cm4geyB0b3RhbCwgcmV2ZW51ZVRvZGF5OiB0b3RhbCwgcGF5bWVudHNDb3VudFRvZGF5IH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhc2UgXCJ1bnBhaWRcIjoge1xyXG4gICAgICAgICAgY29uc3Qgc3VtbWFyeSA9IGF3YWl0IHRoaXMucXVlcnlQZzx7IGNudDogc3RyaW5nOyB0b3RhbDogc3RyaW5nIH0+KFxyXG4gICAgICAgICAgICBgXHJcbiAgICAgICAgICAgIFNFTEVDVCBDT1VOVCgqKTo6dGV4dCBBUyBjbnQsXHJcbiAgICAgICAgICAgICAgICAgICBDT0FMRVNDRShTVU0oR1JFQVRFU1QoaW52LnRvdGFsOjpudW1lcmljIC0gJHtzcWxJbnZvaWNlUGFpZFN1bShcImludlwiKX0sIDApKSwgMCk6OnRleHQgQVMgdG90YWxcclxuICAgICAgICAgICAgRlJPTSBpbnZvaWNlcyBpbnZcclxuICAgICAgICAgICAgV0hFUkUgaW52LmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICAgIEFORCBpbnYuc3RhdHVzIElOICgnZHJhZnQnLCdpc3N1ZWQnLCdwYXJ0aWFsbHlfcGFpZCcpXHJcbiAgICAgICAgICAgICAgQU5EIEdSRUFURVNUKGludi50b3RhbDo6bnVtZXJpYyAtICR7c3FsSW52b2ljZVBhaWRTdW0oXCJpbnZcIil9LCAwKSA+IDBcclxuICAgICAgICAgICAgYCxcclxuICAgICAgICAgICAgdFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB0aGlzLnF1ZXJ5UGc8eyBudW1iZXI6IHN0cmluZzsgcmVtYWluZGVyOiBzdHJpbmcgfT4oXHJcbiAgICAgICAgICAgIGBcclxuICAgICAgICAgICAgU0VMRUNUIGludi5udW1iZXIsXHJcbiAgICAgICAgICAgICAgICAgICBHUkVBVEVTVChpbnYudG90YWw6Om51bWVyaWMgLSAke3NxbEludm9pY2VQYWlkU3VtKFwiaW52XCIpfSwgMCk6OnRleHQgQVMgcmVtYWluZGVyXHJcbiAgICAgICAgICAgIEZST00gaW52b2ljZXMgaW52XHJcbiAgICAgICAgICAgIFdIRVJFIGludi5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgICAgICBBTkQgaW52LnN0YXR1cyBJTiAoJ2RyYWZ0JywnaXNzdWVkJywncGFydGlhbGx5X3BhaWQnKVxyXG4gICAgICAgICAgICAgIEFORCBHUkVBVEVTVChpbnYudG90YWw6Om51bWVyaWMgLSAke3NxbEludm9pY2VQYWlkU3VtKFwiaW52XCIpfSwgMCkgPiAwXHJcbiAgICAgICAgICAgIE9SREVSIEJZIGludi5jcmVhdGVkX2F0IERFU0NcclxuICAgICAgICAgICAgTElNSVQgNVxyXG4gICAgICAgICAgICBgLFxyXG4gICAgICAgICAgICB0XHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgY291bnQ6IE51bWJlcihzdW1tYXJ5LnJvd3NbMF0/LmNudCA/PyAwKSxcclxuICAgICAgICAgICAgdW5wYWlkQ291bnQ6IE51bWJlcihzdW1tYXJ5LnJvd3NbMF0/LmNudCA/PyAwKSxcclxuICAgICAgICAgICAgdW5wYWlkVG90YWw6IE51bWJlcihzdW1tYXJ5LnJvd3NbMF0/LnRvdGFsID8/IDApLFxyXG4gICAgICAgICAgICByZWNlbnRJbnZvaWNlczogcm93cy5yb3dzLm1hcCgocikgPT4gKHtcclxuICAgICAgICAgICAgICBudW1iZXI6IHIubnVtYmVyLFxyXG4gICAgICAgICAgICAgIHJlbWFpbmRlcjogTnVtYmVyKHIucmVtYWluZGVyKSxcclxuICAgICAgICAgICAgfSkpLFxyXG4gICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2FzZSBcInRvcF9kb2N0b3JcIjoge1xyXG4gICAgICAgICAgY29uc3Qgcm93ID0gYXdhaXQgdGhpcy5xdWVyeVBnPHsgbmFtZTogc3RyaW5nOyB0b3RhbDogc3RyaW5nOyBzaGFyZTogc3RyaW5nIH0+KFxyXG4gICAgICAgICAgICBgXHJcbiAgICAgICAgICAgIFdJVEggZG9jdG9yX3RvdGFscyBBUyAoXHJcbiAgICAgICAgICAgICAgU0VMRUNUXHJcbiAgICAgICAgICAgICAgICBkLmlkLFxyXG4gICAgICAgICAgICAgICAgTUFYKCR7U1FMX0RPQ1RPUl9MQUJFTH0pIEFTIG5hbWUsXHJcbiAgICAgICAgICAgICAgICBDT0FMRVNDRShTVU0oJHtuZXRQfSksIDApIEFTIHRvdGFsXHJcbiAgICAgICAgICAgICAgRlJPTSBkb2N0b3JzIGRcclxuICAgICAgICAgICAgICBJTk5FUiBKT0lOIGFwcG9pbnRtZW50cyBhIE9OIGEuZG9jdG9yX2lkID0gZC5pZCBBTkQgYS5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgICAgICBJTk5FUiBKT0lOIGludm9pY2VzIGkgT04gaS5hcHBvaW50bWVudF9pZCA9IGEuaWQgQU5EIGkuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgICAgSU5ORVIgSk9JTiBwYXltZW50cyBwIE9OIHAuaW52b2ljZV9pZCA9IGkuaWQgQU5EIHAuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgICAgV0hFUkUgJHtzcWxJbnZvaWNlVmFsaWRGb3JSZXZlbnVlKFwiaVwiKX1cclxuICAgICAgICAgICAgICBHUk9VUCBCWSBkLmlkXHJcbiAgICAgICAgICAgICksXHJcbiAgICAgICAgICAgIGdyYW5kIEFTIChTRUxFQ1QgQ09BTEVTQ0UoU1VNKHRvdGFsKSwgMCkgQVMgYWxsX3RvdGFsIEZST00gZG9jdG9yX3RvdGFscylcclxuICAgICAgICAgICAgU0VMRUNUIGR0Lm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICBkdC50b3RhbDo6dGV4dCBBUyB0b3RhbCxcclxuICAgICAgICAgICAgICAgICAgIENBU0UgV0hFTiBnLmFsbF90b3RhbCA+IDAgVEhFTiBST1VORCgoZHQudG90YWwgLyBnLmFsbF90b3RhbCkgKiAxMDAsIDIpOjp0ZXh0IEVMU0UgJzAnIEVORCBBUyBzaGFyZVxyXG4gICAgICAgICAgICBGUk9NIGRvY3Rvcl90b3RhbHMgZHRcclxuICAgICAgICAgICAgQ1JPU1MgSk9JTiBncmFuZCBnXHJcbiAgICAgICAgICAgIE9SREVSIEJZIGR0LnRvdGFsIERFU0MgTlVMTFMgTEFTVFxyXG4gICAgICAgICAgICBMSU1JVCAxXHJcbiAgICAgICAgICAgIGAsXHJcbiAgICAgICAgICAgIHRcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0b3BEb2N0b3I6IHJvdy5yb3dzWzBdXHJcbiAgICAgICAgICAgICAgPyB7XHJcbiAgICAgICAgICAgICAgICAgIG5hbWU6IHJvdy5yb3dzWzBdLm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgIHRvdGFsOiBOdW1iZXIocm93LnJvd3NbMF0udG90YWwpLFxyXG4gICAgICAgICAgICAgICAgICBzaGFyZTogTnVtYmVyKHJvdy5yb3dzWzBdLnNoYXJlID8/IDApLFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIDogbnVsbCxcclxuICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhc2UgXCJ0b3Bfc2VydmljZVwiOiB7XHJcbiAgICAgICAgICBjb25zdCByb3cgPSBhd2FpdCB0aGlzLnF1ZXJ5UGc8eyBuYW1lOiBzdHJpbmc7IHRvdGFsOiBzdHJpbmcgfT4oXHJcbiAgICAgICAgICAgIGBcclxuICAgICAgICAgICAgU0VMRUNUIHMubmFtZSwgQ09BTEVTQ0UoU1VNKCR7bmV0UH0pLCAwKTo6dGV4dCBBUyB0b3RhbFxyXG4gICAgICAgICAgICBGUk9NIHNlcnZpY2VzIHNcclxuICAgICAgICAgICAgSU5ORVIgSk9JTiBhcHBvaW50bWVudHMgYSBPTiBhLnNlcnZpY2VfaWQgPSBzLmlkIEFORCBhLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICBJTk5FUiBKT0lOIGludm9pY2VzIGkgT04gaS5hcHBvaW50bWVudF9pZCA9IGEuaWQgQU5EIGkuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIElOTkVSIEpPSU4gcGF5bWVudHMgcCBPTiBwLmludm9pY2VfaWQgPSBpLmlkIEFORCBwLmRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICBXSEVSRSAke3NxbEludm9pY2VWYWxpZEZvclJldmVudWUoXCJpXCIpfVxyXG4gICAgICAgICAgICBHUk9VUCBCWSBzLmlkLCBzLm5hbWVcclxuICAgICAgICAgICAgT1JERVIgQlkgQ09BTEVTQ0UoU1VNKCR7bmV0UH0pLCAwKSBERVNDIE5VTExTIExBU1RcclxuICAgICAgICAgICAgTElNSVQgMVxyXG4gICAgICAgICAgICBgLFxyXG4gICAgICAgICAgICB0XHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgdG9wU2VydmljZTogcm93LnJvd3NbMF1cclxuICAgICAgICAgICAgICA/IHsgbmFtZTogcm93LnJvd3NbMF0ubmFtZSwgdG90YWw6IE51bWJlcihyb3cucm93c1swXS50b3RhbCkgfVxyXG4gICAgICAgICAgICAgIDogbnVsbCxcclxuICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhc2UgXCJjYXNoX3N0YXR1c1wiOiB7XHJcbiAgICAgICAgICBjb25zdCByb3cgPSBhd2FpdCB0aGlzLnF1ZXJ5UGc8eyBpZDogc3RyaW5nOyBvcGVuZWRfYXQ6IHN0cmluZyB9PihcclxuICAgICAgICAgICAgYFNFTEVDVCBpZDo6dGV4dCwgb3BlbmVkX2F0Ojp0ZXh0XHJcbiAgICAgICAgICAgICBGUk9NIGNhc2hfcmVnaXN0ZXJfc2hpZnRzXHJcbiAgICAgICAgICAgICBXSEVSRSBjbG9zZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICAgT1JERVIgQlkgb3BlbmVkX2F0IERFU0NcclxuICAgICAgICAgICAgIExJTUlUIDFgLFxyXG4gICAgICAgICAgICB0XHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgY2FzaFNoaWZ0T3BlbjogQm9vbGVhbihyb3cucm93c1swXSksXHJcbiAgICAgICAgICAgIGN1cnJlbnRTaGlmdDogcm93LnJvd3NbMF0gPz8gbnVsbCxcclxuICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhc2UgXCJoZWFsdGhcIjoge1xyXG4gICAgICAgICAgY29uc3Qgc25hcCA9IGF3YWl0IHRoaXMuZ2V0Q2xpbmljU25hcHNob3QoKTtcclxuICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHJldmVudWVUb2RheTogc25hcC5yZXZlbnVlVG9kYXksXHJcbiAgICAgICAgICAgIHVucGFpZENvdW50OiBzbmFwLnVucGFpZENvdW50LFxyXG4gICAgICAgICAgICB0b3BEb2N0b3I6IHNuYXAudG9wRG9jdG9yTmFtZVxyXG4gICAgICAgICAgICAgID8geyBuYW1lOiBzbmFwLnRvcERvY3Rvck5hbWUsIHRvdGFsOiBzbmFwLnRvcERvY3RvclRvdGFsIH1cclxuICAgICAgICAgICAgICA6IG51bGwsXHJcbiAgICAgICAgICAgIHRvcFNlcnZpY2U6IHNuYXAudG9wU2VydmljZU5hbWVcclxuICAgICAgICAgICAgICA/IHsgbmFtZTogc25hcC50b3BTZXJ2aWNlTmFtZSwgdG90YWw6IHNuYXAudG9wU2VydmljZVRvdGFsIH1cclxuICAgICAgICAgICAgICA6IG51bGwsXHJcbiAgICAgICAgICAgIGFwcG9pbnRtZW50c1RvZGF5OiBzbmFwLmFwcG9pbnRtZW50c1RvZGF5LFxyXG4gICAgICAgICAgICBhdmdEYWlseVJldmVudWU3RGF5czogc25hcC5hdmdEYWlseVJldmVudWU3RGF5cyxcclxuICAgICAgICAgICAgYXZnQ2hlY2tUb2RheTogc25hcC5hdmdDaGVja1RvZGF5LFxyXG4gICAgICAgICAgICBhdmdDaGVjazdkOiBzbmFwLmF2Z0NoZWNrN2QsXHJcbiAgICAgICAgICAgIG5vU2hvd09yQ2FuY2VsbGVkMzBkOiBzbmFwLm5vU2hvd09yQ2FuY2VsbGVkMzBkLFxyXG4gICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIHJldHVybiB7fTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNuYXAgPSBhd2FpdCB0aGlzLmdldENsaW5pY1NuYXBzaG90KCk7XHJcbiAgICBpZiAoaW50ZW50ID09PSBcInJldmVudWVcIikge1xyXG4gICAgICByZXR1cm4geyB0b3RhbDogc25hcC5yZXZlbnVlVG9kYXksIHJldmVudWVUb2RheTogc25hcC5yZXZlbnVlVG9kYXkgfTtcclxuICAgIH1cclxuICAgIGlmIChpbnRlbnQgPT09IFwidW5wYWlkXCIpIHtcclxuICAgICAgY29uc3QgdW5wYWlkSW52b2ljZXMgPSBnZXRNb2NrRGIoKS5pbnZvaWNlcy5maWx0ZXIoXHJcbiAgICAgICAgKGkpID0+XHJcbiAgICAgICAgICBpLmRlbGV0ZWRBdCA9PT0gbnVsbCAmJlxyXG4gICAgICAgICAgW1wiZHJhZnRcIiwgXCJpc3N1ZWRcIiwgXCJwYXJ0aWFsbHlfcGFpZFwiXS5pbmNsdWRlcyhpLnN0YXR1cykgJiZcclxuICAgICAgICAgIE1hdGgubWF4KDAsIGkudG90YWwgLSBpLnBhaWRBbW91bnQpID4gMFxyXG4gICAgICApO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGNvdW50OiB1bnBhaWRJbnZvaWNlcy5sZW5ndGgsXHJcbiAgICAgICAgdW5wYWlkQ291bnQ6IHVucGFpZEludm9pY2VzLmxlbmd0aCxcclxuICAgICAgICB1bnBhaWRUb3RhbDogdW5wYWlkSW52b2ljZXMucmVkdWNlKChhLCBpKSA9PiBhICsgTWF0aC5tYXgoMCwgaS50b3RhbCAtIGkucGFpZEFtb3VudCksIDApLFxyXG4gICAgICAgIHJlY2VudEludm9pY2VzOiB1bnBhaWRJbnZvaWNlcy5zbGljZSgwLCA1KS5tYXAoKGkpID0+ICh7XHJcbiAgICAgICAgICBudW1iZXI6IGkubnVtYmVyLFxyXG4gICAgICAgICAgcmVtYWluZGVyOiBNYXRoLm1heCgwLCBpLnRvdGFsIC0gaS5wYWlkQW1vdW50KSxcclxuICAgICAgICB9KSksXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgICBpZiAoaW50ZW50ID09PSBcInRvcF9kb2N0b3JcIikge1xyXG4gICAgICBjb25zdCBkb2N0b3JSZXZlbnVlID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcclxuICAgICAgZ2V0TW9ja0RiKCkucGF5bWVudHMuZm9yRWFjaCgocCkgPT4ge1xyXG4gICAgICAgIGlmIChwLmRlbGV0ZWRBdCkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGludiA9IGdldE1vY2tEYigpLmludm9pY2VzLmZpbmQoKGkpID0+IGkuaWQgPT09IHAuaW52b2ljZUlkKTtcclxuICAgICAgICBpZiAoIWludj8uYXBwb2ludG1lbnRJZCB8fCBpbnYuc3RhdHVzID09PSBcImNhbmNlbGxlZFwiIHx8IGludi5zdGF0dXMgPT09IFwicmVmdW5kZWRcIikgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGFwID0gZ2V0TW9ja0RiKCkuYXBwb2ludG1lbnRzLmZpbmQoKGEpID0+IGEuaWQgPT09IGludi5hcHBvaW50bWVudElkKTtcclxuICAgICAgICBpZiAoIWFwKSByZXR1cm47XHJcbiAgICAgICAgZG9jdG9yUmV2ZW51ZS5zZXQoYXAuZG9jdG9ySWQsIChkb2N0b3JSZXZlbnVlLmdldChhcC5kb2N0b3JJZCkgPz8gMCkgKyBuZXRQYXkocCkpO1xyXG4gICAgICB9KTtcclxuICAgICAgY29uc3QgdG9wID0gWy4uLmRvY3RvclJldmVudWUuZW50cmllcygpXS5zb3J0KChhLCBiKSA9PiBiWzFdIC0gYVsxXSlbMF07XHJcbiAgICAgIGNvbnN0IHRvdGFsUmV2ZW51ZSA9IFsuLi5kb2N0b3JSZXZlbnVlLnZhbHVlcygpXS5yZWR1Y2UoKGFjYywgdikgPT4gYWNjICsgdiwgMCk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgdG9wRG9jdG9yOiB0b3BcclxuICAgICAgICAgID8ge1xyXG4gICAgICAgICAgICAgIG5hbWU6IGdldE1vY2tEYigpLmRvY3RvcnMuZmluZCgoZCkgPT4gZC5pZCA9PT0gdG9wWzBdKT8ubmFtZSA/PyBcIuKAlFwiLFxyXG4gICAgICAgICAgICAgIHRvdGFsOiB0b3BbMV0sXHJcbiAgICAgICAgICAgICAgc2hhcmU6IHRvdGFsUmV2ZW51ZSA+IDAgPyBNYXRoLnJvdW5kKCh0b3BbMV0gLyB0b3RhbFJldmVudWUpICogMTAwMDApIC8gMTAwIDogMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgOiBudWxsLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgaWYgKGludGVudCA9PT0gXCJ0b3Bfc2VydmljZVwiKSB7XHJcbiAgICAgIGNvbnN0IHNlcnZpY2VSZXZlbnVlID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcclxuICAgICAgZ2V0TW9ja0RiKCkucGF5bWVudHMuZm9yRWFjaCgocCkgPT4ge1xyXG4gICAgICAgIGlmIChwLmRlbGV0ZWRBdCkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGludiA9IGdldE1vY2tEYigpLmludm9pY2VzLmZpbmQoKGkpID0+IGkuaWQgPT09IHAuaW52b2ljZUlkKTtcclxuICAgICAgICBpZiAoIWludj8uYXBwb2ludG1lbnRJZCB8fCBpbnYuc3RhdHVzID09PSBcImNhbmNlbGxlZFwiIHx8IGludi5zdGF0dXMgPT09IFwicmVmdW5kZWRcIikgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGFwID0gZ2V0TW9ja0RiKCkuYXBwb2ludG1lbnRzLmZpbmQoKGEpID0+IGEuaWQgPT09IGludi5hcHBvaW50bWVudElkKTtcclxuICAgICAgICBpZiAoIWFwKSByZXR1cm47XHJcbiAgICAgICAgc2VydmljZVJldmVudWUuc2V0KGFwLnNlcnZpY2VJZCwgKHNlcnZpY2VSZXZlbnVlLmdldChhcC5zZXJ2aWNlSWQpID8/IDApICsgbmV0UGF5KHApKTtcclxuICAgICAgfSk7XHJcbiAgICAgIGNvbnN0IHRvcCA9IFsuLi5zZXJ2aWNlUmV2ZW51ZS5lbnRyaWVzKCldLnNvcnQoKGEsIGIpID0+IGJbMV0gLSBhWzFdKVswXTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICB0b3BTZXJ2aWNlOiB0b3BcclxuICAgICAgICAgID8geyBuYW1lOiBnZXRNb2NrRGIoKS5zZXJ2aWNlcy5maW5kKChzKSA9PiBzLmlkID09PSB0b3BbMF0pPy5uYW1lID8/IFwi4oCUXCIsIHRvdGFsOiB0b3BbMV0gfVxyXG4gICAgICAgICAgOiBudWxsLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgaWYgKGludGVudCA9PT0gXCJjYXNoX3N0YXR1c1wiKSB7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRTaGlmdCA9IGdldE1vY2tEYigpLmNhc2hSZWdpc3RlclNoaWZ0cy5maW5kKChzKSA9PiAhcy5jbG9zZWRBdCkgPz8gbnVsbDtcclxuICAgICAgcmV0dXJuIHsgY2FzaFNoaWZ0T3BlbjogQm9vbGVhbihjdXJyZW50U2hpZnQpLCBjdXJyZW50U2hpZnQgfTtcclxuICAgIH1cclxuICAgIGlmIChpbnRlbnQgPT09IFwiaGVhbHRoXCIpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICByZXZlbnVlVG9kYXk6IHNuYXAucmV2ZW51ZVRvZGF5LFxyXG4gICAgICAgIHVucGFpZENvdW50OiBzbmFwLnVucGFpZENvdW50LFxyXG4gICAgICAgIHRvcERvY3Rvcjogc25hcC50b3BEb2N0b3JOYW1lXHJcbiAgICAgICAgICA/IHsgbmFtZTogc25hcC50b3BEb2N0b3JOYW1lLCB0b3RhbDogc25hcC50b3BEb2N0b3JUb3RhbCB9XHJcbiAgICAgICAgICA6IG51bGwsXHJcbiAgICAgICAgdG9wU2VydmljZTogc25hcC50b3BTZXJ2aWNlTmFtZVxyXG4gICAgICAgICAgPyB7IG5hbWU6IHNuYXAudG9wU2VydmljZU5hbWUsIHRvdGFsOiBzbmFwLnRvcFNlcnZpY2VUb3RhbCB9XHJcbiAgICAgICAgICA6IG51bGwsXHJcbiAgICAgICAgYXBwb2ludG1lbnRzVG9kYXk6IHNuYXAuYXBwb2ludG1lbnRzVG9kYXksXHJcbiAgICAgICAgYXZnRGFpbHlSZXZlbnVlN0RheXM6IHNuYXAuYXZnRGFpbHlSZXZlbnVlN0RheXMsXHJcbiAgICAgICAgYXZnQ2hlY2tUb2RheTogc25hcC5hdmdDaGVja1RvZGF5LFxyXG4gICAgICAgIGF2Z0NoZWNrN2Q6IHNuYXAuYXZnQ2hlY2s3ZCxcclxuICAgICAgICBub1Nob3dPckNhbmNlbGxlZDMwZDogc25hcC5ub1Nob3dPckNhbmNlbGxlZDMwZCxcclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIHJldHVybiB7fTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGJ1aWxkU3RydWN0dXJlZENvbnRleHQoc25hcHNob3Q6IENsaW5pY0ZhY3RzU25hcHNob3QpOiBQcm9taXNlPEFpQXNzaXN0YW50U3RydWN0dXJlZENvbnRleHQ+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGlmIChlbnYuZGF0YVByb3ZpZGVyID09PSBcInBvc3RncmVzXCIpIHtcclxuICAgICAgICBjb25zdCBkb2N0b3JzUm93cyA9IGF3YWl0IHRoaXMucXVlcnlQZzx7IG5hbWU6IHN0cmluZzsgc3BlY2lhbHR5OiBzdHJpbmcgfCBudWxsIH0+KFxyXG4gICAgICAgICAgYFxyXG4gICAgICAgICAgU0VMRUNUXHJcbiAgICAgICAgICAgIENPQUxFU0NFKE5VTExJRihUUklNKGZ1bGxfbmFtZSksICcnKSwgJ9CS0YDQsNGHICMnIHx8IGlkOjp0ZXh0KSBBUyBuYW1lLFxyXG4gICAgICAgICAgICBOVUxMSUYoVFJJTShzcGVjaWFsdHkpLCAnJykgQVMgc3BlY2lhbHR5XHJcbiAgICAgICAgICBGUk9NIGRvY3RvcnNcclxuICAgICAgICAgIFdIRVJFIGRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICBBTkQgQ09BTEVTQ0UoYWN0aXZlLCB0cnVlKSA9IHRydWVcclxuICAgICAgICAgIE9SREVSIEJZIGZ1bGxfbmFtZSBBU0NcclxuICAgICAgICAgIExJTUlUIDEyXHJcbiAgICAgICAgICBgXHJcbiAgICAgICAgKTtcclxuICAgICAgICBjb25zdCBzZXJ2aWNlc1Jvd3MgPSBhd2FpdCB0aGlzLnF1ZXJ5UGc8eyBuYW1lOiBzdHJpbmc7IHByaWNlOiBzdHJpbmcgfCBudWxsIH0+KFxyXG4gICAgICAgICAgYFxyXG4gICAgICAgICAgU0VMRUNUXHJcbiAgICAgICAgICAgIG5hbWUsXHJcbiAgICAgICAgICAgIENBU0UgV0hFTiBwcmljZSBJUyBOVUxMIFRIRU4gTlVMTCBFTFNFIHByaWNlOjp0ZXh0IEVORCBBUyBwcmljZVxyXG4gICAgICAgICAgRlJPTSBzZXJ2aWNlc1xyXG4gICAgICAgICAgV0hFUkUgZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIEFORCBDT0FMRVNDRShhY3RpdmUsIHRydWUpID0gdHJ1ZVxyXG4gICAgICAgICAgT1JERVIgQlkgbmFtZSBBU0NcclxuICAgICAgICAgIExJTUlUIDEyXHJcbiAgICAgICAgICBgXHJcbiAgICAgICAgKTtcclxuICAgICAgICBjb25zdCBkb2N0b3JzOiBBaUNvbnRleHREb2N0b3JJdGVtW10gPSBkb2N0b3JzUm93cy5yb3dzLm1hcCgoZCkgPT4gKHtcclxuICAgICAgICAgIG5hbWU6IGQubmFtZSxcclxuICAgICAgICAgIHNwZWNpYWx0eTogZC5zcGVjaWFsdHksXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZVNlcnZpY2VzOiBBaUNvbnRleHRTZXJ2aWNlSXRlbVtdID0gc2VydmljZXNSb3dzLnJvd3MubWFwKChzKSA9PiAoe1xyXG4gICAgICAgICAgbmFtZTogcy5uYW1lLFxyXG4gICAgICAgICAgcHJpY2U6IHMucHJpY2UgPT0gbnVsbCA/IG51bGwgOiBOdW1iZXIocy5wcmljZSksXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICByZXZlbnVlVG9kYXk6IHNuYXBzaG90LnJldmVudWVUb2RheSxcclxuICAgICAgICAgIHJldmVudWU3ZDogc25hcHNob3QucmV2ZW51ZTdkLFxyXG4gICAgICAgICAgdW5wYWlkSW52b2ljZXNDb3VudDogc25hcHNob3QudW5wYWlkQ291bnQsXHJcbiAgICAgICAgICB1bnBhaWRJbnZvaWNlc0Ftb3VudDogc25hcHNob3QudW5wYWlkVG90YWwsXHJcbiAgICAgICAgICBhcHBvaW50bWVudHNUb2RheTogc25hcHNob3QuYXBwb2ludG1lbnRzVG9kYXksXHJcbiAgICAgICAgICBjb21wbGV0ZWRUb2RheTogc25hcHNob3QuYXBwb2ludG1lbnRzQ29tcGxldGVkVG9kYXksXHJcbiAgICAgICAgICBwZW5kaW5nVG9kYXk6IHNuYXBzaG90LmFwcG9pbnRtZW50c1NjaGVkdWxlZFRvZGF5LFxyXG4gICAgICAgICAgYXZnQ2hlY2tUb2RheTogc25hcHNob3QuYXZnQ2hlY2tUb2RheSxcclxuICAgICAgICAgIGF2Z0NoZWNrN2Q6IHNuYXBzaG90LmF2Z0NoZWNrN2QsXHJcbiAgICAgICAgICB0b3BEb2N0b3I6IHNuYXBzaG90LnRvcERvY3Rvck5hbWUsXHJcbiAgICAgICAgICBjYXNoU2hpZnRTdGF0dXM6IHNuYXBzaG90LmNhc2hTaGlmdE9wZW4gPyBcIm9wZW5cIiA6IFwiY2xvc2VkXCIsXHJcbiAgICAgICAgICBub1Nob3czMGQ6IHNuYXBzaG90Lm5vU2hvd09yQ2FuY2VsbGVkMzBkLFxyXG4gICAgICAgICAgZG9jdG9ycyxcclxuICAgICAgICAgIGFjdGl2ZVNlcnZpY2VzLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGRiID0gZ2V0TW9ja0RiKCk7XHJcbiAgICAgIGNvbnN0IGRvY3RvcnM6IEFpQ29udGV4dERvY3Rvckl0ZW1bXSA9IGRiLmRvY3RvcnNcclxuICAgICAgICAuZmlsdGVyKChkKSA9PiBkLmFjdGl2ZSlcclxuICAgICAgICAuc2xpY2UoMCwgMTIpXHJcbiAgICAgICAgLm1hcCgoZCkgPT4gKHsgbmFtZTogZC5uYW1lLCBzcGVjaWFsdHk6IGQuc3BlY2lhbGl0eSB9KSk7XHJcbiAgICAgIGNvbnN0IGFjdGl2ZVNlcnZpY2VzOiBBaUNvbnRleHRTZXJ2aWNlSXRlbVtdID0gZGIuc2VydmljZXNcclxuICAgICAgICAuZmlsdGVyKChzKSA9PiBzLmFjdGl2ZSlcclxuICAgICAgICAuc2xpY2UoMCwgMTIpXHJcbiAgICAgICAgLm1hcCgocykgPT4gKHsgbmFtZTogcy5uYW1lLCBwcmljZTogTnVtYmVyKHMucHJpY2UpIH0pKTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICByZXZlbnVlVG9kYXk6IHNuYXBzaG90LnJldmVudWVUb2RheSxcclxuICAgICAgICByZXZlbnVlN2Q6IHNuYXBzaG90LnJldmVudWU3ZCxcclxuICAgICAgICB1bnBhaWRJbnZvaWNlc0NvdW50OiBzbmFwc2hvdC51bnBhaWRDb3VudCxcclxuICAgICAgICB1bnBhaWRJbnZvaWNlc0Ftb3VudDogc25hcHNob3QudW5wYWlkVG90YWwsXHJcbiAgICAgICAgYXBwb2ludG1lbnRzVG9kYXk6IHNuYXBzaG90LmFwcG9pbnRtZW50c1RvZGF5LFxyXG4gICAgICAgIGNvbXBsZXRlZFRvZGF5OiBzbmFwc2hvdC5hcHBvaW50bWVudHNDb21wbGV0ZWRUb2RheSxcclxuICAgICAgICBwZW5kaW5nVG9kYXk6IHNuYXBzaG90LmFwcG9pbnRtZW50c1NjaGVkdWxlZFRvZGF5LFxyXG4gICAgICAgIGF2Z0NoZWNrVG9kYXk6IHNuYXBzaG90LmF2Z0NoZWNrVG9kYXksXHJcbiAgICAgICAgYXZnQ2hlY2s3ZDogc25hcHNob3QuYXZnQ2hlY2s3ZCxcclxuICAgICAgICB0b3BEb2N0b3I6IHNuYXBzaG90LnRvcERvY3Rvck5hbWUsXHJcbiAgICAgICAgY2FzaFNoaWZ0U3RhdHVzOiBzbmFwc2hvdC5jYXNoU2hpZnRPcGVuID8gXCJvcGVuXCIgOiBcImNsb3NlZFwiLFxyXG4gICAgICAgIG5vU2hvdzMwZDogc25hcHNob3Qubm9TaG93T3JDYW5jZWxsZWQzMGQsXHJcbiAgICAgICAgZG9jdG9ycyxcclxuICAgICAgICBhY3RpdmVTZXJ2aWNlcyxcclxuICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJbQUkgRkFDVCBCVUlMREVSXSBidWlsZFN0cnVjdHVyZWRDb250ZXh0IGZhaWxlZFwiLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgcmV2ZW51ZVRvZGF5OiBzbmFwc2hvdC5yZXZlbnVlVG9kYXksXHJcbiAgICAgICAgcmV2ZW51ZTdkOiBzbmFwc2hvdC5yZXZlbnVlN2QsXHJcbiAgICAgICAgdW5wYWlkSW52b2ljZXNDb3VudDogc25hcHNob3QudW5wYWlkQ291bnQsXHJcbiAgICAgICAgdW5wYWlkSW52b2ljZXNBbW91bnQ6IHNuYXBzaG90LnVucGFpZFRvdGFsLFxyXG4gICAgICAgIGFwcG9pbnRtZW50c1RvZGF5OiBzbmFwc2hvdC5hcHBvaW50bWVudHNUb2RheSxcclxuICAgICAgICBjb21wbGV0ZWRUb2RheTogc25hcHNob3QuYXBwb2ludG1lbnRzQ29tcGxldGVkVG9kYXksXHJcbiAgICAgICAgcGVuZGluZ1RvZGF5OiBzbmFwc2hvdC5hcHBvaW50bWVudHNTY2hlZHVsZWRUb2RheSxcclxuICAgICAgICBhdmdDaGVja1RvZGF5OiBzbmFwc2hvdC5hdmdDaGVja1RvZGF5LFxyXG4gICAgICAgIGF2Z0NoZWNrN2Q6IHNuYXBzaG90LmF2Z0NoZWNrN2QsXHJcbiAgICAgICAgdG9wRG9jdG9yOiBzbmFwc2hvdC50b3BEb2N0b3JOYW1lLFxyXG4gICAgICAgIGNhc2hTaGlmdFN0YXR1czogc25hcHNob3QuY2FzaFNoaWZ0T3BlbiA/IFwib3BlblwiIDogXCJjbG9zZWRcIixcclxuICAgICAgICBub1Nob3czMGQ6IHNuYXBzaG90Lm5vU2hvd09yQ2FuY2VsbGVkMzBkLFxyXG4gICAgICAgIGRvY3RvcnM6IFtdLFxyXG4gICAgICAgIGFjdGl2ZVNlcnZpY2VzOiBbXSxcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGVucmljaERhdGEoaW50ZW50OiBBaURhdGFJbnRlbnQsIGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gICAgY29uc3QgbmV4dCA9IHsgLi4uZGF0YSB9IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xyXG4gICAgaWYgKGludGVudCA9PT0gXCJyZXZlbnVlXCIpIHtcclxuICAgICAgY29uc3QgdG90YWwgPSBOdW1iZXIobmV4dC50b3RhbCA/PyBuZXh0LnJldmVudWVUb2RheSA/PyAwKTtcclxuICAgICAgY29uc3QgcGN0ID0gTnVtYmVyKG5leHQucGF5bWVudHNDb3VudFRvZGF5ID8/IDApO1xyXG4gICAgICBpZiAodG90YWwgPT09IDAgJiYgcGN0ID09PSAwKSBuZXh0Lm5vdGUgPSBcIm5vX3BheW1lbnRzX3RvZGF5XCI7XHJcbiAgICB9XHJcbiAgICBpZiAoaW50ZW50ID09PSBcInRvcF9kb2N0b3JcIikge1xyXG4gICAgICBjb25zdCB0b3BEb2N0b3IgPSAobmV4dC50b3BEb2N0b3IgPz8gbnVsbCkgYXMgeyBzaGFyZT86IG51bWJlciB9IHwgbnVsbDtcclxuICAgICAgY29uc3Qgc2hhcmUgPSBOdW1iZXIodG9wRG9jdG9yPy5zaGFyZSA/PyAwKTtcclxuICAgICAgaWYgKHNoYXJlID4gODApIG5leHQucmlzayA9IFwi0J7QtNC40L0g0LLRgNCw0Ycg0LPQtdC90LXRgNC40YDRg9C10YIg0L/QvtGH0YLQuCDQstGB0Y4g0LLRi9GA0YPRh9C60YNcIjtcclxuICAgIH1cclxuICAgIGlmIChpbnRlbnQgPT09IFwidW5wYWlkXCIpIHtcclxuICAgICAgY29uc3QgY291bnQgPSBOdW1iZXIobmV4dC5jb3VudCA/PyBuZXh0LnVucGFpZENvdW50ID8/IDApO1xyXG4gICAgICBpZiAoY291bnQgPiAwKSBuZXh0LnByb2JsZW0gPSBcItCV0YHRgtGMINC90LXQvtC/0LvQsNGH0LXQvdC90YvQtSDRgdGH0LXRgtCwXCI7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbmV4dDtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG5ldFBheShwOiB7IGFtb3VudDogbnVtYmVyOyByZWZ1bmRlZEFtb3VudD86IG51bWJlciB9KTogbnVtYmVyIHtcclxuICByZXR1cm4gTWF0aC5tYXgoMCwgcC5hbW91bnQgLSAocC5yZWZ1bmRlZEFtb3VudCA/PyAwKSk7XHJcbn1cclxuIl19