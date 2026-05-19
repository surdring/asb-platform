import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export class SkillRegistry {
  constructor(skillsDir, { store, logger } = {}) {
    this.skillsDir = skillsDir;
    this.store = store;
    this.logger = logger;
    this.skills = new Map();
  }

  async loadAll() {
    this.skills.clear();
    const entries = await readdir(this.skillsDir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(this.skillsDir, entry.name, 'manifest.json');
      if (!await exists(manifestPath)) continue;
      await this.loadFromFile(manifestPath);
    }

    return this.list();
  }

  async loadFromFile(manifestPath) {
    const raw = await readFile(manifestPath, 'utf8');
    const skill = JSON.parse(raw);
    validateSkill(skill, manifestPath);
    skill.baseDir = path.dirname(manifestPath);
    skill.loadedAt = new Date().toISOString();
    this.skills.set(skill.id, skill);
    this.store?.saveSkill(skill);
    this.logger?.info('Skill loaded', {
      id: skill.id,
      platform: skill.platform,
      version: skill.version
    }, 'skill.loaded');
    return skill;
  }

  list() {
    return [...this.skills.values()].map(({ baseDir, ...skill }) => skill);
  }

  get(id) {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);
    return skill;
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function validateSkill(skill, source) {
  for (const field of ['id', 'name', 'platform', 'version']) {
    if (!skill[field]) throw new Error(`Skill ${source} missing required field: ${field}`);
  }
  if (!skill.perception || typeof skill.perception !== 'object') {
    throw new Error(`Skill ${source} must define perception selectors`);
  }
  if (!skill.actions || typeof skill.actions !== 'object') {
    throw new Error(`Skill ${source} must define actions`);
  }
}
