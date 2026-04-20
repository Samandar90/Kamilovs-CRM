"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const errorHandler_1 = require("./errorHandler");
const jwt_1 = require("../utils/jwt");
const requireAuth = (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        throw new errorHandler_1.ApiError(401, "Authorization token is required");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
        throw new errorHandler_1.ApiError(401, "Authorization token is required");
    }
    try {
        const payload = (0, jwt_1.verifyAccessToken)(token);
        req.auth = payload;
        req.user = {
            ...payload,
            nurse_doctor_id: payload.nurseDoctorId ?? null,
        };
    }
    catch (_error) {
        throw new errorHandler_1.ApiError(401, "Invalid or expired token");
    }
    next();
};
exports.requireAuth = requireAuth;
