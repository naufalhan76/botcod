/**
 * Temp-mail subsystem.
 *
 * Architecture:
 *   user owns 1+ domains in Cloudflare (with Email Routing enabled, catch-all
 *   forwarded to a Gmail address). The dashboard polls each Gmail destination
 *   over IMAP and routes incoming mail to the matching `to:` address row.
 *
 *   Persisted at <root>/server/tempmail.json (gitignored).
 *
 *   {
 *     "inboxes":   [ { id, label, host, port, secure, user, pass,
 *                      lastTestedAt, lastTestResult, lastUid } ],
 *     "domains":   [ { domain, inboxId } ],
 *     "addresses": [ { address, domain, label, createdAt, lastSeenAt,
 *                      messageCount } ],
 *     "messages":  [ { id, address, inboxId, from, to, subject, snippet,
 *                      bodyText, ts, uid } ],
 *     "savedAt":   epoch_ms
 *   }
 *
 * Polling: every POLL_INTERVAL_MS we scan every inbox once for messages with
 * UID > inbox.lastUid, dropping ones whose `to:` doesn't match a registered
 * address. Matched messages are appended to `messages`, address row's counters
 * + lastSeenAt are bumped, and inbox.lastUid is advanced.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ImapFlow } from 'imapflow';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, 'server', 'tempmail.json');

const POLL_INTERVAL_MS = 10_000;
const MESSAGE_RETENTION = 200;          // per-address ring buffer cap
const GLOBAL_MESSAGE_RETENTION = 2000;  // total cap (oldest evicted)
const MAX_BODY_BYTES = 64 * 1024;       // truncate giant emails

let _store = emptyStore();
let _saveQueued = false;
let _pollTimer = null;
let _pollInflight = false;

function emptyStore() {
    return {
        inboxes: [],
        domains: [],
        addresses: [],
        messages: [],
        savedAt: 0
    };
}

/* --------------------------- PERSISTENCE -------------------------------- */

export function loadTempmailStore() {
    if (!fs.existsSync(FILE)) {
        _store = emptyStore();
        return _store;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        _store = { ...emptyStore(), ...raw };
        for (const k of ['inboxes', 'domains', 'addresses', 'messages']) {
            if (!Array.isArray(_store[k])) _store[k] = [];
        }
    } catch (e) {
        console.error('[tempmail] load failed:', e.message);
        _store = emptyStore();
    }
    return _store;
}

export function saveTempmailStore() {
    if (_saveQueued) return;
    _saveQueued = true;
    setImmediate(() => {
        try {
            fs.mkdirSync(path.dirname(FILE), { recursive: true });
            _store.savedAt = Date.now();
            fs.writeFileSync(FILE, JSON.stringify(_store, null, 2), 'utf-8');
        } catch (e) {
            console.error('[tempmail] save failed:', e.message);
        } finally {
            _saveQueued = false;
        }
    });
}

/* --------------------------- INBOXES ----------------------------------- */

export function listInboxes() {
    // Mask password before returning to UI.
    return _store.inboxes.map(i => ({
        id: i.id,
        label: i.label || i.user,
        host: i.host,
        port: i.port,
        secure: i.secure !== false,
        user: i.user,
        pass_set: !!i.pass,
        lastTestedAt: i.lastTestedAt || 0,
        lastTestResult: i.lastTestResult || null,
        lastUid: i.lastUid || 0
    }));
}

export function getInbox(id) {
    return _store.inboxes.find(i => i.id === id) || null;
}

export function addInbox({ label, host, port, secure, user, pass }) {
    if (!host || !user || !pass) throw new Error('host, user, pass are required');
    const id = `inbox_${crypto.randomBytes(4).toString('hex')}`;
    const inbox = {
        id,
        label: label || user,
        host,
        port: Number(port) || 993,
        secure: secure !== false,
        user,
        pass,
        lastTestedAt: 0,
        lastTestResult: null,
        lastUid: 0
    };
    _store.inboxes.push(inbox);
    saveTempmailStore();
    return id;
}

export function updateInbox(id, patch) {
    const i = _store.inboxes.find(x => x.id === id);
    if (!i) throw new Error(`inbox ${id} not found`);
    for (const k of ['label', 'host', 'port', 'secure', 'user', 'pass']) {
        if (k in patch && patch[k] !== undefined && patch[k] !== '') {
            i[k] = k === 'port' ? Number(patch[k]) : patch[k];
        }
    }
    saveTempmailStore();
    return i;
}

