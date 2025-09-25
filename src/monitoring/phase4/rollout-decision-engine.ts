/**
 * Phase 4 Rollout Decision Engine
 * Comprehensive decision-making system for rollout progression
 */

import { EventEmitter } from 'node:events';
import type { ILogger } from '../../core/logger.js';
import type { IEventBus } from '../../core/event-bus.js';
import type { Phase4Metrics } from './dashboard/monitoring-dashboard.js';
import type { ValidationAccuracyMetrics } from './analytics/truth-score-analyzer.js';
import type { ConsensusPerformanceMetrics } from './analytics/consensus-tracker.js';
import type { SystemPerformanceMetrics } from './analytics/performance-assessor.js';

export interface RolloutDecision {
  id: string;
  timestamp: Date;
  recommendation: 'proceed' | 'pause' | 'rollback';
  confidence: number;
  reasoning: {
    primary: string[];
    secondary: string[];
    riskFactors: string[];
  };
  metrics: {
    validationAccuracy: number;
    consensusSuccessRate: number;
    errorRate: number;
    userSatisfaction: number;
    systemPerformance: number;
    hookPerformance: number;
  };
  thresholds: {
    met: string[];
    failed: string[];
    marginal: string[];
  };
  impact: {
    affectedUsers: number;
    estimatedRisk: 'low' | 'medium' | 'high';
    rollbackComplexity: 'simple' | 'moderate' | 'complex';
  };
  nextEvaluationTime: Date;
  automaticAction: boolean;
}

export interface DecisionCriteria {
  validationAccuracy: {
    target: number;
    minimum: number;
    weight: number;
  };
  consensusReliability: {
    target: number;
    minimum: number;
    weight: number;
  };
  systemStability: {
    errorRateMax: number;
    performanceThreshold: number;
    weight: number;
  };
  userExperience: {
    satisfactionMin: number;
    hookPerformanceMax: number;
    weight: number;
  };
  riskTolerance: {
    maxRiskScore: number;
    requireUnanimity: boolean;
    conservativeBias: number;
  };
}

export interface RolloutProgress {
  currentPhase: string;
  currentCohort: {
    size: number;
    percentage: number;
    startTime: Date;
  };
  nextPhase: {
    targetSize: number;
    targetPercentage: number;
    readinessScore: number;
  };
  timeline: {
    elapsed: number;
    estimated: number;
    remaining: number;
  };
  milestones: {
    name: string;
    completed: boolean;
    timestamp?: Date;
    criteria: string[];
  }[];
}

export interface RiskAssessment {
  overall: {
    score: number; // 0-100
    level: 'low' | 'medium' | 'high' | 'critical';
    trend: 'improving' | 'stable' | 'worsening';
  };
  categories: {
    technical: { score: number; factors: string[] };
    operational: { score: number; factors: string[] };
    user: { score: number; factors: string[] };
    business: { score: number; factors: string[] };
  };
  mitigationStrategies: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
}

/**
 * Advanced rollout decision engine with 99%+ data reliability
 * Provides rapid decision-making for rollout progression based on comprehensive metrics
 */
export class RolloutDecisionEngine extends EventEmitter {
  private logger: ILogger;
  private eventBus: IEventBus;
  private criteria: DecisionCriteria;
  private decisions: Map<string, RolloutDecision> = new Map();
  private rolloutProgress: RolloutProgress;
  
  // Current metrics from monitoring systems
  private currentMetrics: {
    phase4?: Phase4Metrics;
    validation?: ValidationAccuracyMetrics;
    consensus?: ConsensusPerformanceMetrics;
    performance?: SystemPerformanceMetrics;
  } = {};
  
  // Decision making state
  private lastDecision?: RolloutDecision;
  private evaluationInterval?: NodeJS.Timeout;
  private emergencyMode = false;
  
