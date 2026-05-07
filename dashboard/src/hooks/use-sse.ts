'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface UseSSEOptions {
  url: string
  enabled?: boolean
  maxRetries?: number
  retryDelay?: number
}

export function useSSE<T = string>({ url, enabled = true, maxRetries = 5, retryDelay = 3000 }: UseSSEOptions) {
  const [data, setData] = useState<T[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const retriesRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    eventSourceRef.current?.close()
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onopen = () => {
      if (!mountedRef.current) return
      setIsConnected(true)
      setError(null)
      retriesRef.current = 0
    }

    es.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const parsed = JSON.parse(event.data) as T
        setData(prev => {
          const next = [...prev, parsed]
          return next.length > 1000 ? next.slice(-500) : next
        })
      } catch {
        setData(prev => {
          const next = [...prev, event.data as unknown as T]
          return next.length > 1000 ? next.slice(-500) : next
        })
      }
    }

    es.onerror = () => {
      es.close()
      if (!mountedRef.current) return
      setIsConnected(false)

      if (retriesRef.current < maxRetries) {
        retriesRef.current++
        timeoutRef.current = setTimeout(connect, retryDelay * retriesRef.current)
      } else {
        setError('Connection lost. Max retries reached.')
      }
    }
  }, [url, enabled, maxRetries, retryDelay])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      eventSourceRef.current?.close()
    }
  }, [connect])

  const clear = useCallback(() => setData([]), [])

  return { data, isConnected, error, clear }
}
