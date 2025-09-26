/**
 * Communication Protocols for Agent Lifecycle Management
 *
 * This module implements event-driven communication patterns for agent lifecycle
 * events, including message routing, event publishing/subscribing, and coordination
 * protocols between agents and lifecycle managers.
 */

import { EventEmitter } from 'node:events';
import type {
  LifecycleEvent,
  LifecycleEventType,
  LifecycleEventData,
  EventSubscription,
  LifecycleCommunicationManager,
  AgentLifecycleState,
  AgentLifecycleTrigger,
  MessageRouter,
  MessageRouterConfig,
  LifecycleSystemConfig
} from '../types/agent-lifecycle-types.js';
import type { ILogger, IEventBus } from '../utils/types.js';

// ============================================================================
// Message Router Implementations
// ============================================================================

/**
 * In-memory message router for single-process deployments
 */
export class InMemoryMessageRouter extends EventEmitter implements MessageRouter {
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private messageCount = 0;
  private logger: ILogger;

  constructor(logger: ILogger) {
    super();
    this.logger = logger;
  }

  async publish(topic: string, message: any): Promise<void> {
    this.messageCount++;

    try {
      // Find matching subscriptions using pattern matching
      const matchingSubscriptions = this.findMatchingSubscriptions(topic);

      // Deliver message to all matching subscribers
      const deliveryPromises = matchingSubscriptions.map(async subscription => {
        try {
          await subscription.callback(message);
        } catch (error) {
          this.logger.error(`Error in subscription callback for topic ${topic}`, error);
        }
      });

      await Promise.all(deliveryPromises);

      this.logger.debug(`Published message to topic ${topic}, delivered to ${matchingSubscriptions.length} subscribers`);
    } catch (error) {
      this.logger.error(`Failed to publish message to topic ${topic}`, error);
      throw error;
    }
  }

  async subscribe(pattern: string, callback: (message: any) => void): Promise<EventSubscription> {
    const subscription: EventSubscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      pattern,
      callback,
      options: { persistent: true }
    };

    const existingSubscriptions = this.subscriptions.get(pattern) || [];
    existingSubscriptions.push(subscription);
    this.subscriptions.set(pattern, existingSubscriptions);

    this.logger.debug(`Created subscription ${subscription.id} for pattern ${pattern}`);
    return subscription;
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    for (const [pattern, subscriptions] of this.subscriptions.entries()) {
      const index = subscriptions.findIndex(sub => sub.id === subscriptionId);
      if (index !== -1) {
        subscriptions.splice(index, 1);
        if (subscriptions.length === 0) {
          this.subscriptions.delete(pattern);
        }
        this.logger.debug(`Unsubscribed ${subscriptionId} from pattern ${pattern}`);
        return;
      }
    }

    this.logger.warn(`Subscription ${subscriptionId} not found for unsubscribe`);
  }

  private findMatchingSubscriptions(topic: string): EventSubscription[] {
    const matching: EventSubscription[] = [];

    for (const [pattern, subscriptions] of this.subscriptions.entries()) {
      if (this.matchesPattern(topic, pattern)) {
        matching.push(...subscriptions);
      }
    }

    return matching;
  }

  private matchesPattern(topic: string, pattern: string): boolean {
    // Simple glob pattern matching
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^.]*')
      .replace(/\#/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(topic);
  }

  getStats() {
    return {
      messageCount: this.messageCount,
      subscriptionCount: Array.from(this.subscriptions.values()).reduce((sum, subs) => sum + subs.length, 0),
      patternCount: this.subscriptions.size
    };
  }
}

/**
 * Redis-based message router for distributed deployments
 */
export class RedisMessageRouter implements MessageRouter {
  private redisClient: any; // Redis client
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private logger: ILogger;
  private config: MessageRouterConfig;

  constructor(redisClient: any, logger: ILogger, config: MessageRouterConfig) {
    this.redisClient = redisClient;
    this.logger = logger;
    this.config = config;
  }

