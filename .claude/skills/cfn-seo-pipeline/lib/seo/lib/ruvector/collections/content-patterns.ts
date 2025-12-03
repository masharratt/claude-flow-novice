/**
 * SEO Content Patterns Collection
 *
 * CRUD operations for seo_content_patterns RuVector collection.
 * Stores successful content patterns that can be replicated.
 *
 * TTL: Never expires (confidence adjusts based on feedback)
 *
 * @module seo/lib/ruvector/collections/content-patterns
 */

import type { VectorDB } from '@ruvector/core';
import {
  ContentPatternEntry,
  ContentPatternType,
  PatternPerformanceMetrics,
  SEO_COLLECTIONS,
  generateContentPatternId,
  generateContentPatternEmbeddingText,
  isContentPatternEntry,
} from '../schemas';

/**
 * Input for creating a content pattern
 */
export interface ContentPatternInput {
  type: ContentPatternType;
  description: string;
  example: string;
  niche: string;
  format?: string;
  performanceMetrics?: PatternPerformanceMetrics;
  confidenceScore?: number;
}

/**
 * Query options for content patterns
 */
export interface ContentPatternQueryOptions {
  /** Maximum results to return */
  limit?: number;

  /** Minimum similarity score (0.0-1.0) */
  minSimilarity?: number;

  /** Filter by niche */
  niche?: string;

  /** Filter by pattern type */
  type?: ContentPatternType;

  /** Filter by content format */
  format?: string;

  /** Minimum confidence score */
  minConfidenceScore?: number;

  /** Minimum use count */
  minUseCount?: number;
}

/**
 * Content Patterns Collection Manager
 */
export class ContentPatternsCollection {
  private db: VectorDB;
  private embeddingFn: (text: string) => Promise<Float32Array>;

  constructor(db: VectorDB, embeddingFn: (text: string) => Promise<Float32Array>) {
    this.db = db;
    this.embeddingFn = embeddingFn;
  }

