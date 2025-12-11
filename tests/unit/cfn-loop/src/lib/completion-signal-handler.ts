// Stub: completion signal handler
// Created to satisfy test imports

export type SignalType = 'success' | 'failure' | 'timeout';

export interface CompletionSignal {
  type: SignalType;
  agentId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export class CompletionSignalHandler {
  private signals: Map<string, CompletionSignal> = new Map();

  async sendSignal(agentId: string, type: SignalType, metadata?: Record<string, unknown>): Promise<void> {
    const signal: CompletionSignal = {
      type,
      agentId,
      timestamp: new Date(),
      metadata,
    };
    this.signals.set(agentId, signal);
  }

  async waitForSignal(agentId: string, timeoutMs: number = 30000): Promise<CompletionSignal | null> {
    // Stub implementation - just return immediately
    return this.signals.get(agentId) || null;
  }

  clearSignal(agentId: string): void {
    this.signals.delete(agentId);
  }
}
