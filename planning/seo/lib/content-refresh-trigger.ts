/**
 * Content Refresh Trigger System - Implementation
 *
 * @module planning/seo/lib/content-refresh-trigger
 * @description Detects ranking decay and triggers content refresh cycles
 *              Prevents content from falling off page 1 through automated monitoring
 * @version 1.0.0
 * @phase 5
 * @sprint 2
 * @enhancement Step 13 Performance Tracking
 */

import Redis from 'ioredis';
import {
  DecayPattern,
  RefreshPriority,
  DecayAnalysis,
  RefreshRecommendation,
  RefreshSchedule,
  FreshnessOpportunity,
  FreshnessOpportunityType,
  RefreshWorkflowResult,
  DecayMetrics,
  RefreshAction,
  REFRESH_PRIORITY_THRESHOLDS,
  DECAY_DETECTION_THRESHOLDS,
  FRESHNESS_IMPACT_WEIGHTS,
  REFRESH_EFFORT_ESTIMATES,
  isValidDecayAnalysis,
  isValidRefreshRecommendation,
  isValidRefreshSchedule,
  isValidFreshnessOpportunity,
} from '../types/content-refresh';
import {
  ContentPerformance,
  PerformanceMetrics,
  RankingMetrics,
  TrafficMetrics,
} from '../types/performance';

// ============================================================================
// REDIS KEY PREFIXES
// ============================================================================

const REDIS_KEYS = {
  REFRESH_SCHEDULE: 'seo:content:refresh:schedule:',
  DECAY_HISTORY: 'seo:content:decay:history:',
  FRESHNESS_OPPORTUNITIES: 'seo:content:freshness:opportunities:',
  WORKFLOW_QUEUE: 'seo:content:refresh:workflow:queue',
} as const;

// ============================================================================
// CONTENT REFRESH TRIGGER CLASS
// ============================================================================

/**
 * Content Refresh Trigger System
 * Monitors content performance and triggers refresh workflows based on decay patterns
 */
export class ContentRefreshTrigger {
  private redis: Redis;

