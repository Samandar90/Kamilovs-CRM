"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRequiredMoneyFromPg = exports.parseMoneyInput = void 0;
exports.parseNumericInput = parseNumericInput;
exports.parseNumericFromPg = parseNumericFromPg;
exports.parseRequiredNumber = parseRequiredNumber;
exports.parseRequiredMoney = parseRequiredMoney;
exports.parseNonNegativeMoneyFromPg = parseNonNegativeMoneyFromPg;
const errorHandler_1 = require("../../middleware/errorHandler");
const sanitizeNumericString_1 = require("./sanitizeNumericString");
/**
 * Унифицированный разбор денежных и числовых значений из API, форм, query, JSON.
 * Возвращает null если значение пустое или не распознано (не бросает).
 */
function parseNumericInput(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "boolean") {
        return null;
    }
    const str = (0, sanitizeNumericString_1.sanitizeNumericString)(String(value));
    if (str === "" || str === "-" || str === "." || str === "-.") {
        return null;
    }
    const n = Number(str);
    return Number.isFinite(n) ? n : null;
}
/** Алиас для денег — та же логика, явное имя в сервисах. */
exports.parseMoneyInput = parseNumericInput;
/**
 * Значение из PostgreSQL NUMERIC (node-pg часто отдаёт строку). Без NaN.
 * Обёртка над parseNumericInput для использования в mapRow.
 */
function parseNumericFromPg(value) {
    return parseNumericInput(value);
}
function parseRequiredNumber(value, fieldName) {
    const n = parseNumericInput(value);
    if (n === null) {
        throw new errorHandler_1.ApiError(400, `Некорректное числовое значение поля: ${fieldName}`);
    }
    return n;
}
function parseRequiredMoney(value, fieldName) {
    return parseRequiredNumber(value, fieldName);
}
/** Неотрицательная сумма из БД (fallback при невалидной строке). */
function parseNonNegativeMoneyFromPg(value, fallback = 0) {
    const n = parseNumericInput(value);
    return n != null && n >= 0 ? n : fallback;
}
/** @deprecated используйте parseNonNegativeMoneyFromPg */
exports.parseRequiredMoneyFromPg = parseNonNegativeMoneyFromPg;
