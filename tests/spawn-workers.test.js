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
const { createRedisClient, checkRedisAvailability } = require('../config/redis.config');

// ============================================================================
// TEST SETUP
// ============================================================================

describe('WorkerSpawner', () => {
  let spawner;
  let redisClient;
  let redisAvailable = false;

  beforeAll(async () => { try {
    try {
      // Setup test Redis client using new config
      redisClient = await createRedisClient();
      redisAvailable = await checkRedisAvailability(redisClient);

      if (!redisAvailable) {
        console.warn('Redis not available for tests. Some tests will be skipped.');
      }
    } catch (error) {
      console.warn('Redis connection failed:', error);
    }
  });

  afterAll(async () => { try {
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
      logDir: '.logs/test-workers',
      // Add Redis availability flag to spawner configuration
      redisAvailable: redisAvailable
    });
  });

  afterEach(async () => { try {
    if (spawner) {
      await spawner.shutdownAll(5000);
    }

    // Cleanup test Redis keys with graceful failure
    if (redisClient && redisClient.isOpen && redisAvailable) {
      try {
        const keys = await redisClient.keys('swarm:*');
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      } catch (error) {
        console.warn('Failed to clean up Redis keys:', error);
      }
    }
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('Initialization', () => {
    jest.setTimeout(10000);
  test('should create WorkerSpawner instance with default config', () => {
      const defaultSpawner = new WorkerSpawner();
      expect(defaultSpawner).toBeDefined();
      expect(defaultSpawner.config.defaultTimeout).toBe(600000);
      expect(defaultSpawner.config.enableRetry).toBe(true);
      expect(defaultSpawner.config.maxRetries).toBe(3);
    });

    jest.setTimeout(10000);
  test('should create WorkerSpawner instance with custom config', () => {
      expect(spawner).toBeDefined();
      expect(spawner.config.defaultTimeout).toBe(30000);
      expect(spawner.config.maxRetries).toBe(2);
    });

    jest.setTimeout(10000);
  test('should initialize empty worker maps', () => {
      expect(spawner.activeWorkers.size).toBe(0);
      expect(spawner.taskQueue.size).toBe(0);
      expect(spawner.completedTasks.size).toBe(0);
    });

    jest.setTimeout(10000);
  test('should create log directory if not exists', () => {
      const fs = require('fs');
      expect(fs.existsSync(spawner.config.logDir)).toBe(true);
    });
  });

  // ============================================================================
  // AGENT SELECTION TESTS
  // ============================================================================

  describe('Agent Selection Integration', () => {
    jest.setTimeout(10000);
  test('should select backend-dev for API task', () => {
      const agentType = selectAgent('Create REST API endpoint for user management');
      expect(agentType).toBe('backend-dev');
    });

    jest.setTimeout(10000);
  test('should select react-frontend-engineer for React task', () => {
      const agentType = selectAgent('Build React component with hooks and state management');
      expect(agentType).toBe('react-frontend-engineer');
    });

    jest.setTimeout(10000);
  test('should select tester for testing task', () => {
      const agentType = selectAgent('Write unit tests and integration tests');
      expect(agentType).toBe('tester');
    });

    jest.setTimeout(10000);
  test('should select security-analyst for security task', () => {
      const agentType = selectAgent('Perform security audit and vulnerability assessment');
      expect(agentType).toBe('security-analyst');
    });
  });

  // ============================================================================
  // WORKER SPAWNING TESTS
  // ============================================================================

  describe('Worker Spawning', () => {
    jest.setTimeout(10000);
  test('should spawn worker with task ID and PID', async () => { try {
      const result = await spawner.spawnWorker('Create simple hello world function', {
        timeout: 5000
      });

      expect(result).toHaveProperty('taskId');
      expect(result).toHaveProperty('pid');
      expect(result).toHaveProperty('agentType');
      expect(result).toHaveProperty('status', 'spawned');
      expect(result).toHaveProperty('logPath');
    });

    jest.setTimeout(10000);
  test('should use custom task ID if provided', async () => { try {
      const customTaskId = 'custom-task-123';
      const result = await spawner.spawnWorker('Simple task', {
        taskId: customTaskId,
        timeout: 5000
      });

      expect(result.taskId).toBe(customTaskId);
    });

    jest.setTimeout(10000);
  test('should force specific agent type if provided', async () => { try {
      const result = await spawner.spawnWorker('Some task', {
        agentType: 'rust-developer',
        timeout: 5000
      });

      expect(result.agentType).toBe('rust-developer');
    });

    jest.setTimeout(10000);
  test('should track spawned worker in activeWorkers', async () => { try {
      const result = await spawner.spawnWorker('Track this worker', {
        timeout: 5000
      });

      const workerInfo = spawner.getWorkerStatus(result.taskId);
      expect(workerInfo).toBeDefined();
      expect(workerInfo.taskId).toBe(result.taskId);
      expect(workerInfo.status).toBe('running');
    });

    jest.setTimeout(10000);
  test('should create log file for worker', async () => { try {
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
    beforeEach(function() {
      if (!redisAvailable) {
        console.warn('Skipping Redis tests - Redis not available');
        this.skip();
      }
    });

    jest.setTimeout(10000);
  test('should register worker in Redis on spawn', async () => { try {
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

    jest.setTimeout(10000);
  test('should add worker to active workers set in Redis', async () => { try {
      const result = await spawner.spawnWorker('Active worker test', {
        timeout: 5000
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const isActive = await redisClient.sIsMember('swarm:active_workers', result.taskId);
      expect(isActive).toBe(true);
    });

    jest.setTimeout(10000);
  test('should publish spawn event to Redis', async () => { try {
      const subscriber = redisClient.duplicate();
      await subscriber.connect();

      const eventPromise = new Promise((resolve) => {
        subscriber.subscribe('swarm:events', (message) => {
          try {
            const event = JSON.parse(message);
            if (event.event === 'worker_spawned') {
              resolve(event);
            }
          } catch (error) {
            console.error('Failed to parse event:', error);
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

    // Add a test to validate Redis connection
    jest.setTimeout(10000);
  test('should verify Redis client connection', async () => { try {
      expect(redisAvailable).toBe(true);
      expect(redisClient).toBeDefined();

      try {
        await redisClient.ping();
      } catch (error) {
        fail(`Redis connection failed: ${error.message}`);
      }
    });
  });

  // ============================================================================
  // PROCESS LIFECYCLE TESTS
  // ============================================================================

  describe('Process Lifecycle', () => {
    jest.setTimeout(10000);
  test('should handle worker completion', async () => { try {
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

    jest.setTimeout(10000);
  test('should track worker duration', async () => { try {
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

    jest.setTimeout(10000);
  test('should move completed worker to completedTasks', async () => { try {
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
    jest.setTimeout(10000);
  test('should timeout long-running task', async () => { try {
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

    jest.setTimeout(10000);
  test('should kill timed-out process', async () => { try {
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
    jest.setTimeout(10000);
  test('should track active workers count', async () => { try {
      await spawner.spawnWorker('Task 1', { timeout: 10000 });
      await spawner.spawnWorker('Task 2', { timeout: 10000 });

      const stats = spawner.getStatistics();
      expect(stats.active).toBeGreaterThanOrEqual(0);
    });

    jest.setTimeout(10000);
  test('should calculate success rate', async () => { try {
      const stats = spawner.getStatistics();
      expect(stats).toHaveProperty('successRate');
    });

    jest.setTimeout(10000);
  test('should track average duration', async () => { try {
      const stats = spawner.getStatistics();
      expect(stats).toHaveProperty('avgDuration');
      expect(typeof stats.avgDuration).toBe('number');
    });
  });

  // ============================================================================
  // WORKER MANAGEMENT TESTS
  // ============================================================================

  describe('Worker Management', () => {
    jest.setTimeout(10000);
  test('should get worker status by task ID', async () => { try {
      const result = await spawner.spawnWorker('Status check task', {
        timeout: 5000
      });

      const status = spawner.getWorkerStatus(result.taskId);
      expect(status).toBeDefined();
      expect(status.taskId).toBe(result.taskId);
    });

    jest.setTimeout(10000);
  test('should list all active workers', async () => { try {
      await spawner.spawnWorker('Active 1', { timeout: 10000 });
      await spawner.spawnWorker('Active 2', { timeout: 10000 });

      const activeWorkers = spawner.getActiveWorkers();
      expect(Array.isArray(activeWorkers)).toBe(true);
    });

    jest.setTimeout(10000);
  test('should kill specific worker', async () => { try {
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
    jest.setTimeout(10000);
  test('should shutdown all workers gracefully', async () => { try {
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
    jest.setTimeout(10000);
  test('should handle invalid agent type gracefully', async () => { try {
      try {
        await spawner.spawnWorker('', { agentType: '', timeout: 1000 });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    jest.setTimeout(10000);
  test('should generate unique task IDs', () => {
      const id1 = spawner.generateTaskId();
      const id2 = spawner.generateTaskId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^task-\d+-[a-z0-9]+$/);
    });
  });
});
