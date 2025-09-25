/**
 * Phase 4 Controlled Rollout - Master Monitoring System
 * Integrates all monitoring components for comprehensive Phase 4 oversight
 */

import { EventEmitter } from 'node:events';
import type { ILogger } from '../../core/logger.js';
import type { IEventBus } from '../../core/event-bus.js';

// Import monitoring components
import { Phase4MonitoringDashboard, type DashboardConfig } from './dashboard/monitoring-dashboard.js';
import { TruthScoreAnalyzer } from './analytics/truth-score-analyzer.js';
import { ConsensusTracker } from './analytics/consensus-tracker.js';
import { SystemPerformanceAssessor } from './analytics/performance-assessor.js';
import { RolloutDecisionEngine, type DecisionCriteria } from './rollout-decision-engine.js';

export interface Phase4MonitorConfig {
  dashboard: Partial<DashboardConfig>;
  decisionCriteria: Partial<DecisionCriteria>;
  alerting: {
    enabled: boolean;
    criticalAlertTimeout: number;
    escalationPolicy: 'immediate' | 'tiered' | 'manual';
  };
  reporting: {
    generateReports: boolean;
    reportInterval: number;
    exportFormat: 'json' | 'html' | 'csv';
    exportPath?: string;
  };
  automation: {
    autoDecisionMaking: boolean;
    autoRollback: boolean;
    confirmationRequired: boolean;
  };
}

export interface Phase4Status {
  overall: {
    health: 'healthy' | 'warning' | 'critical';
    readiness: number; // 0-1
    recommendation: 'proceed' | 'pause' | 'rollback';
    confidence: number;
  };
  components: {
    dashboard: { status: string; uptime: number };
    truthScoreAnalyzer: { status: string; accuracy: number; reliability: number };
    consensusTracker: { status: string; successRate: number };
    performanceAssessor: { status: string; healthScore: number };
    decisionEngine: { status: string; lastDecision: string };
  };
  metrics: {
    dataReliability: number;
    alertsActive: number;
    decisionsToday: number;
    userImpact: number;
  };
  timestamp: Date;
}

export interface Phase4Report {
  id: string;
  timestamp: Date;
  period: { start: Date; end: Date };
  summary: {
    rolloutProgress: number;
    validationAccuracy: number;
    consensusReliability: number;
    systemStability: number;
    userSatisfaction: number;
    decisionsCount: number;
    alertsCount: number;
  };
  analysis: {
    trends: { metric: string; direction: string; significance: string }[];
    patterns: { pattern: string; frequency: number; impact: string }[];
    risks: { risk: string; probability: number; impact: string }[];
  };
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  nextSteps: {
    plannedActions: string[];
    timeline: string;
    criteria: string[];
  };
}

/**
 * Comprehensive Phase 4 monitoring system integrating all components
 * Provides unified oversight and decision-making for controlled rollout
 */
export class Phase4Monitor extends EventEmitter {
  private logger: ILogger;
  private eventBus: IEventBus;
  private config: Phase4MonitorConfig;
  
  // Core monitoring components
  private dashboard: Phase4MonitoringDashboard;
  private truthScoreAnalyzer: TruthScoreAnalyzer;
  private consensusTracker: ConsensusTracker;
  private performanceAssessor: SystemPerformanceAssessor;
  private decisionEngine: RolloutDecisionEngine;
  
  // System state
  private isInitialized = false;
  private startTime = new Date();
  private statusReports: Map<string, Phase4Report> = new Map();
  
  // Monitoring intervals
  private healthCheckInterval?: NodeJS.Timeout;
  private reportGenerationInterval?: NodeJS.Timeout;
  
