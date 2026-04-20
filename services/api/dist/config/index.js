"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const env_1 = require("./env");
exports.config = {
    env: env_1.env.nodeEnv,
    isDev: env_1.env.nodeEnv === "development",
    isProd: env_1.env.nodeEnv === "production",
    port: env_1.env.port,
    dataProvider: env_1.env.dataProvider,
    jwtSecret: env_1.env.jwtSecret,
    corsOrigins: env_1.env.corsOrigins,
};
