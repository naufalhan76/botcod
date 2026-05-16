/**
 * Bot job runner: process N accounts with proxy rotation + retry,
 * append API keys to codebuddy_keys.txt, emit progress events.
 *
 * Both the original CLI (index.js) and the dashboard server use this.
 */
import { Camoufox } from 'camoufox-js';
import { launch as launchCloak } from 'cloakbrowser';
import path from 'path';
import { EventEmitter } from 'events';
import { sleep, parseProxy, appendLine, writeLines } from './utils.js';
import { processUnlucid } from './unlucid.js';
import { processCodeBuddy } from './codebuddy.js';
import { processKiro } from './kiro.js';
import { processKiroUpgrade } from './kiroUpgrade.js';
import { saveKiroToken } from './kiroTokens.js';

const VALID_ENGINES = ['camoufox', 'cloakbrowser'];

const MODE_UNLUCID = 1;
const MODE_CODEBUDDY = 2;
const MODE_KIRO = 4;
const MODE_KIRO_UPGRADE = 8;

const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_RETRIES = 3;

function abortReason(abortFlag) {
    return abortFlag?.reason || 'Aborted by user';
}

function isAbortError(error, abortFlag) {
    return !!abortFlag?.aborted;
}

function throwIfAborted(abortFlag) {
    if (abortFlag?.aborted) throw new Error(abortReason(abortFlag));
}

function onAbort(abortFlag, cb) {
    if (!abortFlag) return () => {};
    if (!abortFlag._listeners) abortFlag._listeners = new Set();
    if (abortFlag.aborted) {
        queueMicrotask(() => cb(abortReason(abortFlag)));
        return () => {};
    }
    abortFlag._listeners.add(cb);
    return () => abortFlag._listeners.delete(cb);
}

function abortableSleep(ms, abortFlag) {
    if (!abortFlag) return sleep(ms);
    throwIfAborted(abortFlag);
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(done, ms);
        const off = onAbort(abortFlag, (reason) => {
            clearTimeout(timeoutId);
            off();
            reject(new Error(reason));
        });
        function done() {
            off();
            resolve();
        }
    });
}

export function requestAbort(abortFlag, reason = 'Aborted by user') {
    if (!abortFlag || abortFlag.aborted) return;
    abortFlag.aborted = true;
    abortFlag.reason = reason;
    for (const cb of [...(abortFlag._listeners || [])]) {
        try { cb(reason); } catch {}
    }
}

async function withRetry(page, fn, label, log, maxRetries, abortFlag) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        throwIfAborted(abortFlag);
        try {
            return await fn(attempt);
        } catch (error) {
            if (isAbortError(error, abortFlag)) {
                throw new Error(abortReason(abortFlag));
            }
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
            await abortableSleep(3000, abortFlag);
        }
    }
}

