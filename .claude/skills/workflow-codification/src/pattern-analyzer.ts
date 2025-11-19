/**
 * Pattern Analyzer for Workflow Codification System
 *
 * Analyzes workflow reflections to detect repeated patterns suitable for codification.
 * Implements similarity detection, metrics calculation, and pattern prioritization.
 *
 * @module pattern-analyzer
 */

import {
  PatternAnalyzerConfig,
  WorkflowReflection,
  WorkflowPattern,
  PatternAnalysisReport,
  AnalysisMetadata,
  WorkflowGroup,
  SecurityConstraints,
  ILogger,
  isValidPatternAnalyzerConfig,
  isWorkflowReflection,
  Priority,
} from './types';

/**
 * Pattern Analyzer class for detecting workflow patterns from reflections
 */
export class PatternAnalyzer {
  private config: PatternAnalyzerConfig;
  private logger: ILogger;
  private securityConstraints: SecurityConstraints;

  constructor(config: PatternAnalyzerConfig, logger: ILogger) {
    if (!isValidPatternAnalyzerConfig(config)) {
      throw new Error('Invalid pattern analyzer configuration');
    }

    this.config = config;
    this.logger = logger;

    // Security constraints (CWE-22 path traversal prevention)
    this.securityConstraints = {
      maxPathLength: 4096,
      maxFieldLength: 256,
      maxArraySize: 10000,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxDbQueryLength: 10000,
    };
  }


  /**
   * Generate normalized workflow signature from steps
   * Extracts and normalizes command sequences
   */
  generateWorkflowSignature(steps: unknown[]): string {
    if (!Array.isArray(steps) || steps.length === 0) {
      return 'unknown';
    }

    try {
      const normalized = steps
        .map((step) => {
          if (typeof step === 'object' && step !== null) {
            const stepObj = step as Record<string, unknown>;
            const keys = Object.keys(stepObj).slice(0, 3);
            return keys.join(' ').replace(/\s+/g, ' ');
          }
          return String(step).replace(/\s+/g, ' ');
        })
        .filter((s) => s.length > 0);

      return normalized.length > 0 ? normalized.join(' → ') : 'unknown';
    } catch {
      this.logger.warning('Failed to generate workflow signature');
      return 'unknown';
    }
  }

  /**
   * Calculate Jaccard similarity between two sets
   * Intersection / Union
   */
  calculateJaccardSimilarity(stepsA: unknown[], stepsB: unknown[]): number {
    if (!Array.isArray(stepsA) || !Array.isArray(stepsB)) {
      return 0;
    }

    // Convert steps to comparable strings
    const setA = new Set(stepsA.map((s) => JSON.stringify(s)));
    const setB = new Set(stepsB.map((s) => JSON.stringify(s)));

    // Calculate intersection
    let intersection = 0;
    setA.forEach((item) => {
      if (setB.has(item)) {
        intersection++;
      }
    });

    // Calculate union
    const union = new Set([...setA, ...setB]).size;

    if (union === 0) {
      return 0;
    }

    return Number((intersection / union).toFixed(3));
  }

