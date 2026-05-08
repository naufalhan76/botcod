/**
 * Runtime configuration with env overrides + persisted overrides.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildEffectiveCaps } from './modelCaps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const CODEBUDDY_MODELS = [
    'auto-chat',
    'claude-opus-4.6',
    'gpt-5.5',
    'gpt-5.2',
    'gpt-5.1',
    'gpt-5',
    'gpt-5-codex',
    'o3',
    'o4-mini',
    'gemini-3.1-pro',
    'gemini-3.0-pro',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'glm-4.6',
    'deepseek-v3.2',
    'deepseek-v3'
];

const KIRO_MODELS = [
    'claude-sonnet-4.5',
    'claude-sonnet-4',
    'claude-3.7-sonnet',
    'deepseek-v3.2-kiro',
    'minimax-m2.5',
    'minimax-m2.1',
    'glm-5',
    'qwen3-coder-next'
];

const DEFAULTS = {
    PORT: 4141,
    HOST: '127.0.0.1',
    KEYS_FILE: path.join(ROOT, 'codebuddy_keys.txt'),
    KIRO_CREDS_FILE: path.join(ROOT, 'kiro_credentials.json'),
    ACCOUNTS_FILE: path.join(ROOT, 'accounts.txt'),
    PROXIES_FILE: path.join(ROOT, 'proxies.txt'),
    STATE_FILE: path.join(ROOT, 'server', 'state.json'),
    SETTINGS_FILE: path.join(ROOT, 'server', 'settings.json'),
    UPSTREAM_BASE: 'https://www.codebuddy.ai',
    UPSTREAM_PATH: '/v2/chat/completions',
    COOLDOWN_MS: 24 * 60 * 60 * 1000, // 24h, configurable via dashboard
    MAX_ROTATIONS_PER_REQUEST: 5,
    UPSTREAM_TIMEOUT_MS: 5 * 60 * 1000,
    DASHBOARD_PASSWORD: null, // optional, if set requires X-Dashboard-Password header
    EXPOSED_MODELS: [...CODEBUDDY_MODELS, ...KIRO_MODELS],
    // Each model -> 'codebuddy' | 'kiro'. Editable via Settings tab.
    MODEL_PROVIDERS: {
        ...Object.fromEntries(CODEBUDDY_MODELS.map(m => [m, 'codebuddy'])),
        ...Object.fromEntries(KIRO_MODELS.map(m => [m, 'kiro']))
    },
    // Persisted user overrides for per-model capabilities (variants, limit,
    // modalities). Empty by default; the Settings tab merges these on top of
    // DEFAULT_MODEL_CAPS via buildEffectiveCaps().
    MODEL_CAPS_OVERRIDES: {},
    // RTK Token Saver — compress tool_result content before forwarding (default ON)
    RTK_ENABLED: true,
    // History Truncation — auto-drop middle messages when token limit is reached
    TRUNCATE_ENABLED: true,
    TRUNCATE_THRESHOLD: 0.7,
    // Response Cache — cache identical prompts
    CACHE_ENABLED: true,
    CACHE_TTL_MS: 300000,
    CACHE_MAX_SIZE: 100,
    // Caveman Mode — inject terse system prompt to reduce output tokens (default ON)
    CAVEMAN_ENABLED: true,
    // Caveman intensity: 'lite' | 'full' | 'ultra'
    CAVEMAN_LEVEL: 'full'
};

export { CODEBUDDY_MODELS, KIRO_MODELS };

function envOverride(key, parser = String) {
    const v = process.env[`SAMBUNGIN_${key}`] ?? process.env[`BOTCOD_${key}`] ?? process.env[`ROUTER_${key}`];
    if (v === undefined || v === '') return undefined;
    try { return parser(v); } catch { return undefined; }
}

export function providerForModel(model) {
    return _config.MODEL_PROVIDERS?.[model] || null;
}

function loadPersistedSettings(file) {
    try {
        if (!fs.existsSync(file)) return {};
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
        return {};
    }
}

let _config = { ...DEFAULTS };

export function loadConfig() {
    const overrides = {
        PORT: envOverride('PORT', Number),
        HOST: envOverride('HOST'),
        KEYS_FILE: envOverride('KEYS_FILE'),
        UPSTREAM_BASE: envOverride('UPSTREAM_BASE'),
        COOLDOWN_MS: envOverride('COOLDOWN_MS', Number),
        DASHBOARD_PASSWORD: envOverride('DASHBOARD_PASSWORD')
    };

    const persisted = loadPersistedSettings(DEFAULTS.SETTINGS_FILE);

    // Precedence (highest wins): env vars > persisted dashboard settings > defaults.
    _config = { ...DEFAULTS };
    for (const [k, v] of Object.entries(persisted)) {
        if (v !== undefined && v !== null && k in DEFAULTS) _config[k] = v;
    }
    for (const [k, v] of Object.entries(overrides)) {
        if (v !== undefined) _config[k] = v;
    }
    return _config;
}

export function getConfig() {
    return _config;
}

/**
 * Effective per-model capability table (defaults + user overrides). Used by
 * the dashboard snippet generator and the Kiro reasoning translator.
 */
export function getEffectiveModelCaps() {
    return buildEffectiveCaps(_config.MODEL_CAPS_OVERRIDES || {});
}

export function updateSettings(patch) {
    const persisted = loadPersistedSettings(DEFAULTS.SETTINGS_FILE);
    const merged = { ...persisted, ...patch };
    fs.mkdirSync(path.dirname(DEFAULTS.SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(DEFAULTS.SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    // Re-run loadConfig so the documented precedence
    // (env vars > persisted dashboard settings > defaults) is preserved.
    // Without this, any env-var override silently loses to a dashboard save.
    return loadConfig();
}

loadConfig();
