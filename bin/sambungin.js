#!/usr/bin/env node
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dashboardOut = path.join(root, 'dashboard', 'out');

// Auto-build dashboard if static export doesn't exist
if (!existsSync(dashboardOut)) {
  console.log('[sambungin] Building dashboard (first run)...');
  try {
    execSync('npm run build', { cwd: path.join(root, 'dashboard'), stdio: 'inherit' });
  } catch {
    console.error('[sambungin] Dashboard build failed. Starting server without new dashboard.');
  }
}

// Start the server
const server = spawn('node', ['server/index.js'], { cwd: root, stdio: 'inherit' });
server.on('close', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
