/**
 * SEO SERP Patterns Collection
 *
 * CRUD operations for seo_serp_patterns RuVector collection.
 * Stores SERP analysis for keyword optimization.
 *
 * TTL: 2-4 weeks (SERPs change frequently)
 *
 * @module seo/lib/ruvector/collections/serp-patterns
 */

import type { VectorDB } from '@ruvector/core';
import {
  SERPPatternEntry,
  SERPFeature,
  SERPFeatureOpportunity,
  RankingPattern,
  SemanticCluster,
  SEO_COLLECTIONS,
  COLLECTION_TTL_DAYS,
  generateSERPPatternId,
  generateSERPPatternEmbeddingText,
  calculateFreshnessScore,
  isSERPPatternEntry,
  isEntryStale,
} from '../schemas';

/**
 * Input for creating SERP patterns
 */
export interface SERPPatternInput {
  keyword: string;
  featuresPresent?: SERPFeature[];
  featuresOpportunity?: SERPFeatureOpportunity[];
  rankingPatterns: RankingPattern;
  semanticClusters?: SemanticCluster[];
  topCompetitors?: string[];
  clusterId?: string;
}

/**
 * Query options for SERP patterns
 */
export interface SERPPatternQueryOptions {
  /** Maximum results to return */
  limit?: number;

  /** Minimum similarity score (0.0-1.0) */
  minSimilarity?: number;

  /** Filter by cluster ID */
  clusterId?: string;

  /** Filter by SERP feature type */
  hasFeature?: string;

  /** Minimum freshness score */
  minFreshnessScore?: number;

  /** Only include non-stale entries */
  excludeStale?: boolean;
}

/**
 * SERP Patterns Collection Manager
 */
export class SERPPatternsCollection {
  private db: VectorDB;
  private embeddingFn: (text: string) => Promise<Float32Array>;

  constructor(db: VectorDB, embeddingFn: (text: string) => Promise<Float32Array>) {
    this.db = db;
    this.embeddingFn = embeddingFn;
  }

  /**
   * Add new SERP pattern
   */
  async add(input: SERPPatternInput): Promise<SERPPatternEntry> {
    const now = new Date();
    const id = generateSERPPatternId(input.keyword, now);
    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.SERP_PATTERNS];
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const metadata: SERPPatternEntry['metadata'] = {
      keyword: input.keyword,
      featuresPresent: input.featuresPresent ?? [],
      featuresOpportunity: input.featuresOpportunity ?? [],
      rankingPatterns: input.rankingPatterns,
      semanticClusters: input.semanticClusters ?? [],
      topCompetitors: input.topCompetitors ?? [],
      clusterId: input.clusterId,
      capturedAt: now,
      expiresAt,
      freshnessScore: 1.0,
    };

    const text = generateSERPPatternEmbeddingText(metadata);
    const vector = await this.embeddingFn(text);

