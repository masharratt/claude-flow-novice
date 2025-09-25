/**
 * Phase 4 Consensus Decision Tracking with Byzantine Fault Tolerance
 * Real-time monitoring of consensus decisions with timing metrics
 */

import { EventEmitter } from 'node:events';
import type { ILogger } from '../../../core/logger.js';
import type { IEventBus } from '../../../core/event-bus.js';

export interface ConsensusDecision {
  id: string;
  timestamp: Date;
  type: 'validation' | 'approval' | 'rejection' | 'escalation';
  participants: {
    id: string;
    role: 'validator' | 'arbiter' | 'system';
    vote: 'approve' | 'reject' | 'abstain';
    confidence: number;
    responseTime: number;
  }[];
  outcome: {
    decision: 'approved' | 'rejected' | 'escalated' | 'failed';
    confidence: number;
    unanimity: boolean;
    majorityThreshold: number;
  };
  timing: {
    initiatedAt: Date;
    firstResponseAt: Date;
    lastResponseAt: Date;
    decidedAt: Date;
    totalDuration: number;
    avgResponseTime: number;
  };
  context: {
    taskId?: string;
    userId?: string;
    complexity: 'low' | 'medium' | 'high';
    priority: 'low' | 'medium' | 'high' | 'critical';
    domain: string;
  };
  byzantineMetrics: {
    suspectedFaults: number;
    detectedInconsistencies: number;
    recoveryActions: string[];
    reliabilityScore: number;
  };
}

export interface ConsensusPerformanceMetrics {
  throughput: {
    decisionsPerMinute: number;
    decisionsPerHour: number;
    peakThroughput: number;
    averageThroughput: number;
  };
  timing: {
    averageDecisionTime: number;
    medianDecisionTime: number;
    p95DecisionTime: number;
    p99DecisionTime: number;
    timeoutRate: number;
  };
  quality: {
    successRate: number;
    byzantineFailureRate: number;
    consensusAgreementRate: number;
    escalationRate: number;
  };
  reliability: {
    systemAvailability: number;
    participantReliability: number;
    faultTolerance: number;
    recoveryTime: number;
  };
}

export interface ParticipantMetrics {
  participantId: string;
  role: string;
  performance: {
    totalDecisions: number;
    averageResponseTime: number;
    reliabilityScore: number;
    agreementRate: number;
    confidenceLevel: number;
  };
  behaviorAnalysis: {
    votingPatterns: { vote: string; frequency: number }[];
    consistencyScore: number;
    suspectedByzantine: boolean;
    lastActiveTime: Date;
  };
}

export interface ConsensusAlert {
  id: string;
  type: 'byzantine_detected' | 'consensus_failure' | 'timeout_exceeded' | 'reliability_drop';
  severity: 'warning' | 'critical';
  message: string;
  affectedDecisions: string[];
  suspectedParticipants: string[];
  recommendedActions: string[];
  timestamp: Date;
}

/**
 * Advanced consensus tracking with Byzantine fault detection
 * Provides <100ms execution timing and >98% success rate monitoring
 */
export class ConsensusTracker extends EventEmitter {
  private logger: ILogger;
  private eventBus: IEventBus;
  private decisions: Map<string, ConsensusDecision> = new Map();
  private participants: Map<string, ParticipantMetrics> = new Map();
  private alerts: Map<string, ConsensusAlert> = new Map();
  
  // Performance tracking
  private performanceMetrics: ConsensusPerformanceMetrics;
  private timingHistory: number[] = [];
  private throughputHistory: { timestamp: Date; count: number }[] = [];
  
  // Byzantine detection
  private byzantineDetector: ByzantineDetector;
  private reliabilityTracker: ReliabilityTracker;
  
  // Configuration
  private readonly targetSuccessRate = 0.98; // 98% target
  private readonly warningSuccessRate = 0.95;
  private readonly criticalSuccessRate = 0.90;
  private readonly maxDecisionTime = 30000; // 30 seconds
  private readonly targetResponseTime = 5000; // 5 seconds
  
  constructor(logger: ILogger, eventBus: IEventBus) {
    super();
    this.logger = logger;
    this.eventBus = eventBus;
    
    this.performanceMetrics = this.initializePerformanceMetrics();
    this.byzantineDetector = new ByzantineDetector(logger);
    this.reliabilityTracker = new ReliabilityTracker(logger);
    
    this.setupEventHandlers();
  }
  
