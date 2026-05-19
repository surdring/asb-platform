import React, { useEffect } from 'react'
import { Server, Network, Boxes, Activity, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../../hooks/useApi'
import { fetchHealth, fetchDbStatus } from '../../api/misc'
import { fetchLeases } from '../../api/leases'
import { fetchTasks } from '../../api/tasks'
import { fetchSkills } from '../../api/skills'
import type { DbStatus } from '../../types/api'

export function Dashboard() {
  const { t } = useTranslation()
  const { data: health, loading: healthLoading, refetch: refetchHealth } = useApi(fetchHealth, [])
  const { data: leases, refetch: refetchLeases } = useApi(fetchLeases, [])
  const { data: skills, refetch: refetchSkills } = useApi(fetchSkills, [])
  const { data: tasks, refetch: refetchTasks } = useApi(() => fetchTasks(5), [])
  const { data: dbStatus } = useApi(fetchDbStatus, [])

  useEffect(() => {
    const source = new EventSource('/api/events')
    const refreshEvents = [
      'environment.created', 'environment.started', 'environment.stopped',
      'lease.created', 'lease.released', 'lease.expired',
      'task.completed', 'task.failed', 'skills.reloaded'
    ]

    refreshEvents.forEach(type => {
      source.addEventListener(type, () => {
        refetchHealth()
        refetchLeases()
        refetchSkills()
        refetchTasks()
      })
    })

    source.onerror = () => source.close()
    return () => source.close()
  }, [refetchHealth, refetchLeases, refetchSkills, refetchTasks])

  const onlineEnvs = health?.environments ?? 0
  const activeLeases = leases?.filter(l => l.status === 'active').length ?? 0
  const totalLeases = leases?.length ?? 0
  const registeredSkills = skills?.length ?? 0
  const runningTasks = tasks?.filter(t => t.status === 'running').length ?? 0

  const stats = [
    { label: t('dashboard.onlineEnvs'), value: onlineEnvs, total: health?.database?.environments, icon: Server, color: 'text-cyan-400', bg: 'bg-cyan-900/30 border border-cyan-500/30 ring-1 ring-cyan-500/10' },
    { label: t('dashboard.rentedTabs'), value: activeLeases, total: totalLeases, icon: Network, color: 'text-emerald-400', bg: 'bg-emerald-900/30 border border-emerald-500/30 ring-1 ring-emerald-500/10' },
    { label: t('dashboard.registeredSkills'), value: registeredSkills, icon: Boxes, color: 'text-blue-400', bg: 'bg-blue-900/30 border border-blue-500/30 ring-1 ring-blue-500/10' },
    { label: t('dashboard.runningTasks'), value: runningTasks, icon: Activity, color: 'text-amber-400', bg: 'bg-amber-900/30 border border-amber-500/30 ring-1 ring-amber-500/10' },
  ]

  const dbTables = [
    { label: 'Environments', value: dbStatus?.environments, color: 'text-cyan-400' },
    { label: 'Skills', value: dbStatus?.skills, color: 'text-blue-400' },
    { label: 'Leases', value: dbStatus?.leases, color: 'text-emerald-400' },
    { label: 'Tasks', value: dbStatus?.tasks, color: 'text-amber-400' },
    { label: 'Collected Items', value: dbStatus?.collectedItems, color: 'text-purple-400' },
    { label: 'Logs', value: dbStatus?.logs, color: 'text-slate-300' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-100">{t('dashboard.platformOverview')}</h2>
        <div className="flex items-center space-x-2 text-sm text-slate-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
          </span>
          <span className="text-[10px] font-mono tracking-wider uppercase text-emerald-500">
            {healthLoading ? t('dashboard.connecting') : health?.ok ? t('dashboard.brokerServiceOnline') : t('dashboard.brokerServiceOffline')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon
          return (
            <div key={idx} className={`rounded-xl p-4 relative overflow-hidden flex flex-col ${stat.bg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-widest">{stat.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${stat.color}`}>
                    {stat.value}
                    {stat.total !== undefined && <span className="text-sm font-mono text-slate-600 font-normal ml-1">/ {stat.total}</span>}
                  </p>
                </div>
                <div className={`p-2 rounded-lg bg-[#05070a]/50 border border-slate-800/50 ${stat.color}`}>
                  <Icon size={20} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
          <h3 className="text-sm font-bold text-slate-100 mb-4 uppercase tracking-wider">{t('dashboard.architectureTopology')}</h3>
          <div className="bg-[#05070a]/50 rounded-lg p-6 flex flex-col items-center justify-center border border-slate-800/50">
             <div className="flex space-x-12 items-center">
               <div className="text-center">
                 <div className="w-14 h-14 bg-cyan-900/30 text-cyan-400 rounded-xl border border-cyan-500/30 flex items-center justify-center mx-auto mb-2 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                   <Boxes size={24} />
                 </div>
                 <span className="text-[10px] font-bold text-slate-400 uppercase">{t('dashboard.agentSkills')}</span>
               </div>

               <div className="h-0.5 w-16 bg-slate-800 relative">
                 <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[9px] text-slate-500 bg-[#05070a] px-1 border border-slate-800 rounded font-mono">{t('dashboard.jsonRpc')}</div>
               </div>

               <div className="text-center">
                 <div className="w-16 h-16 bg-blue-900/30 text-blue-400 rounded-full border border-blue-500/30 flex items-center justify-center mx-auto mb-2 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                   <Network size={28} />
                 </div>
                 <span className="text-[10px] font-bold text-slate-400 uppercase">{t('dashboard.brokerService')}</span>
               </div>

               <div className="h-0.5 w-16 bg-slate-800 relative">
                 <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[9px] text-slate-500 bg-[#05070a] px-1 border border-slate-800 rounded font-mono">{t('dashboard.webSocket')}</div>
               </div>

               <div className="text-center">
                 <div className="w-14 h-14 bg-emerald-900/30 text-emerald-400 rounded-xl border border-emerald-500/30 flex items-center justify-center mx-auto mb-2 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                   <Server size={24} />
                 </div>
                 <span className="text-[10px] font-bold text-slate-400 uppercase">{t('dashboard.dualModeBrowser')}</span>
               </div>
             </div>

             <div className="mt-8 text-[10px] text-slate-500 text-center max-w-sm leading-relaxed">
               {t('dashboard.brokerDesc')}
             </div>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
          <h3 className="text-sm font-bold text-slate-100 mb-4 uppercase tracking-wider">{t('dashboard.recentExecution')}</h3>
          <div className="space-y-3">
            {tasks && tasks.length > 0 ? tasks.slice(0, 5).map(task => (
              <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-[#05070a]/50 border border-slate-800/50">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${task.status === 'running' ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_#f59e0b]' : task.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'}`}></div>
                  <div>
                    <p className="text-xs font-bold text-slate-200">{task.name}</p>
                    <p className="text-[10px] font-mono text-slate-500 mt-1">Skill: {task.skillId}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold tracking-wider border ${
                    task.status === 'running' ? 'bg-amber-900/30 text-amber-500 border-amber-500/30' :
                    task.status === 'completed' ? 'bg-emerald-900/30 text-emerald-500 border-emerald-500/30' :
                    'bg-red-900/30 text-red-500 border-red-500/30'
                  }`}>
                    {task.status}
                  </span>
                  <p className="text-[9px] font-mono text-slate-600 mt-1">{new Date(task.startedAt).toLocaleTimeString()}</p>
                </div>
              </div>
            )) : (
              <div className="text-center text-slate-500 text-xs py-8">{t('dashboard.noRecentTasks')}</div>
            )}
          </div>
        </div>
      </div>

      {dbStatus && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b border-slate-800/50 bg-[#05070a]/50">
            <Database size={14} className="text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">{t('dashboard.dbStatus')}</h3>
          </div>
          <div className="p-4 grid grid-cols-3 md:grid-cols-6 gap-3">
            {dbTables.map(table => (
              <div key={table.label} className="bg-[#05070a]/50 border border-slate-800/50 rounded-lg p-3 text-center">
                <p className={`text-xl font-bold font-mono ${table.color}`}>{table.value ?? '-'}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{table.label}</p>
              </div>
            ))}
          </div>
          <div className="px-4 pb-3 text-[10px] text-slate-600 font-mono truncate">
            {dbStatus.path}
          </div>
        </div>
      )}
    </div>
  )
}