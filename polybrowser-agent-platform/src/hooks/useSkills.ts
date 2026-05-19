import { fetchSkills, reloadSkills } from '../api/skills'
import { useApi } from './useApi'

export function useSkills() {
  const state = useApi(fetchSkills, [])
  return {
    ...state,
    reload: reloadSkills
  }
}