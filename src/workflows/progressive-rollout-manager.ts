import { EventEmitter } from 'events';
import { promises as fs } from 'fs';

export interface RolloutStage {
  name: string;
  percentage: number;
  duration: number; // in minutes
  criteria: RolloutCriteria;
  healthChecks: HealthCheck[];
  rollbackThreshold: number;
  autoProgress: boolean;
}

export interface RolloutCriteria {
  minSuccessRate: number;
  maxErrorRate: number;
  maxLatency: number;
  minThroughput: number;
  customMetrics: Record<string, number>;
}

export interface HealthCheck {
  name: string;
  type: 'http' | 'tcp' | 'command' | 'metric';
  endpoint?: string;
  command?: string;
  metric?: string;
  expectedValue?: any;
  tolerance?: number;
  timeout: number;
  interval: number;
  retries: number;
}

export interface RolloutConfig {
  strategy: 'canary' | 'blue-green' | 'rolling' | 'a-b-test';
  stages: RolloutStage[];
  globalRollbackCriteria: RolloutCriteria;
  notifications: NotificationConfig;
  monitoring: MonitoringConfig;
}

export interface NotificationConfig {
  channels: string[];
  events: string[];
  templates: Record<string, string>;
}

export interface MonitoringConfig {
  metricsInterval: number;
  alertThresholds: Record<string, number>;
  dashboardUrl?: string;
  logsRetention: number;
}

export interface RolloutExecution {
  id: string;
  featureId: string;
  strategy: string;
  startTime: Date;
  currentStage: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'rolled_back' | 'failed';
  stages: StageExecution[];
  metrics: RolloutMetrics;
  logs: RolloutLog[];
}

export interface StageExecution {
  stageIndex: number;
  stageName: string;
  startTime?: Date;
  endTime?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
  healthCheckResults: HealthCheckResult[];
  metrics: StageMetrics;
  traffic: TrafficMetrics;
}

export interface HealthCheckResult {
  checkName: string;
  timestamp: Date;
  success: boolean;
  value?: any;
  error?: string;
  latency: number;
}

export interface StageMetrics {
  successRate: number;
  errorRate: number;
  averageLatency: number;
  throughput: number;
  customMetrics: Record<string, number>;
}

export interface TrafficMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  errorsByType: Record<string, number>;
}

export interface RolloutMetrics {
  overallSuccessRate: number;
  overallErrorRate: number;
  totalTraffic: number;
  rollbackCount: number;
  stages: StageMetrics[];
}

export interface RolloutLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  stage: string;
  message: string;
  data?: any;
}

