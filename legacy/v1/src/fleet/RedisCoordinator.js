/**
 * RedisCoordinator - Redis pub/sub coordination for fleet management
 *
 * Features:
 * - Redis pub/sub messaging
 * - Fleet-wide communication
 * - Event broadcasting
 * - Message routing
 * - Coordination patterns
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';

/**
 * Redis coordinator configuration
 */
const COORDINATOR_CONFIG = {
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },
  channels: {
    fleet: 'swarm:phase-1:fleet',
    registry: 'swarm:phase-1:registry',
    health: 'swarm:phase-1:health',
    allocation: 'swarm:phase-1:allocation',
    scaling: 'swarm:phase-1:scaling',
    tasks: 'swarm:phase-1:tasks',
    results: 'swarm:phase-1:results',
    coordination: 'swarm:phase-1:coordination',
    discovery: 'swarm:phase-1:discovery'
  },
  patterns: {
    agent: 'swarm:phase-1:agent:*',
    pool: 'swarm:phase-1:pool:*',
    task: 'swarm:phase-1:task:*'
  },
  messageTimeout: 30000,
  maxRetries: 3,
  retryDelay: 1000
};

/**
 * RedisCoordinator class
 */
export class RedisCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...COORDINATOR_CONFIG, ...options };
    this.swarmId = options.swarmId || 'phase-1-foundation-infrastructure';
    this.coordinatorId = `redis-coordinator-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.redis = null;
    this.publisher = null;
    this.subscriber = null;
    this.isInitialized = false;

    this.subscriptions = new Map();
    this.messageHandlers = new Map();
    this.pendingMessages = new Map();
    this.messageHistory = [];
    this.maxHistorySize = 1000;

    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      messagesFailed: 0,
      averageLatency: 0,
      subscribersCount: 0,
      uptime: 0,
      startTime: null
    };
  }

  /**
   * Initialize the Redis coordinator
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing Redis Coordinator' });

      // Initialize Redis connections
      this.redis = createClient(this.config.redis);
      this.publisher = this.redis.duplicate();
      this.subscriber = this.redis.duplicate();

      await Promise.all([
        this.redis.connect(),
        this.publisher.connect(),
        this.subscriber.connect()
      ]);

      // Setup message handling
      await this.setupMessageHandling();

      // Subscribe to default channels
      await this.subscribeToDefaultChannels();

      // Setup pattern subscriptions
      await this.setupPatternSubscriptions();

      this.metrics.startTime = Date.now();
      this.isInitialized = true;

      // Announce coordinator startup
      await this.publish('fleet', {
        type: 'coordinator_started',
        coordinatorId: this.coordinatorId,
        swarmId: this.swarmId,
        timestamp: Date.now(),
        channels: Object.values(this.config.channels)
      });

      this.emit('status', { status: 'running', message: 'Redis Coordinator initialized successfully' });
      console.log(`📡 Redis Coordinator ${this.coordinatorId} initialized for swarm ${this.swarmId}`);

    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Publish message to a channel
   */
  async publish(channel, message, options = {}) {
    this.ensureInitialized();

    try {
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const messageData = {
        id: messageId,
        ...message,
        senderId: this.coordinatorId,
        swarmId: this.swarmId,
        timestamp: Date.now(),
        channel
      };

      // Add to message history
      this.addToHistory(messageData);

      // Track message if response is expected
      if (options.expectResponse) {
        this.pendingMessages.set(messageId, {
          message: messageData,
          timeout: options.timeout || this.config.messageTimeout,
          resolve: options.resolve,
          reject: options.reject
        });

        // Set timeout for response
        setTimeout(() => {
          if (this.pendingMessages.has(messageId)) {
            this.pendingMessages.delete(messageId);
            if (options.reject) {
              options.reject(new Error(`Message ${messageId} timed out`));
            }
            this.metrics.messagesFailed++;
          }
        }, options.timeout || this.config.messageTimeout);
      }

      // Publish message
      const startTime = Date.now();
      await this.publisher.publish(channel, JSON.stringify(messageData));
      const latency = Date.now() - startTime;

      // Update metrics
      this.metrics.messagesSent++;
      this.updateAverageLatency(latency);

      // Emit local event
      this.emit('message_sent', { messageId, channel, message: messageData, latency });

      return messageId;
    } catch (error) {
      this.metrics.messagesFailed++;
      this.emit('error', { type: 'publish_failed', error: error.message, channel });
      throw error;
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel, handler) {
    this.ensureInitialized();

    try {
      await this.subscriber.subscribe(channel, (message) => {
        this.handleMessage(channel, message);
      });

      this.subscriptions.set(channel, handler);
      this.metrics.subscribersCount++;

      this.emit('subscribed', { channel });
      console.log(`📡 Subscribed to channel: ${channel}`);

      return true;
    } catch (error) {
      this.emit('error', { type: 'subscribe_failed', error: error.message, channel });
      throw error;
    }
  }

  /**
   * Subscribe to a pattern
   */
  async pSubscribe(pattern, handler) {
    this.ensureInitialized();

    try {
      await this.subscriber.pSubscribe(pattern, (message, subscribedPattern) => {
        this.handleMessage(subscribedPattern, message);
      });

      this.subscriptions.set(pattern, handler);
      this.metrics.subscribersCount++;

      this.emit('subscribed', { pattern });
      console.log(`📡 Subscribed to pattern: ${pattern}`);

      return true;
    } catch (error) {
      this.emit('error', { type: 'psubscribe_failed', error: error.message, pattern });
      throw error;
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel) {
    this.ensureInitialized();

    try {
      await this.subscriber.unsubscribe(channel);
      this.subscriptions.delete(channel);
      this.metrics.subscribersCount--;

      this.emit('unsubscribed', { channel });
      console.log(`📡 Unsubscribed from channel: ${channel}`);

      return true;
    } catch (error) {
      this.emit('error', { type: 'unsubscribe_failed', error: error.message, channel });
      throw error;
    }
  }

  /**
   * Send request and wait for response
   */
  async request(channel, message, timeout = this.config.messageTimeout) {
    return new Promise((resolve, reject) => {
      this.publish(channel, message, {
        expectResponse: true,
        timeout,
        resolve,
        reject
      });
    });
  }

  /**
   * Broadcast message to multiple channels
   */
  async broadcast(channels, message, options = {}) {
    this.ensureInitialized();

    try {
      const promises = channels.map(channel =>
        this.publish(channel, message, options)
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      this.emit('broadcast_completed', {
        channels,
        successful,
        failed,
        total: channels.length
      });

      return { successful, failed, total: channels.length };
    } catch (error) {
      this.emit('error', { type: 'broadcast_failed', error: error.message, channels });
      throw error;
    }
  }

  /**
   * Send coordinated message with acknowledgment
   */
  async coordinate(target, message, options = {}) {
    this.ensureInitialized();

    try {
      const coordinationId = `coord-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const coordinationMessage = {
        type: 'coordination_request',
        coordinationId,
        target,
        message,
        senderId: this.coordinatorId,
        swarmId: this.swarmId,
        timestamp: Date.now(),
        timeout: options.timeout || this.config.messageTimeout
      };

      // Send coordination request
      await this.publish(this.config.channels.coordination, coordinationMessage);

      // Wait for acknowledgments
      const acknowledgments = await this.waitForAcknowledgments(coordinationId, options);

      return {
        coordinationId,
        acknowledgments,
        message: coordinationMessage
      };
    } catch (error) {
      this.emit('error', { type: 'coordination_failed', error: error.message, target });
      throw error;
    }
  }

  /**
   * Get coordinator metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: this.isInitialized ? Date.now() - this.metrics.startTime : 0,
      subscriptionsCount: this.subscriptions.size,
      pendingMessagesCount: this.pendingMessages.size,
      historySize: this.messageHistory.length
    };
  }

  /**
   * Get message history
   */
  getMessageHistory(limit = 100) {
    return this.messageHistory.slice(-limit);
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions() {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Clear message history
   */
  clearHistory() {
    this.messageHistory = [];
    this.emit('history_cleared');
  }

  /**
   * Close the Redis coordinator
   */
  async close() {
    this.emit('status', { status: 'shutting_down', message: 'Shutting down Redis Coordinator' });

    this.isInitialized = false;

    // Announce shutdown
    try {
      await this.publish('fleet', {
        type: 'coordinator_shutdown',
        coordinatorId: this.coordinatorId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn('Failed to announce shutdown:', error.message);
    }

    // Close Redis connections
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();
    if (this.redis) await this.redis.quit();

    // Clear data
    this.subscriptions.clear();
    this.messageHandlers.clear();
    this.pendingMessages.clear();
    this.messageHistory = [];

    this.emit('status', { status: 'shutdown', message: 'Redis Coordinator shutdown complete' });
    console.log('📡 Redis Coordinator shutdown complete');
  }

  /**
   * Private helper methods
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('RedisCoordinator is not initialized. Call initialize() first.');
    }
  }

  async setupMessageHandling() {
    // Set up message handler for subscriber
    this.subscriber.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on('pmessage', (pattern, channel, message) => {
      this.handleMessage(pattern, message, { pattern, channel });
    });

    // Handle Redis errors
    this.subscriber.on('error', (error) => {
      this.emit('error', { type: 'subscriber_error', error: error.message });
    });

    this.publisher.on('error', (error) => {
      this.emit('error', { type: 'publisher_error', error: error.message });
    });

    this.redis.on('error', (error) => {
      this.emit('error', { type: 'redis_error', error: error.message });
    });
  }

  async subscribeToDefaultChannels() {
    // Subscribe to coordination channels
    await this.subscribe(this.config.channels.coordination, (message) => {
      this.handleCoordinationMessage(message);
    });

    await this.subscribe(this.config.channels.discovery, (message) => {
      this.handleDiscoveryMessage(message);
    });
  }

  async setupPatternSubscriptions() {
    // Subscribe to agent patterns
    await this.pSubscribe(this.config.patterns.agent, (message, pattern) => {
      this.handleAgentMessage(message, pattern);
    });

    // Subscribe to pool patterns
    await this.pSubscribe(this.config.patterns.pool, (message, pattern) => {
      this.handlePoolMessage(message, pattern);
    });
  }

  handleMessage(channel, message, metadata = {}) {
    try {
      const messageData = typeof message === 'string' ? JSON.parse(message) : message;

      // Add to history
      this.addToHistory({
        ...messageData,
        receivedAt: Date.now(),
        channel,
        pattern: metadata.pattern
      });

      // Update metrics
      this.metrics.messagesReceived++;

      // Handle pending messages
      if (messageData.replyTo && this.pendingMessages.has(messageData.replyTo)) {
        const pending = this.pendingMessages.get(messageData.replyTo);
        this.pendingMessages.delete(messageData.replyTo);

        if (pending.resolve) {
          pending.resolve(messageData);
        }
        return;
      }

      // Route to appropriate handler
      const handler = this.subscriptions.get(channel);
      if (handler) {
        handler(messageData);
      }

      // Emit local event
      this.emit('message_received', {
        channel,
        message: messageData,
        pattern: metadata.pattern
      });

    } catch (error) {
      this.emit('error', {
        type: 'message_handling_failed',
        error: error.message,
        channel
      });
    }
  }

  handleCoordinationMessage(message) {
    switch (message.type) {
      case 'coordination_request':
        this.handleCoordinationRequest(message);
        break;
      case 'coordination_response':
        this.handleCoordinationResponse(message);
        break;
      case 'coordination_ack':
        this.handleCoordinationAck(message);
        break;
    }
  }

  handleDiscoveryMessage(message) {
    switch (message.type) {
      case 'agent_discovery':
        this.handleAgentDiscovery(message);
        break;
      case 'pool_discovery':
        this.handlePoolDiscovery(message);
        break;
      case 'service_discovery':
        this.handleServiceDiscovery(message);
        break;
    }
  }

  handleAgentMessage(message, pattern) {
    this.emit('agent_message', { message, pattern });
  }

  handlePoolMessage(message, pattern) {
    this.emit('pool_message', { message, pattern });
  }

  async handleCoordinationRequest(message) {
    // Send acknowledgment
    await this.publish(this.config.channels.coordination, {
      type: 'coordination_ack',
      coordinationId: message.coordinationId,
      senderId: this.coordinatorId,
      target: message.target,
      timestamp: Date.now(),
      status: 'received'
    });
  }

  handleCoordinationResponse(message) {
    this.emit('coordination_response', message);
  }

  handleCoordinationAck(message) {
    this.emit('coordination_acknowledgment', message);
  }

  handleAgentDiscovery(message) {
    this.emit('agent_discovered', message);
  }

  handlePoolDiscovery(message) {
    this.emit('pool_discovered', message);
  }

  handleServiceDiscovery(message) {
    this.emit('service_discovered', message);
  }

  async waitForAcknowledgments(coordinationId, options = {}) {
    const timeout = options.timeout || this.config.messageTimeout;
    const acknowledgments = [];

    return new Promise((resolve) => {
      const handler = (message) => {
        if (message.coordinationId === coordinationId && message.type === 'coordination_ack') {
          acknowledgments.push(message);
        }
      };

      this.on('coordination_acknowledgment', handler);

      setTimeout(() => {
        this.off('coordination_acknowledgment', handler);
        resolve(acknowledgments);
      }, timeout);
    });
  }

  addToHistory(message) {
    this.messageHistory.push(message);

    // Maintain history size
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
  }

  updateAverageLatency(latency) {
    const count = this.metrics.messagesSent;
    this.metrics.averageLatency =
      (this.metrics.averageLatency * (count - 1) + latency) / count;
  }
}

export default RedisCoordinator;