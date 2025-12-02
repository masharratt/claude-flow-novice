/**
 * Algorithm Risk Scoring System - SEO Intelligence Integration Phase 5 Sprint 1
 *
 * @module planning/seo/lib/algorithm-risk-scoring
 * @description Evaluates SEO tactics against Google algorithm updates to warn against risky practices
 *              Provides risk scoring, mitigation strategies, and aggregate risk assessment
 * @version 1.0.0
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Import all type definitions and type guards
import type {
  RiskLevel,
  TacticDefinition,
  AlgorithmUpdate,
  RiskDatabase,
  TacticRiskEvaluation,
  AggregateRiskScore,
  MitigationStrategy,
  RiskWarning,
} from '../types/algorithm-risk';

import {
  isValidRiskLevel,
  isValidRiskScore,
  normalizeRiskScore,
  isValidTacticDefinition,
  isValidAlgorithmUpdate,
  isValidRiskDatabase,
  isValidTacticRiskEvaluation,
  isValidAggregateRiskScore,
  isValidMitigationStrategy,
  getRiskLevelFromScore,
  successResult,
  errorResult,
} from '../types/algorithm-risk';

import {
  validateRiskDatabaseFull,
  isValidTacticId,
  validateAggregateRiskConsistency,
  sanitizeTacticId,
  normalizeTimestamp,
} from '../types/algorithm-risk-guards';

// Re-export types for public API
export type {
  RiskLevel,
  TacticDefinition,
  AlgorithmUpdate,
  RiskDatabase,
  TacticRiskEvaluation,
  AggregateRiskScore,
  MitigationStrategy,
  RiskWarning,
} from '../types/algorithm-risk';

/**
 * Logger interface for configurable logging
 * Allows custom log handlers to be passed to risk scoring functions
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Default console logger implementation
 * Used when no custom logger is provided
 */
const defaultLogger: Logger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

/**
 * Risk scoring error class
 * Provides structured error handling with error codes for programmatic handling
 */
export class RiskScoringError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'DATABASE_LOAD_FAILED'
      | 'TACTIC_NOT_FOUND'
      | 'INVALID_RISK_SCORE'
      | 'VALIDATION_FAILED'
      | 'INVALID_INPUT',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'RiskScoringError';
    Object.setPrototypeOf(this, RiskScoringError.prototype);
  }
}

// Global database cache
let cachedDatabase: RiskDatabase | null = null;

/**
 * Load risk database from YAML files with comprehensive type validation
 *
 * @param baseDir - Base directory for risk database (default: ~/.cfn/seo/global-knowledge/algorithm-intelligence)
 * @returns Loaded risk database
 * @throws RiskScoringError - If database is invalid or cannot be loaded
 *
 * @example
 * ```typescript
 * const database = await loadRiskDatabase();
 * const database = await loadRiskDatabase('/custom/path');
 * ```
 */
