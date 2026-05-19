import net from 'node:net'
import http from 'node:http'
import path from 'node:path'
import { ensureRuntimeDirs, config as baseConfig } from '../src/config.js'
import { SQLiteStore } from '../src/store/sqlite-store.js'
import { RuntimeLogger } from '../src/store/logger.js'
import { BrowserEnvironmentManager } from '../src/browser/environment-manager.js'
import { LeaseManager } from '../src/broker/lease-manager.js'
import { SkillRegistry } from '../src/skills/skill-registry.js'
import { TaskRunner } from '../src/broker/task-runner.js'
import { createServer } from '../src/broker/http-server.js'

await ensureRuntimeDirs()

const brokerPort = await freePort()
const chromePort = await freePort()
const config = {
  ...baseConfig,
  port: brokerPort
}
const store = new SQLiteStore(config.databasePath)
const logger = new RuntimeLogger({ logsDir: config.logsDir, store })
const environmentManager = new BrowserEnvironmentManager(config, { store, logger })
environmentManager.loadPersisted()
const leaseManager = new LeaseManager({ defaultTtlMs: config.defaultLeaseTtlMs, store, logger })
const skillRegistry = new SkillRegistry(config.skillsDir, { store, logger })
await skillRegistry.loadAll()
const taskRunner = new TaskRunner({ environmentManager, leaseManager, skillRegistry, store, logger })
const server = createServer({ config, environmentManager, leaseManager, skillRegistry, taskRunner, store, logger })

await new Promise((resolve) => server.listen(brokerPort, config.host, resolve))
const baseUrl = `http://${config.host}:${brokerPort}`
const envId = `demo-native-${Date.now()}`
const profileId = `demo-shared-profile-${Date.now()}`
const demoPage = await startDemoPageServer()
let lease

try {
  await post(`${baseUrl}/environments`, {
    id: envId,
    mode: 'native',
    profileId,
    remoteDebuggingPort: chromePort,
    headless: true
  })
  await post(`${baseUrl}/environments/${envId}/start`, {})

  lease = await post(`${baseUrl}/leases`, {
    environmentId: envId,
    agentId: 'demo-agent',
    url: demoPage.url,
    ttlMs: 5 * 60 * 1000,
    metadata: {
      purpose: 'complete-runnable-demo'
    }
  })

  const collectResult = await post(`${baseUrl}/tasks/run`, {
    leaseId: lease.id,
    skillId: 'demo.market.v1',
    action: 'collectProducts',
    input: {}
  })

  const cartResult = await post(`${baseUrl}/tasks/run`, {
    leaseId: lease.id,
    skillId: 'demo.market.v1',
    action: 'addFirstToCart',
    input: {}
  })

  await fetch(`${baseUrl}/leases/${lease.id}?closeTab=true`, { method: 'DELETE' })
  await post(`${baseUrl}/environments/${envId}/stop`, {})

  const dbStatus = await get(`${baseUrl}/db/status`)
  const items = await get(`${baseUrl}/collected-items?limit=10`)
  const logs = await get(`${baseUrl}/logs?limit=5`)

  console.error(JSON.stringify({
    ok: true,
    brokerUrl: baseUrl,
    databasePath: path.resolve(config.databasePath),
    logFile: path.join(config.logsDir, 'asb.log'),
    collectTaskId: collectResult.taskId,
    cartTaskId: cartResult.taskId,
    collectedProducts: collectResult.results.parsed.items.length,
    cartItems: cartResult.results.parsed.items.length,
    dbStatus,
    latestItems: items,
    latestLogs: logs
  }, null, 2))
} catch (error) {
  await logger.error('Complete demo failed', { error: error.message }, 'demo.failed')
  throw error
} finally {
  if (lease?.id) {
    await fetch(`${baseUrl}/leases/${lease.id}?closeTab=true`, { method: 'DELETE' }).catch(() => {})
  }
  await environmentManager.stopAll()
  await demoPage.close()
  await new Promise((resolve) => server.close(resolve))
  store.close()
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }
  return payload
}

async function get(url) {
  const response = await fetch(url)
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }
  return payload
}

async function startDemoPageServer() {
  const port = await freePort()
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(demoHtml())
  })
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(resolve))
  }
}

function demoHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>ASB Demo Market</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; }
      main { display: grid; gap: 16px; max-width: 760px; }
      article { border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; }
      button { padding: 8px 12px; }
    </style>
  </head>
  <body>
    <main>
      <article data-product-card data-id="sku-1001">
        <h2 data-title>Portable Coffee Kit</h2>
        <strong data-price>$39.90</strong>
        <span data-rating>4.8</span>
        <button data-add-cart>add</button>
      </article>
      <article data-product-card data-id="sku-1002">
        <h2 data-title>Desk Light Pro</h2>
        <strong data-price>$58.00</strong>
        <span data-rating>4.6</span>
        <button data-add-cart>add</button>
      </article>
      <article data-product-card data-id="sku-1003">
        <h2 data-title>Travel Keyboard</h2>
        <strong data-price>$72.50</strong>
        <span data-rating>4.9</span>
        <button data-add-cart>add</button>
      </article>
    </main>
    <script>
      localStorage.setItem('demo-login', JSON.stringify({ user: 'shared-profile-user', ts: Date.now() }));
      document.querySelector('[data-add-cart]').addEventListener('click', () => {
        localStorage.setItem('demo-cart', JSON.stringify([{ id: 'sku-1001', quantity: 1 }]));
      });
    </script>
  </body>
</html>`
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}
