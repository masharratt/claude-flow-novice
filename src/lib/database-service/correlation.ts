// Stub: database correlation support
// Created to satisfy test imports

export interface CorrelationMetadata {
  correlationId: string;
  timestamp: number;
  source: string;
  metadata?: Record<string, unknown>;
}

export class CorrelationTracker {
  private correlations: Map<string, CorrelationMetadata> = new Map();

  track(correlationId: string, metadata: Partial<CorrelationMetadata>): void {
    this.correlations.set(correlationId, {
      correlationId,
      timestamp: Date.now(),
      source: metadata.source || 'unknown',
      metadata: metadata.metadata,
    });
  }

  get(correlationId: string): CorrelationMetadata | undefined {
    return this.correlations.get(correlationId);
  }

  clear(correlationId: string): void {
    this.correlations.delete(correlationId);
  }
}
