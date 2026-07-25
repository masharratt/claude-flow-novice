// Stub: unified query API
// Created to satisfy test imports

export interface QueryOptions {
  database?: 'sqlite' | 'redis' | 'postgres';
  timeout?: number;
  correlation?: string;
}

export interface QueryResponse<T = unknown> {
  data: T[];
  rowCount: number;
  duration: number;
}

export class UnifiedQueryAPI {
  async query<T = unknown>(
    sql: string,
    params?: unknown[],
    options?: QueryOptions
  ): Promise<QueryResponse<T>> {
    // Stub implementation
    return {
      data: [] as T[],
      rowCount: 0,
      duration: 0,
    };
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    // Stub implementation
  }
}
