/**
 * Basic agent types for novice users
 */

export enum AgentType {
  RESEARCHER = 'researcher',
  CODER = 'coder',
  REVIEWER = 'reviewer',
  PLANNER = 'planner'
}

export interface AgentConfig {
  id: string;
  type: AgentType;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created: Date;
  result?: string;
}

export interface ProjectConfig {
  name: string;
  description: string;
  agents: AgentConfig[];
  created: Date;
}