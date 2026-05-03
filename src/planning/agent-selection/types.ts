export type AgentRole = 'loop3' | 'loop2';

export interface SubstitutionContext {
  failedAgent: string;
  category: string;
  role: AgentRole;
  excludedAgents: string[];
}

export interface SubstitutionResult {
  substitute: string | null;
  cost: number;
  reachable: boolean;
}
