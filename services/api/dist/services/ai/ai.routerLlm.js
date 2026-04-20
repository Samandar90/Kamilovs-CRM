"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callIntentRouterLlm = exports.AI_ROUTER_MUTATION_ACTIONS = exports.AI_ROUTER_DB_ACTIONS = void 0;
exports.normalizeRouterDecision = normalizeRouterDecision;
exports.callAiRouterLlm = callAiRouterLlm;
const ai_context_1 = require("./ai.context");
const openai_1 = require("../../lib/openai");
const ROUTER_MODEL = (process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini").trim() || "gpt-4o-mini";
/** Данные из БД (только чтение). */
exports.AI_ROUTER_DB_ACTIONS = [
    "GET_DOCTORS",
    "GET_PATIENTS",
    "GET_APPOINTMENTS",
    "GET_REVENUE",
    "GET_DEBTS",
];
/** Создание сущностей. */
exports.AI_ROUTER_MUTATION_ACTIONS = [
    "CREATE_PATIENT",
    "CREATE_APPOINTMENT",
    "CREATE_PAYMENT",
];
const DB_SET = new Set(exports.AI_ROUTER_DB_ACTIONS);
const MUTATION_SET = new Set(exports.AI_ROUTER_MUTATION_ACTIONS);
const ROUTER_SYSTEM = `Ты — интеллектуальный AI-роутер клиники.

Задача: НЕ отвечать пользователю текстом, а ПРОАНАЛИЗИРОВАТЬ запрос и извлечь параметры (даты, период в днях/неделях, врачи, пациенты).

Ответ ВСЕГДА строго один JSON-объект (без markdown, без текста до или после):
{"type":"db"|"action"|"chat","action":"<КОД>","payload":{...}}

Типы:
- type "db" — нужны данные из базы (списки, цифры).
- type "action" — нужно создать пациента, запись или оплату.
- type "chat" — консультация, медицинский ориентир, ОБЩИЙ вопрос, или когда без уточнения нельзя выбрать период/сущность.

Для type "chat" всегда: "action":"CHAT", "payload":{}.

Если ты не уверен, как классифицировать запрос, или сомневаешься между db/action и свободным ответом — возвращай type "chat" с action "CHAT".

Доступные коды для type "db":
- GET_DOCTORS — payload: {}
- GET_PATIENTS — payload: {} (опционально {"search":"фрагмент ФИО"})
- GET_APPOINTMENTS — payload: {} (опционально dateFrom, dateTo YYYY-MM-DD)
- GET_REVENUE — payload ОБЯЗАТЕЛЬНО отражает сказанный период:
  • «за N дней» / «за последние N дней» → {"days": N} (число из фразы, не подставляй 7 если сказано 8 или 10)
  • «за неделю» → {"days": 7}; «за две недели» → {"days": 14}
  • «за сегодня» / «сегодня» → {"preset":"today"}
  • «за месяц» / «в этом месяце» / «с начала месяца» → {"preset":"month"} (календарный месяц до сегодня)
  • можно {"weeks": W} если пользователь сказал недели
  • если просят аналитику/выручку БЕЗ какого-либо периода и БЕЗ слова «сегодня/месяц» — {"days": 7} как общепринятая неделя
  • если период принципиально непонятен («какая выручка?») — type "chat"
- GET_DEBTS — payload: {}

Доступные коды для type "action":
- CREATE_PATIENT — payload: {"fullName":"ФИО"} или {"name":"ФИО"}
- CREATE_APPOINTMENT — payload: {"patientName","doctorName","date":"YYYY-MM-DD","time":"HH:mm","serviceName"}
- CREATE_PAYMENT — payload: {"amount":число, "invoiceRef"?:строка, "method"?: "cash"|"card"}

ЗАПРЕТ: не игнорируй числа в запросе («8 дней» ≠ 7 дней). Не подменяй период без оснований.

ДИАЛОГ: «его», «эту пациентку» — из истории в payload.

Примеры:
- «какие врачи» → {"type":"db","action":"GET_DOCTORS","payload":{}}
- «аналитика за 8 дней» / «выручка за 8 дней» → {"type":"db","action":"GET_REVENUE","payload":{"days":8}}
- «за 3 дня» → {"type":"db","action":"GET_REVENUE","payload":{"days":3}}
- «за сегодня» → {"type":"db","action":"GET_REVENUE","payload":{"preset":"today"}}
- «за месяц» → {"type":"db","action":"GET_REVENUE","payload":{"preset":"month"}}
- «добавь пациента Иванов» → {"type":"action","action":"CREATE_PATIENT","payload":{"fullName":"Иванов"}}
- «у пациента болит зуб» → {"type":"chat","action":"CHAT","payload":{}}

Не выдумывай ФИО для action; пустые поля опускай.`;
function stripJsonFence(raw) {
    let s = raw.trim();
    const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
    if (fence?.[1])
        s = fence[1].trim();
    return s;
}
function coercePayload(v) {
    if (v && typeof v === "object" && !Array.isArray(v))
        return v;
    return {};
}
function normalizeRouterDecision(data) {
    if (!data || typeof data !== "object")
        return null;
    const o = data;
    const rawType = String(o.type ?? "").trim().toLowerCase();
    let action = String(o.action ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_");
    const payload = coercePayload(o.payload);
    if (!action)
        return null;
    if (rawType === "chat" || action === "CHAT") {
        return { type: "chat", action: "CHAT", payload: {} };
    }
    let useType = null;
    if (rawType === "db" || rawType === "data")
        useType = "db";
    else if (rawType === "action" || rawType === "mutation")
        useType = "action";
    if (DB_SET.has(action) && (useType === null || useType === "action")) {
        useType = "db";
    }
    else if (MUTATION_SET.has(action) && (useType === null || useType === "db")) {
        useType = "action";
    }
    if (useType === "db" && DB_SET.has(action)) {
        return { type: "db", action: action, payload };
    }
    if (useType === "action" && MUTATION_SET.has(action)) {
        return { type: "action", action: action, payload };
    }
    if (useType === null) {
        if (DB_SET.has(action))
            return { type: "db", action: action, payload };
        if (MUTATION_SET.has(action))
            return { type: "action", action: action, payload };
    }
    return null;
}
const HISTORY_TURN_MAX_CHARS = 3500;
/**
 * Первый вызов OpenAI: только решение (db / action / chat), без текста ответа пользователю.
 */
async function callAiRouterLlm(userMessage, _role, crmContext, chatHistory = []) {
    if (!openai_1.hasOpenAI || !openai_1.openai) {
        return { ok: false, reason: "no_client" };
    }
    const text = String(userMessage ?? "").trim().slice(0, 4000);
    if (!text) {
        return { ok: true, rawFallback: "Пустой запрос." };
    }
    const ctxBlock = (0, ai_context_1.formatHumanCrmContextForAssistant)(crmContext, _role);
    const crmSystem = `Снимок CRM:\n${ctxBlock}`.slice(0, 12000);
    const historyMessages = chatHistory.map((h) => ({
        role: h.role,
        content: String(h.content ?? "").trim().slice(0, HISTORY_TURN_MAX_CHARS),
    }));
    try {
        const completion = await openai_1.openai.chat.completions.create({
            model: ROUTER_MODEL,
            temperature: 0.2,
            max_tokens: 400,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: ROUTER_SYSTEM },
                { role: "system", content: crmSystem },
                ...historyMessages,
                { role: "user", content: text },
            ],
        });
        const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
        if (!raw)
            return { ok: true, rawFallback: "Недостаточно данных." };
        const cleaned = stripJsonFence(raw);
        try {
            const parsed = JSON.parse(cleaned);
            const norm = normalizeRouterDecision(parsed);
            if (norm)
                return { ok: true, data: norm };
        }
        catch {
            return { ok: true, rawFallback: raw };
        }
        return { ok: true, rawFallback: raw };
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : "ошибка LLM";
        return { ok: true, rawFallback: `AI временно недоступен: ${msg}` };
    }
}
/** @deprecated используйте callAiRouterLlm */
exports.callIntentRouterLlm = callAiRouterLlm;
