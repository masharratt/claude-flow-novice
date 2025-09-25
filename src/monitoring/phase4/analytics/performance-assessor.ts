/**
 * Phase 4 System Performance Impact Assessment
 * Real-time monitoring of system performance impact during rollout
 */

import { EventEmitter } from 'node:events';
import type { ILogger } from '../../../core/logger.js';
import type { IEventBus } from '../../../core/event-bus.js';

export interface SystemPerformanceMetrics {
  validation: {
    latency: {
      current: number;
      average: number;
      p95: number;
      p99: number;
      trend: 'improving' | 'stable' | 'degrading';
    };
    throughput: {
      validationsPerSecond: number;
      peakThroughput: number;
      utilizationRate: number;
    };
    queueMetrics: {
      pendingValidations: number;
      averageWaitTime: number;
      maxQueueSize: number;
    };
  };
  system: {
    resourceUtilization: {
      cpu: { usage: number; trend: string; alerts: number };
      memory: { usage: number; trend: string; leaks: boolean };
      network: { bandwidth: number; latency: number; errors: number };
      disk: { usage: number; ioWait: number; errors: number };
    };
    errorMetrics: {
      totalErrors: number;
      errorRate: number;
      criticalErrors: number;
      errorsByType: { type: string; count: number; trend: string }[];
    };
    availability: {
      uptime: number;
      mttr: number; // Mean Time To Recovery
      mtbf: number; // Mean Time Between Failures
      slaCompliance: number;
    };
  };
  hooks: {
    executionMetrics: {
      averageExecutionTime: number;
      p95ExecutionTime: number;
      timeoutRate: number;
      failureRate: number;
    };
    performanceImpact: {
      systemOverhead: number;
      memoryOverhead: number;
      networkOverhead: number;
    };
    hooksByType: {
      type: string;
      avgTime: number;
      successRate: number;
      impact: 'low' | 'medium' | 'high';
    }[];
  };
  rolloutImpact: {
    baselineDeviation: {
      cpu: number;
      memory: number;
      responseTime: number;
      errorRate: number;
    };
    cohortComparison: {
      cohortA: SystemImpactMetrics;
      cohortB: SystemImpactMetrics;
      significantDifference: boolean;
    };
    progressionReadiness: {
      performanceStable: boolean;
      resourcesWithinLimits: boolean;
      errorRateAcceptable: boolean;
      hooksPerformant: boolean;
    };
  };
}

export interface SystemImpactMetrics {
  averageResponseTime: number;
  errorRate: number;
  resourceUtilization: number;
  userSatisfaction: number;
}

export interface PerformanceAlert {
  id: string;
  type: 'performance_degradation' | 'resource_exhaustion' | 'hook_timeout' | 'error_spike';
  severity: 'warning' | 'critical';
  message: string;
  metrics: {
    current: number;
    threshold: number;
    deviation: number;
  };
  impact: {
    affectedUsers: number;
    affectedSystems: string[];
    rolloutRisk: 'low' | 'medium' | 'high';
  };
  recommendations: string[];
  timestamp: Date;
}

export interface BaselineMetrics {
  timestamp: Date;
  cpu: number;
  memory: number;
  responseTime: number;
  errorRate: number;
  throughput: number;
}

/**
 * Comprehensive system performance impact assessment
 * Provides real-time analysis of rollout impact on system performance
 */
export class SystemPerformanceAssessor extends EventEmitter {
  private logger: ILogger;
  private eventBus: IEventBus;
  private currentMetrics: SystemPerformanceMetrics;
  private baselineMetrics: BaselineMetrics;
  private performanceHistory: Map<string, { timestamp: Date; value: number }[]> = new Map();
  private alerts: Map<string, PerformanceAlert> = new Map();
  
  // Thresholds
  private readonly thresholds = {
    latency: { warning: 5000, critical: 10000 }, // ms
    errorRate: { warning: 0.005, critical: 0.01 }, // 0.5% warning, 1% critical
    cpu: { warning: 70, critical: 85 }, // %
    memory: { warning: 80, critical: 90 }, // %
    hookExecution: { warning: 80, critical: 100 }, // ms
    queueSize: { warning: 100, critical: 500 }
  };
  
  // Monitoring intervals
  private metricsCollectionInterval?: NodeJS.Timeout;
  private performanceAnalysisInterval?: NodeJS.Timeout;
  private baselineComparisonInterval?: NodeJS.Timeout;
  
