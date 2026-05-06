/**
 * Kiro IDE signup flow.
 *
 * Strategy: drive the official `kiro-cli login --license free --use-device-flow`
 * command end-to-end. The CLI does the OAuth/PKCE handshake correctly with AWS
 * IAM Identity Center; we just need to complete the browser-side device
 * authorization (login Google + click Allow). Once kiro-cli finishes, it stores
 * the refresh_token / client_id / client_secret in a local SQLite database,
 * which we then read and append to kiro_credentials.json.
 *
 * kiro-cli is auto-installed if missing (Linux/macOS only).
 * Requires `sqlite3` binary in PATH.
 *
 * Returns the parsed credential object on success (label, auth, refreshToken,
 * clientId, clientSecret) so the caller can hand it to the Kiro pool. Throws
 * on any failure.
 */
import { spawn, execFile, exec } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { existsSync, copyFileSync, mkdtempSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { sleep } from './utils.js';
import { handleGoogleLogin } from './google.js';

const execFileP = promisify(execFile);
const execP = promisify(exec);

function dataSqlitePath() {
    if (process.platform === 'darwin') {
        return path.join(homedir(), 'Library', 'Application Support', 'kiro-cli', 'data.sqlite3');
    }
    return path.join(homedir(), '.local', 'share', 'kiro-cli', 'data.sqlite3');
}

async function runSqlite(dbPath, query) {
    // sqlite3 may refuse to open a file that another process has open with WAL.
    // Take a quick snapshot copy first, query that.
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'kiro-cli-snap-'));
    const snap = path.join(tmpDir, 'snap.sqlite3');
    try {
        copyFileSync(dbPath, snap);
        const { stdout } = await execFileP('sqlite3', [snap, query], { maxBuffer: 16 * 1024 * 1024 });
        return stdout.trim();
    } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
}

async function readKiroCredsFromSqlite(log) {
    const db = dataSqlitePath();
    if (!existsSync(db)) throw new Error(`kiro-cli data not found at ${db}`);

    const tokenJson = await runSqlite(db, "SELECT value FROM auth_kv WHERE key='kirocli:odic:token';");
    const regJson = await runSqlite(db, "SELECT value FROM auth_kv WHERE key='kirocli:odic:client-registration';");

    if (!tokenJson) throw new Error('kiro-cli token row empty');
    if (!regJson) throw new Error('kiro-cli client-registration row empty');

    let token, reg;
    try { token = JSON.parse(tokenJson); } catch (e) { throw new Error(`Token JSON parse failed: ${e.message}`); }
    try { reg = JSON.parse(regJson); } catch (e) { throw new Error(`Client-registration JSON parse failed: ${e.message}`); }

    const refreshToken = token.refresh_token || token.refreshToken;
    const clientId = reg.client_id || reg.clientId;
    const clientSecret = reg.client_secret || reg.clientSecret;
    if (!refreshToken) throw new Error('refresh_token missing in token row');
    if (!clientId || !clientSecret) throw new Error('clientId / clientSecret missing in client-registration row');

    log(`[+] Extracted Kiro credentials from sqlite (refresh_token=${refreshToken.length}c, client_id=${clientId.slice(0, 8)}...)`);
    return { refreshToken, clientId, clientSecret };
}

function parseDeviceUrl(line) {
    // kiro-cli prints something like:
    //   "Confirm the following code in the browser: FVWH-CFZK"
    //   "https://view.awsapps.com/start#/device?user_code=..."
    const m = line.match(/(https:\/\/view\.awsapps\.com\/start[^\s]*)/);
    return m ? m[1] : null;
}

