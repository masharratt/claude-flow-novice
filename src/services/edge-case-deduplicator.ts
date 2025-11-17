/**
 * Edge Case Deduplicator Service
 *
 * Deduplicates edge cases to prevent redundant tracking.
 * Part of Task 1.5: MVP Edge Case Feedback Loop
 *
 * Features:
 * - Similarity detection using Levenshtein distance
 * - Pattern matching for error messages and stack traces
 * - Configurable similarity threshold (default: 90%)
 * - Occurrence count tracking
 * - Smart deduplication based on skill + error type + message similarity
 *
 * Usage:
 *   const deduplicator = new EdgeCaseDeduplicator(dbService, logger);
 *   const isDuplicate = await deduplicator.deduplicateEdgeCase(edgeCase);
 */

import { DatabaseService, OperationResult } from '../lib/database-service.js';
import { createLogger, Logger } from '../lib/logging.js';
import { createError, ErrorCode } from '../lib/errors.js';
import type { EdgeCase, ErrorCategory } from './edge-case-detector.js';

/**
 * Deduplicator configuration
 */
export interface DeduplicatorConfig {
  /** Similarity threshold (0.0 - 1.0, default: 0.90) */
  similarityThreshold?: number;
  /** Maximum age of edge cases to consider for deduplication (days, default: 30) */
  maxAgedays?: number;
  /** Maximum number of candidates to check (default: 50) */
  maxCandidates?: number;
}

/**
 * Similarity score breakdown
 */
export interface SimilarityScore {
  total: number;
  skillAndType: number;
  messageMatch: number;
  stackMatch: number;
}

/**
 * Edge case deduplicator service
 */
export class EdgeCaseDeduplicator {
  private logger: Logger;
  private config: Required<DeduplicatorConfig>;

  constructor(
    private dbService: DatabaseService,
    logger?: Logger,
    config?: DeduplicatorConfig
  ) {
    this.logger = logger || createLogger('edge-case-deduplicator');

    // Set default config
    this.config = {
      similarityThreshold: config?.similarityThreshold ?? 0.90,
      maxAgedays: config?.maxAgedays ?? 30,
      maxCandidates: config?.maxCandidates ?? 50,
    };
  }

  /**
   * Deduplicate edge case against existing records
   *
   * @param edgeCase - Edge case to deduplicate
   * @returns True if duplicate found and handled, false otherwise
   */
  async deduplicateEdgeCase(edgeCase: EdgeCase): Promise<boolean> {
    try {
      // 1. Find similar failures
      const similar = await this.findSimilarFailures(edgeCase);

      if (similar.length === 0) {
        this.logger.debug('No similar edge cases found', {
          skill_id: edgeCase.skill_id,
          error_type: edgeCase.error_type,
        });
        return false;
      }

      this.logger.debug(`Found ${similar.length} similar edge cases`, {
        skill_id: edgeCase.skill_id,
        error_type: edgeCase.error_type,
      });

      // 2. Calculate similarity scores
      for (const candidate of similar) {
        const score = this.calculateSimilarity(edgeCase, candidate);

        this.logger.debug('Similarity score calculated', {
          candidate_id: candidate.id,
          total_score: score.total,
          threshold: this.config.similarityThreshold,
        });

        // 3. If >threshold% similar, it's a duplicate
        if (score.total >= this.config.similarityThreshold) {
          this.logger.info('Duplicate edge case found', {
            edge_case_id: edgeCase.id,
            duplicate_of: candidate.id,
            similarity_score: score.total,
          });

          // Update existing edge case
          await this.incrementOccurrenceCount(candidate.id);
          return true;
        }
      }

      // No duplicates found
      return false;
    } catch (error) {
      this.logger.error('Failed to deduplicate edge case', error as Error, {
        edge_case_id: edgeCase.id,
      });
      // Don't throw - allow edge case to be stored even if deduplication fails
      return false;
    }
  }

  /**
   * Find similar failures based on skill and error type
   *
   * @param edgeCase - Edge case to find similar failures for
   * @returns Array of similar edge cases
   */
  async findSimilarFailures(edgeCase: EdgeCase): Promise<EdgeCase[]> {
    const sqlite = this.dbService.getAdapter('sqlite');

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxAgedays);

    // Query for similar edge cases
    const query = `
      SELECT *
      FROM edge_cases
      WHERE skill_id = ?
        AND error_type = ?
        AND status = 'new'
        AND last_seen >= ?
      ORDER BY occurrence_count DESC, last_seen DESC
      LIMIT ?
    `;

