import { convertToolCallsToKiroUses, convertToolResultsToKiroFormat } from './tools.js';

const SYNTHETIC_USER_CONTENT = '(continue)';
const SYNTHETIC_ASSISTANT_CONTENT = '';

export function buildKiroHistoryFromUnified(messages, modelId) {
    const input = Array.isArray(messages) ? messages : [];
    const systemText = input
        .filter(message => message?.role === 'system')
        .map(message => stringifyContent(message.content))
        .join('\n')
        .trim();
    const turns = input.filter(message => message?.role !== 'system');
    const history = [];
    const pendingToolResults = [];
    let foldedSystem = false;

    for (const message of turns) {
        if (message?.role === 'tool') {
            pendingToolResults.push(...convertToolResultsToKiroFormat([message]));
            continue;
        }

        if (message?.role === 'user') {
            const content = stringifyContent(message.content);
            const userInputMessage = {
                content: !foldedSystem && systemText ? `${systemText}\n\n${content}` : content,
                modelId
            };
            foldedSystem = true;

            if (pendingToolResults.length > 0) {
                userInputMessage.userInputMessageContext = {
                    tools: [],
                    toolResults: pendingToolResults.splice(0)
                };
            }

            history.push({ userInputMessage });
            continue;
        }

        if (message?.role === 'assistant') {
            const assistantResponseMessage = {
                content: stringifyContent(message.content)
            };
            const toolUses = convertToolCallsToKiroUses(message.tool_calls || message.toolUses);
            if (toolUses.length > 0) assistantResponseMessage.toolUses = toolUses;
            history.push({ assistantResponseMessage });
        }
    }

    return history;
}

export function ensureAlternatingRoles(messages) {
    const input = ensureFirstMessageIsUser(Array.isArray(messages) ? messages : []);
    const output = [];
    let expected = 'user';

    for (const message of input) {
        if (!message || message.role === 'system' || message.role === 'tool') {
            output.push(message);
            continue;
        }

        if (message.role !== 'user' && message.role !== 'assistant') {
            output.push(message);
            continue;
        }

        const previous = lastConversationalMessage(output);
        if (previous && previous.role === message.role) {
            mergeMessage(previous, message);
            continue;
        }

        if (message.role !== expected) {
            output.push(syntheticMessage(expected));
            expected = oppositeRole(expected);
        }

        output.push({ ...message });
        expected = oppositeRole(message.role);
    }

    return output;
}

export function ensureFirstMessageIsUser(messages) {
    const input = Array.isArray(messages) ? messages : [];
    const firstTurnIndex = input.findIndex(message => message?.role !== 'system');
    if (firstTurnIndex === -1) return [{ role: 'user', content: SYNTHETIC_USER_CONTENT }];
    if (input[firstTurnIndex]?.role === 'user') return input.map(message => ({ ...message }));

    return [
        ...input.slice(0, firstTurnIndex).map(message => ({ ...message })),
        { role: 'user', content: SYNTHETIC_USER_CONTENT },
        ...input.slice(firstTurnIndex).map(message => ({ ...message }))
    ];
}

export function ensureAssistantBeforeToolResults(messages) {
    const input = Array.isArray(messages) ? messages : [];
    const output = [];

    for (let i = 0; i < input.length; i++) {
        const message = input[i];
        if (message?.role !== 'tool') {
            output.push({ ...message });
            continue;
        }

        const toolRun = [];
        while (i < input.length && input[i]?.role === 'tool') {
            toolRun.push(input[i]);
            i++;
        }
        i--;

        if (!previousAssistantHasToolCalls(output, toolRun)) {
            output.push({
                role: 'assistant',
                content: SYNTHETIC_ASSISTANT_CONTENT,
                tool_calls: toolRun.map(tool => syntheticToolCall(tool))
            });
        }

        output.push(...toolRun.map(tool => ({ ...tool })));
    }

    return output;
}

export function smartTruncateHistory(history, tokenBudget, toolTokenCost = 0) {
    const budget = Number.isFinite(tokenBudget) ? Math.max(0, tokenBudget) : Infinity;
    const fixedToolCost = Number.isFinite(toolTokenCost) ? Math.max(0, toolTokenCost) : 0;
    const result = Array.isArray(history) ? history.map(message => ({ ...message })) : [];

    while (estimateHistoryTokens(result) + fixedToolCost > budget) {
        const protectedIndexes = getProtectedIndexes(result);
        const group = findOldestRemovableGroup(result, protectedIndexes);
        if (group.length === 0) break;
        for (const index of group.sort((a, b) => b - a)) result.splice(index, 1);
    }

    return result;
}

export function estimateTokens(text) {
    return Math.ceil(stringifyContent(text).length / 4);
}

export function estimateToolTokenCost(tools) {
    if (!Array.isArray(tools)) return 0;
    return tools.reduce((total, tool) => total + estimateTokens(JSON.stringify(tool ?? {})), 0);
}

