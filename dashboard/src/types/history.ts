export interface HistoryEntry {
  id: string
  ts: string
  model: string
  provider: string
  source: string
  endpoint: string
  method: string
  path: string
  stream: boolean
  message_count: number
  prompt_preview?: string
  client?: string
  status_code?: number
  response_code?: 'success' | 'error'
  ok: boolean
  aborted?: boolean
  duration_ms: number
  error?: string
  // Legacy fields (may not exist in backend data)
  timestamp?: string
  status?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  latency_ms?: number
}

export interface HistoryResponse {
  entries: HistoryEntry[]
  total: number
  max: number
}
