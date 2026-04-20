"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Загрузка .env до любых других модулей (server.ts импортирует этот файл первым).
 * Иначе @/lib/openai и др. читают process.env при загрузке — до dotenv в config/env.ts.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const envPath = path_1.default.resolve(process.cwd(), ".env");
dotenv_1.default.config({ override: true, path: envPath });
// eslint-disable-next-line no-console
console.log("ENV CHECK OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "MISSING");
// eslint-disable-next-line no-console
console.log("ENV CHECK JWT_SECRET:", process.env.JWT_SECRET?.trim() ? "SET" : "MISSING");
