'use client';

import { usePathname } from 'next/navigation';
import { MessageCircle, ChevronDown } from 'lucide-react';
import useSWR from 'swr';
import { useAIStore } from '@/store/ai';
import { useFiltersStore, type AnalyticsEnvironment } from '@/store/filters';
import { fetcher } from '@/lib/fetcher';
import type { HealthResponse } from '@/lib/api';
import { useEffect, useState, useRef } from 'react';
import FilterBar from './FilterBar';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard/cost':       'Cost & Tokens',
  '/dashboard/agents':     'Agent Performance',
  '/dashboard/analytics':  'Agent Analytics',
  '/dashboard/users':      'User Activity',
  '/dashboard/documents':  'Document & RAG Health',
  '/dashboard/operations': 'Platform Operations',
};

const ENVS = [
  { key: 'dev',  label: 'Development', badge: 'DEV',  color: 'text-blue-700',  bg: 'bg-blue-100',  ring: 'ring-blue-200',  dot: 'bg-blue-500' },
  { key: 'stg',  label: 'Staging',     badge: 'STG',  color: 'text-amber-700', bg: 'bg-amber-100', ring: 'ring-amber-200', dot: 'bg-amber-500' },
  { key: 'prod', label: 'Production',  badge: 'PROD', color: 'text-red-700',   bg: 'bg-red-100',   ring: 'ring-red-200',   dot: 'bg-red-500' },
];

const LS_KEY = 'analytics-env';

function EnvSwitcher() {
  const environment = useFiltersStore((state) => state.environment);
  const setEnvironment = useFiltersStore((state) => state.setEnvironment);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: health, error: healthError, isLoading: healthLoading } = useSWR<HealthResponse>(
    '/health',
    fetcher,
    {
      refreshInterval: 60000,
      shouldRetryOnError: false,
    }
  );

  // Read env from localStorage on mount (client-only)
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored && ENVS.some(e => e.key === stored) && stored !== environment) {
      setEnvironment(stored as AnalyticsEnvironment);
    }
  }, [environment, setEnvironment]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const switchTo = (target: AnalyticsEnvironment) => {
    if (target === environment) return;
    localStorage.setItem(LS_KEY, target);
    setEnvironment(target);
    setOpen(false);
  };

  const current = ENVS.find(e => e.key === environment) ?? ENVS[0];
  const isConnected =
    health?.status === 'ok' &&
    health.db === 'connected' &&
    health.env === environment;
  const connectionLabel = healthLoading
    ? 'Checking connection…'
    : isConnected
      ? `${current.label} database connected`
      : 'Database unavailable';

  return (
    <div ref={ref} className="relative">
      {/* Badge */}
      <button
        onClick={() => setOpen(o => !o)}
        title={connectionLabel}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all
          ${current.bg} ${current.color} ${current.ring} ring-1 hover:ring-2`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${
          healthLoading ? 'bg-slate-400' : isConnected ? 'bg-emerald-500' : 'bg-rose-500'
        }`} />
        {current.badge}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-border z-50 overflow-hidden">
          <div className="p-1.5">
            {ENVS.map(e => {
              const isActive = e.key === environment;
              return (
                <button
                  key={e.key}
                  onClick={() => switchTo(e.key as AnalyticsEnvironment)}
                  disabled={isActive}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                    ${isActive
                      ? `${e.bg} ${e.color} cursor-default`
                      : 'hover:bg-slate-50 text-text-primary'
                    }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? e.dot : 'bg-slate-300'}`} />
                  <span className="text-sm font-medium flex-1">{e.label}</span>
                  {isActive && (
                    <span className={`text-xs font-normal ${
                      isConnected ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {healthLoading ? 'checking' : isConnected ? 'connected' : 'unavailable'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="px-4 py-2 bg-slate-50 border-t border-border">
            <p className={`text-xs ${
              healthError || (!healthLoading && !isConnected)
                ? 'text-rose-700'
                : 'text-text-secondary'
            }`}>
              {connectionLabel}. Switching reloads every dashboard from this source.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const pathname = usePathname();
  const { toggleAISidebar, isAISidebarOpen } = useAIStore();
  const pageTitle = PAGE_TITLES[pathname] || 'Dashboard';

  return (
    <header className="bg-white border-b border-border">
      <div className="px-8 py-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-text-primary">{pageTitle}</h2>
        <div className="flex items-center gap-3">
          <EnvSwitcher />
          <button
            onClick={toggleAISidebar}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              isAISidebarOpen
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
            }`}
            aria-label="Toggle AI Assistant"
          >
            <MessageCircle size={20} />
            <span className="text-sm font-medium">AI Assistant</span>
          </button>
        </div>
      </div>
      <div className="px-8">
        <FilterBar />
      </div>
    </header>
  );
}
