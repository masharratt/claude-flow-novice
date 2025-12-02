/**
 * Algorithm Risk Scoring - Type Guards and Runtime Validation
 *
 * @module planning/seo/types/algorithm-risk-guards
 * @description Type guards and validators for algorithm risk assessment types
 *              Provides runtime validation for compile-time type safety
 * @version 1.0.0
 */

import {
  type RiskLevel,
  type ImpactLevel,
  type DifficultyLevel,
  type TacticDefinition,
  type AlgorithmUpdate,
  type TacticRiskEvaluation,
  type AggregateRiskScore,
  type MitigationStrategy,
  type RiskDatabase,
  type RiskWarning,
  type RiskAssessmentError,
  type RiskAssessmentResult,
  type RiskAssessmentContext,
  type CheckRisksOptions,
  type CheckRisksOutput,
  isValidRiskLevel,
  isValidImpactLevel,
  isValidDifficultyLevel,
  isValidRiskScore,
  isValidISOTimestamp,
  isValidTacticDefinition,
  isValidAlgorithmUpdate,
  isValidTacticRiskEvaluation,
  isValidAggregateRiskScore,
  isValidMitigationStrategy,
  isValidRiskDatabase,
} from './algorithm-risk';

/**
 * Comprehensive validation module for algorithm risk types
 * Combines multiple type guards for complex validation scenarios
 */

// ============================================================================
// BATCH VALIDATION
// ============================================================================

/**
 * Validates an array of tactics with detailed error reporting
 * Returns first error encountered or true if all valid
 */
