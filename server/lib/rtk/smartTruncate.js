/**
 * RTK filter: smart-truncate
 *
 * Fallback filter for any large tool_result that doesn't match specific filters.
 * Truncates intelligently:
 * - Keep first N lines (head) + last M lines (tail)
 * - Insert summary in middle
 * - Truncate individual lines that are too long
 */

const MAX_TOTAL_LINES = 150;
const HEAD_LINES = 80;
const TAIL_LINES = 40;
const MAX_LINE_LENGTH = 500;

export function detect(text) {
    // This is the fallback — only triggers if text is large enough
    const lines = text.split('\n');
    return lines.length > MAX_TOTAL_LINES || text.length > 20000;
}

export function compress(text) {
    let lines = text.split('\n');

    // Truncate individual long lines first
    lines = lines.map(l =>
        l.length > MAX_LINE_LENGTH
            ? l.slice(0, MAX_LINE_LENGTH) + '…'
            : l
    );

    // If within limits after line truncation, return
    if (lines.length <= MAX_TOTAL_LINES) {
        return lines.join('\n');
    }

    // Head + tail with summary
    const head = lines.slice(0, HEAD_LINES);
    const tail = lines.slice(-TAIL_LINES);
    const skipped = lines.length - HEAD_LINES - TAIL_LINES;

    return [
        ...head,
        '',
        `... (${skipped} lines omitted, ${lines.length} total)`,
        '',
        ...tail
    ].join('\n');
}
