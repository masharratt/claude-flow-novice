/**
 * Edge Case Detector Service
 *
 * Detects and categorizes skill execution failures for continuous improvement.
 * Part of Task 1.5: MVP Edge Case Feedback Loop
 *
 * Features:
 * - Automatic failure detection from skill executions
 * - Error categorization (syntax, runtime, validation, timeout, dependency)
 * - Severity calculation based on frequency and impact
 * - Context capture (input, output, stack trace)
 * - Integration with edge case deduplicator
 *
 * Usage:
 *   const detector = new EdgeCaseDetector(dbService, logger);
 *   const edgeCase = await detector.detectFailure(execution);
 */

import { DatabaseService, OperationResult } from '../lib/database-service.js';
import { createLogger, Logger } from '../lib/logging.js';
import { createError, ErrorCode, StandardError, wrapError } from '../lib/errors.js';
import { generateCorrelationId, generateShortCorrelationId } from '../lib/correlation.js';
import { EdgeCaseDeduplicator } from './edge-case-deduplicator.js';

/**
 * Error categories for skill execution failures
 */
export enum ErrorCategory {
  SYNTAX = 'syntax',           // Parse errors, invalid code
  RUNTIME = 'runtime',         // Execution failures
  VALIDATION = 'validation',   // Input validation errors
  TIMEOUT = 'timeout',         // Execution timeout
  DEPENDENCY = 'dependency',   // Missing dependencies
  UNKNOWN = 'unknown',         // Uncategorized
}

/**
 * Severity levels for edge cases
 */
export enum Severity {
  LOW = 'low',                 // Rare, non-blocking
  MEDIUM = 'medium',           // Occasional, impacts quality
  HIGH = 'high',               // Frequent, blocks execution
  CRITICAL = 'critical',       // Systemic, requires immediate fix
}

/**
 * Skill execution context
 */
export interface SkillExecution {
  skill_id: string;
  agent_id?: string;
  task_id?: string;
  input: Record<string, any>;
  output?: string;
  success: boolean;
  error?: Error | StandardError;
  timestamp: Date;
  duration_ms?: number;
}

/**
 * Edge case record
 */
export interface EdgeCase {
  id: string;
  skill_id: string;
  error_type: ErrorCategory;
  severity: Severity;
  error_message: string;
  stack_trace?: string;
  input_context: string;      // JSON string
  output_context?: string;
  first_seen: Date;
  last_seen: Date;
  occurrence_count: number;
  status: 'new' | 'acknowledged' | 'fixed' | 'ignored';
  metadata: Record<string, any>;
}

/**
 * Edge case detector configuration
 */
export interface EdgeCaseDetectorConfig {
  /** Enable automatic deduplication (default: true) */
  enableDeduplication?: boolean;
  /** Minimum severity to track (default: LOW) */
  minSeverity?: Severity;
  /** Custom error categorization rules */
  customRules?: ErrorCategorizationRule[];
}

/**
 * Custom error categorization rule
 */
export interface ErrorCategorizationRule {
  /** Pattern to match in error message */
  pattern: RegExp;
  /** Category to assign if pattern matches */
  category: ErrorCategory;
  /** Severity to assign if pattern matches */
  severity?: Severity;
}

/**
 * Edge case detector service
 */
export class EdgeCaseDetector {
  private logger: Logger;
  private deduplicator: EdgeCaseDeduplicator;
  private config: Required<EdgeCaseDetectorConfig>;

  constructor(
    private dbService: DatabaseService,
    logger?: Logger,
    config?: EdgeCaseDetectorConfig
  ) {
    this.logger = logger || createLogger('edge-case-detector');
    this.deduplicator = new EdgeCaseDeduplicator(dbService, this.logger);

    // Set default config
    this.config = {
      enableDeduplication: config?.enableDeduplication ?? true,
      minSeverity: config?.minSeverity ?? Severity.LOW,
      customRules: config?.customRules ?? [],
    };
  }

