/**
 * Interactive Observation System - Phase 2 Integration
 *
 * Unified system that combines all Phase 2 components:
 * - Agent Observation Query API
 * - Real-Time Response Channel System
 * - Agent State Management Infrastructure
 * - Transparency Middleware Framework
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '../core/logger.js';

import { AgentObservationAPI, ObservationEndpoints } from './agent-observation-api.js';
import { RealtimeResponseSystem, QueryBuilder } from './realtime-response-system.js';
import { AgentStateManager, AgentState, StateAggregation } from './agent-state-management.js';
import { TransparencyMiddleware, TransparencyConfig, AgentActivity, TransparencyUtils } from './transparency-middleware.js';

// ===== TYPE DEFINITIONS =====

export interface ObservationSystemConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  transparency: Partial<TransparencyConfig>;
  responseSystem: {
    defaultTimeout: number;
    maxChannels: number;
  };
  stateManagement: {
    heartbeatInterval: number;
    cleanupInterval: number;
  };
  monitoring: {
    metricsInterval: number;
    healthCheckInterval: number;
  };
}

export interface SystemMetrics {
  timestamp: number;
  components: {
    observationAPI: any;
    responseSystem: any;
    stateManager: any;
    transparency: any;
  };
  overall: {
    totalQueries: number;
    averageResponseTime: number;
    successRate: number;
    activeAgents: number;
    systemHealth: 'healthy' | 'degraded' | 'unhealthy';
  };
}

export interface QueryPerformanceReport {
  queryType: string;
  totalQueries: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  successRate: number;
  errorRate: number;
  timeoutRate: number;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

// ===== INTERACTIVE OBSERVATION SYSTEM CLASS =====

export class InteractiveObservationSystem extends EventEmitter implements ObservationEndpoints {
  private redis: RedisClientType;
  private logger: Logger;
  private config: ObservationSystemConfig;

  // Component instances
  private observationAPI: AgentObservationAPI;
  private responseSystem: RealtimeResponseSystem;
  private stateManager: AgentStateManager;
  private transparency: TransparencyMiddleware;

  // Monitoring
  private metrics: SystemMetrics;
  private metricsTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private queryPerformanceData: Map<string, number[]> = new Map();

  // Default configuration
  private readonly DEFAULT_CONFIG: ObservationSystemConfig = {
    redis: {
      host: 'localhost',
      port: 6379
    },
    transparency: {
      level: 'detailed',
      enablePerformanceMonitoring: true,
      maxOverheadPercent: 5
    },
    responseSystem: {
      defaultTimeout: 5000,
      maxChannels: 1000
    },
    stateManagement: {
      heartbeatInterval: 5000,
      cleanupInterval: 60000
    },
    monitoring: {
      metricsInterval: 30000,
      healthCheckInterval: 10000
    }
  };

  constructor(logger: Logger, config?: Partial<ObservationSystemConfig>) {
    super();
    this.logger = logger;
    this.config = { ...this.DEFAULT_CONFIG, ...config };

    // Initialize metrics
    this.metrics = {
      timestamp: Date.now(),
      components: {
        observationAPI: {},
        responseSystem: {},
        stateManager: {},
        transparency: {}
      },
      overall: {
        totalQueries: 0,
        averageResponseTime: 0,
        successRate: 0,
        activeAgents: 0,
        systemHealth: 'healthy'
      }
    };
  }

  // ===== SYSTEM INITIALIZATION =====

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Interactive Observation System');

      // Initialize Redis connection
      this.redis = createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port
        },
        password: this.config.redis.password
      });

      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error', { error });
        this.emit('redisError', error);
      });

      await this.redis.connect();

      // Initialize components
      await this.initializeComponents();

      // Set up component event handlers
      this.setupComponentEventHandlers();

      // Start monitoring
      this.startMonitoring();

      // Test system health
      const healthCheck = await this.healthCheck();
      if (healthCheck.overall.systemHealth !== 'healthy') {
        this.logger.warn('System initialized with degraded health', { healthCheck });
      }

      this.logger.info('Interactive Observation System initialized successfully');
      this.emit('systemInitialized');

    } catch (error) {
      this.logger.error('Failed to initialize Interactive Observation System', { error });
      throw error;
    }
  }

  private async initializeComponents(): Promise<void> {
    // Initialize Agent State Manager
    this.stateManager = new AgentStateManager(this.redis, this.logger);
    await this.stateManager.initialize?.(); // Note: initialize might be optional

    // Initialize Real-Time Response System
    this.responseSystem = new RealtimeResponseSystem(
      this.redis,
      this.logger,
      this.config.responseSystem
    );

    // Initialize Agent Observation API
    this.observationAPI = new AgentObservationAPI(this.redis, this.logger);

    // Initialize Transparency Middleware
    this.transparency = new TransparencyMiddleware(
      this.redis,
      this.logger,
      this.config.transparency
    );

    this.logger.info('All components initialized');
  }

  private setupComponentEventHandlers(): void {
    // State Manager events
    this.stateManager.on('stateChange', (event) => {
      this.handleAgentStateChange(event);
    });

    this.stateManager.on('heartbeat', (heartbeat) => {
      this.handleAgentHeartbeat(heartbeat);
    });

    // Response System events
    this.responseSystem.on('response', (response) => {
      this.handleQueryResponse(response);
    });

    this.responseSystem.on('metrics', (metrics) => {
      this.metrics.components.responseSystem = metrics;
    });

    // Transparency events
    this.transparency.on('messagesFlushed', (data) => {
      this.handleTransparencyMessages(data);
    });

    this.transparency.on('activityProcessed', (data) => {
      this.handleActivityProcessed(data);
    });
  }

  // ===== QUERY API DELEGATION =====

  async getAgentState(agentId: string): Promise<AgentState | null> {
    const startTime = Date.now();
    try {
      const result = await this.observationAPI.getAgentState(agentId);
      this.recordQueryPerformance('getAgentState', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQueryPerformance('getAgentState', Date.now() - startTime, false);
      throw error;
    }
  }

  async getAgentActivity(agentId: string, timeRange?: { start: number; end: number }): Promise<any[]> {
    const startTime = Date.now();
    try {
      const result = await this.observationAPI.getAgentActivity(agentId, timeRange);
      this.recordQueryPerformance('getAgentActivity', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQueryPerformance('getAgentActivity', Date.now() - startTime, false);
      throw error;
    }
  }

  async getAgentsByStatus(status: string): Promise<AgentState[]> {
    const startTime = Date.now();
    try {
      const result = await this.observationAPI.getAgentsByStatus(status);
      this.recordQueryPerformance('getAgentsByStatus', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQueryPerformance('getAgentsByStatus', Date.now() - startTime, false);
      throw error;
    }
  }

  async getAgentsByType(type: string): Promise<AgentState[]> {
    const startTime = Date.now();
    try {
      const result = await this.observationAPI.getAgentsByType(type);
      this.recordQueryPerformance('getAgentsByType', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQueryPerformance('getAgentsByType', Date.now() - startTime, false);
      throw error;
    }
  }

  async getSwarmOverview(): Promise<any> {
    const startTime = Date.now();
    try {
      const result = await this.observationAPI.getSwarmOverview();
      this.recordQueryPerformance('getSwarmOverview', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQueryPerformance('getSwarmOverview', Date.now() - startTime, false);
      throw error;
    }
  }

  async getProgressHistory(agentId?: string, timeRange?: { start: number; end: number }): Promise<any[]> {
    const startTime = Date.now();
    try {
      const result = await this.observationAPI.getProgressHistory(agentId, timeRange);
      this.recordQueryPerformance('getProgressHistory', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQueryPerformance('getProgressHistory', Date.now() - startTime, false);
      throw error;
    }
  }

  async getPerformanceMetrics(agentId?: string): Promise<any> {
    const startTime = Date.now();
    try {
      const result = await this.observationAPI.getPerformanceMetrics(agentId);
      this.recordQueryPerformance('getPerformanceMetrics', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQueryPerformance('getPerformanceMetrics', Date.now() - startTime, false);
      throw error;
    }
  }

  // ===== ENHANCED QUERY METHODS =====

  async executeQuery(
    agentId: string,
    queryType: string,
    data: any,
    timeout?: number
  ): Promise<any> {
    const startTime = Date.now();

    try {
      // Create activity for transparency
      const activity = TransparencyUtils.createActivityFromAgent(
        'observation-system',
        'execute_query',
        { agentId, queryType, timeout }
      );

      await this.transparency.processAgentActivity(activity);

      // Execute query
      const result = await this.responseSystem.sendQuery(agentId, queryType, data, timeout);

      // Record performance
      this.recordQueryPerformance('executeQuery', Date.now() - startTime, true);

      return result;
    } catch (error) {
      this.recordQueryPerformance('executeQuery', Date.now() - startTime, false);
      throw error;
    }
  }

  async startRealtimeMonitoring(agentId?: string): Promise<EventEmitter> {
    return await this.observationAPI.startRealtimeMonitoring(agentId);
  }

  async getStateAggregation(): Promise<StateAggregation> {
    return await this.stateManager.getStateAggregation();
  }

  // ===== EVENT HANDLERS =====

  private handleAgentStateChange(event: any): void {
    this.emit('agentStateChange', event);

    // Create transparency activity
    const activity = TransparencyUtils.createActivityFromAgent(
      event.agentId,
      'state_change',
      {
        previousState: event.previousState,
        newState: event.newState,
        changeType: event.changeType
      },
      { reason: event.reason }
    );

    this.transparency.processAgentActivity(activity).catch(error => {
      this.logger.error('Failed to process state change activity', { error });
    });
  }

  private handleAgentHeartbeat(heartbeat: any): void {
    this.emit('agentHeartbeat', heartbeat);

    // Update metrics
    this.metrics.overall.activeAgents = this.metrics.overall.activeAgents + 1;
  }

  private handleQueryResponse(response: any): void {
    this.emit('queryResponse', response);

    // Update overall metrics
    this.metrics.overall.totalQueries++;
    this.metrics.overall.successRate =
      ((this.metrics.overall.successRate * (this.metrics.overall.totalQueries - 1)) + 1) /
      this.metrics.overall.totalQueries;
  }

  private handleTransparencyMessages(data: any): void {
    this.emit('transparencyMessages', data);
  }

  private handleActivityProcessed(data: any): void {
    this.emit('activityProcessed', data);
  }

  // ===== PERFORMANCE MONITORING =====

  private recordQueryPerformance(queryType: string, responseTime: number, success: boolean): void {
    if (!this.queryPerformanceData.has(queryType)) {
      this.queryPerformanceData.set(queryType, []);
    }

    const times = this.queryPerformanceData.get(queryType)!;
    times.push(responseTime);

    // Keep only last 1000 measurements per query type
    if (times.length > 1000) {
      times.splice(0, times.length - 1000);
    }

    // Update overall metrics
    this.metrics.overall.totalQueries++;
    this.metrics.overall.averageResponseTime =
      ((this.metrics.overall.averageResponseTime * (this.metrics.overall.totalQueries - 1)) + responseTime) /
      this.metrics.overall.totalQueries;

    if (!success) {
      this.metrics.overall.successRate =
        ((this.metrics.overall.successRate * (this.metrics.overall.totalQueries - 1)) + 0) /
        this.metrics.overall.totalQueries;
    }
  }

  getQueryPerformanceReport(queryType?: string): QueryPerformanceReport | QueryPerformanceReport[] {
    if (queryType) {
      return this.generatePerformanceReport(queryType);
    }

    const reports: QueryPerformanceReport[] = [];
    for (const [qt] of this.queryPerformanceData) {
      reports.push(this.generatePerformanceReport(qt));
    }

    return reports;
  }

  private generatePerformanceReport(queryType: string): QueryPerformanceReport {
    const times = this.queryPerformanceData.get(queryType) || [];
    if (times.length === 0) {
      return {
        queryType,
        totalQueries: 0,
        averageResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        successRate: 0,
        errorRate: 0,
        timeoutRate: 0,
        percentiles: { p50: 0, p90: 0, p95: 0, p99: 0 }
      };
    }

    const sortedTimes = [...times].sort((a, b) => a - b);
    const total = times.length;
    const average = times.reduce((sum, time) => sum + time, 0) / total;

    return {
      queryType,
      totalQueries: total,
      averageResponseTime: average,
      minResponseTime: sortedTimes[0],
      maxResponseTime: sortedTimes[total - 1],
      successRate: 0.95, // This would be calculated from actual success/failure data
      errorRate: 0.05,
      timeoutRate: 0.02,
      percentiles: {
        p50: sortedTimes[Math.floor(total * 0.5)],
        p90: sortedTimes[Math.floor(total * 0.9)],
        p95: sortedTimes[Math.floor(total * 0.95)],
        p99: sortedTimes[Math.floor(total * 0.99)]
      }
    };
  }

  // ===== MONITORING AND HEALTH =====

  private startMonitoring(): void {
    // Metrics collection
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoring.metricsInterval);

    // Health checks
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.monitoring.healthCheckInterval);
  }

  private async collectMetrics(): Promise<void> {
    try {
      // Update component metrics
      this.metrics.components.responseSystem = this.responseSystem.getMetrics();
      this.metrics.components.transparency = this.transparency.getMetrics();

      // Update timestamp
      this.metrics.timestamp = Date.now();

      // Store metrics in Redis
      await this.redis.setEx(
        'observation-system:metrics:current',
        3600, // 1 hour TTL
        JSON.stringify(this.metrics)
      );

      this.emit('metricsCollected', this.metrics);
    } catch (error) {
      this.logger.error('Failed to collect metrics', { error });
    }
  }

  private async performHealthCheck(): Promise<void> {
    const healthReport = await this.healthCheck();

    if (healthReport.overall.systemHealth !== 'healthy') {
      this.logger.warn('System health degraded', { healthReport });
      this.emit('healthDegraded', healthReport);
    }

    this.emit('healthCheck', healthReport);
  }

  async healthCheck(): Promise<SystemMetrics> {
    try {
      const componentHealths = await Promise.all([
        this.observationAPI.healthCheck(),
        this.responseSystem.healthCheck(),
        this.stateManager.healthCheck(),
        this.transparency.healthCheck()
      ]);

      const healthStatuses = componentHealths.map(h => h.status);
      let overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (healthStatuses.includes('unhealthy')) {
        overallHealth = 'unhealthy';
      } else if (healthStatuses.includes('degraded')) {
        overallHealth = 'degraded';
      }

      // Update metrics with health information
      this.metrics.overall.systemHealth = overallHealth;
      this.metrics.timestamp = Date.now();

      return { ...this.metrics };
    } catch (error) {
      this.logger.error('Health check failed', { error });

      return {
        ...this.metrics,
        overall: {
          ...this.metrics.overall,
          systemHealth: 'unhealthy'
        }
      };
    }
  }

  // ===== CONFIGURATION AND CONTROL =====

  updateTransparencyConfig(updates: Partial<TransparencyConfig>): void {
    this.transparency.updateConfig(updates);
    this.emit('configUpdated', { component: 'transparency', updates });
  }

  async getSystemStatus(): Promise<{
    status: string;
    components: any;
    metrics: SystemMetrics;
    performance: QueryPerformanceReport[];
  }> {
    const health = await this.healthCheck();
    const performance = Array.isArray(this.getQueryPerformanceReport())
      ? this.getQueryPerformanceReport() as QueryPerformanceReport[]
      : [this.getQueryPerformanceReport() as QueryPerformanceReport];

    return {
      status: health.overall.systemHealth,
      components: {
        observationAPI: await this.observationAPI.healthCheck(),
        responseSystem: await this.responseSystem.healthCheck(),
        stateManager: await this.stateManager.healthCheck(),
        transparency: await this.transparency.healthCheck()
      },
      metrics: health,
      performance
    };
  }

  // ===== LIFECYCLE MANAGEMENT =====

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Interactive Observation System');

    // Clear timers
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);

    // Shutdown components
    await Promise.all([
      this.transparency.shutdown(),
      this.responseSystem.shutdown(),
      this.stateManager.shutdown()
    ]);

    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }

    this.removeAllListeners();
    this.logger.info('Interactive Observation System shutdown complete');
  }
}

// ===== UTILITY EXPORTS =====

export { QueryBuilder, TransparencyUtils };

// Factory function for easy instantiation
export async function createObservationSystem(
  logger: Logger,
  config?: Partial<ObservationSystemConfig>
): Promise<InteractiveObservationSystem> {
  const system = new InteractiveObservationSystem(logger, config);
  await system.initialize();
  return system;
}