export async function loadRiskDatabase(
  baseDir: string = path.join(
    process.env.HOME || '/home/masharratt',
    '.cfn/seo/global-knowledge/algorithm-intelligence'
  )
): Promise<RiskDatabase> {
  try {
    // Return cached database if available
    if (cachedDatabase) {
      return cachedDatabase;
    }

    const riskScoresPath = path.join(baseDir, 'risk-scores.yaml');
    const updateHistoryPath = path.join(baseDir, 'update-history.yaml');

    // Load YAML files
    const riskScoresContent = await fs.readFile(riskScoresPath, 'utf-8');
    const updateHistoryContent = await fs.readFile(
      updateHistoryPath,
      'utf-8'
    );

    // Parse YAML - typed as unknown initially
    const riskScoresData = yaml.load(riskScoresContent) as unknown;
    const updateHistoryData = yaml.load(updateHistoryContent) as unknown;

    // Validate structure with type guards
    if (
      typeof riskScoresData !== 'object' ||
      riskScoresData === null ||
      !Array.isArray((riskScoresData as any).tactics)
    ) {
      throw new RiskScoringError(
        'Invalid risk scores structure: missing tactics array',
        'DATABASE_LOAD_FAILED'
      );
    }

    if (
      typeof updateHistoryData !== 'object' ||
      updateHistoryData === null ||
      !Array.isArray((updateHistoryData as any).algorithm_updates)
    ) {
      throw new RiskScoringError(
        'Invalid update history structure: missing algorithm_updates array',
        'DATABASE_LOAD_FAILED'
      );
    }

    const tactics = (riskScoresData as any).tactics as unknown[];
    const updates = (updateHistoryData as any).algorithm_updates as unknown[];

    // Validate minimum counts
    if (tactics.length < 20) {
      throw new RiskScoringError(
        `Risk database must contain at least 20 tactics, found ${tactics.length}`,
        'VALIDATION_FAILED'
      );
    }

    if (updates.length < 10) {
      throw new RiskScoringError(
        `Update history must contain at least 10 updates, found ${updates.length}`,
        'VALIDATION_FAILED'
      );
    }

    // Validate each tactic with type guards
    for (let i = 0; i < tactics.length; i++) {
      if (!isValidTacticDefinition(tactics[i])) {
        throw new RiskScoringError(
          `Invalid tactic at index ${i}`,
          'VALIDATION_FAILED',
          tactics[i]
        );
      }

      const tactic = tactics[i] as TacticDefinition;
      if (!isValidRiskScore(tactic.risk_score)) {
        throw new RiskScoringError(
          `Invalid risk score for tactic ${tactic.id}: ${tactic.risk_score} (must be 0.0-1.0)`,
          'INVALID_RISK_SCORE'
        );
      }
    }

    // Validate each algorithm update with type guards
    for (let i = 0; i < updates.length; i++) {
      if (!isValidAlgorithmUpdate(updates[i])) {
        throw new RiskScoringError(
          `Invalid algorithm update at index ${i}`,
          'VALIDATION_FAILED',
          updates[i]
        );
      }
    }

    // Build typed database
    const database: RiskDatabase = {
      tactics: tactics as ReadonlyArray<TacticDefinition>,
      algorithmUpdates: updates as ReadonlyArray<AlgorithmUpdate>,
      metadata: {
        version: '1.0.0',
        lastUpdated: normalizeTimestamp(new Date()),
        tacticCount: tactics.length,
        updateCount: updates.length,
      },
    };

    // Validate complete database
    if (!isValidRiskDatabase(database)) {
      throw new RiskScoringError(
        'Risk database validation failed after loading',
        'VALIDATION_FAILED'
      );
    }

    // Cache database
    cachedDatabase = database;

    return database;
  } catch (error) {
    if (error instanceof RiskScoringError) {
      throw error;
    }
    throw new RiskScoringError(
      `Failed to load risk database from ${baseDir}`,
      'DATABASE_LOAD_FAILED',
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Evaluate single tactic against risk database
 *
 * @param tacticId - Tactic identifier to evaluate
 * @param database - Risk database (optional, will load if not provided)
 * @returns Tactic risk evaluation with complete assessment
 * @throws RiskScoringError - If tactic not found or invalid
 *
 * @example
 * ```typescript
 * const evaluation = await evaluateTactic('ai-generated-content');
 * console.log(`Risk Level: ${evaluation.riskLevel} (${evaluation.riskScore})`);
 * ```
 */
export async function evaluateTactic(
  tacticId: string,
  database?: RiskDatabase,
  options?: { logger?: Logger }
): Promise<TacticRiskEvaluation> {
  const logger = options?.logger || defaultLogger;
  try {
    // Input validation: prevent injection attacks
    if (!isValidTacticId(tacticId)) {
      throw new RiskScoringError(
        `Invalid tactic ID format: ${tacticId} (must be alphanumeric, dash, or underscore)`,
        'INVALID_INPUT'
      );
    }

    // Load database if not provided
    const db = database || (await loadRiskDatabase());

    // Find tactic in database
    const tactic = (db.tactics as ReadonlyArray<TacticDefinition>).find(
      (t) => t.id === tacticId
    );

    if (!tactic) {
      throw new RiskScoringError(`Tactic not found: ${tacticId}`, 'TACTIC_NOT_FOUND');
    }

    // Validate tactic data
    if (!isValidTacticDefinition(tactic)) {
      throw new RiskScoringError(
        `Tactic data validation failed: ${tacticId}`,
        'VALIDATION_FAILED'
      );
    }

    // Build typed evaluation
    const evaluation: TacticRiskEvaluation = {
      tacticId: tactic.id,
      tacticName: tactic.name,
      riskLevel: tactic.risk_level,
      riskScore: normalizeRiskScore(tactic.risk_score),
      algorithmUpdates: Array.from(tactic.algorithm_updates),
      mitigation: Array.from(tactic.mitigation),
      description: tactic.description,
    };

    // Validate evaluation
    if (!isValidTacticRiskEvaluation(evaluation)) {
      throw new RiskScoringError(
        'Evaluation validation failed',
        'VALIDATION_FAILED'
      );
    }

    return evaluation;
  } catch (error) {
    if (error instanceof RiskScoringError) {
      throw error;
    }
    throw new RiskScoringError(
      `Failed to evaluate tactic ${tacticId}`,
      'VALIDATION_FAILED',
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Calculate aggregate risk score for multiple tactics
 *
 * @param tacticIds - Array of tactic identifiers to evaluate
 * @param database - Risk database (optional, will load if not provided)
 * @returns Aggregate risk assessment with summary statistics
 * @throws RiskScoringError - If critical validation fails
 *
 * @example
 * ```typescript
 * const assessment = await calculateAggregateRisk(
 *   ['ai-generated-content', 'keyword-stuffing']
 * );
 * console.log(`Overall Risk: ${assessment.overallRiskLevel}`);
 * console.log(`Critical Tactics: ${assessment.criticalTactics.length}`);
 * ```
 */
export async function calculateAggregateRisk(
  tacticIds: ReadonlyArray<string>,
  database?: RiskDatabase,
  options?: { logger?: Logger }
): Promise<AggregateRiskScore> {
  const logger = options?.logger || defaultLogger;
  try {
    // Validate input
    if (!Array.isArray(tacticIds) || tacticIds.length === 0) {
      throw new RiskScoringError(
        'Tactic IDs array must be non-empty',
        'INVALID_INPUT'
      );
    }

    if (tacticIds.length > 100) {
      throw new RiskScoringError(
        'Tactic IDs array exceeds maximum length of 100',
        'INVALID_INPUT'
      );
    }

    // Load database if not provided
    const db = database || (await loadRiskDatabase());

    // Evaluate each tactic, collecting both successes and errors
    const tacticEvaluations: TacticRiskEvaluation[] = [];
    const failedTacticIds: string[] = [];

    for (const tacticId of tacticIds) {
      try {
        const evaluation = await evaluateTactic(tacticId, db, options);
        tacticEvaluations.push(evaluation);
      } catch (error) {
        // Track failed evaluations but continue processing
        failedTacticIds.push(tacticId);
        if (error instanceof RiskScoringError) {
          logger.warn(
            `Skipping invalid tactic "${tacticId}": ${error.message}`
          );
        }
      }
    }

    // Require at least one successful evaluation
    if (tacticEvaluations.length === 0) {
      throw new RiskScoringError(
        `No valid tactics found in evaluation set (failed: ${failedTacticIds.join(', ')})`,
        'VALIDATION_FAILED'
      );
    }

    // Calculate overall risk score (weighted average)
    const overallRiskScore = normalizeRiskScore(
      tacticEvaluations.reduce((sum, t) => sum + t.riskScore, 0) /
        tacticEvaluations.length
    );

    // Determine overall risk level using utility function
    const overallRiskLevel = getRiskLevelFromScore(overallRiskScore);

    // Separate critical and high-risk tactics
    const criticalTactics = tacticEvaluations.filter(
      (t) => t.riskLevel === 'critical'
    );
    const highRiskTactics = tacticEvaluations.filter(
      (t) => t.riskLevel === 'high'
    );

    // Build aggregate assessment
    const assessment: AggregateRiskScore = {
      overallRiskLevel,
      overallRiskScore,
      tacticEvaluations: tacticEvaluations,
      criticalTactics,
      highRiskTactics,
      evaluatedAt: normalizeTimestamp(new Date()),
      tacticCount: tacticEvaluations.length,
    };

    // Validate complete assessment
    if (!isValidAggregateRiskScore(assessment)) {
      throw new RiskScoringError(
        'Aggregate risk assessment validation failed',
        'VALIDATION_FAILED'
      );
    }

    // Validate consistency between breakdown and evaluations
    const consistencyCheck = validateAggregateRiskConsistency(assessment);
    if (!consistencyCheck.valid) {
      throw new RiskScoringError(
        `Aggregate risk consistency check failed: ${consistencyCheck.errors.join('; ')}`,
        'VALIDATION_FAILED'
      );
    }

    return assessment;
  } catch (error) {
    if (error instanceof RiskScoringError) {
      throw error;
    }
    throw new RiskScoringError(
      'Failed to calculate aggregate risk',
      'VALIDATION_FAILED',
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Get mitigation strategies for a tactic
 *
 * @param tacticId - Tactic identifier
 * @param database - Risk database (optional, will load if not provided)
 * @returns Array of mitigation strategies with implementation guidance
 * @throws RiskScoringError - If tactic not found or invalid
 *
 * @example
 * ```typescript
 * const strategies = await getMitigationStrategies('ai-generated-content');
 * for (const strategy of strategies) {
 *   console.log(`${strategy.description} (Difficulty: ${strategy.difficulty})`);
 * }
 * ```
 */
export async function getMitigationStrategies(
  tacticId: string,
  database?: RiskDatabase
): Promise<ReadonlyArray<MitigationStrategy>> {
  try {
    // Input validation
    if (!isValidTacticId(tacticId)) {
      throw new RiskScoringError(
        `Invalid tactic ID format: ${tacticId}`,
        'INVALID_INPUT'
      );
    }

    // Evaluate tactic
    const evaluation = await evaluateTactic(tacticId, database);

    // Build mitigation strategies from tactic mitigation list
    const strategies: MitigationStrategy[] = evaluation.mitigation.map(
      (mitigation, index) => {
        // Estimate impact and difficulty based on risk level
        let impact: 'low' | 'medium' | 'high' = 'medium';
        let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
        let effectiveness = 0.7;
        let priority = 3;
        let estimatedDays = 7;

        if (evaluation.riskLevel === 'critical') {
          impact = 'high';
          difficulty = 'hard';
          effectiveness = 0.9;
          priority = 1;
          estimatedDays = 14;
        } else if (evaluation.riskLevel === 'high') {
          impact = 'high';
          difficulty = 'medium';
          effectiveness = 0.8;
          priority = 2;
          estimatedDays = 7;
        } else if (evaluation.riskLevel === 'medium') {
          impact = 'medium';
          difficulty = 'medium';
          effectiveness = 0.7;
          priority = 3;
          estimatedDays = 5;
        } else {
          impact = 'low';
          difficulty = 'easy';
          effectiveness = 0.6;
          priority = 5;
          estimatedDays = 1;
        }

        return {
          id: `${sanitizeTacticId(tacticId)}-mitigation-${index + 1}`,
          description: mitigation,
          impact,
          difficulty,
          effectiveness,
          priority,
          estimatedDays,
        };
      }
    );

    // Validate all strategies
    for (const strategy of strategies) {
      if (!isValidMitigationStrategy(strategy)) {
        throw new RiskScoringError(
          `Mitigation strategy validation failed for ${tacticId}`,
          'VALIDATION_FAILED'
        );
      }
    }

    return strategies;
  } catch (error) {
    if (error instanceof RiskScoringError) {
      throw error;
    }
    throw new RiskScoringError(
      `Failed to get mitigation strategies for ${tacticId}`,
      'VALIDATION_FAILED',
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Get algorithm updates that targeted a specific tactic
 *
 * @param tacticId - Tactic identifier
 * @param database - Risk database (optional, will load if not provided)
 * @returns Array of algorithm updates affecting this tactic
 * @throws RiskScoringError - If tactic not found or invalid
 *
 * @example
 * ```typescript
 * const updates = await getAlgorithmUpdatesForTactic('ai-generated-content');
 * console.log(`Affected by ${updates.length} algorithm updates`);
 * ```
 */
export async function getAlgorithmUpdatesForTactic(
  tacticId: string,
  database?: RiskDatabase
): Promise<ReadonlyArray<AlgorithmUpdate>> {
  try {
    // Input validation
    if (!isValidTacticId(tacticId)) {
      throw new RiskScoringError(
        `Invalid tactic ID format: ${tacticId}`,
        'INVALID_INPUT'
      );
    }

    // Load database if not provided
    const db = database || (await loadRiskDatabase());

    // Evaluate tactic to get update IDs
    const evaluation = await evaluateTactic(tacticId, db);

    // Find full update details
    const updates = (db.algorithmUpdates as ReadonlyArray<AlgorithmUpdate>)
      .filter((update) => evaluation.algorithmUpdates.includes(update.id))
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
      ) as AlgorithmUpdate[]; // Most recent first

    // Validate all returned updates
    for (const update of updates) {
      if (!isValidAlgorithmUpdate(update)) {
        throw new RiskScoringError(
          `Algorithm update validation failed`,
          'VALIDATION_FAILED'
        );
      }
    }

    return updates;
  } catch (error) {
    if (error instanceof RiskScoringError) {
      throw error;
    }
    throw new RiskScoringError(
      `Failed to get algorithm updates for ${tacticId}`,
      'VALIDATION_FAILED',
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Check algorithm risks for Step 0 (Intelligence Preload) integration
 *
 * @param tacticIds - Array of tactic identifiers to evaluate
 * @param warningThreshold - Minimum risk score to trigger warning (default: 0.6)
 * @param database - Risk database (optional, will load if not provided)
 * @returns Array of risk warnings
 * @throws RiskScoringError - If validation fails
 *
 * @example
 * ```typescript
 * const warnings = await checkAlgorithmRisks(['ai-generated-content']);
 * if (warnings.length > 0) {
 *   console.log(`Warning: ${warnings[0].message}`);
 * }
 * ```
 */
export async function checkAlgorithmRisks(
  tacticIds: ReadonlyArray<string>,
  warningThreshold: number = 0.6,
  database?: RiskDatabase
): Promise<ReadonlyArray<RiskWarning>> {
  try {
    // Validate input
    if (!Array.isArray(tacticIds) || tacticIds.length === 0) {
      throw new RiskScoringError(
        'Tactic IDs array must be non-empty',
        'INVALID_INPUT'
      );
    }

    // Validate warning threshold
    if (!isValidRiskScore(warningThreshold)) {
      warningThreshold = 0.6; // Default
    }

    // Calculate aggregate risk
    const assessment = await calculateAggregateRisk(tacticIds, database);

    // Generate warnings for high-risk tactics
    const warnings: RiskWarning[] = [];

    for (const evaluation of assessment.tacticEvaluations) {
      if (evaluation.riskScore >= warningThreshold) {
        warnings.push({
          level: evaluation.riskLevel,
          message: `Tactic "${evaluation.tacticName}" carries ${evaluation.riskLevel} algorithmic risk (score: ${(evaluation.riskScore * 100).toFixed(0)}%)`,
          recommendation: `Review and consider mitigating this tactic to reduce algorithmic risk exposure`,
          mitigation: evaluation.mitigation,
          tacticId: evaluation.tacticId,
          relatedUpdates: evaluation.algorithmUpdates,
        });
      }
    }

    return warnings;
  } catch (error) {
    if (error instanceof RiskScoringError) {
      throw error;
    }
    throw new RiskScoringError(
      'Failed to check algorithm risks',
      'VALIDATION_FAILED',
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Clear cached database (for testing and cache management)
 * @internal
 */
export function clearDatabaseCache(): void {
  cachedDatabase = null;
}
