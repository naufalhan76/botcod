export interface ModelCap {
  context: number
  output: number
  reasoning?: boolean
}

export interface Settings {
  COOLDOWN_MS: number
  EXPOSED_MODELS: string[]
  UPSTREAM_BASE: string
  MAX_ROTATIONS_PER_REQUEST: number
  MODEL_CAPS: Record<string, ModelCap>
  MODEL_CAPS_OVERRIDES: Record<string, Partial<ModelCap>>
  RTK_ENABLED: boolean
  CAVEMAN_ENABLED: boolean
  CAVEMAN_LEVEL: string
  TRUNCATE_ENABLED: boolean
  TRUNCATE_THRESHOLD: number
  CACHE_ENABLED: boolean
  CACHE_TTL_MS: number
  CACHE_MAX_SIZE: number
  PORT: number
}

export interface FilterEntry {
  id: string
  pattern: string
  replacement: string
  target: 'body' | 'headers' | 'both'
  active: boolean
  createdAt: string
}

export interface FiltersResponse {
  filters: FilterEntry[]
}
