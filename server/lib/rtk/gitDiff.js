/**
 * RTK filter: git-diff
 *
 * Compresses unified diff output by:
 * - Removing redundant context lines (keep max 2 around changes)
 * - Collapsing repeated unchanged sections into "... (N lines)"
 * - Stripping index/mode lines that add no semantic value
 */

const DETECT_PATTERN = /^diff --git |^--- a\/|^\+\+\+ b\/|^@@ /m;

export function detect(text) {
    return DETECT_PATTERN.test(text);
}

export function compress(text) {
    const lines = text.split('\n');
    const out = [];
    let contextBuffer = [];
    const MAX_CONTEXT = 2;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Always keep diff headers and hunk headers
        if (line.startsWith('diff --git ') ||
            line.startsWith('--- ') ||
            line.startsWith('+++ ') ||
            line.startsWith('@@ ')) {
            // Flush context buffer (keep last MAX_CONTEXT lines)
            if (contextBuffer.length > MAX_CONTEXT) {
                out.push(`... (${contextBuffer.length - MAX_CONTEXT} unchanged lines)`);
            }
            out.push(...contextBuffer.slice(-MAX_CONTEXT));
            contextBuffer = [];
            out.push(line);
            continue;
        }

        // Strip index/mode lines
        if (line.startsWith('index ') || line.startsWith('old mode') || line.startsWith('new mode')) {
            continue;
        }

        // Change lines: flush context, keep the change
        if (line.startsWith('+') || line.startsWith('-')) {
            // Flush context (keep last MAX_CONTEXT)
            if (contextBuffer.length > MAX_CONTEXT) {
                out.push(`... (${contextBuffer.length - MAX_CONTEXT} unchanged lines)`);
            }
            out.push(...contextBuffer.slice(-MAX_CONTEXT));
            contextBuffer = [];
            out.push(line);
            continue;
        }

        // Context line (starts with space or is plain text in diff)
        contextBuffer.push(line);
    }

    // Flush remaining context
    if (contextBuffer.length > MAX_CONTEXT) {
        out.push(`... (${contextBuffer.length - MAX_CONTEXT} unchanged lines)`);
        out.push(...contextBuffer.slice(-MAX_CONTEXT));
    } else {
        out.push(...contextBuffer);
    }

    return out.join('\n');
}