export function removeInbox(id) {
    const i = _store.inboxes.findIndex(x => x.id === id);
    if (i < 0) throw new Error(`inbox ${id} not found`);
    if (_store.domains.some(d => d.inboxId === id)) {
        throw new Error(`inbox ${id} still has domains attached; remove them first`);
    }
    _store.inboxes.splice(i, 1);
    saveTempmailStore();
}

export async function testInboxCredentials({ host, port, secure, user, pass }) {
    const client = new ImapFlow({
        host,
        port: Number(port) || 993,
        secure: secure !== false,
        auth: { user, pass },
        logger: false
    });
    const startedAt = Date.now();
    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const status = await client.status('INBOX', { messages: true });
            await client.logout();
            return {
                ok: true,
                connectedInMs: Date.now() - startedAt,
                inboxMessageCount: status.messages || 0
            };
        } finally {
            lock.release();
        }
    } catch (e) {
        try { await client.logout(); } catch {}
        // imapflow surfaces details on `e.responseText` / `e.authenticationFailed` that
        // are far more useful than the generic "Command failed" message.
        const detail = [
            e.message,
            e.responseText && `(${e.responseText.trim()})`,
            e.authenticationFailed && '(authentication failed; check user/app-password)'
        ].filter(Boolean).join(' ');
        return { ok: false, error: detail || 'unknown IMAP error' };
    }
}

/* --------------------------- DOMAINS ----------------------------------- */

export function listDomains() {
    return _store.domains.map(d => {
        const inbox = _store.inboxes.find(i => i.id === d.inboxId);
        return {
            domain: d.domain,
            inboxId: d.inboxId,
            inboxLabel: inbox ? (inbox.label || inbox.user) : '(missing)'
        };
    });
}

export function addDomain({ domain, inboxId }) {
    domain = String(domain || '').toLowerCase().trim();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error(`invalid domain: ${domain}`);
    if (!getInbox(inboxId)) throw new Error(`inbox ${inboxId} not found`);
    if (_store.domains.find(d => d.domain === domain)) {
        throw new Error(`domain ${domain} already registered`);
    }
    _store.domains.push({ domain, inboxId });
    saveTempmailStore();
}

export function updateDomain(domain, { inboxId }) {
    const d = _store.domains.find(x => x.domain === domain);
    if (!d) throw new Error(`domain ${domain} not found`);
    if (!getInbox(inboxId)) throw new Error(`inbox ${inboxId} not found`);
    d.inboxId = inboxId;
    saveTempmailStore();
}

export function removeDomain(domain) {
    const i = _store.domains.findIndex(d => d.domain === domain);
    if (i < 0) throw new Error(`domain ${domain} not found`);
    if (_store.addresses.some(a => a.domain === domain)) {
        throw new Error(`domain ${domain} still has temp addresses; revoke them first`);
    }
    _store.domains.splice(i, 1);
    saveTempmailStore();
}

/* --------------------------- ADDRESSES --------------------------------- */

export function listAddresses() {
    return _store.addresses.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function generateAddress({ domain, label, prefix }) {
    const d = _store.domains.find(x => x.domain === domain);
    if (!d) throw new Error(`domain ${domain} not registered`);
    const random = crypto.randomBytes(4).toString('hex');
    const local = (prefix && /^[a-z0-9._-]+$/i.test(prefix))
        ? `${prefix}.${random}`
        : `tmp.${random}`;
    const address = `${local}@${domain}`.toLowerCase();
    if (_store.addresses.find(a => a.address === address)) {
        throw new Error(`address collision: ${address}`);
    }
    const row = {
        address,
        domain,
        label: label || '',
        createdAt: Date.now(),
        lastSeenAt: 0,
        messageCount: 0
    };
    _store.addresses.push(row);
    saveTempmailStore();
    return row;
}

export function revokeAddress(address) {
    const i = _store.addresses.findIndex(a => a.address === address);
    if (i < 0) throw new Error(`address ${address} not found`);
    _store.addresses.splice(i, 1);
    // Also drop any cached messages routed to it.
    _store.messages = _store.messages.filter(m => m.address !== address);
    saveTempmailStore();
}

/* --------------------------- MESSAGES ---------------------------------- */

export function listMessages(address, { limit = 50 } = {}) {
    return _store.messages
        .filter(m => m.address === address)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, limit);
}

