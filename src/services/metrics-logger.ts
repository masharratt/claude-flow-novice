// Stub: metrics logger service
// Created to satisfy test imports

export interface Metric {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp: Date;
}

export class MetricsLogger {
  private metrics: Metric[] = [];

  log(name: string, value: number, unit?: string, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      unit,
      tags,
      timestamp: new Date(),
    });
  }

  getMetrics(name?: string): Metric[] {
    if (name) {
      return this.metrics.filter((m) => m.name === name);
    }
    return [...this.metrics];
  }

  clear(): void {
    this.metrics = [];
  }
}
