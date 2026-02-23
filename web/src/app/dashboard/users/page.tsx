'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useFiltersStore } from '@/store/filters';
import { formatCost, formatTokens, formatDateShort, formatRelativeTime, formatNumberWithCommas } from '@/lib/formatters';
import { CHART_COLORS } from '@/lib/constants';
import type {
  ApiResponse,
  UserKPIs,
  DailyActivity,
  ActivityHeatmap,
  UserSummary,
  UserDetail,
} from '@/lib/api';
import KpiRow from '@/components/dashboard/KpiRow';
import ChartCard from '@/components/dashboard/ChartCard';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import DonutChart from '@/components/charts/DonutChart';
import DataTable, { DataTableColumn } from '@/components/dashboard/DataTable';
import SlideOver from '@/components/dashboard/SlideOver';
import type { EChartsOption } from 'echarts';

export default function UsersPage() {
  const { from, to } = useFiltersStore();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [lastLoginFilter, setLastLoginFilter] = useState<string>('all');

  const queryParams = new URLSearchParams({ from, to }).toString();

  // Fetch data
  const { data: kpisData, isLoading: kpisLoading } = useSWR<ApiResponse<UserKPIs>>(
    `/users/kpis?${queryParams}`,
    fetcher
  );

  const { data: dailyData, isLoading: dailyLoading } = useSWR<ApiResponse<DailyActivity[]>>(
    `/users/activity-daily?${queryParams}`,
    fetcher
  );

  const { data: heatmapData, isLoading: heatmapLoading } = useSWR<ApiResponse<ActivityHeatmap[]>>(
    `/users/activity-heatmap?${queryParams}`,
    fetcher
  );

  const { data: summaryData, isLoading: summaryLoading } = useSWR<ApiResponse<UserSummary[]>>(
    `/users/summary?${queryParams}`,
    fetcher
  );

  const { data: userDetailData } = useSWR<ApiResponse<UserDetail>>(
    selectedUserId ? `/users/${selectedUserId}?${queryParams}` : null,
    fetcher
  );

  const kpis = kpisData?.data;
  const daily = dailyData?.data || [];
  const heatmap = heatmapData?.data || [];
  const users = summaryData?.data || [];
  const userDetail = userDetailData?.data;

  // Calculate deltas
  const dauDelta = kpis
    ? ((kpis.current.dau - kpis.previous.dau) / (kpis.previous.dau || 1)) * 100
    : 0;

  const wauDelta = kpis
    ? ((kpis.current.wau - kpis.previous.wau) / (kpis.previous.wau || 1)) * 100
    : 0;

  const mauDelta = kpis
    ? ((kpis.current.mau - kpis.previous.mau) / (kpis.previous.mau || 1)) * 100
    : 0;

  const newUsersDelta = kpis
    ? ((kpis.current.new_users - kpis.previous.new_users) / (kpis.previous.new_users || 1)) * 100
    : 0;

  const interactionsPerDauDelta = kpis
    ? ((kpis.current.interactions_per_dau - kpis.previous.interactions_per_dau) / (kpis.previous.interactions_per_dau || 1)) * 100
    : 0;

  const powerUserRatioDelta = kpis
    ? ((kpis.current.power_user_ratio - kpis.previous.power_user_ratio) / (kpis.previous.power_user_ratio || 1)) * 100
    : 0;

  // KPI cards
  const kpiCards = [
    {
      title: 'DAU',
      value: kpis?.current.dau.toString() || '0',
      previousValue: kpis?.previous.dau.toString(),
      delta: dauDelta,
      deltaDirection: 'up-good' as const,
      isLoading: kpisLoading,
      tooltip: 'Daily Active Users - Unique users who made at least one request on the most recent day (yesterday)',
      sparklineData: kpis?.dau_sparkline?.map(n => Number(n)) || [],
    },
    {
      title: 'WAU',
      value: kpis?.current.wau.toString() || '0',
      previousValue: kpis?.previous.wau.toString(),
      delta: wauDelta,
      deltaDirection: 'up-good' as const,
      isLoading: kpisLoading,
      tooltip: 'Weekly Active Users - Unique users active in the last 7 days',
      sparklineData: kpis?.wau_sparkline?.map(n => Number(n)) || [],
    },
    {
      title: 'MAU',
      value: kpis?.current.mau.toString() || '0',
      previousValue: kpis?.previous.mau.toString(),
      delta: mauDelta,
      deltaDirection: 'up-good' as const,
      isLoading: kpisLoading,
      tooltip: 'Monthly Active Users - Unique users active in the last 30 days',
    },
    {
      title: 'New Users',
      value: kpis?.current.new_users.toString() || '0',
      previousValue: kpis?.previous.new_users.toString(),
      delta: newUsersDelta,
      deltaDirection: 'up-good' as const,
      isLoading: kpisLoading,
      tooltip: 'Users who created accounts within the selected date range',
    },
    {
      title: 'Interactions/DAU',
      value: kpis?.current.interactions_per_dau.toFixed(1) || '0',
      previousValue: kpis?.previous.interactions_per_dau.toFixed(1),
      delta: interactionsPerDauDelta,
      deltaDirection: 'up-good' as const,
      isLoading: kpisLoading,
      tooltip: 'Average interactions per daily active user. Low values (< 5) suggest users aren\'t finding the AI useful. Very high values (> 50) may indicate users are struggling to get clear answers.',
    },
    {
      title: 'Power User Ratio',
      value: `${kpis?.current.power_user_ratio.toFixed(1) || '0'}%`,
      previousValue: `${kpis?.previous.power_user_ratio.toFixed(1)}%`,
      delta: powerUserRatioDelta,
      deltaDirection: 'up-good' as const,
      isLoading: kpisLoading,
      tooltip: 'Percentage of users who were active on multiple days during the selected period (adaptive threshold based on period length). Higher ratios indicate the tool is becoming a daily habit.',
    },
  ];

  // DAU Trend Chart
  const dauTrendOptions: EChartsOption = useMemo(() => {
    const dates = daily.map((d) => formatDateShort(d.date_day));
    const dauValues = daily.map((d) => d.dau);
    const maValues = daily.map((d) => Number(d.dau_7d_ma).toFixed(0));

    return {
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['DAU', '7-day MA'],
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
        data: dates,
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          name: 'DAU',
          type: 'line',
          smooth: true,
          data: dauValues,
          itemStyle: { color: CHART_COLORS[0] },
          lineStyle: { width: 2 },
        },
        {
          name: '7-day MA',
          type: 'line',
          smooth: true,
          data: maValues,
          itemStyle: { color: CHART_COLORS[1] },
          lineStyle: { width: 2, type: 'dashed', opacity: 0.6 },
        },
      ],
    };
  }, [daily]);

  // Message Volatility - Grouped Bar Chart
  const volatilityOptions: EChartsOption = useMemo(() => {
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    // Group by day of week and sum messages/users
    const dayData = new Map<number, { messages: number; users: number }>();
    (heatmap || []).forEach((h) => {
      const existing = dayData.get(h.day_of_week) || { messages: 0, users: 0 };
      existing.messages += Number(h.message_count);
      existing.users = Number(h.distinct_users); // Same value for all hours per day, don't sum
      dayData.set(h.day_of_week, existing);
    });

    // Sort by day and prepare data
    const sortedDays = Array.from(dayData.entries()).sort((a, b) => a[0] - b[0]);
    const labels = sortedDays.map(([day]) => dayLabels[day - 1] || 'Unknown');
    const messagesData = sortedDays.map(([, data]) => data.messages);
    const usersData = sortedDays.map(([, data]) => data.users);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        formatter: (params: any) => {
          const day = params[0].axisValue;
          const messages = params[0].value;
          const users = params[1].value;
          return `${day}<br/>Messages: ${formatNumberWithCommas(messages)}<br/>Distinct Users: ${formatNumberWithCommas(users)}`;
        },
      },
      legend: {
        data: ['Messages', 'Distinct Users'],
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
        data: labels,
        axisLabel: {
          fontSize: 11,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Messages',
          position: 'left',
          axisLabel: {
            formatter: (value: number) => formatNumberWithCommas(value),
          },
        },
        {
          type: 'value',
          name: 'Users',
          position: 'right',
          axisLabel: {
            formatter: (value: number) => formatNumberWithCommas(value),
          },
        },
      ],
      series: [
        {
          name: 'Messages',
          type: 'bar',
          data: messagesData,
          itemStyle: { color: CHART_COLORS[0] },
        },
        {
          name: 'Distinct Users',
          type: 'bar',
          yAxisIndex: 1,
          data: usersData,
          itemStyle: { color: CHART_COLORS[2] },
        },
      ],
    };
  }, [heatmap]);

  // Messages Distribution Chart
  const messagesDistributionOptions: EChartsOption = useMemo(() => {
    const buckets = [
      { label: '1-5', min: 1, max: 5 },
      { label: '6-20', min: 6, max: 20 },
      { label: '21-50', min: 21, max: 50 },
      { label: '51-100', min: 51, max: 100 },
      { label: '100+', min: 101, max: Infinity },
    ];

    const bucketCounts = buckets.map((bucket) => {
      return users.filter(
        (u) => u.messages >= bucket.min && u.messages <= bucket.max
      ).length;
    });

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      grid: {
        left: '10%',
        right: '4%',
        bottom: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: buckets.map((b) => b.label),
      },
      yAxis: {
        type: 'value',
        name: 'User Count',
      },
      series: [
        {
          name: 'Users',
          type: 'bar',
          data: bucketCounts,
          itemStyle: { color: CHART_COLORS[2] },
          label: {
            show: true,
            position: 'top',
            formatter: '{c}',
            fontSize: 11,
            color: '#666',
          },
        },
      ],
    };
  }, [users]);

  // Users by Last Login - Bar Chart
  const usersByLastLoginOptions: EChartsOption = useMemo(() => {
    const now = Date.now();
    const activeUsers = users.filter((u) => !u.is_deleted);

    const buckets = [
      { label: 'Never', min: Infinity, max: Infinity, color: '#dc2626' },
      { label: '90+ days', min: 90, max: Infinity, color: '#ef4444' },
      { label: '60–90 days', min: 60, max: 89, color: '#f97316' },
      { label: '30–60 days', min: 30, max: 59, color: '#f59e0b' },
      { label: '14–30 days', min: 14, max: 29, color: '#84cc16' },
      { label: '7–14 days', min: 7, max: 13, color: '#22c55e' },
      { label: 'Last 7 days', min: 0, max: 6, color: '#16a34a' },
    ];

    const bucketCounts = buckets.map((bucket) => {
      if (bucket.label === 'Never') {
        return activeUsers.filter((u) => !u.last_active_at).length;
      }
      return activeUsers.filter((u) => {
        if (!u.last_active_at) return false;
        const days = Math.floor((now - new Date(u.last_active_at).getTime()) / (1000 * 60 * 60 * 24));
        return days >= bucket.min && days <= bucket.max;
      }).length;
    });

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: buckets.map((b) => b.label),
        axisLabel: { fontSize: 10, rotate: 25 },
      },
      yAxis: {
        type: 'value',
        name: 'Users',
      },
      series: [
        {
          name: 'Users',
          type: 'bar',
          data: bucketCounts.map((count, i) => ({
            value: count,
            itemStyle: { color: buckets[i].color },
          })),
          label: {
            show: true,
            position: 'top',
            formatter: '{c}',
            fontSize: 11,
            color: '#666',
          },
        },
      ],
    };
  }, [users]);

  // User Activity Status - Donut Chart
  const userActivityStatusOptions: EChartsOption = useMemo(() => {
    const now = Date.now();
    const activeUsers = users.filter((u) => !u.is_deleted);

    let active = 0;
    let atRisk = 0;
    let dormant = 0;

    activeUsers.forEach((u) => {
      if (!u.last_active_at) {
        dormant++;
        return;
      }
      const days = Math.floor((now - new Date(u.last_active_at).getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 30) active++;
      else if (days <= 90) atRisk++;
      else dormant++;
    });

    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        formatter: (name: string) => {
          const counts: Record<string, number> = { Active: active, 'At-Risk': atRisk, Dormant: dormant };
          const total = active + atRisk + dormant;
          const pct = total > 0 ? ((counts[name] / total) * 100).toFixed(1) : '0';
          return `${name}: ${counts[name]} (${pct}%)`;
        },
      },
      series: [
        {
          name: 'Status',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: (params: any) => {
              return params.value > 0 ? `${params.name}\n${params.value}` : '';
            },
            fontSize: 12,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold',
            },
          },
          data: [
            { value: active, name: 'Active', itemStyle: { color: '#16a34a' } },
            { value: atRisk, name: 'At-Risk', itemStyle: { color: '#f97316' } },
            { value: dormant, name: 'Dormant', itemStyle: { color: '#dc2626' } },
          ],
        },
      ],
    };
  }, [users]);

  // Filter users by last login group
  const filteredTableUsers = useMemo(() => {
    const now = Date.now();
    const active = users.filter((u) => !u.is_deleted);
    if (lastLoginFilter === 'all') return active;

    return active.filter((u) => {
      if (!u.last_active_at) return lastLoginFilter === 'never';
      const days = Math.floor((now - new Date(u.last_active_at).getTime()) / (1000 * 60 * 60 * 24));
      switch (lastLoginFilter) {
        case 'last7': return days <= 6;
        case '7-14': return days >= 7 && days <= 13;
        case '14-30': return days >= 14 && days <= 29;
        case '30-60': return days >= 30 && days <= 59;
        case '60-90': return days >= 60 && days <= 89;
        case '90+': return days >= 90;
        case 'never': return false;
        default: return true;
      }
    });
  }, [users, lastLoginFilter]);

  // Table columns
  const columns: DataTableColumn<UserSummary>[] = [
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      width: '25%',
    },
    {
      key: 'conversations',
      header: 'Conversations',
      sortable: true,
      width: '12%',
    },
    {
      key: 'messages',
      header: 'Messages',
      sortable: true,
      width: '10%',
    },
    {
      key: 'tokens',
      header: 'Tokens',
      sortable: true,
      render: (value) => formatTokens(value as number),
      width: '10%',
    },
    {
      key: 'cost',
      header: 'Cost',
      sortable: true,
      render: (value) => (
        <span className="font-bold">{formatCost(value as number)}</span>
      ),
      width: '10%',
    },
    {
      key: 'last_active_at',
      header: 'Last Active',
      sortable: true,
      render: (value) => (value ? formatRelativeTime(value as string) : 'Never'),
      width: '10%',
    },
    {
      key: 'account_created_at',
      header: 'Days Since Signup',
      sortable: true,
      render: (value) => {
        const days = Math.floor(
          (Date.now() - new Date(value as string).getTime()) / (1000 * 60 * 60 * 24)
        );
        return days.toString();
      },
      width: '10%',
    },
  ];

  return (
    <div className="p-8 space-y-6">
      <KpiRow kpis={kpiCards} />

      {/* DAU Trend - Full Width */}
      <ChartCard
        title="DAU Trend"
        subtitle="Daily Active Users with 7-day moving average"
        infoTooltip="Shows the number of unique users who interacted with the platform each day. The dashed line is a 7-day moving average to smooth out daily fluctuations and reveal the underlying trend."
        isLoading={dailyLoading}
      >
        <LineChart options={dauTrendOptions} height="320px" />
      </ChartCard>

      {/* Activity Heatmap & Messages Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Message Volatility"
          subtitle="Message volume and distinct users by day of week"
          infoTooltip="Compares total message volume (blue) against distinct user count (green) for each day of the week. Helps identify peak usage days and whether spikes are driven by more users or more messages per user."
          isLoading={heatmapLoading}
        >
          <BarChart options={volatilityOptions} height="320px" />
        </ChartCard>

        <ChartCard
          title="Messages Distribution"
          subtitle="User engagement segmentation"
          infoTooltip="Groups users by how many messages they sent. Shows the distribution of light users (1-5 messages) through power users (100+). A healthy platform has users spread across multiple buckets rather than concentrated in just one."
          isLoading={summaryLoading}
        >
          <BarChart options={messagesDistributionOptions} height="320px" />
        </ChartCard>
      </div>

      {/* User Engagement Overview */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">User Engagement Overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard
            title="Users by Last Login"
            subtitle="Recency of last user activity"
            infoTooltip="Groups users by how recently they last interacted with the platform. Green bars indicate recent activity, red bars indicate users who haven't logged in recently or at all. Helps identify how many users are at risk of churning."
            isLoading={summaryLoading}
          >
            <BarChart options={usersByLastLoginOptions} height="320px" />
          </ChartCard>

          <ChartCard
            title="User Activity Status"
            subtitle="Active vs. at-risk vs. dormant users"
            infoTooltip="Summarizes user engagement into three groups: Active (last 30 days), At-Risk (30–90 days since last login), and Dormant (90+ days or never logged in). A healthy platform should have most users in the Active segment."
            isLoading={summaryLoading}
          >
            <DonutChart options={userActivityStatusOptions} height="320px" />
          </ChartCard>
        </div>
      </div>

      {/* User Activity Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">User Activity</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary">Last Login:</label>
            <select
              value={lastLoginFilter}
              onChange={(e) => setLastLoginFilter(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="all">All Users</option>
              <option value="last7">Last 7 days</option>
              <option value="7-14">7–14 days</option>
              <option value="14-30">14–30 days</option>
              <option value="30-60">30–60 days</option>
              <option value="60-90">60–90 days</option>
              <option value="90+">90+ days</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>
        <DataTable
          columns={columns}
          data={filteredTableUsers}
          searchable
          searchKeys={['email']}
          exportFilename={`user-activity-${from}-${to}.csv`}
          isLoading={summaryLoading}
          onRowClick={(row) => setSelectedUserId(row.user_id)}
        />
      </div>

      {/* User Detail SlideOver */}
      <SlideOver
        isOpen={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        title={userDetail?.email || 'User Details'}
        subtitle={`${userDetail?.org || 'No organization'} · Joined ${
          userDetail?.account_created_at
            ? formatRelativeTime(userDetail.account_created_at)
            : 'unknown'
        }`}
        width="520px"
      >
        {userDetail && (
          <div className="space-y-6">
            {/* User KPIs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Conversations</p>
                <p className="text-xl font-bold">{userDetail.total_conversations}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Messages</p>
                <p className="text-xl font-bold">{userDetail.total_messages}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Total Cost</p>
                <p className="text-xl font-bold">{formatCost(userDetail.total_est_cost_usd)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-1">Agents Used</p>
                <p className="text-xl font-bold">{userDetail.unique_agents_used}</p>
              </div>
            </div>

            {/* Daily Activity */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Daily Activity</h3>
              <BarChart
                options={{
                  tooltip: { trigger: 'axis' },
                  xAxis: {
                    type: 'category',
                    data: userDetail.daily_activity.map((d) => formatDateShort(d.date_day)),
                  },
                  yAxis: { type: 'value', name: 'Messages' },
                  series: [
                    {
                      name: 'Messages',
                      type: 'bar',
                      data: userDetail.daily_activity.map((d) => d.messages_sent),
                      itemStyle: { color: CHART_COLORS[0] },
                    },
                  ],
                  grid: {
                    left: '10%',
                    right: '5%',
                    bottom: '10%',
                    containLabel: true,
                  },
                }}
                height="180px"
              />
            </div>

            {/* Cost by Model */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Cost by Model</h3>
              <DonutChart
                options={{
                  tooltip: {
                    trigger: 'item',
                    formatter: '{b}: {c} ({d}%)',
                  },
                  legend: {
                    orient: 'vertical',
                    left: 'left',
                  },
                  series: [
                    {
                      name: 'Cost',
                      type: 'pie',
                      radius: ['40%', '70%'],
                      avoidLabelOverlap: false,
                      itemStyle: {
                        borderRadius: 10,
                        borderColor: '#fff',
                        borderWidth: 2,
                      },
                      label: {
                        show: false,
                      },
                      emphasis: {
                        label: {
                          show: true,
                          fontSize: 14,
                          fontWeight: 'bold',
                        },
                      },
                      data: userDetail.cost_by_model.map((m, idx) => ({
                        name: m.model_name,
                        value: m.est_cost_usd,
                        itemStyle: { color: CHART_COLORS[idx % CHART_COLORS.length] },
                      })),
                    },
                  ],
                }}
                height="200px"
              />
            </div>

            {/* Recent Conversations */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Last 10 Conversations</h3>
              <div className="bg-slate-50 rounded-lg divide-y divide-slate-200">
                {userDetail.recent_conversations.map((conv) => (
                  <div key={conv.conversation_id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{conv.agent_name || 'Unknown Agent'}</p>
                        <p className="text-xs text-text-secondary">
                          {conv.message_count} messages · {formatRelativeTime(conv.last_message_at)}
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
