const PLATFORM_POLICIES = {
  linkedin: {
    domains: ['linkedin.com', '.linkedin.com'],
    authCookies: ['li_at'],
    loginUrlIncludes: ['/login', '/uas/login', '/checkpoint/lg/login'],
    challengeUrlIncludes: ['/checkpoint/', '/challenge/', '/captcha'],
    loginSelectors: [
      'input[name="session_key"]',
      'input[name="session_password"]',
      'form[action*="login"]',
      'a[href*="/login"]'
    ],
    challengeText: ['security verification', 'verify your identity', 'captcha', 'checkpoint']
  },
  reddit: {
    domains: ['reddit.com', '.reddit.com', 'www.reddit.com'],
    authCookies: ['reddit_session', 'token_v2'],
    loginUrlIncludes: ['/login', '/account/login'],
    challengeUrlIncludes: ['/captcha'],
    loginSelectors: ['input[name="username"]', 'input[name="password"]', 'shreddit-signup-drawer', 'auth-flow-modal'],
    challengeText: ['prove you are human', 'captcha', 'verify']
  },
  facebook: {
    domains: ['facebook.com', '.facebook.com'],
    authCookies: ['c_user', 'xs'],
    loginUrlIncludes: ['/login', '/checkpoint/block'],
    challengeUrlIncludes: ['/checkpoint', '/captcha'],
    loginSelectors: ['input[name="email"]', 'input[name="pass"]', 'form[action*="login"]'],
    challengeText: ['security check', 'confirm your identity', 'captcha', 'checkpoint']
  },
  instagram: {
    domains: ['instagram.com', '.instagram.com'],
    authCookies: ['sessionid', 'ds_user_id'],
    loginUrlIncludes: ['/accounts/login'],
    challengeUrlIncludes: ['/challenge/', '/captcha'],
    loginSelectors: ['input[name="username"]', 'input[name="password"]', 'form[action*="/accounts/login"]'],
    challengeText: ['suspicious login attempt', 'challenge required', 'captcha', 'verify']
  },
  generic: {
    domains: [],
    authCookies: [],
    loginUrlIncludes: ['/login', '/signin', '/sign-in'],
    challengeUrlIncludes: ['/captcha', '/challenge'],
    loginSelectors: ['input[type="password"]'],
    challengeText: ['captcha', 'verify you are human', 'security verification']
  }
}

function getPolicy(platform) {
  return PLATFORM_POLICIES[platform?.toLowerCase()] || PLATFORM_POLICIES.generic
}

function matchesAny(url, patterns) {
  if (!url || !patterns?.length) return false
  const lower = url.toLowerCase()
  return patterns.some(p => lower.includes(p.toLowerCase()))
}

export async function probeSession({ env, tab, platform, url, includeCookies, includeStorageState }) {
  const policy = getPolicy(platform)

  const cdp = await env.getCdpForTab(tab)

  await cdp.send('Network.enable', {}, tab.sessionId).catch(() => {})

  const cookiesResult = await cdp.send('Network.getAllCookies', {}, tab.sessionId).catch(() => ({ cookies: [] }))
  const allCookies = cookiesResult?.cookies || []

  const domainCookies = policy.domains.length
    ? allCookies.filter(c => policy.domains.some(d => c.domain?.includes(d) || d.includes(c.domain)))
    : allCookies

  const cookieNames = [...new Set(domainCookies.map(c => c.name))].sort()
  const authCookieNames = cookieNames.filter(n => policy.authCookies.includes(n))

  const pageState = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const loginSelectors = ${JSON.stringify(policy.loginSelectors || [])}
      const challengeText = ${JSON.stringify(policy.challengeText || [])}
      const loginUrlIncludes = ${JSON.stringify(policy.loginUrlIncludes || [])}
      const challengeUrlIncludes = ${JSON.stringify(policy.challengeUrlIncludes || [])}
      const text = ((document.body && document.body.innerText) || '').toLowerCase().slice(0, 120000)
      const visible = (element) => {
        if (!element) return false
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
      }
      const matchedSelector = loginSelectors.find((s) => {
        try { return Array.from(document.querySelectorAll(s)).some(visible) }
        catch (_) { return false }
      }) || null
      const matchedText = challengeText.find((n) => text.includes(n.toLowerCase())) || null
      const locationUrl = location.href
      const loginUrlMatch = loginUrlIncludes.some(p => locationUrl.toLowerCase().includes(p.toLowerCase()))
      const challengeUrlMatch = challengeUrlIncludes.some(p => locationUrl.toLowerCase().includes(p.toLowerCase()))
      return {
        url: locationUrl,
        title: document.title || '',
        readyState: document.readyState,
        loginSelectorMatched: matchedSelector,
        challengeMatched: matchedText || challengeUrlMatch,
        loginUrlMatched: loginUrlMatch,
        forms: document.forms ? document.forms.length : 0,
        passwordInputs: document.querySelectorAll('input[type="password"]').length
      }
    })()`,
    returnByValue: true,
    awaitPromise: true
  }, tab.sessionId).catch(() => ({ result: { value: {} } }))

  const page = pageState?.result?.value || {}
  const currentUrl = page.url || url

  const challenge = Boolean(page.challengeMatched || matchesAny(currentUrl, policy.challengeUrlIncludes))
  const loginRequired = Boolean(page.loginSelectorMatched || page.loginUrlMatched || matchesAny(currentUrl, policy.loginUrlIncludes))
  const connected = authCookieNames.length > 0 && !challenge && !loginRequired
  const reason = connected
    ? 'auth-cookie'
    : challenge
      ? 'challenge-detected'
      : loginRequired
        ? 'login-required'
        : authCookieNames.length > 0
          ? 'auth-cookie-needs-verification'
          : 'no-auth-cookie'

  let storageState
  if (includeStorageState) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        try {
          return JSON.stringify({
            localStorage: Object.entries(localStorage).reduce((acc, [k, v]) => { acc[k] = v; return acc }, {}),
            sessionStorage: Object.entries(sessionStorage).reduce((acc, [k, v]) => { acc[k] = v; return acc }, {})
          })
        } catch (e) { return JSON.stringify({ error: e.message }) }
      })()`,
      returnByValue: true,
      awaitPromise: true
    }, tab.sessionId).catch(() => ({ result: { value: '{}' } }))
    try {
      storageState = JSON.parse(result?.result?.value || '{}')
    } catch {
      storageState = {}
    }
  }

  return {
    platform: platform || 'generic',
    connected,
    reason,
    errorCode: connected ? null : reason.toUpperCase().replace(/-/g, '_'),
    currentUrl,
    title: page.title || '',
    cookieNames,
    authCookieNames,
    cookies: includeCookies ? domainCookies.map(c => ({
      name: c.name, domain: c.domain, path: c.path, expires: c.expires,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, value: c.value
    })) : undefined,
    storageState,
    pageSignals: {
      loginSelectorMatched: page.loginSelectorMatched || null,
      challengeMatched: page.challengeMatched || null,
      loginUrlMatched: page.loginUrlMatched || null,
      forms: page.forms || 0,
      passwordInputs: page.passwordInputs || 0
    }
  }
}