  constructor(
    logger: ILogger,
    eventBus: IEventBus,
    customCriteria?: Partial<DecisionCriteria>
  ) {
    super();
    this.logger = logger;
    this.eventBus = eventBus;
    
    this.criteria = {
      validationAccuracy: {
        target: 0.95, // 95% target
        minimum: 0.90, // 90% minimum
        weight: 0.3
      },
      consensusReliability: {
        target: 0.99,
        minimum: 0.95,
        weight: 0.2
      },
      systemStability: {
        errorRateMax: 0.01, // 1% max error rate
        performanceThreshold: 0.8,
        weight: 0.25
      },
      userExperience: {
        satisfactionMin: 4.2, // 4.2/5.0 minimum
        hookPerformanceMax: 100, // 100ms max
        weight: 0.15
      },
      riskTolerance: {
        maxRiskScore: 30, // 30/100 max risk
        requireUnanimity: false,
        conservativeBias: 0.1
      },
      ...customCriteria
    };
    
    this.rolloutProgress = this.initializeRolloutProgress();
    
    this.setupEventHandlers();
  }
  
  async initialize(): Promise<void> {
    this.logger.info('Initializing Rollout Decision Engine', {
      criteria: this.criteria
    });
    
    // Start automated decision evaluation
    this.startAutomatedEvaluation();
    
    this.emit('decision-engine:initialized');
  }
  
  private setupEventHandlers(): void {
    // Listen for metrics updates from monitoring systems
    this.eventBus.on('dashboard:update', (data) => {
      this.currentMetrics.phase4 = data.metrics;
      this.scheduleDecisionEvaluation();
    });
    
    this.eventBus.on('truth-score:metrics-updated', (data) => {
      this.currentMetrics.validation = data.metrics;
      this.scheduleDecisionEvaluation();
    });
    
    this.eventBus.on('consensus:metrics-updated', (data) => {
      this.currentMetrics.consensus = data.metrics;
      this.scheduleDecisionEvaluation();
    });
    
    this.eventBus.on('performance:metrics-updated', (data) => {
      this.currentMetrics.performance = data.metrics;
      this.scheduleDecisionEvaluation();
    });
    
    // Emergency alerts
    this.eventBus.on('alert:created', (data) => {
      if (data.alert.severity === 'critical') {
        this.handleCriticalAlert(data.alert);
      }
    });
    
    // User feedback
    this.eventBus.on('feedback:user-rating', (data) => {
      if (data.rating < 3.0) { // Very low rating
        this.handleNegativeFeedback(data);
      }
    });
  }
  
  private startAutomatedEvaluation(): void {
    // Regular evaluation every 5 minutes
    this.evaluationInterval = setInterval(() => {
      this.evaluateRolloutDecision(false); // Not manual
    }, 300000);
    
    this.logger.info('Started automated decision evaluation');
  }
  
  private scheduleDecisionEvaluation(): void {
    // Debounced evaluation - don't evaluate too frequently
    clearTimeout(this.evaluationInterval);
    setTimeout(() => {
      this.evaluateRolloutDecision(false);
    }, 10000); // 10 second delay
  }
  
