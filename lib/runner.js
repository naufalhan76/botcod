/**
 * Bot job runner: process N accounts with proxy rotation + retry,
 * append API keys to codebuddy_keys.txt, emit progress events.
 *
 * Both the original CLI (index.js) and the dashboard server use this.
 */
import { Camoufox } from 'camoufox-js';
import path from 'path';
import { EventEmitter } from 'events';
import { sleep, parseProxy, appendLine } from './utils.js';
import { processUnlucid } from './unlucid.js';
import { processCodeBuddy } from './codebuddy.js';

const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_RETRIES = 3;

async function withRetry(page, fn, label, log, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            const isLastAttempt = attempt === maxRetries;
            if (isLastAttempt) {
                log(`[X] ${label}: All ${maxRetries} attempts failed. Last error: ${error.message}`);
                throw error;
            }
            log(`[!] ${label}: Attempt ${attempt}/${maxRetries} failed - ${error.message}`);
            log(`[*] Refreshing browser and retrying in 3s... (attempt ${attempt + 1}/${maxRetries})`);
            try {
                await page.goto('about:blank', { timeout: 10000 }).catch(() => {});
            } catch (e) {}
            await sleep(3000);
        }
    }
}

export async function processAccount({
    email,
    password,
    proxy,
    mode,
    headless = true,
    log = console.log,
    timeout = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES
}) {
    const proxyConfig = parseProxy(proxy);
    if (!proxyConfig) {
        return { email, success: false, error: 'Invalid proxy', apiKey: null };
    }

    log(`[PROXY] ${proxy}`);
    log(`[PROXY INFO] Server: ${proxyConfig.server} | User: ${proxyConfig.username}`);

    let browser = null;
    let unlucidSuccess = false;
    let codebuddySuccess = false;
    let apiKey = null;

    try {
        log(`[*] Launching Camoufox browser (headless=${headless})...`);
        browser = await Camoufox({
            headless,
            proxy: {
                server: proxyConfig.server,
                username: proxyConfig.username,
                password: proxyConfig.password
            }
        });

        const context = browser.contexts()[0] || await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(timeout);
        page.setDefaultNavigationTimeout(timeout);

        if (mode === 1 || mode === 3) {
            log(`[UNLUCID] Starting Unlucid.ai signup...`);
            try {
                await withRetry(page, async (attempt) => {
                    if (attempt > 1) log(`[UNLUCID] Retry attempt ${attempt}/${maxRetries}...`);
                    const success = await processUnlucid(page, email, password, log, { timeout });
                    if (success) {
                        unlucidSuccess = true;
                        log(`[OK] UNLUCID: ${email} signed up successfully!`);
                    }
                    return success;
                }, 'UNLUCID', log, maxRetries);
            } catch (error) {
                log(`[X] UNLUCID FAILED after ${maxRetries} attempts: ${error.message}`);
            }
            await sleep(2000);
        }

        if (mode === 2 || mode === 3) {
            log(`[CODEBUDDY] Starting CodeBuddy.ai signup...`);
            try {
                await withRetry(page, async (attempt) => {
                    if (attempt > 1) log(`[CODEBUDDY] Retry attempt ${attempt}/${maxRetries}...`);
                    const key = await processCodeBuddy(page, email, password, log, { timeout });
                    if (key) {
                        apiKey = key;
                        codebuddySuccess = true;
                        log(`[OK] CODEBUDDY: ${email} registered + API key obtained!`);
                    } else {
                        throw new Error('Registered but API key was null');
                    }
                    return key;
                }, 'CODEBUDDY', log, maxRetries);
            } catch (error) {
                log(`[X] CODEBUDDY FAILED after ${maxRetries} attempts: ${error.message}`);
            }
        }

        await browser.close();

        const success = (mode === 1 && unlucidSuccess) ||
                        (mode === 2 && codebuddySuccess) ||
                        (mode === 3 && (unlucidSuccess || codebuddySuccess));

        return { email, success, error: null, apiKey, unlucidSuccess, codebuddySuccess };

    } catch (error) {
        log(`[X] FAILED: ${email} - ${error.message}`);
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        return { email, success: false, error: error.message, apiKey: null, unlucidSuccess, codebuddySuccess };
    }
}

/**
 * Run a batch of accounts. Emits events:
 *   'log'      - { email, line }
 *   'progress' - { current, total, email, result }
 *   'done'     - { results }
 *
 * Pass an AbortSignal-like { aborted: bool } to stop mid-batch.
 */
export function runBatch({
    accounts,
    proxies,
    mode,
    headless = true,
    keysOutputFile,
    abortFlag = { aborted: false },
    timeout = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES
} = {}) {
    const emitter = new EventEmitter();

    (async () => {
        const results = [];
        const total = accounts.length;

        for (let i = 0; i < total; i++) {
            if (abortFlag.aborted) {
                emitter.emit('log', { email: null, line: '[*] Aborted by user.' });
                break;
            }

            const accountLine = accounts[i];
            const [emailRaw, ...passParts] = accountLine.split(':');
            const email = emailRaw && emailRaw.trim();
            const password = passParts.join(':').trim();

            if (!email || !password) {
                const r = { email: accountLine, success: false, error: 'Invalid format', apiKey: null };
                results.push(r);
                emitter.emit('progress', { current: i + 1, total, email: accountLine, result: r });
                continue;
            }

            const proxy = proxies[i % proxies.length];
            const log = (line) => emitter.emit('log', { email, line });

            log(`[${i + 1}/${total}] Processing: ${email}`);

            const result = await processAccount({
                email, password, proxy, mode, headless, log, timeout, maxRetries
            });
            results.push(result);

            if ((mode === 2 || mode === 3) && result.apiKey && keysOutputFile) {
                try {
                    appendLine(keysOutputFile, `${email}:${result.apiKey}`);
                    log(`[SAVED] ${email}:${result.apiKey.substring(0, 15)}... >> ${path.basename(keysOutputFile)}`);
                } catch (e) {
                    log(`[!] Failed to save key: ${e.message}`);
                }
            }

            emitter.emit('progress', { current: i + 1, total, email, result });

            if (i < total - 1 && !abortFlag.aborted) {
                const delay = Math.floor(Math.random() * 2000) + 2000;
                emitter.emit('log', { email: null, line: `[*] Waiting ${(delay / 1000).toFixed(1)}s before next account...` });
                await sleep(delay);
            }
        }

        emitter.emit('done', { results });
    })().catch(err => {
        emitter.emit('log', { email: null, line: `[FATAL] ${err.message}` });
        emitter.emit('done', { results: [], error: err.message });
    });

    return emitter;
}
