export type Intent =
  | "MEDICAL"
  | "CRM_ANALYTICS"
  | "CRM_QUERY"
  | "CRM_HELP"
  | "SYSTEM_ISSUE"
  | "CREATE_PATIENT"
  | "CREATE_APPOINTMENT"
  | "CREATE_INVOICE"
  | "CREATE_PAYMENT"
  | "CLOSE_SHIFT"
  | /** Действие: выручка из CRM, без LLM */
  "GET_REVENUE"
  | /** Действие: долги / неоплаченные счета, без LLM */
  "GET_DEBTS"
  | /** Список врачей из БД, без LLM */
  "GET_DOCTORS"
  | /** Обычный диалог → только LLM (после rule-based) */
  "CHAT"
  | "UNKNOWN";

const normalize = (raw: string): string => String(raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const hasAny = (text: string, words: string[]): boolean => words.some((w) => text.includes(w));

const MEDICAL_HINTS = [
  "болит",
  "боль",
  "температур",
  "каш",
  "одышк",
  "голов",
  "тошнот",
  "рвот",
  "симптом",
  "давлен",
  "диагноз",
  "лечение",
  "возможные причины",
  "к какому врачу",
];

const CRM_ANALYTICS_HINTS = [
  "выручк",
  "доход",
  "неоплачен",
  "долг",
  "счет",
  "оплат",
  "касс",
  "смен",
  "топ врач",
  "топ-доктор",
  "средний чек",
  "no-show",
  "ноу-шоу",
  "записи сегодня",
];

const CRM_QUERY_HINTS = [
  "какие услуги",
  "есть ли врач",
  "есть ли услуга",
  "сколько пациентов",
  "кто сегодня",
];

/** Запрос полного списка врачей из справочника (обрабатывается до OpenAI). */
const GET_DOCTORS_HINTS = [
  "какие врачи",
  "список врачей",
  "список докторов",
  "какие доктора",
  "сколько врач",
  "покажи врач",
  "кто врач",
];

const CRM_HELP_HINTS = [
  "как создать запись",
  "как записать пациента",
  "как создать счет",
  "где касса",
  "где отчеты",
  "как оформить оплату",
  "как работает",
  "где находится",
];

const SYSTEM_ISSUE_HINTS = [
  "не работает",
  "ошибка",
  "почему не работает",
  "не открывается",
  "не загружается",
  "не могу",
  "проблема в системе",
];

const CREATE_PATIENT_HINTS = ["добавь пациента", "создай пациента", "новый пациент", "зарегистрируй пациента"];
const CREATE_APPOINTMENT_HINTS = ["запиши пациента", "создай запись", "запиши на прием", "запиши на завтра", "запись на"];
const CREATE_INVOICE_HINTS = ["создай счет", "выстави счет", "оформи счет", "сформируй счет"];
const CREATE_PAYMENT_HINTS = ["оплата", "проведи оплату", "прими оплату", "оплатили"];
const CLOSE_SHIFT_HINTS = ["закрой смену", "закрыть смену", "закрой кассу", "закрыть кассу"];

export function detectIntent(message: string): Intent {
  const text = normalize(message);
  if (!text) return "CHAT";

  if (hasAny(text, CLOSE_SHIFT_HINTS)) return "CLOSE_SHIFT";
  if (hasAny(text, CREATE_PAYMENT_HINTS)) return "CREATE_PAYMENT";
  if (hasAny(text, CREATE_INVOICE_HINTS)) return "CREATE_INVOICE";
  if (hasAny(text, CREATE_APPOINTMENT_HINTS)) return "CREATE_APPOINTMENT";
  if (hasAny(text, CREATE_PATIENT_HINTS)) return "CREATE_PATIENT";

  if (text.includes("покажи выручку")) return "GET_REVENUE";
  if (text.includes("сколько долгов") || text.includes("сколько долга")) return "GET_DEBTS";

  if (hasAny(text, GET_DOCTORS_HINTS) || text.includes("врачи")) return "GET_DOCTORS";

  if (hasAny(text, SYSTEM_ISSUE_HINTS)) return "SYSTEM_ISSUE";
  if (hasAny(text, MEDICAL_HINTS)) return "MEDICAL";
  if (hasAny(text, CRM_ANALYTICS_HINTS)) return "CRM_ANALYTICS";
  if (hasAny(text, CRM_QUERY_HINTS)) return "CRM_QUERY";
  if (hasAny(text, CRM_HELP_HINTS)) return "CRM_HELP";

  if (/^как\s+создат[ьа]/.test(text) || /^где\s+/.test(text)) return "CRM_HELP";
  if (/выруч|счет|оплат|касс|врач|пациент|услуг|запис/.test(text)) return "CRM_QUERY";
  return "CHAT";
}

