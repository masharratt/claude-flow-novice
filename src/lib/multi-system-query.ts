// Stub: multi-system query
// Created to satisfy test imports

export interface SystemQueryOptions {
  systems: string[];
  timeout?: number;
  parallel?: boolean;
}

export interface SystemQueryResult {
  system: string;
  data: unknown[];
  error?: string;
}

export class MultiSystemQuery {
  async query(sql: string, options: SystemQueryOptions): Promise<SystemQueryResult[]> {
    // Stub implementation
    return options.systems.map((system) => ({
      system,
      data: [],
    }));
  }

  async aggregateResults(results: SystemQueryResult[]): Promise<unknown[]> {
    // Stub implementation
    return results.flatMap((r) => r.data);
  }
}
