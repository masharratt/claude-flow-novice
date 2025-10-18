/**
 * Enhanced Progress Tracker with Granular Progress Updates and Redis Messaging
 * 
 * Provides detailed progress tracking for agent tasks with real-time Redis pub/sub messaging.
 * Supports granular progress updates, confidence scoring, and comprehensive visibility
 * into agent execution states.
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '../core/logger.js';
import type { LoggingConfig } from '../utils/types.js';

// ===== TYPE DEFINITIONS =====

/**
 * Granular progress step within a task
 */
export interface ProgressStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  startTime?: number;
  endTime?: number;
  duration?: number;
  confidence?: number;
  metadata?: Record<string, any>;
  error?: string;
  subSteps?: ProgressStep[];
}

/**
 * Detailed task progress information
 */
export interface TaskProgress {
  taskId: string;
  agentId: string;
  swarmId: string;
  taskType: string;
  taskDescription: string;
  overallStatus: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  progressPercentage: number;
  currentStep?: string;
  steps: ProgressStep[];
  startTime: number;
  endTime?: number;
  estimatedCompletion?: number;
  confidence: number;
  metadata: {
    filesProcessed?: string[];
    deliverables?: string[];
    dependencies?: string[];
    blockers?: string[];
    resources?: {
      memoryUsage?: number;
      cpuUsage?: number;
      diskUsage?: number;
    };
  };
  reasoning?: {
    currentThought?: string;
    strategy?: string;
    alternatives?: string[];
    risks?: string[];
  };
}

/**
 * Progress update message for Redis pub/sub
 */
export interface ProgressUpdateMessage {
  type: 'progress_update' | 'step_update' | 'task_complete' | 'task_failed';
  agentId: string;
  swarmId: string;
  taskId: string;
  timestamp: number;
  data: Partial<TaskProgress> | Partial<ProgressStep>;
  signature?: string;
}

/**
 * Agent visibility information
 */
export interface AgentVisibility {
  agentId: string;
  agentType: string;
  status: 'idle' | 'active' | 'working' | 'blocked' | 'completed' | 'error';
  currentTask?: TaskProgress;
  recentActivity: Array<{
    timestamp: number;
    action: string;
    details: string;
  }>;
  performance: {
    tasksCompleted: number;
    averageTaskDuration: number;
    successRate: number;
    currentStreak: number;
  };
  capabilities: string[];
  availability: {
    nextAvailable?: number;
    currentLoad: number;
    maxConcurrentTasks: number;
  };
}

/**
 * Swarm-wide progress overview
 */
export interface SwarmProgressOverview {
  swarmId: string;
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  overallProgress: number;
  estimatedCompletion?: number;
  bottlenecks: string[];
  healthScore: number;
  lastUpdated: number;
}

// ===== REDIS CHANNELS AND KEYS =====

export const REDIS_CHANNELS = {
  PROGRESS_UPDATES: 'progress:updates',
  AGENT_VISIBILITY: 'agent:visibility',
  SWARM_OVERVIEW: 'swarm:overview',
  TASK_EVENTS: 'task:events',
  COORDINATION_SIGNALS: 'coordination:signals'
} as const;

export const REDIS_KEYS = {
  AGENT_PROGRESS: 'agent:progress:',
  TASK_PROGRESS: 'task:progress:',
  SWARM_OVERVIEW: 'swarm:overview:',
  AGENT_VISIBILITY: 'agent:visibility:',
  PROGRESS_HISTORY: 'progress:history:'
} as const;

// ===== ENHANCED PROGRESS TRACKER CLASS =====

export class EnhancedProgressTracker extends EventEmitter {
  private redis: RedisClientType;
  private subscriber: RedisClientType;
  private logger: Logger;
  private taskProgress = new Map<string, TaskProgress>();
  private agentVisibility = new Map<string, AgentVisibility>();
  private swarmOverviews = new Map<string, SwarmProgressOverview>();
  private subscriptions = new Map<string, Set<(message: any) => void>>();
  private hmacSecret: string;

