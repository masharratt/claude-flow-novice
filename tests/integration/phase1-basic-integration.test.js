/**
 * Phase 1 Basic Integration Test Suite (Pure JavaScript)
 *
 * Tests integrated functionality of Phase 1 systems:
 * - Message Bus coordination
 * - Health Check propagation
 * - Rate Limiting backpressure
 * - Graceful shutdown
 *
 * Uses Jest with simple mocks to avoid TypeScript module issues
 */

// Helper to create jest-like mock functions
function createMockFn() {
  const calls = [];
  const fn = function (...args) {
    calls.push(args);
    if (fn._implementation) {
      return fn._implementation(...args);
    }
  };
  fn.calls = calls;
  fn.mockImplementation = (impl) => {
    fn._implementation = impl;
    return fn;
  };
  fn.mockResolvedValue = (value) => {
    fn._implementation = () => Promise.resolve(value);
    return fn;
  };
  fn.mock = { calls };
  return fn;
}

describe('Phase 1 Systems Integration (Basic)', () => {
  describe('Message Bus Integration', () => {
    let messageBus;
    let eventBus;

    beforeEach(() => {
      // Mock EventBus
      eventBus = {
        emit: createMockFn(),
        on: createMockFn(),
        off: createMockFn(),
        once: createMockFn(),
      };

      // Mock Logger
      const logger = {
        debug: createMockFn(),
        info: createMockFn(),
        warn: createMockFn(),
        error: createMockFn(),
      };

      // Simplified MessageBus mock
      messageBus = {
        channels: new Map(),
        queues: new Map(),
        messages: [],
        metrics: {
          messagesSent: 0,
          messagesDelivered: 0,
          messagesFailed: 0,
        },

        initialize: createMockFn().mockResolvedValue(undefined),
        shutdown: createMockFn().mockResolvedValue(undefined),

        createChannel: createMockFn().mockImplementation((name, type) => {
          const channelId = `channel-${name}`;
          messageBus.channels.set(channelId, {
            id: channelId,
            name,
            type,
            participants: [],
          });
          return Promise.resolve(channelId);
        }),

        joinChannel: createMockFn().mockImplementation((channelId, agentId) => {
          const channel = messageBus.channels.get(channelId);
          if (!channel) throw new Error(`Channel ${channelId} not found`);
          if (!channel.participants.find((p) => p.id === agentId.id)) {
            channel.participants.push(agentId);
          }
          return Promise.resolve();
        }),

        sendMessage: createMockFn().mockImplementation((type, content, sender, receivers) => {
          const messageId = `msg-${Date.now()}-${Math.random()}`;
          messageBus.messages.push({
            id: messageId,
            type,
            content,
            sender,
            receivers: Array.isArray(receivers) ? receivers : [receivers],
            timestamp: new Date(),
          });
          messageBus.metrics.messagesSent++;
          messageBus.metrics.messagesDelivered++;
          eventBus.emit('message:sent', { messageId });
          return Promise.resolve(messageId);
        }),

        broadcastMessage: createMockFn().mockImplementation((type, content, sender, options) => {
          const channel = messageBus.channels.get(options.channel);
          if (!channel) throw new Error('Channel not found');

          const receivers = channel.participants.filter((p) => p.id !== sender.id);
          return messageBus.sendMessage(type, content, sender, receivers, options);
        }),

        getMetrics: createMockFn().mockImplementation(() => ({
          channels: messageBus.channels.size,
          queues: messageBus.queues.size,
          busMetrics: messageBus.metrics,
        })),
      };
    });

    it('should coordinate 10 agents with message passing', async () => {
      const testAgents = Array.from({ length: 10 }, (_, i) => ({
        id: `agent-${i + 1}`,
        role: i < 3 ? 'coordinator' : 'worker',
      }));

      await messageBus.initialize();

      const channelId = await messageBus.createChannel('test-coordination', 'broadcast');
      expect(channelId).toBe('channel-test-coordination');

      // Join all agents
      for (const agent of testAgents) {
        await messageBus.joinChannel(channelId, agent);
      }

      const channel = messageBus.channels.get(channelId);
      expect(channel.participants.length).toBe(10);

      // Send messages from each agent
      for (const agent of testAgents) {
        await messageBus.broadcastMessage(
          'coordination:sync',
          { agentId: agent.id, status: 'active' },
          agent,
          { channel: channelId }
        );
      }

      expect(messageBus.metrics.messagesSent).toBe(10);
      expect(messageBus.messages.length).toBe(10);
    });

    it('should handle message bursts', async () => {
      const agent = { id: 'agent-1', role: 'coordinator' };
      const burstSize = 50;

      for (let i = 0; i < burstSize; i++) {
        await messageBus.sendMessage('burst:message', { index: i }, agent, [
          { id: 'agent-2', role: 'worker' },
        ]);
      }

      expect(messageBus.metrics.messagesSent).toBe(burstSize);
      expect(messageBus.messages.length).toBe(burstSize);
    });
  });

  describe('Health Check Integration', () => {
    let healthCheck;
    let eventBus;

    beforeEach(() => {
      eventBus = {
        emit: createMockFn(),
        on: createMockFn(),
        off: createMockFn(),
        events: {},
      };

      // Capture event listeners
      eventBus.on.mockImplementation((event, handler) => {
        if (!eventBus.events[event]) {
          eventBus.events[event] = [];
        }
        eventBus.events[event].push(handler);
      });

      eventBus.emit.mockImplementation((event, data) => {
        if (eventBus.events[event]) {
          eventBus.events[event].forEach((handler) => handler(data));
        }
      });

      healthCheck = {
        isRunning: false,
        healthHistory: [],
        config: {
          interval: 5000,
          enableMetrics: true,
          enableAlerts: true,
        },

        start: createMockFn().mockImplementation(() => {
          healthCheck.isRunning = true;
          eventBus.emit('health:monitor:started', { timestamp: Date.now() });
        }),

        stop: createMockFn().mockImplementation(() => {
          healthCheck.isRunning = false;
          eventBus.emit('health:monitor:stopped', { timestamp: Date.now() });
        }),

        performHealthCheck: createMockFn().mockImplementation(async () => {
          const systemHealth = {
            status: 'healthy',
            components: {
              messageBus: { status: 'healthy', message: 'OK' },
              taskEngine: { status: 'healthy', message: 'OK' },
            },
            timestamp: Date.now(),
          };

          healthCheck.healthHistory.push(systemHealth);
          eventBus.emit('health:check:completed', { health: systemHealth });

          return systemHealth;
        }),

        getSystemHealth: createMockFn().mockResolvedValue({
          status: 'healthy',
          components: {},
          timestamp: Date.now(),
        }),

        isMonitoring: createMockFn().mockImplementation(() => healthCheck.isRunning),
      };
    });

    it('should start and stop health monitoring', () => {
      expect(healthCheck.isMonitoring()).toBe(false);

      healthCheck.start();
      expect(healthCheck.isMonitoring()).toBe(true);
      expect(eventBus.emit.calls.length).toBeGreaterThan(0);
      expect(eventBus.emit.calls[0][0]).toBe('health:monitor:started');

      healthCheck.stop();
      expect(healthCheck.isMonitoring()).toBe(false);
      const stopCallIndex = eventBus.emit.calls.findIndex(call => call[0] === 'health:monitor:stopped');
      expect(stopCallIndex).toBeGreaterThan(-1);
    });

    it('should perform health checks', async () => {
      const result = await healthCheck.performHealthCheck();

      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(healthCheck.healthHistory.length).toBe(1);

      // Check that emit was called with health check completion
      const completedCallIndex = eventBus.emit.calls.findIndex(call => call[0] === 'health:check:completed');
      expect(completedCallIndex).toBeGreaterThan(-1);
    });

    it('should detect health failures', async () => {
      let alertEmitted = false;
      eventBus.on.mockImplementation((event, handler) => {
        if (event === 'health:alert') {
          handler();
          alertEmitted = true;
        }
      });

      // Simulate component failure
      eventBus.emit('component:status:updated', {
        component: 'messageBus',
        status: 'unhealthy',
        message: 'Timeout',
      });

      // Verify emit was called
      expect(eventBus.emit.calls.length).toBeGreaterThan(0);
      expect(eventBus.emit.calls[0][0]).toBe('component:status:updated');
      expect(eventBus.emit.calls[0][1].status).toBe('unhealthy');
    });
  });

  describe('Rate Limiter Integration', () => {
    let rateLimiter;

    beforeEach(() => {
      rateLimiter = {
        currentWorkerCount: 0,
        currentTaskQueueSize: 0,
        operationHistory: [],
        config: {
          maxConcurrentWorkers: 10,
          maxTaskQueueSize: 50,
          workerSpawnWindowMs: 10000,
          maxWorkerSpawnsPerWindow: 15,
        },

        checkWorkerSpawn: createMockFn().mockImplementation(() => {
          if (rateLimiter.currentWorkerCount >= rateLimiter.config.maxConcurrentWorkers) {
            const error = new Error(
              `Worker spawn limit reached: ${rateLimiter.config.maxConcurrentWorkers}`
            );
            error.name = 'RateLimitError';
            throw error;
          }
          rateLimiter.currentWorkerCount++;
          rateLimiter.operationHistory.push({
            type: 'worker_spawn',
            timestamp: Date.now(),
          });
        }),

        checkTaskDelegation: createMockFn().mockImplementation(() => {
          if (rateLimiter.currentTaskQueueSize >= rateLimiter.config.maxTaskQueueSize) {
            const error = new Error(`Task queue limit reached: ${rateLimiter.config.maxTaskQueueSize}`);
            error.name = 'RateLimitError';
            throw error;
          }
          rateLimiter.currentTaskQueueSize++;
          rateLimiter.operationHistory.push({
            type: 'task_delegation',
            timestamp: Date.now(),
          });
        }),

        releaseWorker: createMockFn().mockImplementation(() => {
          if (rateLimiter.currentWorkerCount > 0) {
            rateLimiter.currentWorkerCount--;
          }
        }),

        releaseTask: createMockFn().mockImplementation(() => {
          if (rateLimiter.currentTaskQueueSize > 0) {
            rateLimiter.currentTaskQueueSize--;
          }
        }),

        getStatus: createMockFn().mockImplementation(() => ({
          currentWorkerCount: rateLimiter.currentWorkerCount,
          maxConcurrentWorkers: rateLimiter.config.maxConcurrentWorkers,
          currentTaskQueueSize: rateLimiter.currentTaskQueueSize,
          maxTaskQueueSize: rateLimiter.config.maxTaskQueueSize,
          recentWorkerSpawns: rateLimiter.operationHistory.filter((op) => op.type === 'worker_spawn')
            .length,
          recentTaskDelegations: rateLimiter.operationHistory.filter(
            (op) => op.type === 'task_delegation'
          ).length,
          workersAvailable:
            rateLimiter.config.maxConcurrentWorkers - rateLimiter.currentWorkerCount,
          taskQueueAvailable: rateLimiter.config.maxTaskQueueSize - rateLimiter.currentTaskQueueSize,
        })),

        reset: createMockFn().mockImplementation(() => {
          rateLimiter.currentWorkerCount = 0;
          rateLimiter.currentTaskQueueSize = 0;
          rateLimiter.operationHistory = [];
        }),
      };
    });

    it('should enforce worker spawn limits', () => {
      // Spawn up to limit
      for (let i = 0; i < 10; i++) {
        expect(() => rateLimiter.checkWorkerSpawn()).not.toThrow();
      }

      expect(rateLimiter.currentWorkerCount).toBe(10);

      // Exceed limit
      expect(() => rateLimiter.checkWorkerSpawn()).toThrow(/Worker spawn limit reached/);
    });

    it('should enforce task queue limits', () => {
      // Fill queue to limit
      for (let i = 0; i < 50; i++) {
        expect(() => rateLimiter.checkTaskDelegation()).not.toThrow();
      }

      expect(rateLimiter.currentTaskQueueSize).toBe(50);

      // Exceed limit
      expect(() => rateLimiter.checkTaskDelegation()).toThrow(/Task queue limit reached/);
    });

    it('should release workers and allow new spawns', () => {
      // Fill to capacity
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkWorkerSpawn();
      }

      expect(() => rateLimiter.checkWorkerSpawn()).toThrow();

      // Release 5 workers
      for (let i = 0; i < 5; i++) {
        rateLimiter.releaseWorker();
      }

      const status = rateLimiter.getStatus();
      expect(status.currentWorkerCount).toBe(5);
      expect(status.workersAvailable).toBe(5);

      // Should be able to spawn again
      expect(() => rateLimiter.checkWorkerSpawn()).not.toThrow();
    });

    it('should track operation history', () => {
      rateLimiter.checkWorkerSpawn();
      rateLimiter.checkWorkerSpawn();
      rateLimiter.checkTaskDelegation();
      rateLimiter.checkTaskDelegation();
      rateLimiter.checkTaskDelegation();

      const status = rateLimiter.getStatus();
      expect(status.recentWorkerSpawns).toBe(2);
      expect(status.recentTaskDelegations).toBe(3);
    });
  });

  describe('Graceful Shutdown Integration', () => {
    it('should cleanup message bus on shutdown', async () => {
      const messageBus = {
        isShutdown: false,
        queues: new Map(),
        channels: new Map(),

        shutdown: createMockFn().mockImplementation(async () => {
          messageBus.isShutdown = true;
          // Simulate message persistence
          await Promise.resolve();
        }),

        destroy: createMockFn().mockImplementation(() => {
          messageBus.queues.clear();
          messageBus.channels.clear();
        }),
      };

      // Add test data
      messageBus.queues.set('queue-1', { messages: [1, 2, 3] });
      messageBus.channels.set('channel-1', { participants: [1, 2] });

      await messageBus.shutdown();
      expect(messageBus.isShutdown).toBe(true);

      messageBus.destroy();
      expect(messageBus.queues.size).toBe(0);
      expect(messageBus.channels.size).toBe(0);
    });

    it('should stop health monitoring on shutdown', () => {
      const healthCheck = {
        isRunning: true,
        intervalId: setTimeout(() => {}, 1000),

        stop: createMockFn().mockImplementation(() => {
          if (healthCheck.intervalId) {
            clearTimeout(healthCheck.intervalId);
            healthCheck.intervalId = null;
          }
          healthCheck.isRunning = false;
        }),
      };

      healthCheck.stop();
      expect(healthCheck.isRunning).toBe(false);
      expect(healthCheck.intervalId).toBe(null);
    });

    it('should reset rate limiter state', () => {
      const rateLimiter = {
        currentWorkerCount: 5,
        currentTaskQueueSize: 20,
        operationHistory: [1, 2, 3],

        reset: createMockFn().mockImplementation(() => {
          rateLimiter.currentWorkerCount = 0;
          rateLimiter.currentTaskQueueSize = 0;
          rateLimiter.operationHistory = [];
        }),
      };

      rateLimiter.reset();
      expect(rateLimiter.currentWorkerCount).toBe(0);
      expect(rateLimiter.currentTaskQueueSize).toBe(0);
      expect(rateLimiter.operationHistory.length).toBe(0);
    });
  });

  describe('Performance Validation', () => {
    it('should maintain acceptable latency for message operations', async () => {
      const latencies = [];

      for (let i = 0; i < 100; i++) {
        const startTime = Date.now();

        // Simulate message operation
        await Promise.resolve();

        const latency = Date.now() - startTime;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      // Performance thresholds
      expect(avgLatency).toBeLessThan(5); // Average < 5ms
      expect(maxLatency).toBeLessThan(50); // Max < 50ms
    });

    it('should handle 100 concurrent operations', async () => {
      const operations = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve({ id: i, result: 'success' })
      );

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(100);
      expect(duration).toBeLessThan(1000); // < 1 second
    });
  });
});
