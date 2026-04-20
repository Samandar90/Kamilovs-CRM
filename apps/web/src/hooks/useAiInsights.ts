import React from "react";

export type AiInsightsMetrics = {
  revenueToday: number;
  revenue7d: number;
  unpaidInvoicesCount: number;
  unpaidInvoicesAmount: number;
  appointmentsToday: number;
  completedToday: number;
  avgCheckToday: number;
  avgCheck7d: number;
  topDoctor: string | null;
  noShow30d: number;
};

export type AiInsightsModel = {
  summary: string;
  issues: string[];
  recommendations: string[];
};

const buildInsights = (m: AiInsightsMetrics): AiInsightsModel => {
  const expectedRevenueToday = m.avgCheck7d * Math.max(m.appointmentsToday, 1);
  let summary = "Выручка стабильна относительно текущей загрузки.";
  if (m.appointmentsToday === 0) {
    summary = "Сегодня низкая загрузка: записи почти отсутствуют.";
  } else if (m.revenueToday < expectedRevenueToday * 0.75) {
    summary = "Выручка ниже ожидаемого уровня при текущем потоке записей.";
  } else if (m.revenueToday > expectedRevenueToday * 1.15) {
    summary = "Выручка выше среднего уровня — текущая модель работает эффективно.";
  }

  const issues: string[] = [];
  if (m.unpaidInvoicesCount > 0) {
    issues.push(`${m.unpaidInvoicesCount} неоплаченных счетов на ${Math.round(m.unpaidInvoicesAmount).toLocaleString("ru-RU")} сум.`);
  }
  if (m.appointmentsToday < 3) {
    issues.push("Низкая загрузка врачей сегодня.");
  }
  if (m.noShow30d > 0) {
    issues.push(`Есть отмены и no-show: ${m.noShow30d} за 30 дней.`);
  }
  if (m.avgCheck7d > 0 && m.avgCheckToday > 0 && m.avgCheckToday < m.avgCheck7d * 0.85) {
    issues.push("Средний чек сегодня ниже среднего за 7 дней.");
  }
  if (issues.length === 0) {
    issues.push("Критичных отклонений не зафиксировано.");
  }

  const recommendations: string[] = [];
  if (m.unpaidInvoicesCount > 0) {
    recommendations.push("Свяжитесь с пациентами с задолженностью и закройте долги.");
  }
  if (m.appointmentsToday < 3) {
    recommendations.push("Усильте запись после 15:00 через напоминания и колл-скрипт.");
  }
  if (m.noShow30d > 0) {
    recommendations.push("Включите двойное подтверждение визита за 24 и 2 часа.");
  }
  if (m.avgCheck7d > 0 && m.avgCheckToday > 0 && m.avgCheckToday < m.avgCheck7d * 0.85) {
    recommendations.push("Добавьте пакетные предложения и сопутствующие услуги.");
  }
  if (recommendations.length === 0 && m.topDoctor) {
    recommendations.push(`Тиражируйте практики топ-врача: ${m.topDoctor}.`);
  }
  if (recommendations.length === 0) {
    recommendations.push("Сохраняйте текущий темп и контролируйте качество расписания.");
  }

  return {
    summary,
    issues: issues.slice(0, 3),
    recommendations: recommendations.slice(0, 3),
  };
};

export const useAiInsights = (metrics: AiInsightsMetrics) => {
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  const data = React.useMemo(() => buildInsights(metrics), [metrics, refreshTick]);

  const refresh = React.useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      setRefreshTick((prev) => prev + 1);
      setLoading(false);
    }, 450);
  }, []);

  return {
    loading,
    data,
    refresh,
  };
};

