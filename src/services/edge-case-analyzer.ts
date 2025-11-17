/**
 * Edge Case Analyzer
 * Part of Task 5.1: Edge Case Analyzer & Skill Patcher
 *
 * Analyzes skill execution failures to identify patterns and categorize edge cases.
 * Supports pattern matching, confidence scoring, and failure statistics.
 *
 * Features:
 * - Automatic failure categorization (syntax, logic, timeout, validation, unknown)
 * - Pattern matching for similar failures
 * - Confidence scoring based on failure frequency
 * - Integration with DatabaseService
 * - Performance optimized (<500ms for pattern matching)
 *
 * Usage:
 *   const analyzer = new EdgeCaseAnalyzer({ dbPath: './edge-cases.db' });
 *   const pattern = await analyzer.analyzeFailure(error, { skillId: 'my-skill' });
 *   console.log(`Detected ${pattern.category} with ${pattern.confidence} confidence`);
 */

import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { createLogger } from '../lib/logging';
import { StandardError, ErrorCode, createError } from '../lib/errors';

const logger = createLogger('edge-case-analyzer');

/**
 * Failure category classification
 */
export enum FailureCategory {
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  LOGIC_ERROR = 'LOGIC_ERROR',
  TIMEOUT = 'TIMEOUT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Failure record
 */
export interface Failure {
  id: string;
  skillId: string;
  category: FailureCategory;
  errorMessage: string;
  stackTrace: string;
  context: Record<string, any>;
  detectedAt: Date;
  patternHash: string;
  confidence?: number;
}

/**
 * Failure pattern with statistics
 */
export interface FailurePattern {
  category: FailureCategory;
  patternHash: string;
  failureCount: number;
  confidence: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  skillIds: string[];
}

/**
 * Failure statistics
 */
export interface FailureStats {
  totalFailures: number;
  byCategory: Record<string, number>;
  uniquePatterns: number;
  topPatterns: Array<{
    patternHash: string;
    count: number;
    category: FailureCategory;
  }>;
}

/**
 * Analyzer configuration
 */
export interface EdgeCaseAnalyzerConfig {
  dbPath: string;
}

/**
 * Edge Case Analyzer Service
 */
export class EdgeCaseAnalyzer {
  private db: Database.Database;

  constructor(config: EdgeCaseAnalyzerConfig) {
    this.db = new Database(config.dbPath);
    this.initializeDatabase();
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edge_cases (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        category TEXT NOT NULL,
        error_message TEXT,
        stack_trace TEXT,
        context TEXT,
        detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
        pattern_hash TEXT,
        confidence REAL
      );

      CREATE INDEX IF NOT EXISTS idx_edge_cases_skill ON edge_cases(skill_id);
      CREATE INDEX IF NOT EXISTS idx_edge_cases_category ON edge_cases(category);
      CREATE INDEX IF NOT EXISTS idx_edge_cases_pattern ON edge_cases(pattern_hash);
    `);
  }

  /**
   * Categorize failure based on error type and context
   *
   * Performance target: <200ms
   */
  categorizeFailure(error: Error, context: any): FailureCategory {
    const startTime = Date.now();

    try {
      // Check for syntax errors
      if (error instanceof SyntaxError) {
        logger.debug('Categorized as SYNTAX_ERROR', { error: error.message });
        return FailureCategory.SYNTAX_ERROR;
      }

      // Check for timeout errors
      if (
        error instanceof StandardError &&
        (error.code === ErrorCode.OPERATION_TIMEOUT || error.code === ErrorCode.DB_TIMEOUT)
      ) {
        logger.debug('Categorized as TIMEOUT', { error: error.message });
        return FailureCategory.TIMEOUT;
      }

      if (error.message && /timeout|timed out/i.test(error.message)) {
        logger.debug('Categorized as TIMEOUT from message', { error: error.message });
        return FailureCategory.TIMEOUT;
      }

      // Check for validation errors
      if (
        error instanceof StandardError &&
        (error.code === ErrorCode.VALIDATION_FAILED ||
          error.code === ErrorCode.INVALID_INPUT ||
          error.code === ErrorCode.DB_VALIDATION_FAILED)
      ) {
        logger.debug('Categorized as VALIDATION_ERROR', { error: error.message });
        return FailureCategory.VALIDATION_ERROR;
      }

      // Check for null/undefined errors (validation)
      if (
        error instanceof TypeError &&
        (error.message.includes('null') ||
          error.message.includes('undefined') ||
          error.message.includes('Cannot read property'))
      ) {
        logger.debug('Categorized as VALIDATION_ERROR (null/undefined)', {
          error: error.message,
        });
        return FailureCategory.VALIDATION_ERROR;
      }

      // Check for logic errors (file not found, reference errors, etc.)
      if (error instanceof ReferenceError) {
        logger.debug('Categorized as LOGIC_ERROR (ReferenceError)', { error: error.message });
        return FailureCategory.LOGIC_ERROR;
      }

      if (
        error instanceof StandardError &&
        (error.code === ErrorCode.FILE_NOT_FOUND || error.code === ErrorCode.FILE_WRITE_FAILED)
      ) {
        logger.debug('Categorized as LOGIC_ERROR (file operation)', { error: error.message });
        return FailureCategory.LOGIC_ERROR;
      }

      // Default to unknown
      logger.debug('Categorized as UNKNOWN', { error: error.message });
      return FailureCategory.UNKNOWN;
    } finally {
      const duration = Date.now() - startTime;
      logger.debug('Categorization completed', { durationMs: duration });
    }
  }

  /**
   * Find similar failures by skill and category
   *
   * Performance target: <500ms
   */
  findSimilarFailures(failure: Failure): Failure[] {
    const startTime = Date.now();

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM edge_cases
        WHERE skill_id = ?
          AND category = ?
          AND id != ?
        ORDER BY detected_at DESC
        LIMIT 10
      `);

