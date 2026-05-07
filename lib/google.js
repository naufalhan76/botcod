/**
 * Google OAuth login flow handler.
 * Extracted from original index.js handleGoogleLogin().
 */
import { sleep } from './utils.js';

const WORKSPACE_TERMS_SELECTORS = [
    'button:has-text("I understand")',
    'button:has-text("Accept")',
    'button:has-text("Agree")',
    'button:has-text("Continue")',
    'button:has-text("Lanjutkan")',
    'button:has-text("Saya mengerti")',
    'button:has-text("Setuju")',
    'button:has-text("我了解")',
    'button:has-text("我明白")',
    'button:has-text("接受")',
    'button:has-text("同意")',
    'button:has-text("继续")',
    '[role="button"]:has-text("I understand")',
    '[role="button"]:has-text("Accept")',
    '[role="button"]:has-text("Agree")',
    '[role="button"]:has-text("Continue")',
    '[role="button"]:has-text("Lanjutkan")',
    '[role="button"]:has-text("Saya mengerti")',
    '[role="button"]:has-text("Setuju")',
    '[role="button"]:has-text("我了解")',
    '[role="button"]:has-text("我明白")',
    '[role="button"]:has-text("接受")',
    '[role="button"]:has-text("同意")',
    '[role="button"]:has-text("继续")',
    '#confirm',
    '#submit_approve_access'
].join(', ');

const WORKSPACE_TERMS_LABELS = [
    'I understand',
    'Accept',
    'Agree',
    'Continue',
    'Lanjutkan',
    'Saya mengerti',
    'Setuju',
    '我了解',
    '我明白',
    '接受',
    '同意',
    '继续'
];

function workspaceTermsExactSelector(label) {
    const escaped = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return [
        `button:has-text("${escaped}")`,
        `[role="button"]:has-text("${escaped}")`,
        `[aria-label="${escaped}"]`
    ].join(', ');
}

async function clickWorkspaceTermsButton(page, log) {
    for (const label of WORKSPACE_TERMS_LABELS) {
        const btn = await page.locator(workspaceTermsExactSelector(label)).filter({
            hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
        }).first();
        if (await btn.count().catch(() => 0)) {
            await btn.scrollIntoViewIfNeeded().catch(() => {});
            await btn.click({ timeout: 5000, force: true });
            log(`[+] Clicked Workspace Terms "${label}" button`);
            return true;
        }
    }

    return page.evaluate((labels) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const candidates = Array.from(document.querySelectorAll(
            'button, [role="button"], [aria-label], div[jsname], span[jsname]'
        ))
            .filter(isVisible)
            .map(el => {
                const text = normalize(el.innerText || el.textContent);
                const aria = normalize(el.getAttribute('aria-label'));
                const rect = el.getBoundingClientRect();
                const exactLabel = labels.find(label => text.toLowerCase() === label.toLowerCase() || aria.toLowerCase() === label.toLowerCase());
                const area = rect.width * rect.height;
                return { el, exactLabel, text, aria, area };
            })
            .filter(item => item.exactLabel && item.area < 80000)
            .sort((a, b) => a.area - b.area);

        const target = candidates[0]?.el;
        if (!target) return { ok: false };

        target.scrollIntoView({ block: 'center', inline: 'center' });
        target.focus?.();
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
            target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        }
        target.click?.();
        return { ok: true, label: candidates[0].exactLabel };
    }, WORKSPACE_TERMS_LABELS).then(result => {
        if (result?.ok) log(`[+] Clicked Workspace Terms "${result.label}" via exact DOM fallback`);
        return !!result?.ok;
    }).catch(() => false);
}

