import crypto from 'node:crypto'

const ACTION_TIMEOUT_MS = 15000

export class TaskRunner {
  constructor({ environmentManager, leaseManager, skillRegistry, store, logger, config }) {
    this.environmentManager = environmentManager
    this.leaseManager = leaseManager
    this.skillRegistry = skillRegistry
    this.store = store
    this.logger = logger
    this.config = config
    this.platformLastActionAt = new Map()
  }

  async run({ leaseId, skillId, action, input = {}, name }) {
    const humanizeLevel = input.humanizeLevel || this.config?.humanizeLevel || 'standard'
    const maxAttempts = Math.max(1, Number(input.maxAttempts) || 1)
    const cooldown = input.cooldown !== false
    const cooldownMode = input.cooldownMode || 'wait'

    const task = this.store?.createTask({ leaseId, skillId, action, input, name })
    await this.logger?.info('Task started', { taskId: task?.id, leaseId, skillId, action }, 'task.started')

    const lease = this.leaseManager.get(leaseId)
    const skill = this.skillRegistry.get(skillId)
    const actionDef = skill.actions[action]
    if (!actionDef) throw new Error(`Action ${action} not found in skill ${skillId}`)

    const env = this.environmentManager.get(lease.environmentId)
    const tab = env.tabs.get(lease.tabId)
    if (!tab) throw new Error(`Tab ${lease.tabId} not found for lease ${leaseId}`)

    const cdp = await env.getCdpForTab(tab)

    if (cooldown && this.config?.cooldownEnabled) {
      const domain = extractDomain(lease.url || '')
      const check = checkPlatformCooldown(domain, this.config, this.platformLastActionAt)
      if (!check.allowed) {
        if (cooldownMode === 'reject') {
          throw Object.assign(
            new Error(`Platform cooldown active for ${domain}: wait ${check.waitSeconds}s`),
            { statusCode: 429 }
          )
        }
        await sleep(check.waitSeconds * 1000)
      }
    }

    let lastError
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const context = {
        cdp,
        sessionId: tab.sessionId,
        skill,
        input,
        results: {},
        startedAt: new Date().toISOString()
      }

      try {
        for (const step of actionDef.steps || []) {
          await runStep(context, step)
          await humanizeDelay(humanizeLevel, context)
        }

        if (actionDef.parser) {
          context.results.parsed = await runParser(context, actionDef.parser)
        }

        if (cooldown && this.config?.cooldownEnabled) {
          const domain = extractDomain(lease.url || '')
          if (domain) this.platformLastActionAt.set(domain, Date.now())
        }

        const result = {
          taskId: task?.id,
          name: name || `${skillId}:${action}`,
          leaseId,
          skillId,
          action,
          results: context.results,
          completedAt: new Date().toISOString()
        }

        if (task?.id) this.store?.completeTask(task.id, result)
        const savedItems = task?.id
          ? this.store?.saveCollectedItems({
            taskId: task.id,
            skillId,
            platform: skill.platform,
            parsed: context.results.parsed
          })
          : 0
        await this.logger?.info('Task completed', {
          taskId: task?.id,
          leaseId,
          skillId,
          action,
          savedItems
        }, 'task.completed')
        return result
      } catch (error) {
        lastError = error
        if (attempt < maxAttempts) {
          if (task?.id) {
            this.store?.saveArtifact?.({
              id: `artifact_${crypto.randomUUID()}`,
              leaseId: task.leaseId || leaseId,
              tabId: lease.tabId,
              kind: 'error',
              path: '',
              mimeType: 'application/json',
              bytes: 0,
              createdAt: new Date().toISOString()
            })
          }
          await sleep(1000 * attempt)
        }
      }
    }

    if (task?.id) this.store?.failTask(task.id, lastError)
    await this.logger?.error('Task failed', {
      taskId: task?.id,
      leaseId,
      skillId,
      action,
      error: lastError.message
    }, 'task.failed')
    throw lastError
  }
}

