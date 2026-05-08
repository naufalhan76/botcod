/**
 * In-memory stats collector for dashboard charts.
 * Tracks request volume, token usage, latency, and provider health.
 */

const BUCKET_SIZE_MS = 3600000; // 1 hour buckets
const MAX_BUCKETS = 720; // 30 days of hourly data

let _requestBuckets = []; // [{ timestamp, count, success, error }]
let _tokenStats = []; // [{ timestamp, model, provider, promptTokens, completionTokens }]
let _latencyStats = []; // [{ timestamp, provider, latencyMs, success }]
let _providerHealth = new Map(); // provider -> { lastCheck, consecutiveErrors, status }
let _tokenSavings = []; // [{ timestamp, tokensSaved, cacheHit }]

function getCurrentBucketTimestamp() {
  const now = Date.now();
  return new Date(now - (now % BUCKET_SIZE_MS)).toISOString();
}

function getOrCreateBucket(timestamp) {
  let bucket = _requestBuckets.find(b => b.timestamp === timestamp);
  if (!bucket) {
    bucket = { timestamp, count: 0, success: 0, error: 0 };
    _requestBuckets.push(bucket);
    // Trim old buckets
    if (_requestBuckets.length > MAX_BUCKETS) {
      _requestBuckets = _requestBuckets.slice(-MAX_BUCKETS);
    }
  }
  return bucket;
}

export function trackRequest({ model, provider, promptTokens = 0, completionTokens = 0, tokensSaved = 0, cacheHit = false, latencyMs = 0, success = true }) {
  const ts = getCurrentBucketTimestamp();
  
  // Request volume
  const bucket = getOrCreateBucket(ts);
  bucket.count++;
  if (success) bucket.success++;
  else bucket.error++;
  
  // Token stats
  _tokenStats.push({ timestamp: ts, model, provider, promptTokens, completionTokens });
  if (_tokenStats.length > 10000) _tokenStats = _tokenStats.slice(-5000);
  
  // Token savings
  if (tokensSaved > 0 || cacheHit) {
    _tokenSavings.push({ timestamp: ts, tokensSaved, cacheHit });
    if (_tokenSavings.length > 10000) _tokenSavings = _tokenSavings.slice(-5000);
  }
  
  // Latency
  _latencyStats.push({ timestamp: ts, provider, latencyMs, success });
  if (_latencyStats.length > 10000) _latencyStats = _latencyStats.slice(-5000);
  
  // Provider health
  const health = _providerHealth.get(provider) || { lastCheck: null, consecutiveErrors: 0, status: 'up' };
  health.lastCheck = new Date().toISOString();
  if (success) {
    health.consecutiveErrors = 0;
    health.status = 'up';
  } else {
    health.consecutiveErrors++;
    health.status = health.consecutiveErrors >= 3 ? 'down' : health.consecutiveErrors >= 1 ? 'degraded' : 'up';
  }
  _providerHealth.set(provider, health);
}

function filterByPeriod(items, period) {
  const now = Date.now();
  const ms = { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[period] || 86400000;
  const cutoff = new Date(now - ms).toISOString();
  return items.filter(i => i.timestamp >= cutoff);
}

export function getRequestStats(period = '24h') {
  const buckets = filterByPeriod(_requestBuckets, period);
  return { buckets };
}

export function getTokenStats(period = '24h') {
  const items = filterByPeriod(_tokenStats, period);
  
  const byModel = {};
  const byProvider = {};
  
  for (const item of items) {
    // By model
    if (!byModel[item.model]) byModel[item.model] = { model: item.model, promptTokens: 0, completionTokens: 0, total: 0 };
    byModel[item.model].promptTokens += item.promptTokens;
    byModel[item.model].completionTokens += item.completionTokens;
    byModel[item.model].total += item.promptTokens + item.completionTokens;
    
    // By provider
    if (!byProvider[item.provider]) byProvider[item.provider] = { model: item.provider, promptTokens: 0, completionTokens: 0, total: 0 };
    byProvider[item.provider].promptTokens += item.promptTokens;
    byProvider[item.provider].completionTokens += item.completionTokens;
    byProvider[item.provider].total += item.promptTokens + item.completionTokens;
  }
  
  return { byModel: Object.values(byModel), byProvider: Object.values(byProvider) };
}

export function getPerformanceStats(period = '24h') {
  const items = filterByPeriod(_latencyStats, period);
  if (items.length === 0) return { avgLatency: 0, p95Latency: 0, errorRate: 0, byProvider: [] };
  
  const latencies = items.filter(i => i.success).map(i => i.latencyMs).sort((a, b) => a - b);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const p95Latency = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] || 0 : 0;
  const errorRate = items.length ? items.filter(i => !i.success).length / items.length : 0;
  
  // By provider
  const providers = {};
  for (const item of items) {
    if (!providers[item.provider]) providers[item.provider] = { provider: item.provider, latencies: [], errors: 0, total: 0 };
    providers[item.provider].total++;
    if (item.success) providers[item.provider].latencies.push(item.latencyMs);
    else providers[item.provider].errors++;
  }
  
  const byProvider = Object.values(providers).map((p) => ({
    provider: p.provider,
    avgLatency: p.latencies.length ? Math.round(p.latencies.reduce((a, b) => a + b, 0) / p.latencies.length) : 0,
    errorRate: p.total ? p.errors / p.total : 0,
  }));
  
  return { avgLatency, p95Latency, errorRate, byProvider };
}

export function getProviderHealth() {
  const providers = [];
  for (const [name, health] of _providerHealth) {
    providers.push({
      name,
      status: health.status,
      lastCheck: health.lastCheck,
      uptime: health.status === 'up' ? 1 : health.status === 'degraded' ? 0.5 : 0,
    });
  }
  return { providers };
}

export function getTokenSavingsStats(period = '24h') {
  const items = filterByPeriod(_tokenSavings, period);
  let totalTokensSaved = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  for (const item of items) {
    totalTokensSaved += item.tokensSaved || 0;
    if (item.cacheHit) cacheHits++;
    else cacheMisses++;
  }
  return { totalTokensSaved, cacheHits, cacheMisses, entries: items.length };
}