export class ProgressiveRolloutManager extends EventEmitter {
  private rollouts: Map<string, RolloutExecution> = new Map();
  private configs: Map<string, RolloutConfig> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private metricsCollectors: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.initializeDefaultConfigs();
  }

  private initializeDefaultConfigs(): void {
    // Canary deployment configuration
    this.configs.set('canary', {
      strategy: 'canary',
      stages: [
        {
          name: 'canary-5',
          percentage: 5,
          duration: 30, // 30 minutes
          criteria: {
            minSuccessRate: 99.0,
            maxErrorRate: 0.5,
            maxLatency: 500,
            minThroughput: 10,
            customMetrics: {}
          },
          healthChecks: [
            {
              name: 'health-endpoint',
              type: 'http',
              endpoint: '/health',
              timeout: 5000,
              interval: 30000,
              retries: 3
            }
          ],
          rollbackThreshold: 2.0,
          autoProgress: true
        },
        {
          name: 'canary-25',
          percentage: 25,
          duration: 60,
          criteria: {
            minSuccessRate: 99.5,
            maxErrorRate: 0.3,
            maxLatency: 400,
            minThroughput: 50,
            customMetrics: {}
          },
          healthChecks: [
            {
              name: 'health-endpoint',
              type: 'http',
              endpoint: '/health',
              timeout: 5000,
              interval: 30000,
              retries: 3
            },
            {
              name: 'metrics-check',
              type: 'metric',
              metric: 'response_time_p95',
              expectedValue: 300,
              tolerance: 0.2,
              timeout: 10000,
              interval: 60000,
              retries: 2
            }
          ],
          rollbackThreshold: 1.0,
          autoProgress: true
        },
        {
          name: 'full-rollout',
          percentage: 100,
          duration: -1, // Unlimited
          criteria: {
            minSuccessRate: 99.9,
            maxErrorRate: 0.1,
            maxLatency: 300,
            minThroughput: 100,
            customMetrics: {}
          },
          healthChecks: [
            {
              name: 'comprehensive-health',
              type: 'http',
              endpoint: '/health/comprehensive',
              timeout: 10000,
              interval: 60000,
              retries: 5
            }
          ],
          rollbackThreshold: 0.5,
          autoProgress: false
        }
      ],
      globalRollbackCriteria: {
        minSuccessRate: 95.0,
        maxErrorRate: 2.0,
        maxLatency: 1000,
        minThroughput: 1,
        customMetrics: {}
      },
      notifications: {
        channels: ['slack', 'email'],
        events: ['stage_started', 'stage_completed', 'rollback_triggered', 'deployment_completed'],
        templates: {
          stage_started: 'Deployment stage {stageName} started for {featureId}',
          rollback_triggered: 'ALERT: Rollback triggered for {featureId} due to {reason}'
        }
      },
      monitoring: {
        metricsInterval: 30000,
        alertThresholds: {
          error_rate: 1.0,
          response_time: 500
        },
        logsRetention: 30 * 24 * 60 * 60 * 1000 // 30 days
      }
    });

    // Blue-Green deployment configuration
    this.configs.set('blue-green', {
      strategy: 'blue-green',
      stages: [
        {
          name: 'green-validation',
          percentage: 0, // Shadow traffic
          duration: 15,
          criteria: {
            minSuccessRate: 99.5,
            maxErrorRate: 0.3,
            maxLatency: 400,
            minThroughput: 1,
            customMetrics: {}
          },
          healthChecks: [
            {
              name: 'green-health',
              type: 'http',
              endpoint: '/health',
              timeout: 5000,
              interval: 15000,
              retries: 3
            }
          ],
          rollbackThreshold: 1.0,
          autoProgress: true
        },
        {
          name: 'traffic-switch',
          percentage: 100,
          duration: 5,
          criteria: {
            minSuccessRate: 99.0,
            maxErrorRate: 0.5,
            maxLatency: 500,
            minThroughput: 10,
            customMetrics: {}
          },
          healthChecks: [
            {
              name: 'switch-validation',
              type: 'http',
              endpoint: '/health',
              timeout: 3000,
              interval: 10000,
              retries: 5
            }
          ],
          rollbackThreshold: 2.0,
          autoProgress: false
        }
      ],
      globalRollbackCriteria: {
        minSuccessRate: 98.0,
        maxErrorRate: 1.0,
        maxLatency: 600,
        minThroughput: 5,
        customMetrics: {}
      },
      notifications: {
        channels: ['slack', 'pagerduty'],
        events: ['traffic_switched', 'rollback_triggered'],
        templates: {}
      },
      monitoring: {
        metricsInterval: 15000,
        alertThresholds: {
          error_rate: 0.5,
          response_time: 400
        },
        logsRetention: 30 * 24 * 60 * 60 * 1000
      }
    });
  }

  public async startRollout(
    featureId: string,
    strategy: 'canary' | 'blue-green' | 'rolling' | 'a-b-test',
    customConfig?: Partial<RolloutConfig>
  ): Promise<string> {
    const rolloutId = `rollout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const config = customConfig
      ? this.mergeConfigs(this.configs.get(strategy)!, customConfig)
      : this.configs.get(strategy)!;

    if (!config) {
      throw new Error(`Unknown rollout strategy: ${strategy}`);
    }

    const execution: RolloutExecution = {
      id: rolloutId,
      featureId,
      strategy,
      startTime: new Date(),
      currentStage: 0,
      status: 'pending',
      stages: config.stages.map((stage, index) => ({
        stageIndex: index,
        stageName: stage.name,
        status: 'pending',
        healthCheckResults: [],
        metrics: {
          successRate: 0,
          errorRate: 0,
          averageLatency: 0,
          throughput: 0,
          customMetrics: {}
        },
        traffic: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          errorsByType: {}
        }
      })),
      metrics: {
        overallSuccessRate: 0,
        overallErrorRate: 0,
        totalTraffic: 0,
        rollbackCount: 0,
        stages: []
      },
      logs: []
    };

    this.rollouts.set(rolloutId, execution);

    this.addLog(rolloutId, 'info', 'initialization',
      `Starting ${strategy} rollout for feature ${featureId}`);

    this.emit('rollout:started', { rolloutId, featureId, strategy, config });

    // Start the rollout process
    await this.executeNextStage(rolloutId, config);

    return rolloutId;
  }

  private mergeConfigs(base: RolloutConfig, custom: Partial<RolloutConfig>): RolloutConfig {
    return {
      ...base,
      ...custom,
      stages: custom.stages || base.stages,
      notifications: { ...base.notifications, ...custom.notifications },
      monitoring: { ...base.monitoring, ...custom.monitoring }
    };
  }

  private async executeNextStage(rolloutId: string, config: RolloutConfig): Promise<void> {
    const execution = this.rollouts.get(rolloutId);
    if (!execution) return;

    if (execution.currentStage >= config.stages.length) {
      await this.completeRollout(rolloutId);
      return;
    }

    const stageConfig = config.stages[execution.currentStage];
    const stageExecution = execution.stages[execution.currentStage];

    execution.status = 'running';
    stageExecution.status = 'running';
    stageExecution.startTime = new Date();

    this.addLog(rolloutId, 'info', stageConfig.name,
      `Starting stage ${stageConfig.name} (${stageConfig.percentage}% traffic)`);

    this.emit('rollout:stage-started', {
      rolloutId,
      stage: stageConfig,
      stageIndex: execution.currentStage
    });

    // Start health checks for this stage
    await this.startHealthChecks(rolloutId, stageConfig, config);

    // Start metrics collection
    this.startMetricsCollection(rolloutId, config);

    // Set stage completion timer (if duration is specified)
    if (stageConfig.duration > 0) {
      setTimeout(async () => {
        await this.evaluateStageCompletion(rolloutId, config);
      }, stageConfig.duration * 60 * 1000);
    }

    // For immediate evaluation (e.g., blue-green switch)
    if (stageConfig.duration === 0) {
      setTimeout(async () => {
        await this.evaluateStageCompletion(rolloutId, config);
      }, 5000);
    }
  }

  private async startHealthChecks(
    rolloutId: string,
    stage: RolloutStage,
    config: RolloutConfig
  ): Promise<void> {
    for (const healthCheck of stage.healthChecks) {
      const intervalId = setInterval(async () => {
        await this.runHealthCheck(rolloutId, healthCheck, stage.name);
      }, healthCheck.interval);

      this.healthCheckIntervals.set(`${rolloutId}:${healthCheck.name}`, intervalId);

      // Run initial health check immediately
      await this.runHealthCheck(rolloutId, healthCheck, stage.name);
    }
  }

  private async runHealthCheck(
    rolloutId: string,
    healthCheck: HealthCheck,
    stageName: string
  ): Promise<void> {
    const execution = this.rollouts.get(rolloutId);
    if (!execution) return;

    const stageExecution = execution.stages[execution.currentStage];
    const startTime = Date.now();

    try {
      let result: HealthCheckResult;

      switch (healthCheck.type) {
        case 'http':
          result = await this.runHttpHealthCheck(healthCheck);
          break;
        case 'tcp':
          result = await this.runTcpHealthCheck(healthCheck);
          break;
        case 'command':
          result = await this.runCommandHealthCheck(healthCheck);
          break;
        case 'metric':
          result = await this.runMetricHealthCheck(healthCheck);
          break;
        default:
          throw new Error(`Unknown health check type: ${healthCheck.type}`);
      }

      result.timestamp = new Date();
      result.latency = Date.now() - startTime;
      result.checkName = healthCheck.name;

      stageExecution.healthCheckResults.push(result);

      // Keep only last 100 results per check
      const checkResults = stageExecution.healthCheckResults.filter(
        r => r.checkName === healthCheck.name
      );
      if (checkResults.length > 100) {
        stageExecution.healthCheckResults = stageExecution.healthCheckResults.filter(
          r => r.checkName !== healthCheck.name ||
          checkResults.slice(-100).includes(r)
        );
      }

      if (!result.success) {
        this.addLog(rolloutId, 'warn', stageName,
          `Health check ${healthCheck.name} failed: ${result.error}`);

        await this.evaluateRollbackConditions(rolloutId);
      }

    } catch (error) {
      const result: HealthCheckResult = {
        checkName: healthCheck.name,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime
      };

      stageExecution.healthCheckResults.push(result);

      this.addLog(rolloutId, 'error', stageName,
        `Health check ${healthCheck.name} error: ${result.error}`);
    }
  }

  private async runHttpHealthCheck(healthCheck: HealthCheck): Promise<HealthCheckResult> {
    // This would use a real HTTP client in practice
    const simulatedLatency = Math.random() * 100 + 50;
    const simulatedSuccess = Math.random() > 0.05; // 95% success rate

    return {
      checkName: healthCheck.name,
      timestamp: new Date(),
      success: simulatedSuccess,
      value: simulatedSuccess ? 200 : 500,
      error: simulatedSuccess ? undefined : 'HTTP 500 Internal Server Error',
      latency: simulatedLatency
    };
  }

  private async runTcpHealthCheck(healthCheck: HealthCheck): Promise<HealthCheckResult> {
    // Simplified TCP check simulation
    return {
      checkName: healthCheck.name,
      timestamp: new Date(),
      success: Math.random() > 0.02,
      latency: Math.random() * 50 + 10
    };
  }

  private async runCommandHealthCheck(healthCheck: HealthCheck): Promise<HealthCheckResult> {
    // Simplified command execution simulation
    return {
      checkName: healthCheck.name,
      timestamp: new Date(),
      success: Math.random() > 0.1,
      latency: Math.random() * 200 + 100
    };
  }

  private async runMetricHealthCheck(healthCheck: HealthCheck): Promise<HealthCheckResult> {
    // Simplified metric check simulation
    const currentValue = Math.random() * 500 + 100;
    const expectedValue = healthCheck.expectedValue || 300;
    const tolerance = healthCheck.tolerance || 0.2;

    const withinTolerance = Math.abs(currentValue - expectedValue) / expectedValue <= tolerance;

    return {
      checkName: healthCheck.name,
      timestamp: new Date(),
      success: withinTolerance,
      value: currentValue,
      error: withinTolerance ? undefined : `Value ${currentValue} outside tolerance`,
      latency: Math.random() * 100 + 50
    };
  }

  private startMetricsCollection(rolloutId: string, config: RolloutConfig): void {
    const intervalId = setInterval(async () => {
      await this.collectMetrics(rolloutId);
    }, config.monitoring.metricsInterval);

    this.metricsCollectors.set(rolloutId, intervalId);
  }

  private async collectMetrics(rolloutId: string): Promise<void> {
    const execution = this.rollouts.get(rolloutId);
    if (!execution || execution.status !== 'running') return;

    const stageExecution = execution.stages[execution.currentStage];

    // Simulate metrics collection
    const simulatedMetrics: StageMetrics = {
      successRate: Math.random() * 5 + 95, // 95-100%
      errorRate: Math.random() * 2, // 0-2%
      averageLatency: Math.random() * 200 + 100, // 100-300ms
      throughput: Math.random() * 100 + 50, // 50-150 req/sec
      customMetrics: {
        memory_usage: Math.random() * 30 + 70, // 70-100%
        cpu_usage: Math.random() * 40 + 30 // 30-70%
      }
    };

    // Simulate traffic metrics
    const trafficMetrics: TrafficMetrics = {
      totalRequests: stageExecution.traffic.totalRequests + Math.floor(Math.random() * 100 + 50),
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: simulatedMetrics.averageLatency,
      errorsByType: {
        '4xx': Math.floor(Math.random() * 5),
        '5xx': Math.floor(Math.random() * 2)
      }
    };

    trafficMetrics.successfulRequests = Math.floor(
      trafficMetrics.totalRequests * simulatedMetrics.successRate / 100
    );
    trafficMetrics.failedRequests = trafficMetrics.totalRequests - trafficMetrics.successfulRequests;

    stageExecution.metrics = simulatedMetrics;
    stageExecution.traffic = trafficMetrics;

    // Update overall metrics
    execution.metrics.overallSuccessRate = this.calculateOverallSuccessRate(execution);
    execution.metrics.overallErrorRate = this.calculateOverallErrorRate(execution);
    execution.metrics.totalTraffic = this.calculateTotalTraffic(execution);

    this.emit('rollout:metrics-updated', { rolloutId, metrics: simulatedMetrics });
  }

  private calculateOverallSuccessRate(execution: RolloutExecution): number {
    const completedStages = execution.stages.filter(s => s.status === 'completed' || s.status === 'running');
    if (completedStages.length === 0) return 0;

    const totalRequests = completedStages.reduce((sum, stage) => sum + stage.traffic.totalRequests, 0);
    const successfulRequests = completedStages.reduce((sum, stage) => sum + stage.traffic.successfulRequests, 0);

    return totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
  }

  private calculateOverallErrorRate(execution: RolloutExecution): number {
    return 100 - this.calculateOverallSuccessRate(execution);
  }

  private calculateTotalTraffic(execution: RolloutExecution): number {
    return execution.stages.reduce((sum, stage) => sum + stage.traffic.totalRequests, 0);
  }

  private async evaluateStageCompletion(rolloutId: string, config: RolloutConfig): Promise<void> {
    const execution = this.rollouts.get(rolloutId);
    if (!execution || execution.status !== 'running') return;

    const stageConfig = config.stages[execution.currentStage];
    const stageExecution = execution.stages[execution.currentStage];

    // Check if stage criteria are met
    const criteriaMet = this.evaluateStageCriteria(stageExecution, stageConfig.criteria);

    if (criteriaMet) {
      stageExecution.status = 'completed';
      stageExecution.endTime = new Date();

      this.addLog(rolloutId, 'info', stageConfig.name,
        `Stage ${stageConfig.name} completed successfully`);

      this.emit('rollout:stage-completed', {
        rolloutId,
        stage: stageConfig,
        stageIndex: execution.currentStage
      });

      // Clean up health checks for this stage
      this.stopHealthChecks(rolloutId, stageConfig);

      // Progress to next stage
      execution.currentStage++;

      if (stageConfig.autoProgress) {
        await this.executeNextStage(rolloutId, config);
      } else {
        execution.status = 'paused';
        this.emit('rollout:paused', { rolloutId, reason: 'Manual approval required' });
      }

    } else {
      this.addLog(rolloutId, 'warn', stageConfig.name,
        'Stage criteria not met, extending evaluation period');

      // Extend evaluation period or trigger rollback based on configuration
      setTimeout(async () => {
        await this.evaluateRollbackConditions(rolloutId);
      }, 60000); // Check again in 1 minute
    }
  }

  private evaluateStageCriteria(stage: StageExecution, criteria: RolloutCriteria): boolean {
    const metrics = stage.metrics;

    if (metrics.successRate < criteria.minSuccessRate) return false;
    if (metrics.errorRate > criteria.maxErrorRate) return false;
    if (metrics.averageLatency > criteria.maxLatency) return false;
    if (metrics.throughput < criteria.minThroughput) return false;

    // Check custom metrics
    for (const [metricName, threshold] of Object.entries(criteria.customMetrics)) {
      const currentValue = metrics.customMetrics[metricName];
      if (currentValue === undefined || currentValue < threshold) return false;
    }

    return true;
  }

  private async evaluateRollbackConditions(rolloutId: string): Promise<void> {
    const execution = this.rollouts.get(rolloutId);
    if (!execution || execution.status === 'rolled_back') return;

    const config = this.configs.get(execution.strategy);
    if (!config) return;

    const stageExecution = execution.stages[execution.currentStage];
    const stageConfig = config.stages[execution.currentStage];

    // Check stage-specific rollback threshold
    if (stageExecution.metrics.errorRate > stageConfig.rollbackThreshold) {
      await this.triggerRollback(rolloutId, `Error rate ${stageExecution.metrics.errorRate}% exceeds threshold ${stageConfig.rollbackThreshold}%`);
      return;
    }

    // Check global rollback criteria
    const globalCriteriaMet = this.evaluateStageCriteria(stageExecution, config.globalRollbackCriteria);
    if (!globalCriteriaMet) {
      await this.triggerRollback(rolloutId, 'Global rollback criteria not met');
      return;
    }

    // Check recent health check failures
    const recentHealthChecks = stageExecution.healthCheckResults.slice(-10);
    const failureRate = recentHealthChecks.filter(check => !check.success).length / recentHealthChecks.length;

    if (recentHealthChecks.length >= 5 && failureRate > 0.5) {
      await this.triggerRollback(rolloutId, `Health check failure rate ${(failureRate * 100).toFixed(1)}% exceeds 50%`);
      return;
    }
  }

  private async triggerRollback(rolloutId: string, reason: string): Promise<void> {
    const execution = this.rollouts.get(rolloutId);
    if (!execution) return;

    execution.status = 'rolled_back';
    execution.metrics.rollbackCount++;

    // Mark current stage as rolled back
    const currentStage = execution.stages[execution.currentStage];
    currentStage.status = 'rolled_back';
    currentStage.endTime = new Date();

    this.addLog(rolloutId, 'error', 'rollback', `Rollback triggered: ${reason}`);

    // Stop all monitoring and health checks
    this.stopAllMonitoring(rolloutId);

    this.emit('rollout:rolled-back', { rolloutId, reason, stage: execution.currentStage });

    // Execute rollback procedure
    await this.executeRollback(rolloutId);
  }

  private async executeRollback(rolloutId: string): Promise<void> {
    const execution = this.rollouts.get(rolloutId);
    if (!execution) return;

    this.addLog(rolloutId, 'info', 'rollback', 'Executing rollback procedure');

    try {
      // Implement rollback logic based on strategy
      switch (execution.strategy) {
        case 'canary':
          await this.rollbackCanary(rolloutId);
          break;
        case 'blue-green':
          await this.rollbackBlueGreen(rolloutId);
          break;
        case 'rolling':
          await this.rollbackRolling(rolloutId);
          break;
        default:
          throw new Error(`Rollback not implemented for strategy: ${execution.strategy}`);
      }

      this.addLog(rolloutId, 'info', 'rollback', 'Rollback completed successfully');
      this.emit('rollout:rollback-completed', { rolloutId });

    } catch (error) {
      this.addLog(rolloutId, 'error', 'rollback',
        `Rollback failed: ${error instanceof Error ? error.message : String(error)}`);

      execution.status = 'failed';
      this.emit('rollout:rollback-failed', { rolloutId, error });
    }
  }

  private async rollbackCanary(rolloutId: string): Promise<void> {
    // Simulate canary rollback - redirect all traffic back to stable version
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private async rollbackBlueGreen(rolloutId: string): Promise<void> {
    // Simulate blue-green rollback - switch traffic back to blue environment
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async rollbackRolling(rolloutId: string): Promise<void> {
    // Simulate rolling rollback - gradually replace new version with old version
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  private async completeRollout(rolloutId: string): Promise<void> {
    const execution = this.rollouts.get(rolloutId);
    if (!execution) return;

    execution.status = 'completed';

    this.addLog(rolloutId, 'info', 'completion',
      `Rollout completed successfully for feature ${execution.featureId}`);

    // Stop all monitoring
    this.stopAllMonitoring(rolloutId);

    this.emit('rollout:completed', { rolloutId, execution });
  }

  private stopHealthChecks(rolloutId: string, stage: RolloutStage): void {
    for (const healthCheck of stage.healthChecks) {
      const intervalId = this.healthCheckIntervals.get(`${rolloutId}:${healthCheck.name}`);
      if (intervalId) {
        clearInterval(intervalId);
        this.healthCheckIntervals.delete(`${rolloutId}:${healthCheck.name}`);
      }
    }
  }

  private stopAllMonitoring(rolloutId: string): void {
    // Stop metrics collection
    const metricsInterval = this.metricsCollectors.get(rolloutId);
    if (metricsInterval) {
      clearInterval(metricsInterval);
      this.metricsCollectors.delete(rolloutId);
    }

    // Stop all health checks
    const keysToDelete = Array.from(this.healthCheckIntervals.keys())
      .filter(key => key.startsWith(`${rolloutId}:`));

    for (const key of keysToDelete) {
      const intervalId = this.healthCheckIntervals.get(key);
      if (intervalId) {
        clearInterval(intervalId);
        this.healthCheckIntervals.delete(key);
      }
    }
  }

  private addLog(rolloutId: string, level: RolloutLog['level'], stage: string, message: string, data?: any): void {
    const execution = this.rollouts.get(rolloutId);
    if (!execution) return;

    const log: RolloutLog = {
      timestamp: new Date(),
      level,
      stage,
      message,
      data
    };

    execution.logs.push(log);

    // Keep only last 1000 logs
    if (execution.logs.length > 1000) {
      execution.logs = execution.logs.slice(-1000);
    }

    this.emit('rollout:log', { rolloutId, log });
  }

  public async resumeRollout(rolloutId: string): Promise<boolean> {
    const execution = this.rollouts.get(rolloutId);
    if (!execution || execution.status !== 'paused') return false;

    const config = this.configs.get(execution.strategy);
    if (!config) return false;

    this.addLog(rolloutId, 'info', 'resume', 'Resuming rollout execution');

    await this.executeNextStage(rolloutId, config);
    return true;
  }

  public async pauseRollout(rolloutId: string, reason: string = 'Manual pause'): Promise<boolean> {
    const execution = this.rollouts.get(rolloutId);
    if (!execution || execution.status !== 'running') return false;

    execution.status = 'paused';
    this.addLog(rolloutId, 'info', 'pause', `Rollout paused: ${reason}`);

    this.emit('rollout:paused', { rolloutId, reason });
    return true;
  }

  public getRollout(rolloutId: string): RolloutExecution | undefined {
    return this.rollouts.get(rolloutId);
  }

  public getAllRollouts(): RolloutExecution[] {
    return Array.from(this.rollouts.values());
  }

  public getRolloutsByFeature(featureId: string): RolloutExecution[] {
    return Array.from(this.rollouts.values()).filter(r => r.featureId === featureId);
  }

  public getRolloutsByStatus(status: RolloutExecution['status']): RolloutExecution[] {
    return Array.from(this.rollouts.values()).filter(r => r.status === status);
  }
}