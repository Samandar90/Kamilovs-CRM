"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiDebugController = exports.aiSummaryController = exports.aiAskController = void 0;
const aiFactBuilderService_1 = require("../ai/aiFactBuilderService");
const database_1 = require("../config/database");
const container_1 = require("../container");
const errorHandler_1 = require("../middleware/errorHandler");
const requestAuth_1 = require("../utils/requestAuth");
const FALLBACK_CRM = "Не удалось получить данные CRM";
function parseChatHistory(body) {
    if (!body || typeof body !== "object" || !("history" in body))
        return [];
    const h = body.history;
    if (!Array.isArray(h))
        return [];
    const out = [];
    for (const item of h) {
        if (!item || typeof item !== "object")
            continue;
        const role = item.role;
        const content = item.content;
        if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
            out.push({ role, content: content.trim() });
        }
    }
    return out.slice(-24);
}
const aiAskController = async (req, res) => {
    try {
        const auth = (0, requestAuth_1.getAuthPayload)(req);
        const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
        const history = parseChatHistory(req.body);
        console.log("[AI] ask intent", JSON.stringify({ message: message.slice(0, 200), historyLen: history.length }));
        if (!message) {
            return res.status(400).json({
                answer: "Пустой запрос",
                suggestions: [],
            });
        }
        const result = await container_1.services.aiAssistant.handle(auth, message, history);
        const payload = {
            answer: result.answer,
            suggestions: result.suggestions ?? [],
            ...(result.action ? { action: result.action } : {}),
        };
        console.log("[AI] ask success", JSON.stringify({ answerLen: payload.answer.length, suggestions: payload.suggestions.length }));
        return res.status(200).json(payload);
    }
    catch (error) {
        if (error instanceof errorHandler_1.ApiError && error.status === 401) {
            throw error;
        }
        console.error("[AI] ask controller error (real)", error);
        return res.status(200).json({
            answer: FALLBACK_CRM,
            suggestions: [],
        });
    }
};
exports.aiAskController = aiAskController;
const aiSummaryController = async (req, res) => {
    try {
        const auth = (0, requestAuth_1.getAuthPayload)(req);
        console.log("[AI] summary start");
        const result = await container_1.services.aiAssistant.getSummary(auth);
        console.log("[AI] summary ok", JSON.stringify({ cards: result.cards?.length ?? 0 }));
        console.log("[AI] summary cards keys", JSON.stringify({ cardKeys: result.cards?.map((c) => c.key) }));
        return res.status(200).json(result);
    }
    catch (error) {
        if (error instanceof errorHandler_1.ApiError && error.status === 401) {
            throw error;
        }
        console.error("[AI] summary controller error (real)", error);
        return res.status(200).json({
            summaryText: FALLBACK_CRM,
            recommendationText: "Попробуйте обновить страницу.",
            cards: [],
        });
    }
};
exports.aiSummaryController = aiSummaryController;
const aiDebugController = async (_req, res) => {
    try {
        const builder = new aiFactBuilderService_1.AiFactBuilderService();
        const snapshot = await builder.getClinicSnapshot();
        const [paymentsCount, invoicesCount, appointmentsCount, paymentsRows] = await Promise.all([
            database_1.dbPool.query("SELECT COUNT(*)::text AS c FROM payments"),
            database_1.dbPool.query("SELECT COUNT(*)::text AS c FROM invoices"),
            database_1.dbPool.query("SELECT COUNT(*)::text AS c FROM appointments"),
            database_1.dbPool.query(`SELECT id::text, invoice_id::text, amount::text, COALESCE(refunded_amount, 0)::text AS refunded_amount, created_at::text
         FROM payments
         ORDER BY created_at DESC
         LIMIT 5`),
        ]);
        return res.status(200).json({
            revenueToday: snapshot.revenueToday,
            paymentsCount: Number(paymentsCount.rows[0]?.c ?? 0),
            invoicesCount: Number(invoicesCount.rows[0]?.c ?? 0),
            appointmentsCount: Number(appointmentsCount.rows[0]?.c ?? 0),
            paymentsRows: paymentsRows.rows,
        });
    }
    catch (error) {
        console.error("[AI DEBUG ERROR FULL]", error);
        return res.status(500).json({
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.aiDebugController = aiDebugController;
