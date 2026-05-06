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
import { processKiro } from './kiro.js';

const MODE_UNLUCID = 1;
const MODE_CODEBUDDY = 2;
const MODE_KIRO = 4;

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
    let kiroSuccess = false;
    let apiKey = null;
    let kiroCred = null;

    try {
        log(`[*] Launching Camoufox browser (headless=${headless})...`);
        browser = await Camoufox({
            headless,
            os: 'windows',
            block_webrtc: true,
            geoip: true,
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

        if (mode & MODE_UNLUCID) {
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

        if (mode & MODE_CODEBUDDY) {
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

        if (mode & MODE_KIRO) {
            log(`[KIRO] Starting Kiro IDE signup...`);
            try {
                await withRetry(page, async (attempt) => {
                    if (attempt > 1) log(`[KIRO] Retry attempt ${attempt}/${maxRetries}...`);
                    const cred = await processKiro(page, email, password, log, { timeout });
                    if (cred && cred.refreshToken) {
                        kiroCred = { ...cred, label: `${email} (BuilderID)`, auth: cred.auth || 'Social' };
                        kiroSuccess = true;
                        log(`[OK] KIRO: ${email} signed up + refreshToken extracted!`);
                    } else {
                        throw new Error('Kiro flow finished but no refreshToken returned');
                    }
                    return cred;
                }, 'KIRO', log, maxRetries);
            } catch (error) {
                log(`[X] KIRO FAILED after ${maxRetries} attempts: ${error.message}`);
            }
        }

        await browser.close();

        const askedFor = [];
        if (mode & MODE_UNLUCID) askedFor.push(unlucidSuccess);
        if (mode & MODE_CODEBUDDY) askedFor.push(codebuddySuccess);
        if (mode & MODE_KIRO) askedFor.push(kiroSuccess);
        const success = askedFor.length > 0 && askedFor.some(Boolean);

        return { email, success, error: null, apiKey, kiroCred, unlucidSuccess, codebuddySuccess, kiroSuccess };

    } catch (error) {
        log(`[X] FAILED: ${email} - ${error.message}`);
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        return { email, success: false, error: error.message, apiKey: null, kiroCred: null, unlucidSuccess, codebuddySuccess, kiroSuccess };
    }
}

/**
 * Run a batch of accounts. Emits events:
 *   'log'      - { email, line, slot }
 *   'progress' - { current, total, email, result, slot }
 *   'done'     - { results }
 *
 * Pass an AbortSignal-like { aborted: bool } to stop mid-batch.
 *
 * `concurrency` controls how many browser sessions run in parallel. Each
 * worker holds its own proxy for the lifetime of an account so two parallel
 * workers never share an IP. Requires `proxies.length >= concurrency`.
 */
export function runBatch({
    accounts,
    proxies,
    mode,
    headless = true,
    keysOutputFile,
    onKiroCred = null,
    abortFlag = { aborted: false },
    timeout = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
    concurrency = 1
} = {}) {
    const emitter = new EventEmitter();
    concurrency = Math.max(1, Math.floor(concurrency));

    (async () => {
        // Yield once so the caller has a tick to attach listeners before we
        // emit early-exit events (e.g. FATAL on bad proxy/account counts).
        await Promise.resolve();
        const total = accounts.length;
        if (total === 0) { emitter.emit('done', { results: [] }); return; }
        if (proxies.length < concurrency) {
            emitter.emit('log', { email: null, line: `[FATAL] concurrency=${concurrency} requires at least ${concurrency} proxies (have ${proxies.length}).` });
            emitter.emit('done', { results: [], error: `concurrency=${concurrency} > proxies=${proxies.length}` });
            return;
        }

        // Result slots keyed by original account index so output order matches input.
        const results = new Array(total);
        let completedCount = 0;
        let nextIdx = 0;

        // Round-robin proxy claimer that guarantees no two parallel workers
        // hold the same proxy at the same time, while still rotating through
        // ALL available proxies across sequential accounts (so concurrency=1
        // still rotates proxy per account like the old behaviour).
        const claimed = new Set();
        const claimQueue = [];
        let proxyCursor = 0;

        function claimProxy() {
            for (let k = 0; k < proxies.length; k++) {
                const p = proxies[(proxyCursor + k) % proxies.length];
                if (!claimed.has(p)) {
                    claimed.add(p);
                    proxyCursor = (proxies.indexOf(p) + 1) % proxies.length;
                    return Promise.resolve(p);
                }
            }
            return new Promise(resolve => claimQueue.push(resolve));
        }
        function releaseProxy(p) {
            const next = claimQueue.shift();
            if (next) next(p);          // hand-off without unmarking
            else claimed.delete(p);
        }

        const workers = Array.from({ length: concurrency }, (_, slotIdx) => {
            const slot = slotIdx + 1;
            return (async () => {
                while (true) {
                    if (abortFlag.aborted) return;
                    const i = nextIdx++;
                    if (i >= total) return;

                    const accountLine = accounts[i];
                    const [emailRaw, ...passParts] = accountLine.split(':');
                    const email = emailRaw && emailRaw.trim();
                    const password = passParts.join(':').trim();
                    const tag = concurrency > 1 ? `[W${slot}] ` : '';
                    const log = (line) => emitter.emit('log', { email, line: tag + line, slot });

                    if (!email || !password) {
                        const r = { email: accountLine, success: false, error: 'Invalid format', apiKey: null };
                        results[i] = r;
                        completedCount++;
                        emitter.emit('progress', { current: completedCount, total, email: accountLine, result: r, slot });
                        continue;
                    }

                    const proxy = await claimProxy();
                    const proxyLabel = (() => {
                        const p = parseProxy(proxy);
                        if (!p) return proxy;
                        try { return new URL(p.server).host; } catch { return p.server || proxy; }
                    })();
                    log(`[${i + 1}/${total}] Processing: ${email} (proxy ${proxyLabel})`);

                    let result;
                    try {
                        result = await processAccount({
                            email, password, proxy, mode, headless, log, timeout, maxRetries
                        });
                    } catch (err) {
                        result = { email, success: false, error: err.message || String(err), apiKey: null };
                    } finally {
                        releaseProxy(proxy);
                    }
                    results[i] = result;

                    if ((mode & MODE_CODEBUDDY) && result.apiKey && keysOutputFile) {
                        try {
                            appendLine(keysOutputFile, `${email}:${result.apiKey}`);
                            log(`[SAVED] ${email}:${result.apiKey.substring(0, 15)}... >> ${path.basename(keysOutputFile)}`);
                        } catch (e) {
                            log(`[!] Failed to save key: ${e.message}`);
                        }
                    }

                    if ((mode & MODE_KIRO) && result.kiroCred && onKiroCred) {
                        try {
                            await onKiroCred(result.kiroCred);
                            log(`[SAVED] Kiro credential added to pool for ${email}`);
                        } catch (e) {
                            log(`[!] Failed to save Kiro credential: ${e.message}`);
                        }
                    }

                    completedCount++;
                    emitter.emit('progress', { current: completedCount, total, email, result, slot });

                    if (completedCount < total && !abortFlag.aborted) {
                        // Small jittered cooldown so workers don't slam the upstream
                        // simultaneously after a synchronous batch boundary.
                        const delay = Math.floor(Math.random() * 2000) + 1000;
                        await sleep(delay);
                    }
                }
            })().catch(err => {
                emitter.emit('log', { email: null, line: `[W${slot}] [FATAL] ${err.message}`, slot });
            });
        });

        await Promise.all(workers);
        // Drop empty slots from skipped/aborted positions so consumers see a tight array.
        emitter.emit('done', { results: results.filter(r => r !== undefined) });
    })().catch(err => {
        emitter.emit('log', { email: null, line: `[FATAL] ${err.message}` });
        emitter.emit('done', { results: [], error: err.message });
    });

    return emitter;
}
