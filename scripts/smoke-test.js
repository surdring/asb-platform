import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { SkillRegistry } from '../src/skills/skill-registry.js';
import { LeaseManager } from '../src/broker/lease-manager.js';

const registry = new SkillRegistry(fileURLToPath(new URL('../skills', import.meta.url)));
await registry.loadAll();
assert.ok(registry.get('xiaohongshu.feed.v1'));

const leases = new LeaseManager({ defaultTtlMs: 1000 });
const lease = leases.create({
  agentId: 'agent-a',
  environmentId: 'env-a',
  tab: { id: 'tab-a', groupId: 'group-a', sessionId: 'session-a' }
});

assert.equal(leases.get(lease.id).status, 'active');
assert.equal(leases.release(lease.id).status, 'released');

console.log('smoke test passed');
