import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { findChromeExecutable } from './chrome-paths.js';
import { CdpClient, waitForCdp, resolveBrowserWebSocketUrl } from './cdp-client.js';

const DEFAULT_CHROME_FLAGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--remote-allow-origins=*',
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-gpu-compositing',
  '--disable-accelerated-2d-canvas',
  '--disable-accelerated-video-decode',
  '--disable-dev-shm-usage',
  '--disable-background-networking',
  '--disable-features=Translate,AutomationControlled,VizDisplayCompositor,UseSkiaRenderer,CanvasOopRasterization'
];

export class BrowserEnvironmentManager {
  constructor(config, { store, logger } = {}) {
    this.config = config;
    this.store = store;
    this.logger = logger;
    this.environments = new Map();
  }

  loadPersisted() {
    for (const definition of this.store?.loadEnvironmentDefinitions() || []) {
      if (definition.id && !this.environments.has(definition.id)) {
        const env = definition.mode === 'docker'
          ? new DockerBrowserEnvironment(definition.id, definition, this.config, this.logger)
          : new NativeBrowserEnvironment(definition.id, definition, this.config, this.logger);
        this.environments.set(definition.id, env);
      }
    }
  }

  create(definition = {}) {
    const id = definition.id || `env_${crypto.randomUUID()}`;
    if (this.environments.has(id)) {
      throw new Error(`Environment already exists: ${id}`);
    }

    const env = definition.mode === 'docker'
      ? new DockerBrowserEnvironment(id, definition, this.config, this.logger)
      : new NativeBrowserEnvironment(id, definition, this.config, this.logger);

    this.environments.set(id, env);
    const summary = env.summary();
    this.store?.saveEnvironment(summary, { ...definition, id, mode: env.mode, updatedAt: env.updatedAt });
    this.logger?.info('Browser environment created', summary, 'environment.created');
    return summary;
  }

  list() {
    return [...this.environments.values()].map((env) => env.summary());
  }

  get(id) {
    const env = this.environments.get(id);
    if (!env) throw new Error(`Environment not found: ${id}`);
    return env;
  }

  async start(id) {
    const env = this.get(id);
    await env.start();
    env.touch();
    const summary = env.summary();
    this.store?.saveEnvironment(summary, { ...env.definition, id: env.id, mode: env.mode, updatedAt: env.updatedAt });
    this.logger?.info('Browser environment started', summary, 'environment.started');
    return summary;
  }

  async stop(id) {
    const env = this.get(id);
    await env.stop();
    env.touch();
    const summary = env.summary();
    this.store?.saveEnvironment(summary, { ...env.definition, id: env.id, mode: env.mode, updatedAt: env.updatedAt });
    this.logger?.info('Browser environment stopped', summary, 'environment.stopped');
    return summary;
  }

  async stopAll() {
    await Promise.allSettled([...this.environments.values()].map((env) => env.stop()));
  }

  async auditTabs(id) {
    return this.get(id).auditTabs()
  }
}

class ManagedBrowserEnvironment {
  constructor(id, definition, config, logger) {
    this.id = id;
    this.definition = definition;
    this.config = config;
    this.logger = logger;
    this.mode = definition.mode || 'native';
    this.status = 'stopped';
    this.updatedAt = definition.updatedAt || new Date().toISOString();
    this.tabs = new Map();
  }

  summary() {
    return {
      id: this.id,
      name: this.definition.name || this.id,
      mode: this.mode,
      status: this.status,
      endpoint: this.endpoint,
      profileId: this.definition.profileId,
      sharedProfile: this.definition.sharedProfile !== false,
      tabCount: this.tabs.size,
      updatedAt: this.updatedAt,
      ...(this.config?.vncEnabled ? { vncUrl: `http://127.0.0.1:${this.config.vncPort || 6080}/vnc.html?autoconnect=true&resize=remote` } : {})
    };
  }

  detail() {
    return {
      ...this.summary(),
      tabs: [...this.tabs.values()].map((tab) => ({
        id: tab.id,
        groupId: tab.groupId,
        url: tab.url,
        webSocketDebuggerUrl: tab.webSocketDebuggerUrl,
        browserContextId: tab.browserContextId,
        createdAt: tab.createdAt
      }))
    };
  }

  async ensureStarted() {
    if (this.status !== 'running') {
      await this.start();
    }
  }

  async connectCdp() {
    if (!this.cdp) {
      const webSocketUrl = this.webSocketUrl || await resolveBrowserWebSocketUrl(this.endpoint);
      this.cdp = await new CdpClient(webSocketUrl).connect();
      await this.cdp.send('Target.setDiscoverTargets', { discover: true });
    }
    return this.cdp;
  }

