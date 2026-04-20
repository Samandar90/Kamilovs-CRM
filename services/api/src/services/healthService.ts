import { dbPool } from "../config/database";
import { env } from "../config/env";

export type LivenessPayload = {
  status: "ok";
  service: string;
  uptimeSeconds: number;
  env: string;
  dataProvider: "postgres" | "mock";
};

export type ReadinessPayload =
  | {
      status: "ok";
      checks: { database: "ok" | "skipped" };
    }
  | {
      status: "degraded";
      checks: { database: "error" };
      error?: string;
    };

export const getLiveness = (): LivenessPayload => ({
  status: "ok",
  service: "clinic-crm-api",
  uptimeSeconds: Math.round(process.uptime()),
  env: env.nodeEnv,
  dataProvider: env.dataProvider,
});

export const getReadiness = async (): Promise<ReadinessPayload> => {
  if (env.dataProvider === "mock") {
    return { status: "ok", checks: { database: "skipped" } };
  }
  try {
    await dbPool.query("SELECT 1 AS health_check");
    return { status: "ok", checks: { database: "ok" } };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : env.isProduction ? undefined : String(err);
    return {
      status: "degraded",
      checks: { database: "error" },
      error: env.isProduction ? undefined : message,
    };
  }
};
