const FALLBACK = [
  "Открыть отчёты",
  "Открыть счета",
  "Показать записи",
  "Открыть пациентов",
];

const CONTEXTUAL: { test: RegExp; labels: string[] }[] = [
  {
    test: /долг|неоплач|счёт|счет|дебитор|invoice|оплат/i,
    labels: ["Открыть счета", "Принять оплату в кассе", "Показать пациентов с долгами"],
  },
  {
    test: /загрузк|низк|слот|окн|расписан|запис(и|ей|ь)/i,
    labels: ["Открыть записи", "Показать врачей", "Добавить пациента"],
  },
  {
    test: /врач|топ|перегруж|нагрузк/i,
    labels: ["Открыть врачей", "Показать записи", "Открыть отчёты"],
  },
  {
    test: /выручк|доход|оборот|аналитик|отчёт|отчет/i,
    labels: ["Открыть отчёты", "Выручка за неделю", "Кто топ врач?"],
  },
  {
    test: /пациент|карт/i,
    labels: ["Открыть пациентов", "Записи на сегодня", "Добавить пациента"],
  },
  { test: /касс|смен/i, labels: ["Открыть кассу", "Открыть счета", "Последние платежи"] },
  { test: /no-?show|отмен|пропуск/i, labels: ["Открыть записи", "Что такое no-show?", "Записи на сегодня"] },
  {
    test: /риск|теря|потер/i,
    labels: ["Открыть отчёты", "Где мы теряем деньги", "Открыть записи"],
  },
];

const MAX = 4;

/**
 * До 4 релевантных follow-up: API, затем по тексту ответа, затем запасной пул.
 */
export function mergeSmartSuggestions(apiSuggestions: string[] | undefined, answerText: string): string[] {
  const fromApi = (apiSuggestions ?? []).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const s of fromApi) {
    if (out.length >= MAX) break;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }

  const lower = answerText.toLowerCase();
  for (const { test, labels } of CONTEXTUAL) {
    if (out.length >= MAX) break;
    if (!test.test(lower)) continue;
    for (const label of labels) {
      if (out.length >= MAX) break;
      if (!seen.has(label)) {
        seen.add(label);
        out.push(label);
      }
    }
  }

  for (const f of FALLBACK) {
    if (out.length >= MAX) break;
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }

  return out.slice(0, MAX);
}
