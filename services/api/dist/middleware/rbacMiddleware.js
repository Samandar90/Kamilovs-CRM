"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRoles = void 0;
const errorHandler_1 = require("./errorHandler");
const access_1 = require("../auth/access");
const requireRoles = (...allowedRoles) => (req, _res, next) => {
    if (!req.auth) {
        throw new errorHandler_1.ApiError(401, "Unauthorized");
    }
    if (!(0, access_1.hasAnyRole)(req.auth.role, allowedRoles)) {
        throw new errorHandler_1.ApiError(403, "Недостаточно прав для этого действия");
    }
    next();
};
exports.requireRoles = requireRoles;
