import { randomUUID } from "node:crypto";
import { dbPool } from "../config/database";
import { env } from "../config/env";

export type AiMessageRole = "user" | "assistant";

export type AiMessagePublic = {
  id: string;
  role: AiMessageRole;
  content: string;
  createdAt: string;
};

/** Последние реплики для OpenAI (без id/дат). */
export type AiChatHistoryTurn = {
  role: AiMessageRole;
  content: string;
};

type Row = {
  id: string;
  role: string;
  content: string;
  created_at: Date | string;
};

const mockByUser = new Map<number, AiMessagePublic[]>();

const toIso = (v: Date | string): string =>
  v instanceof Date ? v.toISOString() : new Date(v).toISOString();

export class AiMessagesService {
  async append(userId: number, role: AiMessageRole, content: string): Promise<void> {
    const text = String(content ?? "").trim();
    if (!text) return;

    if (env.dataProvider === "postgres") {
      await dbPool.query(`INSERT INTO ai_messages (user_id, role, content) VALUES ($1, $2, $3)`, [
        userId,
        role,
        text,
      ]);
      return;
    }

    const list = mockByUser.get(userId) ?? [];
    list.push({
      id: randomUUID(),
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
  async listLastNByUserId(userId: number, limit: number): Promise<AiChatHistoryTurn[]> {
    const n = Math.max(0, Math.min(50, Math.floor(limit)));
    if (n === 0) return [];

    if (env.dataProvider === "postgres") {
      const res = await dbPool.query<{ role: string; content: string }>(
        `SELECT role, content
         FROM ai_messages
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, n]
      );
      return res.rows
        .reverse()
        .map((r) => ({
          role: r.role as AiMessageRole,
          content: String(r.content ?? ""),
        }))
        .filter((m) => m.content.trim().length > 0);
    }

    const all = [...(mockByUser.get(userId) ?? [])].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    return all.slice(-n).map((m) => ({ role: m.role, content: m.content }));
  }

  async listByUserId(userId: number): Promise<AiMessagePublic[]> {
    if (env.dataProvider === "postgres") {
      const res = await dbPool.query<Row>(
        `SELECT id::text AS id, role, content, created_at
         FROM ai_messages
         WHERE user_id = $1
         ORDER BY created_at ASC`,
        [userId]
      );
      return res.rows.map((r) => ({
        id: r.id,
        role: r.role as AiMessageRole,
        content: r.content,
        createdAt: toIso(r.created_at),
      }));
    }
    return [...(mockByUser.get(userId) ?? [])].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
  }

  async clearByUserId(userId: number): Promise<void> {
    if (env.dataProvider === "postgres") {
      await dbPool.query(`DELETE FROM ai_messages WHERE user_id = $1`, [userId]);
      return;
    }
    mockByUser.delete(userId);
  }
}

export const aiMessagesService = new AiMessagesService();
