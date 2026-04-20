import { allowPermission } from "./permissionMiddleware";

/**
 * Доступ к финансовым маршрутам — см. `PERMISSIONS.FINANCIAL_PORTAL_ACCESS`.
 */
export const requireFinancialPortalAccess = allowPermission("FINANCIAL_PORTAL_ACCESS");
