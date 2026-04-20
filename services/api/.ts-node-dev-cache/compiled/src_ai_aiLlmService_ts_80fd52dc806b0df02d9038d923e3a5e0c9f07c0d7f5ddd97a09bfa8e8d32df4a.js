"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSISTANT_CHAT_SYSTEM = exports.AI_UNAVAILABLE_PREFIX = exports.OPENAI_CHAT_MODEL = void 0;
exports.shapeAssistantAnswer = shapeAssistantAnswer;
exports.formatCrmContextCompact = formatCrmContextCompact;
exports.formatFactsForPrompt = formatFactsForPrompt;
exports.completeMorningBriefing = completeMorningBriefing;
exports.completeAssistantChat = completeAssistantChat;
exports.completeGeneralCrmAdvice = completeGeneralCrmAdvice;
exports.completeOwnerRecommendations = completeOwnerRecommendations;
exports.completeDashboardRecommendationsFromSummaryJson = completeDashboardRecommendationsFromSummaryJson;
const openai_1 = require("@/lib/openai");
const aiRuleEngine_1 = require("./aiRuleEngine");
const aiAssistantRoleAccess_1 = require("./aiAssistantRoleAccess");
const aiAssistantRolePrompts_1 = require("./aiAssistantRolePrompts");
/** Публичная модель чата — стабильное имя в API OpenAI (см. документацию Models). */
exports.OPENAI_CHAT_MODEL = "gpt-4o-mini";
const MAX_OUT_TOKENS = 220;
/** Префикс ответа при сбое API (оркестратор не подменяет на rule-fallback). */
exports.AI_UNAVAILABLE_PREFIX = "AI временно недоступен:";
/** @deprecated Используйте getSystemPrompt(role) в completeAssistantChat. */
exports.ASSISTANT_CHAT_SYSTEM = `Устаревший базовый промпт; роль задаётся через getSystemPrompt(role).`;
const CRM_SNAPSHOT_RULES = `Интерпретация снимка:
— Нули и отсутствие оплат — это тоже факт CRM; формулируй нейтрально, без догадок о кассе, если это не следует из данных.
— Суммы выручки — net по счетам (как отчёты), зона дат — REPORTS_TIMEZONE в блоке фактов.
— Дай 1–2 практичных шага только там, где уместно; не заполняй ответ общими фразами.`;
function buildStructuredContextBlock(ctx) {
    const doctors = ctx.doctors.length > 0
        ? ctx.doctors.map((d) => `${d.name}${d.specialty ? ` (${d.specialty})` : ""}`).join("; ")
        : "нет данных";
    const services = ctx.activeServices.length > 0
        ? ctx.activeServices.map((s) => `${s.name}${s.price != null ? ` (${(0, aiRuleEngine_1.formatSum)(s.price)})` : ""}`).join("; ")
        : "нет данных";
    return [
        "Структурированный контекст CRM:",
        `revenueToday=${ctx.revenueToday}`,
        `revenue7d=${ctx.revenue7d}`,
        `unpaidInvoicesCount=${ctx.unpaidInvoicesCount}`,
        `unpaidInvoicesAmount=${ctx.unpaidInvoicesAmount}`,
        `appointmentsToday=${ctx.appointmentsToday}`,
        `completedToday=${ctx.completedToday}`,
        `pendingToday=${ctx.pendingToday}`,
        `avgCheckToday=${ctx.avgCheckToday}`,
        `avgCheck7d=${ctx.avgCheck7d}`,
        `topDoctor=${ctx.topDoctor ?? "null"}`,
        `cashShiftStatus=${ctx.cashShiftStatus}`,
        `noShow30d=${ctx.noShow30d}`,
        `doctors=${doctors}`,
        `activeServices=${services}`,
    ].join("\n");
}
function keepOnlyRussianChars(raw) {
    const lines = raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const filtered = lines.filter((line) => /[а-яё]/i.test(line) || /\d/.test(line));
    return (filtered.length > 0 ? filtered : lines).join("\n");
}
function cutToMaxSentences(raw, maxSentences = 4) {
    const parts = raw.match(/[^.!?]+[.!?]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
    if (parts.length <= maxSentences)
        return raw.trim();
    return parts.slice(0, maxSentences).join(" ").trim();
}
function shapeAssistantAnswer(raw) {
    const cleaned = keepOnlyRussianChars(raw)
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (!cleaned)
        return "Недостаточно данных.";
    const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
    const bulletLines = lines.filter((line) => /^[-•*]/.test(line));
    let normalized;
    if (bulletLines.length > 0) {
        normalized = bulletLines.slice(0, 3).map((line) => line.replace(/^[•*]/, "-")).join("\n");
    }
    else {
        normalized = cutToMaxSentences(cleaned, 3);
    }
    if (/^(as an ai|i am|assistant:)/i.test(normalized))
        return "Недостаточно данных.";
    return normalized.slice(0, 560).trim() || "Недостаточно данных.";
}
/** Ключевые метрики для контекста в чате. */
function formatCrmContextCompact(f) {
    const todayMoney = f.paymentsCountToday === 0
        ? "оплат сегодня не зафиксировано (0 платежей)"
        : `${(0, aiRuleEngine_1.formatSum)(f.revenueToday)} (${f.paymentsCountToday} платежей)`;
    return [
        `Сегодня: ${todayMoney}`,
        `Записей на сегодня: ${f.appointmentsToday} (завершено ${f.appointmentsCompletedToday}, в ожидании ${f.appointmentsScheduledToday})`,
        `Неоплаченных счетов: ${f.unpaidCount} на ${(0, aiRuleEngine_1.formatSum)(f.unpaidTotal)}`,
        `Средний чек сегодня: ${f.avgCheckToday > 0 ? (0, aiRuleEngine_1.formatSum)(f.avgCheckToday) : "нет данных (нет платежей)"}`,
    ].join("\n");
}
/** Текст для промпта: только агрегаты, без массивов и сырых выгрузок. */
function formatFactsForPrompt(f) {
    const todayLine = f.paymentsCountToday === 0
        ? `Выручка сегодня: оплат не зафиксировано (0 платежей; сумма по оплатам ${(0, aiRuleEngine_1.formatSum)(f.revenueToday)})`
        : `Выручка сегодня: ${(0, aiRuleEngine_1.formatSum)(f.revenueToday)} (${f.paymentsCountToday} платежей)`;
    return [
        todayLine,
        `Выручка за 7 дней: ${(0, aiRuleEngine_1.formatSum)(f.revenue7d)} (${f.paymentsCount7d} платежей)`,
        `Выручка за всё время (все успешные оплаты в CRM): ${(0, aiRuleEngine_1.formatSum)(f.revenueTotal)}`,
        `Средний чек сегодня / за 7 дней: ${f.avgCheckToday > 0 ? (0, aiRuleEngine_1.formatSum)(f.avgCheckToday) : "—"} / ${f.avgCheck7d > 0 ? (0, aiRuleEngine_1.formatSum)(f.avgCheck7d) : "—"}`,
        `Неоплаченных счетов: ${f.unpaidCount}, на сумму ${(0, aiRuleEngine_1.formatSum)(f.unpaidTotal)}`,
        `Записей сегодня: всего ${f.appointmentsToday}, завершено ${f.appointmentsCompletedToday}, в ожидании ${f.appointmentsScheduledToday}`,
        `Отмен/no-show за 30 дней: ${f.noShowOrCancelled30d}`,
        `Средняя дневная выручка (7 дней): ${(0, aiRuleEngine_1.formatSum)(f.avgDailyRevenue7Days)}`,
        `Смена кассы: ${f.cashShiftOpen ? "открыта" : "закрыта"}`,
        `Топ-врач по оплатам: ${f.topDoctorName ?? "нет данных"} (${f.topDoctorTotal > 0 ? (0, aiRuleEngine_1.formatSum)(f.topDoctorTotal) : "—"})`,
        `Топ-услуга по оплатам: ${f.topServiceName ?? "нет данных"} (${f.topServiceTotal > 0 ? (0, aiRuleEngine_1.formatSum)(f.topServiceTotal) : "—"})`,
        `Справочники: врачей ${f.doctorsCount}, услуг ${f.servicesCount}, всего записей в базе ${f.appointmentsCount}`,
    ].join("\n");
}
function isUnavailableMessage(s) {
    return s.startsWith(exports.AI_UNAVAILABLE_PREFIX);
}
/**
 * Вызов `openai.chat.completions.create` (клиент — `@/lib/openai`).
 * Логирует запрос/ответ и ошибки полностью.
 */
async function runOpenAiChatCompletion(params) {
    const model = exports.OPENAI_CHAT_MODEL;
    const prompt = params.promptForLog;
    if (!openai_1.hasOpenAI || !openai_1.openai) {
        // eslint-disable-next-line no-console
        console.log("=== AI DEBUG START ===");
        // eslint-disable-next-line no-console
        console.log("MODEL:", model);
        // eslint-disable-next-line no-console
        console.log("HAS KEY:", !!process.env.OPENAI_API_KEY);
        // eslint-disable-next-line no-console
        console.log("PROMPT:", prompt.slice(0, 300));
        // eslint-disable-next-line no-console
        console.log("(пропуск: клиент OpenAI не создан — your_key_here или пустой ключ)");
        // eslint-disable-next-line no-console
        console.log("=== AI DEBUG END ===");
        return null;
    }
    // eslint-disable-next-line no-console
    console.log("[aiLlmService]", params.label);
    // eslint-disable-next-line no-console
    console.log("=== AI DEBUG START ===");
    // eslint-disable-next-line no-console
    console.log("MODEL:", model);
    // eslint-disable-next-line no-console
    console.log("HAS KEY:", !!process.env.OPENAI_API_KEY);
    // eslint-disable-next-line no-console
    console.log("PROMPT:", prompt.slice(0, 300));
    let res = null;
    let caught = undefined;
    try {
        res = await openai_1.openai.chat.completions.create({
            model,
            max_tokens: params.maxTokens ?? MAX_OUT_TOKENS,
            messages: params.messages,
            ...(params.responseFormat ? { response_format: params.responseFormat } : {}),
        });
        // eslint-disable-next-line no-console
        console.log("AI RAW RESPONSE:", res);
    }
    catch (e) {
        caught = e;
        // eslint-disable-next-line no-console
        console.error("AI ERROR:", e);
    }
    // eslint-disable-next-line no-console
    console.log("=== AI DEBUG END ===");
    /** Fallback «недоступен» — только здесь (исключение от SDK / сети). */
    if (caught !== undefined) {
        const anyErr = caught;
        const errMsg = anyErr?.message ?? anyErr?.error?.message ?? String(caught);
        // eslint-disable-next-line no-console
        console.error("[AI ERROR FULL]", caught);
        const httpStatus = anyErr?.status ?? anyErr?.response?.status;
        // eslint-disable-next-line no-console
        console.error("error.message:", errMsg);
        // eslint-disable-next-line no-console
        console.error("response.status:", httpStatus === undefined ? "(нет в объекте ошибки)" : httpStatus);
        if (anyErr?.response?.data !== undefined) {
            // eslint-disable-next-line no-console
            console.error("response.data:", JSON.stringify(anyErr.response.data, null, 2));
        }
        return `${exports.AI_UNAVAILABLE_PREFIX} ${errMsg}`;
    }
    if (!res) {
        // eslint-disable-next-line no-console
        console.error("[AI ERROR FULL] ответ create без исключения, но res пуст — неконсистентное состояние");
        return null;
    }
    const msg0 = res.choices?.[0]?.message;
    const content = msg0?.content;
    if (content != null) {
        return content;
    }
    const refusal = msg0 && typeof msg0 === "object" && "refusal" in msg0
        ? String(msg0.refusal ?? "")
        : "";
    if (refusal) {
        return refusal;
    }
    // eslint-disable-next-line no-console
    console.warn("[aiLlmService] choices[0].message без content/refusal — возвращаем пустую строку (ответ API успешный)");
    return "";
}
const MORNING_BRIEFING_SYSTEM = `Ты — AI ассистент клиники уровня бизнес-консультанта.

Правила:
- Пиши очень кратко: цель не больше 6 строк на весь ответ; при необходимости объединяй пункты через «; ».
- Показывай изменения к позавчера через revenueChange и patientsChange (целые проценты из JSON). Если null — деления не было (база 0); % не придумывай.
- Не просто анализируй — давай действия.
- Конкретика только из JSON; метрик и фактов не дополняй.
- Без воды.

Формат:

Приветствие (userName, одна строка)

📊 Вчера:
{выручка} ({+/- revenueChange}%) — только если revenueYesterday не null; если revenueChange null — без процента
{пациенты patientsYesterday} ({+/- patientsChange}%) — если patientsChange null — без процента
Если freeSlotsToday не null — коротко упомяни число слотов на сегодня.

⚠️ Проблемы:
До 2 пунктов. Если по данным всё ровно — напиши ровно: «Стабильный день».

💡 Действия:
До 2 пунктов, конкретные шаги на сегодня.

Если revenueYesterday и unpaidInvoicesCount в JSON null — нет доступа к финансам: не обсуждай выручку и неоплаты.

Если freeSlotsToday === null — не упоминай слоты.

Если scope === "doctor" — метрики только этого врача; иначе клиника целиком.`;
/**
 * Утренний брифинг: один user-message с JSON контекста.
 */
async function completeMorningBriefing(metricsPayload) {
    const userContent = `Вот данные: ${JSON.stringify(metricsPayload)}. Сделай вау-брифинг.`;
    return runOpenAiChatCompletion({
        label: "completeMorningBriefing",
        promptForLog: `morning-briefing role=${String(metricsPayload.role)} scope=${String(metricsPayload.scope)}`,
        maxTokens: 320,
        messages: [
            { role: "system", content: MORNING_BRIEFING_SYSTEM },
            { role: "user", content: userContent },
        ],
    });
}
/**
 * Диалог с памятью: system + CRM-контекст + история + последнее сообщение пользователя.
 * Модель: gpt-4o-mini (OPENAI_CHAT_MODEL).
 */
async function completeAssistantChat(facts, domainIntent, context, history, userMessage, role) {
    const factsForPrompt = (0, aiAssistantRoleAccess_1.redactSummaryFactsForRole)(facts, role);
    const contextForPrompt = (0, aiAssistantRoleAccess_1.redactStructuredContextForRole)(context, role);
    const snapshotBlock = [
        "Текущий снимок CRM (актуален для этого ответа):",
        formatFactsForPrompt(factsForPrompt),
        "",
        buildStructuredContextBlock(contextForPrompt),
        "",
        `Intent: ${domainIntent}`,
        "",
        CRM_SNAPSHOT_RULES,
    ].join("\n");
    const safeHistory = history
        .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-24)
        .map((m) => ({
        role: m.role,
        content: m.content.trim().slice(0, 8000),
    }));
    const um = userMessage.trim().slice(0, 8000);
    const promptForLog = `${um.slice(0, 200)} | history:${safeHistory.length}`;
    const raw = await runOpenAiChatCompletion({
        label: "completeAssistantChat",
        promptForLog,
        maxTokens: 500,
        messages: [
            { role: "system", content: (0, aiAssistantRolePrompts_1.getSystemPrompt)(role) },
            { role: "system", content: snapshotBlock },
            ...safeHistory.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: um },
        ],
    });
    if (raw === null)
        return null;
    if (isUnavailableMessage(raw))
        return raw;
    return shapeAssistantAnswer(raw);
}
async function completeGeneralCrmAdvice(facts) {
    const summary = formatFactsForPrompt(facts);
    const promptForLog = `Факты: ${summary}\n\nДай один короткий совет владельцу клиники (что сделать сегодня).`;
    const raw = await runOpenAiChatCompletion({
        label: "completeGeneralCrmAdvice",
        promptForLog,
        messages: [
            {
                role: "system",
                content: "Ты бизнес-консультант клиники. Ответь на русском максимум 3 коротких предложения: цифры, вывод, что сделать. Без воды и без выдуманных данных — только из переданных фактов.",
            },
            {
                role: "user",
                content: promptForLog,
            },
        ],
    });
    if (raw === null)
        return null;
    if (isUnavailableMessage(raw))
        return raw;
    return shapeAssistantAnswer(raw);
}
async function completeOwnerRecommendations(facts) {
    const summary = formatFactsForPrompt(facts);
    const promptForLog = `Факты: ${summary}\n\nДве рекомендации через перенос строки.`;
    const raw = await runOpenAiChatCompletion({
        label: "completeOwnerRecommendations",
        promptForLog,
        messages: [
            {
                role: "system",
                content: "Ты бизнес-консультант клиники. На русском: ровно 2 короткие строки — рекомендации владельцу с опорой на факты, без таблиц и без выдуманных цифр.",
            },
            {
                role: "user",
                content: promptForLog,
            },
        ],
    });
    if (raw === null)
        return null;
    if (isUnavailableMessage(raw))
        return raw;
    return shapeAssistantAnswer(raw);
}
// --- Dashboard recommendations (тот же runner; отдельный промпт и парсинг JSON) ---
const parseRecommendationsJson = (content) => {
    const trimmed = content.trim();
    const tryParse = (raw) => {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && "recommendations" in parsed) {
                const rec = parsed.recommendations;
                if (Array.isArray(rec) && rec.every((x) => typeof x === "string")) {
                    return rec.map((s) => s.trim()).filter(Boolean);
                }
            }
        }
        catch {
            return null;
        }
        return null;
    };
    const direct = tryParse(trimmed);
    if (direct && direct.length)
        return direct;
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence?.[1]) {
        const inner = tryParse(fence[1].trim());
        if (inner && inner.length)
            return inner;
    }
    return null;
};
/**
 * Рекомендации для экрана отчётов — тот же OpenAI runner, что и у ассистента.
 * При ошибке API возвращает массив из одной строки `AI временно недоступен: ...`.
 */
