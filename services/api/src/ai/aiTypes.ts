/** Ответ ассистента (POST /api/ai/ask) */
export type AIAssistantAskResponse = {
  answer: string;
  suggestions?: string[];
  action?: {
    type: "navigate" | "open_quick_create_appointment";
    payload?: Record<string, unknown>;
  };
};

export type SummaryCard = {
  key: string;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "info";
};

export type AIAssistantSummaryResponse = {
  summaryText: string;
  recommendationText: string;
  cards: SummaryCard[];
};

export type AiDomainIntent =
  | "medical_question"
  | "crm_analytics"
  | "crm_navigation"
  | "crm_explanation"
  | "unsupported";

/** Гибридный intent (пайплайн handle): без OpenAI кроме general_crm_advice */
export type AiHybridIntent =
  | "revenue"
  | "unpaid"
  | "top_doctor"
  | "top_service"
  | "cash_status"
  | "health"
  | "general_crm_advice";

/** Гибридные интенты с отдельной выборкой (не general_crm_advice). */
export type AiDataIntent = Exclude<AiHybridIntent, "general_crm_advice">;

/** Быстрые сценарии (ключевые фразы) — только правила + факты, без LLM */
export type AiAskQuickIntent =
  | "revenue_today"
  /** Сумма net-оплат за всё время (как отчёты). */
  | "revenue_total"
  /** Выручка за последние 7 календарных дней в TZ клиники. */
  | "revenue_7d"
  | "unpaid_invoices"
  | "top_doctor"
  | "top_service"
  | "setup_status"
  | "cashier_status"
  | "patient_search"
  /** Советы по развитию клиники на основе метрик. */
  | "business_advice"
  | "help_navigation"
  | "unknown";

/** Снимок клиники из БД (кэшируется). Даты выручки — календарные дни в REPORTS_TIMEZONE. */
export type ClinicFactsSnapshot = {
  revenueToday: number;
  /** Сумма net-оплат за последние 7 календарных дней (включая сегодня). */
  revenue7d: number;
  /** Все успешные net-оплаты за всё время. */
  revenueTotal: number;
  unpaidCount: number;
  unpaidTotal: number;
  /** Средний чек = revenue / число платежей (сегодня / 7д). */
  avgCheckToday: number;
  avgCheck7d: number;
  paymentsCountToday: number;
  paymentsCount7d: number;
  topDoctorName: string | null;
  topDoctorTotal: number;
  topServiceName: string | null;
  topServiceTotal: number;
  doctorsCount: number;
  servicesCount: number;
  appointmentsCount: number;
  /** Записей с сегодняшней датой (локальная TZ). */
  appointmentsToday: number;
  appointmentsCompletedToday: number;
  /** Запланировано на сегодня (ещё не завершено / не отменено). */
  appointmentsScheduledToday: number;
  /** no_show + cancelled за 30 дней. */
  noShowOrCancelled30d: number;
  /** Средняя дневная выручка за 7д = revenue7d / 7. */
  avgDailyRevenue7Days: number;
  cashShiftOpen: boolean;
};

/**
 * Компактные факты для LLM (без массивов и сырых выгрузок).
 */
export type AiLlmSummaryFacts = {
  revenueToday: number;
  revenue7d: number;
  revenueTotal: number;
  /** Число платежей за сегодня — для объяснения «нет оплат» vs нулевая сумма. */
  paymentsCountToday: number;
  paymentsCount7d: number;
  unpaidCount: number;
  unpaidTotal: number;
  avgCheckToday: number;
  avgCheck7d: number;
  appointmentsToday: number;
  appointmentsCompletedToday: number;
  appointmentsScheduledToday: number;
  noShowOrCancelled30d: number;
  avgDailyRevenue7Days: number;
  cashShiftOpen: boolean;
  topDoctorName: string | null;
  topDoctorTotal: number;
  topServiceName: string | null;
  topServiceTotal: number;
  doctorsCount: number;
  servicesCount: number;
  appointmentsCount: number;
};

export type AiContextDoctorItem = {
  name: string;
  specialty: string | null;
};

export type AiContextServiceItem = {
  name: string;
  price: number | null;
};

export type AiAssistantStructuredContext = {
  revenueToday: number;
  revenue7d: number;
  unpaidInvoicesCount: number;
  unpaidInvoicesAmount: number;
  appointmentsToday: number;
  completedToday: number;
  pendingToday: number;
  avgCheckToday: number;
  avgCheck7d: number;
  topDoctor: string | null;
  cashShiftStatus: "open" | "closed";
  noShow30d: number;
  doctors: AiContextDoctorItem[];
  activeServices: AiContextServiceItem[];
};

/** Безопасный снимок при ошибке SQL/фактов — без падения 500. */
export const createEmptyClinicFactsSnapshot = (): ClinicFactsSnapshot => ({
  revenueToday: 0,
  revenue7d: 0,
  revenueTotal: 0,
  unpaidCount: 0,
  unpaidTotal: 0,
  avgCheckToday: 0,
  avgCheck7d: 0,
  paymentsCountToday: 0,
  paymentsCount7d: 0,
  topDoctorName: null,
  topDoctorTotal: 0,
  topServiceName: null,
  topServiceTotal: 0,
  doctorsCount: 0,
  servicesCount: 0,
  appointmentsCount: 0,
  appointmentsToday: 0,
  appointmentsCompletedToday: 0,
  appointmentsScheduledToday: 0,
  noShowOrCancelled30d: 0,
  avgDailyRevenue7Days: 0,
  cashShiftOpen: false,
});

export const summaryFactsFromSnapshot = (f: ClinicFactsSnapshot): AiLlmSummaryFacts => ({
  revenueToday: f.revenueToday,
  revenue7d: f.revenue7d,
  revenueTotal: f.revenueTotal,
  paymentsCountToday: f.paymentsCountToday,
  paymentsCount7d: f.paymentsCount7d,
  unpaidCount: f.unpaidCount,
  unpaidTotal: f.unpaidTotal,
  avgCheckToday: f.avgCheckToday,
  avgCheck7d: f.avgCheck7d,
  appointmentsToday: f.appointmentsToday,
  appointmentsCompletedToday: f.appointmentsCompletedToday,
  appointmentsScheduledToday: f.appointmentsScheduledToday,
  noShowOrCancelled30d: f.noShowOrCancelled30d,
  avgDailyRevenue7Days: f.avgDailyRevenue7Days,
  cashShiftOpen: f.cashShiftOpen,
  topDoctorName: f.topDoctorName,
  topDoctorTotal: f.topDoctorTotal,
  topServiceName: f.topServiceName,
  topServiceTotal: f.topServiceTotal,
  doctorsCount: f.doctorsCount,
  servicesCount: f.servicesCount,
  appointmentsCount: f.appointmentsCount,
});