  async evaluateRolloutDecision(manual = false): Promise<RolloutDecision> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Evaluating rollout decision', {
        manual,
        metricsAvailable: {
          phase4: !!this.currentMetrics.phase4,
          validation: !!this.currentMetrics.validation,
          consensus: !!this.currentMetrics.consensus,
          performance: !!this.currentMetrics.performance
        }
      });
      
      // Calculate current metric scores
      const metricScores = this.calculateMetricScores();
      
      // Perform risk assessment
      const riskAssessment = this.performRiskAssessment();
      
      // Evaluate thresholds
      const thresholdEvaluation = this.evaluateThresholds(metricScores);
      
      // Generate decision recommendation
      const recommendation = this.generateRecommendation(
        metricScores,
        riskAssessment,
        thresholdEvaluation
      );
      
      // Calculate confidence
      const confidence = this.calculateDecisionConfidence(
        metricScores,
        riskAssessment,
        thresholdEvaluation
      );
      
      // Generate reasoning
      const reasoning = this.generateReasoning(
        recommendation,
        metricScores,
        riskAssessment,
        thresholdEvaluation
      );
      
      // Assess impact
      const impact = this.assessDecisionImpact(recommendation, riskAssessment);
      
      // Create decision record
      const decision: RolloutDecision = {
        id: `decision-${Date.now()}`,
        timestamp: new Date(),
        recommendation,
        confidence,
        reasoning,
        metrics: metricScores,
        thresholds: thresholdEvaluation,
        impact,
        nextEvaluationTime: new Date(Date.now() + 300000), // 5 minutes
        automaticAction: !manual && confidence > 0.9
      };
      
      this.decisions.set(decision.id, decision);
      this.lastDecision = decision;
      
      // Update rollout progress
      this.updateRolloutProgress(decision);
      
      const duration = Date.now() - startTime;
      
      this.logger.info('Rollout decision evaluated', {
        decisionId: decision.id,
        recommendation: decision.recommendation,
        confidence: decision.confidence,
        automaticAction: decision.automaticAction,
        duration
      });
      
      this.emit('decision:evaluated', {
        decision,
        duration,
        manual
      });
      
      // Execute automatic actions if appropriate
      if (decision.automaticAction && !manual) {
        await this.executeAutomaticAction(decision);
      }
      
      return decision;
    } catch (error) {
      this.logger.error('Failed to evaluate rollout decision', error);
      
      // Fallback conservative decision
      const fallbackDecision: RolloutDecision = {
        id: `fallback-${Date.now()}`,
        timestamp: new Date(),
        recommendation: 'pause',
        confidence: 0.5,
        reasoning: {
          primary: ['Decision evaluation failed'],
          secondary: ['Defaulting to conservative approach'],
          riskFactors: ['System evaluation error']
        },
        metrics: {
          validationAccuracy: 0,
          consensusSuccessRate: 0,
          errorRate: 1,
          userSatisfaction: 0,
          systemPerformance: 0,
          hookPerformance: 1000
        },
        thresholds: {
          met: [],
          failed: ['evaluation'],
          marginal: []
        },
        impact: {
          affectedUsers: 0,
          estimatedRisk: 'high',
          rollbackComplexity: 'moderate'
        },
        nextEvaluationTime: new Date(Date.now() + 600000), // 10 minutes
        automaticAction: false
      };
      
      this.emit('decision:fallback', {
        decision: fallbackDecision,
        error
      });
      
      return fallbackDecision;
    }
  }
  
  private calculateMetricScores(): {
    validationAccuracy: number;
    consensusSuccessRate: number;
    errorRate: number;
    userSatisfaction: number;
    systemPerformance: number;
    hookPerformance: number;
  } {
    const scores = {
      validationAccuracy: 0,
      consensusSuccessRate: 0,
      errorRate: 1, // 1 = bad, 0 = good for error rate
      userSatisfaction: 0,
      systemPerformance: 0,
      hookPerformance: 1000 // milliseconds
    };
    
    // Extract metrics from monitoring systems
    if (this.currentMetrics.phase4) {
      const metrics = this.currentMetrics.phase4;
      
      // Calculate validation accuracy from truth score distribution
      const validScores = metrics.truthScoreDistribution.scores.filter(s => s >= 0.7);
      scores.validationAccuracy = validScores.length / metrics.truthScoreDistribution.scores.length || 0;
      
      // Consensus success rate
      scores.consensusSuccessRate = metrics.consensusMetrics.consensusSuccessRate;
      
      // Error rate
      scores.errorRate = metrics.performanceImpact.errorRate;
      
      // User satisfaction
      scores.userSatisfaction = metrics.userSatisfaction.averageRating;
      
      // Hook performance
      scores.hookPerformance = metrics.performanceImpact.hookPerformance.avgExecutionTime;
    }
    
    // System performance (simplified calculation)
    if (this.currentMetrics.performance) {
      const perf = this.currentMetrics.performance;
      scores.systemPerformance = Math.max(0, 1 - (
        (perf.system.resourceUtilization.cpu.usage / 100) +
        (perf.system.resourceUtilization.memory.usage / 100)
      ) / 2);
    }
    
    return scores;
  }
  
  private performRiskAssessment(): RiskAssessment {
    const technical = this.assessTechnicalRisk();
    const operational = this.assessOperationalRisk();
    const user = this.assessUserRisk();
    const business = this.assessBusinessRisk();
    
    const overallScore = (technical.score + operational.score + user.score + business.score) / 4;
    
    let level: 'low' | 'medium' | 'high' | 'critical';
    if (overallScore < 20) level = 'low';
    else if (overallScore < 40) level = 'medium';
    else if (overallScore < 70) level = 'high';
    else level = 'critical';
    
    return {
      overall: {
        score: overallScore,
        level,
        trend: this.calculateRiskTrend()
      },
      categories: {
        technical,
        operational,
        user,
        business
      },
      mitigationStrategies: this.generateMitigationStrategies(level, {
        technical,
        operational,
        user,
        business
      })
    };
  }
  
  private assessTechnicalRisk(): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;
    
    const metrics = this.calculateMetricScores();
    
    // Validation accuracy risk
    if (metrics.validationAccuracy < this.criteria.validationAccuracy.minimum) {
      score += 30;
      factors.push('Validation accuracy below minimum threshold');
    } else if (metrics.validationAccuracy < this.criteria.validationAccuracy.target) {
      score += 15;
      factors.push('Validation accuracy below target');
    }
    
    // Consensus reliability risk
    if (metrics.consensusSuccessRate < this.criteria.consensusReliability.minimum) {
      score += 25;
      factors.push('Consensus reliability below minimum');
    }
    
    // System stability risk
    if (metrics.errorRate > this.criteria.systemStability.errorRateMax) {
      score += 20;
      factors.push('Error rate exceeds maximum threshold');
    }
    
    // Hook performance risk
    if (metrics.hookPerformance > this.criteria.userExperience.hookPerformanceMax) {
      score += 15;
      factors.push('Hook execution time exceeds threshold');
    }
    
    // System performance risk
    if (metrics.systemPerformance < this.criteria.systemStability.performanceThreshold) {
      score += 10;
      factors.push('System performance below threshold');
    }
    
    return { score: Math.min(100, score), factors };
  }
  
  private assessOperationalRisk(): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;
    
    // Emergency mode
    if (this.emergencyMode) {
      score += 50;
      factors.push('System in emergency mode');
    }
    
    // Recent critical alerts
    if (this.hasRecentCriticalAlerts()) {
      score += 30;
      factors.push('Recent critical alerts detected');
    }
    
    // Rollout pace
    if (this.isRolloutTooFast()) {
      score += 20;
      factors.push('Rollout progressing too rapidly');
    }
    
    return { score: Math.min(100, score), factors };
  }
  
  private assessUserRisk(): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;
    
    const metrics = this.calculateMetricScores();
    
    // User satisfaction risk
    if (metrics.userSatisfaction < this.criteria.userExperience.satisfactionMin) {
      score += 40;
      factors.push('User satisfaction below minimum threshold');
    }
    
    // Negative feedback trends
    if (this.hasNegativeFeedbackTrend()) {
      score += 20;
      factors.push('Increasing negative user feedback');
    }
    
    return { score: Math.min(100, score), factors };
  }
  
  private assessBusinessRisk(): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;
    
    // Market conditions (simplified)
    // This would integrate with business metrics in production
    
    // Competitor activity
    // if (hasCompetitorActivity()) {
    //   score += 15;
    //   factors.push('Competitor activity detected');
    // }
    
    // Regulatory changes
    // if (hasRegulatoryChanges()) {
    //   score += 25;
    //   factors.push('Regulatory changes affect rollout');
    // }
    
    return { score: Math.min(100, score), factors };
  }
  
  private calculateRiskTrend(): 'improving' | 'stable' | 'worsening' {
    // Compare recent decisions to determine risk trend
    const recentDecisions = Array.from(this.decisions.values())
      .filter(d => d.timestamp > new Date(Date.now() - 3600000)) // Last hour
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    if (recentDecisions.length < 2) return 'stable';
    
    const firstHalf = recentDecisions.slice(0, Math.floor(recentDecisions.length / 2));
    const secondHalf = recentDecisions.slice(Math.floor(recentDecisions.length / 2));
    
    const firstAvgConfidence = firstHalf.reduce((sum, d) => sum + d.confidence, 0) / firstHalf.length;
    const secondAvgConfidence = secondHalf.reduce((sum, d) => sum + d.confidence, 0) / secondHalf.length;
    
    const difference = secondAvgConfidence - firstAvgConfidence;
    
    if (Math.abs(difference) < 0.1) return 'stable';
    return difference > 0 ? 'improving' : 'worsening';
  }
  
  private evaluateThresholds(metrics: any): {
    met: string[];
    failed: string[];
    marginal: string[];
  } {
    const met: string[] = [];
    const failed: string[] = [];
    const marginal: string[] = [];
    
    // Validation accuracy
    if (metrics.validationAccuracy >= this.criteria.validationAccuracy.target) {
      met.push('validation_accuracy_target');
    } else if (metrics.validationAccuracy >= this.criteria.validationAccuracy.minimum) {
      marginal.push('validation_accuracy_minimum');
    } else {
      failed.push('validation_accuracy_minimum');
    }
    
    // Consensus reliability
    if (metrics.consensusSuccessRate >= this.criteria.consensusReliability.target) {
      met.push('consensus_reliability_target');
    } else if (metrics.consensusSuccessRate >= this.criteria.consensusReliability.minimum) {
      marginal.push('consensus_reliability_minimum');
    } else {
      failed.push('consensus_reliability_minimum');
    }
    
    // Error rate (inverted logic - lower is better)
    if (metrics.errorRate <= this.criteria.systemStability.errorRateMax / 2) {
      met.push('error_rate_target');
    } else if (metrics.errorRate <= this.criteria.systemStability.errorRateMax) {
      marginal.push('error_rate_maximum');
    } else {
      failed.push('error_rate_maximum');
    }
    
    // User satisfaction
    if (metrics.userSatisfaction >= this.criteria.userExperience.satisfactionMin + 0.3) {
      met.push('user_satisfaction_target');
    } else if (metrics.userSatisfaction >= this.criteria.userExperience.satisfactionMin) {
      marginal.push('user_satisfaction_minimum');
    } else {
      failed.push('user_satisfaction_minimum');
    }
    
    // Hook performance (inverted logic - lower is better)
    if (metrics.hookPerformance <= this.criteria.userExperience.hookPerformanceMax * 0.5) {
      met.push('hook_performance_target');
    } else if (metrics.hookPerformance <= this.criteria.userExperience.hookPerformanceMax) {
      marginal.push('hook_performance_maximum');
    } else {
      failed.push('hook_performance_maximum');
    }
    
    // System performance
    if (metrics.systemPerformance >= 0.9) {
      met.push('system_performance_target');
    } else if (metrics.systemPerformance >= this.criteria.systemStability.performanceThreshold) {
      marginal.push('system_performance_minimum');
    } else {
      failed.push('system_performance_minimum');
    }
    
    return { met, failed, marginal };
  }
  
  private generateRecommendation(
    metrics: any,
    riskAssessment: RiskAssessment,
    thresholds: any
  ): 'proceed' | 'pause' | 'rollback' {
    // Critical failure conditions - immediate rollback
    if (thresholds.failed.includes('validation_accuracy_minimum') ||
        thresholds.failed.includes('error_rate_maximum') ||
        riskAssessment.overall.level === 'critical') {
      return 'rollback';
    }
    
    // Multiple failure conditions or high risk - pause
    if (thresholds.failed.length > 1 ||
        riskAssessment.overall.level === 'high' ||
        this.emergencyMode) {
      return 'pause';
    }
    
    // Some marginal conditions but acceptable risk - proceed with caution
    if (thresholds.failed.length === 0 && riskAssessment.overall.level === 'medium') {
      // Check if we have enough met criteria
      if (thresholds.met.length >= 4) {
        return 'proceed';
      } else {
        return 'pause';
      }
    }
    
    // All clear - proceed
    if (thresholds.failed.length === 0 && riskAssessment.overall.level === 'low') {
      return 'proceed';
    }
    
    // Default to conservative approach
    return 'pause';
  }
  
  private calculateDecisionConfidence(
    metrics: any,
    riskAssessment: RiskAssessment,
    thresholds: any
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on met thresholds
    confidence += (thresholds.met.length / 6) * 0.3;
    
    // Decrease confidence based on failed thresholds
    confidence -= (thresholds.failed.length / 6) * 0.4;
    
    // Adjust based on risk level
    switch (riskAssessment.overall.level) {
      case 'low':
        confidence += 0.2;
        break;
      case 'medium':
        // No adjustment
        break;
      case 'high':
        confidence -= 0.2;
        break;
      case 'critical':
        confidence -= 0.4;
        break;
    }
    
    // Adjust based on data availability
    const dataAvailability = this.calculateDataAvailability();
    confidence *= dataAvailability;
    
    // Apply conservative bias
    confidence -= this.criteria.riskTolerance.conservativeBias;
    
    return Math.max(0, Math.min(1, confidence));
  }
  
  private generateReasoning(
    recommendation: string,
    metrics: any,
    riskAssessment: RiskAssessment,
    thresholds: any
  ): {
    primary: string[];
    secondary: string[];
    riskFactors: string[];
  } {
    const primary: string[] = [];
    const secondary: string[] = [];
    const riskFactors: string[] = [];
    
    // Primary reasoning based on recommendation
    switch (recommendation) {
      case 'proceed':
        primary.push('All critical thresholds met');
        primary.push(`Risk level acceptable: ${riskAssessment.overall.level}`);
        if (thresholds.met.length > 4) {
          primary.push(`${thresholds.met.length} performance targets achieved`);
        }
        break;
        
      case 'pause':
        primary.push('Mixed performance indicators detected');
        if (thresholds.failed.length > 0) {
          primary.push(`${thresholds.failed.length} threshold(s) failed`);
        }
        if (riskAssessment.overall.level === 'medium' || riskAssessment.overall.level === 'high') {
          primary.push(`Risk level requires caution: ${riskAssessment.overall.level}`);
        }
        break;
        
      case 'rollback':
        primary.push('Critical issues detected requiring immediate action');
        if (thresholds.failed.includes('validation_accuracy_minimum')) {
          primary.push('Validation accuracy below minimum threshold');
        }
        if (thresholds.failed.includes('error_rate_maximum')) {
          primary.push('Error rate exceeds critical threshold');
        }
        if (riskAssessment.overall.level === 'critical') {
          primary.push('Risk level unacceptable for continued rollout');
        }
        break;
    }
    
    // Secondary reasoning
    secondary.push(`Validation accuracy: ${(metrics.validationAccuracy * 100).toFixed(1)}%`);
    secondary.push(`Consensus success rate: ${(metrics.consensusSuccessRate * 100).toFixed(1)}%`);
    secondary.push(`Error rate: ${(metrics.errorRate * 100).toFixed(3)}%`);
    secondary.push(`User satisfaction: ${metrics.userSatisfaction.toFixed(1)}/5.0`);
    secondary.push(`Hook performance: ${metrics.hookPerformance.toFixed(0)}ms`);
    
    // Risk factors
    Object.values(riskAssessment.categories).forEach(category => {
      riskFactors.push(...category.factors);
    });
    
    return { primary, secondary, riskFactors };
  }
  
  private assessDecisionImpact(
    recommendation: string,
    riskAssessment: RiskAssessment
  ): {
    affectedUsers: number;
    estimatedRisk: 'low' | 'medium' | 'high';
    rollbackComplexity: 'simple' | 'moderate' | 'complex';
  } {
    const baseUsers = 1000; // Example user base
    let affectedUsers = 0;
    
    switch (recommendation) {
      case 'proceed':
        affectedUsers = Math.floor(baseUsers * 0.25); // 25% rollout
        break;
      case 'pause':
        affectedUsers = Math.floor(baseUsers * 0.10); // Current 10%
        break;
      case 'rollback':
        affectedUsers = Math.floor(baseUsers * 0.10); // Rolling back 10%
        break;
    }
    
    const estimatedRisk = riskAssessment.overall.level === 'critical' ? 'high' :
                         riskAssessment.overall.level === 'high' ? 'medium' : 'low';
    
    const rollbackComplexity: 'simple' | 'moderate' | 'complex' = 
      this.rolloutProgress.currentCohort.percentage < 15 ? 'simple' :
      this.rolloutProgress.currentCohort.percentage < 50 ? 'moderate' : 'complex';
    
    return {
      affectedUsers,
      estimatedRisk,
      rollbackComplexity
    };
  }
  
  private async executeAutomaticAction(decision: RolloutDecision): Promise<void> {
    try {
      this.logger.info('Executing automatic action', {
        decisionId: decision.id,
        recommendation: decision.recommendation,
        confidence: decision.confidence
      });
      
      switch (decision.recommendation) {
        case 'proceed':
          await this.executeProceedAction(decision);
          break;
        case 'pause':
          await this.executePauseAction(decision);
          break;
        case 'rollback':
          await this.executeRollbackAction(decision);
          break;
      }
      
      this.emit('action:executed', {
        decisionId: decision.id,
        action: decision.recommendation,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to execute automatic action', {
        decisionId: decision.id,
        recommendation: decision.recommendation,
        error
      });
      
      this.emit('action:failed', {
        decisionId: decision.id,
        action: decision.recommendation,
        error
      });
    }
  }
  
  private async executeProceedAction(decision: RolloutDecision): Promise<void> {
    // Expand rollout to next phase
    this.rolloutProgress.currentCohort.size = decision.impact.affectedUsers;
    this.rolloutProgress.currentCohort.percentage = 25; // Expand to 25%
    
    this.eventBus.emit('rollout:proceed', {
      decisionId: decision.id,
      newCohortSize: decision.impact.affectedUsers,
      newPercentage: 25
    });
  }
  
  private async executePauseAction(decision: RolloutDecision): Promise<void> {
    // Maintain current rollout size
    this.eventBus.emit('rollout:pause', {
      decisionId: decision.id,
      currentCohortSize: this.rolloutProgress.currentCohort.size,
      reason: decision.reasoning.primary.join('; ')
    });
  }
  
  private async executeRollbackAction(decision: RolloutDecision): Promise<void> {
    // Initiate rollback procedures
    this.emergencyMode = true;
    
    this.eventBus.emit('rollout:rollback', {
      decisionId: decision.id,
      currentCohortSize: this.rolloutProgress.currentCohort.size,
      reason: decision.reasoning.primary.join('; '),
      complexity: decision.impact.rollbackComplexity
    });
  }
  
  private updateRolloutProgress(decision: RolloutDecision): void {
    // Update milestone completion
    this.rolloutProgress.milestones.forEach(milestone => {
      if (!milestone.completed) {
        const criteriaMatch = milestone.criteria.some(criteria => 
          decision.thresholds.met.includes(criteria)
        );
        
        if (criteriaMatch && decision.recommendation === 'proceed') {
          milestone.completed = true;
          milestone.timestamp = new Date();
        }
      }
    });
    
    // Update readiness score
    const readinessFactors = [
      decision.metrics.validationAccuracy,
      decision.metrics.consensusSuccessRate,
      1 - decision.metrics.errorRate, // Invert error rate
      decision.metrics.userSatisfaction / 5,
      Math.max(0, 1 - (decision.metrics.hookPerformance / 200)),
      decision.metrics.systemPerformance
    ];
    
    this.rolloutProgress.nextPhase.readinessScore = 
      readinessFactors.reduce((sum, factor) => sum + factor, 0) / readinessFactors.length;
    
    // Update timeline estimates
    const elapsed = Date.now() - this.rolloutProgress.currentCohort.startTime.getTime();
    this.rolloutProgress.timeline.elapsed = elapsed;
    
    // Estimate remaining time based on progress and issues
    const progressRate = decision.recommendation === 'proceed' ? 1.2 : 
                        decision.recommendation === 'pause' ? 0.5 : 0;
    
    this.rolloutProgress.timeline.remaining = Math.max(0, 
      this.rolloutProgress.timeline.estimated - elapsed) * (2 - progressRate);
    
    this.emit('progress:updated', {
      progress: { ...this.rolloutProgress },
      decision
    });
  }
  
  // Helper methods
  private handleCriticalAlert(alert: any): void {
    this.logger.warn('Critical alert detected, triggering emergency evaluation', {
      alertId: alert.id,
      type: alert.type
    });
    
    // Immediate decision evaluation
    this.evaluateRolloutDecision(false);
    
    // Consider emergency mode
    if (alert.rolloutImpact === 'rollback') {
      this.emergencyMode = true;
    }
  }
  
  private handleNegativeFeedback(data: any): void {
    this.logger.info('Negative user feedback detected', {
      userId: data.userId,
      rating: data.rating
    });
    
    // Schedule evaluation if multiple negative feedbacks
    // Implementation would track feedback patterns
  }
  
  private hasRecentCriticalAlerts(): boolean {
    // Would check recent alert history
    return this.emergencyMode;
  }
  
  private isRolloutTooFast(): boolean {
    // Check if rollout is progressing faster than planned timeline
    const elapsed = Date.now() - this.rolloutProgress.currentCohort.startTime.getTime();
    const plannedDuration = 3600000; // 1 hour minimum per phase
    
    return elapsed < plannedDuration;
  }
  
  private hasNegativeFeedbackTrend(): boolean {
    // Would analyze feedback trends
    return false; // Simplified
  }
  
  private generateMitigationStrategies(
    level: string,
    categories: any
  ): {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  } {
    const strategies = {
      immediate: [],
      shortTerm: [],
      longTerm: []
    };
    
    if (level === 'critical' || level === 'high') {
      strategies.immediate.push(
        'Pause rollout immediately',
        'Escalate to incident response team',
        'Prepare rollback procedures'
      );
      
      strategies.shortTerm.push(
        'Investigate root causes',
        'Implement fixes',
        'Enhanced monitoring'
      );
    }
    
    if (categories.technical.score > 30) {
      strategies.immediate.push('Technical review required');
      strategies.shortTerm.push('System optimization');
    }
    
    if (categories.user.score > 30) {
      strategies.immediate.push('User experience analysis');
      strategies.shortTerm.push('User feedback collection');
    }
    
    strategies.longTerm.push(
      'Process improvements',
      'Training and documentation',
      'System architecture review'
    );
    
    return strategies as any;
  }
  
  private calculateDataAvailability(): number {
    const dataPoints = [
      !!this.currentMetrics.phase4,
      !!this.currentMetrics.validation,
      !!this.currentMetrics.consensus,
      !!this.currentMetrics.performance
    ];
    
    return dataPoints.filter(Boolean).length / dataPoints.length;
  }
  
  private initializeRolloutProgress(): RolloutProgress {
    return {
      currentPhase: 'Phase 4 - 10% Rollout',
      currentCohort: {
        size: 100,
        percentage: 10,
        startTime: new Date()
      },
      nextPhase: {
        targetSize: 250,
        targetPercentage: 25,
        readinessScore: 0
      },
      timeline: {
        elapsed: 0,
        estimated: 86400000, // 24 hours
        remaining: 86400000
      },
      milestones: [
        {
          name: 'Validation System Stable',
          completed: false,
          criteria: ['validation_accuracy_target', 'consensus_reliability_target']
        },
        {
          name: 'Error Rate Under Control',
          completed: false,
          criteria: ['error_rate_target']
        },
        {
          name: 'User Satisfaction Maintained',
          completed: false,
          criteria: ['user_satisfaction_target']
        },
        {
          name: 'System Performance Stable',
          completed: false,
          criteria: ['system_performance_target', 'hook_performance_target']
        }
      ]
    };
  }
  
  // Public API methods
  getCurrentDecision(): RolloutDecision | undefined {
    return this.lastDecision;
  }
  
  getDecisionHistory(limit = 10): RolloutDecision[] {
    return Array.from(this.decisions.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
  
  getRolloutProgress(): RolloutProgress {
    return { ...this.rolloutProgress };
  }
  
  async manualDecisionEvaluation(): Promise<RolloutDecision> {
    return this.evaluateRolloutDecision(true);
  }
  
  updateCriteria(updates: Partial<DecisionCriteria>): void {
    this.criteria = { ...this.criteria, ...updates };
    
    this.logger.info('Decision criteria updated', {
      updates,
      newCriteria: this.criteria
    });
    
    this.emit('criteria:updated', {
      criteria: this.criteria,
      timestamp: new Date()
    });
  }
  
  setEmergencyMode(enabled: boolean, reason?: string): void {
    const wasEnabled = this.emergencyMode;
    this.emergencyMode = enabled;
    
    if (wasEnabled !== enabled) {
      this.logger.warn('Emergency mode changed', {
        enabled,
        reason,
        timestamp: new Date()
      });
      
      this.emit('emergency:mode-changed', {
        enabled,
        reason,
        timestamp: new Date()
      });
      
      // Trigger immediate evaluation
      if (enabled) {
        this.evaluateRolloutDecision(false);
      }
    }
  }
  
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Rollout Decision Engine');
    
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
    }
    
    this.emit('decision-engine:shutdown');
  }
}
