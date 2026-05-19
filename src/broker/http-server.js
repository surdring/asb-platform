import http from 'node:http'
import path from 'node:path'

import { probeSession } from './session-prober.js'

export function createServer({ config, environmentManager, leaseManager, skillRegistry, taskRunner, store, logger, artifactManager }) {
  const events = new EventHub();

  return http.createServer(async (req, res) => {
    try {
      setCors(res);
      if (req.method === 'OPTIONS') return send(res, 204);

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const route = `${req.method} ${url.pathname}`;

      if (route === 'GET /health') {
        return json(res, {
          ok: true,
          service: 'asb-broker',
          database: store?.status(),
          environments: environmentManager.list().length,
          skills: skillRegistry.list().length
        });
      }

      if (route === 'GET /db/status') {
        return json(res, store.status());
      }

      if (route === 'GET /logs') {
        return json(res, store.listLogs(numberParam(url, 'limit', 100)));
      }

      if (route === 'GET /tasks') {
        return json(res, store.listTasks(numberParam(url, 'limit', 100)));
      }

      const taskDetail = match(url.pathname, /^\/tasks\/([^/]+)$/);
      if (req.method === 'GET' && taskDetail) {
        return json(res, store.getTask(taskDetail[0]));
      }

      const taskLogs = match(url.pathname, /^\/tasks\/([^/]+)\/logs$/);
      if (req.method === 'GET' && taskLogs) {
        return json(res, store.listTaskLogs(taskLogs[0], numberParam(url, 'limit', 100)));
      }

      if (route === 'GET /collected-items') {
        return json(res, store.listCollectedItems(numberParam(url, 'limit', 100)));
      }

      if (route === 'GET /openapi.json') {
        return json(res, openApiSpec(config));
      }

      if (route === 'GET /events') {
        return events.subscribe(req, res);
      }

      if (route === 'GET /environments') {
        return json(res, environmentManager.list());
      }

      const envDetail = match(url.pathname, /^\/environments\/([^/]+)$/);
      if (req.method === 'GET' && envDetail) {
        return json(res, environmentManager.get(envDetail[0]).detail());
      }

      if (route === 'POST /environments') {
        const body = await readJson(req, config.requestBodyLimitBytes);
        const env = environmentManager.create(body);
        events.publish('environment.created', env);
        return json(res, env, 201);
      }

      const envStart = match(url.pathname, /^\/environments\/([^/]+)\/start$/);
      if (req.method === 'POST' && envStart) {
        const env = await environmentManager.start(envStart[0]);
        events.publish('environment.started', env);
        return json(res, env);
      }

      const envStop = match(url.pathname, /^\/environments\/([^/]+)\/stop$/);
      if (req.method === 'POST' && envStop) {
        const env = await environmentManager.stop(envStop[0]);
        events.publish('environment.stopped', env);
        return json(res, env);
      }

      if (route === 'GET /leases') {
        return json(res, leaseManager.list({
          agentId: url.searchParams.get('agentId'),
          environmentId: url.searchParams.get('environmentId')
        }));
      }

      if (route === 'POST /leases') {
        const body = await readJson(req, config.requestBodyLimitBytes);
        const env = environmentManager.get(required(body.environmentId, 'environmentId'));
        const tab = await env.createTab({
          url: body.url,
          isolatedContext: body.isolatedContext,
          groupId: body.groupId
        });
        const lease = leaseManager.create({
          agentId: required(body.agentId, 'agentId'),
          environmentId: env.id,
          tab,
          ttlMs: body.ttlMs,
          metadata: body.metadata
        });
        events.publish('lease.created', lease);
        return json(res, lease, 201);
      }

      const leaseRenew = match(url.pathname, /^\/leases\/([^/]+)\/renew$/);
      if (req.method === 'POST' && leaseRenew) {
        const body = await readJson(req, config.requestBodyLimitBytes).catch(() => ({}));
        const lease = leaseManager.renew(leaseRenew[0], body.ttlMs);
        events.publish('lease.renewed', lease);
        return json(res, lease);
      }

      const leaseDelete = match(url.pathname, /^\/leases\/([^/]+)$/);
      if (req.method === 'DELETE' && leaseDelete) {
        const lease = leaseManager.release(leaseDelete[0]);
        if (lease && url.searchParams.get('closeTab') === 'true') {
          await environmentManager.get(lease.environmentId).closeTab(lease.tabId);
        }
        events.publish('lease.released', lease);
        return json(res, lease || { id: leaseDelete[0], status: 'not_found' });
      }

      if (route === 'GET /skills') {
        return json(res, skillRegistry.list());
      }

      const skillDetail = match(url.pathname, /^\/skills\/([^/]+)$/);
      if (req.method === 'GET' && skillDetail) {
        const { baseDir, ...skill } = skillRegistry.get(skillDetail[0]);
        return json(res, skill);
      }

      if (route === 'POST /skills/reload') {
        const skills = await skillRegistry.loadAll();
        events.publish('skills.reloaded', { count: skills.length });
        return json(res, skills);
      }

      if (route === 'POST /sessions/probe') {
        const body = await readJson(req, config.requestBodyLimitBytes)
        const platform = required(body.platform, 'platform')
        const running = environmentManager.list().find(e => e.status === 'running')
        if (!running) throw Object.assign(new Error('No running browser environment'), { statusCode: 503 })

        const env = environmentManager.get(running.id)
        const targetUrl = body.url || `https://www.${platform}.com/`
        const tab = await env.createTab({ url: targetUrl })
        const lease = leaseManager.create({
          agentId: 'session-prober',
          environmentId: env.id,
          tab,
          ttlMs: 2 * 60 * 1000,
          metadata: { type: 'session-probe', platform }
        })

        try {
          const result = await probeSession({
            env,
            tab,
            platform,
            url: targetUrl,
            includeCookies: Boolean(body.includeCookies),
            includeStorageState: Boolean(body.includeStorageState)
          })
          events.publish('session.probe.completed', { platform, connected: result.connected })
          return json(res, result)
        } finally {
          if (!body.keepOpen) {
            leaseManager.release(lease.id)
            await env.closeTab(tab.id).catch(() => {})
          }
        }
      }

      if (route === 'POST /tasks/run') {
        const body = await readJson(req, config.requestBodyLimitBytes);
        const result = await taskRunner.run({
          leaseId: required(body.leaseId, 'leaseId'),
          skillId: required(body.skillId, 'skillId'),
          action: required(body.action, 'action'),
          input: body.input || {},
          name: body.name
        });
        events.publish('task.completed', result);
        return json(res, result);
      }

      if (route === 'GET /artifacts') {
        return json(res, {
          artifacts: artifactManager.list(
            url.searchParams.get('leaseId'),
            url.searchParams.get('kind'),
            numberParam(url, 'limit', 100)
          )
        })
      }

      const artifactDetail = match(url.pathname, /^\/artifacts\/([^/]+)$/)
      if (req.method === 'GET' && artifactDetail) {
        const artifact = artifactManager.store?.getArtifact(artifactDetail[0])
        if (!artifact) return json(res, { error: 'Artifact not found' }, 404)
        return json(res, artifact)
      }

      const artifactDownload = match(url.pathname, /^\/artifacts\/([^/]+)\/download$/)
      if (req.method === 'GET' && artifactDownload) {
        const result = await artifactManager.downloadArtifact(artifactDownload[0])
        if (!result) return json(res, { error: 'Artifact not found' }, 404)
        res.writeHead(200, {
          'Content-Type': result.artifact.mimeType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${path.basename(result.artifact.path)}"`,
          'Content-Length': result.data.length
        })
        res.end(result.data)
        return
      }

      const artifactDelete = match(url.pathname, /^\/artifacts\/([^/]+)$/)
      if (req.method === 'DELETE' && artifactDelete) {
        const deleted = await artifactManager.deleteArtifact(artifactDelete[0])
        if (!deleted) return json(res, { error: 'Artifact not found' }, 404)
        return json(res, { ok: true, deleted: artifactDelete[0] })
      }

      if (route === 'POST /artifacts/cleanup') {
        const body = await readJson(req, config.requestBodyLimitBytes).catch(() => ({}))
        const result = await artifactManager.cleanup({
          olderThanDays: Number(body.olderThanDays || 7),
          limit: Number(body.limit || 1000),
          dryRun: body.dryRun !== false
        })
        return json(res, result)
      }

      if (route === 'GET /tab-audit') {
        const results = []
        for (const env of environmentManager.list()) {
          if (env.status === 'running') {
            const audit = await environmentManager.auditTabs(env.id).catch(() => null)
            if (audit) results.push({ environmentId: env.id, ...audit })
          }
        }
        return json(res, results)
      }

      if (route === 'POST /tab-audit/reconcile') {
        const reconciled = []
        for (const env of environmentManager.list()) {
          if (env.status === 'running') {
            const audit = await environmentManager.auditTabs(env.id).catch(() => null)
            if (audit?.trackedMissingTabs?.length) {
              for (const tab of audit.trackedMissingTabs) {
                await environmentManager.get(env.id).tabs?.delete(tab.id)
                reconciled.push({ environmentId: env.id, tabId: tab.id })
              }
            }
          }
        }
        return json(res, { ok: true, reconciled })
      }

      return json(res, { error: 'Not found', path: url.pathname }, 404);
    } catch (error) {
      await logger?.error('HTTP request failed', {
        method: req.method,
        url: req.url,
        error: error.message
      }, 'http.failed');
      return json(res, { error: error.message }, statusFor(error));
    }
  });
}

