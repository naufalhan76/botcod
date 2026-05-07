'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface BotLogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  worker?: number
}

/** Map a raw log line to a severity level based on prefix markers. */
function detectLevel(line: string): BotLogEntry['level'] {
  if (line.includes('[X]') || line.includes('[FATAL]') || line.includes('[!] Failed')) return 'error'
  if (line.includes('[!]') || line.includes('[WARN]')) return 'warn'
  if (line.includes('[OK]') || line.includes('[SAVED]')) return 'success'
  return 'info'
}

/** Extract worker slot number from "[W1] ..." prefix. */
function detectWorker(line: string): number | undefined {
  const m = line.match(/\[W(\d+)\]\s/)
  return m ? Number(m[1]) : undefined
}

/** Convert a raw backend log entry ({ ts, email, line }) into a BotLogEntry. */
function toLogEntry(raw: { ts: number; email?: string | null; line: string }): BotLogEntry {
  return {
    timestamp: raw.ts,
    level: detectLevel(raw.line),
    message: raw.line,
    worker: detectWorker(raw.line),
  }
}

const MAX_LOGS = 1000
const TRIM_TO = 500

export function useBotLogs(jobId: string | null) {
  const [logs, setLogs] = useState<BotLogEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const mountedRef = useRef(true)
  const retriesRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushLogs = useCallback((entries: BotLogEntry[]) => {
    setLogs(prev => {
      const next = [...prev, ...entries]
      return next.length > MAX_LOGS ? next.slice(-TRIM_TO) : next
    })
  }, [])

  const connect = useCallback(() => {
    if (!jobId || !mountedRef.current) return

    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    esRef.current?.close()

    const es = new EventSource(`/api/jobs/${jobId}/stream`)
    esRef.current = es

    es.onopen = () => {
      if (!mountedRef.current) return
      setIsConnected(true)
      setError(null)
      retriesRef.current = 0
    }

    es.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'log' && msg.line) {
          pushLogs([toLogEntry(msg)])
        } else if (msg.type === 'replay' && Array.isArray(msg.logs)) {
          pushLogs(msg.logs.map(toLogEntry))
        } else if (msg.type === 'done') {
          const status = msg.status || 'completed'
          pushLogs([{
            timestamp: Date.now(),
            level: status === 'error' ? 'error' : status === 'aborted' ? 'warn' : 'success',
            message: `[*] Job ${status}${msg.error ? ': ' + msg.error : ''}`,
          }])
        }
        // 'progress' and 'status' events are handled by the jobs query, not logs
      } catch {
        // non-JSON SSE — ignore
      }
    }

    es.onerror = () => {
      es.close()
      if (!mountedRef.current) return
      setIsConnected(false)
      if (retriesRef.current < 5) {
        retriesRef.current++
        timerRef.current = setTimeout(connect, 3000 * retriesRef.current)
      } else {
        setError('Connection lost. Max retries reached.')
      }
    }
  }, [jobId, pushLogs])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      esRef.current?.close()
    }
  }, [connect])

  const clearLogs = useCallback(() => setLogs([]), [])

  return { logs, isConnected, error, clearLogs }
}
