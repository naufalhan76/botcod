/**
 * Kiro IDE signup flow.
 *
 * This mirrors the working enowxai flow: use Kiro's desktop OAuth endpoint
 * directly with PKCE, complete Google login inside the Playwright-controlled
 * Camoufox page, intercept the final kiro:// redirect, then exchange the
 * authorization code for Social refresh/access tokens.
 */
import crypto from 'crypto';
import { sleep } from './utils.js';
import { handleGoogleLogin } from './google.js';

const KIRO_AUTH_BASE = process.env.BATCHER_KIRO_AUTH_BASE || 'https://prod.us-east-1.auth.desktop.kiro.dev';
const KIRO_LOGIN_ENDPOINT = process.env.BATCHER_KIRO_LOGIN_ENDPOINT || `${KIRO_AUTH_BASE}/login`;
const KIRO_TOKEN_ENDPOINT = process.env.BATCHER_KIRO_TOKEN_ENDPOINT || `${KIRO_AUTH_BASE}/oauth/token`;
const KIRO_REDIRECT_URI = process.env.BATCHER_KIRO_REDIRECT_URI || 'kiro://kiro.kiroAgent/authenticate-success';

function base64Url(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function generatePkcePair() {
    const codeVerifier = base64Url(crypto.randomBytes(32));
    const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier, 'ascii').digest());
    return { codeVerifier, codeChallenge };
}

function extractCodeFromKiroUrl(url) {
    if (!url || !url.startsWith('kiro://')) return null;
    try {
        return new URL(url).searchParams.get('code');
    } catch {
        const m = url.match(/[?&]code=([^&]+)/);
        return m ? decodeURIComponent(m[1]) : null;
    }
}

function buildKiroLoginUrl(codeChallenge) {
    const params = new URLSearchParams({
        idp: 'Google',
        redirect_uri: KIRO_REDIRECT_URI,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: crypto.randomUUID()
    });
    return `${KIRO_LOGIN_ENDPOINT}?${params.toString()}`;
}

async function installKiroRedirectCapture(page, state) {
    const remember = (url) => {
        const code = extractCodeFromKiroUrl(url);
        if (code && !state.authCode) {
            state.authCode = code;
            return true;
        }
        return false;
    };

    // Method 1: Playwright response listener (Location header).
    const onResponse = (response) => {
        try {
            const headers = response.headers();
            remember(headers.location || headers.Location || '');
        } catch {}
    };
    page.on('response', onResponse);

    // Method 2: Playwright request listener.
    const onRequest = (request) => {
        try { remember(request.url()); } catch {}
    };
    page.on('request', onRequest);

    // Method 3: CDP Network events — most reliable for CloakBrowser (Chromium).
    // Chromium doesn't navigate to kiro:// but CDP still sees the redirect.
    let cdp = null;
    const onCdpRequest = (event) => {
        remember(event.request.url);
        if (event.redirectResponse) {
            const loc = event.redirectResponse.headers?.location
                     || event.redirectResponse.headers?.Location || '';
            remember(loc);
        }
    };
    const onCdpResponse = (event) => {
        const loc = event.response.headers?.location
                 || event.response.headers?.Location || '';
        remember(loc);
    };
    try {
        cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.enable');
        cdp.on('Network.requestWillBeSent', onCdpRequest);
        cdp.on('Network.responseReceived', onCdpResponse);
    } catch {
        // CDP not available (e.g. Firefox/Camoufox) — that's fine, other methods cover it.
        cdp = null;
    }

    // Method 4: Playwright route interceptor (works in Firefox/Camoufox).
    const routeHandler = async (route) => {
        if (state.authCode) {
            await route.continue();
            return;
        }
        const url = route.request().url();
        if (remember(url)) {
            await route.abort().catch(() => {});
            return;
        }
        await route.continue();
    };
    await page.route('**/*', routeHandler);

    // Return cleanup function to remove all handlers (critical for retries).
    return async () => {
        page.off('response', onResponse);
        page.off('request', onRequest);
        await page.unroute('**/*', routeHandler).catch(() => {});
        if (cdp) {
            cdp.off('Network.requestWillBeSent', onCdpRequest);
            cdp.off('Network.responseReceived', onCdpResponse);
            await cdp.detach().catch(() => {});
        }
    };
}

async function clickGenericContinue(page) {
    return page.evaluate(() => {
        const candidates = [
            '#submit_approve_access',
            '#gaplustosNext button',
            '#identifierNext button',
            '#passwordNext button',
            '#submit',
            '#confirm'
        ];
        for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) {
                el.click();
                return true;
            }
        }

        const keywords = [
            'next', 'continue', 'allow', 'accept', 'understand', 'agree', 'ok', 'got it', 'login', 'sign in',
            'berikutnya', 'lanjut', 'lanjutkan', 'izinkan', 'setuju', 'mengerti', 'masuk'
        ];
        for (const el of document.querySelectorAll('button, div[role="button"], input[type="submit"]')) {
            if (el.offsetParent === null) continue;
            const text = String(el.textContent || el.value || '').toLowerCase().trim();
            if (keywords.some(k => text.includes(k))) {
                el.click();
                return true;
            }
        }
        return false;
    }).catch(() => false);
}

