import crypto from 'node:crypto'

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function pick(arr, hash) {
  return arr[hash % arr.length]
}

function buildTemplate(platform, v) {
  if (platform === 'macos') {
    return {
      userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
      userAgentMetadata: {
        brands: [
          { brand: 'Chromium', version: v },
          { brand: 'Google Chrome', version: v },
          { brand: 'Not-A.Brand', version: '99' }
        ],
        fullVersionList: [
          { brand: 'Chromium', version: `${v}.0.6367.155` },
          { brand: 'Google Chrome', version: `${v}.0.6367.155` },
          { brand: 'Not-A.Brand', version: '99.0.0.0' }
        ],
        platform: 'macOS',
        architecture: 'x86',
        model: '',
        mobile: false
      },
      acceptLanguage: 'en-US,en;q=0.9',
      platform: 'MacIntel',
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
      hardwareConcurrencyOptions: [4, 8, 12, 16],
      deviceMemoryOptions: [4, 8, 16],
      maxTouchPoints: 0,
      extraHeaders: {}
    }
  }

  if (platform === 'windows') {
    return {
      userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
      userAgentMetadata: {
        brands: [
          { brand: 'Chromium', version: v },
          { brand: 'Google Chrome', version: v },
          { brand: 'Not-A.Brand', version: '99' }
        ],
        fullVersionList: [
          { brand: 'Chromium', version: `${v}.0.6367.155` },
          { brand: 'Google Chrome', version: `${v}.0.6367.155` },
          { brand: 'Not-A.Brand', version: '99.0.0.0' }
        ],
        platform: 'Windows',
        architecture: 'x64',
        model: '',
        mobile: false
      },
      acceptLanguage: 'en-US,en;q=0.9',
      platform: 'Win32',
      webglVendor: 'Google Inc. (NVIDIA)',
      webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      hardwareConcurrencyOptions: [4, 8, 12, 16],
      deviceMemoryOptions: [4, 8, 16],
      maxTouchPoints: 0,
      extraHeaders: {}
    }
  }

  return {
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
    userAgentMetadata: {
      brands: [
        { brand: 'Chromium', version: v },
        { brand: 'Google Chrome', version: v },
        { brand: 'Not-A.Brand', version: '99' }
      ],
      fullVersionList: [
        { brand: 'Chromium', version: `${v}.0.6367.155` },
        { brand: 'Google Chrome', version: `${v}.0.6367.155` },
        { brand: 'Not-A.Brand', version: '99.0.0.0' }
      ],
      platform: 'Linux',
      architecture: 'x64',
      model: '',
      mobile: false
    },
    acceptLanguage: 'en-US,en;q=0.9',
    platform: 'Linux x86_64',
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) OpenGL 4.5)',
    hardwareConcurrencyOptions: [4, 8, 12, 16],
    deviceMemoryOptions: [4, 8, 16],
    maxTouchPoints: 0,
    extraHeaders: {}
  }
}

export function generateFingerprint({ seed, platform = 'macos', chromeMajor = '124' } = {}) {
  const effectiveSeed = seed || crypto.randomUUID()
  const hash = hashCode(String(effectiveSeed))

  const normalizedPlatform = String(platform).toLowerCase()
  const v = String(chromeMajor)

  const tpl = buildTemplate(normalizedPlatform, v)

  return {
    userAgent: tpl.userAgent,
    userAgentMetadata: tpl.userAgentMetadata,
    acceptLanguage: tpl.acceptLanguage,
    platform: tpl.platform,
    webglVendor: tpl.webglVendor,
    webglRenderer: tpl.webglRenderer,
    hardwareConcurrency: pick(tpl.hardwareConcurrencyOptions, hash),
    deviceMemory: pick(tpl.deviceMemoryOptions, hash),
    maxTouchPoints: tpl.maxTouchPoints,
    extraHeaders: tpl.extraHeaders
  }
}