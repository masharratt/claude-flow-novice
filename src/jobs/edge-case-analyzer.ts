/**
 * Edge Case Analyzer Job
 *
 * Analyzes edge cases to detect patterns and generate dashboard data.
 * Part of Task 1.5: MVP Edge Case Feedback Loop
 *
 * Features:
 * - Pattern detection across multiple edge cases
 * - Common error substring extraction
 * - Common input pattern detection
 * - Severity aggregation
 * - Dashboard data generation
 * - Scheduled analysis (cron job ready)
 *
 * Usage:
 *   const analyzer = new EdgeCaseAnalyzer(dbService, logger);
 *   const report = await analyzer.analyzeEdgeCases();
 *   const patterns = await analyzer.generatePatterns();
 */

import { DatabaseService, OperationResult } from '../lib/database-service';
import { createLogger, Logger } from '../lib/logging';
import { createError, ErrorCode } from '../lib/errors';
import { generateShortCorrelationId } from '../lib/correlation';
import type { EdgeCase, ErrorCategory, Severity } from './edge-case-detector';

/**
 * Analysis report
 */
export interface AnalysisReport {
  timestamp: Date;
  totalEdgeCases: number;
  newEdgeCases: number;
  patternsDetected: number;
  topFailures: TopFailure[];
  highSeverityFailures: HighSeverityFailure[];
  trends: FailureTrend[];
}

/**
 * Top failure record
 */
export interface TopFailure {
  skill_id: string;
  error_type: ErrorCategory;
  total_failures: number;
  max_severity: Severity;
  unique_cases: number;
  most_recent: Date;
}

/**
 * High severity failure record
 */
export interface HighSeverityFailure {
  id: string;
  skill_id: string;
  error_type: ErrorCategory;
  severity: Severity;
  error_message: string;
  occurrence_count: number;
  last_seen: Date;
}

/**
 * Failure trend record
 */
export interface FailureTrend {
  date: string;
  error_type: ErrorCategory;
  new_failures: number;
  total_occurrences: number;
}

/**
 * Failure pattern
 */
export interface FailurePattern {
  pattern_id: string;
  skill_id: string;
  error_type: ErrorCategory;
  occurrence_count: number;
  common_errors: string[];
  common_inputs: string[];
  severity: Severity;
  suggested_fix: string | null;
  status: 'detected' | 'analyzing' | 'fixed' | 'ignored';
  first_detected: Date;
  last_updated: Date;
}

/**
 * Analyzer configuration
 */
export interface AnalyzerConfig {
  /** Minimum occurrences to form a pattern (default: 3) */
  minPatternOccurrences?: number;
  /** Maximum patterns to detect per run (default: 50) */
  maxPatterns?: number;
  /** Minimum substring length for common errors (default: 10) */
  minSubstringLength?: number;
}

/**
 * Edge case analyzer service
 */
export class EdgeCaseAnalyzer {
  private logger: Logger;
  private config: Required<AnalyzerConfig>;

  constructor(
    private dbService: DatabaseService,
    logger?: Logger,
    config?: AnalyzerConfig
  ) {
    this.logger = logger || createLogger('edge-case-analyzer');

    // Set default config
    this.config = {
      minPatternOccurrences: config?.minPatternOccurrences ?? 3,
      maxPatterns: config?.maxPatterns ?? 50,
      minSubstringLength: config?.minSubstringLength ?? 10,
    };
  }

  /**
   * Analyze all edge cases and generate comprehensive report
   *
   * @returns Analysis report
   */
  async analyzeEdgeCases(): Promise<AnalysisReport> {
    this.logger.info('Starting edge case analysis');

    try {
      const sqlite = this.dbService.getAdapter('sqlite');

      // Get total edge cases
      const totalResult = await sqlite.raw<any[]>(
        'SELECT COUNT(*) as count FROM edge_cases'
      );
      const totalEdgeCases = Array.isArray(totalResult) && totalResult[0]
        ? totalResult[0].count
        : 0;

      // Get new edge cases
      const newResult = await sqlite.raw<any[]>(
        'SELECT COUNT(*) as count FROM edge_cases WHERE status = "new"'
      );
      const newEdgeCases = Array.isArray(newResult) && newResult[0]
        ? newResult[0].count
        : 0;

      // Get top failures
      const topFailures = await this.getTopFailures();

      // Get high severity failures
      const highSeverityFailures = await this.getHighSeverityFailures();

      // Get failure trends
      const trends = await this.getFailureTrends();

      // Generate patterns
      const patterns = await this.generatePatterns();
      const patternsDetected = patterns.length;

      const report: AnalysisReport = {
        timestamp: new Date(),
        totalEdgeCases,
        newEdgeCases,
        patternsDetected,
        topFailures,
        highSeverityFailures,
        trends,
      };

      this.logger.info('Edge case analysis complete', {
        totalEdgeCases,
        newEdgeCases,
        patternsDetected,
      });

      return report;
    } catch (error) {
      this.logger.error('Failed to analyze edge cases', error as Error);
      throw createError(
        ErrorCode.UNKNOWN_ERROR,
        'Edge case analysis failed',
        undefined,
        error as Error
      );
    }
  }

