import type { Request, Response } from "express";
import { env } from "../config/env";
import { dbPool } from "../config/database";

/** Публичные подписи для чеков и UI (не секреты). Имя клиники — из БД по JWT clinic_id, иначе из env. */
export const clinicMetaController = async (req: Request, res: Response) => {
  const rawId = req.clinicId ?? req.auth?.clinicId;
  const clinicId =
    typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0 ? rawId : null;

  if (clinicId != null) {
    try {
      const result = await dbPool.query<{ name: string }>(
        `SELECT name FROM clinics WHERE id = $1 LIMIT 1`,
        [clinicId]
      );
      const name = result.rows[0]?.name?.trim();
      if (name) {
        return res.status(200).json({
          clinicName: name,
          receiptFooter: env.clinicReceiptFooter,
          reportsTimezone: env.reportsTimezone,
        });
      }
    } catch {
      /* таблица clinics может отсутствовать на старых схемах — ниже fallback */
    }
  }

  return res.status(200).json({
    clinicName: env.clinicDisplayName,
    receiptFooter: env.clinicReceiptFooter,
    reportsTimezone: env.reportsTimezone,
  });
};
