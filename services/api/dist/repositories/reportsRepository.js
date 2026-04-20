"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockReportsRepository = void 0;
const env_1 = require("../config/env");
const billingTypes_1 = require("./interfaces/billingTypes");
const mockDatabase_1 = require("./mockDatabase");
/** East-of-UTC offset hours for mock-only date math when IANA TZ is not mapped (aligns with Asia/Tashkent default). */
const TZ_OFFSET_HOURS = {
    "Asia/Tashkent": 5,
    UTC: 0,
    "Etc/UTC": 0,
};
const offsetHoursForReports = () => TZ_OFFSET_HOURS[env_1.env.reportsTimezone] ?? TZ_OFFSET_HOURS["Asia/Tashkent"];
const isDateOnly = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
const localMidnightUtcMs = (ymd, offsetH) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return Date.UTC(y, m - 1, d) - offsetH * 3600000;
};
const localEndExclusiveUtcMs = (ymd, offsetH) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return Date.UTC(y, m - 1, d + 1) - offsetH * 3600000;
};
const parseBounds = (range) => {
    const offsetH = offsetHoursForReports();
    const df = range.dateFrom?.trim();
    const dt = range.dateTo?.trim();
    const out = {};
    if (df) {
        out.fromInclusive = isDateOnly(df) ? localMidnightUtcMs(df, offsetH) : Date.parse(df);
    }
    if (dt) {
        if (isDateOnly(dt)) {
            out.toExclusive = localEndExclusiveUtcMs(dt, offsetH);
        }
        else {
            out.toInclusive = Date.parse(dt);
        }
    }
    return out;
};
const paymentInBounds = (createdAtIso, b) => {
    const ts = Date.parse(createdAtIso);
    if (b.fromInclusive !== undefined && ts < b.fromInclusive)
        return false;
    if (b.toExclusive !== undefined && ts >= b.toExclusive)
        return false;
    if (b.toInclusive !== undefined && ts > b.toInclusive)
        return false;
    return true;
};
const ymdInReportZone = (utcMs, offsetH) => {
    const shifted = utcMs + offsetH * 3600000;
    const d = new Date(shifted);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};
