import type { Request, Response } from "express";
import { env } from "../config/env";

/** Публичные подписи для чеков и UI (не секреты). */
export const clinicMetaController = async (_req: Request, res: Response) => {
  res.status(200).json({
    clinicName: env.clinicDisplayName,
    receiptFooter: env.clinicReceiptFooter,
    reportsTimezone: env.reportsTimezone,
  });
};