  /**
   * Generate failure patterns from edge cases
   *
   * @returns Array of detected patterns
   */
  async generatePatterns(): Promise<FailurePattern[]> {
    this.logger.info('Generating failure patterns');

    try {
      const sqlite = this.dbService.getAdapter('sqlite');

      // 1. Query all edge cases
      const edgeCases = await this.getAllNewEdgeCases();

      if (edgeCases.length === 0) {
        this.logger.debug('No edge cases to analyze');
        return [];
      }

      // 2. Group by error type and skill
      const groups = this.groupEdgeCases(edgeCases);

      // 3. Find patterns
      const patterns: FailurePattern[] = [];

      for (const [key, cases] of Object.entries(groups)) {
        if (cases.length < this.config.minPatternOccurrences) {
          continue; // Need ≥minPatternOccurrences occurrences
        }

        const [skill_id, error_type] = key.split(':');

        // Extract common patterns
        const commonErrors = this.findCommonSubstrings(
          cases.map(c => c.error_message)
        );
        const commonInputs = this.findCommonInputPatterns(cases);
        const severity = this.calculateAverageSeverity(cases);

        const pattern: FailurePattern = {
          pattern_id: `pattern-${generateShortCorrelationId()}`,
          skill_id,
          error_type: error_type as ErrorCategory,
          occurrence_count: cases.length,
          common_errors: commonErrors,
          common_inputs: commonInputs,
          severity,
          suggested_fix: null, // Phase 2 feature
          status: 'detected',
          first_detected: new Date(),
          last_updated: new Date(),
        };

        patterns.push(pattern);

        // Store pattern in database
        await this.storePattern(pattern);
      }

      this.logger.info(`Generated ${patterns.length} patterns`);

      return patterns.slice(0, this.config.maxPatterns);
    } catch (error) {
      this.logger.error('Failed to generate patterns', error as Error);
      throw createError(
        ErrorCode.UNKNOWN_ERROR,
        'Pattern generation failed',
        undefined,
        error as Error
      );
    }
  }

  /**
   * Get top failures by skill and error type
   */
  private async getTopFailures(): Promise<TopFailure[]> {
    const sqlite = this.dbService.getAdapter('sqlite');

    const query = `
      SELECT
        skill_id,
        error_type,
        SUM(occurrence_count) as total_failures,
        MAX(severity) as max_severity,
        COUNT(*) as unique_cases,
        MAX(last_seen) as most_recent
      FROM edge_cases
      WHERE status = 'new'
      GROUP BY skill_id, error_type
      ORDER BY total_failures DESC
      LIMIT 10
    `;

    const rows = await sqlite.raw<any[]>(query);

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map(row => ({
      skill_id: row.skill_id,
      error_type: row.error_type as ErrorCategory,
      total_failures: row.total_failures,
      max_severity: row.max_severity as Severity,
      unique_cases: row.unique_cases,
      most_recent: new Date(row.most_recent),
    }));
  }

  /**
   * Get high severity failures
   */
  private async getHighSeverityFailures(): Promise<HighSeverityFailure[]> {
    const sqlite = this.dbService.getAdapter('sqlite');

    const query = `
      SELECT
        id,
        skill_id,
        error_type,
        severity,
        error_message,
        occurrence_count,
        last_seen
      FROM edge_cases
      WHERE severity IN ('critical', 'high')
        AND status = 'new'
      ORDER BY last_seen DESC, occurrence_count DESC
      LIMIT 20
    `;

    const rows = await sqlite.raw<any[]>(query);

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map(row => ({
      id: row.id,
      skill_id: row.skill_id,
      error_type: row.error_type as ErrorCategory,
      severity: row.severity as Severity,
      error_message: row.error_message,
      occurrence_count: row.occurrence_count,
      last_seen: new Date(row.last_seen),
    }));
  }

  /**
   * Get failure trends (last 30 days)
   */
  private async getFailureTrends(): Promise<FailureTrend[]> {
    const sqlite = this.dbService.getAdapter('sqlite');

    const query = `
      SELECT
        DATE(first_seen) as date,
        error_type,
        COUNT(*) as new_failures,
        SUM(occurrence_count) as total_occurrences
      FROM edge_cases
      WHERE first_seen >= datetime('now', '-30 days')
      GROUP BY DATE(first_seen), error_type
      ORDER BY date DESC
    `;

    const rows = await sqlite.raw<any[]>(query);

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map(row => ({
      date: row.date,
      error_type: row.error_type as ErrorCategory,
      new_failures: row.new_failures,
      total_occurrences: row.total_occurrences,
    }));
  }

