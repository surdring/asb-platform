import { fetchEnvironments, createEnvironment, startEnvironment, stopEnvironment } from '../api/environments'
import { useApi } from './useApi'

export function useEnvironments() {
  const state = useApi(fetchEnvironments, [])
  return {
    ...state,
    create: createEnvironment,
    start: startEnvironment,
    stop: stopEnvironment
  }
}