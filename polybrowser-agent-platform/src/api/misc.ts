import { api } from './client'
import type { HealthResponse, DbStatus, CollectedItem } from '../types/api'

export function fetchHealth() {
  return api.get<HealthResponse>('/health')
}

export function fetchDbStatus() {
  return api.get<DbStatus>('/db/status')
}

export function fetchCollectedItems(limit?: number) {
  const qs = limit ? `?limit=${limit}` : ''
  return api.get<CollectedItem[]>(`/collected-items${qs}`)
}