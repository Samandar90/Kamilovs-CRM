"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateReportsQuery = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const allowedGranularity = new Set(["day", "week", "month"]);
const MAX_REPORT_RANGE_DAYS = 400;
const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
const calendarDaysBetween = (fromYmd, toYmd) => {
    const [y1, m1, d1] = fromYmd.split("-").map(Number);
    const [y2, m2, d2] = toYmd.split("-").map(Number);
    const a = Date.UTC(y1, m1 - 1, d1);
    const b = Date.UTC(y2, m2 - 1, d2);
    return Math.floor((b - a) / 86400000);
};
const isIsoLikeDate = (value) => {
    // Supports YYYY-MM-DD and full ISO datetime strings.
    const isoLikeRegex = /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
    if (!isoLikeRegex.test(value)) {
        return false;
    }
    return !Number.isNaN(Date.parse(value));
};
const validateReportsQuery = (req, _res, next) => {
    const { dateFrom, dateTo, granularity } = req.query;
    if (dateFrom !== undefined) {
        if (typeof dateFrom !== "string" || !isIsoLikeDate(dateFrom)) {
            throw new errorHandler_1.ApiError(400, "Query param 'dateFrom' must be an ISO-like date");
        }
    }
    if (dateTo !== undefined) {
        if (typeof dateTo !== "string" || !isIsoLikeDate(dateTo)) {
            throw new errorHandler_1.ApiError(400, "Query param 'dateTo' must be an ISO-like date");
        }
    }
    if (typeof dateFrom === "string" && typeof dateTo === "string") {
        if (isDateOnly(dateFrom) && isDateOnly(dateTo)) {
            if (calendarDaysBetween(dateFrom, dateTo) < 0) {
                throw new errorHandler_1.ApiError(400, "Query param 'dateFrom' must be before or equal to 'dateTo'");
            }
            if (calendarDaysBetween(dateFrom, dateTo) > MAX_REPORT_RANGE_DAYS) {
                throw new errorHandler_1.ApiError(400, `Report range must not exceed ${MAX_REPORT_RANGE_DAYS} calendar days`);
            }
        }
        else if (Date.parse(dateFrom) > Date.parse(dateTo)) {
            throw new errorHandler_1.ApiError(400, "Query param 'dateFrom' must be before or equal to 'dateTo'");
        }
        else if (!Number.isNaN(Date.parse(dateFrom)) &&
            !Number.isNaN(Date.parse(dateTo)) &&
            (Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000 > MAX_REPORT_RANGE_DAYS) {
            throw new errorHandler_1.ApiError(400, `Report range must not exceed ${MAX_REPORT_RANGE_DAYS} days`);
        }
    }
    if (granularity !== undefined) {
        const g = typeof granularity === "string" ? granularity.toLowerCase() : "";
        if (typeof granularity !== "string" || !allowedGranularity.has(g)) {
            throw new errorHandler_1.ApiError(400, "Query param 'granularity' must be one of: day, week, month");
        }
    }
    next();
};
exports.validateReportsQuery = validateReportsQuery;
