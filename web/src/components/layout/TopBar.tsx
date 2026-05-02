'use client';

import { usePathname } from 'next/navigation';
import { MessageCircle, ChevronDown, Check, Copy } from 'lucide-react';
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

const ENVS: { key: string; label: string; badge: string; cmd: string; color: string; bg: string; border: string }[] = [
  { key: 'dev',  label: 'Development', badge: 'DEV',  cmd: 'make switch-dev',  color: 'text-blue-700',  bg: 'bg-blue-100',   border: 'border-blue-200' },
  { key: 'stg',  label: 'Staging',     badge: 'STG',  cmd: 'make switch-stg',  color: 'text-amber-700', bg: 'bg-amber-100',  border: 'border-amber-200' },
  { key: 'prod', label: 'Production',  badge: 'PROD', cmd: 'make switch-prod', color: 'text-red-700',   bg: 'bg-red-100',    border: 'border-red-300' },
];

function useEnv(): string {
  const [env, setEnv] = useState<string>('');
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/health`)
      .then(r => r.json())
      .then(d => setEnv(d.env || 'dev'))
      .catch(() => setEnv('dev'));
  }, []);
  return env;
}

function EnvSwitcher({ currentEnv }: { currentEnv: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const current = ENVS.find(e => e.key === currentEnv) ?? ENVS[0];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const copy = (cmd: string, key: string) => {
    navigator.clipboard.writeText(cmd).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div ref={ref} className="relative">
      {/* Badge button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold tracking-wide transition-colors hover:opacity-80 ${current.bg} ${current.color} ${current.border}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
        {current.badge}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-border z-50 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-border">
            <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Source Database</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Switch via terminal · rebuilds not required
            </p>
          </div>

          <div className="p-2">
            {ENVS.map(env => {
              const isActive = env.key === currentEnv;
              return (
                <div
                  key={env.key}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg mb-1 last:mb-0 ${
                    isActive ? `${env.bg} ${env.border} border` : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-current' : 'bg-slate-300'} ${env.color}`} />
                    <div>
                      <p className={`text-sm font-medium ${isActive ? env.color : 'text-text-primary'}`}>
                        {env.label}
                        {isActive && <span className="ml-2 text-xs opacity-60">(active)</span>}
                      </p>
                      <code className="text-xs text-text-secondary font-mono">{env.cmd}</code>
                    </div>
                  </div>
                  <button
                    onClick={() => copy(env.cmd, env.key)}
                    title={`Copy: ${env.cmd}`}
                    className={`p-1.5 rounded-md transition-colors ${
                      copied === env.key
                        ? 'bg-green-100 text-green-600'
                        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                  >
                    {copied === env.key ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-t border-border">
            <p className="text-xs text-text-secondary">
              Run the command in your project root, then refresh this page.
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
  const env = useEnv();
  const pageTitle = PAGE_TITLES[pathname] || 'Dashboard';

  return (
    <header className="bg-white border-b border-border">
      <div className="px-8 py-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-text-primary">{pageTitle}</h2>
        <div className="flex items-center gap-3">
          {env && <EnvSwitcher currentEnv={env} />}
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
