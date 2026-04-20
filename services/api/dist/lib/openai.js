"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = exports.openaiApiKeyPrefix = exports.hasOpenAI = void 0;
const openai_1 = __importDefault(require("openai"));
/**
 * Единый клиент OpenAI для API. Ключ только из окружения, без захардкоженных значений.
 */
const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
exports.hasOpenAI = Boolean(apiKey) && apiKey !== "your_key_here";
/** Первые символы ключа — только для диагностики в логах (не секрет). */
exports.openaiApiKeyPrefix = apiKey ? `${apiKey.slice(0, 3)}…` : "";
exports.openai = exports.hasOpenAI ? new openai_1.default({ apiKey }) : null;
// eslint-disable-next-line no-console
console.log("[openai]", exports.hasOpenAI ? `client ready (${exports.openaiApiKeyPrefix || "prefix n/a"})` : "OPENAI_API_KEY missing or placeholder");
