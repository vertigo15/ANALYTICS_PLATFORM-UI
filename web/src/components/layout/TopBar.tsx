'use client';

import { usePathname, useRouter } from 'next/navigation';
import { MessageCircle, ChevronDown } from 'lucide-react';
import { useAIStore } from '@/store/ai';
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
  const router = useRouter();
  const [env, setEnv] = useState<string>('dev');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Read env from localStorage on mount (client-only)
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored && ENVS.some(e => e.key === stored)) setEnv(stored);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const switchTo = (target: string) => {
    if (target === env) return;
    localStorage.setItem(LS_KEY, target);
    setEnv(target);
    setOpen(false);
    // axios interceptor will pick up the new value on next request;
    // router.refresh() forces Next.js to re-run server components & re-fetch data.
    router.refresh();
  };

  const current = ENVS.find(e => e.key === env) ?? ENVS[0];

  return (
    <div ref={ref} className="relative">
      {/* Badge */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all
          ${current.bg} ${current.color} ${current.ring} ring-1 hover:ring-2`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
        {current.badge}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-border z-50 overflow-hidden">
          <div className="p-1.5">
            {ENVS.map(e => {
              const isActive = e.key === env;
              return (
                <button
                  key={e.key}
                  onClick={() => switchTo(e.key)}
                  disabled={isActive}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                    ${isActive
                      ? `${e.bg} ${e.color} cursor-default`
                      : 'hover:bg-slate-50 text-text-primary'
                    }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? e.dot : 'bg-slate-300'}`} />
                  <span className="text-sm font-medium flex-1">{e.label}</span>
                  {isActive && <span className="text-xs opacity-50 font-normal">active</span>}
                </button>
              );
            })}
          </div>
          <div className="px-4 py-2 bg-slate-50 border-t border-border">
            <p className="text-xs text-text-secondary">Switches instantly — no restart needed.</p>
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
