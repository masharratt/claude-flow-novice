/**
 * SEO Keyword Research Collection
 *
 * CRUD operations for seo_keyword_research RuVector collection.
 * Caches keyword research results for topic clusters.
 *
 * TTL: 3 months (keyword metrics shift over time)
 *
 * @module seo/lib/ruvector/collections/keyword-research
 */

import type { VectorDB } from '@ruvector/core';
import {
  KeywordResearchEntry,
  SecondaryKeyword,
  SearchIntent,
  SEO_COLLECTIONS,
  COLLECTION_TTL_DAYS,
  generateKeywordResearchId,
  generateKeywordResearchEmbeddingText,
  calculateFreshnessScore,
  isKeywordResearchEntry,
  isEntryStale,
} from '../schemas';

/**
 * Input for creating keyword research
 */
export interface KeywordResearchInput {
  primaryKeyword: string;
  searchVolume: number;
  keywordDifficulty: number;
  cpc: number;
  searchIntent: SearchIntent;
  secondaryKeywords?: SecondaryKeyword[];
  longTailKeywords?: string[];
  peopleAlsoAsk?: string[];
  relatedSearches?: string[];
  clusterId?: string;
  niche: string;
}

/**
 * Query options for keyword research
 */
export interface KeywordResearchQueryOptions {
  /** Maximum results to return */
  limit?: number;

  /** Minimum similarity score (0.0-1.0) */
  minSimilarity?: number;

  /** Filter by niche */
  niche?: string;

  /** Filter by cluster ID */
  clusterId?: string;

  /** Filter by search intent */
  searchIntent?: SearchIntent;

  /** Minimum freshness score */
  minFreshnessScore?: number;

  /** Only include non-stale entries */
  excludeStale?: boolean;
}

/**
 * Keyword Research Collection Manager
 */
export class KeywordResearchCollection {
  private db: VectorDB;
  private embeddingFn: (text: string) => Promise<Float32Array>;

  constructor(db: VectorDB, embeddingFn: (text: string) => Promise<Float32Array>) {
    this.db = db;
    this.embeddingFn = embeddingFn;
  }

  /**
   * Add new keyword research
   */
  async add(input: KeywordResearchInput): Promise<KeywordResearchEntry> {
    const id = generateKeywordResearchId(input.primaryKeyword);
    const now = new Date();
    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.KEYWORD_RESEARCH];
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const metadata: KeywordResearchEntry['metadata'] = {
      primaryKeyword: input.primaryKeyword,
      searchVolume: input.searchVolume,
      keywordDifficulty: input.keywordDifficulty,
      cpc: input.cpc,
      searchIntent: input.searchIntent,
      secondaryKeywords: input.secondaryKeywords ?? [],
      longTailKeywords: input.longTailKeywords ?? [],
      peopleAlsoAsk: input.peopleAlsoAsk ?? [],
      relatedSearches: input.relatedSearches ?? [],
      clusterId: input.clusterId,
      niche: input.niche,
      createdAt: now,
      expiresAt,
      freshnessScore: 1.0,
    };

    const text = generateKeywordResearchEmbeddingText(metadata);
    const vector = await this.embeddingFn(text);