class EventHub {
  constructor() {
    this.clients = new Set();
  }

  subscribe(_req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  publish(type, payload) {
    const event = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      client.write(event);
    }
  }
}

async function readJson(req, limitBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function json(res, body, statusCode = 200) {
  return send(res, statusCode, JSON.stringify(body, null, 2), {
    'Content-Type': 'application/json; charset=utf-8'
  });
}

function send(res, statusCode, body = '', headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization');
}

function match(value, pattern) {
  const result = value.match(pattern);
  return result ? result.slice(1).map(decodeURIComponent) : undefined;
}

function required(value, name) {
  if (value === undefined || value === null || value === '') {
    throw Object.assign(new Error(`${name} is required`), { statusCode: 400 });
  }
  return value;
}

function numberParam(url, name, fallback) {
  const value = Number(url.searchParams.get(name) || fallback);
  return Number.isFinite(value) ? Math.max(1, Math.min(value, 1000)) : fallback;
}

function statusFor(error) {
  if (error.statusCode) return error.statusCode;
  if (/not found/i.test(error.message)) return 404;
  if (/required|missing|unsupported|invalid/i.test(error.message)) return 400;
  return 500;
}

function openApiSpec(config) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ASB Broker API',
      version: '0.1.0',
      description: '统一 API，用于管理原生/Docker 浏览器环境、标签页租用、共享配置文件和平台技能。'
    },
    servers: [{ url: `http://${config.host}:${config.port}` }],
    paths: {
      '/health': { get: { summary: '代理健康检查' } },
      '/db/status': { get: { summary: '查看 SQLite 持久化状态和各表记录数' } },
      '/logs': { get: { summary: '查看结构化运行日志' } },
      '/tasks': { get: { summary: '查看已持久化的任务历史' } },
      '/collected-items': { get: { summary: '查看已持久化的采集结果' } },
      '/events': { get: { summary: '服务器推送事件总线，用于代理生命周期和任务事件' } },
      '/environments': {
        get: { summary: '列出浏览器环境' },
        post: { summary: '创建原生、Docker 或仅附加模式的浏览器环境' }
      },
      '/environments/{id}/start': { post: { summary: '启动或附加到环境' } },
      '/environments/{id}/stop': { post: { summary: '停止受管环境' } },
      '/leases': {
        get: { summary: '列出活跃和历史的标签页租用' },
        post: { summary: '为代理任务租用浏览器标签页' }
      },
      '/leases/{id}/renew': { post: { summary: '延长标签页租用的 TTL' } },
      '/leases/{id}': { delete: { summary: '释放标签页租用；传入 closeTab=true 可关闭标签页' } },
      '/skills': { get: { summary: '列出已加载的平台技能包' } },
      '/skills/reload': { post: { summary: '从磁盘重新加载技能包' } },
      '/tasks/run': { post: { summary: '在租用的标签页上执行指定的技能操作' } },
      '/sessions/probe': { post: { summary: '探测平台会话状态，检测登录/验证/挑战等页面信号' } }
    }
  };
}
