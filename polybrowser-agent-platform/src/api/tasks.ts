import { api } from './client'
import type { Task, TaskRunRequest, TaskRunResult } from '../types/api'

export function fetchTasks(limit?: number) {
  const qs = limit ? `?limit=${limit}` : ''
  return api.get<Task[]>(`/tasks${qs}`)
}

export function fetchTask(id: string) {
  return api.get<Task>(`/tasks/${encodeURIComponent(id)}`)
}

export function runTask(body: TaskRunRequest) {
  return api.post<TaskRunResult>('/tasks/run', body)
}