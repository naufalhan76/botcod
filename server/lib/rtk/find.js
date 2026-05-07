/**
 * RTK filter: find / ls / tree output
 *
 * Compresses file listing output by:
 * - Collapsing common directory prefixes
 * - Grouping files by directory
 * - Truncating very long listings
 */

const TREE_DETECT = /^[│├└─\s]+/m;
const PATH_DETECT = /^(\.\/|\/)[^\s]+$/m;

export function detect(text) {
    const lines = text.split('\n').slice(0, 30);
    // Tree-style output
    if (lines.filter(l => TREE_DETECT.test(l)).length >= 3) return true;
    // Path-per-line output (find style)
    if (lines.filter(l => PATH_DETECT.test(l)).length >= 5) return true;
    // ls -la style
    if (lines.filter(l => /^[drwx-]{10}/.test(l)).length >= 3) return true;
    return false;
}

export function compress(text) {
    const lines = text.split('\n');

    // If it's tree output, keep as-is (already compact)
    if (lines.filter(l => TREE_DETECT.test(l)).length >= 3) {
        // Just truncate if too long
        if (lines.length > 100) {
            return lines.slice(0, 100).join('\n') + `\n... (${lines.length - 100} more entries)`;
        }
        return text;
    }

    // For find-style output: group by directory
    const dirs = new Map();
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const lastSlash = trimmed.lastIndexOf('/');
        if (lastSlash > 0) {
            const dir = trimmed.slice(0, lastSlash);
            const file = trimmed.slice(lastSlash + 1);
            if (!dirs.has(dir)) dirs.set(dir, []);
            dirs.get(dir).push(file);
        } else {
            if (!dirs.has('.')) dirs.set('.', []);
            dirs.get('.').push(trimmed);
        }
    }

    const out = [];
    for (const [dir, files] of dirs) {
        if (files.length <= 3) {
            for (const f of files) out.push(`${dir}/${f}`);
        } else {
            out.push(`${dir}/ (${files.length} files): ${files.slice(0, 5).join(', ')}${files.length > 5 ? `, ... +${files.length - 5} more` : ''}`);
        }
    }

    return out.join('\n');
}
