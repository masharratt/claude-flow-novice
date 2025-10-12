/**
 * Phase 4 Controlled Rollout - Monitoring Dashboard
 * Real-time dashboard with comprehensive metrics and analytics
 */

import { EventEmitter } from 'node:events';
import type { ILogger } from '../../../core/logger.js';
import type { IEventBus } from '../../../core/event-bus.js';

export interface Phase4Metrics {
  // Truth Score Distribution
  truthScoreDistribution: {
    scores: number[];
    average: number;
    median: number;
    standardDeviation: number;
    percentiles: { p90: number; p95: number; p99: number };
    histogram: { bin: string; count: number }[];
  };

  // Consensus Decision Tracking
  consensusMetrics: {
    totalDecisions: number;
    successfulConsensus: number;
    byzantineFailures: number;
    averageConsensusTime: number;
    consensusSuccessRate: number;
    timingDistribution: { min: number; max: number; avg: number; p95: number };
  };

  // User Completion Claims
  userCompletionMetrics: {
    totalClaims: number;
    validatedClaims: number;
    rejectedClaims: number;
    pendingValidation: number;
    claimPatterns: { pattern: string; frequency: number }[];
    userCohortData: { cohort: string; completionRate: number; validationRate: number }[];
  };

  // System Performance Impact
  performanceImpact: {
    validationLatency: number;
    systemThroughput: number;
    resourceUtilization: { cpu: number; memory: number; network: number };
    errorRate: number;
    hookPerformance: { avgExecutionTime: number; p95ExecutionTime: number };
  };

  // User Satisfaction
  userSatisfaction: {
    averageRating: number;
    totalResponses: number;
    ratingDistribution: { rating: number; count: number }[];
    feedbackSentiment: { positive: number; neutral: number; negative: number };
    npsScore: number;
  };

  // Rollout Progression
  rolloutMetrics: {
    currentCohortSize: number;
    targetCohortSize: number;
    rolloutPercentage: number;
    progressionReadiness: boolean;
    rollbackReadiness: boolean;
    nextPhaseEligibility: {
      validationAccuracy: boolean;
      errorRateThreshold: boolean;
      userSatisfactionThreshold: boolean;
      performanceThreshold: boolean;
    };
  };
}

export interface AlertThresholds {
  validationAccuracy: { warning: number; critical: number }; // >90% target
  errorRate: { warning: number; critical: number }; // <1% critical
  userSatisfaction: { warning: number; critical: number }; // >4.2/5.0 target
  consensusSuccessRate: { warning: number; critical: number };
  systemLatency: { warning: number; critical: number };
  hookPerformance: { warning: number; critical: number }; // <100ms
}

export interface DashboardConfig {
  refreshInterval: number;
  dataRetentionPeriod: number;
  alertingEnabled: boolean;
  realTimeUpdates: boolean;
  debugMode: boolean;
  cohortTracking: boolean;
  performanceMonitoring: boolean;
}

export interface DashboardPanel {
  id: string;
  title: string;
  type: 'chart' | 'gauge' | 'table' | 'heatmap' | 'metric' | 'alert';
  metrics: string[];
  config: {
    width: number;
    height: number;
    position: { x: number; y: number };
    visualization: {
      chartType?: 'line' | 'bar' | 'pie' | 'histogram';
      colorScheme?: string[];
      thresholds?: { value: number; color: string; label: string }[];
      displayFormat?: 'percentage' | 'decimal' | 'integer' | 'time';
    };
  };
  alerts?: {
    enabled: boolean;
    conditions: { metric: string; operator: string; threshold: number }[];
  };
}

export interface AlertEvent {
  id: string;
  timestamp: Date;
  severity: 'warning' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  message: string;
  actionRequired: string;
  rolloutImpact: 'none' | 'pause' | 'rollback';
}

/**
 * Real-time monitoring dashboard for Phase 4 Controlled Rollout
 * Provides comprehensive analytics and decision-making support
 */
export class Phase4MonitoringDashboard extends EventEmitter {
  private logger: ILogger;
  private eventBus: IEventBus;
  private config: DashboardConfig;
  private thresholds: AlertThresholds;

  // Real-time data storage
  private currentMetrics: Phase4Metrics;
  private metricsHistory: Map<string, { timestamp: Date; value: number }[]> = new Map();
  private activeAlerts: Map<string, AlertEvent> = new Map();
  private alertHistory: AlertEvent[] = [];

