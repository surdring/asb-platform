import { fetchTasks, runTask } from '../api/tasks'
import { useApi } from './useApi'

export function useTasks(limit = 100) {
  const state = useApi(() => fetchTasks(limit), [limit])
  return {
    ...state,
    run: runTask
  }
}