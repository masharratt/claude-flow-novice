/**
 * API Types for Claude Flow Novice Web Portal
 *
 * This file contains all TypeScript types for API requests and responses
 * used by the unified ApiClient service and React Query hooks.
 */

// ============================================================================
// Common Types
// ============================================================================

export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  meta: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentNode {
  id: string;
  name: string;
  type: string;
  status: 'spawned' | 'in_progress' | 'completed' | 'failed' | 'idle';
  capabilities: string[];
  spawned_at: string;
  last_active?: string;
  completed_at?: string;
  parent_id?: string;
  children?: AgentNode[];
  confidence?: number;
  task?: string;
}

export interface AgentHierarchyResponse {
  hierarchy: AgentNode[];
  total_agents: number;
  active_agents: number;
  topology: 'mesh' | 'hierarchical';
}

export interface AgentStatusResponse {
  agent: AgentNode;
  metrics: {
    tasks_completed: number;
    avg_confidence: number;
    uptime_seconds: number;
    last_heartbeat: string;
  };
  current_task?: {
    id: string;
    description: string;
    started_at: string;
    progress: number;
  };
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface SystemMetrics {
  cpu: {
    usage_percent: number;
    cores: number;
  };
  memory: {
    used_mb: number;
    total_mb: number;
    usage_percent: number;
  };
  agents: {
    total: number;
    active: number;
    idle: number;
    failed: number;
  };
  swarms: {
    total: number;
    active: number;
    completed: number;
  };
  tasks: {
    completed: number;
    in_progress: number;
    pending: number;
    failed: number;
  };
  redis: {
    connected: boolean;
    keys: number;
    memory_mb: number;
  };
  sqlite: {
    size_mb: number;
    total_records: number;
  };
  timestamp: string;
}

export interface MetricsResponse {
  metrics: SystemMetrics;
}

// ============================================================================
// Event Types
// ============================================================================

export interface Event {
  id: string;
  type: string;
  agent_id?: string;
  swarm_id?: string;
  data: Record<string, unknown>;
  priority: number;
  timestamp: string;
  created_at: string;
}

export interface EventsParams extends PaginationParams {
  type?: string;
  agent_id?: string;
  swarm_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface EventsResponse {
  events: Event[];
}

// ============================================================================
// Resource Types
// ============================================================================

export interface ResourceUtilization {
  agent_id: string;
  agent_name: string;
  agent_type: string;
  cpu_percent: number;
  memory_mb: number;
  uptime_seconds: number;
  task_count: number;
  status: string;
  last_updated: string;
}

export interface ResourcesResponse {
  resources: ResourceUtilization[];
  summary: {
    total_cpu_percent: number;
    total_memory_mb: number;
    avg_cpu_percent: number;
    avg_memory_mb: number;
  };
}

// ============================================================================
// Intervention Types
// ============================================================================

export interface InterventionRequest {
  action: 'pause' | 'resume' | 'terminate' | 'restart' | 'update_config';
  reason?: string;
  config?: Record<string, unknown>;
}

export interface InterventionResponse {
  agent_id: string;
  action: string;
  status: 'success' | 'failed' | 'pending';
  message: string;
  applied_at: string;
}

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime_seconds: number;
  services: {
    api: boolean;
    redis: boolean;
    sqlite: boolean;
    websocket: boolean;
  };
  timestamp: string;
}

// ============================================================================
// Filter Types
// ============================================================================

export interface AgentFilters {
  status?: AgentNode['status'] | AgentNode['status'][];
  type?: string | string[];
  search?: string;
}

export interface MetricsFilters {
  start_date?: string;
  end_date?: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '24h';
}

// ============================================================================
// Query Key Factory (for React Query)
// ============================================================================

export const queryKeys = {
  agents: {
    hierarchy: (filters?: AgentFilters) => ['agents', 'hierarchy', filters] as const,
    status: (agentId: string) => ['agents', 'status', agentId] as const,
  },
  metrics: {
    all: (filters?: MetricsFilters) => ['metrics', filters] as const,
  },
  events: {
    list: (params?: EventsParams) => ['events', params] as const,
  },
  resources: {
    all: () => ['resources'] as const,
  },
  health: {
    check: () => ['health'] as const,
  },
} as const;
