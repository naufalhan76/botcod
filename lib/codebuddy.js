/**
 * CodeBuddy.ai signup flow + API key extraction.
 */
import { sleep } from './utils.js';
import { handleGoogleLogin } from './google.js';

export const CODEBUDDY_LOGIN_URL = 'https://www.codebuddy.ai/login';
export const CODEBUDDY_HOME_URL = 'https://www.codebuddy.ai/home';
export const CODEBUDDY_KEYS_URL = 'https://www.codebuddy.ai/profile/keys';

const GOOGLE_AUTH_SELECTOR = [
    'a:has-text("Sign up with Google")',
    'a:has-text("Sign in with Google")',
    'a:has-text("Google")',
    'button:has-text("Google")',
    '[class*="google"]'
].join(', ');

const AGREEMENT_CONFIRM_SELECTOR = [
    'button:has-text("Confirm")',
    'button:has-text("Agree")',
    'button:has-text("\u540c\u610f")'
].join(', ');

const CREATE_KEY_SELECTOR = [
    'button:has-text("Create Key")',
    'button:has-text("Create")',
    'button:has-text("\u521b\u5efa")',
    '[class*="create"]:has-text("Key")',
    '[class*="create"]:has-text("\u5bc6\u94a5")'
].join(', ');

const CONFIRM_KEY_SELECTOR = [
    '.create-key-dialog-overlay.show button:has-text("Confirm")',
    '.create-key-dialog-overlay.show button:has-text("Create")',
    '.create-key-dialog-overlay.show button:has-text("\u786e\u8ba4")',
    '.create-key-dialog-overlay.show button:has-text("\u521b\u5efa")',
    'button:has-text("Confirm")',
    'button:has-text("Create")',
    'button:has-text("\u786e\u8ba4")',
    'button:has-text("\u521b\u5efa")'
].join(', ');

const GOT_IT_SELECTOR = [
    'button:has-text("Got it")',
    'button:has-text("Done")',
    'button:has-text("\u77e5\u9053\u4e86")',
    'button:has-text("\u5b8c\u6210")'
].join(', ');

function isCodeBuddyUrl(url) {
    try {
        return new URL(String(url)).hostname.endsWith('codebuddy.ai');
    } catch {
        return String(url || '').includes('codebuddy.ai');
    }
}

async function waitForAuthTransition(page, timeout) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        const url = page.url();
        if (url.includes('accounts.google.com')) return 'google';
        if (isCodeBuddyUrl(url) && !url.includes('/login')) return 'codebuddy';
        await sleep(500);
    }
    return page.url().includes('accounts.google.com') ? 'google' : 'unknown';
}

async function waitForCodeBuddyRedirect(page, timeout) {
    if (isCodeBuddyUrl(page.url())) return page.url();
    const startedAt = Date.now();
    const maxWait = Math.min(timeout, 20000);
    while (Date.now() - startedAt < maxWait) {
        await page.waitForLoadState('domcontentloaded', { timeout: 1500 }).catch(() => {});
        if (isCodeBuddyUrl(page.url())) return page.url();
        await sleep(250);
    }
    return null;
}

async function selectRegistrationRegion(page, log) {
    // Simple approach from the original working commit:
    // 1. Click input to open dropdown
    // 2. waitForSelector on the Singapore <li> (waits until it appears)
    // 3. Click it
    const regionInput = await page.waitForSelector(
        'input[placeholder*="Registration location"], input[class*="region"], input.t-input__inner, input[type="text"]',
        { timeout: 10000 }
    );
    await regionInput.click();
    await sleep(1000);

    // Wait for and click Singapore option from dropdown
    const singaporeOption = await page.waitForSelector(
        'li:has-text("Singapore"), [class*="option"]:has-text("Singapore")',
        { timeout: 5000 }
    );
    await singaporeOption.click();
    log(`[+] Selected Singapore`);
    await sleep(500);
}

