/**
 * Pattern Manager - SEO Intelligence Integration Phase 1 Sprint 3
 *
 * @module planning/seo/lib/pattern-manager
 * @description Manages pattern loading, validation, querying, and lifecycle transitions
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  Pattern,
  PatternType,
  PatternLifecycle,
  PatternQuery,
  PatternValidationResult,
  PatternPromotionResult,
  PatternConfidenceUpdateResult,
  PatternEvidence,
  isDiscoveryPattern,
  isValidationPattern,
  isPromotedPattern,
  isArchivedPattern,
} from '../types';

/**
 * Pattern Manager configuration
 */
export interface PatternManagerConfig {
  /** Path to knowledge store directory */
  knowledgeStorePath?: string;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Auto-save patterns after updates */
  autoSave?: boolean;

  /** Validate patterns on load */
  validateOnLoad?: boolean;
}

/**
 * Pattern file structure from YAML
 */
interface PatternFile {
  patterns: Array<{
    id: string;
    type: string;
    category: string;
    name: string;
    description: string;
    confidence: number;
    lifecycle: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    evidence: Array<{
      source: string;
      outcome: string;
      capturedAt: string;
      metrics?: Record<string, number>;
      notes?: string;
      domain?: string;
      contentType?: string;
    }>;
    metadata: {
      applicability: {
        contentTypes: string[];
        industries: string[];
        restrictions?: string[];
      };
      performance: {
        successRate: number;
        totalApplications: number;
        avgImpact?: Record<string, number>;
      };
      domain?: string;
      keywords?: string[];
      seasonality?: {
        hasSeasonality: boolean;
        peakMonths?: string[];
        troughMonths?: string[];
      };
      updateHistory?: Array<{
        version: string;
        updatedAt: string;
        changes: string;
        updatedBy: string;
      }>;
    };
    archivedReason?: string;
    archivedAt?: string;
  }>;
}

/**
 * Pattern Manager implementation
 *
 * Responsibilities:
 * - Load patterns from YAML seed files
 * - Validate pattern schema and constraints
 * - Query patterns by type, category, confidence
 * - Update pattern confidence based on new evidence
 * - Promote patterns through lifecycle states
 * - Archive low-confidence patterns
 */
export class PatternManager {
  private knowledgeStorePath: string;
  private verbose: boolean;
  private autoSave: boolean;
  private validateOnLoad: boolean;
  private patterns: Map<string, Pattern>;

  constructor(config: PatternManagerConfig = {}) {
    this.knowledgeStorePath =
      config.knowledgeStorePath ||
      path.join(process.cwd(), 'knowledge-store');
    this.verbose = config.verbose ?? false;
    this.autoSave = config.autoSave ?? true;
    this.validateOnLoad = config.validateOnLoad ?? true;
    this.patterns = new Map();
  }

  /**
   * Load patterns from seed files
   *
   * @param seedPaths - Optional specific seed file paths to load
   * @returns Number of patterns loaded
   */
  async loadPatterns(seedPaths?: string[]): Promise<number> {
    const seedsDir = path.join(this.knowledgeStorePath, 'seeds');

    // If no specific paths provided, load all seed files
    if (!seedPaths || seedPaths.length === 0) {
      const files = await fs.readdir(seedsDir);
      seedPaths = files
        .filter((f) => f.endsWith('-seeds.yaml'))
        .map((f) => path.join(seedsDir, f));
    }

    let loadedCount = 0;

    for (const seedPath of seedPaths) {
      try {
        const content = await fs.readFile(seedPath, 'utf-8');
        const data = yaml.load(content) as PatternFile;

        if (!data.patterns || !Array.isArray(data.patterns)) {
          this.log(`Warning: No patterns array found in ${seedPath}`);
          continue;
        }

        for (const patternData of data.patterns) {
          const pattern = this.parsePattern(patternData);

          // Validate if enabled
          if (this.validateOnLoad) {
            const validation = this.validatePattern(pattern);
            if (!validation.valid) {
              this.log(`Warning: Pattern ${pattern.id} failed validation:`);
              validation.errors.forEach((err) => this.log(`  - ${err}`));
              continue;
            }
          }

          this.patterns.set(pattern.id, pattern);
          loadedCount++;
        }

        this.log(`Loaded ${data.patterns.length} patterns from ${path.basename(seedPath)}`);
      } catch (error) {
        this.log(`Error loading patterns from ${seedPath}: ${error}`);
      }
    }

    return loadedCount;
  }

