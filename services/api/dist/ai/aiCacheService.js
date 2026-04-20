"use strict";
/** In-memory TTL cache для фактов и коротких LLM-ответов (production: заменить на Redis при масштабе). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sharedAiCache = exports.AI_FACTS_CACHE_KEY = exports.AiCacheService = void 0;
exports.invalidateClinicFactsCache = invalidateClinicFactsCache;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
class AiCacheService {
    constructor() {
        this.store = new Map();
    }
    get(key) {
        const e = this.store.get(key);
        if (!e)
            return undefined;
        if (Date.now() > e.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return e.value;
    }
    set(key, value, ttlMs = DEFAULT_TTL_MS) {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    delete(key) {
        this.store.delete(key);
    }
}
exports.AiCacheService = AiCacheService;
exports.AI_FACTS_CACHE_KEY = "ai:v1:clinic_facts";
/** Один экземпляр на процесс — инвалидация из сервисов оплат/счетов/записей. */
exports.sharedAiCache = new AiCacheService();
function invalidateClinicFactsCache() {
    exports.sharedAiCache.delete(exports.AI_FACTS_CACHE_KEY);
}
