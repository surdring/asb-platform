import React from 'react';
import { LayoutDashboard, Server, Network, Boxes, ListTodo, Package, ScrollText, Search, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export function Sidebar({ currentTab, onTabChange }: SidebarProps) {
  const { t } = useTranslation();
  
  const navItems = [
    { id: 'dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard },
    { id: 'environments', label: t('sidebar.environments'), icon: Server },
    { id: 'broker', label: t('sidebar.broker'), icon: Network },
    { id: 'skills', label: t('sidebar.skills'), icon: Boxes },
    { id: 'tasks', label: t('sidebar.tasks'), icon: ListTodo },
    { id: 'collected-items', label: t('sidebar.collectedItems'), icon: Package },
    { id: 'system-logs', label: t('sidebar.systemLogs'), icon: ScrollText },
    { id: 'session-probe', label: t('sidebar.sessionProbe'), icon: Search },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-[#070b14] flex flex-col shrink-0">
      <div className="p-4 flex-1">
        <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500 mb-4">Platform Dashboard</h2>
        <nav className="space-y-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-cyan-950/20 border border-cyan-500/30 text-cyan-400 ring-1 ring-cyan-500/10' 
                    : 'bg-slate-900/50 border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
                <span className="text-sm font-semibold">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800 bg-[#0a0f1a]">
        <button className="flex items-center space-x-3 text-slate-500 hover:text-red-400 transition-colors py-2 w-full text-sm font-bold uppercase">
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
