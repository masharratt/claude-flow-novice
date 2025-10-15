/**
 * Enhanced Redis Messaging Infrastructure for Agent Coordination
 * 
 * Provides a comprehensive messaging layer for real-time agent communication,
 * progress tracking, and coordination with support for:
 * - Granular progress updates with confidence scoring
 * - Agent visibility and status tracking
 * - Swarm-wide coordination and signaling
 * - Secure message authentication and validation
 * - Performance monitoring and analytics
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '../core/logger.js';
import type { LoggingConfig } from '../utils/types.js';
import { 
  EnhancedProgressTracker, 
  TaskProgress, 
  AgentVisibility, 
  SwarmProgressOverview,
  ProgressUpdateMessage,
  REDIS_CHANNELS,
  REDIS_KEYS
} from './enhanced-progress-tracker.js';

// ===== TYPE DEFINITIONS =====

/**
 * Message types for agent coordination
 */
export type MessageType = 
  | 'task_assignment'
  | 'task_progress'
  | 'task_completion'
  | 'task_failure'
  | 'agent_status'
  | 'coordination_request'
  | 'coordination_response'
  | 'swarm_status'
  | 'heartbeat'
  | 'error'
  | 'shutdown';

/**
 * Base message structure
 */
export interface BaseMessage {
  id: string;
  type: MessageType;
  from: string;
  to?: string | string[];
  swarmId: string;
  timestamp: number;
  payload: any;
  priority: 'low' | 'normal' | 'high' | 'critical';
  signature?: string;
  metadata?: {
    retryCount?: number;
    maxRetries?: number;
    timeout?: number;
    correlationId?: string;
    expiresAt?: number;
  };
}

/**
 * Agent coordination message
 */
export interface CoordinationMessage extends BaseMessage {
  type: 'coordination_request' | 'coordination_response';
  payload: {
    action: 'handoff' | 'request' | 'approve' | 'reject' | 'block' | 'unblock';
    targetTask?: string;
    reason?: string;
    data?: any;
  };
}

/**
 * Task assignment message
 */
export interface TaskAssignmentMessage extends BaseMessage {
  type: 'task_assignment';
  payload: {
    taskId: string;
    taskType: string;
    taskDescription: string;
    requirements?: string[];
    dependencies?: string[];
    deadline?: number;
    priority: number;
  };
}

/**
 * Heartbeat message for agent health monitoring
 */
export interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
  payload: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    load: number;
    memoryUsage: number;
    cpuUsage: number;
    activeTasks: number;
    lastActivity: number;
  };
}

/**
 * Message delivery options
 */
export interface MessageOptions {
  priority?: 'low' | 'normal' | 'high' | 'critical';
  timeout?: number;
  maxRetries?: number;
  persistent?: boolean;
  encrypt?: boolean;
}

/**
 * Messaging infrastructure configuration
 */
export interface MessagingConfig {
  redisUrl?: string;
  hmacSecret?: string;
  messageRetention?: number;
  heartbeatInterval?: number;
  maxMessageSize?: number;
  rateLimitPerSecond?: number;
  enableEncryption?: boolean;
}

// ===== REDIS MESSAGING INFRASTRUCTURE CLASS =====

export class RedisMessagingInfrastructure extends EventEmitter {
  private redis: RedisClientType;
  private subscriber: RedisClientType;
  private publisher: RedisClientType;
  private logger: Logger;
  private progressTracker: EnhancedProgressTracker;
  private config: Required<MessagingConfig>;
  
  // State management
  private agentId: string;
  private swarmId: string;
  private isInitialized = false;
  private subscriptions = new Map<string, Set<(message: BaseMessage) => void>>();
  private heartbeatInterval?: NodeJS.Timeout;
  private messageQueue = new Map<string, BaseMessage>();
  private rateLimitMap = new Map<string, number[]>();

