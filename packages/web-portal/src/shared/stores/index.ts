/**
 * Zustand Stores - Centralized state management
 * Export all stores, selectors, and utilities
 */

// Store hooks
export { useAgentStore, agentSelectors } from './agentStore';
export { useMetricsStore, metricsSelectors } from './metricsStore';
export { useEventsStore, eventsSelectors } from './eventsStore';
export { useUIStore, uiSelectors } from './uiStore';

// Store provider
export {
  StoreProvider,
  useStoreContext,
  useStoreHydration,
  withStoreHydration
} from './StoreProvider';

// Type exports
export type {
  Agent,
  AgentHierarchy,
  AgentStore
} from './agentStore';

export type {
  SystemMetrics,
  AgentMetrics,
  MetricsHistory,
  MetricsStore
} from './metricsStore';

export type {
  Event,
  EventType,
  EventSeverity,
  EventFilters,
  EventPagination,
  EventsStore
} from './eventsStore';

export type {
  Theme,
  ViewType,
  NotificationSettings,
  LayoutSettings,
  ViewSettings,
  UIStore
} from './uiStore';
