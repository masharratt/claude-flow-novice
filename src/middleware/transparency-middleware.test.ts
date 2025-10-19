import { TransparencyMiddleware } from './transparency-middleware';
import { SQLiteMemorySystem } from '../storage/sqlite-memory-system';
import { RedisClient } from '../clients/redis-client';
import { Logger } from '../utils/logger';

// Mock dependencies
jest.mock('../storage/sqlite-memory-system');
jest.mock('../clients/redis-client');
jest.mock('../utils/logger');

describe('TransparencyMiddleware', () => {
  let middleware: TransparencyMiddleware;
  let mockSQLiteMemorySystem: jest.Mocked<SQLiteMemorySystem>;
  let mockRedisClient: jest.Mocked<RedisClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create mock instances
    mockSQLiteMemorySystem = new SQLiteMemorySystem() as jest.Mocked<SQLiteMemorySystem>;
    mockRedisClient = new RedisClient() as jest.Mocked<RedisClient>;
    mockLogger = new Logger() as jest.Mocked<Logger>;

    // Initialize middleware with mocked dependencies
    middleware = new TransparencyMiddleware({
      memorySystem: mockSQLiteMemorySystem,
      redisClient: mockRedisClient,
      logger: mockLogger,
      config: {
        capture: {
          edit_operations: true,
          function_calls: true
        }
      }
    });
  });

  describe('I/O Parsing', () => {
    test('parseAgentIO - XML invoke tags', () => {
      const input = '<invoke name="Edit"><parameter name="file_path">test.ts</parameter></invoke>';
      const parsed = middleware.parseAgentIO(input);
      expect(parsed.toolCalls).toHaveLength(1);
      expect(parsed.toolCalls[0].tool).toBe('Edit');
      expect(parsed.toolCalls[0].parameters.file_path).toBe('test.ts');
    });

    test('parseAgentIO - function call style', () => {
      const input = 'Task("backend-dev", "Implement feature")';
      const parsed = middleware.parseAgentIO(input);
      expect(parsed.toolCalls).toHaveLength(1);
      expect(parsed.toolCalls[0].tool).toBe('Task');
    });

    test('parseAgentIO - malformed input', () => {
      const parsed = middleware.parseAgentIO('invalid <invoke incomplete');
      expect(parsed.toolCalls).toHaveLength(0);
    });

    test('parseAgentIO - empty input', () => {
      const parsed = middleware.parseAgentIO('');
      expect(parsed.toolCalls).toHaveLength(0);
    });

    test('parseAgentIO - multiple invoke tags', () => {
      const input = '<invoke name="Edit"><parameter name="file_path">test.ts</parameter></invoke><invoke name="Bash"><parameter name="command">ls</parameter></invoke>';
      const parsed = middleware.parseAgentIO(input);
      expect(parsed.toolCalls).toHaveLength(2);
      expect(parsed.toolCalls[0].tool).toBe('Edit');
      expect(parsed.toolCalls[1].tool).toBe('Bash');
    });
  });

  describe('Event Extraction', () => {
    test('extractHighValueEvents - Edit tool', () => {
      const parsed = {
        toolCalls: [
          {
            tool: 'Edit',
            parameters: {
              file_path: 'test.ts',
              old_string: 'foo',
              new_string: 'bar'
            }
          }
        ],
        rawInput: '',
        timestamp: Date.now()
      };
      const events = middleware.extractHighValueEvents(parsed, 'test-agent', 'test-task');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('edit');
      expect(events[0].metadata.filePath).toBe('test.ts');
    });

    test('extractHighValueEvents - function call', () => {
      const parsed = {
        toolCalls: [
          {
            tool: 'Task',
            parameters: {
              agent: 'backend-dev',
              description: 'Implement feature'
            }
          }
        ],
        rawInput: '',
        timestamp: Date.now()
      };
      const events = middleware.extractHighValueEvents(parsed, 'test-agent', 'test-task');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('function_call');
    });
  });

  describe('Memory Storage', () => {
    test('storeMemory - successful storage', async () => {
      const event = {
        type: 'edit',
        agentId: 'test',
        taskId: 'task',
        timestamp: Date.now(),
        metadata: {
          filePath: 'test.ts'
        }
      };
      mockSQLiteMemorySystem.insert.mockResolvedValue(true);

      await expect(middleware.storeMemory('test-agent', 'test-task', event)).resolves.not.toThrow();
      expect(mockSQLiteMemorySystem.insert).toHaveBeenCalledWith(event);
    });

    test('queueMemory - batch processing', async () => {
      const mockEvent = {
        type: 'edit',
        agentId: 'test',
        taskId: 'task',
        timestamp: Date.now(),
        metadata: {
          filePath: 'test.ts'
        }
      };

      // Mock batch queue and flush mechanism
      mockSQLiteMemorySystem.batchInsert = jest.fn();
      middleware.MAX_BATCH_SIZE = 10;

      for (let i = 0; i < 10; i++) {
        await middleware.queueMemory('agent', 'task', mockEvent);
      }

      // Expect batch insert to be called
      expect(mockSQLiteMemorySystem.batchInsert).toHaveBeenCalled();
    });
  });

  describe('Event Filtering', () => {
    test('shouldCaptureEvent - respects config', () => {
      expect(middleware.shouldCaptureEvent('edit')).toBe(true);

      // Test with edit operations disabled
      middleware.config.capture.edit_operations = false;
      expect(middleware.shouldCaptureEvent('edit')).toBe(false);
    });

    test('shouldCaptureEvent - unknown event type', () => {
      expect(middleware.shouldCaptureEvent('unknown')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('storeMemory - handles storage errors', async () => {
      const event = {
        type: 'edit',
        agentId: 'test',
        taskId: 'task',
        timestamp: Date.now(),
        metadata: {
          filePath: 'test.ts'
        }
      };

      mockSQLiteMemorySystem.insert.mockRejectedValue(new Error('Storage error'));
      mockLogger.error = jest.fn();

      await middleware.storeMemory('test-agent', 'test-task', event);

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to store memory'),
        expect.any(Error)
      );
    });

    test('queueMemory - handles null/undefined taskId', async () => {
      const event = {
        type: 'edit',
        agentId: 'test',
        taskId: null,
        timestamp: Date.now(),
        metadata: {
          filePath: 'test.ts'
        }
      };

      mockLogger.warn = jest.fn();

      await middleware.queueMemory(null, null, event);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid taskId or agentId')
      );
    });
  });
});
