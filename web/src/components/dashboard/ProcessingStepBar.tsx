'use client';

interface StepData {
  status: string;
  count: number;
}

interface ProcessingStepBarProps {
  data: StepData[];
  isLoading?: boolean;
}

const STATUS_ORDER = ['UPLOADED', 'PROCESSING', 'PROCESSED'];
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  UPLOADED: { label: 'Uploaded', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  PROCESSING: { label: 'Processing', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  PROCESSED: { label: 'Processed', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  FAILED: { label: 'Failed', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
};

export default function ProcessingStepBar({ data, isLoading = false }: ProcessingStepBarProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="h-6 bg-slate-200 rounded w-1/3 mb-4 animate-pulse" />
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 h-20 bg-slate-200 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const dataMap = new Map(data.map((d) => [d.status, d.count]));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  const mainSteps = STATUS_ORDER.map((status) => ({
    status,
    count: dataMap.get(status) || 0,
    ...STATUS_CONFIG[status],
  }));

  const failedCount = dataMap.get('FAILED') || 0;
  const failedConfig = STATUS_CONFIG.FAILED;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-text-primary">Processing Pipeline</h3>
        <p className="text-sm text-text-secondary mt-1">Current document status snapshot</p>
      </div>

      <div className="flex items-center gap-0">
        {/* Main pipeline steps */}
        {mainSteps.map((step, idx) => {
          const pct = total > 0 ? ((step.count / total) * 100).toFixed(1) : '0';
          return (
            <div key={step.status} className="flex items-center flex-1 min-w-0">
              {/* Step box */}
              <div
                className={`flex-1 rounded-lg border ${step.bg} ${step.border} px-4 py-3 min-w-0`}
              >
                <p className={`text-xs font-medium ${step.color} uppercase tracking-wide`}>
                  {step.label}
                </p>
                <p className={`text-2xl font-bold ${step.color} mt-1`}>
                  {step.count.toLocaleString()}
                </p>
                <p className="text-xs text-text-secondary">{pct}%</p>
              </div>
              {/* Arrow connector */}
              {idx < mainSteps.length - 1 && (
                <div className="flex-shrink-0 px-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-slate-300">
                    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}

        {/* Failed branch — separated by a divider */}
        <div className="flex-shrink-0 px-3">
          <div className="w-px h-12 bg-slate-200 mx-auto" />
        </div>
        <div className={`rounded-lg border ${failedConfig.bg} ${failedConfig.border} px-4 py-3 min-w-[120px]`}>
          <p className={`text-xs font-medium ${failedConfig.color} uppercase tracking-wide`}>
            {failedConfig.label}
          </p>
          <p className={`text-2xl font-bold ${failedConfig.color} mt-1`}>
            {failedCount.toLocaleString()}
          </p>
          <p className="text-xs text-text-secondary">
            {total > 0 ? ((failedCount / total) * 100).toFixed(1) : '0'}%
          </p>
        </div>
      </div>
    </div>
  );
}
