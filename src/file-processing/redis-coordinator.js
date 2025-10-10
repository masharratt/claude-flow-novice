/**
 * Redis-based File Processing Coordinator
 * Coordinates distributed file processing with Redis pub/sub and state management
 */

const Redis = require('ioredis');
const EventEmitter = require('events');
const crypto = require('crypto');

class RedisCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      redis: {
        host: options.redis?.host || 'localhost',
        port: options.redis?.port || 6379,
        db: options.redis?.db || 0,
        ...options.redis
      },
      swarmId: options.swarmId || 'file-processing-optimization',
      heartbeatInterval: options.heartbeatInterval || 5000,
      maxRetries: options.maxRetries || 3,
      ...options
    };

    this.redis = null;
    this.subscriber = null;
    this.publisher = null;
    this.heartbeatTimer = null;
    this.nodeId = this.generateNodeId();
    this.isInitialized = false;

    // Coordination state
    this.state = {
      activeNodes: new Map(),
      taskQueue: [],
      processingTasks: new Map(),
      completedTasks: new Map(),
      metrics: {
        totalProcessed: 0,
        totalErrors: 0,
        throughput: 0,
        lastUpdate: Date.now()
      }
    };

    // Performance tracking
    this.performanceMetrics = {
      startTime: null,
      lastHeartbeat: null,
      messagesProcessed: 0,
      bytesProcessed: 0,
      errorCount: 0
    };
  }

  /**
   * Initialize Redis connections and coordination
   */
  async initialize() {
    try {
      // Initialize Redis connections
      this.redis = new Redis(this.options.redis);
      this.subscriber = new Redis(this.options.redis);
      this.publisher = new Redis(this.options.redis);

      // Test connection
      await this.redis.ping();
      console.log('✅ Redis connection established');

      // Setup pub/sub channels
      await this.setupSubscriptions();

      // Start heartbeat
      this.startHeartbeat();

      // Initialize swarm state
      await this.initializeSwarmState();

      this.isInitialized = true;
      this.performanceMetrics.startTime = Date.now();

      console.log(`🚀 Redis coordinator initialized (Node: ${this.nodeId})`);
      this.emit('initialized', { nodeId: this.nodeId });

    } catch (error) {
      console.error('❌ Failed to initialize Redis coordinator:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Setup Redis pub/sub subscriptions
   */
  async setupSubscriptions() {
    const channels = [
      `${this.options.swarmId}:tasks`,
      `${this.options.swarmId}:status`,
      `${this.options.swarmId}:metrics`,
      `${this.options.swarmId}:heartbeat`,
      `${this.options.swarmId}:coordination`
    ];

    await this.subscriber.subscribe(...channels);

    this.subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        this.handleMessage(channel, data);
      } catch (error) {
        console.error('❌ Failed to parse Redis message:', error);
      }
    });

    console.log(`📡 Subscribed to ${channels.length} coordination channels`);
  }

  /**
   * Handle incoming Redis messages
   */
  handleMessage(channel, data) {
    this.performanceMetrics.messagesProcessed++;

    const channelParts = channel.split(':');
    const messageType = channelParts[channelParts.length - 1];

    switch (messageType) {
      case 'tasks':
        this.handleTaskMessage(data);
        break;
      case 'status':
        this.handleStatusMessage(data);
        break;
      case 'metrics':
        this.handleMetricsMessage(data);
        break;
      case 'heartbeat':
        this.handleHeartbeatMessage(data);
        break;
      case 'coordination':
        this.handleCoordinationMessage(data);
        break;
      default:
        console.warn(`Unknown message type: ${messageType}`);
    }

    this.emit('message', { type: messageType, channel, data });
  }

  /**
   * Handle task distribution messages
   */
  handleTaskMessage(data) {
    const { action, task, nodeId } = data;

    switch (action) {
      case 'assign':
        if (task.nodeId === this.nodeId) {
          this.state.processingTasks.set(task.id, task);
          this.emit('task-assigned', task);
        }
        break;

      case 'complete':
        if (this.state.processingTasks.has(task.id)) {
          this.state.processingTasks.delete(task.id);
          this.state.completedTasks.set(task.id, task);
          this.updateMetrics(task);
          this.emit('task-completed', task);
        }
        break;

      case 'error':
        if (this.state.processingTasks.has(task.id)) {
          this.state.processingTasks.delete(task.id);
          this.performanceMetrics.errorCount++;
          this.emit('task-error', task);
        }
        break;

      case 'queue':
        this.state.taskQueue.push(task);
        this.emit('task-queued', task);
        break;
    }
  }

  /**
   * Handle status updates from other nodes
   */
  handleStatusMessage(data) {
    const { nodeId, status, metrics } = data;

    if (status === 'online') {
      this.state.activeNodes.set(nodeId, {
        nodeId,
        status,
        metrics,
        lastSeen: Date.now()
      });
    } else if (status === 'offline') {
      this.state.activeNodes.delete(nodeId);
    }

    this.emit('node-status', { nodeId, status, metrics });
  }

  /**
   * Handle metrics updates
   */
  handleMetricsMessage(data) {
    const { nodeId, metrics } = data;

    if (this.state.activeNodes.has(nodeId)) {
      const node = this.state.activeNodes.get(nodeId);
      node.metrics = { ...node.metrics, ...metrics };
      node.lastSeen = Date.now();
    }

    this.emit('metrics-update', { nodeId, metrics });
  }

  /**
   * Handle heartbeat messages
   */
  handleHeartbeatMessage(data) {
    const { nodeId, timestamp } = data;

    if (this.state.activeNodes.has(nodeId)) {
      const node = this.state.activeNodes.get(nodeId);
      node.lastSeen = timestamp;
    }

    this.emit('heartbeat', { nodeId, timestamp });
  }

  /**
   * Handle coordination messages
   */
  handleCoordinationMessage(data) {
    const { action, payload } = data;

    switch (action) {
      case 'elect-leader':
        this.handleLeaderElection(payload);
        break;
      case 'rebalance':
        this.handleRebalancing(payload);
        break;
      case 'shutdown':
        this.handleShutdown(payload);
        break;
    }

    this.emit('coordination', { action, payload });
  }

  /**
   * Publish task to Redis
   */
  async publishTask(action, task) {
    if (!this.isInitialized) {
      throw new Error('Redis coordinator not initialized');
    }

    const message = {
      action,
      task,
      nodeId: this.nodeId,
      timestamp: Date.now()
    };

    await this.publisher.publish(
      `${this.options.swarmId}:tasks`,
      JSON.stringify(message)
    );
  }

  /**
   * Publish metrics to Redis
   */
  async publishMetrics(metrics) {
    if (!this.isInitialized) {
      throw new Error('Redis coordinator not initialized');
    }

    const message = {
      nodeId: this.nodeId,
      metrics: {
        ...metrics,
        timestamp: Date.now()
      }
    };

    await this.publisher.publish(
      `${this.options.swarmId}:metrics`,
      JSON.stringify(message)
    );

    // Store detailed metrics in Redis
    await this.redis.hset(
      `${this.options.swarmId}:metrics:${this.nodeId}`,
      'data',
      JSON.stringify(message.metrics)
    );
  }

  /**
   * Publish status update
   */
  async publishStatus(status, metrics = {}) {
    if (!this.isInitialized) {
      throw new Error('Redis coordinator not initialized');
    }

    const message = {
      nodeId: this.nodeId,
      status,
      metrics,
      timestamp: Date.now()
    };

    await this.publisher.publish(
      `${this.options.swarmId}:status`,
      JSON.stringify(message)
    );
  }

  /**
   * Start heartbeat timer
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      try {
        const heartbeat = {
          nodeId: this.nodeId,
          timestamp: Date.now(),
          metrics: {
            processedTasks: this.state.completedTasks.size,
            activeTasks: this.state.processingTasks.size,
            queuedTasks: this.state.taskQueue.length,
            messagesProcessed: this.performanceMetrics.messagesProcessed,
            bytesProcessed: this.performanceMetrics.bytesProcessed,
            errorCount: this.performanceMetrics.errorCount
          }
        };

        await this.publisher.publish(
          `${this.options.swarmId}:heartbeat`,
          JSON.stringify(heartbeat)
        );

        this.performanceMetrics.lastHeartbeat = Date.now();

      } catch (error) {
        console.error('❌ Heartbeat failed:', error);
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Initialize swarm state in Redis
   */
  async initializeSwarmState() {
    const swarmKey = `${this.options.swarmId}:state`;

    // Initialize swarm state if it doesn't exist
    const exists = await this.redis.exists(swarmKey);
    if (!exists) {
      await this.redis.hset(swarmKey, {
        createdAt: Date.now(),
        status: 'initializing',
        nodes: JSON.stringify([this.nodeId])
      });
    }

    // Add this node to the swarm
    await this.redis.hset(swarmKey, `node:${this.nodeId}`, JSON.stringify({
      status: 'online',
      joinedAt: Date.now(),
      metrics: this.getMetrics()
    }));

    // Publish online status
    await this.publishStatus('online', this.getMetrics());
  }

  /**
   * Update local metrics
   */
  updateMetrics(task) {
    if (task.metrics) {
      this.performanceMetrics.bytesProcessed += task.metrics.bytesProcessed || 0;
    }
    this.state.metrics.totalProcessed++;

    // Calculate throughput
    const elapsed = (Date.now() - this.performanceMetrics.startTime) / 1000;
    if (elapsed > 0) {
      this.state.metrics.throughput = this.performanceMetrics.bytesProcessed / elapsed / 1024 / 1024; // MB/s
    }
    this.state.metrics.lastUpdate = Date.now();
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const elapsed = this.performanceMetrics.startTime ?
      (Date.now() - this.performanceMetrics.startTime) / 1000 : 0;

    return {
      nodeId: this.nodeId,
      uptime: elapsed,
      messagesProcessed: this.performanceMetrics.messagesProcessed,
      bytesProcessed: this.performanceMetrics.bytesProcessed,
      errorCount: this.performanceMetrics.errorCount,
      throughput: elapsed > 0 ? this.performanceMetrics.bytesProcessed / elapsed / 1024 / 1024 : 0,
      tasksProcessed: this.state.completedTasks.size,
      tasksActive: this.state.processingTasks.size,
      tasksQueued: this.state.taskQueue.length,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }

  /**
   * Get swarm-wide metrics
   */
  async getSwarmMetrics() {
    if (!this.isInitialized) {
      throw new Error('Redis coordinator not initialized');
    }

    const swarmKey = `${this.options.swarmId}:state`;
    const state = await this.redis.hgetall(swarmKey);

    return {
      swarmId: this.options.swarmId,
      activeNodes: this.state.activeNodes.size,
      totalTasks: this.state.completedTasks.size + this.state.processingTasks.size + this.state.taskQueue.length,
      metrics: this.state.metrics,
      state
    };
  }

  /**
   * Generate unique node ID
   */
  generateNodeId() {
    return `node-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🔄 Shutting down Redis coordinator...');

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Publish offline status
    try {
      await this.publishStatus('offline');
    } catch (error) {
      console.error('Failed to publish offline status:', error);
    }

    // Close Redis connections
    if (this.redis) await this.redis.quit();
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();

    this.isInitialized = false;
    console.log('✅ Redis coordinator shut down');
  }
}

export default RedisCoordinator;