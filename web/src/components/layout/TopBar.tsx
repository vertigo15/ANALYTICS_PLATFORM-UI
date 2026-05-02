'use client';

import { usePathname, useRouter } from 'next/navigation';
import { MessageCircle, ChevronDown, Loader2 } from 'lucide-react';
import { useAIStore } from '@/store/ai';
import { useEffect, useState, useRef, useCallback } from 'react';
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

const API = process.env.NEXT_PUBLIC_API_URL;

function useEnv() {
  const [env, setEnv] = useState('');
  const [dbHost, setDbHost] = useState('');

  const refresh = useCallback(() => {
    fetch(`${API}/api/v1/health`)
      .then(r => r.json())
      .then(d => { setEnv(d.env || 'dev'); setDbHost(d.db_host || ''); })
      .catch(() => setEnv('dev'));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { env, dbHost, refresh };
}

function EnvSwitcher() {
  const router = useRouter();
  const { env, dbHost, refresh } = useEnv();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const current = ENVS.find(e => e.key === env);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const switchTo = async (target: string) => {
    if (target === env || switching) return;
    setSwitching(target);
    setOpen(false);
    try {
      const res = await fetch(`${API}/api/v1/admin/switch-env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env: target }),
      });
      if (!res.ok) throw new Error('switch failed');
      await refresh();
      router.refresh();
    } catch {
      /* silently revert */
    } finally {
      setSwitching(null);
    }
  };

  if (!current) return null;

  return (
    <div ref={ref} className="relative">
      {/* Badge */}
      <button
        onClick={() => setOpen(o => !o)}
        disabled={!!switching}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all
          ${current.bg} ${current.color} ${current.ring} ring-1 hover:ring-2`}
        title={dbHost}
      >
        {switching ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
        )}
        {switching ? ENVS.find(e => e.key === switching)?.badge ?? '…' : current.badge}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-border z-50 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-border">
            <p className="text-xs font-semibold text-text-primary">Source Database</p>
            <p className="text-xs text-text-secondary truncate mt-0.5">{dbHost}</p>
          </div>
          <div className="p-1.5">
            {ENVS.map(e => {
              const isActive = e.key === env;
              return (
                <button
                  key={e.key}
                  onClick={() => switchTo(e.key)}
                  disabled={isActive || !!switching}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                    ${isActive
                      ? `${e.bg} ${e.color} cursor-default`
                      : 'hover:bg-slate-50 text-text-primary hover:text-text-primary'
                    } ${switching === e.key ? 'opacity-60' : ''}`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? e.dot : 'bg-slate-300'}`} />
                  <span className="text-sm font-medium flex-1">{e.label}</span>
                  {isActive && <span className="text-xs opacity-50 font-normal">active</span>}
                  {switching === e.key && <Loader2 size={12} className="animate-spin" />}
                </button>
              );
            })}
          </div>
          <div className="px-4 py-2 bg-slate-50 border-t border-border">
            <p className="text-xs text-text-secondary">Data refreshes automatically on switch.</p>
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
