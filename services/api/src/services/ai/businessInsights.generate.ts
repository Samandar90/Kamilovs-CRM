import type { UserRole } from "../../auth/permissions";
import type {
  BusinessInsight,
  BusinessInsightTag,
  BusinessInsightsMetrics,
  TaggedBusinessInsight,
} from "./businessInsights.types";

const sumRu = (value: number): string => `${Math.round(value).toLocaleString("ru-RU")} сум`;

function roleAllowsInsight(role: UserRole, tags: BusinessInsightTag[]): boolean {
  if (tags.includes("general")) return true;
  const full = new Set<UserRole>(["superadmin", "manager", "director"]);
  if (full.has(role)) return true;
  if (role === "accountant") return tags.includes("financial");
  if (role === "cashier") return tags.some((t) => t === "financial" || t === "cash");
  if (role === "reception" || role === "operator") {
    return tags.length > 0 && tags.every((t) => t === "schedule" || t === "clinical");
  }
  if (role === "doctor" || role === "nurse") {
    return tags.length > 0 && tags.every((t) => t === "schedule" || t === "clinical");
  }
  return true;
}

function stripTags(i: TaggedBusinessInsight): BusinessInsight {
  const { tags: _tags, ...rest } = i;
  void _tags;
  return rest;
}

function severityRank(t: BusinessInsight["type"]): number {
  if (t === "warning") return 0;
  if (t === "info") return 1;
  return 2;
}

/**
 * Rule-based бизнес-инсайты по метрикам CRM + фильтрация по роли.
 * Без вызова LLM — быстро и предсказуемо.
 */
