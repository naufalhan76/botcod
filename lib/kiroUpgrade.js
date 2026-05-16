/**
 * Kiro IDE auto-upgrade flow.
 *
 * Runs AFTER processKiro() succeeds. Reuses the same Playwright page so the
 * Google OAuth session captured during signup is reused at app.kiro.dev.
 *
 * Strategy:
 *   1. Navigate to the Kiro web subscription portal.
 *   2. Click "Upgrade Plan" / dashboard upgrade entry.
 *   3. Pick the cheapest plan (Pro).
 *   4. Wait for the checkout screen (Stripe Checkout or Kiro-hosted summary).
 *   5. Read the "due today" amount.
 *      - If 0 → click Subscribe, verify success, return success.
 *      - If > 0 → throw — caller decides what to do (per user spec we fail
 *        loudly instead of generating a VCC).
 *
 * The selectors are intentionally defensive (multiple fallbacks per step,
 * text-keyword search) because we cannot eagerly verify the live DOM without
 * an authenticated session. If a step fails the function throws with a clear
 * message + dumps the current URL so the caller's log captures everything.
 */
import { sleep } from './utils.js';

const PORTAL_URL = process.env.BATCHER_KIRO_PORTAL_URL
    || 'https://app.kiro.dev/account/usage';
const TARGET_PLAN = (process.env.BATCHER_KIRO_TARGET_PLAN || 'pro').toLowerCase();
const MAX_CHARGE = Number(process.env.BATCHER_KIRO_MAX_CHARGE || '0');
const NAV_TIMEOUT = Number(process.env.BATCHER_KIRO_UPGRADE_TIMEOUT || '90000');

const UPGRADE_BUTTON_KEYWORDS = [
    'upgrade plan',
    'upgrade your plan',
    'upgrade',
    'choose plan',
    'select plan',
    'manage plan'
];

const PLAN_KEYWORDS = {
    pro:    ['pro', 'kiro pro'],
    'pro+': ['pro+', 'pro plus', 'kiro pro+'],
    power:  ['power', 'kiro power']
};

const SELECT_PLAN_KEYWORDS = ['select', 'choose', 'continue', 'subscribe to', 'get'];
const SUBSCRIBE_KEYWORDS = ['subscribe', 'confirm subscription', 'confirm', 'place order', 'pay', 'start subscription'];
const SUCCESS_KEYWORDS = ['thank you', 'subscription active', 'plan activated', 'success', 'subscribed', 'welcome to kiro pro', 'welcome to pro'];

