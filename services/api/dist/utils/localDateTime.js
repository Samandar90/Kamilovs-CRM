"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeToLocalDateTime = exports.formatLocalDateTime = exports.parseLocalDateTime = void 0;
const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const pad2 = (value) => String(value).padStart(2, "0");
const parseLocalDateTime = (value) => {
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
    if (parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day ||
        parsed.getHours() !== hour ||
        parsed.getMinutes() !== minute ||
        parsed.getSeconds() !== second) {
        return null;
    }
    return parsed;
};
exports.parseLocalDateTime = parseLocalDateTime;
const formatLocalDateTime = (date) => {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
};
exports.formatLocalDateTime = formatLocalDateTime;
const normalizeToLocalDateTime = (value) => {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            throw new Error("Invalid Date in normalizeToLocalDateTime");
        }
        return (0, exports.formatLocalDateTime)(value);
    }
    const parsedLocal = (0, exports.parseLocalDateTime)(value);
    if (parsedLocal) {
        return (0, exports.formatLocalDateTime)(parsedLocal);
    }
    const trimmed = value.trim();
    const parsedIso = new Date(trimmed);
    if (!Number.isNaN(parsedIso.getTime())) {
        return (0, exports.formatLocalDateTime)(parsedIso);
    }
    throw new Error(`Unparseable timestamp value: ${String(value)}`);
};
exports.normalizeToLocalDateTime = normalizeToLocalDateTime;
