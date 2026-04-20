import type { UserRole } from "../../auth/permissions";
import { getSystemPrompt } from "../../ai/aiAssistantRolePrompts";
import type { AiChatHistoryTurn } from "../aiMessagesService";
import { hasOpenAI, openai } from "@/lib/openai";
import type { AIContext } from "./ai.context";
import { formatHumanCrmContextForAssistant } from "./ai.context";

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
export function normalizeResponderText(text: string, maxLen: number = RESPONDER_TEXT_MAX): string {
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

export type CallResponderOptions = {
  /** Жёсткие цифры из отчётов (например выручка за выбранный период). */
  factualDataBlock?: string;
  /** Роутер не сработал / нет клиента на этапе роутинга — просим модель дать полноценный ответ. */
  fallback?: boolean;
};

export async function callResponderLlm(
  message: string,
  context: AIContext,
  role: UserRole,
  chatHistory: AiChatHistoryTurn[] = [],
  options?: CallResponderOptions
): Promise<string | null> {
  if (!hasOpenAI || !openai) return null;
  try {
    const ctxBlock = formatHumanCrmContextForAssistant(context, role);
    const crmSystem = `Снимок CRM:\n${ctxBlock}`.slice(0, 12000);
    const userContent = String(message ?? "").trim().slice(0, 8000);
    const historyMessages = chatHistory.map((h) => ({
      role: h.role as "user" | "assistant",
      content: String(h.content ?? "").trim().slice(0, HISTORY_TURN_MAX_CHARS),
    }));

    const fact = options?.factualDataBlock?.trim();
    const fallback = Boolean(options?.fallback);
    const fallbackPrefix = fallback
      ? ([{ role: "system" as const, content: RESPONDER_FALLBACK_MODE }] as const)
      : ([] as const);
    const factMessage = fact
      ? ([
          { role: "system" as const, content: RESPONDER_INTELLIGENCE },
          {
            role: "system" as const,
            content: `Фактические данные из отчётов CRM (цифры ответа только отсюда):\n${fact.slice(0, 4500)}`,
          },
        ] as const)
      : ([{ role: "system" as const, content: RESPONDER_INTELLIGENCE }] as const);

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.55,
      max_tokens: 650,
      messages: [
        { role: "system", content: getSystemPrompt(role) },
        ...fallbackPrefix,
        ...factMessage,
        { role: "system", content: crmSystem },
        ...historyMessages,
        { role: "user", content: userContent },
      ],
    });
    const content = completion.choices?.[0]?.message?.content?.trim();
    if (!content) return "Недостаточно данных";
    return normalizeResponderText(
      content,
      fallback ? RESPONDER_TEXT_MAX_FALLBACK : RESPONDER_TEXT_MAX
    );
  } catch (error) {
    const anyErr = error as { message?: string };
    return `${UNAVAILABLE_PREFIX} ${anyErr?.message ?? "ошибка LLM"}`;
  }
}

/** Короткие ответы для ошибок валидации и подтверждений мутаций — не для chat. */
export function normalizeResponse(text: string): string {
  const stripped = String(text ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/(^|\n)\s*(as an ai|i am an ai|assistant:).*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!stripped) return "Недостаточно данных";

  const lines = stripped.split("\n").map((x) => x.trim()).filter(Boolean);
  const bulletLines = lines.filter((x) => /^[-*•]/.test(x)).slice(0, 2);
  if (bulletLines.length > 0) return bulletLines.join(" ").slice(0, 400);

  const sentences = stripped.match(/[^.!?]+[.!?]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
  const limited = (sentences.length > 2 ? sentences.slice(0, 2) : sentences).join(" ").trim();
  return (limited || stripped).slice(0, 400);
}

