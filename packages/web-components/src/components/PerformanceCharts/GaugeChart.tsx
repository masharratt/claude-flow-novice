/**
 * Gauge Chart Component
 * Resource usage visualization using Recharts 2.14.1
 */

import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { GaugeChartProps } from './PerformanceCharts.types';
import { getChartTheme, GaugeContainer, GaugeLabel, GaugeSubLabel } from './PerformanceCharts.styles';

export const GaugeChartComponent: React.FC<GaugeChartProps> = ({
  value,
  maxValue = 100,
  minValue = 0,
  label = 'Usage',
  unit = '%',
  width = '100%',
  height = 300,
  theme = 'light',
  thresholds = {
    low: 60,
    medium: 80,
    high: 100,
  },
  colors,
  className,
}) => {
  const chartTheme = getChartTheme(theme);

  const defaultColors = {
    low: chartTheme.success,
    medium: chartTheme.warning,
    high: chartTheme.error,
  };

  const gaugeColors = colors || defaultColors;

  // Clamp value between min and max
  const clampedValue = Math.max(minValue, Math.min(maxValue, value));
  const percentage = ((clampedValue - minValue) / (maxValue - minValue)) * 100;

  // Determine color based on value and thresholds
  const getColor = () => {
    if (percentage >= thresholds.high) return gaugeColors.high;
    if (percentage >= thresholds.medium) return gaugeColors.medium;
    return gaugeColors.low;
  };

  const currentColor = getColor();

  // Create gauge data (semicircle)
  const gaugeData = [
    { name: 'value', value: percentage },
    { name: 'empty', value: 100 - percentage },
  ];

  // Calculate needle angle
  const needleAngle = -180 + (percentage / 100) * 180;

  const renderNeedle = (cx: number, cy: number, radius: number) => {
    const needleLength = radius * 0.8;
    const needleWidth = 4;

    const angle = (needleAngle * Math.PI) / 180;
    const x1 = cx;
    const y1 = cy;
    const x2 = cx + needleLength * Math.cos(angle);
    const y2 = cy + needleLength * Math.sin(angle);

    return (
      <g>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={currentColor}
          strokeWidth={needleWidth}
          strokeLinecap="round"
        />
        <circle
          cx={cx}
          cy={cy}
          r={8}
          fill={currentColor}
          stroke={chartTheme.background}
          strokeWidth={2}
        />
      </g>
    );
  };

  const renderLabels = (cx: number, cy: number, radius: number) => {
    const labelRadius = radius * 0.9;
    const positions = [
      { angle: -180, label: minValue },
      { angle: -90, label: ((maxValue - minValue) / 2 + minValue).toFixed(0) },
      { angle: 0, label: maxValue },
    ];

    return (
      <g>
        {positions.map((pos, index) => {
          const angle = (pos.angle * Math.PI) / 180;
          const x = cx + labelRadius * Math.cos(angle);
          const y = cy + labelRadius * Math.sin(angle) + 5;

          return (
            <text
              key={index}
              x={x}
              y={y}
              textAnchor="middle"
              fill={chartTheme.text}
              fontSize={12}
              opacity={0.7}
            >
              {pos.label}
            </text>
          );
        })}
      </g>
    );
  };

  return (
    <GaugeContainer className={className}>
      <ResponsiveContainer width={width} height={height}>
        <PieChart>
          <Pie
            data={gaugeData}
            cx="50%"
            cy="80%"
            startAngle={180}
            endAngle={0}
            innerRadius="70%"
            outerRadius="90%"
            paddingAngle={0}
            dataKey="value"
          >
            <Cell fill={currentColor} />
            <Cell fill={chartTheme.grid} opacity={0.2} />
          </Pie>
          <g>
            {renderNeedle(
              (typeof width === 'number' ? width : 300) / 2,
              (typeof height === 'number' ? height : 300) * 0.8,
              (Math.min(
                typeof width === 'number' ? width : 300,
                typeof height === 'number' ? height : 300
              )) * 0.35
            )}
            {renderLabels(
              (typeof width === 'number' ? width : 300) / 2,
              (typeof height === 'number' ? height : 300) * 0.8,
              (Math.min(
                typeof width === 'number' ? width : 300,
                typeof height === 'number' ? height : 300
              )) * 0.35
            )}
          </g>
        </PieChart>
      </ResponsiveContainer>
      <GaugeLabel style={{ color: currentColor }}>
        {clampedValue.toFixed(1)}{unit}
      </GaugeLabel>
      <GaugeSubLabel>{label}</GaugeSubLabel>
    </GaugeContainer>
  );
};

export default GaugeChartComponent;
