// Stub: correlation utilities
// Created to satisfy test imports

export function generateCorrelationId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function extractCorrelationId(headers: Record<string, string>): string | undefined {
  return headers['x-correlation-id'] || headers['correlation-id'];
}

export class CorrelationContext {
  private static correlationId: string | null = null;

  static set(id: string): void {
    this.correlationId = id;
  }

  static get(): string | null {
    return this.correlationId;
  }

  static clear(): void {
    this.correlationId = null;
  }
}