async function handleWorkspaceTerms(page, log, timeout = 30000) {
    const startedAt = Date.now();
    let clicked = false;
    while (Date.now() - startedAt < timeout) {
        const url = page.url();
        if (!url.includes('workspacetermsofservice') && !url.includes('speedbump')) return clicked;

        log(`[*] Google Workspace Terms page detected, looking for approval button...`);
        if (await clickWorkspaceTermsButton(page, log)) {
            clicked = true;
            await sleep(2500);
            continue;
        }

        const btn = await page.waitForSelector(WORKSPACE_TERMS_SELECTORS, { timeout: 5000 }).catch(() => null);
        if (btn) {
            await btn.click({ timeout: 5000 }).catch(async e => {
                if (!/detached|navigation|intercepts pointer events/i.test(e.message || '')) throw e;
                await sleep(2000);
            });
            clicked = true;
            log(`[+] Clicked Workspace Terms approval`);
            await sleep(2500);
            continue;
        }

        await sleep(2000);
    }
    if (!clicked && page.url().includes('workspacetermsofservice')) {
        try {
            const continueUrl = new URL(page.url()).searchParams.get('continue');
            if (continueUrl) {
                log(`[!] Workspace Terms approval not clickable; opening Google continue URL...`);
                await page.goto(continueUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await sleep(2500);
            }
        } catch (e) {}
    }
    return clicked;
}

function isGoogleIntermediateUrl(rawUrl) {
    try {
        const host = new URL(String(rawUrl)).hostname;
        return host.includes('accounts.google.') || host === 'accounts.youtube.com';
    } catch {
        const url = String(rawUrl || '');
        return url.includes('accounts.google.') || url.includes('accounts.youtube.com');
    }
}

async function clickGoogleConsentButton(page) {
    const labels = ['Continue', 'Allow', 'Lanjutkan', 'Izinkan', 'Setuju'];
    const clicked = await page.evaluate((labels) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const candidates = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'))
            .filter(isVisible)
            .map(el => ({
                el,
                text: normalize(el.innerText || el.textContent || el.value || el.getAttribute('aria-label')),
                area: el.getBoundingClientRect().width * el.getBoundingClientRect().height
            }))
            .filter(item => labels.some(label => item.text.toLowerCase() === label.toLowerCase()))
            .sort((a, b) => a.area - b.area);
        const target = candidates[0]?.el;
        if (!target) return null;
        target.scrollIntoView({ block: 'center', inline: 'center' });
        target.focus?.();
        target.click();
        return candidates[0].text;
    }, labels).catch(() => null);
    return clicked;
}

