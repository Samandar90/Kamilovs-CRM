/** YYYY-MM-DD in IANA timezone (align with API env.reportsTimezone). */
export const formatYmdInTimeZone = (d: Date, timeZone: string): string => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

export type DateRange = { dateFrom: string; dateTo: string };

export const rangeToday = (tz: string): DateRange => {
  const now = new Date();
  const y = formatYmdInTimeZone(now, tz);
  return { dateFrom: y, dateTo: y };
};

export const rangeYesterday = (tz: string): DateRange => {
  const now = new Date();
  const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d = formatYmdInTimeZone(y, tz);
  return { dateFrom: d, dateTo: d };
};

export const rangeLast7Days = (tz: string): DateRange => {
  const now = new Date();
  const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  return {
    dateFrom: formatYmdInTimeZone(start, tz),
    dateTo: formatYmdInTimeZone(now, tz),
  };
};
