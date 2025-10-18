// Core swarm types for visualization system

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'processing' | 'error';
  confidence: number;
  currentTask?: string;
  processingTime: number;
  memoryUsage: number;
  lastUpdate: Date;
  position?: { x: number; y: number };
  connections?: string[];
  velocity?: { x: number; y: number };
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  assignedTo?: string[];
  progress: number;
  startTime: Date;
  estimatedDuration: number;
  actualDuration?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  dependencies?: string[];
  position?: { x: number; y: number };
}

export interface SwarmMetrics {
  totalAgents: number;
  activeAgents: number;
  completedTasks: number;
  totalTasks: number;
  averageConfidence: number;
  systemHealth: number;
  processingTime: number;
  memoryUsage: number;
  networkLatency: number;
}

export interface PerformanceMetrics {
  timestamp: number;
  agents: {
    total: number;
    active: number;
    processing: number;
    idle: number;
    error: number;
  };
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    failed: number;
  };
  performance: {
    processingTime: number;
    networkLatency: number;
    throughput: number;
    successRate: number;
    averageConfidence: number;
  };
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    networkUsage: number;
    diskUsage: number;
  };
  quality: {
    codeQuality: number;
    testCoverage: number;
    securityScore: number;
    performanceScore: number;
  };
}

export interface Connection {
  source: string;
  target: string;
  strength: number;
  type: 'collaboration' | 'dependency' | 'assignment';
  animated?: boolean;
}

export interface SwarmVisualizationData {
  agents: Agent[];
  tasks: Task[];
  metrics: SwarmMetrics;
}

export interface WebSocketMessage {
  type: string;
  swarmId?: string;
  data?: any;
  timestamp?: string;
  agentId?: string;
  taskId?: string;
  updates?: any;
  agents?: Agent[];
  tasks?: Task[];
  metrics?: SwarmMetrics;
  connectionId?: string;
}

export interface NetworkNode {
  id: string;
  type: 'agent' | 'task';
  position: { x: number; y: number };
  data: Agent | Task;
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  type: 'collaboration' | 'dependency' | 'assignment';
  strength: number;
  animated?: boolean;
}

export interface NetworkLayout {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface SwarmEvent {
  id: string;
  type: 'agent-created' | 'agent-updated' | 'task-created' | 'task-updated' | 'swarm-status-changed';
  timestamp: Date;
  swarmId: string;
  data: any;
  severity: 'info' | 'warning' | 'error' | 'success';
}

export interface AgentPerformance {
  agentId: string;
  timestamp: number;
  processingTime: number;
  memoryUsage: number;
  confidence: number;
  tasksCompleted: number;
  tasksInProgress: number;
  errorCount: number;
}

export interface TaskPerformance {
  taskId: string;
  timestamp: number;
  progress: number;
  processingTime: number;
  assignedAgents: string[];
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  quality: {
    codeQuality?: number;
    testCoverage?: number;
    securityScore?: number;
  };
}

export interface SystemHealth {
  overall: number;
  components: {
    websocket: number;
    redis: number;
    agents: number;
    tasks: number;
  };
  alerts: {
    level: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    timestamp: Date;
  }[];
}

export interface VisualizationSettings {
  theme: 'light' | 'dark' | 'auto';
  layout: 'force' | 'hierarchical' | 'circular';
  showLabels: boolean;
  showConnections: boolean;
  animationSpeed: number;
  updateFrequency: number;
  maxDataPoints: number;
  colorScheme: 'default' | 'high-contrast' | 'colorblind-friendly';
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'png' | 'svg';
  includeHistoricalData: boolean;
  timeRange?: {
    start: Date;
    end: Date;
  };
  filters?: {
    agentTypes?: string[];
    taskStatuses?: string[];
  };
}

export interface SwarmVisualizationState {
  swarmId: string;
  isConnected: boolean;
  lastUpdate: Date | null;
  connectionError: string | null;
  reconnectAttempts: number;
  agents: Agent[];
  tasks: Task[];
  metrics: SwarmMetrics;
  historicalData: PerformanceMetrics[];
  events: SwarmEvent[];
  settings: VisualizationSettings;
}

// Utility types for React components
export type AgentStatus = Agent['status'];
export type TaskStatus = Task['status'];
export type ConnectionType = Connection['type'];
export type LayoutMode = VisualizationSettings['layout'];
export type Theme = VisualizationSettings['theme'];