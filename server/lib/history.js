/**
 * Persistent request history for AI-facing endpoints.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { trackRequest } from './stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const HISTORY_FILE = path.join(ROOT, 'server', 'history.json');

const MAX_RECORDS = 500;
const MAX_STRING = 8000;
const SENSITIVE_KEY = /(api[_-]?key|authorization|bearer|token|secret|password|refresh)/i;

function loadStore() {
    try {
        if (!fs.existsSync(HISTORY_FILE)) return { entries: [] };
        const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
    } catch {
        return { entries: [] };
    }
}

function saveStore(store) {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    const tmp = `${HISTORY_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmp, HISTORY_FILE);
}

function clipString(value, limit = MAX_STRING) {
    if (value.length <= limit) return value;
    return `${value.slice(0, limit)}... [truncated ${value.length - limit} chars]`;
}

function sanitize(value, depth = 0) {
    if (depth > 6) return '[max depth]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return clipString(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
        const rows = value.slice(0, 100).map(v => sanitize(v, depth + 1));
        if (value.length > rows.length) rows.push(`[truncated ${value.length - rows.length} items]`);
        return rows;
    }
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : sanitize(v, depth + 1);
        }
        return out;
    }
    return String(value);
}

function summarizeRequest(body) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find(m => m && m.role === 'user');
    const content = lastUser?.content;
    let prompt = '';
    if (typeof content === 'string') {
        prompt = content;
    } else if (Array.isArray(content)) {
        prompt = content
            .map(part => typeof part === 'string' ? part : (part?.text || part?.type || ''))
            .filter(Boolean)
            .join(' ');
    }
    return {
        model: typeof body?.model === 'string' ? body.model : null,
        stream: body?.stream !== false,
        message_count: messages.length,
        prompt_preview: clipString(prompt || '', 400)
    };
}

export function listHistory({ limit = 100 } = {}) {
    const store = loadStore();
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, MAX_RECORDS));
    const entries = store.entries.slice(-safeLimit).reverse();
    return { entries, total: store.entries.length, max: MAX_RECORDS };
}

export function clearHistory() {
    saveStore({ entries: [] });
    return { ok: true };
}

export function appendHistory(entry) {
    const store = loadStore();
    store.entries.push(entry);
    if (store.entries.length > MAX_RECORDS) {
        store.entries = store.entries.slice(store.entries.length - MAX_RECORDS);
    }
    saveStore(store);
    return entry;
}

export function trackAiRequest(req, res, meta = {}) {
    const startedAt = Date.now();
    const id = crypto.randomUUID();
    const requestBody = sanitize(req.body || {});
    const summary = summarizeRequest(req.body || {});
    const current = {
        id,
        ts: new Date(startedAt).toISOString(),
        source: meta.source || 'api',
        endpoint: meta.endpoint || `${req.method} ${req.originalUrl || req.url}`,
        method: req.method,
        path: req.originalUrl || req.url,
        provider: meta.provider || null,
        model: meta.model || summary.model,
        stream: summary.stream,
        message_count: summary.message_count,
        prompt_preview: summary.prompt_preview,
        client: req.ip || req.socket?.remoteAddress || null,
        request: requestBody
    };

    let saved = false;

    const finish = (aborted = false) => {
        if (saved) return;
        saved = true;
        const statusCode = aborted ? 499 : (res.statusCode || null);
        const ok = !aborted && statusCode >= 200 && statusCode < 400;
        const durationMs = Date.now() - startedAt;
        appendHistory({
            ...current,
            status_code: statusCode,
            response_code: ok ? 'success' : 'error',
            ok,
            aborted,
            duration_ms: durationMs
        });
        
        // Track stats for charts
        trackRequest({
            model: current.model,
            provider: current.provider,
            promptTokens: 0, // TODO: extract from response if available
            completionTokens: 0,
            latencyMs: durationMs,
            success: ok
        });
    };

    res.once('finish', () => finish(false));
    res.once('close', () => {
        if (!res.writableEnded) finish(true);
    });

    return {
        id,
        set(patch = {}) {
            Object.assign(current, patch);
        }
    };
}
