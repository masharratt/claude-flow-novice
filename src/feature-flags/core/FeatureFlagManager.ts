/**
 * Phase 4 Feature Flag Deployment Manager
 * Implements controlled rollout with environment variables and monitoring
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

export interface FeatureFlagConfig {
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  environment: string;
  metadata: {
    description: string;
    owner: string;
    createdAt: string;
    phase: string;
    category: 'validation' | 'consensus' | 'hooks' | 'monitoring';
  };
  conditions?: {
    userIds?: string[];
    groups?: string[];
    minVersion?: string;
  };
  rollback?: {
    enabled: boolean;
    threshold: number; // Error rate threshold
    autoRollback: boolean;
  };
}

export interface RolloutMetrics {
  flagName: string;
  currentPercentage: number;
  targetPercentage: number;
  successRate: number;
  errorRate: number;
  userCount: number;
  lastUpdated: string;
}

export class FeatureFlagManager extends EventEmitter {
  private flags: Map<string, FeatureFlagConfig> = new Map();
  private metrics: Map<string, RolloutMetrics> = new Map();
  private configPath: string;
  private metricsPath: string;
  private environment: string;

  constructor(environment: string = process.env.NODE_ENV || 'development') {
    super();
    this.environment = environment;
    this.configPath = path.join(process.cwd(), 'src/feature-flags/config');
    this.metricsPath = path.join(process.cwd(), 'src/feature-flags/monitoring');
  }

  async initialize(): Promise<void> {
    try {
      await this.loadFlags();
      await this.loadMetrics();
      await this.setupEnvironmentVariables();

      // Start monitoring loop
      setInterval(() => this.evaluateRollbacks(), 30000); // Check every 30s

      this.emit('initialized', {
        flagCount: this.flags.size,
        environment: this.environment,
      });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Phase 4 specific feature flags for controlled rollout
   */
  private async setupEnvironmentVariables(): Promise<void> {
    const phase4Flags: FeatureFlagConfig[] = [
      {
        name: 'truth-based-validation',
        enabled: this.getBooleanEnv('TRUTH_VALIDATION_ENABLED', false),
        rolloutPercentage: this.getNumberEnv('TRUTH_ROLLOUT_PERCENTAGE', 10),
        environment: this.environment,
        metadata: {
          description: 'Truth-based completion validation system',
          owner: 'Phase4-Deployment-Manager',
          createdAt: new Date().toISOString(),
          phase: 'Phase4',
          category: 'validation',
        },
        rollback: {
          enabled: true,
          threshold: 0.01, // 1% error rate threshold
          autoRollback: true,
        },
      },
      {
        name: 'byzantine-consensus',
        enabled: this.getBooleanEnv('BYZANTINE_CONSENSUS_ENABLED', false),
        rolloutPercentage: this.getNumberEnv('BYZANTINE_ROLLOUT_PERCENTAGE', 10),
        environment: this.environment,
        metadata: {
          description: 'Byzantine consensus for agent coordination',
          owner: 'Phase4-Deployment-Manager',
          createdAt: new Date().toISOString(),
          phase: 'Phase4',
          category: 'consensus',
        },
        conditions: {
          minVersion: '1.0.0',
        },
        rollback: {
          enabled: true,
          threshold: 0.01,
          autoRollback: true,
        },
      },
      {
        name: 'hook-interception',
        enabled: this.getBooleanEnv('HOOK_INTERCEPTION_ENABLED', false),
        rolloutPercentage: this.getNumberEnv('HOOK_ROLLOUT_PERCENTAGE', 10),
        environment: this.environment,
        metadata: {
          description: 'Hook interception with auto-relaunch capability',
          owner: 'Phase4-Deployment-Manager',
          createdAt: new Date().toISOString(),
          phase: 'Phase4',
          category: 'hooks',
        },
        rollback: {
          enabled: true,
          threshold: 0.05, // 5% threshold for hooks
          autoRollback: this.getBooleanEnv('AUTO_RELAUNCH_ENABLED', true),
        },
      },
    ];

    for (const flag of phase4Flags) {
      this.flags.set(flag.name, flag);
      this.initializeMetrics(flag.name);
    }
  }

  private getBooleanEnv(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  private getNumberEnv(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Check if a feature flag is enabled for a given user/context
   */
  async isEnabled(flagName: string, userId?: string, context?: any): Promise<boolean> {
    const flag = this.flags.get(flagName);
    if (!flag) {
      this.recordMetric(flagName, 'flag_not_found');
      return false;
    }

    if (!flag.enabled) {
      return false;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashUserId(userId || 'anonymous', flagName);
      const inRollout = hash < flag.rolloutPercentage;

      if (!inRollout) {
        return false;
      }
    }

    // Check conditions
    if (flag.conditions) {
      if (flag.conditions.userIds && userId && !flag.conditions.userIds.includes(userId)) {
        return false;
      }

      if (flag.conditions.groups && context?.groups) {
        const hasGroup = flag.conditions.groups.some((group) => context.groups.includes(group));
        if (!hasGroup) return false;
      }
    }

    this.recordMetric(flagName, 'enabled');
    return true;
  }

  /**
   * Gradually increase rollout percentage
   */
  async increaseRollout(flagName: string, targetPercentage: number): Promise<void> {
    const flag = this.flags.get(flagName);
    if (!flag) {
      throw new Error(`Flag ${flagName} not found`);
    }

    if (targetPercentage < flag.rolloutPercentage) {
      throw new Error('Cannot decrease rollout percentage. Use rollback instead.');
    }

    if (targetPercentage > 100) {
      throw new Error('Rollout percentage cannot exceed 100%');
    }

    // Gradual rollout: 10% Week 5 → 25% Week 6
    const currentWeek = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const maxAllowedPercentage = currentWeek >= 5 ? (currentWeek >= 6 ? 25 : 10) : 5;

    if (targetPercentage > maxAllowedPercentage) {
      throw new Error(`Rollout limited to ${maxAllowedPercentage}% for current week`);
    }

    flag.rolloutPercentage = targetPercentage;
    await this.saveFlag(flag);

    this.emit('rollout_increased', {
      flagName,
      oldPercentage: flag.rolloutPercentage,
      newPercentage: targetPercentage,
    });
  }

  /**
   * Rapid enable/disable functionality
   */
  async enableFlag(flagName: string): Promise<void> {
    const flag = this.flags.get(flagName);
    if (!flag) {
      throw new Error(`Flag ${flagName} not found`);
    }

    flag.enabled = true;
    await this.saveFlag(flag);

    this.emit('flag_enabled', { flagName });
  }

  async disableFlag(flagName: string): Promise<void> {
    const flag = this.flags.get(flagName);
    if (!flag) {
      throw new Error(`Flag ${flagName} not found`);
    }

    flag.enabled = false;
    await this.saveFlag(flag);

    this.emit('flag_disabled', { flagName });
  }

  /**
   * Emergency rollback mechanism
   */
  async rollback(flagName: string, reason?: string): Promise<void> {
    const flag = this.flags.get(flagName);
    if (!flag) {
      throw new Error(`Flag ${flagName} not found`);
    }

    flag.enabled = false;
    flag.rolloutPercentage = 0;
    await this.saveFlag(flag);

    this.emit('rollback_triggered', {
      flagName,
      reason: reason || 'Manual rollback',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Monitor performance and auto-rollback if needed
   */
  private async evaluateRollbacks(): Promise<void> {
    for (const [flagName, flag] of this.flags) {
      if (!flag.rollback?.enabled || !flag.enabled) continue;

      const metrics = this.metrics.get(flagName);
      if (!metrics) continue;

      if (metrics.errorRate > flag.rollback.threshold) {
        if (flag.rollback.autoRollback) {
          await this.rollback(
            flagName,
            `Auto-rollback: Error rate ${metrics.errorRate} exceeded threshold ${flag.rollback.threshold}`,
          );
        } else {
          this.emit('rollback_threshold_exceeded', {
            flagName,
            errorRate: metrics.errorRate,
            threshold: flag.rollback.threshold,
          });
        }
      }
    }
  }

  private recordMetric(flagName: string, event: string): void {
    const metrics = this.metrics.get(flagName);
    if (metrics) {
      metrics.userCount++;
      if (event === 'error') {
        metrics.errorRate = (metrics.errorRate * metrics.userCount + 1) / (metrics.userCount + 1);
      } else if (event === 'enabled') {
        metrics.successRate =
          (metrics.successRate * metrics.userCount + 1) / (metrics.userCount + 1);
      }
      metrics.lastUpdated = new Date().toISOString();
    }
  }

  private initializeMetrics(flagName: string): void {
    this.metrics.set(flagName, {
      flagName,
      currentPercentage: this.flags.get(flagName)?.rolloutPercentage || 0,
      targetPercentage: this.flags.get(flagName)?.rolloutPercentage || 0,
      successRate: 0,
      errorRate: 0,
      userCount: 0,
      lastUpdated: new Date().toISOString(),
    });
  }

  private hashUserId(userId: string, flagName: string): number {
    let hash = 0;
    const str = `${userId}-${flagName}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 100;
  }

  private async loadFlags(): Promise<void> {
    try {
      const configFile = path.join(this.configPath, 'flags.json');
      const data = await fs.readFile(configFile, 'utf-8');
      const flags = JSON.parse(data);

      for (const flag of flags) {
        this.flags.set(flag.name, flag);
      }
    } catch (error) {
      // Create initial config if it doesn't exist
      await fs.mkdir(this.configPath, { recursive: true });
    }
  }

  private async loadMetrics(): Promise<void> {
    try {
      const metricsFile = path.join(this.metricsPath, 'rollout-metrics.json');
      const data = await fs.readFile(metricsFile, 'utf-8');
      const metrics = JSON.parse(data);

      for (const metric of metrics) {
        this.metrics.set(metric.flagName, metric);
      }
    } catch (error) {
      // Create initial metrics if they don't exist
      await fs.mkdir(this.metricsPath, { recursive: true });
    }
  }

  private async saveFlag(flag: FeatureFlagConfig): Promise<void> {
    await fs.mkdir(this.configPath, { recursive: true });
    const flagFile = path.join(this.configPath, `${flag.name}.json`);
    await fs.writeFile(flagFile, JSON.stringify(flag, null, 2));
  }

  async saveMetrics(): Promise<void> {
    await fs.mkdir(this.metricsPath, { recursive: true });
    const metricsFile = path.join(this.metricsPath, 'rollout-metrics.json');
    const metricsArray = Array.from(this.metrics.values());
    await fs.writeFile(metricsFile, JSON.stringify(metricsArray, null, 2));
  }

  getMetrics(flagName?: string): RolloutMetrics[] {
    if (flagName) {
      const metric = this.metrics.get(flagName);
      return metric ? [metric] : [];
    }
    return Array.from(this.metrics.values());
  }

  getAllFlags(): FeatureFlagConfig[] {
    return Array.from(this.flags.values());
  }
}
