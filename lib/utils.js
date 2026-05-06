/**
 * Shared utilities: sleep, parsing, file IO helpers.
 * Pure functions, no side effects beyond fs read.
 */
import fs from 'fs';

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomDelay(min = 1000, max = 3000) {
    return sleep(Math.floor(Math.random() * (max - min + 1)) + min);
}

export function parseProxy(proxyString) {
    try {
        const url = new URL(proxyString.trim());
        return {
            server: `${url.protocol}//${url.hostname}:${url.port}`,
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            raw: proxyString.trim()
        };
    } catch (e) {
        return null;
    }
}

export function loadLines(filePath) {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
}

export function writeLines(filePath, lines) {
    fs.writeFileSync(filePath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf-8');
}

export function appendLine(filePath, line) {
    fs.appendFileSync(filePath, line + '\n', 'utf-8');
}

export function maskKey(key) {
    if (!key || typeof key !== 'string' || key.length < 12) return '***';
    return `${key.slice(0, 8)}…${key.slice(-6)}`;
}