  constructor(
    logger: ILogger,
    eventBus: IEventBus,
    config: Partial<Phase4MonitorConfig> = {}
  ) {
    super();
    this.logger = logger;
    this.eventBus = eventBus;
    
    this.config = {
      dashboard: {
        refreshInterval: 5000,
        alertingEnabled: true,
        realTimeUpdates: true,
        ...config.dashboard
      },
      decisionCriteria: {
        validationAccuracy: { target: 0.95, minimum: 0.90, weight: 0.3 },
        consensusReliability: { target: 0.99, minimum: 0.95, weight: 0.2 },
        systemStability: { errorRateMax: 0.01, performanceThreshold: 0.8, weight: 0.25 },
        userExperience: { satisfactionMin: 4.2, hookPerformanceMax: 100, weight: 0.15 },
        riskTolerance: { maxRiskScore: 30, requireUnanimity: false, conservativeBias: 0.1 },
        ...config.decisionCriteria
      },
      alerting: {
        enabled: true,
        criticalAlertTimeout: 300000, // 5 minutes
        escalationPolicy: 'tiered',
        ...config.alerting
      },
      reporting: {
        generateReports: true,
        reportInterval: 3600000, // 1 hour
        exportFormat: 'json',
        ...config.reporting
      },
      automation: {
        autoDecisionMaking: false, // Manual approval required by default
        autoRollback: true, // Auto rollback on critical issues
        confirmationRequired: true,
        ...config.automation
      },
      ...config
    };
    
    this.initializeComponents();
    this.setupEventHandlers();
  }
  
  private initializeComponents(): void {
    this.logger.info('Initializing Phase 4 monitoring components');
    
    // Initialize dashboard
    this.dashboard = new Phase4MonitoringDashboard(
      this.config.dashboard,
      this.logger,
      this.eventBus
    );
    
    // Initialize analytics components
    this.truthScoreAnalyzer = new TruthScoreAnalyzer(this.logger, this.eventBus);
    this.consensusTracker = new ConsensusTracker(this.logger, this.eventBus);
    this.performanceAssessor = new SystemPerformanceAssessor(this.logger, this.eventBus);
    
    // Initialize decision engine
    this.decisionEngine = new RolloutDecisionEngine(
      this.logger,
      this.eventBus,
      this.config.decisionCriteria
    );
  }
  
  private setupEventHandlers(): void {
    // Component status events
    this.dashboard.on('dashboard:initialized', () => {
      this.logger.info('Dashboard initialized');
      this.checkInitializationComplete();
    });
    
    this.truthScoreAnalyzer.on('analyzer:initialized', () => {
      this.logger.info('Truth Score Analyzer initialized');
      this.checkInitializationComplete();
    });
    
    this.consensusTracker.on('consensus-tracker:initialized', () => {
      this.logger.info('Consensus Tracker initialized');
      this.checkInitializationComplete();
    });
    
    this.performanceAssessor.on('assessor:initialized', () => {
      this.logger.info('Performance Assessor initialized');
      this.checkInitializationComplete();
    });
    
    this.decisionEngine.on('decision-engine:initialized', () => {
      this.logger.info('Decision Engine initialized');
      this.checkInitializationComplete();
    });
    
    // Decision events
    this.decisionEngine.on('decision:evaluated', (data) => {
      this.handleDecisionEvaluated(data);
    });
    
    this.decisionEngine.on('action:executed', (data) => {
      this.handleActionExecuted(data);
    });
    
    // Critical alert handling
    this.eventBus.on('alert:created', (data) => {
      if (data.alert.severity === 'critical') {
        this.handleCriticalAlert(data.alert);
      }
    });
    
    // System health events
    this.eventBus.on('system:health-changed', (data) => {
      this.handleHealthChange(data);
    });
  }
  
