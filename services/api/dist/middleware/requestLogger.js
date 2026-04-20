"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = exports.requestLogger = void 0;
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("../config/env");
/** Dev: цветной; production: компактная строка без лишнего шума. */
exports.requestLogger = (0, morgan_1.default)(env_1.env.isProduction ? "tiny" : "dev");
const requestId = (_req, _res, next) => {
    next();
};
exports.requestId = requestId;
