"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthPayload = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
/** Resolves `req.auth` after `requireAuth` middleware (typed, non-optional). */
const getAuthPayload = (req) => {
    if (!req.auth) {
        throw new errorHandler_1.ApiError(401, "Unauthorized");
    }
    return req.auth;
};
exports.getAuthPayload = getAuthPayload;
