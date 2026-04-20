import type { Request, Response, NextFunction } from "express";
import morgan from "morgan";
import { env } from "../config/env";

/** Dev: цветной; production: компактная строка без лишнего шума. */
export const requestLogger = morgan(env.isProduction ? "tiny" : "dev");

export const requestId = (_req: Request, _res: Response, next: NextFunction) => {
  next();
};
