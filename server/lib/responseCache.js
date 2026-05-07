/**
 * In-memory LRU response cache for identical non-streaming chat requests.
 */
import crypto from 'crypto';
import { getConfig } from './config.js';

export class ResponseCache {
    constructor({ maxSize = 100, ttlMs = 300000 } = {}) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.entries = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    get(key) {
        if (!key || !this.entries.has(key)) {
            this.misses += 1;
            return null;
        }

        const entry = this.entries.get(key);
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.entries.delete(key);
            this.misses += 1;
            return null;
        }

        this.entries.delete(key);
        this.entries.set(key, entry);
        this.hits += 1;
        return entry.value;
    }

    set(key, value) {
        if (!key) return;
        if (this.maxSize < 1) return;

        if (this.entries.has(key)) this.entries.delete(key);

        while (this.entries.size >= this.maxSize) {
            const oldestKey = this.entries.keys().next().value;
            this.entries.delete(oldestKey);
        }

        this.entries.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    stats() {
        const total = this.hits + this.misses;
        return {
            size: this.entries.size,
            hits: this.hits,
            misses: this.misses,
            hitRate: total ? this.hits / total : 0
        };
    }

    clear() {
        this.entries.clear();
        this.hits = 0;
        this.misses = 0;
    }
}

export function computeCacheKey(body) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify({ model: body?.model, messages: body?.messages }))
        .digest('hex');
}

let _cache = null;

export function getResponseCache() {
    if (!_cache) {
        const cfg = getConfig();
        _cache = new ResponseCache({
            maxSize: cfg.CACHE_MAX_SIZE || 100,
            ttlMs: cfg.CACHE_TTL_MS || 300000
        });
    }
    return _cache;
}

export const responseCache = new Proxy({}, {
    get(_target, prop) {
        const cache = getResponseCache();
        const value = cache[prop];
        return typeof value === 'function' ? value.bind(cache) : value;
    }
});

export function applyResponseCache(body) {
    if (!body || body.stream !== false) return { hit: false, key: null };

    const key = computeCacheKey(body);
    const cachedResponse = getResponseCache().get(key);
    if (cachedResponse !== null) return { hit: true, key, cachedResponse };

    return { hit: false, key };
}

export function storeResponseCache(key, responseJson) {
    if (responseJson?.error) return;
    getResponseCache().set(key, responseJson);
}
