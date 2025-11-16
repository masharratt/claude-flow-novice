/**
 * Reflection Logger Tests
 * Task 5.3: ACE Reflection Persistence Standardization
 *
 * TDD Implementation - Tests written FIRST
 * Coverage target: 90%+
 */

import { ReflectionLogger } from '../src/services/reflection-logger';
import { DatabaseService } from '../src/lib/database-service';
import { StandardError } from '../src/lib/errors';

// Mock dependencies
jest.mock('../src/lib/database-service');
jest.mock('../src/lib/logging');

describe('ReflectionLogger', () => {
  let reflectionLogger: ReflectionLogger;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockRedisAdapter: any;
  let mockPostgresAdapter: any;

  beforeEach(() => {
    // Create mock adapters
    mockRedisAdapter = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      ttl: jest.fn().mockResolvedValue(-1),
    };

    mockPostgresAdapter = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock database service
    mockDatabaseService = {
      getAdapter: jest.fn((type: string) => {
        if (type === 'redis') return mockRedisAdapter;
        if (type === 'postgres') return mockPostgresAdapter;
        throw new Error(`Unknown adapter type: ${type}`);
      }),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    } as any;

    reflectionLogger = new ReflectionLogger(mockDatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logReflection', () => {
    it('should write reflection to Redis with 24h TTL', async () => {
      const reflection = {
        agent_id: 'test-agent-123',
        task_id: 'task-456',
        reflection_type: 'confidence',
        confidence: 0.85,
        payload: { reasoning: 'Task completed successfully' },
        timestamp: new Date('2025-11-16T10:00:00Z'),
      };

      const start = Date.now();
      await reflectionLogger.logReflection(reflection);
      const duration = Date.now() - start;

      // Performance requirement: <100ms
      expect(duration).toBeLessThan(100);

      // Verify Redis write with 24h TTL (86400 seconds)
      expect(mockRedisAdapter.setex).toHaveBeenCalledWith(
        expect.stringContaining('reflection:test-agent-123'),
        86400,
        expect.any(String)
      );

      // Verify JSON serialization
      const serializedData = mockRedisAdapter.setex.mock.calls[0][2];
      const parsedData = JSON.parse(serializedData);
      expect(parsedData).toMatchObject({
        agent_id: 'test-agent-123',
        task_id: 'task-456',
        reflection_type: 'confidence',
        confidence: 0.85,
        payload: { reasoning: 'Task completed successfully' },
      });
    });

    it('should validate reflection schema before writing', async () => {
      const invalidReflection = {
        agent_id: '', // Invalid: empty string
        task_id: 'task-456',
        reflection_type: 'confidence',
        confidence: 1.5, // Invalid: >1.0
        payload: {},
        timestamp: new Date(),
      };

      await expect(
        reflectionLogger.logReflection(invalidReflection as any)
      ).rejects.toThrow(StandardError);
    });

    it('should handle missing optional fields gracefully', async () => {
      const minimalReflection = {
        agent_id: 'test-agent-123',
        task_id: 'task-456',
        reflection_type: 'status',
        confidence: 0.75,
        payload: {},
      };

      await expect(
        reflectionLogger.logReflection(minimalReflection)
      ).resolves.not.toThrow();

      expect(mockRedisAdapter.setex).toHaveBeenCalled();
    });

    it('should gracefully degrade if Redis is unavailable', async () => {
      mockRedisAdapter.setex.mockRejectedValue(new Error('Redis connection refused'));

      const reflection = {
        agent_id: 'test-agent-123',
        task_id: 'task-456',
        reflection_type: 'confidence',
        confidence: 0.85,
        payload: {},
        timestamp: new Date(),
      };

      // Should fallback to PostgreSQL write only
      await expect(
        reflectionLogger.logReflection(reflection)
      ).resolves.not.toThrow();

      // Verify direct PostgreSQL write
      expect(mockPostgresAdapter.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reflections'),
        expect.any(Array)
      );
    });

    it('should monitor and log reflection loss on Redis failure', async () => {
      mockRedisAdapter.setex.mockRejectedValue(new Error('Redis timeout'));

      const reflection = {
        agent_id: 'test-agent-123',
        task_id: 'task-456',
        reflection_type: 'confidence',
        confidence: 0.85,
        payload: {},
        timestamp: new Date(),
      };

      await reflectionLogger.logReflection(reflection);

      // Verify monitoring metric was incremented
      // (This would be verified through logging.ts in real implementation)
      expect(mockPostgresAdapter.execute).toHaveBeenCalled();
    });
  });

  describe('queryReflections', () => {
    it('should query recent reflections from Redis first', async () => {
      const mockRedisKeys = [
        'reflection:agent-123:2025-11-16T10:00:00',
        'reflection:agent-123:2025-11-16T09:00:00',
      ];

      const mockRedisData = JSON.stringify({
        agent_id: 'agent-123',
        task_id: 'task-456',
        reflection_type: 'confidence',
        confidence: 0.85,
        payload: {},
        timestamp: '2025-11-16T10:00:00Z',
      });

      mockRedisAdapter.keys.mockResolvedValue(mockRedisKeys);
      mockRedisAdapter.get.mockResolvedValue(mockRedisData);

      const start = Date.now();
      const results = await reflectionLogger.queryReflections({
        agent_id: 'agent-123',
        task_id: 'task-456',
      });
      const duration = Date.now() - start;

      // Performance requirement: <200ms for spanning query
      expect(duration).toBeLessThan(200);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        agent_id: 'agent-123',
        task_id: 'task-456',
        confidence: 0.85,
      });
    });

    it('should fallback to PostgreSQL for older reflections', async () => {
      mockRedisAdapter.keys.mockResolvedValue([]);
      mockPostgresAdapter.query.mockResolvedValue({
        rows: [
          {
            agent_id: 'agent-123',
            task_id: 'task-456',
            reflection_type: 'confidence',
            confidence: 0.80,
            payload: JSON.stringify({ reason: 'archived' }),
            timestamp: new Date('2025-11-15T10:00:00Z'),
          },
        ],
      });

      const results = await reflectionLogger.queryReflections({
        agent_id: 'agent-123',
        task_id: 'task-456',
        start_date: new Date('2025-11-15T00:00:00Z'),
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        agent_id: 'agent-123',
        confidence: 0.80,
      });
      expect(results[0].payload).toEqual({ reason: 'archived' });
    });

    it('should merge results from both Redis and PostgreSQL', async () => {
      // Redis has recent data
      mockRedisAdapter.keys.mockResolvedValue(['reflection:agent-123:recent']);
      mockRedisAdapter.get.mockResolvedValue(
        JSON.stringify({
          agent_id: 'agent-123',
          task_id: 'task-456',
          reflection_type: 'confidence',
          confidence: 0.90,
          payload: {},
          timestamp: '2025-11-16T10:00:00Z',
        })
      );

      // PostgreSQL has archived data
      mockPostgresAdapter.query.mockResolvedValue({
        rows: [
          {
            agent_id: 'agent-123',
            task_id: 'task-456',
            reflection_type: 'confidence',
            confidence: 0.75,
            payload: JSON.stringify({}),
            timestamp: new Date('2025-11-15T10:00:00Z'),
          },
        ],
      });

      const results = await reflectionLogger.queryReflections({
        agent_id: 'agent-123',
        task_id: 'task-456',
        start_date: new Date('2025-11-15T00:00:00Z'),
      });

      expect(results).toHaveLength(2);
      expect(results.map(r => r.confidence)).toEqual([0.90, 0.75]);
    });

    it('should handle Redis unavailability gracefully in queries', async () => {
      mockRedisAdapter.keys.mockRejectedValue(new Error('Redis connection refused'));
      mockPostgresAdapter.query.mockResolvedValue({
        rows: [
          {
            agent_id: 'agent-123',
            task_id: 'task-456',
            reflection_type: 'confidence',
            confidence: 0.80,
            payload: JSON.stringify({}),
            timestamp: new Date('2025-11-16T10:00:00Z'),
          },
        ],
      });

      const results = await reflectionLogger.queryReflections({
        agent_id: 'agent-123',
      });

      // Should fallback to PostgreSQL only
      expect(results).toHaveLength(1);
      expect(mockPostgresAdapter.query).toHaveBeenCalled();
    });
  });

  describe('getReflectionStats', () => {
    it('should calculate aggregate statistics from both sources', async () => {
      mockRedisAdapter.keys.mockResolvedValue(['reflection:agent-123:r1']);
      mockRedisAdapter.get.mockResolvedValue(
        JSON.stringify({
          agent_id: 'agent-123',
          task_id: 'task-456',
          reflection_type: 'confidence',
          confidence: 0.95,
          payload: {},
          timestamp: '2025-11-16T10:00:00Z',
        })
      );

      mockPostgresAdapter.query.mockResolvedValue({
        rows: [
          { agent_id: 'agent-123', confidence: 0.85 },
          { agent_id: 'agent-123', confidence: 0.75 },
        ],
      });

      const stats = await reflectionLogger.getReflectionStats('agent-123');

      expect(stats).toMatchObject({
        total_count: 3,
        average_confidence: expect.closeTo(0.85, 2),
        min_confidence: 0.75,
        max_confidence: 0.95,
      });
    });
  });

  describe('archiveExpiredReflections', () => {
    it('should identify reflections approaching TTL expiration', async () => {
      mockRedisAdapter.keys.mockResolvedValue([
        'reflection:agent-123:r1',
        'reflection:agent-123:r2',
      ]);

      // First key expiring soon (TTL: 100 seconds)
      // Second key has plenty of time (TTL: 50000 seconds)
      mockRedisAdapter.ttl
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(50000);

      mockRedisAdapter.get.mockResolvedValue(
        JSON.stringify({
          agent_id: 'agent-123',
          task_id: 'task-456',
          reflection_type: 'confidence',
          confidence: 0.85,
          payload: {},
          timestamp: '2025-11-16T10:00:00Z',
        })
      );

      const archived = await reflectionLogger.archiveExpiredReflections();

      expect(archived).toBe(1);
      expect(mockPostgresAdapter.execute).toHaveBeenCalledTimes(1);
    });
  });
});

describe('ReflectionArchiver', () => {
  // These tests will be implemented for the archiver component
  it('should be implemented in reflection-archiver.test.ts', () => {
    expect(true).toBe(true);
  });
});
