import type { Request, Response } from "express";
import { getLiveness, getReadiness } from "../services/healthService";

/** Liveness: процесс жив; без проверки БД (для частых ping balancer). */
export const livenessCheck = (_req: Request, res: Response) => {
  return res.status(200).json(getLiveness());
};

/** Readiness: БД доступна (или mock); 503 если postgres недоступен. */
export const readinessCheck = async (_req: Request, res: Response) => {
  const payload = await getReadiness();
  if (payload.status === "degraded") {
    return res.status(503).json(payload);
  }
  return res.status(200).json(payload);
};
