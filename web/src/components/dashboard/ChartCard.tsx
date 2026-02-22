import { Download, FileX } from 'lucide-react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  onExport?: () => void;
}

export default function ChartCard({
  title,
  subtitle,
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
            <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
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
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
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
