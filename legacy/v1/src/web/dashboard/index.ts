/**
 * Dashboard Module Exports
 * Central export point for all dashboard components and utilities
 */

// Main Components
export { default as Dashboard } from './Dashboard';
export { default as AgentHierarchyTree } from './components/AgentHierarchyTree';
export { default as AgentStatusMonitor } from './components/AgentStatusMonitor';
export { default as PerformanceMetricsChart } from './components/PerformanceMetricsChart';
export { default as EventTimeline } from './components/EventTimeline';
export { default as ResourceGauges } from './components/ResourceGauges';

// Hooks
export { useWebSocket, useDashboardWebSocket } from './hooks/useWebSocket';

// Types
export type {
  AgentHierarchyNode,
  AgentState,
  AgentMetrics,
  AgentStatus,
  AgentMessage,
  AgentError,
  AgentLifecycleEvent,
  LifecycleEventType,
  LifecycleEventData,
  PerformanceImpact,
  TransparencyMetrics,
  EventStreamStats,
  HierarchyAnalytics,
  DashboardConfig,
  WebSocketMessage,
  ResourceUsage,
  PerformanceAlert,
  AlertType,
  ChartData,
  ChartDataset,
  TimelineEvent,
  FilterOptions,
  DashboardState,
  ComponentProps,
  WebSocketStatus,
  ApiResponse,
  HierarchyResponse,
  StatusResponse,
  EventsResponse,
  MetricsResponse
} from './types';

// Utilities
export const createDashboardConfig = (overrides: Partial<DashboardConfig> = {}): DashboardConfig => ({
  refreshInterval: 5000,
  maxEvents: 1000,
  enableAnimations: true,
  theme: 'light',
  autoRefresh: true,
  ...overrides
});

export const formatBytes = (bytes: number): string => {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

export const getAgentStateColor = (state: AgentState): string => {
  switch (state) {
    case 'active': return 'text-green-600 bg-green-50 border-green-200';
    case 'paused': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'error': return 'text-red-600 bg-red-50 border-red-200';
    case 'terminated': return 'text-gray-600 bg-gray-50 border-gray-200';
    default: return 'text-blue-600 bg-blue-50 border-blue-200';
  }
};

export const getAlertSeverityColor = (severity: string): string => {
  switch (severity) {
    case 'critical': return 'text-red-600 bg-red-50 border-red-200';
    case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
};

// Default export
export default {
  Dashboard,
  AgentHierarchyTree,
  AgentStatusMonitor,
  PerformanceMetricsChart,
  EventTimeline,
  ResourceGauges,
  useWebSocket,
  useDashboardWebSocket,
  createDashboardConfig,
  formatBytes,
  formatDuration,
  getAgentStateColor,
  getAlertSeverityColor
};