import { Pool } from "pg";
import { env } from "./env";

export const dbPool = new Pool({
  connectionString: env.databaseUrl,
});

/** Временная диагностика: при env.debugSqlParams логировать параметры prepared statement (поиск 22P02). */
if (env.debugSqlParams) {
  const orig = dbPool.query.bind(dbPool);
  dbPool.query = (((textOrConfig: string | { text?: string; values?: unknown[] }, values?: unknown[]) => {
    if (typeof textOrConfig === "string" && values !== undefined) {
      // eslint-disable-next-line no-console -- опциональная отладка DEBUG_SQL_PARAMS
      console.log("[DEBUG_SQL_PARAMS]", textOrConfig.slice(0, 220), "\nvalues:", values);
    } else if (
      textOrConfig &&
      typeof textOrConfig === "object" &&
      "values" in textOrConfig &&
      Array.isArray((textOrConfig as { values?: unknown[] }).values)
    ) {
      const cfg = textOrConfig as { text?: string; values?: unknown[] };
      // eslint-disable-next-line no-console
      console.log("[DEBUG_SQL_PARAMS]", cfg.text?.slice(0, 220), "\nvalues:", cfg.values);
    }
    return orig(textOrConfig as never, values as never);
  }) as typeof dbPool.query);
}

