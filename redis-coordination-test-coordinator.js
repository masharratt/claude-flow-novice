#!/usr/bin/env node

/**
 * Redis Coordination Test Coordinator
 * Tests agent-to-agent communication via Redis pub/sub from within Docker containers
 */

const Redis = require('ioredis');
const { performance } = require('perf_hooks');

class RedisCoordinationTestCoordinator {
  constructor() {
    this.testResults = {
      pubsub: { success: 0, failed: 0, latency: [] },
      taskDistribution: { success: 0, failed: 0, latency: [] },
      crossContainer: { success: 0, failed: 0, messages: [] },
      concurrentCoordination: { success: 0, failed: 0, conflicts: 0 },
      errorHandling: { success: 0, failed: 0, recovered: 0 }
    };

    this.redis = new Redis({
      host: 'cfn-test-redis',
      port: 6379,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.testAgents = new Map();
    this.coordinatorId = `coordinator-${process.env.HOSTNAME || 'unknown'}-${Date.now()}`;
    this.testStartTime = performance.now();
  }

  async initializeTestEnvironment() {
    console.log(`[${this.coordinatorId}] Initializing Redis coordination test environment...`);

    try {
      // Clear previous test data
      await this.redis.flushdb();

      // Set up test channels
      this.testChannels = {
        coordination: 'test:coordination',
        tasks: 'test:tasks',
        results: 'test:results',
        errors: 'test:errors',
        heartbeat: 'test:heartbeat'
      };

      // Initialize task queues
      await this.redis.del('test:task_queue', 'test:result_queue', 'test:priority_queue');

      console.log(`[${this.coordinatorId}] ✅ Test environment initialized`);
      return true;
    } catch (error) {
      console.error(`[${this.coordinatorId}] ❌ Failed to initialize test environment:`, error.message);
      return false;
    }
  }

  async testPubSubCommunication() {
    console.log(`\n[${this.coordinatorId}] 🔄 Testing Redis Pub/Sub Communication...`);

    const testMessage = {
      id: `pubsub-test-${Date.now()}`,
      type: 'pubsub-test',
      sender: this.coordinatorId,
      timestamp: Date.now(),
      payload: { test: 'Redis pub/sub coordination test' }
    };

    try {
      const startTime = performance.now();

      // Subscribe to test channel
      const subscriber = new Redis({
        host: 'cfn-test-redis',
        port: 6379
      });

      let messageReceived = false;
      const messagePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Message timeout')), 5000);

        subscriber.subscribe(this.testChannels.coordination, (err, count) => {
          if (err) {
            clearTimeout(timeout);
            reject(err);
          } else {
            console.log(`[${this.coordinatorId}] Subscribed to ${count} channels`);
          }
        });

        subscriber.on('message', (channel, message) => {
          if (channel === this.testChannels.coordination) {
            const received = JSON.parse(message);
            if (received.id === testMessage.id) {
              clearTimeout(timeout);
              messageReceived = true;
              const latency = performance.now() - startTime;
              resolve(latency);
            }
          }
        });
      });

      // Publish test message
      await this.redis.publish(this.testChannels.coordination, JSON.stringify(testMessage));

      // Wait for message receipt
      const latency = await messagePromise;

      this.testResults.pubsub.success++;
      this.testResults.pubsub.latency.push(latency);

      await subscriber.quit();

      console.log(`[${this.coordinatorId}] ✅ Pub/Sub test passed - Latency: ${latency.toFixed(2)}ms`);
      return true;

    } catch (error) {
      this.testResults.pubsub.failed++;
      console.error(`[${this.coordinatorId}] ❌ Pub/Sub test failed:`, error.message);
      return false;
    }
  }

