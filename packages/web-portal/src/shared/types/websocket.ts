/**
 * Unified WebSocket Types
 * Consolidates types from 5 fragmented WebSocket implementations
 */

import type { Socket } from 'socket.io-client';

// Connection States
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

// WebSocket Event Types (from 5 implementations)
export type WebSocketEventType =
  | 'agent_update'
  | 'hierarchy_change'
  | 'metrics_update'
  | 'event_stream'
  | 'error'
  | 'mcp-status'
  | 'swarm-metrics'
  | 'agents-update'
  | 'tasks-update'
  | 'initial-data'
  | 'connection-established'
  | 'full-sync'
  | 'swarm-switched'
  | 'swarm-data-update'
  | 'notification'
  | 'message';

// Generic WebSocket Message
export interface WebSocketMessage<T = any> {
  type: WebSocketEventType;
  timestamp: Date | string;
  payload: T;
  swarmId?: string;
  agentId?: string;
  connectionId?: string;
}

// Connection Status
export interface ConnectionStatus {
  state: ConnectionState;
  connected: boolean;
  reconnectAttempts: number;
  lastConnected?: Date;
  lastMessage?: Date;
  error?: string;
  latency?: number;
}

// Subscription Options
export interface SubscriptionOptions {
  once?: boolean;
  priority?: number;
  filter?: (data: any) => boolean;
  transform?: (data: any) => any;
  room?: string;
}

// Event Subscription
export interface EventSubscription {
  id: string;
  event: string;
  callback: (data: any) => void;
  options: SubscriptionOptions;
  unsubscribe: () => void;
}

// Client Configuration
export interface WebSocketClientConfig {
  url?: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  reconnectBackoffMultiplier?: number;
  heartbeatInterval?: number;
  connectionTimeout?: number;
  messageQueueSize?: number;
  debug?: boolean;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
  onMessage?: (message: WebSocketMessage) => void;
  onReconnecting?: (attempt: number, delay: number) => void;
  onReconnectFailed?: () => void;
}

// Message Queue Item
export interface QueuedMessage {
  id: string;
  message: WebSocketMessage;
  timestamp: Date;
  retryCount: number;
  priority: number;
}

// Room-based Event Types
export interface RoomEvent {
  room: string;
  event: string;
  data: any;
}

// Agent-specific Event Types
export interface AgentUpdateEvent {
  agentId: string;
  status: string;
  confidence: number;
  currentTask?: string;
  metadata?: Record<string, any>;
}

export interface HierarchyChangeEvent {
  agents: any[];
  hierarchy: any;
  timestamp: Date;
}

export interface MetricsUpdateEvent {
  metrics: any;
  resourceUsage?: any;
  alerts?: any[];
}

export interface EventStreamEvent {
  event: any;
  type: string;
  timestamp: Date;
}

// Swarm-specific Event Types
export interface SwarmMetricsEvent {
  swarmId: string;
  agents: any[];
  tasks: any[];
  metrics: any;
}

export interface SwarmDataUpdate {
  swarmId: string;
  data: {
    agents?: any[];
    tasks?: any[];
    metrics?: any;
  };
}

// Error Types
export interface WebSocketError extends Error {
  code?: string;
  type: 'connection' | 'timeout' | 'message' | 'auth' | 'unknown';
  retryable: boolean;
  timestamp: Date;
}

// Heartbeat Configuration
export interface HeartbeatConfig {
  interval: number;
  timeout: number;
  maxMissed: number;
}

// Connection Metrics
export interface ConnectionMetrics {
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  averageLatency: number;
  uptime: number;
  reconnections: number;
  errors: number;
}

// DevTools Integration
export interface DevToolsEvent {
  timestamp: Date;
  type: 'connection' | 'message' | 'error' | 'subscription';
  direction: 'in' | 'out';
  data: any;
}

// Type Guards
export function isWebSocketMessage(obj: any): obj is WebSocketMessage {
  return (
    obj &&
    typeof obj === 'object' &&
    'type' in obj &&
    'timestamp' in obj &&
    'payload' in obj
  );
}

export function isWebSocketError(obj: any): obj is WebSocketError {
  return (
    obj &&
    obj instanceof Error &&
    'type' in obj &&
    'retryable' in obj
  );
}

// Event Type Helpers
export type EventHandler<T = any> = (data: T) => void;
export type UnsubscribeFunction = () => void;

// React Hook Return Types
export interface UseWebSocketReturn {
  socket: Socket | null;
  status: ConnectionStatus;
  isConnected: boolean;
  error: string | null;
  metrics: ConnectionMetrics;
  sendMessage: (type: string, payload: any) => void;
  subscribe: <T = any>(event: string, callback: EventHandler<T>, options?: SubscriptionOptions) => UnsubscribeFunction;
  unsubscribe: (event: string, callback?: EventHandler) => void;
  disconnect: () => void;
  reconnect: () => void;
  lastMessage: WebSocketMessage | null;
  getMetrics: () => ConnectionMetrics;
}

export interface UseWebSocketEventReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
}

// Dashboard-specific Types
export interface DashboardWebSocketState {
  agents: any[];
  statuses: Record<string, any>;
  events: any[];
  metrics: any | null;
  alerts: any[];
  resourceUsage: any;
  filters: any;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  connected: boolean;
}

export interface UseDashboardWebSocketReturn extends UseWebSocketReturn {
  dashboardState: DashboardWebSocketState;
  setDashboardState: (state: DashboardWebSocketState | ((prev: DashboardWebSocketState) => DashboardWebSocketState)) => void;
  refreshData: () => void;
  updateFilters: (filters: any) => void;
}
