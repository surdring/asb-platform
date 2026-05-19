import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

export class SQLiteStore {
  constructor(databasePath) {
    this.databasePath = databasePath
    this.closed = false
    this.db = new DatabaseSync(databasePath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.#migrate()
  }

  saveEnvironment(summary, definition = {}) {
    this.db.prepare(`
      INSERT INTO environments (id, name, mode, status, endpoint, profile_id, shared_profile, definition_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        mode = excluded.mode,
        status = excluded.status,
        endpoint = excluded.endpoint,
        profile_id = excluded.profile_id,
        shared_profile = excluded.shared_profile,
        definition_json = excluded.definition_json,
        updated_at = excluded.updated_at
    `).run(
      summary.id,
      summary.name || summary.id,
      summary.mode,
      summary.status,
      summary.endpoint || null,
      summary.profileId || null,
      summary.sharedProfile === false ? 0 : 1,
      JSON.stringify(definition),
      summary.updatedAt || new Date().toISOString()
    )
  }

  loadEnvironmentDefinitions() {
    return this.db.prepare('SELECT definition_json FROM environments ORDER BY created_at ASC').all()
      .map((row) => JSON.parse(row.definition_json))
  }

  saveSkill(skill) {
    this.db.prepare(`
      INSERT INTO skills (id, name, platform, version, manifest_json, loaded_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        platform = excluded.platform,
        version = excluded.version,
        manifest_json = excluded.manifest_json,
        loaded_at = excluded.loaded_at
    `).run(skill.id, skill.name, skill.platform, skill.version, JSON.stringify(stripRuntimeFields(skill)), skill.loadedAt)
  }

  saveLease(lease) {
    this.db.prepare(`
      INSERT INTO leases (
        id, agent_id, environment_id, tab_id, group_id, session_id, browser_context_id,
        url, websocket_debugger_url, status, metadata_json, created_at, expires_at, released_at, expired_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        url = excluded.url,
        websocket_debugger_url = excluded.websocket_debugger_url,
        status = excluded.status,
        expires_at = excluded.expires_at,
        released_at = excluded.released_at,
        expired_at = excluded.expired_at,
        metadata_json = excluded.metadata_json
    `).run(
      lease.id,
      lease.agentId,
      lease.environmentId,
      lease.tabId,
      lease.groupId,
      lease.sessionId,
      lease.browserContextId || null,
      lease.url || null,
      lease.webSocketDebuggerUrl || null,
      lease.status,
      JSON.stringify(lease.metadata || {}),
      lease.createdAt,
      lease.expiresAt,
      lease.releasedAt || null,
      lease.expiredAt || null
    )
  }

  createTask({ leaseId, skillId, action, input, name }) {
    const id = `task_${cryptoRandom()}`
    const startedAt = new Date().toISOString()
    const taskName = name || `${skillId}:${action}`
    this.db.prepare(`
      INSERT INTO tasks (id, name, lease_id, skill_id, action, input_json, status, started_at)
      VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
    `).run(id, taskName, leaseId, skillId, action, JSON.stringify(input || {}), startedAt)
    return { id, name: taskName, startedAt }
  }

  completeTask(taskId, result) {
    this.db.prepare(`
      UPDATE tasks
      SET status = 'completed', result_json = ?, completed_at = ?
      WHERE id = ?
    `).run(JSON.stringify(result), new Date().toISOString(), taskId)
  }

  failTask(taskId, error) {
    this.db.prepare(`
      UPDATE tasks
      SET status = 'failed', error = ?, completed_at = ?
      WHERE id = ?
    `).run(error.message, new Date().toISOString(), taskId)
  }

  saveCollectedItems({ taskId, skillId, platform, parsed }) {
    const items = normalizeCollectedItems(parsed)
    const insert = this.db.prepare(`
      INSERT INTO collected_items (task_id, skill_id, platform, item_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    const createdAt = new Date().toISOString()
    for (const item of items) {
      insert.run(taskId, skillId, platform, JSON.stringify(item), createdAt)
    }
    return items.length
  }

  saveLog({ level, message, event, payload, createdAt = new Date().toISOString() }) {
    if (this.closed) return
    this.db.prepare(`
      INSERT INTO logs (level, message, event, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(level, message, event || null, JSON.stringify(payload || {}), createdAt)
  }

  listLogs(limit = 100) {
    return this.db.prepare(`
      SELECT id, level, message, event, payload_json, created_at
      FROM logs
      ORDER BY id DESC
      LIMIT ?
    `).all(limit).map(parsePayload)
  }

  listTasks(limit = 100) {
    return this.db.prepare(`
      SELECT id, name, lease_id, skill_id, action, input_json, result_json, status, error, started_at, completed_at
      FROM tasks
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit).map(parseTask)
  }

  getTask(id) {
    const row = this.db.prepare(`
      SELECT id, name, lease_id, skill_id, action, input_json, result_json, status, error, started_at, completed_at
      FROM tasks
      WHERE id = ?
    `).get(id)
    if (!row) throw new Error(`Task not found: ${id}`)
    return parseTask(row)
  }

  listTaskLogs(taskId, limit = 100) {
    return this.listLogs(Math.max(limit, 500))
      .filter((log) => log.payload?.taskId === taskId)
      .slice(0, limit)
  }

  listCollectedItems(limit = 100) {
    return this.db.prepare(`
      SELECT id, task_id, skill_id, platform, item_json, created_at
      FROM collected_items
      ORDER BY id DESC
      LIMIT ?
    `).all(limit).map((row) => ({
      id: row.id,
      taskId: row.task_id,
      skillId: row.skill_id,
      platform: row.platform,
      item: JSON.parse(row.item_json),
      createdAt: row.created_at
    }))
  }

  saveArtifact(artifact) {
    this.db.prepare(`
      INSERT INTO artifacts (id, lease_id, tab_id, kind, path, mime_type, bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      artifact.id,
      artifact.leaseId || null,
      artifact.tabId || null,
      artifact.kind,
      artifact.path,
      artifact.mimeType || null,
      artifact.bytes || null,
      artifact.createdAt
    )
  }

  getArtifact(id) {
    const row = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id)
    return row ? mapArtifact(row) : null
  }

  listArtifacts({ leaseId, kind, limit = 100, before } = {}) {
    const where = []
    const args = []
    if (leaseId) { where.push('lease_id = ?'); args.push(leaseId) }
    if (kind) { where.push('kind = ?'); args.push(kind) }
    if (before) { where.push('created_at < ?'); args.push(before) }
    const capped = Math.max(1, Math.min(1000, Number(limit) || 100))
    const sql = `SELECT * FROM artifacts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`
    return this.db.prepare(sql).all(...args, capped).map(mapArtifact)
  }

  deleteArtifact(id) {
    this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(id)
  }

  status() {
    const count = (table) => this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
    return {
      path: path.resolve(this.databasePath),
      environments: count('environments'),
      skills: count('skills'),
      leases: count('leases'),
      tasks: count('tasks'),
      collectedItems: count('collected_items'),
      logs: count('logs'),
      artifacts: count('artifacts')
    }
  }

  close() {
    this.closed = true
    this.db.close()
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS environments (
        id TEXT PRIMARY KEY,
        name TEXT,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        endpoint TEXT,
        profile_id TEXT,
        shared_profile INTEGER NOT NULL DEFAULT 1,
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        platform TEXT NOT NULL,
        version TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        loaded_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS leases (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        tab_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        browser_context_id TEXT,
        url TEXT,
        websocket_debugger_url TEXT,
        status TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        released_at TEXT,
        expired_at TEXT
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT,
        lease_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        action TEXT NOT NULL,
        input_json TEXT NOT NULL,
        result_json TEXT,
        status TEXT NOT NULL,
        error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS collected_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        item_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        event TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        lease_id TEXT,
        tab_id TEXT,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        mime_type TEXT,
        bytes INTEGER,
        created_at TEXT NOT NULL
      );
    `)
    this.#ensureColumn('environments', 'name', 'TEXT')
    this.#ensureColumn('leases', 'url', 'TEXT')
    this.#ensureColumn('leases', 'websocket_debugger_url', 'TEXT')
    this.#ensureColumn('tasks', 'name', 'TEXT')
  }

  #ensureColumn(table, column, type) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name)
    if (!columns.includes(column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    }
  }
}

function normalizeCollectedItems(parsed) {
  if (!parsed) return []
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed.items)) return parsed.items
  if (Array.isArray(parsed.comments)) return parsed.comments.map((text) => ({ text }))
  return [parsed]
}

function parsePayload(row) {
  return {
    id: row.id,
    level: row.level,
    message: row.message,
    event: row.event,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  }
}

function parseTask(row) {
  return {
    id: row.id,
    name: row.name || `${row.skill_id}:${row.action}`,
    leaseId: row.lease_id,
    skillId: row.skill_id,
    action: row.action,
    input: JSON.parse(row.input_json),
    result: row.result_json ? JSON.parse(row.result_json) : null,
    status: row.status,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at
  }
}

function stripRuntimeFields(skill) {
  const { baseDir, loadedAt, ...manifest } = skill
  return manifest
}

function mapArtifact(row) {
  return {
    id: row.id,
    leaseId: row.lease_id,
    tabId: row.tab_id,
    kind: row.kind,
    path: row.path,
    mimeType: row.mime_type,
    bytes: row.bytes,
    createdAt: row.created_at
  }
}

function cryptoRandom() {
  return globalThis.crypto.randomUUID()
}
