/**
 * In-memory LRU Response Cache — deduplicates identical non-streaming requests.
 * No external deps (no Redis, no disk persistence).
 */
import crypto from 'crypto';
import { getConfig } from './config.js';

class LRUCache {
    constructor({ maxSize = 100, ttlMs = 300000 } = {}) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this._map = new Map(); // key -> { value, timestamp }
        this._hits = 0;
        this._misses = 0;
    }

    get(key) {
        const entry = this._map.get(key);
        if (!entry) {
            this._misses++;
            return null;
        }
        // Check TTL
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this._map.delete(key);
            this._misses++;
            return null;
        }
        // Move to end (most recently used)
        this._map.delete(key);
        this._map.set(key, entry);
        this._hits++;
        return entry.value;
    }

    set(key, value) {
        // Delete first to reset position
        if (this._map.has(key)) this._map.delete(key);
        // Evict LRU if at capacity
        if (this._map.size >= this.maxSize) {
            const firstKey = this._map.keys().next().value;
            this._map.delete(firstKey);
        }
        this._map.set(key, { value, timestamp: Date.now() });
    }

    stats() {
        const total = this._hits + this._misses;
        return {
            size: this._map.size,
            hits: this._hits,
            misses: this._misses,
            hitRate: total > 0 ? (this._hits / total) : 0
        };
    }

    clear() {
        this._map.clear();
        this._hits = 0;
        this._misses = 0;
    }
}

// Singleton instance — reconfigured on first use
let _cache = null;

function getCache() {
    if (!_cache) {
        const cfg = getConfig();
        _cache = new LRUCache({
            maxSize: cfg.CACHE_MAX_SIZE || 100,
            ttlMs: cfg.CACHE_TTL_MS || 300000
        });
    }
    return _cache;
}

/**
 * Compute SHA-256 cache key from request body.
 * Only hashes model + messages (ignores stream, temperature, etc. for dedup).
 */
export function computeCacheKey(body) {
    const payload = JSON.stringify({ model: body.model, messages: body.messages });
    return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Check cache for a matching response.
 * Streaming requests are skipped entirely.
 * @returns {{ hit: boolean, key: string|null, cachedResponse: object|null }}
 */
export function applyResponseCache(body) {
    // Skip streaming requests
    if (body.stream !== false) {
        return { hit: false, key: null, cachedResponse: null };
    }

    const key = computeCacheKey(body);
    const cache = getCache();
    const cached = cache.get(key);

    if (cached) {
        console.log(`[cache] HIT ${body.model} key=${key.slice(0, 8)}...`);
        return { hit: true, key, cachedResponse: cached };
    }

    console.log(`[cache] MISS ${body.model} key=${key.slice(0, 8)}...`);
    return { hit: false, key, cachedResponse: null };
}

/**
 * Store a successful response in cache.
 */
export function storeResponseCache(key, responseJson) {
    if (!key || !responseJson) return;
    // Don't cache error responses
    if (responseJson.error) return;
    const cache = getCache();
    cache.set(key, responseJson);
}

/**
 * Get cache stats for dashboard.
 */
export function getCacheStats() {
    return getCache().stats();
}

/**
 * Clear the cache (e.g. when settings change).
 */
export function clearResponseCache() {
    if (_cache) _cache.clear();
}
