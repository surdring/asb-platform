import React, { useState } from 'react'
import { Server, Monitor, Chrome, Plus, Terminal, X, Play, Square, ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../../hooks/useApi'
import { fetchEnvironments, createEnvironment, startEnvironment, stopEnvironment } from '../../api/environments'
import type { EnvironmentSummary, CreateEnvironmentRequest } from '../../types/api'

export function Environments() {
  const { t } = useTranslation()
  const { data: envs, loading, error, refetch } = useApi(fetchEnvironments, [])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null)
  const [form, setForm] = useState<CreateEnvironmentRequest>({
    id: '',
    name: '',
    mode: 'native',
    profileId: '',
    headless: true,
    remoteDebuggingPort: 9222
  })

  const handleCreate = async () => {
    try {
      await createEnvironment({
        ...form,
        id: form.id || undefined,
        name: form.name || undefined,
        profileId: form.profileId || undefined
      })
      setIsCreateModalOpen(false)
      setForm({ id: '', name: '', mode: 'native', profileId: '', headless: true, remoteDebuggingPort: 9222 })
      refetch()
    } catch (err) {
      console.error('Failed to create environment:', err)
    }
  }

  const handleStart = async (id: string) => {
    setActionLoading(id)
    try {
      await startEnvironment(id)
      refetch()
    } catch (err) {
      console.error('Failed to start environment:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleStop = async (id: string) => {
    setActionLoading(id)
    try {
      await stopEnvironment(id)
      refetch()
    } catch (err) {
      console.error('Failed to stop environment:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const statusLabel = (status: string) => {
    if (status === 'running') return t('environments.online')
    return t('environments.offline')
  }

  const statusClass = (status: string) => {
    if (status === 'running') return 'bg-emerald-900/30 text-emerald-500 border-emerald-500/30'
    return 'bg-slate-900/50 text-slate-500 border-slate-700'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-slate-100">{t('environments.title')}</h2>
          <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">{t('environments.subtitle')}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.3)] flex items-center gap-1.5"
          >
            <Plus size={14} /> {t('environments.addEnv')}
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center text-slate-500 py-12">{t('environments.loading')}</div>
      )}
      {error && (
        <div className="text-center text-red-400 py-12">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {envs?.map(env => {
          const isLogExpanded = expandedLogs === env.id
          return (
          <div key={env.id} className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden relative">
            <div className="flex items-center justify-between p-5 border-b border-slate-800/50 bg-[#05070a]/50">
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-lg border ${
                  env.mode === 'docker' ? 'bg-cyan-950/20 text-cyan-400 border-cyan-500/30 ring-1 ring-cyan-500/10' : 'bg-slate-900/50 text-slate-400 border-slate-700'
                }`}>
                  {env.mode === 'docker' ? <Server size={20} /> : <Monitor size={20} />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center uppercase tracking-wider">
                    {env.name}
                    <span className={`ml-3 text-[10px] px-2 py-0.5 rounded font-bold tracking-widest border ${statusClass(env.status)}`}>
                      {statusLabel(env.status)}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1 flex items-center font-mono">
                    <span className="uppercase text-slate-400">{env.mode} Context</span>
                    <span className="mx-2">•</span>
                    ID: {env.id}
                    <span className="mx-2">•</span>
                    Tabs: {env.tabCount}
                  </p>
                </div>
              </div>
              
              <div className="flex space-x-2 text-[10px] font-bold uppercase tracking-wider">
                {env.status === 'stopped' ? (
                  <button
                    onClick={() => handleStart(env.id)}
                    disabled={actionLoading === env.id}
                    className="flex items-center space-x-1.5 text-emerald-400 hover:text-emerald-300 transition-colors px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 hover:border-emerald-500/50"
                  >
                    <Play size={12} />
                    <span>{actionLoading === env.id ? '...' : t('environments.start')}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleStop(env.id)}
                    disabled={actionLoading === env.id}
                    className="flex items-center space-x-1.5 text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 hover:border-red-500/50"
                  >
                    <Square size={12} />
                    <span>{actionLoading === env.id ? '...' : t('environments.stop')}</span>
                  </button>
                )}
                {env.endpoint && (
                  <a
                    href={env.endpoint}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center space-x-1.5 text-slate-400 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/50"
                  >
                    <Terminal size={12} />
                    <span>CDP</span>
                  </a>
                )}
                {env.vncUrl && (
                  <a
                    href={env.vncUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1.5 text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-800/50 rounded px-2 py-1 transition-colors"
                  >
                    {t('environments.vnc') || 'VNC'}
                  </a>
                )}
                <button
                  onClick={() => setExpandedLogs(expandedLogs === env.id ? null : env.id)}
                  className="flex items-center space-x-1.5 text-slate-400 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/50"
                >
                  <ScrollText size={12} />
                  <span>{t('environments.logs')}</span>
                </button>
              </div>
            </div>

            <div className="p-5 flex items-start justify-between">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                  <Chrome size={12} className="mr-2 text-cyan-500" />
                  {t('environments.sharedProfiles')}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {env.profileId ? (
                    <span className="inline-flex items-center px-2.5 py-1 bg-slate-800 border border-slate-700 text-[10px] font-medium text-slate-300 rounded uppercase tracking-wide">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mr-2 shadow-[0_0_8px_#06b6d4]"></div>
                      {env.profileId}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-600 italic">{t('environments.noProfile')}</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-3 font-mono">
                  {t('environments.profileDesc')}
                </p>
              </div>
              
              <div className="text-right">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{t('environments.lastPing')}</p>
                <p className="text-xs font-mono text-cyan-400 mt-1">{new Date(env.updatedAt).toLocaleString()}</p>
              </div>
            </div>

            {isLogExpanded && (
              <div className="border-t border-slate-800/50 bg-[#05070a]/30 p-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                  <ScrollText size={12} className="mr-2 text-cyan-500" />
                  {t('environments.envLogs')}
                </h4>
                <div className="bg-[#05070a] border border-slate-800/50 rounded-lg p-3 font-mono text-[10px] max-h-48 overflow-y-auto space-y-1">
                  <div className="text-slate-600">
                    [{new Date(env.updatedAt).toISOString()}] Environment {env.id} — status={env.status} mode={env.mode}
                  </div>
                  <div className="text-slate-500">
                    Tab Count: {env.tabCount} | Profile: {env.profileId || 'none'}
                  </div>
                  {env.endpoint && (
                    <div className="text-cyan-500">
                      CDP Endpoint: {env.endpoint}
                    </div>
                  )}
                  <div className="text-slate-600">
                    Updated: {new Date(env.updatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>
          )})}
        {envs && envs.length === 0 && (
          <div className="text-center text-slate-500 py-12 text-xs">{t('environments.noEnvironments')}</div>
        )}
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#05070a] border border-slate-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">{t('environments.createEnv')}</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('environments.envId')}</label>
                <input
                  type="text"
                  value={form.id}
                  onChange={e => setForm({ ...form, id: e.target.value })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="auto-generated"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('environments.envName')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="My Environment"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('environments.mode')}</label>
                <select
                  value={form.mode}
                  onChange={e => setForm({ ...form, mode: e.target.value as 'native' | 'docker' })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                >
                  <option value="native">Native</option>
                  <option value="docker">Docker</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('environments.profileName')}</label>
                <input
                  type="text"
                  value={form.profileId}
                  onChange={e => setForm({ ...form, profileId: e.target.value })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="default"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={form.headless}
                    onChange={e => setForm({ ...form, headless: e.target.checked })}
                    className="rounded"
                  />
                  Headless
                </label>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800/50 mt-6">
                <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 hover:bg-slate-800/50 rounded text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider transition-colors">{t('environments.cancel')}</button>
                <button
                  onClick={handleCreate}
                  className="px-5 py-2 rounded bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500 shadow-[0_0_15px_rgba(8,145,178,0.3)] uppercase tracking-wider transition-all"
                >
                  {t('environments.create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}