  /**
   * Get all new edge cases
   */
  private async getAllNewEdgeCases(): Promise<EdgeCase[]> {
    const sqlite = this.dbService.getAdapter('sqlite');

    const query = 'SELECT * FROM edge_cases WHERE status = "new"';
    const rows = await sqlite.raw<any[]>(query);

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map(row => this.mapRowToEdgeCase(row));
  }

  /**
   * Group edge cases by skill and error type
   */
  private groupEdgeCases(edgeCases: EdgeCase[]): Record<string, EdgeCase[]> {
    const groups: Record<string, EdgeCase[]> = {};

    for (const edgeCase of edgeCases) {
      const key = `${edgeCase.skill_id}:${edgeCase.error_type}`;

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(edgeCase);
    }

    return groups;
  }

  /**
   * Find common substrings in error messages
   */
  private findCommonSubstrings(messages: string[]): string[] {
    if (messages.length < 2) {
      return messages;
    }

    const substrings: Set<string> = new Set();

    // Find substrings in first message
    const firstMessage = messages[0];
    for (let i = 0; i < firstMessage.length; i++) {
      for (let j = i + this.config.minSubstringLength; j <= firstMessage.length; j++) {
        const substring = firstMessage.substring(i, j);

        // Check if substring appears in all messages
        if (messages.every(msg => msg.includes(substring))) {
          substrings.add(substring);
        }
      }
    }

    // Return longest substrings (remove substrings that are part of longer ones)
    const sorted = Array.from(substrings).sort((a, b) => b.length - a.length);
    const result: string[] = [];

    for (const substring of sorted) {
      const isSubstringOfExisting = result.some(existing => existing.includes(substring));
      if (!isSubstringOfExisting) {
        result.push(substring);
      }
    }

    return result.slice(0, 5); // Top 5 common substrings
  }

  /**
   * Find common input patterns
   */
  private findCommonInputPatterns(edgeCases: EdgeCase[]): string[] {
    const patterns: Set<string> = new Set();

    // Extract input fields that appear in all cases
    const inputObjects = edgeCases.map(ec => {
      try {
        return JSON.parse(ec.input_context);
      } catch {
        return {};
      }
    });

    if (inputObjects.length === 0) {
      return [];
    }

    // Find common keys
    const firstKeys = Object.keys(inputObjects[0]);
    for (const key of firstKeys) {
      if (inputObjects.every(obj => key in obj)) {
        patterns.add(`common_field: ${key}`);
      }
    }

    // Find common values
    for (const key of firstKeys) {
      const values = inputObjects.map(obj => obj[key]).filter(v => v !== undefined);
      const uniqueValues = new Set(values.map(v => JSON.stringify(v)));

      if (uniqueValues.size === 1) {
        patterns.add(`common_value: ${key}=${values[0]}`);
      }
    }

    return Array.from(patterns).slice(0, 10); // Top 10 patterns
  }

  /**
   * Calculate average severity
   */
  private calculateAverageSeverity(edgeCases: EdgeCase[]): Severity {
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const severityScores = edgeCases.map(ec =>
      severityOrder.indexOf(ec.severity)
    );

    const avgScore = severityScores.reduce((a, b) => a + b, 0) / severityScores.length;
    const roundedScore = Math.round(avgScore);

    return severityOrder[roundedScore] as Severity;
  }

  /**
   * Store pattern in database
   */
  private async storePattern(pattern: FailurePattern): Promise<void> {
    const sqlite = this.dbService.getAdapter('sqlite');

    const result: OperationResult = await sqlite.insert('failure_patterns', {
      id: pattern.pattern_id,
      skill_id: pattern.skill_id,
      error_type: pattern.error_type,
      common_errors: JSON.stringify(pattern.common_errors),
      common_inputs: JSON.stringify(pattern.common_inputs),
      occurrence_count: pattern.occurrence_count,
      severity: pattern.severity,
      suggested_fix: pattern.suggested_fix,
      status: pattern.status,
      first_detected: pattern.first_detected.toISOString(),
      last_updated: pattern.last_updated.toISOString(),
      metadata: JSON.stringify({}),
    });

    if (!result.success) {
      this.logger.warn('Failed to store pattern', {
        pattern_id: pattern.pattern_id,
        error: result.error,
      });
    }
  }

  /**
   * Map database row to EdgeCase object
   */
  private mapRowToEdgeCase(row: any): EdgeCase {
    return {
      id: row.id,
      skill_id: row.skill_id,
      error_type: row.error_type as ErrorCategory,
      severity: row.severity as Severity,
      error_message: row.error_message,
      stack_trace: row.stack_trace,
      input_context: row.input_context,
      output_context: row.output_context,
      first_seen: new Date(row.first_seen),
      last_seen: new Date(row.last_seen),
      occurrence_count: row.occurrence_count,
      status: row.status as any,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    };
  }
}
