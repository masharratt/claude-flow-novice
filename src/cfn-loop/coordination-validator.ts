/**
 * Coordination Validator for CFN Loop Epic Execution
 *
 * Validates that coordinators actually used Redis pub/sub during epic execution
 * by collecting and analyzing coordination messages, events, and patterns.
 *
 * @module cfn-loop/coordination-validator
 */

import type { Redis } from 'ioredis';

/**
 * Coordination event captured during epic execution
 */
export interface CoordinationEvent {
  timestamp: number;
  channel: string;
  type: string;
  coordinatorId: string;
  data: any;
}

/**
 * Metrics collected from coordination activity
 */
export interface CoordinationMetrics {
  totalMessages: number;
  coordinators: string[];
  channelsUsed: string[];
  timeline: CoordinationEvent[];
  dependencyWaiting: boolean;
  interfacePublishing: boolean;
  agentLifecycleTracking: boolean;
  testCoordination: boolean;
}

/**
 * Validation issue found during analysis
 */
export interface ValidationIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  issue: string;
  description: string;
  recommendation?: string;
}

/**
 * Result of coordination validation
 */
export interface ValidationResult {
  valid: boolean;
  metrics: CoordinationMetrics;
  issues: ValidationIssue[];
  score: number; // 0.0 to 1.0
  timestamp: number;
}

/**
 * Configuration for coordination validator
 */
export interface CoordinationValidatorConfig {
  redis: Redis;
  requiredChannels?: string[];
  minMessages?: number;
  checkTimeline?: boolean;
  checkDependencies?: boolean;
}

/**
 * CoordinationValidator validates Redis pub/sub coordination during epic execution
 *
 * Collects coordination messages, validates patterns, and scores epic coordination quality.
 * Critical for verifying coordinators followed CFN Loop Rule #19 (Redis pub/sub mandatory).
 *
 * @example
 * ```typescript
 * const validator = new CoordinationValidator({ redis });
 * const result = await validator.validateEpicCoordination('epic-123');
 *
 * if (!result.valid) {
 *   console.log('Coordination issues:', result.issues);
 * }
 *
 * console.log('Coordination score:', result.score);
 * ```
 */
export class CoordinationValidator {
  private redis: Redis;
  private config: Required<CoordinationValidatorConfig>;

  constructor(config: CoordinationValidatorConfig) {
    this.redis = config.redis;
    this.config = {
      redis: config.redis,
      requiredChannels: config.requiredChannels || [
        'sprint:coordination',
        'agent:lifecycle',
        'interface:ready',
      ],
      minMessages: config.minMessages || 10,
      checkTimeline: config.checkTimeline !== false,
      checkDependencies: config.checkDependencies !== false,
    };
  }

