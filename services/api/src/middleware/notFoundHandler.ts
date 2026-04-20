import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export const notFoundHandler = (req: Request, res: Response, _next: NextFunction) => {
  if (env.isProduction) {
    return res.status(404).json({
      error: "Not found",
    });
  }
  return res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
};

