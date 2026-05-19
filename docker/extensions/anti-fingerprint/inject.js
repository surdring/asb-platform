(() => {
  const config = JSON.parse(document.currentScript?.dataset?.asbConfig || '{}')

  const hostMatches = (hostname, pattern) => {
    const host = String(hostname || '').toLowerCase()
    const rule = String(pattern || '').trim().toLowerCase()
    if (!host || !rule) return false
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1)
      return host.endsWith(suffix) && host !== suffix.slice(1)
    }
    return host === rule || host.endsWith('.' + rule)
  }

  const excludedHosts = (config.excludedHosts || '').split(',').map(s => s.trim()).filter(Boolean)
  if (excludedHosts.some(p => hostMatches(location.hostname, p))) return

  const defineGetter = (obj, key, getter) => {
    try { Object.defineProperty(obj, key, { get: getter, configurable: true }) } catch (_) {}
  }

  defineGetter(Navigator.prototype, 'webdriver', () => undefined)

  const languages = (config.languages || 'zh-CN,zh,en-US,en').split(',').map(s => s.trim()).filter(Boolean)
  defineGetter(Navigator.prototype, 'languages', () => languages)

  if (config.platform) {
    defineGetter(Navigator.prototype, 'platform', () => config.platform)
  }

  defineGetter(Navigator.prototype, 'vendor', () => 'Google Inc.')

  if (config.hardwareConcurrency != null) {
    defineGetter(Navigator.prototype, 'hardwareConcurrency', () => Number(config.hardwareConcurrency))
  }

  if (config.deviceMemory != null) {
    defineGetter(Navigator.prototype, 'deviceMemory', () => Number(config.deviceMemory))
  }

  if (config.maxTouchPoints != null) {
    defineGetter(Navigator.prototype, 'maxTouchPoints', () => Number(config.maxTouchPoints))
  }

  try {
    if ('pdfViewerEnabled' in navigator) {
      defineGetter(Navigator.prototype, 'pdfViewerEnabled', () => true)
    }
  } catch (_) {}

  const makeNamedArray = (constructor, entries) => {
    const arr = new constructor()
    const nameMap = Object.create(null)
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      arr.push(entry)
      if (entry.name) nameMap[entry.name] = entry
      if (entry.type) nameMap[entry.type] = entry
    }
    arr.item = function (i) { return this[i] || null }
    arr.namedItem = function (name) { return nameMap[name] || null }
    return arr
  }

  const pluginEntries = [
    {
      name: 'Chrome PDF Plugin',
      filename: 'internal-pdf-viewer',
      description: 'Portable Document Format',
      mimeTypes: [{ type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }]
    },
    {
      name: 'Chrome PDF Viewer',
      filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
      description: '',
      mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: '' }]
    },
    {
      name: 'Native Client',
      filename: 'internal-nacl-plugin',
      description: '',
      mimeTypes: [
        { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
        { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' }
      ]
    }
  ]

  const mimeEntries = []
  const plugins = makeNamedArray(Array, pluginEntries.map(p => {
    const mts = p.mimeTypes.map(mt => {
      const mimeType = Object.create(MimeType.prototype)
      Object.defineProperties(mimeType, {
        type: { get: () => mt.type },
        suffixes: { get: () => mt.suffixes },
        description: { get: () => mt.description }
      })
      mimeEntries.push(mimeType)
      return mimeType
    })
    const mtsArray = makeNamedArray(Array, mts)
    const plugin = Object.create(Plugin.prototype)
    Object.defineProperties(plugin, {
      name: { get: () => p.name },
      filename: { get: () => p.filename },
      description: { get: () => p.description },
      length: { get: () => mtsArray.length }
    })
    plugin.item = function (i) { return mtsArray[i] || null }
    plugin.namedItem = function (name) { return mtsArray.namedItem(name) }
    for (let i = 0; i < mtsArray.length; i++) {
      plugin[i] = mtsArray[i]
    }
    mts.forEach(mt => {
      Object.defineProperty(mt, 'enabledPlugin', { get: () => plugin })
    })
    return plugin
  }))

  const mimeTypes = makeNamedArray(Array, mimeEntries)

  defineGetter(Navigator.prototype, 'plugins', () => plugins)
  defineGetter(Navigator.prototype, 'mimeTypes', () => mimeTypes)

  window.chrome = window.chrome || { runtime: {} }

  window.chrome.app = {
    isInstalled: false,
    InstallState: {
      DISABLED: 'disabled',
      INSTALLED: 'installed',
      NOT_INSTALLED: 'not_installed'
    },
    RunningState: {
      CANNOT_RUN: 'cannot_run',
      READY_TO_RUN: 'ready_to_run',
      RUNNING: 'running'
    },
    getDetails: () => null,
    getIsInstalled: () => false,
    runningState: () => 'cannot_run'
  }

  window.chrome.csi = () => ({
    startE: Date.now(),
    onloadT: Date.now(),
    pageT: Math.max(0, Math.round(performance.now())),
    tran: 15
  })

  window.chrome.loadTimes = () => {
    const t = Date.now() / 1000
    return {
      requestTime: t,
      startLoadTime: t,
      commitLoadTime: t,
      finishDocumentLoadTime: t,
      finishLoadTime: t,
      firstPaintTime: t,
      firstPaintAfterLoadTime: 0,
      navigationType: 'Other',
      wasFetchedViaSpdy: true,
      wasNpnNegotiated: true,
      npnNegotiatedProtocol: 'h2',
      wasAlternateProtocolAvailable: false,
      connectionInfo: 'h2'
    }
  }

  if (window.outerWidth === 0 || window.outerHeight === 0) {
    defineGetter(window, 'outerWidth', () => window.innerWidth + 16)
    defineGetter(window, 'outerHeight', () => window.innerHeight + 88)
  }

  const origCanPlayType = HTMLMediaElement.prototype.canPlayType
  HTMLMediaElement.prototype.canPlayType = function (type) {
    if (type === 'video/mp4' || (type && type.startsWith('video/mp4;'))) return 'probably'
    if (type === 'audio/aac' || (type && type.startsWith('audio/aac;'))) return 'probably'
    if (type === 'application/x-mpegURL' || type === 'audio/mpegurl') return 'maybe'
    return origCanPlayType.call(this, type)
  }

  if (navigator.permissions && navigator.permissions.query) {
    const origQuery = navigator.permissions.query.bind(navigator.permissions)
    navigator.permissions.query = function (desc) {
      if (desc && desc.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null })
      }
      return origQuery(desc)
    }
  }

  const WEBGL_VENDOR = 37445
  const WEBGL_RENDERER = 37446

  if (config.webglVendor || config.webglRenderer) {
    const patchGetParameter = (prototype) => {
      const origGetParameter = prototype.getParameter
      prototype.getParameter = function (pname) {
        if (pname === WEBGL_VENDOR && config.webglVendor) return config.webglVendor
        if (pname === WEBGL_RENDERER && config.webglRenderer) return config.webglRenderer
        return origGetParameter.call(this, pname)
      }
    }
    if (typeof WebGLRenderingContext !== 'undefined') {
      patchGetParameter(WebGLRenderingContext.prototype)
    }
    if (typeof WebGL2RenderingContext !== 'undefined') {
      patchGetParameter(WebGL2RenderingContext.prototype)
    }
  }

  if (config.canvasNoise !== false) {
    const noisyCanvases = new WeakSet()
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.toDataURL = function () {
      if (!noisyCanvases.has(this)) {
        noisyCanvases.add(this)
        try {
          const ctx = this.getContext('2d')
          if (ctx) {
            const w = Math.min(this.width, 32)
            const h = Math.min(this.height, 32)
            if (w > 0 && h > 0) {
              const imageData = ctx.getImageData(0, 0, w, h)
              const data = imageData.data
              for (let i = 0; i < data.length; i += 4) {
                data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() - 0.5) * 2))
                data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + (Math.random() - 0.5) * 2))
                data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + (Math.random() - 0.5) * 2))
              }
              ctx.putImageData(imageData, 0, 0)
            }
          }
        } catch (_) {}
      }
      return origToDataURL.apply(this, arguments)
    }
  }

  if (config.audioNoise !== false) {
    const channelCache = new WeakMap()
    const origGetChannelData = AudioBuffer.prototype.getChannelData
    AudioBuffer.prototype.getChannelData = function (channel) {
      const cacheKey = channel
      if (channelCache.has(this) && channelCache.get(this).has(cacheKey)) {
        return channelCache.get(this).get(cacheKey)
      }
      const raw = origGetChannelData.call(this, channel)
      const noisy = new Float32Array(raw.length)
      noisy.set(raw)
      for (let i = 0; i < noisy.length; i += 100) {
        noisy[i] += (Math.random() - 0.5) * 0.00001
      }
      if (!channelCache.has(this)) channelCache.set(this, new Map())
      channelCache.get(this).set(cacheKey, noisy)
      return noisy
    }
  }

  window.__ASB_STEALTH__ = { injected: true, version: '1.0.0', injectedAt: Date.now() }
})()