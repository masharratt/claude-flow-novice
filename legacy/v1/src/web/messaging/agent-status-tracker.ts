/**
 * Agent Status Tracker - Real-time tracking of agent status and coordination
 * Optimized for 3-agent swarms with detailed status visualization
 */

import { EventEmitter } from 'events';
import { ILogger } from '../../core/logger.js';

export interface AgentStatus {
  id: string;
  type: 'researcher' | 'coder' | 'reviewer';
  name?: string;
  status: 'idle' | 'active' | 'working' | 'coordinating' | 'blocked' | 'completed' | 'error';
  currentTask?: {
    id: string;
    description: string;
    startTime: string;
    estimatedCompletion?: string;
    progress?: number;
  };
  lastActivity: string;
  performance: {
    tasksCompleted: number;
    averageTaskTime: number;
    successRate: number;
    coordinationEvents: number;
  };
  coordination: {
    connectedAgents: string[];
    pendingHandoffs: number;
    blockedBy: string[];
    blocking: string[];
  };
  resources: {
    memoryUsage?: number;
    cpuUsage?: number;
    networkLatency?: number;
  };
  reasoning: {
    currentThought?: string;
    confidence?: number;
    alternatives?: string[];
    nextSteps?: string[];
  };
}

export interface SwarmStatus {
  swarmId: string;
  name?: string;
  status: 'initializing' | 'active' | 'coordinating' | 'completing' | 'completed' | 'error';
  agents: AgentStatus[];
  coordination: {
    activeHandoffs: number;
    coordinationEfficiency: number;
    communicationPatterns: Record<string, number>;
    bottlenecks: string[];
  };
  tasks: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    progress: number;
  };
  performance: {
    startTime: string;
    estimatedCompletion?: string;
    actualCompletion?: string;
    efficiency: number;
    throughput: number;
  };
  relaunchHistory?: {
    count: number;
    attempts: Array<{
      timestamp: string;
      reason: string;
      changes: string[];
    }>;
  };
}

export class AgentStatusTracker extends EventEmitter {
  private agentStatuses = new Map<string, AgentStatus>();
  private swarmStatuses = new Map<string, SwarmStatus>();
  private statusHistory = new Map<string, AgentStatus[]>();
  private MAX_HISTORY_LENGTH = 100;

