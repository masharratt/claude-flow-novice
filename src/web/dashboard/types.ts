/**
 * Dashboard Types for Agent Lifecycle Transparency System
 * TypeScript interfaces and type definitions for the React dashboard
 */

export interface AgentHierarchyNode {
  agentId: string;
  type: string;
  level: number;
  parentAgentId?: string;
  childAgentIds: string[];
  priority: number;
  state: AgentState;
  sessionId: string;
  createdAt: Date;
  lastStateChange: Date;
  tokensUsed: number;
  tokenBudget: number;
  isPaused: boolean;
  metrics: AgentMetrics;
  currentTask?: string;
  waitingFor: string[];
  completedDependencies: string[];
}

export type AgentState =
  | 'idle'
  | 'active'
  | 'paused'
  | 'terminated'
  | 'error'
  | 'spawning'
  | 'checkpointing';

export interface AgentMetrics {
  spawnTimeMs: number;
  totalExecutionTimeMs: number;
  pauseCount: number;
  resumeCount: number;
  checkpointCount: number;
}

export interface AgentStatus {
  agentId: string;
  state: AgentState;
  isPaused: boolean;
  activity: string;
  progress: number;
  estimatedCompletion?: Date;
  tokensUsed: number;
  tokenUsageRate: number;
  memoryUsage: number;
  cpuUsage: number;
  lastHeartbeat: Date;
  currentMessage?: AgentMessage;
  recentErrors: AgentError[];
}

export interface AgentMessage {
  uuid: string;
  type: string;
  startedAt: Date;
  estimatedDuration?: number;
}

export interface AgentError {
  timestamp: Date;
  error: string;
  severity: 'warning' | 'error' | 'critical';
}

export interface AgentLifecycleEvent {
  eventId: string;
  timestamp: Date;
  agentId: string;
  eventType: LifecycleEventType;
  eventData: LifecycleEventData;
  level: number;
  parentAgentId?: string;
  sessionId: string;
  tokensUsed: number;
  performanceImpact: PerformanceImpact;
}

export type LifecycleEventType =
  | 'spawned'
  | 'paused'
  | 'resumed'
  | 'terminated'
  | 'checkpoint_created'
  | 'checkpoint_restored'
  | 'state_changed'
  | 'task_assigned'
  | 'task_completed'
  | 'error_occurred';

export interface LifecycleEventData {
  reason?: string;
  previousState?: AgentState;
  newState?: AgentState;
  checkpointId?: string;
  taskDescription?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceImpact {
  duration?: number;
  memoryDelta?: number;
  tokenCost?: number;
}

export interface TransparencyMetrics {
  totalAgents: number;
  agentsByLevel: Record<number, number>;
  agentsByState: Record<AgentState, number>;
  agentsByType: Record<string, number>;
  totalTokensConsumed: number;
  totalTokensSaved: number;
  averageExecutionTimeMs: number;
  failureRate: number;
  averagePauseResumeLatencyMs: number;
  hierarchyDepth: number;
  dependencyResolutionRate: number;
  eventStreamStats: EventStreamStats;
}

export interface EventStreamStats {
  totalEvents: number;
  eventsPerSecond: number;
  eventTypes: Record<string, number>;
}

export interface HierarchyAnalytics {
  depth: number;
  branchingFactor: number;
  balance: number;
  efficiency: number;
}

export interface DashboardConfig {
  refreshInterval: number;
  maxEvents: number;
  enableAnimations: boolean;
  theme: 'light' | 'dark' | 'auto';
  autoRefresh: boolean;
}

export interface WebSocketMessage {
  type: 'agent_update' | 'hierarchy_change' | 'metrics_update' | 'event_stream' | 'error';
  timestamp: Date;
  payload: any;
}

export interface ResourceUsage {
  memoryUsage: number;
  cpuUsage: number;
  networkLatency: number;
  diskUsage: number;
  gpuUsage?: number;
}

export interface PerformanceAlert {
  id: string;
  agentId: string;
  type: AlertType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  value: number;
  threshold: number;
  recommendations: string[];
}

export type AlertType =
  | 'memory_usage'
  | 'cpu_usage'
  | 'token_usage_rate'
  | 'execution_time'
  | 'pause_resume_latency'
  | 'error_rate'
  | 'quality_degradation';

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
}

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: string;
  title: string;
  description?: string;
  agentId?: string;
  severity?: 'info' | 'warning' | 'error' | 'success';
  metadata?: Record<string, any>;
}

export interface FilterOptions {
  agentTypes?: string[];
  states?: AgentState[];
  levels?: number[];
  timeRange?: {
    start: Date;
    end: Date;
  };
  eventTypes?: LifecycleEventType[];
  searchQuery?: string;
}

export interface DashboardState {
  agents: AgentHierarchyNode[];
  statuses: Record<string, AgentStatus>;
  events: AgentLifecycleEvent[];
  metrics: TransparencyMetrics | null;
  alerts: PerformanceAlert[];
  resourceUsage: ResourceUsage;
  filters: FilterOptions;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  connected: boolean;
}

export interface ComponentProps {
  config: DashboardConfig;
  data: DashboardState;
  onFilterChange?: (filters: FilterOptions) => void;
  onAgentSelect?: (agentId: string) => void;
  onEventSelect?: (eventId: string) => void;
  onAlertDismiss?: (alertId: string) => void;
}

export interface WebSocketStatus {
  connected: boolean;
  reconnectAttempts: number;
  lastConnected?: Date;
  lastMessage?: Date;
  error?: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface HierarchyResponse extends ApiResponse<AgentHierarchyNode[]> {
  metrics?: HierarchyAnalytics;
}

export interface StatusResponse extends ApiResponse<Record<string, AgentStatus>> {
  summary?: {
    total: number;
    active: number;
    idle: number;
    error: number;
  };
}

export interface EventsResponse extends ApiResponse<AgentLifecycleEvent[]> {
  totalCount: number;
  hasMore: boolean;
}

export interface MetricsResponse extends ApiResponse<TransparencyMetrics> {
  resourceUsage?: ResourceUsage;
  alerts?: PerformanceAlert[];
}