  constructor(logger: ILogger, eventBus: IEventBus) {
    super();
    this.logger = logger;
    this.eventBus = eventBus;
    
    this.currentMetrics = this.initializeMetrics();
    this.baselineMetrics = this.initializeBaseline();
    
    this.setupEventHandlers();
  }
  
  async initialize(): Promise<void> {
    this.logger.info('Initializing System Performance Assessor', {
      thresholds: this.thresholds
    });
    
    // Establish baseline metrics
    await this.establishBaseline();
    
    // Start monitoring loops
    this.startMetricsCollection();
    this.startPerformanceAnalysis();
    this.startBaselineComparison();
    
    this.emit('assessor:initialized');
  }
  
  private setupEventHandlers(): void {
    // Validation performance events
    this.eventBus.on('validation:performance', (data) => {
      this.updateValidationMetrics(data);
    });
    
    // System resource events
    this.eventBus.on('system:resource-update', (data) => {
      this.updateSystemResourceMetrics(data);
    });
    
    // Error events
    this.eventBus.on('system:error', (data) => {
      this.updateErrorMetrics(data);
    });
    
    // Hook performance events
    this.eventBus.on('hooks:performance', (data) => {
      this.updateHookMetrics(data);
    });
    
    // Queue events
    this.eventBus.on('validation:queue-update', (data) => {
      this.updateQueueMetrics(data);
    });
  }
  
