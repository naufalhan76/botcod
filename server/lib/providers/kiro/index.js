/**
 * Kiro provider — bridges OpenAI-shaped chat completion requests to
 * AWS CodeWhisperer's `generateAssistantResponse` endpoint
 * (the API behind https://app.kiro.dev / Kiro IDE).
 *
 * Auth: OAuth 2.0 refresh token (Builder ID DeviceCode or AWS SSO IdC).
 * Wire format: AWS EventStream binary (parsed locally → re-emitted as OpenAI SSE).
 */
import { randomUUID } from 'crypto';
import { getConfig, getEffectiveModelCaps } from '../../config.js';
import { resolveKiroModelId } from './models.js';
import { EventStreamParser } from './eventstream.js';
import {
    KIRO_MAX_TOOL_NAME_LENGTH,
    KIRO_MAX_TOOLS,
    convertLegacyFunctionsToTools,
    convertToolResultsToKiroFormat,
    convertKiroToolUseToOpenAI,
    convertToolsToKiroSpec,
    deduplicateTools,
    sanitizeOrphanToolResults,
    shortenToolName
} from './tools.js';
import { processToolSchemas } from './schema.js';
import { scoreAndLimitTools } from './scoring.js';
import {
    buildKiroHistoryFromUnified,
    ensureAlternatingRoles,
    ensureAssistantBeforeToolResults,
    ensureFirstMessageIsUser,
    estimateTokens,
    estimateToolTokenCost,
    smartTruncateHistory
} from './history.js';
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
// CodeWhisperer doesn't accept Anthropic's `thinking` parameter natively.
// To honour `reasoning_effort: high|max` (or `thinking: { type: 'enabled' }`)
// from the OpenAI client, we prepend a system-prompt instruction asking the
// model to wrap its reasoning in <thinking>...</thinking> tags. The streaming
// translator (frameToOpenAIDelta) then unwraps those into `reasoning_content`
// deltas so OpenCode renders them in its reasoning panel.
const KIRO_THINKING_PROMPT =
    'Before answering, work through the problem inside a <thinking>...</thinking> ' +
    'block (multi-line OK). Place ALL chain-of-thought reasoning, planning, and ' +
    'self-critique inside that block. After </thinking>, write the final user-facing ' +
    'answer normally without any thinking tags.';

/**
 * Decide whether the incoming OpenAI request opts into Kiro's prompt-injected
 * thinking mode. Honoured signals (any of):
 *   - reasoning_effort: 'high' | 'max'
 *   - thinking: { type: 'enabled' }
 *   - extended_thinking: true
 * Models without `thinkingStyle === 'kiro-prompt-injected'` are skipped (no-op).
 */
function shouldEnableKiroThinking(openaiBody) {
    const caps = getEffectiveModelCaps()[openaiBody.model];
    if (!caps || caps.thinkingStyle !== 'kiro-prompt-injected') return false;
    const eff = String(openaiBody.reasoning_effort || '').toLowerCase();
    if (eff === 'high' || eff === 'max') return true;
    if (openaiBody.thinking && openaiBody.thinking.type === 'enabled') return true;
    if (openaiBody.extended_thinking === true) return true;
    return false;
}

