'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useFiltersStore } from '@/store/filters';
import { formatDateShort } from '@/lib/formatters';
import { CHART_COLORS } from '@/lib/constants';
import type {
  ApiResponse,
  DocumentKPIs,
  DocumentFunnel,
  DailyDocument,
  DocumentByTechnique,
  DocumentListResponse,
  DocumentListItem,
} from '@/lib/api';
import KpiRow from '@/components/dashboard/KpiRow';
import ChartCard from '@/components/dashboard/ChartCard';
import FunnelChart from '@/components/charts/FunnelChart';
import StackedBarChart from '@/components/charts/StackedBarChart';
import BarChart from '@/components/charts/BarChart';
import DonutChart from '@/components/charts/DonutChart';
import DataTable, { DataTableColumn } from '@/components/dashboard/DataTable';
import StatusBadge from '@/components/dashboard/StatusBadge';
import type { EChartsOption } from 'echarts';

export default function DocumentsPage() {
  const { from, to } = useFiltersStore();
  const [activeTab, setActiveTab] = useState<'all' | 'PROCESSED' | 'FAILED' | 'PENDING'>('all');
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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

  const { data: funnelData, isLoading: funnelLoading } = useSWR<ApiResponse<DocumentFunnel[]>>(
    '/documents/funnel',
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

  const kpis = kpisData?.data;
  const funnel = funnelData?.data || [];
  const daily = dailyData?.data || [];
  const techniques = techniqueData?.data || [];
  const documents = listData?.data || [];
  const pagination = listData?.pagination;

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

  // Funnel Chart
  const funnelOptions: EChartsOption = useMemo(() => {
    const funnelOrder = ['UPLOADED', 'PROCESSING', 'PROCESSED'];
    const funnelStages = funnel
      .filter((f) => funnelOrder.includes(f.status))
      .sort((a, b) => funnelOrder.indexOf(a.status) - funnelOrder.indexOf(b.status));

    const failedCount = funnel.find((f) => f.status === 'FAILED')?.count || 0;

    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c}',
      },
      series: [
        {
          name: 'Funnel',
          type: 'funnel',
          left: '10%',
          width: '80%',
          label: {
            show: true,
            position: 'inside',
            formatter: '{b}: {c}',
          },
          data: funnelStages.map((f) => ({
            value: f.count,
            name: f.status,
          })),
        },
        {
          name: 'Failed',
          type: 'funnel',
          left: '85%',
          width: '10%',
          label: {
            show: true,
            position: 'left',
            formatter: 'Failed: {c}',
          },
          data: [
            {
              value: failedCount,
              name: 'FAILED',
              itemStyle: { color: '#DC2626' },
            },
          ],
        },
      ],
    };
  }, [funnel]);

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

      {/* Funnel Chart - Full Width */}
      <ChartCard
        title="Processing Funnel"
        subtitle="Document processing pipeline"
        isLoading={funnelLoading}
      >
        <FunnelChart options={funnelOptions} height="200px" />
      </ChartCard>

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
