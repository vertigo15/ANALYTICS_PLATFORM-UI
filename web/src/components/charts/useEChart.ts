import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

export function useEChart(
  containerRef: React.RefObject<HTMLDivElement>,
  options: EChartsOption,
  dependencies: unknown[] = []
): echarts.ECharts | null {
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize chart
    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current);
    }

    // Set options
    chartRef.current.setOption(options, true);

    // Setup resize observer
    const resizeObserver = new ResizeObserver(() => {
      chartRef.current?.resize();
    });

    resizeObserver.observe(containerRef.current);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, options, ...dependencies]);

  // Dispose on unmount
  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  return chartRef.current;
}
