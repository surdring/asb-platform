import React, { useState, useEffect } from 'react'
import { Activity, Play, X, RefreshCw, Clock, CheckCircle, XCircle, Loader, ArrowRight, StopCircle, ScrollText, Package, Download, Eye, Image } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../../hooks/useApi'
import { fetchTasks, runTask } from '../../api/tasks'
import { fetchArtifacts, downloadArtifact } from '../../api/client'
import type { Task, TaskRunRequest, Artifact } from '../../types/api'

function TextPreview({ artifactId }: { artifactId: string }) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/download`)
      .then(res => res.text())
      .then(t => { if (!cancelled) { setText(t); setLoading(false) } })
      .catch(() => { if (!cancelled) { setText(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [artifactId])

  if (loading) return <span className="text-slate-600">Loading...</span>
  if (text === null) return <span className="text-red-500">Failed to load</span>
  return <>{text.length > 2000 ? text.slice(0, 2000) + '\n...' : text}</>
}

export function Tasks() {
  const { t } = useTranslation()
  const { data: tasks, loading, error, refetch } = useApi(() => fetchTasks(20), [])
  const [isRunModalOpen, setIsRunModalOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [rerunId, setRerunId] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null)
  const [expandedArtifacts, setExpandedArtifacts] = useState<string | null>(null)
  const [artifactMap, setArtifactMap] = useState<Record<string, Artifact[]>>({})
  const [loadingArtifacts, setLoadingArtifacts] = useState<string | null>(null)
  const [form, setForm] = useState<TaskRunRequest>({
    leaseId: '',
    skillId: '',
    action: '',
    input: {},
    name: ''
  })

  const handleRun = async () => {
    setRunning(true)
    try {
      await runTask(form)
      setIsRunModalOpen(false)
      setForm({ leaseId: '', skillId: '', action: '', input: {}, name: '' })
      refetch()
    } catch (err) {
      console.error('Failed to run task:', err)
    } finally {
      setRunning(false)
    }
  }

  const handleRerun = async (task: Task) => {
    setRerunId(task.id)
    try {
      await runTask({
        leaseId: task.leaseId,
        skillId: task.skillId,
        action: task.action,
        input: task.input || {},
        name: `${task.name} (re-run)`
      })
      refetch()
    } catch (err) {
      console.error('Failed to re-run task:', err)
    } finally {
      setRerunId(null)
    }
  }

  const handleFetchArtifacts = async (task: Task) => {
    if (expandedArtifacts === task.id) {
      setExpandedArtifacts(null)
      return
    }
    setExpandedArtifacts(task.id)
    if (artifactMap[task.id]) return
    setLoadingArtifacts(task.id)
    try {
      const data = await fetchArtifacts({ leaseId: task.leaseId, limit: 50 })
      setArtifactMap(prev => ({ ...prev, [task.id]: data as Artifact[] }))
    } catch (err) {
      console.error('Failed to fetch artifacts:', err)
    } finally {
      setLoadingArtifacts(null)
    }
  }

  const handleDownload = (artifactId: string) => {
    window.open(`/api/artifacts/${encodeURIComponent(artifactId)}/download`, '_blank')
  }

  const isImageType = (artifact: Artifact) => {
    if (artifact.kind === 'screenshot') return true
    if (artifact.mimeType && /^image\/(png|jpeg|gif|webp|svg)/i.test(artifact.mimeType)) return true
    return false
  }

  const isTextType = (artifact: Artifact) => {
    if (artifact.mimeType && /^(text\/|application\/json)/i.test(artifact.mimeType)) return true
    return false
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader size={12} className="animate-spin" />
      case 'completed': return <CheckCircle size={12} />
      case 'failed': return <XCircle size={12} />
      default: return <Clock size={12} />
    }
  }

  const statusClass = (status: string) => {
    switch (status) {
      case 'running': return 'bg-amber-900/30 text-amber-500 border-amber-500/30'
      case 'completed': return 'bg-emerald-900/30 text-emerald-500 border-emerald-500/30'
      case 'failed': return 'bg-red-900/30 text-red-500 border-red-500/30'
      default: return 'bg-slate-900/50 text-slate-500 border-slate-700'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-slate-100">{t('tasks.title')}</h2>
          <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">{t('tasks.subtitle')}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="px-3 py-1.5 rounded-md bg-slate-800/50 border border-slate-700/50 text-slate-400 text-xs font-bold hover:text-slate-200 flex items-center gap-1.5">
            <RefreshCw size={12} /> {t('tasks.refresh')}
          </button>
          <button
            onClick={() => setIsRunModalOpen(true)}
            className="px-4 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.3)] flex items-center gap-1.5"
          >
            <Play size={14} /> {t('tasks.runTask')}
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center text-slate-500 py-12">{t('tasks.loading')}</div>
      )}
      {error && (
        <div className="text-center text-red-400 py-12">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {tasks?.map(task => {
          const isExpanded = expandedLogs === task.id
          return (
          <div key={task.id} className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden relative">
            <div className="flex items-center justify-between p-5 border-b border-slate-800/50 bg-[#05070a]/50">
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-lg border ${
                  task.status === 'running' ? 'bg-amber-950/20 text-amber-400 border-amber-500/30 ring-1 ring-amber-500/10' :
                  task.status === 'completed' ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-500/10' :
                  'bg-red-950/20 text-red-400 border-red-500/30 ring-1 ring-red-500/10'
                }`}>
                  <Activity size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center uppercase tracking-wider">
                    {task.name}
                    <span className={`ml-3 text-[10px] px-2 py-0.5 rounded font-bold tracking-widest border flex items-center gap-1 ${statusClass(task.status)}`}>
                      {statusIcon(task.status)}
                      {task.status}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1 flex items-center font-mono">
                    <span className="uppercase text-slate-400">Skill: {task.skillId}</span>
                    <span className="mx-2">•</span>
                    Action: {task.action}
                    <span className="mx-2">•</span>
                    Lease: {task.leaseId}
                  </p>
                </div>
              </div>
              <div className="flex space-x-2 text-[10px] font-bold uppercase tracking-wider">
                <button
                  onClick={() => setExpandedLogs(isExpanded ? null : task.id)}
                  className="flex items-center space-x-1.5 text-slate-400 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/50"
                >
                  <ScrollText size={12} />
                  <span>{t('tasks.logs')}</span>
                </button>
                <button
                  onClick={() => handleFetchArtifacts(task)}
                  className="flex items-center space-x-1.5 text-slate-400 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/50"
                >
                  <Package size={12} />
                  <span>{t('tasks.artifacts')}</span>
                </button>
                <button
                  onClick={() => handleRerun(task)}
                  disabled={rerunId === task.id}
                  className="flex items-center space-x-1.5 text-cyan-400 hover:text-cyan-300 transition-colors px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/50"
                >
                  <ArrowRight size={12} />
                  <span>{rerunId === task.id ? '...' : t('tasks.rerun')}</span>
                </button>
                <button
                  onClick={() => {}}
                  className="flex items-center space-x-1.5 text-slate-500 px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 cursor-not-allowed"
                  title={t('tasks.haltDisabled')}
                >
                  <StopCircle size={12} />
                  <span>{t('tasks.halt')}</span>
                </button>
              </div>
            </div>

            <div className="p-5 flex items-start justify-between">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                  <Activity size={12} className="mr-2 text-cyan-500" />
                  {t('tasks.taskDetails')}
                </h4>
                <div className="space-y-1.5">
                  {task.input && Object.keys(task.input).length > 0 && (
                    <p className="text-[10px] text-slate-500 font-mono">
                      <span className="text-slate-400">Input:</span> {JSON.stringify(task.input)}
                    </p>
                  )}
                  {task.result && (
                    <p className="text-[10px] text-slate-500 font-mono">
                      <span className="text-slate-400">Result:</span> {JSON.stringify(task.result)}
                    </p>
                  )}
                  {task.error && (
                    <p className="text-[10px] text-red-400 font-mono">
                      <span className="text-red-500">Error:</span> {task.error}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-right space-y-2">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{t('tasks.started')}</p>
                  <p className="text-xs font-mono text-cyan-400 mt-1">{new Date(task.startedAt).toLocaleString()}</p>
                </div>
                {task.completedAt && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{t('tasks.completed')}</p>
                    <p className="text-xs font-mono text-emerald-400 mt-1">{new Date(task.completedAt).toLocaleString()}</p>
                  </div>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-slate-800/50 bg-[#05070a]/30 p-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                  <ScrollText size={12} className="mr-2 text-cyan-500" />
                  {t('tasks.liveLogs')}
                </h4>
                <div className="bg-[#05070a] border border-slate-800/50 rounded-lg p-3 font-mono text-[10px] max-h-48 overflow-y-auto space-y-1">
                  <div className="text-slate-600">
                    [{new Date(task.startedAt).toISOString()}] Task {task.id} started — skill={task.skillId} action={task.action}
                  </div>
                  {task.result && (
                    <div className="text-emerald-500">
                      [{new Date(task.completedAt || task.startedAt).toISOString()}] Result: {JSON.stringify(task.result).slice(0, 200)}
                    </div>
                  )}
                  {task.error && (
                    <div className="text-red-400">
                      [{new Date(task.completedAt || task.startedAt).toISOString()}] Error: {task.error}
                    </div>
                  )}
                  {!task.result && !task.error && (
                    <div className="text-slate-500">{t('tasks.noLogEntries')}</div>
                  )}
                </div>
              </div>
            )}

            {expandedArtifacts === task.id && (
              <div className="border-t border-slate-800/50 bg-[#05070a]/30 p-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                  <Package size={12} className="mr-2 text-cyan-500" />
                  {t('tasks.artifacts')}
                </h4>
                {loadingArtifacts === task.id && (
                  <div className="text-center text-slate-500 py-4">
                    <Loader size={14} className="animate-spin mx-auto mb-1" />
                    <span className="text-[10px]">{t('tasks.loading')}</span>
                  </div>
                )}
                {!loadingArtifacts && artifactMap[task.id] && artifactMap[task.id].length === 0 && (
                  <div className="text-center text-slate-500 py-4 text-[10px]">{t('tasks.noArtifacts')}</div>
                )}
                {!loadingArtifacts && artifactMap[task.id] && artifactMap[task.id].length > 0 && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {artifactMap[task.id].map(artifact => (
                      <div key={artifact.id} className="bg-[#05070a] border border-slate-800/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {isImageType(artifact) ? <Image size={12} className="text-cyan-400" /> : <Package size={12} className="text-slate-400" />}
                            <span className="text-[10px] font-bold text-slate-300 uppercase">{artifact.kind}</span>
                            <span className="text-[10px] text-slate-500">{artifact.mimeType || 'unknown'}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">{new Date(artifact.createdAt).toLocaleString()}</span>
                        </div>
                        {isImageType(artifact) && (
                          <div className="mb-2">
                            <img
                              src={`/api/artifacts/${encodeURIComponent(artifact.id)}/download`}
                              alt={artifact.kind}
                              className="max-w-full max-h-64 rounded border border-slate-700/50 object-contain"
                              loading="lazy"
                            />
                          </div>
                        )}
                        {isTextType(artifact) && (
                          <div className="mb-2 bg-slate-950 rounded border border-slate-700/50 p-2 font-mono text-[10px] text-slate-400 max-h-32 overflow-y-auto">
                            <TextPreview artifactId={artifact.id} />
                          </div>
                        )}
                        <div className="flex gap-2">
                          {isImageType(artifact) && (
                            <button
                              onClick={() => window.open(`/api/artifacts/${encodeURIComponent(artifact.id)}/download`, '_blank')}
                              className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50"
                            >
                              <Eye size={10} /> {t('tasks.previewArtifact')}
                            </button>
                          )}
                          <button
                            onClick={() => handleDownload(artifact.id)}
                            className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50"
                          >
                            <Download size={10} /> {t('tasks.downloadArtifact')}
                          </button>
                          {artifact.bytes != null && (
                            <span className="text-[10px] text-slate-500 self-center ml-auto">
                              {artifact.bytes > 1024 ? `${(artifact.bytes / 1024).toFixed(1)} KB` : `${artifact.bytes} B`}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )})}
        {tasks && tasks.length === 0 && (
          <div className="text-center text-slate-500 py-12 text-xs">{t('tasks.noTasks')}</div>
        )}
      </div>

      {isRunModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#05070a] border border-slate-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">{t('tasks.runTask')}</h3>
              <button onClick={() => setIsRunModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('tasks.leaseId')}</label>
                <input
                  type="text"
                  value={form.leaseId}
                  onChange={e => setForm({ ...form, leaseId: e.target.value })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="lease-xxx"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('tasks.skillId')}</label>
                <input
                  type="text"
                  value={form.skillId}
                  onChange={e => setForm({ ...form, skillId: e.target.value })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="amazon"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('tasks.action')}</label>
                <input
                  type="text"
                  value={form.action}
                  onChange={e => setForm({ ...form, action: e.target.value })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="search"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('tasks.taskName')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="My Task"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800/50 mt-6">
                <button onClick={() => setIsRunModalOpen(false)} className="px-4 py-2 hover:bg-slate-800/50 rounded text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider transition-colors">{t('tasks.cancel')}</button>
                <button
                  onClick={handleRun}
                  disabled={running}
                  className="px-5 py-2 rounded bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500 shadow-[0_0_15px_rgba(8,145,178,0.3)] uppercase tracking-wider transition-all flex items-center gap-1.5"
                >
                  {running && <Loader size={12} className="animate-spin" />}
                  {running ? t('tasks.running') : t('tasks.run')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}