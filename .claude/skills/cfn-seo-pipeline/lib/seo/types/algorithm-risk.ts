/**
 * Algorithm Risk Scoring System - Type Definitions
 *
 * @module planning/seo/types/algorithm-risk
 * @description Comprehensive type-safe definitions for algorithm risk assessment
 *              Enables type-safe evaluation of SEO tactics against Google algorithm updates
 * @version 1.0.0
 */

// ============================================================================
// RISK LEVEL TYPES
// ============================================================================

/**
 * Risk level classification with strict literal types
 * Ordered from lowest to highest risk:
 * - low (0.0-0.4): Minimal algorithmic risk
 * - medium (0.4-0.6): Moderate algorithmic risk
 * - high (0.6-0.8): Significant algorithmic risk
 * - critical (0.8-1.0): Severe algorithmic risk, should be avoided
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Type guard to validate RiskLevel values
 * Ensures type safety at runtime with exhaustive checks
 */
export function isValidRiskLevel(value: unknown): value is RiskLevel {
  return (
    typeof value === 'string' &&
    ['low', 'medium', 'high', 'critical'].includes(value)
  );
}

/**
 * Risk score boundaries for classification
 * Provides mapping between numeric scores and risk levels
 */
export const RISK_SCORE_BOUNDARIES = {
  CRITICAL: { min: 0.8, max: 1.0 },
  HIGH: { min: 0.6, max: 0.8 },
  MEDIUM: { min: 0.4, max: 0.6 },
  LOW: { min: 0.0, max: 0.4 },
} as const;

/**
 * Get risk level from numeric score
 * Pure function for deterministic risk classification
 */
export function getRiskLevelFromScore(score: number): RiskLevel {
  if (score >= RISK_SCORE_BOUNDARIES.CRITICAL.min) return 'critical';
  if (score >= RISK_SCORE_BOUNDARIES.HIGH.min) return 'high';
  if (score >= RISK_SCORE_BOUNDARIES.MEDIUM.min) return 'medium';
  return 'low';
}

// ============================================================================
// IMPACT & IMPACT LEVEL TYPES
// ============================================================================

/**
 * Impact level for algorithm updates and mitigation strategies
 * Ordered from lowest to highest:
 * - low: Affects <10% of affected sites
 * - medium: Affects 10-50% of affected sites
 * - high: Affects >50% of affected sites
 */
export type ImpactLevel = 'low' | 'medium' | 'high';

export function isValidImpactLevel(value: unknown): value is ImpactLevel {
  return (
    typeof value === 'string' &&
    ['low', 'medium', 'high'].includes(value)
  );
}

// ============================================================================
// DIFFICULTY & DIFFICULTY LEVEL TYPES
// ============================================================================

/**
 * Implementation difficulty level for mitigation strategies
 * Ordered from lowest to highest effort:
 * - easy: Can be implemented in <1 day
 * - medium: Can be implemented in 1-7 days
 * - hard: Requires >7 days implementation
 */
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export function isValidDifficultyLevel(value: unknown): value is DifficultyLevel {
  return (
    typeof value === 'string' &&
    ['easy', 'medium', 'hard'].includes(value)
  );
}

// ============================================================================
// TACTIC DEFINITIONS
// ============================================================================

/**
 * SEO tactic definition from risk database
 * Represents a specific SEO practice with associated risk and mitigation
 * Immutable after creation (readonly properties)
 */
export interface TacticDefinition {
  /** Unique identifier for tactic (kebab-case, alphanumeric) */
  readonly id: string;

  /** Human-readable tactic name */
  readonly name: string;

  /** Risk level classification */
  readonly risk_level: RiskLevel;

  /** Risk score normalized to 0.0-1.0 range */
  readonly risk_score: number;

  /** Detailed description of the tactic and its risks */
  readonly description: string;

  /** Array of algorithm update IDs that targeted this tactic */
  readonly algorithm_updates: ReadonlyArray<string>;

  /** Array of mitigation strategy descriptions */
  readonly mitigation: ReadonlyArray<string>;

  /** Optional metadata for extensibility */
  readonly metadata?: Readonly<{
    /** SEO category (e.g., "content", "links", "technical") */
    readonly category?: string;

    /** Severity indicator (e.g., "high", "critical") */
    readonly severity?: string;

    /** ISO 8601 timestamp of last update */
    readonly lastUpdated?: string;

    /** Keywords for searching and categorization */
    readonly keywords?: ReadonlyArray<string>;
  }>;
}

/**
 * Type guard for TacticDefinition with exhaustive property validation
 */
