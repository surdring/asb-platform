const config = window.__ASB_STEALTH_CONFIG__ || {}
const script = document.createElement('script')
script.src = chrome.runtime.getURL('inject.js')
script.dataset.asbConfig = JSON.stringify(config)
script.onload = () => script.remove()
;(document.documentElement || document.head).appendChild(script)