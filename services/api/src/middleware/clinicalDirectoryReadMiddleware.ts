import type { NextFunction, Request, Response } from "express";
import { hasPermission } from "../auth/permissions";
import { ApiError } from "./errorHandler";

/**
 * Чтение справочников для врача/медсестры/оператора записи без глобального `doctors`/`services` в матрице:
 * для врача/медсестры список режется в сервисе по `doctorId` / `nurseDoctorId`; оператор получает полный список для формы записи.
 */
export const allowDoctorsReadOrClinicalAssistant = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.auth) {
    throw new ApiError(401, "Unauthorized");
  }
  const { role } = req.auth;
  if (hasPermission(role, "doctors", "read")) {
    next();
    return;
  }
  if (role === "doctor" || role === "nurse" || role === "operator") {
    next();
    return;
  }
  throw new ApiError(403, "Недостаточно прав для просмотра врачей");
};

export const allowServicesReadOrClinicalAssistant = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.auth) {
    throw new ApiError(401, "Unauthorized");
  }
  const { role } = req.auth;
  if (hasPermission(role, "services", "read")) {
    next();
    return;
  }
  if (role === "doctor" || role === "nurse" || role === "operator") {
    next();
    return;
  }
  throw new ApiError(403, "Недостаточно прав для просмотра услуг");
};