export function isValidTacticDefinition(value: unknown): value is TacticDefinition {
  if (typeof value !== 'object' || value === null) return false;

  const t = value as Record<string, unknown>;

  // Basic type validation
  const basicValidation = (
    typeof t.id === 'string' &&
    /^[a-z0-9_-]+$/.test(t.id) &&
    typeof t.name === 'string' &&
    t.name.length > 0 &&
    isValidRiskLevel(t.risk_level) &&
    isValidRiskScore(t.risk_score) &&
    typeof t.description === 'string' &&
    t.description.length > 0 &&
    Array.isArray(t.algorithm_updates) &&
    t.algorithm_updates.every((x) => typeof x === 'string') &&
    Array.isArray(t.mitigation) &&
    t.mitigation.every((x) => typeof x === 'string')
  );

  if (!basicValidation) return false;

  // Semantic validation: risk_level must match risk_score range
  const scoreToLevel = (score: number): RiskLevel => {
    if (score >= 0.80) return 'critical';
    if (score >= 0.60) return 'high';
    if (score >= 0.40) return 'medium';
    return 'low';
  };

  const expectedLevel = scoreToLevel(t.risk_score as number);
  if (t.risk_level !== expectedLevel) {
    console.warn(
      `Tactic ${t.id}: risk_level "${t.risk_level}" doesn't match ` +
      `risk_score ${t.risk_score} (expected "${expectedLevel}")`
    );
    return false;
  }

  return true;
}

// ============================================================================
// ALGORITHM UPDATE DEFINITIONS
// ============================================================================

/**
 * Google algorithm update definition
 * Represents a major algorithm change affecting SEO practices
 * Immutable after creation
 */
export interface AlgorithmUpdate {
  /** Unique identifier for algorithm update (kebab-case) */
  readonly id: string;

  /** Official Google name for the update */
  readonly name: string;

  /** ISO 8601 release date */
  readonly date: string;

  /** Impact level of the update */
  readonly impact: ImpactLevel;

  /** Array of tactic IDs targeted by this update */
  readonly targeted_tactics: ReadonlyArray<string>;

  /** Detailed description of the update's effects */
  readonly description: string;

  /** Optional metadata for extensibility */
  readonly metadata?: Readonly<{
    /** Source of information (e.g., "google-official", "case-study") */
    readonly source?: string;

    /** Rollout duration (e.g., "2 weeks", "gradual") */
    readonly rolloutDuration?: string;

    /** ISO 8601 timestamp of last update */
    readonly updatedAt?: string;
  }>;
}

/**
 * Type guard for AlgorithmUpdate
 */
export function isValidAlgorithmUpdate(value: unknown): value is AlgorithmUpdate {
  if (typeof value !== 'object' || value === null) return false;

  const u = value as Record<string, unknown>;

  return (
    typeof u.id === 'string' &&
    /^[a-z0-9_-]+$/.test(u.id) &&
    typeof u.name === 'string' &&
    u.name.length > 0 &&
    typeof u.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}/.test(u.date) &&
    isValidImpactLevel(u.impact) &&
    Array.isArray(u.targeted_tactics) &&
    u.targeted_tactics.every((x) => typeof x === 'string') &&
    typeof u.description === 'string' &&
    u.description.length > 0
  );
}

// ============================================================================
// RISK SCORING & VALIDATION TYPES
// ============================================================================

/**
 * Validates that a value is a valid risk score (0.0-1.0)
 * Used for runtime validation of numeric risk scores
 */
export function isValidRiskScore(score: unknown): score is number {
  return (
    typeof score === 'number' &&
    score >= 0.0 &&
    score <= 1.0 &&
    Number.isFinite(score)
  );
}

/**
 * Normalizes a risk score to valid range [0.0, 1.0]
 * Clamps values outside valid range
 */
export function normalizeRiskScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0.5; // Default to medium if invalid
  }
  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Validates an ISO 8601 timestamp
 */
export function isValidISOTimestamp(timestamp: unknown): timestamp is string {
  if (typeof timestamp !== 'string') return false;
  try {
    const date = new Date(timestamp);
    return date instanceof Date && !isNaN(date.getTime());
  } catch {
    return false;
  }
}

// ============================================================================
// TACTIC EVALUATION TYPES
// ============================================================================

/**
 * Result of evaluating a single SEO tactic against risk database
 * Contains full risk assessment information for one tactic
 */
export interface TacticRiskEvaluation {
  /** Tactic identifier being evaluated */
  readonly tacticId: string;

  /** Human-readable tactic name */
  readonly tacticName: string;

  /** Risk level classification (low/medium/high/critical) */
  readonly riskLevel: RiskLevel;

  /** Numeric risk score (0.0-1.0) */
  readonly riskScore: number;

  /** Algorithm updates that specifically targeted this tactic */
  readonly algorithmUpdates: ReadonlyArray<string>;

