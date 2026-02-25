'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useFiltersStore } from '@/store/filters';
import { formatDateShort, formatCost } from '@/lib/formatters';
import { CHART_COLORS } from '@/lib/constants';
import type {
  ApiResponse,
  DocumentKPIs,
  DocumentFunnel,
  DocumentByTypeDaily,
  DailyDocument,
  DocumentByTechnique,
  DocumentListResponse,
  DocumentListItem,
  TopUploader,
  ContentTypeBreakdown,
  FailureCorrelation,
} from '@/lib/api';
import KpiRow from '@/components/dashboard/KpiRow';
import ChartCard from '@/components/dashboard/ChartCard';
import ProcessingStepBar from '@/components/dashboard/ProcessingStepBar';
import StackedBarChart from '@/components/charts/StackedBarChart';
import BarChart from '@/components/charts/BarChart';
import DonutChart from '@/components/charts/DonutChart';
import DataTable, { DataTableColumn } from '@/components/dashboard/DataTable';
import StatusBadge from '@/components/dashboard/StatusBadge';
import type { EChartsOption } from 'echarts';

type DocMeasure = 'count' | 'size' | 'embeddings' | 'cost';

export default function DocumentsPage() {
  const { from, to } = useFiltersStore();
  const [activeTab, setActiveTab] = useState<'all' | 'PROCESSED' | 'FAILED' | 'PENDING'>('all');
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [docMeasure, setDocMeasure] = useState<DocMeasure>('count');

  const queryParams = new URLSearchParams({ from, to }).toString();
  const listParams = new URLSearchParams({
    page: page.toString(),
    pageSize: '50',
    ...(activeTab !== 'all' && { status: activeTab }),
  }).toString();

  // Fetch data
  const { data: kpisData, isLoading: kpisLoading } = useSWR<ApiResponse<DocumentKPIs>>(
    `/documents/kpis?${queryParams}`,
    fetcher
  );

  const { data: byTypeDailyData, isLoading: byTypeDailyLoading } = useSWR<ApiResponse<DocumentByTypeDaily[]>>(
    `/documents/by-type-daily?${queryParams}`,
    fetcher
  );

  const { data: dailyData, isLoading: dailyLoading } = useSWR<ApiResponse<DailyDocument[]>>(
    `/documents/daily?${queryParams}`,
    fetcher
  );

  const { data: techniqueData, isLoading: techniqueLoading } = useSWR<ApiResponse<DocumentByTechnique[]>>(
    `/documents/by-technique?${queryParams}`,
    fetcher
  );

  const { data: listData, isLoading: listLoading } = useSWR<DocumentListResponse>(
    `/documents/list?${listParams}`,
    fetcher
  );

  const { data: funnelData, isLoading: funnelLoading } = useSWR<ApiResponse<DocumentFunnel[]>>(
    '/documents/funnel',
    fetcher
  );

  const { data: topUploadersData, isLoading: topUploadersLoading } = useSWR<ApiResponse<TopUploader[]>>(
    `/documents/top-uploaders?${queryParams}`,
    fetcher
  );

  const { data: contentTypeData, isLoading: contentTypeLoading } = useSWR<ApiResponse<ContentTypeBreakdown[]>>(
    `/documents/content-type-breakdown?${queryParams}`,
    fetcher
  );

  const { data: correlationsData, isLoading: correlationsLoading } = useSWR<ApiResponse<FailureCorrelation[]>>(
    `/documents/failure-correlations?${queryParams}`,
    fetcher
  );

  const kpis = kpisData?.data;
  const byTypeDaily = byTypeDailyData?.data || [];
  const daily = dailyData?.data || [];
  const techniques = techniqueData?.data || [];
  const documents = listData?.data || [];
  const pagination = listData?.pagination;
  const funnel = funnelData?.data || [];
  const topUploaders = topUploadersData?.data || [];
  const contentTypes = contentTypeData?.data || [];
  const correlations = correlationsData?.data || [];

  // KPI cards
  const kpiCards = [
    {
      title: 'Total Documents',
      value: kpis?.total_documents.toString() || '0',
      isLoading: kpisLoading,
    },
    {
      title: 'Success Rate',
      value: kpis ? `${Number(kpis.success_rate).toFixed(1)}%` : '0%',
      isLoading: kpisLoading,
    },
    {
      title: 'Avg Chunks/Doc',
      value: kpis ? Number(kpis.avg_chunks_per_doc).toFixed(1) : '0',
      isLoading: kpisLoading,
    },
    {
      title: 'Currently Failing',
      value: kpis?.currently_failing.toString() || '0',
      subtitle: kpis && kpis.currently_failing > 0 ? 'Requires attention' : undefined,
      isLoading: kpisLoading,
    },
  ];

  // Measure config for Documents by Time chart
  const docMeasureConfig: Record<DocMeasure, { label: string; key: keyof DocumentByTypeDaily; formatter: (v: number) => string }> = {
    count: { label: 'Document Count', key: 'doc_count', formatter: (v) => v.toLocaleString() },
    size: { label: 'Size (bytes)', key: 'total_size_bytes', formatter: (v) => {
      if (v >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
      if (v >= 1024) return `${(v / 1024).toFixed(1)} KB`;
      return `${v} B`;
    }},
    embeddings: { label: 'Embeddings', key: 'total_embeddings', formatter: (v) => v.toLocaleString() },
    cost: { label: 'Cost', key: 'est_cost_usd', formatter: formatCost },
  };

  // Documents by Time Chart (stacked bar by document type)
  const docsByTimeOptions: EChartsOption = useMemo(() => {
    if (byTypeDaily.length === 0) return { title: { text: 'No document data for this period', left: 'center', top: 'center', textStyle: { color: '#9CA3AF', fontSize: 14 } } };

    const cfg = docMeasureConfig[docMeasure];
    const dates = Array.from(new Set(byTypeDaily.map((d) => d.date))).sort();
    const types = Array.from(new Set(byTypeDaily.map((d) => d.content_type_group))).sort();

    const series = types.map((type, idx) => ({
      name: type,
      type: 'bar' as const,
      stack: 'total',
      data: dates.map((date) => {
        const entry = byTypeDaily.find((d) => d.date === date && d.content_type_group === type);
        return entry ? Number(entry[cfg.key]) || 0 : 0;
      }),
      itemStyle: { color: CHART_COLORS[idx % CHART_COLORS.length] },
    }));

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: any) => cfg.formatter(Number(value)),
      },
      legend: {
        data: types,
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
        data: dates.map(formatDateShort),
      },
      yAxis: {
        type: 'value',
        axisLabel: docMeasure === 'cost'
          ? { formatter: (v: number) => formatCost(v) }
          : docMeasure === 'size'
          ? { formatter: (v: number) => {
              if (v >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(0)} MB`;
              if (v >= 1024) return `${(v / 1024).toFixed(0)} KB`;
              return `${v} B`;
            }}
          : {},
      },
      series,
    };
  }, [byTypeDaily, docMeasure]);

  // Daily Stacked Bar Chart
  const dailyStackedOptions: EChartsOption = useMemo(() => {
    const dates = Array.from(new Set(daily.map((d) => d.date))).sort();

    const processedData = dates.map((date) => {
      const entry = daily.find((d) => d.date === date && d.status === 'PROCESSED');
      return entry ? entry.count : 0;
    });

    const failedData = dates.map((date) => {
      const entry = daily.find((d) => d.date === date && d.status === 'FAILED');
      return entry ? entry.count : 0;
    });

    const pendingData = dates.map((date) => {
      const pending = daily.find((d) => d.date === date && d.status === 'PENDING_UPLOAD');
      const processing = daily.find((d) => d.date === date && d.status === 'PROCESSING');
      return (pending?.count || 0) + (processing?.count || 0);
    });

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        data: ['Processed', 'Failed', 'Pending/Processing'],
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
        data: dates.map(formatDateShort),
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          name: 'Processed',
          type: 'bar',
          stack: 'total',
          data: processedData,
          itemStyle: { color: '#16A34A' },
        },
        {
          name: 'Failed',
          type: 'bar',
          stack: 'total',
          data: failedData,
          itemStyle: { color: '#DC2626' },
        },
        {
          name: 'Pending/Processing',
          type: 'bar',
          stack: 'total',
          data: pendingData,
          itemStyle: { color: '#9CA3AF' },
        },
      ],
    };
  }, [daily]);

  // Success by Technique Chart
  const successByTechniqueOptions: EChartsOption = useMemo(() => {
    const names = techniques.map((t) => t.parsing_technique);
    const rates = techniques.map((t) => Number(t.success_rate));

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
          name: 'Success Rate',
          type: 'bar',
          data: rates.map((val) => ({
            value: val,
            itemStyle: {
              color: val >= 90 ? '#16A34A' : val >= 70 ? '#D97706' : '#DC2626',
            },
          })),
        },
      ],
    };
  }, [techniques]);

  // Chunk Distribution Chart (simplified)
  const chunkDistributionOptions: EChartsOption = useMemo(() => {
    const names = techniques.map((t) => t.parsing_technique);
    const avgChunks = techniques.map((t) => Number(t.avg_words_per_chunk) || 0);
    const hasData = avgChunks.some(val => val > 0);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
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
        name: 'Avg Words/Chunk',
      },
      series: [
        {
          name: 'Words/Chunk',
          type: 'bar',
          data: avgChunks,
          itemStyle: { color: CHART_COLORS[3] },
        },
      ],
      graphic: !hasData ? [
        {
          type: 'text',
          left: 'center',
          top: 'center',
          style: {
            text: 'No chunk data available',
            fontSize: 14,
            fill: '#9CA3AF',
          },
        },
      ] : undefined,
    };
  }, [techniques]);

  const hasChunkData = useMemo(() => {
    return techniques.some(t => Number(t.avg_words_per_chunk) > 0);
  }, [techniques]);

  // Content Type Breakdown Donut
  const contentTypeBreakdownOptions: EChartsOption = useMemo(() => {
    if (contentTypes.length === 0) return { title: { text: 'No data', left: 'center', top: 'center', textStyle: { color: '#9CA3AF', fontSize: 14 } } };

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const d = contentTypes.find((c) => c.content_type_group === params.name);
          return `${params.name}<br/>Count: ${params.value}<br/>Success Rate: ${d ? Number(d.success_rate).toFixed(1) : 0}%`;
        },
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'middle',
      },
      series: [
        {
          name: 'Content Type',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: '{b}\n{d}%',
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold',
            },
          },
          data: contentTypes.map((c, idx) => ({
            name: c.content_type_group,
            value: c.doc_count,
            itemStyle: { color: CHART_COLORS[idx % CHART_COLORS.length] },
          })),
        },
      ],
    };
  }, [contentTypes]);

  // Document Size by Type Donut
  const sizeByTypeOptions: EChartsOption = useMemo(() => {
    if (contentTypes.length === 0) return { title: { text: 'No data', left: 'center', top: 'center', textStyle: { color: '#9CA3AF', fontSize: 14 } } };

    const formatSize = (bytes: number) => {
      if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${bytes} B`;
    };

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const d = contentTypes.find((c) => c.content_type_group === params.name);
          return `${params.name}<br/>Size: ${formatSize(Number(params.value))}<br/>Docs: ${d?.doc_count || 0}`;
        },
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'middle',
      },
      series: [
        {
          name: 'Size by Type',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: (params: any) => `${params.name}\n${formatSize(Number(params.value))}`,
          },
          data: contentTypes.map((c, idx) => ({
            name: c.content_type_group,
            value: Number(c.total_size_bytes),
            itemStyle: { color: CHART_COLORS[idx % CHART_COLORS.length] },
          })),
        },
      ],
    };
  }, [contentTypes]);

  // Top Uploaders Horizontal Bar
  const topUploadersOptions: EChartsOption = useMemo(() => {
    if (topUploaders.length === 0) return { title: { text: 'No uploader data', left: 'center', top: 'center', textStyle: { color: '#9CA3AF', fontSize: 14 } } };

    const emails = topUploaders.map((u) => u.email.split('@')[0]); // short label
    const counts = topUploaders.map((u) => u.total_documents);
    const rates = topUploaders.map((u) => Number(u.success_rate));

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          const u = topUploaders[idx];
          return `${u.email}<br/>Documents: ${u.total_documents}<br/>Success Rate: ${Number(u.success_rate).toFixed(1)}%<br/>Failed: ${u.failed}`;
        },
      },
      grid: {
        left: '25%',
        right: '12%',
        top: '3%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: [
        {
          type: 'value',
          name: 'Documents',
          position: 'bottom',
        },
      ],
      yAxis: {
        type: 'category',
        data: emails,
        axisLabel: { fontSize: 11 },
        inverse: true,
      },
      series: [
        {
          name: 'Documents',
          type: 'bar',
          data: counts.map((val, i) => ({
            value: val,
            itemStyle: {
              color: rates[i] >= 90 ? '#16A34A' : rates[i] >= 70 ? '#D97706' : '#DC2626',
            },
          })),
          label: {
            show: true,
            position: 'right',
            formatter: (params: any) => `${rates[params.dataIndex].toFixed(0)}%`,
            fontSize: 10,
            color: '#6B7280',
          },
        },
      ],
    };
  }, [topUploaders]);

  // Failure Correlations Grouped Bar
  const failureCorrelationsOptions: EChartsOption = useMemo(() => {
    if (correlations.length === 0) return { title: { text: 'No failure data', left: 'center', top: 'center', textStyle: { color: '#9CA3AF', fontSize: 14 } } };

    const dimensionLabels: Record<string, string> = {
      content_type: 'Content Type',
      file_size: 'File Size',
      parsing_technique: 'Technique',
    };

    const buckets = correlations.map((c) => `${dimensionLabels[c.dimension] || c.dimension}: ${c.bucket}`);
    const rates = correlations.map((c) => Number(c.failure_rate));
    const totals = correlations.map((c) => c.total);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          const c = correlations[idx];
          return `${buckets[idx]}<br/>Failure Rate: ${Number(c.failure_rate).toFixed(1)}%<br/>Failed: ${c.failed} / ${c.total}`;
        },
      },
      grid: {
        left: '30%',
        right: '8%',
        top: '3%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        max: (value: { max: number }) => Math.max(value.max * 1.1, 10),
        axisLabel: { formatter: '{value}%' },
      },
      yAxis: {
        type: 'category',
        data: buckets,
        axisLabel: { fontSize: 10 },
        inverse: true,
      },
      series: [
        {
          name: 'Failure Rate',
          type: 'bar',
          data: rates.map((val) => ({
            value: val,
            itemStyle: {
              color: val >= 20 ? '#DC2626' : val >= 10 ? '#D97706' : '#16A34A',
            },
          })),
          label: {
            show: true,
            position: 'right',
            formatter: (params: any) => `${totals[params.dataIndex]} docs`,
            fontSize: 9,
            color: '#6B7280',
          },
        },
      ],
    };
  }, [correlations]);

  // Embedding Coverage Donut
  const embeddingCoverageOptions: EChartsOption = useMemo(() => {
    const withEmbeddings = documents.filter((d) => d.has_embeddings).length;
    const withoutEmbeddings = documents.filter((d) => !d.has_embeddings).length;
    const total = withEmbeddings + withoutEmbeddings;
    const coverage = total > 0 ? (withEmbeddings / total) * 100 : 0;

    return {
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
          name: 'Embeddings',
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
            formatter: '{b}: {d}%',
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 16,
              fontWeight: 'bold',
            },
          },
          data: [
            {
              name: 'With Embeddings',
              value: withEmbeddings,
              itemStyle: { color: CHART_COLORS[0] },
            },
            {
              name: 'Without Embeddings',
              value: withoutEmbeddings,
              itemStyle: { color: '#9CA3AF' },
            },
          ],
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: 'center',
          style: {
            text: `${coverage.toFixed(0)}%`,
            fontSize: 24,
            fontWeight: 'bold',
            fill: coverage < 100 ? '#D97706' : '#16A34A',
          },
        },
      ],
    };
  }, [documents]);

  // Table columns
  const columns: DataTableColumn<DocumentListItem>[] = [
    {
      key: 'file_name',
      header: 'File Name',
      sortable: true,
      width: '20%',
      render: (value) => (
        <span className="truncate max-w-xs block" title={String(value)}>
          {String(value)}
        </span>
      ),
    },
    {
      key: 'content_type_group',
      header: 'Type',
      sortable: true,
      render: (value) => String(value || '-'),
      width: '10%',
    },
    {
      key: 'parsing_technique',
      header: 'Technique',
      sortable: true,
      render: (value) => String(value || '-'),
      width: '10%',
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (value) => {
        const status = String(value);
        return (
          <StatusBadge
            status={
              status === 'PROCESSED' ? 'success' :
              status === 'FAILED' ? 'error' :
              status === 'PROCESSING' ? 'warning' : 'pending'
            }
            label={status}
          />
        );
      },
      width: '10%',
    },
    {
      key: 'file_size_bytes',
      header: 'Size',
      sortable: true,
      render: (value) => {
        const bytes = value as number;
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      },
      width: '8%',
    },
    {
      key: 'total_chunks',
      header: 'Chunks',
      sortable: true,
      render: (value) => (value !== null ? String(value) : '-'),
      width: '8%',
    },
    {
      key: 'total_words',
      header: 'Words',
      sortable: true,
      render: (value) => (value !== null ? Number(value).toLocaleString() : '-'),
      width: '8%',
    },
    {
      key: 'has_embeddings',
      header: 'Embeddings',
      render: (value) => (value ? '✅' : '❌'),
      width: '8%',
    },
    {
      key: 'owner_email',
      header: 'Owner',
      sortable: true,
      render: (value) => String(value || '-'),
      width: '12%',
    },
    {
      key: 'document_created_at',
      header: 'Uploaded',
      sortable: true,
      render: (value) => formatDateShort(value as string),
      width: '10%',
    },
  ];

  return (
    <div className="p-8 space-y-6">
      <KpiRow kpis={kpiCards} />

      {/* Processing Step Bar — full width */}
      <ProcessingStepBar data={funnel} isLoading={funnelLoading} />

      {/* Documents by Time - Full Width */}
      <ChartCard
        title="Documents by Time"
        subtitle="Grouped by document type"
        isLoading={byTypeDailyLoading}
      >
        <div className="flex gap-1 mb-3">
          {(Object.keys(docMeasureConfig) as DocMeasure[]).map((m) => (
            <button
              key={m}
              onClick={() => setDocMeasure(m)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                docMeasure === m
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
              }`}
            >
              {docMeasureConfig[m].label}
            </button>
          ))}
        </div>
        <BarChart options={docsByTimeOptions} height="280px" />
      </ChartCard>

      {/* Content Type Breakdown & Document Size by Type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Content Type Breakdown"
          subtitle="Document count by type with success rate"
          infoTooltip="Shows the distribution of document types (PDF, Image, etc.) and their respective success rates"
          isLoading={contentTypeLoading}
        >
          <DonutChart options={contentTypeBreakdownOptions} height="280px" />
        </ChartCard>

        <ChartCard
          title="Document Size by Type"
          subtitle="Total storage consumed per content type"
          isLoading={contentTypeLoading}
        >
          <DonutChart options={sizeByTypeOptions} height="280px" />
        </ChartCard>
      </div>

      {/* Top Uploaders & Failure Correlations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Top Uploaders"
          subtitle="Most active uploaders — bar color = success rate"
          infoTooltip="Green ≥90%, Amber 70-89%, Red <70% success rate. Label shows exact success %."
          isLoading={topUploadersLoading}
        >
          <BarChart options={topUploadersOptions} height="320px" />
        </ChartCard>

        <ChartCard
          title="Failure Correlations"
          subtitle="Failure rate by content type, file size & technique"
          infoTooltip="Identifies which dimensions correlate with higher failure rates. Red ≥20%, Amber 10-19%, Green <10%."
          isLoading={correlationsLoading}
        >
          <BarChart options={failureCorrelationsOptions} height="320px" />
        </ChartCard>
      </div>

      {/* Daily Volume & Success by Technique */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Daily Processing Volume"
          subtitle="Status breakdown over time"
          isLoading={dailyLoading}
        >
          <StackedBarChart options={dailyStackedOptions} height="280px" />
        </ChartCard>

        <ChartCard
          title="Success Rate by Technique"
          subtitle="Green: ≥90%, Amber: 70-89%, Red: <70%"
          isLoading={techniqueLoading}
        >
          <BarChart options={successByTechniqueOptions} height="280px" />
        </ChartCard>
      </div>

      {/* Chunk Distribution & Embedding Coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Chunk Size Distribution"
          subtitle={hasChunkData ? "Average words per chunk by technique" : "No chunking data available yet"}
          isLoading={techniqueLoading}
        >
          <BarChart options={chunkDistributionOptions} height="280px" />
        </ChartCard>

        <ChartCard
          title="Embedding Coverage"
          subtitle={`${documents.length} documents in view`}
          isLoading={listLoading}
        >
          <DonutChart options={embeddingCoverageOptions} height="280px" />
        </ChartCard>
      </div>

      {/* Document List with Filters */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 border-b">
          {[
            { label: 'All', value: 'all' as const },
            { label: 'Processed', value: 'PROCESSED' as const },
            { label: 'Failed', value: 'FAILED' as const },
            { label: 'Pending', value: 'PENDING' as const },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setActiveTab(tab.value);
                setPage(1);
              }}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === tab.value
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <DataTable
          columns={columns}
          data={documents}
          searchable
          searchKeys={['file_name', 'owner_email']}
          exportFilename={`documents-${activeTab}-${from}-${to}.csv`}
          isLoading={listLoading}
          onRowClick={(row) => {
            if (row.status === 'FAILED') {
              setExpandedRow(expandedRow === row.document_id ? null : row.document_id);
            }
          }}
        />

        {/* Pagination */}
        {pagination && pagination.total > pagination.pageSize && (
          <div className="flex justify-between items-center mt-4 pt-4 border-t">
            <p className="text-sm text-text-secondary">
              Showing {((page - 1) * pagination.pageSize) + 1} to{' '}
              {Math.min(page * pagination.pageSize, pagination.total)} of {pagination.total} documents
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-4 py-2 bg-slate-100 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page * pagination.pageSize >= pagination.total}
                className="px-4 py-2 bg-slate-100 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Expanded Failed Row */}
        {expandedRow && (
          <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm font-semibold text-red-900 mb-2">Error Details</p>
            <p className="text-sm text-red-700 mb-3">
              Processing failed for this document. Review the parsing technique or file format.
            </p>
            <button
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() => alert('Retry functionality not implemented in POC')}
            >
              Retry Processing
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