  /**
   * Parse pattern data from YAML format to Pattern type
   */
  private parsePattern(data: PatternFile['patterns'][0]): Pattern {
    return {
      id: data.id,
      type: data.type as PatternType,
      category: data.category,
      name: data.name,
      description: data.description,
      confidence: data.confidence,
      lifecycle: data.lifecycle as PatternLifecycle,
      evidence: data.evidence.map((e) => ({
        source: e.source,
        outcome: e.outcome as 'success' | 'failure',
        capturedAt: new Date(e.capturedAt),
        metrics: e.metrics,
        notes: e.notes,
        domain: e.domain,
        contentType: e.contentType,
      })),
      metadata: {
        applicability: data.metadata.applicability,
        performance: data.metadata.performance,
        domain: data.metadata.domain,
        keywords: data.metadata.keywords,
        seasonality: data.metadata.seasonality,
        updateHistory: data.metadata.updateHistory?.map((h) => ({
          version: h.version,
          updatedAt: new Date(h.updatedAt),
          changes: h.changes,
          updatedBy: h.updatedBy,
        })),
      },
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      version: data.version,
      archivedReason: data.archivedReason,
      archivedAt: data.archivedAt ? new Date(data.archivedAt) : undefined,
    };
  }

  /**
   * Validate pattern against schema constraints
   *
   * @param pattern - Pattern to validate
   * @returns Validation result with errors and warnings
   */
  validatePattern(pattern: Pattern): PatternValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!pattern.id) errors.push('Missing required field: id');
    if (!pattern.type) errors.push('Missing required field: type');
    if (!pattern.category) errors.push('Missing required field: category');
    if (!pattern.name) errors.push('Missing required field: name');
    if (!pattern.description) errors.push('Missing required field: description');

    // Type validation
    const validTypes: PatternType[] = ['content', 'technical', 'algorithm'];
    if (!validTypes.includes(pattern.type)) {
      errors.push(`Invalid type: ${pattern.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Confidence range
    if (pattern.confidence < 0 || pattern.confidence > 1) {
      errors.push(`Confidence must be between 0.0 and 1.0, got ${pattern.confidence}`);
    }

    // Lifecycle constraints
    const validLifecycles: PatternLifecycle[] = ['discovery', 'validation', 'promoted', 'archived'];
    if (!validLifecycles.includes(pattern.lifecycle)) {
      errors.push(`Invalid lifecycle: ${pattern.lifecycle}`);
    }

    // Lifecycle-confidence alignment
    if (pattern.lifecycle === 'discovery' && pattern.confidence >= 0.50) {
      warnings.push('Discovery pattern has confidence >= 0.50, consider promoting to validation');
    }
    if (pattern.lifecycle === 'validation' && pattern.confidence >= 0.80) {
      warnings.push('Validation pattern has confidence >= 0.80, consider promoting to promoted');
    }
    if (pattern.lifecycle === 'promoted' && pattern.confidence < 0.80) {
      errors.push('Promoted pattern must have confidence >= 0.80');
    }

    // Evidence requirements
    if (!pattern.evidence || pattern.evidence.length === 0) {
      errors.push('Pattern must have at least 1 evidence item');
    }

    if (pattern.lifecycle === 'validation' && pattern.evidence.length < 3) {
      warnings.push('Validation pattern should have at least 3 evidence items');
    }

    // Archived pattern requirements
    if (pattern.lifecycle === 'archived') {
      if (!pattern.archivedReason) {
        errors.push('Archived pattern must have archivedReason');
      }
      if (!pattern.archivedAt) {
        errors.push('Archived pattern must have archivedAt');
      }
    }

    // Evidence validation
    for (const evidence of pattern.evidence) {
      if (!evidence.source) {
        errors.push('Evidence item missing required field: source');
      }
      if (!evidence.outcome) {
        errors.push('Evidence item missing required field: outcome');
      }
      if (!['success', 'failure'].includes(evidence.outcome)) {
        errors.push(`Invalid evidence outcome: ${evidence.outcome}`);
      }
    }

    // Metadata validation
    if (!pattern.metadata.applicability) {
      errors.push('Missing required metadata field: applicability');
    }
    if (!pattern.metadata.performance) {
      errors.push('Missing required metadata field: performance');
    }

    // Performance consistency
    if (pattern.metadata.performance) {
      const { successRate, totalApplications } = pattern.metadata.performance;
      const actualSuccesses = pattern.evidence.filter((e) => e.outcome === 'success').length;
      const calculatedRate = totalApplications > 0 ? actualSuccesses / totalApplications : 0;

      if (Math.abs(successRate - calculatedRate) > 0.01) {
        warnings.push(
          `Performance successRate (${successRate}) doesn't match calculated rate (${calculatedRate.toFixed(2)})`
        );
      }
    }

    // Age warnings
    const now = Date.now();
    const sixMonthsAgo = now - 6 * 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

    const oldEvidence = pattern.evidence.filter(
      (e) => e.capturedAt.getTime() < sixMonthsAgo
    );
    if (oldEvidence.length > 0) {
      warnings.push(`${oldEvidence.length} evidence items are older than 6 months`);
    }

    const recentEvidence = pattern.evidence.filter(
      (e) => e.capturedAt.getTime() > ninetyDaysAgo
    );
    if (recentEvidence.length === 0 && pattern.lifecycle !== 'archived') {
      warnings.push('No evidence captured in last 90 days, pattern may be stale');
    }

    // Low sample size warning
    if (pattern.metadata.performance.totalApplications < 5 && pattern.lifecycle !== 'discovery') {
      warnings.push(`Low sample size: only ${pattern.metadata.performance.totalApplications} applications`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Query patterns by filters
   *
   * @param query - Pattern query filters
   * @returns Array of matching patterns
   */
  queryPatterns(query: PatternQuery = {}): Pattern[] {
    let results = Array.from(this.patterns.values());

    // Filter by type
    if (query.type) {
      results = results.filter((p) => p.type === query.type);
    }

    // Filter by category
    if (query.category) {
      results = results.filter((p) => p.category === query.category);
    }

    // Filter by minimum confidence
    if (query.minConfidence !== undefined) {
      results = results.filter((p) => p.confidence >= query.minConfidence!);
    }

    // Filter by lifecycle
    if (query.lifecycle) {
      results = results.filter((p) => p.lifecycle === query.lifecycle);
    }

    // Filter by domain
    if (query.domain) {
      results = results.filter((p) => p.metadata.domain === query.domain);
    }

    // Filter by keywords
    if (query.keywords && query.keywords.length > 0) {
      results = results.filter((p) => {
        if (!p.metadata.keywords) return false;
        return query.keywords!.some((kw) =>
          p.metadata.keywords!.some((pk) => pk.toLowerCase().includes(kw.toLowerCase()))
        );
      });
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    // Apply limit
    if (query.limit !== undefined && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Update pattern confidence based on new evidence
   *
   * @param patternId - Pattern ID to update
   * @param newEvidence - New evidence to add
   * @returns Confidence update result
   */
  updateConfidence(
    patternId: string,
    newEvidence: PatternEvidence
  ): PatternConfidenceUpdateResult {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternId}`);
    }

    const previousConfidence = pattern.confidence;
    const previousLifecycle = pattern.lifecycle;

    // Add new evidence
    pattern.evidence.push(newEvidence);

    // Recalculate confidence
    const successCount = pattern.evidence.filter((e) => e.outcome === 'success').length;
    const totalApplications = pattern.evidence.length;
    const successRate = totalApplications > 0 ? successCount / totalApplications : 0;

    // Evidence quality factor (max at 10 evidence items)
    const evidenceQualityFactor = Math.min(pattern.evidence.length / 10, 1.0);

    // Calculate new confidence
    const newConfidence = parseFloat((successRate * evidenceQualityFactor).toFixed(2));
    pattern.confidence = newConfidence;

    // Update performance metadata
    pattern.metadata.performance.successRate = parseFloat(successRate.toFixed(2));
    pattern.metadata.performance.totalApplications = totalApplications;

    // Update timestamp
    pattern.updatedAt = new Date();

    // Check for lifecycle transition
    let lifecycleChanged = false;
    let newLifecycle: PatternLifecycle | undefined;

    if (pattern.lifecycle === 'discovery' && newConfidence >= 0.50) {
      pattern.lifecycle = 'validation';
      lifecycleChanged = true;
      newLifecycle = 'validation';
      this.log(`Pattern ${patternId} promoted from discovery to validation`);
    } else if (pattern.lifecycle === 'validation' && newConfidence >= 0.80) {
      pattern.lifecycle = 'promoted';
      lifecycleChanged = true;
      newLifecycle = 'promoted';
      this.log(`Pattern ${patternId} promoted from validation to promoted`);
    } else if (
      (pattern.lifecycle === 'validation' || pattern.lifecycle === 'promoted') &&
      newConfidence < 0.30
    ) {
      pattern.lifecycle = 'archived';
      pattern.archivedReason = 'Low confidence score';
      pattern.archivedAt = new Date();
      lifecycleChanged = true;
      newLifecycle = 'archived';
      this.log(`Pattern ${patternId} archived due to low confidence`);
    }

    // Auto-save if enabled
    if (this.autoSave) {
      // Note: In a real implementation, this would save to file
      this.log(`Auto-save triggered for pattern ${patternId}`);
    }

    return {
      patternId,
      previousConfidence,
      newConfidence,
      newEvidence,
      lifecycleChanged,
      newLifecycle,
    };
  }

  /**
   * Promote pattern to next lifecycle state
   *
   * @param patternId - Pattern ID to promote
   * @param force - Force promotion even if confidence is low
   * @returns Promotion result
   */
  promotePattern(patternId: string, force = false): PatternPromotionResult {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      return {
        success: false,
        error: `Pattern not found: ${patternId}`,
        previousLifecycle: 'discovery',
        newLifecycle: 'discovery',
      };
    }

    const previousLifecycle = pattern.lifecycle;

    // Check if pattern is already at highest state
    if (pattern.lifecycle === 'promoted') {
      return {
        success: false,
        error: 'Pattern is already promoted',
        previousLifecycle,
        newLifecycle: previousLifecycle,
      };
    }

    if (pattern.lifecycle === 'archived') {
      return {
        success: false,
        error: 'Cannot promote archived pattern',
        previousLifecycle,
        newLifecycle: previousLifecycle,
      };
    }

    // Check confidence requirements
    if (pattern.lifecycle === 'discovery' && pattern.confidence < 0.50 && !force) {
      return {
        success: false,
        error: `Discovery pattern requires confidence >= 0.50 (current: ${pattern.confidence})`,
        previousLifecycle,
        newLifecycle: previousLifecycle,
      };
    }

    if (pattern.lifecycle === 'validation' && pattern.confidence < 0.80 && !force) {
      return {
        success: false,
        error: `Validation pattern requires confidence >= 0.80 (current: ${pattern.confidence})`,
        previousLifecycle,
        newLifecycle: previousLifecycle,
      };
    }

    // Perform promotion
    let newLifecycle: PatternLifecycle;
    if (pattern.lifecycle === 'discovery') {
      newLifecycle = 'validation';
    } else {
      // validation -> promoted
      newLifecycle = 'promoted';
    }

    pattern.lifecycle = newLifecycle;
    pattern.updatedAt = new Date();

    this.log(`Pattern ${patternId} promoted from ${previousLifecycle} to ${newLifecycle}`);

    return {
      success: true,
      pattern,
      previousLifecycle,
      newLifecycle,
    };
  }

  /**
   * Archive pattern with reason
   *
   * @param patternId - Pattern ID to archive
   * @param reason - Reason for archiving
   * @returns Whether archiving succeeded
   */
  archivePattern(patternId: string, reason: string): boolean {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      this.log(`Cannot archive: Pattern not found: ${patternId}`);
      return false;
    }

    pattern.lifecycle = 'archived';
    pattern.archivedReason = reason;
    pattern.archivedAt = new Date();
    pattern.updatedAt = new Date();

    this.log(`Pattern ${patternId} archived: ${reason}`);
    return true;
  }

  /**
   * Get pattern by ID
   *
   * @param patternId - Pattern ID
   * @returns Pattern or undefined if not found
   */
  getPattern(patternId: string): Pattern | undefined {
    return this.patterns.get(patternId);
  }

  /**
   * Get all patterns
   *
   * @returns Array of all patterns
   */
  getAllPatterns(): Pattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get pattern count
   *
   * @returns Total number of loaded patterns
   */
  getPatternCount(): number {
    return this.patterns.size;
  }

  /**
   * Get patterns by lifecycle state
   *
   * @param lifecycle - Lifecycle state
   * @returns Array of patterns in that state
   */
  getPatternsByLifecycle(lifecycle: PatternLifecycle): Pattern[] {
    return this.queryPatterns({ lifecycle });
  }

  /**
   * Log message if verbose mode enabled
   */
  private log(message: string): void {
    if (this.verbose) {
      console.log(`[PatternManager] ${message}`);
    }
  }
}
