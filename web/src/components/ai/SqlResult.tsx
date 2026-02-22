'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface SqlResultProps {
  sql: string;
  data: Record<string, any>[];
  columns: string[];
  narrative: string;
}

function isNumericLike(v: any) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  if (typeof v !== 'string') return false;
  // allow large numeric strings (including many trailing zeros)
  return /^-?\d+(?:\.\d+)?$/.test(v.trim());
}

function formatCompact(v: any) {
  if (!isNumericLike(v)) return String(v);
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(n);
}

export default function SqlResult({ sql, data, columns, narrative }: SqlResultProps) {
  const [showSQL, setShowSQL] = useState(false);

  return (
    <div className="space-y-4">
      {/* Narrative */}
      <p className="text-sm text-text-primary">{narrative}</p>

      {/* Collapsible SQL */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowSQL(!showSQL)}
          className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <span className="text-sm font-medium text-text-secondary">View SQL</span>
          {showSQL ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showSQL && (
          <div className="p-4 bg-slate-900">
            <pre className="text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap break-words">
              {sql}
            </pre>
          </div>
        )}
      </div>

      {/* Result Table */}
      {data.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-border">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {columns.map((col) => {
                      const raw = row[col];
                      const display = raw !== null && raw !== undefined ? formatCompact(raw) : '-';
                      return (
                        <td key={col} className="px-4 py-2 text-text-primary whitespace-nowrap" title={raw !== null && raw !== undefined ? String(raw) : undefined}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-slate-50 border-t border-border">
            <p className="text-xs text-text-secondary">
              Showing {data.length} row{data.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-lg p-6 text-center">
          <p className="text-sm text-text-secondary">No results found</p>
        </div>
      )}
    </div>
  );
}
