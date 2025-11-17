/**
 * Mock DatabaseService for Integration Tests
 *
 * Provides mock implementations for database operations without requiring
 * actual database connections.
 */

export interface IMockDatabaseAdapter {
  query: jest.Mock;
  execute: jest.Mock;
  transaction: jest.Mock;
  close: jest.Mock;
  isHealthy: jest.Mock;
  getConnection: jest.Mock;
}

export const createMockAdapter = (): IMockDatabaseAdapter => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  execute: jest.fn().mockResolvedValue({ success: true }),
  transaction: jest.fn().mockImplementation(async (callback: any) => {
    return await callback({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      execute: jest.fn().mockResolvedValue({ success: true }),
    });
  }),
  close: jest.fn().mockResolvedValue(undefined),
  isHealthy: jest.fn().mockResolvedValue(true),
  getConnection: jest.fn().mockResolvedValue({}),
});

export class MockDatabaseService {
  private adapters: Map<string, IMockDatabaseAdapter> = new Map();

  getAdapter = jest.fn((type: 'postgres' | 'sqlite' | string): IMockDatabaseAdapter => {
    if (!this.adapters.has(type)) {
      this.adapters.set(type, createMockAdapter());
    }
    return this.adapters.get(type)!;
  });

  createAdapter = jest.fn((type: string, config: any): IMockDatabaseAdapter => {
    const adapter = createMockAdapter();
    this.adapters.set(type, adapter);
    return adapter;
  });

  initialize = jest.fn().mockResolvedValue(undefined);

  close = jest.fn().mockResolvedValue(undefined);

  isHealthy = jest.fn().mockResolvedValue(true);

  getConnection = jest.fn().mockResolvedValue({});

  query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });

  execute = jest.fn().mockResolvedValue({ success: true });

  transaction = jest.fn().mockImplementation(async (callback: any) => {
    return await callback({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      execute: jest.fn().mockResolvedValue({ success: true }),
    });
  });
}

export const mockDatabaseService = new MockDatabaseService();

// Export for Jest automatic mocking
export const DatabaseService = MockDatabaseService;
