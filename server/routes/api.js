/**
 * Dashboard backend API:
 *
 *   GET    /api/overview
 *   GET    /api/pool
 *   POST   /api/pool/reload
 *   POST   /api/pool/:key/status   { status: active|cooldown|dead }
 *
 *   GET    /api/accounts
 *   POST   /api/accounts           { lines: ["email:pass", ...] }
 *   DELETE /api/accounts/:idx
 *
 *   GET    /api/proxies
 *   POST   /api/proxies            { lines: [...] }
 *   DELETE /api/proxies/:idx
 *
 *   GET    /api/jobs
 *   POST   /api/jobs               { mode, headless, limit }
 *   GET    /api/jobs/:id
 *   GET    /api/jobs/:id/stream    (SSE)
 *   POST   /api/jobs/:id/abort
 *
 *   GET    /api/settings
 *   PUT    /api/settings           { COOLDOWN_MS?, EXPOSED_MODELS?, ... }
 *
 *   POST   /api/test-chat          { model, prompt }
 */
import { Router } from 'express';
import { getConfig, updateSettings, providerForModel } from '../lib/config.js';
import {
    listPool, summary, reloadKeys, setStatus, getEntryByMaskedOrEmail
} from '../lib/keyPool.js';
import { loadLines, writeLines } from '../../lib/utils.js';
import { createJob, getJob, listJobs, abortJob } from '../lib/jobs.js';
import { streamChatCompletion } from '../lib/upstream.js';
import { kiroChatCompletion } from '../lib/providers/kiro/index.js';
import {
    listKiroCreds, summaryKiro, addKiroCred, removeKiroCred,
    setKiroCredStatus, getAccessTokenForCred, loadKiroStore
} from '../lib/providers/kiro/credentials.js';
import {
    listInboxes, addInbox, updateInbox, removeInbox, testInboxCredentials,
    listDomains, addDomain, updateDomain, removeDomain,
    listAddresses, generateAddress, revokeAddress,
    listMessages, getMessage, extractCode,
    pollAllInboxes, tempmailSummary
} from '../lib/tempmail.js';

const router = Router();

router.get('/overview', (req, res) => {
    const cfg = getConfig();
    res.json({
        pool: summary(),
        kiro_pool: summaryKiro(),
        tempmail: tempmailSummary(),
        accounts: loadLines(cfg.ACCOUNTS_FILE).length,
        proxies: loadLines(cfg.PROXIES_FILE).length,
        jobs_total: listJobs().length,
        jobs_running: listJobs().filter(j => j.status === 'running').length,
        config: {
            UPSTREAM_BASE: cfg.UPSTREAM_BASE,
            COOLDOWN_MS: cfg.COOLDOWN_MS,
            EXPOSED_MODELS: cfg.EXPOSED_MODELS,
            MODEL_PROVIDERS: cfg.MODEL_PROVIDERS,
            PORT: cfg.PORT
        }
    });
});

