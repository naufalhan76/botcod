/**
 * Bot signup job manager. Wraps lib/runner.js with job IDs, log buffers,
 * and SSE log streaming for the dashboard.
 */
import { randomUUID } from 'crypto';
import { runBatch } from '../../lib/runner.js';
import { loadLines } from '../../lib/utils.js';
import { getConfig } from './config.js';
import path from 'path';

const _jobs = new Map(); // id -> Job

class Job {
    constructor({ accounts, proxies, mode, headless, limit }) {
        this.id = randomUUID();
        this.startedAt = Date.now();
        this.finishedAt = null;
        this.mode = mode;
        this.headless = headless;
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
            keysOutputFile,
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
        return {
            id: this.id,
            startedAt: this.startedAt,
            finishedAt: this.finishedAt,
            mode: this.mode,
            headless: this.headless,
            status: this.status,
            total: this.accounts.length,
            processed: this.results.length,
            success: ok,
            failed: fail,
            keysObtained: keys,
            error: this.error || null
        };
    }
}

export function createJob({ mode, headless = true, limit = 0, accountsList = null, proxiesList = null }) {
    const cfg = getConfig();
    const accounts = accountsList ?? loadLines(cfg.ACCOUNTS_FILE);
    const proxies = proxiesList ?? loadLines(cfg.PROXIES_FILE);

    if (accounts.length === 0) throw new Error('No accounts in accounts.txt');
    if (proxies.length === 0) throw new Error('No proxies in proxies.txt');
    if (![1, 2, 3].includes(mode)) throw new Error('mode must be 1, 2, or 3');

    const job = new Job({ accounts, proxies, mode, headless, limit });
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
