/**
 * SEO Expert Sources Collection
 *
 * CRUD operations for seo_expert_sources RuVector collection.
 * Stores expert sources with authority scores for evergreen reuse.
 *
 * TTL: Never expires (authority_score adjusts based on performance)
 *
 * @module seo/lib/ruvector/collections/expert-sources
 */

import type { VectorDB } from '@ruvector/core';
import {
  ExpertSourceEntry,
  ExpertQuote,
  ExpertSourceRef,
  SEO_COLLECTIONS,
  generateExpertSourceId,
  generateExpertSourceEmbeddingText,
  isExpertSourceEntry,
} from '../schemas';

/**
 * Input for creating/updating an expert source
 */
export interface ExpertSourceInput {
  name: string;
  credentials: string;
  primaryDomain: string;
  topics: string[];
  authorityScore?: number;
  quotes?: ExpertQuote[];
  sources?: ExpertSourceRef[];
  niche: string;
  parentNiche?: string;
}

/**
 * Query options for expert sources
 */
export interface ExpertSourceQueryOptions {
  /** Maximum results to return */
  limit?: number;

  /** Minimum similarity score (0.0-1.0) */
  minSimilarity?: number;

  /** Filter by niche */
  niche?: string;

  /** Include parent niche in search (cross-niche) */
  includeCrossNiche?: boolean;

  /** Minimum authority score */
  minAuthorityScore?: number;
}

/**
 * Expert Sources Collection Manager
 */
export class ExpertSourcesCollection {
  private db: VectorDB;
  private embeddingFn: (text: string) => Promise<Float32Array>;

  constructor(db: VectorDB, embeddingFn: (text: string) => Promise<Float32Array>) {
    this.db = db;
    this.embeddingFn = embeddingFn;
  }

  /**
   * Add a new expert source
   */
  async add(input: ExpertSourceInput): Promise<ExpertSourceEntry> {
    const id = generateExpertSourceId(input.name, input.primaryDomain);
    const now = new Date();

    const metadata: ExpertSourceEntry['metadata'] = {
      name: input.name,
      credentials: input.credentials,
      primaryDomain: input.primaryDomain,
      topics: input.topics,
      authorityScore: input.authorityScore ?? 0.5,
      quotes: input.quotes ?? [],
      sources: input.sources ?? [],
      firstSeen: now,
      lastUpdated: now,
      useCount: 0,
      articleIds: [],
      niche: input.niche,
      parentNiche: input.parentNiche,
    };

    const text = generateExpertSourceEmbeddingText(metadata);
    const vector = await this.embeddingFn(text);

    const entry: ExpertSourceEntry = { id, text, metadata };

    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Update an existing expert source
   */
  async update(
    id: string,
    updates: Partial<ExpertSourceInput> & { articleIds?: string[] }
  ): Promise<ExpertSourceEntry | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updatedMetadata: ExpertSourceEntry['metadata'] = {
      ...existing.metadata,
      ...(updates.name && { name: updates.name }),
      ...(updates.credentials && { credentials: updates.credentials }),
      ...(updates.primaryDomain && { primaryDomain: updates.primaryDomain }),
      ...(updates.topics && { topics: updates.topics }),
      ...(updates.authorityScore !== undefined && { authorityScore: updates.authorityScore }),
      ...(updates.quotes && { quotes: [...existing.metadata.quotes, ...updates.quotes] }),
      ...(updates.sources && { sources: [...existing.metadata.sources, ...updates.sources] }),
      ...(updates.niche && { niche: updates.niche }),
      ...(updates.parentNiche && { parentNiche: updates.parentNiche }),
      ...(updates.articleIds && {
        articleIds: [...new Set([...existing.metadata.articleIds, ...updates.articleIds])],
      }),
      lastUpdated: new Date(),
      useCount: existing.metadata.useCount + (updates.articleIds?.length ?? 0),
    };

    const text = generateExpertSourceEmbeddingText(updatedMetadata);
    const vector = await this.embeddingFn(text);

    const entry: ExpertSourceEntry = { id, text, metadata: updatedMetadata };

    // Delete old entry and insert updated
    await this.db.delete(id);
    await this.db.insert({
      id,
      vector,
      metadata: entry,
    });

    return entry;
  }

  /**
   * Get expert source by ID
   */
  async getById(id: string): Promise<ExpertSourceEntry | null> {
    try {
      const results = await this.db.search({
        vector: new Float32Array(1536).fill(0), // Dummy vector
        k: 1000, // Get all
        filter: (item: any) => item.metadata?.id === id,
      });

      if (results.length === 0) return null;

      const result = results[0];
      if (isExpertSourceEntry(result.metadata)) {
        return result.metadata as ExpertSourceEntry;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Search for experts by semantic similarity
   */
  async search(
    query: string,
    options: ExpertSourceQueryOptions = {}
  ): Promise<Array<{ entry: ExpertSourceEntry; similarity: number }>> {
    const { limit = 10, minSimilarity = 0.5, niche, includeCrossNiche = false, minAuthorityScore } =
      options;

    const queryVector = await this.embeddingFn(query);

    const results = await this.db.search({
      vector: queryVector,
      k: limit * 2, // Get extra for filtering
    });

    return results
      .filter((result: any) => {
        if (result.score < minSimilarity) return false;
        const entry = result.metadata as ExpertSourceEntry;
        if (!isExpertSourceEntry(entry)) return false;

        if (niche) {
          if (entry.metadata.niche !== niche) {
            if (!includeCrossNiche) return false;
            if (entry.metadata.parentNiche !== niche && entry.metadata.niche !== niche)
              return false;
          }
        }

        if (minAuthorityScore && entry.metadata.authorityScore < minAuthorityScore) {
          return false;
        }

        return true;
      })
      .slice(0, limit)
      .map((result: any) => ({
        entry: result.metadata as ExpertSourceEntry,
        similarity: result.score,
      }));
  }

  /**
   * Find experts by topic
   */
  async findByTopic(
    topic: string,
    options: ExpertSourceQueryOptions = {}
  ): Promise<Array<{ entry: ExpertSourceEntry; similarity: number }>> {
    return this.search(`Expert in ${topic}`, options);
  }

  /**
   * Increment use count and add article ID
   */
  async recordUsage(id: string, articleId: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;

    await this.update(id, { articleIds: [articleId] });
  }

  /**
   * Update authority score based on article performance
   *
   * @param id Expert source ID
   * @param performanceScore Article performance score (0-1)
   * @param weight How much to weight this update (default 0.1)
   */
  async updateAuthorityScore(id: string, performanceScore: number, weight = 0.1): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;

    // Weighted average: new_score = (1 - weight) * old_score + weight * performance
    const newScore =
      (1 - weight) * existing.metadata.authorityScore + weight * Math.max(0, Math.min(1, performanceScore));

    await this.update(id, { authorityScore: newScore });
  }

  /**
   * Delete an expert source
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
   * Get all expert sources for a niche
   */
  async getAllForNiche(niche: string): Promise<ExpertSourceEntry[]> {
    const results = await this.db.search({
      vector: new Float32Array(1536).fill(0),
      k: 1000,
    });

    return results
      .filter((result: any) => {
        const entry = result.metadata as ExpertSourceEntry;
        return isExpertSourceEntry(entry) && entry.metadata.niche === niche;
      })
      .map((result: any) => result.metadata as ExpertSourceEntry);
  }

  /**
   * Get collection name
   */
  getCollectionName(): string {
    return SEO_COLLECTIONS.EXPERT_SOURCES;
  }
}
