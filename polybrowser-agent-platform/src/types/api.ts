export interface EnvironmentSummary {
  id: string
  name: string
  mode: 'native' | 'docker'
  status: 'running' | 'stopped'
  endpoint: string
  profileId?: string
  sharedProfile: boolean
  tabCount: number
  updatedAt: string
  vncUrl?: string
}

export interface EnvironmentTab {
  id: string
  groupId: string
  url: string
  webSocketDebuggerUrl: string
  browserContextId?: string
  createdAt: string
}

export interface EnvironmentDetail extends EnvironmentSummary {
  tabs: EnvironmentTab[]
}

export interface Lease {
  id: string
  agentId: string
  environmentId: string
  tabId: string
  groupId: string
  sessionId: string
  browserContextId?: string
  url?: string
  webSocketDebuggerUrl?: string
  status: 'active' | 'released' | 'expired'
  metadata: Record<string, unknown>
  createdAt: string
  expiresAt: string
  releasedAt?: string
  expiredAt?: string
}

export interface Skill {
  id: string
  name: string
  platform: string
  version: string
  perception: Record<string, { selector: string }>
  actions: Record<string, { steps: Step[]; parser?: string }>
  parsers?: Record<string, { type: string; source?: string; fields?: Record<string, string> }>
  loadedAt: string
}

export interface Step {
  type: string
  selector?: string
  name?: string
  url?: string
  text?: string
  expression?: string
  attribute?: string
  many?: boolean
  x?: number
  y?: number
  ms?: number
  waitMs?: number
  timeoutMs?: number
}

export interface Artifact {
  id: string
  leaseId?: string
  tabId?: string
  kind: string
  path: string
  mimeType?: string
  bytes?: number
  createdAt: string
}

export interface Task {
  id: string
  name: string
  leaseId: string
  skillId: string
  action: string
  input: Record<string, unknown>
  result: Record<string, unknown> | null
  status: 'running' | 'completed' | 'failed'
  error?: string
  startedAt: string
  completedAt?: string
  artifacts?: Artifact[]
}

export interface TaskRunRequest {
  leaseId: string
  skillId: string
  action: string
  input?: Record<string, unknown>
  name?: string
}

export interface TaskRunResult {
  taskId: string
  leaseId: string
  skillId: string
  action: string
  results: Record<string, unknown>
  completedAt: string
}

export interface CollectedItem {
  id: number
  taskId: string
  skillId: string
  platform: string
  item: Record<string, unknown>
  createdAt: string
}

export interface LogEntry {
  id: number
  level: 'info' | 'error'
  message: string
  event?: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface HealthResponse {
  ok: boolean
  service: string
  database: DbStatus
  environments: number
  skills: number
}

export interface DbStatus {
  path: string
  environments: number
  skills: number
  leases: number
  tasks: number
  collectedItems: number
  logs: number
}

export interface CreateEnvironmentRequest {
  id?: string
  name?: string
  mode?: 'native' | 'docker'
  profileId?: string
  headless?: boolean
  remoteDebuggingPort?: number
  cdpEndpoint?: string
  attachOnly?: boolean
  chromePath?: string
  image?: string
}

export interface CreateLeaseRequest {
  agentId: string
  environmentId: string
  url?: string
  ttlMs?: number
  metadata?: Record<string, unknown>
}