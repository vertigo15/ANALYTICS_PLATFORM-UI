import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import { useState } from 'react';

export interface KpiCardProps {
  title: string;
  value: string;
  previousValue?: string;
  delta?: number;
  deltaDirection?: 'up-good' | 'up-bad' | 'neutral';
  subtitle?: string;
  isLoading?: boolean;
  icon?: string;
  tooltip?: string;
  sparklineData?: number[];
  sparklineLabels?: string[];
}

export default function KpiCard({
  title,
  value,
  previousValue,
  delta,
  deltaDirection = 'neutral',
  subtitle = 'vs last period',
  isLoading = false,
  icon,
  tooltip,
  sparklineData,
  sparklineLabels,
}: KpiCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-2/3 mb-4"></div>
        <div className="h-8 bg-slate-200 rounded w-1/2 mb-3"></div>
        <div className="h-3 bg-slate-200 rounded w-1/3"></div>
      </div>
    );
  }

  const getDeltaColor = () => {
    if (!delta || deltaDirection === 'neutral') return 'text-text-secondary';
    if (deltaDirection === 'up-good') {
      return delta > 0 ? 'text-success' : 'text-danger';
    }
    if (deltaDirection === 'up-bad') {
      return delta > 0 ? 'text-danger' : 'text-success';
    }
    return 'text-text-secondary';
  };

  const showArrow = delta !== undefined && delta !== 0 && deltaDirection !== 'neutral';
  const isPositiveDelta = delta && delta > 0;

  // Sparkline rendering
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length === 0) return null;
    
    const max = Math.max(...sparklineData, 1);
    const barWidth = 100 / sparklineData.length;
    
    return (
      <div className="flex items-end gap-0.5 h-8 mt-2">
        {sparklineData.map((val, idx) => (
          <div
            key={idx}
            className="bg-primary/30 rounded-sm transition-all hover:bg-primary/50"
            style={{
              width: `${barWidth}%`,
              height: `${(val / max) * 100}%`,
              minHeight: val > 0 ? '2px' : '0px',
            }}
            title={sparklineLabels?.[idx] ? `${sparklineLabels[idx]}: ${val}` : `${val}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm text-text-secondary">{title}</p>
          {tooltip && (
            <div className="relative">
              <Info
                size={14}
                className="text-text-secondary cursor-help"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              />
              {showTooltip && (
                <div className="absolute left-0 top-6 z-50 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg">
                  {tooltip}
                  <div className="absolute -top-1 left-2 w-2 h-2 bg-slate-800 rotate-45"></div>
                </div>
              )}
            </div>
          )}
        </div>
        {icon && <span className="text-2xl" role="img" aria-label={title}>{icon}</span>}
      </div>
      <p className="text-3xl font-bold text-text-primary mb-2">{value}</p>
      {renderSparkline()}
      <div className="flex items-center gap-2">
        {showArrow && (
          <div className={`flex items-center ${getDeltaColor()}`}>
            {isPositiveDelta ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span className="text-sm font-medium ml-1">
              {!isFinite(delta!) ? '∞%' : `${Math.abs(delta!).toFixed(1)}%`}
            </span>
          </div>
        )}
        {previousValue && (
          <span className="text-xs text-text-secondary">
            {subtitle} ({previousValue})
          </span>
        )}
      </div>
    </div>
  );
}
