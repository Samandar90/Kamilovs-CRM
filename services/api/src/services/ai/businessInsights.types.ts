export type BusinessInsightSeverity = "warning" | "info" | "success";

/** Карточка инсайта для UI (короткий SaaS-формат). */
export type BusinessInsight = {
  type: BusinessInsightSeverity;
  title: string;
  message: string;
  recommendation: string;
  /** Кнопка перехода в CRM (path как во фронте, без origin). */
  link?: { label: string; path: string };
};

/** Внутренние теги для фильтрации по роли (не отдаются клиенту). */
export type BusinessInsightTag = "financial" | "schedule" | "cash" | "clinical" | "general";

export type TaggedBusinessInsight = BusinessInsight & { tags: BusinessInsightTag[] };

/** Снимок метрик для rule-based инсайтов. */
export type BusinessInsightsMetrics = {
  revenueToday: number;
  revenue7d: number;
  revenuePrev7d: number;
  paymentsCountToday: number;
  paymentsCount7d: number;
  unpaidInvoicesCount: number;
  unpaidInvoicesAmount: number;
  appointmentsToday: number;
  completedToday: number;
  pendingToday: number;
  cancelledToday: number;
  noShow30d: number;
  avgCheckToday: number;
  avgCheck7d: number;
  topDoctor: string | null;
  cashShiftOpen: boolean;
  doctorsCount: number;
  appointmentsCount: number;
  /** Доля записей по врачам за 30 дней (имя → количество). */
  doctorAppointmentLoads: { name: string; count: number }[];
  /** Фильтр врача (doctor / nurse): метрики «мой день»; null = вся клиника. */
  scopedDoctorId: number | null;
  myAppointmentsToday: number | null;
  myNoShowOrCancelled30d: number | null;
};
