import OpenAI from "openai";

/**
 * Единый клиент OpenAI для API. Ключ только из окружения, без захардкоженных значений.
 */
const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();

export const hasOpenAI = Boolean(apiKey) && apiKey !== "your_key_here";

/** Первые символы ключа — только для диагностики в логах (не секрет). */
export const openaiApiKeyPrefix = apiKey ? `${apiKey.slice(0, 3)}…` : "";

export const openai: OpenAI | null = hasOpenAI ? new OpenAI({ apiKey }) : null;

// eslint-disable-next-line no-console
console.log(
  "[openai]",
  hasOpenAI ? `client ready (${openaiApiKeyPrefix || "prefix n/a"})` : "OPENAI_API_KEY missing or placeholder"
);