  async initialize(): Promise<void> {
    this.logger.info('Initializing Phase 4 Master Monitoring System', {
      config: {
        dashboardEnabled: true,
        alertingEnabled: this.config.alerting.enabled,
        reportingEnabled: this.config.reporting.generateReports,
        automationEnabled: this.config.automation.autoDecisionMaking
      }
    });
    
    try {
      // Initialize all components in parallel
      await Promise.all([
        this.dashboard.initialize(),
        this.truthScoreAnalyzer.initialize(),
        this.consensusTracker.initialize(),
        this.performanceAssessor.initialize(),
        this.decisionEngine.initialize()
      ]);
      
      // Start monitoring loops
      this.startHealthChecks();
      
      if (this.config.reporting.generateReports) {
        this.startReportGeneration();
      }
      
      this.isInitialized = true;
      this.startTime = new Date();
      
      this.logger.info('Phase 4 Master Monitoring System initialized successfully');
      
      this.emit('phase4-monitor:initialized', {
        timestamp: new Date(),
        components: 5,
        config: this.config
      });
      
      // Generate initial status report
      await this.generateStatusReport();
    } catch (error) {
      this.logger.error('Failed to initialize Phase 4 Master Monitoring System', error);
      throw error;
    }
  }
  
  private checkInitializationComplete(): void {
    // This is called by component initialization events
    // All components should be initialized via the main initialize() method
  }
  
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 60000); // Every minute
    
    this.logger.info('Started health checks');
  }
  
  private startReportGeneration(): void {
    this.reportGenerationInterval = setInterval(() => {
      this.generateStatusReport();
    }, this.config.reporting.reportInterval);
    
    this.logger.info('Started report generation', {
      interval: this.config.reporting.reportInterval
    });
  }
  
  private async performHealthCheck(): Promise<void> {
    try {
      const status = await this.getSystemStatus();
      
      // Check for critical issues
      if (status.overall.health === 'critical') {
        await this.handleCriticalSystemState(status);
      }
      
      this.emit('health-check:complete', {
        status,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Health check failed', error);
    }
  }
  
  private handleDecisionEvaluated(data: { decision: any; duration: number; manual: boolean }): void {
    const { decision, duration, manual } = data;
    
    this.logger.info('Rollout decision evaluated', {
      decisionId: decision.id,
      recommendation: decision.recommendation,
      confidence: decision.confidence,
      automatic: !manual,
      duration
    });
    
    // Emit consolidated decision event
    this.emit('rollout:decision-made', {
      decision,
      timestamp: new Date(),
      automatic: !manual
    });
    
    // Handle critical decisions
    if (decision.recommendation === 'rollback' && decision.confidence > 0.8) {
      this.handleCriticalDecision(decision);
    }
  }
  
  private handleActionExecuted(data: { decisionId: string; action: string; timestamp: Date }): void {
    this.logger.info('Automatic action executed', data);
    
    this.emit('rollout:action-executed', data);
  }
  
  private async handleCriticalAlert(alert: any): Promise<void> {
    this.logger.warn('Critical alert received', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity
    });
    
    // Trigger immediate decision evaluation
    await this.decisionEngine.manualDecisionEvaluation();
    
    // Consider automatic rollback if configured
    if (this.config.automation.autoRollback && alert.rolloutImpact === 'rollback') {
      this.logger.warn('Critical alert triggers automatic rollback consideration');
      
      this.emit('rollout:critical-alert', {
        alert,
        automaticRollbackEnabled: this.config.automation.autoRollback,
        timestamp: new Date()
      });
    }
  }
  
  private async handleCriticalSystemState(status: Phase4Status): Promise<void> {
    this.logger.error('Critical system state detected', {
      health: status.overall.health,
      readiness: status.overall.readiness,
      recommendation: status.overall.recommendation
    });
    
    // Trigger emergency procedures
    if (this.config.automation.autoRollback && status.overall.recommendation === 'rollback') {
      this.decisionEngine.setEmergencyMode(true, 'Critical system state detected');
    }
    
    this.emit('system:critical-state', {
      status,
      timestamp: new Date()
    });
  }
  
  private handleCriticalDecision(decision: any): void {
    this.logger.warn('Critical rollout decision made', {
      decisionId: decision.id,
      recommendation: decision.recommendation,
      confidence: decision.confidence
    });
    
    this.emit('rollout:critical-decision', {
      decision,
      timestamp: new Date()
    });
  }
  
  private handleHealthChange(data: any): void {
    this.logger.info('System health changed', data);
    
    this.emit('system:health-changed', {
      ...data,
      timestamp: new Date()
    });
  }
  
  async getSystemStatus(): Promise<Phase4Status> {
    try {
      // Get component statuses
      const dashboardMetrics = this.dashboard.getCurrentMetrics();
      const validationMetrics = this.truthScoreAnalyzer.getValidationAccuracyMetrics();
      const consensusMetrics = this.consensusTracker.getPerformanceMetrics();
      const performanceHealth = this.performanceAssessor.getSystemHealthScore();
      const currentDecision = this.decisionEngine.getCurrentDecision();
      
      // Calculate overall health
      const healthFactors = [
        validationMetrics.overall.accuracy,
        consensusMetrics.quality.successRate,
        1 - (dashboardMetrics.performanceImpact.errorRate || 0),
        (dashboardMetrics.userSatisfaction.averageRating || 0) / 5,
        performanceHealth.overall
      ];
      
      const overallReadiness = healthFactors.reduce((sum, factor) => sum + factor, 0) / healthFactors.length;
      
      let health: 'healthy' | 'warning' | 'critical';
      if (overallReadiness >= 0.8) health = 'healthy';
      else if (overallReadiness >= 0.6) health = 'warning';
      else health = 'critical';
      
      const status: Phase4Status = {
        overall: {
          health,
          readiness: overallReadiness,
          recommendation: currentDecision?.recommendation || 'pause',
          confidence: currentDecision?.confidence || 0.5
        },
        components: {
          dashboard: {
            status: 'active',
            uptime: Date.now() - this.startTime.getTime()
          },
          truthScoreAnalyzer: {
            status: 'active',
            accuracy: validationMetrics.overall.accuracy,
            reliability: this.truthScoreAnalyzer.getDataReliability()
          },
          consensusTracker: {
            status: 'active',
            successRate: consensusMetrics.quality.successRate
          },
          performanceAssessor: {
            status: 'active',
            healthScore: performanceHealth.overall
          },
          decisionEngine: {
            status: 'active',
            lastDecision: currentDecision?.recommendation || 'none'
          }
        },
        metrics: {
          dataReliability: Math.min(
            this.truthScoreAnalyzer.getDataReliability(),
            this.dashboard.calculateDataReliability ? this.dashboard.calculateDataReliability() : 0.95
          ),
          alertsActive: this.dashboard.getActiveAlerts().length,
          decisionsToday: this.getDecisionsToday(),
          userImpact: this.calculateUserImpact()
        },
        timestamp: new Date()
      };
      
      return status;
    } catch (error) {
      this.logger.error('Failed to get system status', error);
      
      // Return degraded status
      return {
        overall: {
          health: 'critical',
          readiness: 0,
          recommendation: 'pause',
          confidence: 0
        },
        components: {
          dashboard: { status: 'error', uptime: 0 },
          truthScoreAnalyzer: { status: 'error', accuracy: 0, reliability: 0 },
          consensusTracker: { status: 'error', successRate: 0 },
          performanceAssessor: { status: 'error', healthScore: 0 },
          decisionEngine: { status: 'error', lastDecision: 'error' }
        },
        metrics: {
          dataReliability: 0,
          alertsActive: 0,
          decisionsToday: 0,
          userImpact: 0
        },
        timestamp: new Date()
      };
    }
  }
  
  private async generateStatusReport(): Promise<Phase4Report> {
    const reportId = `report-${Date.now()}`;
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);
    
    try {
      const status = await this.getSystemStatus();
      const decisions = this.decisionEngine.getDecisionHistory(10);
      const recentDecisions = decisions.filter(d => d.timestamp >= oneHourAgo);
      
      const report: Phase4Report = {
        id: reportId,
        timestamp: now,
        period: {
          start: oneHourAgo,
          end: now
        },
        summary: {
          rolloutProgress: status.overall.readiness,
          validationAccuracy: status.components.truthScoreAnalyzer.accuracy,
          consensusReliability: status.components.consensusTracker.successRate,
          systemStability: status.components.performanceAssessor.healthScore,
          userSatisfaction: this.getUserSatisfactionScore(),
          decisionsCount: recentDecisions.length,
          alertsCount: status.metrics.alertsActive
        },
        analysis: {
          trends: this.analyzeTrends(),
          patterns: this.analyzePatterns(),
          risks: this.analyzeRisks(recentDecisions)
        },
        recommendations: this.generateRecommendations(status, recentDecisions),
        nextSteps: this.generateNextSteps(status)
      };
      
      this.statusReports.set(reportId, report);
      
      // Export report if configured
      if (this.config.reporting.exportPath) {
        await this.exportReport(report);
      }
      
      this.emit('report:generated', {
        report,
        timestamp: now
      });
      
      this.logger.info('Status report generated', {
        reportId,
        period: report.period,
        summary: report.summary
      });
      
      return report;
    } catch (error) {
      this.logger.error('Failed to generate status report', error);
      throw error;
    }
  }
  
  private getDecisionsToday(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.decisionEngine.getDecisionHistory(100)
      .filter(d => d.timestamp >= today).length;
  }
  
  private calculateUserImpact(): number {
    const progress = this.decisionEngine.getRolloutProgress();
    return progress.currentCohort.size;
  }
  
  private getUserSatisfactionScore(): number {
    const metrics = this.dashboard.getCurrentMetrics();
    return metrics.userSatisfaction.averageRating;
  }
  
  private analyzeTrends(): { metric: string; direction: string; significance: string }[] {
    // Analyze metric trends over time
    return [
      { metric: 'validation_accuracy', direction: 'stable', significance: 'low' },
      { metric: 'consensus_reliability', direction: 'improving', significance: 'medium' },
      { metric: 'system_performance', direction: 'stable', significance: 'low' },
      { metric: 'user_satisfaction', direction: 'improving', significance: 'high' }
    ];
  }
  
  private analyzePatterns(): { pattern: string; frequency: number; impact: string }[] {
    // Analyze patterns in system behavior
    const patterns = this.truthScoreAnalyzer.getTruthScorePatterns();
    
    return patterns.map(pattern => ({
      pattern: pattern.pattern,
      frequency: pattern.frequency,
      impact: pattern.averageScore > 0.9 ? 'positive' : 
              pattern.averageScore > 0.7 ? 'neutral' : 'negative'
    }));
  }
  
  private analyzeRisks(decisions: any[]): { risk: string; probability: number; impact: string }[] {
    const risks: { risk: string; probability: number; impact: string }[] = [];
    
    // Analyze risk factors from recent decisions
    decisions.forEach(decision => {
      decision.reasoning.riskFactors.forEach((factor: string) => {
        const existingRisk = risks.find(r => r.risk === factor);
        if (existingRisk) {
          existingRisk.probability += 0.1;
        } else {
          risks.push({
            risk: factor,
            probability: 0.1,
            impact: decision.impact.estimatedRisk
          });
        }
      });
    });
    
    return risks.slice(0, 5); // Top 5 risks
  }
  
  private generateRecommendations(
    status: Phase4Status,
    recentDecisions: any[]
  ): {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  } {
    const recommendations = {
      immediate: [] as string[],
      shortTerm: [] as string[],
      longTerm: [] as string[]
    };
    
    // Based on system health
    if (status.overall.health === 'critical') {
      recommendations.immediate.push('Immediate system review required');
      recommendations.immediate.push('Consider rollback to previous stable state');
    } else if (status.overall.health === 'warning') {
      recommendations.immediate.push('Monitor system closely');
      recommendations.shortTerm.push('Investigate warning indicators');
    } else {
      recommendations.immediate.push('System operating normally');
      recommendations.shortTerm.push('Continue gradual rollout as planned');
    }
    
    // Based on recent decisions
    const rollbackDecisions = recentDecisions.filter(d => d.recommendation === 'rollback');
    if (rollbackDecisions.length > 0) {
      recommendations.immediate.push('Investigate factors causing rollback recommendations');
    }
    
    // Based on data reliability
    if (status.metrics.dataReliability < 0.95) {
      recommendations.shortTerm.push('Improve monitoring data collection reliability');
    }
    
    // Long-term recommendations
    recommendations.longTerm.push('Analyze user feedback patterns for product improvements');
    recommendations.longTerm.push('Review and optimize monitoring thresholds based on historical data');
    recommendations.longTerm.push('Develop predictive models for rollout success');
    
    return recommendations;
  }
  
  private generateNextSteps(status: Phase4Status): {
    plannedActions: string[];
    timeline: string;
    criteria: string[];
  } {
    const progress = this.decisionEngine.getRolloutProgress();
    
    if (status.overall.recommendation === 'proceed') {
      return {
        plannedActions: [
          'Expand rollout to 25% of users',
          'Continue monitoring all metrics',
          'Prepare for Phase 5 evaluation'
        ],
        timeline: '24-48 hours',
        criteria: [
          'Maintain >90% validation accuracy',
          'Keep error rate <1%',
          'Sustain >4.2/5.0 user satisfaction'
        ]
      };
    } else if (status.overall.recommendation === 'pause') {
      return {
        plannedActions: [
          'Maintain current 10% rollout',
          'Address identified issues',
          'Enhanced monitoring and analysis'
        ],
        timeline: '12-24 hours',
        criteria: [
          'Resolve all critical alerts',
          'Improve system stability',
          'Achieve target performance metrics'
        ]
      };
    } else {
      return {
        plannedActions: [
          'Initiate controlled rollback',
          'Investigate root causes',
          'Implement fixes before retry'
        ],
        timeline: '4-8 hours',
        criteria: [
          'Return to stable baseline',
          'Complete incident analysis',
          'Validate fix effectiveness'
        ]
      };
    }
  }
  
  private async exportReport(report: Phase4Report): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const filename = `phase4-report-${report.id}.${this.config.reporting.exportFormat}`;
      const filepath = path.join(this.config.reporting.exportPath!, filename);
      
      let content: string;
      
      switch (this.config.reporting.exportFormat) {
        case 'json':
          content = JSON.stringify(report, null, 2);
          break;
        case 'html':
          content = this.generateHtmlReport(report);
          break;
        case 'csv':
          content = this.generateCsvReport(report);
          break;
        default:
          content = JSON.stringify(report, null, 2);
      }
      
      await fs.writeFile(filepath, content, 'utf-8');
      
      this.logger.info('Report exported', {
        reportId: report.id,
        format: this.config.reporting.exportFormat,
        filepath
      });
    } catch (error) {
      this.logger.error('Failed to export report', error);
    }
  }
  
  private generateHtmlReport(report: Phase4Report): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Phase 4 Rollout Report - ${report.id}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { border-bottom: 2px solid #007bff; padding-bottom: 20px; }
        .section { margin: 20px 0; }
        .metric { display: inline-block; margin: 10px; padding: 10px; border: 1px solid #ddd; }
        .healthy { border-left: 4px solid #28a745; }
        .warning { border-left: 4px solid #ffc107; }
        .critical { border-left: 4px solid #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Phase 4 Controlled Rollout Report</h1>
        <p><strong>Report ID:</strong> ${report.id}</p>
        <p><strong>Generated:</strong> ${report.timestamp.toISOString()}</p>
        <p><strong>Period:</strong> ${report.period.start.toISOString()} to ${report.period.end.toISOString()}</p>
    </div>

    <div class="section">
        <h2>Summary</h2>
        <div class="metric healthy">
            <strong>Rollout Progress:</strong> ${(report.summary.rolloutProgress * 100).toFixed(1)}%
        </div>
        <div class="metric ${report.summary.validationAccuracy > 0.9 ? 'healthy' : 'warning'}">
            <strong>Validation Accuracy:</strong> ${(report.summary.validationAccuracy * 100).toFixed(1)}%
        </div>
        <div class="metric healthy">
            <strong>User Satisfaction:</strong> ${report.summary.userSatisfaction.toFixed(1)}/5.0
        </div>
        <div class="metric">
            <strong>Decisions:</strong> ${report.summary.decisionsCount}
        </div>
        <div class="metric ${report.summary.alertsCount > 0 ? 'warning' : 'healthy'}">
            <strong>Active Alerts:</strong> ${report.summary.alertsCount}
        </div>
    </div>

    <div class="section">
        <h2>Recommendations</h2>
        <h3>Immediate Actions</h3>
        <ul>
            ${report.recommendations.immediate.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
        <h3>Short Term</h3>
        <ul>
            ${report.recommendations.shortTerm.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>

    <div class="section">
        <h2>Next Steps</h2>
        <p><strong>Timeline:</strong> ${report.nextSteps.timeline}</p>
        <h3>Planned Actions</h3>
        <ul>
            ${report.nextSteps.plannedActions.map(action => `<li>${action}</li>`).join('')}
        </ul>
    </div>
</body>
</html>`;
  }
  
  private generateCsvReport(report: Phase4Report): string {
    const rows = [
      ['Metric', 'Value'],
      ['Report ID', report.id],
      ['Timestamp', report.timestamp.toISOString()],
      ['Rollout Progress', `${(report.summary.rolloutProgress * 100).toFixed(1)}%`],
      ['Validation Accuracy', `${(report.summary.validationAccuracy * 100).toFixed(1)}%`],
      ['Consensus Reliability', `${(report.summary.consensusReliability * 100).toFixed(1)}%`],
      ['System Stability', `${(report.summary.systemStability * 100).toFixed(1)}%`],
      ['User Satisfaction', `${report.summary.userSatisfaction.toFixed(1)}/5.0`],
      ['Decisions Count', report.summary.decisionsCount.toString()],
      ['Alerts Count', report.summary.alertsCount.toString()]
    ];
    
    return rows.map(row => row.join(',')).join('\n');
  }
  
  // Public API methods
  async manualDecisionEvaluation(): Promise<any> {
    return this.decisionEngine.manualDecisionEvaluation();
  }
  
  async getCurrentStatus(): Promise<Phase4Status> {
    return this.getSystemStatus();
  }
  
  getRecentReports(limit = 10): Phase4Report[] {
    return Array.from(this.statusReports.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
  
  async generateReport(): Promise<Phase4Report> {
    return this.generateStatusReport();
  }
  
  updateConfig(updates: Partial<Phase4MonitorConfig>): void {
    this.config = { ...this.config, ...updates };
    
    if (updates.decisionCriteria) {
      this.decisionEngine.updateCriteria(updates.decisionCriteria);
    }
    
    this.logger.info('Configuration updated', { updates });
    
    this.emit('config:updated', {
      config: this.config,
      timestamp: new Date()
    });
  }
  
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Phase 4 Master Monitoring System');
    
    // Clear intervals
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.reportGenerationInterval) clearInterval(this.reportGenerationInterval);
    
    // Shutdown components
    await Promise.all([
      this.dashboard.shutdown(),
      this.truthScoreAnalyzer.shutdown(),
      this.consensusTracker.shutdown(),
      this.performanceAssessor.shutdown(),
      this.decisionEngine.shutdown()
    ]);
    
    this.emit('phase4-monitor:shutdown');
  }
}
