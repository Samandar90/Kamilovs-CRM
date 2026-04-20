import type { Request, Response } from "express";
import { env } from "../config/env";
import { services } from "../container";
import { getAuthPayload } from "../utils/requestAuth";

export const loginController = async (req: Request, res: Response) => {
  // eslint-disable-next-line no-console
  console.log("LOGIN START");
  // eslint-disable-next-line no-console
  console.log("JWT_SECRET SET:", Boolean(env.jwtSecret && env.jwtSecret.length > 0));

  const { username, password } = req.body as {
    username: string;
    password: string;
  };
  const result = await services.auth.login(
    { username, password },
    {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    }
  );
  return res.status(200).json(result);
};

export const meController = async (req: Request, res: Response) => {
  const user = await services.auth.getMe(getAuthPayload(req));
  return res.status(200).json(user);
};

export const logoutController = async (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

export const authAuditLogController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const logs = await services.auth.getAuditLogs(auth);
  return res.status(200).json(logs);
};