  async applyCdpOverrides(cdp, url) {
    const config = this.config || {}
    if (!config.stealthEnabled) return

    try {
      const hostname = extractHostname(url)
      if (isStealthExcluded(hostname, config.stealthExcludedHosts)) return

      const promises = []

      if (config.cdpAcceptLanguage) {
        promises.push(
          cdp.send('Network.enable', {}).then(() =>
            cdp.send('Network.setExtraHTTPHeaders', {
              headers: { 'Accept-Language': config.cdpAcceptLanguage }
            })
          ).catch(() => {})
        )
      }

      const uaOverride = {}
      if (config.cdpUserAgent) uaOverride.userAgent = config.cdpUserAgent
      if (config.cdpAcceptLanguage) uaOverride.acceptLanguage = config.cdpAcceptLanguage
      if (config.cdpPlatform) uaOverride.platform = config.cdpPlatform
      if (Object.keys(uaOverride).length > 0) {
        promises.push(
          cdp.send('Network.setUserAgentOverride', uaOverride).catch(() => {})
        )
      }

      if (config.cdpTimezone) {
        promises.push(
          cdp.send('Emulation.setTimezoneOverride', { timezoneId: config.cdpTimezone }).catch(() => {})
        )
      }

      if (config.cdpLocale) {
        promises.push(
          cdp.send('Emulation.setLocaleOverride', { locale: config.cdpLocale }).catch(() => {})
        )
      }

      await Promise.allSettled(promises)
    } catch {
      // CDP overrides are best-effort
    }
  }

  async createTab({ url = 'about:blank', isolatedContext = false, groupId } = {}) {
    await this.ensureStarted();
    const target = await this.#createHttpTarget();
    const pageCdp = await new CdpClient(target.webSocketDebuggerUrl).connect();
    if (url && url !== 'about:blank') {
      await this.applyCdpOverrides(pageCdp, url)
      await pageCdp.send('Page.navigate', { url });
      await sleep(1000);
    }

    const tab = {
      id: target.id,
      groupId: groupId || `group_${target.id.slice(0, 8)}`,
      browserContextId: isolatedContext ? `direct-${target.id}` : undefined,
      sessionId: undefined,
      cdp: pageCdp,
      webSocketDebuggerUrl: target.webSocketDebuggerUrl,
      url,
      createdAt: new Date().toISOString()
    };

    this.tabs.set(tab.id, tab);
    this.touch();
    return tab;
  }

  async getCdpForTab(tab) {
    return tab.cdp || this.connectCdp();
  }

  async closeTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    tab.cdp?.close();
    await fetch(`${this.endpoint.replace(/\/$/, '')}/json/close/${encodeURIComponent(tabId)}`).catch(() => {});
    this.tabs.delete(tabId);
    this.touch();
  }

  async auditTabs() {
    const endpoint = this.endpoint.replace(/\/$/, '')
    const trackedTabs = [...this.tabs.values()]
    const trackedIds = new Set(trackedTabs.map(t => t.id))

    let actualTabs = []
    try {
      const resp = await fetch(`${endpoint}/json/list`)
      actualTabs = await resp.json()
    } catch {
      return { ok: false, error: 'Cannot connect to browser CDP endpoint' }
    }

    const actualIds = new Set(actualTabs.map(t => t.id))
    const trackedMissingTabs = trackedTabs.filter(t => !actualIds.has(t.id))
    const untrackedTabs = actualTabs.filter(t => !trackedIds.has(t.id))

    return {
      ok: true,
      actualTabs: actualTabs.length,
      trackedOpenTabs: trackedTabs.length,
      untrackedTabs: untrackedTabs.map(t => ({ id: t.id, url: t.url, title: t.title })),
      trackedMissingTabs: trackedMissingTabs.map(t => ({ id: t.id, url: t.url, groupId: t.groupId })),
      summary: {
        actualTabs: actualTabs.length,
        trackedOpenTabs: trackedTabs.length,
        untrackedTabs: untrackedTabs.length,
        trackedMissingTabs: trackedMissingTabs.length
      }
    }
  }

  touch() {
    this.updatedAt = new Date().toISOString();
  }

  async #createHttpTarget() {
    const response = await fetch(`${this.endpoint.replace(/\/$/, '')}/json/new?about:blank`, {
      method: 'PUT'
    });
    if (!response.ok) {
      throw new Error(`Cannot create CDP target: ${response.status}`);
    }
    const target = await response.json();
    if (!target.id || !target.webSocketDebuggerUrl) {
      throw new Error('CDP target response is missing id or webSocketDebuggerUrl');
    }
    return target;
  }
}

