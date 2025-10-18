/**
 * Epic Report Generator with Coordination Validation
 *
 * Generates comprehensive epic completion reports including:
 * - Coordination validation results
 * - Timeline analysis
 * - Sprint summaries
 * - Consensus scores
 * - Issue tracking
 *
 * @module cfn-loop/epic-report-generator
 */

import type { Redis } from 'ioredis';
import {
  CoordinationValidator,
  type ValidationResult,
  type CoordinationEvent,
} from './coordination-validator.js';

/**
 * Sprint summary information
 */
export interface SprintSummary {
  sprintId: string;
  name: string;
  status: 'completed' | 'failed' | 'in-progress';
  confidence: number;
  consensusScore: number;
  startTime: number;
  endTime: number;
  duration: number;
  agents: string[];
  deliverables: string[];
}

/**
 * Epic metadata
 */
export interface EpicMetadata {
  epicId: string;
  name: string;
  description?: string;
  startTime: number;
  endTime: number;
  totalDuration: number;
  sprints: SprintSummary[];
  totalAgents: number;
  overallConfidence: number;
  overallConsensus: number;
}

/**
 * Complete epic report
 */
export interface EpicReport {
  metadata: EpicMetadata;
  validation: ValidationResult;
  summary: string;
  markdown: string;
  timestamp: number;
}

/**
 * Configuration for epic report generator
 */
export interface EpicReportGeneratorConfig {
  redis: Redis;
  includeTimeline?: boolean;
  maxTimelineEvents?: number;
  includeIssues?: boolean;
  includeRecommendations?: boolean;
}

/**
 * EpicReportGenerator generates comprehensive epic completion reports
 *
 * Uses CoordinationValidator to verify Redis pub/sub coordination
 * and formats results into human-readable markdown reports.
 *
 * @example
 * ```typescript
 * const generator = new EpicReportGenerator({ redis });
 * const report = await generator.generateReport('epic-123');
 *
 * console.log(report.markdown);
 * ```
 */
export class EpicReportGenerator {
  private redis: Redis;
  private validator: CoordinationValidator;
  private config: Required<EpicReportGeneratorConfig>;

  constructor(config: EpicReportGeneratorConfig) {
    this.redis = config.redis;
    this.validator = new CoordinationValidator({ redis: config.redis });
    this.config = {
      redis: config.redis,
      includeTimeline: config.includeTimeline !== false,
      maxTimelineEvents: config.maxTimelineEvents || 10,
      includeIssues: config.includeIssues !== false,
      includeRecommendations: config.includeRecommendations !== false,
    };
  }

  /**
   * Generate complete epic report
   *
   * @param epicId - Epic identifier
   * @returns Complete epic report with validation
   */
  async generateReport(epicId: string): Promise<EpicReport> {
    // Collect epic metadata
    const metadata = await this.collectEpicMetadata(epicId);

    // Run coordination validation
    const validation = await this.validator.validateEpicCoordination(epicId);

    // Generate summary
    const summary = this.generateSummary(metadata, validation);

    // Generate markdown report
    const markdown = this.generateMarkdown(metadata, validation);

    return {
      metadata,
      validation,
      summary,
      markdown,
      timestamp: Date.now(),
    };
  }

