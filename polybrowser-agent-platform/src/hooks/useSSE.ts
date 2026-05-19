import { useEffect, useRef, useCallback } from 'react'

type SseEventHandler = (type: string, data: unknown) => void

export function useSSE(onEvent: SseEventHandler) {
  const sourceRef = useRef<EventSource | null>(null)
  const handlerRef = useRef<SseEventHandler>(onEvent)
  handlerRef.current = onEvent

  const connect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close()
    }

    const source = new EventSource('/api/events')
    sourceRef.current = source

    const eventTypes = [
      'environment.created', 'environment.started', 'environment.stopped',
      'lease.created', 'lease.renewed', 'lease.released',
      'task.completed', 'skills.reloaded'
    ]

    eventTypes.forEach(type => {
      source.addEventListener(type, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          handlerRef.current(type, data)
        } catch {
          handlerRef.current(type, e.data)
        }
      })
    })

    source.onerror = () => {
      source.close()
      setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      sourceRef.current?.close()
    }
  }, [connect])

  return { reconnect: connect }
}