function normalizeText(el) {
    return String(el?.textContent || el?.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Click a visible element whose visible text matches any of the keywords.
 * Returns true if click was performed.
 */
async function clickByText(page, keywords, { exact = false } = {}) {
    return page.evaluate(({ keywords, exact }) => {
        const lowered = keywords.map(k => k.toLowerCase());
        const candidates = document.querySelectorAll('button, a, [role="button"], input[type="submit"], [data-testid]');
        for (const el of candidates) {
            if (!(el.offsetParent || el.getClientRects().length)) continue;
            const text = String(el.textContent || el.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (!text) continue;
            const hit = exact
                ? lowered.some(k => text === k)
                : lowered.some(k => text.includes(k));
            if (hit) {
                el.click();
                return text;
            }
        }
        return null;
    }, { keywords, exact }).catch(() => null);
}

async function waitForKeyword(page, keywords, timeout = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        const found = await page.evaluate((kws) => {
            const text = document.body?.innerText?.toLowerCase() || '';
            return kws.find(k => text.includes(k.toLowerCase())) || null;
        }, keywords).catch(() => null);
        if (found) return found;
        await new Promise(r => setTimeout(r, 400));
    }
    return null;
}

/**
 * Read the "due today" / total amount from the checkout page. Returns the
 * dollar amount as a Number, or null if nothing recognisable was found.
 *
 * Looks at Stripe Checkout's `[data-testid="line-item-total-amount"]` first,
 * then falls back to scanning body text for "$X.XX" near keywords like
 * "Total" / "Due today" / "Today's charge".
 */
async function readCheckoutTotal(page) {
    return page.evaluate(() => {
        const parseAmt = (raw) => {
            if (!raw) return null;
            const m = String(raw).match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
            return m ? Number(m[1]) : null;
        };

        const testIdSelectors = [
            '[data-testid="line-item-total-amount"]',
            '[data-testid="total-amount"]',
            '[data-testid="order-total"]',
            '[data-test="due-today-amount"]'
        ];
        for (const sel of testIdSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                const amt = parseAmt(el.textContent);
                if (amt !== null) return { amount: amt, source: sel };
            }
        }

        const labels = [
            'total due today',
            'due today',
            "today's charge",
            'amount due',
            'total',
            'subtotal'
        ];
        const text = document.body?.innerText || '';
        for (const label of labels) {
            const idx = text.toLowerCase().indexOf(label);
            if (idx === -1) continue;
            // Look at the next 80 chars after the label for a $ amount.
            const window = text.slice(idx, idx + 120);
            const amt = parseAmt(window);
            if (amt !== null) return { amount: amt, source: `text:${label}` };
        }
        return null;
    }).catch(() => null);
}

/**
 * Try multiple navigation strategies to reach the upgrade / checkout page.
 * Returns once we believe we're on a plan-selection or checkout screen.
 */
async function openUpgradePortal(page, log) {
    log(`[*] Navigating to Kiro portal: ${PORTAL_URL}`);
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
        .catch(e => log(`[!] Portal navigation warning: ${e.message}`));
    await sleep(2000);

    // If the portal redirected us to a login chooser, click the Google option.
    const loginCue = await waitForKeyword(page, ['sign in', 'sign up', 'choose a way'], 3000);
    if (loginCue) {
        log(`[*] Portal asks to sign in — clicking Google`);
        const clicked = await clickByText(page, ['google', 'continue with google', 'sign in with google']);
        if (clicked) {
            await sleep(2500);
            await page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT }).catch(() => {});
            await sleep(2000);
        }
    }
}

/**
 * Click the dashboard "Upgrade Plan" / "Manage Plan" entry. Some accounts
 * land directly on a plan list; in that case this is a no-op.
 */
async function openPlanSelector(page, log) {
    const onPlanPage = await waitForKeyword(page, ['kiro pro', 'choose a plan', 'select a plan'], 2000);
    if (onPlanPage) {
        log(`[*] Plan list already visible (matched: "${onPlanPage}")`);
        return;
    }

    const clicked = await clickByText(page, UPGRADE_BUTTON_KEYWORDS);
    if (!clicked) {
        log(`[!] Could not find an upgrade/manage button on the portal; continuing in case the next step exposes plans directly.`);
        return;
    }
    log(`[*] Clicked upgrade entry: "${clicked}"`);
    await sleep(2500);
}

/**
 * Click the target plan (default Pro). We first try clicking the plan card
 * (a button inside the card matching "Choose"/"Select"), then fall back to
 * clicking any element whose text contains the plan name.
 */
async function selectPlan(page, log) {
    const planTokens = PLAN_KEYWORDS[TARGET_PLAN] || PLAN_KEYWORDS.pro;
    log(`[*] Selecting plan: ${TARGET_PLAN} (keywords: ${planTokens.join(', ')})`);

    // 1. Look for a plan card whose heading matches the plan name and click
    //    its action button inside (Select / Choose / Continue).
    const cardClicked = await page.evaluate(({ planTokens, actionTokens }) => {
        const cards = document.querySelectorAll('[role="group"], [class*="plan"], [class*="card"], [data-testid*="plan"]');
        for (const card of cards) {
            const headingText = String(card.textContent || '').toLowerCase();
            if (!planTokens.some(t => headingText.includes(t))) continue;
            const btn = Array.from(card.querySelectorAll('button, a, [role="button"]')).find(b => {
                if (!(b.offsetParent || b.getClientRects().length)) return false;
                const t = String(b.textContent || '').toLowerCase();
                return actionTokens.some(a => t.includes(a));
            });
            if (btn) {
                btn.click();
                return String(btn.textContent || '').trim();
            }
        }
        return null;
    }, { planTokens, actionTokens: SELECT_PLAN_KEYWORDS }).catch(() => null);

    if (cardClicked) {
        log(`[*] Clicked plan card action: "${cardClicked}"`);
        await sleep(2500);
        return;
    }

    // 2. Fallback: click anything containing the plan name directly.
    const fallback = await clickByText(page, planTokens);
    if (fallback) {
        log(`[*] Fallback plan click: "${fallback}"`);
        await sleep(2500);
        return;
    }

    throw new Error(`Could not find plan card for "${TARGET_PLAN}"`);
}

