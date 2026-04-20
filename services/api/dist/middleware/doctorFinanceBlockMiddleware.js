"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFinancialPortalAccess = void 0;
const permissionMiddleware_1 = require("./permissionMiddleware");
/**
 * Доступ к финансовым маршрутам — см. `PERMISSIONS.FINANCIAL_PORTAL_ACCESS`.
 */
exports.requireFinancialPortalAccess = (0, permissionMiddleware_1.allowPermission)("FINANCIAL_PORTAL_ACCESS");
