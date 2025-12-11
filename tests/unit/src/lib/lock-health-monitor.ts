// Stub: lock health monitor
// Created to satisfy test imports

export interface LockHealth {
  lockId: string;
  isHealthy: boolean;
  lastCheck: Date;
  issues?: string[];
}

export class LockHealthMonitor {
  async checkHealth(lockId: string): Promise<LockHealth> {
    // Stub implementation
    return {
      lockId,
      isHealthy: true,
      lastCheck: new Date(),
    };
  }

  async monitorAll(): Promise<LockHealth[]> {
    // Stub implementation
    return [];
  }
}
