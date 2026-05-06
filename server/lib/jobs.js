/**
 * Bot signup job manager. Wraps lib/runner.js with job IDs, log buffers,
 * and SSE log streaming for the dashboard.
 */
import { randomUUID } from 'crypto';
import { runBatch } from '../../lib/runner.js';
import { loadLines } from '../../lib/utils.js';
import { getConfig } from './config.js';
import { addKiroCred } from './providers/kiro/credentials.js';
import path from 'path';

const VALID_MODES = new Set([1, 2, 3, 4, 5, 6, 7]);

const _jobs = new Map(); // id -> Job

class Job {
    constructor({ accounts, proxies, mode, headless, limit, concurrency }) {
        this.id = randomUUID();
        this.startedAt = Date.now();
        this.finishedAt = null;
        this.mode = mode;
        this.headless = headless;
        this.concurrency = concurrency;
        this.totalRequested = accounts.length;
        this.accounts = limit && limit > 0 ? accounts.slice(0, limit) : accounts;
        this.proxies = proxies;
        this.status = 'running';
        this.results = [];
        this.logs = []; // [{ ts, email, line }]
        this.maxLogs = 5000;
        this.subscribers = new Set();
        this.abortFlag = { aborted: false };
        this._emitter = null;
    }

    start() {
        const cfg = getConfig();
        const keysOutputFile = path.resolve(cfg.KEYS_FILE);
        this._emitter = runBatch({
            accounts: this.accounts,
            proxies: this.proxies,
            mode: this.mode,
            headless: this.headless,
            concurrency: this.concurrency,
            keysOutputFile,
            onKiroCred: async (cred) => {
                try {
                    addKiroCred(cred);
                } catch (e) {
                    // surface the failure into the job log
                    const entry = { ts: Date.now(), email: null, line: `[!] Failed to persist Kiro cred: ${e.message}` };
                    this.logs.push(entry);
                    for (const sub of this.subscribers) {
                        try { sub.write(`data: ${JSON.stringify({ type: 'log', ...entry })}\n\n`); } catch {}
                    }
                    throw e;
                }
            },
            abortFlag: this.abortFlag
        });

        this._emitter.on('log', ({ email, line }) => {
            const entry = { ts: Date.now(), email, line };
            this.logs.push(entry);
            if (this.logs.length > this.maxLogs) this.logs.shift();
            for (const sub of this.subscribers) {
                try { sub.write(`data: ${JSON.stringify({ type: 'log', ...entry })}\n\n`); } catch {}
            }
        });

        this._emitter.on('progress', (p) => {
            this.results.push(p.result);
            for (const sub of this.subscribers) {
                try { sub.write(`data: ${JSON.stringify({ type: 'progress', ...p })}\n\n`); } catch {}
            }
        });

        this._emitter.on('done', ({ results, error }) => {
            this.finishedAt = Date.now();
            this.status = error ? 'error' : (this.abortFlag.aborted ? 'aborted' : 'completed');
            if (error) this.error = error;
            for (const sub of this.subscribers) {
                try { sub.write(`data: ${JSON.stringify({ type: 'done', status: this.status, error })}\n\n`); } catch {}
                try { sub.end(); } catch {}
            }
            this.subscribers.clear();
        });
    }

    abort() {
        this.abortFlag.aborted = true;
    }

    subscribe(res) {
        this.subscribers.add(res);
        // replay buffered logs
        try {
            res.write(`data: ${JSON.stringify({ type: 'replay', logs: this.logs.slice(-200) })}\n\n`);
        } catch {}
        if (this.status !== 'running') {
            try { res.write(`data: ${JSON.stringify({ type: 'done', status: this.status, error: this.error || null })}\n\n`); } catch {}
            try { res.end(); } catch {}
            this.subscribers.delete(res);
            return;
        }
        res.on('close', () => this.subscribers.delete(res));
    }

    summary() {
        const ok = this.results.filter(r => r.success).length;
        const fail = this.results.filter(r => !r.success).length;
        const keys = this.results.filter(r => r.apiKey).length;
        const kiroCreds = this.results.filter(r => r.kiroCred).length;
        return {
            id: this.id,
            startedAt: this.startedAt,
            finishedAt: this.finishedAt,
            mode: this.mode,
            headless: this.headless,
            concurrency: this.concurrency,
            status: this.status,
            total: this.accounts.length,
            processed: this.results.length,
            success: ok,
            failed: fail,
            keysObtained: keys,
            kiroCredsObtained: kiroCreds,
            error: this.error || null
        };
    }
}

export function createJob({ mode, headless = true, limit = 0, concurrency = 1, accountsList = null, proxiesList = null }) {
    if (!VALID_MODES.has(mode)) {
        throw new Error('mode must be one of: 1=Unlucid, 2=CodeBuddy, 4=Kiro, or any combination (3,5,6,7)');
    }
    concurrency = Math.max(1, Math.floor(Number(concurrency) || 1));
    if (concurrency > 8) throw new Error('concurrency capped at 8 to keep VM/browser memory sane.');

    const cfg = getConfig();
    const accounts = accountsList ?? loadLines(cfg.ACCOUNTS_FILE);
    const proxies = proxiesList ?? loadLines(cfg.PROXIES_FILE);

    if (accounts.length === 0) throw new Error('No accounts in accounts.txt');
    if (proxies.length === 0) throw new Error('No proxies in proxies.txt');
    if (proxies.length < concurrency) {
        throw new Error(`concurrency=${concurrency} requires at least ${concurrency} proxies (have ${proxies.length}).`);
    }

    const job = new Job({ accounts, proxies, mode, headless, limit, concurrency });
    _jobs.set(job.id, job);
    job.start();
    return job;
}

export function getJob(id) { return _jobs.get(id); }

export function listJobs() {
    return [..._jobs.values()].sort((a, b) => b.startedAt - a.startedAt).map(j => j.summary());
}

export function abortJob(id) {
    const j = _jobs.get(id);
    if (!j) return false;
    j.abort();
    return true;
}
