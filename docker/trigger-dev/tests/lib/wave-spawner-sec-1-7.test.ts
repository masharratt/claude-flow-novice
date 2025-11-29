/**
 * Unit Tests for Wave Spawner - Security Fix sec-1.7
 *
 * Validates task count validation and wave spawning implementation.
 * Tests cover:
 * - Type validation (non-array rejection)
 * - Empty array validation
 * - Normal operation (1-1000 tasks)
 * - Limit enforcement (>1000 tasks)
 * - Warning threshold (>800 tasks)
 * - Memory calculation and formatting
 * - Wave partitioning logic
 *
 * Security Properties Verified:
 * - Non-array inputs rejected with clear error
 * - Empty arrays rejected
 * - Task limit enforced at 1000
 * - Warning triggered at 80% utilization
 * - Clear, actionable error messages
 *
 * @module wave-spawner-sec-1-7.test
 */

import {
  validateTaskCount,
  spawnWave,
  ValidationError,
  TaskLimitError,
  MAX_TASKS,
  TASK_WARNING_THRESHOLD,
  Task,
} from '../../src/lib/wave-spawner';

describe('Wave Spawner Security Fix sec-1.7', () => {
  // =============================================
  // Type Validation Tests
  // =============================================

  describe('Type Validation', () => {
    it('should reject null input', () => {
      expect(() => {
        validateTaskCount(null as unknown as Task[]);
      }).toThrow(TypeError);
      expect(() => {
        validateTaskCount(null as unknown as Task[]);
      }).toThrow('[wave-spawner] Tasks must be an array');
    });

    it('should reject undefined input', () => {
      expect(() => {
        validateTaskCount(undefined as unknown as Task[]);
      }).toThrow(TypeError);
    });

    it('should reject object input', () => {
      expect(() => {
        validateTaskCount({ tasks: [] } as unknown as Task[]);
      }).toThrow(TypeError);
      expect(() => {
        validateTaskCount({ tasks: [] } as unknown as Task[]);
      }).toThrow('[wave-spawner] Tasks must be an array');
    });

    it('should reject string input', () => {
      expect(() => {
        validateTaskCount('tasks' as unknown as Task[]);
      }).toThrow(TypeError);
    });

    it('should reject number input', () => {
      expect(() => {
        validateTaskCount(42 as unknown as Task[]);
      }).toThrow(TypeError);
    });

    it('should reject boolean input', () => {
      expect(() => {
        validateTaskCount(true as unknown as Task[]);
      }).toThrow(TypeError);
    });

    it('should reject symbol input', () => {
      expect(() => {
        validateTaskCount(Symbol('test') as unknown as Task[]);
      }).toThrow(TypeError);
    });
  });

  // =============================================
  // Empty Array Validation Tests
  // =============================================

  describe('Empty Array Validation', () => {
    it('should reject empty array', () => {
      expect(() => {
        validateTaskCount([]);
      }).toThrow(ValidationError);
      expect(() => {
        validateTaskCount([]);
      }).toThrow('[wave-spawner] Tasks array cannot be empty');
    });

    it('should reject array after clearing', () => {
      const tasks = [
        { id: 'task-1', type: 'test', payload: {} },
      ];
      tasks.length = 0;
      expect(() => {
        validateTaskCount(tasks);
      }).toThrow(ValidationError);
    });
  });

  // =============================================
  // Task Count Limit Tests
  // =============================================

  describe('Task Count Limit Enforcement', () => {
    it('should accept exactly 1 task', () => {
      const tasks: Task[] = [
        { id: 'task-1', type: 'test', payload: {} },
      ];
      expect(() => {
        validateTaskCount(tasks);
      }).not.toThrow();
    });

    it('should accept 500 tasks (within limit)', () => {
      const tasks: Task[] = Array.from({ length: 500 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));
      expect(() => {
        validateTaskCount(tasks);
      }).not.toThrow();
    });

    it('should accept exactly MAX_TASKS (1000)', () => {
      const tasks: Task[] = Array.from({ length: MAX_TASKS }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));
      expect(() => {
        validateTaskCount(tasks);
      }).not.toThrow();
    });

    it('should reject 1001 tasks (over limit)', () => {
      const tasks: Task[] = Array.from({ length: 1001 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));
      expect(() => {
        validateTaskCount(tasks);
      }).toThrow(TaskLimitError);
    });

    it('should reject 5000 tasks (far over limit)', () => {
      const tasks: Task[] = Array.from({ length: 5000 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));
      expect(() => {
        validateTaskCount(tasks);
      }).toThrow(TaskLimitError);
    });

    it('should throw TaskLimitError with correct properties', () => {
      const tasks: Task[] = Array.from({ length: 1500 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));
      try {
        validateTaskCount(tasks);
        fail('Expected TaskLimitError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TaskLimitError);
        const limitError = error as TaskLimitError;
        expect(limitError.taskCount).toBe(1500);
        expect(limitError.maxLimit).toBe(MAX_TASKS);
        expect(limitError.message).toContain('1500');
        expect(limitError.message).toContain('1000');
      }
    });

    it('should provide helpful error message for over-limit tasks', () => {
      const tasks: Task[] = Array.from({ length: 2000 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));
      try {
        validateTaskCount(tasks);
        fail('Expected TaskLimitError to be thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('break work into smaller batches');
      }
    });
  });

  // =============================================
  // Warning Threshold Tests
  // =============================================

  describe('Warning Threshold (80% Utilization)', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('should not warn for 500 tasks (50% utilization)', () => {
      const tasks: Task[] = Array.from({ length: 500 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));

      validateTaskCount(tasks);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should not warn for exactly 800 tasks (80% utilization threshold)', () => {
      const tasks: Task[] = Array.from({ length: TASK_WARNING_THRESHOLD }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));

      validateTaskCount(tasks);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should warn for 801 tasks (exceeds 80% threshold)', () => {
      const tasks: Task[] = Array.from({ length: 801 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));

      validateTaskCount(tasks);

      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('High task count');
      expect(warnSpy.mock.calls[0][0]).toContain('801/1000');
    });

    it('should warn for 999 tasks (99% utilization)', () => {
      const tasks: Task[] = Array.from({ length: 999 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));

      validateTaskCount(tasks);

      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('High task count');
    });

    it('should include remaining task count in warning', () => {
      const tasks: Task[] = Array.from({ length: 850 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));

      validateTaskCount(tasks);

      expect(warnSpy).toHaveBeenCalled();
      const message = warnSpy.mock.calls[0][0];
      expect(message).toContain('150'); // Remaining tasks
      expect(message).toContain('before limit');
    });
  });

  // =============================================
  // Wave Spawning Tests
  // =============================================

  describe('Wave Spawning', () => {
    it('should spawn single wave for small task count', async () => {
      const tasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));

      const result = await spawnWave(tasks);

      expect(result.waveCount).toBe(1);
      expect(result.tasksPerWave).toEqual([10]);
      expect(result.status).toBe('pending');
    });

    it('should spawn multiple waves for large task count with memory budget', async () => {
      const tasks: Task[] = Array.from({ length: 20 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
        memory: '2g', // 2GB per task
      }));

      // 20GB budget = 10 tasks per wave (2GB * 10 = 20GB)
      const result = await spawnWave(tasks, 20 * 1024 * 1024 * 1024);

      expect(result.waveCount).toBeGreaterThan(1);
      expect(result.tasksPerWave.length).toBeGreaterThan(1);
      expect(result.status).toBe('pending');
    });

    it('should reject oversized task count in spawnWave', async () => {
      const tasks: Task[] = Array.from({ length: 1500 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
      }));

      await expect(spawnWave(tasks)).rejects.toThrow(TaskLimitError);
    });

    it('should calculate total memory for result', async () => {
      const tasks: Task[] = [
        { id: 'task-1', type: 'test', payload: {}, memory: '512m' },
        { id: 'task-2', type: 'test', payload: {}, memory: '512m' },
        { id: 'task-3', type: 'test', payload: {}, memory: '1g' },
      ];

      const result = await spawnWave(tasks);

      expect(result.totalMemory).toBeDefined();
      expect(result.totalMemory).toMatch(/[0-9.]+[a-z]+/); // Should match memory format
    });

    it('should use default 512MB memory for tasks without memory specification', async () => {
      const tasks: Task[] = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test',
        payload: {},
        // No memory specified
      }));

      const result = await spawnWave(tasks, 5 * 512 * 1024 * 1024); // 2.5GB budget

      // 5 tasks * 512MB = 2.5GB
      expect(result.waveCount).toBeGreaterThanOrEqual(1);
      expect(result.totalMemory).toBeDefined();
    });
  });

  // =============================================
  // Edge Cases and Error Handling
  // =============================================

  describe('Edge Cases', () => {
    it('should handle array with single null element (should not throw during validation)', () => {
      const tasks = [null] as unknown as Task[];
      // Validation only checks array type and length, not element structure
      expect(() => {
        validateTaskCount(tasks);
      }).not.toThrow();
    });

    it('should handle task with null payload', () => {
      const tasks: Task[] = [
        { id: 'task-1', type: 'test', payload: null },
      ];
      expect(() => {
        validateTaskCount(tasks);
      }).not.toThrow();
    });

    it('should handle task with empty string ID', () => {
      const tasks: Task[] = [
        { id: '', type: 'test', payload: {} },
      ];
      expect(() => {
        validateTaskCount(tasks);
      }).not.toThrow();
    });

    it('should reject invalid memory format in spawnWave', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          type: 'test',
          payload: {},
          memory: 'invalid-memory',
        },
      ];

      await expect(spawnWave(tasks)).rejects.toThrow();
      await expect(spawnWave(tasks)).rejects.toThrow('[wave-spawner]');
    });

    it('should handle zero memory value', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          type: 'test',
          payload: {},
          memory: '0mb',
        },
      ];

      await expect(spawnWave(tasks)).rejects.toThrow();
    });

    it('should handle negative memory value', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          type: 'test',
          payload: {},
          memory: '-512m',
        },
      ];

      await expect(spawnWave(tasks)).rejects.toThrow();
    });
  });

  // =============================================
  // Integration Tests
  // =============================================

  describe('Integration', () => {
    it('should process valid batch of mixed task types', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          type: 'compute',
          payload: { computation: 'heavy' },
          memory: '1g',
          priority: 10,
        },
        {
          id: 'task-2',
          type: 'io',
          payload: { file: '/path/to/file' },
          memory: '512m',
          priority: 5,
        },
        {
          id: 'task-3',
          type: 'network',
          payload: { url: 'https://api.example.com' },
          priority: 8,
        },
      ];

      expect(() => {
        validateTaskCount(tasks);
      }).not.toThrow();

      const result = await spawnWave(tasks);
      expect(result.waveCount).toBeGreaterThanOrEqual(1);
      expect(result.tasksPerWave.length).toBeGreaterThanOrEqual(1);
    });

    it('should validate task counts and spawn in realistic scenario', async () => {
      // Simulate 500 task batch
      const tasks: Task[] = Array.from({ length: 500 }, (_, i) => ({
        id: `async-task-${i}`,
        type: i % 3 === 0 ? 'compute' : i % 2 === 0 ? 'io' : 'network',
        payload: { index: i, timestamp: Date.now() },
        memory:
          i % 10 < 3
            ? '2g'
            : i % 10 < 6
              ? '1g'
              : i % 10 < 8
                ? '800m'
                : '512m',
      }));

      validateTaskCount(tasks);
      const result = await spawnWave(tasks, 40 * 1024 * 1024 * 1024);

      expect(result.waveCount).toBeGreaterThanOrEqual(1);
      expect(result.tasksPerWave.reduce((a: number, b: number) => a + b, 0)).toBe(500);
    });
  });

  // =============================================
  // Constants Validation
  // =============================================

  describe('Constants', () => {
    it('should have MAX_TASKS set to 1000', () => {
      expect(MAX_TASKS).toBe(1000);
    });

    it('should have TASK_WARNING_THRESHOLD at 80% of MAX_TASKS', () => {
      expect(TASK_WARNING_THRESHOLD).toBe(800);
      expect(TASK_WARNING_THRESHOLD).toBe(MAX_TASKS * 0.8);
    });

    it('should have warning threshold less than limit', () => {
      expect(TASK_WARNING_THRESHOLD).toBeLessThan(MAX_TASKS);
    });
  });
});
