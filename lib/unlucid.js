/**
 * Unlucid.ai signup flow.
 */
import { sleep } from './utils.js';
import { handleGoogleLogin } from './google.js';

export const UNLUCID_SIGNUP_URL = 'https://unlucid.ai/r/50rn50uv';

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

    log(`[*] Waiting for redirect back to unlucid.ai...`);
    try {
        await page.waitForURL('**/unlucid.ai/**', { timeout: TIMEOUT });
    } catch (e) {
        await sleep(3000);
    }

    await sleep(1000);
    const finalUrl = page.url();
    log(`[*] Final URL: ${finalUrl}`);

    return true;
}
