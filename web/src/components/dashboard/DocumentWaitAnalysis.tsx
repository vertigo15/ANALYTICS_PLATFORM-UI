'use client';

import type { EChartsOption } from 'echarts';
import BarChart from '@/components/charts/BarChart';
import FunnelChart from '@/components/charts/FunnelChart';
import StackedBarChart from '@/components/charts/StackedBarChart';
import type { DocumentStageAnalysis, DocumentStageMetric } from '@/lib/api';

interface DocumentWaitAnalysisProps {
  analysis?: DocumentStageAnalysis;
  isLoading: boolean;
  hasError?: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
}

function SummaryMetric({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const valueTone = {
    default: 'text-text-primary',
    success: 'text-emerald-700',
    warning: 'text-amber-700',
    danger: 'text-rose-700',
  }[tone];

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueTone}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-text-secondary">{detail}</p>}
    </div>
  );
}

function rateTone(rate: number): string {
  if (rate >= 95) return 'text-emerald-700';
  if (rate >= 80) return 'text-amber-700';
  return 'text-rose-700';
}

function StageRow({ stage }: { stage: DocumentStageMetric }) {
  const eligible = Number(stage.eligible_documents);
  const succeeded = Number(stage.succeeded_documents);
  const failed = Number(stage.failed_documents);
  const pending = Number(stage.pending_documents);
  const successRate = Number(stage.success_rate);

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
            {stage.stage_order}
          </span>
          <div>
            <p className="font-semibold text-text-primary">{stage.stage_name}</p>
            <p className="mt-1 max-w-xs text-xs text-text-secondary">
              {stage.timing_definition}
            </p>
            {stage.timing_is_estimate && (
              <span className="mt-2 inline-flex rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                Estimated from event timestamps
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-text-primary">
        {formatDuration(Number(stage.avg_seconds))}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-text-primary">
        {formatDuration(Number(stage.p50_seconds))}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-text-primary">
        {formatDuration(Number(stage.p95_seconds))}
      </td>
      <td className="min-w-44 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className={`text-lg font-semibold ${rateTone(successRate)}`}>
            {successRate.toFixed(1)}%
          </span>
          <span className="text-xs text-text-secondary">
            {succeeded.toLocaleString()} / {eligible.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${
              successRate >= 95
                ? 'bg-emerald-500'
                : successRate >= 80
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, successRate))}%` }}
          />
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right text-xs text-text-secondary">
        <p><span className="font-semibold text-emerald-700">{succeeded.toLocaleString()}</span> succeeded</p>
        <p><span className="font-semibold text-rose-700">{failed.toLocaleString()}</span> failed</p>
        <p><span className="font-semibold text-amber-700">{pending.toLocaleString()}</span> pending</p>
      </td>
    </tr>
  );
}

function formatDataThrough(value: string | null): string {
  if (!value) return 'No data';
  return `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export default function DocumentWaitAnalysis({
  analysis,
  isLoading,
  hasError = false,
}: DocumentWaitAnalysisProps) {
  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="h-7 w-80 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </section>
    );
  }

  if (hasError || !analysis) {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">End-to-End Processing Analysis</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Upload-to-ready timing and success by processing stage.
          </p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          Detailed lifecycle telemetry is unavailable for the selected data source.
        </div>
      </section>
    );
  }

  const { summary, stages, telemetry } = analysis;
  const uploaded = Number(summary.uploaded_documents);
  const ready = Number(summary.ready_documents);
  const incomplete = Number(summary.incomplete_documents);
  const successRate = Number(summary.end_to_end_success_rate);
  const stageNames = stages.map((stage) => stage.stage_name);
  const stageSuccessCounts = stages.map((stage) => Number(stage.succeeded_documents));
  const stageFailedCounts = stages.map((stage) => Number(stage.failed_documents));
  const stagePendingCounts = stages.map((stage) => Number(stage.pending_documents));
  const stageEligibleCounts = stages.map((stage) => Number(stage.eligible_documents));

  const latencyOptions: EChartsOption = {
    color: ['#2563EB', '#7C3AED', '#D97706'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const points = Array.isArray(params) ? params : [params];
        return [
          `<strong>${points[0]?.axisValueLabel || ''}</strong>`,
          ...points.map(
            (point: any) =>
              `${point.marker}${point.seriesName}: ${formatDuration(Number(point.value))}`
          ),
        ].join('<br/>');
      },
    },
    legend: {
      top: 0,
      data: ['Median', 'Average', 'P95'],
    },
    grid: {
      left: 64,
      right: 24,
      top: 48,
      bottom: 72,
    },
    xAxis: {
      type: 'category',
      data: stageNames,
      axisLabel: {
        interval: 0,
        fontSize: 10,
        lineHeight: 14,
        formatter: (value: string) => value.replace(' / ', '\n'),
      },
    },
    yAxis: {
      type: 'log',
      min: 0.01,
      name: 'Seconds · log scale',
      axisLabel: {
        formatter: (value: number) => formatDuration(value),
      },
      splitLine: {
        lineStyle: { color: '#E2E8F0' },
      },
    },
    series: [
      {
        name: 'Median',
        type: 'bar',
        data: stages.map((stage) => {
          const value = Number(stage.p50_seconds);
          return value > 0 ? value : null;
        }),
        itemStyle: { borderRadius: [3, 3, 0, 0] },
      },
      {
        name: 'Average',
        type: 'line',
        data: stages.map((stage) => {
          const value = Number(stage.avg_seconds);
          return value > 0 ? value : null;
        }),
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2 },
      },
      {
        name: 'P95',
        type: 'bar',
        data: stages.map((stage) => {
          const value = Number(stage.p95_seconds);
          return value > 0 ? value : null;
        }),
        itemStyle: { borderRadius: [3, 3, 0, 0] },
      },
    ],
  };

  const firstFunnelValue = stageSuccessCounts[0] || 0;
  const funnelColors = ['#2563EB', '#3B82F6', '#60A5FA', '#34D399', '#10B981'];
  const funnelOptions: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const count = Number(params.value);
        const conversion = firstFunnelValue > 0 ? (count / firstFunnelValue) * 100 : 0;
        const stage = stages.find((item) => item.stage_name === params.name);
        const average = stage ? formatDuration(Number(stage.avg_seconds)) : '—';
        return `${params.marker}<strong>${params.name}</strong><br/>${count.toLocaleString()} documents<br/>${conversion.toFixed(1)}% of successful uploads<br/>Average time: ${average}`;
      },
    },
    series: [
      {
        name: 'Document progression',
        type: 'funnel',
        top: 12,
        bottom: 12,
        left: '4%',
        width: '92%',
        minSize: '20%',
        maxSize: '100%',
        sort: 'descending',
        gap: 3,
        label: {
          show: true,
          position: 'inside',
          color: '#FFFFFF',
          fontSize: 11,
          fontWeight: 600,
          formatter: (params: any) => {
            const count = Number(params.value);
            const conversion = firstFunnelValue > 0 ? (count / firstFunnelValue) * 100 : 0;
            const stage = stages.find((item) => item.stage_name === params.name);
            const average = stage ? formatDuration(Number(stage.avg_seconds)) : '—';
            return `${params.name}\n${count.toLocaleString()} · ${conversion.toFixed(1)}%\nAvg ${average}`;
          },
        },
        labelLine: { show: false },
        itemStyle: {
          borderColor: '#FFFFFF',
          borderWidth: 2,
        },
        data: stages.map((stage, index) => ({
          name: stage.stage_name,
          value: Number(stage.succeeded_documents),
          itemStyle: { color: funnelColors[index % funnelColors.length] },
        })),
      },
    ],
  };

  const outcomeCounts = [
    stageSuccessCounts,
    stageFailedCounts,
    stagePendingCounts,
  ];
  const outcomeNames = ['Succeeded', 'Failed', 'Pending'];
  const outcomeColors = ['#10B981', '#E11D48', '#F59E0B'];
  const outcomeRates = outcomeCounts.map((counts) =>
    counts.map((count, index) => {
      const eligible = stageEligibleCounts[index];
      return eligible > 0 ? (count / eligible) * 100 : 0;
    })
  );
  const outcomeOptions: EChartsOption = {
    color: outcomeColors,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const points = Array.isArray(params) ? params : [params];
        const stageIndex = Number(points[0]?.dataIndex || 0);
        return [
          `<strong>${stageNames[stageIndex]}</strong> · ${stageEligibleCounts[stageIndex].toLocaleString()} eligible`,
          ...points.map((point: any) => {
            const outcomeIndex = outcomeNames.indexOf(point.seriesName);
            const count = outcomeCounts[outcomeIndex]?.[stageIndex] || 0;
            return `${point.marker}${point.seriesName}: ${count.toLocaleString()} (${Number(point.value).toFixed(1)}%)`;
          }),
        ].join('<br/>');
      },
    },
    legend: {
      top: 0,
      data: outcomeNames,
    },
    grid: {
      left: 150,
      right: 32,
      top: 48,
      bottom: 32,
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%' },
      splitLine: {
        lineStyle: { color: '#E2E8F0' },
      },
    },
    yAxis: {
      type: 'category',
      data: stageNames,
      axisLabel: { fontSize: 11 },
    },
    series: outcomeNames.map((name, outcomeIndex) => ({
      name,
      type: 'bar',
      stack: 'outcomes',
      barWidth: 24,
      data: outcomeRates[outcomeIndex],
      label: {
        show: true,
        position: 'inside',
        color: '#FFFFFF',
        fontSize: 10,
        formatter: (params: any) => {
          const count = outcomeCounts[outcomeIndex][params.dataIndex];
          return Number(params.value) >= 7 ? count.toLocaleString() : '';
        },
      },
      itemStyle:
        outcomeIndex === 0
          ? { borderRadius: [4, 0, 0, 4] }
          : outcomeIndex === outcomeNames.length - 1
            ? { borderRadius: [0, 4, 4, 0] }
            : undefined,
    })),
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">End-to-End Processing Analysis</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Actual upload start → original embedding completion, with document-level success and timing for every stage.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          label="Median end-to-end"
          value={formatDuration(Number(summary.p50_end_to_end_seconds))}
          detail="Upload start → embedding complete"
          tone="success"
        />
        <SummaryMetric
          label="P95 end-to-end"
          value={formatDuration(Number(summary.p95_end_to_end_seconds))}
          detail="95% of successful documents complete within this time"
          tone="warning"
        />
        <SummaryMetric
          label="Average end-to-end"
          value={formatDuration(Number(summary.avg_end_to_end_seconds))}
          detail={`${Number(telemetry.end_to_end_sample_size).toLocaleString()} timed successful documents`}
        />
        <SummaryMetric
          label="End-to-end success"
          value={`${successRate.toFixed(1)}%`}
          detail={`${ready.toLocaleString()} ready / ${uploaded.toLocaleString()} uploaded · ${incomplete.toLocaleString()} incomplete`}
          tone={successRate >= 95 ? 'success' : successRate >= 80 ? 'warning' : 'danger'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-xl border border-border bg-white p-5">
          <h3 className="font-semibold text-text-primary">Latency by stage</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Median, average, and P95 successful-stage duration. The logarithmic scale keeps millisecond and minute values visible together.
          </p>
          <div className="mt-3">
            <BarChart options={latencyOptions} height="360px" />
          </div>
        </article>

        <article className="rounded-xl border border-border bg-white p-5">
          <h3 className="font-semibold text-text-primary">Upload-to-ready funnel</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Documents successfully reaching each stage; percentages use successful uploads as the baseline.
          </p>
          <div className="mt-3">
            <FunnelChart options={funnelOptions} height="360px" />
          </div>
        </article>
      </div>

      <article className="rounded-xl border border-border bg-white p-5">
        <h3 className="font-semibold text-text-primary">Stage outcome rates</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Succeeded, failed, and pending documents as a percentage of those eligible to enter each stage. Segment labels show document counts.
        </p>
        <div className="mt-3">
          <StackedBarChart options={outcomeOptions} height="330px" />
        </div>
      </article>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-left">Stage and measurement</th>
              <th className="px-4 py-3 text-right">Average</th>
              <th className="px-4 py-3 text-right">Median</th>
              <th className="px-4 py-3 text-right">P95</th>
              <th className="px-4 py-3 text-left">Success rate</th>
              <th className="px-4 py-3 text-right">Outcomes</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <StageRow key={stage.stage_key} stage={stage} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-900">
        <strong>Coverage:</strong> upload data through {formatDataThrough(telemetry.upload_data_through)}
        {' · '}processing data through {formatDataThrough(telemetry.processing_data_through)}
        {' · '}success rate is succeeded ÷ eligible documents at each stage.
        Chunk time is the parse-complete → embedding-queued interval because no dedicated chunking timer exists.
      </div>
    </section>
  );
}