  // Dashboard state
  private panels: Map<string, DashboardPanel> = new Map();
  private updateInterval?: NodeJS.Timeout;
  private connectedClients: Set<string> = new Set();

  constructor(config: Partial<DashboardConfig>, logger: ILogger, eventBus: IEventBus) {
    super();
    this.logger = logger;
    this.eventBus = eventBus;

    this.config = {
      refreshInterval: 5000,
      dataRetentionPeriod: 86400000, // 24 hours
      alertingEnabled: true,
      realTimeUpdates: true,
      debugMode: false,
      cohortTracking: true,
      performanceMonitoring: true,
      ...config,
    };

    this.thresholds = {
      validationAccuracy: { warning: 0.85, critical: 0.9 },
      errorRate: { warning: 0.005, critical: 0.01 }, // 0.5% warning, 1% critical
      userSatisfaction: { warning: 4.0, critical: 4.2 },
      consensusSuccessRate: { warning: 0.95, critical: 0.98 },
      systemLatency: { warning: 80, critical: 100 }, // milliseconds
      hookPerformance: { warning: 80, critical: 100 }, // milliseconds
    };

    this.currentMetrics = this.initializeMetrics();
    this.setupEventHandlers();
    this.initializeDefaultPanels();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Phase 4 Monitoring Dashboard', {
      refreshInterval: this.config.refreshInterval,
      alerting: this.config.alertingEnabled,
      realTimeUpdates: this.config.realTimeUpdates,
    });

    // Start real-time updates
    if (this.config.realTimeUpdates) {
      this.startRealTimeUpdates();
    }

    // Set up hooks integration
    await this.setupHooksIntegration();

    this.emit('dashboard:initialized', {
      timestamp: new Date(),
      config: this.config,
    });
  }

  private async setupHooksIntegration(): Promise<void> {
    // Record dashboard initialization in hooks
    await this.recordHooksEvent('dashboard-init', {
      phase: 'phase4-monitoring',
      timestamp: Date.now(),
      config: this.config,
    });
  }

  private setupEventHandlers(): void {
    // Truth score events
    this.eventBus.on('validation:truth-score', (data) => {
      this.updateTruthScoreMetrics(data.score, data.userId, data.taskId);
    });

    // Consensus events
    this.eventBus.on('consensus:decision-completed', (data) => {
      this.updateConsensusMetrics(data.success, data.duration, data.participants);
    });

    // User completion events
    this.eventBus.on('user:completion-claim', (data) => {
      this.updateUserCompletionMetrics(data.userId, data.claim, data.validation);
    });

    // Performance events
    this.eventBus.on('system:performance-update', (data) => {
      this.updatePerformanceMetrics(data.metrics);
    });

    // User satisfaction events
    this.eventBus.on('feedback:user-rating', (data) => {
      this.updateUserSatisfactionMetrics(data.rating, data.feedback);
    });

    // System error events
    this.eventBus.on('system:error', (data) => {
      this.updateErrorMetrics(data.error, data.severity);
    });
  }

  private startRealTimeUpdates(): void {
    this.updateInterval = setInterval(() => {
      this.collectMetrics();
      this.checkAlertThresholds();
      this.broadcastUpdates();
      this.cleanupOldData();
    }, this.config.refreshInterval);

    this.logger.info('Started real-time updates', {
      interval: this.config.refreshInterval,
    });
  }

  private async collectMetrics(): Promise<void> {
    try {
      // Update rollout progression metrics
      await this.updateRolloutMetrics();

      // Record metrics in hooks
      await this.recordHooksEvent('metrics-update', {
        timestamp: Date.now(),
        metrics: this.getMetricsSummary(),
      });

      // Store metrics history
      this.recordMetricsHistory();
    } catch (error) {
      this.logger.error('Failed to collect metrics', error);
    }
  }

  private updateTruthScoreMetrics(score: number, userId: string, taskId: string): void {
    const distribution = this.currentMetrics.truthScoreDistribution;
    distribution.scores.push(score);

    // Recalculate statistics
    distribution.average = this.calculateAverage(distribution.scores);
    distribution.median = this.calculateMedian(distribution.scores);
    distribution.standardDeviation = this.calculateStandardDeviation(distribution.scores);
    distribution.percentiles = this.calculatePercentiles(distribution.scores);
    distribution.histogram = this.calculateHistogram(distribution.scores, 10);

    // Check validation accuracy
    const accuracyThreshold = 0.7; // Minimum score for validation
    const validScores = distribution.scores.filter((s) => s >= accuracyThreshold);
    const validationAccuracy = validScores.length / distribution.scores.length;

    // Trigger alert if below threshold
    if (validationAccuracy < this.thresholds.validationAccuracy.critical) {
      this.createAlert(
        'validation_accuracy',
        validationAccuracy,
        this.thresholds.validationAccuracy.critical,
        'critical',
      );
    }

    this.emit('metrics:truth-score-updated', {
      score,
      userId,
      taskId,
      currentStats: distribution,
    });
  }

  private updateConsensusMetrics(success: boolean, duration: number, participants: number): void {
    const consensus = this.currentMetrics.consensusMetrics;

    consensus.totalDecisions++;
    if (success) {
      consensus.successfulConsensus++;
    } else {
      consensus.byzantineFailures++;
    }

    // Update timing metrics
    const timings = consensus.timingDistribution;
    timings.min = Math.min(timings.min || duration, duration);
    timings.max = Math.max(timings.max || duration, duration);

    // Update average (weighted)
    const totalTime = consensus.averageConsensusTime * (consensus.totalDecisions - 1) + duration;
    consensus.averageConsensusTime = totalTime / consensus.totalDecisions;
    timings.avg = consensus.averageConsensusTime;

    // Calculate success rate
    consensus.consensusSuccessRate = consensus.successfulConsensus / consensus.totalDecisions;

    // Check thresholds
    if (consensus.consensusSuccessRate < this.thresholds.consensusSuccessRate.critical) {
      this.createAlert(
        'consensus_success_rate',
        consensus.consensusSuccessRate,
        this.thresholds.consensusSuccessRate.critical,
        'critical',
      );
    }

    this.emit('metrics:consensus-updated', {
      success,
      duration,
      participants,
      currentStats: consensus,
    });
  }

  private updateUserCompletionMetrics(userId: string, claim: any, validation: any): void {
    const completion = this.currentMetrics.userCompletionMetrics;

    completion.totalClaims++;

    if (validation) {
      if (validation.valid) {
        completion.validatedClaims++;
      } else {
        completion.rejectedClaims++;
      }
    } else {
      completion.pendingValidation++;
    }

    // Analyze patterns
    const pattern = this.extractClaimPattern(claim);
    const existingPattern = completion.claimPatterns.find((p) => p.pattern === pattern);
    if (existingPattern) {
      existingPattern.frequency++;
    } else {
      completion.claimPatterns.push({ pattern, frequency: 1 });
    }

    // Update cohort data
    this.updateUserCohortData(userId, completion);

    this.emit('metrics:completion-updated', {
      userId,
      claim,
      validation,
      currentStats: completion,
    });
  }

  private updatePerformanceMetrics(metrics: any): void {
    const performance = this.currentMetrics.performanceImpact;

    if (metrics.validationLatency) {
      performance.validationLatency = metrics.validationLatency;
    }

    if (metrics.systemThroughput) {
      performance.systemThroughput = metrics.systemThroughput;
    }

    if (metrics.resourceUtilization) {
      performance.resourceUtilization = {
        ...performance.resourceUtilization,
        ...metrics.resourceUtilization,
      };
    }

    if (metrics.hookPerformance) {
      performance.hookPerformance = metrics.hookPerformance;

      // Check hook performance threshold
      if (performance.hookPerformance.avgExecutionTime > this.thresholds.hookPerformance.critical) {
        this.createAlert(
          'hook_performance',
          performance.hookPerformance.avgExecutionTime,
          this.thresholds.hookPerformance.critical,
          'critical',
        );
      }
    }

    this.emit('metrics:performance-updated', {
      metrics,
      currentStats: performance,
    });
  }

  private updateUserSatisfactionMetrics(rating: number, feedback?: string): void {
    const satisfaction = this.currentMetrics.userSatisfaction;

    satisfaction.totalResponses++;

    // Update rating distribution
    const ratingEntry = satisfaction.ratingDistribution.find((r) => r.rating === rating);
    if (ratingEntry) {
      ratingEntry.count++;
    } else {
      satisfaction.ratingDistribution.push({ rating, count: 1 });
    }

    // Recalculate average
    const totalRating = satisfaction.ratingDistribution.reduce(
      (sum, r) => sum + r.rating * r.count,
      0,
    );
    satisfaction.averageRating = totalRating / satisfaction.totalResponses;

    // Analyze feedback sentiment
    if (feedback) {
      const sentiment = this.analyzeSentiment(feedback);
      satisfaction.feedbackSentiment[sentiment]++;
    }

    // Calculate NPS score
    satisfaction.npsScore = this.calculateNPS(satisfaction.ratingDistribution);

    // Check satisfaction threshold
    if (satisfaction.averageRating < this.thresholds.userSatisfaction.critical) {
      this.createAlert(
        'user_satisfaction',
        satisfaction.averageRating,
        this.thresholds.userSatisfaction.critical,
        'critical',
      );
    }

    this.emit('metrics:satisfaction-updated', {
      rating,
      feedback,
      currentStats: satisfaction,
    });
  }

  private updateErrorMetrics(error: any, severity: string): void {
    const performance = this.currentMetrics.performanceImpact;

    // Increment error count (simplified - would need proper error rate calculation)
    performance.errorRate = Math.min(performance.errorRate + 0.001, 1.0);

    // Check error rate threshold
    if (performance.errorRate > this.thresholds.errorRate.critical) {
      this.createAlert(
        'error_rate',
        performance.errorRate,
        this.thresholds.errorRate.critical,
        'critical',
      );
    }

    this.emit('metrics:error-updated', {
      error,
      severity,
      currentErrorRate: performance.errorRate,
    });
  }

  private async updateRolloutMetrics(): Promise<void> {
    const rollout = this.currentMetrics.rolloutMetrics;

    // Update progression readiness based on all thresholds
    const eligibility = rollout.nextPhaseEligibility;

    eligibility.validationAccuracy =
      this.getCurrentValidationAccuracy() >= this.thresholds.validationAccuracy.critical;
    eligibility.errorRateThreshold =
      this.currentMetrics.performanceImpact.errorRate <= this.thresholds.errorRate.critical;
    eligibility.userSatisfactionThreshold =
      this.currentMetrics.userSatisfaction.averageRating >=
      this.thresholds.userSatisfaction.critical;
    eligibility.performanceThreshold =
      this.currentMetrics.performanceImpact.hookPerformance.avgExecutionTime <=
      this.thresholds.hookPerformance.critical;

    rollout.progressionReadiness = Object.values(eligibility).every(Boolean);
    rollout.rollbackReadiness = !rollout.progressionReadiness;

    // Calculate current rollout percentage (10% → 25%)
    rollout.rolloutPercentage = (rollout.currentCohortSize / rollout.targetCohortSize) * 100;

    this.emit('metrics:rollout-updated', {
      rollout,
      progressionReadiness: rollout.progressionReadiness,
    });
  }

  private checkAlertThresholds(): void {
    // Check all critical thresholds and create alerts as needed
    const checks = [
      {
        metric: 'validation_accuracy',
        value: this.getCurrentValidationAccuracy(),
        threshold: this.thresholds.validationAccuracy.critical,
        message: 'Validation accuracy below critical threshold',
      },
      {
        metric: 'error_rate',
        value: this.currentMetrics.performanceImpact.errorRate,
        threshold: this.thresholds.errorRate.critical,
        message: 'System error rate above critical threshold',
      },
      {
        metric: 'user_satisfaction',
        value: this.currentMetrics.userSatisfaction.averageRating,
        threshold: this.thresholds.userSatisfaction.critical,
        message: 'User satisfaction below critical threshold',
        inverted: true, // Lower values are worse
      },
      {
        metric: 'hook_performance',
        value: this.currentMetrics.performanceImpact.hookPerformance.avgExecutionTime,
        threshold: this.thresholds.hookPerformance.critical,
        message: 'Hook execution time above critical threshold',
      },
    ];

    for (const check of checks) {
      const breached = check.inverted
        ? check.value < check.threshold
        : check.value > check.threshold;

      if (breached) {
        this.createAlert(check.metric, check.value, check.threshold, 'critical', check.message);
      }
    }
  }

  private createAlert(
    metric: string,
    value: number,
    threshold: number,
    severity: 'warning' | 'critical',
    customMessage?: string,
  ): void {
    const alertId = `alert-${metric}-${Date.now()}`;

    const alert: AlertEvent = {
      id: alertId,
      timestamp: new Date(),
      severity,
      metric,
      value,
      threshold,
      message: customMessage || `${metric} threshold breached: ${value} vs ${threshold}`,
      actionRequired: this.getActionRequired(metric, severity),
      rolloutImpact: this.getRolloutImpact(metric, severity),
    };

    this.activeAlerts.set(alertId, alert);
    this.alertHistory.push(alert);

    this.logger.warn('Phase 4 Alert Created', {
      alertId,
      metric,
      value,
      threshold,
      severity,
    });

    this.emit('alert:created', { alert });

    // Record alert in hooks
    this.recordHooksEvent('alert-created', {
      alertId,
      metric,
      severity,
      rolloutImpact: alert.rolloutImpact,
    });
  }

  private getActionRequired(metric: string, severity: 'warning' | 'critical'): string {
    const actions: Record<string, Record<string, string>> = {
      validation_accuracy: {
        warning: 'Monitor validation patterns and investigate low-scoring tasks',
        critical: 'IMMEDIATE: Review validation system and consider rollout pause',
      },
      error_rate: {
        warning: 'Investigate error sources and implement fixes',
        critical: 'IMMEDIATE: System stability at risk - consider rollback',
      },
      user_satisfaction: {
        warning: 'Review user feedback and address common issues',
        critical: 'IMMEDIATE: User experience severely impacted - rollback recommended',
      },
      hook_performance: {
        warning: 'Optimize hook execution and review performance bottlenecks',
        critical: 'IMMEDIATE: Hook performance impacting system - optimize or disable',
      },
    };

    return actions[metric]?.[severity] || 'Review metric and take appropriate action';
  }

  private getRolloutImpact(
    metric: string,
    severity: 'warning' | 'critical',
  ): 'none' | 'pause' | 'rollback' {
    if (severity === 'critical') {
      return metric === 'user_satisfaction' || metric === 'error_rate' ? 'rollback' : 'pause';
    }
    return 'none';
  }

  private broadcastUpdates(): void {
    if (this.connectedClients.size === 0) return;

    const update = {
      timestamp: new Date(),
      metrics: this.currentMetrics,
      alerts: Array.from(this.activeAlerts.values()),
      dashboardState: {
        totalPanels: this.panels.size,
        connectedClients: this.connectedClients.size,
        dataReliability: this.calculateDataReliability(),
      },
    };

    this.emit('dashboard:update', update);

    // Record broadcast in hooks
    this.recordHooksEvent('dashboard-update', {
      timestamp: Date.now(),
      clientCount: this.connectedClients.size,
      metricsCount: Object.keys(this.currentMetrics).length,
    });
  }

  private calculateDataReliability(): number {
    // Calculate reliability based on data freshness, completeness, and accuracy
    const now = Date.now();
    const maxAge = 30000; // 30 seconds

    let reliabilityScore = 1.0;

    // Check data freshness
    for (const [metric, history] of this.metricsHistory) {
      if (history.length === 0) {
        reliabilityScore -= 0.1;
        continue;
      }

      const lastUpdate = history[history.length - 1].timestamp.getTime();
      const age = now - lastUpdate;

      if (age > maxAge) {
        reliabilityScore -= 0.05;
      }
    }

    return Math.max(0, Math.min(1, reliabilityScore));
  }

  // Utility methods
  private getCurrentValidationAccuracy(): number {
    const scores = this.currentMetrics.truthScoreDistribution.scores;
    if (scores.length === 0) return 1.0;

    const validScores = scores.filter((s) => s >= 0.7);
    return validScores.length / scores.length;
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.calculateAverage(values);
    const squaredDiffs = values.map((val) => Math.pow(val - avg, 2));
    return Math.sqrt(this.calculateAverage(squaredDiffs));
  }

  private calculatePercentiles(values: number[]): { p90: number; p95: number; p99: number } {
    if (values.length === 0) return { p90: 0, p95: 0, p99: 0 };

    const sorted = [...values].sort((a, b) => a - b);
    const getPercentile = (p: number) => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)];
    };

    return {
      p90: getPercentile(90),
      p95: getPercentile(95),
      p99: getPercentile(99),
    };
  }

  private calculateHistogram(values: number[], bins: number): { bin: string; count: number }[] {
    if (values.length === 0) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binSize = (max - min) / bins;

    const histogram: { bin: string; count: number }[] = [];

    for (let i = 0; i < bins; i++) {
      const binStart = min + i * binSize;
      const binEnd = binStart + binSize;
      const count = values.filter(
        (val) => val >= binStart && (i === bins - 1 ? val <= binEnd : val < binEnd),
      ).length;

      histogram.push({
        bin: `${binStart.toFixed(2)}-${binEnd.toFixed(2)}`,
        count,
      });
    }

    return histogram;
  }

  private extractClaimPattern(claim: any): string {
    // Analyze claim structure to identify patterns
    if (!claim) return 'unknown';

    const type = typeof claim;
    if (type === 'string') return 'text-claim';
    if (type === 'object' && claim.type) return `structured-${claim.type}`;

    return 'generic-object';
  }

  private updateUserCohortData(userId: string, completion: any): void {
    // Update cohort-specific metrics (simplified implementation)
    const cohortId = this.getUserCohort(userId);
    let cohortData = completion.userCohortData.find((c) => c.cohort === cohortId);

    if (!cohortData) {
      cohortData = { cohort: cohortId, completionRate: 0, validationRate: 0 };
      completion.userCohortData.push(cohortData);
    }

    // Recalculate rates (simplified)
    cohortData.completionRate = completion.validatedClaims / completion.totalClaims;
    cohortData.validationRate =
      completion.validatedClaims / (completion.validatedClaims + completion.rejectedClaims);
  }

  private getUserCohort(userId: string): string {
    // Simple hash-based cohort assignment
    const hash = this.simpleHash(userId);
    return hash % 2 === 0 ? '10-percent' : '25-percent';
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
    // Simple sentiment analysis (would use proper NLP in production)
    const positiveWords = ['good', 'great', 'excellent', 'love', 'perfect', 'amazing'];
    const negativeWords = ['bad', 'terrible', 'hate', 'awful', 'worst', 'broken'];

    const words = text.toLowerCase().split(/\s+/);
    const positiveCount = words.filter((word) => positiveWords.includes(word)).length;
    const negativeCount = words.filter((word) => negativeWords.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private calculateNPS(ratingDistribution: { rating: number; count: number }[]): number {
    // Calculate Net Promoter Score from rating distribution
    const totalResponses = ratingDistribution.reduce((sum, r) => sum + r.count, 0);
    if (totalResponses === 0) return 0;

    const promoters = ratingDistribution
      .filter((r) => r.rating >= 4)
      .reduce((sum, r) => sum + r.count, 0);
    const detractors = ratingDistribution
      .filter((r) => r.rating <= 2)
      .reduce((sum, r) => sum + r.count, 0);

    return ((promoters - detractors) / totalResponses) * 100;
  }

  private recordMetricsHistory(): void {
    const timestamp = new Date();

    // Record key metrics
    this.recordMetricValue('validation_accuracy', this.getCurrentValidationAccuracy(), timestamp);
    this.recordMetricValue(
      'error_rate',
      this.currentMetrics.performanceImpact.errorRate,
      timestamp,
    );
    this.recordMetricValue(
      'user_satisfaction',
      this.currentMetrics.userSatisfaction.averageRating,
      timestamp,
    );
    this.recordMetricValue(
      'consensus_success_rate',
      this.currentMetrics.consensusMetrics.consensusSuccessRate,
      timestamp,
    );
    this.recordMetricValue(
      'hook_performance',
      this.currentMetrics.performanceImpact.hookPerformance.avgExecutionTime,
      timestamp,
    );
  }

  private recordMetricValue(metric: string, value: number, timestamp: Date): void {
    if (!this.metricsHistory.has(metric)) {
      this.metricsHistory.set(metric, []);
    }

    const history = this.metricsHistory.get(metric)!;
    history.push({ timestamp, value });

    // Keep only recent history
    const cutoff = new Date(timestamp.getTime() - this.config.dataRetentionPeriod);
    this.metricsHistory.set(
      metric,
      history.filter((h) => h.timestamp > cutoff),
    );
  }

  private cleanupOldData(): void {
    const cutoff = new Date(Date.now() - this.config.dataRetentionPeriod);

    // Clean up alert history
    this.alertHistory = this.alertHistory.filter((alert) => alert.timestamp > cutoff);

    // Clean up resolved active alerts
    for (const [alertId, alert] of this.activeAlerts) {
      if (alert.timestamp < cutoff) {
        this.activeAlerts.delete(alertId);
      }
    }
  }

  private getMetricsSummary(): any {
    return {
      validationAccuracy: this.getCurrentValidationAccuracy(),
      errorRate: this.currentMetrics.performanceImpact.errorRate,
      userSatisfaction: this.currentMetrics.userSatisfaction.averageRating,
      consensusSuccessRate: this.currentMetrics.consensusMetrics.consensusSuccessRate,
      hookPerformance: this.currentMetrics.performanceImpact.hookPerformance.avgExecutionTime,
      totalClaims: this.currentMetrics.userCompletionMetrics.totalClaims,
      rolloutPercentage: this.currentMetrics.rolloutMetrics.rolloutPercentage,
    };
  }

  private async recordHooksEvent(event: string, data: any): Promise<void> {
    try {
      this.eventBus.emit('hooks:record', {
        event: `phase4-monitoring:${event}`,
        data,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Failed to record hooks event', error);
    }
  }

  private initializeMetrics(): Phase4Metrics {
    return {
      truthScoreDistribution: {
        scores: [],
        average: 0,
        median: 0,
        standardDeviation: 0,
        percentiles: { p90: 0, p95: 0, p99: 0 },
        histogram: [],
      },
      consensusMetrics: {
        totalDecisions: 0,
        successfulConsensus: 0,
        byzantineFailures: 0,
        averageConsensusTime: 0,
        consensusSuccessRate: 1.0,
        timingDistribution: { min: 0, max: 0, avg: 0, p95: 0 },
      },
      userCompletionMetrics: {
        totalClaims: 0,
        validatedClaims: 0,
        rejectedClaims: 0,
        pendingValidation: 0,
        claimPatterns: [],
        userCohortData: [],
      },
      performanceImpact: {
        validationLatency: 0,
        systemThroughput: 0,
        resourceUtilization: { cpu: 0, memory: 0, network: 0 },
        errorRate: 0,
        hookPerformance: { avgExecutionTime: 0, p95ExecutionTime: 0 },
      },
      userSatisfaction: {
        averageRating: 4.5,
        totalResponses: 0,
        ratingDistribution: [],
        feedbackSentiment: { positive: 0, neutral: 0, negative: 0 },
        npsScore: 0,
      },
      rolloutMetrics: {
        currentCohortSize: 0,
        targetCohortSize: 1000, // Example target
        rolloutPercentage: 0,
        progressionReadiness: false,
        rollbackReadiness: true,
        nextPhaseEligibility: {
          validationAccuracy: false,
          errorRateThreshold: false,
          userSatisfactionThreshold: false,
          performanceThreshold: false,
        },
      },
    };
  }

  private initializeDefaultPanels(): void {
    const panels: DashboardPanel[] = [
      {
        id: 'truth-score-distribution',
        title: 'Truth Score Distribution',
        type: 'chart',
        metrics: ['truth_score_histogram'],
        config: {
          width: 6,
          height: 4,
          position: { x: 0, y: 0 },
          visualization: {
            chartType: 'histogram',
            colorScheme: ['#28a745', '#ffc107', '#dc3545'],
            thresholds: [
              { value: 0.9, color: '#28a745', label: 'Target' },
              { value: 0.7, color: '#ffc107', label: 'Warning' },
            ],
          },
        },
      },
      {
        id: 'consensus-success-rate',
        title: 'Consensus Success Rate',
        type: 'gauge',
        metrics: ['consensus_success_rate'],
        config: {
          width: 3,
          height: 4,
          position: { x: 6, y: 0 },
          visualization: {
            displayFormat: 'percentage',
            thresholds: [
              { value: 0.98, color: '#28a745', label: 'Excellent' },
              { value: 0.95, color: '#ffc107', label: 'Good' },
              { value: 0.9, color: '#dc3545', label: 'Poor' },
            ],
          },
        },
      },
      {
        id: 'user-satisfaction',
        title: 'User Satisfaction',
        type: 'gauge',
        metrics: ['user_satisfaction'],
        config: {
          width: 3,
          height: 4,
          position: { x: 9, y: 0 },
          visualization: {
            displayFormat: 'decimal',
            thresholds: [
              { value: 4.2, color: '#28a745', label: 'Target' },
              { value: 4.0, color: '#ffc107', label: 'Warning' },
            ],
          },
        },
      },
      {
        id: 'system-performance',
        title: 'System Performance Impact',
        type: 'chart',
        metrics: ['error_rate', 'validation_latency', 'hook_performance'],
        config: {
          width: 12,
          height: 4,
          position: { x: 0, y: 4 },
          visualization: {
            chartType: 'line',
            colorScheme: ['#007bff', '#28a745', '#ffc107'],
          },
        },
        alerts: {
          enabled: true,
          conditions: [
            { metric: 'error_rate', operator: '>', threshold: 0.01 },
            { metric: 'hook_performance', operator: '>', threshold: 100 },
          ],
        },
      },
      {
        id: 'rollout-progression',
        title: 'Rollout Progression Status',
        type: 'table',
        metrics: ['rollout_eligibility'],
        config: {
          width: 6,
          height: 4,
          position: { x: 0, y: 8 },
          visualization: {
            displayFormat: 'percentage',
          },
        },
      },
      {
        id: 'active-alerts',
        title: 'Active Alerts',
        type: 'alert',
        metrics: ['active_alerts'],
        config: {
          width: 6,
          height: 4,
          position: { x: 6, y: 8 },
          visualization: {},
        },
      },
    ];

    panels.forEach((panel) => this.panels.set(panel.id, panel));
  }

  // Public API methods
  getCurrentMetrics(): Phase4Metrics {
    return { ...this.currentMetrics };
  }

  getActiveAlerts(): AlertEvent[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertHistory(limit: number = 100): AlertEvent[] {
    return this.alertHistory.slice(-limit);
  }

  getMetricsHistory(
    metric: string,
    timeRange?: { start: Date; end: Date },
  ): { timestamp: Date; value: number }[] {
    const history = this.metricsHistory.get(metric) || [];

    if (!timeRange) return history;

    return history.filter((h) => h.timestamp >= timeRange.start && h.timestamp <= timeRange.end);
  }

  getDashboardPanels(): DashboardPanel[] {
    return Array.from(this.panels.values());
  }

  connectClient(clientId: string): void {
    this.connectedClients.add(clientId);
    this.emit('client:connected', { clientId, totalClients: this.connectedClients.size });
  }

  disconnectClient(clientId: string): void {
    this.connectedClients.delete(clientId);
    this.emit('client:disconnected', { clientId, totalClients: this.connectedClients.size });
  }

  acknowledgeAlert(alertId: string, acknowledgedBy: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      // Mark as acknowledged (extend AlertEvent interface if needed)
      this.emit('alert:acknowledged', { alertId, acknowledgedBy });

      this.recordHooksEvent('alert-acknowledged', {
        alertId,
        acknowledgedBy,
        timestamp: Date.now(),
      });
    }
  }

  getRolloutDecision(): {
    recommendation: 'proceed' | 'pause' | 'rollback';
    confidence: number;
    reasoning: string[];
    criticalIssues: string[];
  } {
    const metrics = this.currentMetrics;
    const criticalIssues: string[] = [];
    const reasoning: string[] = [];

    // Check all critical thresholds
    if (this.getCurrentValidationAccuracy() < this.thresholds.validationAccuracy.critical) {
      criticalIssues.push('Validation accuracy below 90% threshold');
    }

    if (metrics.performanceImpact.errorRate > this.thresholds.errorRate.critical) {
      criticalIssues.push('Error rate above 1% critical threshold');
    }

    if (metrics.userSatisfaction.averageRating < this.thresholds.userSatisfaction.critical) {
      criticalIssues.push('User satisfaction below 4.2/5.0 threshold');
    }

    if (
      metrics.performanceImpact.hookPerformance.avgExecutionTime >
      this.thresholds.hookPerformance.critical
    ) {
      criticalIssues.push('Hook performance above 100ms threshold');
    }

    // Determine recommendation
    let recommendation: 'proceed' | 'pause' | 'rollback';
    let confidence: number;

    if (criticalIssues.length === 0) {
      recommendation = 'proceed';
      confidence = 0.9;
      reasoning.push('All critical thresholds met');
      reasoning.push('System performing within acceptable parameters');
    } else if (criticalIssues.length <= 1) {
      recommendation = 'pause';
      confidence = 0.7;
      reasoning.push('Minor issues detected - pause recommended');
      reasoning.push('Address issues before proceeding');
    } else {
      recommendation = 'rollback';
      confidence = 0.85;
      reasoning.push('Multiple critical issues detected');
      reasoning.push('Rollback recommended to ensure system stability');
    }

    return {
      recommendation,
      confidence,
      reasoning,
      criticalIssues,
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Phase 4 Monitoring Dashboard');

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Record final metrics in hooks
    await this.recordHooksEvent('dashboard-shutdown', {
      timestamp: Date.now(),
      finalMetrics: this.getMetricsSummary(),
      totalAlerts: this.alertHistory.length,
      dataReliability: this.calculateDataReliability(),
    });

    this.emit('dashboard:shutdown');
  }
}