  /**
   * Add a new content pattern
   */
  async add(input: ContentPatternInput): Promise<ContentPatternEntry> {
    const id = generateContentPatternId(input.type, input.description);
    const now = new Date();

    const metadata: ContentPatternEntry['metadata'] = {
      type: input.type,
      description: input.description,
      example: input.example,
      niche: input.niche,
      format: input.format,
      performanceMetrics: input.performanceMetrics,
      confidenceScore: input.confidenceScore ?? 0.5,
      articleIds: [],
      createdAt: now,
      lastUsed: now,
      useCount: 0,
      successCount: 0,
    };

    const text = generateContentPatternEmbeddingText(metadata);
    const vector = await this.embeddingFn(text);

    const entry: ContentPatternEntry = { id, text, metadata };

    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Update an existing content pattern
   */
  async update(
    id: string,
    updates: Partial<ContentPatternInput> & {
      articleIds?: string[];
      incrementSuccess?: boolean;
    }
  ): Promise<ContentPatternEntry | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const now = new Date();

    const updatedMetadata: ContentPatternEntry['metadata'] = {
      ...existing.metadata,
      ...(updates.type && { type: updates.type }),
      ...(updates.description && { description: updates.description }),
      ...(updates.example && { example: updates.example }),
      ...(updates.niche && { niche: updates.niche }),
      ...(updates.format && { format: updates.format }),
      ...(updates.performanceMetrics && { performanceMetrics: updates.performanceMetrics }),
      ...(updates.confidenceScore !== undefined && { confidenceScore: updates.confidenceScore }),
      ...(updates.articleIds && {
        articleIds: [...new Set([...existing.metadata.articleIds, ...updates.articleIds])],
      }),
      lastUsed: now,
      useCount: existing.metadata.useCount + (updates.articleIds?.length ?? 0),
      successCount: existing.metadata.successCount + (updates.incrementSuccess ? 1 : 0),
    };

    const text = generateContentPatternEmbeddingText(updatedMetadata);
    const vector = await this.embeddingFn(text);

    const entry: ContentPatternEntry = { id, text, metadata: updatedMetadata };

    await this.db.delete(id);
    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Get content pattern by ID
   */
  async getById(id: string): Promise<ContentPatternEntry | null> {
    try {
      const results = await this.db.search({
        vector: new Float32Array(1536).fill(0),
        k: 1000,
        filter: (item: any) => item.metadata?.id === id,
      });

      if (results.length === 0) return null;

      const result = results[0];
      if (isContentPatternEntry(result.metadata)) {
        return result.metadata as ContentPatternEntry;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Search for content patterns by semantic similarity
   */
  async search(
    query: string,
    options: ContentPatternQueryOptions = {}
  ): Promise<Array<{ entry: ContentPatternEntry; similarity: number }>> {
    const {
      limit = 10,
      minSimilarity = 0.5,
      niche,
      type,
      format,
      minConfidenceScore,
      minUseCount,
    } = options;

    const queryVector = await this.embeddingFn(query);

    const results = await this.db.search({
      vector: queryVector,
      k: limit * 2,
    });

    return results
      .filter((result: any) => {
        if (result.score < minSimilarity) return false;
        const entry = result.metadata as ContentPatternEntry;
        if (!isContentPatternEntry(entry)) return false;

        if (niche && entry.metadata.niche !== niche) return false;
        if (type && entry.metadata.type !== type) return false;
        if (format && entry.metadata.format !== format) return false;
        if (minConfidenceScore && entry.metadata.confidenceScore < minConfidenceScore)
          return false;
        if (minUseCount && entry.metadata.useCount < minUseCount) return false;

        return true;
      })
      .slice(0, limit)
      .map((result: any) => ({
        entry: result.metadata as ContentPatternEntry,
        similarity: result.score,
      }));
  }

  /**
   * Get patterns by type
   */
  async getByType(type: ContentPatternType, options: ContentPatternQueryOptions = {}): Promise<ContentPatternEntry[]> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as ContentPatternEntry;
        if (!isContentPatternEntry(entry)) return false;
        if (entry.metadata.type !== type) return false;

        if (options.niche && entry.metadata.niche !== options.niche) return false;
        if (options.minConfidenceScore && entry.metadata.confidenceScore < options.minConfidenceScore)
          return false;

        return true;
      })
      .map((result: any) => result.metadata as ContentPatternEntry)
      .sort((a, b) => b.metadata.confidenceScore - a.metadata.confidenceScore);
  }

  /**
   * Get top patterns for a niche and format
   */
  async getTopPatterns(
    niche: string,
    format?: string,
    limit = 5
  ): Promise<ContentPatternEntry[]> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as ContentPatternEntry;
        if (!isContentPatternEntry(entry)) return false;
        if (entry.metadata.niche !== niche) return false;
        if (format && entry.metadata.format !== format) return false;
        return true;
      })
      .map((result: any) => result.metadata as ContentPatternEntry)
      .sort((a, b) => {
        // Sort by: confidence * (1 + log(useCount + 1))
        const scoreA = a.metadata.confidenceScore * (1 + Math.log(a.metadata.useCount + 1));
        const scoreB = b.metadata.confidenceScore * (1 + Math.log(b.metadata.useCount + 1));
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  /**
   * Record usage of a pattern
   */
  async recordUsage(id: string, articleId: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;

    await this.update(id, { articleIds: [articleId] });
  }

  /**
   * Record successful use of a pattern (article performed well)
   */
  async recordSuccess(id: string, articleId: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;

    await this.update(id, { articleIds: [articleId], incrementSuccess: true });
  }

  /**
   * Update confidence score based on article performance
   *
   * @param id Pattern ID
   * @param performanceScore Article performance score (0-1)
   * @param consensusScore Optional consensus score from validation
   */
  async updateConfidence(
    id: string,
    performanceScore: number,
    consensusScore?: number
  ): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;

    // Base confidence adjustment
    const baseAdjustment =
      performanceScore > 0.7
        ? 0.02 // Boost
        : performanceScore < 0.3
          ? -0.03 // Reduce
          : 0; // No change

    // Bonus from consensus score
    const consensusBonus = consensusScore
      ? (consensusScore - 0.85) * 2 * 0.01 // +/- 0.01 per 0.05 above/below 0.85
      : 0;

    const adjustment = baseAdjustment + consensusBonus;
    const newConfidence = Math.max(
      0.1,
      Math.min(0.99, existing.metadata.confidenceScore + adjustment)
    );

    await this.update(id, { confidenceScore: newConfidence });
  }

  /**
   * Update performance metrics
   */
  async updatePerformanceMetrics(
    id: string,
    metrics: PatternPerformanceMetrics
  ): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;

    // Weighted average with existing metrics
    let updatedMetrics = metrics;
    if (existing.metadata.performanceMetrics) {
      const existing_m = existing.metadata.performanceMetrics;
      const weight = 0.3; // Weight for new data
      updatedMetrics = {
        avgPosition: (1 - weight) * existing_m.avgPosition + weight * metrics.avgPosition,
        avgCTR: (1 - weight) * existing_m.avgCTR + weight * metrics.avgCTR,
        avgTimeOnPage:
          (1 - weight) * existing_m.avgTimeOnPage + weight * metrics.avgTimeOnPage,
      };
    }

    await this.update(id, { performanceMetrics: updatedMetrics });
  }

  /**
   * Extract and store a pattern from successful article
   *
   * @param patternInput Pattern to extract
   * @param consensusScore Consensus score from validation
   */
  async extractAndStore(
    patternInput: ContentPatternInput,
    consensusScore: number
  ): Promise<ContentPatternEntry> {
    // Calculate initial confidence based on consensus
    const initialConfidence = 0.5 + (consensusScore - 0.85) * 2;
    const clampedConfidence = Math.max(0.1, Math.min(0.99, initialConfidence));

    return this.add({
      ...patternInput,
      confidenceScore: clampedConfidence,
    });
  }

  /**
   * Delete a content pattern
   */
  async delete(id: string): Promise<boolean> {
    try {
      await this.db.delete(id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get low-confidence patterns for review
   */
  async getLowConfidencePatterns(threshold = 0.3): Promise<ContentPatternEntry[]> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as ContentPatternEntry;
        return (
          isContentPatternEntry(entry) &&
          entry.metadata.confidenceScore < threshold &&
          entry.metadata.useCount > 5 // Only consider patterns with enough usage data
        );
      })
      .map((result: any) => result.metadata as ContentPatternEntry);
  }

  /**
   * Get high-performing patterns for replication
   */
  async getHighPerformingPatterns(
    niche?: string,
    limit = 10
  ): Promise<ContentPatternEntry[]> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as ContentPatternEntry;
        if (!isContentPatternEntry(entry)) return false;
        if (niche && entry.metadata.niche !== niche) return false;
        return entry.metadata.confidenceScore >= 0.7 && entry.metadata.useCount >= 3;
      })
      .map((result: any) => result.metadata as ContentPatternEntry)
      .sort((a, b) => {
        // Sort by success rate (successCount / useCount) * confidence
        const rateA =
          (a.metadata.successCount / Math.max(1, a.metadata.useCount)) *
          a.metadata.confidenceScore;
        const rateB =
          (b.metadata.successCount / Math.max(1, b.metadata.useCount)) *
          b.metadata.confidenceScore;
        return rateB - rateA;
      })
      .slice(0, limit);
  }

  /**
   * Get collection name
   */
  getCollectionName(): string {
    return SEO_COLLECTIONS.CONTENT_PATTERNS;
  }
}
