import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errorHandler";
import type { PermissionAction, PermissionKey, PermissionModule, UserRole } from "../auth/permissions";
import { hasPermission, roleHasPermissionKey } from "../auth/permissions";

/**
 * Проверка права на модуль и действие после requireAuth.
 * @example router.get("/", requireAuth, checkPermission("patients", "read"), handler)
 */
export const checkPermission =
  (module: PermissionModule, action: PermissionAction) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw new ApiError(401, "Unauthorized");
    }
    if (!hasPermission(req.auth.role, module, action)) {
      throw new ApiError(403, "Недостаточно прав для этого действия");
    }
    next();
  };

/** Явный алиас для RBAC: роль проверяется через `req.auth` после `requireAuth`. */
export const checkRoleAccess = checkPermission;

/**
 * Проверка именованной возможности из `PERMISSIONS` (единый каталог прав).
 * @example router.post("/", requireAuth, allowPermission("APPOINTMENT_CREATE"), handler)
 */
export const allowPermission =
  (key: PermissionKey) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw new ApiError(401, "Unauthorized");
    }
    if (!roleHasPermissionKey(req.auth.role, key)) {
      throw new ApiError(403, "Недостаточно прав для этого действия");
    }
    next();
  };

/**
 * Явный allowlist ролей (редкие динамические кейсы). Предпочтительно `allowPermission`.
 */
export const allowRoles =
  (allowed: readonly UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw new ApiError(401, "Unauthorized");
    }
    if (req.auth.role === "superadmin") {
      next();
      return;
    }
    if (allowed.includes(req.auth.role)) {
      next();
      return;
    }
    throw new ApiError(403, "Недостаточно прав для этого действия");
  };
