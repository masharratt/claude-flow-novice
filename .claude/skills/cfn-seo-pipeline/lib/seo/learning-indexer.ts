/**
 * Learning Data Indexer - RuVector Integration
 *
 * Indexes SEO pipeline learning captures into RuVector for semantic search
 * and pattern analysis.
 *
 * @module lib/seo/learning-indexer
 * @version 1.0.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MockVectorDB } from './lib/ruvector-core';
import type { VectorDB } from './types/ruvector-core';

/**
 * Learning capture interface (matches planning/seo/types)
 */
export interface LearningCapture {
  /** Outcome classification */
  outcome: 'success' | 'failure';

  /** Topic or keyword targeted */
  topic: string;

  /** Execution context */
  context: {
    targetKeyword: string;
    approach: string;
    metrics: Record<string, number>;
  };

  /** Lessons learned */
  lessons: string[];

  /** Recommendations for future runs */
  recommendations: string[];

  /** Capture timestamp */
  capturedAt: string | Date;
}

/**
 * Learning indexer configuration
 */
export interface LearningIndexerConfig {
  /** Path to knowledge store root */
  knowledgeStorePath?: string;

  /** RuVector instance (defaults to MockVectorDB) */
  vectorDB?: VectorDB;

  /** Collection name for learning data */
  collectionName?: string;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Learning data indexer for RuVector
 */
export class LearningIndexer {
  private knowledgeStorePath: string;
  private vectorDB: VectorDB;
  private collectionName: string;
  private verbose: boolean;

  constructor(config: LearningIndexerConfig = {}) {
    this.knowledgeStorePath =
      config.knowledgeStorePath ||
      path.join(__dirname, 'knowledge-store');
    this.vectorDB = config.vectorDB || new MockVectorDB('learning-captures');
    this.collectionName = config.collectionName || 'learning-captures';
    this.verbose = config.verbose ?? false;
  }

  /**
   * Index all learning files from knowledge store
   *
   * @param deleteAfterIndexing - Delete JSON files after successful indexing (default: true)
   * @returns Stats about indexed data
   */
  async indexAllLearnings(deleteAfterIndexing: boolean = true): Promise<{
    successCount: number;
    failureCount: number;
    totalIndexed: number;
    deletedCount: number;
    errors: string[];
  }> {
    const stats = {
      successCount: 0,
      failureCount: 0,
      totalIndexed: 0,
      deletedCount: 0,
      errors: [] as string[],
    };

    if (this.verbose) {
      console.log('[LearningIndexer] Starting indexing process...');
      console.log(`[LearningIndexer] Delete after indexing: ${deleteAfterIndexing}`);
    }

    try {
      // Index successes
      const successDir = path.join(this.knowledgeStorePath, 'learning/successes');
      const successFiles = await this.getLearningFiles(successDir);

      for (const file of successFiles) {
        try {
          await this.indexLearningFile(file, 'success');
          stats.successCount++;

          // Delete JSON file after successful indexing
          if (deleteAfterIndexing) {
            await fs.unlink(file);
            stats.deletedCount++;
          }
        } catch (error) {
          stats.errors.push(`Failed to index ${file}: ${error}`);
        }
      }

      // Index failures
      const failureDir = path.join(this.knowledgeStorePath, 'learning/failures');
      const failureFiles = await this.getLearningFiles(failureDir);

      for (const file of failureFiles) {
        try {
          await this.indexLearningFile(file, 'failure');
          stats.failureCount++;

          // Delete JSON file after successful indexing
          if (deleteAfterIndexing) {
            await fs.unlink(file);
            stats.deletedCount++;
          }
        } catch (error) {
          stats.errors.push(`Failed to index ${file}: ${error}`);
        }
      }

      stats.totalIndexed = stats.successCount + stats.failureCount;

      if (this.verbose) {
        console.log('[LearningIndexer] Indexing complete:');
        console.log(`  - Successes: ${stats.successCount}`);
        console.log(`  - Failures: ${stats.failureCount}`);
        console.log(`  - Total: ${stats.totalIndexed}`);
        console.log(`  - Deleted: ${stats.deletedCount}`);
        console.log(`  - Errors: ${stats.errors.length}`);
      }
    } catch (error) {
      stats.errors.push(`Indexing process failed: ${error}`);
    }

    return stats;
  }

