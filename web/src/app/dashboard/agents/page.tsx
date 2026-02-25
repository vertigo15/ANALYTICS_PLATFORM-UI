'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useFiltersStore } from '@/store/filters';
import { formatCost, formatTokens, formatDateShort, formatRelativeTime } from '@/lib/formatters';
import { CHART_COLORS } from '@/lib/constants';
import type {
  ApiResponse,
  AgentKPIs,
  AgentSummary,
  AgentPerformance,
  AgentDetail,
} from '@/lib/api';
import KpiRow from '@/components/dashboard/KpiRow';
import ChartCard from '@/components/dashboard/ChartCard';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import DataTable, { DataTableColumn } from '@/components/dashboard/DataTable';
import SlideOver from '@/components/dashboard/SlideOver';
import StatusBadge from '@/components/dashboard/StatusBadge';
import type { EChartsOption } from 'echarts';

type UsageMetric = 'messages' | 'tokens' | 'cost' | 'unique_users';
type ActivityMetric = 'messages' | 'tokens' | 'cost' | 'unique_users';

export default function AgentsPage() {
  const { from, to } = useFiltersStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [usageMetric, setUsageMetric] = useState<UsageMetric>('messages');
  const [activityMetric, setActivityMetric] = useState<ActivityMetric>('messages');

  const queryParams = new URLSearchParams({ from, to }).toString();

  // Fetch data
  const { data: kpisData, isLoading: kpisLoading } = useSWR<ApiResponse<AgentKPIs>>(
    `/agents/kpis?${queryParams}`,
    fetcher
  );

  const { data: summaryData, isLoading: summaryLoading } = useSWR<ApiResponse<AgentSummary[]>>(
    `/agents/summary?${queryParams}`,
    fetcher
  );

  const { data: performanceData, isLoading: performanceLoading } = useSWR<ApiResponse<AgentPerformance[]>>(
    `/agents/performance?${queryParams}`,
    fetcher
  );

  const { data: agentDetailData } = useSWR<ApiResponse<AgentDetail>>(
    selectedAgentId ? `/agents/${selectedAgentId}?${queryParams}` : null,
    fetcher
  );

  const kpis = kpisData?.data;
  const agents = summaryData?.data || [];
  const performance = performanceData?.data || [];
  const agentDetail = agentDetailData?.data;

  // KPI cards
  const kpiCards = [
    {
      title: 'Active Agents',
      value: kpis?.active_agents?.toString() || '0',
      isLoading: kpisLoading,
      tooltip: 'Agents with at least one transaction in the selected period',
    },
    {
      title: 'Total Agent Cost',
      value: formatCost(kpis?.total_agent_cost || 0),
      isLoading: kpisLoading,
      tooltip: 'Total estimated cost across all agents in the selected period',
    },
    {
      title: 'Total Tokens',
      value: formatTokens(Number(kpis?.total_tokens || 0)),
      isLoading: kpisLoading,
      tooltip: 'Total tokens consumed by all agents in the selected period',
    },
    {
      title: 'Avg Users / Day',
      value: (kpis?.avg_unique_users_per_day || 0).toFixed(1),
      isLoading: kpisLoading,
      tooltip: 'Average number of unique users interacting with agents per day',
    },
    {
      title: 'Avg Msgs / Agent',
      value: Math.round(kpis?.avg_messages_per_agent || 0).toLocaleString(),
      isLoading: kpisLoading,
      tooltip: 'Average number of messages per active agent in the selected period',
    },
  ];

  // Top agents for charts — sort by total_messages since total_conversations may be 0
  const topAgents = agents
    .filter((a) => !a.is_deleted)
    .sort((a, b) => (b.total_messages || 0) - (a.total_messages || 0))
    .slice(0, 15);

  // Metric config for usage chart
  const metricConfig: Record<UsageMetric, { label: string; key: keyof AgentSummary; formatter: (v: number) => string }> = {
    messages: { label: 'Messages', key: 'total_messages', formatter: (v) => v.toLocaleString() },
    tokens: { label: 'Tokens', key: 'total_tokens', formatter: formatTokens },
    cost: { label: 'Cost', key: 'total_est_cost_usd', formatter: formatCost },
    unique_users: { label: 'Unique Users', key: 'total_unique_users', formatter: (v) => v.toLocaleString() },
  };

  // Re-sort topAgents by selected metric
  const sortedAgents = useMemo(() => {
    const cfg = metricConfig[usageMetric];
    return [...agents]
      .filter((a) => !a.is_deleted)
      .sort((a, b) => (Number(b[cfg.key]) || 0) - (Number(a[cfg.key]) || 0))
      .slice(0, 15);
  }, [agents, usageMetric]);

  // Agent Usage Ranking Chart
  const usageChartOptions: EChartsOption = useMemo(() => {
    const cfg = metricConfig[usageMetric];
    const names = sortedAgents.map((a) => a.agent_name.slice(0, 30));
    const values = sortedAgents.map((a) => Number(a[cfg.key]) || 0);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const agent = sortedAgents[params[0].dataIndex];
          if (!agent) return '';
          return `${agent.agent_name}<br/>${cfg.label}: ${cfg.formatter(Number(agent[cfg.key]) || 0)}`;
        },
      },
      grid: {
        left: '25%',
        right: '10%',
        top: '3%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        axisLabel: usageMetric === 'cost'
          ? { formatter: (v: number) => formatCost(v) }
          : usageMetric === 'tokens'
          ? { formatter: (v: number) => formatTokens(v) }
          : {},
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          name: cfg.label,
          type: 'bar',
          data: values.map((val, idx) => ({
            value: val,
            itemStyle: {
              color: sortedAgents[idx].agent_id === selectedAgentId
                ? CHART_COLORS[0]
                : selectedAgentId
                ? `${CHART_COLORS[0]}66`
                : CHART_COLORS[0],
            },
          })),
        },
      ],
    };
  }, [sortedAgents, selectedAgentId, usageMetric]);

  // Activity metric config
  const activityMetricConfig: Record<ActivityMetric, { label: string; perfKey: keyof AgentPerformance; formatter: (v: number) => string }> = {
    messages: { label: 'Messages', perfKey: 'total_messages', formatter: (v) => v.toLocaleString() },
    tokens: { label: 'Tokens', perfKey: 'total_tokens', formatter: formatTokens },
    cost: { label: 'Cost', perfKey: 'est_cost_usd', formatter: formatCost },
    unique_users: { label: 'Unique Users', perfKey: 'unique_users', formatter: (v) => v.toLocaleString() },
  };

  // Agent Activity Over Time Chart (configurable metric from performance data)
  const activityChartOptions: EChartsOption = useMemo(() => {
    if (performance.length === 0) return { title: { text: 'No activity data for this period', left: 'center', top: 'center', textStyle: { color: '#9CA3AF', fontSize: 14 } } };

    const actCfg = activityMetricConfig[activityMetric];
    const dates = Array.from(new Set(performance.map((p) => p.date_day))).sort();
    // Get top 5 agents by selected metric in this period
    const agentTotals = new Map<string, { name: string; total: number }>();
    performance.forEach((p) => {
      const cur = agentTotals.get(p.agent_id) || { name: p.agent_name, total: 0 };
      cur.total += Number(p[actCfg.perfKey]) || 0;
      agentTotals.set(p.agent_id, cur);
    });
    const top5Ids = Array.from(agentTotals.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([id]) => id);

    const agentIdsToShow = selectedAgentId ? [selectedAgentId] : top5Ids;

    const series = agentIdsToShow.map((agentId, idx) => {
      const info = agentTotals.get(agentId);
      return {
        name: info?.name || agentId,
        type: 'line' as const,
        smooth: true,
        data: dates.map((date) => {
          const entry = performance.find(
            (p) => p.date_day === date && p.agent_id === agentId
          );
          return entry ? Number(entry[actCfg.perfKey]) || 0 : 0;
        }),
        lineStyle: {
          width: agentId === selectedAgentId ? 3 : 2,
        },
        itemStyle: {
          color: CHART_COLORS[idx % CHART_COLORS.length],
        },
      };
    });

    return {
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: any) => actCfg.formatter(Number(value)),
      },
      legend: {
        data: series.map((s) => s.name),
        top: 0,
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates.map(formatDateShort),
      },
      yAxis: {
        type: 'value',
        axisLabel: activityMetric === 'cost'
          ? { formatter: (v: number) => formatCost(v) }
          : activityMetric === 'tokens'
          ? { formatter: (v: number) => formatTokens(v) }
          : {},
      },
      series,
    };
  }, [performance, selectedAgentId, activityMetric]);

  // Cost per Agent Chart
  const costChartOptions: EChartsOption = useMemo(() => {
    const names = topAgents.map((a) => a.agent_name.slice(0, 20));
    const costs = topAgents.map((a) => a.total_est_cost_usd);
    const maxCost = Math.max(...costs);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const agent = topAgents[params[0].dataIndex];
          const costPerMsg = agent.total_messages > 0
            ? agent.total_est_cost_usd / agent.total_messages
            : 0;
          return `${agent.agent_name}<br/>
                  Cost: ${formatCost(agent.total_est_cost_usd)}<br/>
                  Messages: ${agent.total_messages}<br/>
                  Tokens: ${formatTokens(agent.total_tokens)}<br/>
                  Cost/Msg: ${formatCost(costPerMsg)}`;
        },
      },
      grid: {
        left: '10%',
        right: '4%',
        bottom: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: {
          rotate: 45,
          fontSize: 10,
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (val: number) => formatCost(val),
        },
      },
      series: [
        {
          name: 'Cost',
          type: 'bar',
          data: costs.map((val) => ({
            value: val,
            itemStyle: {
              color: val < maxCost * 0.33
                ? '#16A34A'
                : val < maxCost * 0.66
                ? '#D97706'
                : '#DC2626',
            },
          })),
        },
      ],
    };
  }, [topAgents]);

  // Table date slicer state
  const [tableFrom, setTableFrom] = useState(from);
  const [tableTo, setTableTo] = useState(to);

  // Sync slicer bounds when main filter changes
  useMemo(() => {
    setTableFrom(from);
    setTableTo(to);
  }, [from, to]);

  // Fetch table data with slicer dates
  const tableQueryParams = new URLSearchParams({ from: tableFrom, to: tableTo }).toString();
  const { data: tableData, isLoading: tableLoading } = useSWR<ApiResponse<AgentSummary[]>>(
    `/agents/summary?${tableQueryParams}`,
    fetcher
  );
  const tableAgents = (tableData?.data || []).filter((a) => !a.is_deleted);

  // Table columns
  const columns: DataTableColumn<AgentSummary>[] = [
    {
      key: 'agent_name',
      header: 'Agent Name',
      sortable: true,
      width: '20%',
    },
    {
      key: 'agent_type',
      header: 'Type',
      render: (value) => (
        <StatusBadge
          status={
            value === 'simple' ? 'info' :
            value === 'cortex' ? 'success' :
            value === 'workflow' ? 'warning' : 'pending'
          }
          label={String(value || 'unknown')}
        />
      ),
      width: '10%',
    },
    {
      key: 'total_messages',
      header: 'Messages',
      sortable: true,
      render: (value) => Number(value || 0).toLocaleString(),
      width: '12%',
    },
    {
      key: 'total_tokens',
      header: 'Tokens',
      sortable: true,
      render: (value) => formatTokens(Number(value || 0)),
      width: '14%',
    },
    {
      key: 'total_est_cost_usd',
      header: 'Total Cost',
      sortable: true,
      render: (value) => (
        <span className="font-bold">{formatCost(Number(value || 0))}</span>
      ),
      width: '12%',
    },
    {
      key: 'total_unique_users',
      header: 'Unique Users',
      sortable: true,
      render: (value) => Number(value || 0).toLocaleString(),
      width: '12%',
    },
    {
      key: 'last_interacted_at',
      header: 'Last Active',
      sortable: true,
      render: (value) => value ? formatRelativeTime(value as string) : '—',
      width: '14%',
    },
  ];

  return (
    <div className="p-8 space-y-6">
      <KpiRow kpis={kpiCards} />

      {/* Agent Usage Ranking — full width under filters */}
      <ChartCard
        title="Agent Usage Ranking"
        subtitle={selectedAgentId ? "Click to clear filter" : "Click to filter"}
        isLoading={summaryLoading}
      >
        <div className="flex gap-1 mb-3">
          {(Object.keys(metricConfig) as UsageMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => setUsageMetric(m)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                usageMetric === m
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
              }`}
            >
              {metricConfig[m].label}
            </button>
          ))}
        </div>
        <div onClick={() => setSelectedAgentId(null)}>
          <BarChart options={usageChartOptions} height="320px" />
        </div>
      </ChartCard>

      {/* Cost per Agent */}
      <ChartCard title="Cost per Agent" subtitle="Top 15 agents" isLoading={summaryLoading}>
        <BarChart options={costChartOptions} height="320px" />
      </ChartCard>

      {/* Agent Activity Over Time */}
      <ChartCard
        title="Agent Activity Over Time"
        subtitle={selectedAgentId ? `Showing: ${agents.find(a => a.agent_id === selectedAgentId)?.agent_name}` : "Top 5 agents"}
        isLoading={performanceLoading}
      >
        <div className="flex gap-1 mb-3">
          {(Object.keys(activityMetricConfig) as ActivityMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => setActivityMetric(m)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                activityMetric === m
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
              }`}
            >
              {activityMetricConfig[m].label}
            </button>
          ))}
        </div>
        <LineChart options={activityChartOptions} height="320px" />
      </ChartCard>

      {/* Agent Leaderboard */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Agent Leaderboard</h2>
        </div>

        {/* Date Range Slicer */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium text-text-secondary">Date Range Slicer</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={tableFrom}
                min={from}
                max={tableTo}
                onChange={(e) => setTableFrom(e.target.value)}
                className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-text-secondary">to</span>
              <input
                type="date"
                value={tableTo}
                min={tableFrom}
                max={to}
                onChange={(e) => setTableTo(e.target.value)}
                className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {(tableFrom !== from || tableTo !== to) && (
              <button
                onClick={() => { setTableFrom(from); setTableTo(to); }}
                className="px-3 py-1.5 text-xs bg-slate-100 text-text-secondary rounded-lg hover:bg-slate-200 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={tableAgents}
          searchable
          searchKeys={['agent_name']}
          exportFilename={`agent-leaderboard-${tableFrom}-${tableTo}.csv`}
          isLoading={tableLoading}
          onRowClick={(row) => setSelectedAgentId(row.agent_id)}
        />
      </div>

      {/* Agent Detail SlideOver */}
      <SlideOver
        isOpen={!!selectedAgentId}
        onClose={() => setSelectedAgentId(null)}
        title={agentDetail?.agent_name || 'Agent Details'}
        subtitle={`${agentDetail?.agent_type} · ${agentDetail?.owner_email}`}
        width="520px"
      >
        {agentDetail && (
          <div className="space-y-6">
            {/* Agent KPIs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Conversations</p>
                <p className="text-xl font-bold">{agentDetail.total_conversations}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Unique Users</p>
                <p className="text-xl font-bold">{agentDetail.total_unique_users}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Total Cost</p>
                <p className="text-xl font-bold">{formatCost(agentDetail.total_est_cost_usd)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Satisfaction</p>
                <p className={`text-xl font-bold ${
                  agentDetail.satisfaction_rate >= 80 ? 'text-success' :
                  agentDetail.satisfaction_rate >= 60 ? 'text-warning' : 'text-danger'
                }`}>
                  {agentDetail.satisfaction_rate.toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Dual-axis chart */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Daily Performance</h3>
              <BarChart
                options={{
                  tooltip: { trigger: 'axis' },
                  legend: { data: ['Conversations', 'Cost'], top: 0 },
                  xAxis: {
                    type: 'category',
                    data: agentDetail.daily_performance.map((d) => formatDateShort(d.date_day)),
                  },
                  yAxis: [
                    { type: 'value', name: 'Conversations' },
                    {
                      type: 'value',
                      name: 'Cost',
                      axisLabel: { formatter: (v: number) => formatCost(v) },
                    },
                  ],
                  series: [
                    {
                      name: 'Conversations',
                      type: 'bar',
                      data: agentDetail.daily_performance.map((d) => d.total_conversations),
                      itemStyle: { color: CHART_COLORS[0] },
                    },
                    {
                      name: 'Cost',
                      type: 'line',
                      yAxisIndex: 1,
                      data: agentDetail.daily_performance.map((d) => d.est_cost_usd),
                      itemStyle: { color: '#D97706' },
                    },
                  ],
                  grid: {
                    left: '10%',
                    right: '10%',
                    bottom: '10%',
                    containLabel: true,
                  },
                }}
                height="200px"
              />
            </div>

            {/* Token Usage */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Token Usage</h3>
              <BarChart
                options={{
                  tooltip: { trigger: 'axis' },
                  xAxis: {
                    type: 'category',
                    data: agentDetail.daily_performance.map((d) => formatDateShort(d.date_day)),
                  },
                  yAxis: {
                    type: 'value',
                    axisLabel: { formatter: (v: number) => formatTokens(v) },
                  },
                  series: [
                    {
                      name: 'Tokens',
                      type: 'bar',
                      data: agentDetail.daily_performance.map((d) => d.total_tokens || 0),
                      itemStyle: { color: CHART_COLORS[2] },
                    },
                  ],
                  grid: {
                    left: '10%',
                    right: '5%',
                    bottom: '10%',
                    containLabel: true,
                  },
                }}
                height="160px"
              />
            </div>

            {/* Recent conversations */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Last 20 Conversations</h3>
              <div className="bg-slate-50 rounded-lg divide-y divide-slate-200">
                {agentDetail.recent_conversations.map((conv) => (
                  <div key={conv.conversation_id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{conv.user_email}</p>
                        <p className="text-xs text-text-secondary">
                          {conv.message_count} messages · {formatRelativeTime(conv.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatCost(conv.est_cost_usd)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
