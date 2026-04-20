"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./loadEnv");
const http_1 = __importDefault(require("http"));
const app_1 = require("./app");
const config_1 = require("./config");
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const mockDatabase_1 = require("./repositories/mockDatabase");
const app = (0, app_1.createApp)();
const server = http_1.default.createServer(app);
const port = config_1.config.port;
if (env_1.env.dataProvider === "mock") {
    (0, mockDatabase_1.ensureMockSeedData)();
}
const start = async () => {
    if (env_1.env.dataProvider === "postgres") {
        const dbUrl = process.env.DATABASE_URL;
        if (env_1.env.isProduction) {
            const redacted = dbUrl ? `${dbUrl.slice(0, 10)}...${dbUrl.slice(-10)}` : "undefined";
            // eslint-disable-next-line no-console
            console.log("DB URL:", redacted);
        }
        else {
            // eslint-disable-next-line no-console
            console.log("DB URL:", dbUrl);
        }
        database_1.dbPool
            .query("SELECT 1 AS ok")
            .then(() => {
            // eslint-disable-next-line no-console
            console.log("[DB] SELECT 1 OK");
        })
            .catch((err) => {
            // eslint-disable-next-line no-console
            const payload = err instanceof Error
                ? { name: err.name, message: err.message, code: err.code }
                : { message: String(err) };
            console.warn("[DB] SELECT 1 FAILED:", JSON.stringify(payload));
        });
    }
    server.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log("Server running on port", port);
    });
};
void start();