function humanizeDelay(level, context) {
  if (level === 'off') return sleep(0)

  let delay = 0
  if (level === 'minimal') {
    delay = 200 + Math.random() * 300
  } else if (level === 'standard') {
    delay = 500 + Math.random() * 1000
  } else if (level === 'enhanced') {
    delay = 1000 + Math.random() * 2000
  }

  const delays = [sleep(delay)]

  if (level === 'standard' || level === 'enhanced') {
    const scrollY = Math.floor(Math.random() * 300)
    delays.push(
      context.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: 300, y: 300,
        deltaX: 0, deltaY: scrollY, pointerType: 'mouse'
      }, context.sessionId).catch(() => {})
    )
  }

  if (level === 'enhanced') {
    const pauseMs = 2000 + Math.random() * 6000
    delays.push(sleep(pauseMs))
  }

  return Promise.allSettled(delays)
}

async function runStep(context, step) {
  const type = step.type;

  if (type === 'navigate') {
    const url = interpolate(step.url, context.input);
    await context.cdp.send('Page.navigate', { url }, context.sessionId);
    await sleep(step.waitMs || 1000);
    return;
  }

  if (type === 'waitForSelector') {
    const selector = resolveSelector(context.skill, step.selector);
    await waitForSelector(context, selector, step.timeoutMs || ACTION_TIMEOUT_MS);
    return;
  }

  if (type === 'click') {
    const selector = resolveSelector(context.skill, step.selector);
    await evaluate(context, `
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Element not found: ${escapeForScript(selector)}');
      el.click();
    `);
    await sleep(step.waitMs || 300);
    return;
  }

  if (type === 'type') {
    const selector = resolveSelector(context.skill, step.selector);
    const text = interpolate(step.text || '', context.input);
    await evaluate(context, `
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Element not found: ${escapeForScript(selector)}');
      el.focus();
      el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await sleep(step.waitMs || 200);
    return;
  }

  if (type === 'scroll') {
    await evaluate(context, `window.scrollBy({ top: ${Number(step.y || 0)}, left: ${Number(step.x || 0)}, behavior: 'instant' });`);
    await sleep(step.waitMs || 500);
    return;
  }

  if (type === 'extract') {
    const name = step.name || 'extract';
    const selector = step.selector ? resolveSelector(context.skill, step.selector) : undefined;
    const expression = buildExtractExpression(selector, step);
    context.results[name] = await evaluate(context, expression, true);
    return;
  }

  if (type === 'evaluate') {
    const name = step.name || 'evaluate';
    context.results[name] = await evaluate(context, interpolate(step.expression, context.input), true);
    return;
  }

  if (type === 'mouseMove') {
    const selector = resolveSelector(context.skill, step.selector)
    const rect = await evaluate(context, `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) throw new Error('Element not found: ${escapeForScript(selector)}')
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })()
    `, true)
    await context.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: rect.x, y: rect.y, button: 'none', pointerType: 'mouse'
    }, context.sessionId)
    return
  }

  if (type === 'mouseClick') {
    const selector = resolveSelector(context.skill, step.selector)
    const rect = await evaluate(context, `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) throw new Error('Element not found: ${escapeForScript(selector)}')
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })()
    `, true)
    await context.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: rect.x, y: rect.y, button: 'none', pointerType: 'mouse'
    }, context.sessionId)
    await sleep(50 + Math.random() * 100)
    await context.cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1, pointerType: 'mouse'
    }, context.sessionId)
    await sleep(50 + Math.random() * 100)
    await context.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1, pointerType: 'mouse'
    }, context.sessionId)
    await sleep(step.waitMs || 300)
    return
  }

  if (type === 'keyType') {
    const selector = resolveSelector(context.skill, step.selector)
    const text = interpolate(step.text || '', context.input)
    if (selector) {
      await evaluate(context, `
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) throw new Error('Element not found: ${escapeForScript(selector)}')
        el.focus()
      `)
      await sleep(100)
    }
    for (const char of text) {
      await context.cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: char, text: char
      }, context.sessionId)
      await context.cdp.send('Input.dispatchKeyEvent', {
        type: 'char', key: char, text: char
      }, context.sessionId)
      await context.cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: char, text: char
      }, context.sessionId)
      await sleep(30 + Math.random() * 70)
    }
    await sleep(step.waitMs || 100)
    return
  }

  if (type === 'keyPress') {
    const key = step.key || 'Enter'
    await context.cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', key: key
    }, context.sessionId)
    await sleep(50)
    await context.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: key
    }, context.sessionId)
    await sleep(step.waitMs || 200)
    return
  }

  if (type === 'wheelScroll') {
    await context.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: Number(step.x || 300), y: Number(step.y || 300),
      deltaX: Number(step.deltaX || 0), deltaY: Number(step.deltaY || Number(step.y || 300)),
      pointerType: 'mouse'
    }, context.sessionId)
    await sleep(step.waitMs || 500)
    return
  }

  if (type === 'sleep') {
    await sleep(step.ms || 1000)
    return
  }

  throw new Error(`Unsupported action step type: ${type}`);
}

async function runParser(context, parserName) {
  const parser = context.skill.parsers?.[parserName];
  if (!parser) throw new Error(`Parser not found: ${parserName}`);

  if (parser.type === 'javascript') {
    const source = `
      (() => {
        const input = ${JSON.stringify(context.results)};
        const parse = ${parser.source};
        return parse(input);
      })()
    `;
    return evaluate(context, source, true);
  }

  if (parser.type === 'mapping') {
    return applyMapping(context.results, parser.fields || {});
  }

  throw new Error(`Unsupported parser type: ${parser.type}`);
}

function buildExtractExpression(selector, step) {
  const attr = step.attribute || 'textContent';
  const many = step.many !== false;
  const pick = attr === 'html'
    ? 'el.innerHTML'
    : attr === 'textContent'
      ? 'el.textContent?.trim()'
      : `el.getAttribute(${JSON.stringify(attr)})`;

  if (!selector) {
    return step.expression || 'document.documentElement.outerHTML';
  }

  if (many) {
    return `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map((el) => ${pick})`;
  }
  return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? ${pick} : null; })()`;
}

