/**
 * OpenAI-compatible endpoints (consumed by OpenCode and other tools).
 *
 *   GET  /v1/models
 *   POST /v1/chat/completions
 */
import { Router } from 'express';
import { getConfig } from '../lib/config.js';
import { streamChatCompletion } from '../lib/upstream.js';
import { summary } from '../lib/keyPool.js';

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
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: { message: 'Invalid JSON body', type: 'invalid_request_error' } });
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return res.status(400).json({ error: { message: '`messages` must be a non-empty array', type: 'invalid_request_error' } });
    }
    if (!body.model || typeof body.model !== 'string') {
        return res.status(400).json({ error: { message: '`model` is required', type: 'invalid_request_error' } });
    }

    const pool = summary();
    if (pool.active === 0) {
        return res.status(503).json({
            error: {
                message: 'No active CodeBuddy keys available. Add keys to codebuddy_keys.txt or run the signup bot.',
                type: 'no_keys_available',
                pool
            }
        });
    }

    await streamChatCompletion(body, res);
});

export default router;