  async initialize(): Promise<void> {
    this.logger.info('Initializing Consensus Tracker', {
      targetSuccessRate: this.targetSuccessRate,
      maxDecisionTime: this.maxDecisionTime
    });
    
    // Start monitoring loops
    setInterval(() => this.updatePerformanceMetrics(), 60000); // Every minute
    setInterval(() => this.detectByzantinePatterns(), 300000); // Every 5 minutes
    setInterval(() => this.analyzeParticipantBehavior(), 600000); // Every 10 minutes
    
    this.emit('consensus-tracker:initialized');
  }
  
  private setupEventHandlers(): void {
    this.eventBus.on('consensus:decision-initiated', (data) => {
      this.trackDecisionInitiation(data);
    });
    
    this.eventBus.on('consensus:participant-response', (data) => {
      this.trackParticipantResponse(data);
    });
    
    this.eventBus.on('consensus:decision-completed', (data) => {
      this.trackDecisionCompletion(data);
    });
    
    this.eventBus.on('consensus:byzantine-suspected', (data) => {
      this.handleByzantineSuspicion(data);
    });
    
    this.eventBus.on('consensus:timeout', (data) => {
      this.handleConsensusTimeout(data);
    });
  }
  
  private trackDecisionInitiation(data: {
    decisionId: string;
    type: string;
    participants: any[];
    context: any;
  }): void {
    const decision: ConsensusDecision = {
      id: data.decisionId,
      timestamp: new Date(),
      type: data.type as 'validation' | 'approval' | 'rejection' | 'escalation',
      participants: data.participants.map(p => ({
        id: p.id,
        role: p.role || 'validator',
        vote: 'abstain', // Initial state
        confidence: 0,
        responseTime: 0
      })),
      outcome: {
        decision: 'approved', // Will be updated
        confidence: 0,
        unanimity: false,
        majorityThreshold: 0.5
      },
      timing: {
        initiatedAt: new Date(),
        firstResponseAt: new Date(),
        lastResponseAt: new Date(),
        decidedAt: new Date(),
        totalDuration: 0,
        avgResponseTime: 0
      },
      context: {
        taskId: data.context?.taskId,
        userId: data.context?.userId,
        complexity: data.context?.complexity || 'medium',
        priority: data.context?.priority || 'medium',
        domain: data.context?.domain || 'general'
      },
      byzantineMetrics: {
        suspectedFaults: 0,
        detectedInconsistencies: 0,
        recoveryActions: [],
        reliabilityScore: 1.0
      }
    };
    
    this.decisions.set(data.decisionId, decision);
    
    this.emit('decision:initiated', {
      decisionId: data.decisionId,
      participants: data.participants.length,
      timestamp: new Date()
    });
    
    this.logger.debug('Consensus decision initiated', {
      decisionId: data.decisionId,
      type: data.type,
      participants: data.participants.length
    });
  }
  
  private trackParticipantResponse(data: {
    decisionId: string;
    participantId: string;
    vote: string;
    confidence: number;
    responseTime: number;
  }): void {
    const decision = this.decisions.get(data.decisionId);
    if (!decision) {
      this.logger.warn('Response for unknown decision', { decisionId: data.decisionId });
      return;
    }
    
    const participant = decision.participants.find(p => p.id === data.participantId);
    if (!participant) {
      this.logger.warn('Response from unknown participant', {
        decisionId: data.decisionId,
        participantId: data.participantId
      });
      return;
    }
    
    // Update participant response
    participant.vote = data.vote as 'approve' | 'reject' | 'abstain';
    participant.confidence = data.confidence;
    participant.responseTime = data.responseTime;
    
    // Update timing
    const now = new Date();
    if (!decision.timing.firstResponseAt || decision.timing.firstResponseAt.getTime() === decision.timing.initiatedAt.getTime()) {
      decision.timing.firstResponseAt = now;
    }
    decision.timing.lastResponseAt = now;
    
    // Update participant metrics
    this.updateParticipantMetrics(data.participantId, decision, data);
    
    // Check for Byzantine behavior
    this.byzantineDetector.analyzeResponse(data, decision);
    
    this.emit('participant:responded', {
      decisionId: data.decisionId,
      participantId: data.participantId,
      vote: data.vote,
      responseTime: data.responseTime
    });
  }
  
