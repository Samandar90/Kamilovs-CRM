"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbPool = void 0;
const pg_1 = require("pg");
const env_1 = require("./env");
exports.dbPool = new pg_1.Pool({
    connectionString: env_1.env.databaseUrl,
});
/** Временная диагностика: при env.debugSqlParams логировать параметры prepared statement (поиск 22P02). */
if (env_1.env.debugSqlParams) {
    const orig = exports.dbPool.query.bind(exports.dbPool);
    exports.dbPool.query = ((textOrConfig, values) => {
        if (typeof textOrConfig === "string" && values !== undefined) {
            // eslint-disable-next-line no-console -- опциональная отладка DEBUG_SQL_PARAMS
            console.log("[DEBUG_SQL_PARAMS]", textOrConfig.slice(0, 220), "\nvalues:", values);
        }
        else if (textOrConfig &&
            typeof textOrConfig === "object" &&
            "values" in textOrConfig &&
            Array.isArray(textOrConfig.values)) {
            const cfg = textOrConfig;
            // eslint-disable-next-line no-console
            console.log("[DEBUG_SQL_PARAMS]", cfg.text?.slice(0, 220), "\nvalues:", cfg.values);
        }
        return orig(textOrConfig, values);
    });
}
