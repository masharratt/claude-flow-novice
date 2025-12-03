/**
 * SEO Competitor Intelligence Collection
 *
 * CRUD operations for seo_competitor_intelligence RuVector collection.
 * Stores competitor analysis for reuse within a niche.
 *
 * TTL: 6 months (competitor strategies evolve slowly)
 *
 * @module seo/lib/ruvector/collections/competitor-intelligence
 */

import type { VectorDB } from '@ruvector/core';
import {
  CompetitorIntelligenceEntry,
  ArchitecturePattern,
  ContentStrategyPattern,
  HubPage,
  ContentGap,
  SEO_COLLECTIONS,
  COLLECTION_TTL_DAYS,
  generateCompetitorIntelligenceId,
  generateCompetitorIntelligenceEmbeddingText,
  calculateFreshnessScore,
  isCompetitorIntelligenceEntry,
  isEntryStale,
} from '../schemas';

/**
 * Input for creating competitor intelligence
 */
export interface CompetitorIntelligenceInput {
  domain: string;
  niche: string;
  architecturePatterns?: ArchitecturePattern[];
  contentStrategy?: ContentStrategyPattern[];
  hubPages?: HubPage[];
  internalLinkingPatterns?: string[];
  contentGaps?: ContentGap[];
  estimatedAuthority?: number;
  clusterId?: string;
}

/**
 * Query options for competitor intelligence
 */
export interface CompetitorIntelligenceQueryOptions {
  /** Maximum results to return */
  limit?: number;

  /** Minimum similarity score (0.0-1.0) */
  minSimilarity?: number;

  /** Filter by niche */
  niche?: string;

  /** Filter by cluster ID */
  clusterId?: string;

  /** Minimum authority score */
  minAuthority?: number;

  /** Minimum freshness score */
  minFreshnessScore?: number;

  /** Only include non-stale entries */
  excludeStale?: boolean;
}

/**
 * Competitor Intelligence Collection Manager
 */
export class CompetitorIntelligenceCollection {
  private db: VectorDB;
  private embeddingFn: (text: string) => Promise<Float32Array>;

  constructor(db: VectorDB, embeddingFn: (text: string) => Promise<Float32Array>) {
    this.db = db;
    this.embeddingFn = embeddingFn;
  }

  /**
   * Add new competitor intelligence
   */
  async add(input: CompetitorIntelligenceInput): Promise<CompetitorIntelligenceEntry> {
    const id = generateCompetitorIntelligenceId(input.domain, input.niche);
    const now = new Date();
    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.COMPETITOR_INTELLIGENCE];
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const metadata: CompetitorIntelligenceEntry['metadata'] = {
      domain: input.domain,
      niche: input.niche,
      architecturePatterns: input.architecturePatterns ?? [],
      contentStrategy: input.contentStrategy ?? [],
      hubPages: input.hubPages ?? [],
      internalLinkingPatterns: input.internalLinkingPatterns ?? [],
      contentGaps: input.contentGaps ?? [],
      estimatedAuthority: input.estimatedAuthority ?? 0,
      clusterId: input.clusterId,
      createdAt: now,
      expiresAt,
      freshnessScore: 1.0,
    };

    const text = generateCompetitorIntelligenceEmbeddingText(metadata);
    const vector = await this.embeddingFn(text);