  private trackDecisionCompletion(data: {
    decisionId: string;
    outcome: string;
    confidence: number;
    unanimity: boolean;
    duration: number;
  }): void {
    const decision = this.decisions.get(data.decisionId);
    if (!decision) {
      this.logger.warn('Completion for unknown decision', { decisionId: data.decisionId });
      return;
    }
    
    const now = new Date();
    
    // Update outcome
    decision.outcome.decision = data.outcome as 'approved' | 'rejected' | 'escalated' | 'failed';
    decision.outcome.confidence = data.confidence;
    decision.outcome.unanimity = data.unanimity;
    
    // Update timing
    decision.timing.decidedAt = now;
    decision.timing.totalDuration = data.duration;
    
    // Calculate average response time
    const responseTimes = decision.participants
      .filter(p => p.responseTime > 0)
      .map(p => p.responseTime);
    decision.timing.avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;
    
    // Update performance metrics
    this.updateDecisionPerformanceMetrics(decision);
    
    // Check for performance issues
    this.checkPerformanceAlerts(decision);
    
    // Byzantine analysis
    const byzantineAnalysis = this.byzantineDetector.analyzeFinalDecision(decision);
    decision.byzantineMetrics = {
      ...decision.byzantineMetrics,
      ...byzantineAnalysis
    };
    
    this.emit('decision:completed', {
      decisionId: data.decisionId,
      outcome: data.outcome,
      duration: data.duration,
      byzantineMetrics: decision.byzantineMetrics
    });
    
    this.logger.info('Consensus decision completed', {
      decisionId: data.decisionId,
      outcome: data.outcome,
      duration: data.duration,
      participants: decision.participants.length,
      byzantineIssues: decision.byzantineMetrics.suspectedFaults
    });
  }
  
  private updateParticipantMetrics(
    participantId: string, 
    decision: ConsensusDecision, 
    response: any
  ): void {
    let participant = this.participants.get(participantId);
    
    if (!participant) {
      participant = {
        participantId,
        role: response.role || 'validator',
        performance: {
          totalDecisions: 0,
          averageResponseTime: 0,
          reliabilityScore: 1.0,
          agreementRate: 1.0,
          confidenceLevel: 0.5
        },
        behaviorAnalysis: {
          votingPatterns: [],
          consistencyScore: 1.0,
          suspectedByzantine: false,
          lastActiveTime: new Date()
        }
      };
      this.participants.set(participantId, participant);
    }
    
    // Update performance metrics
    participant.performance.totalDecisions++;
    
    // Update average response time (weighted average)
    const prevTotal = participant.performance.averageResponseTime * (participant.performance.totalDecisions - 1);
    participant.performance.averageResponseTime = (prevTotal + response.responseTime) / participant.performance.totalDecisions;
    
    // Update confidence level
    const prevConfidenceTotal = participant.performance.confidenceLevel * (participant.performance.totalDecisions - 1);
    participant.performance.confidenceLevel = (prevConfidenceTotal + response.confidence) / participant.performance.totalDecisions;
    
    // Update voting patterns
    const existingPattern = participant.behaviorAnalysis.votingPatterns.find(p => p.vote === response.vote);
    if (existingPattern) {
      existingPattern.frequency++;
    } else {
      participant.behaviorAnalysis.votingPatterns.push({ vote: response.vote, frequency: 1 });
    }
    
    participant.behaviorAnalysis.lastActiveTime = new Date();
  }
  