class NativeBrowserEnvironment extends ManagedBrowserEnvironment {
  constructor(id, definition, config, logger) {
    super(id, definition, config, logger);
    this.mode = 'native';
    this.endpoint = definition.cdpEndpoint || `http://127.0.0.1:${definition.remoteDebuggingPort || 9222}`;
  }

  async start() {
    if (this.status === 'running') return;

    if (this.definition.cdpEndpoint && this.definition.attachOnly !== false) {
      this.webSocketUrl = await resolveBrowserWebSocketUrl(this.definition.cdpEndpoint);
      this.status = 'running';
      return;
    }

    const chromePath = findChromeExecutable(this.definition.chromePath);
    if (!chromePath) {
      throw new Error('Chrome/Edge executable not found. Pass chromePath or use cdpEndpoint to attach to an existing browser.');
    }

    const profileId = this.definition.profileId || 'default';
    const userDataDir = this.definition.userDataDir
      ? path.resolve(this.definition.userDataDir)
      : path.join(this.config.browserStateDir, 'native', profileId);
    await mkdir(userDataDir, { recursive: true });

    const args = [
      `--remote-debugging-port=${new URL(this.endpoint).port}`,
      `--user-data-dir=${userDataDir}`,
      ...DEFAULT_CHROME_FLAGS,
      ...(this.definition.headless ? ['--headless=new'] : []),
      ...(this.definition.extensionsDir ? [`--load-extension=${path.resolve(this.definition.extensionsDir)}`] : []),
      'about:blank'
    ];

    this.process = spawn(chromePath, args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    pipeBrowserLogs(this.process, this.logger, this.id);

    this.webSocketUrl = await waitForCdp(this.endpoint, this.definition.startTimeoutMs || 15000);
    this.status = 'running';
  }

  async stop() {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.cdp?.close();
    this.cdp = undefined;
    this.status = 'stopped';
  }
}

class DockerBrowserEnvironment extends ManagedBrowserEnvironment {
  constructor(id, definition, config, logger) {
    super(id, definition, config, logger);
    this.mode = 'docker';
    this.containerName = definition.containerName || `asb-browser-${id.replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
    this.hostPort = Number(definition.remoteDebuggingPort || 9223);
    this.endpoint = definition.cdpEndpoint || `http://127.0.0.1:${this.hostPort}`;
  }

  async start() {
    if (this.status === 'running') return;

    if (this.definition.cdpEndpoint && this.definition.attachOnly !== false) {
      this.webSocketUrl = await resolveBrowserWebSocketUrl(this.definition.cdpEndpoint);
      this.status = 'running';
      return;
    }

    const profileId = this.definition.profileId || 'default';
    const stateDir = path.join(this.config.browserStateDir, 'docker', profileId);
    await mkdir(stateDir, { recursive: true });

    const args = [
      'run',
      '--rm',
      '--name', this.containerName,
      '-p', `${this.hostPort}:9222`,
      '-v', `${stateDir}:/home/pwuser/profile`,
      this.definition.headless === false ? '-e' : undefined,
      this.definition.headless === false ? 'ASB_HEADLESS=false' : undefined,
      this.definition.image || 'asb-browser:latest'
    ].filter(Boolean);

    this.process = spawn('docker', args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    pipeBrowserLogs(this.process, this.logger, this.id);

    this.webSocketUrl = await waitForCdp(this.endpoint, this.definition.startTimeoutMs || 30000);
    this.status = 'running';
  }

  async stop() {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.cdp?.close();
    this.cdp = undefined;
    this.status = 'stopped';
  }
}

function pipeBrowserLogs(process, logger, environmentId) {
  process.stdout?.on('data', (chunk) => {
    logger?.info('Browser stdout', {
      environmentId,
      output: chunk.toString('utf8').trim()
    }, 'browser.stdout');
  });
  process.stderr?.on('data', (chunk) => {
    logger?.error('Browser stderr', {
      environmentId,
      output: chunk.toString('utf8').trim()
    }, 'browser.stderr');
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostMatches(hostname, pattern) {
  const host = String(hostname || '').toLowerCase()
  const rule = String(pattern || '').trim().toLowerCase()
  if (!host || !rule) return false
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(1)
    return host.endsWith(suffix) && host !== suffix.slice(1)
  }
  return host === rule || host.endsWith('.' + rule)
}

function extractHostname(url) {
  try { return new URL(url).hostname } catch { return '' }
}

function isStealthExcluded(hostname, excludedHosts) {
  if (!hostname || !excludedHosts) return false
  return excludedHosts.split(',').map(s => s.trim()).filter(Boolean).some(p => hostMatches(hostname, p))
}
