/**
 * Per-model capability table that powers the OpenCode config snippet
 * (variants, limit, modalities) and the Kiro reasoning translator.
 *
 * Each entry:
 *   {
 *     family:    "claude" | "gpt" | "gemini" | "deepseek" | "glm" | "minimax" | "qwen" | "auto",
 *     reasoning: boolean,                        // whether the upstream supports reasoning_effort
 *     thinkingStyle: "openai" | "anthropic" | "kiro-prompt-injected" | null,
 *     modalities: { input: string[], output: string[] },
 *     limit:      { context: number, output: number },
 *     variants?:  { [variantName]: { ... opencode options ... } }
 *   }
 *
 * Sources:
 *   - models.dev/api.json (closest matching upstream model id)
 *   - kiro.dev/docs/models for the Kiro-side context windows
 *   - https://docs.claude.com/en/docs/build-with-claude/extended-thinking
 *
 * The user can override individual fields via the Settings tab; that lives in
 * persisted settings.json under MODEL_CAPS_OVERRIDES (see config.js).
 */

const TEXT_IMAGE_PDF = { input: ['text', 'image', 'pdf'], output: ['text'] };
const TEXT_IMAGE     = { input: ['text', 'image'],         output: ['text'] };
const TEXT_ONLY      = { input: ['text'],                  output: ['text'] };
const TEXT_FULL      = { input: ['text', 'image', 'audio', 'video', 'pdf'], output: ['text'] };

// OpenCode-native variant shape for OpenAI-compatible providers:
// `reasoningEffort` / `textVerbosity` / `reasoningSummary` are forwarded by
// @ai-sdk/openai-compatible as `reasoning_effort` / `text_verbosity` /
// `reasoning_summary` body fields. sambungin's translateRequest passes them
// through to CodeBuddy as-is for reasoning models, and the Kiro provider
// rewrites them into prompt-injected thinking for CodeWhisperer-routed models.
const REASONING_VARIANTS_FULL = {
    max:    { reasoningEffort: 'max',    textVerbosity: 'low',    reasoningSummary: 'auto' },
    high:   { reasoningEffort: 'high',   textVerbosity: 'low',    reasoningSummary: 'auto' },
    medium: { reasoningEffort: 'medium', textVerbosity: 'medium', reasoningSummary: 'auto' },
    low:    { reasoningEffort: 'low',    textVerbosity: 'medium', reasoningSummary: 'auto' }
};

// Slimmer variant set for Kiro / Anthropic-routed models — they only need the
// reasoningEffort signal (Kiro: triggers prompt injection; CodeBuddy claude:
// forwarded as-is, ignored if upstream doesn't recognise it).
const REASONING_VARIANTS_BASIC = {
    max:  { reasoningEffort: 'max',  textVerbosity: 'low' },
    high: { reasoningEffort: 'high', textVerbosity: 'low' }
};

