import { api } from './client'
import type { EnvironmentSummary, EnvironmentDetail, CreateEnvironmentRequest } from '../types/api'

export function fetchEnvironments() {
  return api.get<EnvironmentSummary[]>('/environments')
}

export function fetchEnvironment(id: string) {
  return api.get<EnvironmentDetail>(`/environments/${encodeURIComponent(id)}`)
}

export function createEnvironment(body: CreateEnvironmentRequest) {
  return api.post<EnvironmentSummary>('/environments', body)
}

export function startEnvironment(id: string) {
  return api.post<EnvironmentSummary>(`/environments/${encodeURIComponent(id)}/start`)
}

export function stopEnvironment(id: string) {
  return api.post<EnvironmentSummary>(`/environments/${encodeURIComponent(id)}/stop`)
}