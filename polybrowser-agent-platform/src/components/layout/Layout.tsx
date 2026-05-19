import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from '../Sidebar';
import { Dashboard } from '../pages/Dashboard';
import { Environments } from '../pages/Environments';
import { Broker } from '../pages/Broker';
import { Skills } from '../pages/Skills';
import { Tasks } from '../pages/Tasks';
import { CollectedItems } from '../pages/CollectedItems';
import { SystemLogs } from '../pages/SystemLogs';
import { SessionProbe } from '../pages/SessionProbe';
import { Activity, Globe, X, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Notification {
  id: number
  type: string
  message: string
  timestamp: string
}

const EVENT_LABELS: Record<string, string> = {
  'environment.created': 'Environment Created',
  'environment.started': 'Environment Started',
  'environment.stopped': 'Environment Stopped',
  'lease.created': 'Lease Created',
  'lease.renewed': 'Lease Renewed',
  'lease.released': 'Lease Released',
  'lease.expired': 'Lease Expired',
  'task.started': 'Task Started',
  'task.completed': 'Task Completed',
  'task.failed': 'Task Failed',
  'skills.reloaded': 'Skills Reloaded',
  'skill.loaded': 'Skill Loaded'
}

export function Layout() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [brokerOnline, setBrokerOnline] = useState(true);
  const nextIdRef = useRef(0);
  const { t, i18n } = useTranslation();

  const addNotification = useCallback((type: string, _data: unknown) => {
    const label = EVENT_LABELS[type] || type
    const isError = type === 'task.failed' || type === 'http.failed'
    const notification: Notification = {
      id: nextIdRef.current++,
      type: isError ? 'error' : 'info',
      message: label,
      timestamp: new Date().toLocaleTimeString()
    }
    setNotifications(prev => [notification, ...prev].slice(0, 5))
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }, [])

  useEffect(() => {
    const source = new EventSource('/api/events')
    const eventTypes = [
      'environment.created', 'environment.started', 'environment.stopped',
      'lease.created', 'lease.renewed', 'lease.released', 'lease.expired',
      'task.started', 'task.completed', 'task.failed',
      'skills.reloaded', 'skill.loaded', 'http.failed'
    ]

    eventTypes.forEach(type => {
      source.addEventListener(type, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          addNotification(type, data)
        } catch {
          addNotification(type, e.data)
        }
      })
    })

    source.onerror = () => {
      setBrokerOnline(false)
      source.close()
      setTimeout(() => {
        window.location.reload()
      }, 3000)
    }

    return () => source.close()
  }, [addNotification])

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en');
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard': return <Dashboard />;
      case 'environments': return <Environments />;
      case 'broker': return <Broker />;
      case 'skills': return <Skills />;
      case 'tasks': return <Tasks />;
      case 'collected-items': return <CollectedItems />;
      case 'system-logs': return <SystemLogs />;
      case 'session-probe': return <SessionProbe />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#05070a] text-slate-300 font-sans overflow-hidden">
      {/* Header Section */}
      <header className="h-16 border-b border-slate-800 flex shrink-0 items-center justify-between px-6 bg-[#0a0f1a] backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">
            POLYMORPH <span className="text-cyan-400 font-mono text-sm ml-2 px-2 py-0.5 bg-cyan-900/30 rounded border border-cyan-800/50">v2.4.0-BETA</span>
          </h1>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${brokerOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse'}`}></div>
            <span className={`text-xs font-semibold uppercase tracking-widest ${brokerOnline ? 'text-emerald-500' : 'text-red-500'}`}>
              {brokerOnline ? t('header.brokerOnline') : t('header.brokerOffline')}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-800"></div>
          <div className="flex gap-4">
            <button onClick={toggleLanguage} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 transition flex gap-1.5 items-center text-slate-300 text-xs font-bold uppercase">
              <Globe size={14} /> {i18n.language === 'en' ? 'EN' : 'ZH'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 flex overflow-hidden">
        <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />
        
        <section className="flex-1 flex flex-col bg-[#020617] relative overflow-y-auto">
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
          <div className="p-6 relative z-10 h-full flex flex-col">
            <div className="max-w-7xl mx-auto w-full">
              {renderContent()}
            </div>
          </div>
        </section>
      </main>

      {/* Bottom Status Bar */}
      <footer className="h-8 shrink-0 bg-[#0a0f1a] border-t border-slate-800 flex items-center justify-between px-4 text-[10px] font-mono tracking-tight text-slate-500">
        <div className="flex gap-6">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${brokerOnline ? 'bg-cyan-400' : 'bg-red-400'}`}></div>
            <span>{brokerOnline ? t('header.apiGateway') : t('header.apiGatewayOffline')}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Bell size={10} className="text-slate-600" />
            <span>{notifications.length > 0 ? `${notifications.length} events` : t('header.noEvents')}</span>
          </div>
        </div>
      </footer>

      {/* Notification Toast Overlay */}
      {notifications.length > 0 && (
        <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 max-w-xs">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-xs font-mono animate-slide-in ${
                n.type === 'error'
                  ? 'bg-red-950/90 border-red-700/50 text-red-300'
                  : 'bg-slate-900/90 border-slate-700/50 text-slate-200'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${n.type === 'error' ? 'bg-red-500' : 'bg-cyan-500'}`}></div>
              <span className="flex-1 font-bold">{n.message}</span>
              <span className="text-[10px] text-slate-500 shrink-0">{n.timestamp}</span>
              <button
                onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}
                className="text-slate-500 hover:text-slate-300"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