  constructor(
    agentId: string,
    swarmId: string,
    config: MessagingConfig = {},
    loggerConfig?: LoggingConfig
  ) {
    super();
    
    this.agentId = agentId;
    this.swarmId = swarmId;
    
    // Default configuration
    this.config = {
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      hmacSecret: config.hmacSecret || process.env.HMAC_SECRET || 'default-secret',
      messageRetention: config.messageRetention || 3600000, // 1 hour
      heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
      maxMessageSize: config.maxMessageSize || 1048576, // 1MB
      rateLimitPerSecond: config.rateLimitPerSecond || 100,
      enableEncryption: config.enableEncryption || false
    };

    // Initialize logger
    const logConfig: LoggingConfig = loggerConfig || {
      level: process.env.CLAUDE_FLOW_ENV === 'test' ? 'error' : 'info',
      format: 'json',
      destination: 'console'
    };
    this.logger = new Logger(logConfig, { component: 'RedisMessagingInfrastructure' });

    // Initialize Redis clients
    this.redis = createClient({ url: this.config.redisUrl });
    this.subscriber = createClient({ url: this.config.redisUrl });
    this.publisher = createClient({ url: this.config.redisUrl });

    // Initialize progress tracker
    this.progressTracker = new EnhancedProgressTracker(
      this.config.redisUrl,
      loggerConfig,
      this.config.hmacSecret
    );

    this.setupRedisClients();
  }

  /**
   * Initialize the messaging infrastructure
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Connect all Redis clients
      await Promise.all([
        this.redis.connect(),
        this.subscriber.connect(),
        this.publisher.connect(),
        this.progressTracker.initialize()
      ]);

      // Set up default subscriptions
      await this.setupDefaultSubscriptions();

      // Start heartbeat
      this.startHeartbeat();

      this.isInitialized = true;
      this.logger.info('Redis Messaging Infrastructure initialized', {
        agentId: this.agentId,
        swarmId: this.swarmId,
        redisConnected: true
      });

      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Redis Messaging Infrastructure', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Send a message to specific agents or broadcast to swarm
   */
  async sendMessage(
    type: MessageType,
    payload: any,
    recipients?: string | string[],
    options: MessageOptions = {}
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Messaging infrastructure not initialized');
    }

    const messageId = this.generateMessageId();
    const message: BaseMessage = {
      id: messageId,
      type,
      from: this.agentId,
      to: recipients,
      swarmId: this.swarmId,
      timestamp: Date.now(),
      payload,
      priority: options.priority || 'normal',
      signature: undefined,
      metadata: {
        retryCount: 0,
        maxRetries: options.maxRetries || 3,
        timeout: options.timeout || 30000,
        correlationId: this.generateCorrelationId(),
        expiresAt: Date.now() + (options.timeout || 30000)
      }
    };

    // Validate message
    await this.validateMessage(message);

    // Add signature
    message.signature = this.generateMessageSignature(message);

    // Store message for potential retries
    if (options.persistent !== false) {
      await this.storeMessage(message);
    }

    // Send message
    await this.publishMessage(message);

    this.logger.debug('Message sent', {
      messageId,
      type,
      recipients: recipients || 'broadcast',
      priority: message.priority
    });