  constructor(
    redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379',
    loggerConfig?: LoggingConfig,
    hmacSecret: string = process.env.HMAC_SECRET || 'default-secret'
  ) {
    super();
    this.hmacSecret = hmacSecret;
    
    // Initialize logger
    const config: LoggingConfig = loggerConfig || {
      level: process.env.CLAUDE_FLOW_ENV === 'test' ? 'error' : 'info',
      format: 'json',
      destination: 'console'
    };
    this.logger = new Logger(config, { component: 'EnhancedProgressTracker' });

    // Initialize Redis clients
    this.redis = createClient({ url: redisUrl });
    this.subscriber = createClient({ url: redisUrl });

    this.setupRedisClients();
  }

  /**
   * Initialize Redis connections and subscriptions
   */
  async initialize(): Promise<void> {
    try {
      await Promise.all([
        this.redis.connect(),
        this.subscriber.connect()
      ]);

      // Set up default subscriptions
      await this.setupDefaultSubscriptions();

      this.logger.info('Enhanced Progress Tracker initialized', {
        redisConnected: true,
        subscriptionsEnabled: true
      });

      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Enhanced Progress Tracker', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Create a new task progress tracker
   */
  async createTaskProgress(
    taskId: string,
    agentId: string,
    swarmId: string,
    taskType: string,
    taskDescription: string,
    steps: Omit<ProgressStep, 'status' | 'id'>[]
  ): Promise<void> {
    const progressSteps: ProgressStep[] = steps.map((step, index) => ({
      ...step,
      id: `step-${index + 1}`,
      status: 'pending'
    }));

    const taskProgress: TaskProgress = {
      taskId,
      agentId,
      swarmId,
      taskType,
      taskDescription,
      overallStatus: 'pending',
      progressPercentage: 0,
      steps: progressSteps,
      startTime: Date.now(),
      confidence: 0.5,
      metadata: {
        filesProcessed: [],
        deliverables: [],
        dependencies: [],
        blockers: [],
        resources: {}
      }
    };

    // Store in memory
    this.taskProgress.set(taskId, taskProgress);

    // Store in Redis with TTL
    await this.redis.setex(
      `${REDIS_KEYS.TASK_PROGRESS}${taskId}`,
      86400, // 24 hours TTL
      JSON.stringify(taskProgress)
    );

    // Publish creation event
    await this.publishProgressUpdate({
      type: 'progress_update',
      agentId,
      swarmId,
      taskId,
      timestamp: Date.now(),
      data: taskProgress
    });

    this.logger.info('Task progress created', {
      taskId,
      agentId,
      swarmId,
      taskType,
      stepCount: steps.length
    });
  }

  /**
   * Update task progress with granular step information
   */
  async updateTaskProgress(
    taskId: string,
    updates: {
      stepId?: string;
      progressPercentage?: number;
      confidence?: number;
      status?: TaskProgress['overallStatus'];
      currentStep?: string;
      metadata?: Partial<TaskProgress['metadata']>;
      reasoning?: Partial<TaskProgress['reasoning']>;
      error?: string;
    }
  ): Promise<void> {
    const existing = this.taskProgress.get(taskId);
    if (!existing) {
      throw new Error(`Task progress not found: ${taskId}`);
    }

    // Update task progress
    const updated: TaskProgress = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...updates.metadata
      },
      reasoning: {
        ...existing.reasoning,
        ...updates.reasoning
      }
    };

    // Update specific step if provided
    if (updates.stepId) {
      const step = updated.steps.find(s => s.id === updates.stepId);
      if (step) {
        if (updates.status && this.isStepStatus(updates.status)) {
          step.status = updates.status;
        }
        
        if (updates.status === 'in_progress' && !step.startTime) {
          step.startTime = Date.now();
        }
        
        if (updates.status === 'completed' || updates.status === 'failed') {
          step.endTime = Date.now();
          step.duration = step.endTime - (step.startTime || step.endTime);
        }

        if (updates.confidence) {
          step.confidence = updates.confidence;
        }

        if (updates.error) {
          step.error = updates.error;
        }
      }
    }

    // Recalculate overall progress
    updated.progressPercentage = this.calculateOverallProgress(updated.steps);

    // Update in memory
    this.taskProgress.set(taskId, updated);

    // Update in Redis
    await this.redis.setex(
      `${REDIS_KEYS.TASK_PROGRESS}${taskId}`,
      86400,
      JSON.stringify(updated)
    );

    // Publish update
    await this.publishProgressUpdate({
      type: 'progress_update',
      agentId: updated.agentId,
      swarmId: updated.swarmId,
      taskId,
      timestamp: Date.now(),
      data: updated
    });

    // Check for task completion
    if (updated.progressPercentage >= 100 && updated.overallStatus !== 'completed') {
      await this.completeTask(taskId);
    }

    this.logger.debug('Task progress updated', {
      taskId,
      progressPercentage: updated.progressPercentage,
      stepId: updates.stepId,
      status: updated.overallStatus
    });
  }

