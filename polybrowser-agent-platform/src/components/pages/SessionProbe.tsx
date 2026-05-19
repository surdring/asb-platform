import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { probeSession } from '../../api/client'

export function SessionProbe() {
  const { t } = useTranslation()
  const [platform, setPlatform] = useState('linkedin')
  const [url, setUrl] = useState('')
  const [includeCookies, setIncludeCookies] = useState(false)
  const [includeStorageState, setIncludeStorageState] = useState(false)
  const [keepOpen, setKeepOpen] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleProbe = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await probeSession({ platform, url: url || undefined, includeCookies, includeStorageState, keepOpen })
      setResult(res)
    } catch (err: any) {
      setError(err.message || 'Probe failed')
    } finally {
      setLoading(false)
    }
  }

  const platforms = ['linkedin', 'reddit', 'facebook', 'instagram', 'generic']

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-bold text-slate-100">{t('sessionProbe.title') || 'Session Probe'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4 bg-[#05070a] border border-slate-800/50 rounded-lg p-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Platform</label>
            <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm">
              {platforms.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">URL (optional)</label>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm" placeholder="https://www.linkedin.com/feed/" />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={includeCookies} onChange={e => setIncludeCookies(e.target.checked)} className="rounded" />
              Include Cookies
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={includeStorageState} onChange={e => setIncludeStorageState(e.target.checked)} className="rounded" />
              Include Storage
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={keepOpen} onChange={e => setKeepOpen(e.target.checked)} className="rounded" />
              Keep Open
            </label>
          </div>
          <button onClick={handleProbe} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium">
            {loading ? 'Probing...' : 'Probe'}
          </button>
          {error && <div className="text-red-400 text-sm">{error}</div>}
        </div>

        {result && (
          <div className="bg-[#05070a] border border-slate-800/50 rounded-lg p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${result.connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-slate-200 font-medium">{result.connected ? 'Connected' : 'Not Connected'}</span>
            </div>
            <div><span className="text-slate-500">Reason: </span><span className="text-slate-300">{result.reason}</span></div>
            {result.authCookieNames?.length > 0 && (
              <div><span className="text-slate-500">Auth Cookies: </span><span className="text-cyan-400">{result.authCookieNames.join(', ')}</span></div>
            )}
            <div><span className="text-slate-500">URL: </span><span className="text-slate-400 break-all">{result.currentUrl}</span></div>
            <details className="text-xs">
              <summary className="text-slate-500 cursor-pointer">Full Response</summary>
              <pre className="mt-2 bg-slate-950 p-2 rounded text-slate-400 overflow-auto max-h-64">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}