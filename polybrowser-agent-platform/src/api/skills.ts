import { api } from './client'
import type { Skill } from '../types/api'

export function fetchSkills() {
  return api.get<Skill[]>('/skills')
}

export function fetchSkill(id: string) {
  return api.get<Skill>(`/skills/${encodeURIComponent(id)}`)
}

export function reloadSkills() {
  return api.post<Skill[]>('/skills/reload')
}