  /**
   * Add sub-steps to an existing step
   */
  async addSubSteps(
    taskId: string,
    parentStepId: string,
    subSteps: Omit<ProgressStep, 'status' | 'id'>[]
  ): Promise<void> {
    const task = this.taskProgress.get(taskId);
    if (!task) {
      throw new Error(`Task progress not found: ${taskId}`);
    }

    const parentStep = task.steps.find(s => s.id === parentStepId);
    if (!parentStep) {
      throw new Error(`Parent step not found: ${parentStepId}`);
    }

    const newSubSteps: ProgressStep[] = subSteps.map((step, index) => ({
      ...step,
      id: `${parentStepId}-sub-${index + 1}`,
      status: 'pending'
    }));

    parentStep.subSteps = [...(parentStep.subSteps || []), ...newSubSteps];

    // Update in memory and Redis
    this.taskProgress.set(taskId, task);
    await this.redis.setex(
      `${REDIS_KEYS.TASK_PROGRESS}${taskId}`,
      86400,
      JSON.stringify(task)
    );

    this.logger.debug('Sub-steps added', {
      taskId,
      parentStepId,
      subStepCount: subSteps.length
    });
  }

  /**
   * Mark task as completed
   */
  async completeTask(taskId: string, deliverables?: string[]): Promise<void> {
    const task = this.taskProgress.get(taskId);
    if (!task) {
      throw new Error(`Task progress not found: ${taskId}`);
    }

    task.overallStatus = 'completed';
    task.endTime = Date.now();
    task.progressPercentage = 100;
    task.confidence = Math.max(task.confidence, 0.8);

    if (deliverables) {
      task.metadata.deliverables = [...(task.metadata.deliverables || []), ...deliverables];
    }

    // Update in memory and Redis
    this.taskProgress.set(taskId, task);
    await this.redis.setex(
      `${REDIS_KEYS.TASK_PROGRESS}${taskId}`,
      86400,
      JSON.stringify(task)
    );

    // Update agent visibility
    await this.updateAgentVisibility(task.agentId, {
      status: 'completed',
      performance: {
        tasksCompleted: (this.agentVisibility.get(task.agentId)?.performance.tasksCompleted || 0) + 1,
        averageTaskDuration: this.calculateAverageTaskDuration(task.agentId),
        successRate: this.calculateSuccessRate(task.agentId),
        currentStreak: (this.agentVisibility.get(task.agentId)?.performance.currentStreak || 0) + 1
      }
    });

    // Publish completion event
    await this.publishProgressUpdate({
      type: 'task_complete',
      agentId: task.agentId,
      swarmId: task.swarmId,
      taskId,
      timestamp: Date.now(),
      data: task
    });

    this.logger.info('Task completed', {
      taskId,
      agentId: task.agentId,
      duration: task.endTime - task.startTime,
      deliverables: task.metadata.deliverables?.length || 0
    });
  }

  /**
   * Mark task as failed
   */
  async failTask(taskId: string, error: string, details?: Record<string, any>): Promise<void> {
    const task = this.taskProgress.get(taskId);
    if (!task) {
      throw new Error(`Task progress not found: ${taskId}`);
    }

    task.overallStatus = 'failed';
    task.endTime = Date.now();
    task.confidence = Math.min(task.confidence, 0.2);

    // Add error to current step or task metadata
    if (task.currentStep) {
      const currentStep = task.steps.find(s => s.id === task.currentStep);
      if (currentStep) {
        currentStep.status = 'failed';
        currentStep.error = error;
        currentStep.endTime = Date.now();
      }
    }

    task.metadata.blockers = [...(task.metadata.blockers || []), error];

    // Update in memory and Redis
    this.taskProgress.set(taskId, task);
    await this.redis.setex(
      `${REDIS_KEYS.TASK_PROGRESS}${taskId}`,
      86400,
      JSON.stringify(task)
    );

    // Update agent visibility
    await this.updateAgentVisibility(task.agentId, {
      status: 'error',
      performance: {
        tasksCompleted: this.agentVisibility.get(task.agentId)?.performance.tasksCompleted || 0,
        averageTaskDuration: this.calculateAverageTaskDuration(task.agentId),
        successRate: this.calculateSuccessRate(task.agentId),
        currentStreak: 0
      }
    });

    // Publish failure event
    await this.publishProgressUpdate({
      type: 'task_failed',
      agentId: task.agentId,
      swarmId: task.swarmId,
      taskId,
      timestamp: Date.now(),
      data: { ...task, error, details }
    });

    this.logger.error('Task failed', {
      taskId,
      agentId: task.agentId,
      error,
      duration: task.endTime - task.startTime
    });
  }

