export const WEIGHT_NAME_MATCH = 3;
export const WEIGHT_DESCRIPTION_MATCH = 2;
export const WEIGHT_RECENTLY_USED = 4;
export const WEIGHT_SYSTEM_MENTIONED = 2;
export const WEIGHT_BASE = 1;

/**
 * Score tools against recent chat context and keep the top maxTools entries.
 * @param {Array<{function?: {name?: string, description?: string}, name?: string, description?: string}>} tools
 * @param {Array<{role?: string, content?: unknown, tool_calls?: Array<object>, toolCalls?: Array<object>}>} messages
 * @param {number} maxTools
 * @returns {{selected: Array, dropped: string[]}}
 */
export function scoreAndLimitTools(tools, messages = [], maxTools = tools?.length ?? 0) {
    const toolList = Array.isArray(tools) ? tools : [];
    const limit = normalizeLimit(maxTools);
    if (toolList.length <= limit) {
        return { selected: toolList, dropped: [] };
    }

    const context = buildScoringContext(messages);
    const scoredTools = toolList.map((tool, index) => {
        const name = getToolName(tool);
        return {
            tool,
            name,
            score: scoreTool(tool, name, context),
            index
        };
    });

    const selectedScored = selectTopTools(scoredTools, limit);
    const selectedIndexes = new Set(selectedScored.map(entry => entry.index));
    const dropped = scoredTools
        .filter(entry => !selectedIndexes.has(entry.index))
        .map(entry => entry.name)
        .filter(Boolean);

    if (dropped.length > 0) {
        console.warn(`[kiro] too many tools (${toolList.length}) → keeping ${limit} highest-relevance tools (dropped: ${dropped.join(', ')})`);
    }

    return {
        selected: selectedScored.map(entry => entry.tool),
        dropped
    };
}

/**
 * Extract tool names called by assistant messages in the last three turns.
 * @param {Array<{role?: string, tool_calls?: Array<object>, toolCalls?: Array<object>}>} messages
 * @returns {string[]}
 */
export function extractCalledToolNames(messages) {
    if (!Array.isArray(messages)) return [];
    const names = [];
    const recentTurns = messages.filter(message => message?.role !== 'system').slice(-3);
    for (const message of recentTurns) {
        if (message?.role !== 'assistant') continue;
        const calls = Array.isArray(message.tool_calls)
            ? message.tool_calls
            : Array.isArray(message.toolCalls)
                ? message.toolCalls
                : [];
        for (const call of calls) {
            const name = String(call?.function?.name || call?.name || '').trim();
            if (name) names.push(name);
        }
    }
    return names;
}

/**
 * Sort scored tools by score descending, preserving original order for ties.
 * @param {Array<{score?: number, index?: number}>} scoredTools
 * @param {number} maxTools
 * @returns {Array}
 */
export function selectTopTools(scoredTools, maxTools) {
    if (!Array.isArray(scoredTools)) return [];
    const limit = normalizeLimit(maxTools);
    return scoredTools
        .map((entry, fallbackIndex) => ({ ...entry, index: Number.isFinite(entry?.index) ? entry.index : fallbackIndex }))
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || a.index - b.index)
        .slice(0, limit);
}

function scoreTool(tool, name, context) {
    const lowerName = name.toLowerCase();
    let score = WEIGHT_BASE;

    if (lowerName && context.userText.includes(lowerName)) {
        score += WEIGHT_NAME_MATCH;
    }
    if (lowerName && context.systemText.includes(lowerName)) {
        score += WEIGHT_SYSTEM_MENTIONED;
    }
    if (context.calledToolNames.has(lowerName)) {
        score += WEIGHT_RECENTLY_USED;
    }
    if (descriptionMatchesUser(tool, context.userKeywords)) {
        score += WEIGHT_DESCRIPTION_MATCH;
    }

    return score;
}

function buildScoringContext(messages) {
    const messageList = Array.isArray(messages) ? messages : [];
    const userText = messageList
        .filter(message => message?.role === 'user')
        .map(message => extractText(message.content))
        .join(' ')
        .toLowerCase();
    const systemText = messageList
        .filter(message => message?.role === 'system')
        .map(message => extractText(message.content))
        .join(' ')
        .toLowerCase();

    return {
        userText,
        systemText,
        userKeywords: new Set(splitKeywords(userText)),
        calledToolNames: new Set(extractCalledToolNames(messageList).map(name => name.toLowerCase()))
    };
}

function descriptionMatchesUser(tool, userKeywords) {
    if (userKeywords.size === 0) return false;
    const description = String(tool?.function?.description || tool?.description || '').toLowerCase();
    return splitKeywords(description).some(keyword => userKeywords.has(keyword));
}

function splitKeywords(text) {
    return String(text || '')
        .toLowerCase()
        .split(/\s+/)
        .map(keyword => keyword.replace(/^\W+|\W+$/g, ''))
        .filter(Boolean);
}

function getToolName(tool) {
    return String(tool?.function?.name || tool?.name || '').trim();
}

function normalizeLimit(maxTools) {
    if (!Number.isFinite(maxTools)) return 0;
    return Math.max(0, Math.floor(maxTools));
}

function extractText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            return '';
        }).join(' ');
    }
    if (content == null) return '';
    return String(content);
}
