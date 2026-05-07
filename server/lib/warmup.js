/**
 * Pool warmup — test each key/credential with a minimal request to verify
 * it's alive, and mark dead/cooldown accordingly. Returns a summary.
 */
import { getConfig } from './config.js';
import { listPool } from './keyPool.js';
import { markCooldown, markDead } from './keyPool.js';
import { buildUpstreamHeaders, classifyUpstreamError } from './translate.js';
import {
    listKiroCreds,
    getAccessTokenForCred,
    markKiroCooldown,
    markKiroDead
} from './providers/kiro/credentials.js';
import { getEntryByMaskedOrEmail } from './keyPool.js';

const log = (...args) => console.log('[warmup]', ...args);

const WARMUP_TIMEOUT_MS = 15_000;

/**
 * Warmup CodeBuddy pool — sends a tiny request per active key.
 *
 * Classification (inspired by enowxai's approach):
 *   - 200 OK                         → passed (key is fine)
 *   - 429 / quota / credits exhausted → mark cooldown (credits used up)
 *   - 401/403                         → keep status! CodeBuddy WAF can return
 *                                       403 for IP-level blocks, not key issues.
 *                                       Only mark dead if body explicitly says
 *                                       "invalid token" or "unauthorized".
 *   - Other errors (400, 500, etc)    → transient, keep status (account is valid)
 *   - Timeout / network error         → transient, keep status
 *
 * Returns { tested, ok, dead, cooldown, timeout }.
 */
export async function warmupCodeBuddy() {
    const cfg = getConfig();
    const pool = listPool();
    const activeEntries = pool.filter(e => e.status === 'active');

    const result = { tested: 0, ok: 0, dead: 0, cooldown: 0, timeout: 0 };

    const upstreamUrl = `${cfg.UPSTREAM_BASE}${cfg.UPSTREAM_PATH}`;
    const testBody = JSON.stringify({
        model: 'auto-chat',
        messages: [
            { role: 'system', content: 'Reply with one word.' },
            { role: 'user', content: 'Say OK' }
        ],
        stream: true
    });

    const tasks = activeEntries.map(async (entry) => {
        result.tested++;
        // Resolve the real key from the masked entry
        const real = getEntryByMaskedOrEmail(entry.email || entry.key_masked);
        if (!real) {
            result.dead++;
            return;
        }

        const headers = buildUpstreamHeaders(real.key);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);

        try {
            const res = await fetch(upstreamUrl, {
                method: 'POST',
                headers,
                body: testBody,
                signal: controller.signal
            });
            clearTimeout(timer);

            if (res.ok) {
                // Consume body to free connection
                await res.text().catch(() => {});
                result.ok++;
            } else {
                const bodyText = await res.text().catch(() => '');
                const klass = classifyUpstreamError(res.status, bodyText);

                if (klass === 'rate_limit' || klass === 'quota') {
                    // Credits genuinely exhausted — mark cooldown
                    markCooldown(real.key, `warmup_${klass}`);
                    result.cooldown++;
                } else if (klass === 'auth' && isDefinitiveAuthError(bodyText)) {
                    // Only mark dead if body EXPLICITLY says token is invalid/revoked.
                    // WAF/IP blocks also return 401/403 but the key itself is fine.
                    markDead(real.key, 'warmup_auth_revoked');
                    result.dead++;
                } else {
                    // Everything else: WAF block, transient error, 400 bad request,
                    // ambiguous 403 — keep the key active. Account is likely fine.
                    log(`warmup: transient ${res.status} for ${entry.key_masked}, keeping status`);
                    result.ok++;
                }
            }
        } catch (err) {
            clearTimeout(timer);
            // Network/timeout errors are infrastructure issues, not key issues
            if (err.name === 'AbortError') {
                log(`warmup: timeout for ${entry.key_masked}, keeping status`);
            } else {
                log(`warmup: network error for ${entry.key_masked}: ${err.message}, keeping status`);
            }
            result.timeout++;
        }
    });

    await Promise.all(tasks);
    log(`codebuddy warmup done: ${JSON.stringify(result)}`);
    return result;
}

/**
 * Determine if an auth error body indicates the key is TRULY revoked/invalid,
 * vs a WAF/IP block that happens to return 401/403.
 *
 * CodeBuddy WAF can return 403 for IP-level blocks — the key is fine, just
 * the IP is blocked. We only mark dead if the response body explicitly says
 * the token/key itself is bad.
 */
function isDefinitiveAuthError(bodyText) {
    if (!bodyText) return false;
    const lower = bodyText.toLowerCase();
    // Explicit token-level rejection signals
    if (lower.includes('invalid token')) return true;
    if (lower.includes('token expired')) return true;
    if (lower.includes('token revoked')) return true;
    if (lower.includes('api key') && lower.includes('invalid')) return true;
    if (lower.includes('unauthorized') && lower.includes('key')) return true;
    // CodeBuddy specific: code 11101 with "invalid" usually means bad key
    try {
        const j = JSON.parse(bodyText);
        if (j.code === 11101 && /invalid|expired|revoked/i.test(j.msg || j.message || '')) return true;
    } catch {}
    return false;
}