// ---- Kiro pool ----
router.get('/kiro/pool', (req, res) => {
    res.json({ summary: summaryKiro(), entries: listKiroCreds() });
});
router.post('/kiro/pool/reload', (req, res) => {
    loadKiroStore();
    res.json({ count: listKiroCreds().length });
});
router.post('/kiro/pool', async (req, res) => {
    const { label, refreshToken, clientId, clientSecret, auth, accessToken, expiresAt } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });
    try {
        const idx = addKiroCred({ label, auth, refreshToken, clientId, clientSecret, accessToken, expiresAt });
        // Validate by attempting to refresh.
        try { await getAccessTokenForCred(idx); } catch (e) {
            return res.json({ idx, validated: false, error: e.message });
        }
        res.json({ idx, validated: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});
router.delete('/kiro/pool/:idx', (req, res) => {
    const idx = parseInt(req.params.idx);
    res.json({ ok: removeKiroCred(idx) });
});
router.post('/kiro/pool/:idx/status', (req, res) => {
    try {
        const ok = setKiroCredStatus(parseInt(req.params.idx), req.body.status);
        res.json({ ok });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ---- Temp mail ----
router.get('/tempmail/overview', (req, res) => {
    res.json({
        summary: tempmailSummary(),
        inboxes: listInboxes(),
        domains: listDomains(),
        addresses: listAddresses()
    });
});

// Inboxes (IMAP destinations)
router.get('/tempmail/inboxes', (req, res) => res.json({ inboxes: listInboxes() }));
router.post('/tempmail/inboxes', (req, res) => {
    try {
        const id = addInbox(req.body || {});
        res.json({ id });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});
router.put('/tempmail/inboxes/:id', (req, res) => {
    try {
        updateInbox(req.params.id, req.body || {});
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});
router.delete('/tempmail/inboxes/:id', (req, res) => {
    try {
        removeInbox(req.params.id);
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});
router.post('/tempmail/inboxes/test', async (req, res) => {
    try {
        const result = await testInboxCredentials(req.body || {});
        res.json(result);
    } catch (e) {
        res.status(400).json({ ok: false, error: e.message });
    }
});

// Domains
router.get('/tempmail/domains', (req, res) => res.json({ domains: listDomains() }));
router.post('/tempmail/domains', (req, res) => {
    try {
        addDomain(req.body || {});
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});
router.put('/tempmail/domains/:domain', (req, res) => {
    try {
        updateDomain(req.params.domain, req.body || {});
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});
router.delete('/tempmail/domains/:domain', (req, res) => {
    try {
        removeDomain(req.params.domain);
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Addresses
router.get('/tempmail/addresses', (req, res) => res.json({ addresses: listAddresses() }));
router.post('/tempmail/addresses', (req, res) => {
    try {
        const row = generateAddress(req.body || {});
        res.json(row);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});
router.delete('/tempmail/addresses/:address', (req, res) => {
    try {
        revokeAddress(req.params.address);
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Messages
router.get('/tempmail/addresses/:address/messages', (req, res) => {
    res.json({ messages: listMessages(req.params.address, { limit: Number(req.query.limit) || 50 }) });
});
router.get('/tempmail/messages/:id', (req, res) => {
    const m = getMessage(req.params.id);
    if (!m) return res.status(404).json({ error: 'not found' });
    res.json(m);
});
router.get('/tempmail/addresses/:address/extract', (req, res) => {
    res.json(extractCode(req.params.address));
});

router.post('/tempmail/poll', async (req, res) => {
    res.json(await pollAllInboxes());
});

// ---- Pool ----
router.get('/pool', (req, res) => res.json({ summary: summary(), entries: listPool() }));
router.post('/pool/reload', (req, res) => res.json({ count: reloadKeys() }));
router.post('/pool/:identifier/status', (req, res) => {
    const entry = getEntryByMaskedOrEmail(req.params.identifier);
    if (!entry) return res.status(404).json({ error: 'key not found' });
    try {
        setStatus(entry.key, req.body.status);
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ---- Accounts ----
router.get('/accounts', (req, res) => {
    const cfg = getConfig();
    const lines = loadLines(cfg.ACCOUNTS_FILE);
    res.json({
        entries: lines.map((line, idx) => {
            const [email, ...rest] = line.split(':');
            return { idx, email, has_password: rest.length > 0 };
        })
    });
});
router.post('/accounts', (req, res) => {
    const cfg = getConfig();
    const newLines = (req.body.lines || []).filter(l => l && typeof l === 'string' && l.includes(':'));
    if (req.body.replace) {
        writeLines(cfg.ACCOUNTS_FILE, newLines);
    } else {
        const existing = loadLines(cfg.ACCOUNTS_FILE);
        writeLines(cfg.ACCOUNTS_FILE, [...existing, ...newLines]);
    }
    res.json({ count: loadLines(cfg.ACCOUNTS_FILE).length });
});
router.delete('/accounts/:idx', (req, res) => {
    const cfg = getConfig();
    const idx = parseInt(req.params.idx);
    const lines = loadLines(cfg.ACCOUNTS_FILE);
    if (idx < 0 || idx >= lines.length) return res.status(404).json({ error: 'index out of range' });
    lines.splice(idx, 1);
    writeLines(cfg.ACCOUNTS_FILE, lines);
    res.json({ count: lines.length });
});

// ---- Proxies ----
router.get('/proxies', (req, res) => {
    const cfg = getConfig();
    res.json({ entries: loadLines(cfg.PROXIES_FILE).map((p, idx) => ({ idx, proxy: p })) });
});
router.post('/proxies', (req, res) => {
    const cfg = getConfig();
    const newLines = (req.body.lines || []).filter(l => l && typeof l === 'string');
    if (req.body.replace) {
        writeLines(cfg.PROXIES_FILE, newLines);
    } else {
        const existing = loadLines(cfg.PROXIES_FILE);
        writeLines(cfg.PROXIES_FILE, [...existing, ...newLines]);
    }
    res.json({ count: loadLines(cfg.PROXIES_FILE).length });
});
router.delete('/proxies/:idx', (req, res) => {
    const cfg = getConfig();
    const idx = parseInt(req.params.idx);
    const lines = loadLines(cfg.PROXIES_FILE);
    if (idx < 0 || idx >= lines.length) return res.status(404).json({ error: 'index out of range' });
    lines.splice(idx, 1);
    writeLines(cfg.PROXIES_FILE, lines);
    res.json({ count: lines.length });
});

// ---- Jobs (signup runner) ----
router.get('/jobs', (req, res) => res.json({ jobs: listJobs() }));
router.post('/jobs', (req, res) => {
    const { mode, headless = true, limit = 0 } = req.body || {};
    try {
        const job = createJob({ mode: parseInt(mode), headless: !!headless, limit: parseInt(limit) || 0 });
        res.json(job.summary());
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});
router.get('/jobs/:id', (req, res) => {
    const j = getJob(req.params.id);
    if (!j) return res.status(404).json({ error: 'not found' });
    res.json({ ...j.summary(), recentLogs: j.logs.slice(-50) });
});
router.get('/jobs/:id/stream', (req, res) => {
    const j = getJob(req.params.id);
    if (!j) return res.status(404).json({ error: 'not found' });
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    j.subscribe(res);
});
router.post('/jobs/:id/abort', (req, res) => {
    const ok = abortJob(req.params.id);
    res.json({ ok });
});

// ---- Settings ----
router.get('/settings', (req, res) => {
    const cfg = getConfig();
    res.json({
        COOLDOWN_MS: cfg.COOLDOWN_MS,
        EXPOSED_MODELS: cfg.EXPOSED_MODELS,
        UPSTREAM_BASE: cfg.UPSTREAM_BASE,
        MAX_ROTATIONS_PER_REQUEST: cfg.MAX_ROTATIONS_PER_REQUEST,
        PORT: cfg.PORT
    });
});
router.put('/settings', (req, res) => {
    const allowed = ['COOLDOWN_MS', 'EXPOSED_MODELS', 'MAX_ROTATIONS_PER_REQUEST'];
    const patch = {};
    for (const k of allowed) {
        if (k in (req.body || {})) patch[k] = req.body[k];
    }
    updateSettings(patch);
    res.json(getConfig());
});

// ---- Quick test chat (proxies through router) ----
router.post('/test-chat', async (req, res) => {
    const { model = 'auto-chat', prompt = 'Reply with just OK' } = req.body || {};
    const body = {
        model,
        messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt }
        ],
        stream: false
    };
    const provider = providerForModel(model);
    if (provider === 'kiro') return kiroChatCompletion(body, res);
    return streamChatCompletion(body, res);
});

export default router;
