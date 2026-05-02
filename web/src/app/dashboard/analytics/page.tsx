'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useFiltersStore } from '@/store/filters';
import { formatDateShort, formatRelativeTime } from '@/lib/formatters';
import { CHART_COLORS } from '@/lib/constants';
import type {
  ApiResponse,
  AnalyticsKPIs,
  ConversationListResponse,
  OutcomeBreakdown,
  ResponseTimeTrend,
  DepthOverTime,
  ConversationSummary,
} from '@/lib/api';
import KpiRow from '@/components/dashboard/KpiRow';
import ChartCard from '@/components/dashboard/ChartCard';
import BarChart from '@/components/charts/BarChart';
import LineChart from '@/components/charts/LineChart';
import DataTable, { DataTableColumn } from '@/components/dashboard/DataTable';
import StatusBadge from '@/components/dashboard/StatusBadge';
import type { EChartsOption } from 'echarts';

const OUTCOME_COLORS: Record<string, string> = {
  Completed: '#16A34A',
  Abandoned: '#6B7280',
};

function outcomeToStatus(outcome: string): 'success' | 'warning' | 'error' | 'pending' {
  switch (outcome) {
    case 'Completed': return 'success';
    case 'Abandoned': return 'pending';
    default: return 'pending';
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { from, to, organizationId } = useFiltersStore();
  const queryParams = new URLSearchParams({
    from,
    to,
    ...(organizationId ? { organization_id: organizationId } : {}),
  }).toString();

  // Fetch data
  const { data: kpisData, isLoading: kpisLoading } = useSWR<ApiResponse<AnalyticsKPIs>>(
    `/analytics/kpis?${queryParams}`,
    fetcher
  );

  const { data: conversationsData, isLoading: conversationsLoading } = useSWR<ApiResponse<ConversationListResponse>>(
    `/analytics/conversations?${queryParams}&pageSize=100`,
    fetcher
  );

  const { data: outcomeData, isLoading: outcomeLoading } = useSWR<ApiResponse<OutcomeBreakdown[]>>(
    `/analytics/outcome-breakdown?${queryParams}`,
    fetcher
  );

  const { data: respTimeData, isLoading: respTimeLoading } = useSWR<ApiResponse<ResponseTimeTrend[]>>(
    `/analytics/response-time-by-agent?${queryParams}`,
    fetcher
  );

  const { data: depthData, isLoading: depthLoading } = useSWR<ApiResponse<DepthOverTime[]>>(
    `/analytics/depth-over-time?${queryParams}`,
    fetcher
  );

  const kpis = kpisData?.data;
  const conversations = conversationsData?.data?.rows || [];
  const outcomes = outcomeData?.data || [];
  const respTimes = respTimeData?.data || [];
  const depthPoints = depthData?.data || [];

  // KPI cards
  const kpiCards = [
    {
      title: 'Total Conversations Analyzed',
      value: kpis?.total_conversations?.toLocaleString() || '0',
      isLoading: kpisLoading,
      tooltip: 'Total unique conversations with 2+ messages in the selected period',
    },
    {
      title: 'Avg Agent Response Time',
      value: kpis ? `${kpis.avg_response_time_sec.toFixed(1)}s` : '0s',
      isLoading: kpisLoading,
      tooltip: 'Average time between a user message and the next agent response',
    },
    {
      title: 'Avg Conversation Length',
      value: kpis ? `${kpis.avg_turns_per_conversation.toFixed(1)} turns` : '0 turns',
      isLoading: kpisLoading,
      tooltip: 'Average number of messages (turns) per conversation',
    },
    {
      title: 'Tool Call Rate',
      value: kpis ? `${kpis.tool_call_rate.toFixed(1)}%` : '0%',
      isLoading: kpisLoading,
      tooltip: 'Percentage of assistant messages that used tool calls',
    },
  ];

  // Outcome Breakdown Chart (pie chart)
  const outcomeChartOptions: EChartsOption = useMemo(() => {
    if (outcomes.length === 0) {
      return {
        title: { text: 'No data for this period', left: 'center', top: 'center', textStyle: { color: '#9CA3AF', fontSize: 14 } },
      };
    }

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          return `<strong>${params.name}</strong><br/>${params.value} conversations (${params.data.percentage}%)`;
        },
      },
      legend: { top: 0, data: outcomes.map((o) => o.outcome) },
      series: [
        {
          name: 'Outcome',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '55%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}: {d}%' },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: 'bold' },
          },
          data: outcomes.map((o) => ({
            value: o.count,
            name: o.outcome,
            percentage: o.percentage,
            itemStyle: { color: OUTCOME_COLORS[o.outcome] || CHART_COLORS[0] },
          })),
        },
      ],
    };
  }, [outcomes]);

  // Response Time Trend (daily line chart)
  const respTimeChartOptions: EChartsOption = useMemo(() => {
    if (respTimes.length === 0) {
      return {
        title: { text: 'No data for this period', left: 'center', top: 'center', textStyle: { color: '#9CA3AF', fontSize: 14 } },
      };
    }

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const p = params[0];
          return `${p.axisValue}<br/>Avg Response Time: ${Number(p.value).toFixed(1)}s`;
        },
      },
      grid: { left: '3%', right: '4%', top: '3%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: respTimes.map((r) => formatDateShort(r.date_day)),
      },
      yAxis: {
        type: 'value',
        name: 'Seconds',
        axisLabel: { formatter: (v: number) => `${v.toFixed(0)}s` },
      },
      series: [
        {
          name: 'Avg Response Time',
          type: 'line',
          smooth: true,
          data: respTimes.map((r) => Number(r.avg_response_time_sec.toFixed(2))),
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: CHART_COLORS[0] },
        },
      ],
    };
  }, [respTimes]);

  // Conversation Depth Over Time (line chart — single series)
  const depthChartOptions: EChartsOption = useMemo(() => {
    if (depthPoints.length === 0) {
      return {
        title: { text: 'No activity data for this period', left: 'center', top: 'center', textStyle: { color: '#9CA3AF', fontSize: 14 } },
      };
    }

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const p = params[0];
          const idx = p.dataIndex;
          const dp = depthPoints[idx];
          return `${p.axisValue}<br/>Avg Turns: ${Number(dp.avg_turns).toFixed(1)}<br/>Conversations: ${dp.total_conversations}`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: depthPoints.map((p) => formatDateShort(p.date_day)),
      },
      yAxis: { type: 'value', name: 'Avg Turns' },
      series: [
        {
          name: 'Avg Turns',
          type: 'line',
          smooth: true,
          data: depthPoints.map((p) => Number(p.avg_turns.toFixed(1))),
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: CHART_COLORS[1] },
        },
      ],
    };
  }, [depthPoints]);

  // Conversations Table columns
  const columns: DataTableColumn<ConversationSummary>[] = [
    {
      key: 'conversation_id',
      header: 'ID',
      width: '10%',
      render: (value) => (
        <span className="font-mono text-xs">{String(value).slice(0, 8)}…</span>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      width: '22%',
      render: (value) => (
        <span className="text-xs truncate block max-w-[220px]" title={String(value || '')}>
          {value ? String(value).length > 60 ? String(value).slice(0, 60) + '…' : String(value) : '—'}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (value) => value ? formatRelativeTime(value as string) : '—',
      width: '11%',
    },
    {
      key: 'user_email',
      header: 'User',
      width: '14%',
      render: (value) => (
        <span className="text-xs truncate">{String(value || '—')}</span>
      ),
    },
    {
      key: 'turns',
      header: 'Turns',
      sortable: true,
      render: (value) => Number(value || 0).toLocaleString(),
      width: '6%',
    },
    {
      key: 'duration_sec',
      header: 'Duration',
      sortable: true,
      render: (value) => formatDuration(Number(value || 0)),
      width: '8%',
    },
    {
      key: 'outcome',
      header: 'Outcome',
      sortable: true,
      render: (value) => (
        <StatusBadge
          status={outcomeToStatus(String(value))}
          label={String(value || 'Unknown')}
        />
      ),
      width: '10%',
    },
    {
      key: 'has_tool_calls',
      header: 'Tools',
      sortable: true,
      render: (value) => (
        <span className={`text-xs font-medium ${value ? 'text-primary' : 'text-text-secondary'}`}>
          {value ? 'Yes' : 'No'}
        </span>
      ),
      width: '7%',
    },
    {
      key: 'likes',
      header: 'Reactions',
      sortable: true,
      width: '10%',
      render: (_value, row) => {
        const likes = Number(row.likes || 0);
        const dislikes = Number(row.dislikes || 0);
        if (likes === 0 && dislikes === 0) return <span className="text-text-secondary text-xs">—</span>;
        return (
          <span className="text-xs font-medium space-x-2">
            {likes > 0 && <span className="text-green-500">👍 {likes}</span>}
            {dislikes > 0 && <span className="text-red-400">👎 {dislikes}</span>}
          </span>
        );
      },
    },
  ];

  return (
    <div className="p-8 space-y-6">
      <KpiRow kpis={kpiCards} />

      {/* Two-column charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Conversation Outcome Breakdown"
          subtitle="Completed vs abandoned conversations"
          isLoading={outcomeLoading}
        >
          <BarChart options={outcomeChartOptions} height="360px" />
        </ChartCard>

        <ChartCard
          title="Response Time Trend"
          subtitle="Daily average response time (user → assistant)"
          isLoading={respTimeLoading}
        >
          <LineChart options={respTimeChartOptions} height="360px" />
        </ChartCard>
      </div>

      {/* Conversation Depth Over Time */}
      <ChartCard
        title="Conversation Depth Over Time"
        subtitle="Average turns per conversation per day"
        isLoading={depthLoading}
      >
        <LineChart options={depthChartOptions} height="320px" />
      </ChartCard>

      {/* Conversations Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-text-primary">Conversations</h2>
        <DataTable
          columns={columns}
          data={conversations}
          searchable
searchKeys={['conversation_id', 'title', 'user_email', 'outcome']}
          exportFilename={`conversations-${from}-${to}.csv`}
          isLoading={conversationsLoading}
          onRowClick={(row) => router.push(`/dashboard/analytics/${row.conversation_id}`)}
        />
      </div>
    </div>
  );
}
