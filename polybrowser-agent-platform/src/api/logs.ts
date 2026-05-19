import { api } from './client'
import type { LogEntry } from '../types/api'

export function fetchLogs(limit?: number) {
  const qs = limit ? `?limit=${limit}` : ''
  return api.get<LogEntry[]>(`/logs${qs}`)
}

export function fetchTaskLogs(taskId: string, limit?: number) {
  const qs = limit ? `?limit=${limit}` : ''
  return api.get<LogEntry[]>(`/tasks/${encodeURIComponent(taskId)}/logs${qs}`)
}