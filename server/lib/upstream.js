/**
 * CodeBuddy upstream client. Handles streaming, key rotation on 429/quota,
 * and translation between client (OpenAI) and upstream (CodeBuddy) formats.
 */
import { getConfig } from './config.js';
import {
    pickNext,
    markUsed,
    markCooldown,
    markDead
} from './keyPool.js';
import {
    buildUpstreamHeaders,
    translateRequest,
    cleanChunk,
    classifyUpstreamError
} from './translate.js';

const log = (...args) => console.log('[upstream]', ...args);

/**
 * Stream chat completion to a Node.js HTTP response, rotating keys on
 * upstream limit errors. Returns when stream ends (success or failure).
 *
 * Behaviour:
 *  - If error happens BEFORE any byte is written to the client, swap key + retry.
 *  - If error happens MID-stream (rare), do not retry; surface error to client.
 */
export async function streamChatCompletion(openaiBody, res, opts = {}) {
    const cfg = getConfig();
    const upstreamUrl = `${cfg.UPSTREAM_BASE}${cfg.UPSTREAM_PATH}`;
    const maxRotations = opts.maxRotations ?? cfg.MAX_ROTATIONS_PER_REQUEST;

    const triedKeys = [];
    let lastErr = null;
    let lastStatus = 0;

    // Track whether the CLIENT wanted streaming. Upstream is always streaming
    // (CodeBuddy only supports SSE), but if client asked for stream:false we
    // aggregate the chunks server-side.
    const clientWantsStream = openaiBody.stream !== false;
    const upstreamBody = translateRequest(openaiBody);

    for (let attempt = 0; attempt < maxRotations; attempt++) {
        const entry = pickNext(triedKeys);
        if (!entry) {
            const msg = lastErr
                ? `All keys exhausted; last error: ${lastErr}`
                : 'No active keys available in pool';
            sendErrorJson(res, lastStatus || 503, 'no_keys_available', msg);
            return;
        }
        triedKeys.push(entry.key);

        const headers = buildUpstreamHeaders(entry.key);

        let upstream;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), cfg.UPSTREAM_TIMEOUT_MS);

            upstream = await fetch(upstreamUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(upstreamBody),
                signal: controller.signal
            });
            // clear once we have headers
            controller.signal.addEventListener('abort', () => clearTimeout(timeoutId));
            clearTimeout(timeoutId);
        } catch (err) {
            lastErr = err.message;
            log(`network error w/ key ${maskKey(entry.key)}: ${err.message}`);
            continue; // try next key
        }

        if (!upstream.ok) {
            const bodyText = await upstream.text().catch(() => '');
            lastStatus = upstream.status;
            lastErr = `${upstream.status} ${bodyText.slice(0, 200)}`;
            const klass = classifyUpstreamError(upstream.status, bodyText);

            log(`upstream ${upstream.status} w/ key ${maskKey(entry.key)} (${klass || 'unclassified'}): ${bodyText.slice(0, 200)}`);

            if (klass === 'rate_limit' || klass === 'quota' || klass === 'channel') {
                markCooldown(entry.key, klass);
                continue; // try next key
            }
            if (klass === 'auth') {
                markDead(entry.key, 'auth_failed');
                continue;
            }
            // Unclassified upstream error -> propagate to client without rotating
            sendErrorJson(res, upstream.status, 'upstream_error', bodyText.slice(0, 500));
            return;
        }

        // Upstream is good. Stream to client (or aggregate, depending on client mode).
        markUsed(entry.key);

        if (!clientWantsStream) {
            // Read full SSE upstream, aggregate to single OpenAI chat.completion JSON.
            const fullText = await upstream.text();
            const aggregated = aggregateNonStream(fullText);
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
            });
            res.end(JSON.stringify(aggregated));
            return;
        }

        // SSE pass-through with light cleanup.
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        try {
            await pipeSse(upstream.body, res);
        } catch (err) {
            log(`stream error mid-flight: ${err.message}`);
            // No retry - already wrote bytes to client. Just terminate.
            try { res.end(); } catch {}
        }
        return;
    }

    sendErrorJson(res, lastStatus || 503, 'all_keys_failed',
        `Tried ${triedKeys.length} key(s); last: ${lastErr}`);
}

