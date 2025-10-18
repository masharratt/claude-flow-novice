/**
 * Performance Metrics Chart Component
 * Real-time charts and visualizations for agent performance data
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, Clock, Zap, BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import { TransparencyMetrics, ComponentProps, ChartData } from '../types';

// Simple chart implementation since we can't import external chart libraries
interface SimpleChartProps {
  data: number[];
  labels: string[];
  color?: string;
  height?: number;
  showGrid?: boolean;
  type?: 'line' | 'bar';
}

const SimpleChart: React.FC<SimpleChartProps> = ({
  data,
  labels,
  color = '#3B82F6',
  height = 200,
  showGrid = true,
  type = 'line'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (data.length === 0) return;

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = rect.width - padding.left - padding.right;
    const chartHeight = rect.height - padding.top - padding.bottom;

    // Find min and max values
    const maxValue = Math.max(...data);
    const minValue = Math.min(...data);
    const valueRange = maxValue - minValue || 1;

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);

      // Horizontal grid lines
      for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();

        // Y-axis labels
        const value = maxValue - (valueRange / 5) * i;
        ctx.fillStyle = '#6B7280';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(value.toFixed(1), padding.left - 5, y + 3);
      }

      ctx.setLineDash([]);
    }

    // Draw data
    const xStep = chartWidth / (data.length - 1 || 1);

    if (type === 'line') {
      // Draw line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      data.forEach((value, index) => {
        const x = padding.left + index * xStep;
        const y = padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw points
      ctx.fillStyle = color;
      data.forEach((value, index) => {
        const x = padding.left + index * xStep;
        const y = padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    } else {
      // Draw bars
      const barWidth = chartWidth / data.length * 0.6;
      ctx.fillStyle = color;

      data.forEach((value, index) => {
        const x = padding.left + index * xStep - barWidth / 2;
        const barHeight = ((value - minValue) / valueRange) * chartHeight;
        const y = padding.top + chartHeight - barHeight;

        ctx.fillRect(x, y, barWidth, barHeight);
      });
    }

    // Draw x-axis labels
    ctx.fillStyle = '#6B7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';

    const labelStep = Math.ceil(labels.length / 10); // Show max 10 labels
    labels.forEach((label, index) => {
      if (index % labelStep === 0 || index === labels.length - 1) {
        const x = padding.left + index * xStep;
        ctx.save();
        ctx.translate(x, padding.top + chartHeight + 15);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'right';
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    });
  }, [data, labels, color, height, showGrid, type]);

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
    </div>
  );
};

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  change?: number;
  icon?: React.ReactNode;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  change,
  icon,
  color = 'blue',
  trend = 'neutral'
}) => {
  const getTrendIcon = () => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return null;
  };

  const getTrendColor = () => {
    if (trend === 'up') return 'text-green-600';
    if (trend === 'down') return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className={`p-2 rounded-lg bg-${color}-50`}>
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{title}</p>
            <p className="text-xs text-gray-500">{unit}</p>
          </div>
        </div>
        {change !== undefined && (
          <div className={`flex items-center space-x-1 ${getTrendColor()}`}>
            {getTrendIcon()}
            <span className="text-sm font-medium">
              {change > 0 ? '+' : ''}{change.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
};

interface PerformanceMetricsChartProps extends Partial<ComponentProps> {
  metrics: TransparencyMetrics | null;
  historicalData?: {
    timestamp: Date;
    totalAgents: number;
    activeAgents: number;
    tokensConsumed: number;
    averageExecutionTime: number;
    failureRate: number;
  }[];
  timeRange?: '1h' | '6h' | '24h' | '7d';
  onTimeRangeChange?: (range: string) => void;
  refreshInterval?: number;
  autoRefresh?: boolean;
}

export const PerformanceMetricsChart: React.FC<PerformanceMetricsChartProps> = ({
  metrics,
  historicalData = [],
  timeRange = '1h',
  onTimeRangeChange,
  refreshInterval = 30000,
  autoRefresh = true,
  ...props
}) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Process historical data for charts
  const chartData = useMemo(() => {
    if (historicalData.length === 0) {
      return {
        agentCounts: { labels: [], data: [] },
        tokensData: { labels: [], data: [] },
        executionTimeData: { labels: [], data: [] },
        failureRateData: { labels: [], data: [] }
      };
    }

    const labels = historicalData.map(d => {
      const date = new Date(d.timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    return {
      agentCounts: {
        labels,
        data: historicalData.map(d => d.totalAgents)
      },
      tokensData: {
        labels,
        data: historicalData.map(d => d.tokensConsumed / 1000) // Convert to thousands
      },
      executionTimeData: {
        labels,
        data: historicalData.map(d => d.averageExecutionTime / 1000) // Convert to seconds
      },
      failureRateData: {
        labels,
        data: historicalData.map(d => d.failureRate * 100) // Convert to percentage
      }
    };
  }, [historicalData]);

  // Calculate trends
  const trends = useMemo(() => {
    if (historicalData.length < 2) return {};

    const latest = historicalData[historicalData.length - 1];
    const previous = historicalData[historicalData.length - 2];

    return {
      totalAgents: ((latest.totalAgents - previous.totalAgents) / previous.totalAgents) * 100,
      tokensConsumed: ((latest.tokensConsumed - previous.tokensConsumed) / previous.tokensConsumed) * 100,
      averageExecutionTime: ((latest.averageExecutionTime - previous.averageExecutionTime) / previous.averageExecutionTime) * 100,
      failureRate: ((latest.failureRate - previous.failureRate) / previous.failureRate) * 100,
    };
  }, [historicalData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const handleTimeRangeChange = (range: string) => {
    setSelectedTimeRange(range as any);
    onTimeRangeChange?.(range);
  };

  if (!metrics) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="text-lg font-medium text-gray-900 mb-1">No metrics available</p>
        <p className="text-sm text-gray-500">Performance metrics will appear here when agents are active</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Performance Metrics</h3>
          <div className="flex items-center space-x-2">
            {/* Time Range Selector */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              {['1h', '6h', '24h', '7d'].map((range) => (
                <button
                  key={range}
                  onClick={() => handleTimeRangeChange(range)}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    selectedTimeRange === range
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <MetricCard
            title="Total Agents"
            value={metrics.totalAgents}
            icon={<Activity className="w-5 h-5 text-blue-500" />}
            change={trends.totalAgents}
            trend={trends.totalAgents > 0 ? 'up' : trends.totalAgents < 0 ? 'down' : 'neutral'}
            color="blue"
          />
          <MetricCard
            title="Tokens Consumed"
            value={(metrics.totalTokensConsumed / 1000).toFixed(1)}
            unit="thousands"
            icon={<Zap className="w-5 h-5 text-yellow-500" />}
            change={trends.tokensConsumed}
            trend={trends.tokensConsumed > 0 ? 'up' : trends.tokensConsumed < 0 ? 'down' : 'neutral'}
            color="yellow"
          />
          <MetricCard
            title="Avg Execution Time"
            value={(metrics.averageExecutionTimeMs / 1000).toFixed(1)}
            unit="seconds"
            icon={<Clock className="w-5 h-5 text-purple-500" />}
            change={trends.averageExecutionTime}
            trend={trends.averageExecutionTime < 0 ? 'up' : trends.averageExecutionTime > 0 ? 'down' : 'neutral'}
            color="purple"
          />
          <MetricCard
            title="Failure Rate"
            value={(metrics.failureRate * 100).toFixed(1)}
            unit="percent"
            icon={<BarChart3 className="w-5 h-5 text-red-500" />}
            change={trends.failureRate}
            trend={trends.failureRate < 0 ? 'up' : trends.failureRate > 0 ? 'down' : 'neutral'}
            color="red"
          />
        </div>

        {/* Last Updated */}
        <div className="text-xs text-gray-500">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Count Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-2 mb-4">
            <Activity className="w-5 h-5 text-blue-500" />
            <h4 className="font-semibold text-gray-900">Agent Count Over Time</h4>
          </div>
          <SimpleChart
            data={chartData.agentCounts.data}
            labels={chartData.agentCounts.labels}
            color="#3B82F6"
            height={200}
            type="line"
          />
        </div>

        {/* Token Usage Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-2 mb-4">
            <Zap className="w-5 h-5 text-yellow-500" />
            <h4 className="font-semibold text-gray-900">Token Usage (thousands)</h4>
          </div>
          <SimpleChart
            data={chartData.tokensData.data}
            labels={chartData.tokensData.labels}
            color="#EAB308"
            height={200}
            type="bar"
          />
        </div>

        {/* Execution Time Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-2 mb-4">
            <Clock className="w-5 h-5 text-purple-500" />
            <h4 className="font-semibold text-gray-900">Average Execution Time (seconds)</h4>
          </div>
          <SimpleChart
            data={chartData.executionTimeData.data}
            labels={chartData.executionTimeData.labels}
            color="#A855F7"
            height={200}
            type="line"
          />
        </div>

        {/* Failure Rate Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-2 mb-4">
            <BarChart3 className="w-5 h-5 text-red-500" />
            <h4 className="font-semibold text-gray-900">Failure Rate (%)</h4>
          </div>
          <SimpleChart
            data={chartData.failureRateData.data}
            labels={chartData.failureRateData.labels}
            color="#EF4444"
            height={200}
            type="line"
          />
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Additional Metrics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{metrics.hierarchyDepth}</p>
            <p className="text-xs text-gray-500">Hierarchy Depth</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {(metrics.dependencyResolutionRate * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500">Dependency Resolution</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {(metrics.averagePauseResumeLatencyMs).toFixed(0)}ms
            </p>
            <p className="text-xs text-gray-500">Pause/Resume Latency</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {(metrics.totalTokensSaved / 1000).toFixed(1)}K
            </p>
            <p className="text-xs text-gray-500">Tokens Saved</p>
          </div>
        </div>

        {/* Event Stream Stats */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h5 className="font-medium text-gray-900 mb-2">Event Stream Statistics</h5>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">{metrics.eventStreamStats.totalEvents}</p>
              <p className="text-xs text-gray-500">Total Events</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">
                {metrics.eventStreamStats.eventsPerSecond.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">Events/Second</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">
                {Object.keys(metrics.eventStreamStats.eventTypes).length}
              </p>
              <p className="text-xs text-gray-500">Event Types</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceMetricsChart;