/**
 * Phase 4 Rollout Controller
 * Manages gradual rollout progression and rollback mechanisms
 */

import { FeatureFlagManager, FeatureFlagConfig } from '../core/FeatureFlagManager.js';
import { RolloutMonitor } from '../monitoring/RolloutMonitor.js';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

export interface RolloutPlan {
  id: string;
  flagName: string;
  stages: RolloutStage[];
  currentStage: number;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'rolled_back';
  createdAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface RolloutStage {
  stageNumber: number;
  targetPercentage: number;
  duration: number; // milliseconds
  successThreshold: number; // 0-1
  errorThreshold: number; // 0-1
  autoProgress: boolean;
  conditions: {
    minActiveTime: number; // milliseconds
    maxErrorRate: number;
    minSuccessRate: number;
  };
}

export class RolloutController extends EventEmitter {
  private flagManager: FeatureFlagManager;
  private monitor: RolloutMonitor;
  private activePlans: Map<string, RolloutPlan> = new Map();
  private rolloutTimers: Map<string, NodeJS.Timeout> = new Map();
  private plansPath: string;

  constructor(flagManager: FeatureFlagManager, monitor: RolloutMonitor) {
    super();
    this.flagManager = flagManager;
    this.monitor = monitor;
    this.plansPath = path.join(process.cwd(), 'src/feature-flags/rollout/plans.json');
  }

  async initialize(): Promise<void> {
    await this.loadActivePlans();
    this.setupMonitoringListeners();
    this.resumeActivePlans();
  }

  /**
   * Create Phase 4 specific rollout plan: 10% Week 5 → 25% Week 6
   */
  async createPhase4RolloutPlan(flagName: string): Promise<RolloutPlan> {
    const flag = this.flagManager.getAllFlags().find((f) => f.name === flagName);
    if (!flag) {
      throw new Error(`Flag ${flagName} not found`);
    }

    const plan: RolloutPlan = {
      id: `phase4-${flagName}-${Date.now()}`,
      flagName,
      stages: [
        {
          stageNumber: 1,
          targetPercentage: 5,
          duration: 2 * 24 * 60 * 60 * 1000, // 2 days
          successThreshold: 0.95,
          errorThreshold: 0.01,
          autoProgress: true,
          conditions: {
            minActiveTime: 12 * 60 * 60 * 1000, // 12 hours
            maxErrorRate: 0.005,
            minSuccessRate: 0.98,
          },
        },
        {
          stageNumber: 2,
          targetPercentage: 10,
          duration: 7 * 24 * 60 * 60 * 1000, // Week 5
          successThreshold: 0.95,
          errorThreshold: 0.01,
          autoProgress: true,
          conditions: {
            minActiveTime: 24 * 60 * 60 * 1000, // 24 hours
            maxErrorRate: 0.01,
            minSuccessRate: 0.95,
          },
        },
        {
          stageNumber: 3,
          targetPercentage: 25,
          duration: 7 * 24 * 60 * 60 * 1000, // Week 6
          successThreshold: 0.95,
          errorThreshold: 0.01,
          autoProgress: false, // Manual approval for 25%
          conditions: {
            minActiveTime: 48 * 60 * 60 * 1000, // 48 hours
            maxErrorRate: 0.01,
            minSuccessRate: 0.95,
          },
        },
      ],
      currentStage: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.activePlans.set(plan.id, plan);
    await this.savePlans();

    this.emit('rollout_plan_created', plan);
    return plan;
  }

  /**
   * Start rollout execution
   */
  async startRollout(planId: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Rollout plan ${planId} not found`);
    }

    if (plan.status !== 'pending') {
      throw new Error(`Cannot start rollout with status: ${plan.status}`);
    }

    plan.status = 'active';
    await this.progressToNextStage(planId);

    this.emit('rollout_started', plan);
  }

  private async progressToNextStage(planId: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan || plan.status !== 'active') {
      return;
    }

    if (plan.currentStage >= plan.stages.length) {
      await this.completeRollout(planId);
      return;
    }

    const stage = plan.stages[plan.currentStage];

    try {
      // Update flag rollout percentage
      await this.flagManager.increaseRollout(plan.flagName, stage.targetPercentage);

      this.emit('stage_started', {
        planId,
        stage: stage.stageNumber,
        targetPercentage: stage.targetPercentage,
      });

      // Set timer for stage evaluation
      const timer = setTimeout(async () => {
        await this.evaluateStageProgress(planId);
      }, stage.conditions.minActiveTime);

      this.rolloutTimers.set(`${planId}-stage-${stage.stageNumber}`, timer);

      await this.savePlans();
    } catch (error) {
      await this.failRollout(
        planId,
        `Failed to progress to stage ${stage.stageNumber}: ${error.message}`,
      );
    }
  }

  private async evaluateStageProgress(planId: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan || plan.status !== 'active') {
      return;
    }

    const stage = plan.stages[plan.currentStage];
    const metrics = this.flagManager.getMetrics(plan.flagName);

    if (metrics.length === 0) {
      // No metrics yet, wait longer
      setTimeout(() => this.evaluateStageProgress(planId), 30000);
      return;
    }

    const flagMetric = metrics[0];

    // Check failure conditions
    if (flagMetric.errorRate > stage.conditions.maxErrorRate) {
      await this.rollbackRollout(
        planId,
        `Error rate ${flagMetric.errorRate} exceeded threshold ${stage.conditions.maxErrorRate}`,
      );
      return;
    }

    if (flagMetric.successRate < stage.conditions.minSuccessRate) {
      await this.rollbackRollout(
        planId,
        `Success rate ${flagMetric.successRate} below threshold ${stage.conditions.minSuccessRate}`,
      );
      return;
    }

    // Check success conditions
    const stageSuccessful =
      flagMetric.errorRate <= stage.errorThreshold &&
      flagMetric.successRate >= stage.successThreshold;

    if (stageSuccessful) {
      plan.currentStage++;

      this.emit('stage_completed', {
        planId,
        completedStage: stage.stageNumber,
        metrics: flagMetric,
      });

      if (stage.autoProgress) {
        await this.progressToNextStage(planId);
      } else {
        this.emit('manual_approval_required', {
          planId,
          nextStage: plan.stages[plan.currentStage],
        });
      }
    } else {
      // Continue monitoring
      setTimeout(() => this.evaluateStageProgress(planId), 60000); // Check every minute
    }
  }

  /**
   * Manual approval for next stage
   */
  async approveNextStage(planId: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan || plan.status !== 'active') {
      throw new Error('Invalid rollout plan or status');
    }

    if (plan.currentStage >= plan.stages.length) {
      throw new Error('No more stages to approve');
    }

    const currentStage = plan.stages[plan.currentStage - 1];
    if (currentStage && currentStage.autoProgress) {
      throw new Error('Current stage has auto-progress enabled');
    }

    await this.progressToNextStage(planId);

    this.emit('stage_approved', {
      planId,
      approvedStage: plan.currentStage,
    });
  }

  /**
   * Emergency rollback
   */
  async rollbackRollout(planId: string, reason: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Rollout plan ${planId} not found`);
    }

