/**
 * AgentHierarchyTree Type Definitions
 * Consolidated type definitions from 4 source implementations
 */

/**
 * Agent state enumeration
 */
export type AgentState =
  | 'active'
  | 'idle'
  | 'busy'
  | 'paused'
  | 'error'
  | 'terminated'
  | 'ready'
  | 'working'
  | 'completed'
  | 'failed'
  | 'degraded'
  | 'offline'
  | 'initializing';

/**
 * Agent type enumeration
 */
export type AgentType =
  | 'coordinator'
  | 'orchestrator'
  | 'coder'
  | 'tester'
  | 'reviewer'
  | 'security-specialist'
  | 'architect'
  | 'backend-dev'
  | 'frontend-dev'
  | 'devops-engineer'
  | 'planner'
  | 'researcher'
  | 'mobile-dev'
  | 'cicd-engineer'
  | 'api-docs'
  | 'perf-analyzer';

/**
 * Agent metrics data structure
 */
export interface AgentMetrics {
  /** Agent spawn time in milliseconds */
  spawnTimeMs?: number;
  /** Total execution time in milliseconds */
  totalExecutionTimeMs?: number;
  /** Number of pause events */
  pauseCount?: number;
  /** Number of resume events */
  resumeCount?: number;
  /** Number of checkpoint saves */
  checkpointCount?: number;
  /** Success rate (0-1) */
  successRate?: number;
  /** Average response time in milliseconds */
  avgResponseTime?: number;
  /** Number of completed tasks */
  tasksCompleted?: number;
}

/**
 * Agent hierarchy node data structure
 * Unified interface combining all 4 source implementations
 */
export interface AgentHierarchyNode {
  /** Unique agent identifier */
  agentId: string;
  /** Display name for the agent */
  name?: string;
  /** Agent type/role */
  type: AgentType | string;
  /** Current agent state */
  state: AgentState;
  /** Hierarchy level (0 = root) */
  level: number;
  /** Priority level (higher = more important) */
  priority?: number;
  /** Session identifier */
  sessionId?: string;
  /** Parent agent ID (if not root) */
  parentAgentId?: string;
  /** Child agent IDs */
  childAgentIds: string[];
  /** Creation timestamp */
  createdAt?: Date;
  /** Last state change timestamp */
  lastStateChange?: Date;
  /** Current task description */
  currentTask?: string;
  /** Tokens consumed by this agent */
  tokensUsed?: number;
  /** Token budget allocation */
  tokenBudget?: number;
  /** Pause state flag */
  isPaused?: boolean;
  /** Performance metrics */
  metrics?: AgentMetrics;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Number of tasks */
  taskCount?: number;
  /** Health score (0-100) */
  health?: number;
  /** Agent dependencies (waiting for) */
  waitingFor?: string[];
  /** Completed dependencies */
  completedDependencies?: string[];
  /** Custom position for visualization */
  position?: { x: number; y: number };
  /** Child nodes (for tree structure) */
  children?: AgentHierarchyNode[];
}

/**
 * Component properties for AgentHierarchyTree
 */
export interface AgentHierarchyTreeProps {
  /** Array of agent nodes or root node */
  agents?: AgentHierarchyNode[];
  /** Root node for hierarchical data (alternative to agents array) */
  data?: AgentHierarchyNode;
  /** Callback when agent is selected */
  onAgentSelect?: (agentId: string) => void;
  /** Callback when node is clicked */
  onNodeClick?: (node: AgentHierarchyNode) => void;
  /** Callback when node is hovered */
  onNodeHover?: (node: AgentHierarchyNode | null) => void;
  /** Maximum tree height in pixels */
  maxHeight?: number;
  /** Width for visualization mode */
  width?: number;
  /** Height for visualization mode */
  height?: number;
  /** Show metrics in tree nodes */
  showMetrics?: boolean;
  /** Filter by specific hierarchy levels */
  filterByLevel?: number[];
  /** Filter by agent states */
  filterByState?: AgentState[];
  /** Search query for filtering */
  searchQuery?: string;
  /** Enable real-time updates */
  realTimeUpdates?: boolean;
  /** Update interval in milliseconds */
  updateInterval?: number;
  /** Theme mode */
  theme?: 'light' | 'dark';
  /** Enable animations */
  animationsEnabled?: boolean;
  /** Visualization mode */
  mode?: 'tree' | 'graph' | 'd3';
  /** Custom CSS class */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
}

/**
 * Tree node component properties (internal)
 */
export interface TreeNodeProps {
  /** Node data */
  node: AgentHierarchyNode;
  /** Depth level */
  level: number;
  /** Click handler */
  onNodeClick?: (node: AgentHierarchyNode) => void;
  /** Selected node ID */
  selectedNodeId?: string;
  /** Set of expanded node IDs */
  expandedNodes: Set<string>;
  /** Toggle expansion handler */
  onToggleExpand: (nodeId: string) => void;
  /** Show metrics flag */
  showMetrics?: boolean;
}
