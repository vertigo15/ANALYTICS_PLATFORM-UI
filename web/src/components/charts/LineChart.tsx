'use client';

import { useRef } from 'react';
import type { EChartsOption } from 'echarts';
import { useEChart } from './useEChart';

interface LineChartProps {
  options: EChartsOption;
  height?: string;
  isLoading?: boolean;
}

export default function LineChart({ options, height = '300px', isLoading = false }: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEChart(containerRef, options);

  if (isLoading) {
    return (
      <div className="animate-pulse" style={{ height }}>
        <div className="h-full bg-slate-200 rounded"></div>
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