async function pipeSse(upstreamBody, res) {
    const reader = upstreamBody.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are delimited by \n\n
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const event = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const transformed = transformSseEvent(event);
            if (transformed !== null) {
                res.write(transformed + '\n\n');
            }
        }
    }
    if (buffer.length) {
        const transformed = transformSseEvent(buffer);
        if (transformed !== null) res.write(transformed + '\n\n');
    }
    res.end();
}

function transformSseEvent(event) {
    // Each event may be `data: {...}` (possibly multi-line). Pass-through everything
    // except clean JSON payload of `data:`.
    const lines = event.split('\n');
    const out = [];
    for (const line of lines) {
        if (line.startsWith('data:')) {
            const payload = line.slice(5).trim();
            if (payload === '[DONE]' || payload === '') {
                out.push(line);
            } else {
                try {
                    const parsed = JSON.parse(payload);
                    cleanChunk(parsed);
                    out.push('data: ' + JSON.stringify(parsed));
                } catch {
                    out.push(line); // pass-through unparseable
                }
            }
        } else {
            out.push(line);
        }
    }
    return out.join('\n');
}

/**
 * Aggregate a CodeBuddy SSE stream into a single OpenAI chat.completion object.
 * Used when the client requested stream:false.
 */
function aggregateNonStream(sseText) {
    const events = sseText.split('\n\n');
    const merged = {
        id: null,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: null,
        choices: [{
            index: 0,
            message: { role: 'assistant', content: '' },
            finish_reason: null
        }],
        usage: null
    };

    // Per the OpenAI streaming protocol, tool_calls arrive incrementally:
    // first chunk for an index has id/type/function.name, subsequent chunks
    // append fragments to function.arguments. Merge by `index`.
    const toolCallsByIndex = new Map();

    for (const ev of events) {
        for (const line of ev.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                const chunk = JSON.parse(payload);
                if (chunk.id) merged.id = chunk.id;
                if (chunk.model) merged.model = chunk.model;
                if (Array.isArray(chunk.choices)) {
                    for (const c of chunk.choices) {
                        if (c.delta && typeof c.delta.content === 'string') {
                            merged.choices[0].message.content += c.delta.content;
                        }
                        if (c.delta && Array.isArray(c.delta.tool_calls)) {
                            for (const tc of c.delta.tool_calls) {
                                const idx = typeof tc.index === 'number' ? tc.index : 0;
                                let acc = toolCallsByIndex.get(idx);
                                if (!acc) {
                                    acc = { index: idx, id: '', type: 'function', function: { name: '', arguments: '' } };
                                    toolCallsByIndex.set(idx, acc);
                                }
                                if (tc.id) acc.id = tc.id;
                                if (tc.type) acc.type = tc.type;
                                if (tc.function) {
                                    if (typeof tc.function.name === 'string' && tc.function.name) {
                                        acc.function.name = tc.function.name;
                                    }
                                    if (typeof tc.function.arguments === 'string') {
                                        acc.function.arguments += tc.function.arguments;
                                    }
                                }
                            }
                        }
                        if (c.finish_reason) merged.choices[0].finish_reason = c.finish_reason;
                    }
                }
                if (chunk.usage) merged.usage = chunk.usage;
            } catch {}
        }
    }

    if (toolCallsByIndex.size) {
        merged.choices[0].message.tool_calls = [...toolCallsByIndex.values()]
            .sort((a, b) => a.index - b.index)
            // Drop the synthetic `index` field from the final message; it's only
            // used in deltas, not in the final assembled tool_calls array.
            .map(({ index, ...rest }) => rest);
    }

    if (!merged.id) merged.id = `chatcmpl-${Date.now()}`;
    return merged;
}

function sendErrorJson(res, status, code, message) {
    if (res.headersSent) {
        try { res.end(); } catch {}
        return;
    }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code, message, type: 'router_error' } }));
}

function maskKey(k) {
    return k.length > 14 ? `${k.slice(0, 8)}…${k.slice(-6)}` : '***';
}
