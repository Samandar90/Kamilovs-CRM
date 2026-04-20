import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";

const allowedGranularity = new Set(["day", "week", "month"]);
const MAX_REPORT_RANGE_DAYS = 400;

const isDateOnly = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

const calendarDaysBetween = (fromYmd: string, toYmd: string): number => {
  const [y1, m1, d1] = fromYmd.split("-").map(Number);
  const [y2, m2, d2] = toYmd.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((b - a) / 86_400_000);
};

const isIsoLikeDate = (value: string): boolean => {
  // Supports YYYY-MM-DD and full ISO datetime strings.
  const isoLikeRegex =
    /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

  if (!isoLikeRegex.test(value)) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
};

export const validateReportsQuery = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const { dateFrom, dateTo, granularity } = req.query;

  if (dateFrom !== undefined) {
    if (typeof dateFrom !== "string" || !isIsoLikeDate(dateFrom)) {
      throw new ApiError(400, "Query param 'dateFrom' must be an ISO-like date");
    }
  }

  if (dateTo !== undefined) {
    if (typeof dateTo !== "string" || !isIsoLikeDate(dateTo)) {
      throw new ApiError(400, "Query param 'dateTo' must be an ISO-like date");
    }
  }

  if (typeof dateFrom === "string" && typeof dateTo === "string") {
    if (isDateOnly(dateFrom) && isDateOnly(dateTo)) {
      if (calendarDaysBetween(dateFrom, dateTo) < 0) {
        throw new ApiError(400, "Query param 'dateFrom' must be before or equal to 'dateTo'");
      }
      if (calendarDaysBetween(dateFrom, dateTo) > MAX_REPORT_RANGE_DAYS) {
        throw new ApiError(
          400,
          `Report range must not exceed ${MAX_REPORT_RANGE_DAYS} calendar days`
        );
      }
    } else if (Date.parse(dateFrom) > Date.parse(dateTo)) {
      throw new ApiError(400, "Query param 'dateFrom' must be before or equal to 'dateTo'");
    } else if (
      !Number.isNaN(Date.parse(dateFrom)) &&
      !Number.isNaN(Date.parse(dateTo)) &&
      (Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000 > MAX_REPORT_RANGE_DAYS
    ) {
      throw new ApiError(
        400,
        `Report range must not exceed ${MAX_REPORT_RANGE_DAYS} days`
      );
    }
  }

  if (granularity !== undefined) {
    const g = typeof granularity === "string" ? granularity.toLowerCase() : "";
    if (typeof granularity !== "string" || !allowedGranularity.has(g)) {
      throw new ApiError(400, "Query param 'granularity' must be one of: day, week, month");
    }
  }

  next();
};
