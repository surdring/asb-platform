const BASE_URL = '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new ApiError(res.status, body.error || 'Request failed')
    }

    return res.json()
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'Request timeout')
    }
    throw new ApiError(0, err instanceof Error ? err.message : 'Network error')
  } finally {
    clearTimeout(timeout)
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' })
}

export async function probeSession(params: {
  platform: string
  url?: string
  includeCookies?: boolean
  includeStorageState?: boolean
  keepOpen?: boolean
}) {
  return api.post('/sessions/probe', params)
}

export async function fetchArtifacts(params?: {
  leaseId?: string
  kind?: string
  limit?: number
}) {
  const search = new URLSearchParams()
  if (params?.leaseId) search.set('leaseId', params.leaseId)
  if (params?.kind) search.set('kind', params.kind)
  if (params?.limit) search.set('limit', String(params.limit))
  const query = search.toString()
  return api.get(`/artifacts${query ? `?${query}` : ''}`)
}

export async function fetchArtifact(id: string) {
  return api.get(`/artifacts/${encodeURIComponent(id)}`)
}

export async function downloadArtifact(id: string) {
  const res = await fetch(`/api/artifacts/${encodeURIComponent(id)}/download`)
  if (!res.ok) throw new Error('Download failed')
  return res
}

export async function deleteArtifact(id: string) {
  return api.delete(`/artifacts/${encodeURIComponent(id)}`)
}

export async function cleanupArtifacts(params?: {
  olderThanDays?: number
  limit?: number
  dryRun?: boolean
}) {
  return api.post('/artifacts/cleanup', params || {})
}

export async function fetchTabAudit() {
  return api.get('/tab-audit')
}

export async function reconcileTabs() {
  return api.post('/tab-audit/reconcile', {})
}