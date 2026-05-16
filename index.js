/**
 * CLI entrypoint - interactive prompts then runs batch via lib/runner.
 * Logic lives in lib/. The dashboard server (server/index.js) reuses the same lib.
 */
import path from 'path';
import chalk from 'chalk';
import readlineSync from 'readline-sync';
import { loadLines } from './lib/utils.js';
import { runBatch } from './lib/runner.js';

function banner() {
    console.log(chalk.cyan('╔' + '═'.repeat(50) + '╗'));
    console.log(chalk.cyan('║') + chalk.yellow('   MULTI-SERVICE AUTO SIGNUP BOT                  ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray('   Unlucid.ai + CodeBuddy.ai                      ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray('   Camoufox + Proxy Rotation                      ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + '═'.repeat(50) + '╝'));
    console.log('');
    console.log(chalk.gray('Tip: untuk dashboard web (router OpenAI-compatible + bot control), jalankan:'));
    console.log(chalk.gray('     npm run dev'));
    console.log('');
}

async function main() {
    banner();

    const accountsFile = path.resolve('accounts.txt');
    const proxiesFile = path.resolve('proxies.txt');
    const keysOutputFile = path.resolve('codebuddy_keys.txt');

    console.log(chalk.cyan('[*] Loading accounts from: ') + chalk.white(accountsFile));
    console.log(chalk.cyan('[*] Loading proxies from: ') + chalk.white(proxiesFile));
    console.log('');

    const accounts = loadLines(accountsFile);
    const proxies = loadLines(proxiesFile);

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
    console.log('');

    console.log(chalk.yellow('Select registration mode:'));
    console.log(chalk.white('  1) Unlucid.ai only'));
    console.log(chalk.white('  2) CodeBuddy.ai only'));
    console.log(chalk.white('  3) Unlucid.ai + CodeBuddy.ai (both)'));
    console.log(chalk.white('  4) Kiro only'));
    console.log(chalk.white('  6) CodeBuddy + Kiro'));
    console.log(chalk.white('  7) Unlucid + CodeBuddy + Kiro'));
    console.log(chalk.white(' 12) Kiro + auto-upgrade (skip if charge > $0)'));
    console.log(chalk.white(' 14) CodeBuddy + Kiro + Kiro upgrade'));
    console.log(chalk.white(' 15) Unlucid + CodeBuddy + Kiro + Kiro upgrade'));
    console.log('');
    const modeChoice = readlineSync.question(chalk.yellow('Enter choice: '));
    const mode = parseInt(modeChoice);
    // Includes 8, 10, 11 so the bit-pair guard below produces the more helpful
    // "Kiro upgrade (bit 8) requires Kiro signup (bit 4)" error for those combos.
    const VALID_MODES = [1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15];

    if (!VALID_MODES.includes(mode)) {
        console.log(chalk.red(`[ERROR] Invalid choice. Valid modes: ${VALID_MODES.join(', ')}`));
        process.exit(1);
    }

    if ((mode & 8) && !(mode & 4)) {
        console.log(chalk.red('[ERROR] Kiro upgrade (bit 8) requires Kiro signup (bit 4) to also be enabled.'));
        process.exit(1);
    }

    const engineChoice = readlineSync.question(chalk.yellow('Browser engine? (1=Camoufox, 2=CloakBrowser): '));
    const browserEngine = engineChoice === '2' ? 'cloakbrowser' : 'camoufox';

    const browserMode = readlineSync.question(chalk.yellow('Run headless (no browser window)? (y/n): '));
    const headless = browserMode.toLowerCase() === 'y';

    const confirm = readlineSync.question(chalk.yellow('Start the bot? (y/n): '));
    if (confirm.toLowerCase() !== 'y') {
        console.log(chalk.red('[*] Aborted.'));
        process.exit(0);
    }

    console.log(chalk.cyan('\n[*] Starting automation...\n'));
    console.log(chalk.gray('═'.repeat(50)));

    const failedOutputDir = path.resolve('.');
    const emitter = runBatch({ accounts, proxies, mode, headless, browserEngine, keysOutputFile, failedOutputDir });

    emitter.on('log', ({ email, line }) => {
        const prefix = email ? chalk.gray(`[${email}] `) : '';
        console.log(prefix + line);
    });

    await new Promise(resolve => emitter.once('done', ({ results, failedFiles }) => {
        console.log(chalk.gray('\n' + '═'.repeat(50)));
        console.log(chalk.cyan('\n[*] =========== SUMMARY ==========='));
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        console.log(chalk.green(`    ✓ Success: ${successful.length}/${results.length}`));
        console.log(chalk.red(`    ✗ Failed:  ${failed.length}/${results.length}`));
        if (mode & 1) {
            const okCount = results.filter(r => r.unlucidSuccess).length;
            console.log(chalk.cyan(`    [UNLUCID] Success: ${okCount}/${results.length}`));
        }
        if (mode & 2) {
            const okCount = results.filter(r => r.codebuddySuccess).length;
            const keys = results.filter(r => r.apiKey).length;
            console.log(chalk.cyan(`    [CODEBUDDY] Success: ${okCount}/${results.length} | Keys: ${keys}`));
        }
        if (mode & 4) {
            const okCount = results.filter(r => r.kiroSuccess).length;
            console.log(chalk.cyan(`    [KIRO] Success: ${okCount}/${results.length}`));
        }
        if (mode & 8) {
            const okCount = results.filter(r => r.kiroUpgradeSuccess).length;
            console.log(chalk.cyan(`    [KIRO-UPGRADE] Success: ${okCount}/${results.length}`));
        }
        if (failedFiles && Object.keys(failedFiles).length > 0) {
            console.log(chalk.yellow('\n    [FAILED ACCOUNTS SAVED]'));
            for (const [file, info] of Object.entries(failedFiles)) {
                console.log(chalk.yellow(`    → ${file} (${info.count} account${info.count > 1 ? 's' : ''})`));
            }
            console.log(chalk.gray('    Format: email:password — bisa langsung dipake ulang sebagai accounts.txt'));
        }
        resolve();
    }));
}

main().catch(err => {
    console.error(chalk.red(`[FATAL] ${err.message}`));
    process.exit(1);
});
