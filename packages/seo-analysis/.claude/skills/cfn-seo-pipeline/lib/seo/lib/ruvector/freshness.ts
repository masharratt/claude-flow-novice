/**
 * Freshness Manager for RuVector SEO Collections
 *
 * Manages TTL-based expiration, freshness scoring, and archival of SEO intelligence data.
 * Different collections have different decay rates based on their volatility.
 *
 * Part of P5-S1: Freshness & Maintenance Automation
 */

export type CollectionType =
  | 'expert_sources'
  | 'statistics'
  | 'keyword_research'
  | 'competitor_intelligence'
  | 'serp_patterns'
  | 'content_patterns';

export interface FreshnessConfig {
  ttlDays: Record<CollectionType, number>;
  archiveThreshold: number;
  deleteThreshold: number;
  minEntriesBeforeDelete: number;
  lastUsedBoostPercent: number;
}

export interface ExpiredEntry {
  id: string;
  collection: string;
  age_days: number;
  ttl_days: number;
  last_used: Date | null;
  freshness: number;
}

export interface FreshnessUpdateResult {
  scanned: number;
  updated: number;
  archived: number;
  deleted: number;
  errors: string[];
  byCollection: Record<CollectionType, {
    scanned: number;
    updated: number;
    archived: number;
    deleted: number;
  }>;
  duration_ms: number;
}

export interface ArchivalConfig {
  archiveThreshold: number;
  deleteThreshold: number;
  minEntriesBeforeDelete: number;
}

export interface SEOQueryManagerInterface {
  query(collection: string, filter?: Record<string, any>): Promise<any[]>;
  update(collection: string, id: string, data: Record<string, any>): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
}

/**
 * Default TTL configuration per collection type
 * - SERP patterns: 21 days (rapid decay - search results change frequently)
 * - Keyword research: 90 days (moderate decay - trends evolve quarterly)
 * - Competitor intelligence: 180 days (slow decay - strategies change gradually)
 * - Expert sources: 365 days (very slow decay - authority changes slowly)
 * - Statistics: 180 days (depends on time_sensitive flag)
 * - Content patterns: Never expire (confidence-based updates instead)
 */
export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  ttlDays: {
    serp_patterns: 21,
    keyword_research: 90,
    competitor_intelligence: 180,
    expert_sources: 365,
    statistics: 180,
    content_patterns: Infinity, // Never expire - confidence-based instead
  },
  archiveThreshold: 0.1,   // Archive entries with freshness < 0.1
  deleteThreshold: 0.0,     // Delete entries with freshness = 0
  minEntriesBeforeDelete: 5, // Keep at least 5 entries per topic
  lastUsedBoostPercent: 20,  // Extend TTL by 20% if recently used
};

export class FreshnessManager {
  private config: FreshnessConfig;

  constructor(config: Partial<FreshnessConfig> = {}) {
    this.config = {
      ...DEFAULT_FRESHNESS_CONFIG,
      ...config,
      ttlDays: {
        ...DEFAULT_FRESHNESS_CONFIG.ttlDays,
        ...(config.ttlDays || {}),
      },
    };
  }

  /**
   * Calculate freshness score for an entry
   * Formula: freshness = max(0, 1 - (age_days / effective_ttl_days))
   *
   * @param createdAt - When the entry was created
   * @param collection - Collection type (determines TTL)
   * @param lastUsed - When entry was last accessed (optional boost)
   * @returns Freshness score between 0 and 1
   */
  calculateFreshness(
    createdAt: Date,
    collection: CollectionType,
    lastUsed?: Date | null
  ): number {
    const now = new Date();
    const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    let ttlDays = this.config.ttlDays[collection];

    // Content patterns never expire (use confidence scoring instead)
    if (collection === 'content_patterns') {
      return 1.0;
    }

    // Apply last_used boost if entry was recently accessed
    if (lastUsed) {
      const timeSinceLastUse = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
      const recentUseThreshold = ttlDays * 0.3; // Recent = within 30% of TTL

      if (timeSinceLastUse < recentUseThreshold) {
        // Extend TTL by boost percentage
        ttlDays *= (1 + this.config.lastUsedBoostPercent / 100);
      }
    }

    // Calculate freshness score
    const freshness = Math.max(0, 1 - (ageDays / ttlDays));
    return Math.min(1, freshness); // Cap at 1.0
  }

