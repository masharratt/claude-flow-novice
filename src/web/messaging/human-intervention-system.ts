/**
 * Human Intervention System - Allows humans to redirect agents without stopping them
 * Supports swarm relaunching up to 10 times for iterative improvement
 */

import { EventEmitter } from 'events';
import { ILogger } from '../../core/logger.js';

export interface HumanIntervention {
  id: string;
  swarmId: string;
  agentId?: string; // Optional - can target all agents in swarm
  userId: string;
  message: string;
  action:
    | 'redirect'
    | 'pause'
    | 'resume'
    | 'priority-change'
    | 'relaunch-swarm'
    | 'modify-goal'
    | 'add-constraint';
  metadata?: {
    newPriority?: 'low' | 'medium' | 'high' | 'urgent';
    newGoal?: string;
    constraints?: string[];
    reasoning?: string;
    expectedOutcome?: string;
    relaunchCount?: number;
  };
  timestamp: string;
  status: 'pending' | 'acknowledged' | 'applied' | 'rejected';
  response?: {
    agentId: string;
    message: string;
    timestamp: string;
    actionTaken: string;
  };
}

export interface SwarmRelaunchConfig {
  swarmId: string;
  reason: string;
  modifications: {
    agentTypes?: ('researcher' | 'coder' | 'reviewer')[];
    objective?: string;
    constraints?: string[];
    priority?: string;
  };
  relaunchCount: number;
  maxRelaunches: number;
  preserveContext: boolean;
  learningsFromPrevious?: string[];
}

export class HumanInterventionSystem extends EventEmitter {
  private interventions = new Map<string, HumanIntervention>();
  private swarmRelaunches = new Map<string, SwarmRelaunchConfig>();
  private MAX_RELAUNCHES = 10;
  private interventionQueue = new Map<string, HumanIntervention[]>(); // swarmId -> interventions