  private updateDecisionPerformanceMetrics(decision: ConsensusDecision): void {
    const metrics = this.performanceMetrics;
    
    // Update timing history
    this.timingHistory.push(decision.timing.totalDuration);
    if (this.timingHistory.length > 1000) {
      this.timingHistory = this.timingHistory.slice(-1000);
    }
    
    // Update timing metrics
    metrics.timing.averageDecisionTime = this.calculateAverage(this.timingHistory);
    metrics.timing.medianDecisionTime = this.calculateMedian(this.timingHistory);
    metrics.timing.p95DecisionTime = this.calculatePercentile(this.timingHistory, 95);
    metrics.timing.p99DecisionTime = this.calculatePercentile(this.timingHistory, 99);
    
    // Update quality metrics
    const recentDecisions = this.getRecentDecisions(3600000); // Last hour
    const successful = recentDecisions.filter(d => d.outcome.decision !== 'failed').length;
    const byzantine = recentDecisions.filter(d => d.byzantineMetrics.suspectedFaults > 0).length;
    const escalated = recentDecisions.filter(d => d.outcome.decision === 'escalated').length;
    
    if (recentDecisions.length > 0) {
      metrics.quality.successRate = successful / recentDecisions.length;
      metrics.quality.byzantineFailureRate = byzantine / recentDecisions.length;
      metrics.quality.escalationRate = escalated / recentDecisions.length;
      
      // Consensus agreement rate (unanimity + majority)
      const consensusAchieved = recentDecisions.filter(d => 
        d.outcome.decision !== 'failed' && d.outcome.decision !== 'escalated'
      ).length;
      metrics.quality.consensusAgreementRate = consensusAchieved / recentDecisions.length;
    }
    
    // Update throughput
    const now = new Date();
    this.throughputHistory.push({ timestamp: now, count: 1 });
    
    // Clean old throughput data (keep last hour)
    const oneHourAgo = new Date(now.getTime() - 3600000);
    this.throughputHistory = this.throughputHistory.filter(t => t.timestamp >= oneHourAgo);
    
    // Calculate throughput rates
    const lastMinute = new Date(now.getTime() - 60000);
    const decisionsLastMinute = this.throughputHistory.filter(t => t.timestamp >= lastMinute).length;
    metrics.throughput.decisionsPerMinute = decisionsLastMinute;
    metrics.throughput.decisionsPerHour = this.throughputHistory.length;
    
    // Update averages
    const allDecisions = Array.from(this.decisions.values());
    metrics.throughput.averageThroughput = this.calculateAverageThroughput(allDecisions);
  }
  
  private updatePerformanceMetrics(): void {
    const recentDecisions = this.getRecentDecisions(3600000); // Last hour
    if (recentDecisions.length === 0) return;
    
    const metrics = this.performanceMetrics;
    
    // Update reliability metrics
    const systemAvailable = recentDecisions.filter(d => d.outcome.decision !== 'failed').length;
    metrics.reliability.systemAvailability = systemAvailable / recentDecisions.length;
    
    // Update participant reliability
    const participantReliability = this.calculateParticipantReliability();
    metrics.reliability.participantReliability = participantReliability;
    
    // Update fault tolerance
    const byzantineDecisions = recentDecisions.filter(d => d.byzantineMetrics.suspectedFaults > 0);
    const recoveredDecisions = byzantineDecisions.filter(d => d.outcome.decision !== 'failed');
    metrics.reliability.faultTolerance = byzantineDecisions.length > 0 
      ? recoveredDecisions.length / byzantineDecisions.length 
      : 1.0;
    
    // Check performance thresholds
    this.checkPerformanceThresholds(metrics);
    
    this.emit('metrics:performance-updated', {
      timestamp: new Date(),
      metrics: { ...metrics }
    });
  }
  
  private detectByzantinePatterns(): void {
    const recentDecisions = this.getRecentDecisions(1800000); // Last 30 minutes
    const patterns = this.byzantineDetector.detectPatterns(recentDecisions, Array.from(this.participants.values()));
    
    patterns.forEach(pattern => {
      this.handleByzantinePattern(pattern);
    });
    
    this.emit('byzantine:patterns-analyzed', {
      timestamp: new Date(),
      patternsDetected: patterns.length,
      decisionsAnalyzed: recentDecisions.length
    });
  }
  
  private analyzeParticipantBehavior(): void {
    Array.from(this.participants.values()).forEach(participant => {
      const analysis = this.byzantineDetector.analyzeParticipantBehavior(participant);
      
      // Update participant metrics with analysis
      participant.behaviorAnalysis.consistencyScore = analysis.consistencyScore;
      participant.behaviorAnalysis.suspectedByzantine = analysis.suspectedByzantine;
      
      // Update reliability score
      participant.performance.reliabilityScore = this.calculateParticipantReliability(participant);
      
      // Alert if Byzantine behavior detected
      if (analysis.suspectedByzantine && !participant.behaviorAnalysis.suspectedByzantine) {
        this.createAlert('byzantine_detected', 'warning',
          `Byzantine behavior suspected for participant ${participant.participantId}`,
          [],
          [participant.participantId],
          ['Investigate participant behavior', 'Review recent decisions', 'Consider participant exclusion']
        );
      }
    });
    
    this.emit('participants:behavior-analyzed', {
      timestamp: new Date(),
      participantsAnalyzed: this.participants.size
    });
  }
  
