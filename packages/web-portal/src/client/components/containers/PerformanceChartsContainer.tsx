/**
 * PerformanceChartsContainer
 * Wrapper for PerformanceCharts from web-components with Zustand store integration
 */

import React, { useCallback } from 'react';
import { PerformanceCharts } from '@components';
import { useMetricsStore } from '../../../shared/stores/metricsStore';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface PerformanceChartsContainerProps {
  defaultChartType?: 'line' | 'bar' | 'gauge' | 'mixed';
  timeRange?: '5m' | '15m' | '1h' | '6h' | '24h' | '7d' | '30d';
  realTimeUpdates?: boolean;
  updateInterval?: number;
  enableExport?: boolean;
  enableFullscreen?: boolean;
  height?: number | string;
  className?: string;
}

export const PerformanceChartsContainer: React.FC<PerformanceChartsContainerProps> = ({
  defaultChartType = 'line',
  timeRange = '1h',
  realTimeUpdates = true,
  updateInterval = 5000,
  enableExport = true,
  enableFullscreen = true,
  height = 400,
  className,
}) => {
  const { metrics, historicalData, addMetric, loading } = useMetricsStore();

  // Subscribe to metrics events
  useWebSocketEvent('metrics:updated', (data: any) => {
    console.log('[PerformanceCharts] Metrics updated:', data);
    if (data.metric) {
      addMetric(data.metric);
    }
  });

  // Transform metrics to chart data format
  const systemMetrics = historicalData.map((point) => ({
    timestamp: point.timestamp,
    cpu: point.cpuUsage || 0,
    memory: point.memoryUsage || 0,
    responseTime: 0,
  }));

  const agentMetrics = [
    {
      agentId: 'agent-1',
      name: 'Agent 1',
      tasksCompleted: 10,
      successRate: 0.95,
      averageResponseTime: 100,
    },
  ];

  const handleTimeRangeChange = useCallback((range: string) => {
    console.log('[PerformanceCharts] Time range changed:', range);
  }, []);

  const handleExport = useCallback((format: 'png' | 'csv' | 'json') => {
    console.log('[PerformanceCharts] Export:', format);
  }, []);

  if (loading && historicalData.length === 0) {
    return <LoadingSpinner message="Loading performance metrics..." />;
  }

  return (
    <ErrorBoundary>
      <PerformanceCharts
        systemMetrics={systemMetrics}
        agentMetrics={agentMetrics}
        defaultChartType={defaultChartType}
        timeRange={timeRange}
        realTimeUpdates={realTimeUpdates}
        updateInterval={updateInterval}
        enableExport={enableExport}
        enableFullscreen={enableFullscreen}
        height={height}
        onTimeRangeChange={handleTimeRangeChange}
        onExport={handleExport}
        className={className}
      />
    </ErrorBoundary>
  );
};

export default PerformanceChartsContainer;
