/**
 * SEO Statistics Collection
 *
 * CRUD operations for seo_statistics RuVector collection.
 * Stores statistics with citations for data-backed content.
 *
 * TTL: 6+ months (time_sensitive stats decay faster)
 *
 * @module seo/lib/ruvector/collections/statistics
 */

import type { VectorDB } from '@ruvector/core';
import {
  StatisticEntry,
  SEO_COLLECTIONS,
  COLLECTION_TTL_DAYS,
  generateStatisticId,
  generateStatisticEmbeddingText,
  calculateFreshnessScore,
  isStatisticEntry,
  isEntryStale,
} from '../schemas';

/**
 * Input for creating/updating a statistic
 */
export interface StatisticInput {
  statistic: string;
  numericValue: number;
  unit: string;
  topics: string[];
  sourceName: string;
  sourceUrl: string;
  publicationDate: Date;
  credibilityScore?: number;
  timeSensitive?: boolean;
  niche: string;
  parentNiche?: string;
}

/**
 * Query options for statistics
 */
export interface StatisticQueryOptions {
  /** Maximum results to return */
  limit?: number;

  /** Minimum similarity score (0.0-1.0) */
  minSimilarity?: number;

  /** Filter by niche */
  niche?: string;

  /** Include parent niche in search (cross-niche) */
  includeCrossNiche?: boolean;

  /** Minimum credibility score */
  minCredibilityScore?: number;

  /** Minimum freshness score */
  minFreshnessScore?: number;

  /** Only include non-stale entries */
  excludeStale?: boolean;
}

/**
 * Statistics Collection Manager
 */
export class StatisticsCollection {
  private db: VectorDB;
  private embeddingFn: (text: string) => Promise<Float32Array>;

  constructor(db: VectorDB, embeddingFn: (text: string) => Promise<Float32Array>) {
    this.db = db;
    this.embeddingFn = embeddingFn;
  }