  /**
   * Collect epic metadata from Redis
   *
   * @param epicId - Epic identifier
   * @returns Epic metadata
   */
  private async collectEpicMetadata(epicId: string): Promise<EpicMetadata> {
    // Get epic metadata from Redis
    const epicKey = `epic:${epicId}:metadata`;
    const epicDataRaw = await this.redis.get(epicKey);

    let epicData: any = {};
    if (epicDataRaw) {
      try {
        epicData = JSON.parse(epicDataRaw);
      } catch (e) {
        console.warn(`Failed to parse epic metadata for ${epicId}:`, e);
      }
    }

    // Collect sprint summaries
    const sprintKeys = await this.redis.keys(`epic:${epicId}:sprint:*`);
    const sprints: SprintSummary[] = [];

    for (const key of sprintKeys) {
      const sprintDataRaw = await this.redis.get(key);
      if (!sprintDataRaw) continue;

      try {
        const sprintData = JSON.parse(sprintDataRaw);
        sprints.push({
          sprintId: sprintData.sprintId || key.split(':').pop() || 'unknown',
          name: sprintData.name || 'Unknown Sprint',
          status: sprintData.status || 'completed',
          confidence: sprintData.confidence || 0,
          consensusScore: sprintData.consensusScore || 0,
          startTime: sprintData.startTime || 0,
          endTime: sprintData.endTime || Date.now(),
          duration: sprintData.duration || 0,
          agents: sprintData.agents || [],
          deliverables: sprintData.deliverables || [],
        });
      } catch (e) {
        console.warn(`Failed to parse sprint data for ${key}:`, e);
      }
    }

    // Calculate overall metrics
    const totalAgents = new Set(sprints.flatMap((s) => s.agents)).size;
    const overallConfidence =
      sprints.length > 0
        ? sprints.reduce((sum, s) => sum + s.confidence, 0) / sprints.length
        : 0;
    const overallConsensus =
      sprints.length > 0
        ? sprints.reduce((sum, s) => sum + s.consensusScore, 0) /
          sprints.length
        : 0;

    const startTime =
      sprints.length > 0
        ? Math.min(...sprints.map((s) => s.startTime))
        : Date.now();
    const endTime =
      sprints.length > 0
        ? Math.max(...sprints.map((s) => s.endTime))
        : Date.now();

    return {
      epicId,
      name: epicData.name || `Epic ${epicId}`,
      description: epicData.description,
      startTime,
      endTime,
      totalDuration: endTime - startTime,
      sprints: sprints.sort((a, b) => a.startTime - b.startTime),
      totalAgents,
      overallConfidence,
      overallConsensus,
    };
  }

  /**
   * Generate text summary
   *
   * @param metadata - Epic metadata
   * @param validation - Validation result
   * @returns Text summary
   */
  private generateSummary(
    metadata: EpicMetadata,
    validation: ValidationResult
  ): string {
    const passEmoji = validation.valid ? '✅' : '❌';
    const scorePercent = (validation.score * 100).toFixed(1);
    const confidencePercent = (metadata.overallConfidence * 100).toFixed(1);
    const consensusPercent = (metadata.overallConsensus * 100).toFixed(1);

    return `Epic ${metadata.epicId} ${passEmoji}
Score: ${scorePercent}% | Confidence: ${confidencePercent}% | Consensus: ${consensusPercent}%
Sprints: ${metadata.sprints.length} | Agents: ${metadata.totalAgents} | Messages: ${validation.metrics.totalMessages}`;
  }

