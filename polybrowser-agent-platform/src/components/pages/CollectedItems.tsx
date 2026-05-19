import React, { useState } from 'react'
import { Package, ChevronDown, ChevronUp, RefreshCw, Filter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../../hooks/useApi'
import { fetchCollectedItems } from '../../api/misc'
import type { CollectedItem } from '../../types/api'

export function CollectedItems() {
  const { t } = useTranslation()
  const { data: items, loading, error, refetch } = useApi(() => fetchCollectedItems(100), [])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [platformFilter, setPlatformFilter] = useState('')
  const [skillFilter, setSkillFilter] = useState('')

  const platforms = [...new Set(items?.map(i => i.platform) || [])]
  const skillIds = [...new Set(items?.map(i => i.skillId) || [])]

  const filtered = items?.filter(item => {
    if (platformFilter && item.platform !== platformFilter) return false
    if (skillFilter && item.skillId !== skillFilter) return false
    return true
  })

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-slate-100">{t('collectedItems.title')}</h2>
          <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">{t('collectedItems.subtitle')}</span>
        </div>
        <button onClick={refetch} className="px-3 py-1.5 rounded-md bg-slate-800/50 border border-slate-700/50 text-slate-400 text-xs font-bold hover:text-slate-200 flex items-center gap-1.5">
          <RefreshCw size={12} /> {t('collectedItems.refresh')}
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-slate-500" />
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-slate-300 outline-none focus:border-cyan-500 font-mono"
          >
            <option value="">{t('collectedItems.allPlatforms')}</option>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={skillFilter}
            onChange={e => setSkillFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-slate-300 outline-none focus:border-cyan-500 font-mono"
          >
            <option value="">{t('collectedItems.allSkills')}</option>
            {skillIds.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {filtered && (
          <span className="text-[10px] text-slate-500 self-center ml-auto font-mono">{filtered.length} items</span>
        )}
      </div>

      {loading && (
        <div className="text-center text-slate-500 py-12">{t('collectedItems.loading')}</div>
      )}
      {error && (
        <div className="text-center text-red-400 py-12">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {filtered?.map(item => {
          const isExpanded = expandedId === item.id
          return (
            <div key={item.id} className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
              <div
                className="flex items-center justify-between p-4 border-b border-slate-800/50 bg-[#05070a]/50 cursor-pointer hover:bg-[#0a0f14]/50 transition-colors"
                onClick={() => toggleExpand(item.id)}
              >
                <div className="flex items-center space-x-4">
                  <div className="p-2.5 rounded-lg border bg-purple-950/20 text-purple-400 border-purple-500/30 ring-1 ring-purple-500/10">
                    <Package size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-200 font-mono">
                      {item.id}
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-1 flex items-center font-mono gap-2">
                      <span className="uppercase text-slate-400">{item.platform}</span>
                      <span>•</span>
                      <span>Skill: {item.skillId}</span>
                      <span>•</span>
                      <span>Task: {item.taskId}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-slate-500">{new Date(item.createdAt).toLocaleString()}</span>
                  {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </div>
              </div>

              {isExpanded && (
                <div className="p-4">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('collectedItems.dataItem')}</h4>
                  <div className="bg-[#05070a]/50 border border-slate-800/50 rounded-lg p-3">
                    <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-96">
                      {JSON.stringify(item.item, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtered && filtered.length === 0 && (
          <div className="text-center text-slate-500 py-12 text-xs">{t('collectedItems.noItems')}</div>
        )}
      </div>
    </div>
  )
}