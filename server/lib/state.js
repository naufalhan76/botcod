/**
 * Persistent key pool state. JSON file keyed by api key string.
 *   { [key]: { status, last_used_at, cooldown_until, error_count, last_error, ... } }
 */
import fs from 'fs';
import path from 'path';
import { getConfig } from './config.js';

let _state = { keys: {}, _saved_at: 0 };
let _saveQueued = false;

function file() { return getConfig().STATE_FILE; }

export function loadState() {
    const f = file();
    if (!fs.existsSync(f)) {
        _state = { keys: {}, _saved_at: 0 };
        return _state;
    }
    try {
        _state = JSON.parse(fs.readFileSync(f, 'utf-8'));
        if (!_state.keys) _state.keys = {};
    } catch (e) {
        _state = { keys: {}, _saved_at: 0 };
    }
    return _state;
}

export function getState() {
    return _state;
}

export function saveState() {
    if (_saveQueued) return;
    _saveQueued = true;
    setImmediate(() => {
        try {
            const f = file();
            fs.mkdirSync(path.dirname(f), { recursive: true });
            _state._saved_at = Date.now();
            fs.writeFileSync(f, JSON.stringify(_state, null, 2), 'utf-8');
        } catch (e) {
            console.error('[state] save failed:', e.message);
        } finally {
            _saveQueued = false;
        }
    });
}

export function getKeyState(key) {
    return _state.keys[key];
}

export function upsertKeyState(key, patch) {
    const prev = _state.keys[key] || {
        status: 'active',
        last_used_at: 0,
        cooldown_until: 0,
        error_count: 0,
        last_error: null,
        usage_count: 0
    };
    _state.keys[key] = { ...prev, ...patch };
    saveState();
    return _state.keys[key];
}

export function pruneMissingKeys(presentKeys) {
    const present = new Set(presentKeys);
    let pruned = 0;
    for (const k of Object.keys(_state.keys)) {
        if (!present.has(k)) {
            delete _state.keys[k];
            pruned++;
        }
    }
    if (pruned) saveState();
    return pruned;
}

loadState();
