/**
 * OpenAI-compatible endpoints (consumed by OpenCode and other tools).
 *
 *   GET  /v1/models
 *   POST /v1/chat/completions
 */
import { Router } from 'express';
import { getConfig, providerForModel } from '../lib/config.js';
import { streamChatCompletion } from '../lib/upstream.js';
import { summary as codebuddySummary } from '../lib/keyPool.js';
import { kiroChatCompletion } from '../lib/providers/kiro/index.js';
import { summaryKiro } from '../lib/providers/kiro/credentials.js';
import { trackAiRequest } from '../lib/history.js';
import { applyBodyFilters } from '../lib/contentFilter.js';
import { applyRtk } from '../lib/rtk/index.js';
import { applyCaveman } from '../lib/caveman.js';
import { applyHistoryTruncation } from '../lib/historyTruncate.js';
import { applyResponseCache, storeResponseCache } from '../lib/responseCache.js';

const router = Router();

router.get('/models', (req, res) => {
    const cfg = getConfig();
    const created = Math.floor(Date.now() / 1000);
    res.json({
        object: 'list',
        data: cfg.EXPOSED_MODELS.map(id => ({
            id,
            object: 'model',
            created,
            owned_by: 'sambungin'
        }))
    });
});

router.post('/chat/completions', async (req, res) => {
    const body = req.body;
    const history = trackAiRequest(req, res, {
        source: 'openai-compatible',
        endpoint: 'POST /v1/chat/completions'
    });
    if (!body || typeof body !== 'object') {
        history.set({ error: 'Invalid JSON body' });
        return res.status(400).json({ error: { message: 'Invalid JSON body', type: 'invalid_request_error' } });
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        history.set({ error: '`messages` must be a non-empty array' });
        return res.status(400).json({ error: { message: '`messages` must be a non-empty array', type: 'invalid_request_error' } });
    }
    if (!body.model || typeof body.model !== 'string') {
        history.set({ error: '`model` is required' });
        return res.status(400).json({ error: { message: '`model` is required', type: 'invalid_request_error' } });
    }

    // Apply content filters (strip fingerprints from messages before forwarding)
    applyBodyFilters(body);

    const cfg = getConfig();

    // Response Cache — check BEFORE mutations (hash raw input for consistency)
    let cacheKey = null;
    if (cfg.CACHE_ENABLED !== false) {
        const cacheResult = applyResponseCache(body);
        if (cacheResult.hit) {
            history.set({ cache_hit: true });
            res.set('X-Cache', 'HIT');
            return res.json(cacheResult.cachedResponse);
        }
        cacheKey = cacheResult.key; // save for storing after response
        if (cacheKey) res.set('X-Cache', 'MISS');
    }

    // RTK Token Saver — compress tool_result content (default ON)
    if (cfg.RTK_ENABLED !== false) {
        applyRtk(body);
    }

    // Caveman Mode — inject terse system prompt (default ON)
    if (cfg.CAVEMAN_ENABLED !== false) {
        applyCaveman(body, cfg.CAVEMAN_LEVEL || 'full');
    }

    // History Truncation — drop old messages when approaching context limit
    let truncateResult = null;
    if (cfg.TRUNCATE_ENABLED !== false) {
        truncateResult = applyHistoryTruncation(body, { threshold: cfg.TRUNCATE_THRESHOLD || 0.7 });
        if (truncateResult.truncated) {
            history.set({ tokens_saved: truncateResult.tokensSaved });
        }
    }

    const provider = providerForModel(body.model);
    history.set({ model: body.model, provider });
    if (!provider) {
        history.set({ error: `unknown model: ${body.model}` });
        return res.status(400).json({
            error: { message: `unknown model: ${body.model}`, type: 'invalid_request_error' }
        });
    }

    // For non-streaming requests, intercept response to store in cache
    if (cacheKey && body.stream === false) {
        const origEnd = res.end.bind(res);
        const origWriteHead = res.writeHead.bind(res);
        let capturedStatus = 200;
        res.writeHead = (status, ...args) => {
            capturedStatus = status;
            return origWriteHead(status, ...args);
        };
        res.end = (data, ...args) => {
            // Only cache successful responses
            if (capturedStatus >= 200 && capturedStatus < 400 && data) {
                try {
                    const parsed = JSON.parse(typeof data === 'string' ? data : data.toString());
                    if (!parsed.error) storeResponseCache(cacheKey, parsed);
                } catch { /* ignore parse errors */ }
            }
            return origEnd(data, ...args);
        };
    }

    if (provider === 'codebuddy') {
        const pool = codebuddySummary();
        if (pool.active === 0) {
            history.set({ error: 'No active CodeBuddy keys available' });
            return res.status(503).json({
                error: {
                    message: 'No active CodeBuddy keys available. Add keys via dashboard → Pool → CodeBuddy.',
                    type: 'no_keys_available',
                    provider: 'codebuddy',
                    pool
                }
            });
        }
        return streamChatCompletion(body, res);
    }

    if (provider === 'kiro') {
        const pool = summaryKiro();
        if (pool.active === 0) {
            history.set({ error: 'No active Kiro credentials' });
            return res.status(503).json({
                error: {
                    message: 'No active Kiro credentials. Add one via dashboard → Pool → Kiro.',
                    type: 'no_creds_available',
                    provider: 'kiro',
                    pool
                }
            });
        }
        return kiroChatCompletion(body, res);
    }

    history.set({ error: `unhandled provider: ${provider}` });
    return res.status(500).json({ error: { message: `unhandled provider: ${provider}`, type: 'router_error' } });
});

export default router;
