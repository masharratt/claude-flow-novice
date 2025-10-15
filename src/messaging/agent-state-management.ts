/**
 * Agent State Management Infrastructure
 *
 * Manages agent state persistence, state change events, heartbeat monitoring,
 * and state aggregation for dashboard consumption
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
  status: AgentStatus;
  currentTask?: TaskInfo;
  progress: number;
  confidence: number;
  lastHeartbeat: number;
  metadata: Record<string, any>;
  resources: ResourceUsage;
  capabilities: string[];
  location?: string;
  version?: string;
}

export type AgentStatus = 'idle' | 'active' | 'busy' | 'error' | 'offline' | 'maintenance';

export interface TaskInfo {
  id: string;
  type: string;
  description: string;
  startedAt: number;
  estimatedCompletion?: number;
  progress: number;
  confidence: number;
}

export interface ResourceUsage {
  cpu: number;
  memory: number;
  tokensUsed: number;
  networkIn?: number;
  networkOut?: number;
  diskUsage?: number;
}

export interface StateChangeEvent {
  agentId: string;
  previousState: Partial<AgentState>;
  newState: AgentState;
  changeType: 'status' | 'task' | 'progress' | 'confidence' | 'resource' | 'heartbeat';
  timestamp: number;
  reason?: string;
}

export interface HeartbeatEvent {
  agentId: string;
  timestamp: number;
  status: AgentStatus;
  resources: ResourceUsage;
  metrics?: Record<string, number>;
}

export interface StateQuery {
  agentIds?: string[];
  status?: AgentStatus[];
  type?: string[];
  hasActiveTask?: boolean;
  minConfidence?: number;
  maxAge?: number;
  limit?: number;
  offset?: number;
}

export interface StateAggregation {
  totalAgents: number;
  statusBreakdown: Record<AgentStatus, number>;
  typeBreakdown: Record<string, number>;
  averageConfidence: number;
  averageProgress: number;
  totalActiveTasks: number;
  totalResources: {
    cpu: number;
    memory: number;
    tokens: number;
  };
  healthScore: number;
}

// ===== AGENT STATE MANAGER CLASS =====

export class AgentStateManager extends EventEmitter {
  private redis: RedisClientType;
  private logger: Logger;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private stateCache: Map<string, AgentState> = new Map();
  private heartbeatTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // Configuration
  private readonly HEARTBEAT_INTERVAL = 5000; // 5 seconds
  private readonly HEARTBEAT_TIMEOUT = 15000; // 15 seconds
  private readonly STATE_TTL = 3600; // 1 hour
  private readonly CACHE_TTL = 30000; // 30 seconds
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute

  constructor(redisClient: RedisClientType, logger: Logger) {
    super();
    this.redis = redisClient;
    this.logger = logger;
    this.initializeStateMonitoring();
  }

  private async initializeStateMonitoring(): Promise<void> {
    // Start heartbeat monitoring
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, this.HEARTBEAT_INTERVAL);

    // Start cleanup process
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL);

    // Subscribe to state change events
    await this.subscribeToStateEvents();

    this.logger.info('Agent state manager initialized');
  }

  private async subscribeToStateEvents(): Promise<void> {
    const subscriber = this.redis.duplicate();
    await subscriber.connect();

    await subscriber.pSubscribe('agent-state:*', (message, channel) => {
      try {
        const event = JSON.parse(message);
        this.handleStateEvent(channel, event);
      } catch (error) {
        this.logger.error('Failed to parse state event', { channel, error });
      }
    });
  }

  private handleStateEvent(channel: string, event: any): void {
    const agentId = this.extractAgentIdFromChannel(channel);
    if (!agentId) return;

    switch (event.type) {
      case 'state_update':
        this.updateAgentState(agentId, event.state);
        break;
      case 'heartbeat':
        this.processHeartbeat(agentId, event.heartbeat);
        break;
      case 'task_update':
        this.updateAgentTask(agentId, event.task);
        break;
      default:
        this.logger.warn('Unknown state event type', { type: event.type, agentId });
    }
  }

  private extractAgentIdFromChannel(channel: string): string | null {
    const match = channel.match(/^agent-state:([^:]+):/);
    return match ? match[1] : null;
  }

  // ===== STATE MANAGEMENT =====

  async updateAgentState(agentId: string, newState: Partial<AgentState>, reason?: string): Promise<void> {
    const currentState = await this.getAgentState(agentId);
    const previousState = { ...currentState };

    // Merge with existing state
    const updatedState: AgentState = {
      ...currentState,
      ...newState,
      id: agentId,
      lastHeartbeat: Date.now()
    };

    // Store in Redis
    const stateKey = `agent-state:${agentId}`;
    await this.redis.setEx(stateKey, this.STATE_TTL, JSON.stringify(updatedState));

    // Update cache
    this.stateCache.set(agentId, updatedState);
    setTimeout(() => {
      this.stateCache.delete(agentId);
    }, this.CACHE_TTL);

    // Create state change event
    const changeEvent: StateChangeEvent = {
      agentId,
      previousState,
      newState: updatedState,
      changeType: this.determineChangeType(previousState, updatedState),
      timestamp: Date.now(),
      reason
    };

    // Emit state change event
    await this.publishStateChange(changeEvent);

    // Update heartbeat timeout
    this.updateHeartbeatTimeout(agentId);

    this.emit('stateChange', changeEvent);
    this.logger.debug('Agent state updated', { agentId, changeType: changeEvent.changeType });
  }

  private determineChangeType(
    previousState: Partial<AgentState>,
    newState: AgentState
  ): StateChangeEvent['changeType'] {
    if (previousState.status !== newState.status) return 'status';
    if (JSON.stringify(previousState.currentTask) !== JSON.stringify(newState.currentTask)) return 'task';
    if (previousState.progress !== newState.progress) return 'progress';
    if (previousState.confidence !== newState.confidence) return 'confidence';
    if (JSON.stringify(previousState.resources) !== JSON.stringify(newState.resources)) return 'resource';
    return 'heartbeat';
  }

  async updateAgentTask(agentId: string, task: Partial<TaskInfo>): Promise<void> {
    const currentState = await this.getAgentState(agentId);
    if (!currentState) return;

    const updatedTask: TaskInfo = {
      id: task.id || uuidv4(),
      type: task.type || 'unknown',
      description: task.description || '',
      startedAt: task.startedAt || Date.now(),
      estimatedCompletion: task.estimatedCompletion,
      progress: task.progress || 0,
      confidence: task.confidence || 0
    };

    await this.updateAgentState(agentId, {
      currentTask: updatedTask,
      progress: task.progress || 0,
      confidence: task.confidence || 0
    }, 'Task update');
  }

  async setAgentStatus(agentId: string, status: AgentStatus, reason?: string): Promise<void> {
    await this.updateAgentState(agentId, { status }, reason);
  }

  async updateAgentResources(agentId: string, resources: Partial<ResourceUsage>): Promise<void> {
    const currentState = await this.getAgentState(agentId);
    if (!currentState) return;

    const updatedResources: ResourceUsage = {
      ...currentState.resources,
      ...resources
    };

    await this.updateAgentState(agentId, { resources: updatedResources }, 'Resource update');
  }

  // ===== HEARTBEAT MANAGEMENT =====

  async processHeartbeat(agentId: string, heartbeat: HeartbeatEvent): Promise<void> {
    const currentState = await this.getAgentState(agentId);
    if (!currentState) {
      // Create new agent state if not exists
      await this.createAgentState(agentId, heartbeat.status, heartbeat.resources);
    } else {
      await this.updateAgentState(agentId, {
        lastHeartbeat: heartbeat.timestamp,
        status: heartbeat.status,
        resources: heartbeat.resources,
        metadata: {
          ...currentState.metadata,
          ...heartbeat.metrics
        }
      }, 'Heartbeat');
    }

    this.updateHeartbeatTimeout(agentId);
    this.emit('heartbeat', heartbeat);
  }

  private updateHeartbeatTimeout(agentId: string): void {
    // Clear existing timeout
    const existingTimeout = this.heartbeatTimeouts.get(agentId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.handleHeartbeatTimeout(agentId);
    }, this.HEARTBEAT_TIMEOUT);

    this.heartbeatTimeouts.set(agentId, timeout);
  }

  private async handleHeartbeatTimeout(agentId: string): Promise<void> {
    const currentState = await this.getAgentState(agentId);
    if (!currentState) return;

    if (currentState.status !== 'offline') {
      await this.setAgentStatus(agentId, 'offline', 'Heartbeat timeout');
      this.logger.warn('Agent marked as offline due to heartbeat timeout', { agentId });
    }

    this.heartbeatTimeouts.delete(agentId);
    this.emit('heartbeatTimeout', agentId);
  }

  private async checkHeartbeats(): Promise<void> {
    const now = Date.now();
    const agentsToCheck = await this.queryAgentStates({});

    for (const agent of agentsToCheck) {
      const timeSinceHeartbeat = now - agent.lastHeartbeat;
      if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT && agent.status !== 'offline') {
        await this.handleHeartbeatTimeout(agent.id);
      }
    }
  }

  // ===== STATE QUERIES =====

  async getAgentState(agentId: string): Promise<AgentState | null> {
    // Check cache first
    const cachedState = this.stateCache.get(agentId);
    if (cachedState) {
      return cachedState;
    }

    // Get from Redis
    const stateKey = `agent-state:${agentId}`;
    const stateData = await this.redis.get(stateKey);

    if (stateData) {
      const state: AgentState = JSON.parse(stateData);
      this.stateCache.set(agentId, state);
      setTimeout(() => {
        this.stateCache.delete(agentId);
      }, this.CACHE_TTL);
      return state;
    }

    return null;
  }

  async queryAgentStates(query: StateQuery): Promise<AgentState[]> {
    const allAgents = await this.getAllAgentStates();
    let filteredAgents = allAgents;

    // Apply filters
    if (query.agentIds && query.agentIds.length > 0) {
      filteredAgents = filteredAgents.filter(agent => query.agentIds!.includes(agent.id));
    }

    if (query.status && query.status.length > 0) {
      filteredAgents = filteredAgents.filter(agent => query.status!.includes(agent.status));
    }

    if (query.type && query.type.length > 0) {
      filteredAgents = filteredAgents.filter(agent => query.type!.includes(agent.type));
    }

    if (query.hasActiveTask !== undefined) {
      filteredAgents = filteredAgents.filter(agent =>
        query.hasActiveTask ? !!agent.currentTask : !agent.currentTask
      );
    }

    if (query.minConfidence !== undefined) {
      filteredAgents = filteredAgents.filter(agent => agent.confidence >= query.minConfidence!);
    }

    if (query.maxAge !== undefined) {
      const cutoffTime = Date.now() - query.maxAge;
      filteredAgents = filteredAgents.filter(agent => agent.lastHeartbeat >= cutoffTime);
    }

    // Apply pagination
    if (query.offset !== undefined) {
      filteredAgents = filteredAgents.slice(query.offset);
    }

    if (query.limit !== undefined) {
      filteredAgents = filteredAgents.slice(0, query.limit);
    }

    return filteredAgents;
  }

  private async getAllAgentStates(): Promise<AgentState[]> {
    const keys = await this.redis.keys('agent-state:*');
    const states: AgentState[] = [];

    for (const key of keys) {
      const stateData = await this.redis.get(key);
      if (stateData) {
        try {
          const state: AgentState = JSON.parse(stateData);
          states.push(state);
        } catch (error) {
          this.logger.error('Failed to parse agent state', { key, error });
        }
      }
    }

    return states;
  }

  // ===== STATE AGGREGATION =====

  async getStateAggregation(): Promise<StateAggregation> {
    const agents = await this.getAllAgentStates();

    const statusBreakdown: Record<AgentStatus, number> = {
      idle: 0,
      active: 0,
      busy: 0,
      error: 0,
      offline: 0,
      maintenance: 0
    };

    const typeBreakdown: Record<string, number> = {};
    let totalConfidence = 0;
    let totalProgress = 0;
    let totalActiveTasks = 0;
    let totalResources = { cpu: 0, memory: 0, tokens: 0 };

    for (const agent of agents) {
      // Status breakdown
      statusBreakdown[agent.status]++;

      // Type breakdown
      typeBreakdown[agent.type] = (typeBreakdown[agent.type] || 0) + 1;

      // Confidence and progress
      totalConfidence += agent.confidence;
      totalProgress += agent.progress;

      // Active tasks
      if (agent.currentTask) {
        totalActiveTasks++;
      }

      // Resources
      totalResources.cpu += agent.resources.cpu;
      totalResources.memory += agent.resources.memory;
      totalResources.tokens += agent.resources.tokensUsed;
    }

    const agentCount = agents.length;
    const healthScore = this.calculateHealthScore(agents);

    return {
      totalAgents: agentCount,
      statusBreakdown,
      typeBreakdown,
      averageConfidence: agentCount > 0 ? totalConfidence / agentCount : 0,
      averageProgress: agentCount > 0 ? totalProgress / agentCount : 0,
      totalActiveTasks,
      totalResources,
      healthScore
    };
  }

  private calculateHealthScore(agents: AgentState[]): number {
    if (agents.length === 0) return 0;

    let healthScore = 0;

    for (const agent of agents) {
      let agentScore = 100;

      // Deduct for offline/error status
      if (agent.status === 'offline' || agent.status === 'error') {
        agentScore -= 50;
      } else if (agent.status === 'maintenance') {
        agentScore -= 25;
      }

      // Deduct for low confidence
      if (agent.confidence < 0.5) {
        agentScore -= 30;
      } else if (agent.confidence < 0.7) {
        agentScore -= 15;
      }

      // Deduct for resource pressure
      if (agent.resources.cpu > 0.9 || agent.resources.memory > 0.9) {
        agentScore -= 20;
      } else if (agent.resources.cpu > 0.7 || agent.resources.memory > 0.7) {
        agentScore -= 10;
      }

      // Check heartbeat age
      const heartbeatAge = Date.now() - agent.lastHeartbeat;
      if (heartbeatAge > 30000) { // 30 seconds
        agentScore -= 40;
      } else if (heartbeatAge > 15000) { // 15 seconds
        agentScore -= 20;
      }

      healthScore += Math.max(0, agentScore);
    }

    return healthScore / agents.length;
  }

  // ===== EVENT PUBLISHING =====

  private async publishStateChange(event: StateChangeEvent): Promise<void> {
    const channel = `agent-state:${event.agentId}:change`;
    await this.redis.publish(channel, JSON.stringify(event));
  }

  async publishHeartbeat(heartbeat: HeartbeatEvent): Promise<void> {
    const channel = `agent-state:${heartbeat.agentId}:heartbeat`;
    await this.redis.publish(channel, JSON.stringify({ type: 'heartbeat', heartbeat }));
  }

  // ===== CLEANUP AND MAINTENANCE =====

  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const keys = await this.redis.keys('agent-state:*');

    for (const key of keys) {
      const stateData = await this.redis.get(key);
      if (stateData) {
        try {
          const state: AgentState = JSON.parse(stateData);
          const age = now - state.lastHeartbeat;

          // Remove very old states (older than 24 hours)
          if (age > 24 * 60 * 60 * 1000) {
            await this.redis.del(key);
            this.stateCache.delete(state.id);
            this.logger.debug('Cleaned up old agent state', { agentId: state.id });
          }
        } catch (error) {
          // Remove corrupted state data
          await this.redis.del(key);
          this.logger.error('Cleaned up corrupted agent state', { key, error });
        }
      }
    }
  }

  // ===== AGENT LIFECYCLE =====

  async createAgentState(
    agentId: string,
    status: AgentStatus = 'idle',
    resources: Partial<ResourceUsage> = {}
  ): Promise<AgentState> {
    const state: AgentState = {
      id: agentId,
      type: 'unknown',
      status,
      progress: 0,
      confidence: 0,
      lastHeartbeat: Date.now(),
      metadata: {},
      resources: {
        cpu: 0,
        memory: 0,
        tokensUsed: 0,
        ...resources
      },
      capabilities: []
    };

    await this.updateAgentState(agentId, state, 'Agent created');
    this.emit('agentCreated', state);
    return state;
  }

  async removeAgentState(agentId: string): Promise<void> {
    const stateKey = `agent-state:${agentId}`;
    await this.redis.del(stateKey);
    this.stateCache.delete(agentId);

    // Clear heartbeat timeout
    const timeout = this.heartbeatTimeouts.get(agentId);
    if (timeout) {
      clearTimeout(timeout);
      this.heartbeatTimeouts.delete(agentId);
    }

    this.emit('agentRemoved', agentId);
    this.logger.info('Agent state removed', { agentId });
  }

  // ===== HEALTH CHECKS =====

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    totalAgents: number;
    activeAgents: number;
    averageHeartbeatAge: number;
    redisConnected: boolean;
  }> {
    try {
      await this.redis.ping();

      const aggregation = await this.getStateAggregation();
      const activeAgents = aggregation.statusBreakdown.active + aggregation.statusBreakdown.busy;
      const now = Date.now();

      const agents = await this.getAllAgentStates();
      const heartbeatAges = agents.map(agent => now - agent.lastHeartbeat);
      const averageHeartbeatAge = heartbeatAges.length > 0
        ? heartbeatAges.reduce((sum, age) => sum + age, 0) / heartbeatAges.length
        : 0;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (averageHeartbeatAge > 30000) status = 'degraded';
      if (averageHeartbeatAge > 60000) status = 'unhealthy';
      if (aggregation.healthScore < 70) status = 'degraded';
      if (aggregation.healthScore < 50) status = 'unhealthy';

      return {
        status,
        totalAgents: aggregation.totalAgents,
        activeAgents,
        averageHeartbeatAge,
        redisConnected: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        totalAgents: 0,
        activeAgents: 0,
        averageHeartbeatAge: 0,
        redisConnected: false
      };
    }
  }

  // ===== LIFECYCLE MANAGEMENT =====

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down agent state manager');

    // Clear intervals
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);

    // Clear timeouts
    for (const timeout of this.heartbeatTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.heartbeatTimeouts.clear();

    // Clear cache
    this.stateCache.clear();

    this.removeAllListeners();
    this.logger.info('Agent state manager shutdown complete');
  }
}