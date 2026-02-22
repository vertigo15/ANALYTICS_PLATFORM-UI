'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  DollarSign,
  Bot,
  Users,
  FileText,
  Activity,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard/cost', label: 'Cost & Tokens', icon: DollarSign },
  { href: '/dashboard/users', label: 'User Activity', icon: Users },
  { href: '/dashboard/agents', label: 'Agent Performance', icon: Bot },
  { href: '/dashboard/documents', label: 'Document Health', icon: FileText },
  { href: '/dashboard/operations', label: 'Platform Operations', icon: Activity },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-sidebar flex flex-col h-screen">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white">Jeen Analytics</h1>
      </div>
      <nav className="flex-1 px-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                isActive
                  ? 'bg-primary text-white'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Icon size={20} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 text-center text-slate-500 text-xs border-t border-slate-700">
        Last updated: –
      </div>
    </aside>
  );
}
