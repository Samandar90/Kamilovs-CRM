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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvcmVwb3NpdG9yaWVzL3JlcG9ydHNSZXBvc2l0b3J5LnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9yZXBvc2l0b3JpZXMvcmVwb3J0c1JlcG9zaXRvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsdUNBQW9DO0FBY3BDLDREQUFtRTtBQUNuRSxpREFBMkM7QUFVM0MsdUhBQXVIO0FBQ3ZILE1BQU0sZUFBZSxHQUEyQjtJQUM5QyxlQUFlLEVBQUUsQ0FBQztJQUNsQixHQUFHLEVBQUUsQ0FBQztJQUNOLFNBQVMsRUFBRSxDQUFDO0NBQ2IsQ0FBQztBQUVGLE1BQU0scUJBQXFCLEdBQUcsR0FBVyxFQUFFLENBQ3pDLGVBQWUsQ0FBQyxTQUFHLENBQUMsZUFBZSxDQUFDLElBQUksZUFBZSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBRTNFLE1BQU0sVUFBVSxHQUFHLENBQUMsQ0FBUyxFQUFXLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7QUFFaEYsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEdBQVcsRUFBRSxPQUFlLEVBQVUsRUFBRTtJQUNsRSxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM3QyxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsT0FBTyxHQUFHLE9BQVMsQ0FBQztBQUNyRCxDQUFDLENBQUM7QUFFRixNQUFNLHNCQUFzQixHQUFHLENBQUMsR0FBVyxFQUFFLE9BQWUsRUFBVSxFQUFFO0lBQ3RF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bmZpZy9lbnZcIjtcclxuaW1wb3J0IHR5cGUgeyBJUmVwb3J0c1JlcG9zaXRvcnkgfSBmcm9tIFwiLi9pbnRlcmZhY2VzL0lSZXBvcnRzUmVwb3NpdG9yeVwiO1xyXG5pbXBvcnQgdHlwZSB7IFJlY29tbWVuZGF0aW9uc0FuYWx5dGljc0RhdGEgfSBmcm9tIFwiLi9pbnRlcmZhY2VzL2FpUmVjb21tZW5kYXRpb25zVHlwZXNcIjtcclxuaW1wb3J0IHR5cGUge1xyXG4gIEludm9pY2VTdGF0dXNTdW1tYXJ5Um93LFxyXG4gIFBheW1lbnRzQnlNZXRob2RSb3csXHJcbiAgUmVwb3J0TWV0cmljcyxcclxuICBSZXBvcnRzRGF0ZVJhbmdlLFxyXG4gIFJlcG9ydHNHcmFudWxhcml0eSxcclxuICBSZXBvcnRzU3VtbWFyeURhdGEsXHJcbiAgUmV2ZW51ZUJ5RG9jdG9yUm93LFxyXG4gIFJldmVudWVCeVNlcnZpY2VSb3csXHJcbiAgUmV2ZW51ZVBvaW50LFxyXG59IGZyb20gXCIuL2ludGVyZmFjZXMvYmlsbGluZ1R5cGVzXCI7XHJcbmltcG9ydCB7IG5vcm1hbGl6ZVBheW1lbnRNZXRob2QgfSBmcm9tIFwiLi9pbnRlcmZhY2VzL2JpbGxpbmdUeXBlc1wiO1xyXG5pbXBvcnQgeyBnZXRNb2NrRGIgfSBmcm9tIFwiLi9tb2NrRGF0YWJhc2VcIjtcclxuXHJcbmV4cG9ydCB0eXBlIHtcclxuICBJbnZvaWNlU3RhdHVzU3VtbWFyeVJvdyxcclxuICBQYXltZW50c0J5TWV0aG9kUm93LFxyXG4gIFJlcG9ydHNEYXRlUmFuZ2UsXHJcbiAgUmVwb3J0c0dyYW51bGFyaXR5LFxyXG4gIFJldmVudWVQb2ludCxcclxufTtcclxuXHJcbi8qKiBFYXN0LW9mLVVUQyBvZmZzZXQgaG91cnMgZm9yIG1vY2stb25seSBkYXRlIG1hdGggd2hlbiBJQU5BIFRaIGlzIG5vdCBtYXBwZWQgKGFsaWducyB3aXRoIEFzaWEvVGFzaGtlbnQgZGVmYXVsdCkuICovXHJcbmNvbnN0IFRaX09GRlNFVF9IT1VSUzogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHtcclxuICBcIkFzaWEvVGFzaGtlbnRcIjogNSxcclxuICBVVEM6IDAsXHJcbiAgXCJFdGMvVVRDXCI6IDAsXHJcbn07XHJcblxyXG5jb25zdCBvZmZzZXRIb3Vyc0ZvclJlcG9ydHMgPSAoKTogbnVtYmVyID0+XHJcbiAgVFpfT0ZGU0VUX0hPVVJTW2Vudi5yZXBvcnRzVGltZXpvbmVdID8/IFRaX09GRlNFVF9IT1VSU1tcIkFzaWEvVGFzaGtlbnRcIl07XHJcblxyXG5jb25zdCBpc0RhdGVPbmx5ID0gKHM6IHN0cmluZyk6IGJvb2xlYW4gPT4gL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvLnRlc3Qocy50cmltKCkpO1xyXG5cclxuY29uc3QgbG9jYWxNaWRuaWdodFV0Y01zID0gKHltZDogc3RyaW5nLCBvZmZzZXRIOiBudW1iZXIpOiBudW1iZXIgPT4ge1xyXG4gIGNvbnN0IFt5LCBtLCBkXSA9IHltZC5zcGxpdChcIi1cIikubWFwKE51bWJlcik7XHJcbiAgcmV0dXJuIERhdGUuVVRDKHksIG0gLSAxLCBkKSAtIG9mZnNldEggKiAzXzYwMF8wMDA7XHJcbn07XHJcblxyXG5jb25zdCBsb2NhbEVuZEV4Y2x1c2l2ZVV0Y01zID0gKHltZDogc3RyaW5nLCBvZmZzZXRIOiBudW1iZXIpOiBudW1iZXIgPT4ge1xyXG4gIGNvbnN0IFt5LCBtLCBkXSA9IHltZC5zcGxpdChcIi1cIikubWFwKE51bWJlcik7XHJcbiAgcmV0dXJuIERhdGUuVVRDKHksIG0gLSAxLCBkICsgMSkgLSBvZmZzZXRIICogM182MDBfMDAwO1xyXG59O1xyXG5cclxudHlwZSBQYXJzZWRCb3VuZHMgPSB7XHJcbiAgZnJvbUluY2x1c2l2ZT86IG51bWJlcjtcclxuICB0b0V4Y2x1c2l2ZT86IG51bWJlcjtcclxuICB0b0luY2x1c2l2ZT86IG51bWJlcjtcclxufTtcclxuXHJcbmNvbnN0IHBhcnNlQm91bmRzID0gKHJhbmdlOiBSZXBvcnRzRGF0ZVJhbmdlKTogUGFyc2VkQm91bmRzID0+IHtcclxuICBjb25zdCBvZmZzZXRIID0gb2Zmc2V0SG91cnNGb3JSZXBvcnRzKCk7XHJcbiAgY29uc3QgZGYgPSByYW5nZS5kYXRlRnJvbT8udHJpbSgpO1xyXG4gIGNvbnN0IGR0ID0gcmFuZ2UuZGF0ZVRvPy50cmltKCk7XHJcbiAgY29uc3Qgb3V0OiBQYXJzZWRCb3VuZHMgPSB7fTtcclxuICBpZiAoZGYpIHtcclxuICAgIG91dC5mcm9tSW5jbHVzaXZlID0gaXNEYXRlT25seShkZikgPyBsb2NhbE1pZG5pZ2h0VXRjTXMoZGYsIG9mZnNldEgpIDogRGF0ZS5wYXJzZShkZik7XHJcbiAgfVxyXG4gIGlmIChkdCkge1xyXG4gICAgaWYgKGlzRGF0ZU9ubHkoZHQpKSB7XHJcbiAgICAgIG91dC50b0V4Y2x1c2l2ZSA9IGxvY2FsRW5kRXhjbHVzaXZlVXRjTXMoZHQsIG9mZnNldEgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgb3V0LnRvSW5jbHVzaXZlID0gRGF0ZS5wYXJzZShkdCk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBvdXQ7XHJcbn07XHJcblxyXG5jb25zdCBwYXltZW50SW5Cb3VuZHMgPSAoY3JlYXRlZEF0SXNvOiBzdHJpbmcsIGI6IFBhcnNlZEJvdW5kcyk6IGJvb2xlYW4gPT4ge1xyXG4gIGNvbnN0IHRzID0gRGF0ZS5wYXJzZShjcmVhdGVkQXRJc28pO1xyXG4gIGlmIChiLmZyb21JbmNsdXNpdmUgIT09IHVuZGVmaW5lZCAmJiB0cyA8IGIuZnJvbUluY2x1c2l2ZSkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmIChiLnRvRXhjbHVzaXZlICE9PSB1bmRlZmluZWQgJiYgdHMgPj0gYi50b0V4Y2x1c2l2ZSkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmIChiLnRvSW5jbHVzaXZlICE9PSB1bmRlZmluZWQgJiYgdHMgPiBiLnRvSW5jbHVzaXZlKSByZXR1cm4gZmFsc2U7XHJcbiAgcmV0dXJuIHRydWU7XHJcbn07XHJcblxyXG5jb25zdCB5bWRJblJlcG9ydFpvbmUgPSAodXRjTXM6IG51bWJlciwgb2Zmc2V0SDogbnVtYmVyKTogc3RyaW5nID0+IHtcclxuICBjb25zdCBzaGlmdGVkID0gdXRjTXMgKyBvZmZzZXRIICogM182MDBfMDAwO1xyXG4gIGNvbnN0IGQgPSBuZXcgRGF0ZShzaGlmdGVkKTtcclxuICBjb25zdCB5ID0gZC5nZXRVVENGdWxsWWVhcigpO1xyXG4gIGNvbnN0IG0gPSBTdHJpbmcoZC5nZXRVVENNb250aCgpICsgMSkucGFkU3RhcnQoMiwgXCIwXCIpO1xyXG4gIGNvbnN0IGRheSA9IFN0cmluZyhkLmdldFVUQ0RhdGUoKSkucGFkU3RhcnQoMiwgXCIwXCIpO1xyXG4gIHJldHVybiBgJHt5fS0ke219LSR7ZGF5fWA7XHJcbn07XHJcblxyXG5jb25zdCBtb25kYXlXZWVrU3RhcnRZbWQgPSAoeW1kOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xyXG4gIGNvbnN0IFt5LCBtLCBkXSA9IHltZC5zcGxpdChcIi1cIikubWFwKE51bWJlcik7XHJcbiAgY29uc3QgdCA9IERhdGUuVVRDKHksIG0gLSAxLCBkKTtcclxuICBjb25zdCBkb3cgPSBuZXcgRGF0ZSh0KS5nZXRVVENEYXkoKTtcclxuICBjb25zdCBtb25kYXlPZmZzZXQgPSBkb3cgPT09IDAgPyAtNiA6IDEgLSBkb3c7XHJcbiAgY29uc3QgbW9uID0gbmV3IERhdGUodCArIG1vbmRheU9mZnNldCAqIDg2XzQwMF8wMDApO1xyXG4gIGNvbnN0IHl5ID0gbW9uLmdldFVUQ0Z1bGxZZWFyKCk7XHJcbiAgY29uc3QgbW0gPSBTdHJpbmcobW9uLmdldFVUQ01vbnRoKCkgKyAxKS5wYWRTdGFydCgyLCBcIjBcIik7XHJcbiAgY29uc3QgZGQgPSBTdHJpbmcobW9uLmdldFVUQ0RhdGUoKSkucGFkU3RhcnQoMiwgXCIwXCIpO1xyXG4gIHJldHVybiBgJHt5eX0tJHttbX0tJHtkZH1gO1xyXG59O1xyXG5cclxuY29uc3QgbW9udGhTdGFydFltZCA9ICh5bWQ6IHN0cmluZyk6IHN0cmluZyA9PiBgJHt5bWQuc2xpY2UoMCwgNyl9LTAxYDtcclxuXHJcbmNvbnN0IHBlcmlvZEtleSA9ICh1dGNNczogbnVtYmVyLCBncmFudWxhcml0eTogUmVwb3J0c0dyYW51bGFyaXR5LCBvZmZzZXRIOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xyXG4gIGNvbnN0IHltZCA9IHltZEluUmVwb3J0Wm9uZSh1dGNNcywgb2Zmc2V0SCk7XHJcbiAgaWYgKGdyYW51bGFyaXR5ID09PSBcImRheVwiKSByZXR1cm4geW1kO1xyXG4gIGlmIChncmFudWxhcml0eSA9PT0gXCJtb250aFwiKSByZXR1cm4gbW9udGhTdGFydFltZCh5bWQpO1xyXG4gIHJldHVybiBtb25kYXlXZWVrU3RhcnRZbWQoeW1kKTtcclxufTtcclxuXHJcbmNvbnN0IGVmZmVjdGl2ZVBheW1lbnRDb250cmlidXRpb24gPSAocDoge1xyXG4gIGFtb3VudDogbnVtYmVyO1xyXG4gIHJlZnVuZGVkQW1vdW50PzogbnVtYmVyO1xyXG4gIGRlbGV0ZWRBdDogc3RyaW5nIHwgbnVsbDtcclxufSk6IG51bWJlciA9PiB7XHJcbiAgaWYgKHAuZGVsZXRlZEF0KSByZXR1cm4gMDtcclxuICBjb25zdCByZWYgPSBwLnJlZnVuZGVkQW1vdW50ID8/IDA7XHJcbiAgcmV0dXJuIE1hdGgubWF4KDAsIHAuYW1vdW50IC0gcmVmKTtcclxufTtcclxuXHJcbmNvbnN0IHJvdW5kMiA9ICh4OiBudW1iZXIpOiBudW1iZXIgPT4gTWF0aC5yb3VuZCh4ICogMTAwKSAvIDEwMDtcclxuXHJcbmNvbnN0IGZvcm1hdFltZEluVGltZVpvbmUgPSAoaXNvTm93OiBEYXRlLCB0aW1lWm9uZTogc3RyaW5nKTogc3RyaW5nID0+XHJcbiAgbmV3IEludGwuRGF0ZVRpbWVGb3JtYXQoXCJlbi1DQVwiLCB7XHJcbiAgICB0aW1lWm9uZSxcclxuICAgIHllYXI6IFwibnVtZXJpY1wiLFxyXG4gICAgbW9udGg6IFwiMi1kaWdpdFwiLFxyXG4gICAgZGF5OiBcIjItZGlnaXRcIixcclxuICB9KS5mb3JtYXQoaXNvTm93KTtcclxuXHJcbmNvbnN0IGFkZERheXNZbWQgPSAoeW1kOiBzdHJpbmcsIGRlbHRhRGF5czogbnVtYmVyKTogc3RyaW5nID0+IHtcclxuICBjb25zdCBbeSwgbSwgZF0gPSB5bWQuc3BsaXQoXCItXCIpLm1hcChOdW1iZXIpO1xyXG4gIGNvbnN0IHQgPSBEYXRlLlVUQyh5LCBtIC0gMSwgZCkgKyBkZWx0YURheXMgKiA4Nl80MDBfMDAwO1xyXG4gIGNvbnN0IHggPSBuZXcgRGF0ZSh0KTtcclxuICByZXR1cm4gYCR7eC5nZXRVVENGdWxsWWVhcigpfS0ke1N0cmluZyh4LmdldFVUQ01vbnRoKCkgKyAxKS5wYWRTdGFydCgyLCBcIjBcIil9LSR7U3RyaW5nKHguZ2V0VVRDRGF0ZSgpKS5wYWRTdGFydCgyLCBcIjBcIil9YDtcclxufTtcclxuXHJcbmV4cG9ydCBjbGFzcyBNb2NrUmVwb3J0c1JlcG9zaXRvcnkgaW1wbGVtZW50cyBJUmVwb3J0c1JlcG9zaXRvcnkge1xyXG4gIGFzeW5jIGdldFJldmVudWVSZXBvcnQoXHJcbiAgICBncmFudWxhcml0eTogUmVwb3J0c0dyYW51bGFyaXR5LFxyXG4gICAgcmFuZ2U6IFJlcG9ydHNEYXRlUmFuZ2VcclxuICApOiBQcm9taXNlPFJldmVudWVQb2ludFtdPiB7XHJcbiAgICBjb25zdCBiID0gcGFyc2VCb3VuZHMocmFuZ2UpO1xyXG4gICAgY29uc3Qgb2Zmc2V0SCA9IG9mZnNldEhvdXJzRm9yUmVwb3J0cygpO1xyXG4gICAgY29uc3QgZ3JvdXBlZCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XHJcbiAgICBmb3IgKGNvbnN0IHBheW1lbnQgb2YgZ2V0TW9ja0RiKCkucGF5bWVudHMpIHtcclxuICAgICAgaWYgKHBheW1lbnQuZGVsZXRlZEF0KSBjb250aW51ZTtcclxuICAgICAgaWYgKCFwYXltZW50SW5Cb3VuZHMocGF5bWVudC5jcmVhdGVkQXQsIGIpKSBjb250aW51ZTtcclxuICAgICAgY29uc3QgaW52ID0gZ2V0TW9ja0RiKCkuaW52b2ljZXMuZmluZCgoaSkgPT4gaS5pZCA9PT0gcGF5bWVudC5pbnZvaWNlSWQpO1xyXG4gICAgICBpZiAoIWludiB8fCBpbnYuZGVsZXRlZEF0IHx8IGludi5zdGF0dXMgPT09IFwiY2FuY2VsbGVkXCIgfHwgaW52LnN0YXR1cyA9PT0gXCJyZWZ1bmRlZFwiKSBjb250aW51ZTtcclxuICAgICAgY29uc3Qga2V5ID0gcGVyaW9kS2V5KERhdGUucGFyc2UocGF5bWVudC5jcmVhdGVkQXQpLCBncmFudWxhcml0eSwgb2Zmc2V0SCk7XHJcbiAgICAgIGdyb3VwZWQuc2V0KGtleSwgKGdyb3VwZWQuZ2V0KGtleSkgPz8gMCkgKyBlZmZlY3RpdmVQYXltZW50Q29udHJpYnV0aW9uKHBheW1lbnQpKTtcclxuICAgIH1cclxuICAgIHJldHVybiBbLi4uZ3JvdXBlZC5lbnRyaWVzKCldXHJcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhWzBdLmxvY2FsZUNvbXBhcmUoYlswXSkpXHJcbiAgICAgIC5tYXAoKFtwZXJpb2RTdGFydCwgdG90YWxSZXZlbnVlXSkgPT4gKHsgcGVyaW9kU3RhcnQsIHRvdGFsUmV2ZW51ZSB9KSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBnZXRQYXltZW50c0J5TWV0aG9kUmVwb3J0KFxyXG4gICAgcmFuZ2U6IFJlcG9ydHNEYXRlUmFuZ2VcclxuICApOiBQcm9taXNlPFBheW1lbnRzQnlNZXRob2RSb3dbXT4ge1xyXG4gICAgY29uc3QgYiA9IHBhcnNlQm91bmRzKHJhbmdlKTtcclxuICAgIGNvbnN0IGdyb3VwZWQgPSBuZXcgTWFwPFBheW1lbnRzQnlNZXRob2RSb3dbXCJtZXRob2RcIl0sIG51bWJlcj4oKTtcclxuICAgIGZvciAoY29uc3QgcGF5bWVudCBvZiBnZXRNb2NrRGIoKS5wYXltZW50cykge1xyXG4gICAgICBpZiAocGF5bWVudC5kZWxldGVkQXQpIGNvbnRpbnVlO1xyXG4gICAgICBpZiAoIXBheW1lbnRJbkJvdW5kcyhwYXltZW50LmNyZWF0ZWRBdCwgYikpIGNvbnRpbnVlO1xyXG4gICAgICBjb25zdCBpbnYgPSBnZXRNb2NrRGIoKS5pbnZvaWNlcy5maW5kKChpKSA9PiBpLmlkID09PSBwYXltZW50Lmludm9pY2VJZCk7XHJcbiAgICAgIGlmICghaW52IHx8IGludi5kZWxldGVkQXQgfHwgaW52LnN0YXR1cyA9PT0gXCJjYW5jZWxsZWRcIiB8fCBpbnYuc3RhdHVzID09PSBcInJlZnVuZGVkXCIpIGNvbnRpbnVlO1xyXG4gICAgICBjb25zdCBtID0gbm9ybWFsaXplUGF5bWVudE1ldGhvZChTdHJpbmcocGF5bWVudC5tZXRob2QpKTtcclxuICAgICAgZ3JvdXBlZC5zZXQobSwgKGdyb3VwZWQuZ2V0KG0pID8/IDApICsgZWZmZWN0aXZlUGF5bWVudENvbnRyaWJ1dGlvbihwYXltZW50KSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gWy4uLmdyb3VwZWQuZW50cmllcygpXVxyXG4gICAgICAuc29ydCgoYSwgYikgPT4gYVswXS5sb2NhbGVDb21wYXJlKGJbMF0pKVxyXG4gICAgICAubWFwKChbbWV0aG9kLCB0b3RhbEFtb3VudF0pID0+ICh7IG1ldGhvZCwgdG90YWxBbW91bnQgfSkpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZ2V0SW52b2ljZXNTdGF0dXNTdW1tYXJ5UmVwb3J0KFxyXG4gICAgcmFuZ2U6IFJlcG9ydHNEYXRlUmFuZ2VcclxuICApOiBQcm9taXNlPEludm9pY2VTdGF0dXNTdW1tYXJ5Um93W10+IHtcclxuICAgIGNvbnN0IGIgPSBwYXJzZUJvdW5kcyhyYW5nZSk7XHJcbiAgICBjb25zdCBncm91cGVkID0gbmV3IE1hcDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgdG90YWxBbW91bnQ6IG51bWJlciB9PigpO1xyXG4gICAgZm9yIChjb25zdCBpbnZvaWNlIG9mIGdldE1vY2tEYigpLmludm9pY2VzKSB7XHJcbiAgICAgIGlmIChpbnZvaWNlLmRlbGV0ZWRBdCkgY29udGludWU7XHJcbiAgICAgIGlmICghcGF5bWVudEluQm91bmRzKGludm9pY2UuY3JlYXRlZEF0LCBiKSkgY29udGludWU7XHJcbiAgICAgIGNvbnN0IHByZXYgPSBncm91cGVkLmdldChpbnZvaWNlLnN0YXR1cykgPz8geyBjb3VudDogMCwgdG90YWxBbW91bnQ6IDAgfTtcclxuICAgICAgZ3JvdXBlZC5zZXQoaW52b2ljZS5zdGF0dXMsIHtcclxuICAgICAgICBjb3VudDogcHJldi5jb3VudCArIDEsXHJcbiAgICAgICAgdG90YWxBbW91bnQ6IHByZXYudG90YWxBbW91bnQgKyBpbnZvaWNlLnRvdGFsLFxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiBbLi4uZ3JvdXBlZC5lbnRyaWVzKCldXHJcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhWzBdLmxvY2FsZUNvbXBhcmUoYlswXSkpXHJcbiAgICAgIC5tYXAoKFtzdGF0dXMsIHZhbHVlc10pID0+ICh7XHJcbiAgICAgICAgc3RhdHVzLFxyXG4gICAgICAgIGNvdW50OiB2YWx1ZXMuY291bnQsXHJcbiAgICAgICAgdG90YWxBbW91bnQ6IHZhbHVlcy50b3RhbEFtb3VudCxcclxuICAgICAgfSkpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZ2V0UmV2ZW51ZUJ5RG9jdG9yKHJhbmdlOiBSZXBvcnRzRGF0ZVJhbmdlKTogUHJvbWlzZTxSZXZlbnVlQnlEb2N0b3JSb3dbXT4ge1xyXG4gICAgY29uc3QgYiA9IHBhcnNlQm91bmRzKHJhbmdlKTtcclxuICAgIGNvbnN0IGRiID0gZ2V0TW9ja0RiKCk7XHJcbiAgICBjb25zdCBpbnZNYXAgPSBuZXcgTWFwKGRiLmludm9pY2VzLm1hcCgoaSkgPT4gW2kuaWQsIGldKSk7XHJcbiAgICBjb25zdCBhcE1hcCA9IG5ldyBNYXAoZGIuYXBwb2ludG1lbnRzLm1hcCgoYSkgPT4gW2EuaWQsIGFdKSk7XHJcbiAgICBjb25zdCBncm91cGVkID0gbmV3IE1hcDxudW1iZXIgfCBudWxsLCBudW1iZXI+KCk7XHJcblxyXG4gICAgZm9yIChjb25zdCBwYXltZW50IG9mIGRiLnBheW1lbnRzKSB7XHJcbiAgICAgIGlmIChwYXltZW50LmRlbGV0ZWRBdCkgY29udGludWU7XHJcbiAgICAgIGlmICghcGF5bWVudEluQm91bmRzKHBheW1lbnQuY3JlYXRlZEF0LCBiKSkgY29udGludWU7XHJcbiAgICAgIGNvbnN0IGludiA9IGludk1hcC5nZXQocGF5bWVudC5pbnZvaWNlSWQpO1xyXG4gICAgICBpZiAoIWludiB8fCBpbnYuZGVsZXRlZEF0IHx8IGludi5zdGF0dXMgPT09IFwiY2FuY2VsbGVkXCIgfHwgaW52LnN0YXR1cyA9PT0gXCJyZWZ1bmRlZFwiKSBjb250aW51ZTtcclxuICAgICAgY29uc3QgYXBJZCA9IGludi5hcHBvaW50bWVudElkO1xyXG4gICAgICBjb25zdCBkb2N0b3JJZCA9IGFwSWQgIT0gbnVsbCA/IGFwTWFwLmdldChhcElkKT8uZG9jdG9ySWQgPz8gbnVsbCA6IG51bGw7XHJcbiAgICAgIGdyb3VwZWQuc2V0KGRvY3RvcklkLCAoZ3JvdXBlZC5nZXQoZG9jdG9ySWQpID8/IDApICsgZWZmZWN0aXZlUGF5bWVudENvbnRyaWJ1dGlvbihwYXltZW50KSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZG9jdG9yTmFtZSA9IChpZDogbnVtYmVyIHwgbnVsbCk6IHN0cmluZyB8IG51bGwgPT4ge1xyXG4gICAgICBpZiAoaWQgPT0gbnVsbCkgcmV0dXJuIFwi0JHQtdC3INC30LDQv9C40YHQuFwiO1xyXG4gICAgICByZXR1cm4gZGIuZG9jdG9ycy5maW5kKChkKSA9PiBkLmlkID09PSBpZCk/Lm5hbWUgPz8gXCLigJRcIjtcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIFsuLi5ncm91cGVkLmVudHJpZXMoKV1cclxuICAgICAgLnNvcnQoKGEsIGIpID0+IGJbMV0gLSBhWzFdKVxyXG4gICAgICAubWFwKChbZG9jdG9ySWQsIHRvdGFsUmV2ZW51ZV0pID0+ICh7XHJcbiAgICAgICAgZG9jdG9ySWQsXHJcbiAgICAgICAgZG9jdG9yTmFtZTogZG9jdG9yTmFtZShkb2N0b3JJZCksXHJcbiAgICAgICAgdG90YWxSZXZlbnVlLFxyXG4gICAgICB9KSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBnZXRSZXZlbnVlQnlTZXJ2aWNlKHJhbmdlOiBSZXBvcnRzRGF0ZVJhbmdlKTogUHJvbWlzZTxSZXZlbnVlQnlTZXJ2aWNlUm93W10+IHtcclxuICAgIGNvbnN0IGIgPSBwYXJzZUJvdW5kcyhyYW5nZSk7XHJcbiAgICBjb25zdCBkYiA9IGdldE1vY2tEYigpO1xyXG4gICAgY29uc3QgaW52TWFwID0gbmV3IE1hcChkYi5pbnZvaWNlcy5tYXAoKGkpID0+IFtpLmlkLCBpXSkpO1xyXG4gICAgY29uc3QgYXBNYXAgPSBuZXcgTWFwKGRiLmFwcG9pbnRtZW50cy5tYXAoKGEpID0+IFthLmlkLCBhXSkpO1xyXG4gICAgY29uc3QgZ3JvdXBlZCA9IG5ldyBNYXA8bnVtYmVyIHwgbnVsbCwgbnVtYmVyPigpO1xyXG5cclxuICAgIGZvciAoY29uc3QgcGF5bWVudCBvZiBkYi5wYXltZW50cykge1xyXG4gICAgICBpZiAocGF5bWVudC5kZWxldGVkQXQpIGNvbnRpbnVlO1xyXG4gICAgICBpZiAoIXBheW1lbnRJbkJvdW5kcyhwYXltZW50LmNyZWF0ZWRBdCwgYikpIGNvbnRpbnVlO1xyXG4gICAgICBjb25zdCBpbnYgPSBpbnZNYXAuZ2V0KHBheW1lbnQuaW52b2ljZUlkKTtcclxuICAgICAgaWYgKCFpbnYgfHwgaW52LmRlbGV0ZWRBdCB8fCBpbnYuc3RhdHVzID09PSBcImNhbmNlbGxlZFwiIHx8IGludi5zdGF0dXMgPT09IFwicmVmdW5kZWRcIikgY29udGludWU7XHJcbiAgICAgIGNvbnN0IGFwSWQgPSBpbnYuYXBwb2ludG1lbnRJZDtcclxuICAgICAgY29uc3Qgc2VydmljZUlkID0gYXBJZCAhPSBudWxsID8gYXBNYXAuZ2V0KGFwSWQpPy5zZXJ2aWNlSWQgPz8gbnVsbCA6IG51bGw7XHJcbiAgICAgIGdyb3VwZWQuc2V0KHNlcnZpY2VJZCwgKGdyb3VwZWQuZ2V0KHNlcnZpY2VJZCkgPz8gMCkgKyBlZmZlY3RpdmVQYXltZW50Q29udHJpYnV0aW9uKHBheW1lbnQpKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzZXJ2aWNlTmFtZSA9IChpZDogbnVtYmVyIHwgbnVsbCk6IHN0cmluZyB8IG51bGwgPT4ge1xyXG4gICAgICBpZiAoaWQgPT0gbnVsbCkgcmV0dXJuIFwi0JHQtdC3INC30LDQv9C40YHQuFwiO1xyXG4gICAgICByZXR1cm4gZGIuc2VydmljZXMuZmluZCgocykgPT4gcy5pZCA9PT0gaWQpPy5uYW1lID8/IFwi4oCUXCI7XHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiBbLi4uZ3JvdXBlZC5lbnRyaWVzKCldXHJcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBiWzFdIC0gYVsxXSlcclxuICAgICAgLm1hcCgoW3NlcnZpY2VJZCwgdG90YWxSZXZlbnVlXSkgPT4gKHtcclxuICAgICAgICBzZXJ2aWNlSWQsXHJcbiAgICAgICAgc2VydmljZU5hbWU6IHNlcnZpY2VOYW1lKHNlcnZpY2VJZCksXHJcbiAgICAgICAgdG90YWxSZXZlbnVlLFxyXG4gICAgICB9KSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBnZXRSZXBvcnRNZXRyaWNzKHJhbmdlOiBSZXBvcnRzRGF0ZVJhbmdlKTogUHJvbWlzZTxSZXBvcnRNZXRyaWNzPiB7XHJcbiAgICBjb25zdCBiID0gcGFyc2VCb3VuZHMocmFuZ2UpO1xyXG4gICAgY29uc3QgZGIgPSBnZXRNb2NrRGIoKTtcclxuICAgIGxldCB0b3RhbFBheW1lbnRzQW1vdW50ID0gMDtcclxuICAgIGxldCBwYXltZW50c0NvdW50ID0gMDtcclxuICAgIGZvciAoY29uc3QgcGF5bWVudCBvZiBkYi5wYXltZW50cykge1xyXG4gICAgICBpZiAocGF5bWVudC5kZWxldGVkQXQpIGNvbnRpbnVlO1xyXG4gICAgICBpZiAoIXBheW1lbnRJbkJvdW5kcyhwYXltZW50LmNyZWF0ZWRBdCwgYikpIGNvbnRpbnVlO1xyXG4gICAgICBjb25zdCBpbnYgPSBkYi5pbnZvaWNlcy5maW5kKChpKSA9PiBpLmlkID09PSBwYXltZW50Lmludm9pY2VJZCk7XHJcbiAgICAgIGlmICghaW52IHx8IGludi5kZWxldGVkQXQgfHwgaW52LnN0YXR1cyA9PT0gXCJjYW5jZWxsZWRcIiB8fCBpbnYuc3RhdHVzID09PSBcInJlZnVuZGVkXCIpIGNvbnRpbnVlO1xyXG4gICAgICBjb25zdCBhbW91bnQgPSBlZmZlY3RpdmVQYXltZW50Q29udHJpYnV0aW9uKHBheW1lbnQpO1xyXG4gICAgICB0b3RhbFBheW1lbnRzQW1vdW50ICs9IGFtb3VudDtcclxuICAgICAgaWYgKGFtb3VudCA+IDApIHBheW1lbnRzQ291bnQgKz0gMTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgYXBwb2ludG1lbnRzQ291bnQgPSAwO1xyXG4gICAgZm9yIChjb25zdCBhIG9mIGRiLmFwcG9pbnRtZW50cykge1xyXG4gICAgICBpZiAoIXBheW1lbnRJbkJvdW5kcyhhLnN0YXJ0QXQsIGIpKSBjb250aW51ZTtcclxuICAgICAgYXBwb2ludG1lbnRzQ291bnQgKz0gMTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyB0b3RhbFBheW1lbnRzQW1vdW50LCBwYXltZW50c0NvdW50LCBhcHBvaW50bWVudHNDb3VudCB9O1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZ2V0UmVwb3J0c1N1bW1hcnkoKTogUHJvbWlzZTxSZXBvcnRzU3VtbWFyeURhdGE+IHtcclxuICAgIGNvbnN0IHR6ID0gZW52LnJlcG9ydHNUaW1lem9uZTtcclxuICAgIGNvbnN0IG9mZnNldEggPSBvZmZzZXRIb3Vyc0ZvclJlcG9ydHMoKTtcclxuICAgIGNvbnN0IHRvZGF5WW1kID0gZm9ybWF0WW1kSW5UaW1lWm9uZShuZXcgRGF0ZSgpLCB0eik7XHJcbiAgICBjb25zdCB5ZXN0WW1kID0gYWRkRGF5c1ltZCh0b2RheVltZCwgLTEpO1xyXG4gICAgY29uc3Qgd2Vla1N0YXJ0WW1kID0gbW9uZGF5V2Vla1N0YXJ0WW1kKHRvZGF5WW1kKTtcclxuICAgIGNvbnN0IHByZXZXZWVrU3RhcnRZbWQgPSBhZGREYXlzWW1kKHdlZWtTdGFydFltZCwgLTcpO1xyXG4gICAgY29uc3QgcHJldldlZWtFbmRZbWQgPSBhZGREYXlzWW1kKHRvZGF5WW1kLCAtNyk7XHJcbiAgICBjb25zdCBmaXJzdE9mTW9udGhZbWQgPSBtb250aFN0YXJ0WW1kKHRvZGF5WW1kKTtcclxuICAgIGNvbnN0IHdpbmRvd1N0YXJ0WW1kID0gYWRkRGF5c1ltZCh0b2RheVltZCwgLTI5KTtcclxuXHJcbiAgICBjb25zdCBkYiA9IGdldE1vY2tEYigpO1xyXG4gICAgY29uc3QgaW52TWFwID0gbmV3IE1hcChkYi5pbnZvaWNlcy5tYXAoKGkpID0+IFtpLmlkLCBpXSkpO1xyXG4gICAgY29uc3QgYXBNYXAgPSBuZXcgTWFwKGRiLmFwcG9pbnRtZW50cy5tYXAoKGEpID0+IFthLmlkLCBhXSkpO1xyXG5cclxuICAgIGxldCByZXZlbnVlVG9kYXkgPSAwO1xyXG4gICAgbGV0IHJldmVudWVZZXN0ZXJkYXkgPSAwO1xyXG4gICAgbGV0IHJldmVudWVXZWVrID0gMDtcclxuICAgIGxldCByZXZlbnVlUHJldmlvdXNXZWVrID0gMDtcclxuICAgIGxldCByZXZlbnVlTW9udGggPSAwO1xyXG4gICAgY29uc3QgYnlEYXlNYXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xyXG4gICAgY29uc3QgYnlEb2N0b3JNYXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xyXG4gICAgY29uc3QgYnlTZXJ2aWNlQWdnID0gbmV3IE1hcDxzdHJpbmcsIHsgYW1vdW50OiBudW1iZXI7IGxpbmVJZHM6IFNldDxudW1iZXI+IH0+KCk7XHJcblxyXG4gICAgZm9yIChjb25zdCBwYXltZW50IG9mIGRiLnBheW1lbnRzKSB7XHJcbiAgICAgIGlmIChwYXltZW50LmRlbGV0ZWRBdCkgY29udGludWU7XHJcbiAgICAgIGNvbnN0IGludiA9IGludk1hcC5nZXQocGF5bWVudC5pbnZvaWNlSWQpO1xyXG4gICAgICBpZiAoIWludiB8fCBpbnYuZGVsZXRlZEF0IHx8IGludi5zdGF0dXMgPT09IFwiY2FuY2VsbGVkXCIgfHwgaW52LnN0YXR1cyA9PT0gXCJyZWZ1bmRlZFwiKSBjb250aW51ZTtcclxuICAgICAgY29uc3QgbiA9IGVmZmVjdGl2ZVBheW1lbnRDb250cmlidXRpb24ocGF5bWVudCk7XHJcbiAgICAgIGNvbnN0IHltZCA9IHltZEluUmVwb3J0Wm9uZShEYXRlLnBhcnNlKHBheW1lbnQuY3JlYXRlZEF0KSwgb2Zmc2V0SCk7XHJcblxyXG4gICAgICBpZiAoeW1kID09PSB0b2RheVltZCkgcmV2ZW51ZVRvZGF5ICs9IG47XHJcbiAgICAgIGlmICh5bWQgPT09IHllc3RZbWQpIHJldmVudWVZZXN0ZXJkYXkgKz0gbjtcclxuICAgICAgaWYgKHltZCA+PSB3ZWVrU3RhcnRZbWQgJiYgeW1kIDw9IHRvZGF5WW1kKSByZXZlbnVlV2VlayArPSBuO1xyXG4gICAgICBpZiAoeW1kID49IHByZXZXZWVrU3RhcnRZbWQgJiYgeW1kIDw9IHByZXZXZWVrRW5kWW1kKSByZXZlbnVlUHJldmlvdXNXZWVrICs9IG47XHJcbiAgICAgIGlmICh5bWQgPj0gZmlyc3RPZk1vbnRoWW1kICYmIHltZCA8PSB0b2RheVltZCkgcmV2ZW51ZU1vbnRoICs9IG47XHJcblxyXG4gICAgICBpZiAoeW1kIDwgd2luZG93U3RhcnRZbWQgfHwgeW1kID4gdG9kYXlZbWQpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgYnlEYXlNYXAuc2V0KHltZCwgKGJ5RGF5TWFwLmdldCh5bWQpID8/IDApICsgbik7XHJcblxyXG4gICAgICBjb25zdCBhcCA9IGludi5hcHBvaW50bWVudElkICE9IG51bGwgPyBhcE1hcC5nZXQoaW52LmFwcG9pbnRtZW50SWQpIDogdW5kZWZpbmVkO1xyXG4gICAgICBjb25zdCBkb2N0b3JOYW1lID1cclxuICAgICAgICBhcCAhPSBudWxsID8gZGIuZG9jdG9ycy5maW5kKChkKSA9PiBkLmlkID09PSBhcC5kb2N0b3JJZCk/Lm5hbWUgPz8gXCLigJRcIiA6IFwi0JHQtdC3INC30LDQv9C40YHQuFwiO1xyXG4gICAgICBieURvY3Rvck1hcC5zZXQoZG9jdG9yTmFtZSwgKGJ5RG9jdG9yTWFwLmdldChkb2N0b3JOYW1lKSA/PyAwKSArIG4pO1xyXG5cclxuICAgICAgY29uc3QgaXRlbXMgPSBkYi5pbnZvaWNlSXRlbXMuZmlsdGVyKChpaSkgPT4gaWkuaW52b2ljZUlkID09PSBpbnYuaWQpO1xyXG4gICAgICBjb25zdCBsaW5lc1N1bSA9IGl0ZW1zLnJlZHVjZSgocywgaWkpID0+IHMgKyBpaS5saW5lVG90YWwsIDApO1xyXG4gICAgICBpZiAobGluZXNTdW0gPiAwKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBpaSBvZiBpdGVtcykge1xyXG4gICAgICAgICAgY29uc3Qgc2VydmljZU5hbWUgPVxyXG4gICAgICAgICAgICBpaS5zZXJ2aWNlSWQgIT0gbnVsbFxyXG4gICAgICAgICAgICAgID8gZGIuc2VydmljZXMuZmluZCgocykgPT4gcy5pZCA9PT0gaWkuc2VydmljZUlkKT8ubmFtZSA/PyBcIuKAlFwiXHJcbiAgICAgICAgICAgICAgOiBcItCR0LXQtyDRg9GB0LvRg9Cz0LhcIjtcclxuICAgICAgICAgIGNvbnN0IHNoYXJlID0gbiAqIChpaS5saW5lVG90YWwgLyBsaW5lc1N1bSk7XHJcbiAgICAgICAgICBjb25zdCBjdXIgPSBieVNlcnZpY2VBZ2cuZ2V0KHNlcnZpY2VOYW1lKSA/PyB7IGFtb3VudDogMCwgbGluZUlkczogbmV3IFNldDxudW1iZXI+KCkgfTtcclxuICAgICAgICAgIGN1ci5hbW91bnQgKz0gc2hhcmU7XHJcbiAgICAgICAgICBjdXIubGluZUlkcy5hZGQoaWkuaWQpO1xyXG4gICAgICAgICAgYnlTZXJ2aWNlQWdnLnNldChzZXJ2aWNlTmFtZSwgY3VyKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByZXZlbnVlQnlEYXk6IFJlcG9ydHNTdW1tYXJ5RGF0YVtcInJldmVudWVCeURheVwiXSA9IFtdO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCAzMDsgaSArPSAxKSB7XHJcbiAgICAgIGNvbnN0IGQgPSBhZGREYXlzWW1kKHdpbmRvd1N0YXJ0WW1kLCBpKTtcclxuICAgICAgaWYgKGQgPiB0b2RheVltZCkgYnJlYWs7XHJcbiAgICAgIHJldmVudWVCeURheS5wdXNoKHsgZGF0ZTogZCwgYW1vdW50OiByb3VuZDIoYnlEYXlNYXAuZ2V0KGQpID8/IDApIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHJldmVudWVCeURvY3RvciA9IFsuLi5ieURvY3Rvck1hcC5lbnRyaWVzKCldXHJcbiAgICAgIC5tYXAoKFtkb2N0b3JOYW1lLCBhbW91bnRdKSA9PiAoeyBkb2N0b3JOYW1lLCBhbW91bnQ6IHJvdW5kMihhbW91bnQpIH0pKVxyXG4gICAgICAuc29ydCgoYSwgYikgPT4gYi5hbW91bnQgLSBhLmFtb3VudClcclxuICAgICAgLnNsaWNlKDAsIDUpO1xyXG5cclxuICAgIGNvbnN0IHJldmVudWVCeVNlcnZpY2UgPSBbLi4uYnlTZXJ2aWNlQWdnLmVudHJpZXMoKV1cclxuICAgICAgLm1hcCgoW3NlcnZpY2VOYW1lLCB2XSkgPT4gKHtcclxuICAgICAgICBzZXJ2aWNlTmFtZSxcclxuICAgICAgICBhbW91bnQ6IHJvdW5kMih2LmFtb3VudCksXHJcbiAgICAgICAgY291bnQ6IHYubGluZUlkcy5zaXplLFxyXG4gICAgICB9KSlcclxuICAgICAgLnNvcnQoKGEsIGIpID0+IGIuYW1vdW50IC0gYS5hbW91bnQpXHJcbiAgICAgIC5zbGljZSgwLCA1KTtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXZlbnVlVG9kYXk6IHJvdW5kMihyZXZlbnVlVG9kYXkpLFxyXG4gICAgICByZXZlbnVlWWVzdGVyZGF5OiByb3VuZDIocmV2ZW51ZVllc3RlcmRheSksXHJcbiAgICAgIHJldmVudWVXZWVrOiByb3VuZDIocmV2ZW51ZVdlZWspLFxyXG4gICAgICByZXZlbnVlUHJldmlvdXNXZWVrOiByb3VuZDIocmV2ZW51ZVByZXZpb3VzV2VlayksXHJcbiAgICAgIHJldmVudWVNb250aDogcm91bmQyKHJldmVudWVNb250aCksXHJcbiAgICAgIHJldmVudWVCeURheSxcclxuICAgICAgcmV2ZW51ZUJ5RG9jdG9yLFxyXG4gICAgICByZXZlbnVlQnlTZXJ2aWNlLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGdldFJlY29tbWVuZGF0aW9uc0FuYWx5dGljcygpOiBQcm9taXNlPFJlY29tbWVuZGF0aW9uc0FuYWx5dGljc0RhdGE+IHtcclxuICAgIGNvbnN0IHR6ID0gZW52LnJlcG9ydHNUaW1lem9uZTtcclxuICAgIGNvbnN0IGRhdGVUbyA9IGZvcm1hdFltZEluVGltZVpvbmUobmV3IERhdGUoKSwgdHopO1xyXG4gICAgY29uc3QgZGF0ZUZyb20gPSBhZGREYXlzWW1kKGRhdGVUbywgLTYpO1xyXG4gICAgY29uc3QgZW1wdHlSYW5nZTogUmVwb3J0c0RhdGVSYW5nZSA9IHt9O1xyXG5cclxuICAgIGNvbnN0IFttZXRyaWNzLCBieURvY3RvciwgYnlTZXJ2aWNlLCBwb2ludHNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xyXG4gICAgICB0aGlzLmdldFJlcG9ydE1ldHJpY3MoZW1wdHlSYW5nZSksXHJcbiAgICAgIHRoaXMuZ2V0UmV2ZW51ZUJ5RG9jdG9yKGVtcHR5UmFuZ2UpLFxyXG4gICAgICB0aGlzLmdldFJldmVudWVCeVNlcnZpY2UoZW1wdHlSYW5nZSksXHJcbiAgICAgIHRoaXMuZ2V0UmV2ZW51ZVJlcG9ydChcImRheVwiLCB7IGRhdGVGcm9tLCBkYXRlVG8gfSksXHJcbiAgICBdKTtcclxuXHJcbiAgICBjb25zdCBkYiA9IGdldE1vY2tEYigpO1xyXG4gICAgbGV0IHF1YWxpZnlpbmdQYXltZW50c0NvdW50ID0gMDtcclxuICAgIGZvciAoY29uc3QgcGF5bWVudCBvZiBkYi5wYXltZW50cykge1xyXG4gICAgICBpZiAocGF5bWVudC5kZWxldGVkQXQpIGNvbnRpbnVlO1xyXG4gICAgICBjb25zdCBpbnYgPSBkYi5pbnZvaWNlcy5maW5kKChpKSA9PiBpLmlkID09PSBwYXltZW50Lmludm9pY2VJZCk7XHJcbiAgICAgIGlmICghaW52IHx8IGludi5kZWxldGVkQXQgfHwgaW52LnN0YXR1cyA9PT0gXCJjYW5jZWxsZWRcIiB8fCBpbnYuc3RhdHVzID09PSBcInJlZnVuZGVkXCIpIGNvbnRpbnVlO1xyXG4gICAgICBxdWFsaWZ5aW5nUGF5bWVudHNDb3VudCArPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGJUb2RheSA9IHBhcnNlQm91bmRzKHsgZGF0ZUZyb206IGRhdGVUbywgZGF0ZVRvIH0pO1xyXG4gICAgbGV0IHJldmVudWVUb2RheSA9IDA7XHJcbiAgICBmb3IgKGNvbnN0IHBheW1lbnQgb2YgZGIucGF5bWVudHMpIHtcclxuICAgICAgaWYgKHBheW1lbnQuZGVsZXRlZEF0KSBjb250aW51ZTtcclxuICAgICAgaWYgKCFwYXltZW50SW5Cb3VuZHMocGF5bWVudC5jcmVhdGVkQXQsIGJUb2RheSkpIGNvbnRpbnVlO1xyXG4gICAgICBjb25zdCBpbnYgPSBkYi5pbnZvaWNlcy5maW5kKChpKSA9PiBpLmlkID09PSBwYXltZW50Lmludm9pY2VJZCk7XHJcbiAgICAgIGlmICghaW52IHx8IGludi5kZWxldGVkQXQgfHwgaW52LnN0YXR1cyA9PT0gXCJjYW5jZWxsZWRcIiB8fCBpbnYuc3RhdHVzID09PSBcInJlZnVuZGVkXCIpIGNvbnRpbnVlO1xyXG4gICAgICByZXZlbnVlVG9kYXkgKz0gZWZmZWN0aXZlUGF5bWVudENvbnRyaWJ1dGlvbihwYXltZW50KTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgdW5wYWlkSW52b2ljZXNDb3VudCA9IDA7XHJcbiAgICBmb3IgKGNvbnN0IGludiBvZiBkYi5pbnZvaWNlcykge1xyXG4gICAgICBpZiAoaW52LmRlbGV0ZWRBdCkgY29udGludWU7XHJcbiAgICAgIGlmIChpbnYuc3RhdHVzID09PSBcImlzc3VlZFwiIHx8IGludi5zdGF0dXMgPT09IFwicGFydGlhbGx5X3BhaWRcIikgdW5wYWlkSW52b2ljZXNDb3VudCArPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHBvaW50TWFwID0gbmV3IE1hcChwb2ludHMubWFwKChwKSA9PiBbcC5wZXJpb2RTdGFydCwgcC50b3RhbFJldmVudWVdKSk7XHJcbiAgICBjb25zdCBkYWlseVJldmVudWVMYXN0N0RheXM6IG51bWJlcltdID0gW107XHJcbiAgICBmb3IgKGxldCBpID0gNjsgaSA+PSAwOyBpIC09IDEpIHtcclxuICAgICAgY29uc3QgeW1kID0gYWRkRGF5c1ltZChkYXRlVG8sIC1pKTtcclxuICAgICAgZGFpbHlSZXZlbnVlTGFzdDdEYXlzLnB1c2gocG9pbnRNYXAuZ2V0KHltZCkgPz8gMCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdG9wRCA9IGJ5RG9jdG9yWzBdO1xyXG4gICAgY29uc3QgdG9wUyA9IGJ5U2VydmljZVswXTtcclxuICAgIGNvbnN0IHRvcERvY3RvciA9XHJcbiAgICAgIHRvcEQgJiYgKHRvcEQudG90YWxSZXZlbnVlID4gMCB8fCB0b3BELmRvY3Rvck5hbWUpXHJcbiAgICAgICAgPyB7IG5hbWU6IHRvcEQuZG9jdG9yTmFtZSA/PyBcIuKAlFwiLCByZXZlbnVlOiB0b3BELnRvdGFsUmV2ZW51ZSB9XHJcbiAgICAgICAgOiBudWxsO1xyXG4gICAgY29uc3QgdG9wU2VydmljZSA9XHJcbiAgICAgIHRvcFMgJiYgKHRvcFMudG90YWxSZXZlbnVlID4gMCB8fCB0b3BTLnNlcnZpY2VOYW1lKVxyXG4gICAgICAgID8geyBuYW1lOiB0b3BTLnNlcnZpY2VOYW1lID8/IFwi4oCUXCIsIHJldmVudWU6IHRvcFMudG90YWxSZXZlbnVlIH1cclxuICAgICAgICA6IG51bGw7XHJcblxyXG4gICAgY29uc3QgdGhpcnR5RGF5c0FnbyA9IERhdGUubm93KCkgLSAzMCAqIDg2XzQwMF8wMDA7XHJcbiAgICBjb25zdCBhcHB0QnlEb2N0b3IgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xyXG4gICAgZm9yIChjb25zdCBhIG9mIGRiLmFwcG9pbnRtZW50cykge1xyXG4gICAgICBpZiAoRGF0ZS5wYXJzZShhLnN0YXJ0QXQpIDwgdGhpcnR5RGF5c0FnbykgY29udGludWU7XHJcbiAgICAgIGFwcHRCeURvY3Rvci5zZXQoYS5kb2N0b3JJZCwgKGFwcHRCeURvY3Rvci5nZXQoYS5kb2N0b3JJZCkgPz8gMCkgKyAxKTtcclxuICAgIH1cclxuICAgIGNvbnN0IHRvdGFsQXBwdHMgPSBbLi4uYXBwdEJ5RG9jdG9yLnZhbHVlcygpXS5yZWR1Y2UoKHMsIG4pID0+IHMgKyBuLCAwKTtcclxuICAgIGNvbnN0IGRvY3RvckxvYWRzOiB7IGRvY3Rvck5hbWU6IHN0cmluZzsgbG9hZFBjdDogbnVtYmVyIH1bXSA9IFtdO1xyXG4gICAgaWYgKHRvdGFsQXBwdHMgPiAwKSB7XHJcbiAgICAgIGNvbnN0IHNvcnRlZCA9IFsuLi5hcHB0QnlEb2N0b3IuZW50cmllcygpXS5zb3J0KCh4LCB5KSA9PiB5WzFdIC0geFsxXSkuc2xpY2UoMCwgOCk7XHJcbiAgICAgIGZvciAoY29uc3QgW2RvY3RvcklkLCBjbnRdIG9mIHNvcnRlZCkge1xyXG4gICAgICAgIGNvbnN0IG5hbWUgPSBkYi5kb2N0b3JzLmZpbmQoKGQpID0+IGQuaWQgPT09IGRvY3RvcklkKT8ubmFtZSA/PyBg0JLRgNCw0YcgIyR7ZG9jdG9ySWR9YDtcclxuICAgICAgICBkb2N0b3JMb2Fkcy5wdXNoKHtcclxuICAgICAgICAgIGRvY3Rvck5hbWU6IG5hbWUsXHJcbiAgICAgICAgICBsb2FkUGN0OiBNYXRoLnJvdW5kKChjbnQgLyB0b3RhbEFwcHRzKSAqIDEwMDApIC8gMTAsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBxdWFsaWZ5aW5nUGF5bWVudHNDb3VudCxcclxuICAgICAgcmV2ZW51ZVRvdGFsOiBtZXRyaWNzLnRvdGFsUGF5bWVudHNBbW91bnQsXHJcbiAgICAgIHJldmVudWVUb2RheSxcclxuICAgICAgdG9wRG9jdG9yLFxyXG4gICAgICB0b3BTZXJ2aWNlLFxyXG4gICAgICB1bnBhaWRJbnZvaWNlc0NvdW50LFxyXG4gICAgICBkYWlseVJldmVudWVMYXN0N0RheXMsXHJcbiAgICAgIGRvY3RvckxvYWRzLFxyXG4gICAgfTtcclxuICB9XHJcbn1cclxuIl19