  /**
   * Calculate average pairwise similarity across reflection group
   */
  calculateSimilarityScore(reflections: WorkflowReflection[]): number {
    if (reflections.length < 2) {
      return 1.0;
    }

    let totalSimilarity = 0;
    let comparisons = 0;

    // Calculate pairwise similarities
    for (let i = 0; i < reflections.length - 1; i++) {
      for (let j = i + 1; j < reflections.length; j++) {
        const refI = reflections[i];
        const refJ = reflections[j];
        if (!refI || !refJ) continue;

        const stepsA = refI.workflow_steps;
        const stepsB = refJ.workflow_steps;

        const similarity = this.calculateJaccardSimilarity(stepsA, stepsB);
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    if (comparisons === 0) {
      return 0;
    }

    return Number((totalSimilarity / comparisons).toFixed(3));
  }

  /**
   * Check if workflow is deterministic using heuristics
   * Detects non-deterministic patterns like randomness, timestamps, etc.
   */
  checkDeterministic(reflections: WorkflowReflection[]): boolean {
    const nondeterministicPatterns = [
      /random|timestamp|date|uuid|Math\.random|rand\(/gi,
      /api\..*\.com|http:\/\/|https:\/\//gi,
      /curl |wget |fetch\(/gi,
    ];

    // Check for non-deterministic patterns in workflow steps
    for (const reflection of reflections) {
      const stepsString = JSON.stringify(reflection.workflow_steps);
      for (const pattern of nondeterministicPatterns) {
        if (pattern.test(stepsString)) {
          return false;
        }
      }
    }

    // Check output variance
    const uniqueOutputs = new Set(reflections.map((r) => r.output));
    const uniqueCount = uniqueOutputs.size;
    const totalCount = reflections.length;

    // If more than 50% of outputs are unique, likely not deterministic
    // This allows small variations but detects high variance
    return uniqueCount <= Math.ceil(totalCount * 0.5);
  }

  /**
   * Estimate monthly cost savings from codifying workflow
   * Uses token costs and execution frequency
   */
  estimateCostSavings(occurrenceCount: number, daysInWindow: number = 90): number {
    // Constants (using Z.ai pricing model)
    const aiInputTokens = 5000;
    const aiOutputTokens = 2000;
    const tokenCostPerMillion = 0.5; // $0.50 per 1M tokens
    const scriptCost = 0.0001; // Negligible

    // Calculate per-execution savings
    const totalTokens = aiInputTokens + aiOutputTokens;
    const aiCost = (totalTokens / 1000000) * tokenCostPerMillion;
    const savingsPerExecution = aiCost - scriptCost;

    // Estimate monthly executions
    const dailyRate = occurrenceCount / daysInWindow;
    const monthlyExecutions = Math.round(dailyRate * 30);

    // Calculate monthly savings
    const monthlySavings = monthlyExecutions * savingsPerExecution;

    return Number(monthlySavings.toFixed(2));
  }

  /**
   * Calculate priority score based on multiple factors
   * Factors: occurrence count (40%), savings (30%), teams affected (20%), confidence (10%)
   */
  calculatePriority(
    occurrenceCount: number,
    estimatedSavings: number,
    teamsCount: number,
    confidenceScore: number
  ): Priority {
    let score = 0;

    // Factor 1: Occurrence count (weight: 40%)
    if (occurrenceCount >= 20) {
      score += 40;
    } else if (occurrenceCount >= 10) {
      score += 25;
    } else {
      score += 10;
    }

    // Factor 2: Cost savings (weight: 30%)
    if (estimatedSavings >= 50) {
      score += 30;
    } else if (estimatedSavings >= 20) {
      score += 20;
    } else {
      score += 10;
    }

    // Factor 3: Teams affected (weight: 20%)
    if (teamsCount >= 3) {
      score += 20;
    } else if (teamsCount >= 2) {
      score += 12;
    } else {
      score += 5;
    }

    // Factor 4: Confidence score (weight: 10%)
    if (confidenceScore >= 0.9) {
      score += 10;
    } else if (confidenceScore >= 0.8) {
      score += 6;
    } else {
      score += 3;
    }

    // Determine priority
    if (score >= 75) {
      return 'high';
    } else if (score >= 50) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Group reflections by workflow signature
   */
  private groupReflectionsBySignature(
    reflections: WorkflowReflection[]
  ): Map<string, WorkflowGroup> {
    const groups = new Map<string, WorkflowGroup>();

    for (const reflection of reflections) {
      const signature = this.generateWorkflowSignature(reflection.workflow_steps);

      if (!groups.has(signature)) {
        groups.set(signature, {
          reflections: [],
          signature,
        });
      }

      const group = groups.get(signature) as WorkflowGroup;
      group.reflections.push(reflection);
    }

    return groups;
  }

  /**
   * Filter groups by minimum occurrence threshold
   */
  private filterByOccurrence(
    groups: Map<string, WorkflowGroup>,
    minOccurrences: number
  ): Map<string, WorkflowGroup> {
    const filtered = new Map<string, WorkflowGroup>();

    groups.forEach((group, signature) => {
      if (group.reflections.length >= minOccurrences) {
        filtered.set(signature, group);
      }
    });

    return filtered;
  }

  /**
   * Analyze candidate patterns and apply quality filters
   */
  private analyzeCandidatePatterns(
    groups: Map<string, WorkflowGroup>
  ): WorkflowPattern[] {
    const patterns: WorkflowPattern[] = [];

    groups.forEach((group) => {
      const reflections = group.reflections;
      const occurrenceCount = reflections.length;

      // Calculate similarity score
      const similarityScore = this.calculateSimilarityScore(reflections);

      // Calculate average confidence
      const avgConfidence = reflections.reduce((sum, r) => sum + r.confidence, 0) / reflections.length;

      // Check if deterministic
      const isDeterministic = this.checkDeterministic(reflections);

      // Apply filters
      if (
        similarityScore >= this.config.minSimilarity &&
        avgConfidence >= this.config.minConfidence &&
        isDeterministic
      ) {
        // Extract common workflow steps
        const firstReflection = reflections[0];
        if (!firstReflection) return;

        const commonSteps = firstReflection.workflow_steps;

        // Extract unique teams
        const teamsSet = new Set(reflections.map((r) => r.team_id));
        const teamsAffected = Array.from(teamsSet);
        const teamsCount = teamsAffected.length;

        // Estimate cost savings
        const estimatedSavings = this.estimateCostSavings(
          occurrenceCount,
          this.config.timeWindow
        );

        // Calculate priority
        const priority = this.calculatePriority(
          occurrenceCount,
          estimatedSavings,
          teamsCount,
          avgConfidence
        );

        // Create pattern object
        const pattern: WorkflowPattern = {
          pattern_name: group.signature,
          workflow_steps: commonSteps,
          occurrence_count: occurrenceCount,
          teams_affected: teamsAffected,
          similarity_score: similarityScore,
          confidence_score: Number(avgConfidence.toFixed(3)),
          deterministic: isDeterministic,
          estimated_savings_usd: estimatedSavings,
          priority,
          status: 'detected',
        };

        patterns.push(pattern);

        this.logger.success(
          `Pattern detected: ${group.signature} (priority: ${priority}, savings: $${estimatedSavings}/month)`
        );
      }
    });

    return patterns;
  }

  /**
   * Sort patterns by priority and savings
   */
  private sortPatterns(patterns: WorkflowPattern[]): WorkflowPattern[] {
    const priorityOrder: Record<Priority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    return patterns.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return b.estimated_savings_usd - a.estimated_savings_usd;
    });
  }

  /**
   * Generate metadata for the report
   */
  private generateMetadata(
    totalReflections: number,
    patternsFound: number
  ): AnalysisMetadata {
    return {
      analysis_timestamp: new Date().toISOString(),
      time_window_days: this.config.timeWindow,
      total_reflections_analyzed: totalReflections,
      patterns_found: patternsFound,
      filters: {
        min_occurrences: this.config.minOccurrences,
        min_similarity: this.config.minSimilarity,
        min_confidence: this.config.minConfidence,
      },
    };
  }

  /**
   * Main analysis function
   * Orchestrates the complete pattern analysis workflow
   */
  async analyzePatterns(reflections: WorkflowReflection[]): Promise<PatternAnalysisReport> {
    this.logger.log('Starting workflow pattern analysis');
    this.logger.log(
      `Parameters: time_window=${this.config.timeWindow}d, ` +
      `min_occurrences=${this.config.minOccurrences}, ` +
      `min_similarity=${this.config.minSimilarity}, ` +
      `min_confidence=${this.config.minConfidence}`
    );

    // Validate input
    if (!Array.isArray(reflections)) {
      throw new Error('Reflections must be an array');
    }

    if (reflections.length > this.securityConstraints.maxArraySize) {
      throw new Error(
        `Reflections exceed maximum size: ${reflections.length} > ${this.securityConstraints.maxArraySize}`
      );
    }

    // Validate all reflections
    const validReflections = reflections.filter((r) => {
      if (!isWorkflowReflection(r)) {
        this.logger.warning(`Invalid reflection structure: ${r}`);
        return false;
      }
      return true;
    });

    this.logger.log(`Retrieved ${validReflections.length} valid reflections`);

    if (validReflections.length === 0) {
      this.logger.warning('No valid reflections found');
      return {
        metadata: this.generateMetadata(0, 0),
        patterns: [],
      };
    }

    // Group reflections by workflow signature
    this.logger.log('Grouping reflections by workflow similarity');
    const allGroups = this.groupReflectionsBySignature(validReflections);
    this.logger.log(`Found ${allGroups.size} unique workflow signatures`);

    // Filter groups with minimum occurrences
    this.logger.log(`Filtering patterns with >= ${this.config.minOccurrences} occurrences`);
    const filteredGroups = this.filterByOccurrence(allGroups, this.config.minOccurrences);
    this.logger.log(`Found ${filteredGroups.size} groups after occurrence filter`);

    // Analyze and filter candidate patterns
    const candidatePatterns = this.analyzeCandidatePatterns(filteredGroups);
    this.logger.log(`Found ${candidatePatterns.length} candidate patterns after filtering`);

    // Sort patterns by priority
    const sortedPatterns = this.sortPatterns(candidatePatterns);

    // Generate report
    const report: PatternAnalysisReport = {
      metadata: this.generateMetadata(validReflections.length, sortedPatterns.length),
      patterns: sortedPatterns,
    };

    return report;
  }

  /**
   * Format report as JSON
   */
  formatAsJson(report: PatternAnalysisReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Format report as summary
   */
  formatAsSummary(report: PatternAnalysisReport): string {
    const { metadata, patterns } = report;
    const highPriority = patterns.filter((p) => p.priority === 'high').length;
    const mediumPriority = patterns.filter((p) => p.priority === 'medium').length;
    const lowPriority = patterns.filter((p) => p.priority === 'low').length;

    const topPatterns = patterns.slice(0, 5);
    const topPatternsStr = topPatterns
      .map(
        (p, i) =>
          `  ${i + 1}. ${p.pattern_name} (priority: ${p.priority}, ` +
          `savings: $${p.estimated_savings_usd}/month)`
      )
      .join('\n');

    return (
      'Pattern Analysis Summary\n' +
      '========================\n' +
      '\n' +
      `Analysis Timestamp: ${metadata.analysis_timestamp}\n` +
      `Time Window: ${metadata.time_window_days} days\n` +
      `Total Reflections Analyzed: ${metadata.total_reflections_analyzed}\n` +
      `Patterns Found: ${metadata.patterns_found}\n` +
      '\n' +
      'Filters:\n' +
      `  Min Occurrences: ${metadata.filters.min_occurrences}\n` +
      `  Min Similarity: ${metadata.filters.min_similarity}\n` +
      `  Min Confidence: ${metadata.filters.min_confidence}\n` +
      '\n' +
      'Patterns by Priority:\n' +
      `  High: ${highPriority}\n` +
      `  Medium: ${mediumPriority}\n` +
      `  Low: ${lowPriority}\n` +
      '\n' +
      'Top 5 Patterns:\n' +
      topPatternsStr
    );
  }
}

export { PatternAnalysisReport, WorkflowPattern, WorkflowReflection, PatternAnalyzerConfig };