  private async establishBaseline(): Promise<void> {
    try {
      // Collect baseline metrics from pre-rollout period
      // In production, this would query historical data
      this.baselineMetrics = {
        timestamp: new Date(),
        cpu: 45, // Example baseline values
        memory: 60,
        responseTime: 800,
        errorRate: 0.002,
        throughput: 150
      };
      
      this.logger.info('Baseline metrics established', this.baselineMetrics);
      
      this.emit('baseline:established', {
        baseline: this.baselineMetrics,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to establish baseline metrics', error);
    }
  }
  
  private startMetricsCollection(): void {
    this.metricsCollectionInterval = setInterval(() => {
      this.collectCurrentMetrics();
    }, 30000); // Every 30 seconds
    
    this.logger.info('Started metrics collection');
  }
  
  private startPerformanceAnalysis(): void {
    this.performanceAnalysisInterval = setInterval(() => {
      this.analyzePerformance();
      this.checkPerformanceThresholds();
      this.updateTrends();
    }, 60000); // Every minute
    
    this.logger.info('Started performance analysis');
  }
  
  private startBaselineComparison(): void {
    this.baselineComparisonInterval = setInterval(() => {
      this.compareToBaseline();
      this.analyzeCohortDifferences();
      this.updateProgressionReadiness();
    }, 300000); // Every 5 minutes
    
    this.logger.info('Started baseline comparison');
  }
  
  private async collectCurrentMetrics(): Promise<void> {
    try {
      // In production, these would be actual system metrics
      const resourceMetrics = await this.getResourceMetrics();
      const validationMetrics = await this.getValidationMetrics();
      const hookMetrics = await this.getHookMetrics();
      
      // Update current metrics
      this.currentMetrics.system.resourceUtilization = resourceMetrics;
      this.currentMetrics.validation.latency.current = validationMetrics.latency;
      this.currentMetrics.validation.throughput = validationMetrics.throughput;
      this.currentMetrics.hooks.executionMetrics = hookMetrics;
      
      // Record in history
      this.recordMetricHistory('cpu_usage', resourceMetrics.cpu.usage);
      this.recordMetricHistory('memory_usage', resourceMetrics.memory.usage);
      this.recordMetricHistory('validation_latency', validationMetrics.latency);
      this.recordMetricHistory('hook_execution_time', hookMetrics.averageExecutionTime);
      
      this.emit('metrics:collected', {
        timestamp: new Date(),
        metrics: { ...this.currentMetrics }
      });
    } catch (error) {
      this.logger.error('Failed to collect metrics', error);
    }
  }
  
  private async getResourceMetrics(): Promise<any> {
    // Simulate getting actual resource metrics
    return {
      cpu: {
        usage: Math.random() * 20 + 50, // 50-70% usage
        trend: 'stable',
        alerts: 0
      },
      memory: {
        usage: Math.random() * 15 + 65, // 65-80% usage
        trend: 'stable',
        leaks: false
      },
      network: {
        bandwidth: Math.random() * 100 + 200, // 200-300 Mbps
        latency: Math.random() * 10 + 5, // 5-15ms
        errors: Math.floor(Math.random() * 3)
      },
      disk: {
        usage: Math.random() * 10 + 70, // 70-80%
        ioWait: Math.random() * 5,
        errors: 0
      }
    };
  }
  
  private async getValidationMetrics(): Promise<any> {
    return {
      latency: Math.random() * 2000 + 800, // 800-2800ms
      throughput: {
        validationsPerSecond: Math.random() * 50 + 100, // 100-150/sec
        peakThroughput: 200,
        utilizationRate: Math.random() * 0.3 + 0.6 // 60-90%
      }
    };
  }
  
  private async getHookMetrics(): Promise<any> {
    return {
      averageExecutionTime: Math.random() * 30 + 20, // 20-50ms
      p95ExecutionTime: Math.random() * 50 + 70, // 70-120ms
      timeoutRate: Math.random() * 0.001, // < 0.1%
      failureRate: Math.random() * 0.002 // < 0.2%
    };
  }
  
  private updateValidationMetrics(data: any): void {
    if (data.latency !== undefined) {
      this.currentMetrics.validation.latency.current = data.latency;
      this.recordMetricHistory('validation_latency', data.latency);
    }
    
    if (data.throughput !== undefined) {
      this.currentMetrics.validation.throughput.validationsPerSecond = data.throughput;
      this.recordMetricHistory('validation_throughput', data.throughput);
    }
    
    this.emit('validation:metrics-updated', {
      timestamp: new Date(),
      metrics: this.currentMetrics.validation
    });
  }
  
  private updateSystemResourceMetrics(data: any): void {
    if (data.cpu !== undefined) {
      this.currentMetrics.system.resourceUtilization.cpu.usage = data.cpu;
      this.recordMetricHistory('cpu_usage', data.cpu);
    }
    
    if (data.memory !== undefined) {
      this.currentMetrics.system.resourceUtilization.memory.usage = data.memory;
      this.recordMetricHistory('memory_usage', data.memory);
    }
    
    if (data.network !== undefined) {
      this.currentMetrics.system.resourceUtilization.network = {
        ...this.currentMetrics.system.resourceUtilization.network,
        ...data.network
      };
    }
    
    this.emit('system:metrics-updated', {
      timestamp: new Date(),
      metrics: this.currentMetrics.system
    });
  }
  
  private updateErrorMetrics(data: any): void {
    const errorMetrics = this.currentMetrics.system.errorMetrics;
    
    errorMetrics.totalErrors++;
    
    if (data.severity === 'critical') {
      errorMetrics.criticalErrors++;
    }
    
    // Update error by type
    const errorType = data.type || 'unknown';
    let typeMetric = errorMetrics.errorsByType.find(e => e.type === errorType);
    if (!typeMetric) {
      typeMetric = { type: errorType, count: 0, trend: 'stable' };
      errorMetrics.errorsByType.push(typeMetric);
    }
    typeMetric.count++;
    
    // Calculate error rate (simplified)
    const recentErrors = this.getRecentMetricHistory('error_count', 3600000); // Last hour
    errorMetrics.errorRate = recentErrors.length / 3600; // errors per second
    
    this.recordMetricHistory('error_count', 1);
    
    // Check error rate threshold
    if (errorMetrics.errorRate > this.thresholds.errorRate.critical) {
      this.createAlert('error_spike', 'critical',
        `Critical error rate detected: ${(errorMetrics.errorRate * 100).toFixed(3)}%`,
        {
          current: errorMetrics.errorRate,
          threshold: this.thresholds.errorRate.critical,
          deviation: errorMetrics.errorRate - this.thresholds.errorRate.critical
        }
      );
    }
    
    this.emit('error:metrics-updated', {
      timestamp: new Date(),
      error: data,
      metrics: errorMetrics
    });
  }
  
  private updateHookMetrics(data: any): void {
    const hookMetrics = this.currentMetrics.hooks.executionMetrics;
    
    if (data.executionTime !== undefined) {
      // Update weighted average
      const weight = 0.1; // Weight for new measurement
      hookMetrics.averageExecutionTime = 
        (hookMetrics.averageExecutionTime * (1 - weight)) + (data.executionTime * weight);
      
      this.recordMetricHistory('hook_execution_time', data.executionTime);
      
      // Check threshold
      if (data.executionTime > this.thresholds.hookExecution.critical) {
        this.createAlert('hook_timeout', 'critical',
          `Hook execution time exceeded critical threshold: ${data.executionTime}ms`,
          {
            current: data.executionTime,
            threshold: this.thresholds.hookExecution.critical,
            deviation: data.executionTime - this.thresholds.hookExecution.critical
          }
        );
      }
    }
    
    if (data.failed) {
      hookMetrics.failureRate = Math.min(hookMetrics.failureRate + 0.001, 1.0);
    }
    
    this.emit('hooks:metrics-updated', {
      timestamp: new Date(),
      metrics: hookMetrics
    });
  }
  
  private updateQueueMetrics(data: any): void {
    const queueMetrics = this.currentMetrics.validation.queueMetrics;
    
    if (data.pendingCount !== undefined) {
      queueMetrics.pendingValidations = data.pendingCount;
      
      if (data.pendingCount > this.thresholds.queueSize.critical) {
        this.createAlert('performance_degradation', 'critical',
          `Validation queue size critical: ${data.pendingCount} pending`,
          {
            current: data.pendingCount,
            threshold: this.thresholds.queueSize.critical,
            deviation: data.pendingCount - this.thresholds.queueSize.critical
          }
        );
      }
    }
    
    if (data.waitTime !== undefined) {
      queueMetrics.averageWaitTime = data.waitTime;
    }
    
    this.recordMetricHistory('queue_size', queueMetrics.pendingValidations);
  }
  
  private analyzePerformance(): void {
    try {
      // Analyze validation performance
      this.analyzeValidationPerformance();
      
      // Analyze system performance
      this.analyzeSystemPerformance();
      
      // Analyze hook performance
      this.analyzeHookPerformance();
      
      this.emit('analysis:performance-complete', {
        timestamp: new Date(),
        metrics: { ...this.currentMetrics }
      });
    } catch (error) {
      this.logger.error('Performance analysis failed', error);
    }
  }
  
  private analyzeValidationPerformance(): void {
    const validation = this.currentMetrics.validation;
    const latencyHistory = this.getRecentMetricHistory('validation_latency', 1800000); // 30 minutes
    
    if (latencyHistory.length > 0) {
      const values = latencyHistory.map(h => h.value);
      validation.latency.average = values.reduce((sum, val) => sum + val, 0) / values.length;
      validation.latency.p95 = this.calculatePercentile(values, 95);
      validation.latency.p99 = this.calculatePercentile(values, 99);
      validation.latency.trend = this.calculateTrend(values);
    }
    
    // Check for performance degradation
    if (validation.latency.trend === 'degrading' && validation.latency.average > this.thresholds.latency.warning) {
      this.createAlert('performance_degradation', 'warning',
        `Validation latency degrading: ${validation.latency.average.toFixed(0)}ms average`,
        {
          current: validation.latency.average,
          threshold: this.thresholds.latency.warning,
          deviation: validation.latency.average - this.thresholds.latency.warning
        }
      );
    }
  }
  
  private analyzeSystemPerformance(): void {
    const system = this.currentMetrics.system;
    
    // Check CPU utilization
    if (system.resourceUtilization.cpu.usage > this.thresholds.cpu.critical) {
      this.createAlert('resource_exhaustion', 'critical',
        `Critical CPU utilization: ${system.resourceUtilization.cpu.usage.toFixed(1)}%`,
        {
          current: system.resourceUtilization.cpu.usage,
          threshold: this.thresholds.cpu.critical,
          deviation: system.resourceUtilization.cpu.usage - this.thresholds.cpu.critical
        }
      );
    }
    
    // Check memory utilization
    if (system.resourceUtilization.memory.usage > this.thresholds.memory.critical) {
      this.createAlert('resource_exhaustion', 'critical',
        `Critical memory utilization: ${system.resourceUtilization.memory.usage.toFixed(1)}%`,
        {
          current: system.resourceUtilization.memory.usage,
          threshold: this.thresholds.memory.critical,
          deviation: system.resourceUtilization.memory.usage - this.thresholds.memory.critical
        }
      );
    }
    
    // Check for memory leaks
    const memoryHistory = this.getRecentMetricHistory('memory_usage', 3600000); // 1 hour
    if (memoryHistory.length > 10) {
      const trend = this.calculateTrend(memoryHistory.map(h => h.value));
      if (trend === 'degrading') {
        system.resourceUtilization.memory.leaks = true;
        
        this.createAlert('resource_exhaustion', 'warning',
          'Potential memory leak detected - memory usage trending upward',
          {
            current: system.resourceUtilization.memory.usage,
            threshold: this.thresholds.memory.warning,
            deviation: 0
          }
        );
      }
    }
  }
  
  private analyzeHookPerformance(): void {
    const hooks = this.currentMetrics.hooks;
    
    // Calculate performance impact
    const executionHistory = this.getRecentMetricHistory('hook_execution_time', 1800000);
    if (executionHistory.length > 0) {
      const values = executionHistory.map(h => h.value);
      hooks.executionMetrics.p95ExecutionTime = this.calculatePercentile(values, 95);
      
      // Calculate system overhead
      hooks.performanceImpact.systemOverhead = hooks.executionMetrics.averageExecutionTime / 1000; // Convert to seconds
    }
    
    // Check P95 performance
    if (hooks.executionMetrics.p95ExecutionTime > this.thresholds.hookExecution.critical) {
      this.createAlert('hook_timeout', 'warning',
        `Hook P95 execution time high: ${hooks.executionMetrics.p95ExecutionTime.toFixed(1)}ms`,
        {
          current: hooks.executionMetrics.p95ExecutionTime,
          threshold: this.thresholds.hookExecution.critical,
          deviation: hooks.executionMetrics.p95ExecutionTime - this.thresholds.hookExecution.critical
        }
      );
    }
  }
  
  private checkPerformanceThresholds(): void {
    const metrics = this.currentMetrics;
    
    // Comprehensive threshold checking
    const checks = [
      {
        name: 'validation_latency',
        value: metrics.validation.latency.current,
        warning: this.thresholds.latency.warning,
        critical: this.thresholds.latency.critical,
        type: 'performance_degradation' as const
      },
      {
        name: 'cpu_usage',
        value: metrics.system.resourceUtilization.cpu.usage,
        warning: this.thresholds.cpu.warning,
        critical: this.thresholds.cpu.critical,
        type: 'resource_exhaustion' as const
      },
      {
        name: 'memory_usage',
        value: metrics.system.resourceUtilization.memory.usage,
        warning: this.thresholds.memory.warning,
        critical: this.thresholds.memory.critical,
        type: 'resource_exhaustion' as const
      },
      {
        name: 'hook_execution',
        value: metrics.hooks.executionMetrics.averageExecutionTime,
        warning: this.thresholds.hookExecution.warning,
        critical: this.thresholds.hookExecution.critical,
        type: 'hook_timeout' as const
      }
    ];
    
    checks.forEach(check => {
      if (check.value > check.critical) {
        this.createAlert(check.type, 'critical',
          `${check.name} exceeded critical threshold: ${check.value.toFixed(1)}`,
          {
            current: check.value,
            threshold: check.critical,
            deviation: check.value - check.critical
          }
        );
      } else if (check.value > check.warning) {
        this.createAlert(check.type, 'warning',
          `${check.name} exceeded warning threshold: ${check.value.toFixed(1)}`,
          {
            current: check.value,
            threshold: check.warning,
            deviation: check.value - check.warning
          }
        );
      }
    });
  }
  
  private updateTrends(): void {
    const trends = {
      cpu: this.calculateMetricTrend('cpu_usage'),
      memory: this.calculateMetricTrend('memory_usage'),
      latency: this.calculateMetricTrend('validation_latency'),
      hookExecution: this.calculateMetricTrend('hook_execution_time')
    };
    
    // Update trend indicators in metrics
    this.currentMetrics.system.resourceUtilization.cpu.trend = trends.cpu;
    this.currentMetrics.system.resourceUtilization.memory.trend = trends.memory;
    this.currentMetrics.validation.latency.trend = trends.latency;
    
    this.emit('trends:updated', {
      timestamp: new Date(),
      trends
    });
  }
  
  private compareToBaseline(): void {
    const current = this.currentMetrics;
    const baseline = this.baselineMetrics;
    
    const deviation = {
      cpu: current.system.resourceUtilization.cpu.usage - baseline.cpu,
      memory: current.system.resourceUtilization.memory.usage - baseline.memory,
      responseTime: current.validation.latency.average - baseline.responseTime,
      errorRate: current.system.errorMetrics.errorRate - baseline.errorRate
    };
    
    current.rolloutImpact.baselineDeviation = deviation;
    
    // Check for significant deviations
    if (Math.abs(deviation.cpu) > 15) { // 15% CPU deviation
      this.createAlert('performance_degradation', 'warning',
        `Significant CPU deviation from baseline: ${deviation.cpu > 0 ? '+' : ''}${deviation.cpu.toFixed(1)}%`,
        {
          current: current.system.resourceUtilization.cpu.usage,
          threshold: baseline.cpu + 15,
          deviation: Math.abs(deviation.cpu)
        }
      );
    }
    
    if (Math.abs(deviation.responseTime) > 1000) { // 1 second deviation
      this.createAlert('performance_degradation', 'warning',
        `Significant response time deviation from baseline: ${deviation.responseTime > 0 ? '+' : ''}${deviation.responseTime.toFixed(0)}ms`,
        {
          current: current.validation.latency.average,
          threshold: baseline.responseTime + 1000,
          deviation: Math.abs(deviation.responseTime)
        }
      );
    }
    
    this.emit('baseline:comparison-complete', {
      timestamp: new Date(),
      deviation,
      baseline
    });
  }
  
  private analyzeCohortDifferences(): void {
    // Simulate cohort analysis (would use real data in production)
    const cohortA: SystemImpactMetrics = {
      averageResponseTime: this.currentMetrics.validation.latency.average * 0.95,
      errorRate: this.currentMetrics.system.errorMetrics.errorRate * 0.9,
      resourceUtilization: this.currentMetrics.system.resourceUtilization.cpu.usage * 0.92,
      userSatisfaction: 4.3
    };
    
    const cohortB: SystemImpactMetrics = {
      averageResponseTime: this.currentMetrics.validation.latency.average * 1.05,
      errorRate: this.currentMetrics.system.errorMetrics.errorRate * 1.1,
      resourceUtilization: this.currentMetrics.system.resourceUtilization.cpu.usage * 1.08,
      userSatisfaction: 4.1
    };
    
    const significantDifference = 
      Math.abs(cohortA.averageResponseTime - cohortB.averageResponseTime) > 200 ||
      Math.abs(cohortA.errorRate - cohortB.errorRate) > 0.001 ||
      Math.abs(cohortA.resourceUtilization - cohortB.resourceUtilization) > 5;
    
    this.currentMetrics.rolloutImpact.cohortComparison = {
      cohortA,
      cohortB,
      significantDifference
    };
    
    if (significantDifference) {
      this.createAlert('performance_degradation', 'warning',
        'Significant performance difference detected between user cohorts',
        {
          current: Math.abs(cohortA.averageResponseTime - cohortB.averageResponseTime),
          threshold: 200,
          deviation: Math.abs(cohortA.averageResponseTime - cohortB.averageResponseTime) - 200
        }
      );
    }
  }
  
  private updateProgressionReadiness(): void {
    const metrics = this.currentMetrics;
    const readiness = metrics.rolloutImpact.progressionReadiness;
    
    readiness.performanceStable = 
      metrics.validation.latency.trend !== 'degrading' &&
      metrics.validation.latency.average < this.thresholds.latency.warning;
    
    readiness.resourcesWithinLimits = 
      metrics.system.resourceUtilization.cpu.usage < this.thresholds.cpu.warning &&
      metrics.system.resourceUtilization.memory.usage < this.thresholds.memory.warning;
    
    readiness.errorRateAcceptable = 
      metrics.system.errorMetrics.errorRate < this.thresholds.errorRate.warning;
    
    readiness.hooksPerformant = 
      metrics.hooks.executionMetrics.averageExecutionTime < this.thresholds.hookExecution.warning &&
      metrics.hooks.executionMetrics.failureRate < 0.01;
    
    const overallReady = Object.values(readiness).every(Boolean);
    
    this.emit('progression:readiness-updated', {
      timestamp: new Date(),
      readiness,
      overallReady
    });
  }
  
  private createAlert(
    type: 'performance_degradation' | 'resource_exhaustion' | 'hook_timeout' | 'error_spike',
    severity: 'warning' | 'critical',
    message: string,
    metrics: { current: number; threshold: number; deviation: number }
  ): void {
    const alertId = `alert-${type}-${Date.now()}`;
    
    const alert: PerformanceAlert = {
      id: alertId,
      type,
      severity,
      message,
      metrics,
      impact: {
        affectedUsers: this.estimateAffectedUsers(type, severity),
        affectedSystems: this.getAffectedSystems(type),
        rolloutRisk: this.assessRolloutRisk(type, severity)
      },
      recommendations: this.getRecommendations(type, severity),
      timestamp: new Date()
    };
    
    this.alerts.set(alertId, alert);
    
    this.logger.warn('Performance Alert Created', {
      alertId,
      type,
      severity,
      message
    });
    
    this.emit('alert:created', { alert });
    
    // Emit to main event bus
    this.eventBus.emit('performance:alert', {
      alert,
      currentMetrics: { ...this.currentMetrics }
    });
  }
  
  private estimateAffectedUsers(type: string, severity: string): number {
    // Estimate based on alert type and severity
    const baseUsers = 1000; // Example user base
    
    switch (type) {
      case 'performance_degradation':
        return severity === 'critical' ? baseUsers : Math.floor(baseUsers * 0.3);
      case 'resource_exhaustion':
        return severity === 'critical' ? baseUsers : Math.floor(baseUsers * 0.5);
      case 'error_spike':
        return severity === 'critical' ? baseUsers : Math.floor(baseUsers * 0.2);
      case 'hook_timeout':
        return severity === 'critical' ? Math.floor(baseUsers * 0.8) : Math.floor(baseUsers * 0.1);
      default:
        return 0;
    }
  }
  
  private getAffectedSystems(type: string): string[] {
    switch (type) {
      case 'performance_degradation':
        return ['validation-service', 'user-interface', 'api-gateway'];
      case 'resource_exhaustion':
        return ['compute-nodes', 'database', 'cache-layer'];
      case 'error_spike':
        return ['logging-system', 'monitoring', 'user-experience'];
      case 'hook_timeout':
        return ['hook-system', 'workflow-engine', 'integration-layer'];
      default:
        return ['unknown'];
    }
  }
  
  private assessRolloutRisk(type: string, severity: string): 'low' | 'medium' | 'high' {
    if (severity === 'critical') {
      return type === 'error_spike' || type === 'resource_exhaustion' ? 'high' : 'medium';
    }
    return 'low';
  }
  
  private getRecommendations(type: string, severity: string): string[] {
    const recommendations: Record<string, string[]> = {
      performance_degradation: [
        'Investigate performance bottlenecks',
        'Consider scaling resources',
        'Review recent changes'
      ],
      resource_exhaustion: [
        'Scale up resources immediately',
        'Investigate resource leaks',
        'Consider load balancing'
      ],
      error_spike: [
        'Investigate error patterns',
        'Check system stability',
        'Review error handling'
      ],
      hook_timeout: [
        'Optimize hook execution',
        'Review hook complexity',
        'Consider timeout adjustments'
      ]
    };
    
    const baseRecommendations = recommendations[type] || ['Investigate issue'];
    
    if (severity === 'critical') {
      return ['IMMEDIATE ACTION REQUIRED', ...baseRecommendations, 'Consider rollback if necessary'];
    }
    
    return baseRecommendations;
  }
  
  // Utility methods
  private recordMetricHistory(metric: string, value: number): void {
    if (!this.performanceHistory.has(metric)) {
      this.performanceHistory.set(metric, []);
    }
    
    const history = this.performanceHistory.get(metric)!;
    history.push({ timestamp: new Date(), value });
    
    // Keep only last 1000 measurements
    if (history.length > 1000) {
      this.performanceHistory.set(metric, history.slice(-1000));
    }
  }
  
  private getRecentMetricHistory(metric: string, windowMs: number): { timestamp: Date; value: number }[] {
    const history = this.performanceHistory.get(metric) || [];
    const cutoff = new Date(Date.now() - windowMs);
    return history.filter(h => h.timestamp >= cutoff);
  }
  
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
  
  private calculateTrend(values: number[]): 'improving' | 'stable' | 'degrading' {
    if (values.length < 4) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    const threshold = firstAvg * 0.05; // 5% threshold
    
    if (Math.abs(difference) < threshold) return 'stable';
    return difference > 0 ? 'degrading' : 'improving';
  }
  
  private calculateMetricTrend(metric: string): 'improving' | 'stable' | 'degrading' {
    const history = this.getRecentMetricHistory(metric, 1800000); // 30 minutes
    if (history.length < 4) return 'stable';
    
    const values = history.map(h => h.value);
    return this.calculateTrend(values);
  }
  
  private initializeMetrics(): SystemPerformanceMetrics {
    return {
      validation: {
        latency: {
          current: 0,
          average: 0,
          p95: 0,
          p99: 0,
          trend: 'stable'
        },
        throughput: {
          validationsPerSecond: 0,
          peakThroughput: 0,
          utilizationRate: 0
        },
        queueMetrics: {
          pendingValidations: 0,
          averageWaitTime: 0,
          maxQueueSize: 0
        }
      },
      system: {
        resourceUtilization: {
          cpu: { usage: 0, trend: 'stable', alerts: 0 },
          memory: { usage: 0, trend: 'stable', leaks: false },
          network: { bandwidth: 0, latency: 0, errors: 0 },
          disk: { usage: 0, ioWait: 0, errors: 0 }
        },
        errorMetrics: {
          totalErrors: 0,
          errorRate: 0,
          criticalErrors: 0,
          errorsByType: []
        },
        availability: {
          uptime: 0,
          mttr: 0,
          mtbf: 0,
          slaCompliance: 0
        }
      },
      hooks: {
        executionMetrics: {
          averageExecutionTime: 0,
          p95ExecutionTime: 0,
          timeoutRate: 0,
          failureRate: 0
        },
        performanceImpact: {
          systemOverhead: 0,
          memoryOverhead: 0,
          networkOverhead: 0
        },
        hooksByType: []
      },
      rolloutImpact: {
        baselineDeviation: {
          cpu: 0,
          memory: 0,
          responseTime: 0,
          errorRate: 0
        },
        cohortComparison: {
          cohortA: {
            averageResponseTime: 0,
            errorRate: 0,
            resourceUtilization: 0,
            userSatisfaction: 0
          },
          cohortB: {
            averageResponseTime: 0,
            errorRate: 0,
            resourceUtilization: 0,
            userSatisfaction: 0
          },
          significantDifference: false
        },
        progressionReadiness: {
          performanceStable: false,
          resourcesWithinLimits: false,
          errorRateAcceptable: false,
          hooksPerformant: false
        }
      }
    };
  }
  
  private initializeBaseline(): BaselineMetrics {
    return {
      timestamp: new Date(),
      cpu: 0,
      memory: 0,
      responseTime: 0,
      errorRate: 0,
      throughput: 0
    };
  }
  
  // Public API methods
  getCurrentMetrics(): SystemPerformanceMetrics {
    return { ...this.currentMetrics };
  }
  
  getBaselineMetrics(): BaselineMetrics {
    return { ...this.baselineMetrics };
  }
  
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  
  getPerformanceHistory(metric: string, windowMs?: number): { timestamp: Date; value: number }[] {
    return windowMs 
      ? this.getRecentMetricHistory(metric, windowMs)
      : this.performanceHistory.get(metric) || [];
  }
  
  getSystemHealthScore(): {
    overall: number;
    components: {
      validation: number;
      resources: number;
      errors: number;
      hooks: number;
    };
  } {
    const metrics = this.currentMetrics;
    
    const components = {
      validation: Math.max(0, 1 - (metrics.validation.latency.current / (this.thresholds.latency.critical * 2))),
      resources: Math.max(0, 1 - (metrics.system.resourceUtilization.cpu.usage / 100)),
      errors: Math.max(0, 1 - (metrics.system.errorMetrics.errorRate / this.thresholds.errorRate.critical)),
      hooks: Math.max(0, 1 - (metrics.hooks.executionMetrics.averageExecutionTime / (this.thresholds.hookExecution.critical * 2)))
    };
    
    const overall = (components.validation + components.resources + components.errors + components.hooks) / 4;
    
    return {
      overall,
      components
    };
  }
  
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down System Performance Assessor');
    
    if (this.metricsCollectionInterval) clearInterval(this.metricsCollectionInterval);
    if (this.performanceAnalysisInterval) clearInterval(this.performanceAnalysisInterval);
    if (this.baselineComparisonInterval) clearInterval(this.baselineComparisonInterval);
    
    this.emit('assessor:shutdown');
  }
}
