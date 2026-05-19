import { api } from './client'
import type { Lease, CreateLeaseRequest } from '../types/api'

export function fetchLeases(params?: { agentId?: string; environmentId?: string }) {
  const search = new URLSearchParams()
  if (params?.agentId) search.set('agentId', params.agentId)
  if (params?.environmentId) search.set('environmentId', params.environmentId)
  const qs = search.toString()
  return api.get<Lease[]>(`/leases${qs ? `?${qs}` : ''}`)
}

export function createLease(body: CreateLeaseRequest) {
  return api.post<Lease>('/leases', body)
}

export function renewLease(id: string, ttlMs?: number) {
  return api.post<Lease>(`/leases/${encodeURIComponent(id)}/renew`, { ttlMs })
}

export function releaseLease(id: string, closeTab?: boolean) {
  const qs = closeTab ? '?closeTab=true' : ''
  return api.delete<Lease | { id: string; status: string }>(`/leases/${encodeURIComponent(id)}${qs}`)
}