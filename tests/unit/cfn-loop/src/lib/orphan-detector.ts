// Stub: orphan detector
// Created to satisfy test imports

export interface OrphanProcess {
  pid: number;
  name: string;
  age: number;
}

export class OrphanDetector {
  async detectOrphans(): Promise<OrphanProcess[]> {
    // Stub implementation
    return [];
  }

  async cleanupOrphans(pids: number[]): Promise<number> {
    // Stub implementation
    return 0;
  }
}
