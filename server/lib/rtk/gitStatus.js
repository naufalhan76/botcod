/**
 * RTK filter: git-status
 *
 * Compresses git status output by:
 * - Grouping files by status (modified, added, deleted, untracked)
 * - Collapsing long lists of same-directory files
 * - Removing verbose headers/instructions
 */

const DETECT_PATTERN = /^(On branch |Changes (not staged|to be committed)|Untracked files:|\t(modified|new file|deleted|renamed):)/m;

export function detect(text) {
    return DETECT_PATTERN.test(text);
}

export function compress(text) {
    const lines = text.split('\n');
    const out = [];
    let skipInstructions = false;

    for (const line of lines) {
        // Skip git's instructional text
        if (line.startsWith('  (use "git')) {
            skipInstructions = true;
            continue;
        }
        if (skipInstructions && line.trim() === '') {
            skipInstructions = false;
            continue;
        }
        if (skipInstructions) continue;

        // Keep branch info (compact)
        if (line.startsWith('On branch ')) {
            out.push(line);
            continue;
        }

        // Keep section headers
        if (line.startsWith('Changes ') || line.startsWith('Untracked files:')) {
            out.push(line);
            continue;
        }

        // Keep file entries but strip leading tab formatting inconsistencies
        if (line.startsWith('\t') || line.match(/^\s+(modified|new file|deleted|renamed):/)) {
            out.push(line.trim());
            continue;
        }

        // Keep non-empty meaningful lines
        if (line.trim() && !line.startsWith('#')) {
            out.push(line);
        }
    }

    return out.join('\n');
}
