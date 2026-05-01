import { useEffect, useRef } from 'react';

// Tree-shaken ECharts — import only what is used across the project
import * as echarts from 'echarts/core';
import {
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  FunnelChart,
  BoxplotChart,
  TreemapChart,
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  VisualMapComponent,
  MarkLineComponent,
  MarkAreaComponent,
  ToolboxComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

// Register all needed components once at module load time
echarts.use([
  LineChart, BarChart, PieChart, ScatterChart,
  HeatmapChart, FunnelChart, BoxplotChart, TreemapChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  DataZoomComponent, VisualMapComponent, MarkLineComponent, MarkAreaComponent,
  ToolboxComponent, CanvasRenderer,
]);

export function useEChart(
  containerRef: React.RefObject<HTMLDivElement>,
  options: EChartsOption,
  dependencies: unknown[] = []
): echarts.ECharts | null {
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current);
    }

    chartRef.current.setOption(options, true);

    const resizeObserver = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => { resizeObserver.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, options, ...dependencies]);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  return chartRef.current;
}
