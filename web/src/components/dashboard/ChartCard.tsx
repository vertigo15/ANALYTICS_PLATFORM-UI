'use client';

import { useState } from 'react';
import { Download, FileX, Info } from 'lucide-react';

function InfoIcon({ tooltip }: { tooltip: string }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="p-0.5 rounded-full hover:bg-slate-100 transition-colors"
        aria-label="Chart info"
      >
        <Info size={16} className="text-text-secondary" />
      </button>
      {show && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg leading-relaxed">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45" />
          {tooltip}
        </div>
      )}
    </div>
  );
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  infoTooltip?: string;
  children: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  onExport?: () => void;
}

export default function ChartCard({
  title,
  subtitle,
  infoTooltip,
  children,
  isLoading = false,
  isEmpty = false,
  onExport,
}: ChartCardProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="h-6 bg-slate-200 rounded w-1/3 mb-4 animate-pulse"></div>
        <div className="h-64 bg-slate-200 rounded animate-pulse"></div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
              {infoTooltip && <InfoIcon tooltip={infoTooltip} />}
            </div>
            {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
          </div>
        </div>
        <div className="h-64 flex flex-col items-center justify-center text-text-secondary">
          <FileX size={48} className="mb-4 opacity-50" />
          <p className="text-sm">No data for this period</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
            {infoTooltip && <InfoIcon tooltip={infoTooltip} />}
          </div>
          {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
        </div>
        {onExport && (
          <button
            onClick={onExport}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            title="Export chart data"
          >
            <Download size={18} className="text-text-secondary" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
