'use client'
import { useSSE } from './use-sse'

interface BotLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  worker?: number
}

export function useBotLogs(jobId: string | null) {
  const { data, isConnected, error, clear } = useSSE<BotLogEntry>({
    url: `/api/jobs/${jobId}/stream`,
    enabled: !!jobId,
  })

  return {
    logs: data,
    isConnected,
    error,
    clearLogs: clear,
  }
}
