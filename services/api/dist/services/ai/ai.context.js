"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIContextBuilder = void 0;
exports.formatHumanCrmContextForAssistant = formatHumanCrmContextForAssistant;
exports.formatCompactContext = formatCompactContext;
const aiAssistantRoleAccess_1 = require("../../ai/aiAssistantRoleAccess");
const aiFactBuilderService_1 = require("../../ai/aiFactBuilderService");
const DEFAULT_CONTEXT = {
    revenueToday: 0,
    revenue7d: 0,
    unpaidInvoicesCount: 0,
    unpaidInvoicesAmount: 0,
    appointmentsToday: 0,
    completedToday: 0,
    pendingToday: 0,
    avgCheckToday: 0,
    avgCheck7d: 0,
    topDoctor: null,
    cashShiftStatus: "closed",
    noShow30d: 0,
    doctorsSummary: "нет данных",
    servicesSummary: "нет данных",
};
class AIContextBuilder {
    constructor() {
        this.facts = new aiFactBuilderService_1.AiFactBuilderService();
    }
    async buildCRMContext() {
        try {
            const snapshot = await this.facts.getClinicSnapshot();
            const structured = await this.facts.buildStructuredContext(snapshot);
            return {
                revenueToday: structured.revenueToday,
                revenue7d: structured.revenue7d,
                unpaidInvoicesCount: structured.unpaidInvoicesCount,
                unpaidInvoicesAmount: structured.unpaidInvoicesAmount,
                appointmentsToday: structured.appointmentsToday,
                completedToday: structured.completedToday,
                pendingToday: structured.pendingToday,
                avgCheckToday: structured.avgCheckToday,
                avgCheck7d: structured.avgCheck7d,
                topDoctor: structured.topDoctor,
                cashShiftStatus: structured.cashShiftStatus,
                noShow30d: structured.noShow30d,
                doctorsSummary: structured.doctors.length > 0
                    ? structured.doctors
                        .slice(0, 8)
                        .map((d) => `${d.name}${d.specialty ? ` (${d.specialty})` : ""}`)
                        .join("; ")
                    : "нет данных",
                servicesSummary: structured.activeServices.length > 0
                    ? structured.activeServices
                        .slice(0, 8)
                        .map((s) => `${s.name}${s.price != null ? ` (${Math.round(s.price).toLocaleString("ru-RU")} сум)` : ""}`)
                        .join("; ")
                    : "нет данных",
            };
        }
        catch (error) {
            console.error("[AI CONTEXT] buildCRMContext failed", error);
            return DEFAULT_CONTEXT;
        }
    }
}
exports.AIContextBuilder = AIContextBuilder;
const sumRu = (value) => `${Math.round(value).toLocaleString("ru-RU")} сум`;
/**
 * Человекочитаемый снимок CRM для user-сообщения к OpenAI (с учётом роли: финансы скрыты там, где нет прав).
 */
function formatHumanCrmContextForAssistant(context, role) {
    const lines = ["Снимок CRM (опирайся только на эти данные):"];
    if ((0, aiAssistantRoleAccess_1.canReadFinancialFactsInAi)(role)) {
        lines.push(`- Выручка сегодня: ${sumRu(context.revenueToday)}`);
        lines.push(`- Выручка за 7 дней: ${sumRu(context.revenue7d)}`);
        lines.push(`- Неоплаченных счетов: ${context.unpaidInvoicesCount} на сумму ${sumRu(context.unpaidInvoicesAmount)}`);
        lines.push(`- Средний чек сегодня / за 7 дней: ${sumRu(context.avgCheckToday)} / ${sumRu(context.avgCheck7d)}`);
        if (context.topDoctor)
            lines.push(`- Лидер по оплатам среди врачей: ${context.topDoctor}`);
        lines.push(`- Касса: ${context.cashShiftStatus === "open" ? "смена открыта" : "смена закрыта"}`);
    }
    else {
        lines.push(`- Финансовые суммы по вашей роли в промпт не передаются — не называй выручку, счета и кассу.`);
    }
    lines.push(`- Записей сегодня: ${context.appointmentsToday} (завершено ${context.completedToday}, ожидают ${context.pendingToday})`);
    lines.push(`- Отмен/no-show за 30 дней: ${context.noShow30d}`);
    lines.push(`- Врачи (фрагмент): ${context.doctorsSummary}`);
    lines.push(`- Услуги (фрагмент): ${context.servicesSummary}`);
    return lines.join("\n");
}
function formatCompactContext(context) {
    return [
        `revenueToday=${context.revenueToday}`,
        `revenue7d=${context.revenue7d}`,
        `unpaidInvoicesCount=${context.unpaidInvoicesCount}`,
        `unpaidInvoicesAmount=${context.unpaidInvoicesAmount}`,
        `appointmentsToday=${context.appointmentsToday}`,
        `completedToday=${context.completedToday}`,
        `pendingToday=${context.pendingToday}`,
        `avgCheckToday=${context.avgCheckToday}`,
        `avgCheck7d=${context.avgCheck7d}`,
        `topDoctor=${context.topDoctor ?? "null"}`,
        `cashShiftStatus=${context.cashShiftStatus}`,
        `noShow30d=${context.noShow30d}`,
        `doctors=${context.doctorsSummary}`,
        `services=${context.servicesSummary}`,
    ].join("\n");
}
