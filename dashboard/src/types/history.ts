export interface HistoryEntry {
  id: string
  timestamp: string
  model: string
  provider: string
  source: string
  endpoint: string
  status: 'success' | 'error'
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number
  error?: string
  prompt_preview?: string
}

export type HistoryResponse = HistoryEntry[]
