export interface RequestBucket {
  timestamp: string
  count: number
  success: number
  error: number
}

export interface RequestStatsResponse {
  buckets: RequestBucket[]
}

export interface TokenByModel {
  model: string
  promptTokens: number
  completionTokens: number
  total: number
}

export interface TokenStatsResponse {
  byModel: TokenByModel[]
  byProvider: TokenByModel[]
}

export interface PerformanceResponse {
  avgLatency: number
  p95Latency: number
  errorRate: number
  byProvider: { provider: string; avgLatency: number; errorRate: number }[]
}

export interface ProviderHealthEntry {
  name: string
  status: 'up' | 'down' | 'degraded'
  lastCheck: string
  uptime: number
}

export interface HealthResponse {
  providers: ProviderHealthEntry[]
}
