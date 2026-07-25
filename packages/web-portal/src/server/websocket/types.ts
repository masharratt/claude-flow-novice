/**
 * WebSocket Server Types
 */

import { Socket } from 'socket.io';

// Server Configuration
export interface SocketIOServerConfig {
  path?: string;
  corsOrigin?: string | string[];
  jwtSecret?: string;
  apiKeys?: string[];
  pingTimeout?: number;
  pingInterval?: number;
  maxHttpBufferSize?: number;
  maxConnectionsPerIP?: number;
  enableDebug?: boolean;
  eventThrottle?: EventThrottleConfig;
}

// Event Throttle Configuration
export interface EventThrottleConfig {
  metrics_update?: number; // ms between emissions
  agent_update?: number; // ms between emissions per agent
  [key: string]: number | undefined;
}

// Authenticated Socket
export interface AuthenticatedSocket extends Socket {
  userId?: string;
  role?: 'user' | 'admin' | 'api' | 'guest';
  authenticated: boolean;
}

// Connection Metrics
export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  totalMessages: number;
  messagesPerSecond: number;
  bytesReceived: number;
  bytesSent: number;
  errors: number;
  rejectedConnections: number;
  averageLatency: number;
  uptime: number;
}

// Room Subscription
export interface RoomSubscription {
  socketId: string;
  room: string;
  joinedAt: Date;
}

// Event Payload Types
export interface EventPayload {
  agent_update: {
    status: 'spawned' | 'running' | 'paused' | 'completed' | 'failed' | 'terminated';
    confidence?: number;
    tasks?: Array<{ id: string; status: string; progress: number }>;
    health?: {
      cpu: number;
      memory: number;
      uptime: number;
    };
  };

  hierarchy_change: {
    type: 'spawn' | 'terminate' | 'reparent';
    agentId: string;
    parentId?: string;
    newParentId?: string;
    metadata?: Record<string, any>;
  };

  metrics_update: {
    system: {
      cpu: number;
      memory: number;
      disk: number;
      network: {
        bytesIn: number;
        bytesOut: number;
      };
    };
    agents: {
      total: number;
      active: number;
      idle: number;
      failed: number;
    };
    swarms?: {
      total: number;
      active: number;
    };
  };

  error: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    agentId?: string;
    stack?: string;
  };

  notification: {
    type: 'info' | 'warning' | 'success' | 'error';
    title: string;
    message: string;
    action?: {
      label: string;
      url: string;
    };
  };
}

// System Metrics Type
export interface SystemMetrics {
  system: {
    cpu: number;
    memory: number;
    disk: number;
    network: {
      bytesIn: number;
      bytesOut: number;
    };
  };
  agents: {
    total: number;
    active: number;
    idle: number;
    failed: number;
  };
  swarms?: {
    total: number;
    active: number;
  };
  timestamp: Date;
}

// Agent Status Type
export interface AgentStatus {
  agentId: string;
  status: 'spawned' | 'running' | 'paused' | 'completed' | 'failed' | 'terminated';
  confidence?: number;
  tasks?: Array<{ id: string; status: string; progress: number }>;
  health?: {
    cpu: number;
    memory: number;
    uptime: number;
  };
  timestamp: Date;
}

// Hierarchy Event Type
export interface HierarchyEvent {
  type: 'spawn' | 'terminate' | 'reparent';
  agentId: string;
  parentId?: string;
  newParentId?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

// Error Event Type
export interface ErrorEvent {
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  agentId?: string;
  stack?: string;
  timestamp: Date;
}

// Notification Event Type
export interface NotificationEvent {
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  action?: {
    label: string;
    url: string;
  };
  timestamp: Date;
}
