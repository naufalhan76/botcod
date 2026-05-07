/**
 * Content Filter — pattern-based string replacement applied to requests
 * before forwarding to upstream providers.
 *
 * Each rule has:
 *   - id: unique identifier
 *   - pattern: string to match (plain text, not regex)
 *   - replacement: string to replace with ("" = remove)
 *   - target: 'body' | 'headers' | 'both' (where to apply)
 *   - active: boolean toggle
 *   - createdAt: ISO timestamp
 *
 * Persisted in server/filters.json (gitignored).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILTERS_FILE = path.resolve(__dirname, '..', 'filters.json');

let _filters = [];

// ---- Persistence ----

function loadFilters() {
    try {
        if (!fs.existsSync(FILTERS_FILE)) {
            _filters = [];
            return;
        }
        const raw = fs.readFileSync(FILTERS_FILE, 'utf-8');
        _filters = JSON.parse(raw);
        if (!Array.isArray(_filters)) _filters = [];
    } catch {
        _filters = [];
    }
}

function saveFilters() {
    fs.writeFileSync(FILTERS_FILE, JSON.stringify(_filters, null, 2), 'utf-8');
}

// ---- CRUD ----

export function listFilters() {
    return _filters;
}

export function addFilter({ pattern, replacement = '', target = 'body', active = true }) {
    if (!pattern || typeof pattern !== 'string') throw new Error('pattern is required');
    const entry = {
        id: randomUUID().slice(0, 8),
        pattern,
        replacement: replacement ?? '',
        target: ['body', 'headers', 'both'].includes(target) ? target : 'body',
        active: !!active,
        createdAt: new Date().toISOString()
    };
    _filters.push(entry);
    saveFilters();
    return entry;
}

export function updateFilter(id, patch) {
    const idx = _filters.findIndex(f => f.id === id);
    if (idx === -1) throw new Error('filter not found');
    const allowed = ['pattern', 'replacement', 'target', 'active'];
    for (const k of allowed) {
        if (k in patch) _filters[idx][k] = patch[k];
    }
    saveFilters();
    return _filters[idx];
}

export function removeFilter(id) {
    const idx = _filters.findIndex(f => f.id === id);
    if (idx === -1) return false;
    _filters.splice(idx, 1);
    saveFilters();
    return true;
}

export function toggleFilter(id) {
    const idx = _filters.findIndex(f => f.id === id);
    if (idx === -1) throw new Error('filter not found');
    _filters[idx].active = !_filters[idx].active;
    saveFilters();
    return _filters[idx];
}

// ---- Apply filters ----

/**
 * Apply all active filters to a string. Returns the filtered string.
 */
function applyToString(str, target) {
    if (!str || typeof str !== 'string') return str;
    const active = _filters.filter(f => f.active && (f.target === target || f.target === 'both'));
    let result = str;
    for (const rule of active) {
        // Use split+join for safe global replacement (no infinite loop risk)
        result = result.split(rule.pattern).join(rule.replacement);
    }
    return result;
}

/**
 * Apply body-targeted filters to the OpenAI request body (messages content).
 * Mutates body in-place and returns it.
 */
export function applyBodyFilters(body) {
    if (!body || !Array.isArray(body.messages)) return body;

    for (const msg of body.messages) {
        if (typeof msg.content === 'string') {
            msg.content = applyToString(msg.content, 'body');
        }
        // Handle array-type content (multimodal messages with text parts)
        if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part && part.type === 'text' && typeof part.text === 'string') {
                    part.text = applyToString(part.text, 'body');
                }
            }
        }
    }
    return body;
}

/**
 * Apply header-targeted filters to request headers object.
 * Returns a new headers object with filtered values.
 * Removes headers whose value becomes empty after filtering.
 */
export function applyHeaderFilters(headers) {
    if (!headers || typeof headers !== 'object') return headers;
    const active = _filters.filter(f => f.active && (f.target === 'headers' || f.target === 'both'));
    if (active.length === 0) return headers;

    const result = {};
    for (const [key, value] of Object.entries(headers)) {
        let filteredKey = key;
        let filteredValue = typeof value === 'string' ? value : value;

        for (const rule of active) {
            // Filter header names
            if (filteredKey.includes(rule.pattern)) {
                filteredKey = '';
                break;
            }
            // Filter header values
            if (typeof filteredValue === 'string') {
                filteredValue = filteredValue.split(rule.pattern).join(rule.replacement);
            }
        }

        // Only include header if key wasn't removed and value isn't empty
        if (filteredKey && filteredValue !== '') {
            result[filteredKey] = filteredValue;
        }
    }
    return result;
}

/**
 * Apply filters to incoming request headers (from the client).
 * This strips fingerprints from the raw incoming request before we even
 * look at the body. Returns filtered headers object.
 */
export function applyIncomingHeaderFilters(rawHeaders) {
    return applyHeaderFilters(rawHeaders);
}

// ---- Init ----
loadFilters();

export { loadFilters };
