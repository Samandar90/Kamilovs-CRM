"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiRuleEngine = exports.formatSum = void 0;
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const mockDatabase_1 = require("../repositories/mockDatabase");
const formatSum = (value) => `${Math.round(value).toLocaleString("ru-RU")} сум`;
exports.formatSum = formatSum;
const normalize = (raw) => raw.toLowerCase().replace(/\s+/g, " ").trim();
const wrapIlike = (raw) => {
    const escaped = raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    return `%${escaped}%`;
};
class AiRuleEngine {
    answerHybrid(intent, data) {
        try {
            if (intent === "revenue") {
                const revenueToday = Number(data.revenueToday ?? data.total ?? 0);
                const paymentsCountToday = Number(data.paymentsCountToday ?? 0);
                if (paymentsCountToday === 0 && revenueToday === 0) {
                    return "Сегодня выручка составила 0 сум — по данным CRM нет учтённых оплат по счетам (не отменённым и не возвращённым) за текущий календарный день.";
                }
                return `Сегодня выручка составила ${(0, exports.formatSum)(revenueToday)}.`;
            }
            if (intent === "unpaid") {
                const unpaidCount = Number(data.unpaidCount ?? 0);
                const unpaidTotal = Number(data.unpaidTotal ?? 0);
                return `Неоплаченных счетов: ${unpaidCount} на сумму ${(0, exports.formatSum)(unpaidTotal)}. Рекомендация: закрыть остатки и проконтролировать дебиторку.`;
            }
            if (intent === "top_doctor") {
                const topDoctor = (data.topDoctor ?? null);
                if (!topDoctor)
                    return "Пока недостаточно оплат, привязанных к врачам, для рейтинга.";
                const share = Number(topDoctor.share ?? 0);
                return `Топ-врач по оплаченной выручке: ${topDoctor.name ?? "—"} (${(0, exports.formatSum)(Number(topDoctor.total ?? 0))}${share > 0 ? `, ~${share}% от суммы по врачам` : ""}).`;
            }
            if (intent === "top_service") {
                const topService = (data.topService ?? null);
                if (!topService)
                    return "Пока недостаточно оплат по услугам для рейтинга.";
                return `Топ-услуга по оплатам: ${topService.name ?? "—"} (${(0, exports.formatSum)(Number(topService.total ?? 0))}).`;
            }
            if (intent === "cash_status") {
                const cashShiftOpen = Boolean(data.cashShiftOpen);
                return cashShiftOpen
                    ? "Кассовая смена открыта — приём оплат возможен. Проверьте возвраты и остаток в кассе."
                    : "Кассовая смена закрыта — откройте смену в разделе Касса перед приёмом оплат.";
            }
            return this.localHealthFromData(data);
        }
        catch (error) {
            console.error("[AI RULE ENGINE] answerHybrid", error);
            return "Не удалось получить данные CRM";
        }
    }
    localHealthFromData(data) {
        const unpaid = Number(data.unpaidCount ?? 0);
        const revenueToday = Number(data.revenueToday ?? 0);
        const appointmentsToday = Number(data.appointmentsToday ?? 0);
        const avg7 = Number(data.avgDailyRevenue7Days ?? 0);
        const avgCt = Number(data.avgCheckToday ?? 0);
        const avgC7 = Number(data.avgCheck7d ?? 0);
        const topDoctor = data.topDoctor;
        const noShow = Number(data.noShowOrCancelled30d ?? 0);
        const lines = ["Кратко по CRM:"];
        if (revenueToday === 0 && avg7 === 0) {
            lines.push("За сегодня и за неделю нет учтённых оплат — проверьте кассу и выставление счетов.");
        }
        else if (revenueToday === 0) {
            lines.push("Сегодня оплат нет — проверьте записи и напоминания пациентам.");
        }
        if (unpaid >= 5)
            lines.push(`Много неоплаченных счетов (${unpaid}).`);
        else if (unpaid > 0)
            lines.push(`Есть неоплаченные счета (${unpaid}).`);
        if (appointmentsToday === 0)
            lines.push("На сегодня нет записей — усильте загрузку и маркетинг.");
        else if (appointmentsToday > 0 && appointmentsToday < 3)
            lines.push("Низкая загрузка по записям на сегодня.");
        if (topDoctor?.name)
            lines.push(`Лидер по оплатам: ${topDoctor.name}.`);
        if (avg7 > 0 && revenueToday > avg7 * 1.05)
            lines.push("Выручка сегодня выше среднего за неделю.");
        if (avgC7 > 0 && avgCt > 0 && avgCt < avgC7 * 0.86) {
            lines.push(`Средний чек сегодня ниже среднего за 7 дней — рассмотрите апсейл и пакеты.`);
        }
        if (noShow > 3)
            lines.push(`Много отмен/no-show за месяц (${noShow}) — усильте подтверждения визитов.`);
        return lines.join(" ");
    }
    /** Детерминированные рекомендации (уровень A), без LLM. */
    buildLocalRecommendationsList(facts) {
        const lines = [];
        if (facts.revenueToday === 0 && facts.revenue7d > 0) {
            lines.push("Сегодня оплат нет — сверьте кассу и напоминания по записям.");
        }
        if (facts.revenueToday === 0 && facts.revenue7d === 0) {
            lines.push("Нет учтённых оплат за неделю — проверьте процесс выставления счетов и оплаты.");
        }
        if (facts.unpaidCount > 0) {
            lines.push(`Дебиторка: ${facts.unpaidCount} счетов, ${(0, exports.formatSum)(facts.unpaidTotal)} к оплате.`);
        }
        if (facts.avgCheck7d > 0 && facts.avgCheckToday > 0 && facts.avgCheckToday < facts.avgCheck7d * 0.86) {
            lines.push(`Средний чек сегодня ниже недельного на ${Math.round((1 - facts.avgCheckToday / facts.avgCheck7d) * 100)}% — апсейл после консультации.`);
        }
        if (facts.appointmentsToday < 3 && facts.doctorsCount > 0 && facts.revenueToday === 0) {
            lines.push("Мало записей на сегодня — маркетинг и напоминания.");
        }
        if (facts.appointmentsScheduledToday > facts.appointmentsCompletedToday * 2 && facts.appointmentsScheduledToday > 3) {
            lines.push("Много ожидающих визитов при мало завершённых — подтверждайте записи.");
        }
        if (facts.noShowOrCancelled30d > 5) {
            lines.push(`За 30 дней отмен/no-show: ${facts.noShowOrCancelled30d} — укрепите подтверждения и удержание.`);
        }
        if (facts.cashShiftOpen === false) {
            lines.push("Касса закрыта — откройте смену для приёма оплат.");
        }
        if (lines.length === 0)
            lines.push("Следите за оплатами в Биллинге и загрузкой расписания.");
        return lines.slice(0, 6);
    }
    generateLocalAnswerFromFacts(facts) {
        return this.buildLocalRecommendationsList(facts).slice(0, 3).join(" ");
    }
    fallbackGeneralCrmAdvice(facts) {
        const todayLine = facts.paymentsCountToday === 0 && facts.revenueToday === 0
            ? "Сегодня по CRM: 0 сум выручки (нет учтённых оплат за день)."
            : `Сегодня выручка ${(0, exports.formatSum)(facts.revenueToday)}`;
        const parts = [
            `${todayLine}. За 7 дней: ${(0, exports.formatSum)(facts.revenue7d)}.`,
            facts.unpaidCount > 0
                ? `Неоплаченных счетов: ${facts.unpaidCount} (${(0, exports.formatSum)(facts.unpaidTotal)}).`
                : "Неоплаченных счетов нет.",
            facts.topDoctorName ? `Лидер по оплатам: ${facts.topDoctorName}.` : "",
        ].filter(Boolean);
        return parts.join(" ");
    }
    fallbackOwnerRecommendations(facts) {
        const todayPart = facts.paymentsCountToday === 0 ? "Нет оплат сегодня" : (0, exports.formatSum)(facts.revenueToday);
        const parts = [
            `Сегодня ${todayPart}, за 7 дней ${(0, exports.formatSum)(facts.revenue7d)}, неоплаченных: ${facts.unpaidCount}.`,
            facts.cashShiftOpen ? "Смена открыта." : "Откройте кассовую смену.",
        ];
        return parts.join(" ");
    }
    /**
     * Короткий ответ без LLM для «общих» формулировок, если уже есть сильные сигналы в данных.
     */
    tryDeterministicGeneralAnswer(message, facts) {
        const t = normalize(message);
        if (facts.unpaidCount > 5 && (t.includes("проблем") || t.includes("риск") || t.includes("что не так"))) {
            return `По данным CRM: ${facts.unpaidCount} неоплаченных счетов на ${(0, exports.formatSum)(facts.unpaidTotal)} — в приоритете дебиторка и контроль оплат.`;
        }
        if (facts.revenueToday === 0 && facts.revenue7d > 1000 && t.includes("сегодня")) {
            return `Сегодня в CRM: 0 сум, за последние 7 дней было ${(0, exports.formatSum)(facts.revenue7d)} — это разные календарные дни; цифра за сегодня относится только к текущему дню.`;
        }
        return null;
    }
    async answerAskQuick(intent, facts, message) {
        try {
            if (intent === "unknown")
                return null;
            const text = normalize(message);
            if (intent === "revenue_today") {
                const unpaidLine = facts.unpaidCount > 0
                    ? ` Неоплаченных счетов: ${facts.unpaidCount} на ${(0, exports.formatSum)(facts.unpaidTotal)}.`
                    : "";
                if (facts.paymentsCountToday === 0 && facts.revenueToday === 0) {
                    return {
                        answer: "Сегодня выручка составила 0 сум — в CRM нет учтённых оплат по счетам за текущий календарный день (в отчётной зоне клиники)." +
                            unpaidLine,
                        suggestions: ["Какая выручка за неделю?", "Общая выручка за всё время"],
                    };
                }
                return {
                    answer: `Сегодня выручка составила ${(0, exports.formatSum)(facts.revenueToday)}.${unpaidLine}`,
                    suggestions: ["Какая выручка за неделю?", "Кто приносит больше выручки?"],
                };
            }
            if (intent === "revenue_7d") {
                if (facts.revenue7d <= 0 && facts.paymentsCount7d === 0) {
                    return {
                        answer: "За последние 7 дней выручка составила 0 сум — нет учтённых оплат по счетам за этот период.",
                        suggestions: ["Сколько заработали сегодня?", "Общая выручка за всё время"],
                    };
                }
                return {
                    answer: `За последние 7 дней выручка составила ${(0, exports.formatSum)(facts.revenue7d)}.`,
                    suggestions: ["Сколько заработали сегодня?", "Кто приносит больше выручки?"],
                };
            }
            if (intent === "revenue_total") {
                if (facts.revenueTotal <= 0) {
                    return {
                        answer: "Общая выручка за всё время: 0 сум — в CRM нет учтённых оплат по счетам или данные ещё не загружены.",
                        suggestions: ["Сколько заработали сегодня?", "Какая выручка за неделю?"],
                    };
                }
                return {
                    answer: `Общая выручка за всё время: ${(0, exports.formatSum)(facts.revenueTotal)}.`,
                    suggestions: ["Сколько заработали сегодня?", "Какая выручка за неделю?"],
                };
            }
            if (intent === "unpaid_invoices") {
                return {
                    answer: `Сейчас ${facts.unpaidCount} неоплаченных счетов на сумму ${(0, exports.formatSum)(facts.unpaidTotal)}.`,
                    action: { type: "navigate", payload: { to: "/billing/invoices" } },
                    suggestions: ["Перейти в счета", "Сколько заработали сегодня?"],
                };
            }
            if (intent === "top_doctor") {
                if (!facts.topDoctorName) {
                    return {
                        answer: "Пока недостаточно оплат, привязанных к врачам, чтобы назвать лидера. Как только накопятся данные, картина станет яснее.",
                        suggestions: ["Сколько заработали сегодня?", "Есть ли проблемы в кассе?"],
                    };
                }
                return {
                    answer: `Больше всего выручки приносит ${facts.topDoctorName} — ${(0, exports.formatSum)(facts.topDoctorTotal)}.`,
                    action: { type: "navigate", payload: { to: "/reports" } },
                    suggestions: ["Сколько заработали сегодня?", "Найди пациента "],
                };
            }
            if (intent === "top_service") {
                if (!facts.topServiceName) {
                    return {
                        answer: "Пока мало оплат по услугам для сравнения.",
                        suggestions: ["Кто приносит больше выручки?", "Сколько заработали сегодня?"],
                    };
                }
                return {
                    answer: `По сумме оплат лидирует услуга «${facts.topServiceName}» (${(0, exports.formatSum)(facts.topServiceTotal)}).`,
                    action: { type: "navigate", payload: { to: "/reports" } },
                    suggestions: ["Кто приносит больше выручки?", "Есть ли проблемы в кассе?"],
                };
            }
            if (intent === "setup_status") {
                const ready = facts.doctorsCount > 0 && facts.servicesCount > 0 && facts.appointmentsCount > 0;
                return {
                    answer: ready
                        ? "CRM настроена базово: есть врачи, услуги и записи."
                        : `Нужно наполнить справочники: врачи ${facts.doctorsCount}, услуги ${facts.servicesCount}, записи ${facts.appointmentsCount}.`,
                    action: { type: "navigate", payload: { to: "/doctors" } },
                };
            }
            if (intent === "cashier_status") {
                const debt = facts.unpaidCount > 0
                    ? ` Неоплаченных счетов: ${facts.unpaidCount} на ${(0, exports.formatSum)(facts.unpaidTotal)}.`
                    : "";
                return {
                    answer: facts.cashShiftOpen
                        ? `Кассовая смена открыта.${debt}`
                        : `Кассовая смена закрыта.${debt}`,
                    action: { type: "navigate", payload: { to: "/billing/cash-desk" } },
                    suggestions: ["Сколько заработали сегодня?", "Кто приносит больше выручки?"],
                };
            }
            if (intent === "patient_search") {
                return this.answerPatientSearch(message);
            }
            if (intent === "business_advice") {
                if (facts.avgCheck7d > 0 && facts.avgCheckToday > 0 && facts.avgCheckToday < facts.avgCheck7d * 0.9) {
                    const pct = Math.round((1 - facts.avgCheckToday / facts.avgCheck7d) * 100);
                    return {
                        answer: `Средний чек сегодня ниже среднего за 7 дней примерно на ${pct}% — добавьте сопутствующие услуги и пакеты после консультации.`,
                        suggestions: ["Сколько заработали сегодня?", "Кто приносит больше выручки?"],
                    };
                }
                if (facts.servicesCount < 3) {
                    return {
                        answer: "В справочнике мало услуг — расширьте прайс для апсейла и кросс-продаж.",
                        suggestions: ["Сколько заработали сегодня?", "Есть ли проблемы в кассе?"],
                    };
                }
                if (facts.unpaidCount > 0) {
                    return {
                        answer: `Сократите задолженность по ${facts.unpaidCount} счетам — это улучшит cashflow.`,
                        suggestions: ["Есть ли проблемы в кассе?", "Сколько заработали сегодня?"],
                    };
                }
                return {
                    answer: `Средний чек сегодня ${(0, exports.formatSum)(facts.avgCheckToday)}, за 7 дней ${(0, exports.formatSum)(facts.avgCheck7d)}. Добавьте пакеты и контроль повторных визитов.`,
                    suggestions: ["Сколько заработали сегодня?", "Кто приносит больше выручки?"],
                };
            }
            if (intent === "help_navigation") {
                if (text.includes("касс")) {
                    return {
                        answer: "Касса: Биллинг → Касса.",
                        action: { type: "navigate", payload: { to: "/billing/cash-desk" } },
                    };
                }
                if (text.includes("счет")) {
                    return {
                        answer: "Счета: Биллинг → Счета.",
                        action: { type: "navigate", payload: { to: "/billing/invoices" } },
                    };
                }
                if (text.includes("запис")) {
                    return {
                        answer: "Записи — раздел «Записи».",
                        action: { type: "open_quick_create_appointment" },
                    };
                }
                return { answer: "Могу подсказать путь к кассе, счетам, записям и отчётам." };
            }
            return null;
        }
        catch (error) {
            console.error("[AI RULE ENGINE] answerAskQuick", error);
            return { answer: "Не удалось получить данные CRM", suggestions: [] };
        }
    }
    async answerPatientSearch(message) {
        try {
            const raw = message.trim();
            let q = /^найди\s+(?:пациента\s+)?(.+)/i.exec(raw)?.[1]?.trim() ??
                /^покажи\s+(?:пациента\s+)?(.+)/i.exec(raw)?.[1]?.trim() ??
                "";
            if (!q) {
                return { answer: "Уточните запрос, например: Найди пациента Иван или по телефону." };
            }
            // eslint-disable-next-line no-console
            console.log("[AI] patient_search query", q);
            if (env_1.env.dataProvider === "postgres") {
                const pattern = wrapIlike(q);
                const digits = q.replace(/\D/g, "");
                const idOnly = /^\d+$/.test(q) ? q : null;
                const rows = await database_1.dbPool.query(`
        SELECT id::text, full_name, phone
        FROM patients
        WHERE deleted_at IS NULL
          AND (
            full_name ILIKE $1 ESCAPE '\\'
            OR phone ILIKE $1 ESCAPE '\\'
            OR ($3::text <> '' AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE '%' || $3 || '%')
            OR ($2::text IS NOT NULL AND id::text = $2)
          )
        ORDER BY created_at DESC
        LIMIT 8
        `, [pattern, idOnly, digits.length >= 3 ? digits : ""]);
                // eslint-disable-next-line no-console
                console.log("[AI] patient_search rows count", rows.rows.length);
                if (rows.rows.length === 0) {
                    return { answer: "Пациент не найден." };
                }
                const list = rows.rows
                    .map((r) => `${r.full_name}${r.phone ? `, ${r.phone}` : ""}`)
                    .join("; ");
                return {
                    answer: rows.rows.length === 1
                        ? `Найден: ${list}.`
                        : `Найдено (${rows.rows.length}): ${list}.`,
                    action: { type: "navigate", payload: { to: "/patients" } },
                };
            }
            const found = (0, mockDatabase_1.getMockDb)().patients.filter((p) => {
                const name = p.fullName.toLowerCase().includes(q.toLowerCase());
                const phone = p.phone?.includes(q) ?? false;
                return name || phone;
            });
            // eslint-disable-next-line no-console
            console.log("[AI] patient_search rows count", found.length);
            if (found.length === 0)
                return { answer: "Пациент не найден." };
            const list = found
                .slice(0, 8)
                .map((p) => `${p.fullName}${p.phone ? `, ${p.phone}` : ""}`)
                .join("; ");
            return {
                answer: found.length === 1 ? `Найден: ${list}.` : `Найдено (${found.length}): ${list}.`,
                action: { type: "navigate", payload: { to: "/patients" } },
            };
        }
        catch (error) {
            console.error("[AI RULE ENGINE] answerPatientSearch", error);
            return { answer: "Не удалось получить данные CRM", suggestions: [] };
        }
    }
}
exports.AiRuleEngine = AiRuleEngine;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvYWkvYWlSdWxlRW5naW5lLnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9haS9haVJ1bGVFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsaURBQTRDO0FBQzVDLHVDQUFvQztBQUNwQywrREFBeUQ7QUFJbEQsTUFBTSxTQUFTLEdBQUcsQ0FBQyxLQUFhLEVBQVUsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQztBQUExRixRQUFBLFNBQVMsYUFBaUY7QUFFdkcsTUFBTSxTQUFTLEdBQUcsQ0FBQyxHQUFXLEVBQVUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0FBRXpGLE1BQU0sU0FBUyxHQUFHLENBQUMsR0FBVyxFQUFVLEVBQUU7SUFDeEMsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3JGLE9BQU8sSUFBSSxPQUFPLEdBQUcsQ0FBQztBQUN4QixDQUFDLENBQUM7QUFFRixNQUFhLFlBQVk7SUFDdkIsWUFBWSxDQUFDLE1BQW9CLEVBQUUsSUFBNkI7UUFDOUQsSUFBSSxDQUFDO1lBQ0wsSUFBSSxNQUFNLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3pCLE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENB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LEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDO2lCQUMzRCxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDZCxPQUFPO2dCQUNMLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWSxLQUFLLENBQUMsTUFBTSxNQUFNLElBQUksR0FBRztnQkFDdkYsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLEVBQUU7YUFDM0QsQ0FBQztRQUNGLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQ0FBc0MsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM3RCxPQUFPLEVBQUUsTUFBTSxFQUFFLGdDQUFnQyxFQUFFLFdBQVcsRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUN2RSxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBM1hELG9DQTJYQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGRiUG9vbCB9IGZyb20gXCIuLi9jb25maWcvZGF0YWJhc2VcIjtcclxuaW1wb3J0IHsgZW52IH0gZnJvbSBcIi4uL2NvbmZpZy9lbnZcIjtcclxuaW1wb3J0IHsgZ2V0TW9ja0RiIH0gZnJvbSBcIi4uL3JlcG9zaXRvcmllcy9tb2NrRGF0YWJhc2VcIjtcclxuaW1wb3J0IHR5cGUgeyBBSUFzc2lzdGFudEFza1Jlc3BvbnNlIH0gZnJvbSBcIi4vYWlUeXBlc1wiO1xyXG5pbXBvcnQgdHlwZSB7IEFpQXNrUXVpY2tJbnRlbnQsIEFpRGF0YUludGVudCwgQ2xpbmljRmFjdHNTbmFwc2hvdCB9IGZyb20gXCIuL2FpVHlwZXNcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBmb3JtYXRTdW0gPSAodmFsdWU6IG51bWJlcik6IHN0cmluZyA9PiBgJHtNYXRoLnJvdW5kKHZhbHVlKS50b0xvY2FsZVN0cmluZyhcInJ1LVJVXCIpfSDRgdGD0LxgO1xyXG5cclxuY29uc3Qgbm9ybWFsaXplID0gKHJhdzogc3RyaW5nKTogc3RyaW5nID0+IHJhdy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1xccysvZywgXCIgXCIpLnRyaW0oKTtcclxuXHJcbmNvbnN0IHdyYXBJbGlrZSA9IChyYXc6IHN0cmluZyk6IHN0cmluZyA9PiB7XHJcbiAgY29uc3QgZXNjYXBlZCA9IHJhdy5yZXBsYWNlKC9cXFxcL2csIFwiXFxcXFxcXFxcIikucmVwbGFjZSgvJS9nLCBcIlxcXFwlXCIpLnJlcGxhY2UoL18vZywgXCJcXFxcX1wiKTtcclxuICByZXR1cm4gYCUke2VzY2FwZWR9JWA7XHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgQWlSdWxlRW5naW5lIHtcclxuICBhbnN3ZXJIeWJyaWQoaW50ZW50OiBBaURhdGFJbnRlbnQsIGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogc3RyaW5nIHtcclxuICAgIHRyeSB7XHJcbiAgICBpZiAoaW50ZW50ID09PSBcInJldmVudWVcIikge1xyXG4gICAgICBjb25zdCByZXZlbnVlVG9kYXkgPSBOdW1iZXIoZGF0YS5yZXZlbnVlVG9kYXkgPz8gZGF0YS50b3RhbCA/PyAwKTtcclxuICAgICAgY29uc3QgcGF5bWVudHNDb3VudFRvZGF5ID0gTnVtYmVyKGRhdGEucGF5bWVudHNDb3VudFRvZGF5ID8/IDApO1xyXG4gICAgICBpZiAocGF5bWVudHNDb3VudFRvZGF5ID09PSAwICYmIHJldmVudWVUb2RheSA9PT0gMCkge1xyXG4gICAgICAgIHJldHVybiBcItCh0LXQs9C+0LTQvdGPINCy0YvRgNGD0YfQutCwINGB0L7RgdGC0LDQstC40LvQsCAwINGB0YPQvCDigJQg0L/QviDQtNCw0L3QvdGL0LwgQ1JNINC90LXRgiDRg9GH0YLRkdC90L3Ri9GFINC+0L/Qu9Cw0YIg0L/QviDRgdGH0LXRgtCw0LwgKNC90LUg0L7RgtC80LXQvdGR0L3QvdGL0Lwg0Lgg0L3QtSDQstC+0LfQstGA0LDRidGR0L3QvdGL0LwpINC30LAg0YLQtdC60YPRidC40Lkg0LrQsNC70LXQvdC00LDRgNC90YvQuSDQtNC10L3RjC5cIjtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gYNCh0LXQs9C+0LTQvdGPINCy0YvRgNGD0YfQutCwINGB0L7RgdGC0LDQstC40LvQsCAke2Zvcm1hdFN1bShyZXZlbnVlVG9kYXkpfS5gO1xyXG4gICAgfVxyXG4gICAgaWYgKGludGVudCA9PT0gXCJ1bnBhaWRcIikge1xyXG4gICAgICBjb25zdCB1bnBhaWRDb3VudCA9IE51bWJlcihkYXRhLnVucGFpZENvdW50ID8/IDApO1xyXG4gICAgICBjb25zdCB1bnBhaWRUb3RhbCA9IE51bWJlcihkYXRhLnVucGFpZFRvdGFsID8/IDApO1xyXG4gICAgICByZXR1cm4gYNCd0LXQvtC/0LvQsNGH0LXQvdC90YvRhSDRgdGH0LXRgtC+0LI6ICR7dW5wYWlkQ291bnR9INC90LAg0YHRg9C80LzRgyAke2Zvcm1hdFN1bSh1bnBhaWRUb3RhbCl9LiDQoNC10LrQvtC80LXQvdC00LDRhtC40Y86INC30LDQutGA0YvRgtGMINC+0YHRgtCw0YLQutC4INC4INC/0YDQvtC60L7QvdGC0YDQvtC70LjRgNC+0LLQsNGC0Ywg0LTQtdCx0LjRgtC+0YDQutGDLmA7XHJcbiAgICB9XHJcbiAgICBpZiAoaW50ZW50ID09PSBcInRvcF9kb2N0b3JcIikge1xyXG4gICAgICBjb25zdCB0b3BEb2N0b3IgPSAoZGF0YS50b3BEb2N0b3IgPz8gbnVsbCkgYXMgeyBuYW1lPzogc3RyaW5nOyB0b3RhbD86IG51bWJlcjsgc2hhcmU/OiBudW1iZXIgfSB8IG51bGw7XHJcbiAgICAgIGlmICghdG9wRG9jdG9yKSByZXR1cm4gXCLQn9C+0LrQsCDQvdC10LTQvtGB0YLQsNGC0L7Rh9C90L4g0L7Qv9C70LDRgiwg0L/RgNC40LLRj9C30LDQvdC90YvRhSDQuiDQstGA0LDRh9Cw0LwsINC00LvRjyDRgNC10LnRgtC40L3Qs9CwLlwiO1xyXG4gICAgICBjb25zdCBzaGFyZSA9IE51bWJlcih0b3BEb2N0b3Iuc2hhcmUgPz8gMCk7XHJcbiAgICAgIHJldHVybiBg0KLQvtC/LdCy0YDQsNGHINC/0L4g0L7Qv9C70LDRh9C10L3QvdC+0Lkg0LLRi9GA0YPRh9C60LU6ICR7dG9wRG9jdG9yLm5hbWUgPz8gXCLigJRcIn0gKCR7Zm9ybWF0U3VtKE51bWJlcih0b3BEb2N0b3IudG90YWwgPz8gMCkpfSR7c2hhcmUgPiAwID8gYCwgfiR7c2hhcmV9JSDQvtGCINGB0YPQvNC80Ysg0L/QviDQstGA0LDRh9Cw0LxgIDogXCJcIn0pLmA7XHJcbiAgICB9XHJcbiAgICBpZiAoaW50ZW50ID09PSBcInRvcF9zZXJ2aWNlXCIpIHtcclxuICAgICAgY29uc3QgdG9wU2VydmljZSA9IChkYXRhLnRvcFNlcnZpY2UgPz8gbnVsbCkgYXMgeyBuYW1lPzogc3RyaW5nOyB0b3RhbD86IG51bWJlciB9IHwgbnVsbDtcclxuICAgICAgaWYgKCF0b3BTZXJ2aWNlKSByZXR1cm4gXCLQn9C+0LrQsCDQvdC10LTQvtGB0YLQsNGC0L7Rh9C90L4g0L7Qv9C70LDRgiDQv9C+INGD0YHQu9GD0LPQsNC8INC00LvRjyDRgNC10LnRgtC40L3Qs9CwLlwiO1xyXG4gICAgICByZXR1cm4gYNCi0L7Qvy3Rg9GB0LvRg9Cz0LAg0L/QviDQvtC/0LvQsNGC0LDQvDogJHt0b3BTZXJ2aWNlLm5hbWUgPz8gXCLigJRcIn0gKCR7Zm9ybWF0U3VtKE51bWJlcih0b3BTZXJ2aWNlLnRvdGFsID8/IDApKX0pLmA7XHJcbiAgICB9XHJcbiAgICBpZiAoaW50ZW50ID09PSBcImNhc2hfc3RhdHVzXCIpIHtcclxuICAgICAgY29uc3QgY2FzaFNoaWZ0T3BlbiA9IEJvb2xlYW4oZGF0YS5jYXNoU2hpZnRPcGVuKTtcclxuICAgICAgcmV0dXJuIGNhc2hTaGlmdE9wZW5cclxuICAgICAgICA/IFwi0JrQsNGB0YHQvtCy0LDRjyDRgdC80LXQvdCwINC+0YLQutGA0YvRgtCwIOKAlCDQv9GA0LjRkdC8INC+0L/Qu9Cw0YIg0LLQvtC30LzQvtC20LXQvS4g0J/RgNC+0LLQtdGA0YzRgtC1INCy0L7Qt9Cy0YDQsNGC0Ysg0Lgg0L7RgdGC0LDRgtC+0Log0LIg0LrQsNGB0YHQtS5cIlxyXG4gICAgICAgIDogXCLQmtCw0YHRgdC+0LLQsNGPINGB0LzQtdC90LAg0LfQsNC60YDRi9GC0LAg4oCUINC+0YLQutGA0L7QudGC0LUg0YHQvNC10L3RgyDQsiDRgNCw0LfQtNC10LvQtSDQmtCw0YHRgdCwINC/0LXRgNC10LQg0L/RgNC40ZHQvNC+0Lwg0L7Qv9C70LDRgi5cIjtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzLmxvY2FsSGVhbHRoRnJvbURhdGEoZGF0YSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiW0FJIFJVTEUgRU5HSU5FXSBhbnN3ZXJIeWJyaWRcIiwgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gXCLQndC1INGD0LTQsNC70L7RgdGMINC/0L7Qu9GD0YfQuNGC0Ywg0LTQsNC90L3Ri9C1IENSTVwiO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgbG9jYWxIZWFsdGhGcm9tRGF0YShkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHN0cmluZyB7XHJcbiAgICBjb25zdCB1bnBhaWQgPSBOdW1iZXIoZGF0YS51bnBhaWRDb3VudCA/PyAwKTtcclxuICAgIGNvbnN0IHJldmVudWVUb2RheSA9IE51bWJlcihkYXRhLnJldmVudWVUb2RheSA/PyAwKTtcclxuICAgIGNvbnN0IGFwcG9pbnRtZW50c1RvZGF5ID0gTnVtYmVyKGRhdGEuYXBwb2ludG1lbnRzVG9kYXkgPz8gMCk7XHJcbiAgICBjb25zdCBhdmc3ID0gTnVtYmVyKGRhdGEuYXZnRGFpbHlSZXZlbnVlN0RheXMgPz8gMCk7XHJcbiAgICBjb25zdCBhdmdDdCA9IE51bWJlcihkYXRhLmF2Z0NoZWNrVG9kYXkgPz8gMCk7XHJcbiAgICBjb25zdCBhdmdDNyA9IE51bWJlcihkYXRhLmF2Z0NoZWNrN2QgPz8gMCk7XHJcbiAgICBjb25zdCB0b3BEb2N0b3IgPSBkYXRhLnRvcERvY3RvciBhcyB7IG5hbWU/OiBzdHJpbmc7IHRvdGFsPzogbnVtYmVyIH0gfCBudWxsIHwgdW5kZWZpbmVkO1xyXG4gICAgY29uc3Qgbm9TaG93ID0gTnVtYmVyKGRhdGEubm9TaG93T3JDYW5jZWxsZWQzMGQgPz8gMCk7XHJcbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXCLQmtGA0LDRgtC60L4g0L/QviBDUk06XCJdO1xyXG4gICAgaWYgKHJldmVudWVUb2RheSA9PT0gMCAmJiBhdmc3ID09PSAwKSB7XHJcbiAgICAgIGxpbmVzLnB1c2goXCLQl9CwINGB0LXQs9C+0LTQvdGPINC4INC30LAg0L3QtdC00LXQu9GOINC90LXRgiDRg9GH0YLRkdC90L3Ri9GFINC+0L/Qu9Cw0YIg4oCUINC/0YDQvtCy0LXRgNGM0YLQtSDQutCw0YHRgdGDINC4INCy0YvRgdGC0LDQstC70LXQvdC40LUg0YHRh9C10YLQvtCyLlwiKTtcclxuICAgIH0gZWxzZSBpZiAocmV2ZW51ZVRvZGF5ID09PSAwKSB7XHJcbiAgICAgIGxpbmVzLnB1c2goXCLQodC10LPQvtC00L3RjyDQvtC/0LvQsNGCINC90LXRgiDigJQg0L/RgNC+0LLQtdGA0YzRgtC1INC30LDQv9C40YHQuCDQuCDQvdCw0L/QvtC80LjQvdCw0L3QuNGPINC/0LDRhtC40LXQvdGC0LDQvC5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAodW5wYWlkID49IDUpIGxpbmVzLnB1c2goYNCc0L3QvtCz0L4g0L3QtdC+0L/Qu9Cw0YfQtdC90L3Ri9GFINGB0YfQtdGC0L7QsiAoJHt1bnBhaWR9KS5gKTtcclxuICAgIGVsc2UgaWYgKHVucGFpZCA+IDApIGxpbmVzLnB1c2goYNCV0YHRgtGMINC90LXQvtC/0LvQsNGH0LXQvdC90YvQtSDRgdGH0LXRgtCwICgke3VucGFpZH0pLmApO1xyXG4gICAgaWYgKGFwcG9pbnRtZW50c1RvZGF5ID09PSAwKSBsaW5lcy5wdXNoKFwi0J3QsCDRgdC10LPQvtC00L3RjyDQvdC10YIg0LfQsNC/0LjRgdC10Lkg4oCUINGD0YHQuNC70YzRgtC1INC30LDQs9GA0YPQt9C60YMg0Lgg0LzQsNGA0LrQtdGC0LjQvdCzLlwiKTtcclxuICAgIGVsc2UgaWYgKGFwcG9pbnRtZW50c1RvZGF5ID4gMCAmJiBhcHBvaW50bWVudHNUb2RheSA8IDMpIGxpbmVzLnB1c2goXCLQndC40LfQutCw0Y8g0LfQsNCz0YDRg9C30LrQsCDQv9C+INC30LDQv9C40YHRj9C8INC90LAg0YHQtdCz0L7QtNC90Y8uXCIpO1xyXG4gICAgaWYgKHRvcERvY3Rvcj8ubmFtZSkgbGluZXMucHVzaChg0JvQuNC00LXRgCDQv9C+INC+0L/Qu9Cw0YLQsNC8OiAke3RvcERvY3Rvci5uYW1lfS5gKTtcclxuICAgIGlmIChhdmc3ID4gMCAmJiByZXZlbnVlVG9kYXkgPiBhdmc3ICogMS4wNSkgbGluZXMucHVzaChcItCS0YvRgNGD0YfQutCwINGB0LXQs9C+0LTQvdGPINCy0YvRiNC1INGB0YDQtdC00L3QtdCz0L4g0LfQsCDQvdC10LTQtdC70Y4uXCIpO1xyXG4gICAgaWYgKGF2Z0M3ID4gMCAmJiBhdmdDdCA+IDAgJiYgYXZnQ3QgPCBhdmdDNyAqIDAuODYpIHtcclxuICAgICAgbGluZXMucHVzaChg0KHRgNC10LTQvdC40Lkg0YfQtdC6INGB0LXQs9C+0LTQvdGPINC90LjQttC1INGB0YDQtdC00L3QtdCz0L4g0LfQsCA3INC00L3QtdC5IOKAlCDRgNCw0YHRgdC80L7RgtGA0LjRgtC1INCw0L/RgdC10LnQuyDQuCDQv9Cw0LrQtdGC0YsuYCk7XHJcbiAgICB9XHJcbiAgICBpZiAobm9TaG93ID4gMykgbGluZXMucHVzaChg0JzQvdC+0LPQviDQvtGC0LzQtdC9L25vLXNob3cg0LfQsCDQvNC10YHRj9GGICgke25vU2hvd30pIOKAlCDRg9GB0LjQu9GM0YLQtSDQv9C+0LTRgtCy0LXRgNC20LTQtdC90LjRjyDQstC40LfQuNGC0L7Qsi5gKTtcclxuICAgIHJldHVybiBsaW5lcy5qb2luKFwiIFwiKTtcclxuICB9XHJcblxyXG4gIC8qKiDQlNC10YLQtdGA0LzQuNC90LjRgNC+0LLQsNC90L3Ri9C1INGA0LXQutC+0LzQtdC90LTQsNGG0LjQuCAo0YPRgNC+0LLQtdC90YwgQSksINCx0LXQtyBMTE0uICovXHJcbiAgYnVpbGRMb2NhbFJlY29tbWVuZGF0aW9uc0xpc3QoZmFjdHM6IENsaW5pY0ZhY3RzU25hcHNob3QpOiBzdHJpbmdbXSB7XHJcbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcclxuICAgIGlmIChmYWN0cy5yZXZlbnVlVG9kYXkgPT09IDAgJiYgZmFjdHMucmV2ZW51ZTdkID4gMCkge1xyXG4gICAgICBsaW5lcy5wdXNoKFwi0KHQtdCz0L7QtNC90Y8g0L7Qv9C70LDRgiDQvdC10YIg4oCUINGB0LLQtdGA0YzRgtC1INC60LDRgdGB0YMg0Lgg0L3QsNC/0L7QvNC40L3QsNC90LjRjyDQv9C+INC30LDQv9C40YHRj9C8LlwiKTtcclxuICAgIH1cclxuICAgIGlmIChmYWN0cy5yZXZlbnVlVG9kYXkgPT09IDAgJiYgZmFjdHMucmV2ZW51ZTdkID09PSAwKSB7XHJcbiAgICAgIGxpbmVzLnB1c2goXCLQndC10YIg0YPRh9GC0ZHQvdC90YvRhSDQvtC/0LvQsNGCINC30LAg0L3QtdC00LXQu9GOIOKAlCDQv9GA0L7QstC10YDRjNGC0LUg0L/RgNC+0YbQtdGB0YEg0LLRi9GB0YLQsNCy0LvQtdC90LjRjyDRgdGH0LXRgtC+0LIg0Lgg0L7Qv9C70LDRgtGLLlwiKTtcclxuICAgIH1cclxuICAgIGlmIChmYWN0cy51bnBhaWRDb3VudCA+IDApIHtcclxuICAgICAgbGluZXMucHVzaChg0JTQtdCx0LjRgtC+0YDQutCwOiAke2ZhY3RzLnVucGFpZENvdW50fSDRgdGH0LXRgtC+0LIsICR7Zm9ybWF0U3VtKGZhY3RzLnVucGFpZFRvdGFsKX0g0Log0L7Qv9C70LDRgtC1LmApO1xyXG4gICAgfVxyXG4gICAgaWYgKGZhY3RzLmF2Z0NoZWNrN2QgPiAwICYmIGZhY3RzLmF2Z0NoZWNrVG9kYXkgPiAwICYmIGZhY3RzLmF2Z0NoZWNrVG9kYXkgPCBmYWN0cy5hdmdDaGVjazdkICogMC44Nikge1xyXG4gICAgICBsaW5lcy5wdXNoKFxyXG4gICAgICAgIGDQodGA0LXQtNC90LjQuSDRh9C10Log0YHQtdCz0L7QtNC90Y8g0L3QuNC20LUg0L3QtdC00LXQu9GM0L3QvtCz0L4g0L3QsCAke01hdGgucm91bmQoKDEgLSBmYWN0cy5hdmdDaGVja1RvZGF5IC8gZmFjdHMuYXZnQ2hlY2s3ZCkgKiAxMDApfSUg4oCUINCw0L/RgdC10LnQuyDQv9C+0YHQu9C1INC60L7QvdGB0YPQu9GM0YLQsNGG0LjQuC5gXHJcbiAgICAgICk7XHJcbiAgICB9XHJcbiAgICBpZiAoZmFjdHMuYXBwb2ludG1lbnRzVG9kYXkgPCAzICYmIGZhY3RzLmRvY3RvcnNDb3VudCA+IDAgJiYgZmFjdHMucmV2ZW51ZVRvZGF5ID09PSAwKSB7XHJcbiAgICAgIGxpbmVzLnB1c2goXCLQnNCw0LvQviDQt9Cw0L/QuNGB0LXQuSDQvdCwINGB0LXQs9C+0LTQvdGPIOKAlCDQvNCw0YDQutC10YLQuNC90LMg0Lgg0L3QsNC/0L7QvNC40L3QsNC90LjRjy5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAoZmFjdHMuYXBwb2ludG1lbnRzU2NoZWR1bGVkVG9kYXkgPiBmYWN0cy5hcHBvaW50bWVudHNDb21wbGV0ZWRUb2RheSAqIDIgJiYgZmFjdHMuYXBwb2ludG1lbnRzU2NoZWR1bGVkVG9kYXkgPiAzKSB7XHJcbiAgICAgIGxpbmVzLnB1c2goXCLQnNC90L7Qs9C+INC+0LbQuNC00LDRjtGJ0LjRhSDQstC40LfQuNGC0L7QsiDQv9GA0Lgg0LzQsNC70L4g0LfQsNCy0LXRgNGI0ZHQvdC90YvRhSDigJQg0L/QvtC00YLQstC10YDQttC00LDQudGC0LUg0LfQsNC/0LjRgdC4LlwiKTtcclxuICAgIH1cclxuICAgIGlmIChmYWN0cy5ub1Nob3dPckNhbmNlbGxlZDMwZCA+IDUpIHtcclxuICAgICAgbGluZXMucHVzaChg0JfQsCAzMCDQtNC90LXQuSDQvtGC0LzQtdC9L25vLXNob3c6ICR7ZmFjdHMubm9TaG93T3JDYW5jZWxsZWQzMGR9IOKAlCDRg9C60YDQtdC/0LjRgtC1INC/0L7QtNGC0LLQtdGA0LbQtNC10L3QuNGPINC4INGD0LTQtdGA0LbQsNC90LjQtS5gKTtcclxuICAgIH1cclxuICAgIGlmIChmYWN0cy5jYXNoU2hpZnRPcGVuID09PSBmYWxzZSkge1xyXG4gICAgICBsaW5lcy5wdXNoKFwi0JrQsNGB0YHQsCDQt9Cw0LrRgNGL0YLQsCDigJQg0L7RgtC60YDQvtC50YLQtSDRgdC80LXQvdGDINC00LvRjyDQv9GA0LjRkdC80LAg0L7Qv9C70LDRgi5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAobGluZXMubGVuZ3RoID09PSAwKSBsaW5lcy5wdXNoKFwi0KHQu9C10LTQuNGC0LUg0LfQsCDQvtC/0LvQsNGC0LDQvNC4INCyINCR0LjQu9C70LjQvdCz0LUg0Lgg0LfQsNCz0YDRg9C30LrQvtC5INGA0LDRgdC/0LjRgdCw0L3QuNGPLlwiKTtcclxuICAgIHJldHVybiBsaW5lcy5zbGljZSgwLCA2KTtcclxuICB9XHJcblxyXG4gIGdlbmVyYXRlTG9jYWxBbnN3ZXJGcm9tRmFjdHMoZmFjdHM6IENsaW5pY0ZhY3RzU25hcHNob3QpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIHRoaXMuYnVpbGRMb2NhbFJlY29tbWVuZGF0aW9uc0xpc3QoZmFjdHMpLnNsaWNlKDAsIDMpLmpvaW4oXCIgXCIpO1xyXG4gIH1cclxuXHJcbiAgZmFsbGJhY2tHZW5lcmFsQ3JtQWR2aWNlKGZhY3RzOiBDbGluaWNGYWN0c1NuYXBzaG90KTogc3RyaW5nIHtcclxuICAgIGNvbnN0IHRvZGF5TGluZSA9XHJcbiAgICAgIGZhY3RzLnBheW1lbnRzQ291bnRUb2RheSA9PT0gMCAmJiBmYWN0cy5yZXZlbnVlVG9kYXkgPT09IDBcclxuICAgICAgICA/IFwi0KHQtdCz0L7QtNC90Y8g0L/QviBDUk06IDAg0YHRg9C8INCy0YvRgNGD0YfQutC4ICjQvdC10YIg0YPRh9GC0ZHQvdC90YvRhSDQvtC/0LvQsNGCINC30LAg0LTQtdC90YwpLlwiXHJcbiAgICAgICAgOiBg0KHQtdCz0L7QtNC90Y8g0LLRi9GA0YPRh9C60LAgJHtmb3JtYXRTdW0oZmFjdHMucmV2ZW51ZVRvZGF5KX1gO1xyXG4gICAgY29uc3QgcGFydHMgPSBbXHJcbiAgICAgIGAke3RvZGF5TGluZX0uINCX0LAgNyDQtNC90LXQuTogJHtmb3JtYXRTdW0oZmFjdHMucmV2ZW51ZTdkKX0uYCxcclxuICAgICAgZmFjdHMudW5wYWlkQ291bnQgPiAwXHJcbiAgICAgICAgPyBg0J3QtdC+0L/Qu9Cw0YfQtdC90L3Ri9GFINGB0YfQtdGC0L7QsjogJHtmYWN0cy51bnBhaWRDb3VudH0gKCR7Zm9ybWF0U3VtKGZhY3RzLnVucGFpZFRvdGFsKX0pLmBcclxuICAgICAgICA6IFwi0J3QtdC+0L/Qu9Cw0YfQtdC90L3Ri9GFINGB0YfQtdGC0L7QsiDQvdC10YIuXCIsXHJcbiAgICAgIGZhY3RzLnRvcERvY3Rvck5hbWUgPyBg0JvQuNC00LXRgCDQv9C+INC+0L/Qu9Cw0YLQsNC8OiAke2ZhY3RzLnRvcERvY3Rvck5hbWV9LmAgOiBcIlwiLFxyXG4gICAgXS5maWx0ZXIoQm9vbGVhbik7XHJcbiAgICByZXR1cm4gcGFydHMuam9pbihcIiBcIik7XHJcbiAgfVxyXG5cclxuICBmYWxsYmFja093bmVyUmVjb21tZW5kYXRpb25zKGZhY3RzOiBDbGluaWNGYWN0c1NuYXBzaG90KTogc3RyaW5nIHtcclxuICAgIGNvbnN0IHRvZGF5UGFydCA9XHJcbiAgICAgIGZhY3RzLnBheW1lbnRzQ291bnRUb2RheSA9PT0gMCA/IFwi0J3QtdGCINC+0L/Qu9Cw0YIg0YHQtdCz0L7QtNC90Y9cIiA6IGZvcm1hdFN1bShmYWN0cy5yZXZlbnVlVG9kYXkpO1xyXG4gICAgY29uc3QgcGFydHMgPSBbXHJcbiAgICAgIGDQodC10LPQvtC00L3RjyAke3RvZGF5UGFydH0sINC30LAgNyDQtNC90LXQuSAke2Zvcm1hdFN1bShmYWN0cy5yZXZlbnVlN2QpfSwg0L3QtdC+0L/Qu9Cw0YfQtdC90L3Ri9GFOiAke2ZhY3RzLnVucGFpZENvdW50fS5gLFxyXG4gICAgICBmYWN0cy5jYXNoU2hpZnRPcGVuID8gXCLQodC80LXQvdCwINC+0YLQutGA0YvRgtCwLlwiIDogXCLQntGC0LrRgNC+0LnRgtC1INC60LDRgdGB0L7QstGD0Y4g0YHQvNC10L3Rgy5cIixcclxuICAgIF07XHJcbiAgICByZXR1cm4gcGFydHMuam9pbihcIiBcIik7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDQmtC+0YDQvtGC0LrQuNC5INC+0YLQstC10YIg0LHQtdC3IExMTSDQtNC70Y8gwqvQvtCx0YnQuNGFwrsg0YTQvtGA0LzRg9C70LjRgNC+0LLQvtC6LCDQtdGB0LvQuCDRg9C20LUg0LXRgdGC0Ywg0YHQuNC70YzQvdGL0LUg0YHQuNCz0L3QsNC70Ysg0LIg0LTQsNC90L3Ri9GFLlxyXG4gICAqL1xyXG4gIHRyeURldGVybWluaXN0aWNHZW5lcmFsQW5zd2VyKG1lc3NhZ2U6IHN0cmluZywgZmFjdHM6IENsaW5pY0ZhY3RzU25hcHNob3QpOiBzdHJpbmcgfCBudWxsIHtcclxuICAgIGNvbnN0IHQgPSBub3JtYWxpemUobWVzc2FnZSk7XHJcbiAgICBpZiAoZmFjdHMudW5wYWlkQ291bnQgPiA1ICYmICh0LmluY2x1ZGVzKFwi0L/RgNC+0LHQu9C10LxcIikgfHwgdC5pbmNsdWRlcyhcItGA0LjRgdC6XCIpIHx8IHQuaW5jbHVkZXMoXCLRh9GC0L4g0L3QtSDRgtCw0LpcIikpKSB7XHJcbiAgICAgIHJldHVybiBg0J/QviDQtNCw0L3QvdGL0LwgQ1JNOiAke2ZhY3RzLnVucGFpZENvdW50fSDQvdC10L7Qv9C70LDRh9C10L3QvdGL0YUg0YHRh9C10YLQvtCyINC90LAgJHtmb3JtYXRTdW0oZmFjdHMudW5wYWlkVG90YWwpfSDigJQg0LIg0L/RgNC40L7RgNC40YLQtdGC0LUg0LTQtdCx0LjRgtC+0YDQutCwINC4INC60L7QvdGC0YDQvtC70Ywg0L7Qv9C70LDRgi5gO1xyXG4gICAgfVxyXG4gICAgaWYgKGZhY3RzLnJldmVudWVUb2RheSA9PT0gMCAmJiBmYWN0cy5yZXZlbnVlN2QgPiAxMDAwICYmIHQuaW5jbHVkZXMoXCLRgdC10LPQvtC00L3Rj1wiKSkge1xyXG4gICAgICByZXR1cm4gYNCh0LXQs9C+0LTQvdGPINCyIENSTTogMCDRgdGD0LwsINC30LAg0L/QvtGB0LvQtdC00L3QuNC1IDcg0LTQvdC10Lkg0LHRi9C70L4gJHtmb3JtYXRTdW0oZmFjdHMucmV2ZW51ZTdkKX0g4oCUINGN0YLQviDRgNCw0LfQvdGL0LUg0LrQsNC70LXQvdC00LDRgNC90YvQtSDQtNC90Lg7INGG0LjRhNGA0LAg0LfQsCDRgdC10LPQvtC00L3RjyDQvtGC0L3QvtGB0LjRgtGB0Y8g0YLQvtC70YzQutC+INC6INGC0LXQutGD0YnQtdC80YMg0LTQvdGOLmA7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcblxyXG4gIGFzeW5jIGFuc3dlckFza1F1aWNrKFxyXG4gICAgaW50ZW50OiBBaUFza1F1aWNrSW50ZW50LFxyXG4gICAgZmFjdHM6IENsaW5pY0ZhY3RzU25hcHNob3QsXHJcbiAgICBtZXNzYWdlOiBzdHJpbmdcclxuICApOiBQcm9taXNlPEFJQXNzaXN0YW50QXNrUmVzcG9uc2UgfCBudWxsPiB7XHJcbiAgICB0cnkge1xyXG4gICAgaWYgKGludGVudCA9PT0gXCJ1bmtub3duXCIpIHJldHVybiBudWxsO1xyXG4gICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZShtZXNzYWdlKTtcclxuXHJcbiAgICBpZiAoaW50ZW50ID09PSBcInJldmVudWVfdG9kYXlcIikge1xyXG4gICAgICBjb25zdCB1bnBhaWRMaW5lID1cclxuICAgICAgICBmYWN0cy51bnBhaWRDb3VudCA+IDBcclxuICAgICAgICAgID8gYCDQndC10L7Qv9C70LDRh9C10L3QvdGL0YUg0YHRh9C10YLQvtCyOiAke2ZhY3RzLnVucGFpZENvdW50fSDQvdCwICR7Zm9ybWF0U3VtKGZhY3RzLnVucGFpZFRvdGFsKX0uYFxyXG4gICAgICAgICAgOiBcIlwiO1xyXG4gICAgICBpZiAoZmFjdHMucGF5bWVudHNDb3VudFRvZGF5ID09PSAwICYmIGZhY3RzLnJldmVudWVUb2RheSA9PT0gMCkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBhbnN3ZXI6XHJcbiAgICAgICAgICAgIFwi0KHQtdCz0L7QtNC90Y8g0LLRi9GA0YPRh9C60LAg0YHQvtGB0YLQsNCy0LjQu9CwIDAg0YHRg9C8IOKAlCDQsiBDUk0g0L3QtdGCINGD0YfRgtGR0L3QvdGL0YUg0L7Qv9C70LDRgiDQv9C+INGB0YfQtdGC0LDQvCDQt9CwINGC0LXQutGD0YnQuNC5INC60LDQu9C10L3QtNCw0YDQvdGL0Lkg0LTQtdC90YwgKNCyINC+0YLRh9GR0YLQvdC+0Lkg0LfQvtC90LUg0LrQu9C40L3QuNC60LgpLlwiICtcclxuICAgICAgICAgICAgdW5wYWlkTGluZSxcclxuICAgICAgICAgIHN1Z2dlc3Rpb25zOiBbXCLQmtCw0LrQsNGPINCy0YvRgNGD0YfQutCwINC30LAg0L3QtdC00LXQu9GOP1wiLCBcItCe0LHRidCw0Y8g0LLRi9GA0YPRh9C60LAg0LfQsCDQstGB0ZEg0LLRgNC10LzRj1wiXSxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgYW5zd2VyOiBg0KHQtdCz0L7QtNC90Y8g0LLRi9GA0YPRh9C60LAg0YHQvtGB0YLQsNCy0LjQu9CwICR7Zm9ybWF0U3VtKGZhY3RzLnJldmVudWVUb2RheSl9LiR7dW5wYWlkTGluZX1gLFxyXG4gICAgICAgIHN1Z2dlc3Rpb25zOiBbXCLQmtCw0LrQsNGPINCy0YvRgNGD0YfQutCwINC30LAg0L3QtdC00LXQu9GOP1wiLCBcItCa0YLQviDQv9GA0LjQvdC+0YHQuNGCINCx0L7Qu9GM0YjQtSDQstGL0YDRg9GH0LrQuD9cIl0sXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgICBpZiAoaW50ZW50ID09PSBcInJldmVudWVfN2RcIikge1xyXG4gICAgICBpZiAoZmFjdHMucmV2ZW51ZTdkIDw9IDAgJiYgZmFjdHMucGF5bWVudHNDb3VudDdkID09PSAwKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGFuc3dlcjogXCLQl9CwINC/0L7RgdC70LXQtNC90LjQtSA3INC00L3QtdC5INCy0YvRgNGD0YfQutCwINGB0L7RgdGC0LDQstC40LvQsCAwINGB0YPQvCDigJQg0L3QtdGCINGD0YfRgtGR0L3QvdGL0YUg0L7Qv9C70LDRgiDQv9C+INGB0YfQtdGC0LDQvCDQt9CwINGN0YLQvtGCINC/0LXRgNC40L7QtC5cIixcclxuICAgICAgICAgIHN1Z2dlc3Rpb25zOiBbXCLQodC60L7Qu9GM0LrQviDQt9Cw0YDQsNCx0L7RgtCw0LvQuCDRgdC10LPQvtC00L3Rjz9cIiwgXCLQntCx0YnQsNGPINCy0YvRgNGD0YfQutCwINC30LAg0LLRgdGRINCy0YDQtdC80Y9cIl0sXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGFuc3dlcjogYNCX0LAg0L/QvtGB0LvQtdC00L3QuNC1IDcg0LTQvdC10Lkg0LLRi9GA0YPRh9C60LAg0YHQvtGB0YLQsNCy0LjQu9CwICR7Zm9ybWF0U3VtKGZhY3RzLnJldmVudWU3ZCl9LmAsXHJcbiAgICAgICAgc3VnZ2VzdGlvbnM6IFtcItCh0LrQvtC70YzQutC+INC30LDRgNCw0LHQvtGC0LDQu9C4INGB0LXQs9C+0LTQvdGPP1wiLCBcItCa0YLQviDQv9GA0LjQvdC+0YHQuNGCINCx0L7Qu9GM0YjQtSDQstGL0YDRg9GH0LrQuD9cIl0sXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgICBpZiAoaW50ZW50ID09PSBcInJldmVudWVfdG90YWxcIikge1xyXG4gICAgICBpZiAoZmFjdHMucmV2ZW51ZVRvdGFsIDw9IDApIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgYW5zd2VyOlxyXG4gICAgICAgICAgICBcItCe0LHRidCw0Y8g0LLRi9GA0YPRh9C60LAg0LfQsCDQstGB0ZEg0LLRgNC10LzRjzogMCDRgdGD0Lwg4oCUINCyIENSTSDQvdC10YIg0YPRh9GC0ZHQvdC90YvRhSDQvtC/0LvQsNGCINC/0L4g0YHRh9C10YLQsNC8INC40LvQuCDQtNCw0L3QvdGL0LUg0LXRidGRINC90LUg0LfQsNCz0YDRg9C20LXQvdGLLlwiLFxyXG4gICAgICAgICAgc3VnZ2VzdGlvbnM6IFtcItCh0LrQvtC70YzQutC+INC30LDRgNCw0LHQvtGC0LDQu9C4INGB0LXQs9C+0LTQvdGPP1wiLCBcItCa0LDQutCw0Y8g0LLRi9GA0YPRh9C60LAg0LfQsCDQvdC10LTQtdC70Y4/XCJdLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBhbnN3ZXI6IGDQntCx0YnQsNGPINCy0YvRgNGD0YfQutCwINC30LAg0LLRgdGRINCy0YDQtdC80Y86ICR7Zm9ybWF0U3VtKGZhY3RzLnJldmVudWVUb3RhbCl9LmAsXHJcbiAgICAgICAgc3VnZ2VzdGlvbnM6IFtcItCh0LrQvtC70YzQutC+INC30LDRgNCw0LHQvtGC0LDQu9C4INGB0LXQs9C+0LTQvdGPP1wiLCBcItCa0LDQutCw0Y8g0LLRi9GA0YPRh9C60LAg0LfQsCDQvdC10LTQtdC70Y4/XCJdLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgaWYgKGludGVudCA9PT0gXCJ1bnBhaWRfaW52b2ljZXNcIikge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGFuc3dlcjogYNCh0LXQudGH0LDRgSAke2ZhY3RzLnVucGFpZENvdW50fSDQvdC10L7Qv9C70LDRh9C10L3QvdGL0YUg0YHRh9C10YLQvtCyINC90LAg0YHRg9C80LzRgyAke2Zvcm1hdFN1bShmYWN0cy51bnBhaWRUb3RhbCl9LmAsXHJcbiAgICAgICAgYWN0aW9uOiB7IHR5cGU6IFwibmF2aWdhdGVcIiwgcGF5bG9hZDogeyB0bzogXCIvYmlsbGluZy9pbnZvaWNlc1wiIH0gfSxcclxuICAgICAgICBzdWdnZXN0aW9uczogW1wi0J/QtdGA0LXQudGC0Lgg0LIg0YHRh9C10YLQsFwiLCBcItCh0LrQvtC70YzQutC+INC30LDRgNCw0LHQvtGC0LDQu9C4INGB0LXQs9C+0LTQvdGPP1wiXSxcclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIGlmIChpbnRlbnQgPT09IFwidG9wX2RvY3RvclwiKSB7XHJcbiAgICAgIGlmICghZmFjdHMudG9wRG9jdG9yTmFtZSkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBhbnN3ZXI6XHJcbiAgICAgICAgICAgIFwi0J/QvtC60LAg0L3QtdC00L7RgdGC0LDRgtC+0YfQvdC+INC+0L/Qu9Cw0YIsINC/0YDQuNCy0Y/Qt9Cw0L3QvdGL0YUg0Log0LLRgNCw0YfQsNC8LCDRh9GC0L7QsdGLINC90LDQt9Cy0LDRgtGMINC70LjQtNC10YDQsC4g0JrQsNC6INGC0L7Qu9GM0LrQviDQvdCw0LrQvtC/0Y/RgtGB0Y8g0LTQsNC90L3Ri9C1LCDQutCw0YDRgtC40L3QsCDRgdGC0LDQvdC10YIg0Y/RgdC90LXQtS5cIixcclxuICAgICAgICAgIHN1Z2dlc3Rpb25zOiBbXCLQodC60L7Qu9GM0LrQviDQt9Cw0YDQsNCx0L7RgtCw0LvQuCDRgdC10LPQvtC00L3Rjz9cIiwgXCLQldGB0YLRjCDQu9C4INC/0YDQvtCx0LvQtdC80Ysg0LIg0LrQsNGB0YHQtT9cIl0sXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGFuc3dlcjogYNCR0L7Qu9GM0YjQtSDQstGB0LXQs9C+INCy0YvRgNGD0YfQutC4INC/0YDQuNC90L7RgdC40YIgJHtmYWN0cy50b3BEb2N0b3JOYW1lfSDigJQgJHtmb3JtYXRTdW0oZmFjdHMudG9wRG9jdG9yVG90YWwpfS5gLFxyXG4gICAgICAgIGFjdGlvbjogeyB0eXBlOiBcIm5hdmlnYXRlXCIsIHBheWxvYWQ6IHsgdG86IFwiL3JlcG9ydHNcIiB9IH0sXHJcbiAgICAgICAgc3VnZ2VzdGlvbnM6IFtcItCh0LrQvtC70YzQutC+INC30LDRgNCw0LHQvtGC0LDQu9C4INGB0LXQs9C+0LTQvdGPP1wiLCBcItCd0LDQudC00Lgg0L/QsNGG0LjQtdC90YLQsCBcIl0sXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgICBpZiAoaW50ZW50ID09PSBcInRvcF9zZXJ2aWNlXCIpIHtcclxuICAgICAgaWYgKCFmYWN0cy50b3BTZXJ2aWNlTmFtZSkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBhbnN3ZXI6IFwi0J/QvtC60LAg0LzQsNC70L4g0L7Qv9C70LDRgiDQv9C+INGD0YHQu9GD0LPQsNC8INC00LvRjyDRgdGA0LDQstC90LXQvdC40Y8uXCIsXHJcbiAgICAgICAgICBzdWdnZXN0aW9uczogW1wi0JrRgtC+INC/0YDQuNC90L7RgdC40YIg0LHQvtC70YzRiNC1INCy0YvRgNGD0YfQutC4P1wiLCBcItCh0LrQvtC70YzQutC+INC30LDRgNCw0LHQvtGC0LDQu9C4INGB0LXQs9C+0LTQvdGPP1wiXSxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgYW5zd2VyOiBg0J/QviDRgdGD0LzQvNC1INC+0L/Qu9Cw0YIg0LvQuNC00LjRgNGD0LXRgiDRg9GB0LvRg9Cz0LAgwqske2ZhY3RzLnRvcFNlcnZpY2VOYW1lfcK7ICgke2Zvcm1hdFN1bShmYWN0cy50b3BTZXJ2aWNlVG90YWwpfSkuYCxcclxuICAgICAgICBhY3Rpb246IHsgdHlwZTogXCJuYXZpZ2F0ZVwiLCBwYXlsb2FkOiB7IHRvOiBcIi9yZXBvcnRzXCIgfSB9LFxyXG4gICAgICAgIHN1Z2dlc3Rpb25zOiBbXCLQmtGC0L4g0L/RgNC40L3QvtGB0LjRgiDQsdC+0LvRjNGI0LUg0LLRi9GA0YPRh9C60Lg/XCIsIFwi0JXRgdGC0Ywg0LvQuCDQv9GA0L7QsdC70LXQvNGLINCyINC60LDRgdGB0LU/XCJdLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgaWYgKGludGVudCA9PT0gXCJzZXR1cF9zdGF0dXNcIikge1xyXG4gICAgICBjb25zdCByZWFkeSA9IGZhY3RzLmRvY3RvcnNDb3VudCA+IDAgJiYgZmFjdHMuc2VydmljZXNDb3VudCA+IDAgJiYgZmFjdHMuYXBwb2ludG1lbnRzQ291bnQgPiAwO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGFuc3dlcjogcmVhZHlcclxuICAgICAgICAgID8gXCJDUk0g0L3QsNGB0YLRgNC+0LXQvdCwINCx0LDQt9C+0LLQvjog0LXRgdGC0Ywg0LLRgNCw0YfQuCwg0YPRgdC70YPQs9C4INC4INC30LDQv9C40YHQuC5cIlxyXG4gICAgICAgICAgOiBg0J3Rg9C20L3QviDQvdCw0L/QvtC70L3QuNGC0Ywg0YHQv9GA0LDQstC+0YfQvdC40LrQuDog0LLRgNCw0YfQuCAke2ZhY3RzLmRvY3RvcnNDb3VudH0sINGD0YHQu9GD0LPQuCAke2ZhY3RzLnNlcnZpY2VzQ291bnR9LCDQt9Cw0L/QuNGB0LggJHtmYWN0cy5hcHBvaW50bWVudHNDb3VudH0uYCxcclxuICAgICAgICBhY3Rpb246IHsgdHlwZTogXCJuYXZpZ2F0ZVwiLCBwYXlsb2FkOiB7IHRvOiBcIi9kb2N0b3JzXCIgfSB9LFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgaWYgKGludGVudCA9PT0gXCJjYXNoaWVyX3N0YXR1c1wiKSB7XHJcbiAgICAgIGNvbnN0IGRlYnQgPVxyXG4gICAgICAgIGZhY3RzLnVucGFpZENvdW50ID4gMFxyXG4gICAgICAgICAgPyBgINCd0LXQvtC/0LvQsNGH0LXQvdC90YvRhSDRgdGH0LXRgtC+0LI6ICR7ZmFjdHMudW5wYWlkQ291bnR9INC90LAgJHtmb3JtYXRTdW0oZmFjdHMudW5wYWlkVG90YWwpfS5gXHJcbiAgICAgICAgICA6IFwiXCI7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgYW5zd2VyOiBmYWN0cy5jYXNoU2hpZnRPcGVuXHJcbiAgICAgICAgICA/IGDQmtCw0YHRgdC+0LLQsNGPINGB0LzQtdC90LAg0L7RgtC60YDRi9GC0LAuJHtkZWJ0fWBcclxuICAgICAgICAgIDogYNCa0LDRgdGB0L7QstCw0Y8g0YHQvNC10L3QsCDQt9Cw0LrRgNGL0YLQsC4ke2RlYnR9YCxcclxuICAgICAgICBhY3Rpb246IHsgdHlwZTogXCJuYXZpZ2F0ZVwiLCBwYXlsb2FkOiB7IHRvOiBcIi9iaWxsaW5nL2Nhc2gtZGVza1wiIH0gfSxcclxuICAgICAgICBzdWdnZXN0aW9uczogW1wi0KHQutC+0LvRjNC60L4g0LfQsNGA0LDQsdC+0YLQsNC70Lgg0YHQtdCz0L7QtNC90Y8/XCIsIFwi0JrRgtC+INC/0YDQuNC90L7RgdC40YIg0LHQvtC70YzRiNC1INCy0YvRgNGD0YfQutC4P1wiXSxcclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIGlmIChpbnRlbnQgPT09IFwicGF0aWVudF9zZWFyY2hcIikge1xyXG4gICAgICByZXR1cm4gdGhpcy5hbnN3ZXJQYXRpZW50U2VhcmNoKG1lc3NhZ2UpO1xyXG4gICAgfVxyXG4gICAgaWYgKGludGVudCA9PT0gXCJidXNpbmVzc19hZHZpY2VcIikge1xyXG4gICAgICBpZiAoZmFjdHMuYXZnQ2hlY2s3ZCA+IDAgJiYgZmFjdHMuYXZnQ2hlY2tUb2RheSA+IDAgJiYgZmFjdHMuYXZnQ2hlY2tUb2RheSA8IGZhY3RzLmF2Z0NoZWNrN2QgKiAwLjkpIHtcclxuICAgICAgICBjb25zdCBwY3QgPSBNYXRoLnJvdW5kKCgxIC0gZmFjdHMuYXZnQ2hlY2tUb2RheSAvIGZhY3RzLmF2Z0NoZWNrN2QpICogMTAwKTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgYW5zd2VyOiBg0KHRgNC10LTQvdC40Lkg0YfQtdC6INGB0LXQs9C+0LTQvdGPINC90LjQttC1INGB0YDQtdC00L3QtdCz0L4g0LfQsCA3INC00L3QtdC5INC/0YDQuNC80LXRgNC90L4g0L3QsCAke3BjdH0lIOKAlCDQtNC+0LHQsNCy0YzRgtC1INGB0L7Qv9GD0YLRgdGC0LLRg9GO0YnQuNC1INGD0YHQu9GD0LPQuCDQuCDQv9Cw0LrQtdGC0Ysg0L/QvtGB0LvQtSDQutC+0L3RgdGD0LvRjNGC0LDRhtC40LguYCxcclxuICAgICAgICAgIHN1Z2dlc3Rpb25zOiBbXCLQodC60L7Qu9GM0LrQviDQt9Cw0YDQsNCx0L7RgtCw0LvQuCDRgdC10LPQvtC00L3Rjz9cIiwgXCLQmtGC0L4g0L/RgNC40L3QvtGB0LjRgiDQsdC+0LvRjNGI0LUg0LLRi9GA0YPRh9C60Lg/XCJdLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGZhY3RzLnNlcnZpY2VzQ291bnQgPCAzKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGFuc3dlcjogXCLQkiDRgdC/0YDQsNCy0L7Rh9C90LjQutC1INC80LDQu9C+INGD0YHQu9GD0LMg4oCUINGA0LDRgdGI0LjRgNGM0YLQtSDQv9GA0LDQudGBINC00LvRjyDQsNC/0YHQtdC50LvQsCDQuCDQutGA0L7RgdGBLdC/0YDQvtC00LDQti5cIixcclxuICAgICAgICAgIHN1Z2dlc3Rpb25zOiBbXCLQodC60L7Qu9GM0LrQviDQt9Cw0YDQsNCx0L7RgtCw0LvQuCDRgdC10LPQvtC00L3Rjz9cIiwgXCLQldGB0YLRjCDQu9C4INC/0YDQvtCx0LvQtdC80Ysg0LIg0LrQsNGB0YHQtT9cIl0sXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoZmFjdHMudW5wYWlkQ291bnQgPiAwKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGFuc3dlcjogYNCh0L7QutGA0LDRgtC40YLQtSDQt9Cw0LTQvtC70LbQtdC90L3QvtGB0YLRjCDQv9C+ICR7ZmFjdHMudW5wYWlkQ291bnR9INGB0YfQtdGC0LDQvCDigJQg0Y3RgtC+INGD0LvRg9GH0YjQuNGCIGNhc2hmbG93LmAsXHJcbiAgICAgICAgICBzdWdnZXN0aW9uczogW1wi0JXRgdGC0Ywg0LvQuCDQv9GA0L7QsdC70LXQvNGLINCyINC60LDRgdGB0LU/XCIsIFwi0KHQutC+0LvRjNC60L4g0LfQsNGA0LDQsdC+0YLQsNC70Lgg0YHQtdCz0L7QtNC90Y8/XCJdLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBhbnN3ZXI6IGDQodGA0LXQtNC90LjQuSDRh9C10Log0YHQtdCz0L7QtNC90Y8gJHtmb3JtYXRTdW0oZmFjdHMuYXZnQ2hlY2tUb2RheSl9LCDQt9CwIDcg0LTQvdC10LkgJHtmb3JtYXRTdW0oZmFjdHMuYXZnQ2hlY2s3ZCl9LiDQlNC+0LHQsNCy0YzRgtC1INC/0LDQutC10YLRiyDQuCDQutC+0L3RgtGA0L7Qu9GMINC/0L7QstGC0L7RgNC90YvRhSDQstC40LfQuNGC0L7Qsi5gLFxyXG4gICAgICAgIHN1Z2dlc3Rpb25zOiBbXCLQodC60L7Qu9GM0LrQviDQt9Cw0YDQsNCx0L7RgtCw0LvQuCDRgdC10LPQvtC00L3Rjz9cIiwgXCLQmtGC0L4g0L/RgNC40L3QvtGB0LjRgiDQsdC+0LvRjNGI0LUg0LLRi9GA0YPRh9C60Lg/XCJdLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgaWYgKGludGVudCA9PT0gXCJoZWxwX25hdmlnYXRpb25cIikge1xyXG4gICAgICBpZiAodGV4dC5pbmNsdWRlcyhcItC60LDRgdGBXCIpKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGFuc3dlcjogXCLQmtCw0YHRgdCwOiDQkdC40LvQu9C40L3QsyDihpIg0JrQsNGB0YHQsC5cIixcclxuICAgICAgICAgIGFjdGlvbjogeyB0eXBlOiBcIm5hdmlnYXRlXCIsIHBheWxvYWQ6IHsgdG86IFwiL2JpbGxpbmcvY2FzaC1kZXNrXCIgfSB9LFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHRleHQuaW5jbHVkZXMoXCLRgdGH0LXRglwiKSkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBhbnN3ZXI6IFwi0KHRh9C10YLQsDog0JHQuNC70LvQuNC90LMg4oaSINCh0YfQtdGC0LAuXCIsXHJcbiAgICAgICAgICBhY3Rpb246IHsgdHlwZTogXCJuYXZpZ2F0ZVwiLCBwYXlsb2FkOiB7IHRvOiBcIi9iaWxsaW5nL2ludm9pY2VzXCIgfSB9LFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHRleHQuaW5jbHVkZXMoXCLQt9Cw0L/QuNGBXCIpKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGFuc3dlcjogXCLQl9Cw0L/QuNGB0Lgg4oCUINGA0LDQt9C00LXQuyDCq9CX0LDQv9C40YHQuMK7LlwiLFxyXG4gICAgICAgICAgYWN0aW9uOiB7IHR5cGU6IFwib3Blbl9xdWlja19jcmVhdGVfYXBwb2ludG1lbnRcIiB9LFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHsgYW5zd2VyOiBcItCc0L7Qs9GDINC/0L7QtNGB0LrQsNC30LDRgtGMINC/0YPRgtGMINC6INC60LDRgdGB0LUsINGB0YfQtdGC0LDQvCwg0LfQsNC/0LjRgdGP0Lwg0Lgg0L7RgtGH0ZHRgtCw0LwuXCIgfTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIltBSSBSVUxFIEVOR0lORV0gYW5zd2VyQXNrUXVpY2tcIiwgZXJyb3IpO1xyXG4gICAgICByZXR1cm4geyBhbnN3ZXI6IFwi0J3QtSDRg9C00LDQu9C+0YHRjCDQv9C+0LvRg9GH0LjRgtGMINC00LDQvdC90YvQtSBDUk1cIiwgc3VnZ2VzdGlvbnM6IFtdIH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIGFuc3dlclBhdGllbnRTZWFyY2gobWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTxBSUFzc2lzdGFudEFza1Jlc3BvbnNlPiB7XHJcbiAgICB0cnkge1xyXG4gICAgY29uc3QgcmF3ID0gbWVzc2FnZS50cmltKCk7XHJcbiAgICBsZXQgcSA9XHJcbiAgICAgIC9e0L3QsNC50LTQuFxccysoPzrQv9Cw0YbQuNC10L3RgtCwXFxzKyk/KC4rKS9pLmV4ZWMocmF3KT8uWzFdPy50cmltKCkgPz9cclxuICAgICAgL17Qv9C+0LrQsNC20LhcXHMrKD860L/QsNGG0LjQtdC90YLQsFxccyspPyguKykvaS5leGVjKHJhdyk/LlsxXT8udHJpbSgpID8/XHJcbiAgICAgIFwiXCI7XHJcbiAgICBpZiAoIXEpIHtcclxuICAgICAgcmV0dXJuIHsgYW5zd2VyOiBcItCj0YLQvtGH0L3QuNGC0LUg0LfQsNC/0YDQvtGBLCDQvdCw0L/RgNC40LzQtdGAOiDQndCw0LnQtNC4INC/0LDRhtC40LXQvdGC0LAg0JjQstCw0L0g0LjQu9C4INC/0L4g0YLQtdC70LXRhNC+0L3Rgy5cIiB9O1xyXG4gICAgfVxyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgIGNvbnNvbGUubG9nKFwiW0FJXSBwYXRpZW50X3NlYXJjaCBxdWVyeVwiLCBxKTtcclxuXHJcbiAgICBpZiAoZW52LmRhdGFQcm92aWRlciA9PT0gXCJwb3N0Z3Jlc1wiKSB7XHJcbiAgICAgIGNvbnN0IHBhdHRlcm4gPSB3cmFwSWxpa2UocSk7XHJcbiAgICAgIGNvbnN0IGRpZ2l0cyA9IHEucmVwbGFjZSgvXFxEL2csIFwiXCIpO1xyXG4gICAgICBjb25zdCBpZE9ubHkgPSAvXlxcZCskLy50ZXN0KHEpID8gcSA6IG51bGw7XHJcbiAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCBkYlBvb2wucXVlcnk8eyBpZDogc3RyaW5nOyBmdWxsX25hbWU6IHN0cmluZzsgcGhvbmU6IHN0cmluZyB8IG51bGwgfT4oXHJcbiAgICAgICAgYFxyXG4gICAgICAgIFNFTEVDVCBpZDo6dGV4dCwgZnVsbF9uYW1lLCBwaG9uZVxyXG4gICAgICAgIEZST00gcGF0aWVudHNcclxuICAgICAgICBXSEVSRSBkZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgIEFORCAoXHJcbiAgICAgICAgICAgIGZ1bGxfbmFtZSBJTElLRSAkMSBFU0NBUEUgJ1xcXFwnXHJcbiAgICAgICAgICAgIE9SIHBob25lIElMSUtFICQxIEVTQ0FQRSAnXFxcXCdcclxuICAgICAgICAgICAgT1IgKCQzOjp0ZXh0IDw+ICcnIEFORCByZWdleHBfcmVwbGFjZShDT0FMRVNDRShwaG9uZSwgJycpLCAnW14wLTldJywgJycsICdnJykgTElLRSAnJScgfHwgJDMgfHwgJyUnKVxyXG4gICAgICAgICAgICBPUiAoJDI6OnRleHQgSVMgTk9UIE5VTEwgQU5EIGlkOjp0ZXh0ID0gJDIpXHJcbiAgICAgICAgICApXHJcbiAgICAgICAgT1JERVIgQlkgY3JlYXRlZF9hdCBERVNDXHJcbiAgICAgICAgTElNSVQgOFxyXG4gICAgICAgIGAsXHJcbiAgICAgICAgW3BhdHRlcm4sIGlkT25seSwgZGlnaXRzLmxlbmd0aCA+PSAzID8gZGlnaXRzIDogXCJcIl1cclxuICAgICAgKTtcclxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgICAgY29uc29sZS5sb2coXCJbQUldIHBhdGllbnRfc2VhcmNoIHJvd3MgY291bnRcIiwgcm93cy5yb3dzLmxlbmd0aCk7XHJcbiAgICAgIGlmIChyb3dzLnJvd3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgcmV0dXJuIHsgYW5zd2VyOiBcItCf0LDRhtC40LXQvdGCINC90LUg0L3QsNC50LTQtdC9LlwiIH07XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgbGlzdCA9IHJvd3Mucm93c1xyXG4gICAgICAgIC5tYXAoKHIpID0+IGAke3IuZnVsbF9uYW1lfSR7ci5waG9uZSA/IGAsICR7ci5waG9uZX1gIDogXCJcIn1gKVxyXG4gICAgICAgIC5qb2luKFwiOyBcIik7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgYW5zd2VyOlxyXG4gICAgICAgICAgcm93cy5yb3dzLmxlbmd0aCA9PT0gMVxyXG4gICAgICAgICAgICA/IGDQndCw0LnQtNC10L06ICR7bGlzdH0uYFxyXG4gICAgICAgICAgICA6IGDQndCw0LnQtNC10L3QviAoJHtyb3dzLnJvd3MubGVuZ3RofSk6ICR7bGlzdH0uYCxcclxuICAgICAgICBhY3Rpb246IHsgdHlwZTogXCJuYXZpZ2F0ZVwiLCBwYXlsb2FkOiB7IHRvOiBcIi9wYXRpZW50c1wiIH0gfSxcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmb3VuZCA9IGdldE1vY2tEYigpLnBhdGllbnRzLmZpbHRlcigocCkgPT4ge1xyXG4gICAgICBjb25zdCBuYW1lID0gcC5mdWxsTmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEudG9Mb3dlckNhc2UoKSk7XHJcbiAgICAgIGNvbnN0IHBob25lID0gcC5waG9uZT8uaW5jbHVkZXMocSkgPz8gZmFsc2U7XHJcbiAgICAgIHJldHVybiBuYW1lIHx8IHBob25lO1xyXG4gICAgfSk7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5sb2coXCJbQUldIHBhdGllbnRfc2VhcmNoIHJvd3MgY291bnRcIiwgZm91bmQubGVuZ3RoKTtcclxuICAgIGlmIChmb3VuZC5sZW5ndGggPT09IDApIHJldHVybiB7IGFuc3dlcjogXCLQn9Cw0YbQuNC10L3RgiDQvdC1INC90LDQudC00LXQvS5cIiB9O1xyXG4gICAgY29uc3QgbGlzdCA9IGZvdW5kXHJcbiAgICAgIC5zbGljZSgwLCA4KVxyXG4gICAgICAubWFwKChwKSA9PiBgJHtwLmZ1bGxOYW1lfSR7cC5waG9uZSA/IGAsICR7cC5waG9uZX1gIDogXCJcIn1gKVxyXG4gICAgICAuam9pbihcIjsgXCIpO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgYW5zd2VyOiBmb3VuZC5sZW5ndGggPT09IDEgPyBg0J3QsNC50LTQtdC9OiAke2xpc3R9LmAgOiBg0J3QsNC50LTQtdC90L4gKCR7Zm91bmQubGVuZ3RofSk6ICR7bGlzdH0uYCxcclxuICAgICAgYWN0aW9uOiB7IHR5cGU6IFwibmF2aWdhdGVcIiwgcGF5bG9hZDogeyB0bzogXCIvcGF0aWVudHNcIiB9IH0sXHJcbiAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIltBSSBSVUxFIEVOR0lORV0gYW5zd2VyUGF0aWVudFNlYXJjaFwiLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiB7IGFuc3dlcjogXCLQndC1INGD0LTQsNC70L7RgdGMINC/0L7Qu9GD0YfQuNGC0Ywg0LTQsNC90L3Ri9C1IENSTVwiLCBzdWdnZXN0aW9uczogW10gfTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIl19