import { Camoufox } from 'camoufox-js';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import readlineSync from 'readline-sync';

// ============================================================
// MULTI-SERVICE AUTO SIGNUP BOT
// Supports: Unlucid.ai / CodeBuddy.ai / Both
// Using Camoufox (anti-detect Firefox) + Playwright
// With proxy rotation for each account
// ============================================================

const UNLUCID_SIGNUP_URL = 'https://unlucid.ai/r/50rn50uv';
const CODEBUDDY_LOGIN_URL = 'https://www.codebuddy.ai/login';
const CODEBUDDY_KEYS_URL = 'https://www.codebuddy.ai/profile/keys';
const TIMEOUT = 60000;
const MAX_RETRIES = 3;
let HEADLESS = false;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 1000, max = 3000) {
    return sleep(Math.floor(Math.random() * (max - min + 1)) + min);
}

function parseProxy(proxyString) {
    try {
        const url = new URL(proxyString.trim());
        return {
            server: `${url.protocol}//${url.hostname}:${url.port}`,
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password)
        };
    } catch (e) {
        console.log(chalk.red(`[ERROR] Invalid proxy format: ${proxyString}`));
        return null;
    }
}

function loadFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(chalk.red(`[ERROR] File not found: ${filePath}`));
        process.exit(1);
    }
    return fs.readFileSync(filePath, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
}

function banner() {
    console.log(chalk.cyan('\u2554' + '\u2550'.repeat(50) + '\u2557'));
    console.log(chalk.cyan('\u2551') + chalk.yellow('   MULTI-SERVICE AUTO SIGNUP BOT                  ') + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + chalk.gray('   Unlucid.ai + CodeBuddy.ai                      ') + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + chalk.gray('   Camoufox + Proxy Rotation                      ') + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u255A' + '\u2550'.repeat(50) + '\u255D'));
    console.log('');
}

/**
 * Retry wrapper - runs an async function up to MAX_RETRIES times.
 * On failure it refreshes the page (navigates to a blank page first to clear state)
 * then lets the function re-run from scratch.
 */
async function withRetry(page, fn, label) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            const isLastAttempt = attempt === MAX_RETRIES;
            if (isLastAttempt) {
                console.log(chalk.red(`    [\u2717] ${label}: All ${MAX_RETRIES} attempts failed. Last error: ${error.message}`));
                throw error;
            }

            console.log(chalk.yellow(`    [!] ${label}: Attempt ${attempt}/${MAX_RETRIES} failed - ${error.message}`));
            console.log(chalk.yellow(`    [*] Refreshing browser and retrying in 3s... (attempt ${attempt + 1}/${MAX_RETRIES})`));

            // Clear browser state: navigate away then wait
            try {
                await page.goto('about:blank', { timeout: 10000 }).catch(() => {});
            } catch (e) {
                // ignore navigation errors during cleanup
            }
            await sleep(3000);
        }
    }
}

// ============================================================
// GOOGLE LOGIN HANDLER (SHARED)
// ============================================================

async function handleGoogleLogin(page, email, password) {
    // Wait for Google login page
    await page.waitForURL('**/accounts.google.com/**', { timeout: TIMEOUT });
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT });
    await sleep(1500);

    // Check if account chooser is shown
    const currentUrl = page.url();
    if (currentUrl.includes('accountchooser') || currentUrl.includes('chooser')) {
        console.log(chalk.yellow(`    [*] Account chooser detected, clicking "Use another account"...`));
        try {
            const useAnotherBtn = await page.waitForSelector('li:has-text("Use another account"), [data-identifier="other"]', { timeout: 5000 });
            await useAnotherBtn.click();
            await sleep(1500);
        } catch (e) {
            // No account chooser, proceed with email input
        }
    }

    // ---- ENTER EMAIL ----
    console.log(chalk.yellow(`    [*] Entering email: ${email}`));
    const emailInput = await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
    await emailInput.click();
    await emailInput.fill(email);
    await sleep(300);

    // Click "Next" button
    console.log(chalk.yellow(`    [*] Clicking Next...`));
    const nextBtn = await page.waitForSelector('#identifierNext, button:has-text("Next"), div#identifierNext', { timeout: 5000 });
    await nextBtn.click();
    await sleep(2000);

    // Check for "Couldn't find your Google Account" error
    try {
        const errorEl = await page.waitForSelector('[class*="error"] span, div[aria-live="assertive"]', { timeout: 3000 });
        const errorText = await errorEl.textContent();
        if (errorText && (errorText.includes("Couldn't find") || errorText.includes("Tidak dapat"))) {
            throw new Error(`Google account not found: ${email}`);
        }
    } catch (e) {
        if (e.message.includes('Google account not found')) throw e;
    }

    // ---- ENTER PASSWORD ----
    console.log(chalk.yellow(`    [*] Entering password...`));
    const passwordInput = await page.waitForSelector('input[type="password"]', { timeout: TIMEOUT });
    await passwordInput.click();
    await passwordInput.fill(password);
    await sleep(300);

    // Click "Next" for password
    console.log(chalk.yellow(`    [*] Clicking Next for password...`));
    const passNextBtn = await page.waitForSelector('#passwordNext, button:has-text("Next"), div#passwordNext', { timeout: 5000 });
    await passNextBtn.click();
    await sleep(2000);

    // Check for wrong password error
    try {
        const wrongPassEl = await page.waitForSelector('[class*="error"] span, div[aria-live="assertive"]', { timeout: 3000 });
        const wrongPassText = await wrongPassEl.textContent();
        if (wrongPassText && (wrongPassText.includes("Wrong password") || wrongPassText.includes("Sandi salah"))) {
            throw new Error(`Wrong password for: ${email}`);
        }
    } catch (e) {
        if (e.message.includes('Wrong password')) throw e;
    }

    // Handle security challenges (2FA, verify identity, etc.)
    try {
        const challengeEl = await page.waitForSelector('h1:has-text("Verify"), h1:has-text("2-Step"), [data-challengetype]', { timeout: 5000 });
        if (challengeEl) {
            console.log(chalk.red(`    [!] Security challenge/2FA detected for ${email}. Waiting 30s for manual solve...`));
            await sleep(30000);
        }
    } catch (e) {
        // No security challenge - good
    }

    // Handle Google Workspace "Welcome to your new account" page
    await sleep(1000);
    try {
        const wsUrl = page.url();
        if (wsUrl.includes('workspacetermsofservice') || wsUrl.includes('speedbump')) {
            console.log(chalk.yellow(`    [*] Google Workspace Terms page detected, clicking "I understand"...`));
            const iUnderstandBtn = await page.waitForSelector('button:has-text("I understand")', { timeout: 10000 });
            await iUnderstandBtn.click();
            await sleep(1500);
        }
    } catch (e) {
        try {
            const iUnderstandBtn = await page.waitForSelector('button:has-text("I understand")', { timeout: 3000 });
            if (iUnderstandBtn) {
                await iUnderstandBtn.click();
                console.log(chalk.green(`    [+] Clicked "I understand"`));
                await sleep(1500);
            }
        } catch (e2) {
            // No workspace terms page
        }
    }

    // Handle OAuth consent page
    await sleep(1000);
    try {
        const consentUrl = page.url();
        if (consentUrl.includes('oauth') || consentUrl.includes('consent') || consentUrl.includes('signin/oauth')) {
            console.log(chalk.yellow(`    [*] OAuth consent page detected, clicking "Continue"...`));
            const continueBtn = await page.waitForSelector('button:has-text("Continue")', { timeout: 10000 });
            await continueBtn.click();
            console.log(chalk.green(`    [+] Clicked "Continue" on OAuth consent`));
            await sleep(1500);
        }
    } catch (e) {
        try {
            const continueBtn = await page.waitForSelector('button:has-text("Continue"), button:has-text("Allow"), button:has-text("Lanjutkan")', { timeout: 3000 });
            if (continueBtn) {
                await continueBtn.click();
                console.log(chalk.green(`    [+] Clicked Continue/Allow`));
                await sleep(1500);
            }
        } catch (e2) {
            // No consent page
        }
    }

    return true;
}

// ============================================================
// UNLUCID.AI SIGNUP HANDLER
// ============================================================

async function processUnlucid(page, email, password) {
    console.log(chalk.yellow(`    [*] Navigating to ${UNLUCID_SIGNUP_URL}...`));
    await page.goto(UNLUCID_SIGNUP_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await sleep(1000);

    // STEP 1: Click "Sign In" button in navbar
    console.log(chalk.yellow(`    [*] Looking for Sign In button...`));
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT }).catch(() => {});
    await sleep(500);

    const signInBtn = await page.waitForSelector('button:has-text("Sign In")', { timeout: TIMEOUT });
    await signInBtn.click();
    console.log(chalk.green(`    [+] Clicked Sign In button`));
    await sleep(1000);

    // STEP 2: Click Google button in modal
    console.log(chalk.yellow(`    [*] Looking for Google button in modal...`));
    const googleBtn = await page.waitForSelector('button:has-text("Google")', { timeout: 10000 });
    await googleBtn.click();
    console.log(chalk.green(`    [+] Clicked Google button in sign-in modal`));

    // STEP 3: Handle Google login
    console.log(chalk.yellow(`    [*] Waiting for Google login page redirect...`));
    await handleGoogleLogin(page, email, password);

    // Wait for redirect back to unlucid.ai
    console.log(chalk.yellow(`    [*] Waiting for redirect back to unlucid.ai...`));
    try {
        await page.waitForURL('**/unlucid.ai/**', { timeout: TIMEOUT });
    } catch (e) {
        await sleep(3000);
    }

    await sleep(1000);
    const finalUrl = page.url();
    console.log(chalk.gray(`    [*] Final URL: ${finalUrl}`));

    if (finalUrl.includes('unlucid.ai')) {
        return true;
    }
    return true;
}

// ============================================================
// CODEBUDDY.AI SIGNUP + API KEY HANDLER
// ============================================================

async function processCodeBuddy(page, email, password) {
    console.log(chalk.yellow(`    [*] Navigating to ${CODEBUDDY_LOGIN_URL}...`));
    await page.goto(CODEBUDDY_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await sleep(2000);

    // STEP 1: Click "Sign up with Google" inside the iframe
    console.log(chalk.yellow(`    [*] Looking for login iframe...`));
    const loginIframe = await page.waitForSelector('iframe[title="login-iframe"]', { timeout: TIMEOUT });
    const iframeContent = await loginIframe.contentFrame();

    if (!iframeContent) {
        throw new Error('Could not access login iframe');
    }

    console.log(chalk.yellow(`    [*] Clicking "Sign up with Google"...`));
    const googleSignupLink = await iframeContent.waitForSelector('a:has-text("Sign up with Google"), [class*="google"]', { timeout: 10000 });
    await googleSignupLink.click();
    await sleep(1000);

    // STEP 2: Handle service agreement confirmation dialog
    console.log(chalk.yellow(`    [*] Checking for service agreement dialog...`));
    try {
        const confirmBtn = await iframeContent.waitForSelector('button:has-text("Confirm")', { timeout: 5000 });
        await confirmBtn.click();
        console.log(chalk.green(`    [+] Confirmed service agreement`));
        await sleep(2000);
    } catch (e) {
        // Dialog might not appear if already accepted
        console.log(chalk.gray(`    [*] No service agreement dialog (already accepted or direct redirect)`));
    }

    // STEP 3: Handle Google login
    console.log(chalk.yellow(`    [*] Waiting for Google login page...`));
    await handleGoogleLogin(page, email, password);

    // STEP 4: Wait for redirect back to CodeBuddy
    console.log(chalk.yellow(`    [*] Waiting for redirect back to CodeBuddy...`));
    try {
        await page.waitForURL('**/codebuddy.ai/**', { timeout: TIMEOUT });
    } catch (e) {
        await sleep(3000);
    }
    await sleep(2000);

    // STEP 5: Handle region selection (if new account)
    const currentUrl = page.url();
    if (currentUrl.includes('/register/user/complete') || currentUrl.includes('/login/select')) {
        console.log(chalk.yellow(`    [*] Region selection page detected...`));

        // Wait for the page to fully load
        await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT });
        await sleep(1500);

        // Wait for redirect to register page if on login/select
        try {
            await page.waitForURL('**/register/user/complete**', { timeout: 10000 });
        } catch (e) {
            // Already on the right page
        }
        await sleep(1000);

        // Click the registration location dropdown
        console.log(chalk.yellow(`    [*] Selecting Singapore as registration region...`));
        const regionInput = await page.waitForSelector('input[placeholder*="Registration location"], input[class*="region"], input[type="text"]', { timeout: 10000 });
        await regionInput.click();
        await sleep(1000);

        // Select Singapore from the dropdown
        const singaporeOption = await page.waitForSelector('li:has-text("Singapore"), [class*="option"]:has-text("Singapore")', { timeout: 5000 });
        await singaporeOption.click();
        console.log(chalk.green(`    [+] Selected Singapore`));
        await sleep(500);

        // Click Submit
        const submitElement = await page.$('div[class*="submit"], button:has-text("Submit"), a:has-text("Submit"), [class*="btn"]:has-text("Submit")');
        if (submitElement) {
            await submitElement.click();
        } else {
            await page.click('text=Submit');
        }
        console.log(chalk.green(`    [+] Submitted registration`));
        await sleep(3000);
    }

    // STEP 6: Navigate to Access Keys page
    console.log(chalk.yellow(`    [*] Navigating to Access Keys page...`));
    await page.goto(CODEBUDDY_KEYS_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await sleep(2000);

    // STEP 7: Click "Create Key"
    console.log(chalk.yellow(`    [*] Creating API key...`));
    const createKeyBtn = await page.waitForSelector('button:has-text("Create Key")', { timeout: 10000 });
    await createKeyBtn.click();
    await sleep(1000);

    // STEP 8: Fill key name with random string
    const keyName = Math.random().toString(36).substring(2, 10);
    console.log(chalk.yellow(`    [*] Filling key name "${keyName}"...`));
    const keyNameInput = await page.waitForSelector('input[placeholder*="Enter"], input[placeholder*="characters"], div[class*="modal"] input[type="text"]', { timeout: 5000 });
    await keyNameInput.fill(keyName);
    await sleep(300);

    // STEP 9: Click Confirm to create the key
    const confirmKeyBtn = await page.waitForSelector('button:has-text("Confirm")', { timeout: 5000 });
    await confirmKeyBtn.click();
    console.log(chalk.green(`    [+] Key creation confirmed`));
    await sleep(2000);

    // STEP 10: Extract the API key from the success dialog
    console.log(chalk.yellow(`    [*] Extracting API key...`));
    let apiKey = null;

    try {
        // The key is displayed in a textbox/input in the success dialog
        const keyDisplay = await page.waitForSelector('input[value*="ck_"], input[readonly], div[class*="modal"] input[type="text"][value]', { timeout: 10000 });
        apiKey = await keyDisplay.getAttribute('value');

        if (!apiKey) {
            apiKey = await keyDisplay.inputValue();
        }
    } catch (e) {
        try {
            const keyText = await page.$eval('input[value*="ck_"]', el => el.value);
            apiKey = keyText;
        } catch (e2) {
            console.log(chalk.red(`    [!] Could not extract API key`));
        }
    }

    if (apiKey) {
        console.log(chalk.green(`    [+] API Key obtained: ${apiKey.substring(0, 20)}...`));
    }

    // Close the success dialog
    try {
        const gotItBtn = await page.waitForSelector('button:has-text("Got it")', { timeout: 3000 });
        await gotItBtn.click();
    } catch (e) {
        // Dialog might auto-close
    }

    return apiKey;
}

