import crypto from 'crypto';

export const KIRO_MAX_TOOL_NAME_LENGTH = 64;
export const KIRO_MAX_TOOLS = 20;

const DEFAULT_INPUT_SCHEMA = { type: 'object', properties: {} };

/**
 * Convert OpenAI chat tools into Kiro tool specifications.
 * @param {Array<{type?: string, function?: {name: string, description?: string, parameters?: object}}>} openaiTools
 * @returns {Array<{toolSpecification: {name: string, description: string, inputSchema: object}}>} Kiro tool specs.
 */
export function convertToolsToKiroSpec(openaiTools) {
    return deduplicateTools(Array.isArray(openaiTools) ? openaiTools : [])
        .slice(0, KIRO_MAX_TOOLS)
        .map(tool => {
            const fn = tool?.function || tool || {};
            const name = shortenToolName(String(fn.name || '').trim(), KIRO_MAX_TOOL_NAME_LENGTH);
            if (!name) return null;
            return {
                toolSpecification: {
                    name,
                    description: typeof fn.description === 'string' ? fn.description : '',
                    inputSchema: isPlainObject(fn.parameters) ? fn.parameters : DEFAULT_INPUT_SCHEMA
                }
            };
        })
        .filter(Boolean);
}

/**
 * Convert OpenAI tool calls into Kiro tool use entries.
 * @param {Array<{id: string, function?: {name: string, arguments?: string}}>} toolCalls
 * @returns {Array<{toolUseId: string, name: string, input: object}>} Kiro tool uses.
 */
export function convertToolCallsToKiroUses(toolCalls) {
    if (!Array.isArray(toolCalls)) return [];
    return toolCalls.map(call => {
        const name = shortenToolName(String(call?.function?.name || call?.name || '').trim(), KIRO_MAX_TOOL_NAME_LENGTH);
        const toolUseId = String(call?.id || call?.toolUseId || '').trim();
        if (!name || !toolUseId) return null;
        return {
            toolUseId,
            name,
            input: parseToolArguments(call?.function?.arguments ?? call?.arguments)
        };
    }).filter(Boolean);
}

/**
 * Convert OpenAI tool messages into Kiro tool results, replacing invalid UTF-8.
 * @param {Array<{role?: string, tool_call_id?: string, content?: unknown}>} messages
 * @param {Array<string|{id?: string, toolUseId?: string, tool_call_id?: string}>} toolsInRequest
 * @returns {Array<{toolUseId: string, content: Array<{text: string}>}>} Kiro tool results.
 */
export function convertToolResultsToKiroFormat(messages, toolsInRequest = []) {
    if (!Array.isArray(messages)) return [];
    const knownIds = collectToolUseIds(toolsInRequest);
    return messages
        .filter(message => message?.role === 'tool')
        .map(message => {
            const toolUseId = String(message.tool_call_id || message.toolUseId || '').trim();
            if (!toolUseId || (knownIds.size > 0 && !knownIds.has(toolUseId))) return null;
            return {
                toolUseId,
                content: [{ text: toValidUtf8Text(message.content) }]
            };
        })
        .filter(Boolean);
}

/**
 * Convert a Kiro tool use event into an OpenAI tool call object.
 * @param {{toolUse?: object, toolUseId?: string, name?: string, input?: object}} toolUseEvent
 * @param {number} index
 * @returns {{index: number, id: string, type: 'function', function: {name: string, arguments: string}}} OpenAI tool call.
 */
export function convertKiroToolUseToOpenAI(toolUseEvent, index = 0) {
    const toolUse = toolUseEvent?.toolUse || toolUseEvent || {};
    const id = String(toolUse.toolUseId || toolUse.id || '').trim();
    const name = shortenToolName(String(toolUse.name || '').trim(), KIRO_MAX_TOOL_NAME_LENGTH);
    let argumentsStr;
    try {
        argumentsStr = JSON.stringify(isPlainObject(toolUse.input) ? toolUse.input : {});
    } catch (err) {
        // Edge case: malformed input (circular refs, etc.) → pass as-is string
        argumentsStr = typeof toolUse.input === 'string' ? toolUse.input : '{}';
    }
    return {
        index,
        id,
        type: 'function',
        function: {
            name,
            arguments: argumentsStr
        }
    };
}

