/**
 * Kiro refresh-token persistence.
 *
 * Stores Social OAuth credentials captured during the Kiro signup flow
 * (lib/kiro.js -> exchangeKiroCode) in a flat JSON file so the dashboard
 * can display them and operators can copy the refresh_token elsewhere.
 *
 * File location is configurable via env BATCHER_KIRO_TOKENS_FILE; defaults
 * to <repo-root>/kiro_tokens.json.
 *
 * Format on disk (pretty-printed):
 *   {
 *     "version": 1,
 *     "tokens": [
 *       {
 *         "email": "foo@gmail.com",
 *         "refreshToken": "...",
 *         "accessToken": "...",
 *         "expiresAt": 1700000000000,
 *         "profileArn": "arn:aws:..." | null,
 *         "auth": "Social",
 *         "capturedAt": 1700000000000
 *       }
 *     ]
 *   }
 *
 * Reads tolerate missing/empty/malformed files (returns empty list).
 * Writes are atomic (temp file + rename) so the dashboard never reads
 * a partial JSON document.
 */
import fs from 'fs';
import path from 'path';

const DEFAULT_FILE = path.resolve(process.cwd(), 'kiro_tokens.json');

export function getKiroTokensPath() {
    return process.env.BATCHER_KIRO_TOKENS_FILE
        ? path.resolve(process.env.BATCHER_KIRO_TOKENS_FILE)
        : DEFAULT_FILE;
}

function emptyStore() {
    return { version: 1, tokens: [] };
}

export function loadKiroTokens() {
    const file = getKiroTokensPath();
    if (!fs.existsSync(file)) return emptyStore();
    let raw;
    try {
        raw = fs.readFileSync(file, 'utf8');
    } catch {
        return emptyStore();
    }
    if (!raw.trim()) return emptyStore();
    try {
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.tokens)) return emptyStore();
        return { version: data.version || 1, tokens: data.tokens };
    } catch {
        return emptyStore();
    }
}

function writeKiroTokensAtomic(store) {
    const file = getKiroTokensPath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, file);
}

/**
 * Insert-or-replace the token entry for `email`. Returns the saved entry.
 * `cred` must include refreshToken; other fields are optional but persisted
 * verbatim when present.
 */
export function saveKiroToken(email, cred) {
    if (!email || typeof email !== 'string') {
        throw new Error('saveKiroToken: email is required');
    }
    if (!cred || typeof cred !== 'object' || !cred.refreshToken) {
        throw new Error('saveKiroToken: cred.refreshToken is required');
    }
    const normEmail = email.trim().toLowerCase();
    const store = loadKiroTokens();
    const now = Date.now();
    const entry = {
        email: normEmail,
        refreshToken: cred.refreshToken,
        accessToken: cred.accessToken || null,
        expiresAt: cred.expiresAt || null,
        profileArn: cred.profileArn || null,
        auth: cred.auth || 'Social',
        capturedAt: now
    };
    const existingIdx = store.tokens.findIndex(t =>
        (t.email || '').toLowerCase() === normEmail
    );
    if (existingIdx >= 0) {
        store.tokens[existingIdx] = entry;
    } else {
        store.tokens.push(entry);
    }
    writeKiroTokensAtomic(store);
    return entry;
}

/** Remove the entry for `email`. Returns true if a row was removed. */
export function deleteKiroToken(email) {
    if (!email) return false;
    const normEmail = email.trim().toLowerCase();
    const store = loadKiroTokens();
    const before = store.tokens.length;
    store.tokens = store.tokens.filter(t =>
        (t.email || '').toLowerCase() !== normEmail
    );
    if (store.tokens.length === before) return false;
    writeKiroTokensAtomic(store);
    return true;
}

export function listKiroTokens() {
    const store = loadKiroTokens();
    // Newest first.
    return [...store.tokens].sort(
        (a, b) => (b.capturedAt || 0) - (a.capturedAt || 0)
    );
}
