import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { USER_MANAGEMENT_ROLES } from "../repositories/interfaces/userTypes";

const parsePositiveInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export const validateUserIdParam = (req: Request, _res: Response, next: NextFunction) => {
  if (!parsePositiveInteger(req.params.id)) {
    throw new ApiError(400, "Path param 'id' must be a positive integer");
  }
  next();
};

const validateRole = (role: unknown, isOptional: boolean) => {
  if (role === undefined && isOptional) return;
  if (
    typeof role !== "string" ||
    !USER_MANAGEMENT_ROLES.includes(role as (typeof USER_MANAGEMENT_ROLES)[number])
  ) {
    throw new ApiError(
      400,
      `Field 'role' must be one of: ${USER_MANAGEMENT_ROLES.join(", ")}`
    );
  }
};

export const validateCreateUser = (req: Request, _res: Response, next: NextFunction) => {
  const {
    username,
    password,
    role,
    isActive,
    is_active,
    fullName,
    full_name,
    clinicId,
    clinic_id,
    doctorId,
    doctor_id,
  } = req.body ?? {};
  if (typeof username !== "string" || username.trim() === "") {
    throw new ApiError(400, "Field 'username' is required");
  }
  if (typeof password !== "string" || password.length < 6) {
    throw new ApiError(400, "Field 'password' must be at least 6 characters");
  }
  const resolvedFullName = typeof fullName === "string" ? fullName : full_name;
  if (typeof resolvedFullName !== "string" || resolvedFullName.trim() === "") {
    throw new ApiError(400, "Field 'full_name' is required");
  }
  validateRole(role, false);
  if (role === "doctor" || role === "nurse") {
    const raw = doctorId ?? doctor_id;
    if (raw === undefined || raw === null || raw === "") {
      throw new ApiError(400, "Для роли врач или медсестра обязателен doctor_id");
    }
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, "Поле doctor_id должно быть положительным целым числом");
    }
  }
  const resolvedIsActive = isActive ?? is_active;
  if (resolvedIsActive !== undefined && typeof resolvedIsActive !== "boolean") {
    throw new ApiError(400, "Field 'isActive' must be boolean");
  }
  const resolvedClinicId = clinicId ?? clinic_id;
  if (resolvedClinicId !== undefined && resolvedClinicId !== null && resolvedClinicId !== "") {
    const parsedClinicId = Number(resolvedClinicId);
    if (!Number.isInteger(parsedClinicId) || parsedClinicId <= 0) {
      throw new ApiError(400, "Field 'clinic_id' must be a positive integer");
    }
  }
  next();
};

export const validateUpdateUser = (req: Request, _res: Response, next: NextFunction) => {
  const { role, isActive, is_active, fullName, full_name, doctorId, doctor_id } =
    req.body ?? {};
  const resolvedFullName = fullName ?? full_name;
  if (
    resolvedFullName !== undefined &&
    (typeof resolvedFullName !== "string" || resolvedFullName.trim() === "")
  ) {
    throw new ApiError(400, "Field 'full_name' must be non-empty string");
  }
  validateRole(role, true);
  const rawDoctor = doctorId ?? doctor_id;
  if (rawDoctor !== undefined && rawDoctor !== null && rawDoctor !== "") {
    const id = Number(rawDoctor);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, "Поле doctor_id должно быть положительным целым числом");
    }
  }
  const resolvedIsActive = isActive ?? is_active;
  if (resolvedIsActive !== undefined && typeof resolvedIsActive !== "boolean") {
    throw new ApiError(400, "Field 'isActive' must be boolean");
  }
  next();
};

export const validateChangeUserPassword = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length < 6) {
    throw new ApiError(400, "Field 'password' must be at least 6 characters");
  }
  next();
};

export const validateToggleTwoFactorBody = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    throw new ApiError(400, "Field 'enabled' must be boolean");
  }
  next();
};
