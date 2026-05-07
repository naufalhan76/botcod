/**
 * RTK filter: dedup-log
 *
 * Compresses log output by:
 * - Deduplicating consecutive identical/similar lines
 * - Collapsing repeated patterns into "... (repeated N times)"
 * - Keeping first and last occurrence
 */

export function detect(text) {
    const lines = text.split('\n');
    if (lines.length < 10) return false;

    // Check for repeated lines (>30% duplication = log-like)
    const seen = new Map();
    for (const l of lines) {
        const normalized = l.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?/g, '<TS>')
            .replace(/\d+\.\d+ms/g, '<DUR>')
            .replace(/\b[0-9a-f]{8,}\b/g, '<HEX>');
        seen.set(normalized, (seen.get(normalized) || 0) + 1);
    }
    const dupes = [...seen.values()].filter(v => v > 1).reduce((a, b) => a + b, 0);
    return dupes / lines.length > 0.3;
}

export function compress(text) {
    const lines = text.split('\n');
    const out = [];
    let lastNormalized = '';
    let repeatCount = 0;
    let lastRaw = '';

    function normalize(line) {
        return line
            .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?/g, '<TS>')
            .replace(/\d+\.\d+ms/g, '<DUR>')
            .replace(/\b[0-9a-f]{8,}\b/g, '<HEX>')
            .replace(/\d+/g, '<N>');
    }

    for (const line of lines) {
        const norm = normalize(line);
        if (norm === lastNormalized) {
            repeatCount++;
            lastRaw = line;
        } else {
            if (repeatCount > 1) {
                out.push(`... (repeated ${repeatCount} times)`);
                out.push(lastRaw); // show last occurrence
            } else if (repeatCount === 1) {
                out.push(lastRaw);
            }
            out.push(line);
            lastNormalized = norm;
            lastRaw = line;
            repeatCount = 0;
        }
    }

    // Flush
    if (repeatCount > 1) {
        out.push(`... (repeated ${repeatCount} times)`);
        out.push(lastRaw);
    } else if (repeatCount === 1) {
        out.push(lastRaw);
    }

    return out.join('\n');
}