    const rows = await sqlite.raw<any[]>(query, [
      edgeCase.skill_id,
      edgeCase.error_type,
      cutoffDate.toISOString(),
      this.config.maxCandidates,
    ]);

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map(row => this.mapRowToEdgeCase(row));
  }

  /**
   * Calculate similarity between two edge cases
   *
   * Similarity breakdown:
   * - Same skill + error type: 40%
   * - Error message similarity: 30%
   * - Stack trace similarity: 30%
   *
   * @param a - First edge case
   * @param b - Second edge case
   * @returns Similarity score (0.0 - 1.0)
   */
  calculateSimilarity(a: EdgeCase, b: EdgeCase): SimilarityScore {
    let score = 0;
    const breakdown: SimilarityScore = {
      total: 0,
      skillAndType: 0,
      messageMatch: 0,
      stackMatch: 0,
    };

    // Same skill + error type = 40%
    if (a.skill_id === b.skill_id && a.error_type === b.error_type) {
      score += 0.40;
      breakdown.skillAndType = 0.40;
    }

    // Similar error message = 30%
    const messageSimilarity = this.computeLevenshteinSimilarity(
      a.error_message,
      b.error_message
    );
    const messageScore = messageSimilarity * 0.30;
    score += messageScore;
    breakdown.messageMatch = messageScore;

    // Similar stack trace = 30%
    const stackA = a.stack_trace || '';
    const stackB = b.stack_trace || '';
    const stackSimilarity = this.computeLevenshteinSimilarity(stackA, stackB);
    const stackScore = stackSimilarity * 0.30;
    score += stackScore;
    breakdown.stackMatch = stackScore;

    breakdown.total = score;
    return breakdown;
  }

  /**
   * Compute Levenshtein similarity (normalized)
   *
   * @param a - First string
   * @param b - Second string
   * @returns Similarity score (0.0 - 1.0)
   */
  private computeLevenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (!a || !b) return 0.0;

    const distance = this.levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);

    if (maxLength === 0) return 1.0;

    return 1.0 - distance / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   *
   * @param a - First string
   * @param b - Second string
   * @returns Edit distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Increment occurrence count for existing edge case
   *
   * @param edgeCaseId - Edge case ID
   */
  private async incrementOccurrenceCount(edgeCaseId: string): Promise<void> {
    const sqlite = this.dbService.getAdapter('sqlite');

    const query = `
      UPDATE edge_cases
      SET occurrence_count = occurrence_count + 1,
          last_seen = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const result = await sqlite.raw(query, [edgeCaseId]);

    this.logger.info('Incremented occurrence count', {
      edge_case_id: edgeCaseId,
    });
  }

  /**
   * Get deduplication statistics
   */
  async getStats(): Promise<{
    totalEdgeCases: number;
    uniqueSkills: number;
    avgOccurrenceCount: number;
    mostFrequentFailure: {
      id: string;
      skill_id: string;
      error_type: string;
      occurrence_count: number;
    } | null;
  }> {
    const sqlite = this.dbService.getAdapter('sqlite');

    // Total edge cases
    const totalResult = await sqlite.raw<any>(
      'SELECT COUNT(*) as count FROM edge_cases WHERE status = "new"'
    );
    const totalEdgeCases = Array.isArray(totalResult) && totalResult[0]
      ? totalResult[0].count
      : 0;

    // Unique skills
    const uniqueResult = await sqlite.raw<any>(
      'SELECT COUNT(DISTINCT skill_id) as count FROM edge_cases WHERE status = "new"'
    );
    const uniqueSkills = Array.isArray(uniqueResult) && uniqueResult[0]
      ? uniqueResult[0].count
      : 0;

    // Average occurrence count
    const avgResult = await sqlite.raw<any>(
      'SELECT AVG(occurrence_count) as avg FROM edge_cases WHERE status = "new"'
    );
    const avgOccurrenceCount = Array.isArray(avgResult) && avgResult[0]
      ? avgResult[0].avg || 0
      : 0;

    // Most frequent failure
    const frequentResult = await sqlite.raw<any>(
      `SELECT id, skill_id, error_type, occurrence_count
       FROM edge_cases
       WHERE status = 'new'
       ORDER BY occurrence_count DESC
       LIMIT 1`
    );
    const mostFrequentFailure = Array.isArray(frequentResult) && frequentResult[0]
      ? frequentResult[0]
      : null;

    return {
      totalEdgeCases,
      uniqueSkills,
      avgOccurrenceCount,
      mostFrequentFailure,
    };
  }

  /**
   * Map database row to EdgeCase object
   */
  private mapRowToEdgeCase(row: any): EdgeCase {
    return {
      id: row.id,
      skill_id: row.skill_id,
      error_type: row.error_type as ErrorCategory,
      severity: row.severity as any,
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
