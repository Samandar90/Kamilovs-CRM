import type { NextFunction, Request, Response } from "express";
import { SERVICE_CATEGORIES, isValidServiceCategory } from "../constants/serviceCategories";
import { ApiError } from "../middleware/errorHandler";
import type { ServiceCreateInput, ServiceUpdateInput } from "../repositories/interfaces/coreTypes";

const parsePositiveIntegerParam = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export const validateServiceIdParam = (req: Request, _res: Response, next: NextFunction) => {
  if (!parsePositiveIntegerParam(req.params.id)) {
    throw new ApiError(400, "Path param 'id' must be a positive integer");
  }
  next();
};

const parseNonNegativeFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim().replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n) && n >= 0) {
      return n;
    }
  }
  return null;
};

const parsePositiveIntMinutes = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) {
      return n;
    }
  }
  return null;
};

const normalizeDoctorIds = (value: unknown): number[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ApiError(400, "Field 'doctorIds' must be an array of positive integers");
  }
  const out: number[] = [];
  for (const el of value) {
    const n = typeof el === "number" ? el : Number(el);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(400, "Field 'doctorIds' must be an array of positive integers");
    }
    out.push(n);
  }
  return [...new Set(out)].sort((a, b) => a - b);
};

export const validateCreateService = (req: Request, _res: Response, next: NextFunction) => {
  const body = req.body ?? {};
  const { name, category, active } = body;

  if (typeof name !== "string" || name.trim() === "") {
    throw new ApiError(400, "Field 'name' must be a non-empty string");
  }
  if (typeof category !== "string" || category.trim() === "") {
    throw new ApiError(400, "Field 'category' must be a non-empty string");
  }
  const cat = category.trim();
  if (!isValidServiceCategory(cat)) {
    throw new ApiError(
      400,
      `Field 'category' must be one of: ${SERVICE_CATEGORIES.join(", ")}`
    );
  }

  const price = parseNonNegativeFiniteNumber(body.price);
  if (price === null) {
    throw new ApiError(400, "Field 'price' must be a number greater than or equal to 0");
  }

  const duration = parsePositiveIntMinutes(body.duration);
  if (duration === null) {
    throw new ApiError(400, "Field 'duration' must be a positive integer (minutes)");
  }

  if (typeof active !== "boolean") {
    throw new ApiError(400, "Field 'active' must be a boolean");
  }

  const doctorIds = normalizeDoctorIds(body.doctorIds);

  const normalized: ServiceCreateInput = {
    name: name.trim(),
    category: cat,
    price,
    duration,
    active,
    doctorIds,
  };
  req.body = normalized;
  next();
};

export const validateUpdateService = (req: Request, _res: Response, next: NextFunction) => {
  const body = req.body ?? {};
  const out: ServiceUpdateInput = {};
  let provided = 0;

  if (body.name !== undefined) {
    provided += 1;
    if (typeof body.name !== "string" || body.name.trim() === "") {
      throw new ApiError(400, "Field 'name' must be a non-empty string");
    }
    out.name = body.name.trim();
  }

  if (body.category !== undefined) {
    provided += 1;
    if (typeof body.category !== "string" || body.category.trim() === "") {
      throw new ApiError(400, "Field 'category' must be a non-empty string");
    }
    const cat = body.category.trim();
    if (!isValidServiceCategory(cat)) {
      throw new ApiError(
        400,
        `Field 'category' must be one of: ${SERVICE_CATEGORIES.join(", ")}`
      );
    }
    out.category = cat;
  }

  if (body.price !== undefined) {
    provided += 1;
    const price = parseNonNegativeFiniteNumber(body.price);
    if (price === null) {
      throw new ApiError(400, "Field 'price' must be a number greater than or equal to 0");
    }
    out.price = price;
  }

  if (body.duration !== undefined) {
    provided += 1;
    const duration = parsePositiveIntMinutes(body.duration);
    if (duration === null) {
      throw new ApiError(400, "Field 'duration' must be a positive integer (minutes)");
    }
    out.duration = duration;
  }

  if (body.active !== undefined) {
    provided += 1;
    if (typeof body.active !== "boolean") {
      throw new ApiError(400, "Field 'active' must be a boolean");
    }
    out.active = body.active;
  }

  if (body.doctorIds !== undefined) {
    provided += 1;
    out.doctorIds = normalizeDoctorIds(body.doctorIds);
  }

  if (provided === 0) {
    throw new ApiError(400, "At least one field must be provided for update");
  }

  req.body = out;
  next();
};
