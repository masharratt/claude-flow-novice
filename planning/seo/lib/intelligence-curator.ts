/**
 * Intelligence Curator Agent - SEO Intelligence Integration Phase 1 Sprint 2
 *
 * @module planning/seo/lib/intelligence-curator
 * @description Manages Step 0 (pre-load intelligence) and Step 12 (capture learning)
 *              of the enhanced 14-step SEO pipeline
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  IntelligenceQuery,
  CompetitiveIntelligence,
  SERPPattern,
  LearningCapture,
  IntelligenceLoadResult,
  ResearchQuery,
} from '../types';
import { ResearchService } from './research-service';

/**
 * Intelligence Curator configuration
 */
interface IntelligenceCuratorConfig {
  /** Path to knowledge store directory */
  knowledgeStorePath?: string;

  /** Custom research service instance */
  researchService?: ResearchService;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Default max age for intelligence data (days) */
  defaultMaxAge?: number;
}

/**
 * Intelligence Curator implementation
 *
 * Responsibilities:
 * - Step 0: Pre-load intelligence before pipeline execution
 * - Step 12: Capture learning after content generation
 * - Knowledge store management (file-based persistence)
 * - Integration with ResearchService for fresh data
 */
export class IntelligenceCurator {
  private knowledgeStorePath: string;
  private researchService: ResearchService;
  private config: IntelligenceCuratorConfig;

  constructor(config: IntelligenceCuratorConfig = {}) {
    this.config = config;
    this.knowledgeStorePath =
      config.knowledgeStorePath ||
      path.join(__dirname, '..', 'knowledge-store');
    this.researchService =
      config.researchService || new ResearchService({ verbose: config.verbose });
  }

  /**
   * Step 0: Load intelligence for target keyword
   *
   * Loads relevant intelligence from knowledge store and optionally
   * fetches fresh data via ResearchService
   *
   * @param query - Intelligence query configuration
   * @returns Combined intelligence data
   */
  async loadIntelligence(query: IntelligenceQuery): Promise<IntelligenceLoadResult> {
    const startTime = Date.now();

    if (this.config.verbose) {
      console.log(`[IntelligenceCurator] Loading intelligence for: ${query.targetKeyword}`);
    }

    // Ensure knowledge store exists
    await this.ensureKnowledgeStore();

    const maxAge = query.maxAge || this.config.defaultMaxAge || 30;
    const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);

    // Load competitive intelligence
    const competitive = await this.loadCompetitiveIntelligence(
      query.targetKeyword,
      query.competitorDomains,
      cutoffDate
    );

    // Load SERP patterns
    const serpPatterns = await this.loadSerpPatterns(query.targetKeyword, cutoffDate);

    // Load historical learnings if requested
    const learnings = query.includeHistorical
      ? await this.loadHistoricalLearnings(query.targetKeyword, cutoffDate)
      : [];

    // Determine if we need fresh data
    const hasFreshData = serpPatterns.length > 0 || competitive.length > 0;
    const shouldFetchFresh = !hasFreshData || (query.includeHistorical ?? false);

    // Fetch fresh SERP data if needed
    if (shouldFetchFresh) {
      await this.fetchFreshSerpData(query.targetKeyword);
    }

    const executionTime = Date.now() - startTime;
    const allItems = [...competitive, ...serpPatterns, ...learnings];
    const oldestItemAge = this.calculateOldestItemAge(allItems);

    if (this.config.verbose) {
      console.log(
        `[IntelligenceCurator] Loaded ${allItems.length} intelligence items in ${executionTime}ms`
      );
    }