export function getMessage(id) {
    return _store.messages.find(m => m.id === id) || null;
}

/**
 * Pull the most likely verification code / magic link from the latest
 * matching message. Run regexes in priority order:
 *   1. 6-digit OTP                  (123456)
 *   2. 4-8 digit OTP at line start  (4-8 chars, alpha-numeric token)
 *   3. magic link URL               (first https:// in body)
 */
export function extractCode(address) {
    const msgs = listMessages(address, { limit: 5 });
    if (!msgs.length) return { ok: false, reason: 'no messages yet' };
    for (const m of msgs) {
        const blob = `${m.subject || ''}\n${m.bodyText || ''}\n${m.snippet || ''}`;
        // 1. Pure 6-digit code
        let match = blob.match(/(?<![A-Z0-9])(\d{6})(?![A-Z0-9])/i);
        if (match) {
            return { ok: true, kind: 'otp', value: match[1], from: m.from, subject: m.subject, ts: m.ts };
        }
        // 2. 4-8 alphanumeric "verification code"
        match = blob.match(/(?:code|otp|token)[\s:]+([A-Z0-9]{4,8})/i);
        if (match) {
            return { ok: true, kind: 'otp', value: match[1], from: m.from, subject: m.subject, ts: m.ts };
        }
        // 3. First URL
        match = blob.match(/(https?:\/\/[^\s<>"')]+)/i);
        if (match) {
            return { ok: true, kind: 'link', value: match[1], from: m.from, subject: m.subject, ts: m.ts };
        }
    }
    return { ok: false, reason: 'no extractable code/link in last 5 messages' };
}

/* --------------------------- POLLER ----------------------------------- */

function recordMessage(address, m) {
    const id = `msg_${crypto.randomBytes(6).toString('hex')}`;
    const bodyText = (m.bodyText || '').slice(0, MAX_BODY_BYTES);
    const snippet = bodyText.replace(/\s+/g, ' ').slice(0, 200);
    _store.messages.push({
        id,
        address: address.address,
        inboxId: m.inboxId,
        from: m.from || '',
        to: m.to || address.address,
        subject: m.subject || '',
        snippet,
        bodyText,
        ts: m.ts || Date.now(),
        uid: m.uid || 0
    });
    address.messageCount = (address.messageCount || 0) + 1;
    address.lastSeenAt = Date.now();

    // Per-address ring buffer
    const perAddr = _store.messages.filter(x => x.address === address.address);
    if (perAddr.length > MESSAGE_RETENTION) {
        const drop = perAddr.length - MESSAGE_RETENTION;
        const ids = new Set(
            perAddr.sort((a, b) => a.ts - b.ts).slice(0, drop).map(x => x.id)
        );
        _store.messages = _store.messages.filter(x => !ids.has(x.id));
    }
    // Global cap
    if (_store.messages.length > GLOBAL_MESSAGE_RETENTION) {
        _store.messages.sort((a, b) => a.ts - b.ts);
        _store.messages.splice(0, _store.messages.length - GLOBAL_MESSAGE_RETENTION);
    }
}

function normaliseAddr(addr) {
    return String(addr || '').toLowerCase().trim();
}

function findAddressForRecipient(toLine) {
    if (!toLine) return null;
    const lc = String(toLine).toLowerCase();
    for (const addr of _store.addresses) {
        if (lc.includes(addr.address)) return addr;
    }
    return null;
}

async function pollInbox(inbox) {
    const client = new ImapFlow({
        host: inbox.host,
        port: inbox.port || 993,
        secure: inbox.secure !== false,
        auth: { user: inbox.user, pass: inbox.pass },
        logger: false
    });
    const seen = [];
    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const minUid = (inbox.lastUid || 0) + 1;
            // First-time bootstrap: don't fetch the entire inbox history.
            // Just record the current latest UID and pick up new mail going forward.
            if (!inbox.lastUid) {
                const status = await client.status('INBOX', { messages: true, uidNext: true });
                inbox.lastUid = Math.max(0, (status.uidNext || 1) - 1);
                saveTempmailStore();
                return seen;
            }
            const range = `${minUid}:*`;
            for await (const msg of client.fetch(range, {
                envelope: true,
                source: true,
                uid: true
            })) {
                if (msg.uid <= (inbox.lastUid || 0)) continue;
                // Walk every "to" / "delivered-to" header looking for our addresses.
                const env = msg.envelope || {};
                const recipients = [];
                for (const k of ['to', 'cc', 'bcc']) {
                    if (Array.isArray(env[k])) {
                        for (const r of env[k]) {
                            if (r && r.address) recipients.push(normaliseAddr(r.address));
                        }
                    }
                }
                // Cloudflare Email Routing keeps the original `To` in headers; also
                // check `Delivered-To` and any received-for clause via raw source.
                let rawText = '';
                try {
                    rawText = msg.source ? msg.source.toString('utf-8') : '';
                } catch {}
                const headerLine = rawText.split(/\r?\n\r?\n/, 1)[0] || '';
                const targetAddrs = recipients.slice();
                for (const m of headerLine.matchAll(/^(?:Delivered-To|X-Forwarded-To|To):\s*(.+)$/gim)) {
                    targetAddrs.push(normaliseAddr(m[1]));
                }
                let address = null;
                for (const candidate of targetAddrs) {
                    address = findAddressForRecipient(candidate);
                    if (address) break;
                }
                if (!address) {
                    inbox.lastUid = msg.uid;
                    continue;
                }
                // Body extraction: prefer text/plain part if present.
                let bodyText = '';
                const bodyMatch = rawText.match(/\r?\n\r?\n([\s\S]*)$/);
                if (bodyMatch) bodyText = bodyMatch[1];
                // Strip simplest HTML if no text part exists.
                if (/<html/i.test(bodyText) && !/^[ \t]*[A-Za-z]/.test(bodyText.slice(0, 200))) {
                    bodyText = bodyText.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
                }
                const fromObj = (env.from && env.from[0]) || null;
                const fromStr = fromObj
                    ? `${fromObj.name ? fromObj.name + ' ' : ''}<${fromObj.address}>`
                    : '';
                recordMessage(address, {
                    inboxId: inbox.id,
                    from: fromStr,
                    to: address.address,
                    subject: env.subject || '(no subject)',
                    bodyText,
                    ts: env.date ? new Date(env.date).getTime() : Date.now(),
                    uid: msg.uid
                });
                seen.push({ uid: msg.uid, address: address.address });
                inbox.lastUid = msg.uid;
            }
            saveTempmailStore();
        } finally {
            lock.release();
        }
    } finally {
        try { await client.logout(); } catch {}
    }
    return seen;
}

export async function pollAllInboxes() {
    if (_pollInflight) return { skipped: true };
    _pollInflight = true;
    const results = [];
    try {
        for (const inbox of _store.inboxes) {
            try {
                const seen = await pollInbox(inbox);
                inbox.lastTestedAt = Date.now();
                inbox.lastTestResult = { ok: true, fetched: seen.length };
                results.push({ inboxId: inbox.id, ok: true, fetched: seen.length });
            } catch (e) {
                inbox.lastTestResult = { ok: false, error: e.message };
                results.push({ inboxId: inbox.id, ok: false, error: e.message });
            }
        }
        saveTempmailStore();
    } finally {
        _pollInflight = false;
    }
    return { results, ts: Date.now() };
}

export function startTempmailPoller() {
    if (_pollTimer) return;
    loadTempmailStore();
    _pollTimer = setInterval(() => {
        pollAllInboxes().catch(e => console.error('[tempmail] poll error:', e.message));
    }, POLL_INTERVAL_MS);
    // First poll on next tick so server boot doesn't block.
    setTimeout(() => {
        pollAllInboxes().catch(() => {});
    }, 1500);
}

export function stopTempmailPoller() {
    if (_pollTimer) {
        clearInterval(_pollTimer);
        _pollTimer = null;
    }
}

/* --------------------------- SUMMARY ---------------------------------- */

export function tempmailSummary() {
    return {
        inboxes: _store.inboxes.length,
        domains: _store.domains.length,
        addresses: _store.addresses.length,
        messages: _store.messages.length,
        configured: _store.inboxes.length > 0 && _store.domains.length > 0,
        savedAt: _store.savedAt
    };
}

loadTempmailStore();
