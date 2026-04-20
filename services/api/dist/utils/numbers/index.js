"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatMoneyForUi = exports.parseRequiredMoneyFromPg = exports.parseNonNegativeMoneyFromPg = exports.parseRequiredMoney = exports.parseRequiredNumber = exports.parseNumericFromPg = exports.parseMoneyInput = exports.parseNumericInput = exports.sanitizeNumericString = void 0;
exports.parseMoneyColumn = parseMoneyColumn;
exports.roundMoney2 = roundMoney2;
var sanitizeNumericString_1 = require("./sanitizeNumericString");
Object.defineProperty(exports, "sanitizeNumericString", { enumerable: true, get: function () { return sanitizeNumericString_1.sanitizeNumericString; } });
var parseNumericInput_1 = require("./parseNumericInput");
Object.defineProperty(exports, "parseNumericInput", { enumerable: true, get: function () { return parseNumericInput_1.parseNumericInput; } });
Object.defineProperty(exports, "parseMoneyInput", { enumerable: true, get: function () { return parseNumericInput_1.parseMoneyInput; } });
Object.defineProperty(exports, "parseNumericFromPg", { enumerable: true, get: function () { return parseNumericInput_1.parseNumericFromPg; } });
Object.defineProperty(exports, "parseRequiredNumber", { enumerable: true, get: function () { return parseNumericInput_1.parseRequiredNumber; } });
Object.defineProperty(exports, "parseRequiredMoney", { enumerable: true, get: function () { return parseNumericInput_1.parseRequiredMoney; } });
Object.defineProperty(exports, "parseNonNegativeMoneyFromPg", { enumerable: true, get: function () { return parseNumericInput_1.parseNonNegativeMoneyFromPg; } });
Object.defineProperty(exports, "parseRequiredMoneyFromPg", { enumerable: true, get: function () { return parseNumericInput_1.parseRequiredMoneyFromPg; } });
var formatMoneyForUi_1 = require("./formatMoneyForUi");
Object.defineProperty(exports, "formatMoneyForUi", { enumerable: true, get: function () { return formatMoneyForUi_1.formatMoneyForUi; } });
const parseNumericInput_2 = require("./parseNumericInput");
/** Число из PG для mapRow: числовые колонки numeric/float8, без NaN в DTO. */
function parseMoneyColumn(value, fallback = 0) {
    return (0, parseNumericInput_2.parseNumericFromPg)(value) ?? fallback;
}
/** Округление до копеек (бизнес-логика денег). */
function roundMoney2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