  /**
   * Update agent visibility information
   */
  async updateAgentVisibility(
    agentId: string,
    updates: Partial<AgentVisibility>
  ): Promise<void> {
    const existing = this.agentVisibility.get(agentId) || this.createDefaultAgentVisibility(agentId);
    
    const updated: AgentVisibility = {
      ...existing,
      ...updates,
      recentActivity: [
        {
          timestamp: Date.now(),
          action: 'status_update',
          details: `Status updated to ${updates.status || existing.status}`
        },
        ...existing.recentActivity.slice(0, 49) // Keep last 50 activities
      ]
    };

    this.agentVisibility.set(agentId, updated);

    // Store in Redis
    await this.redis.setex(
      `${REDIS_KEYS.AGENT_VISIBILITY}${agentId}`,
      3600, // 1 hour TTL
      JSON.stringify(updated)
    );

    // Publish visibility update
    await this.redis.publish(
      REDIS_CHANNELS.AGENT_VISIBILITY,
      JSON.stringify({
        type: 'visibility_update',
        agentId,
        timestamp: Date.now(),
        data: updated
      })
    );

    this.emit('agent-visibility-updated', { agentId, visibility: updated });
  }

  /**
   * Get comprehensive task progress
   */
  async getTaskProgress(taskId: string): Promise<TaskProgress | null> {
    // Try memory first
    let progress = this.taskProgress.get(taskId);
    
    // Fallback to Redis
    if (!progress) {
      const stored = await this.redis.get(`${REDIS_KEYS.TASK_PROGRESS}${taskId}`);
      if (stored) {
        progress = JSON.parse(stored);
        this.taskProgress.set(taskId, progress);
      }
    }

    return progress || null;
  }

  /**
   * Get agent visibility information
   */
  async getAgentVisibility(agentId: string): Promise<AgentVisibility | null> {
    // Try memory first
    let visibility = this.agentVisibility.get(agentId);
    
    // Fallback to Redis
    if (!visibility) {
      const stored = await this.redis.get(`${REDIS_KEYS.AGENT_VISIBILITY}${agentId}`);
      if (stored) {
        visibility = JSON.parse(stored);
        this.agentVisibility.set(agentId, visibility);
      }
    }

    return visibility || null;
  }

  /**
   * Get swarm progress overview
   */
  async getSwarmOverview(swarmId: string): Promise<SwarmProgressOverview | null> {
    // Try memory first
    let overview = this.swarmOverviews.get(swarmId);
    
    // If not in memory or stale, recalculate
    if (!overview || (Date.now() - overview.lastUpdated) > 30000) { // 30 seconds stale
      overview = await this.calculateSwarmOverview(swarmId);
      this.swarmOverviews.set(swarmId, overview);
    }

    return overview;
  }

  /**
   * Get active tasks for an agent
   */
  async getActiveTasks(agentId: string): Promise<TaskProgress[]> {
    const tasks: TaskProgress[] = [];
    
    // Check memory
    for (const [taskId, task] of this.taskProgress) {
      if (task.agentId === agentId && task.overallStatus === 'in_progress') {
        tasks.push(task);
      }
    }

    // Check Redis for any additional tasks
    const pattern = `${REDIS_KEYS.TASK_PROGRESS}*`;
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      if (!this.taskProgress.has(key.replace(REDIS_KEYS.TASK_PROGRESS, ''))) {
        const stored = await this.redis.get(key);
        if (stored) {
          const task = JSON.parse(stored);
          if (task.agentId === agentId && task.overallStatus === 'in_progress') {
            tasks.push(task);
          }
        }
      }
    }