async function waitForKiroAuthorizationCode(page, state, timeout) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (state.authCode) return state.authCode;

        const currentUrl = page.url();
        const currentCode = extractCodeFromKiroUrl(currentUrl);
        if (currentCode) {
            state.authCode = currentCode;
            return currentCode;
        }

        // SetSID intermediate redirect — just wait briefly
        if (currentUrl.includes('SetSID') || currentUrl.includes('accounts.youtube.com')) {
            await sleep(300);
            continue;
        }

        // Speedbump / workspace terms → click "I understand" immediately
        if (currentUrl.includes('speedbump') || currentUrl.includes('workspacetermsofservice')) {
            await page.evaluate(() => {
                const keywords = ['i understand', 'saya mengerti', 'accept', 'agree', 'continue', '我了解', '同意'];
                for (const btn of document.querySelectorAll('button, [role="button"], input[type="submit"]')) {
                    if (btn.offsetParent === null) continue;
                    const txt = (btn.textContent || btn.value || '').trim().toLowerCase();
                    if (keywords.some(k => txt.includes(k))) { btn.click(); return; }
                }
            }).catch(() => {});
            await sleep(500);
            continue;
        }

        // OAuth consent → click "Continue"/"Allow"
        if (currentUrl.includes('oauth') || currentUrl.includes('consent')) {
            await page.evaluate(() => {
                const approveBtn = document.querySelector('#submit_approve_access');
                if (approveBtn && approveBtn.offsetParent !== null) { approveBtn.click(); return; }
                const keywords = ['continue', 'allow', 'lanjutkan', 'izinkan', '继续', '允许'];
                for (const btn of document.querySelectorAll('button, [role="button"]')) {
                    if (btn.offsetParent === null) continue;
                    const txt = (btn.textContent || '').trim().toLowerCase();
                    if (keywords.some(k => txt === k || txt.includes(k))) { btn.click(); return; }
                }
            }).catch(() => {});
            await sleep(500);
            continue;
        }

        // Still on Google or unknown page — try generic continue
        await clickGenericContinue(page);
        await sleep(400);
    }
    throw new Error('Kiro authorization code not received');
}

async function exchangeKiroCode({ code, codeVerifier }) {
    const res = await fetch(KIRO_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code,
            code_verifier: codeVerifier,
            redirect_uri: KIRO_REDIRECT_URI
        })
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Kiro token endpoint rejected request (${res.status}): ${text.slice(0, 200)}`);
    }

    let payload;
    try {
        payload = JSON.parse(text);
    } catch (e) {
        throw new Error(`Kiro token JSON parse failed: ${e.message}`);
    }

    const accessToken = payload.accessToken || payload.access_token;
    const refreshToken = payload.refreshToken || payload.refresh_token;
    if (!accessToken) throw new Error('Kiro token response missing accessToken');
    if (!refreshToken) throw new Error('Kiro token response missing refreshToken');

    const expiresInSec = Number(payload.expiresIn || payload.expires_in || 3600);
    const expiresAtRaw = Number(payload.expiresAt || payload.expires_at || 0);
    const expiresAt = expiresAtRaw > 10_000_000_000
        ? expiresAtRaw
        : Date.now() + expiresInSec * 1000;

    return {
        auth: 'Social',
        accessToken,
        refreshToken,
        expiresAt,
        profileArn: payload.profileArn || payload.profile_arn || null
    };
}

export async function processKiro(page, email, password, log = console.log, opts = {}) {
    const TIMEOUT = opts.timeout || 90000;
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const authState = { authCode: null };

    log('[*] Starting direct Kiro OAuth (PKCE, no kiro-cli)...');
    const cleanupCapture = await installKiroRedirectCapture(page, authState);

    try {
        const loginUrl = buildKiroLoginUrl(codeChallenge);
        // CloakBrowser may ERR_ABORTED if a previous route handler is still active
        // or if the kiro:// redirect fires during navigation. Catch and continue.
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
            .catch(e => {
                if (!e.message?.includes('ERR_ABORTED')) throw e;
                log('[*] Kiro login navigation interrupted (redirect captured)');
            });
        await sleep(800);

        if (!authState.authCode) {
            try {
                if (!page.url().includes('accounts.google.com')) {
                    await page.waitForURL('**/accounts.google.com/**', { timeout: 15000 });
                }
                // Race Google login against auth code capture — CloakBrowser (Chromium)
                // captures the kiro:// redirect almost immediately after password entry,
                // but handleGoogleLogin blocks for ~45s in its post-login SetSID loop.
                await Promise.race([
                    handleGoogleLogin(page, email, password, log, { timeout: TIMEOUT }),
                    (async () => {
                        while (!authState.authCode) await sleep(300);
                        log('[+] Kiro auth code captured during Google login — skipping post-login wait');
                    })()
                ]);
            } catch (e) {
                if (!authState.authCode) {
                    log(`[!] Google login handler did not run cleanly: ${e.message}`);
                }
            }
        }

        log('[*] Waiting for Kiro OAuth callback...');
        const code = await waitForKiroAuthorizationCode(page, authState, TIMEOUT);

        log('[*] Exchanging Kiro authorization code for tokens...');
        const tokens = await exchangeKiroCode({ code, codeVerifier });
        log(`[+] Kiro Social credentials obtained (refresh_token=${tokens.refreshToken.length}c)`);
        return tokens;
    } finally {
        // Always clean up route/event handlers so retries don't stack
        await cleanupCapture();
    }
}
