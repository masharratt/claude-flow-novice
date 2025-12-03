/**
 * SEO Intelligence RuVector Module
 *
 * Unified exports for SEO RuVector collections, storage, and query utilities.
 *
 * Key Features:
 * - 6 specialized collections for SEO intelligence
 * - Pre-research queries (Step 0.5) to skip redundant research
 * - Post-research storage (Step 4.5) to cache research results
 * - Post-success pattern extraction (Step 12.5)
 * - Performance feedback loop (Step 13.5)
 *
 * Target Metrics:
 * - 80%+ cost reduction through research reuse
 * - 75%+ time savings for content clusters
 * - Self-improving patterns via performance feedback
 *
 * @module seo/lib/ruvector
 */

// =============================================
// Schema Exports
// =============================================

export {
  // Collection names
  SEO_COLLECTIONS,
  type SEOCollectionName,

  // Collection 1: Expert Sources
  type ExpertSourceEntry,
  type ExpertQuote,
  type ExpertSourceRef,
  isExpertSourceEntry,
  generateExpertSourceEmbeddingText,
  generateExpertSourceId,

  // Collection 2: Statistics
  type StatisticEntry,
  isStatisticEntry,
  generateStatisticEmbeddingText,
  generateStatisticId,

  // Collection 3: Keyword Research
  type KeywordResearchEntry,
  type SecondaryKeyword,
  type SearchIntent,
  isKeywordResearchEntry,
  generateKeywordResearchEmbeddingText,
  generateKeywordResearchId,

  // Collection 4: Competitor Intelligence
  type CompetitorIntelligenceEntry,
  type ArchitecturePattern,
  type ContentStrategyPattern,
  type HubPage,
  type ContentGap,
  isCompetitorIntelligenceEntry,
  generateCompetitorIntelligenceEmbeddingText,
  generateCompetitorIntelligenceId,

  // Collection 5: SERP Patterns
  type SERPPatternEntry,
  type SERPFeature,
  type SERPFeatureOpportunity,
  type RankingPattern,
  type SemanticCluster,
  isSERPPatternEntry,
  generateSERPPatternEmbeddingText,
  generateSERPPatternId,

  // Collection 6: Content Patterns
  type ContentPatternEntry,
  type ContentPatternType,
  type PatternPerformanceMetrics,
  isContentPatternEntry,
  generateContentPatternEmbeddingText,
  generateContentPatternId,

  // Freshness utilities
  COLLECTION_TTL_DAYS,
  calculateFreshnessScore,
  isEntryStale,
  normalizeForId,
} from './schemas';

// =============================================
// Collection Exports
// =============================================

export {
  ExpertSourcesCollection,
  type ExpertSourceInput,
  type ExpertSourceQueryOptions,
} from './collections/expert-sources';

export {
  StatisticsCollection,
  type StatisticInput,
  type StatisticQueryOptions,
} from './collections/statistics';

export {
  KeywordResearchCollection,
  type KeywordResearchInput,
  type KeywordResearchQueryOptions,
} from './collections/keyword-research';

export {
  CompetitorIntelligenceCollection,
  type CompetitorIntelligenceInput,
  type CompetitorIntelligenceQueryOptions,
} from './collections/competitor-intelligence';

export {
  SERPPatternsCollection,
  type SERPPatternInput,
  type SERPPatternQueryOptions,
} from './collections/serp-patterns';

export {
  ContentPatternsCollection,
  type ContentPatternInput,
  type ContentPatternQueryOptions,
} from './collections/content-patterns';

// =============================================
// Storage Exports
// =============================================

export {
  SEOStorageManager,
  type ResearchStorageData,
  type ResearchStorageResult,
  type PatternExtractionData,
  type PatternExtractionResult,
} from './storage';

// =============================================
// Query Exports
// =============================================

export {
  SEOQueryManager,
  type PreResearchQuery,
  type PreResearchResult,
  type ContentGuidanceQuery,
  type ContentGuidanceResult,
  type CrossNicheQueryOptions,
} from './queries';

// =============================================
// Pre-Research Intelligence Gatherer Exports
// =============================================

export {
  PreResearchIntelligenceGatherer,
  type CacheStatus,
  type ResearchNeeded,
  type CachedIntelligence,
  type PreResearchResult as PreResearchIntelligenceResult,
  type PreResearchQuery as PreResearchIntelligenceQuery,
} from './pre-research-query';

// =============================================
// Convenience Factory Functions
// =============================================

import type { VectorDB } from '@ruvector/core';
import { SEO_COLLECTIONS, SEOCollectionName } from './schemas';
import { SEOStorageManager } from './storage';
import { SEOQueryManager } from './queries';
import { PreResearchIntelligenceGatherer } from './pre-research-query';

/**
 * Create all SEO collection database instances
 *
 * @param createDb - Function to create a VectorDB instance for a collection
 * @returns Map of collection name to database instance
 */
export async function createSEOCollections(
  createDb: (collectionName: SEOCollectionName) => Promise<VectorDB>
): Promise<Map<SEOCollectionName, VectorDB>> {
  const collections = new Map<SEOCollectionName, VectorDB>();

  for (const name of Object.values(SEO_COLLECTIONS)) {
    const db = await createDb(name);
    collections.set(name, db);
  }

  return collections;
}

/**
 * Create SEO Storage Manager instance
 *
 * @param collections - Map of collection databases
 * @param embeddingFn - Function to generate embeddings
 * @returns SEOStorageManager instance
 */
export function createStorageManager(
  collections: Map<SEOCollectionName, VectorDB>,
  embeddingFn: (text: string) => Promise<Float32Array>
): SEOStorageManager {
  return new SEOStorageManager(collections, embeddingFn);
}

/**
 * Create SEO Query Manager instance
 *
 * @param collections - Map of collection databases
 * @param embeddingFn - Function to generate embeddings
 * @returns SEOQueryManager instance
 */
export function createQueryManager(
  collections: Map<SEOCollectionName, VectorDB>,
  embeddingFn: (text: string) => Promise<Float32Array>
): SEOQueryManager {
  return new SEOQueryManager(collections, embeddingFn);
}

/**
 * Create Pre-Research Intelligence Gatherer instance
 *
 * @param queryManager - SEOQueryManager instance
 * @returns PreResearchIntelligenceGatherer instance
 */
export function createPreResearchGatherer(
  queryManager: SEOQueryManager
): PreResearchIntelligenceGatherer {
  return new PreResearchIntelligenceGatherer(queryManager);
}

/**
 * Create both Storage and Query managers
 *
 * @param collections - Map of collection databases
 * @param embeddingFn - Function to generate embeddings
 * @returns Object with storage and query managers
 */
export function createSEOIntelligenceManagers(
  collections: Map<SEOCollectionName, VectorDB>,
  embeddingFn: (text: string) => Promise<Float32Array>
): {
  storage: SEOStorageManager;
  query: SEOQueryManager;
  preResearch: PreResearchIntelligenceGatherer;
} {
  const query = new SEOQueryManager(collections, embeddingFn);
  return {
    storage: new SEOStorageManager(collections, embeddingFn),
    query,
    preResearch: new PreResearchIntelligenceGatherer(query),
  };
}
