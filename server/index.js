/**
 * Express server entrypoint. Exposes:
 *   /v1/*    - OpenAI-compatible endpoints (consumed by OpenCode)
 *   /api/*   - Dashboard backend
 *   /        - Static dashboard (HTML+JS)
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig, loadConfig } from './lib/config.js';
import { startWatcher } from './lib/keyPool.js';
import { startTempmailPoller } from './lib/tempmail.js';
import openaiRoutes from './routes/openai.js';
import apiRoutes from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadConfig();
const cfg = getConfig();

const app = express();
app.use(express.json({ limit: '10mb' }));

function isWildcardHost(host) {
    return host === '0.0.0.0' || host === '::';
}

// Serve new Next.js dashboard (static export from dashboard/out/).
// Falls back to legacy vanilla dashboard if new build doesn't exist.
import fs from 'fs';
const dashboardOut = path.resolve(__dirname, '..', 'dashboard', 'out');
const legacyPublic = path.join(__dirname, 'public');

if (fs.existsSync(dashboardOut)) {
    app.use(express.static(dashboardOut));
} else {
    console.warn('[server] dashboard/out/ not found — serving legacy dashboard from server/public/');
    app.use(express.static(legacyPublic));
}

// Legacy dashboard still accessible at /legacy
app.use('/legacy', express.static(legacyPublic));

app.use('/v1', openaiRoutes);

// Optional dashboard API auth (only meaningful when binding to non-localhost).
app.use('/api', (req, res, next) => {
    const config = getConfig();
    if (!config.DASHBOARD_PASSWORD) return next();
    const token = req.headers['x-dashboard-password'] || req.query.password;
    if (token === config.DASHBOARD_PASSWORD) return next();
    res.status(401).json({ error: 'unauthorized' });
});
app.use('/api', apiRoutes);

// SPA fallback: serve index.html for dashboard routes not matched by static files or API.
// Next.js static export with trailingSlash creates /route/index.html for each page.
// This fallback handles cases where the file doesn't exist (e.g. direct browser navigation).
if (fs.existsSync(dashboardOut)) {
    app.get('*', (req, res, next) => {
        // Skip API and v1 routes
        if (req.path.startsWith('/api') || req.path.startsWith('/v1') || req.path.startsWith('/legacy')) {
            return next();
        }
        const indexFile = path.join(dashboardOut, req.path, 'index.html');
        const rootIndex = path.join(dashboardOut, 'index.html');
        if (fs.existsSync(indexFile)) {
            res.sendFile(indexFile);
        } else if (fs.existsSync(rootIndex)) {
            res.sendFile(rootIndex);
        } else {
            next();
        }
    });
}

app.use((err, req, res, next) => {
    console.error('[server] error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: { message: err.message, type: 'internal_server_error' } });
});

startWatcher();
startTempmailPoller();

const server = app.listen(cfg.PORT, cfg.HOST, () => {
    if (isWildcardHost(cfg.HOST)) {
        console.log(`\nsambungin server listening on all interfaces (${cfg.HOST}:${cfg.PORT})`);
        console.log(`  Dashboard:  http://<VPS_IP>:${cfg.PORT}/`);
        console.log(`  OpenAI API: http://<VPS_IP>:${cfg.PORT}/v1`);
        console.log('  Note: replace <VPS_IP> with your server public IP or domain.');
    } else {
        console.log(`\nsambungin server listening on http://${cfg.HOST}:${cfg.PORT}`);
        console.log(`  Dashboard:  http://${cfg.HOST}:${cfg.PORT}/`);
        console.log(`  OpenAI API: http://${cfg.HOST}:${cfg.PORT}/v1`);
    }
    console.log(`  Models:     ${cfg.EXPOSED_MODELS.join(', ')}\n`);
});

process.on('SIGINT', () => { console.log('\nshutting down...'); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });

// Prevent stray unhandled rejections (e.g. from child-process spawn errors in
// bot jobs) from tearing down the server.  The actual error is already surfaced
// to the user via the job log — we just need to stop Node from exiting.
process.on('unhandledRejection', (reason) => {
    console.error('[server] unhandled rejection (ignored):', reason);
});

export { app, server };
