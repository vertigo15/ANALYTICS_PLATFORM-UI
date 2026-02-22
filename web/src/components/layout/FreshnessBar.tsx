'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { Clock, AlertTriangle } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { formatRelativeTime } from '@/lib/formatters';
import type { ApiResponse, FreshnessData } from '@/lib/api';

const PAGE_TO_KEY: Record<string, keyof FreshnessData> = {
  '/dashboard/cost': 'cost',
  '/dashboard/agents': 'agents',
  '/dashboard/users': 'users',
  '/dashboard/documents': 'documents',
  '/dashboard/operations': 'operations',
};

export default function FreshnessBar() {
  const pathname = usePathname();
  const [showPopover, setShowPopover] = useState(false);

  const { data } = useSWR<ApiResponse<FreshnessData>>('/freshness', fetcher, {
    refreshInterval: 300000, // 5 minutes
  });

  const pageKey = PAGE_TO_KEY[pathname];
  const pageFreshness = data?.data[pageKey];

  if (!pageFreshness) return null;

  const isStale = pageFreshness.is_stale;

  return (
    <div
      className="relative bg-slate-50 border-b border-border px-8 py-2"
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      <div className="flex items-center gap-2">
        {isStale ? (
          <>
            <AlertTriangle size={14} className="text-warning" />
            <span className="text-xs text-warning">
              ⚠️ Data may be outdated — last updated{' '}
              {formatRelativeTime(pageFreshness.last_updated)}
            </span>
          </>
        ) : (
          <>
            <Clock size={14} className="text-text-secondary" />
            <span className="text-xs text-text-secondary">
              Data last updated: {formatRelativeTime(pageFreshness.last_updated)}
            </span>
          </>
        )}
      </div>

      {/* Popover */}
      {showPopover && (
        <div className="absolute top-full left-8 mt-1 bg-white border border-border rounded-lg shadow-lg p-4 z-50 min-w-96">
          <h4 className="text-sm font-semibold text-text-primary mb-2">
            Data Freshness Details
          </h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-text-secondary font-medium">Table Name</th>
                <th className="text-left py-2 text-text-secondary font-medium">Last Updated</th>
                <th className="text-center py-2 text-text-secondary font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pageFreshness.tables.map((table) => {
                const hoursSinceUpdate =
                  (Date.now() - new Date(table.last_run_at).getTime()) / (1000 * 60 * 60);
                const tableIsStale = hoursSinceUpdate > 24;

                return (
                  <tr key={table.source_table} className="border-b border-slate-100">
                    <td className="py-2 text-text-primary">{table.source_table}</td>
                    <td className="py-2 text-text-secondary">
                      {formatRelativeTime(table.last_run_at)}
                    </td>
                    <td className="py-2 text-center">
                      {tableIsStale ? (
                        <span className="text-warning">⚠️</span>
                      ) : (
                        <span className="text-success">✅</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
