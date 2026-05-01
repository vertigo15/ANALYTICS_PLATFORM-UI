'use client';

import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { useAIStore } from '@/store/ai';
import { useEffect, useState } from 'react';
import FilterBar from './FilterBar';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard/cost': 'Cost & Tokens',
  '/dashboard/agents': 'Agent Performance',
  '/dashboard/analytics': 'Agent Analytics',
  '/dashboard/users': 'User Activity',
  '/dashboard/documents': 'Document & RAG Health',
  '/dashboard/operations': 'Platform Operations',
};

const ENV_BADGE: Record<string, { label: string; className: string }> = {
  dev:  { label: 'DEV',  className: 'bg-blue-100 text-blue-700 border-blue-200' },
  stg:  { label: 'STG',  className: 'bg-amber-100 text-amber-700 border-amber-200' },
  prod: { label: 'PROD', className: 'bg-red-100 text-red-700 border-red-300 font-bold' },
};

function useEnv(): string {
  const [env, setEnv] = useState<string>('');

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/health`)
      .then((r) => r.json())
      .then((d) => setEnv(d.env || 'dev'))
      .catch(() => setEnv('dev'));
  }, []);

  return env;
}

export default function TopBar() {
  const pathname = usePathname();
  const { toggleAISidebar, isAISidebarOpen } = useAIStore();
  const env = useEnv();

  const pageTitle = PAGE_TITLES[pathname] || 'Dashboard';
  const badge = ENV_BADGE[env] ?? (env ? { label: env.toUpperCase(), className: 'bg-slate-100 text-slate-600 border-slate-200' } : null);

  return (
    <header className="bg-white border-b border-border">
      <div className="px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-text-primary">{pageTitle}</h2>
          {badge && (
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium tracking-wide ${badge.className}`}>
              {badge.label}
            </span>
          )}
        </div>
        <div>
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
