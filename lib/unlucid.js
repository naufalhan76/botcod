/**
 * Unlucid.ai signup flow.
 */
import { sleep } from './utils.js';
import { handleGoogleLogin } from './google.js';

export const UNLUCID_SIGNUP_URL = 'https://unlucid.ai/r/xptpqdnd';

function isUnlucidUrl(url) {
    try {
        return new URL(String(url)).hostname.endsWith('unlucid.ai');
    } catch {
        return String(url || '').includes('unlucid.ai');
    }
}

async function waitForUnlucidRedirect(page, timeout) {
    if (isUnlucidUrl(page.url())) return page.url();
    const startedAt = Date.now();
    const maxWait = Math.min(timeout, 20000);
    while (Date.now() - startedAt < maxWait) {
        await page.waitForLoadState('domcontentloaded', { timeout: 1500 }).catch(() => {});
        if (isUnlucidUrl(page.url())) return page.url();
        await sleep(250);
    }
    return null;
}

export async function processUnlucid(page, email, password, log = console.log, opts = {}) {
    const TIMEOUT = opts.timeout || 60000;

    log(`[*] Navigating to ${UNLUCID_SIGNUP_URL}...`);
    await page.goto(UNLUCID_SIGNUP_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await sleep(1000);

    log(`[*] Looking for Sign In button...`);
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT }).catch(() => {});
    await sleep(500);

    const signInBtn = await page.waitForSelector('button:has-text("Sign In")', { timeout: TIMEOUT });
    await signInBtn.click();
    log(`[+] Clicked Sign In button`);
    await sleep(1000);

    log(`[*] Looking for Google button in modal...`);
    const googleBtn = await page.waitForSelector('button:has-text("Google")', { timeout: 10000 });
    await googleBtn.click();
    log(`[+] Clicked Google button in sign-in modal`);

    log(`[*] Waiting for Google login page redirect...`);
    await handleGoogleLogin(page, email, password, log, { timeout: TIMEOUT });
    await sleep(2000);

    log(`[*] Waiting for redirect back to unlucid.ai...`);
    try {
        await page.waitForURL(u => isUnlucidUrl(u.href), { timeout: Math.min(TIMEOUT, 20000) });
    } catch (e) {
        // If still stuck on Google OAuth, give it extra time — the consent
        // click may have triggered a slow server-side redirect.
        const url = page.url();
        if (url.includes('accounts.google.com')) {
            log(`[!] Still on Google (${url.split('?')[0]}), waiting longer for redirect...`);
            try {
                await page.waitForURL(u => !u.href.includes('accounts.google.com'), { timeout: 15000 });
            } catch (e2) {
                log(`[!] Redirect did not complete — may need manual consent`);
            }
        }
        await sleep(700);
    }

    if (page.url().includes('accounts.google.com')) {
        try {
            await page.waitForURL(u => isUnlucidUrl(u.href), { timeout: 5000 });
        } catch (e) {}
    }

    await sleep(700);
    const finalUrl = page.url();
    log(`[*] Final URL: ${finalUrl}`);

    if (finalUrl.includes('accounts.google.com')) {
        throw new Error(`Google login did not redirect back to unlucid.ai. Stuck at: ${finalUrl.split('?')[0]}`);
    }

    const loggedIn = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        const signInVisible = Array.from(document.querySelectorAll('button,a')).some(el => {
            const label = (el.innerText || el.textContent || '').trim();
            return label === 'Sign In';
        });
        return text.includes('Toggle user menu') || (!signInVisible && text.includes('Gems'));
    }).catch(() => false);

    if (!loggedIn) {
        throw new Error(`Unlucid redirected back but logged-in state was not detected. Current URL: ${finalUrl}`);
    }

    log(`[+] Unlucid logged-in state detected`);
    return true;
}
