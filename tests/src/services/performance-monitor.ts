// Stub: performance monitor service
// Created to satisfy test imports

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface MonitoringConfig {
  enabled: boolean;
  sampleRate?: number;
  aggregationInterval?: number;
}

export class PerformanceMonitor {
  private config: MonitoringConfig;
  private metrics: PerformanceMetric[] = [];

  constructor(config: MonitoringConfig) {
    this.config = config;
  }

  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    if (!this.config.enabled) return;

    this.metrics.push({
      name,
      value,
      timestamp: new Date(),
      tags,
    });
  }

  getMetrics(name?: string): PerformanceMetric[] {
    if (name) {
      return this.metrics.filter((m) => m.name === name);
    }
    return [...this.metrics];
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  async start(): Promise<void> {
    // Stub implementation
  }

  async stop(): Promise<void> {
    // Stub implementation
  }
}
