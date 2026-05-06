// sambungin dashboard frontend (vanilla JS, no build step)

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let _models = [];
let _currentJobId = null;
let _currentJobStream = null;
let _refreshTimers = {};

// ---- Toast ----
function toast(msg, isError = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ---- API helper ----
async function api(method, path, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== null) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
    if (!res.ok) {
        const msg = (json && (json.error?.message || json.error || json._raw)) || `${res.status} ${res.statusText}`;
        throw new Error(msg);
    }
    return json;
}

// ---- Tabs ----
$$('.tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.toggle('active', b === btn));
    const target = btn.dataset.tab;
    $$('.panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== target));
    onTabSwitch(target);
}));

function onTabSwitch(tab) {
    Object.values(_refreshTimers).forEach(t => clearInterval(t));
    _refreshTimers = {};
    if (tab === 'overview') {
        loadOverview();
        _refreshTimers.overview = setInterval(loadOverview, 5000);
    } else if (tab === 'pool') {
        loadPool();
        _refreshTimers.pool = setInterval(loadPool, 5000);
    } else if (tab === 'kiro') {
        loadKiroPool();
        _refreshTimers.kiro = setInterval(loadKiroPool, 5000);
    } else if (tab === 'accounts') {
        loadAccounts();
    } else if (tab === 'proxies') {
        loadProxies();
    } else if (tab === 'run') {
        loadJobs();
        _refreshTimers.jobs = setInterval(loadJobs, 5000);
    } else if (tab === 'settings') {
        loadSettings();
    }
}

// ---- OVERVIEW ----
async function loadOverview() {
    try {
        const o = await api('GET', '/api/overview');
        $('#stat-active').textContent = o.pool.active || 0;
        $('#stat-cooldown').textContent = o.pool.cooldown || 0;
        $('#stat-kiro-active').textContent = (o.kiro_pool && o.kiro_pool.active) || 0;
        $('#stat-kiro-cooldown').textContent = (o.kiro_pool && o.kiro_pool.cooldown) || 0;
        $('#stat-accounts').textContent = o.accounts;
        $('#stat-jobs-running').textContent = o.jobs_running;

        const sel = $('#test-model');
        const providers = o.config.MODEL_PROVIDERS || {};
        if (_models.length === 0 || _models.length !== o.config.EXPOSED_MODELS.length) {
            _models = o.config.EXPOSED_MODELS;
            sel.innerHTML = _models.map(m => {
                const tag = providers[m] ? ` [${providers[m]}]` : '';
                return `<option value="${m}">${m}${tag}</option>`;
            }).join('');
        }

        const baseUrl = `http://${location.hostname}:${o.config.PORT}/v1`;
        const snippet = JSON.stringify({
            "$schema": "https://opencode.ai/config.json",
            provider: {
                "sambungin": {
                    npm: "@ai-sdk/openai-compatible",
                    name: "Sambungin (CodeBuddy + Kiro)",
                    options: {
                        baseURL: baseUrl,
                        apiKey: "not-required-router-doesnt-check"
                    },
                    models: Object.fromEntries(_models.map(m => [m, { name: m }]))
                }
            }
        }, null, 2);
        $('#opencode-snippet').textContent = snippet;
    } catch (e) {
        toast(`Overview failed: ${e.message}`, true);
    }
}

$('#test-send').addEventListener('click', async () => {
    const model = $('#test-model').value;
    const prompt = $('#test-prompt').value.trim() || 'Reply with just OK';
    $('#test-output').textContent = '...';
    try {
        const out = await api('POST', '/api/test-chat', { model, prompt });
        const text = out.choices?.[0]?.message?.content ?? JSON.stringify(out, null, 2);
        $('#test-output').textContent = text;
    } catch (e) {
        $('#test-output').textContent = `Error: ${e.message}`;
    }
});

