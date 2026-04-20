"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReadiness = exports.getLiveness = void 0;
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const getLiveness = () => ({
    status: "ok",
    service: "clinic-crm-api",
    uptimeSeconds: Math.round(process.uptime()),
    env: env_1.env.nodeEnv,
    dataProvider: env_1.env.dataProvider,
});
exports.getLiveness = getLiveness;
const getReadiness = async () => {
    if (env_1.env.dataProvider === "mock") {
        return { status: "ok", checks: { database: "skipped" } };
    }
    try {
        await database_1.dbPool.query("SELECT 1 AS health_check");
        return { status: "ok", checks: { database: "ok" } };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : env_1.env.isProduction ? undefined : String(err);
        return {
            status: "degraded",
            checks: { database: "error" },
            error: env_1.env.isProduction ? undefined : message,
        };
    }
};
exports.getReadiness = getReadiness;