function buildKiroRequest(openaiBody) {
    const friendlyModel = openaiBody.model;
    const modelId = resolveKiroModelId(friendlyModel);
    if (!modelId) throw new Error(`unknown kiro model: ${friendlyModel}`);

    const rawMessages = Array.isArray(openaiBody.messages) ? openaiBody.messages : [];
    const msgs = rawMessages.map(normalizeOpenAIMessage);

    const thinkingEnabled = shouldEnableKiroThinking(openaiBody);
    const tools = buildKiroTools(openaiBody, msgs);

    // Pull system messages and prefix the first user message.
    let systemText = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n').trim();
    if (thinkingEnabled) {
        systemText = systemText
            ? `${KIRO_THINKING_PROMPT}\n\n${systemText}`
            : KIRO_THINKING_PROMPT;
    }
    let turns = msgs.filter(m => m.role !== 'system');

    if (turns.length === 0) {
        throw new Error('no user/assistant messages provided');
    }

    turns = ensureFirstMessageIsUser(turns);
    turns = ensureAssistantBeforeToolResults(turns);

    const knownToolUseIds = collectToolUseIds(turns);
    turns = sanitizeOrphanToolResults(turns, knownToolUseIds);
    turns = ensureAlternatingRoles(turns);

    // Last turn must be user; everything before is history.
    if (turns[turns.length - 1]?.role !== 'user') {
        // CodeBuddy-equivalent fallback: append a stub user message.
        turns.push({ role: 'user', content: '(continue)' });
    }
    // Kiro starts a fresh conversationId per request, so any system prompt
    // must be re-injected on every turn — otherwise multi-turn requests
    // silently lose the system instructions after the first call.
    const currentText = (() => {
        const last = turns[turns.length - 1];
        return systemText
            ? `${systemText}\n\n${last.content}`
            : last.content;
    })();

    const { historyMessages, currentToolMessages } = splitHistoryAndCurrentToolResults(turns);
    const currentToolResults = convertToolResultsToKiroFormat(currentToolMessages, knownToolUseIds);
    logToolRequest({ tools, currentToolResults, knownToolUseIds, thinkingEnabled });
    if (openaiBody.tool_choice != null) {
        log(`tool_choice present (stripped): ${JSON.stringify(openaiBody.tool_choice)}`);
    }
    if (openaiBody.parallel_tool_calls != null) {
        log(`parallel_tool_calls present (stripped): ${openaiBody.parallel_tool_calls}`);
    }
    const history = truncateHistoryForModel(
        buildKiroHistoryFromUnified(historyMessages, modelId),
        friendlyModel,
        currentText,
        tools,
        currentToolResults
    );

    return {
        conversationState: {
            chatTriggerType: 'MANUAL',
            conversationId: randomUUID(),
            history,
            currentMessage: {
                userInputMessage: {
                    content: currentText,
                    modelId,
                    userInputMessageContext: { tools, toolResults: currentToolResults }
                }
            }
        }
    };
}

function buildKiroTools(openaiBody, messages) {
    const modernTools = Array.isArray(openaiBody.tools) ? openaiBody.tools : [];
    const legacyTools = convertLegacyFunctionsToTools(openaiBody.functions);
    let tools = [...modernTools, ...legacyTools];

    if (tools.length === 0) return [];

    tools = deduplicateTools(tools);
    tools = processToolSchemas(tools);
    tools = scoreAndLimitTools(tools, messages, KIRO_MAX_TOOLS).selected;
    tools = tools.map(tool => {
        const fn = tool?.function;
        if (!fn?.name || String(fn.name).length <= KIRO_MAX_TOOL_NAME_LENGTH) return tool;
        return { ...tool, function: { ...fn, name: shortenToolName(fn.name, KIRO_MAX_TOOL_NAME_LENGTH) } };
    });
    // Filter out tools with empty names after processing
    tools = tools.filter(tool => {
        const name = tool?.function?.name || tool?.toolSpecification?.name;
        return name && String(name).trim().length > 0;
    });

    return convertToolsToKiroSpec(tools).map(wrapToolInputSchemaJson);
}

function logToolRequest({ tools, currentToolResults, knownToolUseIds, thinkingEnabled }) {
    const toolNames = tools
        .map(tool => tool?.toolSpecification?.name)
        .filter(Boolean);
    const resultIds = currentToolResults
        .map(result => result?.toolUseId)
        .filter(Boolean);
    log(
        `tool lifecycle request: definitions=${tools.length}` +
        ` results=${currentToolResults.length}` +
        ` known_calls=${knownToolUseIds.size}` +
        ` thinking=${thinkingEnabled ? 'on' : 'off'}`
    );
    if (toolNames.length > 0) log(`tool definitions: ${toolNames.join(', ')}`);
    if (resultIds.length > 0) log(`tool results: ${resultIds.join(', ')}`);
}

function wrapToolInputSchemaJson(tool) {
    const spec = tool?.toolSpecification;
    if (!spec || spec.inputSchema?.json) return tool;
    return {
        ...tool,
        toolSpecification: {
            ...spec,
            inputSchema: { json: spec.inputSchema || { type: 'object', properties: {} } }
        }
    };
}

function normalizeOpenAIMessage(message) {
    const normalized = {
        role: message?.role,
        content: typeof message?.content === 'string' ? message.content : extractText(message?.content)
    };

    if (Array.isArray(message?.tool_calls)) normalized.tool_calls = message.tool_calls;
    if (Array.isArray(message?.toolCalls)) normalized.toolCalls = message.toolCalls;
    if (message?.tool_call_id) normalized.tool_call_id = message.tool_call_id;
    if (message?.toolUseId) normalized.toolUseId = message.toolUseId;
    if (message?.name) normalized.name = message.name;

    return normalized;
}

function collectToolUseIds(messages) {
    const ids = new Set();
    for (const message of Array.isArray(messages) ? messages : []) {
        const calls = Array.isArray(message?.tool_calls)
            ? message.tool_calls
            : Array.isArray(message?.toolCalls)
                ? message.toolCalls
                : [];
        for (const call of calls) {
            const id = call?.id || call?.toolUseId || call?.tool_call_id;
            if (id) ids.add(String(id));
        }
    }
    return ids;
}

