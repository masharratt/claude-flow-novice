/**
 * ResourceGauges Component
 *
 * Resource monitoring with animated gauges for CPU, memory, disk, and network metrics.
 * Features color-coded thresholds and customizable animations.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CircularProgress } from '@mui/material';
import {
  ResourceGaugesProps,
  ResourceMetric,
  GaugeTheme,
  GaugeProps,
  GaugeState,
  ResourceType,
} from './ResourceGauges.types';
import {
  GaugesContainer,
  GaugeWrapper,
  GaugeContainer,
  GaugeValue,
  ValueText,
  UnitText,
  LabelText,
  Needle,
  ThresholdIndicator,
  ThresholdDot,
  TimestampText,
} from './ResourceGauges.styles';

// Default threshold configurations
const DEFAULT_THRESHOLDS = {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 75, critical: 90 },
  disk: { warning: 80, critical: 95 },
  network: { warning: 70, critical: 90 },
};

// Default gauge theme
const DEFAULT_THEME: GaugeTheme = {
  normal: '#4caf50',
  warning: '#ff9800',
  critical: '#f44336',
  background: '#e0e0e0',
  text: '#212121',
};

/**
 * Individual gauge component with animated needle and color-coded thresholds
 */
const Gauge: React.FC<GaugeProps> = ({
  metric,
  thresholds,
  theme,
  animated,
  animationDuration,
  size,
  showLabel,
}) => {
  const [gaugeState, setGaugeState] = useState<GaugeState>({
    displayValue: 0,
    color: theme.normal,
    state: 'normal',
  });

  // Calculate gauge state based on value and thresholds
  const calculateState = useCallback(
    (value: number): GaugeState => {
      let state: 'normal' | 'warning' | 'critical' = 'normal';
      let color = theme.normal;

      if (value >= thresholds.critical) {
        state = 'critical';
        color = theme.critical;
      } else if (value >= thresholds.warning) {
        state = 'warning';
        color = theme.warning;
      }

      return { displayValue: value, color, state };
    },
    [thresholds, theme]
  );

  // Animate value changes
  useEffect(() => {
    if (animated) {
      const newState = calculateState(metric.value);
      const startValue = gaugeState.displayValue;
      const endValue = metric.value;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);

        // Easing function (ease-out)
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentValue = startValue + (endValue - startValue) * eased;

        setGaugeState({
          ...newState,
          displayValue: currentValue,
        });

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    } else {
      setGaugeState(calculateState(metric.value));
    }
  }, [metric.value, animated, animationDuration, calculateState]);

  // Calculate needle angle (-90 to 90 degrees for semicircle)
  const needleAngle = useMemo(() => {
    const percentage = (gaugeState.displayValue / metric.max) * 100;
    return (percentage / 100) * 180 - 90;
  }, [gaugeState.displayValue, metric.max]);

  // Calculate percentage for circular progress
  const percentage = useMemo(() => {
    return (gaugeState.displayValue / metric.max) * 100;
  }, [gaugeState.displayValue, metric.max]);

  // Format timestamp
  const formattedTimestamp = useMemo(() => {
    if (!metric.timestamp) return null;
    const date = new Date(metric.timestamp);
    return date.toLocaleTimeString();
  }, [metric.timestamp]);

  return (
    <GaugeWrapper>
      <GaugeContainer size={size}>
        {/* Background circular progress */}
        <CircularProgress
          variant="determinate"
          value={100}
          size={size === 'small' ? 120 : size === 'medium' ? 160 : 200}
          thickness={4}
          sx={{
            color: theme.background,
            position: 'absolute',
          }}
        />

        {/* Active circular progress */}
        <CircularProgress
          variant="determinate"
          value={percentage}
          size={size === 'small' ? 120 : size === 'medium' ? 160 : 200}
          thickness={4}
          sx={{
            color: gaugeState.color,
            position: 'absolute',
            transition: animated ? `color ${animationDuration}ms ease-out` : 'none',
          }}
        />

        {/* Animated needle */}
        <Needle
          angle={needleAngle}
          color={gaugeState.color}
          size={size}
          animated={animated}
          duration={animationDuration}
        />

        {/* Value display */}
        <GaugeValue>
          <ValueText sx={{ color: gaugeState.color }}>
            {Math.round(gaugeState.displayValue)}
          </ValueText>
          <UnitText>{metric.unit}</UnitText>
        </GaugeValue>

        {/* Threshold indicators */}
        <ThresholdIndicator>
          <ThresholdDot color={theme.normal} />
          <ThresholdDot color={theme.warning} />
          <ThresholdDot color={theme.critical} />
        </ThresholdIndicator>
      </GaugeContainer>

      {showLabel && <LabelText>{metric.label}</LabelText>}
      {formattedTimestamp && <TimestampText>{formattedTimestamp}</TimestampText>}
    </GaugeWrapper>
  );
};

