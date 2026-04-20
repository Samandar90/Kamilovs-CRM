"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIRecommendationsService = void 0;
const aiLlmService_1 = require("../ai/aiLlmService");
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const average7 = (daily) => daily.length === 0 ? 0 : sum(daily) / daily.length;
const buildFallbackRecommendations = (data) => {
    const out = [];
    const avg = average7(data.dailyRevenueLast7Days);
    if (avg > 0 && data.revenueToday < avg * 0.85) {
        out.push("Сегодня выручка ниже среднего за неделю — проверьте записи, кассу и напоминания пациентам.");
    }
    if (data.unpaidInvoicesCount > 0) {
        out.push(`Обратить внимание на неоплаченные счета (${data.unpaidInvoicesCount}) — контроль дебиторки снижает кассовые разрывы.`);
    }
    if (data.topService && data.topService.revenue > 0) {
        out.push(`Продвигать услугу «${data.topService.name}» — лидирует по выручке; усильте маркетинг и кросс-продажи.`);
    }
    if (data.topDoctor && data.topDoctor.revenue > 0) {
        out.push(`Увеличить загрузку врачей: опирайтесь на «${data.topDoctor.name}» и при необходимости перераспределите записи между специалистами.`);
    }
    if (avg > 0) {
        out.push(`Прогноз выручки на завтра (по среднему за 7 дней): около ${Math.round(avg).toLocaleString("ru-RU")} сум.`);
    }
    if (data.doctorLoads.length > 0) {
        const max = data.doctorLoads[0];
        if (max.loadPct > 45) {
            out.push(`Загрузка врачей: у «${max.doctorName}» ${max.loadPct}% записей за 30 дней — при риске очереди добавьте слоты или второго специалиста.`);
        }
    }
    if (out.length === 0) {
        out.push("Сохраняйте ритм приёма и фиксируйте оплаты сразу после оказания услуг.");
    }
    return out.slice(0, 8);
};
const buildOpenAiSummaryPayload = (data, forecastTomorrow) => JSON.stringify({
    revenueTotal: data.revenueTotal,
    revenueToday: data.revenueToday,
    topDoctor: data.topDoctor,
    topService: data.topService,
    unpaidInvoices: data.unpaidInvoicesCount,
    dailyRevenueLast7Days: data.dailyRevenueLast7Days,
    doctorLoads: data.doctorLoads,
    forecastTomorrow,
});
class AIRecommendationsService {
    constructor(reportsRepository) {
        this.reportsRepository = reportsRepository;
    }
    async getRecommendations(_auth) {
        const data = await this.reportsRepository.getRecommendationsAnalytics();
        if (data.qualifyingPaymentsCount < 3) {
            return {
                message: "Недостаточно данных для анализа",
                recommendations: [],
            };
        }
        const forecastTomorrow = average7(data.dailyRevenueLast7Days);
        const summaryPayload = buildOpenAiSummaryPayload(data, forecastTomorrow);
        let recommendations = null;
        let source = "fallback";
        const openAi = await (0, aiLlmService_1.completeDashboardRecommendationsFromSummaryJson)(summaryPayload);
        if (openAi && openAi.length > 0) {
            const first = openAi[0] ?? "";
            const isApiError = first.startsWith(aiLlmService_1.AI_UNAVAILABLE_PREFIX);
            if (isApiError) {
                recommendations = openAi;
                source = "fallback";
            }
            else {
                recommendations = openAi;
                source = "openai";
            }
        }
        else {
            recommendations = buildFallbackRecommendations(data);
        }
        return {
            revenueTotal: data.revenueTotal,
            revenueToday: data.revenueToday,
            topDoctor: data.topDoctor,
            topService: data.topService,
            unpaidInvoices: data.unpaidInvoicesCount,
            recommendations,
            forecastTomorrow,
            doctorLoads: data.doctorLoads,
            source,
        };
    }
}
exports.AIRecommendationsService = AIRecommendationsService;
