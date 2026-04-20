"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginRateLimit = void 0;
const express_rate_limit_1 = require("express-rate-limit");
const FIVE_MINUTES_MS = 5 * 60 * 1000;
exports.loginRateLimit = (0, express_rate_limit_1.rateLimit)({
    windowMs: FIVE_MINUTES_MS,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many login attempts. Please try again later.",
    },
});
