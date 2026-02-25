'use client';

import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useFiltersStore } from '@/store/filters';
import { useAIStore } from '@/store/ai';
import { formatCost, formatTokens, formatDateShort, formatCompactNumber, formatPercent, formatDateTime } from '@/lib/formatters';
import { CHART_COLORS } from '@/lib/constants';
import type {
  ApiResponse,
  CostSummary,
  DailyCost,
  ModelCost,
  TopUser,
  CostDetailRow,
  UserCostDetail,
  TokensByModel,
} from '@/lib/api';
import KpiRow from '@/components/dashboard/KpiRow';
import ChartCard from '@/components/dashboard/ChartCard';
import LineChart from '@/components/charts/LineChart';
import DonutChart from '@/components/charts/DonutChart';
import BarChart from '@/components/charts/BarChart';
import DataTable, { DataTableColumn } from '@/components/dashboard/DataTable';
import SlideOver from '@/components/dashboard/SlideOver';
import type { EChartsOption } from 'echarts';

export default function CostPage() {
  const { from, to, organizationId, agentId } = useFiltersStore();
  const { setKpiValues } = useAIStore();
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Build query params
  const queryParams = new URLSearchParams({
    from,
    to,
    ...(organizationId && { organization_id: organizationId }),
    ...(agentId && { agent_id: agentId }),
  }).toString();

  // Fetch all data
  const { data: summaryData, isLoading: summaryLoading } = useSWR<ApiResponse<CostSummary>>(
    `/cost/summary?${queryParams}`,
    fetcher
  );

  const { data: dailyData, isLoading: dailyLoading } = useSWR<ApiResponse<DailyCost[]>>(
    `/cost/daily?${queryParams}`,
    fetcher
  );

  const { data: modelData, isLoading: modelLoading } = useSWR<ApiResponse<ModelCost[]>>(
    `/cost/by-model?${queryParams}`,
    fetcher
  );

  const { data: topUsersData, isLoading: topUsersLoading } = useSWR<ApiResponse<TopUser[]>>(
    `/cost/top-users?${queryParams}`,
    fetcher
  );

  const { data: detailData, isLoading: detailLoading } = useSWR<ApiResponse<CostDetailRow[]>>(
    `/cost/detail?${queryParams}`,
    fetcher
  );

  const { data: tokensByModelData, isLoading: tokensByModelLoading } = useSWR<ApiResponse<TokensByModel[]>>(
    `/cost/tokens-by-model?${queryParams}`,
    fetcher
  );

  const { data: userDetailData } = useSWR<ApiResponse<UserCostDetail>>(
    selectedUserId ? `/cost/user/${selectedUserId}?${queryParams}` : null,
    fetcher
  );

  const summary = summaryData?.data;
  const daily = dailyData?.data || [];
  const models = modelData?.data || [];
  const topUsers = topUsersData?.data || [];
  const details = detailData?.data || [];
  const tokensByModel = tokensByModelData?.data || [];
  const userDetail = userDetailData?.data;

  // Check for models with no cost
  const modelsWithNoCost = models.filter((m) => m.est_cost_usd === 0);

  // Calculate deltas
  const costDelta = summary
    ? ((summary.current.est_cost_usd - summary.previous.est_cost_usd) /
        (summary.previous.est_cost_usd || 1)) *
      100
    : 0;

  const tokensDelta = summary
    ? ((summary.current.total_tokens - summary.previous.total_tokens) /
        (summary.previous.total_tokens || 1)) *
      100
    : 0;

  const costPerTokenDelta = summary && summary.previous.total_tokens > 0
    ? ((summary.cost_per_1k_tokens - 
        (summary.previous.est_cost_usd / (summary.previous.total_tokens / 1000))) /
        (summary.previous.est_cost_usd / (summary.previous.total_tokens / 1000))) * 100
    : 0;

  // Calculate average cost per user
  const avgCostPerUser = topUsers.length > 0
    ? (summary?.current.est_cost_usd || 0) / topUsers.length
    : 0;

  // Calculate cost efficiency metrics
  const avgCostPerRequest = summary && summary.current.total_requests > 0
    ? summary.current.est_cost_usd / summary.current.total_requests
    : 0;

  const costPerUserDay = topUsers.length > 0 && summary
    ? summary.current.est_cost_usd / topUsers.length / 30 // Approximate 30-day period
    : 0;

  // KPI cards with icons
  // Inject KPI values for AI assistant
  useEffect(() => {
    if (summary && !summaryLoading) {
      setKpiValues({
        'Total Cost': formatCost(summary.current.est_cost_usd),
        'Total Tokens': formatTokens(summary.current.total_tokens),
        'Cost per 1M Tokens': formatCost(summary.cost_per_1k_tokens * 1000),
        'Total Requests': summary.current.total_requests.toLocaleString(),
      });
    }
  }, [summary, summaryLoading, setKpiValues]);

  const kpis = [
    {
      title: 'Total Cost',
      value: formatCost(summary?.current.est_cost_usd || 0),
      previousValue: formatCost(summary?.previous.est_cost_usd || 0),
      delta: costDelta,
      deltaDirection: 'up-bad' as const,
      isLoading: summaryLoading,
      icon: '💰',
      tooltip: 'Estimated total spend on LLM API calls during the selected period, based on token pricing per model.',
    },
    {
      title: 'Average Cost per User',
      value: formatCost(avgCostPerUser),
      subtitle: `${topUsers.length} active users`,
      isLoading: summaryLoading || topUsersLoading,
      icon: '👤',
      tooltip: 'Total cost divided by the number of distinct users who made at least one request in the period.',
    },
    {
      title: 'Total Tokens',
      value: formatTokens(summary?.current.total_tokens || 0),
      previousValue: formatTokens(summary?.previous.total_tokens || 0),
      delta: tokensDelta > 1000000 ? Infinity : tokensDelta,
      deltaDirection: 'up-bad' as const,
      isLoading: summaryLoading,
      icon: '🔢',
      tooltip: 'Sum of all input, output, and reasoning tokens consumed across every model during the selected period.',
    },
    {
      title: 'Cost per 1M Tokens',
      value: formatCost((summary?.cost_per_1k_tokens || 0) * 1000),
      delta: costPerTokenDelta,
      deltaDirection: 'up-bad' as const,
      isLoading: summaryLoading,
      icon: '📊',
      tooltip: 'Blended cost efficiency across all models. A rising value may indicate heavier use of more expensive models.',
    },
    {
      title: 'Avg Cost per Request',
      value: formatCost(avgCostPerRequest),
      subtitle: `${(summary?.current.total_requests || 0).toLocaleString()} requests`,
      isLoading: summaryLoading,
      icon: '⚡',
      tooltip: 'Total cost divided by the number of LLM API requests. Useful for spotting prompt-size or model-mix changes.',
    },
    {
      title: 'Cost per User-Day',
      value: formatCost(costPerUserDay),
      subtitle: 'Daily average per user',
      isLoading: summaryLoading || topUsersLoading,
      icon: '📅',
      tooltip: 'Estimated daily cost per active user, calculated as total cost ÷ active users ÷ 30 days.',
    },
  ];

  // Daily Cost Trend Chart
  const dailyChartOptions: EChartsOption = useMemo(() => {
    const dates = Array.from(new Set(daily.map((d) => d.date))).sort();
    const modelNames = Array.from(new Set(daily.map((d) => d.model)));

    const series = modelNames.map((model, index) => ({
      name: model,
      type: 'line' as const,
      smooth: true,
      data: dates.map((date) => {
        const entry = daily.find((d) => d.date === date && d.model === model);
        return entry ? entry.est_cost_usd : 0;
      }),
      areaStyle: {
        opacity: 0.15,
      },
      lineStyle: {
        width: 2,
      },
      itemStyle: {
        color: CHART_COLORS[index % CHART_COLORS.length],
      },
    }));

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!Array.isArray(params)) return '';
          const nonZero = params.filter((p: any) => p.value > 0).sort((a: any, b: any) => b.value - a.value);
          if (nonZero.length === 0) return '';
          let result = `${nonZero[0].axisValueLabel}<br/>`;
          nonZero.forEach((p: any) => {
            result += `${p.marker} ${p.seriesName}: ${formatCost(p.value)}<br/>`;
          });
          return result;
        },
      },
      legend: {
        data: modelNames,
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
        axisLabel: {
          formatter: (value: number) => formatCost(value),
        },
      },
      series,
    };
  }, [daily]);

  // Cost by Model Donut Chart
  const modelChartOptions: EChartsOption = useMemo(() => {
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const value = params.value;
          const percent = params.percent;
          return `${params.name}<br/>Cost: ${formatCost(value)}<br/>Percentage: ${formatPercent(percent)}`;
        },
      },
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'center',
        formatter: (name: string) => {
          const model = (models || []).find(m => m.model === name);
          if (model) {
            return `${name}: ${formatCompactNumber(model.est_cost_usd)}`;
          }
          return name;
        },
      },
      series: [
        {
          name: 'Cost by Model',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['40%', '50%'],
          data: (models || []).map((m, index) => ({
            value: m.est_cost_usd,
            name: m.model,
            itemStyle: {
              color: CHART_COLORS[index % CHART_COLORS.length],
            },
          })),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          label: {
            show: true,
            formatter: (params: any) => {
              if (params.percent < 5) return '';
              return `${params.name.length > 15 ? params.name.slice(0, 15) + '…' : params.name}\n${formatCost(params.value)}`;
            },
            fontSize: 11,
          },
        },
      ],
    };
  }, [models]);

  // Vendor Cost Trend Chart
  const vendorTrendOptions: EChartsOption = useMemo(() => {
    const dates = Array.from(new Set(daily.map((d) => d.date))).sort();
    
    // Group by provider
    const providerData = new Map<string, number[]>();
    (models || []).forEach((model) => {
      if (!providerData.has(model.provider)) {
        providerData.set(model.provider, new Array(dates.length).fill(0));
      }
    });

    // Fill in the data
    daily.forEach((entry) => {
      const model = (models || []).find((m) => m.model === entry.model);
      if (model) {
        const dateIndex = dates.indexOf(entry.date);
        if (dateIndex !== -1) {
          const current = providerData.get(model.provider) || [];
          current[dateIndex] += entry.est_cost_usd;
        }
      }
    });

    const series = Array.from(providerData.entries()).map(([provider, data], index) => ({
      name: provider,
      type: 'line' as const,
      smooth: true,
      data,
      areaStyle: {
        opacity: 0.3,
      },
      lineStyle: {
        width: 3,
      },
      itemStyle: {
        color: CHART_COLORS[index % CHART_COLORS.length],
      },
    }));

    return {
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value) => formatCost(value as number),
      },
      legend: {
        data: Array.from(providerData.keys()),
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
        axisLabel: {
          formatter: (value: number) => formatCost(value),
        },
      },
      series,
    };
  }, [daily, models]);

  // Cost vs Usage Scatter Plot
  const costUsageScatterOptions: EChartsOption = useMemo(() => {
    const scatterData = (models || []).map((model) => ({
      name: model.model,
      value: [
        model.total_tokens / 1000000, // X: Tokens in millions
        model.est_cost_usd, // Y: Cost
        model.total_requests, // Size: Requests
      ],
      provider: model.provider,
    }));

    // Group by provider for colors
    const providers = Array.from(new Set((models || []).map((m) => m.provider)));
    const series = providers.map((provider, index) => ({
      name: provider,
      type: 'scatter' as const,
      data: scatterData
        .filter((d) => d.provider === provider)
        .map((d) => ({
          value: d.value,
          name: d.name,
        })),
      symbolSize: (data: number[]) => Math.sqrt(data[2]) * 2, // Scale by sqrt of requests
      itemStyle: {
        color: CHART_COLORS[index % CHART_COLORS.length],
        opacity: 0.7,
      },
      emphasis: {
        focus: 'series' as const,
        itemStyle: {
          opacity: 1,
        },
      },
    }));

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data;
          return `${params.name}<br/>
            Tokens: ${formatTokens(data.value[0] * 1000000)}<br/>
            Cost: ${formatCost(data.value[1])}<br/>
            Requests: ${data.value[2].toLocaleString()}<br/>
            Provider: ${params.seriesName}`;
        },
      },
      legend: {
        data: providers,
        top: 0,
      },
      grid: {
        left: '10%',
        right: '10%',
        top: '15%',
        bottom: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: 'Tokens Used (Millions)',
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: {
          formatter: (value: number) => `${value.toFixed(1)}M`,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Cost (USD)',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          formatter: (value: number) => formatCost(value),
        },
      },
      series,
    };
  }, [models]);

  // Token Distribution Horizontal Bar
  const tokenChartOptions: EChartsOption = useMemo(() => {
    const modelNames = tokensByModel.map((m) => m.model);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        formatter: (params: any) => {
          if (Array.isArray(params)) {
            const modelName = params[0].axisValue;
            let result = `${modelName}<br/>`;
            params.forEach((param: any) => {
              result += `${param.marker} ${param.seriesName}: ${formatCompactNumber(param.value)}<br/>`;
            });
            return result;
          }
          return '';
        },
      },
      legend: {
        data: ['Input Tokens', 'Output Tokens', 'Reasoning Tokens'],
        top: 0,
      },
      grid: {
        left: '15%',
        right: '10%',
        top: '15%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => {
            if (value >= 1e9) {
              return `${(value / 1e9).toFixed(1)}B`;
            } else if (value >= 1e6) {
              return `${(value / 1e6).toFixed(1)}M`;
            } else if (value >= 1e3) {
              return `${(value / 1e3).toFixed(0)}K`;
            }
            return value.toFixed(0);
          },
        },
      },
      yAxis: {
        type: 'category',
        data: modelNames,
      },
      series: [
        {
          name: 'Input Tokens',
          type: 'bar',
          stack: 'total',
          data: tokensByModel.map((t) => t.input_tokens),
          itemStyle: { color: CHART_COLORS[0] },
        },
        {
          name: 'Output Tokens',
          type: 'bar',
          stack: 'total',
          data: tokensByModel.map((t) => t.output_tokens),
          itemStyle: { color: CHART_COLORS[1] },
        },
        {
          name: 'Reasoning Tokens',
          type: 'bar',
          stack: 'total',
          data: tokensByModel.map((t) => t.reasoning_tokens),
          itemStyle: { color: '#94A3B8' },
          label: {
            show: true,
            position: 'right',
            formatter: (params: any) => {
              const idx = params.dataIndex;
              const total = tokensByModel[idx].total_tokens;
              return total > 0 ? formatTokens(total) : '';
            },
            fontSize: 10,
            color: '#666',
          },
        },
      ],
    };
  }, [tokensByModel]);

  // Top 10 Users Horizontal Bar
  const topUsersChartOptions: EChartsOption = useMemo(() => {
    // Sort by cost descending and take top 10
    const sortedUsers = [...(topUsers || [])].sort((a, b) => b.est_cost_usd - a.est_cost_usd).slice(0, 10);
    const userEmails = sortedUsers.map((u) => (u.user_email || 'Unknown').slice(0, 30));
    const costs = sortedUsers.map((u) => u.est_cost_usd);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        valueFormatter: (value) => formatCost(value as number),
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
        axisLabel: {
          formatter: (value: number) => formatCost(value),
        },
      },
      yAxis: {
        type: 'category',
        data: userEmails,
        axisLabel: {
          fontSize: 11,
        },
      },
      series: [
        {
          name: 'Cost',
          type: 'bar',
          data: costs.map((cost, index) => ({
            value: cost,
            itemStyle: {
              color: CHART_COLORS[index % CHART_COLORS.length],
            },
          })),
          label: {
            show: true,
            position: 'right',
            formatter: (params: any) => formatCost(params.value),
            fontSize: 10,
            color: '#666',
          },
        },
      ],
    };
  }, [topUsers]);

  // Filter table data by selected model
  const filteredDetails = useMemo(() => {
    if (!selectedModel) return details;
    return details.filter((d) => d.model === selectedModel);
  }, [details, selectedModel]);

  // Table columns
  const columns: DataTableColumn<CostDetailRow>[] = [
    {
      key: 'date',
      header: 'Date & Time',
      sortable: true,
      render: (value) => formatDateTime(value as string),
      width: '12%',
    },
    {
      key: 'user_email',
      header: 'User Email',
      sortable: true,
      width: '16%',
    },
    {
      key: 'agent_name',
      header: 'Agent',
      sortable: true,
      width: '12%',
      render: (value) => (
        <span className={`text-xs ${value === 'Direct' ? 'text-text-secondary' : 'text-primary font-medium'}`}>
          {String(value)}
        </span>
      ),
    },
    {
      key: 'model',
      header: 'Model',
      sortable: true,
      width: '12%',
    },
    {
      key: 'provider',
      header: 'Provider',
      sortable: true,
      width: '9%',
    },
    {
      key: 'requests',
      header: 'Requests',
      sortable: true,
      width: '8%',
    },
    {
      key: 'input_tokens',
      header: 'Input Tokens',
      sortable: true,
      render: (value) => formatTokens(value as number),
      width: '12%',
    },
    {
      key: 'output_tokens',
      header: 'Output Tokens',
      sortable: true,
      render: (value) => formatTokens(value as number),
      width: '12%',
    },
    {
      key: 'est_cost_usd',
      header: 'Est. Cost',
      sortable: true,
      render: (value) => (
        <span className="font-bold">{formatCost(value as number)}</span>
      ),
      width: '13%',
    },
  ];

  return (
    <div className="p-8 space-y-6">
      {/* Models with No Cost Alert */}
      {modelsWithNoCost.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>Warning:</strong> The following models have no cost data: {modelsWithNoCost.map((m) => m.model).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <KpiRow kpis={kpis} />

      {/* Daily Cost Trend */}
      <ChartCard title="Daily Cost Trend" subtitle="Cost by model over time" infoTooltip="Shows daily estimated LLM spending broken down by model. Each line represents a model's cost over time. Useful for spotting cost spikes and identifying which models drive spend." isLoading={dailyLoading}>
        <LineChart options={dailyChartOptions} height="350px" />
      </ChartCard>

      {/* Vendor Cost Trend */}
      <ChartCard title="Vendor Cost Trend Over Time" subtitle="Cost trends by provider" infoTooltip="Aggregates daily costs by provider (e.g. Azure OpenAI, OpenAI). Helps compare spending across vendors and detect provider-level cost shifts." isLoading={dailyLoading || modelLoading}>
        <LineChart options={vendorTrendOptions} height="350px" />
      </ChartCard>

      {/* Cost vs Usage Analysis */}
      <ChartCard
        title="Cost vs Usage Analysis"
        subtitle="Bubble size represents request volume"
        infoTooltip="Scatter plot showing the relationship between token volume (X-axis) and cost (Y-axis) for each model. Bubble size indicates request count. Models in the upper-left are expensive per token; lower-right are cost-efficient."
        isLoading={modelLoading}
      >
        <div style={{ height: '400px' }}>
          <LineChart options={costUsageScatterOptions} height="400px" />
        </div>
      </ChartCard>

      {/* Cost by Model & Token Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Cost by Model"
          subtitle={selectedModel ? `Filtered: ${selectedModel}` : 'Click to filter table'}
          infoTooltip="Donut chart showing the proportion of total cost attributable to each model. Click a segment to filter the breakdown table below."
          isLoading={modelLoading}
        >
          <div onClick={() => {
            // Handle chart clicks if ECharts provides click events
            // For now, user can clear filter by clicking the subtitle
            if (selectedModel) {
              setSelectedModel(null);
            }
          }}>
            <DonutChart 
              options={modelChartOptions} 
              height="280px"
            />
          </div>
        </ChartCard>

        <ChartCard title="Token Distribution" subtitle="Actual input, output, and reasoning tokens from transactions" infoTooltip="Horizontal stacked bar showing how many input, output, and reasoning tokens each model consumed. Helps identify models with high reasoning overhead or output-heavy usage patterns." isLoading={tokensByModelLoading}>
          <BarChart options={tokenChartOptions} height="280px" />
        </ChartCard>
      </div>

      {/* Top 10 Users */}
      <ChartCard
        title="Top 10 Users by Cost"
        subtitle="Click a bar to view user details"
        infoTooltip="Horizontal bar chart ranking the 10 highest-spending users. Click a bar to open a detailed view of that user's cost breakdown, daily usage, and recent activity."
        isLoading={topUsersLoading}
      >
        <BarChart options={topUsersChartOptions} height="280px" />
      </ChartCard>

      {/* Cost Breakdown Table */}
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-text-primary">Daily Usage Breakdown</h2>
        <p className="text-sm text-text-secondary">Aggregated per user, model, agent, and day</p>
      </div>
      <DataTable
        columns={columns}
        data={filteredDetails}
        searchable
searchKeys={['user_email', 'agent_name', 'model']}
        exportFilename={`cost-breakdown-${from}-${to}.csv`}
        isLoading={detailLoading}
        onRowClick={(row) => {
          // Find user ID from the row
          const user = topUsers.find((u) => u.user_email === row.user_email);
          if (user) {
            setSelectedUserId(user.user_id);
          }
        }}
      />

      {/* User Detail SlideOver */}
      <SlideOver
        isOpen={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        title={userDetail?.user_email || 'User Details'}
        subtitle={userDetail?.organization_id || undefined}
      >
        {userDetail && (
          <div className="space-y-6">
            {/* User KPIs */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Total Cost</p>
                <p className="text-xl font-bold text-text-primary">
                  {formatCost(userDetail.summary.est_cost_usd)}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Total Tokens</p>
                <p className="text-xl font-bold text-text-primary">
                  {formatTokens(userDetail.summary.total_tokens)}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Requests</p>
                <p className="text-xl font-bold text-text-primary">
                  {userDetail.summary.total_requests.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Cost by Model for User */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Cost by Model</h3>
              <DonutChart
                options={{
                  tooltip: {
                    trigger: 'item',
                    formatter: '{b}: {c} ({d}%)',
                    valueFormatter: (value) => formatCost(value as number),
                  },
                  series: [
                    {
                      type: 'pie',
                      radius: ['40%', '70%'],
                      data: userDetail.by_model.map((m, i) => ({
                        value: m.est_cost_usd,
                        name: m.model,
                        itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
                      })),
                    },
                  ],
                }}
                height="200px"
              />
            </div>

            {/* Daily Cost for User */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Daily Cost</h3>
              <LineChart
                options={{
                  tooltip: {
                    trigger: 'axis',
                    valueFormatter: (value) => formatCost(value as number),
                  },
                  xAxis: {
                    type: 'category',
                    data: userDetail.daily.map((d) => formatDateShort(d.date)),
                  },
                  yAxis: {
                    type: 'value',
                    axisLabel: {
                      formatter: (value: number) => formatCost(value),
                    },
                  },
                  series: [
                    {
                      type: 'line',
                      data: userDetail.daily.map((d) => d.est_cost_usd),
                      smooth: true,
                      areaStyle: { opacity: 0.2 },
                      itemStyle: { color: CHART_COLORS[0] },
                    },
                  ],
                  grid: {
                    left: '10%',
                    right: '5%',
                    top: '10%',
                    bottom: '10%',
                    containLabel: true,
                  },
                }}
                height="180px"
              />
            </div>

            {/* Recent Activity */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Recent Activity</h3>
              <div className="bg-slate-50 rounded-lg divide-y divide-slate-200">
                {userDetail.recent_activity.map((activity, index) => (
                  <div key={index} className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {activity.model} · {activity.provider}
                        </p>
                        <p className="text-xs text-text-secondary">{activity.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-text-primary">
                          {formatCost(activity.est_cost_usd)}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {activity.requests} requests
                        </p>
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
