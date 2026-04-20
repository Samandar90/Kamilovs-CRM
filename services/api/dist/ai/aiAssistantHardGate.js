"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_ACCESS_DENIED_MESSAGE = void 0;
exports.checkAIRequestAccess = checkAIRequestAccess;
exports.checkAIActionAccess = checkAIActionAccess;
const permissions_1 = require("../auth/permissions");
const aiAssistantRoleAccess_1 = require("./aiAssistantRoleAccess");
/** Ответ при жёстком отказе (до OpenAI и любых данных по теме). */
exports.AI_ACCESS_DENIED_MESSAGE = "У вас нет доступа к этой информации, но я могу помочь с другими вопросами. Например: пациенты, записи или общая аналитика.";
function normalizeText(raw) {
    return String(raw ?? "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/\s+/g, " ")
        .trim();
}
/** Целое слово — чтобы не ловить «счет» в «расчет», «долг» в «долгий». */
function hasWholeToken(text, word) {
    const w = normalizeText(word);
    const re = new RegExp(`(?<![а-яa-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![а-яa-z0-9])`, "iu");
    return re.test(text);
}
/** Слово «боль» без ложного срабатывания на «больше». */
function hasPainWordBoly(text) {
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
];
/** Только целым словом (долг / долги / счет / счета …). */
const FINANCE_TOKENS = ["долг", "долги", "счет", "счёт", "счета"];
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
];
const MEDICAL_WORDS = ["симптом", "диагноз", "лечение"];
function hitsFinance(text, extra) {
    for (const w of FINANCE_SUBSTRINGS) {
        if (text.includes(w))
            return true;
    }
    for (const w of FINANCE_TOKENS) {
        if (hasWholeToken(text, w))
            return true;
    }
    for (const w of extra) {
        if (text.includes(w))
            return true;
    }
    return false;
}
function hitsMedical(text) {
    for (const w of MEDICAL_WORDS) {
        if (text.includes(w))
            return true;
    }
    return hasPainWordBoly(text);
}
/**
 * Жёсткая серверная проверка: `false` = запрос нельзя обрабатывать (OpenAI не вызывать).
 */
function checkAIRequestAccess(role, message) {
    const text = normalizeText(message);
    if (role === "operator" || role === "reception") {
        if (hitsFinance(text, [...FINANCE_EXTRA_FRONT_DESK]))
            return false;
    }
    if (role === "doctor" || role === "nurse") {
        if (hitsFinance(text, ["оплата"]))
            return false;
    }
    if (role === "cashier" || role === "accountant") {
        if (hitsMedical(text))
            return false;
    }
    return true;
}
/**
 * Проверка права на выполнение действия, выбранного моделью (после parse JSON).
 */
function checkAIActionAccess(role, action) {
    const a = String(action ?? "").trim().toUpperCase();
    if (a === "CHAT") {
        return true;
    }
    if (a === "GET_REVENUE" || a === "GET_DEBTS") {
        return (0, aiAssistantRoleAccess_1.canReadFinancialFactsInAi)(role);
    }
    if (a === "GET_DOCTORS") {
        return (0, permissions_1.hasPermission)(role, "doctors", "read");
    }
    if (a === "GET_PATIENTS") {
        return (0, permissions_1.hasPermission)(role, "patients", "read");
    }
    if (a === "GET_APPOINTMENTS") {
        return (0, permissions_1.hasPermission)(role, "appointments", "read");
    }
    if (a === "CREATE_PATIENT") {
        return (0, permissions_1.hasPermission)(role, "patients", "create");
    }
    if (a === "CREATE_APPOINTMENT") {
        return (0, permissions_1.hasPermission)(role, "appointments", "create");
    }
    if (a === "CREATE_PAYMENT") {
        return (0, permissions_1.hasPermission)(role, "payments", "create");
    }
    return false;
}