function estimateHistoryTokens(messages) {
    return messages.reduce((total, message) => {
        const content = message?.content
            ?? message?.userInputMessage?.content
            ?? message?.assistantResponseMessage?.content
            ?? '';
        const toolCalls = message?.tool_calls ?? message?.assistantResponseMessage?.toolUses ?? [];
        const toolResults = message?.userInputMessage?.userInputMessageContext?.toolResults ?? [];
        return total
            + estimateTokens(content)
            + estimateTokens(JSON.stringify(toolCalls))
            + estimateTokens(JSON.stringify(toolResults));
    }, 0);
}

function getProtectedIndexes(messages) {
    const protectedIndexes = new Set();
    messages.forEach((message, index) => {
        if (message?.role === 'system') protectedIndexes.add(index);
    });

    const turnIndexes = [];
    messages.forEach((message, index) => {
        if (isConversationalTurn(message)) turnIndexes.push(index);
    });
    for (const index of turnIndexes.slice(-2)) {
        for (const paired of pairedGroupForIndex(messages, index)) protectedIndexes.add(paired);
    }

    return protectedIndexes;
}

function findOldestRemovableGroup(messages, protectedIndexes) {
    for (let i = 0; i < messages.length; i++) {
        if (protectedIndexes.has(i)) continue;
        const group = pairedGroupForIndex(messages, i);
        if (group.every(index => !protectedIndexes.has(index))) return group;
    }
    return [];
}

function pairedGroupForIndex(messages, index) {
    const message = messages[index];
    if (!message) return [];
    const assistantIds = toolCallIds(message);
    if (assistantIds.length > 0) {
        const group = [index];
        for (let i = index + 1; i < messages.length && messages[i]?.role === 'tool'; i++) {
            if (assistantIds.includes(String(messages[i].tool_call_id || messages[i].toolUseId || ''))) group.push(i);
        }
        return group;
    }

    if (message.role === 'tool') {
        const id = String(message.tool_call_id || message.toolUseId || '');
        for (let i = index - 1; i >= 0; i--) {
            const ids = toolCallIds(messages[i]);
            if (ids.length > 0 && ids.includes(id)) return pairedGroupForIndex(messages, i);
            if (messages[i]?.role === 'user') break;
        }
    }

    if (message.userInputMessage?.userInputMessageContext?.toolResults?.length > 0) {
        for (let i = index - 1; i >= 0; i--) {
            if (messages[i]?.assistantResponseMessage?.toolUses?.length > 0) return [i, index];
        }
    }

    if (message.assistantResponseMessage?.toolUses?.length > 0) {
        const group = [index];
        if (messages[index + 1]?.userInputMessage?.userInputMessageContext?.toolResults?.length > 0) group.push(index + 1);
        return group;
    }

    return [index];
}

function toolCallIds(message) {
    const calls = message?.tool_calls || [];
    if (!Array.isArray(calls)) return [];
    return calls.map(call => String(call?.id || call?.toolUseId || '')).filter(Boolean);
}

function previousAssistantHasToolCalls(output, toolRun) {
    const previous = output[output.length - 1];
    if (previous?.role !== 'assistant') return false;
    const ids = new Set(toolCallIds(previous));
    return toolRun.every(tool => ids.has(String(tool.tool_call_id || tool.toolUseId || '')));
}

function syntheticToolCall(tool) {
    const id = String(tool?.tool_call_id || tool?.toolUseId || '').trim() || 'synthetic_tool_call';
    return {
        id,
        type: 'function',
        function: {
            name: 'unknown_tool',
            arguments: '{}'
        }
    };
}

function isConversationalTurn(message) {
    return message?.role === 'user'
        || message?.role === 'assistant'
        || Boolean(message?.userInputMessage)
        || Boolean(message?.assistantResponseMessage);
}

function lastConversationalMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === 'user' || messages[i]?.role === 'assistant') return messages[i];
    }
    return null;
}

function mergeMessage(target, source) {
    target.content = [stringifyContent(target.content), stringifyContent(source.content)].filter(Boolean).join('\n');
    if (Array.isArray(source.tool_calls) && source.tool_calls.length > 0) {
        target.tool_calls = [...(target.tool_calls || []), ...source.tool_calls];
    }
}

function syntheticMessage(role) {
    return {
        role,
        content: role === 'user' ? SYNTHETIC_USER_CONTENT : SYNTHETIC_ASSISTANT_CONTENT
    };
}

function oppositeRole(role) {
    return role === 'user' ? 'assistant' : 'user';
}

function stringifyContent(content) {
    if (typeof content === 'string') return content;
    if (content == null) return '';
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            return '';
        }).join('');
    }
    try {
        return JSON.stringify(content);
    } catch {
        return String(content);
    }
}
