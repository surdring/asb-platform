import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LeaseManager } from '../src/broker/lease-manager.js';
import { SkillRegistry } from '../src/skills/skill-registry.js';

test('skill registry loads platform manifests', async () => {
  const registry = new SkillRegistry(fileURLToPath(new URL('../skills', import.meta.url)));
  const skills = await registry.loadAll();
  assert.equal(skills.length, 2);
  assert.equal(registry.get('xiaohongshu.feed.v1').platform, 'xiaohongshu');
  assert.equal(registry.get('demo.market.v1').platform, 'demo-market');
});

test('lease manager creates, renews and releases tab leases', () => {
  const manager = new LeaseManager({ defaultTtlMs: 1000 });
  const lease = manager.create({
    agentId: 'codex',
    environmentId: 'local',
    tab: { id: 'tab-1', groupId: 'group-1', sessionId: 'session-1' }
  });

  assert.equal(lease.status, 'active');
  assert.ok(Date.parse(lease.expiresAt) > Date.now());
  assert.equal(manager.renew(lease.id, 5000).id, lease.id);
  assert.equal(manager.release(lease.id).status, 'released');
});
