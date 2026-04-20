const LOCAL_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

const pad2 = (value: number): string => String(value).padStart(2, "0");

export const parseLocalDateTime = (value: string): Date | null => {
  const trimmed = value.trim();
  const match = LOCAL_DATE_TIME_RE.exec(trimmed);
  if (!match) {
    return null;
  }

  const [, y, m, d, hh, mm, ss] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mm);
  const second = Number(ss);

  const parsed = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute ||
    parsed.getSeconds() !== second
  ) {
    return null;
  }

  return parsed;
};

export const formatLocalDateTime = (date: Date): string => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds()
  )}`;
};

export const normalizeToLocalDateTime = (value: string | Date): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Invalid Date in normalizeToLocalDateTime");
    }
    return formatLocalDateTime(value);
  }

  const parsedLocal = parseLocalDateTime(value);
  if (parsedLocal) {
    return formatLocalDateTime(parsedLocal);
  }

  const trimmed = value.trim();
  const parsedIso = new Date(trimmed);
  if (!Number.isNaN(parsedIso.getTime())) {
    return formatLocalDateTime(parsedIso);
  }

  throw new Error(`Unparseable timestamp value: ${String(value)}`);
};