    const entry: CompetitorIntelligenceEntry = { id, text, metadata };

    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Update existing competitor intelligence
   */
  async update(
    id: string,
    updates: Partial<CompetitorIntelligenceInput>
  ): Promise<CompetitorIntelligenceEntry | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.COMPETITOR_INTELLIGENCE];

    const updatedMetadata: CompetitorIntelligenceEntry['metadata'] = {
      ...existing.metadata,
      ...(updates.domain && { domain: updates.domain }),
      ...(updates.niche && { niche: updates.niche }),
      ...(updates.architecturePatterns && { architecturePatterns: updates.architecturePatterns }),
      ...(updates.contentStrategy && { contentStrategy: updates.contentStrategy }),
      ...(updates.hubPages && { hubPages: updates.hubPages }),
      ...(updates.internalLinkingPatterns && {
        internalLinkingPatterns: updates.internalLinkingPatterns,
      }),
      ...(updates.contentGaps && { contentGaps: updates.contentGaps }),
      ...(updates.estimatedAuthority !== undefined && {
        estimatedAuthority: updates.estimatedAuthority,
      }),
      ...(updates.clusterId && { clusterId: updates.clusterId }),
      freshnessScore: calculateFreshnessScore(existing.metadata.createdAt, ttlDays),
    };

    const text = generateCompetitorIntelligenceEmbeddingText(updatedMetadata);
    const vector = await this.embeddingFn(text);

    const entry: CompetitorIntelligenceEntry = { id, text, metadata: updatedMetadata };

    await this.db.delete(id);
    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Get competitor intelligence by ID
   */
  async getById(id: string): Promise<CompetitorIntelligenceEntry | null> {
    try {
      const results = await this.db.search({
        vector: new Float32Array(1536).fill(0),
        k: 1000,
        filter: (item: any) => item.metadata?.id === id,
      });

      if (results.length === 0) return null;

      const result = results[0];
      if (isCompetitorIntelligenceEntry(result.metadata)) {
        return result.metadata as CompetitorIntelligenceEntry;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get competitor intelligence by domain and niche
   */
  async getByDomainAndNiche(
    domain: string,
    niche: string
  ): Promise<CompetitorIntelligenceEntry | null> {
    const id = generateCompetitorIntelligenceId(domain, niche);
    return this.getById(id);
  }

  /**
   * Search for competitor intelligence by semantic similarity
   */
  async search(
    query: string,
    options: CompetitorIntelligenceQueryOptions = {}
  ): Promise<Array<{ entry: CompetitorIntelligenceEntry; similarity: number }>> {
    const {
      limit = 10,
      minSimilarity = 0.5,
      niche,
      clusterId,
      minAuthority,
      minFreshnessScore,
      excludeStale = false,
    } = options;

    const queryVector = await this.embeddingFn(query);
    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.COMPETITOR_INTELLIGENCE];

    const results = await this.db.search({
      vector: queryVector,
      k: limit * 2,
    });

    return results
      .filter((result: any) => {
        if (result.score < minSimilarity) return false;
        const entry = result.metadata as CompetitorIntelligenceEntry;
        if (!isCompetitorIntelligenceEntry(entry)) return false;

        const currentFreshness = calculateFreshnessScore(entry.metadata.createdAt, ttlDays);

        if (excludeStale && isEntryStale(currentFreshness)) return false;
        if (minFreshnessScore && currentFreshness < minFreshnessScore) return false;
        if (niche && entry.metadata.niche !== niche) return false;
        if (clusterId && entry.metadata.clusterId !== clusterId) return false;
        if (minAuthority && entry.metadata.estimatedAuthority < minAuthority) return false;

        return true;
      })
      .slice(0, limit)
      .map((result: any) => ({
        entry: result.metadata as CompetitorIntelligenceEntry,
        similarity: result.score,
      }));
  }

  /**
   * Get all competitor intelligence for a niche
   */
  async getByNiche(niche: string): Promise<CompetitorIntelligenceEntry[]> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as CompetitorIntelligenceEntry;
        return isCompetitorIntelligenceEntry(entry) && entry.metadata.niche === niche;
      })
      .map((result: any) => result.metadata as CompetitorIntelligenceEntry);
  }

  /**
   * Get all competitor intelligence for a cluster
   */
  async getByClusterId(clusterId: string): Promise<CompetitorIntelligenceEntry[]> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as CompetitorIntelligenceEntry;
        return isCompetitorIntelligenceEntry(entry) && entry.metadata.clusterId === clusterId;
      })
      .map((result: any) => result.metadata as CompetitorIntelligenceEntry);
  }

  /**
   * Check if fresh competitor intelligence exists for a domain
   */
  async hasFreshIntelligence(
    domain: string,
    niche: string,
    freshnessThreshold = 0.3
  ): Promise<boolean> {
    const entry = await this.getByDomainAndNiche(domain, niche);
    if (!entry) return false;

    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.COMPETITOR_INTELLIGENCE];
    const freshness = calculateFreshnessScore(entry.metadata.createdAt, ttlDays);

    return freshness >= freshnessThreshold;
  }

  /**
   * Get aggregated content gaps across all competitors in a niche
   */
  async getAggregatedContentGaps(niche: string): Promise<ContentGap[]> {
    const competitors = await this.getByNiche(niche);

    const gapMap = new Map<string, { gap: ContentGap; count: number }>();

    for (const competitor of competitors) {
      for (const gap of competitor.metadata.contentGaps) {
        const key = gap.topic.toLowerCase();
        const existing = gapMap.get(key);
        if (existing) {
          existing.count++;
          // Upgrade priority if multiple competitors show same gap
          if (gap.priority === 'high' || existing.gap.priority !== 'high') {
            existing.gap.priority = gap.priority;
          }
        } else {
          gapMap.set(key, { gap, count: 1 });
        }
      }
    }

    // Sort by count (most common gaps first) then by priority
    return Array.from(gapMap.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.gap.priority] - priorityOrder[a.gap.priority];
      })
      .map((item) => item.gap);
  }

  /**
   * Delete competitor intelligence
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
  async getStaleEntries(threshold = 0.3): Promise<CompetitorIntelligenceEntry[]> {
    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.COMPETITOR_INTELLIGENCE];
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as CompetitorIntelligenceEntry;
        if (!isCompetitorIntelligenceEntry(entry)) return false;

        const freshness = calculateFreshnessScore(entry.metadata.createdAt, ttlDays);
        return isEntryStale(freshness, threshold);
      })
      .map((result: any) => result.metadata as CompetitorIntelligenceEntry);
  }

  /**
   * Get collection name
   */
  getCollectionName(): string {
    return SEO_COLLECTIONS.COMPETITOR_INTELLIGENCE;
  }
}