  /**
   * Add a new statistic
   */
  async add(input: StatisticInput): Promise<StatisticEntry> {
    const id = generateStatisticId(input.statistic);
    const now = new Date();

    const ttlDays = input.timeSensitive
      ? COLLECTION_TTL_DAYS[SEO_COLLECTIONS.STATISTICS] / 2 // Decay faster if time-sensitive
      : COLLECTION_TTL_DAYS[SEO_COLLECTIONS.STATISTICS];

    const metadata: StatisticEntry['metadata'] = {
      statistic: input.statistic,
      numericValue: input.numericValue,
      unit: input.unit,
      topics: input.topics,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      publicationDate: input.publicationDate,
      credibilityScore: input.credibilityScore ?? 0.7,
      timeSensitive: input.timeSensitive ?? false,
      firstSeen: now,
      lastVerified: now,
      useCount: 0,
      articleIds: [],
      freshnessScore: 1.0,
      niche: input.niche,
      parentNiche: input.parentNiche,
    };

    const text = generateStatisticEmbeddingText(metadata);
    const vector = await this.embeddingFn(text);

    const entry: StatisticEntry = { id, text, metadata };

    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Update an existing statistic
   */
  async update(
    id: string,
    updates: Partial<StatisticInput> & { articleIds?: string[]; verified?: boolean }
  ): Promise<StatisticEntry | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const now = new Date();
    const ttlDays =
      (updates.timeSensitive ?? existing.metadata.timeSensitive)
        ? COLLECTION_TTL_DAYS[SEO_COLLECTIONS.STATISTICS] / 2
        : COLLECTION_TTL_DAYS[SEO_COLLECTIONS.STATISTICS];

    const updatedMetadata: StatisticEntry['metadata'] = {
      ...existing.metadata,
      ...(updates.statistic && { statistic: updates.statistic }),
      ...(updates.numericValue !== undefined && { numericValue: updates.numericValue }),
      ...(updates.unit && { unit: updates.unit }),
      ...(updates.topics && { topics: updates.topics }),
      ...(updates.sourceName && { sourceName: updates.sourceName }),
      ...(updates.sourceUrl && { sourceUrl: updates.sourceUrl }),
      ...(updates.publicationDate && { publicationDate: updates.publicationDate }),
      ...(updates.credibilityScore !== undefined && { credibilityScore: updates.credibilityScore }),
      ...(updates.timeSensitive !== undefined && { timeSensitive: updates.timeSensitive }),
      ...(updates.niche && { niche: updates.niche }),
      ...(updates.parentNiche && { parentNiche: updates.parentNiche }),
      ...(updates.articleIds && {
        articleIds: [...new Set([...existing.metadata.articleIds, ...updates.articleIds])],
      }),
      ...(updates.verified && { lastVerified: now }),
      useCount: existing.metadata.useCount + (updates.articleIds?.length ?? 0),
      freshnessScore: calculateFreshnessScore(existing.metadata.firstSeen, ttlDays),
    };

    const text = generateStatisticEmbeddingText(updatedMetadata);
    const vector = await this.embeddingFn(text);

    const entry: StatisticEntry = { id, text, metadata: updatedMetadata };

    await this.db.delete(id);
    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Get statistic by ID
   */
  async getById(id: string): Promise<StatisticEntry | null> {
    try {
      const results = await this.db.search({
        vector: new Float32Array(1536).fill(0),
        k: 1000,
        filter: (item: any) => item.metadata?.id === id,
      });

      if (results.length === 0) return null;

      const result = results[0];
      if (isStatisticEntry(result.metadata)) {
        return result.metadata as StatisticEntry;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Search for statistics by semantic similarity
   */
  async search(
    query: string,
    options: StatisticQueryOptions = {}
  ): Promise<Array<{ entry: StatisticEntry; similarity: number }>> {
    const {
      limit = 10,
      minSimilarity = 0.5,
      niche,
      includeCrossNiche = false,
      minCredibilityScore,
      minFreshnessScore,
      excludeStale = false,
    } = options;

    const queryVector = await this.embeddingFn(query);

    const results = await this.db.search({
      vector: queryVector,
      k: limit * 2,
    });

    return results
      .filter((result: any) => {
        if (result.score < minSimilarity) return false;
        const entry = result.metadata as StatisticEntry;
        if (!isStatisticEntry(entry)) return false;

        // Recalculate freshness
        const ttlDays = entry.metadata.timeSensitive
          ? COLLECTION_TTL_DAYS[SEO_COLLECTIONS.STATISTICS] / 2
          : COLLECTION_TTL_DAYS[SEO_COLLECTIONS.STATISTICS];
        const currentFreshness = calculateFreshnessScore(entry.metadata.firstSeen, ttlDays);

        if (excludeStale && isEntryStale(currentFreshness)) return false;
        if (minFreshnessScore && currentFreshness < minFreshnessScore) return false;

        if (niche) {
          if (entry.metadata.niche !== niche) {
            if (!includeCrossNiche) return false;
            if (entry.metadata.parentNiche !== niche && entry.metadata.niche !== niche)
              return false;
          }
        }

        if (minCredibilityScore && entry.metadata.credibilityScore < minCredibilityScore) {
          return false;
        }

        return true;
      })
      .slice(0, limit)
      .map((result: any) => ({
        entry: result.metadata as StatisticEntry,
        similarity: result.score,
      }));
  }

  /**
   * Find statistics by topic
   */
  async findByTopic(
    topic: string,
    options: StatisticQueryOptions = {}
  ): Promise<Array<{ entry: StatisticEntry; similarity: number }>> {
    return this.search(`Statistics about ${topic}`, options);
  }

  /**
   * Record usage of a statistic
   */
  async recordUsage(id: string, articleId: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;

    await this.update(id, { articleIds: [articleId] });
  }

  /**
   * Verify a statistic (resets freshness)
   */
  async verify(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;

    await this.update(id, { verified: true });
  }

  /**
   * Update credibility based on article performance
   */
  async updateCredibilityScore(id: string, performanceScore: number, weight = 0.1): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;

    const newScore =
      (1 - weight) * existing.metadata.credibilityScore +
      weight * Math.max(0, Math.min(1, performanceScore));

    await this.update(id, { credibilityScore: newScore });
  }

  /**
   * Delete a statistic
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
   * Get stale statistics for cleanup
   */
  async getStaleEntries(threshold = 0.3): Promise<StatisticEntry[]> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as StatisticEntry;
        if (!isStatisticEntry(entry)) return false;

        const ttlDays = entry.metadata.timeSensitive
          ? COLLECTION_TTL_DAYS[SEO_COLLECTIONS.STATISTICS] / 2
          : COLLECTION_TTL_DAYS[SEO_COLLECTIONS.STATISTICS];
        const freshness = calculateFreshnessScore(entry.metadata.firstSeen, ttlDays);

        return isEntryStale(freshness, threshold);
      })
      .map((result: any) => result.metadata as StatisticEntry);
  }

  /**
   * Get collection name
   */
  getCollectionName(): string {
    return SEO_COLLECTIONS.STATISTICS;
  }
}