// ---- POOL ----
async function loadPool() {
    try {
        const data = await api('GET', '/api/pool');
        const tbody = $('#pool-tbody');
        tbody.innerHTML = data.entries.length === 0
            ? `<tr><td colspan="8" class="muted" style="text-align:center;padding:20px;">No keys loaded. Add to <code>codebuddy_keys.txt</code> or run the bot.</td></tr>`
            : data.entries.map(e => `
                <tr>
                    <td>${esc(e.email)}</td>
                    <td><code>${esc(e.key_masked)}</code></td>
                    <td><span class="badge ${e.status}">${e.status}</span></td>
                    <td>${e.last_used_at ? fmtTime(e.last_used_at) : '<span class="muted">never</span>'}</td>
                    <td>${e.cooldown_until ? fmtTime(e.cooldown_until) : '<span class="muted">–</span>'}</td>
                    <td>${e.usage_count}</td>
                    <td>${e.error_count}${e.last_error ? `<br><span class="muted">${esc(String(e.last_error)).slice(0,40)}</span>` : ''}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn" data-pool-action="active" data-key="${esc(e.key_masked)}">Activate</button>
                            <button class="btn" data-pool-action="cooldown" data-key="${esc(e.key_masked)}">Cooldown</button>
                            <button class="btn danger" data-pool-action="dead" data-key="${esc(e.key_masked)}">Mark dead</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        tbody.querySelectorAll('button[data-pool-action]').forEach(b => b.addEventListener('click', async () => {
            const status = b.dataset.poolAction;
            const key = b.dataset.key;
            try {
                await api('POST', `/api/pool/${encodeURIComponent(key)}/status`, { status });
                toast(`Status updated → ${status}`);
                loadPool();
            } catch (e) {
                toast(e.message, true);
            }
        }));
    } catch (e) {
        toast(`Pool load failed: ${e.message}`, true);
    }
}
$('#pool-reload').addEventListener('click', async () => {
    const r = await api('POST', '/api/pool/reload');
    toast(`Reloaded: ${r.count} key(s)`);
    loadPool();
});

// ---- KIRO POOL ----
async function loadKiroPool() {
    try {
        const data = await api('GET', '/api/kiro/pool');
        const tbody = $('#kiro-tbody');
        tbody.innerHTML = data.entries.length === 0
            ? `<tr><td colspan="9" class="muted" style="text-align:center;padding:20px;">No Kiro credentials. Add one above.</td></tr>`
            : data.entries.map(e => `
                <tr>
                    <td>${esc(e.label)}</td>
                    <td>${esc(e.auth)}${e.has_client_secret ? '' : ' <span class="muted">(no secret)</span>'}</td>
                    <td><span class="badge ${e.status}">${e.status}</span></td>
                    <td>${e.expires_at ? fmtTime(e.expires_at) : '<span class="muted">–</span>'}</td>
                    <td>${e.last_used_at ? fmtTime(e.last_used_at) : '<span class="muted">never</span>'}</td>
                    <td>${e.cooldown_until ? fmtTime(e.cooldown_until) : '<span class="muted">–</span>'}</td>
                    <td>${e.usage_count}</td>
                    <td>${e.error_count}${e.last_error ? `<br><span class="muted">${esc(String(e.last_error)).slice(0,60)}</span>` : ''}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn" data-kiro-status="active" data-idx="${e.idx}">Activate</button>
                            <button class="btn" data-kiro-status="cooldown" data-idx="${e.idx}">Cooldown</button>
                            <button class="btn danger" data-kiro-del="${e.idx}">Delete</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        tbody.querySelectorAll('button[data-kiro-status]').forEach(b => b.addEventListener('click', async () => {
            try {
                await api('POST', `/api/kiro/pool/${b.dataset.idx}/status`, { status: b.dataset.kiroStatus });
                toast(`Status → ${b.dataset.kiroStatus}`);
                loadKiroPool();
            } catch (e) { toast(e.message, true); }
        }));
        tbody.querySelectorAll('button[data-kiro-del]').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Delete this Kiro credential?')) return;
            try {
                await api('DELETE', `/api/kiro/pool/${b.dataset.kiroDel}`);
                toast('Deleted');
                loadKiroPool();
            } catch (e) { toast(e.message, true); }
        }));
    } catch (e) {
        toast(`Kiro pool load failed: ${e.message}`, true);
    }
}
$('#kiro-reload').addEventListener('click', async () => {
    await api('POST', '/api/kiro/pool/reload');
    loadKiroPool();
});
$('#kiro-add-btn').addEventListener('click', async () => {
    const payload = {
        label: $('#kiro-add-label').value.trim() || undefined,
        auth: $('#kiro-add-auth').value,
        refreshToken: $('#kiro-add-rt').value.trim(),
        clientId: $('#kiro-add-cid').value.trim() || undefined,
        clientSecret: $('#kiro-add-cs').value.trim() || undefined
    };
    if (!payload.refreshToken) return toast('refreshToken is required', true);
    if (payload.auth === 'IdC' && (!payload.clientId || !payload.clientSecret)) {
        return toast('IdC requires clientId + clientSecret', true);
    }
    try {
        const r = await api('POST', '/api/kiro/pool', payload);
        if (r.validated) {
            toast(`Credential added (idx=${r.idx}) ✓ refresh succeeded`);
            ['#kiro-add-label', '#kiro-add-rt', '#kiro-add-cid', '#kiro-add-cs'].forEach(s => $(s).value = '');
        } else {
            toast(`Added but refresh failed: ${r.error}`, true);
        }
        loadKiroPool();
    } catch (e) {
        toast(e.message, true);
    }
});

