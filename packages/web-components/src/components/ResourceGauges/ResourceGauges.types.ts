/**
 * ResourceGauges Component Types
 *
 * Type definitions for resource monitoring gauges with color-coded thresholds
 */

export interface ResourceMetric {
  /** Current value (0-100 for percentages, or absolute for network) */
  value: number;
  /** Maximum value (100 for percentages, custom for network) */
  max: number;
  /** Metric label */
  label: string;
  /** Unit of measurement */
  unit: string;
  /** Optional timestamp of last update */
  timestamp?: number;
}

export interface ThresholdConfig {
  /** Warning threshold (yellow) */
  warning: number;
  /** Critical threshold (red) */
  critical: number;
}

export interface GaugeTheme {
  /** Normal state color (green) */
  normal: string;
  /** Warning state color (yellow) */
  warning: string;
  /** Critical state color (red) */
  critical: string;
  /** Background color */
  background: string;
  /** Text color */
  text: string;
}

export interface ResourceGaugesProps {
  /** CPU usage percentage (0-100) */
  cpu: number;
  /** Memory usage percentage (0-100) */
  memory: number;
  /** Disk usage percentage (0-100) */
  disk: number;
  /** Network throughput in Mbps */
  network: number;
  /** Maximum network throughput for gauge scaling (default: 1000 Mbps) */
  maxNetwork?: number;
  /** Custom threshold configuration */
  thresholds?: {
    cpu?: ThresholdConfig;
    memory?: ThresholdConfig;
    disk?: ThresholdConfig;
    network?: ThresholdConfig;
  };
  /** Custom gauge theme colors */
  theme?: Partial<GaugeTheme>;
  /** Enable animations (default: true) */
  animated?: boolean;
  /** Animation duration in milliseconds (default: 1000) */
  animationDuration?: number;
  /** Show metric labels (default: true) */
  showLabels?: boolean;
  /** Gauge size (default: 'medium') */
  size?: 'small' | 'medium' | 'large';
  /** Callback when threshold is exceeded */
  onThresholdExceeded?: (metric: string, value: number, threshold: 'warning' | 'critical') => void;
  /** Custom class name */
  className?: string;
}

export interface GaugeProps {
  /** Metric data */
  metric: ResourceMetric;
  /** Threshold configuration */
  thresholds: ThresholdConfig;
  /** Gauge theme */
  theme: GaugeTheme;
  /** Enable animation */
  animated: boolean;
  /** Animation duration in ms */
  animationDuration: number;
  /** Gauge size */
  size: 'small' | 'medium' | 'large';
  /** Show label */
  showLabel: boolean;
}

export type ResourceType = 'cpu' | 'memory' | 'disk' | 'network';

export interface GaugeState {
  /** Current display value (for animation) */
  displayValue: number;
  /** Color based on threshold */
  color: string;
  /** Threshold state */
  state: 'normal' | 'warning' | 'critical';
}