export async function processKiro(page, email, password, log = console.log, opts = {}) {
    const TIMEOUT = opts.timeout || 90000;

    // Pre-flight: verify kiro-cli is reachable.  If missing, auto-install it
    // (Linux/macOS only).  Without this check the spawn() below emits an async
    // 'error' event whose rejection isn't awaited yet — crashing Node.
    try {
        await execFileP('kiro-cli', ['--version'], { timeout: 5000 });
    } catch (e) {
        if (e.code === 'ENOENT') {
            if (process.platform === 'win32') {
                throw new Error(
                    'kiro-cli not found in PATH. Install it first: https://kiro.dev/docs/cli/installation/'
                );
            }
            log('[*] kiro-cli not found — auto-installing via https://cli.kiro.dev/install ...');
            try {
                const { stdout, stderr } = await execP(
                    'curl -fsSL https://cli.kiro.dev/install | bash',
                    { timeout: 120_000, env: { ...process.env, NONINTERACTIVE: '1' } }
                );
                if (stdout) log(`[kiro-install] ${stdout.trim().split('\n').slice(-3).join(' | ')}`);
            } catch (installErr) {
                throw new Error(`kiro-cli auto-install failed: ${installErr.message}`);
            }
            // The installer puts the binary in ~/.local/bin — make sure it's
            // on PATH for any child processes we spawn later this session.
            const localBin = path.join(homedir(), '.local', 'bin');
            if (!process.env.PATH.split(':').includes(localBin)) {
                process.env.PATH = `${localBin}:${process.env.PATH}`;
            }
            // Verify the install actually worked.
            try {
                await execFileP('kiro-cli', ['--version'], { timeout: 5000 });
                log('[+] kiro-cli installed successfully');
            } catch (verifyErr) {
                throw new Error(
                    `kiro-cli installed but still not reachable: ${verifyErr.message}`
                );
            }
        }
        // Any other error (e.g. non-zero exit) is fine — binary exists.
    }

    log('[*] Spawning kiro-cli login (device flow)...');
    const child = spawn('kiro-cli', ['login', '--license', 'free', '--use-device-flow'], {
        env: { ...process.env, NO_COLOR: '1' }
    });

    let deviceUrl = null;
    let stderrTail = '';
    let spawnError = null;
    const finishedP = new Promise((resolve, reject) => {
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`kiro-cli exited code=${code}: ${stderrTail.slice(-500)}`)));
        child.on('error', (err) => { spawnError = err; reject(err); });
    });
    // Prevent unhandled rejection if the promise settles before we await it.
    finishedP.catch(() => {});

    const onLine = (chunk) => {
        const txt = chunk.toString();
        for (const line of txt.split('\n')) {
            if (!line.trim()) continue;
            log(`[kiro-cli] ${line.trim()}`);
            if (!deviceUrl) {
                const url = parseDeviceUrl(line);
                if (url) deviceUrl = url;
            }
        }
    };
    child.stdout.on('data', onLine);
    child.stderr.on('data', (chunk) => {
        stderrTail += chunk.toString();
        onLine(chunk);
    });

    // wait up to 30s for device URL to appear
    const startedAt = Date.now();
    while (!deviceUrl && !spawnError && Date.now() - startedAt < 30000) {
        await sleep(200);
    }
    if (spawnError) {
        throw new Error(`kiro-cli failed to start: ${spawnError.message}`);
    }
    if (!deviceUrl) {
        try { child.kill('SIGTERM'); } catch {}
        throw new Error('kiro-cli did not print a device URL within 30s');
    }
    log(`[*] Device URL: ${deviceUrl}`);

    // Navigate browser to URL
    await page.goto(deviceUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await sleep(2000);

    log('[*] Confirming device code...');
    try {
        const confirmBtn = await page.waitForSelector(
            'button:has-text("Confirm and continue"), button:has-text("Allow access"), button:has-text("Confirm")',
            { timeout: 10000 }
        );
        await confirmBtn.click();
        await sleep(1500);
    } catch (e) {
        log('[!] No "Confirm" button found, continuing (assume single-step flow)');
    }

    log('[*] Choosing Google login on AWS access portal...');
    try {
        const googleBtn = await page.waitForSelector(
            'a:has-text("Continue with Google"), button:has-text("Continue with Google")',
            { timeout: 10000 }
        );
        await googleBtn.click();
        await sleep(2000);
    } catch (e) {
        log('[!] No "Continue with Google" link — assuming Builder ID page redirected directly to Google');
    }

    await handleGoogleLogin(page, email, password, log, { timeout: TIMEOUT });

    log('[*] Waiting for AWS access portal post-login...');
    try {
        await page.waitForURL('**/awsapps.com/**', { timeout: TIMEOUT });
    } catch (e) { /* sometimes lands directly on consent */ }
    await sleep(2000);

    // Possible second consent step
    try {
        const allowBtn = await page.waitForSelector(
            'button:has-text("Allow access"), button:has-text("Allow"), button:has-text("Continue")',
            { timeout: 10000 }
        );
        await allowBtn.click();
        log('[+] Clicked Allow on access consent');
        await sleep(2000);
    } catch (e) {}

    log('[*] Waiting for kiro-cli to finish (token saved to sqlite)...');
    await Promise.race([
        finishedP,
        new Promise((_, reject) => setTimeout(() => reject(new Error('kiro-cli did not exit within 90s post-consent')), 90000))
    ]);

    // Small grace period for sqlite write
    await sleep(1500);

    return await readKiroCredsFromSqlite(log);
}
