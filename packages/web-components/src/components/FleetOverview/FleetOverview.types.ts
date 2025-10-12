/**
 * FleetOverview Component Types
 * Type definitions for fleet management dashboard
 */

/**
 * Agent status types
 */
export type AgentStatus = 'idle' | 'active' | 'busy' | 'paused' | 'error' | 'terminated' | 'offline';

/**
 * Connection status types
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

/**
 * View mode for fleet display
 */
export type ViewMode = 'grid' | 'list';

/**
 * Sort field options
 */
export type SortField = 'name' | 'status' | 'created' | 'lastActivity' | 'efficiency';

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Agent resource metrics
 */
export interface AgentResources {
  cpu: number;
  memory: number;
  memoryUsage?: number;
}

/**
 * Agent performance metrics
 */
export interface AgentMetrics {
  tokensUsed: number;
  tasksCompleted: number;
  efficiency: number;
  uptime?: number;
}

/**
 * Agent error record
 */
export interface AgentError {
  message: string;
  timestamp: Date;
  severity: 'warning' | 'error' | 'critical';
}

/**
 * Agent data structure
 */
export interface Agent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  connectionStatus: ConnectionStatus;
  activity?: string;
  progress: number;
  health: number;
  resources?: AgentResources;
  metrics?: AgentMetrics;
  errors?: AgentError[];
  created: Date;
  lastActivity: Date;
  estimatedCompletion?: Date;
  swarmId?: string;
  avatar?: string;
}

/**
 * Fleet statistics summary
 */
export interface FleetStatistics {
  total: number;
  active: number;
  idle: number;
  paused: number;
  error: number;
  terminated: number;
  offline: number;
  avgHealth: number;
  avgEfficiency: number;
  totalTokens: number;
  totalTasks: number;
}

/**
 * Filter options for agents
 */
export interface FleetFilter {
  status?: AgentStatus[];
  connectionStatus?: ConnectionStatus[];
  swarmId?: string;
  search?: string;
  minHealth?: number;
  errorsOnly?: boolean;
}

/**
 * Sort configuration
 */
export interface FleetSort {
  field: SortField;
  direction: SortDirection;
}

/**
 * Pagination configuration
 */
export interface FleetPagination {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
}

/**
 * FleetOverview component props
 */
export interface FleetOverviewProps {
  /** List of agents to display */
  agents: Agent[];

  /** Selected agent ID */
  selectedAgentId?: string;

  /** Callback when agent is selected */
  onAgentSelect?: (agentId: string) => void;

  /** Callback to refresh fleet data */
  onRefresh?: () => void | Promise<void>;

  /** Enable auto-refresh */
  autoRefresh?: boolean;

  /** Auto-refresh interval in milliseconds */
  refreshInterval?: number;

  /** Initial filter configuration */
  filter?: FleetFilter;

  /** Initial sort configuration */
  sort?: FleetSort;

  /** Initial view mode */
  viewMode?: ViewMode;

  /** Enable pagination */
  enablePagination?: boolean;

  /** Initial page size for pagination */
  pageSize?: number;

  /** Enable virtual scrolling (for large fleets) */
  enableVirtualScrolling?: boolean;

  /** Show fleet statistics summary */
  showStatistics?: boolean;

  /** Show filters */
  showFilters?: boolean;

  /** Show sort controls */
  showSort?: boolean;

  /** Show view mode toggle */
  showViewToggle?: boolean;

  /** Compact mode (less spacing) */
  compact?: boolean;

  /** Custom CSS class */
  className?: string;

  /** WebSocket URL for real-time updates */
  websocketUrl?: string;

  /** Enable real-time updates via WebSocket */
  enableRealTime?: boolean;

  /** Loading state */
  loading?: boolean;

  /** Error state */
  error?: string;

  /** Callback for agent actions (pause, resume, terminate) */
  onAgentAction?: (agentId: string, action: 'pause' | 'resume' | 'terminate') => void;
}

/**
 * Agent card component props
 */
export interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onAction?: (action: 'pause' | 'resume' | 'terminate') => void;
}

/**
 * Fleet statistics card props
 */
export interface FleetStatisticsProps {
  statistics: FleetStatistics;
  compact?: boolean;
}
