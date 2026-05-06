/**
 * Kiro provider — bridges OpenAI-shaped chat completion requests to
 * AWS CodeWhisperer's `generateAssistantResponse` endpoint
 * (the API behind https://app.kiro.dev / Kiro IDE).
 *
 * Auth: OAuth 2.0 refresh token (Builder ID DeviceCode or AWS SSO IdC).
 * Wire format: AWS EventStream binary (parsed locally → re-emitted as OpenAI SSE).
 */
import { randomUUID } from 'crypto';
import { getConfig } from '../../config.js';
import { resolveKiroModelId } from './models.js';
import { EventStreamParser } from './eventstream.js';
import {
    pickNextKiroCred,
    markKiroUsed,
    markKiroCooldown,
    markKiroDead,
    getAccessTokenForCred,
    listKiroCreds,
    summaryKiro
} from './credentials.js';

const log = (...args) => console.log('[kiro]', ...args);

const UPSTREAM_URL = 'https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse';

const KIRO_USER_AGENT = 'aws-sdk-js/1.0.18 ua/2.1 os/darwin#25.0.0 lang/js md/nodejs#20.16.0 api/codewhispererstreaming#1.0.18 m/E KiroIDE-0.2.13-66c23a8c5d15afabec89ef9954ef52a119f10d369df04d548fc6c1eac694b0d1';
const KIRO_AMZ_USER_AGENT = 'aws-sdk-js/1.0.18 KiroIDE-0.2.13-66c23a8c5d15afabec89ef9954ef52a119f10d369df04d548fc6c1eac694b0d1';

/**
 * Translate an OpenAI request to Kiro's CodeWhisperer body.
 *
 * Kiro doesn't accept `messages: [...]` directly. Each turn must be flattened:
 *   - history: array of (user|assistant) pairs prior to current message
 *   - currentMessage: the latest user message
 *
 * For an MVP we concatenate any system prompt into the first user message and
 * keep history short. Tool calls / multimodal content are passed through best-effort.
 */
function buildKiroRequest(openaiBody) {
    const friendlyModel = openaiBody.model;
    const modelId = resolveKiroModelId(friendlyModel);
    if (!modelId) throw new Error(`unknown kiro model: ${friendlyModel}`);

    const msgs = (openaiBody.messages || []).map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : extractText(m.content)
    }));

    // Pull system messages and prefix the first user message.
    const systemText = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n').trim();
    const turns = msgs.filter(m => m.role !== 'system');

    if (turns.length === 0) {
        throw new Error('no user/assistant messages provided');
    }

    // Last turn must be user; everything before is history.
    const lastTurn = turns[turns.length - 1];
    if (lastTurn.role !== 'user') {
        // CodeBuddy-equivalent fallback: append a stub user message.
        turns.push({ role: 'user', content: '(continue)' });
    }
    const currentText = (() => {
        const last = turns[turns.length - 1];
        return systemText && turns.filter(t => t.role === 'user').length === 1
            ? `${systemText}\n\n${last.content}`
            : last.content;
    })();

    const history = [];
    for (let i = 0; i < turns.length - 1; i++) {
        const t = turns[i];
        if (t.role === 'user') {
            history.push({ userInputMessage: { content: t.content, modelId } });
        } else if (t.role === 'assistant') {
            history.push({ assistantResponseMessage: { content: t.content || '' } });
        }
    }

    return {
        conversationState: {
            chatTriggerType: 'MANUAL',
            conversationId: randomUUID(),
            history,
            currentMessage: {
                userInputMessage: {
                    content: currentText,
                    modelId,
                    userInputMessageContext: { tools: [], toolResults: [] }
                }
            }
        }
    };
}

function extractText(parts) {
    if (!Array.isArray(parts)) return String(parts ?? '');
    return parts.map(p => {
        if (typeof p === 'string') return p;
        if (p && typeof p.text === 'string') return p.text;
        return '';
    }).join('');
}

/**
 * Convert one CodeWhisperer EventStream frame to an OpenAI streaming chunk.
 * Returns null to skip the frame (lifecycle events, unknown types).
 */
function frameToOpenAIDelta(frame, ctx) {
    const eventType = frame.headers[':event-type'];
    if (!eventType) return null;

    let payload = null;
    try {
        payload = JSON.parse(frame.payload.toString('utf-8'));
    } catch {
        return null;
    }

    if (eventType === 'assistantResponseEvent') {
        const text = typeof payload.content === 'string' ? payload.content : '';
        if (!text) return null;
        return {
            id: ctx.responseId,
            object: 'chat.completion.chunk',
            created: ctx.created,
            model: ctx.model,
            choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
        };
    }

    if (eventType === 'messageMetadataEvent') {
        // usage info; emit as a final chunk's usage hint
        ctx.lastUsage = payload;
        return null;
    }

    if (eventType === 'errorEvent') {
        ctx.error = payload;
        return null;
    }

    return null;
}

/**
 * Execute a chat completion against Kiro upstream, writing OpenAI-shaped
 * response (streaming or aggregated) to `res`.
 */
