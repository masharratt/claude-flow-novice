/**
 * Transparency Middleware Framework
 *
 * Provides automatic message generation from agent activities,
 * configurable transparency levels, context-aware filtering,
 * and performance impact monitoring
 * Phase 2: Interactive Observation System Component
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '../core/logger.js';
import { v4 as uuidv4 } from 'uuid';

// ===== TYPE DEFINITIONS =====

export type TransparencyLevel = 'minimal' | 'detailed' | 'verbose' | 'debug';

export interface TransparencyConfig {
  level: TransparencyLevel;
  enablePerformanceMonitoring: boolean;
  enableContextFiltering: boolean;
  enableMessageFiltering: boolean;
  maxOverheadPercent: number;
  messageQueueSize: number;
  flushInterval: number;
  excludedPatterns: string[];
  includedPatterns: string[];
}

export interface AgentActivity {
  agentId: string;
  timestamp: number;
  type: string;
  action: string;
  data: any;
  context?: Record<string, any>;
  performance?: {
    duration?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
}

export interface TransparencyMessage {
  id: string;
  level: TransparencyLevel;
  type: 'agent_activity' | 'state_change' | 'performance_metric' | 'error' | 'debug';
  agentId: string;
  timestamp: number;
  title: string;
  description: string;
  data: any;
  context: Record<string, any>;
  tags: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata: {
    processingTime: number;
    originalActivity: string;
    filtered: boolean;
    filterReason?: string;
  };
}

export interface MessageFilter {
  id: string;
  name: string;
  type: 'include' | 'exclude' | 'transform';
  pattern: string | RegExp | Function;
  priority: number;
  enabled: boolean;
  condition?: (message: TransparencyMessage) => boolean;
  transform?: (message: TransparencyMessage) => TransparencyMessage;
}

export interface PerformanceMetrics {
  totalMessagesGenerated: number;
  totalMessagesFiltered: number;
  averageGenerationTime: number;
  averageFilteringTime: number;
  totalOverheadMs: number;
  overheadPercentage: number;
  messagesByLevel: Record<TransparencyLevel, number>;
  messagesByType: Record<string, number>;
  filterEffectiveness: number;
}

// ===== TRANSPARENCY MIDDLEWARE CLASS =====

export class TransparencyMiddleware extends EventEmitter {
  private redis: RedisClientType;
  private logger: Logger;
  private config: TransparencyConfig;
  private filters: MessageFilter[] = [];
  private messageQueue: TransparencyMessage[] = [];
  private flushTimer?: NodeJS.Timeout;
  private metrics: PerformanceMetrics;

  // Default configuration
  private readonly DEFAULT_CONFIG: TransparencyConfig = {
    level: 'detailed',
    enablePerformanceMonitoring: true,
    enableContextFiltering: true,
    enableMessageFiltering: true,
    maxOverheadPercent: 5,
    messageQueueSize: 1000,
    flushInterval: 5000,
    excludedPatterns: [
      'heartbeat',
      'internal_ping',
      'cache_update',
      'memory_cleanup'
    ],
    includedPatterns: [
      'task_start',
      'task_complete',
      'task_error',
      'state_change',
      'performance_issue'
    ]
  };

  constructor(redisClient: RedisClientType, logger: Logger, config?: Partial<TransparencyConfig>) {
    super();
    this.redis = redisClient;
    this.logger = logger;
    this.config = { ...this.DEFAULT_CONFIG, ...config };

    this.metrics = {
      totalMessagesGenerated: 0,
      totalMessagesFiltered: 0,
      averageGenerationTime: 0,
      averageFilteringTime: 0,
      totalOverheadMs: 0,
      overheadPercentage: 0,
      messagesByLevel: {
        minimal: 0,
        detailed: 0,
        verbose: 0,
        debug: 0
      },
      messagesByType: {},
      filterEffectiveness: 0
    };

    this.initializeDefaultFilters();
    this.startFlushTimer();
  }

  private initializeDefaultFilters(): void {
    // Add default filters based on transparency level
    this.addFilter({
      id: 'level-minimal',
      name: 'Minimal Level Filter',
      type: 'include',
      pattern: (message: TransparencyMessage) => {
        const criticalTypes = ['error', 'state_change', 'performance_metric'];
        return criticalTypes.includes(message.type) || message.severity === 'critical';
      },
      priority: 1,
      enabled: false // Only enabled when level is 'minimal'
    });

    this.addFilter({
      id: 'exclusion-patterns',
      name: 'Exclusion Pattern Filter',
      type: 'exclude',
      pattern: (message: TransparencyMessage) => {
        return this.config.excludedPatterns.some(pattern =>
          message.title.includes(pattern) || message.description.includes(pattern)
        );
      },
      priority: 2,
      enabled: this.config.enableMessageFiltering
    });

    this.addFilter({
      id: 'inclusion-patterns',
      name: 'Inclusion Pattern Filter',
      type: 'include',
      pattern: (message: TransparencyMessage) => {
        if (this.config.includedPatterns.length === 0) return true;
        return this.config.includedPatterns.some(pattern =>
          message.title.includes(pattern) || message.description.includes(pattern)
        );
      },
      priority: 3,
      enabled: this.config.enableMessageFiltering && this.config.level !== 'minimal'
    });

    this.addFilter({
      id: 'performance-throttle',
      name: 'Performance Throttle Filter',
      type: 'exclude',
      pattern: (message: TransparencyMessage) => {
        // Throttle messages if overhead is too high
        return this.metrics.overheadPercentage > this.config.maxOverheadPercent &&
               message.severity !== 'critical';
      },
      priority: 4,
      enabled: this.config.enablePerformanceMonitoring
    });
  }

  // ===== ACTIVITY PROCESSING =====

  async processAgentActivity(activity: AgentActivity): Promise<void> {
    if (!this.shouldProcessActivity(activity)) {
      return;
    }

    const startTime = Date.now();

    try {
      const message = await this.generateTransparencyMessage(activity);
      const filteredMessage = await this.applyFilters(message);

      if (filteredMessage) {
        await this.queueMessage(filteredMessage);
      }

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(processingTime, filteredMessage === null);

      this.emit('activityProcessed', { activity, message: filteredMessage });
    } catch (error) {
      this.logger.error('Failed to process agent activity', { activity, error });
      this.updateMetrics(Date.now() - startTime, true);
    }
  }

  private shouldProcessActivity(activity: AgentActivity): boolean {
    // Skip if transparency is disabled
    if (this.config.level === 'minimal' && this.config.excludedPatterns.length === 0) {
      return false;
    }

    // Skip heartbeat activities
    if (activity.type === 'heartbeat' && this.config.level !== 'debug') {
      return false;
    }

    // Check against exclusion patterns
    const isExcluded = this.config.excludedPatterns.some(pattern =>
      activity.action.includes(pattern)
    );

    return !isExcluded;
  }

  private async generateTransparencyMessage(activity: AgentActivity): Promise<TransparencyMessage> {
    const startTime = Date.now();

    const message: TransparencyMessage = {
      id: uuidv4(),
      level: this.config.level,
      type: this.mapActivityToMessageType(activity.type),
      agentId: activity.agentId,
      timestamp: activity.timestamp,
      title: this.generateMessageTitle(activity),
      description: this.generateMessageDescription(activity),
      data: activity.data,
      context: activity.context || {},
      tags: this.generateMessageTags(activity),
      severity: this.determineMessageSeverity(activity),
      metadata: {
        processingTime: 0,
        originalActivity: activity.type,
        filtered: false
      }
    };

    message.metadata.processingTime = Date.now() - startTime;
    return message;
  }

  private mapActivityToMessageType(activityType: string): TransparencyMessage['type'] {
    const typeMapping: Record<string, TransparencyMessage['type']> = {
      'task': 'agent_activity',
      'state': 'state_change',
      'performance': 'performance_metric',
      'error': 'error',
      'debug': 'debug'
    };

    return typeMapping[activityType] || 'agent_activity';
  }

  private generateMessageTitle(activity: AgentActivity): string {
    const titleTemplates: Record<string, string> = {
      'task_start': 'Task Started',
      'task_complete': 'Task Completed',
      'task_error': 'Task Failed',
      'state_change': 'Agent State Changed',
      'performance_issue': 'Performance Issue Detected',
      'error': 'Error Occurred'
    };

    const template = titleTemplates[activity.action] || 'Agent Activity';
    return `${template} - ${activity.agentId}`;
  }

  private generateMessageDescription(activity: AgentActivity): string {
    let description = `Agent ${activity.agentId} performed ${activity.action}`;

    if (activity.data && activity.data.description) {
      description += `: ${activity.data.description}`;
    }

    if (activity.data && activity.data.error) {
      description += ` (Error: ${activity.data.error})`;
    }

    if (activity.performance && activity.performance.duration) {
      description += ` (Duration: ${activity.performance.duration}ms)`;
    }

    return description;
  }

  private generateMessageTags(activity: AgentActivity): string[] {
    const tags = [activity.type, activity.action, activity.agentId];

    if (activity.data && activity.data.taskType) {
      tags.push(`task:${activity.data.taskType}`);
    }

    if (activity.context && activity.context.swarmId) {
      tags.push(`swarm:${activity.context.swarmId}`);
    }

    if (activity.performance && activity.performance.duration) {
      const duration = activity.performance.duration;
      if (duration > 5000) tags.push('slow');
      else if (duration > 1000) tags.push('moderate');
      else tags.push('fast');
    }

    return tags;
  }

  private determineMessageSeverity(activity: AgentActivity): TransparencyMessage['severity'] {
    if (activity.type === 'error' || activity.action === 'error') {
      return 'critical';
    }

    if (activity.performance && activity.performance.duration && activity.performance.duration > 10000) {
      return 'high';
    }

    if (activity.action === 'state_change' && activity.data && activity.data.status === 'offline') {
      return 'high';
    }

    if (activity.action.includes('error') || activity.action.includes('fail')) {
      return 'medium';
    }

    return 'low';
  }

  // ===== MESSAGE FILTERING =====

  private async applyFilters(message: TransparencyMessage): Promise<TransparencyMessage | null> {
    const startTime = Date.now();
    let filteredMessage = { ...message };

    // Apply level-based filters first
    if (!this.isMessageLevelAppropriate(filteredMessage)) {
      return null;
    }

    // Apply custom filters in priority order
    const enabledFilters = this.filters
      .filter(filter => filter.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const filter of enabledFilters) {
      try {
        filteredMessage = await this.applyFilter(filteredMessage, filter);
        if (!filteredMessage) {
          break; // Message was filtered out
        }
      } catch (error) {
        this.logger.error('Filter application failed', { filterId: filter.id, error });
      }
    }

    const filteringTime = Date.now() - startTime;
    if (filteredMessage) {
      filteredMessage.metadata.processingTime += filteringTime;
    }

    return filteredMessage;
  }

  private isMessageLevelAppropriate(message: TransparencyMessage): boolean {
    const levelHierarchy = {
      'minimal': 0,
      'detailed': 1,
      'verbose': 2,
      'debug': 3
    };

    const messageLevel = levelHierarchy[message.level];
    const configLevel = levelHierarchy[this.config.level];

    return messageLevel <= configLevel;
  }

  private async applyFilter(
    message: TransparencyMessage,
    filter: MessageFilter
  ): Promise<TransparencyMessage | null> {
    let shouldApply = false;

    if (typeof filter.pattern === 'string') {
      shouldApply = message.title.includes(filter.pattern) ||
                   message.description.includes(filter.pattern);
    } else if (filter.pattern instanceof RegExp) {
      shouldApply = filter.pattern.test(message.title) ||
                   filter.pattern.test(message.description);
    } else if (typeof filter.pattern === 'function') {
      shouldApply = filter.pattern(message);
    }

    if (!shouldApply) {
      return message;
    }

    // Apply condition if present
    if (filter.condition && !filter.condition(message)) {
      return message;
    }

    // Apply filter based on type
    switch (filter.type) {
      case 'exclude':
        return null;
      case 'include':
        return message;
      case 'transform':
        return filter.transform ? filter.transform(message) : message;
      default:
        return message;
    }
  }

  // ===== MESSAGE QUEUE MANAGEMENT =====

  private async queueMessage(message: TransparencyMessage): Promise<void> {
    this.messageQueue.push(message);

    // Flush immediately for critical messages
    if (message.severity === 'critical') {
      await this.flushMessages();
      return;
    }

    // Check queue size limit
    if (this.messageQueue.length >= this.config.messageQueueSize) {
      await this.flushMessages();
    }
  }

  private async flushMessages(): Promise<void> {
    if (this.messageQueue.length === 0) {
      return;
    }

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    try {
      await this.publishMessages(messages);
      this.emit('messagesFlushed', { count: messages.length });
    } catch (error) {
      this.logger.error('Failed to flush transparency messages', { error, messageCount: messages.length });
      // Re-queue messages on failure
      this.messageQueue.unshift(...messages);
    }
  }

  private async publishMessages(messages: TransparencyMessage[]): Promise<void> {
    for (const message of messages) {
      const channel = `transparency:${message.level}:${message.agentId}`;
      await this.redis.publish(channel, JSON.stringify(message));

      // Also publish to general transparency channel
      await this.redis.publish('transparency:all', JSON.stringify(message));
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushMessages().catch(error => {
        this.logger.error('Flush timer error', { error });
      });
    }, this.config.flushInterval);
  }

  // ===== FILTER MANAGEMENT =====

  addFilter(filter: MessageFilter): void {
    this.filters.push(filter);
    this.logger.info('Transparency filter added', { filterId: filter.id, name: filter.name });
  }

  removeFilter(filterId: string): boolean {
    const initialLength = this.filters.length;
    this.filters = this.filters.filter(filter => filter.id !== filterId);
    const removed = this.filters.length < initialLength;

    if (removed) {
      this.logger.info('Transparency filter removed', { filterId });
    }

    return removed;
  }

  updateFilter(filterId: string, updates: Partial<MessageFilter>): boolean {
    const filter = this.filters.find(f => f.id === filterId);
    if (filter) {
      Object.assign(filter, updates);
      this.logger.info('Transparency filter updated', { filterId });
      return true;
    }
    return false;
  }

  getFilters(): MessageFilter[] {
    return [...this.filters];
  }

  // ===== CONFIGURATION MANAGEMENT =====

  updateConfig(updates: Partial<TransparencyConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...updates };

    // Update filter states based on new config
    this.updateFilterStates(oldConfig, this.config);

    this.logger.info('Transparency config updated', { updates });
  }

  private updateFilterStates(oldConfig: TransparencyConfig, newConfig: TransparencyConfig): void {
    // Enable/disable minimal level filter
    const minimalFilter = this.filters.find(f => f.id === 'level-minimal');
    if (minimalFilter) {
      minimalFilter.enabled = newConfig.level === 'minimal';
    }

    // Update exclusion/inclusion filters
    const exclusionFilter = this.filters.find(f => f.id === 'exclusion-patterns');
    if (exclusionFilter) {
      exclusionFilter.enabled = newConfig.enableMessageFiltering;
    }

    const inclusionFilter = this.filters.find(f => f.id === 'inclusion-patterns');
    if (inclusionFilter) {
      inclusionFilter.enabled = newConfig.enableMessageFiltering && newConfig.level !== 'minimal';
    }

    const performanceFilter = this.filters.find(f => f.id === 'performance-throttle');
    if (performanceFilter) {
      performanceFilter.enabled = newConfig.enablePerformanceMonitoring;
    }
  }

  getConfig(): TransparencyConfig {
    return { ...this.config };
  }

  // ===== METRICS COLLECTION =====

  private updateMetrics(processingTime: number, wasFiltered: boolean): void {
    this.metrics.totalMessagesGenerated++;

    if (wasFiltered) {
      this.metrics.totalMessagesFiltered++;
    }

    // Update average processing times
    const totalGen = this.metrics.totalMessagesGenerated;
    this.metrics.averageGenerationTime =
      ((this.metrics.averageGenerationTime * (totalGen - 1)) + processingTime) / totalGen;

    // Update overhead percentage
    this.metrics.totalOverheadMs += processingTime;
    // This would need actual application execution time to calculate accurate percentage
    // For now, we'll use a simulated baseline
    const baselineExecutionTime = 1000; // 1 second baseline
    this.metrics.overheadPercentage = (this.metrics.totalOverheadMs / (totalGen * baselineExecutionTime)) * 100;

    // Update filter effectiveness
    this.metrics.filterEffectiveness = (this.metrics.totalMessagesFiltered / this.metrics.totalMessagesGenerated) * 100;
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  async resetMetrics(): Promise<void> {
    this.metrics = {
      totalMessagesGenerated: 0,
      totalMessagesFiltered: 0,
      averageGenerationTime: 0,
      averageFilteringTime: 0,
      totalOverheadMs: 0,
      overheadPercentage: 0,
      messagesByLevel: {
        minimal: 0,
        detailed: 0,
        verbose: 0,
        debug: 0
      },
      messagesByType: {},
      filterEffectiveness: 0
    };

    await this.redis.del('transparency:metrics');
    this.logger.info('Transparency metrics reset');
  }

  // ===== HEALTH AND DIAGNOSTICS =====

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    overheadPercentage: number;
    queueSize: number;
    filterCount: number;
    redisConnected: boolean;
  }> {
    try {
      await this.redis.ping();

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (this.metrics.overheadPercentage > this.config.maxOverheadPercent) {
        status = 'degraded';
      }

      if (this.metrics.overheadPercentage > this.config.maxOverheadPercent * 2) {
        status = 'unhealthy';
      }

      if (this.messageQueue.length > this.config.messageQueueSize * 0.8) {
        status = 'degraded';
      }

      if (this.messageQueue.length >= this.config.messageQueueSize) {
        status = 'unhealthy';
      }

      return {
        status,
        overheadPercentage: this.metrics.overheadPercentage,
        queueSize: this.messageQueue.length,
        filterCount: this.filters.filter(f => f.enabled).length,
        redisConnected: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        overheadPercentage: this.metrics.overheadPercentage,
        queueSize: this.messageQueue.length,
        filterCount: this.filters.length,
        redisConnected: false
      };
    }
  }

  // ===== LIFECYCLE MANAGEMENT =====

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down transparency middleware');

    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining messages
    await this.flushMessages();

    // Clear queue
    this.messageQueue = [];

    this.removeAllListeners();
    this.logger.info('Transparency middleware shutdown complete');
  }
}

// ===== TRANSPARENCY UTILITIES =====

export class TransparencyUtils {
  static createActivityFromAgent(
    agentId: string,
    action: string,
    data?: any,
    context?: Record<string, any>
  ): AgentActivity {
    return {
      agentId,
      timestamp: Date.now(),
      type: 'agent_activity',
      action,
      data: data || {},
      context
    };
  }

  static createErrorActivity(
    agentId: string,
    error: Error,
    context?: Record<string, any>
  ): AgentActivity {
    return {
      agentId,
      timestamp: Date.now(),
      type: 'error',
      action: 'error',
      data: {
        error: error.message,
        stack: error.stack
      },
      context
    };
  }

  static createPerformanceActivity(
    agentId: string,
    action: string,
    duration: number,
    metrics?: Record<string, number>
  ): AgentActivity {
    return {
      agentId,
      timestamp: Date.now(),
      type: 'performance',
      action,
      data: { duration, ...metrics },
      performance: {
        duration,
        memoryUsage: metrics?.memoryUsage,
        cpuUsage: metrics?.cpuUsage
      }
    };
  }

  static createTaskActivity(
    agentId: string,
    taskAction: 'start' | 'complete' | 'error',
    taskId: string,
    taskType: string,
    data?: any
  ): AgentActivity {
    return {
      agentId,
      timestamp: Date.now(),
      type: 'task',
      action: `task_${taskAction}`,
      data: {
        taskId,
        taskType,
        ...data
      }
    };
  }
}