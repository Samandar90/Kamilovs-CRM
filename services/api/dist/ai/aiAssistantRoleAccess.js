"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEDICAL_ADVICE_DENIED_RU = exports.FINANCIAL_ACCESS_DENIED_RU = void 0;
exports.canReadFinancialFactsInAi = canReadFinancialFactsInAi;
exports.canReceiveMedicalAiAdvice = canReceiveMedicalAiAdvice;
exports.isFinancialQuickIntent = isFinancialQuickIntent;
exports.isFinancialHybridIntent = isFinancialHybridIntent;
exports.redactSummaryFactsForRole = redactSummaryFactsForRole;
exports.redactStructuredContextForRole = redactStructuredContextForRole;
const permissions_1 = require("../auth/permissions");
/** Сообщение при запросе финансов без прав (как в ТЗ для врача). */
exports.FINANCIAL_ACCESS_DENIED_RU = "У вас нет доступа к финансовым данным.";
exports.MEDICAL_ADVICE_DENIED_RU = "По вашей роли я не даю медицинские консультации и диагнозы. Обратитесь к врачу или используйте разделы записи и пациентов в CRM.";
/** Доступ к агрегатам выручки, счетам, оплатам, кассе в контексте AI. */
function canReadFinancialFactsInAi(role) {
    return ((0, permissions_1.hasPermission)(role, "invoices", "read") ||
        (0, permissions_1.hasPermission)(role, "payments", "read") ||
        (0, permissions_1.hasPermission)(role, "cash", "read"));
}
/**
 * Роли, которым допустимы ответы на medical_question (общие ориентиры, не замена врачу).
 * Кассир и бухгалтер — только финансы и процессы.
 */
function canReceiveMedicalAiAdvice(role) {
    if (role === "superadmin")
        return true;
    if (role === "cashier" || role === "accountant")
        return false;
    return (role === "doctor" ||
        role === "nurse" ||
        role === "reception" ||
        role === "operator" ||
        role === "manager" ||
        role === "director");
}
const FINANCIAL_QUICK_INTENTS = new Set([
    "revenue_today",
    "revenue_7d",
    "revenue_total",
    "unpaid_invoices",
    "top_doctor",
    "top_service",
    "cashier_status",
    "business_advice",
]);
function isFinancialQuickIntent(intent) {
    return FINANCIAL_QUICK_INTENTS.has(intent);
}
const FINANCIAL_HYBRID_INTENTS = new Set([
    "revenue",
    "unpaid",
    "top_doctor",
    "top_service",
    "cash_status",
]);
function isFinancialHybridIntent(intent) {
    return FINANCIAL_HYBRID_INTENTS.has(intent);
}
/** Убирает финансовые поля из фактов для промпта (врач, ресепшн и т.д.). */
function redactSummaryFactsForRole(facts, role) {
    if (canReadFinancialFactsInAi(role))
        return facts;
    return {
        ...facts,
        revenueToday: 0,
        revenue7d: 0,
        revenueTotal: 0,
        paymentsCountToday: 0,
        paymentsCount7d: 0,
        unpaidCount: 0,
        unpaidTotal: 0,
        avgCheckToday: 0,
        avgCheck7d: 0,
        avgDailyRevenue7Days: 0,
        cashShiftOpen: false,
        topDoctorName: null,
        topDoctorTotal: 0,
        topServiceName: null,
        topServiceTotal: 0,
    };
}
function redactStructuredContextForRole(ctx, role) {
    if (canReadFinancialFactsInAi(role))
        return ctx;
    return {
        ...ctx,
        revenueToday: 0,
        revenue7d: 0,
        unpaidInvoicesCount: 0,
        unpaidInvoicesAmount: 0,
        avgCheckToday: 0,
        avgCheck7d: 0,
        topDoctor: null,
        cashShiftStatus: "closed",
        doctors: ctx.doctors,
        activeServices: ctx.activeServices,
    };
}
