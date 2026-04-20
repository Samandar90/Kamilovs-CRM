import type { Request } from "express";
import { ApiError } from "../middleware/errorHandler";
import type { AuthTokenPayload } from "../repositories/interfaces/userTypes";

/** Resolves `req.auth` after `requireAuth` middleware (typed, non-optional). */
export const getAuthPayload = (req: Request): AuthTokenPayload => {
  if (!req.auth) {
    throw new ApiError(401, "Unauthorized");
  }
  return req.auth;
};
