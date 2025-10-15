/**
 * Real-Time Response Channel System
 *
 * Manages dedicated response channels for agent queries with correlation,
 * timeout handling, and performance monitoring
 * Phase 2: Interactive Observation System Component
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '../core/logger.js';
import { v4 as uuidv4 } from 'uuid';

// ===== TYPE DEFINITIONS =====

export interface ResponseChannel {
  id: string;
  requestId: string;
  agentId: string;
  queryType: string;
  createdAt: number;
  timeout: number;
  ttl?: number;
  isActive: boolean;
}

export interface ResponseMessage {
  id: string;
  requestId: string;
  agentId: string;
  type: string;
  data: any;
  timestamp: number;
  processingTime: number;
  metadata?: Record<string, any>;
}

export interface ChannelMetrics {
  totalChannels: number;
  activeChannels: number;
  averageResponseTime: number;
  successRate: number;
  timeoutRate: number;
  channelsByType: Record<string, number>;
  channelsByAgent: Record<string, number>;
}

export interface ChannelConfig {
  defaultTimeout: number;
  defaultTtl: number;
  maxChannels: number;
  cleanupInterval: number;
  metricsInterval: number;
}

// ===== REAL-TIME RESPONSE SYSTEM CLASS =====

export class RealtimeResponseSystem extends EventEmitter {
  private redis: RedisClientType;
  private logger: Logger;
  private config: ChannelConfig;
  private channels: Map<string, ResponseChannel> = new Map();
  private responseHandlers: Map<string, (response: ResponseMessage) => void> = new Map();
  private metrics: ChannelMetrics;
  private cleanupTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;

  constructor(redisClient: RedisClientType, logger: Logger, config?: Partial<ChannelConfig>) {
    super();
    this.redis = redisClient;
    this.logger = logger;
    this.config = {
      defaultTimeout: 5000,
      defaultTtl: 30000,
      maxChannels: 1000,
      cleanupInterval: 60000,
      metricsInterval: 30000,
      ...config
    };

    this.metrics = {
      totalChannels: 0,
      activeChannels: 0,
      averageResponseTime: 0,
      successRate: 0,
      timeoutRate: 0,
      channelsByType: {},
      channelsByAgent: {}
    };

    this.initializeResponseListener();
    this.startCleanupTimer();
    this.startMetricsTimer();
  }

  private async initializeResponseListener(): Promise<void> {
    const subscriber = this.redis.duplicate();
    await subscriber.connect();

    await subscriber.pSubscribe('response:*', (message, channel) => {
      this.handleIncomingResponse(channel, message);
    });

    this.logger.info('Real-time response system initialized');
  }

  private handleIncomingResponse(channel: string, message: string): void {
    try {
      const response: ResponseMessage = JSON.parse(message);
      const channelKey = this.extractChannelKey(channel);

      if (!this.channels.has(channelKey)) {
        this.logger.warn('Received response for unknown channel', { channelKey });
        return;
      }

      this.processResponse(response, channelKey);
    } catch (error) {
      this.logger.error('Failed to process incoming response', { channel, error });
    }
  }

  private extractChannelKey(channel: string): string {
    // Extract channel key from pattern like "response:agent-123:request-456"
    const parts = channel.split(':');
    return parts.slice(1).join(':');
  }

  private processResponse(response: ResponseMessage, channelKey: string): void {
    const channel = this.channels.get(channelKey);
    if (!channel) return;

    const handler = this.responseHandlers.get(response.requestId);
    if (handler) {
      handler(response);
      this.responseHandlers.delete(response.requestId);
    }

    // Update metrics
    this.updateMetrics(response, channel);

    // Mark channel as inactive and schedule cleanup
    channel.isActive = false;
    this.scheduleChannelCleanup(channelKey);

    // Emit response event
    this.emit('response', response);
  }

  private updateMetrics(response: ResponseMessage, channel: ResponseChannel): void {
    this.metrics.totalChannels++;
    this.metrics.activeChannels = Math.max(0, this.metrics.activeChannels - 1);

    // Update response time
    const prevAvg = this.metrics.averageResponseTime;
    const count = this.metrics.totalChannels;
    this.metrics.averageResponseTime = ((prevAvg * (count - 1)) + response.processingTime) / count;

    // Update success rate (assuming non-error responses are successful)
    const isSuccess = response.type !== 'error';
    this.metrics.successRate = ((this.metrics.successRate * (count - 1)) + (isSuccess ? 1 : 0)) / count;

    // Update type and agent metrics
    this.metrics.channelsByType[channel.queryType] =
      (this.metrics.channelsByType[channel.queryType] || 0) + 1;
    this.metrics.channelsByAgent[channel.agentId] =
      (this.metrics.channelsByAgent[channel.agentId] || 0) + 1;
  }

  // ===== CHANNEL MANAGEMENT =====

  async createResponseChannel(
    requestId: string,
    agentId: string,
    queryType: string,
    timeout?: number,
    ttl?: number
  ): Promise<string> {
    const channelId = `${agentId}:${requestId}`;

    // Check channel limit
    if (this.channels.size >= this.config.maxChannels) {
      throw new Error(`Maximum channel limit (${this.config.maxChannels}) reached`);
    }

    const channel: ResponseChannel = {
      id: channelId,
      requestId,
      agentId,
      queryType,
      createdAt: Date.now(),
      timeout: timeout || this.config.defaultTimeout,
      ttl: ttl || this.config.defaultTtl,
      isActive: true
    };

    this.channels.set(channelId, channel);

    // Set TTL in Redis
    const redisKey = `response:${channelId}`;
    await this.redis.setEx(redisKey, Math.ceil(channel.ttl / 1000), JSON.stringify(channel));

    // Update active channel count
    this.metrics.activeChannels++;

    this.logger.debug('Response channel created', { channelId, agentId, queryType });
    return channelId;
  }

  async sendQuery(
    agentId: string,
    queryType: string,
    data: any,
    timeout?: number
  ): Promise<ResponseMessage> {
    const requestId = uuidv4();
    const channelId = await this.createResponseChannel(requestId, agentId, queryType, timeout);

    return new Promise((resolve, reject) => {
      // Set up response handler
      this.responseHandlers.set(requestId, (response: ResponseMessage) => {
        if (response.type === 'error') {
          reject(new Error(response.data.error || 'Query failed'));
        } else {
          resolve(response);
        }
      });

      // Set timeout
      const timeoutMs = timeout || this.config.defaultTimeout;
      const timeoutHandle = setTimeout(() => {
        this.responseHandlers.delete(requestId);
        this.channels.delete(channelId);
        this.metrics.timeoutRate = ((this.metrics.timeoutRate * this.metrics.totalChannels) + 1) / (this.metrics.totalChannels + 1);
        reject(new Error(`Query timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Update response handler to clear timeout
      const originalHandler = this.responseHandlers.get(requestId);
      if (originalHandler) {
        this.responseHandlers.set(requestId, (response: ResponseMessage) => {
          clearTimeout(timeoutHandle);
          originalHandler(response);
        });
      }

      // Send query to agent
      this.sendQueryToAgent(agentId, requestId, queryType, data, channelId);
    });
  }

  private async sendQueryToAgent(
    agentId: string,
    requestId: string,
    queryType: string,
    data: any,
    channelId: string
  ): Promise<void> {
    const query = {
      id: requestId,
      type: queryType,
      data,
      responseChannel: `response:${channelId}`,
      timestamp: Date.now()
    };

    await this.redis.publish(`agent-queries:${agentId}`, JSON.stringify(query));
    this.logger.debug('Query sent to agent', { agentId, requestId, queryType });
  }

  // ===== CHANNEL CLEANUP =====

  private scheduleChannelCleanup(channelKey: string): void {
    // Schedule cleanup after TTL
    setTimeout(() => {
      this.cleanupChannel(channelKey);
    }, this.channels.get(channelKey)?.ttl || this.config.defaultTtl);
  }

  private cleanupChannel(channelKey: string): void {
    const channel = this.channels.get(channelKey);
    if (!channel) return;

    this.channels.delete(channelKey);

    // Remove from Redis
    const redisKey = `response:${channelKey}`;
    this.redis.del(redisKey).catch(err => {
      this.logger.error('Failed to remove channel from Redis', { channelKey, error: err });
    });

    this.logger.debug('Channel cleaned up', { channelKey });
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performChannelCleanup();
    }, this.config.cleanupInterval);
  }

  private async performChannelCleanup(): Promise<void> {
    const now = Date.now();
    const channelsToRemove: string[] = [];

    for (const [channelKey, channel] of this.channels) {
      // Remove inactive channels past their TTL
      if (!channel.isActive && (now - channel.createdAt) > channel.ttl) {
        channelsToRemove.push(channelKey);
      }

      // Remove active channels that have timed out
      if (channel.isActive && (now - channel.createdAt) > channel.timeout) {
        channelsToRemove.push(channelKey);

        // Update timeout metrics
        this.metrics.timeoutRate = ((this.metrics.timeoutRate * this.metrics.totalChannels) + 1) / (this.metrics.totalChannels + 1);
      }
    }

    channelsToRemove.forEach(channelKey => this.cleanupChannel(channelKey));

    if (channelsToRemove.length > 0) {
      this.logger.debug('Channel cleanup completed', {
        removedChannels: channelsToRemove.length,
        totalChannels: this.channels.size
      });
    }
  }

  // ===== METRICS COLLECTION =====

  private startMetricsTimer(): void {
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsInterval);
  }

  private async collectMetrics(): Promise<void> {
    // Update real-time metrics
    this.metrics.activeChannels = Array.from(this.channels.values())
      .filter(channel => channel.isActive).length;

    // Emit metrics event
    this.emit('metrics', this.metrics);

    // Store metrics in Redis for historical analysis
    await this.redis.setEx(
      'response-system:metrics:current',
      3600, // 1 hour TTL
      JSON.stringify(this.metrics)
    );
  }

  // ===== PUBLIC API =====

  getMetrics(): ChannelMetrics {
    return { ...this.metrics };
  }

  async getChannelStatus(channelId: string): Promise<ResponseChannel | null> {
    return this.channels.get(channelId) || null;
  }

  async getActiveChannels(): Promise<ResponseChannel[]> {
    return Array.from(this.channels.values()).filter(channel => channel.isActive);
  }

  async forceCloseChannel(channelId: string): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    // Remove response handler if exists
    this.responseHandlers.delete(channel.requestId);

    // Clean up channel
    this.cleanupChannel(channelId);

    this.logger.info('Channel force closed', { channelId });
    return true;
  }

  // ===== HEALTH AND DIAGNOSTICS =====

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeChannels: number;
    averageResponseTime: number;
    successRate: number;
    redisConnected: boolean;
  }> {
    try {
      // Test Redis connection
      await this.redis.ping();

      const metrics = this.getMetrics();
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      // Determine health status based on metrics
      if (metrics.averageResponseTime > 1000) status = 'degraded';
      if (metrics.averageResponseTime > 5000) status = 'unhealthy';
      if (metrics.successRate < 0.8) status = 'degraded';
      if (metrics.successRate < 0.5) status = 'unhealthy';
      if (metrics.activeChannels > this.config.maxChannels * 0.8) status = 'degraded';
      if (metrics.activeChannels >= this.config.maxChannels) status = 'unhealthy';

      return {
        status,
        activeChannels: metrics.activeChannels,
        averageResponseTime: metrics.averageResponseTime,
        successRate: metrics.successRate,
        redisConnected: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        activeChannels: this.channels.size,
        averageResponseTime: this.metrics.averageResponseTime,
        successRate: this.metrics.successRate,
        redisConnected: false
      };
    }
  }

  // ===== LIFECYCLE MANAGEMENT =====

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down real-time response system');

    // Clear timers
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);

    // Clean up all channels
    const channelKeys = Array.from(this.channels.keys());
    channelKeys.forEach(channelKey => this.cleanupChannel(channelKey));

    // Clear handlers
    this.responseHandlers.clear();

    this.removeAllListeners();
    this.logger.info('Real-time response system shutdown complete');
  }
}

// ===== QUERY BUILDER UTILITIES =====

export class QueryBuilder {
  static buildStateQuery(agentId: string, filters?: Record<string, any>): any {
    return {
      type: 'agent_state',
      agentId,
      filters: filters || {},
      timestamp: Date.now()
    };
  }

  static buildActivityQuery(
    agentId: string,
    timeRange?: { start: number; end: number }
  ): any {
    return {
      type: 'agent_activity',
      agentId,
      timeRange,
      timestamp: Date.now()
    };
  }

  static buildPerformanceQuery(agentId: string, metrics?: string[]): any {
    return {
      type: 'agent_performance',
      agentId,
      metrics: metrics || ['response_time', 'success_rate', 'task_completion'],
      timestamp: Date.now()
    };
  }

  static buildSwarmQuery(swarmId?: string): any {
    return {
      type: 'swarm_overview',
      swarmId,
      timestamp: Date.now()
    };
  }
}