async function waitForSelector(context, selector, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const found = await evaluate(context, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, true);
    if (found) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

async function evaluate(context, expression, returnByValue = false) {
  const result = await context.cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue
  }, context.sessionId);

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed');
  }

  return returnByValue ? result.result?.value : result.result;
}

function resolveSelector(skill, keyOrSelector) {
  return skill.perception[keyOrSelector]?.selector || keyOrSelector;
}

function interpolate(template, input) {
  return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    return path.split('.').reduce((current, key) => current?.[key], input) ?? '';
  });
}

function applyMapping(results, fields) {
  const mapped = {};
  for (const [key, path] of Object.entries(fields)) {
    mapped[key] = String(path).split('.').reduce((current, part) => current?.[part], results);
  }
  return mapped;
}

function escapeForScript(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const DOMAIN_COOLDOWN_MAP = {
  'reddit.com': 'cooldownRedditSeconds',
  'facebook.com': 'cooldownFacebookSeconds',
  'linkedin.com': 'cooldownLinkedinSeconds',
  'instagram.com': 'cooldownInstagramSeconds'
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

function getCooldownSeconds(domain, config) {
  for (const [key, configKey] of Object.entries(DOMAIN_COOLDOWN_MAP)) {
    if (domain.includes(key)) return config[configKey] || 0
  }
  return config.cooldownManualChallengeSeconds || 300
}

function checkPlatformCooldown(domain, config, lastActionAtMap) {
  if (!domain) return { allowed: true, waitSeconds: 0 }
  const cooldownSeconds = getCooldownSeconds(domain, config)
  if (!cooldownSeconds) return { allowed: true, waitSeconds: 0 }

  const lastAt = lastActionAtMap.get(domain)
  if (!lastAt) return { allowed: true, waitSeconds: 0 }

  const elapsed = (Date.now() - lastAt) / 1000
  const remaining = cooldownSeconds - elapsed
  if (remaining <= 0) return { allowed: true, waitSeconds: 0 }

  return { allowed: false, waitSeconds: Math.ceil(remaining) }
}
