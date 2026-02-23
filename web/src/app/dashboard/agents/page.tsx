'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useFiltersStore } from '@/store/filters';
import { formatCost, formatTokens, formatPercent, formatDateShort, formatRelativeTime } from '@/lib/formatters';
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
import AreaChart from '@/components/charts/AreaChart';
import DataTable, { DataTableColumn } from '@/components/dashboard/DataTable';
import SlideOver from '@/components/dashboard/SlideOver';
import StatusBadge from '@/components/dashboard/StatusBadge';
import type { EChartsOption } from 'echarts';

export default function AgentsPage() {
  const { from, to } = useFiltersStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const queryParams = new URLSearchParams({ from, to }).toString();

  // Fetch data
  const { data: kpisData, isLoading: kpisLoading } = useSWR<ApiResponse<AgentKPIs>>(
    `/agents/kpis?${queryParams}`,
    fetcher
  );

  const { data: summaryData, isLoading: summaryLoading } = useSWR<ApiResponse<AgentSummary[]>>(
    '/agents/summary',
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

  // Calculate deltas
  const activeAgentsDelta = kpis
    ? ((kpis.current.active_agents - kpis.previous.active_agents) /
        (kpis.previous.active_agents || 1)) * 100
    : 0;

  const conversationsDelta = kpis
    ? ((kpis.current.total_conversations - kpis.previous.total_conversations) /
        (kpis.previous.total_conversations || 1)) * 100
    : 0;

  const satisfactionDelta = kpis
    ? kpis.current.avg_satisfaction_rate - kpis.previous.avg_satisfaction_rate
    : 0;

  // KPI cards
  const kpiCards = [
    {
      title: 'Active Agents',
      value: kpis?.current.active_agents.toString() || '0',
      previousValue: kpis?.previous.active_agents.toString(),
      delta: activeAgentsDelta,
      deltaDirection: 'up-good' as const,
      isLoading: kpisLoading,
    },
    {
      title: 'Total Conversations',
      value: kpis?.current.total_conversations.toLocaleString() || '0',
      previousValue: kpis?.previous.total_conversations.toLocaleString(),
      delta: conversationsDelta,
      deltaDirection: 'up-good' as const,
      isLoading: kpisLoading,
    },
    {
      title: 'Avg Satisfaction Rate',
      value: formatPercent(kpis?.current.avg_satisfaction_rate || 0),
      delta: satisfactionDelta,
      deltaDirection: 'up-good' as const,
      isLoading: kpisLoading,
    },
    {
      title: 'Most Used Agent',
      value: kpis?.current.most_used_agent?.agent_name || 'N/A',
      subtitle: kpis?.current.most_used_agent
        ? `${kpis.current.most_used_agent.total_conversations} messages`
        : undefined,
      isLoading: kpisLoading,
    },
  ];

  // Top agents for charts — sort by total_messages since total_conversations may be 0
  const topAgents = agents
    .filter((a) => !a.is_deleted)
    .sort((a, b) => (b.total_messages || 0) - (a.total_messages || 0))
    .slice(0, 15);

  // Agent Usage Ranking Chart
  const usageChartOptions: EChartsOption = useMemo(() => {
    const names = topAgents.map((a) => a.agent_name.slice(0, 30));
    const messages = topAgents.map((a) => a.total_messages || 0);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
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
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          name: 'Messages',
          type: 'bar',
          data: messages.map((val, idx) => ({
            value: val,
            itemStyle: {
              color: topAgents[idx].agent_id === selectedAgentId
                ? CHART_COLORS[0]
                : selectedAgentId
                ? `${CHART_COLORS[0]}66`
                : CHART_COLORS[0],
            },
          })),
        },
      ],
    };
  }, [topAgents, selectedAgentId]);

  // Satisfaction Rate Chart — filter to agents that actually have reactions
  const satisfactionChartOptions: EChartsOption = useMemo(() => {
    const agentsWithReactions = topAgents.filter(
      (a) => (a.total_positive_reactions || 0) + (a.total_negative_reactions || 0) > 0
    );
    const chartAgents = agentsWithReactions.length > 0 ? agentsWithReactions : topAgents;
    const names = chartAgents.map((a) => a.agent_name.slice(0, 30));
    const rates = chartAgents.map((a) => a.satisfaction_rate || 0);
    const avgRate = kpis?.current.avg_satisfaction_rate || 0;

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const agent = chartAgents[params[0].dataIndex];
          if (!agent) return '';
          return `${agent.agent_name}<br/>
                  Satisfaction: ${(agent.satisfaction_rate || 0).toFixed(1)}%<br/>
                  Positive: ${agent.total_positive_reactions || 0}<br/>
                  Negative: ${agent.total_negative_reactions || 0}`;  
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
        max: 100,
        axisLabel: { formatter: '{value}%' },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          name: 'Satisfaction',
          type: 'bar',
          data: rates.map((val) => ({
            value: val,
            itemStyle: {
              color: val >= 80 ? '#16A34A' : val >= 60 ? '#D97706' : '#DC2626',
            },
          })),
          markLine: {
            data: [
              {
                xAxis: avgRate,
                lineStyle: { color: '#6B7280', type: 'dashed' },
                label: { formatter: 'Avg' },
              },
            ],
          },
        },
      ],
    };
  }, [topAgents, kpis]);

  // Agent Activity Over Time Chart
  const activityChartOptions: EChartsOption = useMemo(() => {
    const dates = Array.from(new Set(performance.map((p) => p.date_day))).sort();
    const top5Agents = topAgents.slice(0, 5);
    
    const agentsToShow = selectedAgentId
      ? agents.filter((a) => a.agent_id === selectedAgentId)
      : top5Agents;

    const series = agentsToShow.map((agent, idx) => ({
      name: agent.agent_name,
      type: 'line' as const,
      smooth: true,
      data: dates.map((date) => {
        const entry = performance.find(
          (p) => p.date_day === date && p.agent_id === agent.agent_id
        );
        return entry ? entry.total_conversations : 0;
      }),
      lineStyle: {
        width: agent.agent_id === selectedAgentId ? 3 : 2,
        opacity: selectedAgentId && agent.agent_id !== selectedAgentId ? 0.3 : 1,
      },
      itemStyle: {
        color: CHART_COLORS[idx % CHART_COLORS.length],
      },
    }));

    return {
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: agentsToShow.map((a) => a.agent_name),
        top: 0,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates.map(formatDateShort),
      },
      yAxis: {
        type: 'value',
      },
      series,
    };
  }, [performance, topAgents, selectedAgentId, agents]);

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

  // Reactions Over Time Chart
  const reactionsChartOptions: EChartsOption = useMemo(() => {
    const filteredPerf = selectedAgentId
      ? performance.filter((p) => p.agent_id === selectedAgentId)
      : performance;

    const dates = Array.from(new Set(filteredPerf.map((p) => p.date_day))).sort();
    
    const positiveData = dates.map((date) => {
      const dayData = filteredPerf.filter((p) => p.date_day === date);
      return dayData.reduce((sum, p) => sum + p.reactions_positive, 0);
    });

    const negativeData = dates.map((date) => {
      const dayData = filteredPerf.filter((p) => p.date_day === date);
      return dayData.reduce((sum, p) => sum + p.reactions_negative, 0);
    });

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
      },
      legend: {
        data: ['Positive', 'Negative'],
        top: 0,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates.map(formatDateShort),
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          name: 'Positive',
          type: 'line',
          stack: 'total',
          areaStyle: { opacity: 0.6 },
          data: positiveData,
          itemStyle: { color: '#16A34A' },
        },
        {
          name: 'Negative',
          type: 'line',
          stack: 'total',
          areaStyle: { opacity: 0.6 },
          data: negativeData,
          itemStyle: { color: '#DC2626' },
        },
      ],
    };
  }, [performance, selectedAgentId]);

  // Table columns
  const columns: DataTableColumn<AgentSummary>[] = [
    {
      key: 'agent_name',
      header: 'Agent Name',
      sortable: true,
      width: '15%',
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
          label={String(value)}
        />
      ),
      width: '8%',
    },
    {
      key: 'owner_email',
      header: 'Owner Email',
      sortable: true,
      width: '15%',
    },
    {
      key: 'total_conversations',
      header: 'Conversations',
      sortable: true,
      width: '10%',
    },
    {
      key: 'total_unique_users',
      header: 'Unique Users',
      sortable: true,
      width: '10%',
    },
    {
      key: 'avg_messages_per_conv',
      header: 'Avg Msgs/Conv',
      sortable: true,
      render: (_value, row) => {
        const avg = row.total_conversations > 0
          ? row.total_messages / row.total_conversations
          : 0;
        return avg.toFixed(1);
      },
      width: '10%',
    },
    {
      key: 'total_tokens',
      header: 'Total Tokens',
      sortable: true,
      render: (value) => formatTokens(value as number),
      width: '10%',
    },
    {
      key: 'total_est_cost_usd',
      header: 'Total Cost',
      sortable: true,
      render: (value) => (
        <span className="font-bold">{formatCost(value as number)}</span>
      ),
      width: '10%',
    },
    {
      key: 'satisfaction_rate',
      header: 'Satisfaction Rate',
      sortable: true,
      render: (value) => {
        const rate = value as number;
        const color = rate >= 80 ? 'bg-success' : rate >= 60 ? 'bg-warning' : 'bg-danger';
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-200 rounded-full h-2">
              <div
                className={`${color} h-2 rounded-full`}
                style={{ width: `${rate}%` }}
              />
            </div>
            <span className="text-xs font-medium">{rate.toFixed(0)}%</span>
          </div>
        );
      },
      width: '12%',
    },
  ];

  return (
    <div className="p-8 space-y-6">
      <KpiRow kpis={kpiCards} />

      {/* Agent Usage Ranking & Satisfaction Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Agent Usage Ranking"
          subtitle={selectedAgentId ? "Click to clear filter" : "Click to filter"}
          isLoading={summaryLoading}
        >
          <div onClick={() => setSelectedAgentId(null)}>
            <BarChart options={usageChartOptions} height="320px" />
          </div>
        </ChartCard>

        <ChartCard
          title="Satisfaction Rate by Agent"
          subtitle="Green: ≥80%, Amber: 60-79%, Red: <60%"
          isLoading={summaryLoading}
        >
          <BarChart options={satisfactionChartOptions} height="320px" />
        </ChartCard>
      </div>

      {/* Agent Activity Over Time */}
      <ChartCard
        title="Agent Activity Over Time"
        subtitle={selectedAgentId ? `Showing: ${agents.find(a => a.agent_id === selectedAgentId)?.agent_name}` : "Top 5 agents"}
        isLoading={performanceLoading}
      >
        <LineChart options={activityChartOptions} height="320px" />
      </ChartCard>

      {/* Cost per Agent & Reactions Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Cost per Agent" subtitle="Top 15 agents" isLoading={summaryLoading}>
          <BarChart options={costChartOptions} height="280px" />
        </ChartCard>

        <ChartCard
          title="Reactions Over Time"
          subtitle={selectedAgentId ? "Filtered to selected agent" : "All agents"}
          isLoading={performanceLoading}
        >
          <AreaChart options={reactionsChartOptions} height="280px" />
        </ChartCard>
      </div>

      {/* Agent Leaderboard Table */}
      <DataTable
        columns={columns}
        data={agents.filter((a) => !a.is_deleted)}
        searchable
        searchKeys={['agent_name', 'owner_email']}
        exportFilename={`agent-performance-${from}-${to}.csv`}
        isLoading={summaryLoading}
        onRowClick={(row) => setSelectedAgentId(row.agent_id)}
      />

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

            {/* Satisfaction trend */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Satisfaction Trend</h3>
              <AreaChart
                options={{
                  tooltip: { trigger: 'axis' },
                  legend: { data: ['Positive', 'Negative'], top: 0 },
                  xAxis: {
                    type: 'category',
                    data: agentDetail.daily_performance.map((d) => formatDateShort(d.date_day)),
                  },
                  yAxis: { type: 'value' },
                  series: [
                    {
                      name: 'Positive',
                      type: 'line',
                      stack: 'reactions',
                      areaStyle: { opacity: 0.6 },
                      data: agentDetail.daily_performance.map((d) => d.reactions_positive),
                      itemStyle: { color: '#16A34A' },
                    },
                    {
                      name: 'Negative',
                      type: 'line',
                      stack: 'reactions',
                      areaStyle: { opacity: 0.6 },
                      data: agentDetail.daily_performance.map((d) => d.reactions_negative),
                      itemStyle: { color: '#DC2626' },
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
