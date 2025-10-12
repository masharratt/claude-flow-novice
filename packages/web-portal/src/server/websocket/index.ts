/**
 * WebSocket Server Module
 * Unified Socket.IO server with integration adapters
 */

export { WebSocketServer } from './SocketIOServer';
export { TransparencyAdapter } from './integrations/TransparencyAdapter';
export { SwarmAdapter } from './integrations/SwarmAdapter';
export { MetricsAggregator } from './integrations/MetricsAggregator';

export type {
  SocketIOServerConfig,
  AuthenticatedSocket,
  EventThrottleConfig,
  ConnectionMetrics,
  RoomSubscription,
  EventPayload,
  SystemMetrics,
  AgentStatus,
  HierarchyEvent,
  ErrorEvent,
  NotificationEvent
} from './types';

export type {
  TransparencySystemEvent
} from './integrations/TransparencyAdapter';

export type {
  SwarmCoordinatorEvent
} from './integrations/SwarmAdapter';

export type {
  MetricsAggregatorConfig
} from './integrations/MetricsAggregator';
