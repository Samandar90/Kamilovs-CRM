import type { UserRole } from "../auth/permissions";
import { hasPermission } from "../auth/permissions";
import type { AiAskQuickIntent, AiHybridIntent } from "./aiTypes";
import type { AiAssistantStructuredContext, AiLlmSummaryFacts } from "./aiTypes";

/** Сообщение при запросе финансов без прав (как в ТЗ для врача). */
export const FINANCIAL_ACCESS_DENIED_RU = "У вас нет доступа к финансовым данным.";

export const MEDICAL_ADVICE_DENIED_RU =
  "По вашей роли я не даю медицинские консультации и диагнозы. Обратитесь к врачу или используйте разделы записи и пациентов в CRM.";

/** Доступ к агрегатам выручки, счетам, оплатам, кассе в контексте AI. */
export function canReadFinancialFactsInAi(role: UserRole): boolean {
  return (
    hasPermission(role, "invoices", "read") ||
    hasPermission(role, "payments", "read") ||
    hasPermission(role, "cash", "read")
  );
}

/**
 * Роли, которым допустимы ответы на medical_question (общие ориентиры, не замена врачу).
 * Кассир и бухгалтер — только финансы и процессы.
 */
export function canReceiveMedicalAiAdvice(role: UserRole): boolean {
  if (role === "superadmin") return true;
  if (role === "cashier" || role === "accountant") return false;
  return (
    role === "doctor" ||
    role === "nurse" ||
    role === "reception" ||
    role === "operator" ||
    role === "manager" ||
    role === "director"
  );
}

const FINANCIAL_QUICK_INTENTS = new Set<AiAskQuickIntent>([
  "revenue_today",
  "revenue_7d",
  "revenue_total",
  "unpaid_invoices",
  "top_doctor",
  "top_service",
  "cashier_status",
  "business_advice",
]);

export function isFinancialQuickIntent(intent: AiAskQuickIntent): boolean {
  return FINANCIAL_QUICK_INTENTS.has(intent);
}

const FINANCIAL_HYBRID_INTENTS = new Set<AiHybridIntent>([
  "revenue",
  "unpaid",
  "top_doctor",
  "top_service",
  "cash_status",
]);

export function isFinancialHybridIntent(intent: AiHybridIntent): boolean {
  return FINANCIAL_HYBRID_INTENTS.has(intent);
}

/** Убирает финансовые поля из фактов для промпта (врач, ресепшн и т.д.). */
export function redactSummaryFactsForRole(
  facts: AiLlmSummaryFacts,
  role: UserRole
): AiLlmSummaryFacts {
  if (canReadFinancialFactsInAi(role)) return facts;
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

export function redactStructuredContextForRole(
  ctx: AiAssistantStructuredContext,
  role: UserRole
): AiAssistantStructuredContext {
  if (canReadFinancialFactsInAi(role)) return ctx;
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