    // Clear any active timers
    this.clearPlanTimers(planId);

    // Disable the flag
    await this.flagManager.rollback(plan.flagName, `Rollout rollback: ${reason}`);

    plan.status = 'rolled_back';
    plan.failureReason = reason;
    plan.completedAt = new Date().toISOString();

    await this.savePlans();

    this.emit('rollout_rolled_back', {
      planId,
      reason,
      stage: plan.currentStage,
    });
  }

  private async completeRollout(planId: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      return;
    }

    this.clearPlanTimers(planId);

    plan.status = 'completed';
    plan.completedAt = new Date().toISOString();

    await this.savePlans();

    this.emit('rollout_completed', plan);
  }

  private async failRollout(planId: string, reason: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      return;
    }

    this.clearPlanTimers(planId);

    plan.status = 'failed';
    plan.failureReason = reason;
    plan.completedAt = new Date().toISOString();

    await this.savePlans();

    this.emit('rollout_failed', {
      planId,
      reason,
    });
  }

  private clearPlanTimers(planId: string): void {
    for (const [timerId, timer] of this.rolloutTimers) {
      if (timerId.startsWith(planId)) {
        clearTimeout(timer);
        this.rolloutTimers.delete(timerId);
      }
    }
  }

  private setupMonitoringListeners(): void {
    this.monitor.on('critical_alert', async (alert) => {
      if (alert.flagName) {
        const activePlans = Array.from(this.activePlans.values()).filter(
          (plan) => plan.flagName === alert.flagName && plan.status === 'active',
        );

        for (const plan of activePlans) {
          await this.rollbackRollout(plan.id, `Critical alert: ${alert.message}`);
        }
      }
    });
  }

  private async resumeActivePlans(): Promise<void> {
    const activePlans = Array.from(this.activePlans.values()).filter(
      (plan) => plan.status === 'active',
    );

    for (const plan of activePlans) {
      // Resume monitoring for active plans
      setTimeout(() => this.evaluateStageProgress(plan.id), 5000);
    }
  }

  private async loadActivePlans(): Promise<void> {
    try {
      const data = await fs.readFile(this.plansPath, 'utf-8');
      const plans = JSON.parse(data);

      for (const plan of plans) {
        this.activePlans.set(plan.id, plan);
      }
    } catch (error) {
      // File doesn't exist yet, no plans to load
    }
  }

  private async savePlans(): Promise<void> {
    const plans = Array.from(this.activePlans.values());
    await fs.mkdir(path.dirname(this.plansPath), { recursive: true });
    await fs.writeFile(this.plansPath, JSON.stringify(plans, null, 2));
  }

  /**
   * Get rollout status
   */
  getRolloutStatus(planId: string): RolloutPlan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Get all active rollouts
   */
  getActiveRollouts(): RolloutPlan[] {
    return Array.from(this.activePlans.values()).filter((plan) => plan.status === 'active');
  }

  /**
   * Get rollout history
   */
  getRolloutHistory(flagName?: string): RolloutPlan[] {
    const plans = Array.from(this.activePlans.values());

    if (flagName) {
      return plans.filter((plan) => plan.flagName === flagName);
    }

    return plans;
  }
}
