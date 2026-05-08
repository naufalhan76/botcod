/**
 * Smart History Truncation — sliding window that keeps system prompt + recent
 * turns, dropping old middle messages when approaching context window limit.
 *
 * Tool call pairs (assistant with tool_calls + tool role response) are never
 * split — both kept or both dropped as a unit.
 */
import { estimateTokens, estimateMessagesTokens, getModelContextWindow } from './tokenEstimate.js';

/**
 * Apply history truncation to request body in-place.
 * @param {object} body - OpenAI-format request body (mutated)
 * @param {object} opts - { threshold: 0.7, enabled: true }
 * @returns {{ truncated: boolean, originalCount: number, finalCount: number, tokensSaved: number }}
 */
export function applyHistoryTruncation(body, opts = {}) {
    const { threshold = 0.7, enabled = true } = opts;
    const noop = { truncated: false, originalCount: 0, finalCount: 0, tokensSaved: 0 };

    if (!enabled) return noop;
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) return noop;

    const messages = body.messages;
    const originalCount = messages.length;
    const contextWindow = getModelContextWindow(body.model);
    const totalTokens = estimateMessagesTokens(messages);
    const tokenBudget = Math.floor(contextWindow * threshold);

    // If under budget, no-op
    if (totalTokens <= tokenBudget) {
        return { truncated: false, originalCount, finalCount: originalCount, tokensSaved: 0 };
    }

    // Separate system messages (always keep) from conversation turns
    const systemMsgs = [];
    const turns = [];
    for (const msg of messages) {
        if (msg.role === 'system') systemMsgs.push(msg);
        else turns.push(msg);
    }

    const systemTokens = estimateMessagesTokens(systemMsgs);
    const targetTokens = tokenBudget - systemTokens;

    if (targetTokens <= 0) {
        // Edge case: system messages alone exceed budget — keep system + last user msg
        const lastUser = [...turns].reverse().find(m => m.role === 'user');
        body.messages = lastUser ? [...systemMsgs, lastUser] : [...systemMsgs];
        const finalCount = body.messages.length;
        const tokensSaved = totalTokens - estimateMessagesTokens(body.messages);
        console.log(`[truncate] ${body.model}: ${originalCount} → ${finalCount} messages, ~${tokensSaved} tokens saved`);
        return { truncated: true, originalCount, finalCount, tokensSaved };
    }

    // Walk from END backwards, accumulating tokens.
    // Build "keep set" indices from the end.
    const keepIndices = new Set();
    let accumulated = 0;

    for (let i = turns.length - 1; i >= 0; i--) {
        const msg = turns[i];
        const msgTokens = estimateMessagesTokens([msg]);

        // Check if adding this message would exceed budget
        if (accumulated + msgTokens > targetTokens && keepIndices.size > 0) {
            break;
        }

        // Tool pair protection: if this is a tool response, find its matching assistant
        if (msg.role === 'tool' && msg.tool_call_id) {
            // Find the assistant message with matching tool_call
            let assistantIdx = -1;
            for (let j = i - 1; j >= 0; j--) {
                if (turns[j].role === 'assistant' && Array.isArray(turns[j].tool_calls)) {
                    const hasMatch = turns[j].tool_calls.some(tc => tc.id === msg.tool_call_id);
                    if (hasMatch) { assistantIdx = j; break; }
                }
            }
            if (assistantIdx >= 0 && !keepIndices.has(assistantIdx)) {
                const assistantTokens = estimateMessagesTokens([turns[assistantIdx]]);
                if (accumulated + msgTokens + assistantTokens > targetTokens && keepIndices.size > 0) {
                    // Can't fit the pair — skip both
                    break;
                }
                keepIndices.add(assistantIdx);
                accumulated += assistantTokens;
            }
        }

        // If this is an assistant with tool_calls, ensure all its tool responses are included
        if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
            const toolCallIds = msg.tool_calls.map(tc => tc.id);
            const toolResponses = [];
            for (let j = i + 1; j < turns.length; j++) {
                if (turns[j].role === 'tool' && toolCallIds.includes(turns[j].tool_call_id)) {
                    toolResponses.push(j);
                }
            }
            let pairTokens = msgTokens;
            for (const idx of toolResponses) {
                if (!keepIndices.has(idx)) {
                    pairTokens += estimateMessagesTokens([turns[idx]]);
                }
            }
            if (accumulated + pairTokens > targetTokens && keepIndices.size > 0) {
                break;
            }
            for (const idx of toolResponses) {
                keepIndices.add(idx);
                if (!keepIndices.has(idx)) accumulated += estimateMessagesTokens([turns[idx]]);
            }
        }

        keepIndices.add(i);
        accumulated += msgTokens;
    }

    // Reassemble: system + kept turns (in original order)
    const keptTurns = turns.filter((_, i) => keepIndices.has(i));
    body.messages = [...systemMsgs, ...keptTurns];

    const finalCount = body.messages.length;
    const tokensSaved = totalTokens - estimateMessagesTokens(body.messages);

    if (finalCount < originalCount) {
        console.log(`[truncate] ${body.model}: ${originalCount} → ${finalCount} messages, ~${tokensSaved} tokens saved`);
    }

    return { truncated: finalCount < originalCount, originalCount, finalCount, tokensSaved };
}
