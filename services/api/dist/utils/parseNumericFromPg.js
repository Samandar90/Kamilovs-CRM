"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRequiredMoneyFromPg = exports.parseNumericFromPg = void 0;
/**
 * @deprecated Импортируйте из `../utils/numbers` — оставлено для обратной совместимости.
 */
var numbers_1 = require("./numbers");
Object.defineProperty(exports, "parseNumericFromPg", { enumerable: true, get: function () { return numbers_1.parseNumericFromPg; } });
Object.defineProperty(exports, "parseRequiredMoneyFromPg", { enumerable: true, get: function () { return numbers_1.parseNonNegativeMoneyFromPg; } });