  /**
   * Detect failure from skill execution
   *
   * @param execution - Skill execution context
   * @returns Edge case if failure detected, null otherwise
   */
  async detectFailure(execution: SkillExecution): Promise<EdgeCase | null> {
    try {
      // 1. Check if execution failed
      if (execution.success) {
        this.logger.debug('Execution succeeded, no edge case detected', {
          skill_id: execution.skill_id,
        });
        return null;
      }

      if (!execution.error) {
        this.logger.warn('Execution marked as failed but no error provided', {
          skill_id: execution.skill_id,
        });
        return null;
      }

      // 2. Extract error information
      const error = execution.error;
      const category = this.categorizeError(error);
      const severity = this.calculateSeverity(category, execution);

      // 3. Check minimum severity threshold
      if (this.shouldIgnoreSeverity(severity)) {
        this.logger.debug('Edge case below minimum severity threshold', {
          skill_id: execution.skill_id,
          severity,
          minSeverity: this.config.minSeverity,
        });
        return null;
      }

      // 4. Extract error details
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stackTrace = error instanceof Error ? error.stack : undefined;

      // 5. Capture context
      const edgeCase: EdgeCase = {
        id: `edge-${generateShortCorrelationId()}`,
        skill_id: execution.skill_id,
        error_type: category,
        severity,
        error_message: errorMessage,
        stack_trace: stackTrace,
        input_context: JSON.stringify(execution.input),
        output_context: execution.output,
        first_seen: execution.timestamp,
        last_seen: execution.timestamp,
        occurrence_count: 1,
        status: 'new',
        metadata: {
          agent_id: execution.agent_id,
          task_id: execution.task_id,
          duration_ms: execution.duration_ms,
          timestamp: execution.timestamp.toISOString(),
        },
      };

      this.logger.info('Edge case detected', {
        edge_case_id: edgeCase.id,
        skill_id: edgeCase.skill_id,
        error_type: category,
        severity,
      });

      // 6. Deduplicate if enabled
      if (this.config.enableDeduplication) {
        const isDuplicate = await this.deduplicator.deduplicateEdgeCase(edgeCase);

        if (isDuplicate) {
          this.logger.debug('Edge case is duplicate, incrementing occurrence count', {
            edge_case_id: edgeCase.id,
          });
          return null; // Already tracked
        }
      }

      // 7. Store new edge case
      await this.storeEdgeCase(edgeCase);

      return edgeCase;
    } catch (error) {
      this.logger.error('Failed to detect edge case', error as Error, {
        skill_id: execution.skill_id,
      });
      throw wrapError(error, 'EDGE_CASE_DETECTION_FAILED');
    }
  }

  /**
   * Categorize error into predefined categories
   *
   * @param error - Error to categorize
   * @returns Error category
   */
  categorizeError(error: Error | StandardError): ErrorCategory {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    // Check custom rules first
    for (const rule of this.config.customRules) {
      if (rule.pattern.test(error.message)) {
        this.logger.debug('Error matched custom rule', {
          pattern: rule.pattern.toString(),
          category: rule.category,
        });
        return rule.category;
      }
    }

    // Syntax errors
    if (
      errorName.includes('syntax') ||
      errorMessage.includes('syntax error') ||
      errorMessage.includes('parse error') ||
      errorMessage.includes('unexpected token')
    ) {
      return ErrorCategory.SYNTAX;
    }

    // Validation errors
    if (
      errorName.includes('validation') ||
      errorMessage.includes('invalid input') ||
      errorMessage.includes('validation failed') ||
      errorMessage.includes('required field') ||
      errorMessage.includes('expected')
    ) {
      return ErrorCategory.VALIDATION;
    }

    // Timeout errors
    if (
      errorName.includes('timeout') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out') ||
      errorMessage.includes('deadline exceeded')
    ) {
      return ErrorCategory.TIMEOUT;
    }

    // Dependency errors
    if (
      errorMessage.includes('cannot find module') ||
      errorMessage.includes('module not found') ||
      errorMessage.includes('enoent') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('missing dependency')
    ) {
      return ErrorCategory.DEPENDENCY;
    }

    // Runtime errors (default for most execution failures)
    if (
      errorName.includes('error') ||
      errorMessage.includes('runtime') ||
      errorMessage.includes('execution failed')
    ) {
      return ErrorCategory.RUNTIME;
    }

    // Unknown
    return ErrorCategory.UNKNOWN;
  }

