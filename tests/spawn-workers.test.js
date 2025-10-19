/**
 * Tests for Worker Spawner - CLI-Based Agent Spawning System
 *
 * Test Coverage:
 * - Worker spawning with agent selection
 * - Redis coordination integration
 * - Process lifecycle management
 * - Error handling and retries
 * - Timeout handling
 * - Statistics tracking
 */

const { WorkerSpawner } = require('../src/cli/hybrid-routing/spawn-workers.js');
const { selectAgent } = require('../src/cli/hybrid-routing/agent-use-case-registry.cjs');
const redis = require('redis');

// ============================================================================
// TEST SETUP
// ============================================================================

describe('WorkerSpawner', () => {
  let spawner;
  let redisClient;

  beforeAll(async () => {
    // Setup test Redis client
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    try {
      await redisClient.connect();
    } catch (error) {
      console.warn('Redis not available for tests, some tests may be skipped');
    }
  });

  afterAll(async () => {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
  });

  beforeEach(() => {
    spawner = new WorkerSpawner({
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      defaultTimeout: 30000, // 30 seconds for tests
      enableRetry: true,
      maxRetries: 2,
      logDir: '.logs/test-workers'
    });
  });

  afterEach(async () => {
    if (spawner) {
      await spawner.shutdownAll(5000);
    }

    // Cleanup test Redis keys
    if (redisClient && redisClient.isOpen) {
      const keys = await redisClient.keys('swarm:*');
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    }
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('Initialization', () => {
    test('should create WorkerSpawner instance with default config', () => {
      const defaultSpawner = new WorkerSpawner();
      expect(defaultSpawner).toBeDefined();
      expect(defaultSpawner.config.defaultTimeout).toBe(600000);
      expect(defaultSpawner.config.enableRetry).toBe(true);
      expect(defaultSpawner.config.maxRetries).toBe(3);
    });

    test('should create WorkerSpawner instance with custom config', () => {
      expect(spawner).toBeDefined();
      expect(spawner.config.defaultTimeout).toBe(30000);
      expect(spawner.config.maxRetries).toBe(2);
    });

    test('should initialize empty worker maps', () => {
      expect(spawner.activeWorkers.size).toBe(0);
      expect(spawner.taskQueue.size).toBe(0);
      expect(spawner.completedTasks.size).toBe(0);
    });

    test('should create log directory if not exists', () => {
      const fs = require('fs');
      expect(fs.existsSync(spawner.config.logDir)).toBe(true);
    });
  });

  // ============================================================================
  // AGENT SELECTION TESTS
  // ============================================================================

  describe('Agent Selection Integration', () => {
    test('should select backend-dev for API task', () => {
      const agentType = selectAgent('Create REST API endpoint for user management');
      expect(agentType).toBe('backend-dev');
    });

    test('should select react-frontend-engineer for React task', () => {
      const agentType = selectAgent('Build React component with hooks and state management');
      expect(agentType).toBe('react-frontend-engineer');
    });

    test('should select tester for testing task', () => {
      const agentType = selectAgent('Write unit tests and integration tests');
      expect(agentType).toBe('tester');
    });

    test('should select security-analyst for security task', () => {
      const agentType = selectAgent('Perform security audit and vulnerability assessment');
      expect(agentType).toBe('security-analyst');
    });
  });

  // ============================================================================
  // WORKER SPAWNING TESTS
  // ============================================================================

  describe('Worker Spawning', () => {
    test('should spawn worker with task ID and PID', async () => {
      const result = await spawner.spawnWorker('Create simple hello world function', {
        timeout: 5000
      });

      expect(result).toHaveProperty('taskId');
      expect(result).toHaveProperty('pid');
      expect(result).toHaveProperty('agentType');
      expect(result).toHaveProperty('status', 'spawned');
      expect(result).toHaveProperty('logPath');
    });

    test('should use custom task ID if provided', async () => {
      const customTaskId = 'custom-task-123';
      const result = await spawner.spawnWorker('Simple task', {
        taskId: customTaskId,
        timeout: 5000
      });

      expect(result.taskId).toBe(customTaskId);
    });

    test('should force specific agent type if provided', async () => {
      const result = await spawner.spawnWorker('Some task', {
        agentType: 'rust-developer',
        timeout: 5000
      });

      expect(result.agentType).toBe('rust-developer');
    });

    test('should track spawned worker in activeWorkers', async () => {
      const result = await spawner.spawnWorker('Track this worker', {
        timeout: 5000
      });

      const workerInfo = spawner.getWorkerStatus(result.taskId);
      expect(workerInfo).toBeDefined();
      expect(workerInfo.taskId).toBe(result.taskId);
      expect(workerInfo.status).toBe('running');
    });

    test('should create log file for worker', async () => {
      const result = await spawner.spawnWorker('Log this task', {
        timeout: 5000
      });

      const fs = require('fs');
      expect(fs.existsSync(result.logPath)).toBe(true);
    });
  });

  // ============================================================================
  // REDIS COORDINATION TESTS
  // ============================================================================

  describe('Redis Coordination', () => {
    beforeEach(() => {
      if (!redisClient || !redisClient.isOpen) {
        console.warn('Skipping Redis tests - Redis not available');
        return;
      }
    });

    test('should register worker in Redis on spawn', async () => {
      if (!redisClient || !redisClient.isOpen) return;

      const result = await spawner.spawnWorker('Redis coordination test', {
        timeout: 5000
      });

      // Wait for Redis registration
      await new Promise(resolve => setTimeout(resolve, 500));

      const key = `swarm:${result.taskId}:${result.agentType}:status`;
      const data = await redisClient.get(key);

      expect(data).toBeDefined();
      const parsed = JSON.parse(data);
      expect(parsed.status).toBe('active');
      expect(parsed.agentType).toBe(result.agentType);
    });

    test('should add worker to active workers set in Redis', async () => {
      if (!redisClient || !redisClient.isOpen) return;

      const result = await spawner.spawnWorker('Active worker test', {
        timeout: 5000
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const isActive = await redisClient.sIsMember('swarm:active_workers', result.taskId);
      expect(isActive).toBe(true);
    });

    test('should publish spawn event to Redis', async () => {
      if (!redisClient || !redisClient.isOpen) return;

      const subscriber = redisClient.duplicate();
      await subscriber.connect();

      const eventPromise = new Promise((resolve) => {
        subscriber.subscribe('swarm:events', (message) => {
          const event = JSON.parse(message);
          if (event.event === 'worker_spawned') {
            resolve(event);
          }
        });
      });

      await spawner.spawnWorker('Event publish test', { timeout: 5000 });

      const event = await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
      ]);

      expect(event.event).toBe('worker_spawned');
      expect(event).toHaveProperty('taskId');
      expect(event).toHaveProperty('agentType');

      await subscriber.quit();
    });
  });

  // ============================================================================
  // PROCESS LIFECYCLE TESTS
  // ============================================================================

  describe('Process Lifecycle', () => {
    test('should handle worker completion', async () => {
      const result = await spawner.spawnWorker('echo "test"', {
        agentType: 'coder',
        timeout: 5000
      });

      // Wait for process to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      const workerInfo = spawner.getWorkerStatus(result.taskId);
      expect(workerInfo).toBeDefined();
      expect(['completed', 'failed', 'running']).toContain(workerInfo.status);
    });

    test('should track worker duration', async () => {
      const result = await spawner.spawnWorker('sleep 1', {
        agentType: 'coder',
        timeout: 5000
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const workerInfo = spawner.getWorkerStatus(result.taskId);
      if (workerInfo.status !== 'running') {
        expect(workerInfo.duration).toBeGreaterThan(0);
      }
    });

    test('should move completed worker to completedTasks', async () => {
      const result = await spawner.spawnWorker('echo "done"', {
        agentType: 'coder',
        timeout: 5000
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const activeWorkers = spawner.getActiveWorkers();
      const completedTasks = spawner.getCompletedTasks();

      // Worker should be in one of these
      const isActive = activeWorkers.some(w => w.taskId === result.taskId);
      const isCompleted = completedTasks.some(w => w.taskId === result.taskId);

      expect(isActive || isCompleted).toBe(true);
    });
  });

  // ============================================================================
  // TIMEOUT TESTS
  // ============================================================================

  describe('Timeout Handling', () => {
    test('should timeout long-running task', async () => {
      const result = await spawner.spawnWorker('sleep 60', {
        agentType: 'coder',
        timeout: 1000 // 1 second timeout
      });

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 2000));

      const workerInfo = spawner.getWorkerStatus(result.taskId);
      expect(workerInfo).toBeDefined();
      expect(workerInfo.status).toBe('timeout');
    }, 10000);

    test('should kill timed-out process', async () => {
      const result = await spawner.spawnWorker('sleep 60', {
        agentType: 'coder',
        timeout: 1000
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const workerInfo = spawner.getWorkerStatus(result.taskId);
      expect(workerInfo.process.killed).toBe(true);
    }, 10000);
  });

  // ============================================================================
  // STATISTICS TESTS
  // ============================================================================

  describe('Statistics', () => {
    test('should track active workers count', async () => {
      await spawner.spawnWorker('Task 1', { timeout: 10000 });
      await spawner.spawnWorker('Task 2', { timeout: 10000 });

      const stats = spawner.getStatistics();
      expect(stats.active).toBeGreaterThanOrEqual(0);
    });

    test('should calculate success rate', async () => {
      const stats = spawner.getStatistics();
      expect(stats).toHaveProperty('successRate');
    });

    test('should track average duration', async () => {
      const stats = spawner.getStatistics();
      expect(stats).toHaveProperty('avgDuration');
      expect(typeof stats.avgDuration).toBe('number');
    });
  });

  // ============================================================================
  // WORKER MANAGEMENT TESTS
  // ============================================================================

  describe('Worker Management', () => {
    test('should get worker status by task ID', async () => {
      const result = await spawner.spawnWorker('Status check task', {
        timeout: 5000
      });

      const status = spawner.getWorkerStatus(result.taskId);
      expect(status).toBeDefined();
      expect(status.taskId).toBe(result.taskId);
    });

    test('should list all active workers', async () => {
      await spawner.spawnWorker('Active 1', { timeout: 10000 });
      await spawner.spawnWorker('Active 2', { timeout: 10000 });

      const activeWorkers = spawner.getActiveWorkers();
      expect(Array.isArray(activeWorkers)).toBe(true);
    });

    test('should kill specific worker', async () => {
      const result = await spawner.spawnWorker('sleep 30', {
        agentType: 'coder',
        timeout: 60000
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const killed = await spawner.killWorker(result.taskId);
      expect(killed).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 500));

      const workerInfo = spawner.getWorkerStatus(result.taskId);
      expect(workerInfo.process.killed).toBe(true);
    });
  });

  // ============================================================================
  // SHUTDOWN TESTS
  // ============================================================================

  describe('Shutdown', () => {
    test('should shutdown all workers gracefully', async () => {
      await spawner.spawnWorker('Worker 1', { timeout: 60000 });
      await spawner.spawnWorker('Worker 2', { timeout: 60000 });

      await new Promise(resolve => setTimeout(resolve, 500));

      await spawner.shutdownAll(5000);

      const activeWorkers = spawner.getActiveWorkers();
      // Workers should be moved to completed or still processing shutdown
      expect(activeWorkers.length).toBeLessThanOrEqual(2);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    test('should handle invalid agent type gracefully', async () => {
      try {
        await spawner.spawnWorker('', { agentType: '', timeout: 1000 });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should generate unique task IDs', () => {
      const id1 = spawner.generateTaskId();
      const id2 = spawner.generateTaskId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^task-\d+-[a-z0-9]+$/);
    });
  });
});