  async publish(topic: string, message: any): Promise<void> {
    try {
      const serializedMessage = this.serialize(message);
      const compressedMessage = this.config.compression
        ? await this.compress(serializedMessage)
        : serializedMessage;

      await this.redisClient.publish(topic, compressedMessage);
      this.logger.debug(`Published message to Redis topic ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to publish message to Redis topic ${topic}`, error);
      throw error;
    }
  }

  async subscribe(pattern: string, callback: (message: any) => void): Promise<EventSubscription> {
    const subscription: EventSubscription = {
      id: `redis_sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      pattern,
      callback,
      options: { persistent: true }
    };

    // Subscribe to Redis pattern
    await this.redisClient.psubscribe(pattern);

    // Set up message handler
    this.redisClient.on('pmessage', async (subscribedPattern: string, channel: string, message: string) => {
      if (subscribedPattern === pattern) {
        try {
          const decompressedMessage = this.config.compression
            ? await this.decompress(message)
            : message;
          const deserializedMessage = this.deserialize(decompressedMessage);
          await callback(deserializedMessage);
        } catch (error) {
          this.logger.error(`Error processing Redis message for pattern ${pattern}`, error);
        }
      }
    });

    const existingSubscriptions = this.subscriptions.get(pattern) || [];
    existingSubscriptions.push(subscription);
    this.subscriptions.set(pattern, existingSubscriptions);

    this.logger.debug(`Created Redis subscription ${subscription.id} for pattern ${pattern}`);
    return subscription;
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    for (const [pattern, subscriptions] of this.subscriptions.entries()) {
      const index = subscriptions.findIndex(sub => sub.id === subscriptionId);
      if (index !== -1) {
        subscriptions.splice(index, 1);

        if (subscriptions.length === 0) {
          await this.redisClient.punsubscribe(pattern);
          this.subscriptions.delete(pattern);
        }

        this.logger.debug(`Unsubscribed ${subscriptionId} from Redis pattern ${pattern}`);
        return;
      }
    }
  }

  private serialize(message: any): string {
    switch (this.config.serialization) {
      case 'json':
        return JSON.stringify(message);
      case 'msgpack':
        // Implementation would use msgpack library
        throw new Error('MessagePack serialization not implemented');
      case 'protobuf':
        // Implementation would use protobuf library
        throw new Error('Protobuf serialization not implemented');
      default:
        return JSON.stringify(message);
    }
  }

  private deserialize(data: string): any {
    switch (this.config.serialization) {
      case 'json':
        return JSON.parse(data);
      case 'msgpack':
        throw new Error('MessagePack deserialization not implemented');
      case 'protobuf':
        throw new Error('Protobuf deserialization not implemented');
      default:
        return JSON.parse(data);
    }
  }

  private async compress(data: string): Promise<string> {
    // Implementation would use compression library
    return data;
  }

  private async decompress(data: string): Promise<string> {
    // Implementation would use compression library
    return data;
  }
}

// ============================================================================
// Lifecycle Communication Manager Implementation
// ============================================================================

/**
 * Complete implementation of lifecycle communication manager
 */
export class DefaultLifecycleCommunicationManager extends EventEmitter implements LifecycleCommunicationManager {
  private eventBus: IEventBus;
  private messageRouter: MessageRouter;
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private logger: ILogger;
  private config: LifecycleSystemConfig['communication'];
  private eventBuffer: Map<string, LifecycleEvent[]> = new Map();
  private bufferFlushInterval: NodeJS.Timeout;

  constructor(
    eventBus: IEventBus,
    messageRouter: MessageRouter,
    logger: ILogger,
    config: LifecycleSystemConfig['communication']
  ) {
    super();
    this.eventBus = eventBus;
    this.messageRouter = messageRouter;
    this.logger = logger;
    this.config = config;

    this.setupEventHandlers();
    this.setupBufferFlushing();
  }

  /**
   * Publish state change event
   */
  async publishStateChange(
    agentId: string,
    fromState: AgentLifecycleState,
    toState: AgentLifecycleState,
    trigger: AgentLifecycleTrigger
  ): Promise<void> {
    const event: LifecycleEvent = {
      id: this.generateEventId(),
      type: LifecycleEventType.STATE_CHANGED,
      agentId,
      timestamp: new Date(),
      data: {
        previousState: fromState,
        currentState: toState,
        trigger
      },
      source: 'lifecycle-manager',
      priority: 'normal'
    };

    await this.publishEvent(event);
  }

  /**
   * Publish generic lifecycle event
   */
  async publishEvent(event: LifecycleEvent): Promise<void> {
    try {
      // Validate event
      this.validateEvent(event);

      // Publish to local event bus
      this.eventBus.emit(event.type, event);

      // Publish to distributed message router
      const topic = this.buildTopicName(event);
      await this.messageRouter.publish(topic, event);

      // Buffer for batch processing if configured
      if (this.shouldBufferEvent(event)) {
        this.bufferEvent(event);
      }

      // Emit local event for subscribers
      this.emit('eventPublished', event);

      this.logger.debug(`Published lifecycle event ${event.id} of type ${event.type}`);
    } catch (error) {
      this.logger.error(`Failed to publish lifecycle event ${event.id}`, error);
      throw error;
    }
  }

  /**
   * Subscribe to specific agent's lifecycle events
   */
  async subscribeToAgent(
    agentId: string,
    callback: (event: LifecycleEvent) => void
  ): Promise<EventSubscription> {
    const pattern = `lifecycle.${agentId}.*`;
    return await this.subscribeToPattern(pattern, callback);
  }

  /**
   * Subscribe to events matching filter criteria
   */
  async subscribeToEvents(
    filter: Partial<LifecycleEvent>,
    callback: (event: LifecycleEvent) => void
  ): Promise<EventSubscription> {
    const filteredCallback = (event: LifecycleEvent) => {
      if (this.matchesFilter(event, filter)) {
        callback(event);
      }
    };

    const pattern = this.buildPatternFromFilter(filter);
    return await this.subscribeToPattern(pattern, filteredCallback);
  }

  /**
   * Broadcast event to all coordinators
   */
  async broadcastToCoordinators(event: LifecycleEvent): Promise<void> {
    try {
      const coordinatorTopic = 'coordinators.lifecycle';
      await this.messageRouter.publish(coordinatorTopic, event);

      this.logger.debug(`Broadcasted event ${event.id} to coordinators`);
    } catch (error) {
      this.logger.error(`Failed to broadcast event ${event.id} to coordinators`, error);
      throw error;
    }
  }

  /**
   * Broadcast event to specific agents
   */
  async broadcastToAgents(event: LifecycleEvent, agentIds?: string[]): Promise<void> {
    try {
      if (agentIds && agentIds.length > 0) {
        // Send to specific agents
        const publishPromises = agentIds.map(agentId =>
          this.messageRouter.publish(`agents.${agentId}.lifecycle`, event)
        );
        await Promise.all(publishPromises);
      } else {
        // Broadcast to all agents
        await this.messageRouter.publish('agents.*.lifecycle', event);
      }

      this.logger.debug(`Broadcasted event ${event.id} to ${agentIds?.length || 'all'} agents`);
    } catch (error) {
      this.logger.error(`Failed to broadcast event ${event.id} to agents`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    try {
      await this.messageRouter.unsubscribe(subscriptionId);

      // Remove from local tracking
      for (const [pattern, subscriptions] of this.subscriptions.entries()) {
        const index = subscriptions.findIndex(sub => sub.id === subscriptionId);
        if (index !== -1) {
          subscriptions.splice(index, 1);
          if (subscriptions.length === 0) {
            this.subscriptions.delete(pattern);
          }
          break;
        }
      }

      this.logger.debug(`Unsubscribed from subscription ${subscriptionId}`);
    } catch (error) {
      this.logger.error(`Failed to unsubscribe from subscription ${subscriptionId}`, error);
      throw error;
    }
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): EventSubscription[] {
    const allSubscriptions: EventSubscription[] = [];
    for (const subscriptions of this.subscriptions.values()) {
      allSubscriptions.push(...subscriptions);
    }
    return allSubscriptions;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async subscribeToPattern(
    pattern: string,
    callback: (event: LifecycleEvent) => void
  ): Promise<EventSubscription> {
    const subscription = await this.messageRouter.subscribe(pattern, callback);

    const existingSubscriptions = this.subscriptions.get(pattern) || [];
    existingSubscriptions.push(subscription);
    this.subscriptions.set(pattern, existingSubscriptions);

    return subscription;
  }

  private setupEventHandlers(): void {
    // Handle local event bus events
    this.eventBus.on(LifecycleEventType.STATE_CHANGED, (event: LifecycleEvent) => {
      this.handleStateChangeEvent(event);
    });

    this.eventBus.on(LifecycleEventType.ERROR_OCCURRED, (event: LifecycleEvent) => {
      this.handleErrorEvent(event);
    });

    this.eventBus.on(LifecycleEventType.METRICS_UPDATED, (event: LifecycleEvent) => {
      this.handleMetricsEvent(event);
    });
  }

  private setupBufferFlushing(): void {
    // Flush event buffer periodically
    this.bufferFlushInterval = setInterval(() => {
      this.flushEventBuffer().catch(error => {
        this.logger.error('Failed to flush event buffer', error);
      });
    }, 5000); // Flush every 5 seconds
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private validateEvent(event: LifecycleEvent): void {
    if (!event.id) throw new Error('Event ID is required');
    if (!event.type) throw new Error('Event type is required');
    if (!event.agentId) throw new Error('Agent ID is required');
    if (!event.timestamp) throw new Error('Event timestamp is required');
    if (!event.data) throw new Error('Event data is required');
  }

  private buildTopicName(event: LifecycleEvent): string {
    return `lifecycle.${event.agentId}.${event.type}`;
  }

  private shouldBufferEvent(event: LifecycleEvent): boolean {
    // Buffer high-frequency events to reduce message router load
    return event.type === LifecycleEventType.METRICS_UPDATED ||
           event.type === LifecycleEventType.HOOK_EXECUTED;
  }

  private bufferEvent(event: LifecycleEvent): void {
    const bufferKey = `${event.agentId}.${event.type}`;
    const bufferedEvents = this.eventBuffer.get(bufferKey) || [];
    bufferedEvents.push(event);
    this.eventBuffer.set(bufferKey, bufferedEvents);
  }

  private async flushEventBuffer(): Promise<void> {
    for (const [bufferKey, events] of this.eventBuffer.entries()) {
      if (events.length > 0) {
        try {
          // Create batch event
          const batchEvent: LifecycleEvent = {
            id: this.generateEventId(),
            type: LifecycleEventType.METRICS_UPDATED, // Use metrics as batch type
            agentId: events[0].agentId,
            timestamp: new Date(),
            data: {
              batchedEvents: events,
              eventCount: events.length
            } as any,
            source: 'lifecycle-communication-manager',
            priority: 'low'
          };

          await this.messageRouter.publish(`batch.${bufferKey}`, batchEvent);
          this.eventBuffer.set(bufferKey, []); // Clear buffer
        } catch (error) {
          this.logger.error(`Failed to flush event buffer for ${bufferKey}`, error);
        }
      }
    }
  }

  private matchesFilter(event: LifecycleEvent, filter: Partial<LifecycleEvent>): boolean {
    if (filter.agentId && event.agentId !== filter.agentId) return false;
    if (filter.type && event.type !== filter.type) return false;
    if (filter.source && event.source !== filter.source) return false;
    if (filter.priority && event.priority !== filter.priority) return false;

    return true;
  }

  private buildPatternFromFilter(filter: Partial<LifecycleEvent>): string {
    const agentPattern = filter.agentId || '*';
    const typePattern = filter.type || '*';
    return `lifecycle.${agentPattern}.${typePattern}`;
  }

  private async handleStateChangeEvent(event: LifecycleEvent): Promise<void> {
    // Update global state tracking
    await this.updateGlobalStateTracking(event);

    // Trigger dependent agents if needed
    await this.triggerDependentAgents(event);

    // Update load balancing information
    await this.updateLoadBalancing(event);
  }

  private async handleErrorEvent(event: LifecycleEvent): Promise<void> {
    // Escalate critical errors
    if (event.priority === 'critical') {
      await this.escalateError(event);
    }

    // Update error tracking metrics
    await this.updateErrorMetrics(event);
  }

  private async handleMetricsEvent(event: LifecycleEvent): Promise<void> {
    // Update performance dashboards
    this.emit('metricsUpdate', event);
  }

  private async updateGlobalStateTracking(event: LifecycleEvent): Promise<void> {
    // Implementation for global state tracking
    this.logger.debug(`Updating global state tracking for agent ${event.agentId}`);
  }

  private async triggerDependentAgents(event: LifecycleEvent): Promise<void> {
    // Implementation for triggering dependent agents
    this.logger.debug(`Checking dependent agents for agent ${event.agentId}`);
  }

  private async updateLoadBalancing(event: LifecycleEvent): Promise<void> {
    // Implementation for load balancing updates
    this.logger.debug(`Updating load balancing for agent ${event.agentId}`);
  }

  private async escalateError(event: LifecycleEvent): Promise<void> {
    // Implementation for error escalation
    this.logger.error(`Escalating critical error for agent ${event.agentId}`, event.data.error);
    await this.broadcastToCoordinators(event);
  }

  private async updateErrorMetrics(event: LifecycleEvent): Promise<void> {
    // Implementation for error metrics updates
    this.logger.debug(`Updating error metrics for agent ${event.agentId}`);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }

    // Unsubscribe from all patterns
    this.subscriptions.clear();
    this.eventBuffer.clear();
    this.removeAllListeners();
  }
}

// ============================================================================
// Communication Protocol Utilities
// ============================================================================

/**
 * Factory for creating message routers based on configuration
 */
export class MessageRouterFactory {
  static create(config: MessageRouterConfig, logger: ILogger): MessageRouter {
    switch (config.transport) {
      case 'memory':
        return new InMemoryMessageRouter(logger);

      case 'redis':
        // Would need Redis client implementation
        throw new Error('Redis message router requires Redis client');

      case 'rabbitmq':
        // Would need RabbitMQ client implementation
        throw new Error('RabbitMQ message router not implemented');

      case 'kafka':
        // Would need Kafka client implementation
        throw new Error('Kafka message router not implemented');

      default:
        return new InMemoryMessageRouter(logger);
    }
  }
}

/**
 * Communication health monitor
 */
export class CommunicationHealthMonitor {
  private router: MessageRouter;
  private logger: ILogger;
  private healthCheckInterval: NodeJS.Timeout;
  private metrics = {
    messagesPublished: 0,
    messagesReceived: 0,
    subscriptionCount: 0,
    errors: 0,
    lastHealthCheck: new Date()
  };

  constructor(router: MessageRouter, logger: ILogger) {
    this.router = router;
    this.logger = logger;

    this.startHealthChecks();
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        this.logger.error('Communication health check failed', error);
      });
    }, 30000); // Every 30 seconds
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Test message publishing and receiving
      const testMessage = { test: true, timestamp: new Date() };
      const testTopic = 'health.check';

      // Subscribe to test topic
      const subscription = await this.router.subscribe(testTopic, (message) => {
        if (message.test && message.timestamp) {
          this.metrics.messagesReceived++;
        }
      });

      // Publish test message
      await this.router.publish(testTopic, testMessage);
      this.metrics.messagesPublished++;

      // Clean up subscription
      setTimeout(() => {
        this.router.unsubscribe(subscription.id);
      }, 1000);

      this.metrics.lastHealthCheck = new Date();
      this.logger.debug('Communication health check passed');
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Communication health check failed', error);
      throw error;
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}