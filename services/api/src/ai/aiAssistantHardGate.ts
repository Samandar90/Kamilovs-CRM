import type { UserRole } from "../auth/permissions";
import { hasPermission } from "../auth/permissions";
import { canReadFinancialFactsInAi } from "./aiAssistantRoleAccess";

/** Ответ при жёстком отказе (до OpenAI и любых данных по теме). */
export const AI_ACCESS_DENIED_MESSAGE =
  "У вас нет доступа к этой информации, но я могу помочь с другими вопросами. Например: пациенты, записи или общая аналитика.";

function normalizeText(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/** Целое слово — чтобы не ловить «счет» в «расчет», «долг» в «долгий». */
function hasWholeToken(text: string, word: string): boolean {
  const w = normalizeText(word);
  const re = new RegExp(`(?<![а-яa-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![а-яa-z0-9])`, "iu");
  return re.test(text);
}

/** Слово «боль» без ложного срабатывания на «больше». */
function hasPainWordBoly(text: string): boolean {
  const re = /(?<![а-яa-z0-9])боль(?![а-яa-z0-9ш])/iu;
  return re.test(text);
}

/** Подстрока достаточна (без ложных «долг»→«долгий» — см. FINANCE_TOKENS). */
const FINANCE_SUBSTRINGS = [
  "выручка",
  "деньги",
  "касса",
  "оплаты",
  "доход",
  "долга",
  "долгов",
  "долгу",
  "долге",
  "долгам",
] as const;

/** Только целым словом (долг / долги / счет / счета …). */
const FINANCE_TOKENS = ["долг", "долги", "счет", "счёт", "счета"] as const;

/** Для линии приёма: формы слов и отчёты (часто ведут к фин. ответам). */
const FINANCE_EXTRA_FRONT_DESK = [
  "оплата",
  "счет",
  "счёт",
  "отчет",
  "отчёт",
  "отчеты",
  "отчёты",
  "неоплачен",
  "дебитор",
] as const;

const MEDICAL_WORDS = ["симптом", "диагноз", "лечение"] as const;

function hitsFinance(text: string, extra: readonly string[]): boolean {
  for (const w of FINANCE_SUBSTRINGS) {
    if (text.includes(w)) return true;
  }
  for (const w of FINANCE_TOKENS) {
    if (hasWholeToken(text, w)) return true;
  }
  for (const w of extra) {
    if (text.includes(w)) return true;
  }
  return false;
}

function hitsMedical(text: string): boolean {
  for (const w of MEDICAL_WORDS) {
    if (text.includes(w)) return true;
  }
  return hasPainWordBoly(text);
}

/**
 * Жёсткая серверная проверка: `false` = запрос нельзя обрабатывать (OpenAI не вызывать).
 */
export function checkAIRequestAccess(role: UserRole, message: string): boolean {
  const text = normalizeText(message);

  if (role === "operator" || role === "reception") {
    if (hitsFinance(text, [...FINANCE_EXTRA_FRONT_DESK])) return false;
  }

  if (role === "doctor" || role === "nurse") {
    if (hitsFinance(text, ["оплата"])) return false;
  }

  if (role === "cashier" || role === "accountant") {
    if (hitsMedical(text)) return false;
  }

  return true;
}

/**
 * Проверка права на выполнение действия, выбранного моделью (после parse JSON).
 */
export function checkAIActionAccess(role: UserRole, action: string): boolean {
  const a = String(action ?? "").trim().toUpperCase();
  if (a === "CHAT") {
    return true;
  }
  if (a === "GET_REVENUE" || a === "GET_DEBTS") {
    return canReadFinancialFactsInAi(role);
  }
  if (a === "GET_DOCTORS") {
    return hasPermission(role, "doctors", "read");
  }
  if (a === "GET_PATIENTS") {
    return hasPermission(role, "patients", "read");
  }
  if (a === "GET_APPOINTMENTS") {
    return hasPermission(role, "appointments", "read");
  }
  if (a === "CREATE_PATIENT") {
    return hasPermission(role, "patients", "create");
  }
  if (a === "CREATE_APPOINTMENT") {
    return hasPermission(role, "appointments", "create");
  }
  if (a === "CREATE_PAYMENT") {
    return hasPermission(role, "payments", "create");
  }
  return false;
}
