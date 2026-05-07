import type { PoolSummary } from './overview'

export interface PoolEntry {
  key_masked: string
  email: string
  status: 'active' | 'cooldown' | 'dead'
  last_used_at: string | null
  cooldown_until: string | null
  request_count: number
}

export interface PoolResponse {
  summary: PoolSummary
  entries: PoolEntry[]
}

export interface KiroCredEntry {
  idx: number
  label: string
  status: 'active' | 'cooldown' | 'dead'
  auth: string
  hasAccessToken: boolean
  expiresAt: string | null
}

export interface KiroPoolResponse {
  summary: PoolSummary
  entries: KiroCredEntry[]
}
