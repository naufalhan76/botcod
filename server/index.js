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
import openaiRoutes from './routes/openai.js';
import apiRoutes from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadConfig();
const cfg = getConfig();

const app = express();
app.use(express.json({ limit: '10mb' }));

// Optional dashboard auth (for non-localhost deployments)
app.use((req, res, next) => {
    const config = getConfig();
    if (!config.DASHBOARD_PASSWORD) return next();
    if (req.path.startsWith('/v1/')) return next(); // OpenAI endpoints unauthed
    const token = req.headers['x-dashboard-password'] || req.query.password;
    if (token === config.DASHBOARD_PASSWORD) return next();
    if (req.path === '/' || req.path.startsWith('/static/')) return next();
    res.status(401).json({ error: 'unauthorized' });
});

app.use('/v1', openaiRoutes);
app.use('/api', apiRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
    console.error('[server] error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: { message: err.message, type: 'internal_server_error' } });
});

startWatcher();

const server = app.listen(cfg.PORT, cfg.HOST, () => {
    console.log(`\nbotcod server listening on http://${cfg.HOST}:${cfg.PORT}`);
    console.log(`  Dashboard:  http://${cfg.HOST}:${cfg.PORT}/`);
    console.log(`  OpenAI API: http://${cfg.HOST}:${cfg.PORT}/v1`);
    console.log(`  Models:     ${cfg.EXPOSED_MODELS.join(', ')}\n`);
});

process.on('SIGINT', () => { console.log('\nshutting down...'); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });

export { app, server };
