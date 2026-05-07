/**
 * Kiro credentials store + AWS SSO OIDC token refresh.
 *
 * Persisted at <root>/kiro_credentials.json (gitignored). Schema:
 *   {
 *     "credentials": [
 *       {
 *         "label": "human-friendly tag",
 *         "auth": "IdC" | "Social",
 *         "refreshToken": "...",
 *         "clientId": "...",        // IdC only
 *         "clientSecret": "...",    // IdC only
 *         "accessToken": "...",     // cached
 *         "expiresAt": ms_epoch,    // cached
 *         "lastUsedAt": ms_epoch,
 *         "usageCount": 0,
 *         "errorCount": 0,
 *         "status": "active" | "cooldown" | "dead",
 *         "cooldownUntil": ms_epoch,
 *         "lastError": null
 *       }
 *     ],
 *     "savedAt": ms_epoch
 *   }
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

let _store = { credentials: [], savedAt: 0 };
let _file = path.join(ROOT, 'kiro_credentials.json');
let _saveQueued = false;

function file() {
    const cfg = getConfig();
    return cfg.KIRO_CREDS_FILE || _file;
}

export function loadKiroStore() {
    const f = file();
    if (!fs.existsSync(f)) {
        _store = { credentials: [], savedAt: 0 };
        return _store;
    }
    try {
        _store = JSON.parse(fs.readFileSync(f, 'utf-8'));
        if (!Array.isArray(_store.credentials)) _store.credentials = [];
    } catch {
        _store = { credentials: [], savedAt: 0 };
    }
    return _store;
}

export function saveKiroStore() {
    if (_saveQueued) return;
    _saveQueued = true;
    setImmediate(() => {
        try {
            const f = file();
            fs.mkdirSync(path.dirname(f), { recursive: true });
            _store.savedAt = Date.now();
            fs.writeFileSync(f, JSON.stringify(_store, null, 2), 'utf-8');
        } catch (e) {
            console.error('[kiro] save creds failed:', e.message);
        } finally {
            _saveQueued = false;
        }
    });
}

export function listKiroCreds() {
    return _store.credentials.map((c, idx) => ({
        idx,
        label: c.label || `cred ${idx}`,
        auth: c.auth,
        has_client_secret: !!c.clientSecret,
        status: effectiveStatus(c),
        credit_status: creditStatus(c, effectiveStatus(c)),
        credit_remaining: null,
        last_used_at: c.lastUsedAt || 0,
        cooldown_until: c.cooldownUntil || 0,
        usage_count: c.usageCount || 0,
        error_count: c.errorCount || 0,
        expires_at: c.expiresAt || 0,
        last_error: c.lastError || null
    }));
}

function creditStatus(c = {}, status = 'active') {
    const err = String(c.lastError || '').toLowerCase();
    if (err.includes('quota') || err.includes('insufficient') || err.includes('credit')) return 'empty';
    if (status === 'dead') return 'empty';
    if (status === 'cooldown') return 'limited';
    if ((c.usageCount || 0) > 0 || c.lastUsedAt) return 'available';
    return 'unknown';
}

export function summaryKiro() {
    const list = listKiroCreds();
    const counts = { active: 0, cooldown: 0, dead: 0, total: list.length };
    for (const c of list) counts[c.status] = (counts[c.status] || 0) + 1;
    return counts;
}

function effectiveStatus(c, now = Date.now()) {
    if (!c.status) return 'active';
    if (c.status === 'cooldown' && c.cooldownUntil && now >= c.cooldownUntil) {
        c.status = 'active';
        c.cooldownUntil = 0;
        saveKiroStore();
        return 'active';
    }
    return c.status;
}

/**
 * Add (or upsert by refreshToken) a credential. Returns its index.
 */
export function addKiroCred(input) {
    const c = {
        label: input.label || '',
        auth: input.auth || (input.clientId ? 'IdC' : 'Social'),
        refreshToken: input.refreshToken,
        clientId: input.clientId || null,
        clientSecret: input.clientSecret || null,
        accessToken: input.accessToken || null,
        expiresAt: input.expiresAt || 0,
        lastUsedAt: 0,
        usageCount: 0,
        errorCount: 0,
        status: 'active',
        cooldownUntil: 0,
        lastError: null
    };
    if (!c.refreshToken) throw new Error('refreshToken required');
    if (c.auth === 'IdC' && (!c.clientId || !c.clientSecret)) {
        throw new Error('IdC auth requires clientId + clientSecret');
    }
    const existingIdx = _store.credentials.findIndex(x => x.refreshToken === c.refreshToken);
    if (existingIdx !== -1) {
        _store.credentials[existingIdx] = { ..._store.credentials[existingIdx], ...c };
        saveKiroStore();
        return existingIdx;
    }
    _store.credentials.push(c);
    saveKiroStore();
    return _store.credentials.length - 1;
}

export function removeKiroCred(idx) {
    if (idx < 0 || idx >= _store.credentials.length) return false;
    _store.credentials.splice(idx, 1);
    saveKiroStore();
    return true;
}

