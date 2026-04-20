import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../middleware/errorHandler";

export const validateLoginBody = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const { username, password } = req.body ?? {};

  if (!username || typeof username !== "string" || username.trim() === "") {
    throw new ApiError(400, "Field 'username' is required");
  }

  if (!password || typeof password !== "string" || password.trim() === "") {
    throw new ApiError(400, "Field 'password' is required");
  }

  next();
};
