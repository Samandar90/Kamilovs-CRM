/** Снимок данных для AI-рекомендаций (источник — IReportsRepository). */
export type RecommendationsAnalyticsData = {
  /** Количество оплат, учитываемых в аналитике (валидный счёт, не удалённый платёж). */
  qualifyingPaymentsCount: number;
  revenueTotal: number;
  revenueToday: number;
  topDoctor: { name: string; revenue: number } | null;
  topService: { name: string; revenue: number } | null;
  unpaidInvoicesCount: number;
  /** Выручка по дням за последние 7 календарных дней (таймзона отчётов), от старого к новому. */
  dailyRevenueLast7Days: number[];
  /** Доля записей за 30 дней по врачу (сумма = 100% среди врачей с записями). */
  doctorLoads: { doctorName: string; loadPct: number }[];
};