// ============================================================
// MAIN PROCESS ACCOUNT FUNCTION
// ============================================================

async function processAccount(email, password, proxy, accountIndex, totalAccounts, proxyIndex, totalProxies, mode) {
    const proxyConfig = parseProxy(proxy);
    if (!proxyConfig) {
        return { email, success: false, error: 'Invalid proxy', apiKey: null };
    }

    console.log(chalk.cyan(`\n[${accountIndex + 1}/${totalAccounts}] Processing: ${email}`));
    console.log(chalk.magenta(`    [PROXY] ${proxy.trim()}`));
    console.log(chalk.gray(`    [PROXY INFO] Server: ${proxyConfig.server} | User: ${proxyConfig.username} | Proxy #${proxyIndex + 1}/${totalProxies}`));

    let browser = null;
    let unlucidSuccess = false;
    let codebuddySuccess = false;
    let apiKey = null;

    try {
        console.log(chalk.yellow(`    [*] Launching Camoufox browser...`));
        browser = await Camoufox({
            headless: HEADLESS,
            proxy: {
                server: proxyConfig.server,
                username: proxyConfig.username,
                password: proxyConfig.password
            }
        });

        const context = browser.contexts()[0] || await browser.newContext();
        const page = await context.newPage();

        page.setDefaultTimeout(TIMEOUT);
        page.setDefaultNavigationTimeout(TIMEOUT);

        // ---- UNLUCID with retry ----
        if (mode === 1 || mode === 3) {
            console.log(chalk.cyan(`    [UNLUCID] Starting Unlucid.ai signup...`));
            try {
                await withRetry(page, async (attempt) => {
                    if (attempt > 1) {
                        console.log(chalk.cyan(`    [UNLUCID] Retry attempt ${attempt}/${MAX_RETRIES}...`));
                    }
                    const success = await processUnlucid(page, email, password);
                    if (success) {
                        unlucidSuccess = true;
                        console.log(chalk.green(`    [\u2713] UNLUCID: ${email} signed up successfully!`));
                    }
                    return success;
                }, 'UNLUCID');
            } catch (error) {
                console.log(chalk.red(`    [\u2717] UNLUCID FAILED after ${MAX_RETRIES} attempts: ${error.message}`));
            }
            await sleep(2000);
        }

        // ---- CODEBUDDY with retry ----
        if (mode === 2 || mode === 3) {
            console.log(chalk.cyan(`    [CODEBUDDY] Starting CodeBuddy.ai signup...`));
            try {
                await withRetry(page, async (attempt) => {
                    if (attempt > 1) {
                        console.log(chalk.cyan(`    [CODEBUDDY] Retry attempt ${attempt}/${MAX_RETRIES}...`));
                    }
                    const key = await processCodeBuddy(page, email, password);
                    if (key) {
                        apiKey = key;
                        codebuddySuccess = true;
                        console.log(chalk.green(`    [\u2713] CODEBUDDY: ${email} registered + API key obtained!`));
                    } else {
                        throw new Error('Registered but API key was null');
                    }
                    return key;
                }, 'CODEBUDDY');
            } catch (error) {
                console.log(chalk.red(`    [\u2717] CODEBUDDY FAILED after ${MAX_RETRIES} attempts: ${error.message}`));
            }
        }

        await browser.close();

        const success = (mode === 1 && unlucidSuccess) ||
                        (mode === 2 && codebuddySuccess) ||
                        (mode === 3 && (unlucidSuccess || codebuddySuccess));

        return { email, success, error: null, apiKey, unlucidSuccess, codebuddySuccess };

    } catch (error) {
        console.log(chalk.red(`    [\u2717] FAILED: ${email} - ${error.message}`));
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        return { email, success: false, error: error.message, apiKey: null, unlucidSuccess, codebuddySuccess };
    }
}

