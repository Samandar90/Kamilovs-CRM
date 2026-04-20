"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRuleBased = handleRuleBased;
const normalize = (raw) => String(raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const sum = (value) => `${Math.round(value).toLocaleString("ru-RU")} сум`;
function handleRuleBased(intent, message, context) {
    const text = normalize(message);
    if (intent === "UNKNOWN" || intent === "CHAT" || intent === "MEDICAL" || intent === "GET_REVENUE" || intent === "GET_DEBTS") {
        return null;
    }
    if (intent === "CRM_ANALYTICS" || intent === "CRM_QUERY" || intent === "SYSTEM_ISSUE") {
        if (text.includes("выруч") && (text.includes("сегодня") || text.includes("день"))) {
            return `Сегодня выручка: ${sum(context.revenueToday)}.`;
        }
        if (text.includes("выруч") && (text.includes("7") || text.includes("недел"))) {
            return `Выручка за 7 дней: ${sum(context.revenue7d)}.`;
        }
        if (text.includes("неоплачен") || text.includes("долг") || text.includes("счет")) {
            return `Неоплаченных счетов: ${context.unpaidInvoicesCount} на сумму ${sum(context.unpaidInvoicesAmount)}.`;
        }
        if (text.includes("топ") && text.includes("врач")) {
            return context.topDoctor
                ? `Топ-врач по оплаченной выручке: ${context.topDoctor}.`
                : "Недостаточно данных.";
        }
        if (text.includes("касс") || text.includes("смен")) {
            return context.cashShiftStatus === "open" ? "Смена кассы открыта." : "Смена кассы закрыта.";
        }
        if (text.includes("запис") && text.includes("сегодня")) {
            return `Записей сегодня: ${context.appointmentsToday} (завершено ${context.completedToday}, в ожидании ${context.pendingToday}).`;
        }
        if (intent === "SYSTEM_ISSUE") {
            return context.cashShiftStatus === "closed"
                ? "Проверьте статус кассовой смены: сейчас смена закрыта. Это может влиять на оплаты и отчеты."
                : "Проверьте авторизацию пользователя и подключение к API. По метрикам CRM данные доступны.";
        }
    }
    if (intent === "CRM_HELP") {
        if (text.includes("запис"))
            return "Создание записи: раздел «Записи» → «Новая запись» → выбрать пациента, врача и услугу.";
        if (text.includes("счет"))
            return "Создание счета: раздел «Биллинг / Счета» → «Создать счет» → выбрать пациента и услуги.";
        if (text.includes("касс"))
            return "Касса: раздел «Биллинг / Касса». Сначала откройте смену, затем проводите оплаты.";
        return "По CRM могу подсказать действия по записям, счетам, оплатам и отчетам.";
    }
    return null;
}
