/** In-memory TTL cache для фактов и коротких LLM-ответов (production: заменить на Redis при масштабе). */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

type Entry = { value: unknown; expiresAt: number };

export class AiCacheService {
  private readonly store = new Map<string, Entry>();

  get<T>(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return e.value as T;
  }

  set(key: string, value: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

export const AI_FACTS_CACHE_KEY = "ai:v1:clinic_facts";

/** Один экземпляр на процесс — инвалидация из сервисов оплат/счетов/записей. */
export const sharedAiCache = new AiCacheService();

export function invalidateClinicFactsCache(): void {
  sharedAiCache.delete(AI_FACTS_CACHE_KEY);
}
