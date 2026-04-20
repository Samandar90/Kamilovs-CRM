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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvc2VydmljZXMvYWlBc3Npc3RhbnRTZXJ2aWNlLnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9zZXJ2aWNlcy9haUFzc2lzdGFudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBRUEseURBQXlFO0FBQ3pFLHFFQUFrRTtBQUNsRSxtRUFBMkY7QUFDM0YsdUVBT3FDO0FBQ3JDLHlEQUFpRztBQUNqRyxxREFNNEI7QUFDNUIscURBQTZEO0FBUzdELDJDQUF5RjtBQUl6RixNQUFNLFlBQVksR0FBRyxnQ0FBZ0MsQ0FBQztBQUN0RCxNQUFNLGlCQUFpQixHQUFHLDhDQUE4QyxDQUFDO0FBRXpFLDZEQUE2RDtBQUM3RCxNQUFNLG9CQUFvQixHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO0FBQzNDLHdDQUF3QztBQUN4QyxNQUFNLGdCQUFnQixHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO0FBRXhDLFNBQVMsVUFBVSxDQUFDLENBQVM7SUFDM0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ1YsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUM7UUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekUsT0FBTyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3pCLENBQUM7QUFFRCxTQUFTLEtBQUssQ0FBQyxLQUFhLEVBQUUsT0FBZ0M7SUFDNUQsc0NBQXNDO0lBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxLQUFLLEVBQUUsRUFB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QyxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUc7b0JBQ2xJLENBQUMsQ0FBQyxXQUFXLElBQUEsd0JBQVMsRUFBQyxLQUFLLENBQUMsWUFBWSxDQUFDLGVBQWUsSUFBQSx3QkFBUyxFQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBRztnQkFDeEYsS0FBSyxDQUFDLFdBQVcsR0FBRyxDQUFDO29CQUNuQixDQUFDLENBQUMsd0JBQXdCLEtBQUssQ0FBQyxXQUFXLEtBQUssSUFBQSx3QkFBUyxFQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBSTtvQkFDaEYsQ0FBQyxDQUFDLDBCQUEwQjtnQkFDOUIsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMscUJBQXFCLEtBQUssQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTthQUN2RTtpQkFDRSxNQUFNLENBQUMsT0FBTyxDQUFDO2lCQUNmLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUViLE9BQU87Z0JBQ0wsS0FBSztnQkFDTCxXQUFXO2dCQUNYLGtCQUFrQixFQUFFLGVBQWUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO2FBQzlDLENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDakQsT0FBTztnQkFDTCxXQUFXLEVBQUUsWUFBWTtnQkFDekIsa0JBQWtCLEVBQUUsZ0VBQWdFO2dCQUNwRixLQUFLLEVBQUUsRUFBRTthQUNWLENBQUM7UUFDSixDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBN1VELGdEQTZVQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgVXNlclJvbGUgfSBmcm9tIFwiLi4vYXV0aC9wZXJtaXNzaW9uc1wiO1xyXG5pbXBvcnQgdHlwZSB7IEF1dGhUb2tlblBheWxvYWQgfSBmcm9tIFwiLi4vcmVwb3NpdG9yaWVzL2ludGVyZmFjZXMvdXNlclR5cGVzXCI7XHJcbmltcG9ydCB7IEFJX0ZBQ1RTX0NBQ0hFX0tFWSwgc2hhcmVkQWlDYWNoZSB9IGZyb20gXCIuLi9haS9haUNhY2hlU2VydmljZVwiO1xyXG5pbXBvcnQgeyBBaUZhY3RCdWlsZGVyU2VydmljZSB9IGZyb20gXCIuLi9haS9haUZhY3RCdWlsZGVyU2VydmljZVwiO1xyXG5pbXBvcnQgeyBBSV9BQ0NFU1NfREVOSUVEX01FU1NBR0UsIGNoZWNrQUlSZXF1ZXN0QWNjZXNzIH0gZnJvbSBcIi4uL2FpL2FpQXNzaXN0YW50SGFyZEdhdGVcIjtcclxuaW1wb3J0IHtcclxuICBGSU5BTkNJQUxfQUNDRVNTX0RFTklFRF9SVSxcclxuICBNRURJQ0FMX0FEVklDRV9ERU5JRURfUlUsXHJcbiAgY2FuUmVhZEZpbmFuY2lhbEZhY3RzSW5BaSxcclxuICBjYW5SZWNlaXZlTWVkaWNhbEFpQWR2aWNlLFxyXG4gIGlzRmluYW5jaWFsSHlicmlkSW50ZW50LFxyXG4gIGlzRmluYW5jaWFsUXVpY2tJbnRlbnQsXHJcbn0gZnJvbSBcIi4uL2FpL2FpQXNzaXN0YW50Um9sZUFjY2Vzc1wiO1xyXG5pbXBvcnQgeyByb3V0ZUFza1F1aWNrSW50ZW50LCByb3V0ZURvbWFpbkludGVudCwgcm91dGVIeWJyaWRJbnRlbnQgfSBmcm9tIFwiLi4vYWkvYWlJbnRlbnRSb3V0ZXJcIjtcclxuaW1wb3J0IHtcclxuICBBSV9VTkFWQUlMQUJMRV9QUkVGSVgsXHJcbiAgdHlwZSBBc3Npc3RhbnRDaGF0SGlzdG9yeUl0ZW0sXHJcbiAgY29tcGxldGVBc3Npc3RhbnRDaGF0LFxyXG4gIGNvbXBsZXRlT3duZXJSZWNvbW1lbmRhdGlvbnMsXHJcbiAgc2hhcGVBc3Npc3RhbnRBbnN3ZXIsXHJcbn0gZnJvbSBcIi4uL2FpL2FpTGxtU2VydmljZVwiO1xyXG5pbXBvcnQgeyBBaVJ1bGVFbmdpbmUsIGZvcm1hdFN1bSB9IGZyb20gXCIuLi9haS9haVJ1bGVFbmdpbmVcIjtcclxuaW1wb3J0IHR5cGUge1xyXG4gIEFJQXNzaXN0YW50QXNrUmVzcG9uc2UsXHJcbiAgQUlBc3Npc3RhbnRTdW1tYXJ5UmVzcG9uc2UsXHJcbiAgQWlEYXRhSW50ZW50LFxyXG4gIEFpRG9tYWluSW50ZW50LFxyXG4gIENsaW5pY0ZhY3RzU25hcHNob3QsXHJcbiAgU3VtbWFyeUNhcmQsXHJcbn0gZnJvbSBcIi4uL2FpL2FpVHlwZXNcIjtcclxuaW1wb3J0IHsgY3JlYXRlRW1wdHlDbGluaWNGYWN0c1NuYXBzaG90LCBzdW1tYXJ5RmFjdHNGcm9tU25hcHNob3QgfSBmcm9tIFwiLi4vYWkvYWlUeXBlc1wiO1xyXG5cclxuZXhwb3J0IHR5cGUgeyBBSUFzc2lzdGFudEFza1Jlc3BvbnNlLCBDbGluaWNGYWN0c1NuYXBzaG90LCBTdW1tYXJ5Q2FyZCB9IGZyb20gXCIuLi9haS9haVR5cGVzXCI7XHJcblxyXG5jb25zdCBGQUxMQkFDS19DUk0gPSBcItCd0LUg0YPQtNCw0LvQvtGB0Ywg0L/QvtC70YPRh9C40YLRjCDQtNCw0L3QvdGL0LUgQ1JNXCI7XHJcbmNvbnN0IFVOU1VQUE9SVEVEX1JFUExZID0gXCLQryDRgNCw0LHQvtGC0LDRjiDRgtC+0LvRjNC60L4g0YEg0LzQtdC00LjRhtC40L3QvtC5INC4INGB0LjRgdGC0LXQvNC+0LkgQ1JNLlwiO1xyXG5cclxuLyoqINCh0L3QuNC80L7QuiDQvNC10YLRgNC40Log0LTQu9GPIEFJIOKAlCAzINC80LjQvSAo0LDQutGC0YPQsNC70YzQvdC10LUg0L/QvtGB0LvQtSDQvtC/0LvQsNGCKS4gKi9cclxuY29uc3QgTUVUUklDU19DQUNIRV9UVExfTVMgPSAzICogNjAgKiAxMDAwO1xyXG4vKiog0JrRjdGIIExMTSBvd25lciAvIGdlbmVyYWwg4oCUIDEwINC80LjQvS4gKi9cclxuY29uc3QgTExNX0NBQ0hFX1RUTF9NUyA9IDEwICogNjAgKiAxMDAwO1xyXG5cclxuZnVuY3Rpb24gc2ltcGxlSGFzaChzOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGxldCBoID0gMDtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IHMubGVuZ3RoOyBpICs9IDEpIGggPSAoaCA8PCA1KSAtIGggKyBzLmNoYXJDb2RlQXQoaSk7XHJcbiAgcmV0dXJuIFN0cmluZyhoID4+PiAwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYWlMb2coZXZlbnQ6IHN0cmluZywgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcclxuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gIGNvbnNvbGUubG9nKGBbQUldICR7ZXZlbnR9YCwgSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkZWZhdWx0U3VnZ2VzdGlvbnMoZG9tYWluSW50ZW50OiBBaURvbWFpbkludGVudCwgcm9sZTogVXNlclJvbGUpOiBzdHJpbmdbXSB7XHJcbiAgaWYgKGRvbWFpbkludGVudCA9PT0gXCJtZWRpY2FsX3F1ZXN0aW9uXCIpIHtcclxuICAgIHJldHVybiBbXHJcbiAgICAgIFwi0J/QsNGG0LjQtdC90YIg0LbQsNC70YPQtdGC0YHRjyDQvdCwINCz0L7Qu9C+0LLQvdGD0Y4g0LHQvtC70Ywg4oCUINGH0YLQviDQtNC10LvQsNGC0Yw/XCIsXHJcbiAgICAgIFwi0JrQsNC60LjQtSDRgtGA0LXQstC+0LbQvdGL0LUg0L/RgNC40LfQvdCw0LrQuCDRgtGA0LXQsdGD0Y7RgiDRgdGA0L7Rh9C90L7Qs9C+INC+0YHQvNC+0YLRgNCwP1wiLFxyXG4gICAgICBcItCa0LDQuiDQvtCx0YrRj9GB0L3QuNGC0Ywg0L/QsNGG0LjQtdC90YLRgyDRgNC10LbQuNC8INCx0LXQtyDQvdCw0LfQvdCw0YfQtdC90LjRjyDQu9C10YfQtdC90LjRjz9cIixcclxuICAgIF07XHJcbiAgfVxyXG4gIGlmICghY2FuUmVhZEZpbmFuY2lhbEZhY3RzSW5BaShyb2xlKSkge1xyXG4gICAgaWYgKHJvbGUgPT09IFwiZG9jdG9yXCIgfHwgcm9sZSA9PT0gXCJudXJzZVwiKSB7XHJcbiAgICAgIHJldHVybiBbXHJcbiAgICAgICAgXCLQnNC+0Lgg0LfQsNC/0LjRgdC4INC90LAg0YHQtdCz0L7QtNC90Y9cIixcclxuICAgICAgICBcItCh0LrQvtC70YzQutC+INGDINC80LXQvdGPINC+0YLQvNC10L0g0LfQsCDQvNC10YHRj9GGP1wiLFxyXG4gICAgICAgIFwi0JrQsNC6INC+0YLQvNC10YLQuNGC0Ywg0L/RgNC40ZHQvCDQsiBDUk0/XCIsXHJcbiAgICAgICAgXCLQndCw0L/QvtC80L3QuCDQv9GA0LDQstC40LvQsCBuby1zaG93XCIsXHJcbiAgICAgIF07XHJcbiAgICB9XHJcbiAgICByZXR1cm4gW1xyXG4gICAgICBcItCX0LDQv9C40YHQuCDQvdCwINGB0LXQs9C+0LTQvdGPXCIsXHJcbiAgICAgIFwi0JrQsNC6INC90LDQudGC0Lgg0L/QsNGG0LjQtdC90YLQsD9cIixcclxuICAgICAgXCLQodCy0L7QsdC+0LTQvdGL0LUg0L7QutC90LAg0YMg0LLRgNCw0YfQtdC5XCIsXHJcbiAgICAgIFwi0KfRgtC+INCy0LDQttC90L4g0YHQtdCz0L7QtNC90Y8g0L/QviDRgNCw0YHQv9C40YHQsNC90LjRjj9cIixcclxuICAgIF07XHJcbiAgfVxyXG4gIGlmIChyb2xlID09PSBcImNhc2hpZXJcIiB8fCByb2xlID09PSBcImFjY291bnRhbnRcIikge1xyXG4gICAgcmV0dXJuIFtcclxuICAgICAgXCLQodC60L7Qu9GM0LrQviDQvdC10L7Qv9C70LDRh9C10L3QvdGL0YUg0YHRh9C10YLQvtCyP1wiLFxyXG4gICAgICBcItCh0YLQsNGC0YPRgSDQutCw0YHRgdGLINC4INGB0LzQtdC90YtcIixcclxuICAgICAgXCLQn9C+0LrQsNC20Lgg0L/QvtGB0LvQtdC00L3QuNC1INC/0LvQsNGC0LXQttC4XCIsXHJcbiAgICAgIFwi0JPQtNC1INGB0YfQtdGC0LAg0Log0L7Qv9C70LDRgtC1P1wiLFxyXG4gICAgXTtcclxuICB9XHJcbiAgaWYgKHJvbGUgPT09IFwibWFuYWdlclwiIHx8IHJvbGUgPT09IFwiZGlyZWN0b3JcIiB8fCByb2xlID09PSBcInN1cGVyYWRtaW5cIikge1xyXG4gICAgcmV0dXJuIFtcclxuICAgICAgXCLQn9C+0LrQsNC20Lgg0LLRi9GA0YPRh9C60YMg0LfQsCDQvdC10LTQtdC70Y5cIixcclxuICAgICAgXCLQmtGC0L4g0L/QtdGA0LXQs9GA0YPQttC10L0g0YHQtdCz0L7QtNC90Y8/XCIsXHJcbiAgICAgIFwi0JrQsNC60LjQtSDQv9Cw0YbQuNC10L3RgtGLINGBINC00L7Qu9Cz0LDQvNC4P1wiLFxyXG4gICAgICBcItCT0LTQtSDQvNGLINGC0LXRgNGP0LXQvCDQtNC10L3RjNCz0Lgg0L/QviDQtNCw0L3QvdGL0LwgQ1JNP1wiLFxyXG4gICAgXTtcclxuICB9XHJcbiAgcmV0dXJuIFtcclxuICAgIFwi0J/QvtC60LDQttC4INCy0YvRgNGD0YfQutGDINC30LAg0L3QtdC00LXQu9GOXCIsXHJcbiAgICBcItCa0YLQviDQv9C10YDQtdCz0YDRg9C20LXQvSDRgdC10LPQvtC00L3Rjz9cIixcclxuICAgIFwi0JrQsNC60LjQtSDQv9Cw0YbQuNC10L3RgtGLINGBINC00L7Qu9Cz0LDQvNC4P1wiLFxyXG4gICAgXCLQp9GC0L4g0LLQsNC20L3QviDRgdC10LPQvtC00L3RjyDQv9C+INC60LvQuNC90LjQutC1P1wiLFxyXG4gIF07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN1Z2dlc3Rpb25zQWZ0ZXJNZWRpY2FsRGVuaWFsKHJvbGU6IFVzZXJSb2xlKTogc3RyaW5nW10ge1xyXG4gIGlmIChjYW5SZWFkRmluYW5jaWFsRmFjdHNJbkFpKHJvbGUpKSB7XHJcbiAgICByZXR1cm4gW1xyXG4gICAgICBcItCf0L7QutCw0LbQuCDQstGL0YDRg9GH0LrRgyDQt9CwINC90LXQtNC10LvRjlwiLFxyXG4gICAgICBcItCh0LrQvtC70YzQutC+INC90LXQvtC/0LvQsNGH0LXQvdC90YvRhSDRgdGH0LXRgtC+0LI/XCIsXHJcbiAgICAgIFwi0KHRgtCw0YLRg9GBINC60LDRgdGB0YtcIixcclxuICAgICAgXCLQntGC0LrRgNGL0YLRjCDQvtGC0YfRkdGC0YtcIixcclxuICAgIF07XHJcbiAgfVxyXG4gIHJldHVybiBbXCLQl9Cw0L/QuNGB0Lgg0L3QsCDRgdC10LPQvtC00L3Rj1wiLCBcItCa0LDQuiDQvdCw0LnRgtC4INC/0LDRhtC40LXQvdGC0LA/XCIsIFwi0KHQstC+0LHQvtC00L3Ri9C1INC+0LrQvdCwXCIsIFwi0KfRgtC+INCy0LDQttC90L4g0YHQtdCz0L7QtNC90Y8/XCJdO1xyXG59XHJcblxyXG5mdW5jdGlvbiBoZWxwTmF2aWdhdGlvblRvdWNoZXNGaW5hbmNlKG1lc3NhZ2U6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gIGNvbnN0IHQgPSBtZXNzYWdlLnRvTG93ZXJDYXNlKCk7XHJcbiAgcmV0dXJuIChcclxuICAgIHQuaW5jbHVkZXMoXCLQutCw0YHRgVwiKSB8fFxyXG4gICAgdC5pbmNsdWRlcyhcItGB0YfQtdGCXCIpIHx8XHJcbiAgICB0LmluY2x1ZGVzKFwi0YHRh9GR0YJcIikgfHxcclxuICAgIHQuaW5jbHVkZXMoXCLQvtC/0LvQsNGCXCIpIHx8XHJcbiAgICB0LmluY2x1ZGVzKFwi0LHQuNC70LvQuNC90LNcIikgfHxcclxuICAgIHQuaW5jbHVkZXMoXCLQstGL0YDRg9GH0LpcIikgfHxcclxuICAgIHQuaW5jbHVkZXMoXCLQuNC90LLQvtC50YFcIilcclxuICApO1xyXG59XHJcblxyXG4vKipcclxuICog0J7RgNC60LXRgdGC0YDQsNGC0L7RgDogcm91dGVyIOKGkiBmYWN0cyAo0LrRjdGIKSDihpIgcXVpY2sgLyBoeWJyaWQgKNCx0LXQtyBMTE0pIOKGkiBnZW5lcmFsIChMTE0g0L/QviDQttC10LvQsNC90LjRjikuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgQUlBc3Npc3RhbnRTZXJ2aWNlIHtcclxuICBwcml2YXRlIHJlYWRvbmx5IGZhY3RCdWlsZGVyID0gbmV3IEFpRmFjdEJ1aWxkZXJTZXJ2aWNlKCk7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBydWxlcyA9IG5ldyBBaVJ1bGVFbmdpbmUoKTtcclxuICBwcml2YXRlIHJlYWRvbmx5IGNhY2hlID0gc2hhcmVkQWlDYWNoZTtcclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRDYWNoZWRTbmFwc2hvdCgpOiBQcm9taXNlPENsaW5pY0ZhY3RzU25hcHNob3Q+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGhpdCA9IHRoaXMuY2FjaGUuZ2V0PENsaW5pY0ZhY3RzU25hcHNob3Q+KEFJX0ZBQ1RTX0NBQ0hFX0tFWSk7XHJcbiAgICAgIGlmIChoaXQpIHJldHVybiBoaXQ7XHJcbiAgICAgIGNvbnN0IHNuYXAgPSBhd2FpdCB0aGlzLmZhY3RCdWlsZGVyLmdldENsaW5pY1NuYXBzaG90KCk7XHJcbiAgICAgIGFpTG9nKFwiZmFjdHNfYnVpbHRcIiwge1xyXG4gICAgICAgIHJldmVudWVUb2RheTogc25hcC5yZXZlbnVlVG9kYXksXHJcbiAgICAgICAgcmV2ZW51ZTdkOiBzbmFwLnJldmVudWU3ZCxcclxuICAgICAgICB1bnBhaWRDb3VudDogc25hcC51bnBhaWRDb3VudCxcclxuICAgICAgICBwYXltZW50c0NvdW50VG9kYXk6IHNuYXAucGF5bWVudHNDb3VudFRvZGF5LFxyXG4gICAgICB9KTtcclxuICAgICAgdGhpcy5jYWNoZS5zZXQoQUlfRkFDVFNfQ0FDSEVfS0VZLCBzbmFwLCBNRVRSSUNTX0NBQ0hFX1RUTF9NUyk7XHJcbiAgICAgIHJldHVybiBzbmFwO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIltBSV0gZ2V0Q2FjaGVkU25hcHNob3RcIiwgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gY3JlYXRlRW1wdHlDbGluaWNGYWN0c1NuYXBzaG90KCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBoYW5kbGUoXHJcbiAgICBhdXRoOiBBdXRoVG9rZW5QYXlsb2FkLFxyXG4gICAgbWVzc2FnZTogc3RyaW5nLFxyXG4gICAgaGlzdG9yeT86IEFzc2lzdGFudENoYXRIaXN0b3J5SXRlbVtdXHJcbiAgKTogUHJvbWlzZTxBSUFzc2lzdGFudEFza1Jlc3BvbnNlPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBzYWZlTWVzc2FnZSA9IFN0cmluZyhtZXNzYWdlID8/IFwiXCIpLnRyaW0oKTtcclxuICAgICAgaWYgKCFzYWZlTWVzc2FnZSkge1xyXG4gICAgICAgIHJldHVybiB7IGFuc3dlcjogXCLQn9GD0YHRgtC+0Lkg0LfQsNC/0YDQvtGBXCIsIHN1Z2dlc3Rpb25zOiBbXSB9O1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChwcm9jZXNzLmVudi5BSV9URVNUX01PREUgPT09IFwidHJ1ZVwiKSB7XHJcbiAgICAgICAgcmV0dXJuIHsgYW5zd2VyOiBcIkFJINGA0LDQsdC+0YLQsNC10YIgKNGC0LXRgdGCKVwiLCBzdWdnZXN0aW9uczogW10gfTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCFjaGVja0FJUmVxdWVzdEFjY2VzcyhhdXRoLnJvbGUsIHNhZmVNZXNzYWdlKSkge1xyXG4gICAgICAgIGNvbnN0IGFsbG93ZWQgPSBmYWxzZTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIlJPTEU6XCIsIGF1dGgucm9sZSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJNRVNTQUdFOlwiLCBzYWZlTWVzc2FnZSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJBTExPV0VEOlwiLCBhbGxvd2VkKTtcclxuICAgICAgICBhaUxvZyhcImFzayBwYXRoXCIsIHsgcGF0aDogXCJoYXJkX2dhdGVfYmxvY2tcIiwgcm9sZTogYXV0aC5yb2xlIH0pO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBhbnN3ZXI6IEFJX0FDQ0VTU19ERU5JRURfTUVTU0FHRSxcclxuICAgICAgICAgIHN1Z2dlc3Rpb25zOiBkZWZhdWx0U3VnZ2VzdGlvbnMocm91dGVEb21haW5JbnRlbnQoc2FmZU1lc3NhZ2UpLCBhdXRoLnJvbGUpLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGRvbWFpbkludGVudCA9IHJvdXRlRG9tYWluSW50ZW50KHNhZmVNZXNzYWdlKTtcclxuICAgICAgYWlMb2coXCJhc2sgaW50ZW50XCIsIHsgcm91dGU6IFwiZG9tYWluXCIsIGludGVudDogZG9tYWluSW50ZW50IH0pO1xyXG4gICAgICBpZiAoZG9tYWluSW50ZW50ID09PSBcInVuc3VwcG9ydGVkXCIpIHtcclxuICAgICAgICByZXR1cm4geyBhbnN3ZXI6IFVOU1VQUE9SVEVEX1JFUExZLCBzdWdnZXN0aW9uczogW10gfTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGRvbWFpbkludGVudCA9PT0gXCJtZWRpY2FsX3F1ZXN0aW9uXCIgJiYgIWNhblJlY2VpdmVNZWRpY2FsQWlBZHZpY2UoYXV0aC5yb2xlKSkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBhbnN3ZXI6IE1FRElDQUxfQURWSUNFX0RFTklFRF9SVSxcclxuICAgICAgICAgIHN1Z2dlc3Rpb25zOiBzdWdnZXN0aW9uc0FmdGVyTWVkaWNhbERlbmlhbChhdXRoLnJvbGUpLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChkb21haW5JbnRlbnQgIT09IFwibWVkaWNhbF9xdWVzdGlvblwiKSB7XHJcbiAgICAgICAgY29uc3QgcXVpY2sgPSByb3V0ZUFza1F1aWNrSW50ZW50KHNhZmVNZXNzYWdlKTtcclxuICAgICAgICBhaUxvZyhcImFzayBpbnRlbnRcIiwgeyByb3V0ZTogXCJxdWlja1wiLCBpbnRlbnQ6IHF1aWNrIH0pO1xyXG5cclxuICAgICAgICBpZiAocXVpY2sgIT09IFwidW5rbm93blwiKSB7XHJcbiAgICAgICAgICBjb25zdCBjYW5GaW4gPSBjYW5SZWFkRmluYW5jaWFsRmFjdHNJbkFpKGF1dGgucm9sZSk7XHJcbiAgICAgICAgICBpZiAoaXNGaW5hbmNpYWxRdWlja0ludGVudChxdWljaykgJiYgIWNhbkZpbikge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgIGFuc3dlcjogRklOQU5DSUFMX0FDQ0VTU19ERU5JRURfUlUsXHJcbiAgICAgICAgICAgICAgc3VnZ2VzdGlvbnM6IGRlZmF1bHRTdWdnZXN0aW9ucyhkb21haW5JbnRlbnQsIGF1dGgucm9sZSksXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAocXVpY2sgPT09IFwiaGVscF9uYXZpZ2F0aW9uXCIgJiYgIWNhbkZpbiAmJiBoZWxwTmF2aWdhdGlvblRvdWNoZXNGaW5hbmNlKHNhZmVNZXNzYWdlKSkge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgIGFuc3dlcjogRklOQU5DSUFMX0FDQ0VTU19ERU5JRURfUlUsXHJcbiAgICAgICAgICAgICAgc3VnZ2VzdGlvbnM6IGRlZmF1bHRTdWdnZXN0aW9ucyhkb21haW5JbnRlbnQsIGF1dGgucm9sZSksXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBjb25zdCBmYWN0cyA9IGF3YWl0IHRoaXMuZ2V0Q2FjaGVkU25hcHNob3QoKTtcclxuICAgICAgICAgIGNvbnN0IHF1aWNrUmVzID0gYXdhaXQgdGhpcy5ydWxlcy5hbnN3ZXJBc2tRdWljayhxdWljaywgZmFjdHMsIHNhZmVNZXNzYWdlKTtcclxuICAgICAgICAgIGlmIChxdWlja1Jlcykge1xyXG4gICAgICAgICAgICBhaUxvZyhcImFzayBwYXRoXCIsIHsgcGF0aDogXCJxdWlja19sb2NhbFwiLCBpbnRlbnQ6IHF1aWNrIH0pO1xyXG4gICAgICAgICAgICBhaUxvZyhcImFzayBzdWNjZXNzXCIsIHsgcGF0aDogXCJxdWlja19sb2NhbFwiIH0pO1xyXG4gICAgICAgICAgICByZXR1cm4gcXVpY2tSZXM7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBoeWJyaWQgPSByb3V0ZUh5YnJpZEludGVudChzYWZlTWVzc2FnZSk7XHJcbiAgICAgICAgYWlMb2coXCJhc2sgaW50ZW50XCIsIHsgcm91dGU6IFwiaHlicmlkXCIsIGludGVudDogaHlicmlkIH0pO1xyXG5cclxuICAgICAgICBpZiAoaHlicmlkICE9PSBcImdlbmVyYWxfY3JtX2FkdmljZVwiKSB7XHJcbiAgICAgICAgICBjb25zdCBjYW5GaW4gPSBjYW5SZWFkRmluYW5jaWFsRmFjdHNJbkFpKGF1dGgucm9sZSk7XHJcbiAgICAgICAgICBpZiAoaXNGaW5hbmNpYWxIeWJyaWRJbnRlbnQoaHlicmlkKSAmJiAhY2FuRmluKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgYW5zd2VyOiBGSU5BTkNJQUxfQUNDRVNTX0RFTklFRF9SVSxcclxuICAgICAgICAgICAgICBzdWdnZXN0aW9uczogZGVmYXVsdFN1Z2dlc3Rpb25zKGRvbWFpbkludGVudCwgYXV0aC5yb2xlKSxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGNvbnN0IHNraXBIeWJyaWRIZWFsdGggPSBoeWJyaWQgPT09IFwiaGVhbHRoXCIgJiYgIWNhbkZpbjtcclxuICAgICAgICAgIGlmICghc2tpcEh5YnJpZEhlYWx0aCkge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgIGNvbnN0IGRhdGFJbnRlbnQgPSBoeWJyaWQgYXMgQWlEYXRhSW50ZW50O1xyXG4gICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGF3YWl0IHRoaXMuZmFjdEJ1aWxkZXIuZmV0Y2hIeWJyaWREYXRhKGRhdGFJbnRlbnQpO1xyXG4gICAgICAgICAgICAgIGNvbnN0IGVucmljaGVkID0gdGhpcy5mYWN0QnVpbGRlci5lbnJpY2hEYXRhKGRhdGFJbnRlbnQsIHJhdyk7XHJcbiAgICAgICAgICAgICAgYWlMb2coXCJhc2sgcGF0aFwiLCB7IHBhdGg6IFwiaHlicmlkX3J1bGVzXCIsIGludGVudDogZGF0YUludGVudCB9KTtcclxuICAgICAgICAgICAgICBjb25zdCBvdXQgPSB7XHJcbiAgICAgICAgICAgICAgICBhbnN3ZXI6IHRoaXMucnVsZXMuYW5zd2VySHlicmlkKGRhdGFJbnRlbnQsIGVucmljaGVkKSxcclxuICAgICAgICAgICAgICAgIHN1Z2dlc3Rpb25zOiBkZWZhdWx0U3VnZ2VzdGlvbnMoZG9tYWluSW50ZW50LCBhdXRoLnJvbGUpLFxyXG4gICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgYWlMb2coXCJhc2sgc3VjY2Vzc1wiLCB7IHBhdGg6IFwiaHlicmlkX3J1bGVzXCIgfSk7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIG91dDtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiW0FJXSBoeWJyaWQgYmxvY2sgZXJyb3JcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgIGNvbnN0IGZhY3RzID0gYXdhaXQgdGhpcy5nZXRDYWNoZWRTbmFwc2hvdCgpO1xyXG4gICAgICAgICAgICAgIGNvbnN0IGZhbGxiYWNrQW5zID0gY2FuRmluXHJcbiAgICAgICAgICAgICAgICA/IHRoaXMucnVsZXMuZmFsbGJhY2tHZW5lcmFsQ3JtQWR2aWNlKGZhY3RzKVxyXG4gICAgICAgICAgICAgICAgOiBcItCd0LUg0YPQtNCw0LvQvtGB0Ywg0LfQsNCz0YDRg9C30LjRgtGMINC00LDQvdC90YvQtS4g0KHQv9GA0L7RgdC40YLQtSDQv9GA0L4g0LfQsNC/0LjRgdC4INC40LvQuCDQv9Cw0YbQuNC10L3RgtC+0LIg4oCUINC40LvQuCDQv9C+0LLRgtC+0YDQuNGC0LUg0L/QvtC30LbQtS5cIjtcclxuICAgICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgYW5zd2VyOiBmYWxsYmFja0FucyxcclxuICAgICAgICAgICAgICAgIHN1Z2dlc3Rpb25zOiBkZWZhdWx0U3VnZ2VzdGlvbnMoZG9tYWluSW50ZW50LCBhdXRoLnJvbGUpLFxyXG4gICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGZhY3RzID0gYXdhaXQgdGhpcy5nZXRDYWNoZWRTbmFwc2hvdCgpO1xyXG4gICAgICBjb25zdCBzdHJ1Y3R1cmVkQ29udGV4dCA9IGF3YWl0IHRoaXMuZmFjdEJ1aWxkZXIuYnVpbGRTdHJ1Y3R1cmVkQ29udGV4dChmYWN0cyk7XHJcbiAgICAgIGNvbnN0IGRldCA9XHJcbiAgICAgICAgY2FuUmVhZEZpbmFuY2lhbEZhY3RzSW5BaShhdXRoLnJvbGUpXHJcbiAgICAgICAgICA/IHRoaXMucnVsZXMudHJ5RGV0ZXJtaW5pc3RpY0dlbmVyYWxBbnN3ZXIoc2FmZU1lc3NhZ2UsIGZhY3RzKVxyXG4gICAgICAgICAgOiBudWxsO1xyXG4gICAgICBpZiAoZGV0KSB7XHJcbiAgICAgICAgYWlMb2coXCJhc2sgcGF0aFwiLCB7IHBhdGg6IFwiZ2VuZXJhbF9kZXRlcm1pbmlzdGljXCIgfSk7XHJcbiAgICAgICAgYWlMb2coXCJhc2sgc3VjY2Vzc1wiLCB7IHBhdGg6IFwiZ2VuZXJhbF9kZXRlcm1pbmlzdGljXCIgfSk7XHJcbiAgICAgICAgcmV0dXJuIHsgYW5zd2VyOiBzaGFwZUFzc2lzdGFudEFuc3dlcihkZXQpLCBzdWdnZXN0aW9uczogZGVmYXVsdFN1Z2dlc3Rpb25zKGRvbWFpbkludGVudCwgYXV0aC5yb2xlKSB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBzdW1tYXJ5ID0gc3VtbWFyeUZhY3RzRnJvbVNuYXBzaG90KGZhY3RzKTtcclxuICAgICAgY29uc3QgaGlzdCA9IEFycmF5LmlzQXJyYXkoaGlzdG9yeSkgPyBoaXN0b3J5IDogW107XHJcbiAgICAgIGNvbnN0IGhhc0hpc3RvcnkgPSBoaXN0Lmxlbmd0aCA+IDA7XHJcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gYGFpOmxsbTpnZW46JHthdXRoLnJvbGV9OiR7c2ltcGxlSGFzaChzYWZlTWVzc2FnZSl9OiR7c2ltcGxlSGFzaChKU09OLnN0cmluZ2lmeShzdW1tYXJ5KSl9OiR7ZG9tYWluSW50ZW50fWA7XHJcbiAgICAgIGlmICghaGFzSGlzdG9yeSkge1xyXG4gICAgICAgIGNvbnN0IGhpdCA9IHRoaXMuY2FjaGUuZ2V0PHN0cmluZz4oY2FjaGVLZXkpO1xyXG4gICAgICAgIGlmIChoaXQpIHtcclxuICAgICAgICAgIGFpTG9nKFwiYXNrIHBhdGhcIiwgeyBwYXRoOiBcImdlbmVyYWxfbGxtX2NhY2hlXCIgfSk7XHJcbiAgICAgICAgICBhaUxvZyhcImFzayBzdWNjZXNzXCIsIHsgcGF0aDogXCJnZW5lcmFsX2xsbV9jYWNoZVwiIH0pO1xyXG4gICAgICAgICAgcmV0dXJuIHsgYW5zd2VyOiBoaXQsIHN1Z2dlc3Rpb25zOiBkZWZhdWx0U3VnZ2VzdGlvbnMoZG9tYWluSW50ZW50LCBhdXRoLnJvbGUpIH07XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBsbG0gPSBhd2FpdCBjb21wbGV0ZUFzc2lzdGFudENoYXQoXHJcbiAgICAgICAgc3VtbWFyeSxcclxuICAgICAgICBkb21haW5JbnRlbnQsXHJcbiAgICAgICAgc3RydWN0dXJlZENvbnRleHQsXHJcbiAgICAgICAgaGlzdCxcclxuICAgICAgICBzYWZlTWVzc2FnZSxcclxuICAgICAgICBhdXRoLnJvbGVcclxuICAgICAgKTtcclxuICAgICAgaWYgKGxsbSA9PT0gbnVsbCkge1xyXG4gICAgICAgIGFpTG9nKFwiYXNrIHBhdGhcIiwgeyBwYXRoOiBcImdlbmVyYWxfZmFsbGJhY2tfbm9fb3BlbmFpXCIgfSk7XHJcbiAgICAgICAgY29uc3Qgb3V0ID0ge1xyXG4gICAgICAgICAgYW5zd2VyOiBjYW5SZWFkRmluYW5jaWFsRmFjdHNJbkFpKGF1dGgucm9sZSlcclxuICAgICAgICAgICAgPyB0aGlzLnJ1bGVzLmZhbGxiYWNrR2VuZXJhbENybUFkdmljZShmYWN0cylcclxuICAgICAgICAgICAgOiBcItCh0L/RgNC+0YHQuNGC0LUg0L7QsSDQvtC/0LXRgNCw0YbQuNC+0L3QvdGL0YUg0LLQtdGJ0LDRhTog0LfQsNC/0LjRgdC4LCDQv9Cw0YbQuNC10L3RgtGLLCDRgNCw0YHQv9C40YHQsNC90LjQtSDigJQg0LjQu9C4INGD0YLQvtGH0L3QuNGC0LUg0LfQsNC/0YDQvtGBLlwiLFxyXG4gICAgICAgICAgc3VnZ2VzdGlvbnM6IGRlZmF1bHRTdWdnZXN0aW9ucyhkb21haW5JbnRlbnQsIGF1dGgucm9sZSksXHJcbiAgICAgICAgfTtcclxuICAgICAgICBhaUxvZyhcImFzayBzdWNjZXNzXCIsIHsgcGF0aDogXCJnZW5lcmFsX2ZhbGxiYWNrX25vX29wZW5haVwiIH0pO1xyXG4gICAgICAgIHJldHVybiBvdXQ7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGxsbS5zdGFydHNXaXRoKEFJX1VOQVZBSUxBQkxFX1BSRUZJWCkpIHtcclxuICAgICAgICBhaUxvZyhcImFzayBwYXRoXCIsIHsgcGF0aDogXCJnZW5lcmFsX2xsbV9lcnJvclwiLCBmYWxsYmFjazogdHJ1ZSB9KTtcclxuICAgICAgICBhaUxvZyhcImFzayBzdWNjZXNzXCIsIHsgcGF0aDogXCJnZW5lcmFsX2xsbV9lcnJvclwiIH0pO1xyXG4gICAgICAgIHJldHVybiB7IGFuc3dlcjogbGxtLCBzdWdnZXN0aW9uczogZGVmYXVsdFN1Z2dlc3Rpb25zKGRvbWFpbkludGVudCwgYXV0aC5yb2xlKSB9O1xyXG4gICAgICB9XHJcbiAgICAgIGFpTG9nKFwiYXNrIHBhdGhcIiwgeyBwYXRoOiBcImdlbmVyYWxfb3BlbmFpXCIgfSk7XHJcbiAgICAgIGlmICghaGFzSGlzdG9yeSkge1xyXG4gICAgICAgIHRoaXMuY2FjaGUuc2V0KGNhY2hlS2V5LCBsbG0sIExMTV9DQUNIRV9UVExfTVMpO1xyXG4gICAgICB9XHJcbiAgICAgIGFpTG9nKFwiYXNrIHN1Y2Nlc3NcIiwgeyBwYXRoOiBcImdlbmVyYWxfb3BlbmFpXCIgfSk7XHJcbiAgICAgIHJldHVybiB7IGFuc3dlcjogbGxtLCBzdWdnZXN0aW9uczogZGVmYXVsdFN1Z2dlc3Rpb25zKGRvbWFpbkludGVudCwgYXV0aC5yb2xlKSB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIltBSSBFUlJPUiBGVUxMXVtoYW5kbGVdXCIsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIHsgYW5zd2VyOiBGQUxMQkFDS19DUk0sIHN1Z2dlc3Rpb25zOiBbXSB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgZ2V0U3VtbWFyeShhdXRoOiBBdXRoVG9rZW5QYXlsb2FkKTogUHJvbWlzZTxBSUFzc2lzdGFudFN1bW1hcnlSZXNwb25zZT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgZmFjdHMgPSBhd2FpdCB0aGlzLmdldENhY2hlZFNuYXBzaG90KCk7XHJcbiAgICAgIGNvbnN0IGNhbkZpbiA9IGNhblJlYWRGaW5hbmNpYWxGYWN0c0luQWkoYXV0aC5yb2xlKTtcclxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgICAgY29uc29sZS5sb2coXCJbQUkgRkFDVFNdIHN1bW1hcnkgc25hcHNob3QgcmV2ZW51ZVRvZGF5OlwiLCBmYWN0cy5yZXZlbnVlVG9kYXksIFwicmV2ZW51ZTdkOlwiLCBmYWN0cy5yZXZlbnVlN2QpO1xyXG5cclxuICAgICAgaWYgKCFjYW5GaW4pIHtcclxuICAgICAgICBjb25zdCBjYXJkczogU3VtbWFyeUNhcmRbXSA9IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAga2V5OiBcImFwcG9pbnRtZW50c1RvZGF5XCIsXHJcbiAgICAgICAgICAgIGxhYmVsOiBcItCX0LDQv9C40YHQuCDRgdC10LPQvtC00L3Rj1wiLFxyXG4gICAgICAgICAgICB2YWx1ZTogYCR7ZmFjdHMuYXBwb2ludG1lbnRzVG9kYXl9ICjQt9Cw0LLQtdGA0YguICR7ZmFjdHMuYXBwb2ludG1lbnRzQ29tcGxldGVkVG9kYXl9LCDQvtC20LjQtC4gJHtmYWN0cy5hcHBvaW50bWVudHNTY2hlZHVsZWRUb2RheX0pYCxcclxuICAgICAgICAgICAgdG9uZTogXCJpbmZvXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBrZXk6IFwiZG9jdG9yc1NlcnZpY2VzXCIsXHJcbiAgICAgICAgICAgIGxhYmVsOiBcItCS0YDQsNGH0LggLyDRg9GB0LvRg9Cz0LhcIixcclxuICAgICAgICAgICAgdmFsdWU6IGAke2ZhY3RzLmRvY3RvcnNDb3VudH0gLyAke2ZhY3RzLnNlcnZpY2VzQ291bnR9YCxcclxuICAgICAgICAgICAgdG9uZTogXCJpbmZvXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBrZXk6IFwiYXBwb2ludG1lbnRzVG90YWxcIixcclxuICAgICAgICAgICAgbGFiZWw6IFwi0JLRgdC10LPQviDQt9Cw0L/QuNGB0LXQuSDQsiBDUk1cIixcclxuICAgICAgICAgICAgdmFsdWU6IFN0cmluZyhmYWN0cy5hcHBvaW50bWVudHNDb3VudCksXHJcbiAgICAgICAgICAgIHRvbmU6IFwiaW5mb1wiLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAga2V5OiBcIm5vU2hvdzMwZFwiLFxyXG4gICAgICAgICAgICBsYWJlbDogXCLQntGC0LzQtdC9L25vLXNob3cgKDMw0LQpXCIsXHJcbiAgICAgICAgICAgIHZhbHVlOiBTdHJpbmcoZmFjdHMubm9TaG93T3JDYW5jZWxsZWQzMGQpLFxyXG4gICAgICAgICAgICB0b25lOiBmYWN0cy5ub1Nob3dPckNhbmNlbGxlZDMwZCA+IDUgPyBcIndhcm5pbmdcIiA6IFwiaW5mb1wiLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdO1xyXG4gICAgICAgIGNvbnN0IHN1bW1hcnlUZXh0ID0gW1xyXG4gICAgICAgICAgZmFjdHMuYXBwb2ludG1lbnRzVG9kYXkgPT09IDBcclxuICAgICAgICAgICAgPyBcItCd0LAg0YHQtdCz0L7QtNC90Y8g0LfQsNC/0LjRgdC10Lkg0L3QtdGCIOKAlCDQv9GA0L7QstC10YDRjNGC0LUg0YDQsNGB0L/QuNGB0LDQvdC40LUg0Lgg0YHQstC+0LHQvtC00L3Ri9C1INGB0LvQvtGC0YsuXCJcclxuICAgICAgICAgICAgOiBg0KHQtdCz0L7QtNC90Y8g0LfQsNC/0LjRgdC10Lk6ICR7ZmFjdHMuYXBwb2ludG1lbnRzVG9kYXl9ICjQt9Cw0LLQtdGA0YjQtdC90L4gJHtmYWN0cy5hcHBvaW50bWVudHNDb21wbGV0ZWRUb2RheX0sINC+0LbQuNC00LDRjtGCICR7ZmFjdHMuYXBwb2ludG1lbnRzU2NoZWR1bGVkVG9kYXl9KS5gLFxyXG4gICAgICAgICAgZmFjdHMubm9TaG93T3JDYW5jZWxsZWQzMGQgPiA1XHJcbiAgICAgICAgICAgID8gYNCX0LAgMzAg0LTQvdC10Lkg0L7RgtC80LXQvS9uby1zaG93OiAke2ZhY3RzLm5vU2hvd09yQ2FuY2VsbGVkMzBkfSDigJQg0LjQvNC10LXRgiDRgdC80YvRgdC7INGD0YHQuNC70LjRgtGMINC/0L7QtNGC0LLQtdGA0LbQtNC10L3QuNGPINCy0LjQt9C40YLQvtCyLmBcclxuICAgICAgICAgICAgOiBcIlwiLFxyXG4gICAgICAgIF1cclxuICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbilcclxuICAgICAgICAgIC5qb2luKFwiIFwiKTtcclxuICAgICAgICBjb25zdCByZWNMaW5lczogc3RyaW5nW10gPSBbXTtcclxuICAgICAgICBpZiAoZmFjdHMuYXBwb2ludG1lbnRzVG9kYXkgPCAzICYmIGZhY3RzLmRvY3RvcnNDb3VudCA+IDApIHtcclxuICAgICAgICAgIHJlY0xpbmVzLnB1c2goXCLQndC40LfQutCw0Y8g0LfQsNCz0YDRg9C30LrQsCDQvdCwINGB0LXQs9C+0LTQvdGPIOKAlCDQv9GA0L7QstC10YDRjNGC0LUg0YHQstC+0LHQvtC00L3Ri9C1INC+0LrQvdCwINC4INC90LDQv9C+0LzQuNC90LDQvdC40Y8g0L/QsNGG0LjQtdC90YLQsNC8LlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGZhY3RzLm5vU2hvd09yQ2FuY2VsbGVkMzBkID4gNSkge1xyXG4gICAgICAgICAgcmVjTGluZXMucHVzaChcItCc0L3QvtCz0L4g0L7RgtC80LXQvS9uby1zaG93IOKAlCDQv9C+0LTRgtCy0LXRgNC20LTQsNC50YLQtSDQt9Cw0L/QuNGB0Lgg0LfQsNGA0LDQvdC10LUuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocmVjTGluZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICByZWNMaW5lcy5wdXNoKFwi0JTQtdGA0LbQuNGC0LUg0YDQsNGB0L/QuNGB0LDQvdC40LUg0Lgg0LrQsNGA0YLQvtGH0LrQuCDQv9Cw0YbQuNC10L3RgtC+0LIg0LIg0LDQutGC0YPQsNC70YzQvdC+0Lwg0YHQvtGB0YLQvtGP0L3QuNC4LlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGNhcmRzLFxyXG4gICAgICAgICAgc3VtbWFyeVRleHQsXHJcbiAgICAgICAgICByZWNvbW1lbmRhdGlvblRleHQ6IHJlY0xpbmVzLmpvaW4oXCIgXCIpLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGNhcmRzOiBTdW1tYXJ5Q2FyZFtdID0gW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGtleTogXCJyZXZlbnVlVG9kYXlcIixcclxuICAgICAgICAgIGxhYmVsOiBcItCS0YvRgNGD0YfQutCwINGB0LXQs9C+0LTQvdGPXCIsXHJcbiAgICAgICAgICB2YWx1ZTpcclxuICAgICAgICAgICAgZmFjdHMucGF5bWVudHNDb3VudFRvZGF5ID09PSAwID8gXCLQndC10YIg0L7Qv9C70LDRgiDRgdC10LPQvtC00L3Rj1wiIDogZm9ybWF0U3VtKGZhY3RzLnJldmVudWVUb2RheSksXHJcbiAgICAgICAgICB0b25lOiBcInN1Y2Nlc3NcIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIHsga2V5OiBcInJldmVudWU3ZFwiLCBsYWJlbDogXCLQktGL0YDRg9GH0LrQsCA3INC00L3QtdC5XCIsIHZhbHVlOiBmb3JtYXRTdW0oZmFjdHMucmV2ZW51ZTdkKSwgdG9uZTogXCJzdWNjZXNzXCIgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBrZXk6IFwidW5wYWlkXCIsXHJcbiAgICAgICAgICBsYWJlbDogXCLQndC10L7Qv9C70LDRh9C10L3QvdGL0LUg0YHRh9C10YLQsFwiLFxyXG4gICAgICAgICAgdmFsdWU6IGAke2ZhY3RzLnVucGFpZENvdW50fSAvICR7Zm9ybWF0U3VtKGZhY3RzLnVucGFpZFRvdGFsKX1gLFxyXG4gICAgICAgICAgdG9uZTogXCJ3YXJuaW5nXCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBrZXk6IFwiYXBwb2ludG1lbnRzVG9kYXlcIixcclxuICAgICAgICAgIGxhYmVsOiBcItCX0LDQv9C40YHQuCDRgdC10LPQvtC00L3Rj1wiLFxyXG4gICAgICAgICAgdmFsdWU6IGAke2ZhY3RzLmFwcG9pbnRtZW50c1RvZGF5fSAo0LfQsNCy0LXRgNGILiAke2ZhY3RzLmFwcG9pbnRtZW50c0NvbXBsZXRlZFRvZGF5fSwg0L7QttC40LQuICR7ZmFjdHMuYXBwb2ludG1lbnRzU2NoZWR1bGVkVG9kYXl9KWAsXHJcbiAgICAgICAgICB0b25lOiBcImluZm9cIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGtleTogXCJhdmdDaGVja1wiLFxyXG4gICAgICAgICAgbGFiZWw6IFwi0KHRgNC10LTQvdC40Lkg0YfQtdC6INGB0LXQs9C+0LTQvdGPIC8gN9C0XCIsXHJcbiAgICAgICAgICB2YWx1ZTogYCR7Zm9ybWF0U3VtKGZhY3RzLmF2Z0NoZWNrVG9kYXkpfSAvICR7Zm9ybWF0U3VtKGZhY3RzLmF2Z0NoZWNrN2QpfWAsXHJcbiAgICAgICAgICB0b25lOiBcImluZm9cIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIHsga2V5OiBcInRvcERvY3RvclwiLCBsYWJlbDogXCLQotC+0L8g0LLRgNCw0YdcIiwgdmFsdWU6IGZhY3RzLnRvcERvY3Rvck5hbWUgPz8gXCLigJRcIiwgdG9uZTogXCJpbmZvXCIgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBrZXk6IFwiY2FzaFwiLFxyXG4gICAgICAgICAgbGFiZWw6IFwi0JrQsNGB0YHQsFwiLFxyXG4gICAgICAgICAgdmFsdWU6IGZhY3RzLmNhc2hTaGlmdE9wZW4gPyBcItCh0LzQtdC90LAg0L7RgtC60YDRi9GC0LBcIiA6IFwi0KHQvNC10L3QsCDQt9Cw0LrRgNGL0YLQsFwiLFxyXG4gICAgICAgICAgdG9uZTogZmFjdHMuY2FzaFNoaWZ0T3BlbiA/IFwic3VjY2Vzc1wiIDogXCJ3YXJuaW5nXCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBrZXk6IFwibm9TaG93MzBkXCIsXHJcbiAgICAgICAgICBsYWJlbDogXCLQntGC0LzQtdC9L25vLXNob3cgKDMw0LQpXCIsXHJcbiAgICAgICAgICB2YWx1ZTogU3RyaW5nKGZhY3RzLm5vU2hvd09yQ2FuY2VsbGVkMzBkKSxcclxuICAgICAgICAgIHRvbmU6IGZhY3RzLm5vU2hvd09yQ2FuY2VsbGVkMzBkID4gNSA/IFwid2FybmluZ1wiIDogXCJpbmZvXCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgXTtcclxuXHJcbiAgICAgIGNvbnN0IHN1bW1hcnkgPSBzdW1tYXJ5RmFjdHNGcm9tU25hcHNob3QoZmFjdHMpO1xyXG4gICAgICBjb25zdCBvd25lcktleSA9IGBhaTpsbG06b3duZXI6JHtzaW1wbGVIYXNoKEpTT04uc3RyaW5naWZ5KHN1bW1hcnkpKX1gO1xyXG4gICAgICBsZXQgYnVzaW5lc3NUaXAgPSB0aGlzLmNhY2hlLmdldDxzdHJpbmc+KG93bmVyS2V5KTtcclxuICAgICAgaWYgKCFidXNpbmVzc1RpcCkge1xyXG4gICAgICAgIGJ1c2luZXNzVGlwID1cclxuICAgICAgICAgIChhd2FpdCBjb21wbGV0ZU93bmVyUmVjb21tZW5kYXRpb25zKHN1bW1hcnkpKSA/PyB0aGlzLnJ1bGVzLmZhbGxiYWNrT3duZXJSZWNvbW1lbmRhdGlvbnMoZmFjdHMpO1xyXG4gICAgICAgIGlmICghYnVzaW5lc3NUaXAuc3RhcnRzV2l0aChBSV9VTkFWQUlMQUJMRV9QUkVGSVgpKSB7XHJcbiAgICAgICAgICB0aGlzLmNhY2hlLnNldChvd25lcktleSwgYnVzaW5lc3NUaXAsIExMTV9DQUNIRV9UVExfTVMpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgbG9jYWwgPSB0aGlzLnJ1bGVzLmJ1aWxkTG9jYWxSZWNvbW1lbmRhdGlvbnNMaXN0KGZhY3RzKTtcclxuICAgICAgY29uc3QgcmVjb21tZW5kYXRpb25zID0gWy4uLmxvY2FsLnNsaWNlKDAsIDIpLCBidXNpbmVzc1RpcCwgLi4ubG9jYWwuc2xpY2UoMildLmZpbHRlcihCb29sZWFuKS5zbGljZSgwLCA1KTtcclxuXHJcbiAgICAgIGNvbnN0IHN1bW1hcnlUZXh0ID0gW1xyXG4gICAgICAgIGZhY3RzLnBheW1lbnRzQ291bnRUb2RheSA9PT0gMFxyXG4gICAgICAgICAgPyBg0KHQtdCz0L7QtNC90Y8g0L7Qv9C70LDRgiDQvdC1INC30LDRhNC40LrRgdC40YDQvtCy0LDQvdC+LiDQktC+0LfQvNC+0LbQvdC+LCDQutCw0YHRgdCwINC30LDQutGA0YvRgtCwINC40LvQuCDQtNCw0L3QvdGL0LUg0LXRidGRINC90LUg0L7QsdC90L7QstC40LvQuNGB0YwuINCX0LAgNyDQtNC90LXQuSAke2Zvcm1hdFN1bShmYWN0cy5yZXZlbnVlN2QpfS5gXHJcbiAgICAgICAgICA6IGDQodC10LPQvtC00L3RjyAke2Zvcm1hdFN1bShmYWN0cy5yZXZlbnVlVG9kYXkpfSwg0LfQsCA3INC00L3QtdC5ICR7Zm9ybWF0U3VtKGZhY3RzLnJldmVudWU3ZCl9LmAsXHJcbiAgICAgICAgZmFjdHMudW5wYWlkQ291bnQgPiAwXHJcbiAgICAgICAgICA/IGDQndC10L7Qv9C70LDRh9C10L3QvdGL0YUg0YHRh9C10YLQvtCyOiAke2ZhY3RzLnVucGFpZENvdW50fSAoJHtmb3JtYXRTdW0oZmFjdHMudW5wYWlkVG90YWwpfSkuYFxyXG4gICAgICAgICAgOiBcItCd0LXQvtC/0LvQsNGH0LXQvdC90YvRhSDRgdGH0LXRgtC+0LIg0L3QtdGCLlwiLFxyXG4gICAgICAgIGZhY3RzLnRvcERvY3Rvck5hbWUgPyBg0JvQuNC00LXRgCDQv9C+INC+0L/Qu9Cw0YLQsNC8OiAke2ZhY3RzLnRvcERvY3Rvck5hbWV9LmAgOiBcIlwiLFxyXG4gICAgICBdXHJcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKVxyXG4gICAgICAgIC5qb2luKFwiIFwiKTtcclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgY2FyZHMsXHJcbiAgICAgICAgc3VtbWFyeVRleHQsXHJcbiAgICAgICAgcmVjb21tZW5kYXRpb25UZXh0OiByZWNvbW1lbmRhdGlvbnMuam9pbihcIiBcIiksXHJcbiAgICAgIH07XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiW0FJIEVSUk9SIEZVTExdW3N1bW1hcnldXCIsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdW1tYXJ5VGV4dDogRkFMTEJBQ0tfQ1JNLFxyXG4gICAgICAgIHJlY29tbWVuZGF0aW9uVGV4dDogXCLQn9C+0L/RgNC+0LHRg9C50YLQtSDQvtCx0L3QvtCy0LjRgtGMINGB0YLRgNCw0L3QuNGG0YMg0LjQu9C4INC/0YDQvtCy0LXRgNGM0YLQtSDQv9C+0LTQutC70Y7Rh9C10L3QuNC1INC6INCx0LDQt9C1LlwiLFxyXG4gICAgICAgIGNhcmRzOiBbXSxcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIl19