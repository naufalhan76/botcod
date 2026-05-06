/**
 * Google OAuth login flow handler.
 * Extracted from original index.js handleGoogleLogin().
 */
import { sleep } from './utils.js';

export async function handleGoogleLogin(page, email, password, log = console.log, opts = {}) {
    const TIMEOUT = opts.timeout || 60000;

    await page.waitForURL('**/accounts.google.com/**', { timeout: TIMEOUT });
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT });
    await sleep(1500);

    const currentUrl = page.url();
    if (currentUrl.includes('accountchooser') || currentUrl.includes('chooser')) {
        log(`[*] Account chooser detected, clicking "Use another account"...`);
        try {
            const useAnotherBtn = await page.waitForSelector(
                'li:has-text("Use another account"), [data-identifier="other"]',
                { timeout: 5000 }
            );
            await useAnotherBtn.click();
            await sleep(1500);
        } catch (e) {}
    }

    log(`[*] Entering email: ${email}`);
    const emailInput = await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
    await emailInput.click();
    await emailInput.fill(email);
    await sleep(300);

    log(`[*] Clicking Next...`);
    const nextBtn = await page.waitForSelector(
        '#identifierNext, button:has-text("Next"), div#identifierNext',
        { timeout: 5000 }
    );
    await nextBtn.click();
    await sleep(2000);

    try {
        const errorEl = await page.waitForSelector(
            '[class*="error"] span, div[aria-live="assertive"]',
            { timeout: 3000 }
        );
        const errorText = await errorEl.textContent();
        if (errorText && (errorText.includes("Couldn't find") || errorText.includes('Tidak dapat'))) {
            throw new Error(`Google account not found: ${email}`);
        }
    } catch (e) {
        if (e.message && e.message.includes('Google account not found')) throw e;
    }

    log(`[*] Entering password...`);
    const passwordInput = await page.waitForSelector('input[type="password"]', { timeout: TIMEOUT });
    await passwordInput.click();
    await passwordInput.fill(password);
    await sleep(300);

    log(`[*] Clicking Next for password...`);
    const passNextBtn = await page.waitForSelector(
        '#passwordNext, button:has-text("Next"), div#passwordNext',
        { timeout: 5000 }
    );
    await passNextBtn.click();
    await sleep(2000);

    try {
        const wrongPassEl = await page.waitForSelector(
            '[class*="error"] span, div[aria-live="assertive"]',
            { timeout: 3000 }
        );
        const wrongPassText = await wrongPassEl.textContent();
        if (wrongPassText && (wrongPassText.includes('Wrong password') || wrongPassText.includes('Sandi salah'))) {
            throw new Error(`Wrong password for: ${email}`);
        }
    } catch (e) {
        if (e.message && e.message.includes('Wrong password')) throw e;
    }

    try {
        const challengeEl = await page.waitForSelector(
            'h1:has-text("Verify"), h1:has-text("2-Step"), [data-challengetype]',
            { timeout: 5000 }
        );
        if (challengeEl) {
            log(`[!] Security challenge/2FA detected for ${email}. Waiting 30s for manual solve...`);
            await sleep(30000);
        }
    } catch (e) {}

    await sleep(1000);
    try {
        const wsUrl = page.url();
        if (wsUrl.includes('workspacetermsofservice') || wsUrl.includes('speedbump')) {
            log(`[*] Google Workspace Terms page detected, clicking "I understand"...`);
            const iUnderstandBtn = await page.waitForSelector(
                'button:has-text("I understand")',
                { timeout: 10000 }
            );
            await iUnderstandBtn.click();
            await sleep(1500);
        }
    } catch (e) {
        try {
            const iUnderstandBtn = await page.waitForSelector('button:has-text("I understand")', { timeout: 3000 });
            if (iUnderstandBtn) {
                await iUnderstandBtn.click();
                log(`[+] Clicked "I understand"`);
                await sleep(1500);
            }
        } catch (e2) {}
    }

    await sleep(1000);
    try {
        const consentUrl = page.url();
        if (consentUrl.includes('oauth') || consentUrl.includes('consent') || consentUrl.includes('signin/oauth')) {
            log(`[*] OAuth consent page detected, clicking "Continue"...`);
            const continueBtn = await page.waitForSelector('button:has-text("Continue")', { timeout: 10000 });
            await continueBtn.click();
            log(`[+] Clicked "Continue" on OAuth consent`);
            await sleep(1500);
        }
    } catch (e) {
        try {
            const continueBtn = await page.waitForSelector(
                'button:has-text("Continue"), button:has-text("Allow"), button:has-text("Lanjutkan")',
                { timeout: 3000 }
            );
            if (continueBtn) {
                await continueBtn.click();
                log(`[+] Clicked Continue/Allow`);
                await sleep(1500);
            }
        } catch (e2) {}
    }

    return true;
}
