/**
 * Caveman Mode — inject terse-style system prompt to reduce output tokens.
 *
 * Intensity levels:
 *   - lite:  Light compression (~25% savings). Normal grammar, just concise.
 *   - full:  Standard caveman (~50% savings). Drop articles, filler, be terse.
 *   - ultra: Maximum compression (~65% savings). Bare minimum words.
 *
 * The prompt is appended to the existing system message (or injected as one).
 * Technical accuracy is preserved — only verbosity is reduced.
 */

const PROMPTS = {
    lite: `[Response Style: Be concise. No preamble, no filler, no pleasantries. Answer directly. Use short sentences. Skip "I think", "Let me", "Sure!", etc. One word answers are fine when appropriate.]`,

    full: `[Response Style: CAVEMAN MODE. Speak terse. Drop articles (the, a, an). Drop filler words. No preamble. No "I'll", "Let me", "Sure". Use fragments. Technical accuracy stays — verbosity dies. Example: "File has bug line 42. Missing null check. Fix: add \`if (!x) return\` before access." NOT "I found a bug in the file at line 42. The issue is that there's a missing null check. To fix this, you should add..."]`,

    ultra: `[Response Style: ULTRA CAVEMAN. Absolute minimum words. No grammar needed. Noun+verb only. Skip all connecting words. Example: "bug line 42. null check missing. fix: \`if(!x)return\`" — Never explain what you're doing. Never summarize. Never use transition phrases. Raw information only.]`
};

const VALID_LEVELS = ['lite', 'full', 'ultra'];

/**
 * Apply caveman mode to request body. Mutates in-place.
 * @param {object} body - OpenAI request body
 * @param {string} level - 'lite' | 'full' | 'ultra'
 */
export function applyCaveman(body, level = 'full') {
    if (!body || !Array.isArray(body.messages)) return;
    if (!VALID_LEVELS.includes(level)) level = 'full';

    const prompt = PROMPTS[level];
    const msgs = body.messages;

    // Find existing system message
    const sysIdx = msgs.findIndex(m => m.role === 'system');

    if (sysIdx >= 0) {
        // Append to existing system message
        const sys = msgs[sysIdx];
        if (typeof sys.content === 'string') {
            sys.content = sys.content + '\n\n' + prompt;
        } else if (Array.isArray(sys.content)) {
            // Multimodal system message — append text block
            sys.content.push({ type: 'text', text: prompt });
        }
    } else {
        // No system message — inject one at the start
        msgs.unshift({ role: 'system', content: prompt });
    }
}

export { VALID_LEVELS, PROMPTS };
