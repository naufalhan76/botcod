import type { ModelCap } from './settings'

export interface PoolSummary {
  total: number
  active: number
  cooldown: number
  dead: number
}

export interface OverviewResponse {
  pool: PoolSummary
  kiro_pool: PoolSummary
  tempmail: { inboxes: number; domains: number; addresses: number }
  accounts: number
  proxies: number
  jobs_total: number
  jobs_running: number
  config: {
    UPSTREAM_BASE: string
    COOLDOWN_MS: number
    EXPOSED_MODELS: string[]
    MODEL_PROVIDERS: Record<string, string>
    MODEL_CAPS: Record<string, ModelCap>
    MODEL_CAPS_OVERRIDES: Record<string, Partial<ModelCap>>
    PORT: number
  }
}