/**
 * Convert legacy OpenAI functions into modern OpenAI tools.
 * @param {Array<{name: string, description?: string, parameters?: object}>} functions
 * @returns {Array<{type: 'function', function: object}>} OpenAI tools.
 */
export function convertLegacyFunctionsToTools(functions) {
    if (!Array.isArray(functions)) return [];
    return functions.map(fn => ({
        type: 'function',
        function: {
            name: fn?.name,
            description: typeof fn?.description === 'string' ? fn.description : '',
            parameters: isPlainObject(fn?.parameters) ? fn.parameters : DEFAULT_INPUT_SCHEMA
        }
    })).filter(tool => typeof tool.function.name === 'string' && tool.function.name.trim());
}

/**
 * Remove duplicate tools by function name, preserving the first occurrence.
 * @param {Array<{function?: {name?: string}, name?: string}>} tools
 * @returns {Array} Deduplicated tools.
 */
export function deduplicateTools(tools) {
    if (!Array.isArray(tools)) return [];
    const seen = new Set();
    const result = [];
    for (const tool of tools) {
        const name = String(tool?.function?.name || tool?.name || '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        result.push(tool);
    }
    return result;
}

/**
 * Shorten a tool name deterministically with a four-character SHA-256 suffix.
 * @param {string} name
 * @param {number} maxLen
 * @returns {string} Original or shortened name.
 */
export function shortenToolName(name, maxLen = KIRO_MAX_TOOL_NAME_LENGTH) {
    const cleanName = String(name || '').trim();
    const limit = Number.isFinite(maxLen) ? Math.max(0, Math.floor(maxLen)) : KIRO_MAX_TOOL_NAME_LENGTH;
    if (cleanName.length <= limit) return cleanName;
    const suffix = crypto.createHash('sha256').update(cleanName).digest('hex').slice(0, 4);
    if (limit <= 4) return suffix.slice(0, limit);
    const separator = '_';
    return `${cleanName.slice(0, limit - separator.length - suffix.length)}${separator}${suffix}`;
}

/**
 * Convert orphan OpenAI tool-result messages into user-visible text messages.
 * @param {Array<object>} messages
 * @param {Iterable<string>} knownToolUseIds
 * @returns {Array<object>} Messages with orphan tool results sanitized.
 */
export function sanitizeOrphanToolResults(messages, knownToolUseIds = []) {
    if (!Array.isArray(messages)) return [];
    const knownIds = new Set(Array.from(knownToolUseIds || [], id => String(id)));
    return messages.map(message => {
        if (message?.role !== 'tool') return message;
        const toolUseId = String(message.tool_call_id || message.toolUseId || '').trim();
        if (toolUseId && knownIds.has(toolUseId)) return message;
        return {
            role: 'user',
            content: `[orphan tool result${toolUseId ? ` ${toolUseId}` : ''}] ${toValidUtf8Text(message.content)}`
        };
    });
}

function parseToolArguments(value) {
    if (isPlainObject(value)) return value;
    if (typeof value !== 'string' || value.trim() === '') return {};
    try {
        const parsed = JSON.parse(value);
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function collectToolUseIds(toolsInRequest) {
    const ids = new Set();
    if (!Array.isArray(toolsInRequest)) return ids;
    for (const tool of toolsInRequest) {
        const id = typeof tool === 'string'
            ? tool
            : tool?.toolUseId || tool?.id || tool?.tool_call_id;
        if (id) ids.add(String(id));
    }
    return ids;
}

function toValidUtf8Text(content) {
    if (Buffer.isBuffer(content) || content instanceof Uint8Array) {
        return Buffer.from(content).toString('utf8');
    }
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            return '';
        }).join('');
    }
    if (typeof content === 'string') return Buffer.from(content, 'utf8').toString('utf8');
    if (content == null) return '';
    try {
        return Buffer.from(JSON.stringify(content), 'utf8').toString('utf8');
    } catch {
        return String(content);
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);
}