export function generateBusinessInsights(
  metrics: BusinessInsightsMetrics,
  role: UserRole
): BusinessInsight[] {
  const candidates: TaggedBusinessInsight[] = [];

  const scoped =
    (role === "doctor" || role === "nurse") && metrics.scopedDoctorId != null;

  const sparse =
    metrics.paymentsCount7d < 3 &&
    metrics.appointmentsCount < 8 &&
    metrics.revenue7d === 0 &&
    metrics.unpaidInvoicesCount === 0;

  if (sparse) {
    candidates.push({
      type: "info",
      title: "Мало данных для выводов",
      message:
        "Пока мало данных для вывода. Накопите больше оплат или записей — тогда картина станет яснее.",
      recommendation: "Добавьте записи и отражайте оплаты в CRM.",
      link: { label: "К записям", path: "/appointments" },
      tags: ["general"],
    });
  }

  if (scoped) {
    const myToday = metrics.myAppointmentsToday ?? 0;
    const myLost = metrics.myNoShowOrCancelled30d ?? 0;

    if (myToday >= 8) {
      candidates.push({
        type: "warning",
        title: "Плотный день",
        message: `Сегодня у вас ${myToday} записей — нагрузка выше обычного.`,
        recommendation: "Заложите время на документацию и перенос при необходимости.",
        link: { label: "Расписание", path: "/appointments" },
        tags: ["schedule"],
      });
    } else if (myToday === 0 && metrics.doctorsCount >= 1) {
      candidates.push({
        type: "info",
        title: "Записей на сегодня нет",
        message: "В календаре на сегодня нет приёмов с вашей привязкой.",
        recommendation: "Проверьте расписание или свяжитесь с регистратурой.",
        link: { label: "Записи", path: "/appointments" },
        tags: ["schedule"],
      });
    }

    if (myLost >= 2) {
      candidates.push({
        type: "warning",
        title: "Отмены и неявки",
        message: `За 30 дней: ${myLost} отмен/no-show по вашим приёмам.`,
        recommendation: "Напоминания пациентам и подтверждение записи снижают потери.",
        link: { label: "Записи", path: "/appointments" },
        tags: ["clinical", "schedule"],
      });
    }
  } else {
    if (
      metrics.revenuePrev7d > 100 &&
      metrics.revenue7d < metrics.revenuePrev7d
    ) {
      const dropPct = Math.round(
        ((metrics.revenuePrev7d - metrics.revenue7d) / metrics.revenuePrev7d) * 100
      );
      candidates.push({
        type: "warning",
        title: "Падение выручки",
        message: `За последние 7 дней выручка ниже предыдущих 7 дней примерно на ${dropPct}%.`,
        recommendation: "Проверьте загрузку врачей и неоплаченные счета.",
        link: { label: "Отчёты", path: "/reports" },
        tags: ["financial"],
      });
    }

    if (
      metrics.revenuePrev7d > 100 &&
      metrics.revenue7d > metrics.revenuePrev7d
    ) {
      const upPct = Math.round(
        ((metrics.revenue7d - metrics.revenuePrev7d) / metrics.revenuePrev7d) * 100
      );
      candidates.push({
        type: "success",
        title: "Рост выручки",
        message: `7 дней к 7 дням: выручка выросла примерно на ${upPct}%.`,
        recommendation: "Закрепите ритм: записи, средний чек, контроль дебиторки.",
        link: { label: "Отчёты", path: "/reports" },
        tags: ["financial"],
      });
    }

    if (metrics.doctorsCount >= 2 && metrics.appointmentsToday > 0 && metrics.appointmentsToday < 4) {
      candidates.push({
        type: "info",
        title: "Низкая загрузка",
        message: `Сегодня мало записей (${metrics.appointmentsToday}) при ${metrics.doctorsCount} врачах в штате — риск недозагрузки.`,
        recommendation: "Усильте вторую половину дня: напоминания, слоты, акция на слабые часы.",
        link: { label: "Открыть записи", path: "/appointments" },
        tags: ["schedule"],
      });
    }

    const loads = metrics.doctorAppointmentLoads.filter((d) => d.count > 0);
    if (loads.length >= 2) {
      const maxL = loads[0]!;
      const minL = loads[loads.length - 1]!;
      if (minL.count > 0 && maxL.count >= minL.count * 2.5 && maxL.count >= 5) {
        candidates.push({
          type: "warning",
          title: "Перекос по врачам",
          message: `У «${maxL.name}» заметно больше записей за 30 дней, чем у коллег с наименьшей загрузкой.`,
          recommendation: "Перераспределите записи или усильте приём у менее загруженных.",
          link: { label: "Записи", path: "/appointments" },
          tags: ["schedule"],
        });
      }
    }

    if (metrics.cancelledToday > 0) {
      candidates.push({
        type: "info",
        title: "Отмены на сегодня",
        message: `Сегодня ${metrics.cancelledToday} отменённых записей на календарный день.`,
        recommendation: "Освободившиеся слоты можно предложить из листа ожидания.",
        link: { label: "Записи", path: "/appointments" },
        tags: ["schedule"],
      });
    }
  }

  if (metrics.unpaidInvoicesCount > 0) {
    candidates.push({
      type: "warning",
      title: "Неоплаченные счета",
      message: `${metrics.unpaidInvoicesCount} неоплаченных счетов на ${sumRu(metrics.unpaidInvoicesAmount)}. Это тормозит денежный поток.`,
      recommendation: "Свяжитесь с пациентами и зафиксируйте оплату в CRM.",
      link: { label: "Открыть счета", path: "/billing/invoices" },
      tags: ["financial"],
    });
  } else if (!scoped && metrics.revenue7d > 0) {
    candidates.push({
      type: "success",
      title: "Дебиторка в порядке",
      message: "Неоплаченных счетов с остатком сейчас нет.",
      recommendation: "Поддерживайте оплату сразу после оказания услуг.",
      link: { label: "Счета", path: "/billing/invoices" },
      tags: ["financial"],
    });
  }

  if (metrics.noShow30d > 0 && !scoped) {
    candidates.push({
      type: "info",
      title: "Отмены и no-show",
      message: `За 30 дней зафиксировано ${metrics.noShow30d} отмен/no-show.`,
      recommendation: "SMS/мессенджер за сутки и подтверждение записи снижают потери.",
      link: { label: "Записи", path: "/appointments" },
      tags: ["schedule", "clinical"],
    });
  }

  if (!metrics.cashShiftOpen && (metrics.appointmentsToday >= 1 || metrics.pendingToday >= 1)) {
    candidates.push({
      type: "warning",
      title: "Касса: смена закрыта",
      message: "Смена кассы не открыта, при этом есть записи на сегодня.",
      recommendation: "Откройте смену до приёма наличных и фиксации оплат.",
      link: { label: "Касса", path: "/billing/cash-desk" },
      tags: ["cash"],
    });
  }

  const filtered = candidates.filter((c) => roleAllowsInsight(role, c.tags));
  filtered.sort((a, b) => {
    const s = severityRank(a.type) - severityRank(b.type);
    if (s !== 0) return s;
    return 0;
  });

  const unique: TaggedBusinessInsight[] = [];
  const seen = new Set<string>();
  for (const c of filtered) {
    const key = c.title;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
    if (unique.length >= 4) break;
  }

  if (unique.length === 0 && !sparse) {
    return [
      stripTags({
        type: "success",
        title: "Без срочных сигналов",
        message: "Критичных отклонений по текущим метрикам не видно.",
        recommendation: "Загляните в отчёты для деталей.",
        link: { label: "Отчёты", path: "/reports" },
        tags: ["general"],
      }),
    ];
  }

  return unique.map(stripTags);
}
