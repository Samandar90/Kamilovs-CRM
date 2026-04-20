"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = void 0;
const env_1 = require("../config/env");
const notFoundHandler = (req, res, _next) => {
    if (env_1.env.isProduction) {
        return res.status(404).json({
            error: "Not found",
        });
    }
    return res.status(404).json({
        error: "Route not found",
        path: req.originalUrl,
    });
};
exports.notFoundHandler = notFoundHandler;
