import React, { useState } from 'react'
import { Boxes, Code, Globe, RefreshCw, ChevronDown, ChevronUp, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../../hooks/useApi'
import { fetchSkills, reloadSkills } from '../../api/skills'
import type { Skill } from '../../types/api'

export function Skills() {
  const { t } = useTranslation()
  const { data: skills, loading, error, refetch } = useApi(fetchSkills, [])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)

  const handleReload = async () => {
    setReloading(true)
    try {
      await reloadSkills()
      refetch()
    } catch (err) {
      console.error('Failed to reload skills:', err)
    } finally {
      setReloading(false)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-slate-100">{t('skills.title')}</h2>
          <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">{t('skills.subtitle')}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="px-3 py-1.5 rounded-md bg-slate-800/50 border border-slate-700/50 text-slate-400 text-xs font-bold hover:text-slate-200 flex items-center gap-1.5">
            <RefreshCw size={12} /> {t('skills.refresh')}
          </button>
          <button
            onClick={handleReload}
            disabled={reloading}
            className="px-4 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.3)] flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} /> {reloading ? t('skills.reloading') : t('skills.reload')}
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center text-slate-500 py-12">{t('skills.loading')}</div>
      )}
      {error && (
        <div className="text-center text-red-400 py-12">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {skills?.map(skill => {
          const isExpanded = expandedId === skill.id
          const actionEntries = Object.entries(skill.actions)
          const parserEntries = skill.parsers ? Object.entries(skill.parsers) : []
          return (
            <div key={skill.id} className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden relative">
              <div
                className="flex items-center justify-between p-5 border-b border-slate-800/50 bg-[#05070a]/50 cursor-pointer hover:bg-[#0a0f14]/50 transition-colors"
                onClick={() => toggleExpand(skill.id)}
              >
                <div className="flex items-center space-x-4">
                  <div className="p-3 rounded-lg border bg-cyan-950/20 text-cyan-400 border-cyan-500/30 ring-1 ring-cyan-500/10">
                    <Boxes size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200 flex items-center uppercase tracking-wider">
                      {skill.name}
                      <span className="ml-3 text-[10px] px-2 py-0.5 rounded font-bold tracking-widest border bg-slate-900/50 text-slate-500 border-slate-700">
                        v{skill.version}
                      </span>
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-1 flex items-center font-mono">
                      <span className="uppercase text-slate-400">{skill.platform}</span>
                      <span className="mx-2">•</span>
                      ID: {skill.id}
                      <span className="mx-2">•</span>
                      {actionEntries.length} actions
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold tracking-widest border bg-slate-900/50 text-slate-500 border-slate-700">
                    {skill.platform}
                  </span>
                  {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                </div>
              </div>

              {isExpanded && (
                <div className="p-5 space-y-4">
                  {Object.keys(skill.perception).length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center">
                        <Globe size={12} className="mr-2 text-cyan-500" />
                        {t('skills.perception')}
                      </h4>
                      <div className="bg-[#05070a]/50 border border-slate-800/50 rounded-lg p-3">
                        <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap">
                          {JSON.stringify(skill.perception, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {actionEntries.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center">
                        <Play size={12} className="mr-2 text-cyan-500" />
                        {t('skills.actions')}
                      </h4>
                      <div className="space-y-2">
                        {actionEntries.map(([actionName, actionDef], idx) => (
                          <div key={actionName} className="bg-[#05070a]/50 border border-slate-800/50 rounded-lg p-3 flex items-start space-x-3">
                            <span className="text-[10px] font-mono text-cyan-500 bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-500/20 mt-0.5">
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-[10px] font-bold text-slate-300 uppercase">{actionName}</span>
                                <span className="text-[10px] text-slate-500">- {actionDef.steps.length} steps</span>
                              </div>
                              <pre className="text-[10px] text-slate-500 font-mono whitespace-pre-wrap">
                                {JSON.stringify(actionDef, null, 2)}
                              </pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {parserEntries.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center">
                        <Code size={12} className="mr-2 text-cyan-500" />
                        {t('skills.parsers')}
                      </h4>
                      <div className="bg-[#05070a]/50 border border-slate-800/50 rounded-lg p-3">
                        <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap">
                          {JSON.stringify(skill.parsers, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {skills && skills.length === 0 && (
          <div className="text-center text-slate-500 py-12 text-xs">{t('skills.noSkills')}</div>
        )}
      </div>
    </div>
  )
}