async function submitRegistrationRegion(page, log, timeout) {
    // The Submit button is a div (NOT a <button>) that appears after selecting a region.
    // Original working approach: try div[class*="submit"], button, then text=Submit fallback.
    const submitElement = await page.$(
        'div[class*="submit"], button:has-text("Submit"), a:has-text("Submit"), [class*="btn"]:has-text("Submit")'
    );
    if (submitElement) {
        await submitElement.click();
    } else {
        // Fallback: click any element with text "Submit" (works for div elements too)
        await page.click('text=Submit', { timeout: 5000 });
    }
    log(`[+] Submitted registration`);
    await sleep(3000);

    // Wait for navigation away from registration page
    const deadline = Date.now() + Math.min(timeout, 12000);
    while (Date.now() < deadline && page.url().includes('/register/user/complete')) {
        await page.waitForLoadState('domcontentloaded', { timeout: 1000 }).catch(() => {});
        await sleep(500);
    }

    if (page.url().includes('/register/user/complete')) {
        const diag = await getPageDiagnostic(page);
        throw new Error(`Registration region submit did not advance. Visible actions=${diag.buttons.join(' | ')}`);
    }
}

async function completeRegistrationIfNeeded(page, log, timeout) {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    await sleep(1000);

    // After Google login, CodeBuddy redirects: /login/select → /register/user/complete
    if (page.url().includes('/login/select')) {
        log(`[*] CodeBuddy account selection page detected, waiting for registration redirect...`);
        await page.waitForURL(url => !url.href.includes('/login/select'), { timeout: 15000 }).catch(() => {});
        await sleep(1500);
        if (page.url().includes('/login/select')) {
            const selectUrl = page.url();
            const redirectUri = new URL(selectUrl).searchParams.get('redirect_uri');
            if (redirectUri) {
                log(`[*] Login select did not auto-continue; opening redirect target...`);
                await page.goto(redirectUri, { waitUntil: 'domcontentloaded', timeout }).catch(() => {});
                await sleep(1500);
            }
        }
    }

    if (!page.url().includes('/register/user/complete')) return;

    log(`[*] Region selection page detected...`);
    // Wait for the page to fully render (the input needs to be interactive)
    await sleep(2000);
    log(`[*] Selecting Singapore as registration region...`);
    await selectRegistrationRegion(page, log);
    await submitRegistrationRegion(page, log, 15000);
}

async function loginWithGoogleFromCurrentPage(page, email, password, log, timeout) {
    await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
    await sleep(2000);

    if (!page.url().includes('/login')) {
        log(`[*] CodeBuddy already past login: ${page.url()}`);
        return;
    }

    log(`[*] Looking for login iframe...`);
    const loginIframe = await page.waitForSelector('iframe[title="login-iframe"]', { timeout });
    const iframeContent = await loginIframe.contentFrame();
    if (!iframeContent) throw new Error('Could not access login iframe');

    log(`[*] Clicking "Sign up with Google"...`);
    const googleSignupLink = await iframeContent.waitForSelector(GOOGLE_AUTH_SELECTOR, { timeout: 10000 });
    await googleSignupLink.click();
    await sleep(1000);

    log(`[*] Checking for service agreement dialog...`);
    try {
        const confirmBtn = await iframeContent.waitForSelector(AGREEMENT_CONFIRM_SELECTOR, { timeout: 5000 });
        await confirmBtn.click();
        log(`[+] Confirmed service agreement`);
        await sleep(2000);
    } catch (e) {
        log(`[*] No service agreement dialog (already accepted or direct redirect)`);
    }

    log(`[*] Waiting for Google login page or CodeBuddy redirect...`);
    const authTarget = await waitForAuthTransition(page, Math.min(timeout, 20000));
    if (authTarget === 'google') {
        await handleGoogleLogin(page, email, password, log, { timeout });
    } else if (authTarget === 'codebuddy') {
        log(`[*] Already redirected back to CodeBuddy; skipping Google form wait`);
    } else {
        throw new Error(`CodeBuddy login did not open Google or redirect. Current URL: ${page.url()}`);
    }

    log(`[*] Waiting for redirect back to CodeBuddy...`);
    const redirectedUrl = await waitForCodeBuddyRedirect(page, timeout);
    if (!redirectedUrl) throw new Error(`Google login did not redirect back to CodeBuddy. Current URL: ${page.url()}`);
    log(`[+] CodeBuddy redirect detected: ${redirectedUrl.split('?')[0]}`);
    await sleep(800);
    await completeRegistrationIfNeeded(page, log, timeout);
}