  /** Recommended mitigation strategies */
  readonly mitigation: ReadonlyArray<string>;

  /** Optional description of the tactic */
  readonly description?: string;

  /** Confidence score for this evaluation (0.0-1.0) */
  readonly confidence?: number;
}

/**
 * Type guard for TacticRiskEvaluation
 */
export function isValidTacticRiskEvaluation(
  value: unknown
): value is TacticRiskEvaluation {
  if (typeof value !== 'object' || value === null) return false;

  const e = value as Record<string, unknown>;

  return (
    typeof e.tacticId === 'string' &&
    typeof e.tacticName === 'string' &&
    isValidRiskLevel(e.riskLevel) &&
    isValidRiskScore(e.riskScore) &&
    Array.isArray(e.algorithmUpdates) &&
    e.algorithmUpdates.every((x) => typeof x === 'string') &&
    Array.isArray(e.mitigation) &&
    e.mitigation.every((x) => typeof x === 'string')
  );
}

// ============================================================================
// AGGREGATE RISK SCORE TYPES
// ============================================================================

/**
 * Aggregate risk assessment for multiple tactics
 * Provides summary statistics and breakdowns for a collection of tactics
 */
export interface AggregateRiskScore {
  /** Overall risk level across all tactics */
  readonly overallRiskLevel: RiskLevel;

  /** Overall weighted average risk score (0.0-1.0) */
  readonly overallRiskScore: number;

  /** Individual evaluations for each tactic */
  readonly tacticEvaluations: ReadonlyArray<TacticRiskEvaluation>;

  /** Critical-level tactics (should be avoided) */
  readonly criticalTactics: ReadonlyArray<TacticRiskEvaluation>;

  /** High-level tactics (use with caution) */
  readonly highRiskTactics: ReadonlyArray<TacticRiskEvaluation>;

  /** ISO 8601 timestamp when evaluation was performed */
  readonly evaluatedAt: string;

  /** Number of tactics evaluated */
  readonly tacticCount?: number;

  /** Confidence in overall assessment (0.0-1.0) */
  readonly confidence?: number;
}

/**
 * Type guard for AggregateRiskScore
 */
export function isValidAggregateRiskScore(
  value: unknown
): value is AggregateRiskScore {
  if (typeof value !== 'object' || value === null) return false;

  const a = value as Record<string, unknown>;

  return (
    isValidRiskLevel(a.overallRiskLevel) &&
    isValidRiskScore(a.overallRiskScore) &&
    Array.isArray(a.tacticEvaluations) &&
    Array.isArray(a.criticalTactics) &&
    Array.isArray(a.highRiskTactics) &&
    typeof a.evaluatedAt === 'string'
  );
}

// ============================================================================
// MITIGATION STRATEGY TYPES
// ============================================================================

/**
 * Mitigation strategy for addressing a risky SEO tactic
 * Provides actionable guidance for reducing risk
 */
export interface MitigationStrategy {
  /** Unique identifier for mitigation strategy */
  readonly id: string;

  /** Detailed description of the mitigation action */
  readonly description: string;

  /** Impact level when mitigation is applied */
  readonly impact: ImpactLevel;

  /** Implementation difficulty */
  readonly difficulty: DifficultyLevel;

  /** Estimated effectiveness (0.0-1.0, where 1.0 = complete risk elimination) */
  readonly effectiveness: number;

  /** Priority for implementation (1=high, 5=low) */
  readonly priority?: number;

  /** Estimated time to implement (in days) */
  readonly estimatedDays?: number;
}

/**
 * Type guard for MitigationStrategy
 */
export function isValidMitigationStrategy(
  value: unknown
): value is MitigationStrategy {
  if (typeof value !== 'object' || value === null) return false;

  const m = value as Record<string, unknown>;

  return (
    typeof m.id === 'string' &&
    typeof m.description === 'string' &&
    isValidImpactLevel(m.impact) &&
    isValidDifficultyLevel(m.difficulty) &&
    isValidRiskScore(m.effectiveness)
  );
}

// ============================================================================
// RISK DATABASE TYPES
// ============================================================================

/**
 * Complete risk database with metadata
 * Core data structure for algorithm risk assessment
 */
export interface RiskDatabase {
  /** Array of all known risky SEO tactics */
  readonly tactics: ReadonlyArray<TacticDefinition>;

  /** Array of all tracked algorithm updates */
  readonly algorithmUpdates: ReadonlyArray<AlgorithmUpdate>;

  /** Database metadata and version information */
  readonly metadata?: Readonly<{
    /** Database version (semver) */
    readonly version?: string;

    /** ISO 8601 timestamp of last update */
    readonly lastUpdated?: string;

    /** Total count of tactics */
    readonly tacticCount?: number;

    /** Total count of algorithm updates */
    readonly updateCount?: number;
  }>;
}

