export type EnvironmentType = 'docker' | 'native';

export interface Environment {
  id: string;
  name: string;
  type: EnvironmentType;
  status: 'online' | 'offline' | 'error';
  profiles: string[];
  lastPing: string;
}

export interface TabGroup {
  id: string;
  environmentId: string;
  name: string;
  status: 'available' | 'rented';
  rentedByTask?: string;
}

export interface Skill {
  id: string;
  name: string;
  platform: string;
  version: string;
  actions: string[];
  docUrl?: string;
  description?: string;
}

export interface Task {
  id: string
  name: string
  skillId: string
  tabGroupId: string
  status: 'running' | 'completed' | 'failed' | 'idle'
  logs: string[]
  createdAt: string
}
