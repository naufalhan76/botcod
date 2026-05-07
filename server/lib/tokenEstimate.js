import { getEffectiveModelCaps } from './config.js';

const CJK_RE = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/;

export function estimateTokens(text) {
    const value = String(text ?? '');
    if (!value) return 0;
    const divisor = CJK_RE.test(value) ? 2 : 4;
    return Math.ceil(value.length / divisor);
}

export function estimateMessagesTokens(messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) return 0;
    return messages.reduce((sum, message) => {
        const content = typeof message?.content === 'string'
            ? message.content
            : Array.isArray(message?.content)
                ? message.content.map(part => typeof part?.text === 'string' ? part.text : String(part?.text ?? part?.content ?? '')).join('')
                : String(message?.content ?? '');
        return sum + 4 + estimateTokens(content);
    }, 0);
}

export function getModelContextWindow(model) {
    const caps = getEffectiveModelCaps();
    return caps?.[model]?.limit?.context ?? 200000;
}
