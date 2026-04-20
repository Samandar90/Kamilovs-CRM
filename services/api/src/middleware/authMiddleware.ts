import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errorHandler";
import { verifyAccessToken } from "../utils/jwt";

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "Authorization token is required");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new ApiError(401, "Authorization token is required");
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = payload;
    req.user = {
      ...payload,
      nurse_doctor_id: payload.nurseDoctorId ?? null,
    };
  } catch (_error) {
    throw new ApiError(401, "Invalid or expired token");
  }

  next();
};