export function validateTacticArray(
  tactics: unknown
): { valid: true } | { valid: false; error: string; index?: number } {
  if (!Array.isArray(tactics)) {
    return { valid: false, error: 'Tactics must be an array' };
  }

  if (tactics.length === 0) {
    return { valid: false, error: 'Tactics array cannot be empty' };
  }

  if (tactics.length > 1000) {
    return {
      valid: false,
      error: 'Tactics array exceeds maximum length of 1000',
    };
  }

  for (let i = 0; i < tactics.length; i++) {
    if (!isValidTacticDefinition(tactics[i])) {
      return {
        valid: false,
        error: `Invalid tactic at index ${i}`,
        index: i,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates an array of algorithm updates
 */
export function validateAlgorithmUpdateArray(
  updates: unknown
): { valid: true } | { valid: false; error: string; index?: number } {
  if (!Array.isArray(updates)) {
    return { valid: false, error: 'Updates must be an array' };
  }

  if (updates.length === 0) {
    return { valid: false, error: 'Updates array cannot be empty' };
  }

  if (updates.length > 500) {
    return {
      valid: false,
      error: 'Updates array exceeds maximum length of 500',
    };
  }

  for (let i = 0; i < updates.length; i++) {
    if (!isValidAlgorithmUpdate(updates[i])) {
      return {
        valid: false,
        error: `Invalid algorithm update at index ${i}`,
        index: i,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates a complete risk database with comprehensive checks
 */
export function validateRiskDatabaseFull(
  database: unknown
): {
  valid: true;
} | {
  valid: false;
  errors: string[];
} {
  const errors: string[] = [];

  // Basic type check
  if (typeof database !== 'object' || database === null) {
    return { valid: false, errors: ['Database must be an object'] };
  }

  const db = database as Record<string, unknown>;

  // Check tactics
  if (!Array.isArray(db.tactics)) {
    errors.push('Database.tactics must be an array');
  } else {
    const tacticValidation = validateTacticArray(db.tactics);
    if (!tacticValidation.valid) {
      errors.push(`Invalid tactics: ${tacticValidation.error}`);
    }

    if ((db.tactics as unknown[]).length < 20) {
      errors.push('Database must contain at least 20 tactics');
    }
  }

  // Check algorithm updates
  if (!Array.isArray(db.algorithmUpdates)) {
    errors.push('Database.algorithmUpdates must be an array');
  } else {
    const updateValidation = validateAlgorithmUpdateArray(db.algorithmUpdates);
    if (!updateValidation.valid) {
      errors.push(`Invalid algorithm updates: ${updateValidation.error}`);
    }

    if ((db.algorithmUpdates as unknown[]).length < 10) {
      errors.push('Database must contain at least 10 algorithm updates');
    }
  }

  // Check referential integrity (algorithm updates reference real tactic IDs)
  if (
    Array.isArray(db.tactics) &&
    Array.isArray(db.algorithmUpdates) &&
    db.tactics.every(isValidTacticDefinition) &&
    db.algorithmUpdates.every(isValidAlgorithmUpdate)
  ) {
    const validTacticIds = new Set(
      (db.tactics as TacticDefinition[]).map((t) => t.id)
    );
    const updates = db.algorithmUpdates as AlgorithmUpdate[];

    for (const update of updates) {
      for (const tacticId of update.targeted_tactics) {
        if (!validTacticIds.has(tacticId)) {
          errors.push(
            `Algorithm update "${update.id}" references non-existent tactic "${tacticId}"`
          );
        }
      }
    }

    // Check tactics reference real algorithm updates
    const validUpdateIds = new Set(updates.map((u) => u.id));
    for (const tactic of db.tactics as TacticDefinition[]) {
      for (const updateId of tactic.algorithm_updates) {
        if (!validUpdateIds.has(updateId)) {
          errors.push(
            `Tactic "${tactic.id}" references non-existent update "${updateId}"`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

// ============================================================================
// TACTIC ID VALIDATION
// ============================================================================

/**
 * Validates tactic ID format (kebab-case with alphanumerics)
 * Used for injection attack prevention
 */
export function isValidTacticId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > 255) return false;
  return /^[a-z0-9_-]+$/.test(id);
}

/**
 * Validates an array of tactic IDs
 */
export function validateTacticIdArray(
  ids: unknown
): { valid: true } | { valid: false; error: string; index?: number } {
  if (!Array.isArray(ids)) {
    return { valid: false, error: 'Tactic IDs must be an array' };
  }

  if (ids.length === 0) {
    return { valid: false, error: 'Tactic ID array cannot be empty' };
  }

  if (ids.length > 100) {
    return {
      valid: false,
      error: 'Tactic ID array exceeds maximum length of 100',
    };
  }

  for (let i = 0; i < ids.length; i++) {
    if (!isValidTacticId(ids[i])) {
      return {
        valid: false,
        error: `Invalid tactic ID at index ${i}: "${ids[i]}"`,
        index: i,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// AGGREGATE RISK VALIDATION
// ============================================================================

/**
 * Validates that tactic evaluations match aggregate risk breakdown
 * Ensures consistency between detailed and summary data
 */
export function validateAggregateRiskConsistency(
  aggregate: AggregateRiskScore
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  // Validate critical tactics are actually critical
  for (const tactic of aggregate.criticalTactics) {
    if (tactic.riskLevel !== 'critical') {
      errors.push(
        `Critical tactic "${tactic.tacticId}" has risk level "${tactic.riskLevel}", not "critical"`
      );
    }
  }

  // Validate high-risk tactics are high or higher
  for (const tactic of aggregate.highRiskTactics) {
    if (tactic.riskLevel !== 'high' && tactic.riskLevel !== 'critical') {
      errors.push(
        `High-risk tactic "${tactic.tacticId}" has risk level "${tactic.riskLevel}", not "high" or "critical"`
      );
    }
  }

  // Validate all critical/high tactics are in evaluations
  const evaluationIds = new Set(
    aggregate.tacticEvaluations.map((e) => e.tacticId)
  );
  for (const tactic of [
    ...aggregate.criticalTactics,
    ...aggregate.highRiskTactics,
  ]) {
    if (!evaluationIds.has(tactic.tacticId)) {
      errors.push(
        `Tactic "${tactic.tacticId}" in risk breakdown but not in evaluations`
      );
    }
  }

  // Validate overall score matches evaluations
  if (aggregate.tacticEvaluations.length > 0) {
    const calculatedScore =
      aggregate.tacticEvaluations.reduce(
        (sum, e) => sum + e.riskScore,
        0
      ) / aggregate.tacticEvaluations.length;

    // Allow small floating point variance
    if (Math.abs(calculatedScore - aggregate.overallRiskScore) > 0.01) {
      errors.push(
        `Overall risk score ${aggregate.overallRiskScore} does not match calculated score ${calculatedScore}`
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

// ============================================================================
// RESULT TYPE VALIDATION
// ============================================================================

/**
 * Type guard for success results
 */
export function isSuccessResult<T>(
  result: RiskAssessmentResult<T>
): result is { success: true; data: T } {
  return result.success === true;
}

/**
 * Type guard for error results
 */
export function isErrorResult<T>(
  result: RiskAssessmentResult<T>
): result is { success: false; error: RiskAssessmentError } {
  return result.success === false;
}

/**
 * Validates a RiskAssessmentError with detailed checks
 */
export function validateRiskAssessmentError(
  error: unknown
): error is RiskAssessmentError {
  if (typeof error !== 'object' || error === null) return false;

  const e = error as Record<string, unknown>;

  const validCodes = [
    'DATABASE_LOAD_FAILED',
    'TACTIC_NOT_FOUND',
    'INVALID_RISK_SCORE',
    'VALIDATION_FAILED',
    'INVALID_INPUT',
  ];

  return (
    validCodes.includes(e.code as string) &&
    typeof e.message === 'string' &&
    typeof e.timestamp === 'string' &&
    isValidISOTimestamp(e.timestamp)
  );
}

// ============================================================================
// OPTIONS & OUTPUT VALIDATION
// ============================================================================

/**
 * Validates CheckRisksOptions with defaults
 */
export function validateCheckRisksOptions(
  options: unknown
): {
  valid: true;
  normalized: Omit<Required<CheckRisksOptions>, 'databasePath'> & { databasePath?: string };
} | {
  valid: false;
  error: string;
} {
  if (typeof options !== 'object' || options === null) {
    return { valid: false, error: 'Options must be an object' };
  }

  const opts = options as Record<string, unknown>;

  // Validate tacticIds
  const tacticIdValidation = validateTacticIdArray(opts.tacticIds);
  if (!tacticIdValidation.valid) {
    return { valid: false, error: `Invalid tacticIds: ${tacticIdValidation.error}` };
  }

  // Normalize with defaults
  let normalizedWarningThreshold = 0.6;
  if (typeof opts.warningThreshold === 'number') {
    if (Number.isFinite(opts.warningThreshold) &&
        opts.warningThreshold >= 0 &&
        opts.warningThreshold <= 1) {
      normalizedWarningThreshold = opts.warningThreshold;
    }
  }

  let normalizedConfidenceThreshold = 0.7;
  if (typeof opts.confidenceThreshold === 'number') {
    if (Number.isFinite(opts.confidenceThreshold) &&
        opts.confidenceThreshold >= 0 &&
        opts.confidenceThreshold <= 1) {
      normalizedConfidenceThreshold = opts.confidenceThreshold;
    }
  }

  return {
    valid: true,
    normalized: {
      tacticIds: opts.tacticIds as ReadonlyArray<string>,
      databasePath: (opts.databasePath as string | undefined),
      warningThreshold: normalizedWarningThreshold,
      includeMitigation: typeof opts.includeMitigation === 'boolean' ? opts.includeMitigation : true,
      confidenceThreshold: normalizedConfidenceThreshold,
    },
  };
}

/**
 * Validates CheckRisksOutput structure
 */
export function validateCheckRisksOutput(
  output: unknown
): output is CheckRisksOutput {
  if (typeof output !== 'object' || output === null) return false;

  const o = output as Record<string, unknown>;

  return (
    Array.isArray(o.warnings) &&
    o.warnings.every((w) => typeof w === 'object' && w !== null) &&
    isValidAggregateRiskScore(o.riskAssessment) &&
    typeof o.metadata === 'object' &&
    o.metadata !== null &&
    isValidISOTimestamp(
      (o.metadata as Record<string, unknown>).executedAt
    ) &&
    typeof (o.metadata as Record<string, unknown>).executionDurationMs ===
      'number'
  );
}

// ============================================================================
// SANITIZATION & NORMALIZATION
// ============================================================================

/**
 * Sanitizes tactic ID to prevent injection attacks
 */
export function sanitizeTacticId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

/**
 * Validates and normalizes timestamp to ISO 8601
 */
export function normalizeTimestamp(
  timestamp: string | number | Date
): string {
  const date =
    typeof timestamp === 'string'
      ? new Date(timestamp)
      : typeof timestamp === 'number'
        ? new Date(timestamp)
        : timestamp;

  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

/**
 * Validates and normalizes risk warning data
 */
export function normalizeRiskWarning(
  warning: Partial<RiskWarning>
): {
  valid: true;
  normalized: RiskWarning;
} | {
  valid: false;
  error: string;
} {
  if (!isValidRiskLevel(warning.level)) {
    return { valid: false, error: 'Invalid risk level' };
  }

  if (typeof warning.message !== 'string' || warning.message.length === 0) {
    return { valid: false, error: 'Message must be non-empty string' };
  }

  if (
    typeof warning.recommendation !== 'string' ||
    warning.recommendation.length === 0
  ) {
    return { valid: false, error: 'Recommendation must be non-empty string' };
  }

  const mitigation = Array.isArray(warning.mitigation)
    ? warning.mitigation.filter((m) => typeof m === 'string')
    : [];

  const normalized: RiskWarning = {
    level: warning.level,
    message: warning.message,
    recommendation: warning.recommendation,
    mitigation,
    ...(typeof warning.tacticId === 'string' && {
      tacticId: warning.tacticId,
    }),
    ...(Array.isArray(warning.relatedUpdates) && {
      relatedUpdates: warning.relatedUpdates.filter((u) => typeof u === 'string'),
    }),
  };

  return {
    valid: true,
    normalized,
  };
}