async function drainGoogleConsent(page, log, timeout = 25000) {
    const startedAt = Date.now();
    let clickedAny = false;
    while (Date.now() - startedAt < timeout) {
        const url = page.url();
        if (!isGoogleIntermediateUrl(url)) return clickedAny;

        await handleWorkspaceTerms(page, log, 1500);

        if (url.includes('/accounts/SetSID') || url.includes('accounts.youtube.com')) {
            await sleep(700);
            continue;
        }

        if (url.includes('oauth') || url.includes('consent') || url.includes('signin/oauth')) {
            const clicked = await clickGoogleConsentButton(page);
            if (clicked) {
                clickedAny = true;
                log(`[+] Clicked approval button on OAuth consent (${clicked})`);
                await sleep(1500);
                continue;
            }
        }

        await sleep(700);
    }
    return clickedAny;
}

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
        '#identifierNext, button:has-text("Next"), button:has-text("Berikutnya"), button:has-text("下一步"), button:has-text("Seterusnya"), div#identifierNext',
        { timeout: 5000 }
    );
    await nextBtn.click();
    // Wait for page to transition to password challenge
    await page.waitForURL(/\/signin\/challenge\/|\/signin\/v2\/challenge\//, { timeout: 15000 }).catch(() => {});
    await sleep(1500);

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

    log(`[*] Waiting for visible password field...`);
    // Google's password input has name="Passwd" — use this as primary selector.
    // There's also a hidden input[type="password"] with name="hiddenPassword" that must be avoided.
    const passwordInput = await page.waitForSelector(
        'input[name="Passwd"], input[type="password"]:not([aria-hidden="true"]):not([tabindex="-1"]):not([name="hiddenPassword"])',
        { timeout: TIMEOUT, state: 'visible' }
    );
    await passwordInput.click();
    await passwordInput.fill(password);
    await sleep(300);

    log(`[*] Clicking Next for password...`);
    const passNextBtn = await page.waitForSelector(
        '#passwordNext, button:has-text("Next"), button:has-text("Berikutnya"), button:has-text("下一步"), button:has-text("Seterusnya"), div#passwordNext',
        { timeout: 5000 }
    );
    await passNextBtn.click();
    // Wait for navigation away from password challenge page
    await page.waitForURL(url => !url.href.includes('/signin/challenge/pwd'), { timeout: 20000 }).catch(() => {});
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

    // Fast post-login loop: immediately react to URL state.
    // - speedbump/workspacetermsofservice → click "I understand"
    // - oauth/consent → click "Continue"/"Allow"
    // - 2FA/challenge → wait for manual solve
    // - redirected away from google → done
    const postLoginDeadline = Date.now() + 45000;
    let handled2FA = false;

    while (Date.now() < postLoginDeadline) {
        const url = page.url();

        // Already left Google → done
        if (!url.includes('accounts.google.com') && !url.includes('accounts.youtube.com')) {
            break;
        }

        // SetSID redirect (intermediate) → just wait briefly
        if (url.includes('/accounts/SetSID') || url.includes('accounts.youtube.com')) {
            await sleep(300);
            continue;
        }

        // Speedbump / Workspace Terms → immediately click "I understand"
        if (url.includes('speedbump') || url.includes('workspacetermsofservice')) {
            const clicked = await page.evaluate(() => {
                const keywords = ['i understand', 'saya mengerti', 'accept', 'agree', 'continue', '我了解', '同意', '接受'];
                for (const btn of document.querySelectorAll('button, [role="button"], input[type="submit"]')) {
                    if (btn.offsetParent === null) continue;
                    const txt = (btn.textContent || btn.value || '').trim().toLowerCase();
                    if (keywords.some(k => txt.includes(k))) { btn.click(); return txt; }
                }
                return null;
            }).catch(() => null);
            if (clicked) {
                log(`[+] Clicked Workspace Terms "${clicked}"`);
            } else {
                await clickWorkspaceTermsButton(page, log);
            }
            await sleep(500);
            continue;
        }

        // OAuth consent page → immediately click "Continue"/"Allow"
        if (url.includes('oauth') || url.includes('consent') || url.includes('signin/oauth')) {
            const consentClicked = await page.evaluate(() => {
                const approveBtn = document.querySelector('#submit_approve_access');
                if (approveBtn && approveBtn.offsetParent !== null) { approveBtn.click(); return 'approve'; }
                const keywords = ['continue', 'allow', 'lanjutkan', 'izinkan', '继续', '允许'];
                for (const btn of document.querySelectorAll('button, [role="button"]')) {
                    if (btn.offsetParent === null) continue;
                    const txt = (btn.textContent || '').trim().toLowerCase();
                    if (keywords.some(k => txt === k || txt.includes(k))) { btn.click(); return txt; }
                }
                return null;
            }).catch(() => null);
            if (consentClicked) log(`[+] OAuth consent: clicked "${consentClicked}"`);
            await sleep(500);
            continue;
        }

        // 2FA / security challenge
        if (url.includes('/challenge/') && !url.includes('/challenge/pwd')) {
            if (!handled2FA) {
                log(`[!] Security challenge/2FA detected for ${email}. Waiting 30s for manual solve...`);
                handled2FA = true;
                await sleep(30000);
            }
            await sleep(1000);
            continue;
        }

        // Generic: try clicking any visible approval/continue button
        await page.evaluate(() => {
            const keywords = ['continue', 'allow', 'i understand', 'accept', 'agree', 'lanjutkan', 'izinkan', 'saya mengerti', '继续', '允许', '同意', '我了解'];
            for (const btn of document.querySelectorAll('button, [role="button"]')) {
                if (btn.offsetParent === null) continue;
                const txt = (btn.textContent || '').trim().toLowerCase();
                if (keywords.some(k => txt === k)) {
                    btn.click();
                    return;
                }
            }
        }).catch(() => {});
        await sleep(400);
    }

    return true;
}
