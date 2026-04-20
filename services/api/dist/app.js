"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = require("./routes");
const config_1 = require("./config");
const asyncHandler_1 = require("./middleware/asyncHandler");
const healthController_1 = require("./controllers/healthController");
const requestLogger_1 = require("./middleware/requestLogger");
const errorHandler_1 = require("./middleware/errorHandler");
const notFoundHandler_1 = require("./middleware/notFoundHandler");
const createApp = () => {
    const app = (0, express_1.default)();
    /** Корневые пути для health check без префикса /api (Render, Docker, ALB). */
    app.get("/health", healthController_1.livenessCheck);
    app.get("/health/ready", (0, asyncHandler_1.asyncHandler)(healthController_1.readinessCheck));
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            // Allow non-browser clients (no Origin) and configured web origins.
            if (!origin || config_1.config.corsOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    }));
    app.use(express_1.default.json());
    app.use(requestLogger_1.requestId);
    app.use(requestLogger_1.requestLogger);
    app.use("/api", routes_1.rootRouter);
    app.use(notFoundHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
    return app;
};
exports.createApp = createApp;
