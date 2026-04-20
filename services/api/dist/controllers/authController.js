"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authAuditLogController = exports.logoutController = exports.meController = exports.loginController = void 0;
const env_1 = require("../config/env");
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const loginController = async (req, res) => {
    // eslint-disable-next-line no-console
    console.log("LOGIN START");
    // eslint-disable-next-line no-console
    console.log("JWT_SECRET SET:", Boolean(env_1.env.jwtSecret && env_1.env.jwtSecret.length > 0));
    const { username, password } = req.body;
    const result = await container_1.services.auth.login({ username, password }, {
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    return res.status(200).json(result);
};
exports.loginController = loginController;
const meController = async (req, res) => {
    const user = await container_1.services.auth.getMe((0, requestAuth_1.getAuthPayload)(req));
    return res.status(200).json(user);
};
exports.meController = meController;
const logoutController = async (_req, res) => {
    return res.status(200).json({
        success: true,
        message: "Logged out successfully",
    });
};
exports.logoutController = logoutController;
const authAuditLogController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const logs = await container_1.services.auth.getAuditLogs(auth);
    return res.status(200).json(logs);
};
exports.authAuditLogController = authAuditLogController;