async function ensureIntlEnglish(page, log, timeout) {
    log(`[*] Setting CodeBuddy site language to Intl - English...`);
    await page.goto(CODEBUDDY_HOME_URL, { waitUntil: 'domcontentloaded', timeout });
    await sleep(2500);

    const current = await page.$eval('.btn-site-switcher', el => (el.innerText || el.textContent || '').trim())
        .catch(() => '');
    if (current.includes('Intl') && current.includes('English')) {
        log(`[+] CodeBuddy language already Intl - English`);
        return;
    }

    const switcher = await page.waitForSelector('.btn-site-switcher, button:has-text("Intl")', { timeout: 10000 });
    await switcher.click();
    await sleep(800);

    const clicked = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('li, button, a, div, span'));
        const target = items.find(el => {
            const text = (el.innerText || el.textContent || '').trim();
            return text === 'Intl - English';
        });
        if (!target) return false;
        target.click();
        return true;
    });
    if (!clicked) {
        log(`[!] Intl - English menu item not found; continuing with current language`);
        return;
    }

    await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
    await sleep(2000);
    log(`[+] Selected Intl - English`);
}

async function getPageDiagnostic(page) {
    return page.evaluate(() => ({
        url: location.href,
        title: document.title,
        body: (document.body?.innerText || '').slice(0, 700),
        buttons: Array.from(document.querySelectorAll('button,a,[role="button"],li'))
            .map(el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' '))
            .filter(Boolean)
            .slice(0, 40)
    })).catch(() => ({ url: page.url(), title: '', body: '', buttons: [] }));
}

async function clickCreateKey(page, log, timeout) {
    const deadline = Date.now() + Math.min(timeout, 60000);
    let lastDiag = null;

    while (Date.now() < deadline) {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});

        // The "Create Key" button is a standard <button> element
        const createKeyBtn = await page.waitForSelector(
            'button:has-text("Create Key"), button:has-text("Create"), button:has-text("创建"), button:has-text("创建密钥")',
            { timeout: 3000 }
        ).catch(() => null);
        if (createKeyBtn) {
            log(`[+] Create key button found`);
            await createKeyBtn.click({ timeout: 10000 });
            return;
        }

        // DOM fallback
        const clicked = await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'));
            const target = candidates.find(el => {
                const text = (el.innerText || el.textContent || '').trim();
                const rect = el.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return false;
                return /^(Create Key|Create|创建|创建密钥)$/i.test(text);
            });
            if (!target) return false;
            target.click();
            return true;
        }).catch(() => false);
        if (clicked) {
            log(`[+] Create key button clicked via DOM fallback`);
            return;
        }

        lastDiag = await getPageDiagnostic(page);
        if (lastDiag.url.includes('/login')) {
            throw new Error(`Not logged in when opening keys page. Current URL: ${lastDiag.url}`);
        }

        await sleep(2000);
    }

    const diag = lastDiag || await getPageDiagnostic(page);
    throw new Error(
        `Create Key button not found. URL=${diag.url}; title=${diag.title}; visible actions=${diag.buttons.join(' | ')}`
    );
}

async function openKeysPage(page, email, password, log, timeout) {
    log(`[*] Navigating to Access Keys page...`);
    await page.goto(CODEBUDDY_KEYS_URL, { waitUntil: 'domcontentloaded', timeout });
    await waitForKeysPageSettled(page, log);

    if (!page.url().includes('/login')) return;

    log(`[!] Keys page redirected to login; re-authenticating for profile/keys...`);
    await loginWithGoogleFromCurrentPage(page, email, password, log, timeout);
    await sleep(1500);

    if (!page.url().includes('/profile/keys')) {
        await page.goto(CODEBUDDY_KEYS_URL, { waitUntil: 'domcontentloaded', timeout });
        await waitForKeysPageSettled(page, log);
    }

    if (page.url().includes('/login')) {
        throw new Error(`Still not logged in when opening keys page. Current URL: ${page.url()}`);
    }
}

