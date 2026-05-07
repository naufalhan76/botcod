import { estimateMessagesTokens, getModelContextWindow } from './tokenEstimate.js';

const DEFAULT_THRESHOLD = 0.7;

function normalizedThreshold(value) {
    return Number.isFinite(value) && value > 0 && value <= 1 ? value : DEFAULT_THRESHOLD;
}

function toolCallIds(msg) {
    if (!msg || !Array.isArray(msg.tool_calls)) return [];
    return msg.tool_calls.map(call => call?.id).filter(Boolean);
}

function findAssistantForTool(turns, toolIdx) {
    const id = turns[toolIdx]?.tool_call_id;
    if (!id) return -1;

    for (let i = toolIdx - 1; i >= 0; i--) {
        const msg = turns[i];
        if (msg?.role === 'assistant' && toolCallIds(msg).includes(id)) return i;
    }

    return -1;
}

function findToolResultsForAssistant(turns, assistantIdx) {
    const ids = new Set(toolCallIds(turns[assistantIdx]));
    if (ids.size === 0) return [];

    const results = [];
    for (let i = assistantIdx + 1; i < turns.length && ids.size > 0; i++) {
        const msg = turns[i];
        if (msg?.role !== 'tool') continue;
        if (ids.has(msg.tool_call_id)) {
            results.push(i);
            ids.delete(msg.tool_call_id);
        }
    }

    return results;
}

function atomicGroupForIndex(turns, idx) {
    const indexes = new Set([idx]);
    const msg = turns[idx];

    if (msg?.role === 'tool') {
        const assistantIdx = findAssistantForTool(turns, idx);
        if (assistantIdx >= 0) {
            indexes.add(assistantIdx);
            for (const toolIdx of findToolResultsForAssistant(turns, assistantIdx)) indexes.add(toolIdx);
        }
    } else if (msg?.role === 'assistant' && toolCallIds(msg).length > 0) {
        for (const toolIdx of findToolResultsForAssistant(turns, idx)) indexes.add(toolIdx);
    }

    return [...indexes].sort((a, b) => a - b);
}

function groupTokenCount(turns, indexes) {
    return estimateMessagesTokens(indexes.map(i => turns[i]));
}

/**
 * Apply smart conversation history truncation to an OpenAI request body.
 * Mutates body.messages in-place. Returns stats object.
 */
export function applyHistoryTruncation(body, opts = {}) {
    const originalCount = Array.isArray(body?.messages) ? body.messages.length : 0;
    if (!body || !Array.isArray(body.messages)) {
        return { truncated: false, originalCount, finalCount: originalCount, tokensSaved: 0 };
    }
    if (opts.enabled === false) {
        return { truncated: false, originalCount, finalCount: originalCount, tokensSaved: 0 };
    }

    const msgs = body.messages;
    const threshold = normalizedThreshold(opts.threshold);
    const contextWindow = getModelContextWindow(body.model);
    const targetTokens = Math.floor(threshold * contextWindow);
    const originalTokens = estimateMessagesTokens(msgs);

    if (originalTokens < targetTokens) {
        return { truncated: false, originalCount, finalCount: originalCount, tokensSaved: 0 };
    }

    const systemMsgs = msgs.filter(m => m?.role === 'system');
    const turns = msgs.filter(m => m?.role !== 'system');
    const systemTokens = estimateMessagesTokens(systemMsgs);
    const keep = new Set();
    let keptTurnTokens = 0;

    for (let i = turns.length - 1; i >= 0; i--) {
        if (keep.has(i)) continue;

        const group = atomicGroupForIndex(turns, i).filter(idx => !keep.has(idx));
        const groupTokens = groupTokenCount(turns, group);

        if (systemTokens + keptTurnTokens + groupTokens > targetTokens && keep.size > 0) break;

        for (const idx of group) keep.add(idx);
        keptTurnTokens += groupTokens;
    }

    if (turns.length > 0) keep.add(turns.length - 1);

    const keptTurns = turns.filter((_, idx) => keep.has(idx));
    const nextMessages = [...systemMsgs, ...keptTurns];
    const finalTokens = estimateMessagesTokens(nextMessages);

    if (nextMessages.length >= msgs.length) {
        return { truncated: false, originalCount, finalCount: originalCount, tokensSaved: 0 };
    }

    msgs.splice(0, msgs.length, ...nextMessages);

    const finalCount = msgs.length;
    const tokensSaved = Math.max(0, originalTokens - finalTokens);
    const model = body.model || 'unknown-model';
    console.log(`[truncate] ${model}: ${originalCount} → ${finalCount} messages, ~${tokensSaved} tokens saved`);

    return { truncated: true, originalCount, finalCount, tokensSaved };
}