      const rows = stmt.all(failure.skillId, failure.category, failure.id) as any[];

      const similar = rows.map(row => ({
        id: row.id,
        skillId: row.skill_id,
        category: row.category as FailureCategory,
        errorMessage: row.error_message,
        stackTrace: row.stack_trace,
        context: JSON.parse(row.context || '{}'),
        detectedAt: new Date(row.detected_at),
        patternHash: row.pattern_hash,
        confidence: row.confidence,
      }));

      logger.debug('Found similar failures', {
        count: similar.length,
        durationMs: Date.now() - startTime,
      });

      return similar;
    } catch (error) {
      logger.error('Failed to find similar failures', error as Error);
      return [];
    }
  }

  /**
   * Calculate confidence score based on failure frequency
   *
   * Formula:
   * - 0 failures: 0.0
   * - 1 failure: 0.5
   * - 2-3 failures: 0.6-0.7
   * - 4-6 failures: 0.75-0.85
   * - 7-10 failures: 0.85-0.95
   * - 10+ failures: 0.95+
   */
  calculatePatternConfidence(failures: Failure[]): number {
    if (failures.length === 0) {
      return 0;
    }

    if (failures.length === 1) {
      return 0.5;
    }

    if (failures.length <= 3) {
      return 0.6 + failures.length * 0.05;
    }

    if (failures.length <= 6) {
      return 0.75 + (failures.length - 3) * 0.03;
    }

    if (failures.length <= 10) {
      return 0.85 + (failures.length - 6) * 0.025;
    }

    return Math.min(0.98, 0.95 + (failures.length - 10) * 0.01);
  }

  /**
   * Generate pattern hash from error message and category
   */
  private generatePatternHash(category: FailureCategory, errorMessage: string): string {
    // Normalize error message (remove numbers, paths, etc.)
    const normalized = errorMessage
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/\/[^\s]*/g, '/PATH') // Replace file paths
      .replace(/at [^\n]*/g, 'at LOCATION') // Replace stack locations
      .toLowerCase();

    const hashInput = `${category}:${normalized}`;
    return crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
  }

  /**
   * Analyze failure and detect patterns
   *
   * Returns failure pattern with confidence score
   */
  async analyzeFailure(error: Error, context: any): Promise<FailurePattern> {
    const startTime = Date.now();

    // Categorize the failure
    const category = this.categorizeFailure(error, context);

    // Generate pattern hash
    const patternHash = this.generatePatternHash(category, error.message);

    // Create failure record
    const failure: Failure = {
      id: crypto.randomUUID(),
      skillId: context.skillId || 'unknown',
      category,
      errorMessage: error.message,
      stackTrace: error.stack || '',
      context,
      detectedAt: new Date(),
      patternHash,
    };

    // Find similar failures
    const similar = this.findSimilarFailures(failure);

    // Calculate confidence
    const allFailures = [failure, ...similar];
    const confidence = this.calculatePatternConfidence(allFailures);

    // Store failure
    this.db
      .prepare(
        `
      INSERT INTO edge_cases (id, skill_id, category, error_message, stack_trace, context, pattern_hash, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        failure.id,
        failure.skillId,
        failure.category,
        failure.errorMessage,
        failure.stackTrace,
        JSON.stringify(failure.context),
        failure.patternHash,
        confidence
      );

    // Build pattern
    const skillIds = Array.from(new Set([failure.skillId, ...similar.map(f => f.skillId)]));

    const pattern: FailurePattern = {
      category,
      patternHash,
      failureCount: allFailures.length,
      confidence,
      firstSeenAt: similar.length > 0 ? similar[similar.length - 1].detectedAt : failure.detectedAt,
      lastSeenAt: failure.detectedAt,
      skillIds,
    };

    logger.info('Failure analyzed', {
      category,
      confidence,
      failureCount: allFailures.length,
      durationMs: Date.now() - startTime,
    });

    return pattern;
  }

  /**
   * Get failure statistics
   */
  getFailureStats(skillId?: string): FailureStats {
    const whereClause = skillId ? 'WHERE skill_id = ?' : '';
    const params = skillId ? [skillId] : [];

    // Total failures
    const totalStmt = this.db.prepare(`SELECT COUNT(*) as count FROM edge_cases ${whereClause}`);
    const totalResult = totalStmt.get(...params) as any;
    const totalFailures = totalResult.count;

    // By category
    const categoryStmt = this.db.prepare(`
      SELECT category, COUNT(*) as count
      FROM edge_cases
      ${whereClause}
      GROUP BY category
    `);
    const categoryResults = categoryStmt.all(...params) as any[];

    const byCategory: Record<string, number> = {};
    for (const row of categoryResults) {
      byCategory[row.category] = row.count;
    }

    // Unique patterns
    const patternsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT pattern_hash) as count
      FROM edge_cases
      ${whereClause}
    `);
    const patternsResult = patternsStmt.get(...params) as any;
    const uniquePatterns = patternsResult.count;

    // Top patterns
    const topStmt = this.db.prepare(`
      SELECT pattern_hash, category, COUNT(*) as count
      FROM edge_cases
      ${whereClause}
      GROUP BY pattern_hash, category
      ORDER BY count DESC
      LIMIT 5
    `);
    const topResults = topStmt.all(...params) as any[];

    const topPatterns = topResults.map(row => ({
      patternHash: row.pattern_hash,
      count: row.count,
      category: row.category as FailureCategory,
    }));

    return {
      totalFailures,
      byCategory,
      uniquePatterns,
      topPatterns,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