// ============================================================
// ENTRY POINT
// ============================================================

async function main() {
    banner();

    const accountsFile = path.resolve('accounts.txt');
    const proxiesFile = path.resolve('proxies.txt');

    console.log(chalk.cyan('[*] Loading accounts from: ') + chalk.white(accountsFile));
    console.log(chalk.cyan('[*] Loading proxies from: ') + chalk.white(proxiesFile));
    console.log('');

    const accounts = loadFile(accountsFile);
    const proxies = loadFile(proxiesFile);

    if (accounts.length === 0) {
        console.log(chalk.red('[ERROR] No accounts found in accounts.txt'));
        process.exit(1);
    }

    if (proxies.length === 0) {
        console.log(chalk.red('[ERROR] No proxies found in proxies.txt'));
        process.exit(1);
    }

    console.log(chalk.green(`[+] Loaded ${accounts.length} account(s)`));
    console.log(chalk.green(`[+] Loaded ${proxies.length} proxy(ies)`));
    console.log(chalk.gray(`[*] Proxy rotation: round-robin (1 proxy per account, cycling if needed)`));
    console.log(chalk.gray(`[*] Retry: up to ${MAX_RETRIES}x per service on timeout/failure`));
    console.log('');

    // Ask registration mode
    console.log(chalk.yellow('Select registration mode:'));
    console.log(chalk.white('  1) Unlucid.ai only'));
    console.log(chalk.white('  2) CodeBuddy.ai only'));
    console.log(chalk.white('  3) Unlucid.ai + CodeBuddy.ai (both)'));
    console.log('');
    const modeChoice = readlineSync.question(chalk.yellow('Enter choice (1/2/3): '));
    const mode = parseInt(modeChoice);

    if (![1, 2, 3].includes(mode)) {
        console.log(chalk.red('[ERROR] Invalid choice. Please enter 1, 2, or 3.'));
        process.exit(1);
    }

    const modeNames = { 1: 'Unlucid.ai only', 2: 'CodeBuddy.ai only', 3: 'Unlucid.ai + CodeBuddy.ai' };
    console.log(chalk.gray(`[*] Mode: ${modeNames[mode]}`));
    console.log('');

    // Ask headless or non-headless
    const browserMode = readlineSync.question(chalk.yellow('Run headless (no browser window)? (y/n): '));
    HEADLESS = browserMode.toLowerCase() === 'y';
    console.log(chalk.gray(`[*] Browser mode: ${HEADLESS ? 'HEADLESS (invisible)' : 'HEADED (visible)'}`));
    console.log('');

    const confirm = readlineSync.question(chalk.yellow('Start the bot? (y/n): '));
    if (confirm.toLowerCase() !== 'y') {
        console.log(chalk.red('[*] Aborted.'));
        process.exit(0);
    }

    console.log(chalk.cyan('\n[*] Starting automation...\n'));
    console.log(chalk.gray('\u2550'.repeat(50)));

    const results = [];
    const outputFile = path.resolve('codebuddy_keys.txt');
    let codebuddyKeysCount = 0;

    for (let i = 0; i < accounts.length; i++) {
        const accountLine = accounts[i];
        const [email, ...passParts] = accountLine.split(':');
        const password = passParts.join(':');

        if (!email || !password) {
            console.log(chalk.red(`[!] Invalid account format at line ${i + 1}: ${accountLine}`));
            results.push({ email: accountLine, success: false, error: 'Invalid format', apiKey: null });
            continue;
        }

        // Round-robin proxy assignment
        const proxyIndex = i % proxies.length;
        const proxy = proxies[proxyIndex];

        const result = await processAccount(email.trim(), password.trim(), proxy, i, accounts.length, proxyIndex, proxies.length, mode);
        results.push(result);

        // Immediately append to TXT file when API key is obtained
        if ((mode === 2 || mode === 3) && result.apiKey) {
            fs.appendFileSync(outputFile, `${email.trim()}:${result.apiKey}\n`, 'utf-8');
            codebuddyKeysCount++;
            console.log(chalk.green(`    [SAVED] ${email.trim()}:${result.apiKey.substring(0, 15)}... >> codebuddy_keys.txt`));
        }

        // Delay between accounts (2-4 seconds)
        if (i < accounts.length - 1) {
            const delay = Math.floor(Math.random() * 2000) + 2000;
            console.log(chalk.gray(`\n    [*] Waiting ${(delay / 1000).toFixed(1)}s before next account...`));
            await sleep(delay);
        }
    }

    // ============================================================
    // SUMMARY
    // ============================================================

    console.log(chalk.gray('\n' + '\u2550'.repeat(50)));
    console.log(chalk.cyan('\n[*] =========== SUMMARY ==========='));
    console.log('');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(chalk.green(`    \u2713 Success: ${successful.length}/${results.length}`));
    console.log(chalk.red(`    \u2717 Failed:  ${failed.length}/${results.length}`));
    console.log('');

    if (mode === 1 || mode === 3) {
        const unlucidOk = results.filter(r => r.unlucidSuccess);
        console.log(chalk.cyan(`    [UNLUCID] Success: ${unlucidOk.length}/${results.length}`));
    }

    if (mode === 2 || mode === 3) {
        const codebuddyOk = results.filter(r => r.codebuddySuccess);
        console.log(chalk.cyan(`    [CODEBUDDY] Success: ${codebuddyOk.length}/${results.length}`));
        if (codebuddyKeysCount > 0) {
            console.log(chalk.green(`    [CODEBUDDY] API keys saved: ${codebuddyKeysCount} >> codebuddy_keys.txt`));
        }
    }

    console.log('');

    if (successful.length > 0) {
        console.log(chalk.green('    Successful accounts:'));
        successful.forEach(r => {
            let details = `      - ${r.email}`;
            if (r.apiKey) details += ` (API Key: ${r.apiKey.substring(0, 20)}...)`;
            console.log(chalk.green(details));
        });
    }

    if (failed.length > 0) {
        console.log(chalk.red('\n    Failed accounts:'));
        failed.forEach(r => console.log(chalk.red(`      - ${r.email}: ${r.error}`)));
    }

    console.log(chalk.cyan('\n[*] Bot finished.'));
}

main().catch(err => {
    console.error(chalk.red(`[FATAL] ${err.message}`));
    process.exit(1);
});