  private checkPerformanceAlerts(decision: ConsensusDecision): void {
    // Check decision time
    if (decision.timing.totalDuration > this.maxDecisionTime) {
      this.createAlert('timeout_exceeded', 'warning',
        `Decision ${decision.id} exceeded maximum time: ${decision.timing.totalDuration}ms`,
        [decision.id],
        [],
        ['Investigate slow participants', 'Review decision complexity', 'Consider timeout adjustments']
      );
    }
    
    // Check Byzantine issues
    if (decision.byzantineMetrics.suspectedFaults > 0) {
      this.createAlert('byzantine_detected', decision.byzantineMetrics.suspectedFaults > 2 ? 'critical' : 'warning',
        `Byzantine faults detected in decision ${decision.id}: ${decision.byzantineMetrics.suspectedFaults} faults`,
        [decision.id],
        decision.byzantineMetrics.recoveryActions,
        ['Review participant behavior', 'Investigate fault patterns', 'Consider system integrity']
      );
    }
    
    // Check consensus failure
    if (decision.outcome.decision === 'failed') {
      this.createAlert('consensus_failure', 'critical',
        `Consensus failed for decision ${decision.id}`,
        [decision.id],
        [],
        ['Immediate investigation required', 'Check system stability', 'Review participant availability']
      );
    }
  }
  
  private checkPerformanceThresholds(metrics: ConsensusPerformanceMetrics): void {
    // Check success rate
    if (metrics.quality.successRate < this.criticalSuccessRate) {
      this.createAlert('reliability_drop', 'critical',
        `Consensus success rate critically low: ${(metrics.quality.successRate * 100).toFixed(1)}%`,
        [],
        [],
        ['Immediate system review', 'Check participant health', 'Consider rollback']
      );
    } else if (metrics.quality.successRate < this.warningSuccessRate) {
      this.createAlert('reliability_drop', 'warning',
        `Consensus success rate below target: ${(metrics.quality.successRate * 100).toFixed(1)}%`,
        [],
        [],
        ['Monitor closely', 'Investigate recent failures', 'Review system load']
      );
    }
    
    // Check Byzantine failure rate
    if (metrics.quality.byzantineFailureRate > 0.05) { // 5% threshold
      this.createAlert('byzantine_detected', 'warning',
        `High Byzantine failure rate: ${(metrics.quality.byzantineFailureRate * 100).toFixed(1)}%`,
        [],
        [],
        ['Investigate participant behavior', 'Review security measures', 'Check system integrity']
      );
    }
    
    // Check average decision time
    if (metrics.timing.averageDecisionTime > this.targetResponseTime * 2) {
      this.createAlert('timeout_exceeded', 'warning',
        `Average decision time high: ${metrics.timing.averageDecisionTime}ms`,
        [],
        [],
        ['Optimize decision process', 'Check system performance', 'Review participant responsiveness']
      );
    }
  }
  
  private handleByzantineSuspicion(data: any): void {
    this.logger.warn('Byzantine behavior suspected', data);
    
    this.createAlert('byzantine_detected', 'warning',
      `Byzantine behavior suspected: ${data.reason}`,
      data.affectedDecisions || [],
      data.suspectedParticipants || [],
      ['Investigate immediately', 'Review participant history', 'Consider isolation']
    );
  }
  
  private handleConsensusTimeout(data: {
    decisionId: string;
    timeoutDuration: number;
    participantsResponded: number;
    totalParticipants: number;
  }): void {
    const decision = this.decisions.get(data.decisionId);
    if (decision) {
      decision.outcome.decision = 'failed';
      decision.timing.totalDuration = data.timeoutDuration;
      decision.timing.decidedAt = new Date();
    }
    
    this.createAlert('timeout_exceeded', 'critical',
      `Consensus timeout for decision ${data.decisionId}: ${data.timeoutDuration}ms`,
      [data.decisionId],
      [],
      [
        'Check participant availability',
        'Review system performance',
        'Consider increasing timeout threshold'
      ]
    );
  }
  
