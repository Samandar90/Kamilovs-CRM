"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeAskQuickIntent = routeAskQuickIntent;
exports.routeHybridIntent = routeHybridIntent;
exports.routeDomainIntent = routeDomainIntent;
const normalize = (raw) => raw.toLowerCase().replace(/\s+/g, " ").trim();
const includeAny = (text, words) => words.some((w) => text.includes(w));
/**
 * Быстрые ответы (навигация, факты дня) — без OpenAI.
 * Проверять первым в оркестраторе.
 */
function routeAskQuickIntent(message) {
    const raw = String(message ?? "").trim();
    const text = normalize(raw);
    /** «Найди …» / «Покажи пациента …» — в приоритете, чтобы не уходить в общий LLM. */
    if (/^найди\s+/i.test(raw) || /^покажи\s+(?:пациента\s+)?/i.test(raw)) {
        return "patient_search";
    }
    if (includeAny(text, [
        "за всё время",
        "за все время",
        "всего заработали",
        "общая выручка",
        "вся выручка",
        "выручка всего",
        "сколько всего",
        "доход за всё",
        "доход за все",
        "выручка за все дни",
        "за все дни",
    ])) {
        return "revenue_total";
    }
    if (includeAny(text, [
        "7 дней",
        "7 дн",
        "за 7",
        "за семь",
        "неделю",
        "за неделю",
        "выручка за неделю",
        "сколько за неделю",
        "выручка за 7",
    ])) {
        return "revenue_7d";
    }
    if (includeAny(text, [
        "сколько заработали",
        "выручка за сегодня",
        "сколько за сегодня",
        "сколько сегодня заработали",
        "доход сегодня",
    ])) {
        return "revenue_today";
    }
    if (includeAny(text, ["сегодня", "выручк", "заработ"]) && !includeAny(text, ["7 дн", "недел", "всего"])) {
        return "revenue_today";
    }
    if (includeAny(text, ["неоплачен", "долг", "счет", "дебитор"]))
        return "unpaid_invoices";
    if (includeAny(text, ["топ врач", "кто приносит", "какой врач", "больше выручки"]))
        return "top_doctor";
    if (includeAny(text, ["топ услуг", "самая прибыльная услуг", "какая услуга"]))
        return "top_service";
    if (includeAny(text, ["что ещё не настроено", "готова ли crm", "настроено", "что настроить в crm"])) {
        return "setup_status";
    }
    if (includeAny(text, ["касс", "смена открыта", "проблемы в кассе", "остаток в кассе"])) {
        return "cashier_status";
    }
    if (includeAny(text, [
        "увеличить выруч",
        "что улучшить",
        "средний чек",
        "апсейл",
        "бизнес совет",
        "совет бизнес",
        "как развить клиник",
        "что делать с клиник",
        "операционн совет",
        "стратегия клиник",
    ])) {
        return "business_advice";
    }
    if (includeAny(text, ["где касса", "где посмотреть счета", "как создать запись", "где "])) {
        return "help_navigation";
    }
    return "unknown";
}
/**
 * Гибридный классификатор для handle(): всё кроме general_crm_advice — rule engine.
 */
function routeHybridIntent(message) {
    const t = normalize(message);
    if (t.includes("что происходит") || t.includes("анализ") || t.includes("обзор клиник"))
        return "health";
    if ((t.includes("за вс") && (t.includes("время") || t.includes("врем"))) ||
        t.includes("всего заработ") ||
        t.includes("общая выручк") ||
        t.includes("вся выручк")) {
        return "revenue";
    }
    if (t.includes("выруч") || t.includes("заработ") || t.includes("доход"))
        return "revenue";
    if (t.includes("счета") || t.includes("счет") || t.includes("долг"))
        return "unpaid";
    if (t.includes("врач"))
        return "top_doctor";
    if (t.includes("услуг"))
        return "top_service";
    if (t.includes("касс"))
        return "cash_status";
    return "general_crm_advice";
}
const UNSUPPORTED_HINTS = [
    "политик",
    "выбор",
    "президент",
    "фильм",
    "музык",
    "песн",
    "игр",
    "анекдот",
    "курс программирован",
    "код на",
    "javascript",
    "python",
    "typescript",
    "погода",
    "крипт",
    "спорт",
];
const MEDICAL_HINTS = [
    "бол",
    "температур",
    "каш",
    "тошн",
    "рвот",
    "головн",
    "давлен",
    "симптом",
    "диагноз",
    "врач",
    "анализ",
    "лечени",
    "терапевт",
    "кардиолог",
    "гастроэнтеролог",
    "педиатр",
    "невролог",
];
const NAVIGATION_HINTS = [
    "где",
    "как открыть",
    "как создать",
    "куда нажать",
    "как найти",
    "как посмотреть",
    "раздел",
    "страниц",
];
const CRM_ANALYTICS_HINTS = [
    "выруч",
    "неоплачен",
    "долг",
    "счет",
    "касс",
    "смен",
    "no-show",
    "отмен",
    "топ врач",
    "топ услуг",
    "средний чек",
    "запис",
    "отчет",
    "оплат",
];
const CRM_EXPLANATION_HINTS = [
    "почему",
    "что означает",
    "объясни",
    "как работает",
    "ошибк",
    "не работает",
    "метрик",
    "показател",
    "crm",
];
function routeDomainIntent(message) {
    const text = normalize(message);
    if (!text)
        return "unsupported";
    if (includeAny(text, UNSUPPORTED_HINTS))
        return "unsupported";
    if (includeAny(text, MEDICAL_HINTS))
        return "medical_question";
    if (includeAny(text, CRM_ANALYTICS_HINTS))
        return "crm_analytics";
    if (includeAny(text, NAVIGATION_HINTS))
        return "crm_navigation";
    if (includeAny(text, CRM_EXPLANATION_HINTS))
        return "crm_explanation";
    if (includeAny(text, ["пациент", "врач", "услуг", "запис", "счет", "оплат", "касс", "клиник"])) {
        return "crm_explanation";
    }
    return "unsupported";
}
