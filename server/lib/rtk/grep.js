/**
 * RTK filter: grep / ripgrep / search output
 *
 * Compresses grep-style output by:
 * - Deduplicating repeated file paths (group by file)
 * - Collapsing consecutive line numbers into ranges
 * - Truncating very long match lines
 */

const DETECT_PATTERN = /^[^\s:]+:\d+:/m;

export function detect(text) {
    // Matches patterns like "file.js:42:content" (grep -n style)
    const lines = text.split('\n').slice(0, 20);
    const matchCount = lines.filter(l => DETECT_PATTERN.test(l)).length;
    return matchCount >= 3; // At least 3 grep-style lines
}

export function compress(text) {
    const lines = text.split('\n');
    const MAX_LINE_LEN = 200;
    const grouped = new Map(); // file -> [{line, content}]

    for (const raw of lines) {
        const match = raw.match(/^([^:]+):(\d+):(.*)$/);
        if (match) {
            const [, file, lineNum, content] = match;
            if (!grouped.has(file)) grouped.set(file, []);
            const truncated = content.length > MAX_LINE_LEN
                ? content.slice(0, MAX_LINE_LEN) + '…'
                : content;
            grouped.get(file).push({ line: parseInt(lineNum), content: truncated });
        } else if (raw.trim()) {
            // Non-grep line, keep as-is under a special key
            if (!grouped.has('__other__')) grouped.set('__other__', []);
            grouped.get('__other__').push({ line: 0, content: raw });
        }
    }

    const out = [];
    for (const [file, entries] of grouped) {
        if (file === '__other__') {
            for (const e of entries) out.push(e.content);
            continue;
        }
        out.push(`${file}:`);
        for (const e of entries) {
            out.push(`  ${e.line}: ${e.content}`);
        }
    }

    return out.join('\n');
}