  /**
   * Calculate severity based on error category and execution context
   *
   * @param category - Error category
   * @param execution - Skill execution context
   * @returns Severity level
   */
  private calculateSeverity(
    category: ErrorCategory,
    execution: SkillExecution
  ): Severity {
    // Base severity by category
    let severity: Severity;

    switch (category) {
      case ErrorCategory.SYNTAX:
        severity = Severity.HIGH; // Syntax errors block execution
        break;
      case ErrorCategory.VALIDATION:
        severity = Severity.MEDIUM; // Validation errors are fixable
        break;
      case ErrorCategory.TIMEOUT:
        severity = Severity.MEDIUM; // Timeouts may be transient
        break;
      case ErrorCategory.DEPENDENCY:
        severity = Severity.HIGH; // Missing dependencies block execution
        break;
      case ErrorCategory.RUNTIME:
        severity = Severity.MEDIUM; // Runtime errors vary in impact
        break;
      case ErrorCategory.UNKNOWN:
        severity = Severity.LOW; // Unknown errors need investigation
        break;
    }

    // Upgrade severity if error message indicates critical issue
    if (execution.error) {
      const message = execution.error.message.toLowerCase();
      if (
        message.includes('critical') ||
        message.includes('fatal') ||
        message.includes('segmentation fault') ||
        message.includes('out of memory')
      ) {
        severity = Severity.CRITICAL;
      }
    }

    return severity;
  }

  /**
   * Check if severity should be ignored based on threshold
   */
  private shouldIgnoreSeverity(severity: Severity): boolean {
    const severityOrder = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL];
    const currentIndex = severityOrder.indexOf(severity);
    const minIndex = severityOrder.indexOf(this.config.minSeverity);

    return currentIndex < minIndex;
  }

  /**
   * Store edge case in database
   */
  private async storeEdgeCase(edgeCase: EdgeCase): Promise<void> {
    const sqlite = this.dbService.getAdapter('sqlite');

    const result: OperationResult = await sqlite.insert('edge_cases', {
      id: edgeCase.id,
      skill_id: edgeCase.skill_id,
      error_type: edgeCase.error_type,
      severity: edgeCase.severity,
      error_message: edgeCase.error_message,
      stack_trace: edgeCase.stack_trace,
      input_context: edgeCase.input_context,
      output_context: edgeCase.output_context,
      first_seen: edgeCase.first_seen.toISOString(),
      last_seen: edgeCase.last_seen.toISOString(),
      occurrence_count: edgeCase.occurrence_count,
      status: edgeCase.status,
      metadata: JSON.stringify(edgeCase.metadata),
    });

    if (!result.success) {
      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to store edge case',
        { edge_case_id: edgeCase.id },
        result.error as Error
      );
    }

    this.logger.info('Edge case stored successfully', {
      edge_case_id: edgeCase.id,
    });
  }

  /**
   * Get edge case by ID
   */
  async getEdgeCase(id: string): Promise<EdgeCase | null> {
    const sqlite = this.dbService.getAdapter('sqlite');
    const query = 'SELECT * FROM edge_cases WHERE id = ? LIMIT 1';
    const rows = await sqlite.raw<any[]>(query, [id]);

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    return this.mapRowToEdgeCase(rows[0]);
  }

  /**
   * List all edge cases with optional filtering
   */
  async listEdgeCases(filters?: {
    skill_id?: string;
    error_type?: ErrorCategory;
    severity?: Severity;
    status?: 'new' | 'acknowledged' | 'fixed' | 'ignored';
    limit?: number;
  }): Promise<EdgeCase[]> {
    const sqlite = this.dbService.getAdapter('sqlite');

    const queryFilters: any[] = [];

    if (filters?.skill_id) {
      queryFilters.push({ field: 'skill_id', operator: 'eq', value: filters.skill_id });
    }
    if (filters?.error_type) {
      queryFilters.push({ field: 'error_type', operator: 'eq', value: filters.error_type });
    }
    if (filters?.severity) {
      queryFilters.push({ field: 'severity', operator: 'eq', value: filters.severity });
    }
    if (filters?.status) {
      queryFilters.push({ field: 'status', operator: 'eq', value: filters.status });
    }

    const rows = await sqlite.list<any>('edge_cases', {
      filters: queryFilters,
      limit: filters?.limit || 100,
      orderBy: 'last_seen' as any,
      order: 'desc',
    });

    return rows.map(row => this.mapRowToEdgeCase(row));
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
