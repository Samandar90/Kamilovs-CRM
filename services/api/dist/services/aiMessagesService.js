"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiMessagesService = exports.AiMessagesService = void 0;
const node_crypto_1 = require("node:crypto");
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const mockByUser = new Map();
const toIso = (v) => v instanceof Date ? v.toISOString() : new Date(v).toISOString();
class AiMessagesService {
    async append(userId, role, content) {
        const text = String(content ?? "").trim();
        if (!text)
            return;
        if (env_1.env.dataProvider === "postgres") {
            await database_1.dbPool.query(`INSERT INTO ai_messages (user_id, role, content) VALUES ($1, $2, $3)`, [
                userId,
                role,
                text,
            ]);
            return;
        }
        const list = mockByUser.get(userId) ?? [];
        list.push({
            id: (0, node_crypto_1.randomUUID)(),
            role,
            content: text,
            createdAt: new Date().toISOString(),
        });
        mockByUser.set(userId, list);
    }
    /**
     * Последние N сообщений пользователя в хронологическом порядке (старые → новые).
     * Вызывать до append текущей реплики, чтобы не дублировать её в истории для LLM.
     */
    async listLastNByUserId(userId, limit) {
        const n = Math.max(0, Math.min(50, Math.floor(limit)));
        if (n === 0)
            return [];
        if (env_1.env.dataProvider === "postgres") {
            const res = await database_1.dbPool.query(`SELECT role, content
         FROM ai_messages
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`, [userId, n]);
            return res.rows
                .reverse()
                .map((r) => ({
                role: r.role,
                content: String(r.content ?? ""),
            }))
                .filter((m) => m.content.trim().length > 0);
        }
        const all = [...(mockByUser.get(userId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return all.slice(-n).map((m) => ({ role: m.role, content: m.content }));
    }
    async listByUserId(userId) {
        if (env_1.env.dataProvider === "postgres") {
            const res = await database_1.dbPool.query(`SELECT id::text AS id, role, content, created_at
         FROM ai_messages
         WHERE user_id = $1
         ORDER BY created_at ASC`, [userId]);
            return res.rows.map((r) => ({
                id: r.id,
                role: r.role,
                content: r.content,
                createdAt: toIso(r.created_at),
            }));
        }
        return [...(mockByUser.get(userId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    async clearByUserId(userId) {
        if (env_1.env.dataProvider === "postgres") {
            await database_1.dbPool.query(`DELETE FROM ai_messages WHERE user_id = $1`, [userId]);
            return;
        }
        mockByUser.delete(userId);
    }
}
exports.AiMessagesService = AiMessagesService;
exports.aiMessagesService = new AiMessagesService();