  constructor(private logger: ILogger) {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Send human intervention to agents with swarm relaunch capability
   */
  public async sendIntervention(
    intervention: Omit<HumanIntervention, 'id' | 'status'>,
  ): Promise<string> {
    const interventionId = this.generateInterventionId();

    const fullIntervention: HumanIntervention = {
      ...intervention,
      id: interventionId,
      status: 'pending',
    };

    // Handle special case: swarm relaunch
    if (intervention.action === 'relaunch-swarm') {
      return await this.handleSwarmRelaunch(fullIntervention);
    }

    this.interventions.set(interventionId, fullIntervention);

    // Add to swarm queue
    if (!this.interventionQueue.has(intervention.swarmId)) {
      this.interventionQueue.set(intervention.swarmId, []);
    }
    this.interventionQueue.get(intervention.swarmId)!.push(fullIntervention);

    // Emit intervention event
    this.emit('intervention', fullIntervention);

    this.logger.info('Human intervention sent', {
      interventionId,
      swarmId: intervention.swarmId,
      agentId: intervention.agentId,
      action: intervention.action,
    });

    return interventionId;
  }

  /**
   * Handle swarm relaunch with learning from previous attempts
   */
  private async handleSwarmRelaunch(intervention: HumanIntervention): Promise<string> {
    const currentRelaunch = this.swarmRelaunches.get(intervention.swarmId);
    const relaunchCount = currentRelaunch ? currentRelaunch.relaunchCount + 1 : 1;

    if (relaunchCount > this.MAX_RELAUNCHES) {
      this.logger.warn('Maximum relaunch attempts reached', {
        swarmId: intervention.swarmId,
        relaunchCount,
      });
      intervention.status = 'rejected';
      intervention.response = {
        agentId: 'system',
        message: `Cannot relaunch swarm: maximum ${this.MAX_RELAUNCHES} attempts reached`,
        timestamp: new Date().toISOString(),
        actionTaken: 'rejected',
      };
      this.interventions.set(intervention.id, intervention);
      return intervention.id;
    }

    // Create relaunch configuration
    const relaunchConfig: SwarmRelaunchConfig = {
      swarmId: intervention.swarmId,
      reason: intervention.message,
      modifications: {
        agentTypes: this.determineOptimalAgentTypes(intervention),
        objective: intervention.metadata?.newGoal,
        constraints: intervention.metadata?.constraints,
        priority: intervention.metadata?.newPriority,
      },
      relaunchCount,
      maxRelaunches: this.MAX_RELAUNCHES,
      preserveContext: true,
      learningsFromPrevious: this.extractLearningsFromPreviousAttempts(intervention.swarmId),
    };

    this.swarmRelaunches.set(intervention.swarmId, relaunchConfig);
    intervention.metadata = {
      ...intervention.metadata,
      relaunchCount,
    };

    this.interventions.set(intervention.id, intervention);

    // Emit relaunch event
    this.emit('swarm-relaunch-requested', {
      intervention,
      relaunchConfig,
    });

    this.logger.info('Swarm relaunch initiated', {
      swarmId: intervention.swarmId,
      relaunchCount,
      reason: intervention.message,
    });

    return intervention.id;
  }

  /**
   * Determine optimal agent composition based on previous attempts
   */
  private determineOptimalAgentTypes(
    intervention: HumanIntervention,
  ): ('researcher' | 'coder' | 'reviewer')[] {
    const relaunchHistory = this.swarmRelaunches.get(intervention.swarmId);

    if (!relaunchHistory) {
      // First attempt - balanced approach
      return ['researcher', 'coder', 'reviewer'];
    }

    // Adjust based on what worked/didn't work
    const objective = intervention.metadata?.newGoal || 'general';

    if (
      objective.toLowerCase().includes('research') ||
      objective.toLowerCase().includes('analyze')
    ) {
      return ['researcher', 'researcher', 'reviewer']; // Research-heavy
    }

    if (
      objective.toLowerCase().includes('build') ||
      objective.toLowerCase().includes('implement')
    ) {
      return ['researcher', 'coder', 'coder']; // Implementation-heavy
    }

    if (objective.toLowerCase().includes('review') || objective.toLowerCase().includes('quality')) {
      return ['researcher', 'reviewer', 'reviewer']; // Quality-focused
    }

    // Default balanced approach
    return ['researcher', 'coder', 'reviewer'];
  }

  /**
   * Extract learnings from previous swarm attempts
   */
  private extractLearningsFromPreviousAttempts(swarmId: string): string[] {
    const learnings: string[] = [];
    const interventions = Array.from(this.interventions.values())
      .filter((i) => i.swarmId === swarmId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    for (const intervention of interventions) {
      if (intervention.status === 'applied' && intervention.response) {
        learnings.push(`${intervention.action}: ${intervention.response.actionTaken}`);
      }

      if (intervention.metadata?.reasoning) {
        learnings.push(`Human insight: ${intervention.metadata.reasoning}`);
      }
    }

    // Add default learnings for common patterns
    const relaunchCount = this.swarmRelaunches.get(swarmId)?.relaunchCount || 0;
    if (relaunchCount > 0) {
      learnings.push(
        `This is attempt #${relaunchCount + 1} - apply lessons from previous attempts`,
      );
    }

    if (relaunchCount > 2) {
      learnings.push('Multiple attempts suggest complexity - break down into smaller tasks');
    }

    if (relaunchCount > 5) {
      learnings.push('High relaunch count - consider fundamental approach change');
    }

    return learnings;
  }

  /**
   * Agent acknowledges intervention
   */
  public async acknowledgeIntervention(interventionId: string, agentId: string): Promise<void> {
    const intervention = this.interventions.get(interventionId);
    if (!intervention) {
      throw new Error(`Intervention ${interventionId} not found`);
    }

    intervention.status = 'acknowledged';
    intervention.response = {
      agentId,
      message: `Intervention acknowledged by agent ${agentId}`,
      timestamp: new Date().toISOString(),
      actionTaken: 'acknowledged',
    };

    this.emit('intervention-acknowledged', intervention);

    this.logger.debug('Intervention acknowledged', {
      interventionId,
      agentId,
      swarmId: intervention.swarmId,
    });
  }

  /**
   * Agent applies intervention
   */
  public async applyIntervention(
    interventionId: string,
    agentId: string,
    actionDetails: string,
  ): Promise<void> {
    const intervention = this.interventions.get(interventionId);
    if (!intervention) {
      throw new Error(`Intervention ${interventionId} not found`);
    }

    intervention.status = 'applied';
    intervention.response = {
      agentId,
      message: `Intervention applied: ${actionDetails}`,
      timestamp: new Date().toISOString(),
      actionTaken: actionDetails,
    };

    this.emit('intervention-applied', intervention);

    this.logger.info('Intervention applied', {
      interventionId,
      agentId,
      swarmId: intervention.swarmId,
      actionTaken: actionDetails,
    });
  }

  /**
   * Get pending interventions for a swarm
   */
  public getPendingInterventions(swarmId: string): HumanIntervention[] {
    const swarmQueue = this.interventionQueue.get(swarmId) || [];
    return swarmQueue.filter((i) => i.status === 'pending');
  }

  /**
   * Get intervention history for a swarm
   */
  public getInterventionHistory(swarmId: string): HumanIntervention[] {
    return Array.from(this.interventions.values())
      .filter((i) => i.swarmId === swarmId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Get swarm relaunch information
   */
  public getSwarmRelaunchInfo(swarmId: string): SwarmRelaunchConfig | null {
    return this.swarmRelaunches.get(swarmId) || null;
  }

  /**
   * Check if swarm can be relaunched
   */
  public canRelaunchSwarm(swarmId: string): {
    canRelaunch: boolean;
    remainingAttempts: number;
    reason?: string;
  } {
    const relaunchConfig = this.swarmRelaunches.get(swarmId);
    const currentCount = relaunchConfig?.relaunchCount || 0;
    const remaining = this.MAX_RELAUNCHES - currentCount;

    if (remaining <= 0) {
      return {
        canRelaunch: false,
        remainingAttempts: 0,
        reason: `Maximum ${this.MAX_RELAUNCHES} relaunches reached`,
      };
    }

    return {
      canRelaunch: true,
      remainingAttempts: remaining,
    };
  }

  /**
   * Get intervention statistics
   */
  public getInterventionStats(swarmId?: string): any {
    let targetInterventions = Array.from(this.interventions.values());

    if (swarmId) {
      targetInterventions = targetInterventions.filter((i) => i.swarmId === swarmId);
    }

    const stats = {
      total: targetInterventions.length,
      byStatus: {
        pending: targetInterventions.filter((i) => i.status === 'pending').length,
        acknowledged: targetInterventions.filter((i) => i.status === 'acknowledged').length,
        applied: targetInterventions.filter((i) => i.status === 'applied').length,
        rejected: targetInterventions.filter((i) => i.status === 'rejected').length,
      },
      byAction: {} as Record<string, number>,
      swarmRelaunches: this.swarmRelaunches.size,
      averageRelaunchCount: 0,
    };

    // Count by action type
    for (const intervention of targetInterventions) {
      stats.byAction[intervention.action] = (stats.byAction[intervention.action] || 0) + 1;
    }

    // Calculate average relaunch count
    if (this.swarmRelaunches.size > 0) {
      const totalRelaunches = Array.from(this.swarmRelaunches.values()).reduce(
        (sum, config) => sum + config.relaunchCount,
        0,
      );
      stats.averageRelaunchCount = totalRelaunches / this.swarmRelaunches.size;
    }

    return stats;
  }

  private generateInterventionId(): string {
    return `intervention_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getInterventionCount(): number {
    return this.interventions.size;
  }

  /**
   * Clean up old interventions
   */
  public cleanupOldInterventions(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);

    for (const [id, intervention] of this.interventions.entries()) {
      if (new Date(intervention.timestamp) < cutoff) {
        this.interventions.delete(id);

        // Clean up from queue
        const swarmQueue = this.interventionQueue.get(intervention.swarmId);
        if (swarmQueue) {
          const index = swarmQueue.findIndex((i) => i.id === id);
          if (index > -1) {
            swarmQueue.splice(index, 1);
          }
        }
      }
    }
  }
}