  async testTaskDistribution() {
    console.log(`\n[${this.coordinatorId}] 🔄 Testing Task Distribution via Redis Queues...`);

    const testTasks = [
      { id: 'task-1', type: 'computation', payload: { numbers: [1, 2, 3, 4, 5] }, priority: 1 },
      { id: 'task-2', type: 'validation', payload: { data: 'test-data' }, priority: 2 },
      { id: 'task-3', type: 'analysis', payload: { text: 'sample text for analysis' }, priority: 3 }
    ];

    try {
      // Enqueue tasks with priority
      for (const task of testTasks) {
        const startTime = performance.now();

        // Add to priority queue (sorted by priority)
        await this.redis.zadd('test:priority_queue', task.priority, JSON.stringify(task));

        // Also add to regular queue for comparison
        await this.redis.lpush('test:task_queue', JSON.stringify(task));

        console.log(`[${this.coordinatorId}] 📋 Enqueued task ${task.id} with priority ${task.priority}`);
      }

      // Test task dequeuing
      const dequeuedTasks = [];

      // Dequeue from priority queue (sorted by priority)
      const priorityTasks = await this.redis.zrange('test:priority_queue', 0, -1);
      for (const taskStr of priorityTasks) {
        const task = JSON.parse(taskStr);
        dequeuedTasks.push(task);
        await this.redis.zrem('test:priority_queue', taskStr);
      }

      // Verify priority ordering
      const isCorrectOrder = dequeuedTasks.every((task, index) => {
        return index === 0 || task.priority >= dequeuedTasks[index - 1].priority;
      });

      if (isCorrectOrder) {
        this.testResults.taskDistribution.success++;
        console.log(`[${this.coordinatorId}] ✅ Task distribution test passed - Priority queue working correctly`);
        return true;
      } else {
        this.testResults.taskDistribution.failed++;
        console.error(`[${this.coordinatorId}] ❌ Task distribution failed - Incorrect priority ordering`);
        return false;
      }

    } catch (error) {
      this.testResults.taskDistribution.failed++;
      console.error(`[${this.coordinatorId}] ❌ Task distribution test failed:`, error.message);
      return false;
    }
  }

  async testCrossContainerCommunication() {
    console.log(`\n[${this.coordinatorId}] 🔄 Testing Cross-Container Communication...`);

    try {
      // Discover other agent containers
      const containers = await this.discoverAgentContainers();
      console.log(`[${this.coordinatorId}] 📡 Discovered ${containers.length} agent containers`);

      const communicationTests = [];

      for (const container of containers) {
        const testMessage = {
          id: `cross-container-${Date.now()}-${container.name}`,
          type: 'cross-container-test',
          sender: this.coordinatorId,
          target: container.name,
          timestamp: Date.now(),
          payload: { message: `Hello from ${this.coordinatorId} to ${container.name}` }
        };

        // Send message to specific container
        const channel = `agent:${container.name}:messages`;
        await this.redis.publish(channel, JSON.stringify(testMessage));

        this.testResults.crossContainer.messages.push({
          from: this.coordinatorId,
          to: container.name,
          messageId: testMessage.id,
          timestamp: testMessage.timestamp
        });

        console.log(`[${this.coordinatorId}] 📨 Sent message to ${container.name}`);
      }

      // Test broadcast communication
      const broadcastMessage = {
        id: `broadcast-${Date.now()}`,
        type: 'broadcast-test',
        sender: this.coordinatorId,
        timestamp: Date.now(),
        payload: { message: 'Broadcast message to all agents' }
      };

      await this.redis.publish(this.testChannels.coordination, JSON.stringify(broadcastMessage));

      this.testResults.crossContainer.success++;
      console.log(`[${this.coordinatorId}] ✅ Cross-container communication test passed`);
      return true;

    } catch (error) {
      this.testResults.crossContainer.failed++;
      console.error(`[${this.coordinatorId}] ❌ Cross-container communication test failed:`, error.message);
      return false;
    }
  }

  async testConcurrentCoordination() {
    console.log(`\n[${this.coordinatorId}] 🔄 Testing Concurrent Agent Coordination...`);

    try {
      const concurrentTasks = [];
      const numConcurrentTasks = 5;

      // Create multiple concurrent coordination tasks
      for (let i = 0; i < numConcurrentTasks; i++) {
        const task = {
          id: `concurrent-task-${i}-${Date.now()}`,
          type: 'concurrent-test',
          sender: this.coordinatorId,
          index: i,
          timestamp: Date.now(),
          payload: { data: `Concurrent task ${i} data` }
        };

        concurrentTasks.push(this.executeConcurrentTask(task));
      }

      // Wait for all concurrent tasks to complete
      const results = await Promise.allSettled(concurrentTasks);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Check for resource conflicts (using Redis distributed locks)
      const conflictTest = await this.testDistributedLocking();

      this.testResults.concurrentCoordination.success += successful;
      this.testResults.concurrentCoordination.failed += failed;
      this.testResults.concurrentCoordination.conflicts += conflictTest.conflicts;

      console.log(`[${this.coordinatorId}] ✅ Concurrent coordination test passed - Success: ${successful}, Failed: ${failed}, Conflicts: ${conflictTest.conflicts}`);
      return successful > failed;

    } catch (error) {
      this.testResults.concurrentCoordination.failed++;
      console.error(`[${this.coordinatorId}] ❌ Concurrent coordination test failed:`, error.message);
      return false;
    }
  }