export function setKiroCredStatus(idx, status) {
    if (idx < 0 || idx >= _store.credentials.length) return false;
    const allowed = ['active', 'cooldown', 'dead'];
    if (!allowed.includes(status)) throw new Error('invalid status');
    const c = _store.credentials[idx];
    c.status = status;
    if (status === 'active') c.cooldownUntil = 0;
    if (status === 'cooldown') c.cooldownUntil = Date.now() + getConfig().COOLDOWN_MS;
    saveKiroStore();
    return true;
}

/**
 * Pick the next active credential. Prefers oldest lastUsedAt.
 */
export function pickNextKiroCred(excludeIndices = []) {
    const now = Date.now();
    const candidates = [];
    for (let i = 0; i < _store.credentials.length; i++) {
        if (excludeIndices.includes(i)) continue;
        const c = _store.credentials[i];
        if (effectiveStatus(c, now) !== 'active') continue;
        candidates.push({ idx: i, last: c.lastUsedAt || 0 });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.last - b.last);
    return candidates[0].idx;
}

export function markKiroUsed(idx) {
    const c = _store.credentials[idx];
    if (!c) return;
    c.lastUsedAt = Date.now();
    c.usageCount = (c.usageCount || 0) + 1;
    saveKiroStore();
}

export function markKiroCooldown(idx, reason = 'rate_limit') {
    const c = _store.credentials[idx];
    if (!c) return;
    c.status = 'cooldown';
    c.cooldownUntil = Date.now() + getConfig().COOLDOWN_MS;
    c.lastError = reason;
    saveKiroStore();
}

export function markKiroDead(idx, reason = 'auth_failed') {
    const c = _store.credentials[idx];
    if (!c) return;
    c.status = 'dead';
    c.errorCount = (c.errorCount || 0) + 1;
    c.lastError = reason;
    saveKiroStore();
}

/* --------------------------- TOKEN REFRESH --------------------------------- */

const SOCIAL_REFRESH_URL = 'https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken';
const IDC_REFRESH_URL = 'https://oidc.us-east-1.amazonaws.com/token';

const REFRESH_LEEWAY_MS = 60_000; // refresh 1 min before expiry

// Per-credential in-flight refresh promise. Prevents concurrent callers from
// firing parallel refresh requests with the same (single-use) refresh token —
// AWS rotates refreshTokens on each successful refresh, so a parallel call
// would fail with `invalid_grant` and falsely mark a healthy credential dead.
const _refreshLocks = new Map();

/**
 * Ensure the credential at `idx` has a valid (non-expired) accessToken.
 * Returns the access token string. Throws on refresh failure.
 */
export async function getAccessTokenForCred(idx) {
    const c = _store.credentials[idx];
    if (!c) throw new Error(`kiro cred ${idx} missing`);

    const now = Date.now();
    if (c.accessToken && c.expiresAt && c.expiresAt - REFRESH_LEEWAY_MS > now) {
        return c.accessToken;
    }

    // Serialize concurrent refreshes for the same credential.
    const inflight = _refreshLocks.get(idx);
    if (inflight) return inflight;

    const p = (async () => {
        // Re-check inside the locked path: a concurrent caller may have just
        // populated a fresh token while we were waiting our turn.
        const now2 = Date.now();
        if (c.accessToken && c.expiresAt && c.expiresAt - REFRESH_LEEWAY_MS > now2) {
            return c.accessToken;
        }
        let tok;
        try {
            tok = c.auth === 'IdC' ? await refreshIdC(c) : await refreshSocial(c);
        } catch (e) {
            c.lastError = `refresh_failed: ${e.message}`;
            c.errorCount = (c.errorCount || 0) + 1;
            // If refresh token itself is rejected, the credential is permanently dead.
            if (/invalid_grant|expired/.test(e.message)) {
                c.status = 'dead';
            }
            saveKiroStore();
            throw e;
        }

        c.accessToken = tok.accessToken;
        c.expiresAt = tok.expiresAt;
        if (tok.refreshToken && tok.refreshToken !== c.refreshToken) {
            // AWS rotates refresh tokens.
            c.refreshToken = tok.refreshToken;
        }
        saveKiroStore();
        return c.accessToken;
    })().finally(() => {
        _refreshLocks.delete(idx);
    });

    _refreshLocks.set(idx, p);
    return p;
}

async function refreshSocial(c) {
    const res = await fetch(SOCIAL_REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: c.refreshToken })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`social refresh ${res.status}: ${text.slice(0, 200)}`);
    const j = JSON.parse(text);
    const expiresInSec = j.expiresIn || 3600;
    return {
        accessToken: j.accessToken,
        refreshToken: j.refreshToken,
        expiresAt: Date.now() + expiresInSec * 1000
    };
}

async function refreshIdC(c) {
    const res = await fetch(IDC_REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientId: c.clientId,
            clientSecret: c.clientSecret,
            grantType: 'refresh_token',
            refreshToken: c.refreshToken
        })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`idc refresh ${res.status}: ${text.slice(0, 200)}`);
    const j = JSON.parse(text);
    const expiresInSec = j.expiresIn || 3600;
    return {
        accessToken: j.accessToken,
        refreshToken: j.refreshToken,
        expiresAt: Date.now() + expiresInSec * 1000
    };
}

loadKiroStore();