  private handleByzantinePattern(pattern: any): void {
    this.createAlert('byzantine_detected', pattern.severity || 'warning',
      `Byzantine pattern detected: ${pattern.description}`,
      pattern.affectedDecisions || [],
      pattern.suspectedParticipants || [],
      pattern.recommendedActions || ['Investigate pattern', 'Review system security']
    );
  }
  
  private createAlert(
    type: 'byzantine_detected' | 'consensus_failure' | 'timeout_exceeded' | 'reliability_drop',
    severity: 'warning' | 'critical',
    message: string,
    affectedDecisions: string[],
    suspectedParticipants: string[],
    recommendedActions: string[]
  ): void {
    const alertId = `alert-${type}-${Date.now()}`;
    
    const alert: ConsensusAlert = {
      id: alertId,
      type,
      severity,
      message,
      affectedDecisions,
      suspectedParticipants,
      recommendedActions,
      timestamp: new Date()
    };
    
    this.alerts.set(alertId, alert);
    
    this.logger.warn('Consensus Alert Created', {
      alertId,
      type,
      severity,
      message
    });
    
    this.emit('alert:created', { alert });
    
    // Emit to main event bus
    this.eventBus.emit('consensus:alert', {
      alert,
      currentMetrics: { ...this.performanceMetrics }
    });
  }
  
