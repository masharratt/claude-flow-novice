/**
 * Dashboard Types
 * Type definitions for Dashboard view components
 */

export interface DashboardMetric {
  title: string;
  value: string | number;
  trend?: number;
  trendLabel?: string;
  icon?: React.ReactNode;
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
}

export interface DashboardTimeRange {
  value: '1h' | '6h' | '24h' | '7d';
  label: string;
}

export interface DashboardFilters {
  timeRange: DashboardTimeRange['value'];
  agentStatus?: string[];
  eventTypes?: string[];
}

export interface DashboardProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: number;
  trendLabel?: string;
  icon?: React.ReactNode;
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
  loading?: boolean;
}

export interface DashboardState {
  timeRange: DashboardTimeRange['value'];
  isRefreshing: boolean;
  lastUpdated: Date | null;
  isPaused: boolean;
}

export type ExportFormat = 'csv' | 'json';
