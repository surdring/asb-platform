import { fetchLeases, createLease, releaseLease } from '../api/leases'
import { useApi } from './useApi'

export function useLeases() {
  const state = useApi(fetchLeases, [])
  return {
    ...state,
    create: createLease,
    release: releaseLease
  }
}