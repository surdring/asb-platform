import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Network, Link, Unlink, Clock, Plus, X, RefreshCw, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../../hooks/useApi'
import { fetchLeases, createLease, renewLease, releaseLease } from '../../api/leases'
import type { Lease, CreateLeaseRequest } from '../../types/api'

interface BusEvent {
  id: number
  type: string
  data: string
  receivedAt: string
}

const EVENT_LABELS: Record<string, string> = {
  'environment.created': 'ENV_CREATED',
  'environment.started': 'ENV_STARTED',
  'environment.stopped': 'ENV_STOPPED',
  'lease.created': 'LEASE_CREATED',
  'lease.renewed': 'LEASE_RENEWED',
  'lease.released': 'LEASE_RELEASED',
  'lease.expired': 'LEASE_EXPIRED',
  'task.started': 'TASK_STARTED',
  'task.completed': 'TASK_COMPLETED',
  'task.failed': 'TASK_FAILED',
  'skills.reloaded': 'SKILLS_RELOADED'
}

export function Broker() {
  const { t } = useTranslation()
  const { data: leases, loading, error, refetch } = useApi(fetchLeases, [])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [form, setForm] = useState<CreateLeaseRequest>({
    agentId: '',
    environmentId: '',
    metadata: {}
  })
  const [busEvents, setBusEvents] = useState<BusEvent[]>([])
  const [msgRate, setMsgRate] = useState(0)
  const eventIdRef = useRef(0)
  const rateRef = useRef(0)
  const rateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleCreate = async () => {
    try {
      await createLease(form)
      setIsCreateModalOpen(false)
      setForm({ agentId: '', environmentId: '', metadata: {} })
      refetch()
    } catch (err) {
      console.error('Failed to create lease:', err)
    }
  }

  const handleRenew = async (id: string) => {
    setActionLoading(id)
    try {
      await renewLease(id)
      refetch()
    } catch (err) {
      console.error('Failed to renew lease:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleRelease = async (id: string) => {
    setActionLoading(id)
    try {
      await releaseLease(id)
      refetch()
    } catch (err) {
      console.error('Failed to release lease:', err)
    } finally {
      setActionLoading(null)
    }
  }

  useEffect(() => {
    rateTimerRef.current = setInterval(() => {
      setMsgRate(rateRef.current)
      rateRef.current = 0
    }, 1000)

    const source = new EventSource('/api/events')
    const eventTypes = Object.keys(EVENT_LABELS)

    eventTypes.forEach(type => {
      source.addEventListener(type, (e: MessageEvent) => {
        rateRef.current++
        try {
          const data = JSON.parse(e.data)
          setBusEvents(prev => [{
            id: eventIdRef.current++,
            type,
            data: JSON.stringify(data, null, 2),
            receivedAt: new Date().toISOString()
          }, ...prev].slice(0, 50))
        } catch {
          setBusEvents(prev => [{
            id: eventIdRef.current++,
            type,
            data: e.data || '',
            receivedAt: new Date().toISOString()
          }, ...prev].slice(0, 50))
        }
      })
    })

    source.onerror = () => {
      source.close()
    }

    return () => {
      source.close()
      if (rateTimerRef.current) clearInterval(rateTimerRef.current)
    }
  }, [])

  const statusLabel = (status: string) => {
    if (status === 'active') return t('broker.active')
    if (status === 'released') return t('broker.released')
    return t('broker.expired')
  }

  const statusClass = (status: string) => {
    if (status === 'active') return 'bg-emerald-900/30 text-emerald-500 border-emerald-500/30'
    if (status === 'released') return 'bg-slate-900/50 text-slate-500 border-slate-700'
    return 'bg-red-900/30 text-red-500 border-red-500/30'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-slate-100">{t('broker.title')}</h2>
          <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">{t('broker.subtitle')}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="px-3 py-1.5 rounded-md bg-slate-800/50 border border-slate-700/50 text-slate-400 text-xs font-bold hover:text-slate-200 flex items-center gap-1.5">
            <RefreshCw size={12} /> {t('broker.refresh')}
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.3)] flex items-center gap-1.5"
          >
            <Plus size={14} /> {t('broker.createLease')}
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center text-slate-500 py-12">{t('broker.loading')}</div>
      )}
      {error && (
        <div className="text-center text-red-400 py-12">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {leases?.map(lease => (
          <div key={lease.id} className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden relative">
            <div className="flex items-center justify-between p-5 border-b border-slate-800/50 bg-[#05070a]/50">
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-lg border ${
                  lease.status === 'active' ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-500/10' :
                  lease.status === 'released' ? 'bg-slate-900/50 text-slate-400 border-slate-700' :
                  'bg-red-950/20 text-red-400 border-red-500/30 ring-1 ring-red-500/10'
                }`}>
                  {lease.status === 'active' ? <Link size={20} /> : <Unlink size={20} />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center uppercase tracking-wider">
                    {lease.agentId}
                    <span className={`ml-3 text-[10px] px-2 py-0.5 rounded font-bold tracking-widest border ${statusClass(lease.status)}`}>
                      {statusLabel(lease.status)}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1 flex items-center font-mono">
                    <span className="uppercase text-slate-400">Env: {lease.environmentId}</span>
                    <span className="mx-2">•</span>
                    Tab: {lease.tabId}
                    <span className="mx-2">•</span>
                    Group: {lease.groupId}
                  </p>
                </div>
              </div>
              
              <div className="flex space-x-2 text-[10px] font-bold uppercase tracking-wider">
                {lease.status === 'active' && (
                  <>
                    <button
                      onClick={() => handleRenew(lease.id)}
                      disabled={actionLoading === lease.id}
                      className="flex items-center space-x-1.5 text-cyan-400 hover:text-cyan-300 transition-colors px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/50"
                    >
                      <Clock size={12} />
                      <span>{actionLoading === lease.id ? '...' : t('broker.renew')}</span>
                    </button>
                    <button
                      onClick={() => handleRelease(lease.id)}
                      disabled={actionLoading === lease.id}
                      className="flex items-center space-x-1.5 text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 hover:border-red-500/50"
                    >
                      <Unlink size={12} />
                      <span>{actionLoading === lease.id ? '...' : t('broker.release')}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="p-5 flex items-start justify-between">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                  <Network size={12} className="mr-2 text-cyan-500" />
                  {t('broker.leaseDetails')}
                </h4>
                <div className="space-y-1.5">
                  <p className="text-[10px] text-slate-500 font-mono">
                    <span className="text-slate-400">Session:</span> {lease.sessionId}
                  </p>
                  {lease.browserContextId && (
                    <p className="text-[10px] text-slate-500 font-mono">
                      <span className="text-slate-400">Browser Context:</span> {lease.browserContextId}
                    </p>
                  )}
                  {lease.url && (
                    <p className="text-[10px] text-slate-500 font-mono">
                      <span className="text-slate-400">URL:</span> {lease.url}
                    </p>
                  )}
                  {lease.metadata && Object.keys(lease.metadata).length > 0 && (
                    <p className="text-[10px] text-slate-500 font-mono">
                      <span className="text-slate-400">Metadata:</span> {JSON.stringify(lease.metadata)}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="text-right space-y-2">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{t('broker.created')}</p>
                  <p className="text-xs font-mono text-cyan-400 mt-1">{new Date(lease.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{t('broker.expires')}</p>
                  <p className="text-xs font-mono text-amber-400 mt-1">{new Date(lease.expiresAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
        {leases && leases.length === 0 && (
          <div className="text-center text-slate-500 py-12 text-xs">{t('broker.noLeases')}</div>
        )}
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800/50 bg-[#05070a]/50">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">{t('broker.commandBus')}</h3>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <span className="text-emerald-400">{t('broker.connected')}</span>
            <span className="text-slate-500">{msgRate} {t('broker.msgRate')}</span>
            <span className="text-slate-600">{busEvents.length} events</span>
          </div>
        </div>
        <div className="p-3 max-h-64 overflow-y-auto space-y-1 font-mono">
          {busEvents.length === 0 ? (
            <div className="text-center text-slate-600 text-[10px] py-4">{t('broker.noEvents')}</div>
          ) : (
            busEvents.map(event => (
              <div key={event.id} className="flex items-start gap-2 py-1 border-b border-slate-800/30 last:border-0">
                <span className="text-[10px] text-slate-500 shrink-0 w-16">{new Date(event.receivedAt).toLocaleTimeString()}</span>
                <span className={`text-[10px] font-bold shrink-0 w-32 ${
                  event.type.includes('failed') ? 'text-red-400' :
                  event.type.includes('completed') ? 'text-emerald-400' :
                  'text-cyan-400'
                }`}>
                  {EVENT_LABELS[event.type] || event.type}
                </span>
                <span className="text-[10px] text-slate-500 truncate">{event.data.slice(0, 120)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#05070a] border border-slate-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">{t('broker.createLease')}</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('broker.agentId')}</label>
                <input
                  type="text"
                  value={form.agentId}
                  onChange={e => setForm({ ...form, agentId: e.target.value })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="agent-001"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('broker.environmentId')}</label>
                <input
                  type="text"
                  value={form.environmentId}
                  onChange={e => setForm({ ...form, environmentId: e.target.value })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="env-001"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('broker.url')}</label>
                <input
                  type="text"
                  value={form.url ?? ''}
                  onChange={e => setForm({ ...form, url: e.target.value || undefined })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">{t('broker.ttlMs')}</label>
                <input
                  type="number"
                  value={form.ttlMs ?? ''}
                  onChange={e => setForm({ ...form, ttlMs: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full bg-slate-900 shadow-inner border border-slate-700 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                  placeholder="60000"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800/50 mt-6">
                <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 hover:bg-slate-800/50 rounded text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider transition-colors">{t('broker.cancel')}</button>
                <button
                  onClick={handleCreate}
                  className="px-5 py-2 rounded bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500 shadow-[0_0_15px_rgba(8,145,178,0.3)] uppercase tracking-wider transition-all"
                >
                  {t('broker.create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}