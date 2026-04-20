"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const aiAssistantRoleAccess_1 = require("../ai/aiAssistantRoleAccess");
const aiLlmService_1 = require("../ai/aiLlmService");
const aiRuleEngine_1 = require("../ai/aiRuleEngine");
const errorHandler_1 = require("../middleware/errorHandler");
const morningBriefingMetricsRepository_1 = require("../repositories/morningBriefing/morningBriefingMetricsRepository");
/**
 * Процент изменения «вчера» к «позавчера»: ((yesterday - beforeYesterday) / beforeYesterday) * 100, округление до целых.
 * При beforeYesterday === 0 деления нет — null.
 */
function percentChangeInt(yesterday, beforeYesterday) {
    if (beforeYesterday === 0)
        return null;
    return Math.round(((yesterday - beforeYesterday) / beforeYesterday) * 100);
}
/**
 * AI-сервис: брифинги и прочие обёртки над LLM (отдельно от чата aiAssistant).
 */
class AIService {
    constructor(usersRepository) {
        this.usersRepository = usersRepository;
    }
    /**
     * Сырые метрики для утреннего брифинга (PostgreSQL, TZ из `env.reportsTimezone`, по умолчанию Asia/Tashkent).
     * Для `user.role === "doctor"` — фильтр `doctor_id = user.doctorId` на записях, где поле есть; иначе вся клиника.
     */
    async getMorningBriefingData(user) {
        const scopedDoctorId = user.role === "doctor" && user.doctorId != null ? user.doctorId : null;
        return (0, morningBriefingMetricsRepository_1.loadMorningBriefingData)(scopedDoctorId);
    }
    /**
     * Персонализированный утренний брифинг.
     * Для role === doctor метрики только по doctorId; иначе — по всей клинике.
     */
    async generateMorningBriefing(auth) {
        const user = await this.usersRepository.findById(auth.userId);
        if (!user) {
            throw new errorHandler_1.ApiError(404, "User not found");
        }
        if (!user.isActive) {
            throw new errorHandler_1.ApiError(403, "User is inactive");
        }
        const scopedDoctorId = user.role === "doctor" && user.doctorId != null ? user.doctorId : null;
        const includeFinancial = (0, aiAssistantRoleAccess_1.canReadFinancialFactsInAi)(auth.role);
        const m = await this.getMorningBriefingData(user);
        const revenueChange = includeFinancial
            ? percentChangeInt(m.revenueYesterday, m.revenueBeforeYesterday)
            : null;
        const patientsChange = percentChangeInt(m.patientsYesterday, m.patientsBeforeYesterday);
        const context = {
            userName: (user.fullName ?? "").trim() || user.username,
            role: auth.role,
            scope: scopedDoctorId != null ? "doctor" : "clinic",
            revenueYesterday: includeFinancial ? m.revenueYesterday : null,
            revenueBeforeYesterday: includeFinancial ? m.revenueBeforeYesterday : null,
            revenueYesterdayFormatted: includeFinancial ? (0, aiRuleEngine_1.formatSum)(m.revenueYesterday) : null,
            revenueBeforeYesterdayFormatted: includeFinancial ? (0, aiRuleEngine_1.formatSum)(m.revenueBeforeYesterday) : null,
            revenueChange,
            patientsYesterday: m.patientsYesterday,
            patientsBeforeYesterday: m.patientsBeforeYesterday,
            patientsChange,
            cancellationsYesterday: m.cancellationsYesterday,
            unpaidInvoicesCount: includeFinancial ? m.unpaidInvoicesCount : null,
            appointmentsToday: m.appointmentsToday,
            freeSlotsToday: m.freeSlotsToday,
        };
        const raw = await (0, aiLlmService_1.completeMorningBriefing)(context);
        if (raw == null) {
            return {
                briefing: `${aiLlmService_1.AI_UNAVAILABLE_PREFIX} проверьте OPENAI_API_KEY и доступ к API.`,
            };
        }
        const trimmed = raw.trim().slice(0, 2500);
        return { briefing: trimmed || "Краткий брифинг недоступен." };
    }
}
exports.AIService = AIService;
