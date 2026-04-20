import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";

const parsePositiveInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const parsePercent = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const validateServiceIds = (value: unknown): void => {
  if (!Array.isArray(value)) {
    throw new ApiError(400, "Field 'serviceIds' must be an array of positive integers");
  }
  const unique = new Set<number>();
  for (const item of value) {
    const parsed = parsePositiveInteger(item);
    if (!parsed) {
      throw new ApiError(400, "Field 'serviceIds' must be an array of positive integers");
    }
    unique.add(parsed);
  }
  if (unique.size !== value.length) {
    throw new ApiError(400, "Field 'serviceIds' must not contain duplicates");
  }
};

/** Maps API aliases to canonical fields (mutates body). */
const normalizeDoctorPayload = (body: Record<string, unknown>): void => {
  if (body.fullName != null && body.name == null) {
    body.name = body.fullName;
  }
  if (body.specialty != null && body.speciality == null) {
    body.speciality = body.specialty;
  }
  if (body.percent !== undefined) {
    const p = parsePercent(body.percent);
    if (p !== null) {
      body.percent = p;
    }
  }
};

export const validateDoctorIdParam = (req: Request, _res: Response, next: NextFunction) => {
  if (!parsePositiveInteger(req.params.id)) {
    throw new ApiError(400, "Path param 'id' must be a positive integer");
  }
  next();
};

export const validateCreateDoctor = (req: Request, _res: Response, next: NextFunction) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  normalizeDoctorPayload(body);
  req.body = body;

  const { name, speciality, percent, active, serviceIds } = body;

  if (typeof name !== "string" || name.trim() === "") {
    throw new ApiError(
      400,
      "Field 'name' (or 'fullName') is required and must be a non-empty string"
    );
  }

  if (typeof speciality !== "string" || speciality.trim() === "") {
    throw new ApiError(
      400,
      "Field 'speciality' (or 'specialty') is required and must be a non-empty string"
    );
  }

  const pct = parsePercent(percent);
  if (pct === null || pct < 0 || pct > 100) {
    throw new ApiError(400, "Field 'percent' must be a number from 0 to 100");
  }
  body.percent = pct;

  if (typeof active !== "boolean") {
    throw new ApiError(400, "Field 'active' must be a boolean");
  }

  if (serviceIds !== undefined) {
    validateServiceIds(serviceIds);
  }

  next();
};

export const validateUpdateDoctor = (req: Request, _res: Response, next: NextFunction) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  normalizeDoctorPayload(body);
  req.body = body;

  const { name, fullName, speciality, specialty, percent, active, serviceIds } = body;

  if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
    throw new ApiError(400, "Field 'name' must be a non-empty string");
  }
  if (fullName !== undefined && (typeof fullName !== "string" || fullName.trim() === "")) {
    throw new ApiError(400, "Field 'fullName' must be a non-empty string");
  }

  if (speciality !== undefined && (typeof speciality !== "string" || speciality.trim() === "")) {
    throw new ApiError(400, "Field 'speciality' must be a non-empty string");
  }
  if (specialty !== undefined && (typeof specialty !== "string" || specialty.trim() === "")) {
    throw new ApiError(400, "Field 'specialty' must be a non-empty string");
  }

  if (percent !== undefined) {
    const pct = parsePercent(percent);
    if (pct === null || pct < 0 || pct > 100) {
      throw new ApiError(400, "Field 'percent' must be a number from 0 to 100");
    }
    body.percent = pct;
  }

  if (active !== undefined && typeof active !== "boolean") {
    throw new ApiError(400, "Field 'active' must be a boolean");
  }

  if (serviceIds !== undefined) {
    validateServiceIds(serviceIds);
  }

  const hasAnyField =
    name !== undefined ||
    fullName !== undefined ||
    speciality !== undefined ||
    specialty !== undefined ||
    percent !== undefined ||
    active !== undefined ||
    serviceIds !== undefined;

  if (!hasAnyField) {
    throw new ApiError(400, "At least one field must be provided for update");
  }

  next();
};
