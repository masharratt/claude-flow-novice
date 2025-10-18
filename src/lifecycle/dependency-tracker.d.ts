// Placeholder for dependency tracker types
export enum DependencyType {
  COMPLETION = 'COMPLETION',
  RESOURCE = 'RESOURCE',
  COMMUNICATION = 'COMMUNICATION'
}

export interface DependencyTrackerOptions {
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export interface CompletionBlockerInfo {
  canComplete: boolean;
  reason?: string;
  blockedBy?: string[];
}

export interface DependencyViolation {
  message: string;
  affectedAgents: string[];
}

export interface DependencyTracker {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  registerDependency(
    dependentAgentId: string,
    providerAgentId: string,
    type: DependencyType,
    options?: DependencyTrackerOptions
  ): Promise<string>;
  removeDependency(dependencyId: string): Promise<boolean>;
  getDependentAgents(providerAgentId: string): string[];
  getAgentDependencies(agentId: string): Array<{id: string; providerAgentId: string}>;
  canAgentComplete(agentId: string): Promise<CompletionBlockerInfo>;
  forceAgentCompletion(agentId: string, reason: string): Promise<boolean>;

  emit(event: string, data: any): void;
  on(event: string, listener: (data: any) => void): void;
}