  /**
   * Generate markdown report
   *
   * @param metadata - Epic metadata
   * @param validation - Validation result
   * @returns Markdown report
   */
  private generateMarkdown(
    metadata: EpicMetadata,
    validation: ValidationResult
  ): string {
    const passEmoji = validation.valid ? '✅' : '❌';
    const scorePercent = (validation.score * 100).toFixed(1);
    const confidencePercent = (metadata.overallConfidence * 100).toFixed(1);
    const consensusPercent = (metadata.overallConsensus * 100).toFixed(1);

    let markdown = `# Epic Completion Report: ${metadata.name}

**Epic ID**: ${metadata.epicId}
**Status**: ${passEmoji} ${validation.valid ? 'PASSED' : 'FAILED'}
**Generated**: ${new Date(validation.timestamp).toISOString()}

## Summary

- **Overall Score**: ${scorePercent}%
- **Confidence**: ${confidencePercent}%
- **Consensus**: ${consensusPercent}%
- **Sprints**: ${metadata.sprints.length}
- **Agents**: ${metadata.totalAgents}
- **Duration**: ${this.formatDuration(metadata.totalDuration)}

## Coordination Validation

**Validation Score**: ${scorePercent}% ${passEmoji}

### Metrics

- **Total Messages**: ${validation.metrics.totalMessages}
- **Coordinators**: ${validation.metrics.coordinators.length} (${validation.metrics.coordinators.join(', ')})
- **Channels Used**: ${validation.metrics.channelsUsed.join(', ')}
- **Dependency Waiting**: ${validation.metrics.dependencyWaiting ? '✅' : '❌'}
- **Interface Publishing**: ${validation.metrics.interfacePublishing ? '✅' : '❌'}
- **Agent Lifecycle**: ${validation.metrics.agentLifecycleTracking ? '✅' : '❌'}
- **Test Coordination**: ${validation.metrics.testCoordination ? '✅' : '❌'}

`;

    // Add issues section
    if (this.config.includeIssues && validation.issues.length > 0) {
      markdown += `### Issues Found\n\n`;
      for (const issue of validation.issues) {
        const emoji =
          issue.severity === 'critical'
            ? '🚨'
            : issue.severity === 'high'
            ? '⚠️'
            : issue.severity === 'medium'
            ? '💡'
            : 'ℹ️';
        markdown += `${emoji} **[${issue.severity.toUpperCase()}]** ${issue.issue}\n`;
        markdown += `> ${issue.description}\n`;
        if (this.config.includeRecommendations && issue.recommendation) {
          markdown += `> **Recommendation**: ${issue.recommendation}\n`;
        }
        markdown += '\n';
      }
    }

    // Add timeline sample
    if (this.config.includeTimeline && validation.metrics.timeline.length > 0) {
      markdown += `### Timeline Sample (First ${this.config.maxTimelineEvents} Events)\n\n`;
      const sample = validation.metrics.timeline.slice(
        0,
        this.config.maxTimelineEvents
      );
      for (const event of sample) {
        const time = new Date(event.timestamp).toISOString();
        markdown += `- **[${time}]** \`${event.channel}\` - ${event.type} (${event.coordinatorId})\n`;
      }
      markdown += '\n';
    }

    // Add sprint summaries
    markdown += `## Sprint Summaries\n\n`;
    for (const sprint of metadata.sprints) {
      const sprintEmoji =
        sprint.status === 'completed'
          ? '✅'
          : sprint.status === 'failed'
          ? '❌'
          : '⏳';
      const sprintConfidence = (sprint.confidence * 100).toFixed(1);
      const sprintConsensus = (sprint.consensusScore * 100).toFixed(1);

      markdown += `### ${sprintEmoji} ${sprint.name}\n\n`;
      markdown += `- **Sprint ID**: ${sprint.sprintId}\n`;
      markdown += `- **Status**: ${sprint.status}\n`;
      markdown += `- **Confidence**: ${sprintConfidence}%\n`;
      markdown += `- **Consensus**: ${sprintConsensus}%\n`;
      markdown += `- **Duration**: ${this.formatDuration(sprint.duration)}\n`;
      markdown += `- **Agents**: ${sprint.agents.length} (${sprint.agents.join(', ')})\n`;
      markdown += `- **Deliverables**: ${sprint.deliverables.length}\n`;
      markdown += '\n';
    }

    // Add footer
    markdown += `---

**Report Generated**: ${new Date().toISOString()}
**CFN Loop Version**: 2.0
**Coordination Protocol**: Redis pub/sub (Rule #19)
`;

    return markdown;
  }

  /**
   * Format duration in human-readable format
   *
   * @param ms - Duration in milliseconds
   * @returns Formatted duration
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Save report to Redis
   *
   * @param epicId - Epic identifier
   * @param report - Epic report
   */
  async saveReport(epicId: string, report: EpicReport): Promise<void> {
    const key = `epic:${epicId}:report`;
    await this.redis.setex(key, 86400, JSON.stringify(report)); // 24 hour TTL
  }

  /**
   * Load report from Redis
   *
   * @param epicId - Epic identifier
   * @returns Epic report or null if not found
   */
  async loadReport(epicId: string): Promise<EpicReport | null> {
    const key = `epic:${epicId}:report`;
    const data = await this.redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (e) {
      console.warn(`Failed to parse epic report for ${epicId}:`, e);
      return null;
    }
  }
}

export default EpicReportGenerator;