  /**
   * Detect expired entries across collections
   *
   * @param queryManager - SEO query manager instance
   * @param collection - Optional: filter to specific collection
   * @returns List of expired entries with metadata
   */
  async detectExpiredEntries(
    queryManager: SEOQueryManagerInterface,
    collection?: CollectionType
  ): Promise<ExpiredEntry[]> {
    const expiredEntries: ExpiredEntry[] = [];
    const collectionsToCheck = collection
      ? [collection]
      : Object.keys(this.config.ttlDays) as CollectionType[];

    for (const coll of collectionsToCheck) {
      // Skip content_patterns - they don't expire via TTL
      if (coll === 'content_patterns') {
        continue;
      }

      try {
        const entries = await queryManager.query(coll);

        for (const entry of entries) {
          if (!entry.created_at) continue;

          const createdAt = new Date(entry.created_at);
          const lastUsed = entry.last_used ? new Date(entry.last_used) : null;
          const freshness = this.calculateFreshness(createdAt, coll, lastUsed);

          const now = new Date();
          const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
          const ttlDays = this.config.ttlDays[coll];

          // Entry is expired if freshness is below delete threshold
          if (freshness <= this.config.deleteThreshold) {
            expiredEntries.push({
              id: entry.id,
              collection: coll,
              age_days: ageDays,
              ttl_days: ttlDays,
              last_used: lastUsed,
              freshness,
            });
          }
        }
      } catch (error) {
        console.error(`Error checking collection ${coll}:`, error);
      }
    }

    return expiredEntries;
  }

  /**
   * Update freshness scores for entries in batch
   *
   * @param queryManager - SEO query manager instance
   * @param options - Configuration options
   * @returns Update result with statistics
   */
  async updateFreshness(
    queryManager: SEOQueryManagerInterface,
    options: {
      collection?: CollectionType;
      batchSize?: number;
      dryRun?: boolean;
    } = {}
  ): Promise<FreshnessUpdateResult> {
    const startTime = Date.now();
    const { collection, batchSize = 100, dryRun = false } = options;

    const result: FreshnessUpdateResult = {
      scanned: 0,
      updated: 0,
      archived: 0,
      deleted: 0,
      errors: [],
      byCollection: {} as Record<CollectionType, any>,
      duration_ms: 0,
    };

    // Initialize per-collection stats
    const collectionsToProcess = collection
      ? [collection]
      : Object.keys(this.config.ttlDays) as CollectionType[];

    for (const coll of collectionsToProcess) {
      result.byCollection[coll] = {
        scanned: 0,
        updated: 0,
        archived: 0,
        deleted: 0,
      };
    }

    for (const coll of collectionsToProcess) {
      try {
        const entries = await queryManager.query(coll);
        result.byCollection[coll].scanned = entries.length;
        result.scanned += entries.length;

        // Process in batches
        for (let i = 0; i < entries.length; i += batchSize) {
          const batch = entries.slice(i, i + batchSize);

          for (const entry of batch) {
            try {
              if (!entry.created_at) continue;

              const createdAt = new Date(entry.created_at);
              const lastUsed = entry.last_used ? new Date(entry.last_used) : null;
              const freshness = this.calculateFreshness(createdAt, coll, lastUsed);

              // Determine action based on freshness
              if (freshness <= this.config.deleteThreshold) {
                // Check if we should keep minimum entries
                const topicEntries = await this.getEntriesForTopic(
                  queryManager,
                  coll,
                  entry.topic || entry.keyword || entry.domain
                );

                if (topicEntries.length > this.config.minEntriesBeforeDelete) {
                  if (!dryRun) {
                    await queryManager.delete(coll, entry.id);
                  }
                  result.deleted++;
                  result.byCollection[coll].deleted++;
                }
              } else if (freshness < this.config.archiveThreshold) {
                // Archive entry (mark as archived, but don't delete)
                if (!dryRun) {
                  await queryManager.update(coll, entry.id, {
                    freshness,
                    archived: true,
                    archived_at: new Date().toISOString(),
                  });
                }
                result.archived++;
                result.byCollection[coll].archived++;
              } else {
                // Update freshness score
                if (!dryRun && entry.freshness !== freshness) {
                  await queryManager.update(coll, entry.id, { freshness });
                }
                result.updated++;
                result.byCollection[coll].updated++;
              }
            } catch (error) {
              const errMsg = `Error processing entry ${entry.id} in ${coll}: ${error}`;
              result.errors.push(errMsg);
              console.error(errMsg);
            }
          }
        }
      } catch (error) {
        const errMsg = `Error processing collection ${coll}: ${error}`;
        result.errors.push(errMsg);
        console.error(errMsg);
      }
    }

    result.duration_ms = Date.now() - startTime;
    return result;
  }

