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

// Static dashboard assets (HTML, CSS, JS) are always public so the page
// always renders. Authentication only gates the sensitive backend at /api/*
// below. /v1/* (OpenAI-compatible endpoints) is always public so OpenCode
// and other plain OpenAI clients work without custom headers.
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

app.use((err, req, res, next) => {
    console.error('[server] error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: { message: err.message, type: 'internal_server_error' } });
});

startWatcher();
startTempmailPoller();

const server = app.listen(cfg.PORT, cfg.HOST, () => {
    console.log(`\nsambungin server listening on http://${cfg.HOST}:${cfg.PORT}`);
    console.log(`  Dashboard:  http://${cfg.HOST}:${cfg.PORT}/`);
    console.log(`  OpenAI API: http://${cfg.HOST}:${cfg.PORT}/v1`);
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
