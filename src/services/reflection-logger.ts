// Stub: reflection logger service
// Created to satisfy test imports

export interface ReflectionEntry {
  id: string;
  timestamp: Date;
  type: 'debug' | 'info' | 'analysis';
  message: string;
  metadata?: Record<string, unknown>;
}

export class ReflectionLogger {
  private entries: ReflectionEntry[] = [];

  log(type: ReflectionEntry['type'], message: string, metadata?: Record<string, unknown>): void {
    this.entries.push({
      id: `refl-${Date.now()}`,
      timestamp: new Date(),
      type,
      message,
      metadata,
    });
  }

  getEntries(): ReflectionEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