    return messageId;
  }

  /**
   * Send task assignment to specific agent
   */
  async sendTaskAssignment(
    agentId: string,
    taskId: string,
    taskType: string,
    taskDescription: string,
    requirements?: string[],
    dependencies?: string[],
    deadline?: number
  ): Promise<string> {
    return await this.sendMessage('task_assignment', {
      taskId,
      taskType,
      taskDescription,
      requirements,
      dependencies,
      deadline,
      priority: this.calculateTaskPriority(taskType, requirements)
    }, agentId, { priority: 'high', persistent: true });
  }

  /**
   * Send coordination request to agent
   */
  async sendCoordinationRequest(
    targetAgentId: string,
    action: CoordinationMessage['payload']['action'],
    targetTask?: string,
    reason?: string,
    data?: any
  ): Promise<string> {
    return await this.sendMessage('coordination_request', {
      action,
      targetTask,
      reason,
      data
    }, targetAgentId, { priority: 'high' });
  }

  /**
   * Send coordination response
   */
  async sendCoordinationResponse(
    targetAgentId: string,
    action: CoordinationMessage['payload']['action'],
    originalMessageId: string,
    reason?: string,
    data?: any
  ): Promise<string> {
    return await this.sendMessage('coordination_response', {
      action,
      originalMessageId,
      reason,
      data
    }, targetAgentId, { priority: 'high' });
  }

  /**
   * Subscribe to messages from specific agents or message types
   */
  async subscribe(
    filter: {
      fromAgents?: string[];
      messageTypes?: MessageType[];
      priority?: ('low' | 'normal' | 'high' | 'critical')[];
    },
    callback: (message: BaseMessage) => void | Promise<void>
  ): Promise<void> {
    const subscriptionKey = JSON.stringify(filter);
    
    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, new Set());
    }
    
    this.subscriptions.get(subscriptionKey)!.add(callback);

    // Subscribe to relevant Redis channels
    const channels = this.getChannelsForFilter(filter);
    for (const channel of channels) {
      await this.subscriber.subscribe(channel, async (message) => {
        try {
          const parsedMessage: BaseMessage = JSON.parse(message);
          
          // Apply filter
          if (!this.matchesFilter(parsedMessage, filter)) return;
          
          // Validate signature
          if (!this.validateMessageSignature(parsedMessage)) {
            this.logger.warn('Invalid message signature received', {
              messageId: parsedMessage.id,
              from: parsedMessage.from
            });
            return;
          }
          
          // Check expiration
          if (parsedMessage.metadata?.expiresAt && Date.now() > parsedMessage.metadata.expiresAt) {
            this.logger.debug('Expired message ignored', {
              messageId: parsedMessage.id
            });
            return;
          }
          
          await callback(parsedMessage);
        } catch (error) {
          this.logger.error('Error processing subscribed message', {
            error: error instanceof Error ? error.message : String(error),
            channel
          });
        }
      });
    }

    this.logger.debug('Subscribed to messages', { filter });
  }

  /**
   * Unsubscribe from messages
   */
  async unsubscribe(
    filter: Record<string, string[]>,
    callback?: (message: BaseMessage) => void
  ): Promise<void> {
    const subscriptionKey = JSON.stringify(filter);
    const subscriptions = this.subscriptions.get(subscriptionKey);
    
    if (subscriptions) {
      if (callback) {
        subscriptions.delete(callback);
      } else {
        subscriptions.clear();
      }
      
      if (subscriptions.size === 0) {
        this.subscriptions.delete(subscriptionKey);
      }
    }
  }

  /**
   * Get progress tracker instance
   */
  getProgressTracker(): EnhancedProgressTracker {
    return this.progressTracker;
  }

  /**
   * Get agent visibility information
   */
  async getAgentVisibility(agentId?: string): Promise<AgentVisibility | null> {
    if (agentId) {
      return await this.progressTracker.getAgentVisibility(agentId);
    }
    
    // Return current agent's visibility
    return await this.progressTracker.getAgentVisibility(this.agentId);
  }

  /**
   * Get swarm progress overview
   */
  async getSwarmOverview(): Promise<SwarmProgressOverview | null> {
    return await this.progressTracker.getSwarmOverview(this.swarmId);
  }

  /**
   * Update current agent's visibility
   */
  async updateAgentVisibility(updates: Partial<AgentVisibility>): Promise<void> {
    await this.progressTracker.updateAgentVisibility(this.agentId, updates);
  }

  /**
   * Broadcast agent status to swarm
   */
  async broadcastStatus(status: AgentVisibility['status'], details?: any): Promise<void> {
    await this.sendMessage('agent_status', {
      status,
      details,
      timestamp: Date.now()
    }, undefined, { priority: 'normal' });

    await this.updateAgentVisibility({ status });
  }

  /**
   * Get message history for agent or swarm
   */
  async getMessageHistory(
    filter: {
      agentId?: string;
      messageTypes?: MessageType[];
      timeRange?: { start: number; end: number };
      limit?: number;
    }
  ): Promise<BaseMessage[]> {
    const pattern = filter.agentId 
      ? `messages:${this.swarmId}:${filter.agentId}:*`
      : `messages:${this.swarmId}:*`;
    
    const keys = await this.redis.keys(pattern);
    const messages: BaseMessage[] = [];

    for (const key of keys.slice(0, filter.limit || 100)) {
      const messageData = await this.redis.get(key);
      if (messageData) {
        const message: BaseMessage = JSON.parse(messageData);
        
        // Apply filters
        if (filter.messageTypes && !filter.messageTypes.includes(message.type)) continue;
        if (filter.timeRange) {
          if (message.timestamp < filter.timeRange.start || message.timestamp > filter.timeRange.end) continue;
        }
        
        messages.push(message);
      }
    }

    return messages.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Cleanup resources and shutdown
   */
  async cleanup(): Promise<void> {
    try {
      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      // Send shutdown message
      if (this.isInitialized) {
        await this.sendMessage('shutdown', {
          reason: 'Agent shutdown',
          timestamp: Date.now()
        }, undefined, { priority: 'normal' });
      }

      // Cleanup resources
      await Promise.all([
        this.progressTracker.cleanup(),
        this.redis.quit(),
        this.subscriber.quit(),
        this.publisher.quit()
      ]);

      this.subscriptions.clear();
      this.messageQueue.clear();
      this.rateLimitMap.clear();
      this.isInitialized = false;

      this.logger.info('Redis Messaging Infrastructure cleaned up');
    } catch (error) {
      this.logger.error('Error during cleanup', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ===== PRIVATE METHODS =====

  private setupRedisClients(): void {
    const setupClient = (client: RedisClientType, name: string) => {
      client.on('error', (err) => {
        this.logger.error(`${name} client error`, { error: err.message });
      });

      client.on('connect', () => {
        this.logger.debug(`${name} client connected`);
      });

      client.on('disconnect', () => {
        this.logger.warn(`${name} client disconnected`);
      });
    };

    setupClient(this.redis, 'Main Redis');
    setupClient(this.subscriber, 'Redis Subscriber');
    setupClient(this.publisher, 'Redis Publisher');
  }

  private async setupDefaultSubscriptions(): Promise<void> {
    // Subscribe to agent-specific messages
    await this.subscriber.subscribe(`agent:${this.agentId}:messages`, async (message) => {
      try {
        const parsedMessage: BaseMessage = JSON.parse(message);
        await this.handleIncomingMessage(parsedMessage);
      } catch (error) {
        this.logger.error('Error handling agent message', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Subscribe to swarm-wide messages
    await this.subscriber.subscribe(`swarm:${this.swarmId}:broadcast`, async (message) => {
      try {
        const parsedMessage: BaseMessage = JSON.parse(message);
        if (parsedMessage.to === undefined || parsedMessage.to === this.agentId) {
          await this.handleIncomingMessage(parsedMessage);
        }
      } catch (error) {
        this.logger.error('Error handling broadcast message', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Subscribe to coordination messages
    await this.subscriber.subscribe(`swarm:${this.swarmId}:coordination`, async (message) => {
      try {
        const parsedMessage: BaseMessage = JSON.parse(message);
        if (parsedMessage.type === 'coordination_request' || parsedMessage.type === 'coordination_response') {
          await this.handleIncomingMessage(parsedMessage);
        }
      } catch (error) {
        this.logger.error('Error handling coordination message', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  private async handleIncomingMessage(message: BaseMessage): Promise<void> {
    // Update agent activity
    await this.updateAgentActivity(message.from);

    // Emit message event
    this.emit('message', message);

    // Handle specific message types
    switch (message.type) {
      case 'task_assignment':
        this.emit('task-assigned', message);
        break;
      case 'coordination_request':
        this.emit('coordination-request', message);
        break;
      case 'coordination_response':
        this.emit('coordination-response', message);
        break;
      case 'heartbeat':
        this.emit('heartbeat', message);
        break;
      case 'shutdown':
        this.emit('agent-shutdown', message);
        break;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        const heartbeat: HeartbeatMessage = {
          id: this.generateMessageId(),
          type: 'heartbeat',
          from: this.agentId,
          swarmId: this.swarmId,
          timestamp: Date.now(),
          payload: {
            status: 'healthy',
            load: await this.getCurrentLoad(),
            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
            cpuUsage: 0, // Would need to implement CPU monitoring
            activeTasks: (await this.progressTracker.getActiveTasks(this.agentId)).length,
            lastActivity: Date.now()
          },
          priority: 'low'
        };

        await this.publisher.publish(
          `swarm:${this.swarmId}:heartbeat`,
          JSON.stringify(heartbeat)
        );
      } catch (error) {
        this.logger.error('Error sending heartbeat', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.heartbeatInterval);
  }

  private async validateMessage(message: BaseMessage): Promise<void> {
    // Size validation
    const messageSize = JSON.stringify(message).length;
    if (messageSize > this.config.maxMessageSize) {
      throw new Error(`Message size ${messageSize} exceeds maximum ${this.config.maxMessageSize}`);
    }

    // Rate limiting
    const key = `${message.from}:${Math.floor(Date.now() / 1000)}`;
    const requests = this.rateLimitMap.get(key) || [];
    requests.push(Date.now());
    
    if (requests.length > this.config.rateLimitPerSecond) {
      throw new Error(`Rate limit exceeded for agent ${message.from}`);
    }
    
    this.rateLimitMap.set(key, requests);
    
    // Cleanup old rate limit entries
    setTimeout(() => {
      this.rateLimitMap.delete(key);
    }, 5000);
  }

  private generateMessageSignature(message: BaseMessage): string {
    const crypto = require('crypto');
    const payload = JSON.stringify({
      id: message.id,
      type: message.type,
      from: message.from,
      swarmId: message.swarmId,
      timestamp: message.timestamp
    });
    
    return crypto.createHmac('sha256', this.config.hmacSecret)
                  .update(payload)
                  .digest('hex');
  }

  private validateMessageSignature(message: BaseMessage): boolean {
    if (!message.signature) return false;
    
    const expectedSignature = this.generateMessageSignature(message);
    return message.signature === expectedSignature;
  }

  private async storeMessage(message: BaseMessage): Promise<void> {
    const key = `messages:${message.swarmId}:${message.from}:${message.id}`;
    await this.redis.setex(
      key,
      Math.ceil(this.config.messageRetention / 1000),
      JSON.stringify(message)
    );
  }

  private async publishMessage(message: BaseMessage): Promise<void> {
    const messageData = JSON.stringify(message);

    if (message.to) {
      // Send to specific agents
      const recipients = Array.isArray(message.to) ? message.to : [message.to];
      for (const recipient of recipients) {
        await this.publisher.publish(`agent:${recipient}:messages`, messageData);
      }
    } else {
      // Broadcast to swarm
      await this.publisher.publish(`swarm:${message.swarmId}:broadcast`, messageData);
    }

    // Also publish to coordination channel if relevant
    if (['coordination_request', 'coordination_response'].includes(message.type)) {
      await this.publisher.publish(`swarm:${message.swarmId}:coordination`, messageData);
    }
  }

  private getChannelsForFilter(filter: Record<string, string[]>): string[] {
    const channels: string[] = [];

    if (filter.fromAgents) {
      // Subscribe to specific agent channels
      for (const agentId of filter.fromAgents) {
        channels.push(`agent:${agentId}:messages`);
      }
    } else {
      // Subscribe to all agent and swarm channels
      channels.push(`agent:${this.agentId}:messages`);
      channels.push(`swarm:${this.swarmId}:broadcast`);
      channels.push(`swarm:${this.swarmId}:coordination`);
    }

    return channels;
  }

  private matchesFilter(message: BaseMessage, filter: Record<string, string[]>): boolean {
    if (filter.fromAgents && !filter.fromAgents.includes(message.from)) return false;
    if (filter.messageTypes && !filter.messageTypes.includes(message.type)) return false;
    if (filter.priority && !filter.priority.includes(message.priority)) return false;
    
    return true;
  }

  private generateMessageId(): string {
    return `msg-${this.agentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateTaskPriority(taskType: string, requirements?: string[]): number {
    // Simple priority calculation based on task type and requirements
    const basePriority = {
      'critical': 10,
      'urgent': 8,
      'high': 6,
      'normal': 4,
      'low': 2
    }[taskType.toLowerCase()] || 4;

    const requirementBonus = (requirements?.length || 0) * 0.5;
    return Math.min(10, basePriority + requirementBonus);
  }

  private async getCurrentLoad(): Promise<number> {
    const activeTasks = await this.progressTracker.getActiveTasks(this.agentId);
    return activeTasks.length / 5; // Normalize to 0-1 range (assuming max 5 concurrent tasks)
  }

  private async updateAgentActivity(agentId: string): Promise<void> {
    const key = `agent:activity:${agentId}`;
    await this.redis.setex(key, 300, Date.now().toString()); // 5 minutes TTL
  }
}

// ===== FACTORY FUNCTION =====

export function createRedisMessagingInfrastructure(
  agentId: string,
  swarmId: string,
  config?: MessagingConfig,
  loggerConfig?: LoggingConfig
): RedisMessagingInfrastructure {
  return new RedisMessagingInfrastructure(agentId, swarmId, config, loggerConfig);
}

// ===== EXPORTS =====

export default RedisMessagingInfrastructure;