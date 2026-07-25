/**
 * Realtime Chart Component
 * Live updating time series visualization using Recharts 2.14.1
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { RealtimeChartProps, PerformanceMetrics } from './PerformanceCharts.types';
import { getChartTheme, StatusIndicator, TooltipContainer, TooltipLabel, TooltipItem, TooltipItemLabel, TooltipItemValue } from './PerformanceCharts.styles';

const CustomTooltip: React.FC<any> = ({ active, payload, label, theme = 'light' }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <TooltipContainer themeMode={theme} elevation={4}>
      <TooltipLabel>{format(label, 'HH:mm:ss')}</TooltipLabel>
      {payload.map((entry: any, index: number) => (
        <TooltipItem key={index}>
          <TooltipItemLabel>{entry.name}:</TooltipItemLabel>
          <TooltipItemValue color={entry.color}>
            {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
          </TooltipItemValue>
        </TooltipItem>
      ))}
    </TooltipContainer>
  );
};

export const RealtimeChartComponent: React.FC<RealtimeChartProps> = ({
  data: initialData,
  dataKeys,
  updateInterval = 1000,
  maxDataPoints = 60,
  autoScroll = true,
  width = '100%',
  height = 400,
  theme = 'light',
  showGrid = true,
  showLegend = true,
  showTooltip = true,
  animationDuration = 300,
  onDataUpdate,
  className,
}) => {
  const [data, setData] = useState<PerformanceMetrics[]>(initialData);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const chartTheme = getChartTheme(theme);

  const colors = [
    chartTheme.primary,
    chartTheme.secondary,
    chartTheme.tertiary,
    chartTheme.quaternary,
    chartTheme.quinary,
  ];

  const generateNewDataPoint = useCallback((): PerformanceMetrics => {
    const lastPoint = data[data.length - 1];
    const baseValues = lastPoint || {
      cpu: 50,
      memory: 50,
      network: 50,
      responseTime: 100,
      timestamp: Date.now(),
    };

    // Simulate realistic fluctuations
    const fluctuate = (base: number, variance: number = 10): number => {
      const change = (Math.random() - 0.5) * variance;
      return Math.max(0, Math.min(100, base + change));
    };

    return {
      timestamp: Date.now(),
      cpu: fluctuate(baseValues.cpu || 50, 15),
      memory: fluctuate(baseValues.memory || 50, 10),
      network: fluctuate(baseValues.network || 50, 20),
      disk: fluctuate(baseValues.disk || 50, 8),
      responseTime: fluctuate(baseValues.responseTime || 100, 30),
      throughput: fluctuate(baseValues.throughput || 50, 25),
      errorRate: Math.random() * 5,
      activeAgents: Math.floor(Math.random() * 10) + 1,
      taskQueue: Math.floor(Math.random() * 50),
    };
  }, [data]);

  const updateData = useCallback(() => {
    if (isPaused) return;

    const newPoint = generateNewDataPoint();

    setData((prevData) => {
      const newData = [...prevData, newPoint];
      if (newData.length > maxDataPoints) {
        newData.shift();
      }
      return newData;
    });

    onDataUpdate?.(newPoint);
  }, [isPaused, generateNewDataPoint, maxDataPoints, onDataUpdate]);

  useEffect(() => {
    if (updateInterval > 0) {
      intervalRef.current = setInterval(updateData, updateInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
    return undefined;
  }, [updateInterval, updateData]);

  // Update data when initialData changes
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const handleClear = () => {
    setData([]);
  };

  const formatXAxis = (timestamp: number) => {
    return format(timestamp, 'HH:mm:ss');
  };

  const formatYAxis = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  // Calculate domain for smooth scrolling
  const xDomain = autoScroll && data.length > 0
    ? [
        data[0]?.timestamp || Date.now() - maxDataPoints * updateInterval,
        data[data.length - 1]?.timestamp || Date.now(),
      ]
    : ['dataMin', 'dataMax'];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} className={className}>
      <ResponsiveContainer width={width} height={height}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartTheme.grid}
              opacity={0.3}
            />
          )}
          <XAxis
            dataKey="timestamp"
            domain={xDomain as any}
            type="number"
            stroke={chartTheme.text}
            tick={{ fill: chartTheme.text, fontSize: 12 }}
            tickFormatter={formatXAxis}
            scale="time"
          />
          <YAxis
            stroke={chartTheme.text}
            tick={{ fill: chartTheme.text, fontSize: 12 }}
            tickFormatter={formatYAxis}
            domain={[0, 100]}
          />
          {showTooltip && (
            <Tooltip
              content={<CustomTooltip theme={theme} />}
              cursor={{ stroke: chartTheme.border, strokeWidth: 1 }}
            />
          )}
          {showLegend && (
            <Legend
              wrapperStyle={{ color: chartTheme.text }}
              iconType="line"
            />
          )}
          {dataKeys.map((key, index) => {
            const color = colors[index % colors.length];

            return (
              <Line
                key={String(key)}
                type="monotone"
                dataKey={String(key)}
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={!isPaused}
                animationDuration={animationDuration}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <StatusIndicator active={!isPaused}>
        {isPaused ? 'Paused' : 'Live Updates'}
      </StatusIndicator>

      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          display: 'flex',
          gap: '8px',
        }}
      >
        <button
          onClick={handleTogglePause}
          style={{
            padding: '6px 12px',
            border: `1px solid ${chartTheme.border}`,
            borderRadius: '4px',
            backgroundColor: chartTheme.background,
            color: chartTheme.text,
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={handleClear}
          style={{
            padding: '6px 12px',
            border: `1px solid ${chartTheme.border}`,
            borderRadius: '4px',
            backgroundColor: chartTheme.background,
            color: chartTheme.text,
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default RealtimeChartComponent;
