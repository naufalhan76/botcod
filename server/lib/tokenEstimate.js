/**
 * Token estimation utility — fast, synchronous, no external deps.
 * Uses chars/4 heuristic (good enough for threshold decisions).
 */
import { getEffectiveModelCaps } from './config.js';

const CJK_RANGE = /[\u3000-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/u;

/**
 * Estimate token count for a text string.
 * ASCII-heavy → chars/4, CJK-heavy → chars/2.
 */
export function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    // Sample first 200 chars to detect CJK density
    const sample = text.slice(0, 200);
    const cjkCount = (sample.match(CJK_RANGE) || []).length;
    const ratio = sample.length > 0 ? cjkCount / sample.length : 0;
    const divisor = ratio > 0.3 ? 2 : 4;
    return Math.ceil(text.length / divisor);
}

/**
 * Estimate total tokens across an array of messages.
 * Adds ~4 tokens overhead per message (role, separators).
 */
export function estimateMessagesTokens(messages) {
    if (!Array.isArray(messages)) return 0;
    let total = 0;
    for (const msg of messages) {
        total += 4; // role + separators overhead
        if (typeof msg.content === 'string') {
            total += estimateTokens(msg.content);
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (typeof part === 'string') total += estimateTokens(part);
                else if (part?.text) total += estimateTokens(part.text);
                else if (part?.content) total += estimateTokens(part.content);
            }
        }
        // tool_calls in assistant messages
        if (Array.isArray(msg.tool_calls)) {
            for (const tc of msg.tool_calls) {
                total += estimateTokens(tc.function?.name || '');
                total += estimateTokens(tc.function?.arguments || '');
            }
        }
    }
    return total;
}

/**
 * Get context window size for a model. Falls back to 200000 if unknown.
 */
export function getModelContextWindow(model) {
    try {
        const caps = getEffectiveModelCaps();
        const cap = caps[model];
        if (cap?.limit?.context) return cap.limit.context;
    } catch { /* ignore */ }
    return 200000;
}
