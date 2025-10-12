/**
 * Bar Chart Component
 * Comparison visualization using Recharts 2.14.1
 */

import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { BarChartProps } from './PerformanceCharts.types';
import { getChartTheme, TooltipContainer, TooltipLabel, TooltipItem, TooltipItemLabel, TooltipItemValue } from './PerformanceCharts.styles';

const CustomTooltip: React.FC<any> = ({ active, payload, label, theme = 'light' }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <TooltipContainer themeMode={theme} elevation={4}>
      <TooltipLabel>{label}</TooltipLabel>
      {payload.map((entry: any, index: number) => (
        <TooltipItem key={index}>
          <TooltipItemLabel>{entry.name}:</TooltipItemLabel>
          <TooltipItemValue color={entry.fill}>
            {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
          </TooltipItemValue>
        </TooltipItem>
      ))}
    </TooltipContainer>
  );
};

export const BarChartComponent: React.FC<BarChartProps> = ({
  data,
  dataKeys,
  width = '100%',
  height = 400,
  theme = 'light',
  showGrid = true,
  showLegend = true,
  showTooltip = true,
  animationDuration = 750,
  stackBars = false,
  barSize = 40,
  radius = [8, 8, 0, 0],
  className,
}) => {
  const chartTheme = getChartTheme(theme);

  const colors = [
    chartTheme.primary,
    chartTheme.secondary,
    chartTheme.tertiary,
    chartTheme.quaternary,
    chartTheme.quinary,
  ];

  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  // Transform agent data to chart format
  const chartData = data.map((agent) => ({
    name: agent.agentName,
    agentId: agent.agentId,
    agentType: agent.agentType,
    successRate: agent.metrics.successRate * 100,
    avgResponseTime: agent.metrics.avgResponseTime,
    tasksCompleted: agent.metrics.tasksCompleted,
    tasksFailed: agent.metrics.tasksFailed,
    confidence: agent.metrics.confidence * 100,
  }));

  return (
    <ResponsiveContainer width={width} height={height} className={className}>
      <RechartsBarChart
        data={chartData}
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
          dataKey="name"
          stroke={chartTheme.text}
          tick={{ fill: chartTheme.text, fontSize: 12 }}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis
          stroke={chartTheme.text}
          tick={{ fill: chartTheme.text, fontSize: 12 }}
          tickFormatter={formatYAxis}
        />
        {showTooltip && (
          <Tooltip
            content={<CustomTooltip theme={theme} />}
            cursor={{ fill: chartTheme.grid, opacity: 0.2 }}
          />
        )}
        {showLegend && (
          <Legend
            wrapperStyle={{ color: chartTheme.text }}
            iconType="rect"
          />
        )}
        {dataKeys.map((key, index) => {
          const color = colors[index % colors.length];

          return (
            <Bar
              key={key}
              dataKey={key}
              fill={color}
              radius={radius}
              maxBarSize={barSize}
              animationDuration={animationDuration}
              stackId={stackBars ? 'stack' : undefined}
            />
          );
        })}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
};

export default BarChartComponent;
