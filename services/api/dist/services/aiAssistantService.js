"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAssistantService = void 0;
const aiCacheService_1 = require("../ai/aiCacheService");
const aiFactBuilderService_1 = require("../ai/aiFactBuilderService");
const aiAssistantHardGate_1 = require("../ai/aiAssistantHardGate");
const aiAssistantRoleAccess_1 = require("../ai/aiAssistantRoleAccess");
const aiIntentRouter_1 = require("../ai/aiIntentRouter");
const aiLlmService_1 = require("../ai/aiLlmService");
const aiRuleEngine_1 = require("../ai/aiRuleEngine");
const aiTypes_1 = require("../ai/aiTypes");
const FALLBACK_CRM = "Не удалось получить данные CRM";
const UNSUPPORTED_REPLY = "Я работаю только с медициной и системой CRM.";
/** Снимок метрик для AI — 3 мин (актуальнее после оплат). */
const METRICS_CACHE_TTL_MS = 3 * 60 * 1000;
/** Кэш LLM owner / general — 10 мин. */
const LLM_CACHE_TTL_MS = 10 * 60 * 1000;
function simpleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i += 1)
        h = (h << 5) - h + s.charCodeAt(i);
    return String(h >>> 0);
}
function aiLog(event, payload) {
    // eslint-disable-next-line no-console
    console.log(`[AI] ${event}`, JSON.stringify(payload));
}
function defaultSuggestions(domainIntent, role) {
    if (domainIntent === "medical_question") {
        return [
            "Пациент жалуется на головную боль — что делать?",
            "Какие тревожные признаки требуют срочного осмотра?",
            "Как объяснить пациенту режим без назначения лечения?",
        ];
    }
    if (!(0, aiAssistantRoleAccess_1.canReadFinancialFactsInAi)(role)) {
        if (role === "doctor" || role === "nurse") {
            return [
                "Мои записи на сегодня",
                "Сколько у меня отмен за месяц?",
                "Как отметить приём в CRM?",
                "Напомни правила no-show",
            ];
        }
        return [
            "Записи на сегодня",
            "Как найти пациента?",
            "Свободные окна у врачей",
            "Что важно сегодня по расписанию?",
        ];
    }
    if (role === "cashier" || role === "accountant") {
        return [
            "Сколько неоплаченных счетов?",
            "Статус кассы и смены",
            "Покажи последние платежи",
            "Где счета к оплате?",
        ];
    }
    if (role === "manager" || role === "director" || role === "superadmin") {
        return [
            "Покажи выручку за неделю",
            "Кто перегружен сегодня?",
            "Какие пациенты с долгами?",
            "Где мы теряем деньги по данным CRM?",
        ];
    }
    return [
        "Покажи выручку за неделю",
        "Кто перегружен сегодня?",
        "Какие пациенты с долгами?",
        "Что важно сегодня по клинике?",
    ];
}
function suggestionsAfterMedicalDenial(role) {
    if ((0, aiAssistantRoleAccess_1.canReadFinancialFactsInAi)(role)) {
        return [
            "Покажи выручку за неделю",
            "Сколько неоплаченных счетов?",
            "Статус кассы",
            "Открыть отчёты",
        ];
    }
    return ["Записи на сегодня", "Как найти пациента?", "Свободные окна", "Что важно сегодня?"];
}
function helpNavigationTouchesFinance(message) {
    const t = message.toLowerCase();
    return (t.includes("касс") ||
        t.includes("счет") ||
        t.includes("счёт") ||
        t.includes("оплат") ||
        t.includes("биллинг") ||
        t.includes("выручк") ||
        t.includes("инвойс"));
}
/**
 * Оркестратор: router → facts (кэш) → quick / hybrid (без LLM) → general (LLM по желанию).
 */
class AIAssistantService {
    constructor() {
        this.factBuilder = new aiFactBuilderService_1.AiFactBuilderService();
        this.rules = new aiRuleEngine_1.AiRuleEngine();
        this.cache = aiCacheService_1.sharedAiCache;
    }
    async getCachedSnapshot() {
        try {
            const hit = this.cache.get(aiCacheService_1.AI_FACTS_CACHE_KEY);
            if (hit)
                return hit;
            const snap = await this.factBuilder.getClinicSnapshot();
            aiLog("facts_built", {
                revenueToday: snap.revenueToday,
                revenue7d: snap.revenue7d,
                unpaidCount: snap.unpaidCount,
                paymentsCountToday: snap.paymentsCountToday,
            });
            this.cache.set(aiCacheService_1.AI_FACTS_CACHE_KEY, snap, METRICS_CACHE_TTL_MS);
            return snap;
        }
        catch (error) {
            console.error("[AI] getCachedSnapshot", error);
            return (0, aiTypes_1.createEmptyClinicFactsSnapshot)();
        }
    }
    async handle(auth, message, history) {
        try {
            const safeMessage = String(message ?? "").trim();
            if (!safeMessage) {
                return { answer: "Пустой запрос", suggestions: [] };
            }
            if (process.env.AI_TEST_MODE === "true") {
                return { answer: "AI работает (тест)", suggestions: [] };
            }
            if (!(0, aiAssistantHardGate_1.checkAIRequestAccess)(auth.role, safeMessage)) {
                const allowed = false;
                console.log("ROLE:", auth.role);
                console.log("MESSAGE:", safeMessage);
                console.log("ALLOWED:", allowed);
                aiLog("ask path", { path: "hard_gate_block", role: auth.role });
                return {
                    answer: aiAssistantHardGate_1.AI_ACCESS_DENIED_MESSAGE,
                    suggestions: defaultSuggestions((0, aiIntentRouter_1.routeDomainIntent)(safeMessage), auth.role),
                };
            }
            const domainIntent = (0, aiIntentRouter_1.routeDomainIntent)(safeMessage);
            aiLog("ask intent", { route: "domain", intent: domainIntent });
            if (domainIntent === "unsupported") {
                return { answer: UNSUPPORTED_REPLY, suggestions: [] };
            }
            if (domainIntent === "medical_question" && !(0, aiAssistantRoleAccess_1.canReceiveMedicalAiAdvice)(auth.role)) {
                return {
                    answer: aiAssistantRoleAccess_1.MEDICAL_ADVICE_DENIED_RU,
                    suggestions: suggestionsAfterMedicalDenial(auth.role),
                };
            }
            if (domainIntent !== "medical_question") {
                const quick = (0, aiIntentRouter_1.routeAskQuickIntent)(safeMessage);
                aiLog("ask intent", { route: "quick", intent: quick });
                if (quick !== "unknown") {
                    const canFin = (0, aiAssistantRoleAccess_1.canReadFinancialFactsInAi)(auth.role);
                    if ((0, aiAssistantRoleAccess_1.isFinancialQuickIntent)(quick) && !canFin) {
                        return {
                            answer: aiAssistantRoleAccess_1.FINANCIAL_ACCESS_DENIED_RU,
                            suggestions: defaultSuggestions(domainIntent, auth.role),
                        };
                    }
                    if (quick === "help_navigation" && !canFin && helpNavigationTouchesFinance(safeMessage)) {
                        return {
                            answer: aiAssistantRoleAccess_1.FINANCIAL_ACCESS_DENIED_RU,
                            suggestions: defaultSuggestions(domainIntent, auth.role),
                        };
                    }
                    const facts = await this.getCachedSnapshot();
                    const quickRes = await this.rules.answerAskQuick(quick, facts, safeMessage);
                    if (quickRes) {
                        aiLog("ask path", { path: "quick_local", intent: quick });
                        aiLog("ask success", { path: "quick_local" });
                        return quickRes;
                    }
                }
                const hybrid = (0, aiIntentRouter_1.routeHybridIntent)(safeMessage);
                aiLog("ask intent", { route: "hybrid", intent: hybrid });
                if (hybrid !== "general_crm_advice") {
                    const canFin = (0, aiAssistantRoleAccess_1.canReadFinancialFactsInAi)(auth.role);
                    if ((0, aiAssistantRoleAccess_1.isFinancialHybridIntent)(hybrid) && !canFin) {
                        return {
                            answer: aiAssistantRoleAccess_1.FINANCIAL_ACCESS_DENIED_RU,
                            suggestions: defaultSuggestions(domainIntent, auth.role),
                        };
                    }
                    const skipHybridHealth = hybrid === "health" && !canFin;
                    if (!skipHybridHealth) {
                        try {
                            const dataIntent = hybrid;
                            const raw = await this.factBuilder.fetchHybridData(dataIntent);
                            const enriched = this.factBuilder.enrichData(dataIntent, raw);
                            aiLog("ask path", { path: "hybrid_rules", intent: dataIntent });
                            const out = {
                                answer: this.rules.answerHybrid(dataIntent, enriched),
                                suggestions: defaultSuggestions(domainIntent, auth.role),
                            };
                            aiLog("ask success", { path: "hybrid_rules" });
                            return out;
                        }
                        catch (error) {
                            console.error("[AI] hybrid block error", error);
                            const facts = await this.getCachedSnapshot();
                            const fallbackAns = canFin
                                ? this.rules.fallbackGeneralCrmAdvice(facts)
                                : "Не удалось загрузить данные. Спросите про записи или пациентов — или повторите позже.";
                            return {
                                answer: fallbackAns,
                                suggestions: defaultSuggestions(domainIntent, auth.role),
                            };
                        }
                    }
                }
            }
            const facts = await this.getCachedSnapshot();
            const structuredContext = await this.factBuilder.buildStructuredContext(facts);
            const det = (0, aiAssistantRoleAccess_1.canReadFinancialFactsInAi)(auth.role)
                ? this.rules.tryDeterministicGeneralAnswer(safeMessage, facts)
                : null;
            if (det) {
                aiLog("ask path", { path: "general_deterministic" });
                aiLog("ask success", { path: "general_deterministic" });
                return { answer: (0, aiLlmService_1.shapeAssistantAnswer)(det), suggestions: defaultSuggestions(domainIntent, auth.role) };
            }
            const summary = (0, aiTypes_1.summaryFactsFromSnapshot)(facts);
            const hist = Array.isArray(history) ? history : [];
            const hasHistory = hist.length > 0;
            const cacheKey = `ai:llm:gen:${auth.role}:${simpleHash(safeMessage)}:${simpleHash(JSON.stringify(summary))}:${domainIntent}`;
            if (!hasHistory) {
                const hit = this.cache.get(cacheKey);
                if (hit) {
                    aiLog("ask path", { path: "general_llm_cache" });
                    aiLog("ask success", { path: "general_llm_cache" });
                    return { answer: hit, suggestions: defaultSuggestions(domainIntent, auth.role) };
                }
            }
            const llm = await (0, aiLlmService_1.completeAssistantChat)(summary, domainIntent, structuredContext, hist, safeMessage, auth.role);
            if (llm === null) {
                aiLog("ask path", { path: "general_fallback_no_openai" });
                const out = {
                    answer: (0, aiAssistantRoleAccess_1.canReadFinancialFactsInAi)(auth.role)
                        ? this.rules.fallbackGeneralCrmAdvice(facts)
                        : "Спросите об операционных вещах: записи, пациенты, расписание — или уточните запрос.",
                    suggestions: defaultSuggestions(domainIntent, auth.role),
                };
                aiLog("ask success", { path: "general_fallback_no_openai" });
                return out;
            }
            if (llm.startsWith(aiLlmService_1.AI_UNAVAILABLE_PREFIX)) {
                aiLog("ask path", { path: "general_llm_error", fallback: true });
                aiLog("ask success", { path: "general_llm_error" });
                return { answer: llm, suggestions: defaultSuggestions(domainIntent, auth.role) };
            }
            aiLog("ask path", { path: "general_openai" });
            if (!hasHistory) {
                this.cache.set(cacheKey, llm, LLM_CACHE_TTL_MS);
            }
            aiLog("ask success", { path: "general_openai" });
            return { answer: llm, suggestions: defaultSuggestions(domainIntent, auth.role) };
        }
        catch (error) {
            console.error("[AI ERROR FULL][handle]", error);
            return { answer: FALLBACK_CRM, suggestions: [] };
        }
    }
    async getSummary(auth) {
        try {
            const facts = await this.getCachedSnapshot();
            const canFin = (0, aiAssistantRoleAccess_1.canReadFinancialFactsInAi)(auth.role);
            // eslint-disable-next-line no-console
            console.log("[AI FACTS] summary snapshot revenueToday:", facts.revenueToday, "revenue7d:", facts.revenue7d);
            if (!canFin) {
                const cards = [
                    {
                        key: "appointmentsToday",
                        label: "Записи сегодня",
                        value: `${facts.appointmentsToday} (заверш. ${facts.appointmentsCompletedToday}, ожид. ${facts.appointmentsScheduledToday})`,
                        tone: "info",
                    },
                    {
                        key: "doctorsServices",
                        label: "Врачи / услуги",
                        value: `${facts.doctorsCount} / ${facts.servicesCount}`,
                        tone: "info",
                    },
                    {
                        key: "appointmentsTotal",
                        label: "Всего записей в CRM",
                        value: String(facts.appointmentsCount),
                        tone: "info",
                    },
                    {
                        key: "noShow30d",
                        label: "Отмен/no-show (30д)",
                        value: String(facts.noShowOrCancelled30d),
                        tone: facts.noShowOrCancelled30d > 5 ? "warning" : "info",
                    },
                ];
                const summaryText = [
                    facts.appointmentsToday === 0
                        ? "На сегодня записей нет — проверьте расписание и свободные слоты."
                        : `Сегодня записей: ${facts.appointmentsToday} (завершено ${facts.appointmentsCompletedToday}, ожидают ${facts.appointmentsScheduledToday}).`,
                    facts.noShowOrCancelled30d > 5
                        ? `За 30 дней отмен/no-show: ${facts.noShowOrCancelled30d} — имеет смысл усилить подтверждения визитов.`
                        : "",
                ]
                    .filter(Boolean)
                    .join(" ");
                const recLines = [];
                if (facts.appointmentsToday < 3 && facts.doctorsCount > 0) {
                    recLines.push("Низкая загрузка на сегодня — проверьте свободные окна и напоминания пациентам.");
                }
                if (facts.noShowOrCancelled30d > 5) {
                    recLines.push("Много отмен/no-show — подтверждайте записи заранее.");
                }
                if (recLines.length === 0) {
                    recLines.push("Держите расписание и карточки пациентов в актуальном состоянии.");
                }
                return {
                    cards,
                    summaryText,
                    recommendationText: recLines.join(" "),
                };
            }
            const cards = [
                {
                    key: "revenueToday",
                    label: "Выручка сегодня",
                    value: facts.paymentsCountToday === 0 ? "Нет оплат сегодня" : (0, aiRuleEngine_1.formatSum)(facts.revenueToday),
                    tone: "success",
                },
                { key: "revenue7d", label: "Выручка 7 дней", value: (0, aiRuleEngine_1.formatSum)(facts.revenue7d), tone: "success" },
                {
                    key: "unpaid",
                    label: "Неоплаченные счета",
                    value: `${facts.unpaidCount} / ${(0, aiRuleEngine_1.formatSum)(facts.unpaidTotal)}`,
                    tone: "warning",
                },
                {
                    key: "appointmentsToday",
                    label: "Записи сегодня",
                    value: `${facts.appointmentsToday} (заверш. ${facts.appointmentsCompletedToday}, ожид. ${facts.appointmentsScheduledToday})`,
                    tone: "info",
                },
                {
                    key: "avgCheck",
                    label: "Средний чек сегодня / 7д",
                    value: `${(0, aiRuleEngine_1.formatSum)(facts.avgCheckToday)} / ${(0, aiRuleEngine_1.formatSum)(facts.avgCheck7d)}`,
                    tone: "info",
                },
                { key: "topDoctor", label: "Топ врач", value: facts.topDoctorName ?? "—", tone: "info" },
                {
                    key: "cash",
                    label: "Касса",
                    value: facts.cashShiftOpen ? "Смена открыта" : "Смена закрыта",
                    tone: facts.cashShiftOpen ? "success" : "warning",
                },
                {
                    key: "noShow30d",
                    label: "Отмен/no-show (30д)",
                    value: String(facts.noShowOrCancelled30d),
                    tone: facts.noShowOrCancelled30d > 5 ? "warning" : "info",
                },
            ];
            const summary = (0, aiTypes_1.summaryFactsFromSnapshot)(facts);
            const ownerKey = `ai:llm:owner:${simpleHash(JSON.stringify(summary))}`;
            let businessTip = this.cache.get(ownerKey);
            if (!businessTip) {
                businessTip =
                    (await (0, aiLlmService_1.completeOwnerRecommendations)(summary)) ?? this.rules.fallbackOwnerRecommendations(facts);
                if (!businessTip.startsWith(aiLlmService_1.AI_UNAVAILABLE_PREFIX)) {
                    this.cache.set(ownerKey, businessTip, LLM_CACHE_TTL_MS);
                }
            }
            const local = this.rules.buildLocalRecommendationsList(facts);
            const recommendations = [...local.slice(0, 2), businessTip, ...local.slice(2)].filter(Boolean).slice(0, 5);
            const summaryText = [
                facts.paymentsCountToday === 0
                    ? `Сегодня оплат не зафиксировано. Возможно, касса закрыта или данные ещё не обновились. За 7 дней ${(0, aiRuleEngine_1.formatSum)(facts.revenue7d)}.`
                    : `Сегодня ${(0, aiRuleEngine_1.formatSum)(facts.revenueToday)}, за 7 дней ${(0, aiRuleEngine_1.formatSum)(facts.revenue7d)}.`,
                facts.unpaidCount > 0
                    ? `Неоплаченных счетов: ${facts.unpaidCount} (${(0, aiRuleEngine_1.formatSum)(facts.unpaidTotal)}).`
                    : "Неоплаченных счетов нет.",
                facts.topDoctorName ? `Лидер по оплатам: ${facts.topDoctorName}.` : "",
            ]
                .filter(Boolean)
                .join(" ");
            return {
                cards,
                summaryText,
                recommendationText: recommendations.join(" "),
            };
        }
        catch (error) {
            console.error("[AI ERROR FULL][summary]", error);
            return {
                summaryText: FALLBACK_CRM,
                recommendationText: "Попробуйте обновить страницу или проверьте подключение к базе.",
                cards: [],
            };
        }
    }
}
exports.AIAssistantService = AIAssistantService;
