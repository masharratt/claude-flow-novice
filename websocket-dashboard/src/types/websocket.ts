export interface SwarmEvent {
  type: string;
  swarmId: string;
  timestamp: string;
  agentId?: string;
  status?: string;
  data?: any;
}

export interface AgentStatus {
  id: string;
  type: string;
  status: 'idle' | 'active' | 'completed' | 'error';
  currentTask?: string;
  confidence?: number;
  loopNumber?: number;
  iteration?: number;
}

export interface SwarmInfo {
  id: string;
  epicGoal: string;
  mode: string;
  status: 'active' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  currentIteration: number;
  maxIterations: number;
  agents: AgentStatus[];
}

export interface WebSocketMessage {
  type: 'initial-swarms' | 'request-swarms' | 'swarms-list' | 'swarm-event';
  payload: any;
  timestamp: string;
}
