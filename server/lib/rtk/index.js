/**
 * RTK Token Saver — auto-compress tool_result content before sending to LLM.
 *
 * Peeks at the first ~1KB of each tool_result, picks the best filter,
 * and applies lossless compression. If a filter fails or makes output bigger,
 * silently keeps the original.
 *
 * Filters (in priority order):
 *   1. git-diff   — unified diff output
 *   2. git-status — git status output
 *   3. grep       — grep/ripgrep search results
 *   4. find       — find/ls/tree file listings
 *   5. dedup-log  — repetitive log output
 *   6. smart-truncate — fallback for any large output
 */
import * as gitDiff from './gitDiff.js';
import * as gitStatus from './gitStatus.js';
import * as grep from './grep.js';
import * as find from './find.js';
import * as dedupLog from './dedupLog.js';
import * as smartTruncate from './smartTruncate.js';

// Ordered by specificity (most specific first)
const FILTERS = [
    { name: 'git-diff', mod: gitDiff },
    { name: 'git-status', mod: gitStatus },
    { name: 'grep', mod: grep },
    { name: 'find', mod: find },
    { name: 'dedup-log', mod: dedupLog },
    { name: 'smart-truncate', mod: smartTruncate }
];

/**
 * Compress a single tool_result text string.
 * Returns { text, filter, saved } where saved = original.length - compressed.length.
 * If no filter matches or compression doesn't help, returns original unchanged.
 */
export function compressToolResult(text) {
    if (!text || typeof text !== 'string') return { text, filter: null, saved: 0 };
    // Only bother if content is substantial (>500 chars)
    if (text.length < 500) return { text, filter: null, saved: 0 };

    // Peek first 1KB for detection
    const peek = text.slice(0, 1024);

    for (const { name, mod } of FILTERS) {
        try {
            if (!mod.detect(peek.length < text.length ? peek : text)) continue;

            const compressed = mod.compress(text);

            // Safety: if compression made it bigger or same, skip
            if (compressed.length >= text.length) continue;

            return {
                text: compressed,
                filter: name,
                saved: text.length - compressed.length
            };
        } catch {
            // Filter threw — skip silently
            continue;
        }
    }

    return { text, filter: null, saved: 0 };
}

/**
 * Apply RTK compression to all tool_result messages in an OpenAI request body.
 * Mutates body in-place. Returns stats { totalSaved, filtersApplied }.
 */
export function applyRtk(body) {
    if (!body || !Array.isArray(body.messages)) return { totalSaved: 0, filtersApplied: [] };

    let totalSaved = 0;
    const filtersApplied = [];

    for (const msg of body.messages) {
        // Tool result messages (role: 'tool')
        if (msg.role === 'tool' && typeof msg.content === 'string') {
            const result = compressToolResult(msg.content);
            if (result.saved > 0) {
                msg.content = result.text;
                totalSaved += result.saved;
                filtersApplied.push(result.filter);
            }
            continue;
        }

        // User messages with tool_result content blocks (Claude format)
        if (msg.role === 'user' && Array.isArray(msg.content)) {
            for (const block of msg.content) {
                if (block.type === 'tool_result' && typeof block.content === 'string') {
                    const result = compressToolResult(block.content);
                    if (result.saved > 0) {
                        block.content = result.text;
                        totalSaved += result.saved;
                        filtersApplied.push(result.filter);
                    }
                }
                // Nested content array in tool_result
                if (block.type === 'tool_result' && Array.isArray(block.content)) {
                    for (const part of block.content) {
                        if (part.type === 'text' && typeof part.text === 'string') {
                            const result = compressToolResult(part.text);
                            if (result.saved > 0) {
                                part.text = result.text;
                                totalSaved += result.saved;
                                filtersApplied.push(result.filter);
                            }
                        }
                    }
                }
            }
        }
    }

    return { totalSaved, filtersApplied };
}
