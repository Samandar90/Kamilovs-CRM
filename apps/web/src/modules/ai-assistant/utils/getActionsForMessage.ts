import type { ThreadMessage } from "../types";

export type AiRuleAction = {
  id: string;
  label: string;
  tooltip: string;
  path: string;
};

function messageText(m: Pick<ThreadMessage, "text" | "streamText">): string {
  return (m.streamText ?? m.text ?? "").trim();
}

/**
 * Rule-based действия CRM под ответом AI (только навигация, без мутаций).
 */
export function getActionsForMessage(message: Pick<ThreadMessage, "text" | "streamText">): AiRuleAction[] {
  const raw = messageText(message).toLowerCase();
  if (!raw) return [];

  const seen = new Set<string>();
  const out: AiRuleAction[] = [];

  const push = (a: AiRuleAction) => {
    if (seen.has(a.id)) return;
    seen.add(a.id);
    out.push(a);
  };

  if (/выручк|доход|revenue|оборот|аналитик|отчёт|отчет/i.test(raw)) {
    push({
      id: "open-reports",
      label: "Открыть отчёты",
      tooltip: "Перейти в раздел отчётов",
      path: "/reports",
    });
    push({
      id: "by-doctors",
      label: "Показать врачей",
      tooltip: "Список врачей и показатели",
      path: "/doctors",
    });
  }

  if (/неоплачен|не\s+оплачен|задолжен|дебитор|просрочен.*сч|счет.*неоплачен|счета.*неоплачен|долг/i.test(raw)) {
    push({
      id: "open-invoices",
      label: "Открыть счета",
      tooltip: "Счета и статусы оплат",
      path: "/billing/invoices",
    });
    push({
      id: "take-payment",
      label: "Принять оплату",
      tooltip: "Касса — приём платежей",
      path: "/billing/cash-desk",
    });
    push({
      id: "patients-debt",
      label: "Пациенты с долгами",
      tooltip: "Список пациентов",
      path: "/patients",
    });
  }

  if (/загрузк|низк|слот|окн|расписан|запис(и|ей|ь)|приём|прием/i.test(raw)) {
    push({
      id: "open-appointments",
      label: "Открыть записи",
      tooltip: "Календарь записей",
      path: "/appointments",
    });
    push({
      id: "open-doctors-load",
      label: "Показать врачей",
      tooltip: "Нагрузка и справочник",
      path: "/doctors",
    });
  }

  if (/\bврач(и|а|ей|ом|ам)?\b|доктор|специалист|перегруж|нагрузк/i.test(raw)) {
    push({
      id: "open-doctors",
      label: "Открыть врачей",
      tooltip: "Справочник врачей",
      path: "/doctors",
    });
    push({
      id: "doctor-appointments",
      label: "Записи по врачам",
      tooltip: "Календарь",
      path: "/appointments",
    });
  }

  if (/пациент|клиент.*клиник|запись\s+на\s+при/i.test(raw)) {
    push({
      id: "add-patient",
      label: "Добавить пациента",
      tooltip: "Раздел пациентов — создайте карточку",
      path: "/patients",
    });
    push({
      id: "open-patients",
      label: "Открыть пациентов",
      tooltip: "Список пациентов",
      path: "/patients",
    });
  }

  return out.slice(0, 5);
}