  /**
   * Archive expired entries based on configuration thresholds
   *
   * @param queryManager - SEO query manager instance
   * @param config - Archival configuration
   * @returns Number of entries archived/deleted
   */
  async archiveExpiredEntries(
    queryManager: SEOQueryManagerInterface,
    config: Partial<ArchivalConfig> = {}
  ): Promise<{ archived: number; deleted: number; errors: string[] }> {
    const archivalConfig: ArchivalConfig = {
      archiveThreshold: config.archiveThreshold ?? this.config.archiveThreshold,
      deleteThreshold: config.deleteThreshold ?? this.config.deleteThreshold,
      minEntriesBeforeDelete: config.minEntriesBeforeDelete ?? this.config.minEntriesBeforeDelete,
    };

    const result = await this.updateFreshness(queryManager, { dryRun: false });

    return {
      archived: result.archived,
      deleted: result.deleted,
      errors: result.errors,
    };
  }

  /**
   * Get all entries for a specific topic/keyword/domain
   * Used to enforce minimum entry thresholds before deletion
   */
  private async getEntriesForTopic(
    queryManager: SEOQueryManagerInterface,
    collection: CollectionType,
    topicIdentifier?: string
  ): Promise<any[]> {
    if (!topicIdentifier) {
      return [];
    }

    try {
      // Query by topic, keyword, or domain depending on collection
      const filter: Record<string, any> = {};

      if (collection === 'keyword_research') {
        filter.keyword = topicIdentifier;
      } else if (collection === 'competitor_intelligence') {
        filter.domain = topicIdentifier;
      } else {
        filter.topic = topicIdentifier;
      }

      return await queryManager.query(collection, filter);
    } catch (error) {
      console.error(`Error getting entries for topic ${topicIdentifier}:`, error);
      return [];
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): FreshnessConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FreshnessConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      ttlDays: {
        ...this.config.ttlDays,
        ...(config.ttlDays || {}),
      },
    };
  }

  /**
   * Get freshness statistics across all collections
   */
  async getFreshnessStats(
    queryManager: SEOQueryManagerInterface
  ): Promise<Record<CollectionType, {
    total: number;
    fresh: number;      // freshness > 0.7
    aging: number;      // 0.3 < freshness <= 0.7
    stale: number;      // 0.1 < freshness <= 0.3
    expired: number;    // freshness <= 0.1
    avgFreshness: number;
  }>> {
    const stats: any = {};
    const collections = Object.keys(this.config.ttlDays) as CollectionType[];

    for (const coll of collections) {
      try {
        const entries = await queryManager.query(coll);

        let fresh = 0, aging = 0, stale = 0, expired = 0;
        let totalFreshness = 0;

        for (const entry of entries) {
          if (!entry.created_at) continue;

          const createdAt = new Date(entry.created_at);
          const lastUsed = entry.last_used ? new Date(entry.last_used) : null;
          const freshness = this.calculateFreshness(createdAt, coll, lastUsed);

          totalFreshness += freshness;

          if (freshness > 0.7) fresh++;
          else if (freshness > 0.3) aging++;
          else if (freshness > 0.1) stale++;
          else expired++;
        }

        stats[coll] = {
          total: entries.length,
          fresh,
          aging,
          stale,
          expired,
          avgFreshness: entries.length > 0 ? totalFreshness / entries.length : 0,
        };
      } catch (error) {
        console.error(`Error getting stats for ${coll}:`, error);
        stats[coll] = {
          total: 0,
          fresh: 0,
          aging: 0,
          stale: 0,
          expired: 0,
          avgFreshness: 0,
        };
      }
    }

    return stats;
  }
}

/**
 * Export convenience function for quick freshness updates
 */
export async function updateCollectionFreshness(
  queryManager: SEOQueryManagerInterface,
  collection?: CollectionType,
  config?: Partial<FreshnessConfig>
): Promise<FreshnessUpdateResult> {
  const manager = new FreshnessManager(config);
  return manager.updateFreshness(queryManager, { collection });
}

/**
 * Export convenience function for expiration detection
 */
export async function detectExpired(
  queryManager: SEOQueryManagerInterface,
  collection?: CollectionType,
  config?: Partial<FreshnessConfig>
): Promise<ExpiredEntry[]> {
  const manager = new FreshnessManager(config);
  return manager.detectExpiredEntries(queryManager, collection);
}
