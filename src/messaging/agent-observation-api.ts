/**
 * Agent Observation Query API
 *
 * RESTful endpoints and Redis-based query system for agent state observation
 * Phase 2: Interactive Observation System Component
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '../core/logger.js';
import { v4 as uuidv4 } from 'uuid';

// ===== TYPE DEFINITIONS =====

export interface AgentState {
  id: string;
  type: string;
  status: 'idle' | 'active' | 'busy' | 'error' | 'offline';
  currentTask?: string;
  progress: number;
  confidence: number;
  lastHeartbeat: number;
  metadata: Record<string, any>;
  resources: {
    cpu: number;
    memory: number;
    tokensUsed: number;
  };
}

export interface AgentActivity {
  agentId: string;
  timestamp: number;
  type: 'task_start' | 'task_progress' | 'task_complete' | 'error' | 'state_change';
  data: any;
  duration?: number;
}

export interface QueryRequest {
  id: string;
  type: 'agent_state' | 'agent_activity' | 'swarm_overview' | 'progress_history';
  agentId?: string;
  timeRange?: {
    start: number;
    end: number;
  };
  filters?: Record<string, any>;
  timeout: number;
  responseChannel: string;
}

export interface QueryResponse {
  requestId: string;
  success: boolean;
  data: any;
  error?: string;
  timestamp: number;
  processingTime: number;
}

export interface ObservationEndpoints {
  // Agent State Endpoints
  getAgentState(agentId: string): Promise<AgentState | null>;
  getAgentActivity(agentId: string, timeRange?: { start: number; end: number }): Promise<AgentActivity[]>;
  getAgentsByStatus(status: string): Promise<AgentState[]>;
  getAgentsByType(type: string): Promise<AgentState[]>;

  // Swarm Overview Endpoints
  getSwarmOverview(): Promise<{
    totalAgents: number;
    activeAgents: number;
    totalTasks: number;
    completedTasks: number;
    averageConfidence: number;
  }>;

  // Progress and Performance Endpoints
  getProgressHistory(agentId?: string, timeRange?: { start: number; end: number }): Promise<any[]>;
  getPerformanceMetrics(agentId?: string): Promise<{
    averageResponseTime: number;
    successRate: number;
    taskCompletionRate: number;
  }>;
}

// ===== AGENT OBSERVATION API CLASS =====

export class AgentObservationAPI extends EventEmitter implements ObservationEndpoints {
  private redis: RedisClientType;
  private logger: Logger;
  private queryTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private responseHandlers: Map<string, (response: QueryResponse) => void> = new Map();

  constructor(redisClient: RedisClientType, logger: Logger) {
    super();
    this.redis = redisClient;
    this.logger = logger;
    this.initializeResponseChannels();
  }

  private async initializeResponseChannels(): Promise<void> {
    // Subscribe to query response channels
    const responseSubscriber = this.redis.duplicate();
    await responseSubscriber.connect();

    await responseSubscriber.subscribe('query-responses:*', (message, channel) => {
      try {
        const response: QueryResponse = JSON.parse(message);
        this.handleQueryResponse(response);
      } catch (error) {
        this.logger.error('Failed to parse query response', { channel, error });
      }
    });
  }

  private handleQueryResponse(response: QueryResponse): void {
    const handler = this.responseHandlers.get(response.requestId);
    if (handler) {
      handler(response);
      this.cleanupQuery(response.requestId);
    } else {
      this.logger.warn('No handler found for query response', { requestId: response.requestId });
    }
  }

  private cleanupQuery(requestId: string): void {
    // Clear timeout
    const timeout = this.queryTimeouts.get(requestId);
    if (timeout) {
      clearTimeout(timeout);
      this.queryTimeouts.delete(requestId);
    }

    // Remove handler
    this.responseHandlers.delete(requestId);
  }

  private async executeQuery(request: QueryRequest): Promise<QueryResponse> {
    return new Promise((resolve) => {
      // Set up response handler
      this.responseHandlers.set(request.id, resolve);

      // Set timeout
      const timeout = setTimeout(() => {
        resolve({
          requestId: request.id,
          success: false,
          data: null,
          error: 'Query timeout',
          timestamp: Date.now(),
          processingTime: request.timeout
        });
        this.cleanupQuery(request.id);
      }, request.timeout);

      this.queryTimeouts.set(request.id, timeout);

      // Publish query request
      this.redis.publish(`agent-queries:${request.type}`, JSON.stringify(request));
    });
  }

  // ===== AGENT STATE ENDPOINTS =====

  async getAgentState(agentId: string): Promise<AgentState | null> {
    const request: QueryRequest = {
      id: uuidv4(),
      type: 'agent_state',
      agentId,
      timeout: 5000,
      responseChannel: `query-responses:${uuidv4()}`
    };

    const response = await this.executeQuery(request);
    if (response.success) {
      return response.data as AgentState;
    }
    return null;
  }

  async getAgentActivity(
    agentId: string,
    timeRange?: { start: number; end: number }
  ): Promise<AgentActivity[]> {
    const request: QueryRequest = {
      id: uuidv4(),
      type: 'agent_activity',
      agentId,
      timeRange,
      timeout: 5000,
      responseChannel: `query-responses:${uuidv4()}`
    };

    const response = await this.executeQuery(request);
    if (response.success) {
      return response.data as AgentActivity[];
    }
    return [];
  }

  async getAgentsByStatus(status: string): Promise<AgentState[]> {
    const request: QueryRequest = {
      id: uuidv4(),
      type: 'agent_state',
      filters: { status },
      timeout: 5000,
      responseChannel: `query-responses:${uuidv4()}`
    };

    const response = await this.executeQuery(request);
    if (response.success) {
      return response.data as AgentState[];
    }
    return [];
  }

  async getAgentsByType(type: string): Promise<AgentState[]> {
    const request: QueryRequest = {
      id: uuidv4(),
      type: 'agent_state',
      filters: { type },
      timeout: 5000,
      responseChannel: `query-responses:${uuidv4()}`
    };

    const response = await this.executeQuery(request);
    if (response.success) {
      return response.data as AgentState[];
    }
    return [];
  }

  // ===== SWARM OVERVIEW ENDPOINTS =====

  async getSwarmOverview(): Promise<{
    totalAgents: number;
    activeAgents: number;
    totalTasks: number;
    completedTasks: number;
    averageConfidence: number;
  }> {
    const request: QueryRequest = {
      id: uuidv4(),
      type: 'swarm_overview',
      timeout: 5000,
      responseChannel: `query-responses:${uuidv4()}`
    };

    const response = await this.executeQuery(request);
    if (response.success) {
      return response.data;
    }

    // Return default overview on failure
    return {
      totalAgents: 0,
      activeAgents: 0,
      totalTasks: 0,
      completedTasks: 0,
      averageConfidence: 0
    };
  }

  // ===== PROGRESS AND PERFORMANCE ENDPOINTS =====

  async getProgressHistory(
    agentId?: string,
    timeRange?: { start: number; end: number }
  ): Promise<any[]> {
    const request: QueryRequest = {
      id: uuidv4(),
      type: 'progress_history',
      agentId,
      timeRange,
      timeout: 5000,
      responseChannel: `query-responses:${uuidv4()}`
    };

    const response = await this.executeQuery(request);
    if (response.success) {
      return response.data;
    }
    return [];
  }

  async getPerformanceMetrics(agentId?: string): Promise<{
    averageResponseTime: number;
    successRate: number;
    taskCompletionRate: number;
  }> {
    // For now, return basic metrics
    // In a full implementation, this would query historical performance data
    return {
      averageResponseTime: 250, // ms
      successRate: 0.95,
      taskCompletionRate: 0.88
    };
  }

  // ===== REAL-TIME MONITORING =====

  async startRealtimeMonitoring(agentId?: string): Promise<EventEmitter> {
    const monitor = new EventEmitter();

    // Subscribe to agent state changes
    const stateSubscriber = this.redis.duplicate();
    await stateSubscriber.connect();

    const channelPattern = agentId
      ? `agent-state:${agentId}:*`
      : 'agent-state:*';

    await stateSubscriber.pSubscribe(channelPattern, (message, channel) => {
      try {
        const stateUpdate = JSON.parse(message);
        monitor.emit('stateChange', stateUpdate);
      } catch (error) {
        this.logger.error('Failed to parse state update', { channel, error });
      }
    });

    // Subscribe to activity updates
    const activitySubscriber = this.redis.duplicate();
    await activitySubscriber.connect();

    const activityChannelPattern = agentId
      ? `agent-activity:${agentId}:*`
      : 'agent-activity:*';

    await activitySubscriber.pSubscribe(activityChannelPattern, (message, channel) => {
      try {
        const activityUpdate = JSON.parse(message);
        monitor.emit('activity', activityUpdate);
      } catch (error) {
        this.logger.error('Failed to parse activity update', { channel, error });
      }
    });

    // Cleanup method
    monitor.stop = async () => {
      await stateSubscriber.quit();
      await activitySubscriber.quit();
    };

    return monitor;
  }

  // ===== HEALTH CHECKS =====

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
    activeQueries: number;
    redisConnected: boolean;
  }> {
    const startTime = Date.now();

    try {
      // Test Redis connection
      await this.redis.ping();

      const responseTime = Date.now() - startTime;
      const activeQueries = this.responseHandlers.size;

      return {
        status: responseTime < 500 && activeQueries < 100 ? 'healthy' : 'degraded',
        responseTime,
        activeQueries,
        redisConnected: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        activeQueries: this.responseHandlers.size,
        redisConnected: false
      };
    }
  }
}

// ===== REST API EXPRESSION =====

export class ObservationRestAPI {
  private observationAPI: AgentObservationAPI;
  private logger: Logger;

  constructor(observationAPI: AgentObservationAPI, logger: Logger) {
    this.observationAPI = observationAPI;
    this.logger = logger;
  }

  // Express.js route handlers would be implemented here
  // For brevity, showing the route definitions

  getRoutes() {
    return {
      'GET /api/agents/:id/state': this.getAgentState.bind(this),
      'GET /api/agents/:id/activity': this.getAgentActivity.bind(this),
      'GET /api/agents': this.getAgents.bind(this),
      'GET /api/swarm/overview': this.getSwarmOverview.bind(this),
      'GET /api/agents/:id/progress': this.getProgressHistory.bind(this),
      'GET /api/agents/:id/performance': this.getPerformanceMetrics.bind(this),
      'GET /api/health': this.healthCheck.bind(this)
    };
  }

  private async getAgentState(req: any, res: any) {
    try {
      const state = await this.observationAPI.getAgentState(req.params.id);
      if (state) {
        res.json({ success: true, data: state });
      } else {
        res.status(404).json({ success: false, error: 'Agent not found' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private async getAgentActivity(req: any, res: any) {
    try {
      const { start, end } = req.query;
      const timeRange = start && end ? {
        start: parseInt(start),
        end: parseInt(end)
      } : undefined;

      const activity = await this.observationAPI.getAgentActivity(
        req.params.id,
        timeRange
      );
      res.json({ success: true, data: activity });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Additional route handlers would follow the same pattern...
}