  constructor(private logger: ILogger) {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Update agent status with detailed information
   */
  public updateAgentStatus(update: Partial<AgentStatus> & { id: string; swarmId: string }): void {
    const { swarmId, ...agentUpdate } = update;
    const existing =
      this.agentStatuses.get(update.id) || this.createDefaultAgentStatus(update.id, update.type!);

    const updatedStatus: AgentStatus = {
      ...existing,
      ...agentUpdate,
      lastActivity: new Date().toISOString(),
    };

    // Store status
    this.agentStatuses.set(update.id, updatedStatus);

    // Update history
    this.updateStatusHistory(update.id, updatedStatus);

    // Update swarm status
    this.updateSwarmStatus(swarmId);

    // Emit status change event
    this.emit('status-change', {
      swarmId,
      agentId: update.id,
      previousStatus: existing.status,
      currentStatus: updatedStatus.status,
      updatedStatus,
    });

    this.logger.debug('Agent status updated', {
      agentId: update.id,
      swarmId,
      status: updatedStatus.status,
      task: updatedStatus.currentTask?.description,
    });
  }

  /**
   * Update agent task progress
   */
  public updateTaskProgress(
    agentId: string,
    swarmId: string,
    progress: {
      taskId: string;
      description: string;
      progress: number;
      estimatedCompletion?: string;
      reasoning?: {
        currentThought: string;
        confidence: number;
        alternatives?: string[];
        nextSteps?: string[];
      };
    },
  ): void {
    const agent = this.agentStatuses.get(agentId);
    if (!agent) return;

    agent.currentTask = {
      id: progress.taskId,
      description: progress.description,
      startTime: agent.currentTask?.startTime || new Date().toISOString(),
      estimatedCompletion: progress.estimatedCompletion,
      progress: progress.progress,
    };

    if (progress.reasoning) {
      agent.reasoning = progress.reasoning;
    }

    // Update status based on progress
    if (progress.progress >= 100) {
      agent.status = 'completed';
      agent.performance.tasksCompleted += 1;
    } else if (progress.progress > 0) {
      agent.status = 'working';
    }

    this.updateAgentStatus({ ...agent, swarmId });
  }

  /**
   * Update coordination between agents
   */
  public updateCoordination(
    swarmId: string,
    coordination: {
      fromAgent: string;
      toAgent: string;
      action: 'handoff' | 'request' | 'block' | 'unblock';
      details?: string;
    },
  ): void {
    const fromAgent = this.agentStatuses.get(coordination.fromAgent);
    const toAgent = this.agentStatuses.get(coordination.toAgent);

    if (!fromAgent || !toAgent) return;

    switch (coordination.action) {
      case 'handoff':
        fromAgent.coordination.pendingHandoffs -= 1;
        toAgent.coordination.pendingHandoffs += 1;
        fromAgent.performance.coordinationEvents += 1;
        break;

      case 'request':
        toAgent.coordination.pendingHandoffs += 1;
        break;

      case 'block':
        fromAgent.coordination.blocking.push(coordination.toAgent);
        toAgent.coordination.blockedBy.push(coordination.fromAgent);
        toAgent.status = 'blocked';
        break;

      case 'unblock':
        fromAgent.coordination.blocking = fromAgent.coordination.blocking.filter(
          (id) => id !== coordination.toAgent,
        );
        toAgent.coordination.blockedBy = toAgent.coordination.blockedBy.filter(
          (id) => id !== coordination.fromAgent,
        );
        if (toAgent.coordination.blockedBy.length === 0) {
          toAgent.status = 'active';
        }
        break;
    }

    // Update both agents
    this.updateAgentStatus({ ...fromAgent, swarmId });
    this.updateAgentStatus({ ...toAgent, swarmId });

    // Emit coordination event
    this.emit('coordination-update', {
      swarmId,
      coordination,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get current swarm status with all agent details
   */
  public async getSwarmStatus(swarmId: string): Promise<SwarmStatus | null> {
    return this.swarmStatuses.get(swarmId) || null;
  }

  /**
   * Get agent status with history
   */
  public getAgentStatus(agentId: string): {
    current: AgentStatus | null;
    history: AgentStatus[];
  } {
    return {
      current: this.agentStatuses.get(agentId) || null,
      history: this.statusHistory.get(agentId) || [],
    };
  }

  /**
   * Get real-time dashboard data for 3-agent swarms
   */
  public getSwarmDashboard(swarmId: string): any {
    const swarmStatus = this.swarmStatuses.get(swarmId);
    if (!swarmStatus) return null;

    const agents = swarmStatus.agents;
    const activeAgents = agents.filter((a) => a.status === 'active' || a.status === 'working');

    return {
      swarmId,
      lastUpdated: new Date().toISOString(),
      overview: {
        totalAgents: agents.length,
        activeAgents: activeAgents.length,
        completedTasks: swarmStatus.tasks.completed,
        overallProgress: swarmStatus.tasks.progress,
        efficiency: swarmStatus.performance.efficiency,
      },
      agents: agents.map((agent) => ({
        id: agent.id,
        type: agent.type,
        status: agent.status,
        currentTask: agent.currentTask,
        progress: agent.currentTask?.progress || 0,
        reasoning: agent.reasoning,
        coordination: {
          connectedTo: agent.coordination.connectedAgents,
          pendingWork: agent.coordination.pendingHandoffs,
          blockers: agent.coordination.blockedBy.length,
        },
      })),
      coordination: {
        activeHandoffs: swarmStatus.coordination.activeHandoffs,
        efficiency: swarmStatus.coordination.coordinationEfficiency,
        bottlenecks: swarmStatus.coordination.bottlenecks,
        communicationMatrix: this.generateCommunicationMatrix(agents),
      },
      alerts: this.generateStatusAlerts(swarmStatus),
      relaunchInfo: swarmStatus.relaunchHistory
        ? {
            count: swarmStatus.relaunchHistory.count,
            canRelaunch: swarmStatus.relaunchHistory.count < 10,
            lastAttempt:
              swarmStatus.relaunchHistory.attempts[swarmStatus.relaunchHistory.attempts.length - 1],
          }
        : null,
    };
  }

  /**
   * Generate performance analytics
   */
  public getPerformanceAnalytics(swarmId: string, timeRange: string = '1h'): any {
    const swarmStatus = this.swarmStatuses.get(swarmId);
    if (!swarmStatus) return null;

    const agents = swarmStatus.agents;
    const cutoff = this.parseTimeRange(timeRange);

    return {
      swarmId,
      timeRange,
      generatedAt: new Date().toISOString(),
      performance: {
        overallEfficiency: swarmStatus.performance.efficiency,
        throughput: swarmStatus.performance.throughput,
        averageTaskTime: this.calculateAverageTaskTime(agents),
        coordinationOverhead: this.calculateCoordinationOverhead(agents),
      },
      agentPerformance: agents.map((agent) => ({
        id: agent.id,
        type: agent.type,
        tasksCompleted: agent.performance.tasksCompleted,
        successRate: agent.performance.successRate,
        averageTaskTime: agent.performance.averageTaskTime,
        coordinationEvents: agent.performance.coordinationEvents,
      })),
      trends: {
        productivityTrend: this.calculateProductivityTrend(agents),
        coordinationTrend: this.calculateCoordinationTrend(swarmStatus),
        errorRate: this.calculateErrorRate(agents),
      },
      recommendations: this.generatePerformanceRecommendations(swarmStatus),
    };
  }

  /**
   * Add swarm relaunch to history
   */
  public recordSwarmRelaunch(swarmId: string, reason: string, changes: string[]): void {
    const swarmStatus = this.swarmStatuses.get(swarmId);
    if (!swarmStatus) return;

    if (!swarmStatus.relaunchHistory) {
      swarmStatus.relaunchHistory = { count: 0, attempts: [] };
    }

    swarmStatus.relaunchHistory.count += 1;
    swarmStatus.relaunchHistory.attempts.push({
      timestamp: new Date().toISOString(),
      reason,
      changes,
    });

    this.emit('swarm-relaunch-recorded', {
      swarmId,
      relaunchCount: swarmStatus.relaunchHistory.count,
      reason,
    });
  }

  private createDefaultAgentStatus(
    id: string,
    type: 'researcher' | 'coder' | 'reviewer',
  ): AgentStatus {
    return {
      id,
      type,
      status: 'idle',
      lastActivity: new Date().toISOString(),
      performance: {
        tasksCompleted: 0,
        averageTaskTime: 0,
        successRate: 1.0,
        coordinationEvents: 0,
      },
      coordination: {
        connectedAgents: [],
        pendingHandoffs: 0,
        blockedBy: [],
        blocking: [],
      },
      resources: {},
      reasoning: {},
    };
  }

  private updateStatusHistory(agentId: string, status: AgentStatus): void {
    if (!this.statusHistory.has(agentId)) {
      this.statusHistory.set(agentId, []);
    }

    const history = this.statusHistory.get(agentId)!;
    history.push({ ...status }); // Deep copy

    // Trim history to max length
    if (history.length > this.MAX_HISTORY_LENGTH) {
      history.splice(0, history.length - this.MAX_HISTORY_LENGTH);
    }
  }

  private updateSwarmStatus(swarmId: string): void {
    const agents = Array.from(this.agentStatuses.values());
    const swarmAgents = agents; // All agents belong to the swarm in this simple case

    if (swarmAgents.length === 0) return;

    const existingSwarm = this.swarmStatuses.get(swarmId);

    // Calculate coordination metrics
    const coordination = this.calculateCoordinationMetrics(swarmAgents);

    // Calculate task metrics
    const tasks = this.calculateTaskMetrics(swarmAgents);

    // Calculate performance metrics
    const performance = this.calculatePerformanceMetrics(swarmAgents, existingSwarm);

    // Determine overall swarm status
    const overallStatus = this.determineSwarmStatus(swarmAgents);

    const swarmStatus: SwarmStatus = {
      swarmId,
      status: overallStatus,
      agents: swarmAgents,
      coordination,
      tasks,
      performance,
      relaunchHistory: existingSwarm?.relaunchHistory,
    };

    this.swarmStatuses.set(swarmId, swarmStatus);
  }

  private calculateCoordinationMetrics(agents: AgentStatus[]): SwarmStatus['coordination'] {
    const totalHandoffs = agents.reduce(
      (sum, agent) => sum + agent.coordination.pendingHandoffs,
      0,
    );
    const totalEvents = agents.reduce(
      (sum, agent) => sum + agent.performance.coordinationEvents,
      0,
    );

    // Calculate communication patterns
    const communicationPatterns: Record<string, number> = {};
    for (const agent of agents) {
      for (const connectedAgent of agent.coordination.connectedAgents) {
        const key = `${agent.id}-${connectedAgent}`;
        communicationPatterns[key] = (communicationPatterns[key] || 0) + 1;
      }
    }

    // Identify bottlenecks
    const bottlenecks: string[] = [];
    for (const agent of agents) {
      if (agent.coordination.blockedBy.length > 0) {
        bottlenecks.push(`${agent.id} blocked by ${agent.coordination.blockedBy.join(', ')}`);
      }
      if (agent.coordination.pendingHandoffs > 2) {
        bottlenecks.push(
          `${agent.id} has high handoff queue (${agent.coordination.pendingHandoffs})`,
        );
      }
    }

    return {
      activeHandoffs: totalHandoffs,
      coordinationEfficiency:
        totalEvents > 0 ? Math.min(100, (totalEvents / agents.length) * 10) : 100,
      communicationPatterns,
      bottlenecks,
    };
  }

  private calculateTaskMetrics(agents: AgentStatus[]): SwarmStatus['tasks'] {
    const total = agents.reduce((sum, agent) => sum + agent.performance.tasksCompleted, 0);
    const active = agents.filter((agent) => agent.currentTask && agent.status === 'working').length;
    const completed = agents.filter((agent) => agent.status === 'completed').length;
    const failed = agents.filter((agent) => agent.status === 'error').length;

    const progress =
      agents.length > 0
        ? agents.reduce((sum, agent) => sum + (agent.currentTask?.progress || 0), 0) / agents.length
        : 0;

    return { total, active, completed, failed, progress };
  }

  private calculatePerformanceMetrics(
    agents: AgentStatus[],
    existingSwarm?: SwarmStatus,
  ): SwarmStatus['performance'] {
    const completedTasks = agents.reduce((sum, agent) => sum + agent.performance.tasksCompleted, 0);
    const averageTaskTime =
      agents.length > 0
        ? agents.reduce((sum, agent) => sum + agent.performance.averageTaskTime, 0) / agents.length
        : 0;

    const efficiency =
      agents.length > 0
        ? (agents.reduce((sum, agent) => sum + agent.performance.successRate, 0) / agents.length) *
          100
        : 0;

    return {
      startTime: existingSwarm?.performance.startTime || new Date().toISOString(),
      efficiency,
      throughput: completedTasks / Math.max(1, averageTaskTime / 3600), // tasks per hour
    };
  }

  private determineSwarmStatus(agents: AgentStatus[]): SwarmStatus['status'] {
    if (agents.length === 0) return 'initializing';

    const errorAgents = agents.filter((a) => a.status === 'error');
    if (errorAgents.length > 0) return 'error';

    const completedAgents = agents.filter((a) => a.status === 'completed');
    if (completedAgents.length === agents.length) return 'completed';

    const workingAgents = agents.filter(
      (a) => a.status === 'working' || a.status === 'coordinating',
    );
    if (workingAgents.length > 0) return 'active';

    return 'active';
  }

  private generateCommunicationMatrix(
    agents: AgentStatus[],
  ): Record<string, Record<string, number>> {
    const matrix: Record<string, Record<string, number>> = {};

    for (const agent of agents) {
      matrix[agent.id] = {};
      for (const otherAgent of agents) {
        if (agent.id !== otherAgent.id) {
          matrix[agent.id][otherAgent.id] = agent.coordination.connectedAgents.includes(
            otherAgent.id,
          )
            ? 1
            : 0;
        }
      }
    }

    return matrix;
  }

  private generateStatusAlerts(swarmStatus: SwarmStatus): string[] {
    const alerts: string[] = [];

    // Check for blocked agents
    const blockedAgents = swarmStatus.agents.filter((a) => a.status === 'blocked');
    if (blockedAgents.length > 0) {
      alerts.push(`${blockedAgents.length} agent(s) blocked`);
    }

    // Check for coordination bottlenecks
    if (swarmStatus.coordination.activeHandoffs > 5) {
      alerts.push(
        `High coordination load (${swarmStatus.coordination.activeHandoffs} pending handoffs)`,
      );
    }

    // Check efficiency
    if (swarmStatus.performance.efficiency < 50) {
      alerts.push('Low swarm efficiency detected');
    }

    // Check for error agents
    const errorAgents = swarmStatus.agents.filter((a) => a.status === 'error');
    if (errorAgents.length > 0) {
      alerts.push(`${errorAgents.length} agent(s) in error state`);
    }

    return alerts;
  }

  private calculateAverageTaskTime(agents: AgentStatus[]): number {
    const taskTimes = agents.map((a) => a.performance.averageTaskTime).filter((t) => t > 0);
    return taskTimes.length > 0
      ? taskTimes.reduce((sum, time) => sum + time, 0) / taskTimes.length
      : 0;
  }

  private calculateCoordinationOverhead(agents: AgentStatus[]): number {
    const totalEvents = agents.reduce(
      (sum, agent) => sum + agent.performance.coordinationEvents,
      0,
    );
    const totalTasks = agents.reduce((sum, agent) => sum + agent.performance.tasksCompleted, 0);
    return totalTasks > 0 ? (totalEvents / totalTasks) * 100 : 0;
  }

  private calculateProductivityTrend(agents: AgentStatus[]): string {
    // Simple trend based on success rate
    const averageSuccess =
      agents.reduce((sum, agent) => sum + agent.performance.successRate, 0) / agents.length;
    if (averageSuccess > 0.8) return 'improving';
    if (averageSuccess > 0.6) return 'stable';
    return 'declining';
  }

  private calculateCoordinationTrend(swarmStatus: SwarmStatus): string {
    if (swarmStatus.coordination.coordinationEfficiency > 80) return 'efficient';
    if (swarmStatus.coordination.coordinationEfficiency > 60) return 'moderate';
    return 'inefficient';
  }

  private calculateErrorRate(agents: AgentStatus[]): number {
    const errorAgents = agents.filter((a) => a.status === 'error').length;
    return agents.length > 0 ? (errorAgents / agents.length) * 100 : 0;
  }

  private generatePerformanceRecommendations(swarmStatus: SwarmStatus): string[] {
    const recommendations: string[] = [];

    if (swarmStatus.performance.efficiency < 70) {
      recommendations.push('Consider task rebalancing to improve efficiency');
    }

    if (swarmStatus.coordination.activeHandoffs > 10) {
      recommendations.push('High coordination overhead - simplify agent interactions');
    }

    const blockedAgents = swarmStatus.agents.filter((a) => a.status === 'blocked');
    if (blockedAgents.length > 0) {
      recommendations.push('Resolve agent blockers to improve throughput');
    }

    if (swarmStatus.relaunchHistory && swarmStatus.relaunchHistory.count > 3) {
      recommendations.push('Multiple relaunches detected - consider fundamental approach changes');
    }

    return recommendations;
  }

  private parseTimeRange(timeRange: string): Date {
    const now = new Date();
    const value = parseInt(timeRange.slice(0, -1));
    const unit = timeRange.slice(-1);

    switch (unit) {
      case 'h':
        return new Date(now.getTime() - value * 60 * 60 * 1000);
      case 'd':
        return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
      case 'm':
        return new Date(now.getTime() - value * 60 * 1000);
      default:
        return new Date(now.getTime() - 60 * 60 * 1000); // Default 1h
    }
  }

  public getActiveSwarmCount(): number {
    return Array.from(this.swarmStatuses.values()).filter((swarm) => swarm.status === 'active')
      .length;
  }
}
