"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatMoneyForUi = formatMoneyForUi;
/**
 * Только для ответов/логов — не использовать как источник для INSERT/UPDATE.
 */
function formatMoneyForUi(value, locale = "ru-RU", currencyLabel = "сум") {
    const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) {
        return "—";
    }
    return `${n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currencyLabel}`;
}
