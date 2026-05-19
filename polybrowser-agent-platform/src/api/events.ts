interface BrokerEvent {
  type: string
  data: unknown
  receivedAt: string
}

const EVENT_TYPES = [
  'environment.created',
  'environment.started',
  'environment.stopped',
  'lease.created',
  'lease.renewed',
  'lease.released',
  'lease.expired',
  'skills.reloaded',
  'skill.loaded',
  'task.started',
  'task.completed',
  'task.failed',
  'http.failed'
]

export function subscribeEvents(onEvent: (event: BrokerEvent) => void): () => void {
  const source = new EventSource('/api/events')

  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (event) => {
      const message = event as MessageEvent<string>
      onEvent({
        type,
        data: JSON.parse(message.data || '{}'),
        receivedAt: new Date().toISOString()
      })
    })
  }

  source.onerror = () => {
    source.close()
  }

  return () => source.close()
}