    return tasks;
  }

  /**
   * Subscribe to progress updates for specific agents or swarms
   */
  async subscribeToProgress(
    filter: {
      agentIds?: string[];
      swarmIds?: string[];
      taskTypes?: string[];
    },
    callback: (message: ProgressUpdateMessage) => void
  ): Promise<void> {
    const subscriptionKey = JSON.stringify(filter);
    
    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, new Set());
    }
    
    this.subscriptions.get(subscriptionKey)!.add(callback);

    // Subscribe to Redis channel if not already subscribed
    await this.subscriber.subscribe(REDIS_CHANNELS.PROGRESS_UPDATES, (message) => {
      try {
        const update: ProgressUpdateMessage = JSON.parse(message);
        
        // Apply filter
        if (filter.agentIds && !filter.agentIds.includes(update.agentId)) return;
        if (filter.swarmIds && !filter.swarmIds.includes(update.swarmId)) return;
        
        // Get task details for task type filtering
        if (filter.taskTypes) {
          const task = this.taskProgress.get(update.taskId);
          if (!task || !filter.taskTypes.includes(task.taskType)) return;
        }
        
        callback(update);
      } catch (error) {
        this.logger.error('Error processing progress update', {
          error: error instanceof Error ? error.message : String(error),
          message
        });
      }
    });

    this.logger.debug('Subscribed to progress updates', { filter });
  }

  /**
   * Unsubscribe from progress updates
   */
  async unsubscribeFromProgress(
    filter: Record<string, string[]>,
    callback?: (message: ProgressUpdateMessage) => void
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
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      await Promise.all([
        this.redis.quit(),
        this.subscriber.quit()
      ]);
      
      this.taskProgress.clear();
      this.agentVisibility.clear();
      this.swarmOverviews.clear();
      this.subscriptions.clear();
      
      this.logger.info('Enhanced Progress Tracker cleaned up');
    } catch (error) {
      this.logger.error('Error during cleanup', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ===== PRIVATE METHODS =====

  private setupRedisClients(): void {
    this.redis.on('error', (err) => {
      this.logger.error('Redis client error', { error: err.message });
    });

    this.subscriber.on('error', (err) => {
      this.logger.error('Redis subscriber error', { error: err.message });
    });
  }

  private async setupDefaultSubscriptions(): Promise<void> {
    // Subscribe to agent visibility updates
    await this.subscriber.subscribe(REDIS_CHANNELS.AGENT_VISIBILITY, (message) => {
      try {
        const update = JSON.parse(message);
        this.emit('agent-visibility-update', update);
      } catch (error) {
        this.logger.error('Error processing visibility update', { error });
      }
    });
  }

  private async publishProgressUpdate(message: ProgressUpdateMessage): Promise<void> {
    // Add HMAC signature for authentication
    message.signature = this.generateHmacSignature(message);
    
    await this.redis.publish(
      REDIS_CHANNELS.PROGRESS_UPDATES,
      JSON.stringify(message)
    );
  }

  private generateHmacSignature(message: ProgressUpdateMessage): string {
    const crypto = require('crypto');
    const payload = JSON.stringify({
      type: message.type,
      agentId: message.agentId,
      swarmId: message.swarmId,
      taskId: message.taskId,
      timestamp: message.timestamp
    });
    
    return crypto.createHmac('sha256', this.hmacSecret)
                  .update(payload)
                  .digest('hex');
  }

  private calculateOverallProgress(steps: ProgressStep[]): number {
    if (steps.length === 0) return 0;
    
    let totalProgress = 0;
    let totalWeight = 0;
    
    for (const step of steps) {
      const stepProgress = this.calculateStepProgress(step);
      const weight = 1; // Can be modified to weight steps differently
      
      totalProgress += stepProgress * weight;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? Math.round(totalProgress / totalWeight) : 0;
  }

  private calculateStepProgress(step: ProgressStep): number {
    if (step.status === 'completed') return 100;
    if (step.status === 'failed') return 0;
    if (step.status === 'skipped') return 100;
    if (step.status !== 'in_progress') return 0;
    
    // If step has sub-steps, calculate based on sub-steps
    if (step.subSteps && step.subSteps.length > 0) {
      return this.calculateOverallProgress(step.subSteps);
    }
    
    // Default progress for in-progress steps without sub-steps
    return 50; // Can be enhanced with time-based estimation
  }

  private isStepStatus(status: any): status is ProgressStep['status'] {
    return ['pending', 'in_progress', 'completed', 'failed', 'skipped'].includes(status);
  }

  private createDefaultAgentVisibility(agentId: string): AgentVisibility {
    return {
      agentId,
      agentType: 'unknown',
      status: 'idle',
      recentActivity: [],
      performance: {
        tasksCompleted: 0,
        averageTaskDuration: 0,
        successRate: 1.0,
        currentStreak: 0
      },
      capabilities: [],
      availability: {
        currentLoad: 0,
        maxConcurrentTasks: 1
      }
    };
  }

  private async calculateSwarmOverview(swarmId: string): Promise<SwarmProgressOverview> {
    const tasks = Array.from(this.taskProgress.values()).filter(t => t.swarmId === swarmId);
    const agents = Array.from(this.agentVisibility.values()).filter(a => 
      this.taskProgress.has(a.agentId) && 
      this.taskProgress.get(a.agentId)?.swarmId === swarmId
    );

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.overallStatus === 'completed').length;
    const failedTasks = tasks.filter(t => t.overallStatus === 'failed').length;
    const activeAgents = agents.filter(a => ['active', 'working'].includes(a.status)).length;

    const overallProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const successRate = totalTasks > 0 ? (completedTasks / totalTasks) : 1.0;
    const healthScore = (successRate * 0.7 + (activeAgents / Math.max(1, agents.length)) * 0.3) * 100;

    // Identify bottlenecks
    const bottlenecks: string[] = [];
    const blockedTasks = tasks.filter(t => t.overallStatus === 'blocked');
    if (blockedTasks.length > 0) {
      bottlenecks.push(`${blockedTasks.length} blocked tasks`);
    }

    const errorAgents = agents.filter(a => a.status === 'error');
    if (errorAgents.length > 0) {
      bottlenecks.push(`${errorAgents.length} agents in error state`);
    }

    return {
      swarmId,
      totalAgents: agents.length,
      activeAgents,
      totalTasks,
      completedTasks,
      failedTasks,
      overallProgress: Math.round(overallProgress),
      estimatedCompletion: this.estimateSwarmCompletion(swarmId),
      bottlenecks,
      healthScore: Math.round(healthScore),
      lastUpdated: Date.now()
    };
  }

  private estimateSwarmCompletion(swarmId: string): number | undefined {
    const tasks = Array.from(this.taskProgress.values()).filter(t => 
      t.swarmId === swarmId && t.overallStatus === 'in_progress'
    );

    if (tasks.length === 0) return undefined;

    const averageTaskTime = tasks.reduce((sum, task) => {
      const elapsed = Date.now() - task.startTime;
      const progress = task.progressPercentage / 100;
      return sum + (progress > 0 ? elapsed / progress : 0);
    }, 0) / tasks.length;

    return Date.now() + averageTaskTime;
  }

  private calculateAverageTaskDuration(agentId: string): number {
    const completedTasks = Array.from(this.taskProgress.values()).filter(t => 
      t.agentId === agentId && 
      t.overallStatus === 'completed' && 
      t.endTime
    );

    if (completedTasks.length === 0) return 0;

    const totalDuration = completedTasks.reduce((sum, task) => 
      sum + (task.endTime! - task.startTime), 0
    );

    return totalDuration / completedTasks.length;
  }

  private calculateSuccessRate(agentId: string): number {
    const agentTasks = Array.from(this.taskProgress.values()).filter(t => t.agentId === agentId);
    
    if (agentTasks.length === 0) return 1.0;

    const completedTasks = agentTasks.filter(t => t.overallStatus === 'completed').length;
    return completedTasks / agentTasks.length;
  }
}

// ===== FACTORY FUNCTION =====

export function createEnhancedProgressTracker(
  redisUrl?: string,
  loggerConfig?: LoggingConfig,
  hmacSecret?: string
): EnhancedProgressTracker {
  return new EnhancedProgressTracker(redisUrl, loggerConfig, hmacSecret);
}

// ===== EXPORTS =====

export default EnhancedProgressTracker;