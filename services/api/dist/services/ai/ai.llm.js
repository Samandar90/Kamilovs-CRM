"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeResponderText = normalizeResponderText;
exports.callResponderLlm = callResponderLlm;
exports.normalizeResponse = normalizeResponse;
const aiAssistantRolePrompts_1 = require("../../ai/aiAssistantRolePrompts");
const openai_1 = require("../../lib/openai");
const ai_context_1 = require("./ai.context");
/** Модель диалога: можно переопределить через OPENAI_CHAT_MODEL (например gpt-4o). */
const CHAT_MODEL = (process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini").trim() || "gpt-4o-mini";
const UNAVAILABLE_PREFIX = "AI временно недоступен:";
const HISTORY_TURN_MAX_CHARS = 3500;
/** Доп. инструкции для второго вызова: структура как у Linear AI — коротко и по делу. */
const RESPONDER_INTELLIGENCE = `Ты отвечаешь как product-level ассистент: суть за секунды, без учебника.

Обязательно:
- Не больше 3–6 строк текста (плюс пустые строки между блоками с эмодзи — можно).
- Структура: факт → вывод → рекомендация. Если есть блок «Фактические данные из отчётов» — ВСЕ цифры только оттуда; период в ответе совпадает с данными, не подменяй «7 дней» если в данных иначе.
- Формат с цифрами и аналитикой (если ответ не тривиальный):
📊 Что вижу:
...
📈 Вывод: (или 📉 Проблема: если уместно)
...
💡 Что сделать:
...
- Простой вопрос: 👉 короткий ответ и при необходимости 👉 одна строка пояснения.
- Не повторяй вопрос пользователя. Не пиши длинные абзацы. Если не хватает периода/сущности — одна строка уточнения.`;
const RESPONDER_TEXT_MAX = 1400;
const RESPONDER_TEXT_MAX_FALLBACK = 1800;
/** Ответ ассистента после роутера (type chat): мягкая санитизация, без обрезки до 2 предложений. */
function normalizeResponderText(text, maxLen = RESPONDER_TEXT_MAX) {
    const stripped = String(text ?? "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/(^|\n)\s*(as an ai|i am an ai|assistant:).*/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    return stripped ? stripped.slice(0, maxLen) : "Недостаточно данных";
}
/**
 * Второй вызов OpenAI: человекочитаемый ответ (после решения роутера type "chat").
 */
const RESPONDER_FALLBACK_MODE = `Режим восстановления: роутер не вернул валидный JSON — всё равно отвечай в том же лаконичном стиле (3–6 строк, формат 📊/📈/💡 или 👉).
Суть ясно, без простыни. По CRM — только «Снимок CRM», цифры не выдумывай.`;
async function callResponderLlm(message, context, role, chatHistory = [], options) {
    if (!openai_1.hasOpenAI || !openai_1.openai)
        return null;
    try {
        const ctxBlock = (0, ai_context_1.formatHumanCrmContextForAssistant)(context, role);
        const crmSystem = `Снимок CRM:\n${ctxBlock}`.slice(0, 12000);
        const userContent = String(message ?? "").trim().slice(0, 8000);
        const historyMessages = chatHistory.map((h) => ({
            role: h.role,
            content: String(h.content ?? "").trim().slice(0, HISTORY_TURN_MAX_CHARS),
        }));
        const fact = options?.factualDataBlock?.trim();
        const fallback = Boolean(options?.fallback);
        const fallbackPrefix = fallback
            ? [{ role: "system", content: RESPONDER_FALLBACK_MODE }]
            : [];
        const factMessage = fact
            ? [
                { role: "system", content: RESPONDER_INTELLIGENCE },
                {
                    role: "system",
                    content: `Фактические данные из отчётов CRM (цифры ответа только отсюда):\n${fact.slice(0, 4500)}`,
                },
            ]
            : [{ role: "system", content: RESPONDER_INTELLIGENCE }];
        const completion = await openai_1.openai.chat.completions.create({
            model: CHAT_MODEL,
            temperature: 0.55,
            max_tokens: 650,
            messages: [
                { role: "system", content: (0, aiAssistantRolePrompts_1.getSystemPrompt)(role) },
                ...fallbackPrefix,
                ...factMessage,
                { role: "system", content: crmSystem },
                ...historyMessages,
                { role: "user", content: userContent },
            ],
        });
        const content = completion.choices?.[0]?.message?.content?.trim();
        if (!content)
            return "Недостаточно данных";
        return normalizeResponderText(content, fallback ? RESPONDER_TEXT_MAX_FALLBACK : RESPONDER_TEXT_MAX);
    }
    catch (error) {
        const anyErr = error;
        return `${UNAVAILABLE_PREFIX} ${anyErr?.message ?? "ошибка LLM"}`;
    }
}
/** Короткие ответы для ошибок валидации и подтверждений мутаций — не для chat. */
function normalizeResponse(text) {
    const stripped = String(text ?? "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/(^|\n)\s*(as an ai|i am an ai|assistant:).*/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    if (!stripped)
        return "Недостаточно данных";
    const lines = stripped.split("\n").map((x) => x.trim()).filter(Boolean);
    const bulletLines = lines.filter((x) => /^[-*•]/.test(x)).slice(0, 2);
    if (bulletLines.length > 0)
        return bulletLines.join(" ").slice(0, 400);
    const sentences = stripped.match(/[^.!?]+[.!?]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
    const limited = (sentences.length > 2 ? sentences.slice(0, 2) : sentences).join(" ").trim();
    return (limited || stripped).slice(0, 400);
}
