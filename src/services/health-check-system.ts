// Stub: health check system
// Created to satisfy test imports

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  timestamp: Date;
}

export class HealthCheckSystem {
  private checks: Map<string, HealthCheck> = new Map();

  registerCheck(name: string, checkFn: () => Promise<HealthCheck>): void {
    // Stub implementation
  }

  async runChecks(): Promise<HealthCheck[]> {
    // Stub implementation
    return Array.from(this.checks.values());
  }

  async getStatus(): Promise<'healthy' | 'unhealthy' | 'degraded'> {
    // Stub implementation
    return 'healthy';
  }
}
