#!/usr/bin/env node

/**
 * Redis Coordination Test Agent
 * Runs inside Docker containers to test agent coordination capabilities
 */

const Redis = require('ioredis');
const { performance } = require('perf_hooks');

class RedisCoordinationTestAgent {
  constructor(agentId = null) {
    this.agentId = agentId || `agent-${process.env.HOSTNAME || 'unknown'}-${Date.now()}`;
    this.containerName = process.env.HOSTNAME || 'unknown-container';
    this.testResults = {
      messagesReceived: 0,
      tasksCompleted: 0,
      coordinationSuccess: 0,
      coordinationFailures: 0,
      heartbeatSent: 0,
      responseTimes: []
    };

    this.redis = new Redis({
      host: 'cfn-test-redis',
      port: 6379,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.subscriber = new Redis({
      host: 'cfn-test-redis',
      port: 6379,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.isRunning = false;
    this.heartbeatInterval = null;
  }

  async initialize() {
    console.log(`[${this.agentId}] Initializing coordination test agent...`);

    try {
      // Test Redis connection
      await this.redis.ping();
      await this.subscriber.ping();

      // Subscribe to coordination channels
      await this.subscriber.subscribe('test:coordination', 'test:tasks', `agent:${this.containerName}:messages`);

      console.log(`[${this.agentId}] ✅ Agent initialized and subscribed to channels`);
      return true;
    } catch (error) {
      console.error(`[${this.agentId}] ❌ Failed to initialize agent:`, error.message);
      return false;
    }
  }

  async startCoordinationTest() {
    console.log(`[${this.agentId}] 🚀 Starting coordination test...`);

    this.isRunning = true;

    // Set up message handlers
    this.setupMessageHandlers();

    // Start heartbeat
    this.startHeartbeat();

    // Send initial registration message
    await this.registerAgent();

    // Participate in task processing
    this.startTaskProcessing();

    // Run for specified duration
    const testDuration = 30000; // 30 seconds
    await new Promise(resolve => setTimeout(resolve, testDuration));

    // Stop and report results
    await this.stopCoordinationTest();
  }

  setupMessageHandlers() {
    this.subscriber.on('message', async (channel, message) => {
      try {
        const startTime = performance.now();
        const parsedMessage = JSON.parse(message);

        console.log(`[${this.agentId}] 📨 Received message on ${channel}: ${parsedMessage.type}`);

        switch (channel) {
          case 'test:coordination':
            await this.handleCoordinationMessage(parsedMessage);
            break;
          case 'test:tasks':
            await this.handleTaskMessage(parsedMessage);
            break;
          case `agent:${this.containerName}:messages`:
            await this.handleDirectMessage(parsedMessage);
            break;
        }

        const responseTime = performance.now() - startTime;
        this.testResults.responseTimes.push(responseTime);

      } catch (error) {
        console.error(`[${this.agentId}] ❌ Error handling message:`, error.message);
        this.testResults.coordinationFailures++;
      }
    });
  }

  async handleCoordinationMessage(message) {
    this.testResults.messagesReceived++;

    switch (message.type) {
      case 'pubsub-test':
        console.log(`[${this.agentId}] 🔄 Received pub/sub test message from ${message.sender}`);
        // Echo back to sender
        const response = {
          id: `response-${Date.now()}`,
          type: 'pubsub-response',
          sender: this.agentId,
          target: message.sender,
          originalMessage: message.id,
          timestamp: Date.now()
        };
        await this.redis.publish('test:coordination', JSON.stringify(response));
        this.testResults.coordinationSuccess++;
        break;

      case 'broadcast-test':
        console.log(`[${this.agentId}] 📡 Received broadcast message: ${message.payload.message}`);
        // Respond to broadcast
        const broadcastResponse = {
          id: `broadcast-response-${Date.now()}`,
          type: 'broadcast-response',
          sender: this.agentId,
          originalBroadcast: message.id,
          timestamp: Date.now(),
          container: this.containerName
        };
        await this.redis.publish('test:results', JSON.stringify(broadcastResponse));
        this.testResults.coordinationSuccess++;
        break;

      case 'concurrent-test':
        console.log(`[${this.agentId}] ⚡ Received concurrent coordination task ${message.id}`);
        await this.handleConcurrentTask(message);
        break;
    }
  }

  async handleTaskMessage(message) {
    console.log(`[${this.agentId}] 📋 Processing task: ${message.id}`);

    try {
      // Simulate task processing
      await this.processTask(message);

      // Report task completion
      const completion = {
        id: `completion-${Date.now()}`,
        type: 'task-completion',
        sender: this.agentId,
        originalTask: message.id,
        status: 'completed',
        timestamp: Date.now(),
        processingTime: Math.random() * 1000 + 500 // Simulate variable processing time
      };

      await this.redis.publish('test:results', JSON.stringify(completion));
      this.testResults.tasksCompleted++;
      this.testResults.coordinationSuccess++;

    } catch (error) {
      console.error(`[${this.agentId}] ❌ Task processing failed:`, error.message);
      this.testResults.coordinationFailures++;
    }
  }

  async handleDirectMessage(message) {
    console.log(`[${this.agentId}] 🎯 Received direct message from ${message.sender}: ${message.payload.message}`);

    // Send direct response
    const response = {
      id: `direct-response-${Date.now()}`,
      type: 'direct-response',
      sender: this.agentId,
      target: message.sender,
      originalMessage: message.id,
      timestamp: Date.now(),
      container: this.containerName
    };

    await this.redis.publish('test:results', JSON.stringify(response));
    this.testResults.coordinationSuccess++;
  }

  async handleConcurrentTask(message) {
    const lockKey = `lock:concurrent:${message.id}`;
    const lockAcquired = await this.acquireDistributedLock(lockKey, this.agentId, 5000);

    if (lockAcquired) {
      try {
        // Simulate concurrent task processing
        await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

        // Store result
        const result = {
          ...message,
          status: 'completed',
          processor: this.agentId,
          container: this.containerName,
          completedAt: Date.now()
        };

        await this.redis.hset('test:concurrent_results', message.id, JSON.stringify(result));
        await this.redis.publish('test:results', JSON.stringify({
          id: `concurrent-result-${Date.now()}`,
          type: 'concurrent-result',
          sender: this.agentId,
          originalTask: message.id,
          result: result
        }));

        this.testResults.coordinationSuccess++;

      } finally {
        await this.releaseDistributedLock(lockKey, this.agentId);
      }
    } else {
      console.log(`[${this.agentId}] ⚠️  Could not acquire lock for concurrent task ${message.id}`);
      this.testResults.coordinationFailures++;
    }
  }

  async processTask(task) {
    // Simulate different types of task processing
    switch (task.type) {
      case 'computation':
        await this.processComputationTask(task);
        break;
      case 'validation':
        await this.processValidationTask(task);
        break;
      case 'analysis':
        await this.processAnalysisTask(task);
        break;
      default:
        await this.processGenericTask(task);
    }
  }

  async processComputationTask(task) {
    // Simulate computation work
    const numbers = task.payload.numbers || [1, 2, 3, 4, 5];
    const result = numbers.reduce((sum, num) => sum + num, 0);

    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate processing time

    console.log(`[${this.agentId}] 🧮 Computation result: ${result}`);
    return result;
  }

  async processValidationTask(task) {
    // Simulate validation work
    const data = task.payload.data || '';
    const isValid = data.length > 0;

    await new Promise(resolve => setTimeout(resolve, 300));

    console.log(`[${this.agentId}] ✔️  Validation result: ${isValid}`);
    return isValid;
  }

  async processAnalysisTask(task) {
    // Simulate analysis work
    const text = task.payload.text || '';
    const wordCount = text.split(' ').length;

    await new Promise(resolve => setTimeout(resolve, 800));

    console.log(`[${this.agentId}] 📊 Analysis result: ${wordCount} words`);
    return wordCount;
  }

  async processGenericTask(task) {
    // Simulate generic task processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 200));
    console.log(`[${this.agentId}] 🔧 Generic task processed: ${task.id}`);
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

  startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      try {
        const heartbeat = {
          id: `heartbeat-${Date.now()}`,
          type: 'heartbeat',
          sender: this.agentId,
          container: this.containerName,
          timestamp: Date.now(),
          status: 'active',
          stats: {
            messagesReceived: this.testResults.messagesReceived,
            tasksCompleted: this.testResults.tasksCompleted,
            coordinationSuccess: this.testResults.coordinationSuccess,
            coordinationFailures: this.testResults.coordinationFailures
          }
        };

        await this.redis.publish('test:heartbeat', JSON.stringify(heartbeat));
        this.testResults.heartbeatSent++;

      } catch (error) {
        console.error(`[${this.agentId}] ❌ Failed to send heartbeat:`, error.message);
      }
    }, 5000); // Heartbeat every 5 seconds
  }

  async registerAgent() {
    const registration = {
      id: `registration-${Date.now()}`,
      type: 'agent-registration',
      sender: this.agentId,
      container: this.containerName,
      timestamp: Date.now(),
      capabilities: ['task-processing', 'coordination', 'messaging', 'distributed-locking']
    };

    await this.redis.publish('test:coordination', JSON.stringify(registration));
    console.log(`[${this.agentId}] 📝 Agent registration sent`);
  }

  startTaskProcessing() {
    // Periodically check for tasks in queue
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        // Try to get a task from the queue
        const taskStr = await this.redis.brpop('test:task_queue', 1); // 1 second timeout
        if (taskStr) {
          const task = JSON.parse(taskStr[1]);
          await this.handleTaskMessage(task);
        }
      } catch (error) {
        console.error(`[${this.agentId}] ❌ Error checking task queue:`, error.message);
      }
    }, 2000); // Check every 2 seconds
  }

  async stopCoordinationTest() {
    console.log(`[${this.agentId}] 🛑 Stopping coordination test...`);

    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Send final report
    const report = {
      id: `final-report-${Date.now()}`,
      type: 'agent-final-report',
      sender: this.agentId,
      container: this.containerName,
      timestamp: Date.now(),
      results: this.testResults,
      averageResponseTime: this.testResults.responseTimes.length > 0
        ? this.testResults.responseTimes.reduce((a, b) => a + b, 0) / this.testResults.responseTimes.length
        : 0
    };

    await this.redis.publish('test:results', JSON.stringify(report));

    // Store report in Redis
    await this.redis.hset('test:agent_reports', this.agentId, JSON.stringify(report));

    console.log(`[${this.agentId}] 📊 Final agent report:`, {
      messagesReceived: this.testResults.messagesReceived,
      tasksCompleted: this.testResults.tasksCompleted,
      coordinationSuccess: this.testResults.coordinationSuccess,
      coordinationFailures: this.testResults.coordinationFailures,
      heartbeatSent: this.testResults.heartbeatSent,
      averageResponseTime: report.averageResponseTime.toFixed(2) + 'ms'
    });

    await this.redis.quit();
    await this.subscriber.quit();
  }
}

// Run agent if this script is executed directly
if (require.main === module) {
  const agent = new RedisCoordinationTestAgent();

  agent.initialize()
    .then(() => agent.startCoordinationTest())
    .then(() => {
      console.log(`🎉 Agent ${agent.agentId} completed coordination test successfully!`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`💥 Agent ${agent.agentId} coordination test failed:`, error);
      process.exit(1);
    });
}

module.exports = RedisCoordinationTestAgent;