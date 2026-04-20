"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryParseAppointmentTimestampForDb = tryParseAppointmentTimestampForDb;
exports.assertAppointmentTimestampForDb = assertAppointmentTimestampForDb;
exports.assertOptionalAppointmentTimestampForDb = assertOptionalAppointmentTimestampForDb;
const errorHandler_1 = require("../middleware/errorHandler");
const localDateTime_1 = require("./localDateTime");
/**
 * Парсит дату/время записи в канонический вид `YYYY-MM-DD HH:mm:ss` (локальное «стеночное» время)
 * для привязки к PostgreSQL `::timestamptz`.
 * На вход допускается ISO 8601 и смежные форматы, разбираемые `Date.parse`.
 */
function tryParseAppointmentTimestampForDb(value) {
    const trimmed = value.trim();
    if (trimmed === "") {
        return null;
    }
    const local = (0, localDateTime_1.parseLocalDateTime)(trimmed);
    if (local) {
        return (0, localDateTime_1.formatLocalDateTime)(local);
    }
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) {
        return null;
    }
    return (0, localDateTime_1.formatLocalDateTime)(d);
}
function assertAppointmentTimestampForDb(value, fieldName) {
    if (value === undefined || value === null) {
        throw new errorHandler_1.ApiError(400, `Поле '${fieldName}' обязательно`);
    }
    if (typeof value !== "string") {
        throw new errorHandler_1.ApiError(400, `Поле '${fieldName}' должно быть строкой`);
    }
    const parsed = tryParseAppointmentTimestampForDb(value);
    if (parsed === null) {
        throw new errorHandler_1.ApiError(400, `Поле '${fieldName}': укажите корректную дату и время (YYYY-MM-DD HH:mm:ss или ISO 8601)`);
    }
    return parsed;
}
/** Пустое / отсутствующее значение → `null` (в SQL не биндить). */
function assertOptionalAppointmentTimestampForDb(value, fieldName) {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== "string") {
        throw new errorHandler_1.ApiError(400, `Поле '${fieldName}' должно быть строкой`);
    }
    if (value.trim() === "") {
        return null;
    }
    const parsed = tryParseAppointmentTimestampForDb(value);
    if (parsed === null) {
        throw new errorHandler_1.ApiError(400, `Поле '${fieldName}': укажите корректную дату и время (YYYY-MM-DD HH:mm:ss или ISO 8601)`);
    }
    return parsed;
}
