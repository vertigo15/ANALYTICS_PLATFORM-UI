'use client';

import { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { formatCost, formatRelativeTime } from '@/lib/formatters';
import { CHART_COLORS } from '@/lib/constants';
import type {
  ApiResponse,
  OperationsKPIs,
  HealthIndicator,
  HourlyOperations,
  PlatformEvent,
} from '@/lib/api';
import KpiRow from '@/components/dashboard/KpiRow';
import ChartCard from '@/components/dashboard/ChartCard';
import AreaChart from '@/components/charts/AreaChart';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import DataTable, { DataTableColumn } from '@/components/dashboard/DataTable';
import StatusBadge from '@/components/dashboard/StatusBadge';
import type { EChartsOption } from 'echarts';

export default function OperationsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Fetch data with refresh key
  const { data: kpisData, isLoading: kpisLoading } = useSWR<ApiResponse<OperationsKPIs>>(
    `/operations/kpis?refresh=${refreshKey}`,
    fetcher,
    { refreshInterval: 300000 }
  );

  const { data: statusData, isLoading: statusLoading } = useSWR<ApiResponse<HealthIndicator[]>>(
    `/operations/status?refresh=${refreshKey}`,
    fetcher,
    { refreshInterval: 300000 }
  );

  const { data: hourlyData, isLoading: hourlyLoading } = useSWR<ApiResponse<HourlyOperations[]>>(
    `/operations/hourly?hours=24&refresh=${refreshKey}`,
    fetcher,
    { refreshInterval: 300000 }
  );

  const { data: eventsData, isLoading: eventsLoading } = useSWR<ApiResponse<PlatformEvent[]>>(
    `/operations/events?refresh=${refreshKey}`,
    fetcher,
    { refreshInterval: 300000 }
  );

  const kpis = kpisData?.data;
  const healthIndicators = statusData?.data || [];
  const hourly = hourlyData?.data || [];
  const events = eventsData?.data || [];

  // KPI cards
  const kpiCards = [
    {
      title: 'Messages Last Hour',
      value: kpis?.messages_last_hour.toLocaleString() || '0',
      isLoading: kpisLoading,
    },
    {
      title: 'Cost Last Hour',
      value: formatCost(kpis?.cost_last_hour || 0),
      isLoading: kpisLoading,
    },
    {
      title: 'Doc Failure Rate (24h)',
      value: kpis ? `${(kpis.doc_failure_rate_24h * 100).toFixed(1)}%` : '0%',
      isLoading: kpisLoading,
    },
    {
      title: 'Active Users Last Hour',
      value: kpis?.active_users_last_hour.toString() || '0',
      isLoading: kpisLoading,
    },
  ];

  // Hourly Message Volume Chart with Anomaly Bands
  const hourlyMessageVolumeOptions: EChartsOption = useMemo(() => {
    const hours = hourly.map((h) => {
      const date = new Date(h.date_hour);
      return `${date.getHours()}:00`;
    });
    const userMessages = hourly.map((h) => h.user_messages);
    const assistantMessages = hourly.map((h) => h.assistant_messages);

    // Calculate anomaly bands
    const upperBound = hourly.map((h) => {
      const avg = Number(h.avg_user_messages_7d) || 0;
      const stddev = Number(h.stddev_user_messages_7d) || 0;
      return avg + stddev;
    });

    const lowerBound = hourly.map((h) => {
      const avg = Number(h.avg_user_messages_7d) || 0;
      const stddev = Number(h.stddev_user_messages_7d) || 0;
      return Math.max(0, avg - stddev);
    });

    return {
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['User Messages', 'Assistant Messages', 'Normal Range'],
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
        data: hours,
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          name: 'Normal Range',
          type: 'line',
          data: upperBound,
          lineStyle: { opacity: 0 },
          stack: 'confidence',
          symbol: 'none',
          areaStyle: {
            color: 'rgba(200, 200, 200, 0.3)',
          },
        },
        {
          name: 'Lower Bound',
          type: 'line',
          data: lowerBound.map((val, idx) => upperBound[idx] - val),
          lineStyle: { opacity: 0 },
          stack: 'confidence',
          symbol: 'none',
          areaStyle: {
            color: 'rgba(255, 255, 255, 1)',
          },
        },
        {
          name: 'User Messages',
          type: 'line',
          smooth: true,
          data: userMessages.map((val, idx) => {
            const isAnomaly = val > upperBound[idx] || val < lowerBound[idx];
            return {
              value: val,
              itemStyle: isAnomaly ? { color: '#EF4444', borderWidth: 3 } : undefined,
            };
          }),
          itemStyle: { color: CHART_COLORS[0] },
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.3 },
        },
        {
          name: 'Assistant Messages',
          type: 'line',
          smooth: true,
          data: assistantMessages,
          itemStyle: { color: CHART_COLORS[4] },
          lineStyle: { width: 2, type: 'dashed', opacity: 0.8 },
        },
      ],
    };
  }, [hourly]);

  // Hourly Cost Chart
  const hourlyCostOptions: EChartsOption = useMemo(() => {
    const hours = hourly.map((h) => {
      const date = new Date(h.date_hour);
      return `${date.getHours()}:00`;
    });
    const costs = hourly.map((h) => h.total_cost_usd);

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const cost = params[0].value;
          const hour = params[0].name;
          return `${hour}<br/>Cost: ${formatCost(cost)}`;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: hours,
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
          type: 'line',
          smooth: true,
          data: costs,
          itemStyle: { color: '#D97706' },
          lineStyle: { width: 2 },
        },
      ],
    };
  }, [hourly]);

  // Document Processing Rate (Dual-Axis)
  const docProcessingOptions: EChartsOption = useMemo(() => {
    const hours = hourly.map((h) => {
      const date = new Date(h.date_hour);
      return `${date.getHours()}:00`;
    });
    const newDocs = hourly.map((h) => h.new_documents);
    const failureRate = hourly.map((h) => (h.doc_failure_rate * 100).toFixed(1));

    return {
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['New Documents', 'Failure Rate'],
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
        data: hours,
      },
      yAxis: [
        {
          type: 'value',
          name: 'Documents',
          position: 'left',
        },
        {
          type: 'value',
          name: 'Failure %',
          position: 'right',
          max: 100,
          axisLabel: {
            formatter: '{value}%',
          },
        },
      ],
      series: [
        {
          name: 'New Documents',
          type: 'bar',
          data: newDocs,
          itemStyle: { color: '#9CA3AF' },
        },
        {
          name: 'Failure Rate',
          type: 'line',
          yAxisIndex: 1,
          data: failureRate,
          itemStyle: { color: '#DC2626' },
          lineStyle: { width: 2 },
        },
      ],
    };
  }, [hourly]);

  // Agent Traffic Stacked Area
  const agentTrafficOptions: EChartsOption = useMemo(() => {
    const hours = hourly.map((h) => {
      const date = new Date(h.date_hour);
      return `${date.getHours()}:00`;
    });

    // Simplified: show total agent usage per hour
    // In a real implementation, we'd need agent-by-agent breakdown from the API
    const agentData = hourly.map((h) => h.unique_agents_used);

    return {
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['Agent Usage'],
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
        data: hours,
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          name: 'Agent Usage',
          type: 'line',
          stack: 'total',
          areaStyle: { opacity: 0.6 },
          data: agentData,
          itemStyle: { color: CHART_COLORS[2] },
        },
      ],
    };
  }, [hourly]);

  // Events Table Columns
  const eventColumns: DataTableColumn<PlatformEvent>[] = [
    {
      key: 'timestamp',
      header: 'Time',
      sortable: true,
      width: '20%',
      render: (value) => formatRelativeTime(value as string),
    },
    {
      key: 'event_type',
      header: 'Event Type',
      sortable: true,
      width: '20%',
    },
    {
      key: 'description',
      header: 'Description',
      width: '45%',
    },
    {
      key: 'severity',
      header: 'Severity',
      sortable: true,
      width: '15%',
      render: (value) => {
        const severity = value as 'info' | 'warning' | 'error';
        return (
          <StatusBadge
            status={severity === 'info' ? 'info' : severity === 'warning' ? 'warning' : 'error'}
            label={severity.toUpperCase()}
          />
        );
      },
    },
  ];

  return (
    <div className="p-8 space-y-6">
      {/* Status Bar */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h3 className="text-sm font-semibold mb-3">Platform Health Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {healthIndicators.map((indicator) => (
            <div key={indicator.label} className="flex items-start gap-3">
              <div
                className={`w-3 h-3 rounded-full mt-1 ${
                  indicator.status === 'ok'
                    ? 'bg-success'
                    : indicator.status === 'warning'
                    ? 'bg-warning'
                    : 'bg-danger'
                }`}
              />
              <div>
                <p className="text-sm font-medium">{indicator.label}</p>
                <p className="text-xs text-text-secondary">{indicator.description}</p>
              </div>
            </div>
          ))}
        </div>
        {statusLoading && (
          <p className="text-xs text-text-secondary mt-2">Loading health status...</p>
        )}
      </div>

      <KpiRow kpis={kpiCards} />

      {/* Hourly Message Volume - Full Width */}
      <ChartCard
        title="Hourly Message Volume"
        subtitle="User and assistant messages with anomaly detection"
        isLoading={hourlyLoading}
      >
        <AreaChart options={hourlyMessageVolumeOptions} height="320px" />
      </ChartCard>

      {/* Hourly Cost & Document Processing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Hourly Cost" subtitle="Last 24 hours" isLoading={hourlyLoading}>
          <LineChart options={hourlyCostOptions} height="260px" />
        </ChartCard>

        <ChartCard
          title="Document Processing Rate"
          subtitle="New documents and failure rate"
          isLoading={hourlyLoading}
        >
          <BarChart options={docProcessingOptions} height="260px" />
        </ChartCard>
      </div>

      {/* Agent Traffic - Full Width */}
      <ChartCard
        title="Agent Traffic"
        subtitle="Unique agents used per hour"
        isLoading={hourlyLoading}
      >
        <AreaChart options={agentTrafficOptions} height="280px" />
      </ChartCard>

      {/* Platform Events Table */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Platform Events</h3>
          <p className="text-xs text-text-secondary">Auto-refreshes every 5 minutes</p>
        </div>
        <DataTable
          columns={eventColumns}
          data={events.map((e, idx) => ({
            ...e,
            id: `${e.timestamp}-${idx}`,
          }) as PlatformEvent & { id: string })}
          isLoading={eventsLoading}
        />
      </div>
    </div>
  );
}