/**
 * Type guard for RiskDatabase with comprehensive validation
 */
export function isValidRiskDatabase(value: unknown): value is RiskDatabase {
  if (typeof value !== 'object' || value === null) return false;

  const db = value as Record<string, unknown>;

  return (
    Array.isArray(db.tactics) &&
    db.tactics.every(isValidTacticDefinition) &&
    Array.isArray(db.algorithmUpdates) &&
    db.algorithmUpdates.every(isValidAlgorithmUpdate)
  );
}

// ============================================================================
// ERROR & WARNING TYPES
// ============================================================================

/**
 * Risk assessment warning with actionable information
 * Communicates identified risks to users
 */
export interface RiskWarning {
  /** Severity level of the warning */
  readonly level: RiskLevel;

  /** Human-readable warning message */
  readonly message: string;

  /** Specific recommendation to address the risk */
  readonly recommendation: string;

  /** Mitigation strategies to consider */
  readonly mitigation: ReadonlyArray<string>;

  /** Tactic ID that triggered the warning (optional) */
  readonly tacticId?: string;

  /** Algorithm update IDs relevant to this warning (optional) */
  readonly relatedUpdates?: ReadonlyArray<string>;
}

/**
 * Risk assessment error with diagnostic information
 */
export interface RiskAssessmentError {
  /** Error code for programmatic handling */
  readonly code:
    | 'DATABASE_LOAD_FAILED'
    | 'TACTIC_NOT_FOUND'
    | 'INVALID_RISK_SCORE'
    | 'VALIDATION_FAILED'
    | 'INVALID_INPUT';

  /** Human-readable error message */
  readonly message: string;

  /** Additional context or details (optional) */
  readonly details?: unknown;

  /** Tactic ID if error is tactic-specific (optional) */
  readonly tacticId?: string;

  /** ISO 8601 timestamp when error occurred */
  readonly timestamp: string;
}

// ============================================================================
// RESULT TYPES (for async operations)
// ============================================================================

/**
 * Result type for operations that may fail
 * Discriminated union providing type-safe error handling
 */
export type RiskAssessmentResult<T> =
  | {
      readonly success: true;
      readonly data: T;
    }
  | {
      readonly success: false;
      readonly error: RiskAssessmentError;
    };

/**
 * Helper function to create success result
 */
export function successResult<T>(data: T): RiskAssessmentResult<T> {
  return { success: true, data };
}

/**
 * Helper function to create error result
 */
export function errorResult<T>(
  error: RiskAssessmentError
): RiskAssessmentResult<T> {
  return { success: false, error };
}

/**
 * Type guard to discriminate result type
 */
export function isSuccessResult<T>(
  result: RiskAssessmentResult<T>
): result is { success: true; data: T } {
  return result.success === true;
}

// ============================================================================
// STEP 0 INTEGRATION TYPES
// ============================================================================

/**
 * Risk assessment context for Step 0 (Intelligence Preload)
 * Provides comprehensive risk warning data for SEO intelligence initialization
 */
export interface RiskAssessmentContext {
  /** Timestamp when assessment was performed */
  readonly assessedAt: string;

  /** List of identified risk warnings */
  readonly warnings: ReadonlyArray<RiskWarning>;

  /** Critical tactics identified */
  readonly criticalTactics: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly riskScore: number;
  }>;

  /** Summary statistics */
  readonly stats: Readonly<{
    readonly totalWarnings: number;
    readonly criticalCount: number;
    readonly highRiskCount: number;
  }>;
}

/**
 * Options for checkAlgorithmRisks function
 */
export interface CheckRisksOptions {
  /** Tactic IDs to evaluate */
  readonly tacticIds: ReadonlyArray<string>;

  /** Custom risk database path (optional) */
  readonly databasePath?: string;

  /** Minimum risk score to trigger warning (default: 0.6) */
  readonly warningThreshold?: number;

  /** Include mitigation strategies in results */
  readonly includeMitigation?: boolean;

  /** Confidence threshold for recommendations (default: 0.7) */
  readonly confidenceThreshold?: number;
}

/**
 * Output of checkAlgorithmRisks function
 */
export interface CheckRisksOutput {
  /** Risk warnings identified */
  readonly warnings: ReadonlyArray<RiskWarning>;

  /** Aggregate risk assessment */
  readonly riskAssessment: AggregateRiskScore;

  /** Execution metadata */
  readonly metadata: Readonly<{
    readonly executedAt: string;
    readonly executionDurationMs: number;
    readonly databaseVersion?: string;
  }>;
}
