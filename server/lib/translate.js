/**
 * OpenAI <-> CodeBuddy format translation.
 *
 * Verified empirically against https://www.codebuddy.ai/v2/chat/completions:
 * - Request body: OpenAI-shaped { model, messages, stream, ... } works directly.
 * - Response chunks: already in OpenAI chat.completion.chunk format,
 *   with extra fields (reasoning_content, function_call, refusal, extra_fields).
 *
 * Translation is therefore mostly pass-through with light cleanup.
 */
import { randomUUID } from 'crypto';
import { getEffectiveModelCaps } from './config.js';

// OpenAI / Anthropic-shaped reasoning hints. CodeBuddy ignores unknown fields
// for most models, but for explicitly non-reasoning models (e.g. deepseek-v3,
// auto-chat) we proactively drop these so an over-eager upstream parser can't
// reject the call.
const REASONING_FIELDS = ['reasoning_effort', 'reasoning_summary', 'text_verbosity', 'thinking', 'extended_thinking'];

export function buildUpstreamHeaders(bearerToken) {
    return {
        'Host': 'www.codebuddy.ai',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Conversation-ID': randomUUID(),
        'X-Conversation-Request-ID': randomUUID().replace(/-/g, ''),
        'X-Conversation-Message-ID': randomUUID().replace(/-/g, ''),
        'X-Request-ID': randomUUID().replace(/-/g, ''),
        'X-Agent-Intent': 'craft',
        'X-IDE-Type': 'CLI',
        'X-IDE-Name': 'CLI',
        'X-IDE-Version': '1.0.7',
        'Authorization': `Bearer ${bearerToken}`,
        'X-Domain': 'www.codebuddy.ai',
        'User-Agent': 'CLI/1.0.7 CodeBuddy/1.0.7',
        'X-Product': 'SaaS',
        'X-User-Id': randomUUID()
    };
}

/**
 * Translate an incoming OpenAI request body to a CodeBuddy upstream body.
 * CodeBuddy only supports streaming, so we ALWAYS send stream:true upstream
 * and aggregate locally if the client asked for stream:false.
 */
export function translateRequest(openaiBody) {
    const out = { ...openaiBody };
    out.stream = true; // upstream requires stream

    // For models the caps table marks as non-reasoning, strip reasoning hints
    // before forwarding. Reasoning models keep them and pass through to the
    // upstream as-is (CodeBuddy honours them for o3/o4-mini/gpt-5/claude-opus).
    const caps = getEffectiveModelCaps()[out.model];
    if (caps && caps.reasoning === false) {
        for (const f of REASONING_FIELDS) delete out[f];
    }

    // CodeBuddy returns "Parse message failed" if the body is just a single
    // user message. Most real clients (OpenCode, OpenAI SDK) include one
    // anyway; this is a defensive fallback for raw clients.
    const msgs = Array.isArray(out.messages) ? out.messages : [];
    const hasSystem = msgs.some(m => m && m.role === 'system');
    if (!hasSystem) {
        out.messages = [{ role: 'system', content: 'You are a helpful assistant.' }, ...msgs];
    }
    return out;
}

const STRIPPED_DELTA_FIELDS = ['reasoning_content', 'extra_fields', 'refusal', 'function_call'];

/**
 * Clean a single OpenAI-shape SSE chunk by removing CodeBuddy-specific fields
 * that strict OpenAI clients reject. Operates in-place and returns the chunk.
 * Pass-through when fields don't exist.
 */
export function cleanChunk(chunk) {
    if (!chunk || !Array.isArray(chunk.choices)) return chunk;
    for (const ch of chunk.choices) {
        if (ch.delta) {
            for (const f of STRIPPED_DELTA_FIELDS) {
                if (f in ch.delta && (ch.delta[f] === '' || ch.delta[f] === null || (Array.isArray(ch.delta[f]) && ch.delta[f].length === 0))) {
                    delete ch.delta[f];
                }
            }
        }
        if (ch.message) {
            for (const f of STRIPPED_DELTA_FIELDS) {
                if (f in ch.message && (ch.message[f] === '' || ch.message[f] === null)) {
                    delete ch.message[f];
                }
            }
        }
    }
    return chunk;
}

/**
 * Detect whether an upstream HTTP error indicates a per-key limit / quota issue
 * (so the router should mark the key for cooldown and rotate to next key).
 *
 * Returns one of: 'rate_limit', 'quota', 'auth', 'channel', null.
 */
export function classifyUpstreamError(status, bodyText) {
    if (status === 401 || status === 403) return 'auth';
    if (status === 429) return 'rate_limit';
    if (status === 402) return 'quota';

    if (bodyText && typeof bodyText === 'string') {
        try {
            const j = JSON.parse(bodyText);
            const code = j.code;
            const msg = (j.msg || j.message || '').toLowerCase();
            if (code === 11128 || msg.includes('rate limit') || msg.includes('too many requests')) return 'rate_limit';
            if (msg.includes('quota') || msg.includes('insufficient')) return 'quota';
            if (msg.includes('unauthorized') || msg.includes('invalid token')) return 'auth';
        } catch {
            const s = bodyText.toLowerCase();
            if (s.includes('rate limit') || s.includes('too many requests')) return 'rate_limit';
            if (s.includes('quota')) return 'quota';
        }
    }
    return null;
}