    const entry: KeywordResearchEntry = { id, text, metadata };

    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Update existing keyword research
   */
  async update(
    id: string,
    updates: Partial<KeywordResearchInput>
  ): Promise<KeywordResearchEntry | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.KEYWORD_RESEARCH];

    const updatedMetadata: KeywordResearchEntry['metadata'] = {
      ...existing.metadata,
      ...(updates.primaryKeyword && { primaryKeyword: updates.primaryKeyword }),
      ...(updates.searchVolume !== undefined && { searchVolume: updates.searchVolume }),
      ...(updates.keywordDifficulty !== undefined && {
        keywordDifficulty: updates.keywordDifficulty,
      }),
      ...(updates.cpc !== undefined && { cpc: updates.cpc }),
      ...(updates.searchIntent && { searchIntent: updates.searchIntent }),
      ...(updates.secondaryKeywords && { secondaryKeywords: updates.secondaryKeywords }),
      ...(updates.longTailKeywords && { longTailKeywords: updates.longTailKeywords }),
      ...(updates.peopleAlsoAsk && { peopleAlsoAsk: updates.peopleAlsoAsk }),
      ...(updates.relatedSearches && { relatedSearches: updates.relatedSearches }),
      ...(updates.clusterId && { clusterId: updates.clusterId }),
      ...(updates.niche && { niche: updates.niche }),
      freshnessScore: calculateFreshnessScore(existing.metadata.createdAt, ttlDays),
    };

    const text = generateKeywordResearchEmbeddingText(updatedMetadata);
    const vector = await this.embeddingFn(text);

    const entry: KeywordResearchEntry = { id, text, metadata: updatedMetadata };

    await this.db.delete(id);
    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Get keyword research by ID
   */
  async getById(id: string): Promise<KeywordResearchEntry | null> {
    try {
      const results = await this.db.search({
        vector: new Float32Array(1536).fill(0),
        k: 1000,
        filter: (item: any) => item.metadata?.id === id,
      });

      if (results.length === 0) return null;

      const result = results[0];
      if (isKeywordResearchEntry(result.metadata)) {
        return result.metadata as KeywordResearchEntry;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get keyword research by primary keyword (exact match)
   */
  async getByKeyword(keyword: string): Promise<KeywordResearchEntry | null> {
    const id = generateKeywordResearchId(keyword);
    return this.getById(id);
  }

  /**
   * Search for keyword research by semantic similarity
   */
  async search(
    query: string,
    options: KeywordResearchQueryOptions = {}
  ): Promise<Array<{ entry: KeywordResearchEntry; similarity: number }>> {
    const {
      limit = 10,
      minSimilarity = 0.5,
      niche,
      clusterId,
      searchIntent,
      minFreshnessScore,
      excludeStale = false,
    } = options;

    const queryVector = await this.embeddingFn(query);
    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.KEYWORD_RESEARCH];

    const results = await this.db.search({
      vector: queryVector,
      k: limit * 2,
    });

    return results
      .filter((result: any) => {
        if (result.score < minSimilarity) return false;
        const entry = result.metadata as KeywordResearchEntry;
        if (!isKeywordResearchEntry(entry)) return false;

        const currentFreshness = calculateFreshnessScore(entry.metadata.createdAt, ttlDays);

        if (excludeStale && isEntryStale(currentFreshness)) return false;
        if (minFreshnessScore && currentFreshness < minFreshnessScore) return false;
        if (niche && entry.metadata.niche !== niche) return false;
        if (clusterId && entry.metadata.clusterId !== clusterId) return false;
        if (searchIntent && entry.metadata.searchIntent !== searchIntent) return false;

        return true;
      })
      .slice(0, limit)
      .map((result: any) => ({
        entry: result.metadata as KeywordResearchEntry,
        similarity: result.score,
      }));
  }

  /**
   * Get all keyword research for a cluster
   */
  async getByClusterId(clusterId: string): Promise<KeywordResearchEntry[]> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as KeywordResearchEntry;
        return isKeywordResearchEntry(entry) && entry.metadata.clusterId === clusterId;
      })
      .map((result: any) => result.metadata as KeywordResearchEntry);
  }

  /**
   * Check if fresh keyword research exists for a keyword
   */
  async hasFreshResearch(keyword: string, freshnessThreshold = 0.3): Promise<boolean> {
    const entry = await this.getByKeyword(keyword);
    if (!entry) return false;

    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.KEYWORD_RESEARCH];
    const freshness = calculateFreshnessScore(entry.metadata.createdAt, ttlDays);

    return freshness >= freshnessThreshold;
  }

  /**
   * Delete keyword research
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
  async getStaleEntries(threshold = 0.3): Promise<KeywordResearchEntry[]> {
    const ttlDays = COLLECTION_TTL_DAYS[SEO_COLLECTIONS.KEYWORD_RESEARCH];
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as KeywordResearchEntry;
        if (!isKeywordResearchEntry(entry)) return false;

        const freshness = calculateFreshnessScore(entry.metadata.createdAt, ttlDays);
        return isEntryStale(freshness, threshold);
      })
      .map((result: any) => result.metadata as KeywordResearchEntry);
  }

  /**
   * Get collection name
   */
  getCollectionName(): string {
    return SEO_COLLECTIONS.KEYWORD_RESEARCH;
  }
}
