"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const parseNumericInput_1 = require("./parseNumericInput");
(0, vitest_1.describe)("parseNumericInput", () => {
    (0, vitest_1.it)("parses plain numbers", () => {
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)(1500000)).toBe(1500000);
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)(1500000.5)).toBe(1500000.5);
    });
    (0, vitest_1.it)("parses formatted strings", () => {
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)("1500000")).toBe(1500000);
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)("1 500 000")).toBe(1500000);
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)("1 500 000 сум")).toBe(1500000);
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)("1,500,000")).toBe(1500000);
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)("1500000,50")).toBe(1500000.5);
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)("1500000.50")).toBe(1500000.5);
    });
    (0, vitest_1.it)("returns null for empty and invalid", () => {
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)(null)).toBeNull();
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)(undefined)).toBeNull();
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)("")).toBeNull();
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)("abc")).toBeNull();
        (0, vitest_1.expect)((0, parseNumericInput_1.parseNumericInput)(Number.NaN)).toBeNull();
    });
});
