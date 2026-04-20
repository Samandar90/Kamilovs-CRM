"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readinessCheck = exports.livenessCheck = void 0;
const healthService_1 = require("../services/healthService");
/** Liveness: процесс жив; без проверки БД (для частых ping balancer). */
const livenessCheck = (_req, res) => {
    return res.status(200).json((0, healthService_1.getLiveness)());
};
exports.livenessCheck = livenessCheck;
/** Readiness: БД доступна (или mock); 503 если postgres недоступен. */
const readinessCheck = async (_req, res) => {
    const payload = await (0, healthService_1.getReadiness)();
    if (payload.status === "degraded") {
        return res.status(503).json(payload);
    }
    return res.status(200).json(payload);
};
exports.readinessCheck = readinessCheck;