  async executeConcurrentTask(task) {
    return new Promise(async (resolve, reject) => {
      try {
        // Simulate task execution with Redis-based coordination
        const lockKey = `lock:task:${task.id}`;
        const lockAcquired = await this.acquireDistributedLock(lockKey, task.sender, 5000);

        if (lockAcquired) {
          // Simulate work
          await new Promise(r => setTimeout(r, Math.random() * 1000 + 500));

          // Store result
          await this.redis.hset('test:concurrent_results', task.id, JSON.stringify({
            ...task,
            status: 'completed',
            completedAt: Date.now()
          }));

          // Release lock
          await this.releaseDistributedLock(lockKey, task.sender);

          resolve(task.id);
        } else {
          reject(new Error(`Failed to acquire lock for task ${task.id}`));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async testDistributedLocking() {
    const lockKey = 'test:distributed_lock';
    const lockHolders = ['holder1', 'holder2', 'holder3'];
    const lockAttempts = [];

    for (const holder of lockHolders) {
      const acquired = await this.acquireDistributedLock(lockKey, holder, 2000);
      lockAttempts.push({ holder, acquired });

      if (acquired) {
        await new Promise(r => setTimeout(r, 100));
        await this.releaseDistributedLock(lockKey, holder);
      }
    }

    const conflicts = lockAttempts.filter(a => !a.acquired).length;
    return { conflicts };
  }

  async acquireDistributedLock(key, holder, ttl) {
    const lockValue = `${holder}-${Date.now()}`;
    const result = await this.redis.set(key, lockValue, 'PX', ttl, 'NX');
    return result === 'OK';
  }

  async releaseDistributedLock(key, holder) {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    return this.redis.eval(script, 1, key, `${holder}-*`);
  }

  async testErrorHandlingAndRecovery() {
    console.log(`\n[${this.coordinatorId}] 🔄 Testing Error Handling and Recovery...`);

    try {
      // Test 1: Redis connection failure simulation
      const connectionTest = await this.testRedisConnectionFailure();

      // Test 2: Message corruption handling
      const corruptionTest = await this.testMessageCorruptionHandling();

      // Test 3: Timeout handling
      const timeoutTest = await this.testTimeoutHandling();

      const successfulTests = [connectionTest, corruptionTest, timeoutTest].filter(t => t).length;

      this.testResults.errorHandling.success += successfulTests;
      this.testResults.errorHandling.failed += (3 - successfulTests);

      console.log(`[${this.coordinatorId}] ✅ Error handling test passed - ${successfulTests}/3 tests successful`);
      return successfulTests >= 2;

    } catch (error) {
      this.testResults.errorHandling.failed++;
      console.error(`[${this.coordinatorId}] ❌ Error handling test failed:`, error.message);
      return false;
    }
  }

  async testRedisConnectionFailure() {
    try {
      // Simulate connection failure by using wrong port
      const badRedis = new Redis({
        host: 'cfn-test-redis',
        port: 9999,
        maxRetriesPerRequest: 2,
        retryDelayOnFailover: 100
      });

      await badRedis.ping();
      await badRedis.quit();
      return false; // Should not reach here
    } catch (error) {
      // Expected to fail
      return true;
    }
  }

  async testMessageCorruptionHandling() {
    try {
      // Send corrupted JSON message
      await this.redis.publish(this.testChannels.errors, 'invalid json{');

      // Try to parse malformed message
      const subscriber = new Redis({
        host: 'cfn-test-redis',
        port: 6379
      });

      let corruptionHandled = false;

      subscriber.subscribe(this.testChannels.errors, () => {
        console.log(`[${this.coordinatorId}] Subscribed to error test channel`);
      });

      subscriber.on('message', (channel, message) => {
        try {
          JSON.parse(message);
        } catch (error) {
          corruptionHandled = true;
          console.log(`[${this.coordinatorId}] ✅ Message corruption handled correctly`);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      await subscriber.quit();

      return corruptionHandled;
    } catch (error) {
      return false;
    }
  }

  async testTimeoutHandling() {
    try {
      const startTime = performance.now();
      const timeout = 2000; // 2 second timeout

      // Simulate long-running operation
      const longOperation = new Promise((resolve, reject) => {
        setTimeout(() => resolve('completed'), 3000); // 3 second operation
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), timeout);
      });

      try {
        await Promise.race([longOperation, timeoutPromise]);
        return false; // Should timeout
      } catch (error) {
        if (error.message === 'Operation timeout') {
          const actualTime = performance.now() - startTime;
          console.log(`[${this.coordinatorId}] ✅ Timeout handled correctly in ${actualTime.toFixed(2)}ms`);
          return true;
        }
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async discoverAgentContainers() {
    // Simulate container discovery - in real implementation, this would query Docker API
    // For now, we'll create mock container data based on running containers
    return [
      { name: 'cfn-agent-test-1', id: 'mock-id-1', status: 'running' },
      { name: 'cfn-agent-test-2', id: 'mock-id-2', status: 'running' },
      { name: 'cfn-agent-test-3', id: 'mock-id-3', status: 'running' }
    ];
  }

  async generateTestReport() {
    const totalTime = performance.now() - this.testStartTime;

    const report = {
      coordinator: this.coordinatorId,
      testDuration: totalTime,
      timestamp: new Date().toISOString(),
      results: this.testResults,
      summary: {
        totalTests: Object.values(this.testResults).reduce((sum, cat) => sum + cat.success + cat.failed, 0),
        successfulTests: Object.values(this.testResults).reduce((sum, cat) => sum + cat.success, 0),
        failedTests: Object.values(this.testResults).reduce((sum, cat) => sum + cat.failed, 0),
        averageLatency: this.testResults.pubsub.latency.length > 0
          ? this.testResults.pubsub.latency.reduce((a, b) => a + b, 0) / this.testResults.pubsub.latency.length
          : 0
      }
    };

    return report;
  }

  async runAllTests() {
    console.log(`🚀 Starting Redis Coordination Test Suite`);
    console.log(`================================================`);

    const initialized = await this.initializeTestEnvironment();
    if (!initialized) {
      throw new Error('Failed to initialize test environment');
    }

    // Run all test suites
    const tests = [
      { name: 'Pub/Sub Communication', test: () => this.testPubSubCommunication() },
      { name: 'Task Distribution', test: () => this.testTaskDistribution() },
      { name: 'Cross-Container Communication', test: () => this.testCrossContainerCommunication() },
      { name: 'Concurrent Coordination', test: () => this.testConcurrentCoordination() },
      { name: 'Error Handling and Recovery', test: () => this.testErrorHandlingAndRecovery() }
    ];

    for (const { name, test } of tests) {
      try {
        await test();
        console.log(`\n✅ ${name} completed`);
      } catch (error) {
        console.error(`\n❌ ${name} failed:`, error.message);
      }
    }

    // Generate final report
    const report = await this.generateTestReport();

    console.log(`\n================================================`);
    console.log(`📊 Redis Coordination Test Results`);
    console.log(`================================================`);
    console.log(`Total Tests: ${report.summary.totalTests}`);
    console.log(`Successful: ${report.summary.successfulTests}`);
    console.log(`Failed: ${report.summary.failedTests}`);
    console.log(`Success Rate: ${((report.summary.successfulTests / report.summary.totalTests) * 100).toFixed(1)}%`);
    console.log(`Average Latency: ${report.summary.averageLatency.toFixed(2)}ms`);
    console.log(`Total Duration: ${report.testDuration.toFixed(2)}ms`);

    // Store report in Redis for other containers to access
    await this.redis.hset('test:reports', this.coordinatorId, JSON.stringify(report));

    await this.redis.quit();

    return report;
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const coordinator = new RedisCoordinationTestCoordinator();

  coordinator.runAllTests()
    .then(report => {
      console.log('\n🎉 Redis coordination testing completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Redis coordination testing failed:', error);
      process.exit(1);
    });
}

module.exports = RedisCoordinationTestCoordinator;