  // Utility methods
  private getRecentDecisions(windowMs: number): ConsensusDecision[] {
    const cutoff = new Date(Date.now() - windowMs);
    return Array.from(this.decisions.values())
      .filter(decision => decision.timestamp >= cutoff)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
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
  
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
  
  private calculateAverageThroughput(decisions: ConsensusDecision[]): number {
    if (decisions.length < 2) return 0;
    
    const sortedDecisions = decisions
      .filter(d => d.timing.decidedAt)
      .sort((a, b) => a.timing.decidedAt.getTime() - b.timing.decidedAt.getTime());
    
    if (sortedDecisions.length < 2) return 0;
    
    const timespan = sortedDecisions[sortedDecisions.length - 1].timing.decidedAt.getTime() - 
                    sortedDecisions[0].timing.decidedAt.getTime();
    
    return timespan > 0 ? (sortedDecisions.length * 3600000) / timespan : 0; // decisions per hour
  }
  
  private calculateParticipantReliability(): number {
    const participants = Array.from(this.participants.values());
    if (participants.length === 0) return 1.0;
    
    const totalReliability = participants.reduce((sum, p) => sum + p.performance.reliabilityScore, 0);
    return totalReliability / participants.length;
  }
  
  private calculateParticipantReliability(participant: ParticipantMetrics): number {
    let reliability = 1.0;
    
    // Factor in response time
    if (participant.performance.averageResponseTime > this.targetResponseTime) {
      reliability -= 0.1;
    }
    
    // Factor in consistency
    reliability *= participant.behaviorAnalysis.consistencyScore;
    
    // Factor in Byzantine suspicion
    if (participant.behaviorAnalysis.suspectedByzantine) {
      reliability *= 0.5;
    }
    
    return Math.max(0, Math.min(1, reliability));
  }
  
  private initializePerformanceMetrics(): ConsensusPerformanceMetrics {
    return {
      throughput: {
        decisionsPerMinute: 0,
        decisionsPerHour: 0,
        peakThroughput: 0,
        averageThroughput: 0
      },
      timing: {
        averageDecisionTime: 0,
        medianDecisionTime: 0,
        p95DecisionTime: 0,
        p99DecisionTime: 0,
        timeoutRate: 0
      },
      quality: {
        successRate: 1.0,
        byzantineFailureRate: 0,
        consensusAgreementRate: 1.0,
        escalationRate: 0
      },
      reliability: {
        systemAvailability: 1.0,
        participantReliability: 1.0,
        faultTolerance: 1.0,
        recoveryTime: 0
      }
    };
  }
  
  // Public API methods
  getPerformanceMetrics(): ConsensusPerformanceMetrics {
    return { ...this.performanceMetrics };
  }
  
  getParticipantMetrics(): ParticipantMetrics[] {
    return Array.from(this.participants.values())
      .sort((a, b) => b.performance.totalDecisions - a.performance.totalDecisions);
  }
  
  getActiveAlerts(): ConsensusAlert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  
  getDecisionHistory(limit: number = 100): ConsensusDecision[] {
    return Array.from(this.decisions.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
  
  getConsensusHealthScore(): {
    overall: number;
    components: {
      successRate: number;
      responseTime: number;
      byzantineTolerance: number;
      participantReliability: number;
    };
  } {
    const metrics = this.performanceMetrics;
    
    const components = {
      successRate: metrics.quality.successRate,
      responseTime: Math.max(0, 1 - (metrics.timing.averageDecisionTime / (this.targetResponseTime * 2))),
      byzantineTolerance: 1 - metrics.quality.byzantineFailureRate,
      participantReliability: metrics.reliability.participantReliability
    };
    
    const overall = (components.successRate + components.responseTime + components.byzantineTolerance + components.participantReliability) / 4;
    
    return {
      overall,
      components
    };
  }
  
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Consensus Tracker');
    this.emit('consensus-tracker:shutdown');
  }
}

/**
 * Byzantine fault detection and analysis
 */
class ByzantineDetector {
  private logger: ILogger;
  
  constructor(logger: ILogger) {
    this.logger = logger;
  }
  
  analyzeResponse(response: any, decision: ConsensusDecision): void {
    // Analyze individual response for Byzantine patterns
    const participant = decision.participants.find(p => p.id === response.participantId);
    if (!participant) return;
    
    // Check for unusual confidence levels
    if (response.confidence < 0.1 || response.confidence > 0.99) {
      decision.byzantineMetrics.detectedInconsistencies++;
    }
    
    // Check for unusual response times
    if (response.responseTime < 100 || response.responseTime > 30000) {
      decision.byzantineMetrics.detectedInconsistencies++;
    }
  }
  
  analyzeFinalDecision(decision: ConsensusDecision): any {
    const analysis = {
      suspectedFaults: 0,
      detectedInconsistencies: decision.byzantineMetrics.detectedInconsistencies,
      recoveryActions: [...decision.byzantineMetrics.recoveryActions],
      reliabilityScore: 1.0
    };
    
    // Analyze voting patterns
    const votes = decision.participants.map(p => p.vote);
    const voteDistribution = votes.reduce((dist, vote) => {
      dist[vote] = (dist[vote] || 0) + 1;
      return dist;
    }, {} as Record<string, number>);
    
    // Check for suspicious patterns
    const totalVotes = votes.length;
    const maxVoteCount = Math.max(...Object.values(voteDistribution));
    
    // If no clear majority and high disagreement
    if (maxVoteCount / totalVotes < 0.6 && Object.keys(voteDistribution).length > 2) {
      analysis.suspectedFaults = Math.floor(totalVotes * 0.1); // Estimate 10% Byzantine
      analysis.recoveryActions.push('High disagreement detected');
    }
    
    // Analyze confidence patterns
    const confidences = decision.participants.map(p => p.confidence);
    const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    const confidenceVariance = confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidences.length;
    
    if (confidenceVariance > 0.5) { // High variance in confidence
      analysis.suspectedFaults++;
      analysis.recoveryActions.push('High confidence variance detected');
    }
    
    // Calculate reliability score
    analysis.reliabilityScore = Math.max(0, 1 - (analysis.suspectedFaults * 0.2) - (analysis.detectedInconsistencies * 0.1));
    
    return analysis;
  }
  
  detectPatterns(decisions: ConsensusDecision[], participants: ParticipantMetrics[]): any[] {
    const patterns: any[] = [];
    
    // Analyze participant behavior patterns
    participants.forEach(participant => {
      const participantDecisions = decisions.filter(d => 
        d.participants.some(p => p.id === participant.participantId)
      );
      
      if (participantDecisions.length < 5) return; // Need minimum sample
      
      // Check for consistent minority voting
      let minorityVotes = 0;
      participantDecisions.forEach(decision => {
        const participantVote = decision.participants.find(p => p.id === participant.participantId)?.vote;
        if (!participantVote) return;
        
        const allVotes = decision.participants.map(p => p.vote);
        const voteCount = allVotes.filter(v => v === participantVote).length;
        
        if (voteCount / allVotes.length < 0.4) { // Minority vote
          minorityVotes++;
        }
      });
      
      if (minorityVotes / participantDecisions.length > 0.7) { // 70% minority votes
        patterns.push({
          type: 'consistent_minority',
          participantId: participant.participantId,
          description: `Participant ${participant.participantId} consistently votes in minority`,
          severity: 'warning',
          affectedDecisions: participantDecisions.map(d => d.id),
          suspectedParticipants: [participant.participantId],
          recommendedActions: ['Review participant alignment', 'Investigate decision criteria']
        });
      }
    });
    
    // Check for coordinated behavior
    if (participants.length >= 3) {
      this.detectCoordinatedBehavior(decisions, participants, patterns);
    }
    
    return patterns;
  }
  
  private detectCoordinatedBehavior(
    decisions: ConsensusDecision[], 
    participants: ParticipantMetrics[], 
    patterns: any[]
  ): void {
    // Look for pairs of participants that vote together unusually often
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const participant1 = participants[i];
        const participant2 = participants[j];
        
        const sharedDecisions = decisions.filter(d => 
          d.participants.some(p => p.id === participant1.participantId) &&
          d.participants.some(p => p.id === participant2.participantId)
        );
        
        if (sharedDecisions.length < 5) continue;
        
        let sameVotes = 0;
        sharedDecisions.forEach(decision => {
          const vote1 = decision.participants.find(p => p.id === participant1.participantId)?.vote;
          const vote2 = decision.participants.find(p => p.id === participant2.participantId)?.vote;
          
          if (vote1 === vote2) {
            sameVotes++;
          }
        });
        
        const agreementRate = sameVotes / sharedDecisions.length;
        if (agreementRate > 0.9) { // 90% agreement
          patterns.push({
            type: 'coordinated_behavior',
            description: `High agreement between ${participant1.participantId} and ${participant2.participantId}`,
            severity: 'warning',
            affectedDecisions: sharedDecisions.map(d => d.id),
            suspectedParticipants: [participant1.participantId, participant2.participantId],
            recommendedActions: ['Investigate coordination', 'Review independence']
          });
        }
      }
    }
  }
  