export async function processAccount({
    email,
    password,
    proxy,
    mode,
    headless = true,
    browserEngine = 'camoufox',
    log = console.log,
    timeout = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
    abortFlag = { aborted: false },
    manualLogin = false
}) {
    throwIfAborted(abortFlag);
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
    let kiroUpgradeSuccess = false;
    let kiroUpgradeError = null;
    let apiKey = null;
    let kiroCred = null;
    let removeAbortListener = null;
    let browserCloseStarted = false;

    const engine = VALID_ENGINES.includes(browserEngine) ? browserEngine : 'camoufox';

    try {
        log(`[*] Launching ${engine} browser (headless=${headless})...`);

        if (engine === 'cloakbrowser') {
            // CloakBrowser + HTTP proxy breaks Google OAuth (known issue).
            // Convert to SOCKS5 which works reliably with all sites.
            const rawProxy = proxyConfig.raw || proxy;
            const socksProxy = rawProxy.replace(/^https?:\/\//, 'socks5://');
            browser = await launchCloak({
                headless,
                proxy: socksProxy,
                geoip: false
            });
        } else {
            browser = await Camoufox({
                headless,
                os: 'windows',
                block_webrtc: true,
                geoip: false,
                proxy: {
                    server: proxyConfig.server,
                    username: proxyConfig.username,
                    password: proxyConfig.password
                }
            });
        }
        throwIfAborted(abortFlag);

        removeAbortListener = onAbort(abortFlag, () => {
            if (!browser || browserCloseStarted) return;
            browserCloseStarted = true;
            log(`[!] Abort requested — closing active browser session...`);
            browser.close().catch(() => {});
        });

        // CloakBrowser launch() returns a bare Browser — always create a new context.
        // Camoufox may already have a default context from its wrapper.
        const context = (browser.contexts && browser.contexts().length > 0)
            ? browser.contexts()[0]
            : await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(timeout);
        page.setDefaultNavigationTimeout(timeout);

        if (mode & MODE_UNLUCID) {
            throwIfAborted(abortFlag);
            log(`[UNLUCID] Starting Unlucid.ai signup...`);
            try {
                await withRetry(page, async (attempt) => {
                    throwIfAborted(abortFlag);
                    if (attempt > 1) log(`[UNLUCID] Retry attempt ${attempt}/${maxRetries}...`);
                    const success = await processUnlucid(page, email, password, log, { timeout });
                    if (success) {
                        unlucidSuccess = true;
                        log(`[OK] UNLUCID: ${email} signed up successfully!`);
                    }
                    return success;
                }, 'UNLUCID', log, maxRetries, abortFlag);
            } catch (error) {
                if (isAbortError(error, abortFlag)) throw error;
                log(`[X] UNLUCID FAILED after ${maxRetries} attempts: ${error.message}`);
            }
            await abortableSleep(2000, abortFlag);
        }

        if (mode & MODE_CODEBUDDY) {
            throwIfAborted(abortFlag);
            log(`[CODEBUDDY] Starting CodeBuddy.ai signup...`);
            try {
                await withRetry(page, async (attempt) => {
                    throwIfAborted(abortFlag);
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
                }, 'CODEBUDDY', log, maxRetries, abortFlag);
            } catch (error) {
                if (isAbortError(error, abortFlag)) throw error;
                log(`[X] CODEBUDDY FAILED after ${maxRetries} attempts: ${error.message}`);
            }
        }

        if (mode & MODE_KIRO) {
            throwIfAborted(abortFlag);
            log(`[KIRO] Starting Kiro IDE signup...`);
            try {
                await withRetry(page, async (attempt) => {
                    throwIfAborted(abortFlag);
                    if (attempt > 1) log(`[KIRO] Retry attempt ${attempt}/${maxRetries}...`);
                    const cred = await processKiro(page, email, password, log, { timeout, manualLogin });
                    if (cred && cred.refreshToken) {
                        kiroCred = { ...cred, label: `${email} (BuilderID)`, auth: cred.auth || 'Social' };
                        kiroSuccess = true;
                        log(`[OK] KIRO: ${email} signed up + refreshToken extracted!`);
                        try {
                            saveKiroToken(email, cred);
                            log(`[TOKEN] Saved refresh token for ${email} to kiro_tokens.json`);
                        } catch (e) {
                            log(`[!] Failed to persist Kiro token: ${e.message}`);
                        }
                    } else {
                        throw new Error('Kiro flow finished but no refreshToken returned');
                    }
                    return cred;
                }, 'KIRO', log, maxRetries, abortFlag);
            } catch (error) {
                if (isAbortError(error, abortFlag)) throw error;
                log(`[X] KIRO FAILED after ${maxRetries} attempts: ${error.message}`);
            }
        }

        if ((mode & MODE_KIRO_UPGRADE) && kiroSuccess) {
            throwIfAborted(abortFlag);
            log(`[KIRO-UPGRADE] Starting Kiro plan upgrade...`);
            try {
                await withRetry(page, async (attempt) => {
                    throwIfAborted(abortFlag);
                    if (attempt > 1) log(`[KIRO-UPGRADE] Retry attempt ${attempt}/${maxRetries}...`);
                    const res = await processKiroUpgrade(page, email, log);
                    if (res?.upgraded) {
                        kiroUpgradeSuccess = true;
                        log(`[OK] KIRO-UPGRADE: ${email} upgraded to ${res.plan}`);
                    } else {
                        throw new Error('Upgrade flow finished without upgraded=true');
                    }
                    return res;
                }, 'KIRO-UPGRADE', log, maxRetries, abortFlag);
            } catch (error) {
                if (isAbortError(error, abortFlag)) throw error;
                kiroUpgradeError = error.message;
                log(`[X] KIRO-UPGRADE FAILED after ${maxRetries} attempts: ${error.message}`);
            }
        } else if (mode & MODE_KIRO_UPGRADE) {
            log(`[KIRO-UPGRADE] Skipped — Kiro signup did not succeed for ${email}`);
            kiroUpgradeError = 'Skipped: Kiro signup did not succeed';
        }

        if (removeAbortListener) removeAbortListener();
        removeAbortListener = null;
        if (!browserCloseStarted) await browser.close();

        const askedFor = [];
        if (mode & MODE_UNLUCID) askedFor.push(unlucidSuccess);
        if (mode & MODE_CODEBUDDY) askedFor.push(codebuddySuccess);
        if (mode & MODE_KIRO) askedFor.push(kiroSuccess);
        if (mode & MODE_KIRO_UPGRADE) askedFor.push(kiroUpgradeSuccess);
        const success = askedFor.length > 0 && askedFor.some(Boolean);

        return {
            email, success, error: null, apiKey, kiroCred,
            unlucidSuccess, codebuddySuccess, kiroSuccess, kiroUpgradeSuccess, kiroUpgradeError
        };

    } catch (error) {
        if (removeAbortListener) removeAbortListener();
        log(`[X] FAILED: ${email} - ${error.message}`);
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        return {
            email, success: false, error: error.message, apiKey: null, kiroCred: null,
            unlucidSuccess, codebuddySuccess, kiroSuccess, kiroUpgradeSuccess, kiroUpgradeError
        };
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
    browserEngine = 'camoufox',
    keysOutputFile,
    onKiroCred = null,
    abortFlag = { aborted: false },
    timeout = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
    concurrency = 1,
    failedOutputDir = null,
    manualLogin = false
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
                    if (abortFlag.aborted) {
                        releaseProxy(proxy);
                        return;
                    }
                    const proxyLabel = (() => {
                        const p = parseProxy(proxy);
                        if (!p) return proxy;
                        try { return new URL(p.server).host; } catch { return p.server || proxy; }
                    })();
                    log(`[${i + 1}/${total}] Processing: ${email} (proxy ${proxyLabel})`);

                    let result;
                    try {
                        result = await processAccount({
                            email, password, proxy, mode, headless, browserEngine, log, timeout, maxRetries, abortFlag, manualLogin
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
                        await abortableSleep(delay, abortFlag);
                    }
                }
            })().catch(err => {
                if (!abortFlag.aborted) {
                    emitter.emit('log', { email: null, line: `[W${slot}] [FATAL] ${err.message}`, slot });
                }
            });
        });

        await Promise.all(workers);
        // Drop empty slots from skipped/aborted positions so consumers see a tight array.
        const finalResults = results.filter(r => r !== undefined);

        // Write per-service failed account files for easy retry.
        const failedFiles = {};
        if (failedOutputDir) {
            const accountMap = new Map();
            for (let i = 0; i < accounts.length; i++) {
                const [emailRaw, ...passParts] = accounts[i].split(':');
                const email = emailRaw?.trim();
                if (email) accountMap.set(email, accounts[i]);
            }

            const serviceChecks = [
                { flag: MODE_UNLUCID,      key: 'unlucidSuccess',      file: 'failed_unlucid.txt' },
                { flag: MODE_CODEBUDDY,    key: 'codebuddySuccess',    file: 'failed_codebuddy.txt' },
                { flag: MODE_KIRO,         key: 'kiroSuccess',         file: 'failed_kiro.txt' },
                { flag: MODE_KIRO_UPGRADE, key: 'kiroUpgradeSuccess',  file: 'failed_kiro_upgrade.txt' },
            ];

            for (const svc of serviceChecks) {
                if (!(mode & svc.flag)) continue;
                const failedLines = finalResults
                    .filter(r => !r[svc.key])
                    .map(r => accountMap.get(r.email) || r.email)
                    .filter(Boolean);
                const filePath = path.join(failedOutputDir, svc.file);
                if (failedLines.length > 0) {
                    writeLines(filePath, failedLines);
                    failedFiles[svc.file] = { count: failedLines.length, path: filePath };
                }
            }
        }

        emitter.emit('done', { results: finalResults, failedFiles });
    })().catch(err => {
        emitter.emit('log', { email: null, line: `[FATAL] ${err.message}` });
        emitter.emit('done', { results: [], error: err.message });
    });

    return emitter;
}
