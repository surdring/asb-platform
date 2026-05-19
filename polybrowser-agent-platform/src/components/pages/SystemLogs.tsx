import React, { useState, useEffect, useRef } from 'react'
import { ScrollText, RefreshCw, Filter, Play, Pause } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../../hooks/useApi'
import { fetchLogs } from '../../api/logs'
import type { LogEntry } from '../../types/api'

export function SystemLogs() {
  const { t } = useTranslation()
  const { data: logs, loading, error, refetch } = useApi(() => fetchLogs(100), [])
  const [levelFilter, setLevelFilter] = useState('')
  const [eventFilter, setEventFilter] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const events = [...new Set(logs?.map(l => l.event).filter(Boolean) || [])]

  const filtered = logs?.filter(log => {
    if (levelFilter && log.level !== levelFilter) return false
    if (eventFilter && log.event !== eventFilter) return false
    return true
  })

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(refetch, 5000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [autoRefresh, refetch])

  const levelBadge = (level: string) => {
    if (level === 'error') return 'bg-red-900/30 text-red-500 border-red-500/30'
    return 'bg-slate-900/50 text-slate-400 border-slate-700'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-slate-100">{t('systemLogs.title')}</h2>
          <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">{t('systemLogs.subtitle')}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-md border text-xs font-bold flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            {autoRefresh ? <Pause size={12} /> : <Play size={12} />}
            {autoRefresh ? t('systemLogs.autoRefreshOn') : t('systemLogs.autoRefreshOff')}
          </button>
          <button onClick={refetch} className="px-3 py-1.5 rounded-md bg-slate-800/50 border border-slate-700/50 text-slate-400 text-xs font-bold hover:text-slate-200 flex items-center gap-1.5">
            <RefreshCw size={12} /> {t('systemLogs.refresh')}
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-slate-500" />
          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-slate-300 outline-none focus:border-cyan-500 font-mono"
          >
            <option value="">{t('systemLogs.allLevels')}</option>
            <option value="info">Info</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={eventFilter}
            onChange={e => setEventFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-slate-300 outline-none focus:border-cyan-500 font-mono"
          >
            <option value="">{t('systemLogs.allEvents')}</option>
            {events.map(e => e && <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        {filtered && (
          <span className="text-[10px] text-slate-500 self-center ml-auto font-mono">{filtered.length} entries</span>
        )}
      </div>

      {loading && (
        <div className="text-center text-slate-500 py-12">{t('systemLogs.loading')}</div>
      )}
      {error && (
        <div className="text-center text-red-400 py-12">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {filtered?.map(log => (
          <div key={log.id} className={`p-3 rounded-lg border font-mono ${
            log.level === 'error'
              ? 'bg-red-950/10 border-red-900/30'
              : 'bg-slate-900/40 border-slate-800'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border ${levelBadge(log.level)}`}>
                    {log.level}
                  </span>
                  {log.event && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/30 text-cyan-400 border border-cyan-500/20 font-bold">
                      {log.event}
                    </span>
                  )}
                </div>
                <p className={`text-xs ${log.level === 'error' ? 'text-red-300' : 'text-slate-300'}`}>
                  {log.message}
                </p>
                {log.payload && Object.keys(log.payload).length > 0 && (
                  <pre className="text-[10px] text-slate-500 mt-1 whitespace-pre-wrap break-all">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                )}
              </div>
              <span className="text-[10px] text-slate-600 shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
            </div>
          </div>
        ))}
        {filtered && filtered.length === 0 && (
          <div className="text-center text-slate-500 py-12 text-xs">{t('systemLogs.noLogs')}</div>
        )}
      </div>
    </div>
  )
}