// ---- ACCOUNTS ----
async function loadAccounts() {
    const data = await api('GET', '/api/accounts');
    const tbody = $('#accounts-tbody');
    $('#accounts-count').textContent = `${data.entries.length} account(s)`;
    tbody.innerHTML = data.entries.map(a => `
        <tr>
            <td>${a.idx + 1}</td>
            <td>${esc(a.email)}</td>
            <td>${a.has_password ? '<span class="badge active">yes</span>' : '<span class="badge dead">no</span>'}</td>
            <td><button class="btn danger" data-account-del="${a.idx}">Delete</button></td>
        </tr>
    `).join('');
    tbody.querySelectorAll('button[data-account-del]').forEach(b => b.addEventListener('click', async () => {
        await api('DELETE', `/api/accounts/${b.dataset.accountDel}`);
        loadAccounts();
    }));
}
$('#accounts-reload').addEventListener('click', loadAccounts);
$('#accounts-save').addEventListener('click', async () => {
    const lines = $('#accounts-textarea').value.split('\n').map(l => l.trim()).filter(Boolean);
    await api('POST', '/api/accounts', { lines, replace: true });
    $('#accounts-textarea').value = '';
    toast(`Saved ${lines.length} account(s) (replaced)`);
    loadAccounts();
});
$('#accounts-append').addEventListener('click', async () => {
    const lines = $('#accounts-textarea').value.split('\n').map(l => l.trim()).filter(Boolean);
    await api('POST', '/api/accounts', { lines });
    $('#accounts-textarea').value = '';
    toast(`Appended ${lines.length} account(s)`);
    loadAccounts();
});

// ---- PROXIES ----
async function loadProxies() {
    const data = await api('GET', '/api/proxies');
    const tbody = $('#proxies-tbody');
    $('#proxies-count').textContent = `${data.entries.length} proxy(ies)`;
    tbody.innerHTML = data.entries.map(p => `
        <tr>
            <td>${p.idx + 1}</td>
            <td><code>${esc(p.proxy)}</code></td>
            <td><button class="btn danger" data-proxy-del="${p.idx}">Delete</button></td>
        </tr>
    `).join('');
    tbody.querySelectorAll('button[data-proxy-del]').forEach(b => b.addEventListener('click', async () => {
        await api('DELETE', `/api/proxies/${b.dataset.proxyDel}`);
        loadProxies();
    }));
}
$('#proxies-reload').addEventListener('click', loadProxies);
$('#proxies-save').addEventListener('click', async () => {
    const lines = $('#proxies-textarea').value.split('\n').map(l => l.trim()).filter(Boolean);
    await api('POST', '/api/proxies', { lines, replace: true });
    $('#proxies-textarea').value = '';
    toast(`Saved ${lines.length} proxy(ies) (replaced)`);
    loadProxies();
});
$('#proxies-append').addEventListener('click', async () => {
    const lines = $('#proxies-textarea').value.split('\n').map(l => l.trim()).filter(Boolean);
    await api('POST', '/api/proxies', { lines });
    $('#proxies-textarea').value = '';
    toast(`Appended ${lines.length} proxy(ies)`);
    loadProxies();
});