export async function kiroChatCompletion(openaiBody, res) {
    const cfg = getConfig();
    const maxRotations = cfg.MAX_ROTATIONS_PER_REQUEST || 5;
    const triedIdx = [];
    let lastErr = null;
    let lastStatus = 0;

    const clientWantsStream = openaiBody.stream !== false;
    let kiroBody;
    try {
        kiroBody = buildKiroRequest(openaiBody);
    } catch (e) {
        return sendErrorJson(res, 400, 'invalid_request', e.message);
    }

    for (let attempt = 0; attempt < maxRotations; attempt++) {
        const idx = pickNextKiroCred(triedIdx);
        if (idx === null) {
            const msg = lastErr
                ? `All kiro creds exhausted; last error: ${lastErr}`
                : 'No active kiro credentials. Add one via the dashboard.';
            return sendErrorJson(res, lastStatus || 503, 'no_creds_available', msg);
        }
        triedIdx.push(idx);

        let accessToken;
        try {
            accessToken = await getAccessTokenForCred(idx);
        } catch (e) {
            lastErr = `refresh: ${e.message}`;
            log(`refresh failed for cred ${idx}: ${e.message}`);
            continue;
        }

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'x-amzn-kiro-agent-mode': 'spec',
            'x-amz-user-agent': KIRO_AMZ_USER_AGENT,
            'user-agent': KIRO_USER_AGENT
        };

        let upstream;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), cfg.UPSTREAM_TIMEOUT_MS);
            upstream = await fetch(UPSTREAM_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(kiroBody),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (err) {
            lastErr = err.message;
            log(`network error w/ cred ${idx}: ${err.message}`);
            continue;
        }

        if (!upstream.ok) {
            const bodyText = await upstream.text().catch(() => '');
            lastStatus = upstream.status;
            lastErr = `${upstream.status} ${bodyText.slice(0, 200)}`;
            const klass = classifyKiroError(upstream.status, bodyText);
            log(`upstream ${upstream.status} cred ${idx} (${klass || 'unclassified'}): ${bodyText.slice(0, 200)}`);
            if (klass === 'rate_limit' || klass === 'quota') { markKiroCooldown(idx, klass); continue; }
            if (klass === 'auth') { markKiroDead(idx, 'auth_failed'); continue; }
            return sendErrorJson(res, upstream.status, 'upstream_error', bodyText.slice(0, 500));
        }

        markKiroUsed(idx);

        const ctx = {
            responseId: `chatcmpl-kiro-${Date.now()}`,
            created: Math.floor(Date.now() / 1000),
            model: openaiBody.model,
            error: null,
            lastUsage: null
        };

        if (clientWantsStream) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-store',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            });
            try {
                await streamFrames(upstream.body, res, ctx);
            } catch (err) {
                log(`stream mid-flight error: ${err.message}`);
                try { res.end(); } catch {}
            }
            return;
        }

        // Non-stream path: accumulate frames into a single chat.completion.
        try {
            const buf = Buffer.from(await upstream.arrayBuffer());
            const aggregated = aggregateNonStream(buf, ctx);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(aggregated));
        } catch (err) {
            log(`non-stream body parse error cred ${idx}: ${err.message}`);
            sendErrorJson(res, 502, 'upstream_body_error', err.message);
        }
        return;
    }

    sendErrorJson(res, lastStatus || 503, 'all_creds_failed',
        `Tried ${triedIdx.length} cred(s); last: ${lastErr}`);
}

async function streamFrames(upstreamBody, res, ctx) {
    const reader = upstreamBody.getReader();
    const parser = new EventStreamParser();
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(value);
        for (const frame of parser.drain()) {
            const chunk = frameToOpenAIDelta(frame, ctx);
            if (chunk) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
    }
    // emit final stop chunk
    const stopChunk = {
        id: ctx.responseId,
        object: 'chat.completion.chunk',
        created: ctx.created,
        model: ctx.model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
    };
    res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
}

function aggregateNonStream(buf, ctx) {
    const parser = new EventStreamParser();
    parser.push(buf);
    let content = '';
    for (const frame of parser.drain()) {
        if (frame.headers[':event-type'] === 'assistantResponseEvent') {
            try {
                const j = JSON.parse(frame.payload.toString('utf-8'));
                if (typeof j.content === 'string') content += j.content;
            } catch {}
        }
    }
    return {
        id: ctx.responseId,
        object: 'chat.completion',
        created: ctx.created,
        model: ctx.model,
        choices: [{
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop'
        }],
        usage: null
    };
}

function classifyKiroError(status, bodyText) {
    if (status === 401 || status === 403) return 'auth';
    if (status === 429) return 'rate_limit';
    if (status === 402) return 'quota';
    if (bodyText && typeof bodyText === 'string') {
        const s = bodyText.toLowerCase();
        if (s.includes('throttling') || s.includes('rate')) return 'rate_limit';
        if (s.includes('quota') || s.includes('limit')) return 'quota';
        if ((s.includes('expired') || s.includes('invalid')) && s.includes('token')) return 'auth';
    }
    return null;
}

function sendErrorJson(res, status, code, message) {
    if (res.headersSent) { try { res.end(); } catch {} return; }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code, message, type: 'router_error' } }));
}

export const kiroProvider = {
    id: 'kiro',
    chatCompletion: kiroChatCompletion,
    listCreds: listKiroCreds,
    summary: summaryKiro
};