async function waitForKeysPageSettled(page, log) {
    let sawBlank = false;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (page.url().includes('/login')) return;
        const hasCreate = await page.$(CREATE_KEY_SELECTOR).catch(() => null);
        if (hasCreate) return;
        const bodyLength = await page.evaluate(() => (document.body?.innerText || '').trim().length).catch(() => 0);
        if (bodyLength > 0) return;
        sawBlank = true;
        await sleep(1500);
    }
    if (sawBlank && page.url().includes('/profile/keys')) {
        log(`[!] Keys page stayed blank, reloading once...`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await sleep(4000);
    }
}

async function clickCreateKeyConfirm(page) {
    const clicked = await page.evaluate(() => {
        const overlay = document.querySelector('.create-key-dialog-overlay.show')
            || document.querySelector('.create-key-dialog-overlay');
        if (!overlay) return { ok: false, reason: 'no create-key overlay' };

        const accept = new Set(['Confirm', 'Create', '\u786e\u8ba4', '\u521b\u5efa']);
        const candidates = Array.from(overlay.querySelectorAll('button, [role="button"], div, span'));
        const target = candidates.find(el => accept.has((el.innerText || el.textContent || '').trim()));
        if (!target) return { ok: false, reason: 'confirm button not found in overlay' };

        target.click();
        return { ok: true };
    });
    if (!clicked.ok) throw new Error(clicked.reason || 'create key confirm click failed');
}

export async function processCodeBuddy(page, email, password, log = console.log, opts = {}) {
    const TIMEOUT = opts.timeout || 60000;

    log(`[*] Navigating to ${CODEBUDDY_LOGIN_URL}...`);
    await page.goto(CODEBUDDY_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await loginWithGoogleFromCurrentPage(page, email, password, log, TIMEOUT);
    await ensureIntlEnglish(page, log, TIMEOUT);

    await openKeysPage(page, email, password, log, TIMEOUT);

    log(`[*] Creating API key...`);
    await clickCreateKey(page, log, TIMEOUT);
    await sleep(1500);

    const keyName = Math.random().toString(36).substring(2, 10);
    log(`[*] Filling key name "${keyName}"...`);
    // The dialog has a heading "Create Key" and an input for key name
    const keyNameInput = await page.waitForSelector(
        'input[placeholder*="Enter"], input[placeholder*="characters"], input[placeholder*="Chinese"]',
        { timeout: 8000 }
    );
    await keyNameInput.fill(keyName);
    await sleep(500);

    // Click "Confirm" button in the dialog
    const confirmKeyBtn = await page.waitForSelector(
        'button:has-text("Confirm"), button:has-text("确认")',
        { timeout: 5000 }
    );
    try {
        await confirmKeyBtn.click({ timeout: 5000 });
    } catch (e) {
        // Fallback: click via DOM
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const confirm = btns.find(el => /^(Confirm|确认)$/i.test((el.innerText || '').trim()));
            if (confirm) confirm.click();
        });
    }
    log(`[+] Key creation confirmed`);
    await sleep(3000);

    log(`[*] Extracting API key...`);
    let apiKey = null;
    try {
        // The key is displayed in a textbox inside a "Key Created Successfully" dialog.
        // Wait for any input that contains "ck_" value to appear.
        const keyDisplay = await page.waitForSelector(
            'input[value*="ck_"]',
            { timeout: 15000 }
        );
        apiKey = await keyDisplay.getAttribute('value');
        if (!apiKey) apiKey = await keyDisplay.inputValue();
    } catch (e) {
        // Fallback: try evaluating DOM directly
        try {
            apiKey = await page.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input'));
                const keyInput = inputs.find(el => (el.value || '').startsWith('ck_'));
                return keyInput?.value || null;
            });
        } catch (e2) {
            log(`[!] Could not extract API key: ${e.message}`);
        }
    }

    if (apiKey) {
        log(`[+] API Key obtained: ${apiKey.substring(0, 20)}...`);
    }

    try {
        const gotItBtn = await page.waitForSelector(
            'button:has-text("Got it"), button:has-text("Done"), button:has-text("知道了"), button:has-text("完成")',
            { timeout: 5000 }
        );
        await gotItBtn.click();
    } catch (e) {}

    return apiKey;
}