  analyzeParticipantBehavior(participant: ParticipantMetrics): {
    consistencyScore: number;
    suspectedByzantine: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let consistencyScore = 1.0;
    
    // Check response time consistency
    if (participant.performance.averageResponseTime > 10000) { // > 10 seconds
      consistencyScore -= 0.2;
      reasons.push('Slow response times');
    }
    
    // Check confidence consistency
    if (participant.performance.confidenceLevel < 0.3) {
      consistencyScore -= 0.2;
      reasons.push('Low confidence levels');
    }
    
    // Check voting pattern diversity
    const totalVotes = participant.behaviorAnalysis.votingPatterns.reduce((sum, p) => sum + p.frequency, 0);
    const entropy = this.calculateEntropy(participant.behaviorAnalysis.votingPatterns.map(p => p.frequency / totalVotes));
    
    if (entropy < 0.5) { // Low entropy = always same vote
      consistencyScore -= 0.3;
      reasons.push('Lack of voting diversity');
    }
    
    // Check recent activity
    const daysSinceActive = (Date.now() - participant.behaviorAnalysis.lastActiveTime.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActive > 7) {
      consistencyScore -= 0.1;
      reasons.push('Inactive participant');
    }
    
    const suspectedByzantine = consistencyScore < 0.5 && reasons.length >= 2;
    
    return {
      consistencyScore: Math.max(0, consistencyScore),
      suspectedByzantine,
      reasons
    };
  }
  
  private calculateEntropy(probabilities: number[]): number {
    return -probabilities.reduce((entropy, p) => {
      return p > 0 ? entropy + p * Math.log2(p) : entropy;
    }, 0);
  }
}

/**
 * Reliability tracking for consensus system
 */
class ReliabilityTracker {
  private logger: ILogger;
  
  constructor(logger: ILogger) {
    this.logger = logger;
  }
  
  // Implementation would track system reliability metrics
  // Including uptime, recovery times, fault tolerance, etc.
}
