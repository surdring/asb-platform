import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/broker/http-server.js';
import { BrowserEnvironmentManager } from '../src/browser/environment-manager.js';
import { LeaseManager } from '../src/broker/lease-manager.js';
import { SkillRegistry } from '../src/skills/skill-registry.js';
import { TaskRunner } from '../src/broker/task-runner.js';

test('broker exposes health and loaded skills over HTTP', async () => {
  const config = {
    host: '127.0.0.1',
    port: 0,
    browserStateDir: fileURLToPath(new URL('../data/browser-state-test', import.meta.url)),
    requestBodyLimitBytes: 1024 * 1024,
    defaultLeaseTtlMs: 1000
  };
  const environmentManager = new BrowserEnvironmentManager(config);
  const leaseManager = new LeaseManager({ defaultTtlMs: config.defaultLeaseTtlMs });
  const skillRegistry = new SkillRegistry(fileURLToPath(new URL('../skills', import.meta.url)));
  await skillRegistry.loadAll();
  const taskRunner = new TaskRunner({ environmentManager, leaseManager, skillRegistry });
  const server = createServer({ config, environmentManager, leaseManager, skillRegistry, taskRunner });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.skills, 2);

    const skills = await fetch(`http://127.0.0.1:${port}/skills`).then((response) => response.json());
    assert.ok(skills.some((skill) => skill.id === 'xiaohongshu.feed.v1'));
    assert.ok(skills.some((skill) => skill.id === 'demo.market.v1'));

    const env = await fetch(`http://127.0.0.1:${port}/environments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'route-test', mode: 'native', cdpEndpoint: 'http://127.0.0.1:9' })
    }).then((response) => response.json());
    assert.equal(env.id, 'route-test');

    const stop = await fetch(`http://127.0.0.1:${port}/environments/route-test/stop`, {
      method: 'POST'
    }).then((response) => response.json());
    assert.equal(stop.id, 'route-test');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