  /**
   * Validate coordination for an epic execution
   *
   * @param epicId - Epic identifier to validate
   * @returns Validation result with metrics, issues, and score
   */
  async validateEpicCoordination(epicId: string): Promise<ValidationResult> {
    const metrics = await this.collectMetrics(epicId);
    const issues: ValidationIssue[] = [];

    // Check 1: Were there any pub/sub messages?
    if (metrics.totalMessages === 0) {
      issues.push({
        severity: 'critical',
        issue: 'No Redis pub/sub messages found',
        description:
          'Coordinators did not communicate via pub/sub (violates CFN Loop Rule #19)',
        recommendation:
          'Ensure all coordinators publish lifecycle events and coordination signals via Redis pub/sub',
      });
    } else if (metrics.totalMessages < this.config.minMessages) {
      issues.push({
        severity: 'high',
        issue: `Only ${metrics.totalMessages} messages (minimum: ${this.config.minMessages})`,
        description: 'Coordination activity appears minimal',
        recommendation: 'Increase coordinator communication frequency',
      });
    }

    // Check 2: Were all required channels used?
    for (const channel of this.config.requiredChannels) {
      if (!metrics.channelsUsed.includes(channel)) {
        issues.push({
          severity: 'high',
          issue: `Missing channel: ${channel}`,
          description: 'Required coordination channel not used',
          recommendation: `Add ${channel} channel to coordinator communication patterns`,
        });
      }
    }

    // Check 3: Timeline validation (claims before spawns)
    if (this.config.checkTimeline) {
      const timelineValid = this.validateTimeline(metrics.timeline);
      if (!timelineValid) {
        issues.push({
          severity: 'high',
          issue: 'Invalid coordination timeline',
          description: 'Events out of order (e.g., spawn before claim)',
          recommendation: 'Ensure proper event ordering: claim → spawn → complete',
        });
      }
    }

    // Check 4: Dependency coordination
    if (this.config.checkDependencies && !metrics.dependencyWaiting) {
      issues.push({
        severity: 'medium',
        issue: 'No dependency waiting detected',
        description: 'Dependent sprints may not have waited for dependencies',
        recommendation:
          'Add dependency signals and waiting patterns to coordinator logic',
      });
    }

    // Check 5: Interface publishing
    if (this.config.checkDependencies && !metrics.interfacePublishing) {
      issues.push({
        severity: 'medium',
        issue: 'No interface publishing detected',
        description: 'Sprints did not publish interfaces for dependent sprints',
        recommendation:
          'Publish interface completion signals when sprints complete',
      });
    }

    // Check 6: Agent lifecycle tracking
    if (!metrics.agentLifecycleTracking) {
      issues.push({
        severity: 'low',
        issue: 'No agent lifecycle tracking detected',
        description: 'Agent spawning/completion not tracked via pub/sub',
        recommendation: 'Add agent:lifecycle events to coordination messages',
      });
    }

    // Check 7: Test coordination
    if (!metrics.testCoordination) {
      issues.push({
        severity: 'low',
        issue: 'No test coordination detected',
        description: 'Test execution not coordinated via pub/sub',
        recommendation:
          'Add test:coordination events for parallel test execution',
      });
    }

    const score = this.calculateScore(metrics, issues);

    return {
      valid: issues.filter((i) => i.severity === 'critical').length === 0,
      metrics,
      issues,
      score,
      timestamp: Date.now(),
    };
  }

