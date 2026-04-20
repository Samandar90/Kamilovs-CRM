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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvdXRpbHMvbnVtYmVycy9pbmRleC50cyIsInNvdXJjZXMiOlsiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvdXRpbHMvbnVtYmVycy9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFlQSw0Q0FFQztBQUdELGtDQUVDO0FBdEJELGlFQUFnRTtBQUF2RCw4SEFBQSxxQkFBcUIsT0FBQTtBQUM5Qix5REFRNkI7QUFQM0Isc0hBQUEsaUJBQWlCLE9BQUE7QUFDakIsb0hBQUEsZUFBZSxPQUFBO0FBQ2YsdUhBQUEsa0JBQWtCLE9BQUE7QUFDbEIsd0hBQUEsbUJBQW1CLE9BQUE7QUFDbkIsdUhBQUEsa0JBQWtCLE9BQUE7QUFDbEIsZ0lBQUEsMkJBQTJCLE9BQUE7QUFDM0IsNkhBQUEsd0JBQXdCLE9BQUE7QUFFMUIsdURBQXNEO0FBQTdDLG9IQUFBLGdCQUFnQixPQUFBO0FBRXpCLDJEQUF5RDtBQUV6RCw4RUFBOEU7QUFDOUUsU0FBZ0IsZ0JBQWdCLENBQUMsS0FBeUMsRUFBRSxRQUFRLEdBQUcsQ0FBQztJQUN0RixPQUFPLElBQUEsc0NBQWtCLEVBQUMsS0FBSyxDQUFDLElBQUksUUFBUSxDQUFDO0FBQy9DLENBQUM7QUFFRCxrREFBa0Q7QUFDbEQsU0FBZ0IsV0FBVyxDQUFDLEtBQWE7SUFDdkMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUM7QUFDMUQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCB7IHNhbml0aXplTnVtZXJpY1N0cmluZyB9IGZyb20gXCIuL3Nhbml0aXplTnVtZXJpY1N0cmluZ1wiO1xyXG5leHBvcnQge1xyXG4gIHBhcnNlTnVtZXJpY0lucHV0LFxyXG4gIHBhcnNlTW9uZXlJbnB1dCxcclxuICBwYXJzZU51bWVyaWNGcm9tUGcsXHJcbiAgcGFyc2VSZXF1aXJlZE51bWJlcixcclxuICBwYXJzZVJlcXVpcmVkTW9uZXksXHJcbiAgcGFyc2VOb25OZWdhdGl2ZU1vbmV5RnJvbVBnLFxyXG4gIHBhcnNlUmVxdWlyZWRNb25leUZyb21QZyxcclxufSBmcm9tIFwiLi9wYXJzZU51bWVyaWNJbnB1dFwiO1xyXG5leHBvcnQgeyBmb3JtYXRNb25leUZvclVpIH0gZnJvbSBcIi4vZm9ybWF0TW9uZXlGb3JVaVwiO1xyXG5cclxuaW1wb3J0IHsgcGFyc2VOdW1lcmljRnJvbVBnIH0gZnJvbSBcIi4vcGFyc2VOdW1lcmljSW5wdXRcIjtcclxuXHJcbi8qKiDQp9C40YHQu9C+INC40LcgUEcg0LTQu9GPIG1hcFJvdzog0YfQuNGB0LvQvtCy0YvQtSDQutC+0LvQvtC90LrQuCBudW1lcmljL2Zsb2F0OCwg0LHQtdC3IE5hTiDQsiBEVE8uICovXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU1vbmV5Q29sdW1uKHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkLCBmYWxsYmFjayA9IDApOiBudW1iZXIge1xyXG4gIHJldHVybiBwYXJzZU51bWVyaWNGcm9tUGcodmFsdWUpID8/IGZhbGxiYWNrO1xyXG59XHJcblxyXG4vKiog0J7QutGA0YPQs9C70LXQvdC40LUg0LTQviDQutC+0L/QtdC10LogKNCx0LjQt9C90LXRgS3Qu9C+0LPQuNC60LAg0LTQtdC90LXQsykuICovXHJcbmV4cG9ydCBmdW5jdGlvbiByb3VuZE1vbmV5Mih2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcclxuICByZXR1cm4gTWF0aC5yb3VuZCgodmFsdWUgKyBOdW1iZXIuRVBTSUxPTikgKiAxMDApIC8gMTAwO1xyXG59XHJcbiJdfQ==