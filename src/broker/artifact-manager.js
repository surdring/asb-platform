import crypto from 'node:crypto'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'

export class ArtifactManager {
  constructor({ store, config }) {
    this.store = store
    this.artifactsDir = config.artifactsDir || path.join(config.dataDir, 'artifacts')
  }

  async ensureDir() {
    await mkdir(this.artifactsDir, { recursive: true })
  }

  async writeArtifact({ leaseId, tabId, kind, mimeType, data, base64 }) {
    await this.ensureDir()
    const id = `artifact_${crypto.randomUUID()}`
    const dateDir = new Date().toISOString().slice(0, 10)
    const leaseDir = path.join(this.artifactsDir, dateDir, leaseId || 'orphan')
    await mkdir(leaseDir, { recursive: true })

    const ext = kind === 'html' ? 'html'
      : kind === 'screenshot' ? (mimeType?.includes('png') ? 'png' : 'jpg')
      : 'json'
    const fileName = `${id}.${ext}`
    const filePath = path.join(leaseDir, fileName)

    const content = base64 ? Buffer.from(base64, 'base64') : Buffer.from(String(data || ''))
    await writeFile(filePath, content)

    const artifact = {
      id,
      leaseId: leaseId || null,
      tabId: tabId || null,
      kind,
      path: filePath,
      mimeType: mimeType || 'application/json',
      bytes: content.length,
      createdAt: new Date().toISOString()
    }

    this.store?.saveArtifact(artifact)
    return artifact
  }

  async readArtifact(id) {
    const artifact = this.store?.getArtifact(id)
    if (!artifact) return null
    const data = await readFile(artifact.path).catch(() => null)
    return { ...artifact, data: data?.toString('utf8') || null }
  }

  async downloadArtifact(id) {
    const artifact = this.store?.getArtifact(id)
    if (!artifact) return null
    try {
      const data = await readFile(artifact.path)
      return { artifact, data }
    } catch {
      return null
    }
  }

  async deleteArtifact(id) {
    const artifact = this.store?.getArtifact(id)
    if (!artifact) return false
    await unlink(artifact.path).catch(() => {})
    this.store?.deleteArtifact(id)
    return true
  }

  list(leaseId, kind, limit) {
    return this.store?.listArtifacts({ leaseId, kind, limit }) || []
  }

  async cleanup({ olderThanDays = 7, limit = 1000, dryRun = true } = {}) {
    const before = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
    const candidates = this.store?.listArtifacts({ before, limit }) || []
    let bytes = 0
    const deleted = []

    for (const artifact of candidates) {
      bytes += Number(artifact.bytes || 0)
      if (!dryRun) {
        await unlink(artifact.path).catch(() => {})
        this.store?.deleteArtifact(artifact.id)
        deleted.push(artifact.id)
      }
    }

    return { ok: true, dryRun, before, candidates: candidates.length, bytes, deleted }
  }
}