  /**
   * Collect coordination metrics from Redis
   *
   * @param epicId - Epic identifier
   * @returns Coordination metrics
   */
  private async collectMetrics(epicId: string): Promise<CoordinationMetrics> {
    // Collect all pub/sub messages from Redis
    const messageKeys = await this.redis.keys(
      `coordination:messages:${epicId}:*`
    );

    if (messageKeys.length === 0) {
      // Return empty metrics if no messages found
      return {
        totalMessages: 0,
        coordinators: [],
        channelsUsed: [],
        timeline: [],
        dependencyWaiting: false,
        interfacePublishing: false,
        agentLifecycleTracking: false,
        testCoordination: false,
      };
    }

    const messages = await Promise.all(
      messageKeys.map(async (k) => {
        const value = await this.redis.get(k);
        return value ? JSON.parse(value) : null;
      })
    );

    const validMessages = messages.filter((m) => m !== null);

    // Parse timeline and sort by timestamp
    const timeline: CoordinationEvent[] = validMessages
      .map((m) => ({
        timestamp: m.timestamp || Date.now(),
        channel: m.channel || 'unknown',
        type: m.type || 'unknown',
        coordinatorId: m.coordinatorId || m.agent || 'unknown',
        data: m.data || m,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    // Extract coordinators (unique)
    const coordinators = [
      ...new Set(timeline.map((e) => e.coordinatorId)),
    ].filter((id) => id !== 'unknown');

    // Extract channels used (unique)
    const channelsUsed = [
      ...new Set(timeline.map((e) => e.channel)),
    ].filter((ch) => ch !== 'unknown');

    // Check for specific patterns
    const dependencyWaiting = timeline.some(
      (e) =>
        e.type === 'waiting:dependency' ||
        e.type === 'dependency:wait' ||
        e.data?.action === 'wait' ||
        e.data?.waiting === true
    );

    const interfacePublishing = timeline.some(
      (e) =>
        e.type === 'interface:published' ||
        e.type === 'interface:ready' ||
        e.channel === 'interface:ready'
    );

    const agentLifecycleTracking = timeline.some(
      (e) =>
        e.channel === 'agent:lifecycle' ||
        e.type === 'agent:spawned' ||
        e.type === 'agent:completed'
    );

    const testCoordination = timeline.some(
      (e) =>
        e.channel === 'test:coordination' ||
        e.type === 'test:start' ||
        e.type === 'test:complete'
    );

    return {
      totalMessages: validMessages.length,
      coordinators,
      channelsUsed,
      timeline,
      dependencyWaiting,
      interfacePublishing,
      agentLifecycleTracking,
      testCoordination,
    };
  }

  /**
   * Validate timeline ordering (claim → spawn → complete)
   *
   * @param timeline - Coordination event timeline
   * @returns True if timeline is valid
   */
  private validateTimeline(timeline: CoordinationEvent[]): boolean {
    // Ensure proper order: claim → spawn → complete
    const sprints = new Map<
      string,
      { claimed?: number; spawned?: number; completed?: number }
    >();

    for (const event of timeline) {
      const sprintId =
        event.data?.sprintId || event.data?.sprint || event.data?.id;
      if (!sprintId) continue;

      if (!sprints.has(sprintId)) {
        sprints.set(sprintId, {});
      }

      const sprint = sprints.get(sprintId)!;

      if (event.type === 'claim' || event.type === 'sprint:claim') {
        sprint.claimed = event.timestamp;
      }
      if (
        event.type === 'sprint:start' ||
        event.type === 'sprint:spawned' ||
        event.type === 'spawned'
      ) {
        sprint.spawned = event.timestamp;
      }
      if (
        event.type === 'sprint:complete' ||
        event.type === 'completed' ||
        event.type === 'complete'
      ) {
        sprint.completed = event.timestamp;
      }
    }

    // Validate order for each sprint
    for (const [sprintId, times] of sprints) {
      if (times.claimed && times.spawned && times.claimed > times.spawned) {
        return false; // Spawned before claimed
      }
      if (times.spawned && times.completed && times.spawned > times.completed) {
        return false; // Completed before spawned
      }
    }

    return true;
  }

  /**
   * Calculate coordination score (0.0 to 1.0)
   *
   * @param metrics - Coordination metrics
   * @param issues - Validation issues
   * @returns Score from 0.0 to 1.0
   */
  private calculateScore(
    metrics: CoordinationMetrics,
    issues: ValidationIssue[]
  ): number {
    let score = 1.0;

    // Deduct for issues
    for (const issue of issues) {
      if (issue.severity === 'critical') score -= 0.3;
      if (issue.severity === 'high') score -= 0.15;
      if (issue.severity === 'medium') score -= 0.05;
      if (issue.severity === 'low') score -= 0.02;
    }

    // Bonus for good practices
    if (metrics.totalMessages > 100) score += 0.05;
    if (metrics.totalMessages > 500) score += 0.05;
    if (metrics.dependencyWaiting) score += 0.05;
    if (metrics.interfacePublishing) score += 0.05;
    if (metrics.agentLifecycleTracking) score += 0.05;
    if (metrics.testCoordination) score += 0.03;
    if (metrics.coordinators.length >= 5) score += 0.03;
    if (metrics.channelsUsed.length >= 5) score += 0.03;

    return Math.max(0, Math.min(1.0, score));
  }

  /**
   * Get coordination summary for epic
   *
   * @param epicId - Epic identifier
   * @returns Human-readable summary
   */
  async getCoordinationSummary(epicId: string): Promise<string> {
    const result = await this.validateEpicCoordination(epicId);

    const passEmoji = result.valid ? '✅' : '❌';
    const scorePercent = (result.score * 100).toFixed(1);

    let summary = `
Coordination Validation: ${passEmoji}
Epic: ${epicId}
Score: ${scorePercent}%

Metrics:
- Messages: ${result.metrics.totalMessages}
- Coordinators: ${result.metrics.coordinators.length}
- Channels: ${result.metrics.channelsUsed.join(', ')}
- Dependency Waiting: ${result.metrics.dependencyWaiting ? '✅' : '❌'}
- Interface Publishing: ${result.metrics.interfacePublishing ? '✅' : '❌'}
- Agent Lifecycle: ${result.metrics.agentLifecycleTracking ? '✅' : '❌'}
- Test Coordination: ${result.metrics.testCoordination ? '✅' : '❌'}
`;

    if (result.issues.length > 0) {
      summary += '\nIssues:\n';
      for (const issue of result.issues) {
        const emoji =
          issue.severity === 'critical'
            ? '🚨'
            : issue.severity === 'high'
            ? '⚠️'
            : issue.severity === 'medium'
            ? '💡'
            : 'ℹ️';
        summary += `${emoji} [${issue.severity.toUpperCase()}] ${issue.issue}\n`;
        summary += `   ${issue.description}\n`;
        if (issue.recommendation) {
          summary += `   → ${issue.recommendation}\n`;
        }
      }
    }

    return summary;
  }
}

export default CoordinationValidator;