    const entry: SERPPatternEntry = { id, text, metadata };

    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Update existing SERP pattern
   */
  async update(
    id: string,
    updates: Partial<SERPPatternInput>
  ): Promise<SERPPatternEntry | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.SERP_PATTERNS];

    const updatedMetadata: SERPPatternEntry['metadata'] = {
      ...existing.metadata,
      ...(updates.keyword && { keyword: updates.keyword }),
      ...(updates.featuresPresent && { featuresPresent: updates.featuresPresent }),
      ...(updates.featuresOpportunity && { featuresOpportunity: updates.featuresOpportunity }),
      ...(updates.rankingPatterns && { rankingPatterns: updates.rankingPatterns }),
      ...(updates.semanticClusters && { semanticClusters: updates.semanticClusters }),
      ...(updates.topCompetitors && { topCompetitors: updates.topCompetitors }),
      ...(updates.clusterId && { clusterId: updates.clusterId }),
      freshnessScore: calculateFreshnessScore(existing.metadata.capturedAt, ttlDays),
    };

    const text = generateSERPPatternEmbeddingText(updatedMetadata);
    const vector = await this.embeddingFn(text);

    const entry: SERPPatternEntry = { id, text, metadata: updatedMetadata };

    await this.db.delete(id);
    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Get SERP pattern by ID
   */
  async getById(id: string): Promise<SERPPatternEntry | null> {
    try {
      const results = await this.db.search({
        vector: new Float32Array(1536).fill(0),
        k: 1000,
        filter: (item: any) => item.metadata?.id === id,
      });

      if (results.length === 0) return null;

      const result = results[0];
      if (isSERPPatternEntry(result.metadata)) {
        return result.metadata as SERPPatternEntry;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get most recent SERP pattern for a keyword
   */
  async getLatestForKeyword(keyword: string): Promise<SERPPatternEntry | null> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    const normalizedKeyword = keyword.toLowerCase().trim();

    const matches = results
      .filter((result: any) => {
        const entry = result.metadata as SERPPatternEntry;
        return (
          isSERPPatternEntry(entry) &&
          entry.metadata.keyword.toLowerCase().trim() === normalizedKeyword
        );
      })
      .map((result: any) => result.metadata as SERPPatternEntry)
      .sort(
        (a, b) =>
          new Date(b.metadata.capturedAt).getTime() - new Date(a.metadata.capturedAt).getTime()
      );

    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Search for SERP patterns by semantic similarity
   */
  async search(
    query: string,
    options: SERPPatternQueryOptions = {}
  ): Promise<Array<{ entry: SERPPatternEntry; similarity: number }>> {
    const {
      limit = 10,
      minSimilarity = 0.5,
      clusterId,
      hasFeature,
      minFreshnessScore,
      excludeStale = false,
    } = options;

    const queryVector = await this.embeddingFn(query);
    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.SERP_PATTERNS];

    const results = await this.db.search({
      vector: queryVector,
      k: limit * 2,
    });

    return results
      .filter((result: any) => {
        if (result.score < minSimilarity) return false;
        const entry = result.metadata as SERPPatternEntry;
        if (!isSERPPatternEntry(entry)) return false;

        const currentFreshness = calculateFreshnessScore(entry.metadata.capturedAt, ttlDays);

        if (excludeStale && isEntryStale(currentFreshness)) return false;
        if (minFreshnessScore && currentFreshness < minFreshnessScore) return false;
        if (clusterId && entry.metadata.clusterId !== clusterId) return false;

        if (hasFeature) {
          const hasIt = entry.metadata.featuresPresent.some(
            (f) => f.type.toLowerCase() === hasFeature.toLowerCase()
          );
          if (!hasIt) return false;
        }

        return true;
      })
      .slice(0, limit)
      .map((result: any) => ({
        entry: result.metadata as SERPPatternEntry,
        similarity: result.score,
      }));
  }

  /**
   * Get all SERP patterns for a cluster
   */
  async getByClusterId(clusterId: string): Promise<SERPPatternEntry[]> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as SERPPatternEntry;
        return isSERPPatternEntry(entry) && entry.metadata.clusterId === clusterId;
      })
      .map((result: any) => result.metadata as SERPPatternEntry);
  }

  /**
   * Check if fresh SERP pattern exists for a keyword
   */
  async hasFreshPattern(keyword: string, freshnessThreshold = 0.3): Promise<boolean> {
    const entry = await this.getLatestForKeyword(keyword);
    if (!entry) return false;

    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.SERP_PATTERNS];
    const freshness = calculateFreshnessScore(entry.metadata.capturedAt, ttlDays);

    return freshness >= freshnessThreshold;
  }

  /**
   * Get featured snippet opportunities across keywords
   */
  async getFeaturedSnippetOpportunities(
    clusterId?: string
  ): Promise<Array<{ keyword: string; reason: string }>> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    const opportunities: Array<{ keyword: string; reason: string }> = [];

    for (const result of results) {
      const entry = result.metadata as SERPPatternEntry;
      if (!isSERPPatternEntry(entry)) continue;
      if (clusterId && entry.metadata.clusterId !== clusterId) continue;

      // Check for featured snippet opportunities
      const snippetOpportunity = entry.metadata.featuresOpportunity.find(
        (f) => f.type.toLowerCase() === 'featured_snippet'
      );

      if (snippetOpportunity) {
        opportunities.push({
          keyword: entry.metadata.keyword,
          reason: snippetOpportunity.reason,
        });
      }
    }

    return opportunities;
  }

  /**
   * Get average ranking patterns for a cluster
   */
  async getAverageRankingPatterns(clusterId: string): Promise<RankingPattern | null> {
    const patterns = await this.getByClusterId(clusterId);
    if (patterns.length === 0) return null;

    const avgContentLength =
      patterns.reduce((sum, p) => sum + p.metadata.rankingPatterns.avgContentLength, 0) /
      patterns.length;
    const avgDomainAuthority =
      patterns.reduce((sum, p) => sum + p.metadata.rankingPatterns.avgDomainAuthority, 0) /
      patterns.length;

    // Majority vote for freshness signal
    const freshnessVotes = patterns.filter(
      (p) => p.metadata.rankingPatterns.freshnessSignal
    ).length;
    const freshnessSignal = freshnessVotes > patterns.length / 2;

    // Aggregate top factors
    const factorCounts = new Map<string, number>();
    for (const pattern of patterns) {
      for (const factor of pattern.metadata.rankingPatterns.topFactors) {
        factorCounts.set(factor, (factorCounts.get(factor) || 0) + 1);
      }
    }
    const topFactors = Array.from(factorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([factor]) => factor);

    return {
      avgContentLength: Math.round(avgContentLength),
      avgDomainAuthority: Math.round(avgDomainAuthority),
      freshnessSignal,
      topFactors,
    };
  }

  /**
   * Delete SERP pattern
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
   * Get stale entries for cleanup
   */
  async getStaleEntries(threshold = 0.3): Promise<SERPPatternEntry[]> {
    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.SERP_PATTERNS];
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as SERPPatternEntry;
        if (!isSERPPatternEntry(entry)) return false;

        const freshness = calculateFreshnessScore(entry.metadata.capturedAt, ttlDays);
        return isEntryStale(freshness, threshold);
      })
      .map((result: any) => result.metadata as SERPPatternEntry);
  }

  /**
   * Get collection name
   */
  getCollectionName(): string {
    return SEO_COLLECTIONS.SERP_PATTERNS;
  }
}