export const DEFAULT_MODEL_CAPS = {
    // ─── CodeBuddy provider ─────────────────────────────────────────────
    'auto-chat':         { family: 'auto',     reasoning: false, thinkingStyle: null,        modalities: TEXT_ONLY,      limit: { context:  200000, output:  32000 } },
    'claude-opus-4.6':   { family: 'claude',   reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_IMAGE_PDF, limit: { context: 1000000, output: 128000 }, variants: REASONING_VARIANTS_FULL },
    'gpt-5.5':           { family: 'gpt',      reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_IMAGE,     limit: { context:  400000, output: 128000 }, variants: REASONING_VARIANTS_FULL },
    'gpt-5.2':           { family: 'gpt',      reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_IMAGE,     limit: { context:  400000, output: 128000 }, variants: REASONING_VARIANTS_FULL },
    'gpt-5.1':           { family: 'gpt',      reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_IMAGE,     limit: { context:  400000, output: 128000 }, variants: REASONING_VARIANTS_FULL },
    'gpt-5':             { family: 'gpt',      reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_IMAGE,     limit: { context:  400000, output: 128000 }, variants: REASONING_VARIANTS_FULL },
    'gpt-5-codex':       { family: 'gpt',      reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_IMAGE,     limit: { context:  400000, output: 128000 }, variants: REASONING_VARIANTS_FULL },
    'o3':                { family: 'gpt',      reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_IMAGE_PDF, limit: { context:  200000, output: 100000 }, variants: REASONING_VARIANTS_FULL },
    'o4-mini':           { family: 'gpt',      reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_IMAGE,     limit: { context:  200000, output: 100000 }, variants: REASONING_VARIANTS_FULL },
    'gemini-3.1-pro':    { family: 'gemini',   reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_FULL,      limit: { context: 1000000, output:  64000 }, variants: REASONING_VARIANTS_BASIC },
    'gemini-3.0-pro':    { family: 'gemini',   reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_FULL,      limit: { context: 1000000, output:  64000 }, variants: REASONING_VARIANTS_BASIC },
    'gemini-2.5-pro':    { family: 'gemini',   reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_FULL,      limit: { context: 1048576, output:  65536 }, variants: REASONING_VARIANTS_BASIC },
    'gemini-2.5-flash':  { family: 'gemini',   reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_FULL,      limit: { context: 1048576, output:  65536 }, variants: REASONING_VARIANTS_BASIC },
    'glm-4.6':           { family: 'glm',      reasoning: true,  thinkingStyle: 'openai',    modalities: TEXT_ONLY,      limit: { context:  204800, output: 131072 } },
    'deepseek-v3.2':     { family: 'deepseek', reasoning: false, thinkingStyle: null,        modalities: TEXT_ONLY,      limit: { context:  128000, output:   8000 } },
    'deepseek-v3':       { family: 'deepseek', reasoning: false, thinkingStyle: null,        modalities: TEXT_ONLY,      limit: { context:  128000, output:   8000 } },

    // ─── Kiro provider ──────────────────────────────────────────────────
    // Per kiro.dev/docs/models. claude-* on Kiro use prompt-injected thinking
    // (CodeWhisperer doesn't accept the `thinking` parameter natively).
    'claude-sonnet-4.5':  { family: 'claude',   reasoning: true,  thinkingStyle: 'kiro-prompt-injected', modalities: TEXT_IMAGE_PDF, limit: { context: 200000, output:  64000 }, variants: REASONING_VARIANTS_BASIC },
    'claude-sonnet-4':    { family: 'claude',   reasoning: true,  thinkingStyle: 'kiro-prompt-injected', modalities: TEXT_IMAGE_PDF, limit: { context: 200000, output:  64000 }, variants: REASONING_VARIANTS_BASIC },
    'claude-3.7-sonnet':  { family: 'claude',   reasoning: true,  thinkingStyle: 'kiro-prompt-injected', modalities: TEXT_IMAGE_PDF, limit: { context: 200000, output:  64000 }, variants: REASONING_VARIANTS_BASIC },
    'deepseek-v3.2-kiro': { family: 'deepseek', reasoning: false, thinkingStyle: null,                   modalities: TEXT_ONLY,      limit: { context: 128000, output:   8000 } },
    'minimax-m2.5':       { family: 'minimax',  reasoning: false, thinkingStyle: null,                   modalities: TEXT_ONLY,      limit: { context: 200000, output: 131000 } },
    'minimax-m2.1':       { family: 'minimax',  reasoning: false, thinkingStyle: null,                   modalities: TEXT_ONLY,      limit: { context: 200000, output: 131000 } },
    'glm-5':              { family: 'glm',      reasoning: true,  thinkingStyle: 'kiro-prompt-injected', modalities: TEXT_ONLY,      limit: { context: 200000, output: 131000 } },
    'qwen3-coder-next':   { family: 'qwen',     reasoning: false, thinkingStyle: null,                   modalities: TEXT_ONLY,      limit: { context: 256000, output:  65000 } }
};

/**
 * Apply persisted user overrides on top of DEFAULT_MODEL_CAPS. The override
 * format mirrors the default keys; only the fields explicitly set on each
 * model are overlaid (so an override of just `{ limit: {...} }` doesn't wipe
 * out the model's variants).
 */
export function buildEffectiveCaps(overrides = {}) {
    const out = {};
    for (const [name, base] of Object.entries(DEFAULT_MODEL_CAPS)) {
        const o = overrides[name] || {};
        out[name] = {
            ...base,
            ...o,
            modalities: { ...(base.modalities || {}), ...(o.modalities || {}) },
            limit:      { ...(base.limit      || {}), ...(o.limit      || {}) },
            variants:   o.variants !== undefined ? o.variants : base.variants
        };
    }
    // Allow registering caps for models the user added that aren't in defaults.
    for (const [name, o] of Object.entries(overrides)) {
        if (!out[name]) out[name] = o;
    }
    return out;
}