// ---- RUN BOT ----
async function loadJobs() {
    const { jobs } = await api('GET', '/api/jobs');
    const tbody = $('#jobs-tbody');
    tbody.innerHTML = jobs.length === 0
        ? `<tr><td colspan="6" class="muted" style="text-align:center;padding:20px;">No jobs yet.</td></tr>`
        : jobs.map(j => `
            <tr>
                <td>${fmtTime(j.startedAt)}</td>
                <td>${modeName(j.mode)}</td>
                <td><span class="badge ${j.status}">${j.status}</span></td>
                <td>${j.processed}/${j.total} (ok ${j.success} · fail ${j.failed})</td>
                <td>${j.keysObtained}</td>
                <td>
                    ${j.status === 'running'
                        ? `<button class="btn" data-job-attach="${j.id}">Attach log</button> <button class="btn danger" data-job-abort="${j.id}">Abort</button>`
                        : `<button class="btn" data-job-attach="${j.id}">View log</button>`
                    }
                </td>
            </tr>
        `).join('');
    tbody.querySelectorAll('button[data-job-attach]').forEach(b => b.addEventListener('click', () => attachJobStream(b.dataset.jobAttach)));
    tbody.querySelectorAll('button[data-job-abort]').forEach(b => b.addEventListener('click', async () => {
        await api('POST', `/api/jobs/${b.dataset.jobAbort}/abort`);
        toast('Abort signal sent');
        loadJobs();
    }));
}

$('#run-start').addEventListener('click', async () => {
    const mode = parseInt($('#run-mode').value);
    const headless = $('#run-headless').value === 'true';
    const limit = parseInt($('#run-limit').value) || 0;
    try {
        const job = await api('POST', '/api/jobs', { mode, headless, limit });
        toast(`Job started: ${job.id.slice(0, 8)}`);
        attachJobStream(job.id);
        $('#run-abort').disabled = false;
        $('#run-start').disabled = true;
        loadJobs();
    } catch (e) {
        toast(e.message, true);
    }
});

$('#run-abort').addEventListener('click', async () => {
    if (_currentJobId) {
        await api('POST', `/api/jobs/${_currentJobId}/abort`);
        toast('Abort signal sent');
    }
});

function attachJobStream(jobId) {
    if (_currentJobStream) { _currentJobStream.close(); }
    _currentJobId = jobId;
    $('#run-log').textContent = '';
    $('#run-progress').textContent = '';

    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    _currentJobStream = es;
    let lineCount = 0;

    es.onmessage = (ev) => {
        try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'replay') {
                $('#run-log').textContent = msg.logs.map(l => `[${fmtTimeShort(l.ts)}] ${l.email ? `(${l.email}) ` : ''}${l.line}`).join('\n') + '\n';
            } else if (msg.type === 'log') {
                appendLog(`[${fmtTimeShort(msg.ts)}] ${msg.email ? `(${msg.email}) ` : ''}${msg.line}`);
                lineCount++;
            } else if (msg.type === 'progress') {
                $('#run-progress').textContent = `Progress: ${msg.current}/${msg.total} · ${msg.email}: ${msg.result.success ? 'OK' : (msg.result.error || 'fail')}`;
            } else if (msg.type === 'done') {
                appendLog(`\n[done] status=${msg.status}${msg.error ? ` error=${msg.error}` : ''}`);
                $('#run-abort').disabled = true;
                $('#run-start').disabled = false;
                es.close();
                loadJobs();
            }
        } catch {}
    };
    es.onerror = () => { es.close(); };
}

function appendLog(line) {
    const el = $('#run-log');
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    el.textContent += line + '\n';
    if (atBottom) el.scrollTop = el.scrollHeight;
}

// ---- SETTINGS ----
async function loadSettings() {
    const s = await api('GET', '/api/settings');
    $('#set-cooldown').value = s.COOLDOWN_MS;
    $('#set-max-rotations').value = s.MAX_ROTATIONS_PER_REQUEST;
    $('#set-models').value = (s.EXPOSED_MODELS || []).join(', ');
    $('#set-info').textContent = JSON.stringify(s, null, 2);
}
$('#set-save').addEventListener('click', async () => {
    const patch = {
        COOLDOWN_MS: parseInt($('#set-cooldown').value),
        MAX_ROTATIONS_PER_REQUEST: parseInt($('#set-max-rotations').value),
        EXPOSED_MODELS: $('#set-models').value.split(',').map(s => s.trim()).filter(Boolean)
    };
    await api('PUT', '/api/settings', patch);
    toast('Settings saved');
    loadSettings();
});

// ---- helpers ----
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtTime(ts) {
    if (!ts) return '–';
    const d = new Date(ts);
    return d.toISOString().replace('T', ' ').slice(0, 19);
}
function fmtTimeShort(ts) {
    return new Date(ts).toISOString().slice(11, 19);
}
function modeName(m) {
    return { 1: 'Unlucid', 2: 'CodeBuddy', 3: 'Both' }[m] || `mode ${m}`;
}

// ---- init ----
loadOverview();
_refreshTimers.overview = setInterval(loadOverview, 5000);