const mondayWeekStartYmd = (ymd) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d);
    const dow = new Date(t).getUTCDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(t + mondayOffset * 86400000);
    const yy = mon.getUTCFullYear();
    const mm = String(mon.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(mon.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
};
const monthStartYmd = (ymd) => `${ymd.slice(0, 7)}-01`;
const periodKey = (utcMs, granularity, offsetH) => {
    const ymd = ymdInReportZone(utcMs, offsetH);
    if (granularity === "day")
        return ymd;
    if (granularity === "month")
        return monthStartYmd(ymd);
    return mondayWeekStartYmd(ymd);
};
const effectivePaymentContribution = (p) => {
    if (p.deletedAt)
        return 0;
    const ref = p.refundedAmount ?? 0;
    return Math.max(0, p.amount - ref);
};
const round2 = (x) => Math.round(x * 100) / 100;
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
class MockReportsRepository {
    async getRevenueReport(granularity, range) {
        const b = parseBounds(range);
        const offsetH = offsetHoursForReports();
        const grouped = new Map();
        for (const payment of (0, mockDatabase_1.getMockDb)().payments) {
            if (payment.deletedAt)
                continue;
            if (!paymentInBounds(payment.createdAt, b))
                continue;
            const inv = (0, mockDatabase_1.getMockDb)().invoices.find((i) => i.id === payment.invoiceId);
            if (!inv || inv.deletedAt || inv.status === "cancelled" || inv.status === "refunded")
                continue;
            const key = periodKey(Date.parse(payment.createdAt), granularity, offsetH);
            grouped.set(key, (grouped.get(key) ?? 0) + effectivePaymentContribution(payment));
        }
        return [...grouped.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([periodStart, totalRevenue]) => ({ periodStart, totalRevenue }));
    }
    async getPaymentsByMethodReport(range) {
        const b = parseBounds(range);
        const grouped = new Map();
        for (const payment of (0, mockDatabase_1.getMockDb)().payments) {
            if (payment.deletedAt)
                continue;
            if (!paymentInBounds(payment.createdAt, b))
                continue;
            const inv = (0, mockDatabase_1.getMockDb)().invoices.find((i) => i.id === payment.invoiceId);
            if (!inv || inv.deletedAt || inv.status === "cancelled" || inv.status === "refunded")
                continue;
            const m = (0, billingTypes_1.normalizePaymentMethod)(String(payment.method));
            grouped.set(m, (grouped.get(m) ?? 0) + effectivePaymentContribution(payment));
        }
        return [...grouped.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([method, totalAmount]) => ({ method, totalAmount }));
    }
    async getInvoicesStatusSummaryReport(range) {
        const b = parseBounds(range);
        const grouped = new Map();
        for (const invoice of (0, mockDatabase_1.getMockDb)().invoices) {
            if (invoice.deletedAt)
                continue;
            if (!paymentInBounds(invoice.createdAt, b))
                continue;
            const prev = grouped.get(invoice.status) ?? { count: 0, totalAmount: 0 };
            grouped.set(invoice.status, {
                count: prev.count + 1,
                totalAmount: prev.totalAmount + invoice.total,
            });
        }
        return [...grouped.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([status, values]) => ({
            status,
            count: values.count,
            totalAmount: values.totalAmount,
        }));
    }
    async getRevenueByDoctor(range) {
        const b = parseBounds(range);
        const db = (0, mockDatabase_1.getMockDb)();
        const invMap = new Map(db.invoices.map((i) => [i.id, i]));
        const apMap = new Map(db.appointments.map((a) => [a.id, a]));
        const grouped = new Map();
        for (const payment of db.payments) {
            if (payment.deletedAt)
                continue;
            if (!paymentInBounds(payment.createdAt, b))
                continue;
            const inv = invMap.get(payment.invoiceId);
            if (!inv || inv.deletedAt || inv.status === "cancelled" || inv.status === "refunded")
                continue;
            const apId = inv.appointmentId;
            const doctorId = apId != null ? apMap.get(apId)?.doctorId ?? null : null;
            grouped.set(doctorId, (grouped.get(doctorId) ?? 0) + effectivePaymentContribution(payment));
        }
        const doctorName = (id) => {
            if (id == null)
                return "Без записи";
            return db.doctors.find((d) => d.id === id)?.name ?? "—";
        };
        return [...grouped.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([doctorId, totalRevenue]) => ({
            doctorId,
            doctorName: doctorName(doctorId),
            totalRevenue,
        }));
    }
    async getRevenueByService(range) {
        const b = parseBounds(range);
        const db = (0, mockDatabase_1.getMockDb)();
        const invMap = new Map(db.invoices.map((i) => [i.id, i]));
        const apMap = new Map(db.appointments.map((a) => [a.id, a]));
        const grouped = new Map();
        for (const payment of db.payments) {
            if (payment.deletedAt)
                continue;
            if (!paymentInBounds(payment.createdAt, b))
                continue;
            const inv = invMap.get(payment.invoiceId);
            if (!inv || inv.deletedAt || inv.status === "cancelled" || inv.status === "refunded")
                continue;
            const apId = inv.appointmentId;
            const serviceId = apId != null ? apMap.get(apId)?.serviceId ?? null : null;
            grouped.set(serviceId, (grouped.get(serviceId) ?? 0) + effectivePaymentContribution(payment));
        }
        const serviceName = (id) => {
            if (id == null)
                return "Без записи";
            return db.services.find((s) => s.id === id)?.name ?? "—";
        };
        return [...grouped.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([serviceId, totalRevenue]) => ({
            serviceId,
            serviceName: serviceName(serviceId),
            totalRevenue,
        }));
    }
    async getReportMetrics(range) {
        const b = parseBounds(range);
        const db = (0, mockDatabase_1.getMockDb)();
        let totalPaymentsAmount = 0;
        let paymentsCount = 0;
        for (const payment of db.payments) {
            if (payment.deletedAt)
                continue;
            if (!paymentInBounds(payment.createdAt, b))
                continue;
            const inv = db.invoices.find((i) => i.id === payment.invoiceId);
            if (!inv || inv.deletedAt || inv.status === "cancelled" || inv.status === "refunded")
                continue;
            const amount = effectivePaymentContribution(payment);
            totalPaymentsAmount += amount;
            if (amount > 0)
                paymentsCount += 1;
        }
        let appointmentsCount = 0;
        for (const a of db.appointments) {
            if (!paymentInBounds(a.startAt, b))
                continue;
            appointmentsCount += 1;
        }
        return { totalPaymentsAmount, paymentsCount, appointmentsCount };
    }
    async getReportsSummary() {
        const tz = env_1.env.reportsTimezone;
        const offsetH = offsetHoursForReports();
        const todayYmd = formatYmdInTimeZone(new Date(), tz);
        const yestYmd = addDaysYmd(todayYmd, -1);
        const weekStartYmd = mondayWeekStartYmd(todayYmd);
        const prevWeekStartYmd = addDaysYmd(weekStartYmd, -7);
        const prevWeekEndYmd = addDaysYmd(todayYmd, -7);
        const firstOfMonthYmd = monthStartYmd(todayYmd);
        const windowStartYmd = addDaysYmd(todayYmd, -29);
        const db = (0, mockDatabase_1.getMockDb)();
        const invMap = new Map(db.invoices.map((i) => [i.id, i]));
        const apMap = new Map(db.appointments.map((a) => [a.id, a]));
        let revenueToday = 0;
        let revenueYesterday = 0;
        let revenueWeek = 0;
        let revenuePreviousWeek = 0;
        let revenueMonth = 0;
        const byDayMap = new Map();
        const byDoctorMap = new Map();
        const byServiceAgg = new Map();
        for (const payment of db.payments) {
            if (payment.deletedAt)
                continue;
            const inv = invMap.get(payment.invoiceId);
            if (!inv || inv.deletedAt || inv.status === "cancelled" || inv.status === "refunded")
                continue;
            const n = effectivePaymentContribution(payment);
            const ymd = ymdInReportZone(Date.parse(payment.createdAt), offsetH);
            if (ymd === todayYmd)
                revenueToday += n;
            if (ymd === yestYmd)
                revenueYesterday += n;
            if (ymd >= weekStartYmd && ymd <= todayYmd)
                revenueWeek += n;
            if (ymd >= prevWeekStartYmd && ymd <= prevWeekEndYmd)
                revenuePreviousWeek += n;
            if (ymd >= firstOfMonthYmd && ymd <= todayYmd)
                revenueMonth += n;
            if (ymd < windowStartYmd || ymd > todayYmd)
                continue;
            byDayMap.set(ymd, (byDayMap.get(ymd) ?? 0) + n);
            const ap = inv.appointmentId != null ? apMap.get(inv.appointmentId) : undefined;
            const doctorName = ap != null ? db.doctors.find((d) => d.id === ap.doctorId)?.name ?? "—" : "Без записи";
            byDoctorMap.set(doctorName, (byDoctorMap.get(doctorName) ?? 0) + n);
            const items = db.invoiceItems.filter((ii) => ii.invoiceId === inv.id);
            const linesSum = items.reduce((s, ii) => s + ii.lineTotal, 0);
            if (linesSum > 0) {
                for (const ii of items) {
                    const serviceName = ii.serviceId != null
                        ? db.services.find((s) => s.id === ii.serviceId)?.name ?? "—"
                        : "Без услуги";
                    const share = n * (ii.lineTotal / linesSum);
                    const cur = byServiceAgg.get(serviceName) ?? { amount: 0, lineIds: new Set() };
                    cur.amount += share;
                    cur.lineIds.add(ii.id);
                    byServiceAgg.set(serviceName, cur);
                }
            }
        }
        const revenueByDay = [];
        for (let i = 0; i < 30; i += 1) {
            const d = addDaysYmd(windowStartYmd, i);
            if (d > todayYmd)
                break;
            revenueByDay.push({ date: d, amount: round2(byDayMap.get(d) ?? 0) });
        }
        const revenueByDoctor = [...byDoctorMap.entries()]
            .map(([doctorName, amount]) => ({ doctorName, amount: round2(amount) }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
        const revenueByService = [...byServiceAgg.entries()]
            .map(([serviceName, v]) => ({
            serviceName,
            amount: round2(v.amount),
            count: v.lineIds.size,
        }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
        return {
            revenueToday: round2(revenueToday),
            revenueYesterday: round2(revenueYesterday),
            revenueWeek: round2(revenueWeek),
            revenuePreviousWeek: round2(revenuePreviousWeek),
            revenueMonth: round2(revenueMonth),
            revenueByDay,
            revenueByDoctor,
            revenueByService,
        };
    }
    async getRecommendationsAnalytics() {
        const tz = env_1.env.reportsTimezone;
        const dateTo = formatYmdInTimeZone(new Date(), tz);
        const dateFrom = addDaysYmd(dateTo, -6);
        const emptyRange = {};
        const [metrics, byDoctor, byService, points] = await Promise.all([
            this.getReportMetrics(emptyRange),
            this.getRevenueByDoctor(emptyRange),
            this.getRevenueByService(emptyRange),
            this.getRevenueReport("day", { dateFrom, dateTo }),
        ]);
        const db = (0, mockDatabase_1.getMockDb)();
        let qualifyingPaymentsCount = 0;
        for (const payment of db.payments) {
            if (payment.deletedAt)
                continue;
            const inv = db.invoices.find((i) => i.id === payment.invoiceId);
            if (!inv || inv.deletedAt || inv.status === "cancelled" || inv.status === "refunded")
                continue;
            qualifyingPaymentsCount += 1;
        }
        const bToday = parseBounds({ dateFrom: dateTo, dateTo });
        let revenueToday = 0;
        for (const payment of db.payments) {
            if (payment.deletedAt)
                continue;
            if (!paymentInBounds(payment.createdAt, bToday))
                continue;
            const inv = db.invoices.find((i) => i.id === payment.invoiceId);
            if (!inv || inv.deletedAt || inv.status === "cancelled" || inv.status === "refunded")
                continue;
            revenueToday += effectivePaymentContribution(payment);
        }
        let unpaidInvoicesCount = 0;
        for (const inv of db.invoices) {
            if (inv.deletedAt)
                continue;
            if (inv.status === "issued" || inv.status === "partially_paid")
                unpaidInvoicesCount += 1;
        }
        const pointMap = new Map(points.map((p) => [p.periodStart, p.totalRevenue]));
        const dailyRevenueLast7Days = [];
        for (let i = 6; i >= 0; i -= 1) {
            const ymd = addDaysYmd(dateTo, -i);
            dailyRevenueLast7Days.push(pointMap.get(ymd) ?? 0);
        }
        const topD = byDoctor[0];
        const topS = byService[0];
        const topDoctor = topD && (topD.totalRevenue > 0 || topD.doctorName)
            ? { name: topD.doctorName ?? "—", revenue: topD.totalRevenue }
            : null;
        const topService = topS && (topS.totalRevenue > 0 || topS.serviceName)
            ? { name: topS.serviceName ?? "—", revenue: topS.totalRevenue }
            : null;
        const thirtyDaysAgo = Date.now() - 30 * 86400000;
        const apptByDoctor = new Map();
        for (const a of db.appointments) {
            if (Date.parse(a.startAt) < thirtyDaysAgo)
                continue;
            apptByDoctor.set(a.doctorId, (apptByDoctor.get(a.doctorId) ?? 0) + 1);
        }
        const totalAppts = [...apptByDoctor.values()].reduce((s, n) => s + n, 0);
        const doctorLoads = [];
        if (totalAppts > 0) {
            const sorted = [...apptByDoctor.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
            for (const [doctorId, cnt] of sorted) {
                const name = db.doctors.find((d) => d.id === doctorId)?.name ?? `Врач #${doctorId}`;
                doctorLoads.push({
                    doctorName: name,
                    loadPct: Math.round((cnt / totalAppts) * 1000) / 10,
                });
            }
        }
        return {
            qualifyingPaymentsCount,
            revenueTotal: metrics.totalPaymentsAmount,
            revenueToday,
            topDoctor,
            topService,
            unpaidInvoicesCount,
            dailyRevenueLast7Days,
            doctorLoads,
        };
    }
}
exports.MockReportsRepository = MockReportsRepository;
