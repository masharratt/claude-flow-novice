/**
 * Fleet Dashboard Components - Main Export
 * @packageDocumentation
 */

export { FleetDashboard, useFleetDashboard } from './FleetDashboard';
export type { FleetDashboardProps } from './FleetDashboard';

export { FleetOverview } from './FleetOverview';
export type { FleetOverviewProps } from './FleetOverview';

export { SwarmVisualization } from './SwarmVisualization';
export type { SwarmVisualizationProps } from './SwarmVisualization';

export { PerformanceChart } from './PerformanceChart';
export type { PerformanceChartProps } from './PerformanceChart';

export { AlertsPanel } from './AlertsPanel';
export type { AlertsPanelProps } from './AlertsPanel';

// Re-export client and types
export { FleetDashboardClient, createFleetDashboard } from '../FleetDashboardClient';
export type {
  DashboardConfig,
  FleetMetrics,
  SystemMetrics,
  SwarmMetrics,
  DatabaseMetrics,
  NetworkMetrics,
  Alert,
  ConnectionStatus
} from '../FleetDashboardClient';
