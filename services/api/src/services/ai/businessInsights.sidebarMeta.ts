import type { BusinessInsight } from "./businessInsights.types";

export type AiInsightsSidebarMeta = {
  /** 2–3 коротких фокуса дня (действия / внимание). */
  todayFocus: string[];
  /** Продюсерский заголовок над инсайтами; null если нечего подсветить. */
  proactiveHeadline: string | null;
  /** Одна строка «интерпретации» по главному сигналу. */
  kpiTeaser: string | null;
};

function trimTeaser(s: string, max = 78): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Метаданные для правой колонки AI workspace (без LLM — от уже отфильтрованных инсайтов).
 */
export function buildInsightsSidebarMeta(insights: BusinessInsight[]): AiInsightsSidebarMeta {
  const warnings = insights.filter((i) => i.type === "warning");
  const nonTrivial = insights.filter((i) => i.title !== "Без срочных сигналов" && i.title !== "Мало данных для выводов");

  let proactiveHeadline: string | null = null;
  if (warnings.length >= 2) {
    proactiveHeadline = `Сегодня AI отметил ${warnings.length} важных сигнала`;
  } else if (warnings.length === 1 && nonTrivial.length >= 1) {
    proactiveHeadline = "AI заметил момент, который стоит закрыть сегодня";
  } else if (nonTrivial.length >= 2) {
    proactiveHeadline = `AI подготовил ${nonTrivial.length} наблюдения по клинике`;
  } else if (nonTrivial.length === 1) {
    proactiveHeadline = "Краткий обзор дня от AI";
  }

  const todayFocus = insights.slice(0, 3).map((i) => {
    const rec = i.recommendation.trim();
    if (rec.length > 0 && rec.length <= 96) return rec;
    const msg = i.message.trim();
    const sentence = msg.split(/(?<=[.!?])\s+/)[0] ?? msg;
    const combo = `${i.title} — ${sentence}`;
    return combo.length <= 96 ? combo : i.title;
  });

  const priority = insights.find((i) => i.type === "warning") ?? insights[0];
  const kpiTeaser = priority ? trimTeaser(priority.message, 80) : null;

  return {
    todayFocus,
    proactiveHeadline,
    kpiTeaser,
  };
}