function splitHistoryAndCurrentToolResults(turns) {
    const historyMessages = turns.slice(0, -1);
    const currentToolMessages = [];

    while (historyMessages.length > 0 && historyMessages[historyMessages.length - 1]?.role === 'tool') {
        currentToolMessages.unshift(historyMessages.pop());
    }

    return { historyMessages, currentToolMessages };
}

function truncateHistoryForModel(history, friendlyModel, currentText, tools, currentToolResults) {
    const caps = getEffectiveModelCaps()[friendlyModel];
    const contextLimit = caps?.limit?.context;
    if (!Number.isFinite(contextLimit)) return history;

    const outputReserve = Number.isFinite(caps?.limit?.output) ? caps.limit.output : 0;
    const tokenBudget = Math.max(0, contextLimit - outputReserve - estimateTokens(currentText));
    const fixedCost = estimateToolTokenCost(tools) + estimateTokens(JSON.stringify(currentToolResults || []));
    return smartTruncateHistory(history, tokenBudget, fixedCost);
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
        // Demux <thinking>...</thinking> blocks out of the assistant text and
        // route them to `reasoning_content` deltas (OpenAI-compatible, what
        // OpenCode renders in its reasoning panel). Anything outside the
        // tags goes through as normal `content`. Tag fragments may be split
        // across stream chunks, so we keep small running state on `ctx`.
        const { reasoning, content } = demuxThinking(ctx, text);
        if (!reasoning && !content) return null;
        const delta = {};
        if (content)   delta.content = content;
        if (reasoning) {
            delta.reasoning_content = reasoning;
            ctx._hasReasoning = true;
        }
        return {
            id: ctx.responseId,
            object: 'chat.completion.chunk',
            created: ctx.created,
            model: ctx.model,
            choices: [{ index: 0, delta, finish_reason: null }]
        };
    }

    if (eventType === 'toolUseEvent') {
        const toolUseId = String(payload?.toolUse?.toolUseId || payload?.toolUseId || payload?.id || '').trim();
        const toolName = String(payload?.toolUse?.name || payload?.name || '').trim();
        // Edge case: skip toolUseEvent with empty name
        if (!toolName) {
            log(`tool use event skipped: empty name, id=${toolUseId || 'unknown'}`);
            return null;
        }
        if (toolUseId) {
            ctx._seenToolUseIds ??= new Set();
            if (ctx._seenToolUseIds.has(toolUseId)) {
                log(`tool use event duplicate skipped: id=${toolUseId}`);
                return null;
            }
            ctx._seenToolUseIds.add(toolUseId);
        }
        ctx._toolCallIndex = (ctx._toolCallIndex ?? -1) + 1;
        ctx._hasToolCalls = true;
        log(`tool use event: index=${ctx._toolCallIndex} id=${toolUseId || 'unknown'} name=${toolName}`);
        return {
            id: ctx.responseId,
            object: 'chat.completion.chunk',
            created: ctx.created,
            model: ctx.model,
            choices: [{
                index: 0,
                delta: { tool_calls: [convertKiroToolUseToOpenAI(payload, ctx._toolCallIndex)] },
                finish_reason: null
            }]
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
    // Flush any held-back trailing chars from the thinking demux. We hold back
    // up to 16 chars per chunk while looking for tag boundaries, so the very
    // last fragment never gets emitted unless we drain it on EOF.
    if (ctx._tBuf) {
        const delta = ctx._inThink
            ? { reasoning_content: ctx._tBuf }
            : { content: ctx._tBuf };
        if (ctx._inThink) ctx._hasReasoning = true;
        ctx._tBuf = '';
        res.write(`data: ${JSON.stringify({
            id: ctx.responseId,
            object: 'chat.completion.chunk',
            created: ctx.created,
            model: ctx.model,
            choices: [{ index: 0, delta, finish_reason: null }]
        })}\n\n`);
    }
    const stopChunk = {
        id: ctx.responseId,
        object: 'chat.completion.chunk',
        created: ctx.created,
        model: ctx.model,
        choices: [{ index: 0, delta: {}, finish_reason: ctx._hasToolCalls ? 'tool_calls' : 'stop' }]
    };
    log(`response: ${ctx._hasToolCalls ? 'tool_calls' : 'content'} reasoning=${ctx._hasReasoning ? 'yes' : 'no'}`);
    res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
}

function aggregateNonStream(buf, ctx) {
    const parser = new EventStreamParser();
    parser.push(buf);
    let raw = '';
    const toolCalls = [];
    const seenToolUseIds = new Set();
    for (const frame of parser.drain()) {
        const eventType = frame.headers[':event-type'];
        if (eventType === 'assistantResponseEvent') {
            try {
                const j = JSON.parse(frame.payload.toString('utf-8'));
                if (typeof j.content === 'string') raw += j.content;
            } catch {}
        }
        if (eventType === 'toolUseEvent') {
            try {
                const j = JSON.parse(frame.payload.toString('utf-8'));
                const toolUseId = String(j?.toolUse?.toolUseId || j?.toolUseId || j?.id || '').trim();
                const toolName = String(j?.toolUse?.name || j?.name || '').trim();
                // Edge case: skip toolUseEvent with empty name
                if (!toolName) {
                    log(`tool use event skipped: empty name, id=${toolUseId || 'unknown'}`);
                    continue;
                }
                if (toolUseId && seenToolUseIds.has(toolUseId)) {
                    log(`tool use event duplicate skipped: id=${toolUseId}`);
                    continue;
                }
                if (toolUseId) seenToolUseIds.add(toolUseId);
                log(`tool use event: index=${toolCalls.length} id=${toolUseId || 'unknown'} name=${toolName}`);
                const { index, ...toolCall } = convertKiroToolUseToOpenAI(j, toolCalls.length);
                toolCalls.push(toolCall);
            } catch {}
        }
    }
    // Split <thinking>...</thinking> off the final text once.
    const thinkingRe = /<thinking>([\s\S]*?)<\/thinking>/g;
    const reasoning = [...raw.matchAll(thinkingRe)].map(m => m[1]).join('\n').trim();
    const content = raw.replace(thinkingRe, '').trim();
    const message = { role: 'assistant', content };
    if (reasoning) message.reasoning_content = reasoning;
    if (toolCalls.length > 0) message.tool_calls = toolCalls;
    log(`response: ${toolCalls.length > 0 ? 'tool_calls' : 'content'} reasoning=${reasoning ? 'yes' : 'no'}`);
    return {
        id: ctx.responseId,
        object: 'chat.completion',
        created: ctx.created,
        model: ctx.model,
        choices: [{ index: 0, message, finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop' }],
        usage: null
    };
}

/**
 * Streaming demux for prompt-injected thinking blocks.
 *
 * State on ctx (lazily inited): { _tBuf: string, _inThink: bool }.
 * We accumulate up to 16 trailing chars in _tBuf so we can detect a tag
 * boundary that spans two chunks (e.g. `</think` then `ing>`).
 */
function demuxThinking(ctx, chunk) {
    if (ctx._tBuf == null) { ctx._tBuf = ''; ctx._inThink = false; }
    let buf = ctx._tBuf + chunk;
    let content = '';
    let reasoning = '';
    while (buf.length > 0) {
        if (!ctx._inThink) {
            const open = buf.indexOf('<thinking>');
            if (open < 0) {
                // Hold back trailing 16 chars in case a tag is straddling.
                if (buf.length > 16) {
                    content += buf.slice(0, buf.length - 16);
                    buf = buf.slice(buf.length - 16);
                }
                break;
            }
            content += buf.slice(0, open);
            buf = buf.slice(open + '<thinking>'.length);
            ctx._inThink = true;
        } else {
            const close = buf.indexOf('</thinking>');
            if (close < 0) {
                if (buf.length > 16) {
                    reasoning += buf.slice(0, buf.length - 16);
                    buf = buf.slice(buf.length - 16);
                }
                break;
            }
            reasoning += buf.slice(0, close);
            buf = buf.slice(close + '</thinking>'.length);
            ctx._inThink = false;
        }
    }
    ctx._tBuf = buf;
    return { reasoning, content };
}

function classifyKiroError(status, bodyText) {
    if (status === 401 || status === 403) return 'auth';
    if (status === 429) return 'rate_limit';
    if (status === 402) return 'quota';
    if (bodyText && typeof bodyText === 'string') {
        const s = bodyText.toLowerCase();
        // Use precise phrases — bare 'rate' matches 'generate' (literally in the
        // upstream action `generateAssistantResponse`) and bare 'limit' matches
        // benign errors like 'context length limit exceeded', causing healthy
        // creds to be cooldown'd by a single bad request.
        if (
            s.includes('throttling') ||
            s.includes('rate limit') ||
            s.includes('rate exceeded') ||
            s.includes('too many requests')
        ) return 'rate_limit';
        if (s.includes('quota') || s.includes('insufficient')) return 'quota';
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
