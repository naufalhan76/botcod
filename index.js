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
    console.log('');
    const modeChoice = readlineSync.question(chalk.yellow('Enter choice (1/2/3): '));
    const mode = parseInt(modeChoice);

    if (![1, 2, 3].includes(mode)) {
        console.log(chalk.red('[ERROR] Invalid choice. Please enter 1, 2, or 3.'));
        process.exit(1);
    }

    const browserMode = readlineSync.question(chalk.yellow('Run headless (no browser window)? (y/n): '));
    const headless = browserMode.toLowerCase() === 'y';

    const confirm = readlineSync.question(chalk.yellow('Start the bot? (y/n): '));
    if (confirm.toLowerCase() !== 'y') {
        console.log(chalk.red('[*] Aborted.'));
        process.exit(0);
    }

    console.log(chalk.cyan('\n[*] Starting automation...\n'));
    console.log(chalk.gray('═'.repeat(50)));

    const emitter = runBatch({ accounts, proxies, mode, headless, keysOutputFile });

    emitter.on('log', ({ email, line }) => {
        const prefix = email ? chalk.gray(`[${email}] `) : '';
        console.log(prefix + line);
    });

    await new Promise(resolve => emitter.once('done', ({ results }) => {
        console.log(chalk.gray('\n' + '═'.repeat(50)));
        console.log(chalk.cyan('\n[*] =========== SUMMARY ==========='));
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        console.log(chalk.green(`    ✓ Success: ${successful.length}/${results.length}`));
        console.log(chalk.red(`    ✗ Failed:  ${failed.length}/${results.length}`));
        if (mode === 1 || mode === 3) {
            const okCount = results.filter(r => r.unlucidSuccess).length;
            console.log(chalk.cyan(`    [UNLUCID] Success: ${okCount}/${results.length}`));
        }
        if (mode === 2 || mode === 3) {
            const okCount = results.filter(r => r.codebuddySuccess).length;
            const keys = results.filter(r => r.apiKey).length;
            console.log(chalk.cyan(`    [CODEBUDDY] Success: ${okCount}/${results.length} | Keys: ${keys}`));
        }
        resolve();
    }));
}

main().catch(err => {
    console.error(chalk.red(`[FATAL] ${err.message}`));
    process.exit(1);
});