  /**
   * Constructor
   * @param redis Redis client for storing schedules and history
   */
  constructor(redis: Redis) {
    this.redis = redis;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Analyze decay pattern from historical performance data
   * @param contentId Content identifier
   * @param history Array of historical ContentPerformance data (oldest to newest)
   * @returns DecayAnalysis with pattern classification and severity
   */
  public async analyzeDecayPattern(
    contentId: string,
    history: ReadonlyArray<ContentPerformance>
  ): Promise<DecayAnalysis> {
    if (history.length < 2) {
      throw new Error('Insufficient history for decay analysis (minimum 2 data points)');
    }

    // Sort by measurement date (oldest to newest)
    const sortedHistory = [...history].sort((a, b) => {
      return new Date(a.metricsUpdatedAt).getTime() - new Date(b.metricsUpdatedAt).getTime();
    });

    const metrics = this.calculateDecayMetrics(sortedHistory);
    const pattern = this.classifyDecayPattern(metrics);
    const severity = this.calculateDecaySeverity(metrics, pattern);
    const cause = this.determineCause(metrics, pattern, sortedHistory);

    const analysis: DecayAnalysis = {
      pattern,
      severity,
      timeline: this.generateTimeline(metrics, sortedHistory),
      cause,
      positionsLost: metrics.peakPosition - metrics.currentPosition,
      trafficLostPercent: metrics.trafficDropPercent,
      rankingDropVelocity: metrics.rankingDropVelocity,
      weeksInDecay: metrics.timeInDecay,
      competitorGains: metrics.competitorGains,
      analyzedAt: new Date().toISOString(),
      confidence: this.calculateDecayConfidence(metrics, sortedHistory),
    };

    // Store in Redis for historical tracking
    await this.storeDecayAnalysis(contentId, analysis);

    return analysis;
  }

  /**
   * Detect if content needs refresh based on current performance
   * @param performance Current ContentPerformance data
   * @returns RefreshRecommendation with action and priority
   */
  public async detectRefreshNeed(
    performance: ContentPerformance
  ): Promise<RefreshRecommendation> {
    const metrics = this.extractDecayMetricsFromPerformance(performance);
    const priority = this.calculateRefreshPriority(metrics);

    if (priority === RefreshPriority.LOW && metrics.daysSinceLastUpdate < 365) {
      // No action needed
      return this.createNoActionRecommendation(performance);
    }

    const action = this.determineRefreshAction(metrics, priority);
    const tasks = this.generateRefreshTasks(action, metrics);
    const deadline = this.calculateDeadline(priority);

    const recommendation: RefreshRecommendation = {
      action,
      priority,
      reason: this.generateReason(metrics, priority),
      expectedImpact: this.generateExpectedImpact(metrics, action),
      estimatedRankingRecovery: this.estimateRankingRecovery(metrics),
      estimatedTrafficRecovery: this.estimateTrafficRecovery(metrics),
      deadline,
      tasks,
      recommendedAt: new Date().toISOString(),
      confidence: this.calculateRecommendationConfidence(metrics, priority),
    };

    return recommendation;
  }

  /**
   * Calculate refresh priority based on decay metrics
   * @param metrics DecayMetrics
   * @returns RefreshPriority level
   */
  public calculateRefreshPriority(metrics: DecayMetrics): RefreshPriority {
    const { rankingDropPercent, trafficDropPercent, timeInDecay, daysSinceLastUpdate } = metrics;

    const positionsLost = metrics.peakPosition - metrics.currentPosition;

    // URGENT: Critical decay requiring immediate action
    if (
      positionsLost >= REFRESH_PRIORITY_THRESHOLDS.URGENT.rankingDropMin &&
      trafficDropPercent >= REFRESH_PRIORITY_THRESHOLDS.URGENT.trafficDropPercentMin &&
      timeInDecay <= REFRESH_PRIORITY_THRESHOLDS.URGENT.timeframeWeeksMax
    ) {
      return RefreshPriority.URGENT;
    }

    // HIGH: Significant decay requiring prompt action
    if (
      positionsLost >= REFRESH_PRIORITY_THRESHOLDS.HIGH.rankingDropMin &&
      trafficDropPercent >= REFRESH_PRIORITY_THRESHOLDS.HIGH.trafficDropPercentMin &&
      timeInDecay <= REFRESH_PRIORITY_THRESHOLDS.HIGH.timeframeWeeksMax
    ) {
      return RefreshPriority.HIGH;
    }

    // MEDIUM: Moderate decay or aging content
    if (
      positionsLost >= REFRESH_PRIORITY_THRESHOLDS.MEDIUM.rankingDropMin ||
      trafficDropPercent >= REFRESH_PRIORITY_THRESHOLDS.MEDIUM.trafficDropPercentMin ||
      daysSinceLastUpdate >= REFRESH_PRIORITY_THRESHOLDS.MEDIUM.ageMonthsMin * 30
    ) {
      return RefreshPriority.MEDIUM;
    }

    // LOW: Preventive refresh for aging content
    if (daysSinceLastUpdate >= REFRESH_PRIORITY_THRESHOLDS.LOW.ageMonthsMin * 30) {
      return RefreshPriority.LOW;
    }

    return RefreshPriority.LOW;
  }

  /**
   * Schedule content refresh based on priority
   * @param contentId Content identifier
   * @param priority Refresh priority
   * @param recommendation Refresh recommendation
   * @param decayAnalysis Decay analysis results
   * @returns RefreshSchedule
   */
  public async scheduleRefresh(
    contentId: string,
    priority: RefreshPriority,
    recommendation: RefreshRecommendation,
    decayAnalysis: DecayAnalysis
  ): Promise<RefreshSchedule> {
    const now = new Date();
    const scheduledDate = new Date(recommendation.deadline);

    const schedule: RefreshSchedule = {
      contentId,
      contentUrl: `https://example.com/content/${contentId}`, // Replace with actual URL lookup
      targetKeyword: 'unknown', // Replace with actual keyword lookup
      scheduledDate: scheduledDate.toISOString(),
      priority,
      triggers: this.extractTriggers(decayAnalysis),
      recommendedActions: [recommendation.action],
      estimatedEffortHours: this.estimateEffort(recommendation.action),
      status: 'pending',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      notes: `Decay pattern: ${decayAnalysis.pattern}. Severity: ${decayAnalysis.severity.toFixed(2)}`,
    };

    // Store in Redis
    await this.storeRefreshSchedule(schedule);

    return schedule;
  }

  /**
   * Identify freshness opportunities in content
   * @param performance ContentPerformance data
   * @returns Array of FreshnessOpportunity
   */
  public async identifyFreshnessOpportunities(
    performance: ContentPerformance
  ): Promise<FreshnessOpportunity[]> {
    const opportunities: FreshnessOpportunity[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();

    // Check for outdated year references
    const publishYear = new Date(performance.publishedAt).getFullYear();
    if (currentYear - publishYear >= 1) {
      opportunities.push({
        type: 'outdated_year_reference',
        currentValue: `Year ${publishYear}`,
        suggestedUpdate: `Update to ${currentYear}`,
        impact: FRESHNESS_IMPACT_WEIGHTS.OUTDATED_YEAR_REFERENCE,
        detectedAt: now.toISOString(),
        confidence: 0.9,
      });
    }

    // Check for outdated statistics (content > 1 year old)
    const daysSincePublication = Math.floor(
      (now.getTime() - new Date(performance.publishedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSincePublication > 365) {
      opportunities.push({
        type: 'outdated_statistics',
        currentValue: 'Statistics older than 1 year',
        suggestedUpdate: 'Update with latest industry data',
        impact: FRESHNESS_IMPACT_WEIGHTS.OUTDATED_STATISTICS,
        detectedAt: now.toISOString(),
        evidence: `Content published ${Math.floor(daysSincePublication / 365)} years ago`,
        confidence: 0.85,
      });
    }

    // Check for algorithm updates affecting performance
    if (performance.affectedByUpdates.length > 0) {
      const recentUpdate = performance.affectedByUpdates[0];
      opportunities.push({
        type: 'algorithm_update',
        currentValue: 'Content impacted by algorithm update',
        suggestedUpdate: `Address ${recentUpdate.updateName} requirements`,
        impact: FRESHNESS_IMPACT_WEIGHTS.ALGORITHM_UPDATE,
        detectedAt: now.toISOString(),
        evidence: `Affected by ${recentUpdate.updateName}`,
        confidence: Math.abs(recentUpdate.estimatedImpact),
      });
    }

    // Store opportunities in Redis
    await this.storeFreshnessOpportunities(performance.contentId, opportunities);

    return opportunities;
  }

  /**
   * Trigger full refresh workflow
   * @param contentId Content identifier
   * @param performance Current ContentPerformance
   * @param history Historical ContentPerformance data
   * @returns RefreshWorkflowResult
   */
  public async triggerRefreshWorkflow(
    contentId: string,
    performance: ContentPerformance,
    history: ReadonlyArray<ContentPerformance>
  ): Promise<RefreshWorkflowResult> {
    try {
      // Analyze decay
      const decayAnalysis = await this.analyzeDecayPattern(contentId, [...history, performance]);

      // Generate recommendation
      const recommendation = await this.detectRefreshNeed(performance);

      // Schedule refresh
      const schedule = await this.scheduleRefresh(
        contentId,
        recommendation.priority,
        recommendation,
        decayAnalysis
      );

      // Add to workflow queue
      const workflowId = await this.enqueueRefreshWorkflow(schedule);

      const result: RefreshWorkflowResult = {
        success: true,
        contentId,
        workflowId,
        schedule,
        decayAnalysis,
        recommendation,
        triggeredAt: new Date().toISOString(),
      };

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        contentId,
        workflowId: '',
        schedule: {} as RefreshSchedule,
        decayAnalysis: {} as DecayAnalysis,
        recommendation: {} as RefreshRecommendation,
        triggeredAt: new Date().toISOString(),
        error: errorMessage,
      };
    }
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Calculate decay metrics from historical performance data
   */
  private calculateDecayMetrics(history: ReadonlyArray<ContentPerformance>): DecayMetrics {
    const latest = history[history.length - 1];
    const rankingValues = history.map(h => h.metrics.ranking.averagePosition);
    const trafficValues = history.map(h => h.metrics.traffic.totalClicks);

    const peakPosition = Math.min(...rankingValues);
    const currentPosition = latest.metrics.ranking.averagePosition;
    const peakTraffic = Math.max(...trafficValues);
    const currentTraffic = latest.metrics.traffic.totalClicks;

    const rankingDropPercent =
      peakPosition > 0 ? ((currentPosition - peakPosition) / peakPosition) * 100 : 0;
    const trafficDropPercent =
      peakTraffic > 0 ? ((peakTraffic - currentTraffic) / peakTraffic) * 100 : 0;

    // Calculate velocity (positions per week)
    const weeksInHistory = Math.max(
      1,
      Math.floor(
        (new Date(latest.metricsUpdatedAt).getTime() -
          new Date(history[0].metricsUpdatedAt).getTime()) /
          (1000 * 60 * 60 * 24 * 7)
      )
    );
    const rankingDropVelocity = (currentPosition - peakPosition) / weeksInHistory;

    // Calculate weeks in decay (continuous decline)
    let weeksInDecay = 0;
    for (let i = history.length - 1; i > 0; i--) {
      if (
        history[i].metrics.ranking.averagePosition > history[i - 1].metrics.ranking.averagePosition
      ) {
        weeksInDecay++;
      } else {
        break;
      }
    }

    const daysSinceLastUpdate = Math.floor(
      (new Date().getTime() - new Date(latest.publishedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      currentPosition,
      peakPosition,
      rankingDropPercent,
      rankingDropVelocity,
      currentTraffic,
      peakTraffic,
      trafficDropPercent,
      competitorGains: 0, // Mock value - replace with actual competitor tracking
      timeInDecay: weeksInDecay,
      daysSinceLastUpdate,
      measuredAt: new Date().toISOString(),
    };
  }

  /**
   * Classify decay pattern based on metrics
   */
  private classifyDecayPattern(metrics: DecayMetrics): DecayPattern {
    const { rankingDropVelocity, timeInDecay, competitorGains } = metrics;

    // Sudden drop: > 5 positions in 1 week
    if (
      rankingDropVelocity >= DECAY_DETECTION_THRESHOLDS.SUDDEN_DROP_MIN &&
      timeInDecay <= 1
    ) {
      return 'sudden';
    }

    // Competitor displacement: significant competitor gains
    if (competitorGains >= 3) {
      return 'competitor_displacement';
    }

    // Gradual decline: < 2 positions/week for 4+ weeks
    if (
      rankingDropVelocity < DECAY_DETECTION_THRESHOLDS.GRADUAL_VELOCITY_MAX &&
      timeInDecay >= DECAY_DETECTION_THRESHOLDS.GRADUAL_DURATION_MIN
    ) {
      return 'gradual';
    }

    // Default to gradual if in decline
    return 'gradual';
  }

  /**
   * Calculate decay severity score (0.0-1.0)
   */
  private calculateDecaySeverity(metrics: DecayMetrics, pattern: DecayPattern): number {
    const { rankingDropPercent, trafficDropPercent, timeInDecay } = metrics;

    let severity = 0;

    // Ranking impact (40% weight)
    severity += Math.min(rankingDropPercent / 100, 1.0) * 0.4;

    // Traffic impact (40% weight)
    severity += Math.min(trafficDropPercent / 100, 1.0) * 0.4;

    // Time in decay (20% weight)
    severity += Math.min(timeInDecay / 12, 1.0) * 0.2;

    // Pattern modifier
    if (pattern === 'sudden') severity *= 1.2;
    if (pattern === 'competitor_displacement') severity *= 1.15;

    return Math.min(severity, 1.0);
  }

  /**
   * Determine probable cause of decay
   */
  private determineCause(
    metrics: DecayMetrics,
    pattern: DecayPattern,
    history: ReadonlyArray<ContentPerformance>
  ): string {
    if (pattern === 'sudden') {
      return 'Likely algorithm update or sudden competitor surge';
    }

    if (pattern === 'competitor_displacement') {
      return 'Competitor content has surpassed ours in rankings';
    }

    if (metrics.daysSinceLastUpdate > 365) {
      return 'Content aging - outdated information reducing relevance';
    }

    if (metrics.timeInDecay > 8) {
      return 'Long-term decline - content no longer meeting user intent';
    }

    return 'Gradual competitive pressure and content drift';
  }

  /**
   * Generate timeline description
   */
  private generateTimeline(
    metrics: DecayMetrics,
    history: ReadonlyArray<ContentPerformance>
  ): string {
    const weeks = metrics.timeInDecay;
    const positionsLost = metrics.currentPosition - metrics.peakPosition;

    return `Declined ${positionsLost} positions over ${weeks} weeks (${metrics.rankingDropVelocity.toFixed(1)} pos/week)`;
  }

  /**
   * Calculate confidence in decay detection
   */
  private calculateDecayConfidence(
    metrics: DecayMetrics,
    history: ReadonlyArray<ContentPerformance>
  ): number {
    // More history = higher confidence
    const historyScore = Math.min(history.length / 12, 1.0) * 0.5;

    // Consistent decline = higher confidence
    const consistencyScore = metrics.timeInDecay > 4 ? 0.3 : 0.15;

    // Magnitude = higher confidence
    const magnitudeScore = Math.min(metrics.trafficDropPercent / 100, 1.0) * 0.2;

    return Math.min(historyScore + consistencyScore + magnitudeScore, 0.95);
  }

  /**
   * Extract decay metrics from single ContentPerformance
   */
  private extractDecayMetricsFromPerformance(performance: ContentPerformance): DecayMetrics {
    const now = new Date();
    const daysSinceLastUpdate = Math.floor(
      (now.getTime() - new Date(performance.publishedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      currentPosition: performance.metrics.ranking.averagePosition,
      peakPosition: performance.metrics.ranking.bestPosition,
      rankingDropPercent:
        ((performance.metrics.ranking.averagePosition - performance.metrics.ranking.bestPosition) /
          performance.metrics.ranking.bestPosition) *
        100,
      rankingDropVelocity: performance.metrics.ranking.trendDirection < 0 ? Math.abs(performance.metrics.ranking.trendDirection) : 0,
      currentTraffic: performance.metrics.traffic.totalClicks,
      peakTraffic: performance.metrics.traffic.peakDailyTraffic * 30, // Estimate monthly from daily peak
      trafficDropPercent: Math.abs(performance.metrics.traffic.changePercentage),
      competitorGains: 0, // Mock value
      timeInDecay: 1, // Mock value - need historical data
      daysSinceLastUpdate,
      measuredAt: performance.metricsUpdatedAt,
    };
  }

  /**
   * Create no-action recommendation
   */
  private createNoActionRecommendation(performance: ContentPerformance): RefreshRecommendation {
    return {
      action: 'no_action',
      priority: RefreshPriority.LOW,
      reason: 'Content is performing well, no refresh needed',
      expectedImpact: 'No expected changes',
      estimatedRankingRecovery: 0,
      estimatedTrafficRecovery: 0,
      deadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
      tasks: ['Monitor performance quarterly'],
      recommendedAt: new Date().toISOString(),
      confidence: 0.9,
    };
  }

  /**
   * Determine refresh action based on metrics and priority
   */
  private determineRefreshAction(metrics: DecayMetrics, priority: RefreshPriority): RefreshAction {
    if (priority === RefreshPriority.URGENT) {
      return metrics.trafficDropPercent > 60 ? 'full_rewrite' : 'content_update';
    }

    if (priority === RefreshPriority.HIGH) {
      return 'content_update';
    }

    if (priority === RefreshPriority.MEDIUM) {
      return metrics.daysSinceLastUpdate > 365 ? 'statistics_refresh' : 'technical_optimization';
    }

    return 'statistics_refresh';
  }

  /**
   * Generate refresh tasks for action
   */
  private generateRefreshTasks(action: RefreshAction, metrics: DecayMetrics): string[] {
    const tasks: string[] = [];

    switch (action) {
      case 'full_rewrite':
        tasks.push('Conduct competitor analysis for top 3 ranking content');
        tasks.push('Identify user intent gaps in current content');
        tasks.push('Rewrite content with updated information and structure');
        tasks.push('Update all statistics and references to current year');
        tasks.push('Optimize for featured snippets and PAA questions');
        break;

      case 'content_update':
        tasks.push('Update outdated statistics and data points');
        tasks.push('Add new sections addressing recent developments');
        tasks.push('Refresh examples and case studies');
        tasks.push('Update year references to current year');
        tasks.push('Improve internal linking to related content');
        break;

      case 'statistics_refresh':
        tasks.push('Update all numerical data to latest available');
        tasks.push('Replace outdated year references');
        tasks.push('Add recent industry reports or studies');
        tasks.push('Update publication date metadata');
        break;

      case 'technical_optimization':
        tasks.push('Improve page load speed');
        tasks.push('Optimize images and media');
        tasks.push('Enhance mobile responsiveness');
        tasks.push('Add or improve schema markup');
        tasks.push('Fix broken links');
        break;

      case 'competitor_analysis':
        tasks.push('Analyze top 3 ranking competitor content');
        tasks.push('Identify content gaps and opportunities');
        tasks.push('Benchmark content depth and quality');
        tasks.push('Update content to match or exceed competitor quality');
        break;

      default:
        tasks.push('Monitor performance');
    }

    return tasks;
  }

  /**
   * Calculate deadline based on priority
   */
  private calculateDeadline(priority: RefreshPriority): string {
    const now = new Date();
    let daysToAdd = 90; // Default 3 months

    switch (priority) {
      case RefreshPriority.URGENT:
        daysToAdd = 7; // 1 week
        break;
      case RefreshPriority.HIGH:
        daysToAdd = 14; // 2 weeks
        break;
      case RefreshPriority.MEDIUM:
        daysToAdd = 30; // 1 month
        break;
      case RefreshPriority.LOW:
        daysToAdd = 90; // 3 months
        break;
    }

    return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
  }

  /**
   * Generate reason for recommendation
   */
  private generateReason(metrics: DecayMetrics, priority: RefreshPriority): string {
    const positionsLost = metrics.currentPosition - metrics.peakPosition;

    if (priority === RefreshPriority.URGENT) {
      return `Critical decay: Lost ${positionsLost} positions and ${metrics.trafficDropPercent.toFixed(0)}% traffic in ${metrics.timeInDecay} weeks`;
    }

    if (priority === RefreshPriority.HIGH) {
      return `Significant decline: ${positionsLost} positions lost with ${metrics.trafficDropPercent.toFixed(0)}% traffic reduction`;
    }

    if (priority === RefreshPriority.MEDIUM) {
      return `Moderate decay detected or content is ${Math.floor(metrics.daysSinceLastUpdate / 30)} months old`;
    }

    return `Preventive refresh recommended for content ${Math.floor(metrics.daysSinceLastUpdate / 30)} months old`;
  }

  /**
   * Generate expected impact description
   */
  private generateExpectedImpact(metrics: DecayMetrics, action: RefreshAction): string {
    const recoveryPercent = this.estimateTrafficRecovery(metrics);

    return `Expected to recover ${recoveryPercent.toFixed(0)}% of lost traffic and improve rankings by ${this.estimateRankingRecovery(metrics)} positions`;
  }

  /**
   * Estimate ranking recovery potential
   */
  private estimateRankingRecovery(metrics: DecayMetrics): number {
    const positionsLost = metrics.currentPosition - metrics.peakPosition;

    // Can typically recover 60-80% of lost positions with refresh
    return Math.floor(positionsLost * 0.7);
  }

  /**
   * Estimate traffic recovery potential
   */
  private estimateTrafficRecovery(metrics: DecayMetrics): number {
    // Can typically recover 50-70% of lost traffic
    return Math.min(metrics.trafficDropPercent * 0.6, 100);
  }

  /**
   * Calculate recommendation confidence
   */
  private calculateRecommendationConfidence(
    metrics: DecayMetrics,
    priority: RefreshPriority
  ): number {
    let confidence = 0.7; // Base confidence

    // Higher priority = higher confidence in recommendation
    if (priority === RefreshPriority.URGENT) confidence = 0.95;
    if (priority === RefreshPriority.HIGH) confidence = 0.9;
    if (priority === RefreshPriority.MEDIUM) confidence = 0.85;

    // Adjust based on clarity of decay
    if (metrics.timeInDecay > 4) confidence += 0.05;
    if (metrics.trafficDropPercent > 40) confidence += 0.05;

    return Math.min(confidence, 0.98);
  }

  /**
   * Extract triggers from decay analysis
   */
  private extractTriggers(analysis: DecayAnalysis): string[] {
    const triggers: string[] = [];

    triggers.push(`${analysis.pattern} decay pattern detected`);
    triggers.push(`Severity: ${(analysis.severity * 100).toFixed(0)}%`);

    if (analysis.positionsLost >= 10) {
      triggers.push(`Critical ranking loss: ${analysis.positionsLost} positions`);
    }

    if (analysis.trafficLostPercent >= 50) {
      triggers.push(`Severe traffic decline: ${analysis.trafficLostPercent.toFixed(0)}%`);
    }

    if (analysis.weeksInDecay >= 8) {
      triggers.push(`Extended decay period: ${analysis.weeksInDecay} weeks`);
    }

    return triggers;
  }

  /**
   * Estimate effort hours for action
   */
  private estimateEffort(action: RefreshAction): number {
    switch (action) {
      case 'full_rewrite':
        return REFRESH_EFFORT_ESTIMATES.FULL_REWRITE;
      case 'content_update':
        return REFRESH_EFFORT_ESTIMATES.CONTENT_UPDATE;
      case 'statistics_refresh':
        return REFRESH_EFFORT_ESTIMATES.STATISTICS_REFRESH;
      case 'technical_optimization':
        return REFRESH_EFFORT_ESTIMATES.TECHNICAL_OPTIMIZATION;
      case 'competitor_analysis':
        return REFRESH_EFFORT_ESTIMATES.COMPETITOR_ANALYSIS;
      default:
        return 1;
    }
  }

  // ==========================================================================
  // REDIS STORAGE METHODS
  // ==========================================================================

  /**
   * Store decay analysis in Redis
   */
  private async storeDecayAnalysis(contentId: string, analysis: DecayAnalysis): Promise<void> {
    const key = `${REDIS_KEYS.DECAY_HISTORY}${contentId}`;
    await this.redis.lpush(key, JSON.stringify(analysis));
    await this.redis.ltrim(key, 0, 99); // Keep last 100 analyses
    await this.redis.expire(key, 86400 * 365); // 1 year TTL
  }

  /**
   * Store refresh schedule in Redis
   */
  private async storeRefreshSchedule(schedule: RefreshSchedule): Promise<void> {
    const key = `${REDIS_KEYS.REFRESH_SCHEDULE}${schedule.contentId}`;
    await this.redis.set(key, JSON.stringify(schedule));
    await this.redis.expire(key, 86400 * 180); // 6 months TTL
  }

  /**
   * Store freshness opportunities in Redis
   */
  private async storeFreshnessOpportunities(
    contentId: string,
    opportunities: FreshnessOpportunity[]
  ): Promise<void> {
    const key = `${REDIS_KEYS.FRESHNESS_OPPORTUNITIES}${contentId}`;
    await this.redis.set(key, JSON.stringify(opportunities));
    await this.redis.expire(key, 86400 * 90); // 90 days TTL
  }

  /**
   * Enqueue refresh workflow in Redis
   */
  private async enqueueRefreshWorkflow(schedule: RefreshSchedule): Promise<string> {
    const workflowId = `refresh-${schedule.contentId}-${Date.now()}`;
    const workflow = {
      workflowId,
      schedule,
      enqueuedAt: new Date().toISOString(),
    };
    await this.redis.lpush(REDIS_KEYS.WORKFLOW_QUEUE, JSON.stringify(workflow));
    return workflowId;
  }
}
