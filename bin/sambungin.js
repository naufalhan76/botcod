#!/usr/bin/env node
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

try {
  execSync('npx concurrently --names "api,dashboard" --prefix-colors "cyan,magenta" "node server/index.js" "npm run dev --prefix dashboard"', {
    cwd: root,
    stdio: 'inherit',
  });
} catch {
  process.exit(1);
}