/**
 * ResourceGauges Component
 *
 * Displays resource monitoring gauges for CPU, memory, disk, and network metrics
 */
export const ResourceGauges: React.FC<ResourceGaugesProps> = ({
  cpu,
  memory,
  disk,
  network,
  maxNetwork = 1000,
  thresholds = {},
  theme: customTheme = {},
  animated = true,
  animationDuration = 1000,
  showLabels = true,
  size = 'medium',
  onThresholdExceeded,
  className,
}) => {
  // Merge custom theme with defaults
  const gaugeTheme: GaugeTheme = useMemo(
    () => ({
      ...DEFAULT_THEME,
      ...customTheme,
    }),
    [customTheme]
  );

  // Merge custom thresholds with defaults
  const mergedThresholds = useMemo(
    () => ({
      cpu: { ...DEFAULT_THRESHOLDS.cpu, ...thresholds.cpu },
      memory: { ...DEFAULT_THRESHOLDS.memory, ...thresholds.memory },
      disk: { ...DEFAULT_THRESHOLDS.disk, ...thresholds.disk },
      network: { ...DEFAULT_THRESHOLDS.network, ...thresholds.network },
    }),
    [thresholds]
  );

  // Create metric objects
  const metrics: Record<ResourceType, ResourceMetric> = useMemo(
    () => ({
      cpu: {
        value: cpu,
        max: 100,
        label: 'CPU Usage',
        unit: '%',
        timestamp: Date.now(),
      },
      memory: {
        value: memory,
        max: 100,
        label: 'Memory Usage',
        unit: '%',
        timestamp: Date.now(),
      },
      disk: {
        value: disk,
        max: 100,
        label: 'Disk Usage',
        unit: '%',
        timestamp: Date.now(),
      },
      network: {
        value: network,
        max: maxNetwork,
        label: 'Network Throughput',
        unit: 'Mbps',
        timestamp: Date.now(),
      },
    }),
    [cpu, memory, disk, network, maxNetwork]
  );

  // Check thresholds and trigger callback
  useEffect(() => {
    if (!onThresholdExceeded) return;

    Object.entries(metrics).forEach(([type, metric]) => {
      const threshold = mergedThresholds[type as ResourceType];
      const percentage = (metric.value / metric.max) * 100;

      if (percentage >= threshold.critical) {
        onThresholdExceeded(type, metric.value, 'critical');
      } else if (percentage >= threshold.warning) {
        onThresholdExceeded(type, metric.value, 'warning');
      }
    });
  }, [metrics, mergedThresholds, onThresholdExceeded]);

  return (
    <GaugesContainer className={className}>
      <Gauge
        metric={metrics.cpu}
        thresholds={mergedThresholds.cpu}
        theme={gaugeTheme}
        animated={animated}
        animationDuration={animationDuration}
        size={size}
        showLabel={showLabels}
      />
      <Gauge
        metric={metrics.memory}
        thresholds={mergedThresholds.memory}
        theme={gaugeTheme}
        animated={animated}
        animationDuration={animationDuration}
        size={size}
        showLabel={showLabels}
      />
      <Gauge
        metric={metrics.disk}
        thresholds={mergedThresholds.disk}
        theme={gaugeTheme}
        animated={animated}
        animationDuration={animationDuration}
        size={size}
        showLabel={showLabels}
      />
      <Gauge
        metric={metrics.network}
        thresholds={mergedThresholds.network}
        theme={gaugeTheme}
        animated={animated}
        animationDuration={animationDuration}
        size={size}
        showLabel={showLabels}
      />
    </GaugesContainer>
  );
};

export default ResourceGauges;
