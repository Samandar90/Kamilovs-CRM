"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowRoles = exports.allowPermission = exports.checkRoleAccess = exports.checkPermission = void 0;
const errorHandler_1 = require("./errorHandler");
const permissions_1 = require("../auth/permissions");
/**
 * Проверка права на модуль и действие после requireAuth.
 * @example router.get("/", requireAuth, checkPermission("patients", "read"), handler)
 */
const checkPermission = (module, action) => (req, _res, next) => {
    if (!req.auth) {
        throw new errorHandler_1.ApiError(401, "Unauthorized");
    }
    if (!(0, permissions_1.hasPermission)(req.auth.role, module, action)) {
        throw new errorHandler_1.ApiError(403, "Недостаточно прав для этого действия");
    }
    next();
};
exports.checkPermission = checkPermission;
/** Явный алиас для RBAC: роль проверяется через `req.auth` после `requireAuth`. */
exports.checkRoleAccess = exports.checkPermission;
/**
 * Проверка именованной возможности из `PERMISSIONS` (единый каталог прав).
 * @example router.post("/", requireAuth, allowPermission("APPOINTMENT_CREATE"), handler)
 */
const allowPermission = (key) => (req, _res, next) => {
    if (!req.auth) {
        throw new errorHandler_1.ApiError(401, "Unauthorized");
    }
    if (!(0, permissions_1.roleHasPermissionKey)(req.auth.role, key)) {
        throw new errorHandler_1.ApiError(403, "Недостаточно прав для этого действия");
    }
    next();
};
exports.allowPermission = allowPermission;
/**
 * Явный allowlist ролей (редкие динамические кейсы). Предпочтительно `allowPermission`.
 */
const allowRoles = (allowed) => (req, _res, next) => {
    if (!req.auth) {
        throw new errorHandler_1.ApiError(401, "Unauthorized");
    }
    if (req.auth.role === "superadmin") {
        next();
        return;
    }
    if (allowed.includes(req.auth.role)) {
        next();
        return;
    }
    throw new errorHandler_1.ApiError(403, "Недостаточно прав для этого действия");
};
exports.allowRoles = allowRoles;