async function completeDashboardRecommendationsFromSummaryJson(summaryJson) {
    const promptForLog = `Ты бизнес-аналитик клиники. Дай краткие рекомендации по увеличению прибыли, загрузке врачей и оптимизации услуг на основе данных: ${summaryJson}

Верни ТОЛЬКО JSON объекта вида: {"recommendations":["пункт1","пункт2","пункт3"]} — 3–6 коротких строк на русском, без markdown и без пояснений вне JSON.`;
    const raw = await runOpenAiChatCompletion({
        label: "completeDashboardRecommendationsFromSummaryJson",
        promptForLog,
        maxTokens: 500,
        messages: [
            {
                role: "system",
                content: "Ты бизнес-аналитик медицинской клиники. Отвечай только валидным JSON с полем recommendations.",
            },
            { role: "user", content: promptForLog },
        ],
        responseFormat: { type: "json_object" },
    });
    if (raw === null)
        return null;
    if (isUnavailableMessage(raw))
        return [raw];
    const parsed = parseRecommendationsJson(raw);
    if (parsed?.length)
        return parsed;
    /** Успешный ответ модели, но не JSON — всё равно отдаём сырой текст, без fallback-сообщения. */
    return [raw];
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvYWkvYWlMbG1TZXJ2aWNlLnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9haS9haUxsbVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBb0VBLG9EQW1CQztBQUdELDBEQVdDO0FBR0Qsb0RBbUJDO0FBc0pELDBEQVdDO0FBUUQsc0RBK0NDO0FBRUQsNERBdUJDO0FBRUQsb0VBdUJDO0FBa0NELDBHQXlCQztBQTliRCx5Q0FBaUQ7QUFFakQsaURBQTJDO0FBQzNDLG1FQUdpQztBQUNqQyxxRUFBMkQ7QUFFM0QscUZBQXFGO0FBQ3hFLFFBQUEsaUJBQWlCLEdBQUcsYUFBYSxDQUFDO0FBRS9DLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQztBQUUzQiwrRUFBK0U7QUFDbEUsUUFBQSxxQkFBcUIsR0FBRyx5QkFBeUIsQ0FBQztBQUUvRCw2RUFBNkU7QUFDaEUsUUFBQSxxQkFBcUIsR0FBRyx1RUFBdUUsQ0FBQztBQUU3RyxNQUFNLGtCQUFrQixHQUFHOzs7cUZBRzBELENBQUM7QUFFdEYsU0FBUywyQkFBMkIsQ0FBQyxHQUFpQztJQUNwRSxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDO1FBQ3BDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDekYsQ0FBQyxDQUFDLFlBQVksQ0FBQztJQUNqQixNQUFNLFFBQVEsR0FBRyxHQUFHLENB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O0lBRXhKLE1BQU0sR0FBRyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7UUFDeEMsS0FBSyxFQUFFLGlEQUFpRDtRQUN4RCxZQUFZO1FBQ1osU0FBUyxFQUFFLEdBQUc7UUFDZCxRQUFRLEVBQUU7WUFDUjtnQkFDRSxJQUFJLEVBQUUsUUFBUTtnQkFDZCxPQUFPLEVBQUUsK0ZBQStGO2FBQ3pHO1lBQ0QsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUU7U0FDeEM7UUFDRCxjQUFjLEVBQUUsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFO0tBQ3hDLENBQUMsQ0FBQztJQUVILElBQUksR0FBRyxLQUFLLElBQUk7UUFBRSxPQUFPLElBQUksQ0FBQztJQUM5QixJQUFJLG9CQUFvQixDQUFDLEdBQUcsQ0FBQztRQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM1QyxNQUFNLE1BQU0sR0FBRyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM3QyxJQUFJLE1BQU0sRUFBRSxNQUFNO1FBQUUsT0FBTyxNQUFNLENBQUM7SUFDbEMsZ0dBQWdHO0lBQ2hHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUNmLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IENoYXRDb21wbGV0aW9uQ3JlYXRlUGFyYW1zIH0gZnJvbSBcIm9wZW5haS9yZXNvdXJjZXMvY2hhdC9jb21wbGV0aW9uc1wiO1xyXG5pbXBvcnQgdHlwZSB7IFVzZXJSb2xlIH0gZnJvbSBcIi4uL2F1dGgvcGVybWlzc2lvbnNcIjtcclxuaW1wb3J0IHsgaGFzT3BlbkFJLCBvcGVuYWkgfSBmcm9tIFwiQC9saWIvb3BlbmFpXCI7XHJcbmltcG9ydCB0eXBlIHsgQWlBc3Npc3RhbnRTdHJ1Y3R1cmVkQ29udGV4dCwgQWlEb21haW5JbnRlbnQsIEFpTGxtU3VtbWFyeUZhY3RzIH0gZnJvbSBcIi4vYWlUeXBlc1wiO1xyXG5pbXBvcnQgeyBmb3JtYXRTdW0gfSBmcm9tIFwiLi9haVJ1bGVFbmdpbmVcIjtcclxuaW1wb3J0IHtcclxuICByZWRhY3RTdHJ1Y3R1cmVkQ29udGV4dEZvclJvbGUsXHJcbiAgcmVkYWN0U3VtbWFyeUZhY3RzRm9yUm9sZSxcclxufSBmcm9tIFwiLi9haUFzc2lzdGFudFJvbGVBY2Nlc3NcIjtcclxuaW1wb3J0IHsgZ2V0U3lzdGVtUHJvbXB0IH0gZnJvbSBcIi4vYWlBc3Npc3RhbnRSb2xlUHJvbXB0c1wiO1xyXG5cclxuLyoqINCf0YPQsdC70LjRh9C90LDRjyDQvNC+0LTQtdC70Ywg0YfQsNGC0LAg4oCUINGB0YLQsNCx0LjQu9GM0L3QvtC1INC40LzRjyDQsiBBUEkgT3BlbkFJICjRgdC8LiDQtNC+0LrRg9C80LXQvdGC0LDRhtC40Y4gTW9kZWxzKS4gKi9cclxuZXhwb3J0IGNvbnN0IE9QRU5BSV9DSEFUX01PREVMID0gXCJncHQtNG8tbWluaVwiO1xyXG5cclxuY29uc3QgTUFYX09VVF9UT0tFTlMgPSAyMjA7XHJcblxyXG4vKiog0J/RgNC10YTQuNC60YEg0L7RgtCy0LXRgtCwINC/0YDQuCDRgdCx0L7QtSBBUEkgKNC+0YDQutC10YHRgtGA0LDRgtC+0YAg0L3QtSDQv9C+0LTQvNC10L3Rj9C10YIg0L3QsCBydWxlLWZhbGxiYWNrKS4gKi9cclxuZXhwb3J0IGNvbnN0IEFJX1VOQVZBSUxBQkxFX1BSRUZJWCA9IFwiQUkg0LLRgNC10LzQtdC90L3QviDQvdC10LTQvtGB0YLRg9C/0LXQvTpcIjtcclxuXHJcbi8qKiBAZGVwcmVjYXRlZCDQmNGB0L/QvtC70YzQt9GD0LnRgtC1IGdldFN5c3RlbVByb21wdChyb2xlKSDQsiBjb21wbGV0ZUFzc2lzdGFudENoYXQuICovXHJcbmV4cG9ydCBjb25zdCBBU1NJU1RBTlRfQ0hBVF9TWVNURU0gPSBg0KPRgdGC0LDRgNC10LLRiNC40Lkg0LHQsNC30L7QstGL0Lkg0L/RgNC+0LzQv9GCOyDRgNC+0LvRjCDQt9Cw0LTQsNGR0YLRgdGPINGH0LXRgNC10LcgZ2V0U3lzdGVtUHJvbXB0KHJvbGUpLmA7XHJcblxyXG5jb25zdCBDUk1fU05BUFNIT1RfUlVMRVMgPSBg0JjQvdGC0LXRgNC/0YDQtdGC0LDRhtC40Y8g0YHQvdC40LzQutCwOlxyXG7igJQg0J3Rg9C70Lgg0Lgg0L7RgtGB0YPRgtGB0YLQstC40LUg0L7Qv9C70LDRgiDigJQg0Y3RgtC+INGC0L7QttC1INGE0LDQutGCIENSTTsg0YTQvtGA0LzRg9C70LjRgNGD0Lkg0L3QtdC50YLRgNCw0LvRjNC90L4sINCx0LXQtyDQtNC+0LPQsNC00L7QuiDQviDQutCw0YHRgdC1LCDQtdGB0LvQuCDRjdGC0L4g0L3QtSDRgdC70LXQtNGD0LXRgiDQuNC3INC00LDQvdC90YvRhS5cclxu4oCUINCh0YPQvNC80Ysg0LLRi9GA0YPRh9C60Lgg4oCUIG5ldCDQv9C+INGB0YfQtdGC0LDQvCAo0LrQsNC6INC+0YLRh9GR0YLRiyksINC30L7QvdCwINC00LDRgiDigJQgUkVQT1JUU19USU1FWk9ORSDQsiDQsdC70L7QutC1INGE0LDQutGC0L7Qsi5cclxu4oCUINCU0LDQuSAx4oCTMiDQv9GA0LDQutGC0LjRh9C90YvRhSDRiNCw0LPQsCDRgtC+0LvRjNC60L4g0YLQsNC8LCDQs9C00LUg0YPQvNC10YHRgtC90L47INC90LUg0LfQsNC/0L7Qu9C90Y/QuSDQvtGC0LLQtdGCINC+0LHRidC40LzQuCDRhNGA0LDQt9Cw0LzQuC5gO1xyXG5cclxuZnVuY3Rpb24gYnVpbGRTdHJ1Y3R1cmVkQ29udGV4dEJsb2NrKGN0eDogQWlBc3Npc3RhbnRTdHJ1Y3R1cmVkQ29udGV4dCk6IHN0cmluZyB7XHJcbiAgY29uc3QgZG9jdG9ycyA9IGN0eC5kb2N0b3JzLmxlbmd0aCA+IDBcclxuICAgID8gY3R4LmRvY3RvcnMubWFwKChkKSA9PiBgJHtkLm5hbWV9JHtkLnNwZWNpYWx0eSA/IGAgKCR7ZC5zcGVjaWFsdHl9KWAgOiBcIlwifWApLmpvaW4oXCI7IFwiKVxyXG4gICAgOiBcItC90LXRgiDQtNCw0L3QvdGL0YVcIjtcclxuICBjb25zdCBzZXJ2aWNlcyA9IGN0eC5hY3RpdmVTZXJ2aWNlcy5sZW5ndGggPiAwXHJcbiAgICA/IGN0eC5hY3RpdmVTZXJ2aWNlcy5tYXAoKHMpID0+IGAke3MubmFtZX0ke3MucHJpY2UgIT0gbnVsbCA/IGAgKCR7Zm9ybWF0U3VtKHMucHJpY2UpfSlgIDogXCJcIn1gKS5qb2luKFwiOyBcIilcclxuICAgIDogXCLQvdC10YIg0LTQsNC90L3Ri9GFXCI7XHJcbiAgcmV0dXJuIFtcclxuICAgIFwi0KHRgtGA0YPQutGC0YPRgNC40YDQvtCy0LDQvdC90YvQuSDQutC+0L3RgtC10LrRgdGCIENSTTpcIixcclxuICAgIGByZXZlbnVlVG9kYXk9JHtjdHgucmV2ZW51ZVRvZGF5fWAsXHJcbiAgICBgcmV2ZW51ZTdkPSR7Y3R4LnJldmVudWU3ZH1gLFxyXG4gICAgYHVucGFpZEludm9pY2VzQ291bnQ9JHtjdHgudW5wYWlkSW52b2ljZXNDb3VudH1gLFxyXG4gICAgYHVucGFpZEludm9pY2VzQW1vdW50PSR7Y3R4LnVucGFpZEludm9pY2VzQW1vdW50fWAsXHJcbiAgICBgYXBwb2ludG1lbnRzVG9kYXk9JHtjdHguYXBwb2ludG1lbnRzVG9kYXl9YCxcclxuICAgIGBjb21wbGV0ZWRUb2RheT0ke2N0eC5jb21wbGV0ZWRUb2RheX1gLFxyXG4gICAgYHBlbmRpbmdUb2RheT0ke2N0eC5wZW5kaW5nVG9kYXl9YCxcclxuICAgIGBhdmdDaGVja1RvZGF5PSR7Y3R4LmF2Z0NoZWNrVG9kYXl9YCxcclxuICAgIGBhdmdDaGVjazdkPSR7Y3R4LmF2Z0NoZWNrN2R9YCxcclxuICAgIGB0b3BEb2N0b3I9JHtjdHgudG9wRG9jdG9yID8/IFwibnVsbFwifWAsXHJcbiAgICBgY2FzaFNoaWZ0U3RhdHVzPSR7Y3R4LmNhc2hTaGlmdFN0YXR1c31gLFxyXG4gICAgYG5vU2hvdzMwZD0ke2N0eC5ub1Nob3czMGR9YCxcclxuICAgIGBkb2N0b3JzPSR7ZG9jdG9yc31gLFxyXG4gICAgYGFjdGl2ZVNlcnZpY2VzPSR7c2VydmljZXN9YCxcclxuICBdLmpvaW4oXCJcXG5cIik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGtlZXBPbmx5UnVzc2lhbkNoYXJzKHJhdzogc3RyaW5nKTogc3RyaW5nIHtcclxuICBjb25zdCBsaW5lcyA9IHJhd1xyXG4gICAgLnNwbGl0KFwiXFxuXCIpXHJcbiAgICAubWFwKChsaW5lKSA9PiBsaW5lLnRyaW0oKSlcclxuICAgIC5maWx0ZXIoQm9vbGVhbik7XHJcbiAgY29uc3QgZmlsdGVyZWQgPSBsaW5lcy5maWx0ZXIoKGxpbmUpID0+IC9b0LAt0Y/RkV0vaS50ZXN0KGxpbmUpIHx8IC9cXGQvLnRlc3QobGluZSkpO1xyXG4gIHJldHVybiAoZmlsdGVyZWQubGVuZ3RoID4gMCA/IGZpbHRlcmVkIDogbGluZXMpLmpvaW4oXCJcXG5cIik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGN1dFRvTWF4U2VudGVuY2VzKHJhdzogc3RyaW5nLCBtYXhTZW50ZW5jZXMgPSA0KTogc3RyaW5nIHtcclxuICBjb25zdCBwYXJ0cyA9IHJhdy5tYXRjaCgvW14uIT9dK1suIT9dPy9nKT8ubWFwKCh4KSA9PiB4LnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pID8/IFtdO1xyXG4gIGlmIChwYXJ0cy5sZW5ndGggPD0gbWF4U2VudGVuY2VzKSByZXR1cm4gcmF3LnRyaW0oKTtcclxuICByZXR1cm4gcGFydHMuc2xpY2UoMCwgbWF4U2VudGVuY2VzKS5qb2luKFwiIFwiKS50cmltKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzaGFwZUFzc2lzdGFudEFuc3dlcihyYXc6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgY29uc3QgY2xlYW5lZCA9IGtlZXBPbmx5UnVzc2lhbkNoYXJzKHJhdylcclxuICAgIC5yZXBsYWNlKC9gYGBbXFxzXFxTXSo/YGBgL2csIFwiXCIpXHJcbiAgICAucmVwbGFjZSgvXFxzezIsfS9nLCBcIiBcIilcclxuICAgIC5yZXBsYWNlKC9cXG57Myx9L2csIFwiXFxuXFxuXCIpXHJcbiAgICAudHJpbSgpO1xyXG4gIGlmICghY2xlYW5lZCkgcmV0dXJuIFwi0J3QtdC00L7RgdGC0LDRgtC+0YfQvdC+INC00LDQvdC90YvRhS5cIjtcclxuXHJcbiAgY29uc3QgbGluZXMgPSBjbGVhbmVkLnNwbGl0KFwiXFxuXCIpLm1hcCgobGluZSkgPT4gbGluZS50cmltKCkpLmZpbHRlcihCb29sZWFuKTtcclxuICBjb25zdCBidWxsZXRMaW5lcyA9IGxpbmVzLmZpbHRlcigobGluZSkgPT4gL15bLeKAoipdLy50ZXN0KGxpbmUpKTtcclxuICBsZXQgbm9ybWFsaXplZDogc3RyaW5nO1xyXG4gIGlmIChidWxsZXRMaW5lcy5sZW5ndGggPiAwKSB7XHJcbiAgICBub3JtYWxpemVkID0gYnVsbGV0TGluZXMuc2xpY2UoMCwgMykubWFwKChsaW5lKSA9PiBsaW5lLnJlcGxhY2UoL15b4oCiKl0vLCBcIi1cIikpLmpvaW4oXCJcXG5cIik7XHJcbiAgfSBlbHNlIHtcclxuICAgIG5vcm1hbGl6ZWQgPSBjdXRUb01heFNlbnRlbmNlcyhjbGVhbmVkLCAzKTtcclxuICB9XHJcblxyXG4gIGlmICgvXihhcyBhbiBhaXxpIGFtfGFzc2lzdGFudDopL2kudGVzdChub3JtYWxpemVkKSkgcmV0dXJuIFwi0J3QtdC00L7RgdGC0LDRgtC+0YfQvdC+INC00LDQvdC90YvRhS5cIjtcclxuICByZXR1cm4gbm9ybWFsaXplZC5zbGljZSgwLCA1NjApLnRyaW0oKSB8fCBcItCd0LXQtNC+0YHRgtCw0YLQvtGH0L3QviDQtNCw0L3QvdGL0YUuXCI7XHJcbn1cclxuXHJcbi8qKiDQmtC70Y7Rh9C10LLRi9C1INC80LXRgtGA0LjQutC4INC00LvRjyDQutC+0L3RgtC10LrRgdGC0LAg0LIg0YfQsNGC0LUuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRDcm1Db250ZXh0Q29tcGFjdChmOiBBaUxsbVN1bW1hcnlGYWN0cyk6IHN0cmluZyB7XHJcbiAgY29uc3QgdG9kYXlNb25leSA9XHJcbiAgICBmLnBheW1lbnRzQ291bnRUb2RheSA9PT0gMFxyXG4gICAgICA/IFwi0L7Qv9C70LDRgiDRgdC10LPQvtC00L3RjyDQvdC1INC30LDRhNC40LrRgdC40YDQvtCy0LDQvdC+ICgwINC/0LvQsNGC0LXQttC10LkpXCJcclxuICAgICAgOiBgJHtmb3JtYXRTdW0oZi5yZXZlbnVlVG9kYXkpfSAoJHtmLnBheW1lbnRzQ291bnRUb2RheX0g0L/Qu9Cw0YLQtdC20LXQuSlgO1xyXG4gIHJldHVybiBbXHJcbiAgICBg0KHQtdCz0L7QtNC90Y86ICR7dG9kYXlNb25leX1gLFxyXG4gICAgYNCX0LDQv9C40YHQtdC5INC90LAg0YHQtdCz0L7QtNC90Y86ICR7Zi5hcHBvaW50bWVudHNUb2RheX0gKNC30LDQstC10YDRiNC10L3QviAke2YuYXBwb2ludG1lbnRzQ29tcGxldGVkVG9kYXl9LCDQsiDQvtC20LjQtNCw0L3QuNC4ICR7Zi5hcHBvaW50bWVudHNTY2hlZHVsZWRUb2RheX0pYCxcclxuICAgIGDQndC10L7Qv9C70LDRh9C10L3QvdGL0YUg0YHRh9C10YLQvtCyOiAke2YudW5wYWlkQ291bnR9INC90LAgJHtmb3JtYXRTdW0oZi51bnBhaWRUb3RhbCl9YCxcclxuICAgIGDQodGA0LXQtNC90LjQuSDRh9C10Log0YHQtdCz0L7QtNC90Y86ICR7Zi5hdmdDaGVja1RvZGF5ID4gMCA/IGZvcm1hdFN1bShmLmF2Z0NoZWNrVG9kYXkpIDogXCLQvdC10YIg0LTQsNC90L3Ri9GFICjQvdC10YIg0L/Qu9Cw0YLQtdC20LXQuSlcIn1gLFxyXG4gIF0uam9pbihcIlxcblwiKTtcclxufVxyXG5cclxuLyoqINCi0LXQutGB0YIg0LTQu9GPINC/0YDQvtC80L/RgtCwOiDRgtC+0LvRjNC60L4g0LDQs9GA0LXQs9Cw0YLRiywg0LHQtdC3INC80LDRgdGB0LjQstC+0LIg0Lgg0YHRi9GA0YvRhSDQstGL0LPRgNGD0LfQvtC6LiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0RmFjdHNGb3JQcm9tcHQoZjogQWlMbG1TdW1tYXJ5RmFjdHMpOiBzdHJpbmcge1xyXG4gIGNvbnN0IHRvZGF5TGluZSA9XHJcbiAgICBmLnBheW1lbnRzQ291bnRUb2RheSA9PT0gMFxyXG4gICAgICA/IGDQktGL0YDRg9GH0LrQsCDRgdC10LPQvtC00L3Rjzog0L7Qv9C70LDRgiDQvdC1INC30LDRhNC40LrRgdC40YDQvtCy0LDQvdC+ICgwINC/0LvQsNGC0LXQttC10Lk7INGB0YPQvNC80LAg0L/QviDQvtC/0LvQsNGC0LDQvCAke2Zvcm1hdFN1bShmLnJldmVudWVUb2RheSl9KWBcclxuICAgICAgOiBg0JLRi9GA0YPRh9C60LAg0YHQtdCz0L7QtNC90Y86ICR7Zm9ybWF0U3VtKGYucmV2ZW51ZVRvZGF5KX0gKCR7Zi5wYXltZW50c0NvdW50VG9kYXl9INC/0LvQsNGC0LXQttC10LkpYDtcclxuICByZXR1cm4gW1xyXG4gICAgdG9kYXlMaW5lLFxyXG4gICAgYNCS0YvRgNGD0YfQutCwINC30LAgNyDQtNC90LXQuTogJHtmb3JtYXRTdW0oZi5yZXZlbnVlN2QpfSAoJHtmLnBheW1lbnRzQ291bnQ3ZH0g0L/Qu9Cw0YLQtdC20LXQuSlgLFxyXG4gICAgYNCS0YvRgNGD0YfQutCwINC30LAg0LLRgdGRINCy0YDQtdC80Y8gKNCy0YHQtSDRg9GB0L/QtdGI0L3Ri9C1INC+0L/Qu9Cw0YLRiyDQsiBDUk0pOiAke2Zvcm1hdFN1bShmLnJldmVudWVUb3RhbCl9YCxcclxuICAgIGDQodGA0LXQtNC90LjQuSDRh9C10Log0YHQtdCz0L7QtNC90Y8gLyDQt9CwIDcg0LTQvdC10Lk6ICR7Zi5hdmdDaGVja1RvZGF5ID4gMCA/IGZvcm1hdFN1bShmLmF2Z0NoZWNrVG9kYXkpIDogXCLigJRcIn0gLyAke2YuYXZnQ2hlY2s3ZCA+IDAgPyBmb3JtYXRTdW0oZi5hdmdDaGVjazdkKSA6IFwi4oCUXCJ9YCxcclxuICAgIGDQndC10L7Qv9C70LDRh9C10L3QvdGL0YUg0YHRh9C10YLQvtCyOiAke2YudW5wYWlkQ291bnR9LCDQvdCwINGB0YPQvNC80YMgJHtmb3JtYXRTdW0oZi51bnBhaWRUb3RhbCl9YCxcclxuICAgIGDQl9Cw0L/QuNGB0LXQuSDRgdC10LPQvtC00L3Rjzog0LLRgdC10LPQviAke2YuYXBwb2ludG1lbnRzVG9kYXl9LCDQt9Cw0LLQtdGA0YjQtdC90L4gJHtmLmFwcG9pbnRtZW50c0NvbXBsZXRlZFRvZGF5fSwg0LIg0L7QttC40LTQsNC90LjQuCAke2YuYXBwb2ludG1lbnRzU2NoZWR1bGVkVG9kYXl9YCxcclxuICAgIGDQntGC0LzQtdC9L25vLXNob3cg0LfQsCAzMCDQtNC90LXQuTogJHtmLm5vU2hvd09yQ2FuY2VsbGVkMzBkfWAsXHJcbiAgICBg0KHRgNC10LTQvdGP0Y8g0LTQvdC10LLQvdCw0Y8g0LLRi9GA0YPRh9C60LAgKDcg0LTQvdC10LkpOiAke2Zvcm1hdFN1bShmLmF2Z0RhaWx5UmV2ZW51ZTdEYXlzKX1gLFxyXG4gICAgYNCh0LzQtdC90LAg0LrQsNGB0YHRizogJHtmLmNhc2hTaGlmdE9wZW4gPyBcItC+0YLQutGA0YvRgtCwXCIgOiBcItC30LDQutGA0YvRgtCwXCJ9YCxcclxuICAgIGDQotC+0L8t0LLRgNCw0Ycg0L/QviDQvtC/0LvQsNGC0LDQvDogJHtmLnRvcERvY3Rvck5hbWUgPz8gXCLQvdC10YIg0LTQsNC90L3Ri9GFXCJ9ICgke2YudG9wRG9jdG9yVG90YWwgPiAwID8gZm9ybWF0U3VtKGYudG9wRG9jdG9yVG90YWwpIDogXCLigJRcIn0pYCxcclxuICAgIGDQotC+0L8t0YPRgdC70YPQs9CwINC/0L4g0L7Qv9C70LDRgtCw0Lw6ICR7Zi50b3BTZXJ2aWNlTmFtZSA/PyBcItC90LXRgiDQtNCw0L3QvdGL0YVcIn0gKCR7Zi50b3BTZXJ2aWNlVG90YWwgPiAwID8gZm9ybWF0U3VtKGYudG9wU2VydmljZVRvdGFsKSA6IFwi4oCUXCJ9KWAsXHJcbiAgICBg0KHQv9GA0LDQstC+0YfQvdC40LrQuDog0LLRgNCw0YfQtdC5ICR7Zi5kb2N0b3JzQ291bnR9LCDRg9GB0LvRg9CzICR7Zi5zZXJ2aWNlc0NvdW50fSwg0LLRgdC10LPQviDQt9Cw0L/QuNGB0LXQuSDQsiDQsdCw0LfQtSAke2YuYXBwb2ludG1lbnRzQ291bnR9YCxcclxuICBdLmpvaW4oXCJcXG5cIik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzVW5hdmFpbGFibGVNZXNzYWdlKHM6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gIHJldHVybiBzLnN0YXJ0c1dpdGgoQUlfVU5BVkFJTEFCTEVfUFJFRklYKTtcclxufVxyXG5cclxuLyoqXHJcbiAqINCS0YvQt9C+0LIgYG9wZW5haS5jaGF0LmNvbXBsZXRpb25zLmNyZWF0ZWAgKNC60LvQuNC10L3RgiDigJQgYEAvbGliL29wZW5haWApLlxyXG4gKiDQm9C+0LPQuNGA0YPQtdGCINC30LDQv9GA0L7RgS/QvtGC0LLQtdGCINC4INC+0YjQuNCx0LrQuCDQv9C+0LvQvdC+0YHRgtGM0Y4uXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBydW5PcGVuQWlDaGF0Q29tcGxldGlvbihwYXJhbXM6IHtcclxuICBsYWJlbDogc3RyaW5nO1xyXG4gIHByb21wdEZvckxvZzogc3RyaW5nO1xyXG4gIG1lc3NhZ2VzOiBDaGF0Q29tcGxldGlvbkNyZWF0ZVBhcmFtc1tcIm1lc3NhZ2VzXCJdO1xyXG4gIG1heFRva2Vucz86IG51bWJlcjtcclxuICByZXNwb25zZUZvcm1hdD86IENoYXRDb21wbGV0aW9uQ3JlYXRlUGFyYW1zW1wicmVzcG9uc2VfZm9ybWF0XCJdO1xyXG59KTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XHJcbiAgY29uc3QgbW9kZWwgPSBPUEVOQUlfQ0hBVF9NT0RFTDtcclxuICBjb25zdCBwcm9tcHQgPSBwYXJhbXMucHJvbXB0Rm9yTG9nO1xyXG5cclxuICBpZiAoIWhhc09wZW5BSSB8fCAhb3BlbmFpKSB7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5sb2coXCI9PT0gQUkgREVCVUcgU1RBUlQgPT09XCIpO1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgIGNvbnNvbGUubG9nKFwiTU9ERUw6XCIsIG1vZGVsKTtcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICBjb25zb2xlLmxvZyhcIkhBUyBLRVk6XCIsICEhcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkpO1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgIGNvbnNvbGUubG9nKFwiUFJPTVBUOlwiLCBwcm9tcHQuc2xpY2UoMCwgMzAwKSk7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5sb2coXCIo0L/RgNC+0L/Rg9GB0Lo6INC60LvQuNC10L3RgiBPcGVuQUkg0L3QtSDRgdC+0LfQtNCw0L0g4oCUIHlvdXJfa2V5X2hlcmUg0LjQu9C4INC/0YPRgdGC0L7QuSDQutC70Y7RhylcIik7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5sb2coXCI9PT0gQUkgREVCVUcgRU5EID09PVwiKTtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxuXHJcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICBjb25zb2xlLmxvZyhcIlthaUxsbVNlcnZpY2VdXCIsIHBhcmFtcy5sYWJlbCk7XHJcblxyXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgY29uc29sZS5sb2coXCI9PT0gQUkgREVCVUcgU1RBUlQgPT09XCIpO1xyXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgY29uc29sZS5sb2coXCJNT0RFTDpcIiwgbW9kZWwpO1xyXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgY29uc29sZS5sb2coXCJIQVMgS0VZOlwiLCAhIXByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZKTtcclxuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gIGNvbnNvbGUubG9nKFwiUFJPTVBUOlwiLCBwcm9tcHQuc2xpY2UoMCwgMzAwKSk7XHJcblxyXG4gIGxldCByZXM6IEF3YWl0ZWQ8UmV0dXJuVHlwZTxOb25OdWxsYWJsZTx0eXBlb2Ygb3BlbmFpPltcImNoYXRcIl1bXCJjb21wbGV0aW9uc1wiXVtcImNyZWF0ZVwiXT4+IHwgbnVsbCA9IG51bGw7XHJcbiAgbGV0IGNhdWdodDogdW5rbm93biB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcclxuXHJcbiAgdHJ5IHtcclxuICAgIHJlcyA9IGF3YWl0IG9wZW5haS5jaGF0LmNvbXBsZXRpb25zLmNyZWF0ZSh7XHJcbiAgICAgIG1vZGVsLFxyXG4gICAgICBtYXhfdG9rZW5zOiBwYXJhbXMubWF4VG9rZW5zID8/IE1BWF9PVVRfVE9LRU5TLFxyXG4gICAgICBtZXNzYWdlczogcGFyYW1zLm1lc3NhZ2VzLFxyXG4gICAgICAuLi4ocGFyYW1zLnJlc3BvbnNlRm9ybWF0ID8geyByZXNwb25zZV9mb3JtYXQ6IHBhcmFtcy5yZXNwb25zZUZvcm1hdCB9IDoge30pLFxyXG4gICAgfSk7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5sb2coXCJBSSBSQVcgUkVTUE9OU0U6XCIsIHJlcyk7XHJcbiAgfSBjYXRjaCAoZSkge1xyXG4gICAgY2F1Z2h0ID0gZTtcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICBjb25zb2xlLmVycm9yKFwiQUkgRVJST1I6XCIsIGUpO1xyXG4gIH1cclxuXHJcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICBjb25zb2xlLmxvZyhcIj09PSBBSSBERUJVRyBFTkQgPT09XCIpO1xyXG5cclxuICAvKiogRmFsbGJhY2sgwqvQvdC10LTQvtGB0YLRg9C/0LXQvcK7IOKAlCDRgtC+0LvRjNC60L4g0LfQtNC10YHRjCAo0LjRgdC60LvRjtGH0LXQvdC40LUg0L7RgiBTREsgLyDRgdC10YLQuCkuICovXHJcbiAgaWYgKGNhdWdodCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICBjb25zdCBhbnlFcnIgPSBjYXVnaHQgYXMge1xyXG4gICAgICBtZXNzYWdlPzogc3RyaW5nO1xyXG4gICAgICBzdGF0dXM/OiBudW1iZXI7XHJcbiAgICAgIHJlc3BvbnNlPzogeyBzdGF0dXM/OiBudW1iZXI7IGRhdGE/OiB1bmtub3duIH07XHJcbiAgICAgIGVycm9yPzogeyBtZXNzYWdlPzogc3RyaW5nIH07XHJcbiAgICB9O1xyXG4gICAgY29uc3QgZXJyTXNnID0gYW55RXJyPy5tZXNzYWdlID8/IGFueUVycj8uZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGNhdWdodCk7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5lcnJvcihcIltBSSBFUlJPUiBGVUxMXVwiLCBjYXVnaHQpO1xyXG4gICAgY29uc3QgaHR0cFN0YXR1cyA9IGFueUVycj8uc3RhdHVzID8/IGFueUVycj8ucmVzcG9uc2U/LnN0YXR1cztcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICBjb25zb2xlLmVycm9yKFwiZXJyb3IubWVzc2FnZTpcIiwgZXJyTXNnKTtcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICBjb25zb2xlLmVycm9yKFwicmVzcG9uc2Uuc3RhdHVzOlwiLCBodHRwU3RhdHVzID09PSB1bmRlZmluZWQgPyBcIijQvdC10YIg0LIg0L7QsdGK0LXQutGC0LUg0L7RiNC40LHQutC4KVwiIDogaHR0cFN0YXR1cyk7XHJcbiAgICBpZiAoYW55RXJyPy5yZXNwb25zZT8uZGF0YSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJyZXNwb25zZS5kYXRhOlwiLCBKU09OLnN0cmluZ2lmeShhbnlFcnIucmVzcG9uc2UuZGF0YSwgbnVsbCwgMikpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGAke0FJX1VOQVZBSUxBQkxFX1BSRUZJWH0gJHtlcnJNc2d9YDtcclxuICB9XHJcblxyXG4gIGlmICghcmVzKSB7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5lcnJvcihcIltBSSBFUlJPUiBGVUxMXSDQvtGC0LLQtdGCIGNyZWF0ZSDQsdC10Lcg0LjRgdC60LvRjtGH0LXQvdC40Y8sINC90L4gcmVzINC/0YPRgdGCIOKAlCDQvdC10LrQvtC90YHQuNGB0YLQtdC90YLQvdC+0LUg0YHQvtGB0YLQvtGP0L3QuNC1XCIpO1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG5cclxuICBjb25zdCBtc2cwID0gcmVzLmNob2ljZXM/LlswXT8ubWVzc2FnZTtcclxuICBjb25zdCBjb250ZW50ID0gbXNnMD8uY29udGVudDtcclxuICBpZiAoY29udGVudCAhPSBudWxsKSB7XHJcbiAgICByZXR1cm4gY29udGVudDtcclxuICB9XHJcblxyXG4gIGNvbnN0IHJlZnVzYWwgPVxyXG4gICAgbXNnMCAmJiB0eXBlb2YgbXNnMCA9PT0gXCJvYmplY3RcIiAmJiBcInJlZnVzYWxcIiBpbiBtc2cwXHJcbiAgICAgID8gU3RyaW5nKChtc2cwIGFzIHsgcmVmdXNhbD86IHN0cmluZyB9KS5yZWZ1c2FsID8/IFwiXCIpXHJcbiAgICAgIDogXCJcIjtcclxuICBpZiAocmVmdXNhbCkge1xyXG4gICAgcmV0dXJuIHJlZnVzYWw7XHJcbiAgfVxyXG5cclxuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gIGNvbnNvbGUud2FybihcIlthaUxsbVNlcnZpY2VdIGNob2ljZXNbMF0ubWVzc2FnZSDQsdC10LcgY29udGVudC9yZWZ1c2FsIOKAlCDQstC+0LfQstGA0LDRidCw0LXQvCDQv9GD0YHRgtGD0Y4g0YHRgtGA0L7QutGDICjQvtGC0LLQtdGCIEFQSSDRg9GB0L/QtdGI0L3Ri9C5KVwiKTtcclxuICByZXR1cm4gXCJcIjtcclxufVxyXG5cclxuY29uc3QgTU9STklOR19CUklFRklOR19TWVNURU0gPSBg0KLRiyDigJQgQUkg0LDRgdGB0LjRgdGC0LXQvdGCINC60LvQuNC90LjQutC4INGD0YDQvtCy0L3RjyDQsdC40LfQvdC10YEt0LrQvtC90YHRg9C70YzRgtCw0L3RgtCwLlxyXG5cclxu0J/RgNCw0LLQuNC70LA6XHJcbi0g0J/QuNGI0Lgg0L7Rh9C10L3RjCDQutGA0LDRgtC60L46INGG0LXQu9GMINC90LUg0LHQvtC70YzRiNC1IDYg0YHRgtGA0L7QuiDQvdCwINCy0LXRgdGMINC+0YLQstC10YI7INC/0YDQuCDQvdC10L7QsdGF0L7QtNC40LzQvtGB0YLQuCDQvtCx0YrQtdC00LjQvdGP0Lkg0L/Rg9C90LrRgtGLINGH0LXRgNC10Lcgwqs7IMK7LlxyXG4tINCf0L7QutCw0LfRi9Cy0LDQuSDQuNC30LzQtdC90LXQvdC40Y8g0Log0L/QvtC30LDQstGH0LXRgNCwINGH0LXRgNC10LcgcmV2ZW51ZUNoYW5nZSDQuCBwYXRpZW50c0NoYW5nZSAo0YbQtdC70YvQtSDQv9GA0L7RhtC10L3RgtGLINC40LcgSlNPTikuINCV0YHQu9C4IG51bGwg4oCUINC00LXQu9C10L3QuNGPINC90LUg0LHRi9C70L4gKNCx0LDQt9CwIDApOyAlINC90LUg0L/RgNC40LTRg9C80YvQstCw0LkuXHJcbi0g0J3QtSDQv9GA0L7RgdGC0L4g0LDQvdCw0LvQuNC30LjRgNGD0Lkg4oCUINC00LDQstCw0Lkg0LTQtdC50YHRgtCy0LjRjy5cclxuLSDQmtC+0L3QutGA0LXRgtC40LrQsCDRgtC+0LvRjNC60L4g0LjQtyBKU09OOyDQvNC10YLRgNC40Log0Lgg0YTQsNC60YLQvtCyINC90LUg0LTQvtC/0L7Qu9C90Y/QuS5cclxuLSDQkdC10Lcg0LLQvtC00YsuXHJcblxyXG7QpNC+0YDQvNCw0YI6XHJcblxyXG7Qn9GA0LjQstC10YLRgdGC0LLQuNC1ICh1c2VyTmFtZSwg0L7QtNC90LAg0YHRgtGA0L7QutCwKVxyXG5cclxu8J+TiiDQktGH0LXRgNCwOlxyXG570LLRi9GA0YPRh9C60LB9ICh7Ky8tIHJldmVudWVDaGFuZ2V9JSkg4oCUINGC0L7Qu9GM0LrQviDQtdGB0LvQuCByZXZlbnVlWWVzdGVyZGF5INC90LUgbnVsbDsg0LXRgdC70LggcmV2ZW51ZUNoYW5nZSBudWxsIOKAlCDQsdC10Lcg0L/RgNC+0YbQtdC90YLQsFxyXG570L/QsNGG0LjQtdC90YLRiyBwYXRpZW50c1llc3RlcmRheX0gKHsrLy0gcGF0aWVudHNDaGFuZ2V9JSkg4oCUINC10YHQu9C4IHBhdGllbnRzQ2hhbmdlIG51bGwg4oCUINCx0LXQtyDQv9GA0L7RhtC10L3RgtCwXHJcbtCV0YHQu9C4IGZyZWVTbG90c1RvZGF5INC90LUgbnVsbCDigJQg0LrQvtGA0L7RgtC60L4g0YPQv9C+0LzRj9C90Lgg0YfQuNGB0LvQviDRgdC70L7RgtC+0LIg0L3QsCDRgdC10LPQvtC00L3Rjy5cclxuXHJcbuKaoO+4jyDQn9GA0L7QsdC70LXQvNGLOlxyXG7QlNC+IDIg0L/Rg9C90LrRgtC+0LIuINCV0YHQu9C4INC/0L4g0LTQsNC90L3Ri9C8INCy0YHRkSDRgNC+0LLQvdC+IOKAlCDQvdCw0L/QuNGI0Lgg0YDQvtCy0L3QvjogwqvQodGC0LDQsdC40LvRjNC90YvQuSDQtNC10L3RjMK7LlxyXG5cclxu8J+SoSDQlNC10LnRgdGC0LLQuNGPOlxyXG7QlNC+IDIg0L/Rg9C90LrRgtC+0LIsINC60L7QvdC60YDQtdGC0L3Ri9C1INGI0LDQs9C4INC90LAg0YHQtdCz0L7QtNC90Y8uXHJcblxyXG7QldGB0LvQuCByZXZlbnVlWWVzdGVyZGF5INC4IHVucGFpZEludm9pY2VzQ291bnQg0LIgSlNPTiBudWxsIOKAlCDQvdC10YIg0LTQvtGB0YLRg9C/0LAg0Log0YTQuNC90LDQvdGB0LDQvDog0L3QtSDQvtCx0YHRg9C20LTQsNC5INCy0YvRgNGD0YfQutGDINC4INC90LXQvtC/0LvQsNGC0YsuXHJcblxyXG7QldGB0LvQuCBmcmVlU2xvdHNUb2RheSA9PT0gbnVsbCDigJQg0L3QtSDRg9C/0L7QvNC40L3QsNC5INGB0LvQvtGC0YsuXHJcblxyXG7QldGB0LvQuCBzY29wZSA9PT0gXCJkb2N0b3JcIiDigJQg0LzQtdGC0YDQuNC60Lgg0YLQvtC70YzQutC+INGN0YLQvtCz0L4g0LLRgNCw0YfQsDsg0LjQvdCw0YfQtSDQutC70LjQvdC40LrQsCDRhtC10LvQuNC60L7QvC5gO1xyXG5cclxuLyoqXHJcbiAqINCj0YLRgNC10L3QvdC40Lkg0LHRgNC40YTQuNC90LM6INC+0LTQuNC9IHVzZXItbWVzc2FnZSDRgSBKU09OINC60L7QvdGC0LXQutGB0YLQsC5cclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21wbGV0ZU1vcm5pbmdCcmllZmluZyhtZXRyaWNzUGF5bG9hZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcclxuICBjb25zdCB1c2VyQ29udGVudCA9IGDQktC+0YIg0LTQsNC90L3Ri9C1OiAke0pTT04uc3RyaW5naWZ5KG1ldHJpY3NQYXlsb2FkKX0uINCh0LTQtdC70LDQuSDQstCw0YMt0LHRgNC40YTQuNC90LMuYDtcclxuICByZXR1cm4gcnVuT3BlbkFpQ2hhdENvbXBsZXRpb24oe1xyXG4gICAgbGFiZWw6IFwiY29tcGxldGVNb3JuaW5nQnJpZWZpbmdcIixcclxuICAgIHByb21wdEZvckxvZzogYG1vcm5pbmctYnJpZWZpbmcgcm9sZT0ke1N0cmluZyhtZXRyaWNzUGF5bG9hZC5yb2xlKX0gc2NvcGU9JHtTdHJpbmcobWV0cmljc1BheWxvYWQuc2NvcGUpfWAsXHJcbiAgICBtYXhUb2tlbnM6IDMyMCxcclxuICAgIG1lc3NhZ2VzOiBbXHJcbiAgICAgIHsgcm9sZTogXCJzeXN0ZW1cIiwgY29udGVudDogTU9STklOR19CUklFRklOR19TWVNURU0gfSxcclxuICAgICAgeyByb2xlOiBcInVzZXJcIiwgY29udGVudDogdXNlckNvbnRlbnQgfSxcclxuICAgIF0sXHJcbiAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCB0eXBlIEFzc2lzdGFudENoYXRIaXN0b3J5SXRlbSA9IHsgcm9sZTogXCJ1c2VyXCIgfCBcImFzc2lzdGFudFwiOyBjb250ZW50OiBzdHJpbmcgfTtcclxuXHJcbi8qKlxyXG4gKiDQlNC40LDQu9C+0LMg0YEg0L/QsNC80Y/RgtGM0Y46IHN5c3RlbSArIENSTS3QutC+0L3RgtC10LrRgdGCICsg0LjRgdGC0L7RgNC40Y8gKyDQv9C+0YHQu9C10LTQvdC10LUg0YHQvtC+0LHRidC10L3QuNC1INC/0L7Qu9GM0LfQvtCy0LDRgtC10LvRjy5cclxuICog0JzQvtC00LXQu9GMOiBncHQtNG8tbWluaSAoT1BFTkFJX0NIQVRfTU9ERUwpLlxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbXBsZXRlQXNzaXN0YW50Q2hhdChcclxuICBmYWN0czogQWlMbG1TdW1tYXJ5RmFjdHMsXHJcbiAgZG9tYWluSW50ZW50OiBBaURvbWFpbkludGVudCxcclxuICBjb250ZXh0OiBBaUFzc2lzdGFudFN0cnVjdHVyZWRDb250ZXh0LFxyXG4gIGhpc3Rvcnk6IEFzc2lzdGFudENoYXRIaXN0b3J5SXRlbVtdLFxyXG4gIHVzZXJNZXNzYWdlOiBzdHJpbmcsXHJcbiAgcm9sZTogVXNlclJvbGVcclxuKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XHJcbiAgY29uc3QgZmFjdHNGb3JQcm9tcHQgPSByZWRhY3RTdW1tYXJ5RmFjdHNGb3JSb2xlKGZhY3RzLCByb2xlKTtcclxuICBjb25zdCBjb250ZXh0Rm9yUHJvbXB0ID0gcmVkYWN0U3RydWN0dXJlZENvbnRleHRGb3JSb2xlKGNvbnRleHQsIHJvbGUpO1xyXG4gIGNvbnN0IHNuYXBzaG90QmxvY2sgPSBbXHJcbiAgICBcItCi0LXQutGD0YnQuNC5INGB0L3QuNC80L7QuiBDUk0gKNCw0LrRgtGD0LDQu9C10L0g0LTQu9GPINGN0YLQvtCz0L4g0L7RgtCy0LXRgtCwKTpcIixcclxuICAgIGZvcm1hdEZhY3RzRm9yUHJvbXB0KGZhY3RzRm9yUHJvbXB0KSxcclxuICAgIFwiXCIsXHJcbiAgICBidWlsZFN0cnVjdHVyZWRDb250ZXh0QmxvY2soY29udGV4dEZvclByb21wdCksXHJcbiAgICBcIlwiLFxyXG4gICAgYEludGVudDogJHtkb21haW5JbnRlbnR9YCxcclxuICAgIFwiXCIsXHJcbiAgICBDUk1fU05BUFNIT1RfUlVMRVMsXHJcbiAgXS5qb2luKFwiXFxuXCIpO1xyXG5cclxuICBjb25zdCBzYWZlSGlzdG9yeSA9IGhpc3RvcnlcclxuICAgIC5maWx0ZXIoKG0pID0+IChtLnJvbGUgPT09IFwidXNlclwiIHx8IG0ucm9sZSA9PT0gXCJhc3Npc3RhbnRcIikgJiYgdHlwZW9mIG0uY29udGVudCA9PT0gXCJzdHJpbmdcIilcclxuICAgIC5zbGljZSgtMjQpXHJcbiAgICAubWFwKChtKSA9PiAoe1xyXG4gICAgICByb2xlOiBtLnJvbGUsXHJcbiAgICAgIGNvbnRlbnQ6IG0uY29udGVudC50cmltKCkuc2xpY2UoMCwgODAwMCksXHJcbiAgICB9KSk7XHJcblxyXG4gIGNvbnN0IHVtID0gdXNlck1lc3NhZ2UudHJpbSgpLnNsaWNlKDAsIDgwMDApO1xyXG4gIGNvbnN0IHByb21wdEZvckxvZyA9IGAke3VtLnNsaWNlKDAsIDIwMCl9IHwgaGlzdG9yeToke3NhZmVIaXN0b3J5Lmxlbmd0aH1gO1xyXG5cclxuICBjb25zdCByYXcgPSBhd2FpdCBydW5PcGVuQWlDaGF0Q29tcGxldGlvbih7XHJcbiAgICBsYWJlbDogXCJjb21wbGV0ZUFzc2lzdGFudENoYXRcIixcclxuICAgIHByb21wdEZvckxvZyxcclxuICAgIG1heFRva2VuczogNTAwLFxyXG4gICAgbWVzc2FnZXM6IFtcclxuICAgICAgeyByb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBnZXRTeXN0ZW1Qcm9tcHQocm9sZSkgfSxcclxuICAgICAgeyByb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBzbmFwc2hvdEJsb2NrIH0sXHJcbiAgICAgIC4uLnNhZmVIaXN0b3J5Lm1hcCgobSkgPT4gKHsgcm9sZTogbS5yb2xlLCBjb250ZW50OiBtLmNvbnRlbnQgfSkpLFxyXG4gICAgICB7IHJvbGU6IFwidXNlclwiLCBjb250ZW50OiB1bSB9LFxyXG4gICAgXSxcclxuICB9KTtcclxuXHJcbiAgaWYgKHJhdyA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XHJcbiAgaWYgKGlzVW5hdmFpbGFibGVNZXNzYWdlKHJhdykpIHJldHVybiByYXc7XHJcbiAgcmV0dXJuIHNoYXBlQXNzaXN0YW50QW5zd2VyKHJhdyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21wbGV0ZUdlbmVyYWxDcm1BZHZpY2UoZmFjdHM6IEFpTGxtU3VtbWFyeUZhY3RzKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XHJcbiAgY29uc3Qgc3VtbWFyeSA9IGZvcm1hdEZhY3RzRm9yUHJvbXB0KGZhY3RzKTtcclxuICBjb25zdCBwcm9tcHRGb3JMb2cgPSBg0KTQsNC60YLRizogJHtzdW1tYXJ5fVxcblxcbtCU0LDQuSDQvtC00LjQvSDQutC+0YDQvtGC0LrQuNC5INGB0L7QstC10YIg0LLQu9Cw0LTQtdC70YzRhtGDINC60LvQuNC90LjQutC4ICjRh9GC0L4g0YHQtNC10LvQsNGC0Ywg0YHQtdCz0L7QtNC90Y8pLmA7XHJcblxyXG4gIGNvbnN0IHJhdyA9IGF3YWl0IHJ1bk9wZW5BaUNoYXRDb21wbGV0aW9uKHtcclxuICAgIGxhYmVsOiBcImNvbXBsZXRlR2VuZXJhbENybUFkdmljZVwiLFxyXG4gICAgcHJvbXB0Rm9yTG9nLFxyXG4gICAgbWVzc2FnZXM6IFtcclxuICAgICAge1xyXG4gICAgICAgIHJvbGU6IFwic3lzdGVtXCIsXHJcbiAgICAgICAgY29udGVudDpcclxuICAgICAgICAgIFwi0KLRiyDQsdC40LfQvdC10YEt0LrQvtC90YHRg9C70YzRgtCw0L3RgiDQutC70LjQvdC40LrQuC4g0J7RgtCy0LXRgtGMINC90LAg0YDRg9GB0YHQutC+0Lwg0LzQsNC60YHQuNC80YPQvCAzINC60L7RgNC+0YLQutC40YUg0L/RgNC10LTQu9C+0LbQtdC90LjRjzog0YbQuNGE0YDRiywg0LLRi9Cy0L7QtCwg0YfRgtC+INGB0LTQtdC70LDRgtGMLiDQkdC10Lcg0LLQvtC00Ysg0Lgg0LHQtdC3INCy0YvQtNGD0LzQsNC90L3Ri9GFINC00LDQvdC90YvRhSDigJQg0YLQvtC70YzQutC+INC40Lcg0L/QtdGA0LXQtNCw0L3QvdGL0YUg0YTQsNC60YLQvtCyLlwiLFxyXG4gICAgICB9LFxyXG4gICAgICB7XHJcbiAgICAgICAgcm9sZTogXCJ1c2VyXCIsXHJcbiAgICAgICAgY29udGVudDogcHJvbXB0Rm9yTG9nLFxyXG4gICAgICB9LFxyXG4gICAgXSxcclxuICB9KTtcclxuXHJcbiAgaWYgKHJhdyA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XHJcbiAgaWYgKGlzVW5hdmFpbGFibGVNZXNzYWdlKHJhdykpIHJldHVybiByYXc7XHJcbiAgcmV0dXJuIHNoYXBlQXNzaXN0YW50QW5zd2VyKHJhdyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21wbGV0ZU93bmVyUmVjb21tZW5kYXRpb25zKGZhY3RzOiBBaUxsbVN1bW1hcnlGYWN0cyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xyXG4gIGNvbnN0IHN1bW1hcnkgPSBmb3JtYXRGYWN0c0ZvclByb21wdChmYWN0cyk7XHJcbiAgY29uc3QgcHJvbXB0Rm9yTG9nID0gYNCk0LDQutGC0Ys6ICR7c3VtbWFyeX1cXG5cXG7QlNCy0LUg0YDQtdC60L7QvNC10L3QtNCw0YbQuNC4INGH0LXRgNC10Lcg0L/QtdGA0LXQvdC+0YEg0YHRgtGA0L7QutC4LmA7XHJcblxyXG4gIGNvbnN0IHJhdyA9IGF3YWl0IHJ1bk9wZW5BaUNoYXRDb21wbGV0aW9uKHtcclxuICAgIGxhYmVsOiBcImNvbXBsZXRlT3duZXJSZWNvbW1lbmRhdGlvbnNcIixcclxuICAgIHByb21wdEZvckxvZyxcclxuICAgIG1lc3NhZ2VzOiBbXHJcbiAgICAgIHtcclxuICAgICAgICByb2xlOiBcInN5c3RlbVwiLFxyXG4gICAgICAgIGNvbnRlbnQ6XHJcbiAgICAgICAgICBcItCi0Ysg0LHQuNC30L3QtdGBLdC60L7QvdGB0YPQu9GM0YLQsNC90YIg0LrQu9C40L3QuNC60LguINCd0LAg0YDRg9GB0YHQutC+0Lw6INGA0L7QstC90L4gMiDQutC+0YDQvtGC0LrQuNC1INGB0YLRgNC+0LrQuCDigJQg0YDQtdC60L7QvNC10L3QtNCw0YbQuNC4INCy0LvQsNC00LXQu9GM0YbRgyDRgSDQvtC/0L7RgNC+0Lkg0L3QsCDRhNCw0LrRgtGLLCDQsdC10Lcg0YLQsNCx0LvQuNGGINC4INCx0LXQtyDQstGL0LTRg9C80LDQvdC90YvRhSDRhtC40YTRgC5cIixcclxuICAgICAgfSxcclxuICAgICAge1xyXG4gICAgICAgIHJvbGU6IFwidXNlclwiLFxyXG4gICAgICAgIGNvbnRlbnQ6IHByb21wdEZvckxvZyxcclxuICAgICAgfSxcclxuICAgIF0sXHJcbiAgfSk7XHJcblxyXG4gIGlmIChyYXcgPT09IG51bGwpIHJldHVybiBudWxsO1xyXG4gIGlmIChpc1VuYXZhaWxhYmxlTWVzc2FnZShyYXcpKSByZXR1cm4gcmF3O1xyXG4gIHJldHVybiBzaGFwZUFzc2lzdGFudEFuc3dlcihyYXcpO1xyXG59XHJcblxyXG4vLyAtLS0gRGFzaGJvYXJkIHJlY29tbWVuZGF0aW9ucyAo0YLQvtGCINC20LUgcnVubmVyOyDQvtGC0LTQtdC70YzQvdGL0Lkg0L/RgNC+0LzQv9GCINC4INC/0LDRgNGB0LjQvdCzIEpTT04pIC0tLVxyXG5cclxuY29uc3QgcGFyc2VSZWNvbW1lbmRhdGlvbnNKc29uID0gKGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZ1tdIHwgbnVsbCA9PiB7XHJcbiAgY29uc3QgdHJpbW1lZCA9IGNvbnRlbnQudHJpbSgpO1xyXG4gIGNvbnN0IHRyeVBhcnNlID0gKHJhdzogc3RyaW5nKTogc3RyaW5nW10gfCBudWxsID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyB1bmtub3duO1xyXG4gICAgICBpZiAocGFyc2VkICYmIHR5cGVvZiBwYXJzZWQgPT09IFwib2JqZWN0XCIgJiYgXCJyZWNvbW1lbmRhdGlvbnNcIiBpbiBwYXJzZWQpIHtcclxuICAgICAgICBjb25zdCByZWMgPSAocGFyc2VkIGFzIHsgcmVjb21tZW5kYXRpb25zOiB1bmtub3duIH0pLnJlY29tbWVuZGF0aW9ucztcclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZWMpICYmIHJlYy5ldmVyeSgoeCkgPT4gdHlwZW9mIHggPT09IFwic3RyaW5nXCIpKSB7XHJcbiAgICAgICAgICByZXR1cm4gcmVjLm1hcCgocykgPT4gcy50cmltKCkpLmZpbHRlcihCb29sZWFuKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2gge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG4gIH07XHJcbiAgY29uc3QgZGlyZWN0ID0gdHJ5UGFyc2UodHJpbW1lZCk7XHJcbiAgaWYgKGRpcmVjdCAmJiBkaXJlY3QubGVuZ3RoKSByZXR1cm4gZGlyZWN0O1xyXG4gIGNvbnN0IGZlbmNlID0gdHJpbW1lZC5tYXRjaCgvYGBgKD86anNvbik/XFxzKihbXFxzXFxTXSo/KWBgYC8pO1xyXG4gIGlmIChmZW5jZT8uWzFdKSB7XHJcbiAgICBjb25zdCBpbm5lciA9IHRyeVBhcnNlKGZlbmNlWzFdLnRyaW0oKSk7XHJcbiAgICBpZiAoaW5uZXIgJiYgaW5uZXIubGVuZ3RoKSByZXR1cm4gaW5uZXI7XHJcbiAgfVxyXG4gIHJldHVybiBudWxsO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqINCg0LXQutC+0LzQtdC90LTQsNGG0LjQuCDQtNC70Y8g0Y3QutGA0LDQvdCwINC+0YLRh9GR0YLQvtCyIOKAlCDRgtC+0YIg0LbQtSBPcGVuQUkgcnVubmVyLCDRh9GC0L4g0Lgg0YMg0LDRgdGB0LjRgdGC0LXQvdGC0LAuXHJcbiAqINCf0YDQuCDQvtGI0LjQsdC60LUgQVBJINCy0L7Qt9Cy0YDQsNGJ0LDQtdGCINC80LDRgdGB0LjQsiDQuNC3INC+0LTQvdC+0Lkg0YHRgtGA0L7QutC4IGBBSSDQstGA0LXQvNC10L3QvdC+INC90LXQtNC+0YHRgtGD0L/QtdC9OiAuLi5gLlxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbXBsZXRlRGFzaGJvYXJkUmVjb21tZW5kYXRpb25zRnJvbVN1bW1hcnlKc29uKHN1bW1hcnlKc29uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdIHwgbnVsbD4ge1xyXG4gIGNvbnN0IHByb21wdEZvckxvZyA9IGDQotGLINCx0LjQt9C90LXRgS3QsNC90LDQu9C40YLQuNC6INC60LvQuNC90LjQutC4LiDQlNCw0Lkg0LrRgNCw0YLQutC40LUg0YDQtdC60L7QvNC10L3QtNCw0YbQuNC4INC/0L4g0YPQstC10LvQuNGH0LXQvdC40Y4g0L/RgNC40LHRi9C70LgsINC30LDQs9GA0YPQt9C60LUg0LLRgNCw0YfQtdC5INC4INC+0L/RgtC40LzQuNC30LDRhtC40Lgg0YPRgdC70YPQsyDQvdCwINC+0YHQvdC+0LLQtSDQtNCw0L3QvdGL0YU6ICR7c3VtbWFyeUpzb259XHJcblxyXG7QktC10YDQvdC4INCi0J7Qm9Cs0JrQniBKU09OINC+0LHRitC10LrRgtCwINCy0LjQtNCwOiB7XCJyZWNvbW1lbmRhdGlvbnNcIjpbXCLQv9GD0L3QutGCMVwiLFwi0L/Rg9C90LrRgjJcIixcItC/0YPQvdC60YIzXCJdfSDigJQgM+KAkzYg0LrQvtGA0L7RgtC60LjRhSDRgdGC0YDQvtC6INC90LAg0YDRg9GB0YHQutC+0LwsINCx0LXQtyBtYXJrZG93biDQuCDQsdC10Lcg0L/QvtGP0YHQvdC10L3QuNC5INCy0L3QtSBKU09OLmA7XHJcblxyXG4gIGNvbnN0IHJhdyA9IGF3YWl0IHJ1bk9wZW5BaUNoYXRDb21wbGV0aW9uKHtcclxuICAgIGxhYmVsOiBcImNvbXBsZXRlRGFzaGJvYXJkUmVjb21tZW5kYXRpb25zRnJvbVN1bW1hcnlKc29uXCIsXHJcbiAgICBwcm9tcHRGb3JMb2csXHJcbiAgICBtYXhUb2tlbnM6IDUwMCxcclxuICAgIG1lc3NhZ2VzOiBbXHJcbiAgICAgIHtcclxuICAgICAgICByb2xlOiBcInN5c3RlbVwiLFxyXG4gICAgICAgIGNvbnRlbnQ6IFwi0KLRiyDQsdC40LfQvdC10YEt0LDQvdCw0LvQuNGC0LjQuiDQvNC10LTQuNGG0LjQvdGB0LrQvtC5INC60LvQuNC90LjQutC4LiDQntGC0LLQtdGH0LDQuSDRgtC+0LvRjNC60L4g0LLQsNC70LjQtNC90YvQvCBKU09OINGBINC/0L7Qu9C10LwgcmVjb21tZW5kYXRpb25zLlwiLFxyXG4gICAgICB9LFxyXG4gICAgICB7IHJvbGU6IFwidXNlclwiLCBjb250ZW50OiBwcm9tcHRGb3JMb2cgfSxcclxuICAgIF0sXHJcbiAgICByZXNwb25zZUZvcm1hdDogeyB0eXBlOiBcImpzb25fb2JqZWN0XCIgfSxcclxuICB9KTtcclxuXHJcbiAgaWYgKHJhdyA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XHJcbiAgaWYgKGlzVW5hdmFpbGFibGVNZXNzYWdlKHJhdykpIHJldHVybiBbcmF3XTtcclxuICBjb25zdCBwYXJzZWQgPSBwYXJzZVJlY29tbWVuZGF0aW9uc0pzb24ocmF3KTtcclxuICBpZiAocGFyc2VkPy5sZW5ndGgpIHJldHVybiBwYXJzZWQ7XHJcbiAgLyoqINCj0YHQv9C10YjQvdGL0Lkg0L7RgtCy0LXRgiDQvNC+0LTQtdC70LgsINC90L4g0L3QtSBKU09OIOKAlCDQstGB0ZEg0YDQsNCy0L3QviDQvtGC0LTQsNGR0Lwg0YHRi9GA0L7QuSDRgtC10LrRgdGCLCDQsdC10LcgZmFsbGJhY2st0YHQvtC+0LHRidC10L3QuNGPLiAqL1xyXG4gIHJldHVybiBbcmF3XTtcclxufVxyXG4iXX0=