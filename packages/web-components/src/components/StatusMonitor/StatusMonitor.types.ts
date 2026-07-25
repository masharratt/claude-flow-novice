/**
 * StatusMonitor Component Types
 * Unified type definitions for status monitoring across all portals
 */

export type StatusType = 'idle' | 'active' | 'busy' | 'paused' | 'error' | 'terminated' | 'offline';
export type StatusSeverity = 'success' | 'warning' | 'error' | 'info';
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

/**
 * Core status item representing an agent, task, or process
 */
export interface StatusItem {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Current status */
  status: StatusType;
  /** Health percentage (0-100) */
  health: number;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current activity description */
  activity?: string;
  /** Connection status */
  connectionStatus?: ConnectionStatus;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Last heartbeat timestamp */
  lastHeartbeat?: Date;
  /** Estimated completion time */
  estimatedCompletion?: Date;

  /** Performance metrics */
  metrics?: {
    tasksCompleted?: number;
    averageTime?: number;
    efficiency?: number;
    successRate?: number;
    tokensUsed?: number;
    tokenUsageRate?: number;
  };

  /** Resource usage */
  resources?: {
    cpu: number;
    memory: number;
    memoryUsage?: number;
    network?: number;
  };

  /** Current task/message */
  currentTask?: {
    id: string;
    description: string;
    type?: string;
    startTime: Date;
    progress: number;
    estimatedCompletion?: Date;
  };

  /** Recent errors */
  errors?: StatusError[];

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Error information
 */
export interface StatusError {
  /** Error message */
  message: string;
  /** Error severity */
  severity: 'critical' | 'error' | 'warning';
  /** Timestamp when error occurred */
  timestamp: Date;
  /** Error code (optional) */
  code?: string;
  /** Stack trace (optional) */
  stack?: string;
}

/**
 * Filter configuration
 */
export interface StatusFilter {
  /** Filter by status types */
  statuses?: StatusType[];
  /** Filter by minimum health */
  minHealth?: number;
  /** Filter by connection status */
  connectionStatus?: ConnectionStatus[];
  /** Show only items with errors */
  errorsOnly?: boolean;
  /** Search query for name/activity */
  search?: string;
}

/**
 * Sort configuration
 */
export interface StatusSort {
  /** Field to sort by */
  field: 'name' | 'status' | 'health' | 'progress' | 'lastActivity';
  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Summary statistics
 */
export interface StatusSummary {
  /** Total items */
  total: number;
  /** Active items */
  active: number;
  /** Idle items */
  idle: number;
  /** Paused items */
  paused: number;
  /** Error items */
  error: number;
  /** Terminated items */
  terminated: number;
  /** Offline items */
  offline: number;
  /** Items with errors */
  withErrors: number;
  /** Average progress */
  avgProgress: number;
  /** Average health */
  avgHealth: number;
  /** Total tokens (if applicable) */
  totalTokens?: number;
  /** Average CPU usage */
  avgCpuUsage?: number;
  /** Average memory usage */
  avgMemoryUsage?: number;
}

/**
 * StatusMonitor component props
 */
export interface StatusMonitorProps {
  /** Status items to display */
  items: StatusItem[];
  /** Selected item ID */
  selectedId?: string;
  /** Callback when item is selected */
  onItemSelect?: (id: string) => void;
  /** Callback for refresh action */
  onRefresh?: (id?: string) => void;
  /** Enable auto-refresh */
  autoRefresh?: boolean;
  /** Auto-refresh interval in milliseconds */
  refreshInterval?: number;
  /** Initial filter configuration */
  filter?: StatusFilter;
  /** Initial sort configuration */
  sort?: StatusSort;
  /** Maximum cards per row (1-4) */
  maxCardsPerRow?: 1 | 2 | 3 | 4;
  /** Show summary statistics */
  showSummary?: boolean;
  /** Show filter controls */
  showFilters?: boolean;
  /** Show sort controls */
  showSort?: boolean;
  /** Compact mode (smaller cards) */
  compact?: boolean;
  /** Custom CSS class */
  className?: string;
  /** WebSocket URL for real-time updates */
  websocketUrl?: string;
  /** Enable real-time updates */
  enableRealTime?: boolean;
}

/**
 * Status card action
 */
export interface StatusAction {
  /** Action ID */
  id: string;
  /** Action label */
  label: string;
  /** Action icon (Material-UI icon name) */
  icon?: string;
  /** Action handler */
  handler: (item: StatusItem) => void;
  /** Disabled condition */
  disabled?: (item: StatusItem) => boolean;
  /** Color variant */
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
}
