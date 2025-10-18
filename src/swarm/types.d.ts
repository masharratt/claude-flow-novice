// Placeholder for agent system types
export type AgentId = { id: string };
export type AgentType = string;
export type AgentStatus = 'idle' | 'busy' | 'error' | 'initializing' | 'stopped';

export interface AgentState {
  id: AgentId;
  name: string;
  type: AgentType;
  status: AgentStatus;
  health: number;
  workload: number;
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    successRate: number;
    lastActivity: Date;
    totalUptime: number;
  };
  capabilities: {
    languages: string[];
    frameworks: string[];
    domains: string[];
    tools: string[];
    maxConcurrentTasks: number;
  };
}