  /**
   * Index a single learning capture
   *
   * @param learning - Learning capture data
   * @returns ID of indexed entry
   */
  async indexLearning(learning: LearningCapture): Promise<string> {
    const id = this.generateLearningId(learning);

    // Create searchable text representation
    const searchableText = this.createSearchableText(learning);

    // Create metadata
    const metadata = {
      outcome: learning.outcome,
      topic: learning.topic,
      approach: learning.context.approach,
      capturedAt: learning.capturedAt,
      stepMetrics: learning.context.metrics,
      lessonsCount: learning.lessons.length,
      recommendationsCount: learning.recommendations.length,
      indexed: new Date().toISOString(),
    };

    await this.vectorDB.add(id, searchableText, metadata);

    if (this.verbose) {
      console.log(`[LearningIndexer] Indexed: ${learning.topic} (${learning.outcome})`);
    }

    return id;
  }

  /**
   * Search learning data by semantic query
   *
   * @param query - Natural language query
   * @param options - Search options
   * @returns Matching learning captures with similarity scores
   */
  async searchLearnings(
    query: string,
    options: {
      limit?: number;
      minSimilarity?: number;
      outcomeFilter?: 'success' | 'failure';
      approachFilter?: string;
    } = {}
  ): Promise<Array<{ learning: LearningCapture; similarity: number }>> {
    const results = await this.vectorDB.query(query, {
      limit: options.limit ?? 10,
      minSimilarity: options.minSimilarity ?? 0.5,
    });

    // Apply filters and reconstruct learning captures
    const filtered = results
      .filter((result) => {
        if (options.outcomeFilter && result.metadata.outcome !== options.outcomeFilter) {
          return false;
        }
        if (options.approachFilter && result.metadata.approach !== options.approachFilter) {
          return false;
        }
        return true;
      })
      .map((result) => ({
        learning: this.reconstructLearningFromMetadata(result),
        similarity: result.similarity ?? 0,
      }));

    return filtered;
  }

  /**
   * Get aggregated statistics for learning data
   *
   * @param approach - Optional filter by approach
   * @returns Aggregated metrics
   */
  async getAggregatedMetrics(approach?: string): Promise<{
    totalLearnings: number;
    successRate: number;
    avgStepTimings: Record<string, number>;
    topRecommendations: Array<{ recommendation: string; count: number }>;
  }> {
    // Query all learnings
    const allResults = await this.vectorDB.query('', { limit: 1000 });

    let filtered = allResults;
    if (approach) {
      filtered = allResults.filter((r) => r.metadata.approach === approach);
    }

    const successCount = filtered.filter((r) => r.metadata.outcome === 'success').length;
    const totalCount = filtered.length;
    const successRate = totalCount > 0 ? successCount / totalCount : 0;

    // Calculate average step timings
    const stepTimings: Record<string, number[]> = {};
    filtered.forEach((result) => {
      const metrics = result.metadata.stepMetrics as Record<string, number>;
      Object.entries(metrics || {}).forEach(([step, timing]) => {
        if (!stepTimings[step]) stepTimings[step] = [];
        stepTimings[step].push(timing);
      });
    });

    const avgStepTimings: Record<string, number> = {};
    Object.entries(stepTimings).forEach(([step, timings]) => {
      avgStepTimings[step] = timings.reduce((a, b) => a + b, 0) / timings.length;
    });

    // TODO: Extract top recommendations from stored data
    const topRecommendations: Array<{ recommendation: string; count: number }> = [];

    return {
      totalLearnings: totalCount,
      successRate,
      avgStepTimings,
      topRecommendations,
    };
  }

