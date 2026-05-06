/**
 * CodeBuddy.ai signup flow + API key extraction.
 */
import { sleep } from './utils.js';
import { handleGoogleLogin } from './google.js';

export const CODEBUDDY_LOGIN_URL = 'https://www.codebuddy.ai/login';
export const CODEBUDDY_KEYS_URL = 'https://www.codebuddy.ai/profile/keys';

export async function processCodeBuddy(page, email, password, log = console.log, opts = {}) {
    const TIMEOUT = opts.timeout || 60000;

    log(`[*] Navigating to ${CODEBUDDY_LOGIN_URL}...`);
    await page.goto(CODEBUDDY_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await sleep(2000);

    log(`[*] Looking for login iframe...`);
    const loginIframe = await page.waitForSelector('iframe[title="login-iframe"]', { timeout: TIMEOUT });
    const iframeContent = await loginIframe.contentFrame();
    if (!iframeContent) throw new Error('Could not access login iframe');

    log(`[*] Clicking "Sign up with Google"...`);
    const googleSignupLink = await iframeContent.waitForSelector(
        'a:has-text("Sign up with Google"), [class*="google"]',
        { timeout: 10000 }
    );
    await googleSignupLink.click();
    await sleep(1000);

    log(`[*] Checking for service agreement dialog...`);
    try {
        const confirmBtn = await iframeContent.waitForSelector('button:has-text("Confirm")', { timeout: 5000 });
        await confirmBtn.click();
        log(`[+] Confirmed service agreement`);
        await sleep(2000);
    } catch (e) {
        log(`[*] No service agreement dialog (already accepted or direct redirect)`);
    }

    log(`[*] Waiting for Google login page...`);
    await handleGoogleLogin(page, email, password, log, { timeout: TIMEOUT });

    log(`[*] Waiting for redirect back to CodeBuddy...`);
    try {
        await page.waitForURL('**/codebuddy.ai/**', { timeout: TIMEOUT });
    } catch (e) {
        await sleep(3000);
    }
    await sleep(2000);

    const currentUrl = page.url();
    if (currentUrl.includes('/register/user/complete') || currentUrl.includes('/login/select')) {
        log(`[*] Region selection page detected...`);
        await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT });
        await sleep(1500);

        try {
            await page.waitForURL('**/register/user/complete**', { timeout: 10000 });
        } catch (e) {}
        await sleep(1000);

        log(`[*] Selecting Singapore as registration region...`);
        const regionInput = await page.waitForSelector(
            'input[placeholder*="Registration location"], input[class*="region"], input[type="text"]',
            { timeout: 10000 }
        );
        await regionInput.click();
        await sleep(1000);

        const singaporeOption = await page.waitForSelector(
            'li:has-text("Singapore"), [class*="option"]:has-text("Singapore")',
            { timeout: 5000 }
        );
        await singaporeOption.click();
        log(`[+] Selected Singapore`);
        await sleep(500);

        const submitElement = await page.$(
            'div[class*="submit"], button:has-text("Submit"), a:has-text("Submit"), [class*="btn"]:has-text("Submit")'
        );
        if (submitElement) {
            await submitElement.click();
        } else {
            await page.click('text=Submit');
        }
        log(`[+] Submitted registration`);
        await sleep(3000);
    }

    log(`[*] Navigating to Access Keys page...`);
    await page.goto(CODEBUDDY_KEYS_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await sleep(2000);

    log(`[*] Creating API key...`);
    const createKeyBtn = await page.waitForSelector('button:has-text("Create Key")', { timeout: 10000 });
    await createKeyBtn.click();
    await sleep(1000);

    const keyName = Math.random().toString(36).substring(2, 10);
    log(`[*] Filling key name "${keyName}"...`);
    const keyNameInput = await page.waitForSelector(
        'input[placeholder*="Enter"], input[placeholder*="characters"], div[class*="modal"] input[type="text"]',
        { timeout: 5000 }
    );
    await keyNameInput.fill(keyName);
    await sleep(300);

    const confirmKeyBtn = await page.waitForSelector('button:has-text("Confirm")', { timeout: 5000 });
    await confirmKeyBtn.click();
    log(`[+] Key creation confirmed`);
    await sleep(2000);

    log(`[*] Extracting API key...`);
    let apiKey = null;
    try {
        const keyDisplay = await page.waitForSelector(
            'input[value*="ck_"], input[readonly], div[class*="modal"] input[type="text"][value]',
            { timeout: 10000 }
        );
        apiKey = await keyDisplay.getAttribute('value');
        if (!apiKey) apiKey = await keyDisplay.inputValue();
    } catch (e) {
        try {
            const keyText = await page.$eval('input[value*="ck_"]', el => el.value);
            apiKey = keyText;
        } catch (e2) {
            log(`[!] Could not extract API key`);
        }
    }

    if (apiKey) {
        log(`[+] API Key obtained: ${apiKey.substring(0, 20)}...`);
    }

    try {
        const gotItBtn = await page.waitForSelector('button:has-text("Got it")', { timeout: 3000 });
        await gotItBtn.click();
    } catch (e) {}

    return apiKey;
}
