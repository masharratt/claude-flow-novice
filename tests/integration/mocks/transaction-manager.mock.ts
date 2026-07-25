/**
 * Mock TransactionManager for Integration Tests
 */

export class MockTransactionManager {
  beginTransaction = jest.fn().mockResolvedValue({
    id: 'test-transaction-id',
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    execute: jest.fn().mockResolvedValue({ success: true }),
  });

  commit = jest.fn().mockResolvedValue(undefined);

  rollback = jest.fn().mockResolvedValue(undefined);

  executeInTransaction = jest.fn().mockImplementation(async (callback: any) => {
    const tx = await this.beginTransaction();
    try {
      const result = await callback(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  });

  isActive = jest.fn().mockReturnValue(false);

  getActiveTransactions = jest.fn().mockReturnValue([]);
}

export const mockTransactionManager = new MockTransactionManager();
export const TransactionManager = MockTransactionManager;
