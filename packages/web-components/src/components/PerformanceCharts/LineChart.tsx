/**
 * Line Chart Component
 * Time series visualization using Recharts 2.14.1
 */

import React, { useMemo } from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { format } from 'date-fns';
import { LineChartProps } from './PerformanceCharts.types';
import { getChartTheme, TooltipContainer, TooltipLabel, TooltipItem, TooltipItemLabel, TooltipItemValue } from './PerformanceCharts.styles';

const CustomTooltip: React.FC<any> = ({ active, payload, label, theme = 'light' }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <TooltipContainer themeMode={theme} elevation={4}>
      <TooltipLabel>{typeof label === 'number' ? format(label, 'HH:mm:ss') : label}</TooltipLabel>
      {payload.map((entry: any, index: number) => (
        <TooltipItem key={index}>
          <TooltipItemLabel>{entry.name}:</TooltipItemLabel>
          <TooltipItemValue color={entry.color}>
            {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
            {entry.unit || ''}
          </TooltipItemValue>
        </TooltipItem>
      ))}
    </TooltipContainer>
  );
};

export const LineChartComponent: React.FC<LineChartProps> = ({
  data,
  dataKey,
  xAxisKey = 'timestamp',
  width = '100%',
  height = 400,
  theme = 'light',
  showGrid = true,
  showLegend = true,
  showTooltip = true,
  animationDuration = 750,
  strokeWidth = 2,
  dot = true,
  smooth = true,
  area = false,
  className,
}) => {
  const chartTheme = getChartTheme(theme);
  const dataKeys = useMemo(() => (Array.isArray(dataKey) ? dataKey : [dataKey]), [dataKey]);

  const colors = [
    chartTheme.primary,
    chartTheme.secondary,
    chartTheme.tertiary,
    chartTheme.quaternary,
    chartTheme.quinary,
  ];

  const ChartComponent = area ? AreaChart : RechartsLineChart;

  const formatXAxis = (value: any) => {
    if (typeof value === 'number' && value > 1000000000) {
      return format(value, 'HH:mm');
    }
    return value;
  };

  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  return (
    <ResponsiveContainer width={width} height={height} className={className}>
      <ChartComponent
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
          dataKey={xAxisKey as string}
          stroke={chartTheme.text}
          tick={{ fill: chartTheme.text, fontSize: 12 }}
          tickFormatter={formatXAxis}
        />
        <YAxis
          stroke={chartTheme.text}
          tick={{ fill: chartTheme.text, fontSize: 12 }}
          tickFormatter={formatYAxis}
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

          if (area) {
            return (
              <Area
                key={String(key)}
                type={smooth ? 'monotone' : 'linear'}
                dataKey={String(key)}
                stroke={color}
                fill={color}
                fillOpacity={0.3}
                strokeWidth={strokeWidth}
                dot={dot ? { fill: color, r: 3 } : false}
                activeDot={dot ? { r: 5 } : false}
                animationDuration={animationDuration}
              />
            );
          }

          return (
            <Line
              key={String(key)}
              type={smooth ? 'monotone' : 'linear'}
              dataKey={String(key)}
              stroke={color}
              strokeWidth={strokeWidth}
              dot={dot ? { fill: color, r: 3 } : false}
              activeDot={dot ? { r: 5 } : false}
              animationDuration={animationDuration}
            />
          );
        })}
      </ChartComponent>
    </ResponsiveContainer>
  );
};

export default LineChartComponent;