/**
 * Warmup Kiro pool — validates each active credential's access token.
 * Returns { tested, ok, dead, cooldown, timeout }.
 */
export async function warmupKiro() {
    const creds = listKiroCreds();
    const activeEntries = creds.filter(c => c.status === 'active');

    const result = { tested: 0, ok: 0, dead: 0, cooldown: 0, timeout: 0 };

    const tasks = activeEntries.map(async (entry) => {
        result.tested++;
        const idx = entry.idx;

        try {
            // Attempt to get a valid access token (triggers refresh if needed)
            await getAccessTokenForCred(idx);
            result.ok++;
        } catch (err) {
            const msg = err.message || '';
            if (/invalid_grant|expired|dead/.test(msg)) {
                markKiroDead(idx, `warmup: ${msg}`);
                result.dead++;
            } else if (/rate|limit|throttl/i.test(msg)) {
                markKiroCooldown(idx, `warmup: ${msg}`);
                result.cooldown++;
            } else {
                log(`kiro warmup error for cred ${idx}: ${msg}`);
                result.timeout++;
            }
        }
    });

    await Promise.all(tasks);
    log(`kiro warmup done: ${JSON.stringify(result)}`);
    return result;
}

// ---- Kiro Usage/Credit Fetching ----

const KIRO_USAGE_URL = 'https://q.us-east-1.amazonaws.com/getUsageLimits';

/**
 * Parse Kiro usage response into a normalized credit summary.
 */
function parseKiroUsage(payload) {
    const breakdown = (payload.usageBreakdownList || [])[0];
    if (!breakdown) return { limit: 0, used: 0, remaining: 0 };

    const usageLimit = breakdown.usageLimit || 0;
    const currentUsage = breakdown.currentUsage || 0;

    let freeTrialLimit = 0;
    let freeTrialUsage = 0;
    const freeTrial = breakdown.freeTrialInfo || {};
    if (String(freeTrial.freeTrialStatus || '').toUpperCase() === 'ACTIVE') {
        freeTrialLimit = freeTrial.usageLimit || 0;
        freeTrialUsage = freeTrial.currentUsage || 0;
    }

    let bonusLimit = 0;
    let bonusUsage = 0;
    for (const b of (breakdown.bonuses || [])) {
        bonusLimit += (b && b.usageLimit) || 0;
        bonusUsage += (b && b.currentUsage) || 0;
    }

    const totalCredits = usageLimit + freeTrialLimit + bonusLimit;
    const totalUsage = currentUsage + freeTrialUsage + bonusUsage;
    const remaining = Math.max(0, totalCredits - totalUsage);

    return {
        subscription_type: payload.subscriptionInfo?.type || '',
        subscription_title: payload.subscriptionInfo?.subscriptionTitle || '',
        limit: totalCredits,
        used: totalUsage,
        remaining,
        subscription_credits: usageLimit,
        subscription_used: currentUsage,
        bonus_credits: freeTrialLimit + bonusLimit,
        bonus_used: freeTrialUsage + bonusUsage,
        days_until_reset: payload.daysUntilReset || 0,
        next_reset_date: payload.nextDateReset || null
    };
}

/**
 * Fetch usage/credits for a single Kiro credential by index.
 * Returns parsed usage object or null on failure.
 */
export async function fetchKiroCredUsage(idx) {
    let accessToken;
    try {
        accessToken = await getAccessTokenForCred(idx);
    } catch (err) {
        log(`kiro usage: failed to get token for cred ${idx}: ${err.message}`);
        return null;
    }

    const url = `${KIRO_USAGE_URL}?origin=AI_EDITOR&resourceType=AGENTIC_REQUEST`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        });
        clearTimeout(timer);

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            log(`kiro usage: cred ${idx} returned ${res.status}: ${body.slice(0, 100)}`);
            return null;
        }

        const payload = await res.json();
        return parseKiroUsage(payload);
    } catch (err) {
        clearTimeout(timer);
        log(`kiro usage: cred ${idx} error: ${err.message}`);
        return null;
    }
}

/**
 * Fetch usage for ALL active Kiro credentials.
 * Returns array of { idx, label, status, usage: {...} | null }.
 */
export async function fetchAllKiroUsage() {
    const creds = listKiroCreds();
    const results = await Promise.all(
        creds.map(async (entry) => {
            if (entry.status !== 'active') {
                return { idx: entry.idx, label: entry.label, status: entry.status, usage: null };
            }
            const usage = await fetchKiroCredUsage(entry.idx);
            return { idx: entry.idx, label: entry.label, status: entry.status, usage };
        })
    );
    return results;
}
