"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const env_1 = require("../config/env");
const MAX_REPORT_RANGE_DAYS = 400;
const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
const calendarDaysBetween = (fromYmd, toYmd) => {
    const [y1, m1, d1] = fromYmd.split("-").map(Number);
    const [y2, m2, d2] = toYmd.split("-").map(Number);
    const a = Date.UTC(y1, m1 - 1, d1);
    const b = Date.UTC(y2, m2 - 1, d2);
    return Math.floor((b - a) / 86400000);
};
const normalizeDateRange = (query) => {
    const rawDateFrom = typeof query.dateFrom === "string" ? query.dateFrom.trim() : undefined;
    const rawDateTo = typeof query.dateTo === "string" ? query.dateTo.trim() : undefined;
    const dateFrom = rawDateFrom && isDateOnly(rawDateFrom) ? rawDateFrom : rawDateFrom;
    const dateTo = rawDateTo && isDateOnly(rawDateTo) ? rawDateTo : rawDateTo;
    if (dateFrom && dateTo) {
        if (isDateOnly(dateFrom) && isDateOnly(dateTo)) {
            if (calendarDaysBetween(dateFrom, dateTo) < 0) {
                throw new errorHandler_1.ApiError(400, "Query param 'dateFrom' must be before or equal to 'dateTo'");
            }
            if (calendarDaysBetween(dateFrom, dateTo) > MAX_REPORT_RANGE_DAYS) {
                throw new errorHandler_1.ApiError(400, `Report range must not exceed ${MAX_REPORT_RANGE_DAYS} calendar days`);
            }
        }
        else {
            const t1 = Date.parse(dateFrom);
            const t2 = Date.parse(dateTo);
            if (Number.isNaN(t1) || Number.isNaN(t2)) {
                throw new errorHandler_1.ApiError(400, "Invalid date range");
            }
            if (t1 > t2) {
                throw new errorHandler_1.ApiError(400, "Query param 'dateFrom' must be before or equal to 'dateTo'");
            }
            if ((t2 - t1) / 86400000 > MAX_REPORT_RANGE_DAYS) {
                throw new errorHandler_1.ApiError(400, `Report range must not exceed ${MAX_REPORT_RANGE_DAYS} days`);
            }
        }
    }
    return { dateFrom, dateTo };
};
const normalizeGranularity = (value) => {
    if (!value) {
        return "day";
    }
    const normalized = value.toLowerCase();
    if (normalized === "day" || normalized === "week" || normalized === "month") {
        return normalized;
    }
    throw new errorHandler_1.ApiError(400, "Query param 'granularity' must be one of: day, week, month");
};
const addDaysYmd = (ymd, delta) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d) + delta * 86400000;
    const dt = new Date(t);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
};
const todayYmdInReportsTz = () => new Intl.DateTimeFormat("en-CA", {
    timeZone: env_1.env.reportsTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
}).format(new Date());
const pluralDaysRu = (n) => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m100 >= 11 && m100 <= 14)
        return "дней";
    if (m10 === 1)
        return "день";
    if (m10 >= 2 && m10 <= 4)
        return "дня";
    return "дней";
};
const round2 = (x) => Math.round(x * 100) / 100;
const alignByIndex = (current, previous) => current.map((point, index) => ({
    periodStart: point.periodStart,
    totalRevenue: Number(previous[index]?.totalRevenue ?? 0),
}));
class ReportsService {
    constructor(reportsRepository) {
        this.reportsRepository = reportsRepository;
    }
    async getRevenueReport(_auth, query) {
        const dateRange = normalizeDateRange(query);
        const granularity = normalizeGranularity(typeof query.granularity === "string" ? query.granularity : undefined);
        const currentPeriodData = await this.reportsRepository.getRevenueReport(granularity, dateRange);
        let prevPeriodData = [];
        if (dateRange.dateFrom &&
            dateRange.dateTo &&
            isDateOnly(dateRange.dateFrom) &&
            isDateOnly(dateRange.dateTo)) {
            const deltaDays = calendarDaysBetween(dateRange.dateFrom, dateRange.dateTo);
            const prevFrom = addDaysYmd(dateRange.dateFrom, -deltaDays);
            const prevTo = dateRange.dateFrom;
            const prevRaw = await this.reportsRepository.getRevenueReport(granularity, {
                dateFrom: prevFrom,
                dateTo: prevTo,
            });
            prevPeriodData = alignByIndex(currentPeriodData, prevRaw);
        }
        else {
            prevPeriodData = alignByIndex(currentPeriodData, []);
        }
        return {
            timezone: env_1.env.reportsTimezone,
            granularity,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            points: currentPeriodData,
            currentPeriodData,
            prevPeriodData,
        };
    }
    async getPaymentsByMethodReport(_auth, query) {
        const dateRange = normalizeDateRange(query);
        const rows = await this.reportsRepository.getPaymentsByMethodReport(dateRange);
        const totals = {
            cash: 0,
            card: 0,
        };
        for (const row of rows) {
            if (row.method === "cash")
                totals.cash += row.totalAmount;
            else
                totals.card += row.totalAmount;
        }
        return {
            timezone: env_1.env.reportsTimezone,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            totals,
            rows,
        };
    }
    async getInvoicesStatusSummary(_auth, query) {
        const dateRange = normalizeDateRange(query);
        const rows = await this.reportsRepository.getInvoicesStatusSummaryReport(dateRange);
        return {
            timezone: env_1.env.reportsTimezone,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            rows,
        };
    }
    async getRevenueByDoctor(_auth, query) {
        const dateRange = normalizeDateRange(query);
        const rows = await this.reportsRepository.getRevenueByDoctor(dateRange);
        return {
            timezone: env_1.env.reportsTimezone,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            rows,
        };
    }
    async getRevenueByService(_auth, query) {
        const dateRange = normalizeDateRange(query);
        const rows = await this.reportsRepository.getRevenueByService(dateRange);
        return {
            timezone: env_1.env.reportsTimezone,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            rows,
        };
    }
    async getReportMetrics(_auth, query) {
        const dateRange = normalizeDateRange(query);
        const metrics = await this.reportsRepository.getReportMetrics(dateRange);
        const totalRevenue = metrics.totalPaymentsAmount;
        let prevRevenue = 0;
        if (dateRange.dateFrom &&
            dateRange.dateTo &&
            isDateOnly(dateRange.dateFrom) &&
            isDateOnly(dateRange.dateTo)) {
            const deltaDays = calendarDaysBetween(dateRange.dateFrom, dateRange.dateTo);
            const prevFrom = addDaysYmd(dateRange.dateFrom, -deltaDays);
            const prevTo = dateRange.dateFrom;
            const prevMetrics = await this.reportsRepository.getReportMetrics({
                dateFrom: prevFrom,
                dateTo: prevTo,
            });
            prevRevenue = prevMetrics.totalPaymentsAmount;
        }
        return {
            timezone: env_1.env.reportsTimezone,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            metrics,
            totalRevenue,
            prevRevenue,
        };
    }
    async getReportsSummary(_auth) {
        const data = await this.reportsRepository.getReportsSummary();
        return { ...data, timezone: env_1.env.reportsTimezone };
    }
    /**
     * Выручка и оплаты за выбранный период + сравнимое предыдущее окно той же длины (календарные дни в reportsTimezone).
     */
    async getAiRevenueAnalytics(input) {
        const today = todayYmdInReportsTz();
        const build = (params) => {
            const revenue = params.cur.totalPaymentsAmount;
            const paymentsCount = params.cur.paymentsCount;
            const avgCheck = paymentsCount > 0 ? round2(revenue / paymentsCount) : 0;
            const previousRevenue = params.prev.totalPaymentsAmount;
            const previousPaymentsCount = params.prev.paymentsCount;
            let growthPct = null;
            if (previousRevenue > 0) {
                growthPct = round2(((revenue - previousRevenue) / previousRevenue) * 100);
            }
            return {
                preset: params.preset,
                periodLabelRu: params.periodLabelRu,
                daysInPeriod: params.daysInPeriod,
                revenue,
                paymentsCount,
                avgCheck,
                comparisonLabelRu: params.comparisonLabelRu,
                previousRevenue,
                previousPaymentsCount,
                growthPct,
            };
        };
        if (input.preset === "today") {
            const cur = await this.reportsRepository.getReportMetrics({
                dateFrom: today,
                dateTo: today,
            });
            const y = addDaysYmd(today, -1);
            const prev = await this.reportsRepository.getReportMetrics({ dateFrom: y, dateTo: y });
            return build({
                preset: "today",
                periodLabelRu: "за сегодня",
                daysInPeriod: 1,
                comparisonLabelRu: "за вчера",
                cur,
                prev,
            });
        }
        if (input.preset === "calendar_month") {
            const monthStart = `${today.slice(0, 7)}-01`;
            const cur = await this.reportsRepository.getReportMetrics({
                dateFrom: monthStart,
                dateTo: today,
            });
            const span = calendarDaysBetween(monthStart, today) + 1;
            const prevTo = addDaysYmd(monthStart, -1);
            const prevFrom = addDaysYmd(monthStart, -span);
            const prev = await this.reportsRepository.getReportMetrics({
                dateFrom: prevFrom,
                dateTo: prevTo,
            });
            return build({
                preset: "calendar_month",
                periodLabelRu: `с ${monthStart} по ${today} (текущий месяц)`,
                daysInPeriod: span,
                comparisonLabelRu: `предыдущие ${span} ${pluralDaysRu(span)} до начала месяца`,
                cur,
                prev,
            });
        }
        const days = Math.max(1, Math.min(MAX_REPORT_RANGE_DAYS, Math.floor(input.days)));
        const fromYmd = addDaysYmd(today, -(days - 1));
        const cur = await this.reportsRepository.getReportMetrics({
            dateFrom: fromYmd,
            dateTo: today,
        });
        const prevTo = addDaysYmd(fromYmd, -1);
        const prevFrom = addDaysYmd(fromYmd, -days);
        const prev = await this.reportsRepository.getReportMetrics({
            dateFrom: prevFrom,
            dateTo: prevTo,
        });
        return build({
            preset: "last_days",
            periodLabelRu: `за последние ${days} ${pluralDaysRu(days)}`,
            daysInPeriod: days,
            comparisonLabelRu: `предыдущие ${days} ${pluralDaysRu(days)}`,
            cur,
            prev,
        });
    }
}
exports.ReportsService = ReportsService;
