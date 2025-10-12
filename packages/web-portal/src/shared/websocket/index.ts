/**
 * Unified WebSocket Module
 * Consolidates 5 fragmented WebSocket implementations
 *
 * Single entry point for all WebSocket functionality across the web portal
 */

// Core service
export { WebSocketClient } from '../services/WebSocketClient';

// React hooks
export { useWebSocket } from '../hooks/useWebSocket';
export { useWebSocketEvent } from '../hooks/useWebSocketEvent';
export { useDashboardWebSocket } from '../hooks/useDashboardWebSocket';

// Types
export type {
  // Configuration
  WebSocketClientConfig,
  SubscriptionOptions,
  HeartbeatConfig,

  // Connection
  ConnectionState,
  ConnectionStatus,
  ConnectionMetrics,

  // Messages
  WebSocketMessage,
  WebSocketEventType,
  QueuedMessage,

  // Events
  EventSubscription,
  EventHandler,
  UnsubscribeFunction,
  RoomEvent,

  // Agent Events
  AgentUpdateEvent,
  HierarchyChangeEvent,
  MetricsUpdateEvent,
  EventStreamEvent,

  // Swarm Events
  SwarmMetricsEvent,
  SwarmDataUpdate,

  // Errors
  WebSocketError,

  // Hooks
  UseWebSocketReturn,
  UseWebSocketEventReturn,
  UseDashboardWebSocketReturn,

  // Dashboard
  DashboardWebSocketState,

  // DevTools
  DevToolsEvent
} from '../types/websocket';

// Enums
export { ConnectionState } from '../types/websocket';

// Type guards
export { isWebSocketMessage, isWebSocketError } from '../types/websocket';

// Default export
export { WebSocketClient as default } from '../services/WebSocketClient';
