/**
 * Performance Charts Type Definitions
 * Unified interfaces for all chart components
 */

export interface PerformanceMetrics {
  timestamp: number;
  cpu: number;
  memory: number;
  network?: number;
  disk?: number;
  responseTime?: number;
  throughput?: number;
  errorRate?: number;
  activeAgents?: number;
  taskQueue?: number;
}

export interface AgentPerformanceData {
  agentId: string;
  agentName: string;
  agentType: string;
  metrics: {
    successRate: number;
    avgResponseTime: number;
    tasksCompleted: number;
    tasksFailed: number;
    confidence: number;
  };
  timeline?: Array<{
    timestamp: number;
    status: 'active' | 'idle' | 'busy' | 'error';
    confidence: number;
  }>;
}

export interface ChartTheme {
  background: string;
  text: string;
  grid: string;
  border: string;
  primary: string;
  secondary: string;
  tertiary: string;
  quaternary: string;
  quinary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';
export type ChartType = 'line' | 'bar' | 'area' | 'composed';
export type ThemeMode = 'light' | 'dark';

export interface BaseChartProps {
  width?: number | string;
  height?: number | string;
  theme?: ThemeMode;
  showGrid?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  animationDuration?: number;
  className?: string;
}

export interface LineChartProps extends BaseChartProps {
  data: PerformanceMetrics[];
  dataKey: keyof PerformanceMetrics | (keyof PerformanceMetrics)[];
  xAxisKey?: keyof PerformanceMetrics;
  strokeWidth?: number;
  dot?: boolean;
  smooth?: boolean;
  area?: boolean;
}

export interface BarChartProps extends BaseChartProps {
  data: AgentPerformanceData[];
  dataKeys: string[];
  stackBars?: boolean;
  barSize?: number;
  radius?: [number, number, number, number];
}

export interface GaugeChartProps extends BaseChartProps {
  value: number;
  maxValue?: number;
  minValue?: number;
  label?: string;
  unit?: string;
  thresholds?: {
    low: number;
    medium: number;
    high: number;
  };
  colors?: {
    low: string;
    medium: string;
    high: string;
  };
}

export interface RealtimeChartProps extends BaseChartProps {
  data: PerformanceMetrics[];
  updateInterval?: number;
  maxDataPoints?: number;
  autoScroll?: boolean;
  dataKeys: (keyof PerformanceMetrics)[];
  onDataUpdate?: (newData: PerformanceMetrics) => void;
}

export interface PerformanceChartsProps {
  systemMetrics?: PerformanceMetrics[];
  agentData?: AgentPerformanceData[];
  theme?: ThemeMode;
  timeRange?: TimeRange;
  chartType?: ChartType;
  realTimeUpdates?: boolean;
  updateInterval?: number;
  width?: number | string;
  height?: number | string;
  showControls?: boolean;
  onTimeRangeChange?: (range: TimeRange) => void;
  onChartTypeChange?: (type: ChartType) => void;
  onExport?: (data: any) => void;
  className?: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  timestamp?: number;
  [key: string]: any;
}

export interface TooltipPayload {
  name: string;
  value: number;
  unit?: string;
  color: string;
  dataKey: string;
  payload?: any;
}

export interface ChartLegendProps {
  payload?: Array<{
    value: string;
    type: string;
    id: string;
    color: string;
  }>;
  theme?: ThemeMode;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  theme?: ThemeMode;
  formatter?: (value: number, name: string) => [string, string];
}
