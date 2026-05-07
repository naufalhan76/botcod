/**
 * Key pool: load codebuddy_keys.txt, expose status, pick next available key,
 * and mark cooldown / dead based on upstream feedback.
 */
import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { getConfig } from './config.js';
import { getState, upsertKeyState, pruneMissingKeys, getKeyState } from './state.js';

let _entries = []; // [{ email, key }]
let _watcher = null;

function parseKeysFile(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
    const out = [];
    for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const email = line.slice(0, idx).trim();
        const key = line.slice(idx + 1).trim();
        if (key.startsWith('ck_')) out.push({ email, key });
    }
    return out;
}

export function reloadKeys() {
    const cfg = getConfig();
    _entries = parseKeysFile(cfg.KEYS_FILE);
    pruneMissingKeys(_entries.map(e => e.key));
    return _entries.length;
}

export function startWatcher() {
    if (_watcher) return;
    const cfg = getConfig();
    const file = cfg.KEYS_FILE;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    _watcher = chokidar.watch(file, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 300 } });
    _watcher.on('add', () => reloadKeys());
    _watcher.on('change', () => reloadKeys());
    _watcher.on('unlink', () => { _entries = []; });
}

function effectiveStatus(entry, now = Date.now()) {
    const s = getKeyState(entry.key) || { status: 'active', cooldown_until: 0 };
    if (s.status === 'cooldown' && s.cooldown_until && now >= s.cooldown_until) {
        upsertKeyState(entry.key, { status: 'active', cooldown_until: 0 });
        return 'active';
    }
    return s.status || 'active';
}

function creditStatus(s = {}, status = 'active') {
    const err = String(s.last_error || '').toLowerCase();
    if (err.includes('quota') || err.includes('insufficient') || err.includes('credit')) return 'empty';
    if (status === 'dead') return 'empty';
    if (status === 'cooldown') return 'limited';
    if ((s.usage_count || 0) > 0 || s.last_used_at) return 'available';
    return 'unknown';
}

export function listPool() {
    const cfg = getConfig();
    const now = Date.now();
    return _entries.map(e => {
        const s = getKeyState(e.key) || {};
        const status = effectiveStatus(e, now);
        return {
            email: e.email,
            key_masked: `${e.key.slice(0, 8)}…${e.key.slice(-6)}`,
            status,
            credit_status: creditStatus(s, status),
            credit_remaining: null,
            last_used_at: s.last_used_at || 0,
            cooldown_until: s.cooldown_until || 0,
            usage_count: s.usage_count || 0,
            error_count: s.error_count || 0,
            last_error: s.last_error || null
        };
    });
}

export function summary() {
    const pool = listPool();
    const counts = { active: 0, cooldown: 0, dead: 0, total: pool.length };
    for (const p of pool) counts[p.status] = (counts[p.status] || 0) + 1;
    return counts;
}

/**
 * Pick the next active key. Prefers keys with the oldest last_used_at,
 * excluding any key in `excludeKeys` (for retry within same request).
 */
export function pickNext(excludeKeys = []) {
    const now = Date.now();
    const candidates = [];
    for (const e of _entries) {
        if (excludeKeys.includes(e.key)) continue;
        const status = effectiveStatus(e, now);
        if (status !== 'active') continue;
        const s = getKeyState(e.key) || {};
        candidates.push({ entry: e, last_used_at: s.last_used_at || 0 });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.last_used_at - b.last_used_at);
    return candidates[0].entry;
}

export function markUsed(key) {
    const s = getKeyState(key) || {};
    upsertKeyState(key, {
        status: 'active',
        last_used_at: Date.now(),
        usage_count: (s.usage_count || 0) + 1
    });
}

export function markCooldown(key, reason = 'rate_limit') {
    const cfg = getConfig();
    upsertKeyState(key, {
        status: 'cooldown',
        cooldown_until: Date.now() + cfg.COOLDOWN_MS,
        last_error: reason
    });
}

export function markDead(key, reason = 'unauthorized') {
    const s = getKeyState(key) || {};
    upsertKeyState(key, {
        status: 'dead',
        last_error: reason,
        error_count: (s.error_count || 0) + 1
    });
}

export function setStatus(key, status) {
    const allowed = ['active', 'cooldown', 'dead'];
    if (!allowed.includes(status)) throw new Error(`invalid status ${status}`);
    const patch = { status };
    if (status === 'active') patch.cooldown_until = 0;
    if (status === 'cooldown') patch.cooldown_until = Date.now() + getConfig().COOLDOWN_MS;
    upsertKeyState(key, patch);
}

export function getEntryByMaskedOrEmail(emailOrMasked) {
    return _entries.find(e =>
        e.email === emailOrMasked ||
        `${e.key.slice(0, 8)}…${e.key.slice(-6)}` === emailOrMasked ||
        e.key === emailOrMasked
    );
}

reloadKeys();
