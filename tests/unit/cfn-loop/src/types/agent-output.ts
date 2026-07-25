// Stub: agent output types
// Created to satisfy test imports

export interface AgentOutput {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResponse {
  agentId: string;
  output: AgentOutput;
  timestamp: Date;
}

export type OutputStatus = 'success' | 'error' | 'timeout';

export interface OutputMetadata {
  duration?: number;
  retries?: number;
  [key: string]: unknown;
}