/**
 * After plan selection we should land on a checkout page. Stripe Checkout
 * runs on checkout.stripe.com — if so, wait for the line-item to settle.
 */
async function waitForCheckout(page, log) {
    const started = Date.now();
    while (Date.now() - started < NAV_TIMEOUT) {
        const url = page.url();
        if (url.includes('checkout.stripe.com') || url.includes('billing') || url.includes('subscribe')) {
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
            // Stripe Checkout: wait for its order-summary block to render.
            const ready = await page.evaluate(() => {
                if (document.querySelector('[data-testid="line-item-total-amount"]')) return 'stripe-test-id';
                const text = (document.body?.innerText || '').toLowerCase();
                if (text.includes('total due') || text.includes('due today') || text.includes('subtotal')) return 'text-total';
                return null;
            }).catch(() => null);
            if (ready) {
                log(`[*] Checkout page ready (${ready}) — URL: ${url}`);
                return;
            }
        }
        await sleep(750);
    }
    throw new Error(`Checkout page never settled within ${NAV_TIMEOUT}ms (last URL: ${page.url()})`);
}

async function submitSubscribe(page, log) {
    const clicked = await clickByText(page, SUBSCRIBE_KEYWORDS);
    if (!clicked) {
        throw new Error('Subscribe/Confirm button not found on checkout page');
    }
    log(`[*] Clicked subscribe: "${clicked}"`);
    await sleep(3000);

    const success = await waitForKeyword(page, SUCCESS_KEYWORDS, 30000);
    if (!success) {
        throw new Error(`Subscribe clicked but success indicator not found (URL: ${page.url()})`);
    }
    log(`[+] Subscription confirmed (matched indicator: "${success}")`);
}

/**
 * @param {import('playwright-core').Page} page  Playwright page already authenticated with Google (post-Kiro-signup).
 * @param {string} email                          Account email (used for logging only).
 * @param {(msg: string) => void} [log]           Logger.
 * @returns {Promise<{ upgraded: true, plan: string }>}
 * @throws  if a charge > MAX_CHARGE is required, or if any flow step fails.
 */
export async function processKiroUpgrade(page, email, log = console.log) {
    log(`[KIRO-UPGRADE] Starting upgrade flow for ${email} (target: ${TARGET_PLAN}, max charge: $${MAX_CHARGE})`);

    await openUpgradePortal(page, log);
    await openPlanSelector(page, log);
    await selectPlan(page, log);
    await waitForCheckout(page, log);

    const total = await readCheckoutTotal(page);
    if (!total) {
        throw new Error('Could not read checkout total — refusing to submit blind');
    }
    log(`[*] Checkout total: $${total.amount} (source: ${total.source})`);

    if (total.amount > MAX_CHARGE) {
        // Per user spec (Question 1, option B): skip VCC, fail loudly when
        // a real charge is required.
        throw new Error(
            `Upgrade would charge $${total.amount.toFixed(2)} (> max $${MAX_CHARGE.toFixed(2)}). ` +
            `Bot is configured to skip upgrades that require payment.`
        );
    }

    log(`[*] Charge is $${total.amount} ≤ $${MAX_CHARGE} — proceeding with Subscribe`);
    await submitSubscribe(page, log);

    return { upgraded: true, plan: TARGET_PLAN };
}
