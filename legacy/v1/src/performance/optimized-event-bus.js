/**
 * Optimized Event Bus with Redis Pub/Sub Enhancements
 * Provides high-performance event distribution with 30% latency reduction target
 */

import { EventEmitter } from 'events';
import { connectRedis } from '../cli/utils/redis-client.js';
import { performance } from 'perf_hooks';

export class OptimizedEventBus extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      redis: {
        host: 'localhost',
        port: 6379,
        database: 2, // Dedicated database for events
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000
      },
      performance: {
        batchSize: 100,
        batchTimeout: 10, // ms
        compressionThreshold: 1024, // bytes
        enableMetrics: true,
        metricsInterval: 1000 // 1 second
      },
      channels: {
        swarm: 'swarm:phase-4:performance',
        metrics: 'swarm:phase-4:metrics',
        alerts: 'swarm:phase-4:alerts'
      },
      ...config
    };

    this.redisClient = null;
    this.redisSubscriber = null;
    this.messageQueue = [];
    this.batchTimer = null;
    this.metrics = {
      messagesPublished: 0,
      messagesReceived: 0,
      totalLatency: 0,
      batchCount: 0,
      errors: 0,
      throughput: 0
    };
    this.metricsHistory = [];
    this.active = false;
    this.startTime = null;
  }

  /**
   * Initialize optimized event bus
   */
  async initialize() {
    console.log('🚀 Initializing Optimized Event Bus...');

    try {
      // Create Redis clients with optimized configuration
      this.redisClient = await this.createOptimizedRedisClient();
      this.redisSubscriber = await this.createOptimizedRedisClient();

      // Setup pub/sub subscriptions
      await this.setupSubscriptions();

      // Start metrics collection
      if (this.config.performance.enableMetrics) {
        this.startMetricsCollection();
      }

      // Enable batching for high-throughput scenarios
      this.enableBatching();

      this.active = true;
      this.startTime = Date.now();

      console.log('✅ Optimized Event Bus initialized successfully');
      console.log(`📡 Subscribed to: ${Object.values(this.config.channels).join(', ')}`);

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize event bus:', error.message);
      throw error;
    }
  }

  /**
   * Create optimized Redis client with connection pooling
   */
  async createOptimizedRedisClient() {
    const client = await connectRedis({
      ...this.config.redis,
      // Performance optimizations
      socket: {
        ...this.config.redis,
        keepAlive: this.config.redis.keepAlive,
        noDelay: true,
        family: 4
      }
    });

    // Add performance monitoring
    client.on('error', (err) => {
      this.metrics.errors++;
      console.warn('🔴 Redis error:', err.message);
    });

    client.on('connect', () => {
      console.log('🟢 Redis connected');
    });

    client.on('ready', () => {
      console.log('🟢 Redis ready');
    });

    return client;
  }

  /**
   * Setup optimized pub/sub subscriptions
   */
  async setupSubscriptions() {
    // Subscribe to swarm events
    await this.redisSubscriber.subscribe(this.config.channels.swarm, (message) => {
      this.handleIncomingMessage(message, this.config.channels.swarm);
    });

    // Subscribe to metrics channel
    await this.redisSubscriber.subscribe(this.config.channels.metrics, (message) => {
      this.handleIncomingMessage(message, this.config.channels.metrics);
    });

    // Subscribe to alerts channel
    await this.redisSubscriber.subscribe(this.config.channels.alerts, (message) => {
      this.handleIncomingMessage(message, this.config.channels.alerts);
    });

    console.log(`📡 Subscribed to ${Object.keys(this.config.channels).length} channels`);
  }

  /**
   * Enable message batching for improved throughput
   */
  enableBatching() {
    this.batchTimer = setInterval(() => {
      if (this.messageQueue.length > 0) {
        this.processBatch();
      }
    }, this.config.performance.batchTimeout);
  }

  /**
   * Process message batch
   */
  async processBatch() {
    if (this.messageQueue.length === 0) return;

    const batch = this.messageQueue.splice(0, this.config.performance.batchSize);
    const startTime = performance.now();

    try {
      // Use Redis pipeline for batch operations
      const pipeline = this.redisClient.multi();

      batch.forEach(({ channel, message, timestamp }) => {
        // Compress large messages
        const processedMessage = this.compressMessage(message);

        pipeline.publish(channel, JSON.stringify({
          ...processedMessage,
          batchTimestamp: timestamp,
          batchSize: batch.length
        }));
      });

      await pipeline.exec();

      const processingTime = performance.now() - startTime;
      this.metrics.batchCount++;
      this.metrics.messagesPublished += batch.length;

      // Log batch performance
      if (batch.length > 1) {
        console.log(`📦 Processed batch of ${batch.length} messages in ${processingTime.toFixed(2)}ms`);
      }

    } catch (error) {
      console.error('❌ Batch processing failed:', error.message);
      this.metrics.errors++;

      // Re-queue failed messages
      this.messageQueue.unshift(...batch);
    }
  }

  /**
   * Publish message with optimization
   */
  async publish(channel, event, priority = 'normal') {
    if (!this.active) {
      throw new Error('Event bus not active');
    }

    const timestamp = performance.now();
    const message = {
      id: this.generateMessageId(),
      timestamp,
      event,
      priority,
      source: 'optimized-event-bus'
    };

    // High priority messages are sent immediately
    if (priority === 'high') {
      return this.publishImmediate(channel, message);
    }

    // Normal and low priority messages are batched
    this.messageQueue.push({ channel, message, timestamp });

    // Process batch if it's full
    if (this.messageQueue.length >= this.config.performance.batchSize) {
      await this.processBatch();
    }

    return message.id;
  }

  /**
   * Publish immediate message for high-priority events
   */
  async publishImmediate(channel, message) {
    const startTime = performance.now();

    try {
      const processedMessage = this.compressMessage(message);
      await this.redisClient.publish(channel, JSON.stringify(processedMessage));

      const latency = performance.now() - startTime;
      this.metrics.messagesPublished++;
      this.metrics.totalLatency += latency;

      return message.id;
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Handle incoming message with optimized processing
   */
  handleIncomingMessage(message, channel) {
    try {
      const startTime = performance.now();
      const parsedMessage = JSON.parse(message);

      // Decompress if needed
      const decompressedMessage = this.decompressMessage(parsedMessage);

      // Update metrics
      const processingLatency = performance.now() - startTime;
      const messageLatency = performance.now() - decompressedMessage.timestamp;

      this.metrics.messagesReceived++;
      this.metrics.totalLatency += messageLatency;

      // Emit locally for immediate processing
      this.emit('message', {
        channel,
        message: decompressedMessage,
        processingLatency,
        messageLatency
      });

      // Emit specific channel events
      this.emit(`channel:${channel}`, decompressedMessage);

    } catch (error) {
      console.error('❌ Message handling failed:', error.message);
      this.metrics.errors++;
    }
  }

  /**
   * Compress message if it exceeds threshold
   */
  compressMessage(message) {
    const serialized = JSON.stringify(message);

    if (serialized.length > this.config.performance.compressionThreshold) {
      return {
        ...message,
        compressed: true,
        originalSize: serialized.length,
        data: this.simpleCompress(serialized)
      };
    }

    return message;
  }

  /**
   * Decompress message if needed
   */
  decompressMessage(message) {
    if (message.compressed) {
      return {
        ...message,
        data: this.simpleDecompress(message.data)
      };
    }
    return message;
  }

  /**
   * Simple compression algorithm (placeholder for real compression)
   */
  simpleCompress(data) {
    // In production, use real compression like zlib
    return Buffer.from(data).toString('base64');
  }

  /**
   * Simple decompression algorithm (placeholder for real decompression)
   */
  simpleDecompress(data) {
    // In production, use real decompression like zlib
    return JSON.parse(Buffer.from(data, 'base64').toString());
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    setInterval(() => {
      this.collectMetrics();
    }, this.config.performance.metricsInterval);
  }

  /**
   * Collect and process performance metrics
   */
  async collectMetrics() {
    const now = Date.now();
    const uptime = now - this.startTime;
    const currentMetrics = {
      timestamp: now,
      uptime,
      messagesPublished: this.metrics.messagesPublished,
      messagesReceived: this.metrics.messagesReceived,
      avgLatency: this.metrics.messagesReceived > 0
        ? (this.metrics.totalLatency / this.metrics.messagesReceived).toFixed(2)
        : 0,
      throughput: uptime > 0
        ? ((this.metrics.messagesReceived / uptime) * 1000).toFixed(2)
        : 0,
      batchCount: this.metrics.batchCount,
      errors: this.metrics.errors,
      queueSize: this.messageQueue.length
    };

    // Store in history
    this.metricsHistory.push(currentMetrics);

    // Keep only last 60 entries (1 minute of history)
    if (this.metricsHistory.length > 60) {
      this.metricsHistory.shift();
    }

    // Publish metrics to Redis channel
    await this.redisClient.publish(
      this.config.channels.metrics,
      JSON.stringify({
        type: 'performance-metrics',
        data: currentMetrics,
        source: 'optimized-event-bus'
      })
    );

    // Emit metrics locally
    this.emit('metrics', currentMetrics);

    // Performance alerts
    this.checkPerformanceAlerts(currentMetrics);
  }

  /**
   * Check for performance issues and generate alerts
   */
  checkPerformanceAlerts(metrics) {
    const alerts = [];

    // High latency alert
    if (parseFloat(metrics.avgLatency) > 50) {
      alerts.push({
        type: 'high-latency',
        severity: 'warning',
        message: `High average latency: ${metrics.avgLatency}ms`,
        threshold: '50ms'
      });
    }

    // Low throughput alert
    if (parseFloat(metrics.throughput) < 100) {
      alerts.push({
        type: 'low-throughput',
        severity: 'warning',
        message: `Low throughput: ${metrics.throughput} msg/sec`,
        threshold: '100 msg/sec'
      });
    }

    // High error rate alert
    const errorRate = metrics.errors > 0 ? (metrics.errors / metrics.messagesReceived) * 100 : 0;
    if (errorRate > 5) {
      alerts.push({
        type: 'high-error-rate',
        severity: 'critical',
        message: `High error rate: ${errorRate.toFixed(2)}%`,
        threshold: '5%'
      });
    }

    // Queue buildup alert
    if (metrics.queueSize > 500) {
      alerts.push({
        type: 'queue-buildup',
        severity: 'warning',
        message: `Large message queue: ${metrics.queueSize} messages`,
        threshold: '500 messages'
      });
    }

    // Send alerts if any
    if (alerts.length > 0) {
      this.sendAlerts(alerts);
    }
  }

  /**
   * Send alerts to alert channel
   */
  async sendAlerts(alerts) {
    for (const alert of alerts) {
      await this.redisClient.publish(
        this.config.channels.alerts,
        JSON.stringify({
          ...alert,
          timestamp: Date.now(),
          source: 'optimized-event-bus'
        })
      );

      // Emit locally
      this.emit('alert', alert);
    }
  }

  /**
   * Generate unique message ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current performance metrics
   */
  getMetrics() {
    return {
      current: this.metrics,
      history: this.metricsHistory.slice(-10), // Last 10 entries
      summary: {
        uptime: this.startTime ? Date.now() - this.startTime : 0,
        active: this.active,
        queueSize: this.messageQueue.length,
        avgLatency: this.metrics.messagesReceived > 0
          ? (this.metrics.totalLatency / this.metrics.messagesReceived).toFixed(2)
          : 0
      }
    };
  }

  /**
   * Optimize event bus performance dynamically
   */
  async optimizePerformance() {
    console.log('🔧 Optimizing event bus performance...');

    const metrics = this.getMetrics();
    const optimizations = [];

    // Optimize batch size based on current load
    if (metrics.summary.queueSize > 200) {
      const newBatchSize = Math.min(this.config.performance.batchSize * 1.5, 200);
      this.config.performance.batchSize = Math.floor(newBatchSize);
      optimizations.push(`Increased batch size to ${this.config.performance.batchSize}`);
    } else if (metrics.summary.queueSize < 50 && this.config.performance.batchSize > 50) {
      const newBatchSize = Math.max(this.config.performance.batchSize * 0.8, 50);
      this.config.performance.batchSize = Math.floor(newBatchSize);
      optimizations.push(`Decreased batch size to ${this.config.performance.batchSize}`);
    }

    // Optimize batch timeout based on latency
    if (parseFloat(metrics.summary.avgLatency) > 20) {
      const newTimeout = Math.max(this.config.performance.batchTimeout * 0.8, 5);
      this.config.performance.batchTimeout = Math.floor(newTimeout);
      optimizations.push(`Reduced batch timeout to ${this.config.performance.batchTimeout}ms`);
    } else if (parseFloat(metrics.summary.avgLatency) < 5) {
      const newTimeout = Math.min(this.config.performance.batchTimeout * 1.2, 50);
      this.config.performance.batchTimeout = Math.floor(newTimeout);
      optimizations.push(`Increased batch timeout to ${this.config.performance.batchTimeout}ms`);
    }

    console.log(`✅ Applied ${optimizations.length} optimizations:`);
    optimizations.forEach(opt => console.log(`   • ${opt}`));

    return optimizations;
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      messagesPublished: 0,
      messagesReceived: 0,
      totalLatency: 0,
      batchCount: 0,
      errors: 0,
      throughput: 0
    };
    this.metricsHistory = [];
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Optimized Event Bus...');

    this.active = false;

    // Process remaining messages
    if (this.messageQueue.length > 0) {
      console.log(`📦 Processing ${this.messageQueue.length} remaining messages...`);
      await this.processBatch();
    }

    // Clear batch timer
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    // Close Redis connections
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit();
    }

    console.log('✅ Event Bus shutdown complete');
  }
}

// Export for use in other modules
export default OptimizedEventBus;