    return {
      competitive,
      serpPatterns,
      learnings,
      metadata: {
        itemsLoaded: allItems.length,
        oldestItemAge,
        executionTime,
        hasFreshData: shouldFetchFresh,
      },
    };
  }

  /**
   * Step 12: Capture learning from content generation
   *
   * Stores learning outcome in knowledge store for future reference
   *
   * @param learning - Learning capture data
   */
  async captureLearning(learning: LearningCapture): Promise<void> {
    if (this.config.verbose) {
      console.log(
        `[IntelligenceCurator] Capturing learning: ${learning.topic} (${learning.outcome})`
      );
    }

    await this.ensureKnowledgeStore();

    const timestamp = learning.capturedAt.toISOString().replace(/[:.]/g, '-');
    const topicHash = this.hashString(learning.topic).substring(0, 8);
    const subdirectory = learning.outcome === 'success' ? 'successes' : 'failures';

    const filename = `${timestamp}-${topicHash}.json`;
    const filepath = path.join(
      this.knowledgeStorePath,
      'learning',
      subdirectory,
      filename
    );

    const data = JSON.stringify(learning, null, 2);
    await fs.writeFile(filepath, data, 'utf-8');

    if (this.config.verbose) {
      console.log(`[IntelligenceCurator] Learning captured: ${filepath}`);
    }
  }

  /**
   * Store competitive intelligence data
   *
   * @param intelligence - Competitive intelligence data
   */
  async storeCompetitiveIntelligence(
    intelligence: CompetitiveIntelligence
  ): Promise<void> {
    await this.ensureKnowledgeStore();

    const domainDir = path.join(
      this.knowledgeStorePath,
      'competitive-intelligence',
      this.sanitizeDomain(intelligence.domain)
    );

    await fs.mkdir(domainDir, { recursive: true });

    // Store content strategy
    const contentStrategyPath = path.join(domainDir, 'content-strategy.json');
    await fs.writeFile(
      contentStrategyPath,
      JSON.stringify(intelligence.contentStrategy, null, 2),
      'utf-8'
    );

    // Store keyword targeting
    const keywordTargetingPath = path.join(domainDir, 'keyword-targeting.json');
    await fs.writeFile(
      keywordTargetingPath,
      JSON.stringify(intelligence.keywordTargeting, null, 2),
      'utf-8'
    );

    // Store backlink profile
    const backlinkProfilePath = path.join(domainDir, 'backlink-profile.json');
    await fs.writeFile(
      backlinkProfilePath,
      JSON.stringify(intelligence.backlinks, null, 2),
      'utf-8'
    );

    if (this.config.verbose) {
      console.log(
        `[IntelligenceCurator] Stored competitive intelligence: ${intelligence.domain}`
      );
    }
  }

  /**
   * Store SERP pattern data
   *
   * @param pattern - SERP pattern data
   */
  async storeSerpPattern(pattern: SERPPattern): Promise<void> {
    await this.ensureKnowledgeStore();

    const keywordHash = this.hashString(pattern.keyword);
    const patternDir = path.join(
      this.knowledgeStorePath,
      'serp-patterns',
      keywordHash
    );

    await fs.mkdir(patternDir, { recursive: true });

    // Store featured snippets
    const snippetsPath = path.join(patternDir, 'featured-snippets.json');
    await fs.writeFile(
      snippetsPath,
      JSON.stringify(pattern.featuredSnippets, null, 2),
      'utf-8'
    );

    // Store people also ask
    const paaPath = path.join(patternDir, 'people-also-ask.json');
    await fs.writeFile(
      paaPath,
      JSON.stringify(pattern.peopleAlsoAsk, null, 2),
      'utf-8'
    );

    // Store related searches
    const relatedPath = path.join(patternDir, 'related-searches.json');
    await fs.writeFile(
      relatedPath,
      JSON.stringify(pattern.relatedSearches, null, 2),
      'utf-8'
    );

    // Store metadata
    const metadataPath = path.join(patternDir, 'metadata.json');
    await fs.writeFile(
      metadataPath,
      JSON.stringify({ keyword: pattern.keyword, capturedAt: pattern.capturedAt }, null, 2),
      'utf-8'
    );

    if (this.config.verbose) {
      console.log(`[IntelligenceCurator] Stored SERP pattern: ${pattern.keyword}`);
    }
  }

  /**
   * Load competitive intelligence from knowledge store
   *
   * @param targetKeyword - Target keyword
   * @param competitorDomains - Optional specific competitor domains
   * @param cutoffDate - Maximum age cutoff
   * @returns Array of competitive intelligence data
   */
  private async loadCompetitiveIntelligence(
    targetKeyword: string,
    competitorDomains?: string[],
    cutoffDate?: Date
  ): Promise<CompetitiveIntelligence[]> {
    const intelligenceDir = path.join(
      this.knowledgeStorePath,
      'competitive-intelligence'
    );

    try {
      const domains = competitorDomains || (await fs.readdir(intelligenceDir));
      const results: CompetitiveIntelligence[] = [];

      for (const domain of domains) {
        const domainDir = path.join(intelligenceDir, this.sanitizeDomain(domain));

        try {
          const contentStrategy = await this.readJsonFile(
            path.join(domainDir, 'content-strategy.json')
          );
          const keywordTargeting = await this.readJsonFile(
            path.join(domainDir, 'keyword-targeting.json')
          );
          const backlinks = await this.readJsonFile(
            path.join(domainDir, 'backlink-profile.json')
          );

          // Check if data is within age limit
          const stats = await fs.stat(path.join(domainDir, 'content-strategy.json'));
          if (cutoffDate && stats.mtime < cutoffDate) {
            continue;
          }

          results.push({
            domain,
            contentStrategy,
            keywordTargeting,
            backlinks,
            analyzedAt: stats.mtime,
          });
        } catch (error) {
          // Skip domains with incomplete data
          if (this.config.verbose) {
            console.log(`[IntelligenceCurator] Skipping incomplete domain: ${domain}`);
          }
        }
      }

      return results;
    } catch (error) {
      // Directory doesn't exist yet
      return [];
    }
  }

  /**
   * Load SERP patterns from knowledge store
   *
   * @param targetKeyword - Target keyword
   * @param cutoffDate - Maximum age cutoff
   * @returns Array of SERP patterns
   */
  private async loadSerpPatterns(
    targetKeyword: string,
    cutoffDate?: Date
  ): Promise<SERPPattern[]> {
    const keywordHash = this.hashString(targetKeyword);
    const patternDir = path.join(this.knowledgeStorePath, 'serp-patterns', keywordHash);

    try {
      const metadataPath = path.join(patternDir, 'metadata.json');
      const stats = await fs.stat(metadataPath);

      // Check age
      if (cutoffDate && stats.mtime < cutoffDate) {
        return [];
      }

      const metadata = await this.readJsonFile(metadataPath);
      const featuredSnippets = await this.readJsonFile(
        path.join(patternDir, 'featured-snippets.json')
      );
      const peopleAlsoAsk = await this.readJsonFile(
        path.join(patternDir, 'people-also-ask.json')
      );
      const relatedSearches = await this.readJsonFile(
        path.join(patternDir, 'related-searches.json')
      );

      return [
        {
          keyword: metadata.keyword || targetKeyword,
          featuredSnippets,
          peopleAlsoAsk,
          relatedSearches,
          capturedAt: new Date(metadata.capturedAt || stats.mtime),
        },
      ];
    } catch (error) {
      // Pattern doesn't exist yet
      return [];
    }
  }

  /**
   * Load historical learnings from knowledge store
   *
   * @param targetKeyword - Target keyword
   * @param cutoffDate - Maximum age cutoff
   * @returns Array of learning captures
   */
  private async loadHistoricalLearnings(
    targetKeyword: string,
    cutoffDate?: Date
  ): Promise<LearningCapture[]> {
    const learningDir = path.join(this.knowledgeStorePath, 'learning');
    const results: LearningCapture[] = [];

    try {
      for (const subdirectory of ['successes', 'failures']) {
        const subdir = path.join(learningDir, subdirectory);
        const files = await fs.readdir(subdir);

        for (const file of files) {
          if (!file.endsWith('.json')) continue;

          const filepath = path.join(subdir, file);
          const stats = await fs.stat(filepath);

          // Check age
          if (cutoffDate && stats.mtime < cutoffDate) {
            continue;
          }

          const learning = await this.readJsonFile(filepath);

          // Simple keyword matching (can be enhanced with semantic search)
          const keywordLower = targetKeyword.toLowerCase();
          if (
            learning.topic?.toLowerCase().includes(keywordLower) ||
            learning.context?.targetKeyword?.toLowerCase().includes(keywordLower)
          ) {
            results.push({
              ...learning,
              capturedAt: new Date(learning.capturedAt || stats.mtime),
            });
          }
        }
      }

      return results;
    } catch (error) {
      // Learning directory doesn't exist yet
      return [];
    }
  }

  /**
   * Fetch fresh SERP data via ResearchService
   *
   * @param targetKeyword - Target keyword
   */
  private async fetchFreshSerpData(targetKeyword: string): Promise<void> {
    try {
      const query: ResearchQuery = {
        query: targetKeyword,
        type: 'serp',
        options: {
          maxResults: 10,
        },
      };

      const result = await this.researchService.execute(query);

      // Extract and store SERP patterns
      if (result.serpResults && result.serpResults.length > 0) {
        const pattern: SERPPattern = {
          keyword: targetKeyword,
          featuredSnippets: result.serpResults
            .filter((r) => r.features && r.features.length > 0)
            .map((r) => ({
              type: r.features![0],
              structure: 'Auto-extracted',
              example: r.description,
            })),
          peopleAlsoAsk: result.serpResults
            .filter((r) => r.title.toLowerCase().includes('?'))
            .map((r) => r.title),
          relatedSearches: [],
          capturedAt: new Date(),
        };

        await this.storeSerpPattern(pattern);
      }
    } catch (error) {
      if (this.config.verbose) {
        console.error(
          `[IntelligenceCurator] Failed to fetch fresh SERP data: ${error}`
        );
      }
      // Don't throw - fresh data is optional
    }
  }

  /**
   * Ensure knowledge store directory structure exists
   */
  private async ensureKnowledgeStore(): Promise<void> {
    const subdirectories = [
      'competitive-intelligence',
      'serp-patterns',
      'learning/successes',
      'learning/failures',
    ];

    for (const subdir of subdirectories) {
      const dirPath = path.join(this.knowledgeStorePath, subdir);
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Read and parse JSON file
   *
   * @param filepath - Path to JSON file
   * @returns Parsed JSON data
   */
  private async readJsonFile(filepath: string): Promise<any> {
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Hash string to create consistent directory names
   *
   * @param input - Input string
   * @returns Hash string
   */
  private hashString(input: string): string {
    return crypto.createHash('sha256').update(input.toLowerCase()).digest('hex');
  }

  /**
   * Sanitize domain name for use in filesystem
   *
   * @param domain - Domain name
   * @returns Sanitized domain name
   */
  private sanitizeDomain(domain: string): string {
    return domain.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
  }

  /**
   * Calculate age of oldest item in days
   *
   * @param items - Array of items with dates
   * @returns Age in days
   */
  private calculateOldestItemAge(
    items: Array<{ capturedAt?: Date; analyzedAt?: Date }>
  ): number {
    if (items.length === 0) return 0;

    const now = Date.now();
    let oldestTime = now;

    for (const item of items) {
      const timestamp =
        (item.capturedAt || item.analyzedAt)?.getTime() || now;
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
      }
    }

    return Math.floor((now - oldestTime) / (24 * 60 * 60 * 1000));
  }

  /**
   * Get knowledge store statistics
   *
   * @returns Statistics about knowledge store contents
   */
  async getKnowledgeStoreStats(): Promise<{
    competitorCount: number;
    serpPatternCount: number;
    successLearningCount: number;
    failureLearningCount: number;
  }> {
    await this.ensureKnowledgeStore();

    const competitiveDir = path.join(
      this.knowledgeStorePath,
      'competitive-intelligence'
    );
    const serpDir = path.join(this.knowledgeStorePath, 'serp-patterns');
    const successDir = path.join(this.knowledgeStorePath, 'learning/successes');
    const failureDir = path.join(this.knowledgeStorePath, 'learning/failures');

    const [competitors, serpPatterns, successes, failures] = await Promise.all([
      this.countDirectories(competitiveDir),
      this.countDirectories(serpDir),
      this.countFiles(successDir, '.json'),
      this.countFiles(failureDir, '.json'),
    ]);

    return {
      competitorCount: competitors,
      serpPatternCount: serpPatterns,
      successLearningCount: successes,
      failureLearningCount: failures,
    };
  }

  /**
   * Count directories in a path
   *
   * @param dirPath - Directory path
   * @returns Count of subdirectories
   */
  private async countDirectories(dirPath: string): Promise<number> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).length;
    } catch {
      return 0;
    }
  }

  /**
   * Count files in a path matching extension
   *
   * @param dirPath - Directory path
   * @param extension - File extension filter
   * @returns Count of matching files
   */
  private async countFiles(dirPath: string, extension: string): Promise<number> {
    try {
      const entries = await fs.readdir(dirPath);
      return entries.filter((e) => e.endsWith(extension)).length;
    } catch {
      return 0;
    }
  }
}

/**
 * Default intelligence curator instance
 */
export const intelligenceCurator = new IntelligenceCurator({ verbose: false });

/**
 * Convenience function for Step 0: Load intelligence
 *
 * @param targetKeyword - Target keyword
 * @param options - Optional query configuration
 * @returns Intelligence load result
 */
export async function loadIntelligence(
  targetKeyword: string,
  options?: {
    competitorDomains?: string[];
    includeHistorical?: boolean;
    maxAge?: number;
  }
): Promise<IntelligenceLoadResult> {
  return intelligenceCurator.loadIntelligence({
    targetKeyword,
    ...options,
  });
}

/**
 * Convenience function for Step 12: Capture learning
 *
 * @param learning - Learning capture data
 */
export async function captureLearning(learning: LearningCapture): Promise<void> {
  return intelligenceCurator.captureLearning(learning);
}