  /**
   * Delete learning data from index
   *
   * @param id - Learning ID
   */
  async deleteLearning(id: string): Promise<void> {
    await this.vectorDB.delete(id);

    if (this.verbose) {
      console.log(`[LearningIndexer] Deleted: ${id}`);
    }
  }

  /**
   * Clear all learning data from index
   */
  async clearIndex(): Promise<void> {
    await this.vectorDB.clear();

    if (this.verbose) {
      console.log('[LearningIndexer] Index cleared');
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Get all learning JSON files from directory
   */
  private async getLearningFiles(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath);
      return entries
        .filter((e) => e.endsWith('.json'))
        .map((e) => path.join(dirPath, e));
    } catch {
      return [];
    }
  }

  /**
   * Index a single learning file
   */
  private async indexLearningFile(
    filePath: string,
    expectedOutcome: 'success' | 'failure'
  ): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const learning: LearningCapture = JSON.parse(content);

    // Validate outcome matches directory
    if (learning.outcome !== expectedOutcome) {
      throw new Error(
        `Outcome mismatch: expected ${expectedOutcome}, got ${learning.outcome}`
      );
    }

    await this.indexLearning(learning);
  }

  /**
   * Generate unique ID for learning capture
   */
  private generateLearningId(learning: LearningCapture): string {
    const timestamp = new Date(learning.capturedAt).getTime();
    const topicHash = learning.topic.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `learning-${learning.outcome}-${topicHash}-${timestamp}`;
  }

  /**
   * Create searchable text from learning capture
   */
  private createSearchableText(learning: LearningCapture): string {
    const parts = [
      `Outcome: ${learning.outcome}`,
      `Topic: ${learning.topic}`,
      `Keyword: ${learning.context.targetKeyword}`,
      `Approach: ${learning.context.approach}`,
    ];

    if (learning.lessons.length > 0) {
      parts.push(`Lessons: ${learning.lessons.join('; ')}`);
    }

    if (learning.recommendations.length > 0) {
      parts.push(`Recommendations: ${learning.recommendations.join('; ')}`);
    }

    // Add step performance context
    const stepMetrics = Object.entries(learning.context.metrics)
      .map(([step, timing]) => `${step}: ${timing.toFixed(2)}ms`)
      .join(', ');

    if (stepMetrics) {
      parts.push(`Performance: ${stepMetrics}`);
    }

    return parts.join('\n');
  }

  /**
   * Reconstruct LearningCapture from vector metadata
   */
  private reconstructLearningFromMetadata(result: any): LearningCapture {
    return {
      outcome: result.metadata.outcome,
      topic: result.metadata.topic,
      context: {
        targetKeyword: result.metadata.topic, // Stored as topic
        approach: result.metadata.approach,
        metrics: result.metadata.stepMetrics || {},
      },
      lessons: [], // Not stored in metadata
      recommendations: [], // Not stored in metadata
      capturedAt: result.metadata.capturedAt,
    };
  }
}

/**
 * Default learning indexer instance
 */
export const learningIndexer = new LearningIndexer({ verbose: false });

/**
 * Convenience function: Index all learning data
 *
 * @param deleteAfterIndexing - Delete JSON files after successful indexing (default: true)
 */
export async function indexAllLearnings(deleteAfterIndexing?: boolean): Promise<{
  successCount: number;
  failureCount: number;
  totalIndexed: number;
  deletedCount: number;
  errors: string[];
}> {
  return learningIndexer.indexAllLearnings(deleteAfterIndexing);
}

/**
 * Convenience function: Search learning data
 */
export async function searchLearnings(
  query: string,
  options?: {
    limit?: number;
    minSimilarity?: number;
    outcomeFilter?: 'success' | 'failure';
    approachFilter?: string;
  }
): Promise<Array<{ learning: LearningCapture; similarity: number }>> {
  return learningIndexer.searchLearnings(query, options);
}
