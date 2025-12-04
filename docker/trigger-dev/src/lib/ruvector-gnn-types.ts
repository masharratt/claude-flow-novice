/**
 * RuVector GNN Type Guards and Safe Type Extraction
 *
 * Provides type-safe extraction of metadata from collection results.
 * Replaces `as any` casts with proper type guards that validate
 * at runtime and provide correct type narrowing.
 *
 * Usage:
 *   const metadata = extractErrorLibraryMetadata(result);
 *   // metadata is now properly typed as Partial<ErrorLibraryEntry['metadata']>
 */

import type {
  ErrorLibraryEntry,
  CodebaseIndexEntry,
  DecompositionHistoryEntry,
  SecurityPatternEntry,
  PerformancePatternEntry,
} from './ruvector-schemas.js';

/**
 * Generic collection result type
 * Represents the structure returned from vector collection searches
 */
export interface CollectionResult<T> {
  metadata: T;
  id: string;
  similarity?: number;
  vector?: Float32Array;
  timestamp?: number;
}

/**
 * Type guard for ErrorLibraryEntry metadata extraction
 * Validates that the object has the required structure for error library entries
 */
export function isErrorLibraryResult(
  obj: unknown
): obj is CollectionResult<Partial<ErrorLibraryEntry['metadata']>> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'metadata' in obj &&
    'id' in obj &&
    typeof (obj as { metadata?: unknown }).metadata === 'object' &&
    (obj as { metadata?: unknown }).metadata !== null
  );
}

/**
 * Safe extraction of ErrorLibraryEntry metadata
 * Validates structure and provides proper typing
 * Falls back to defaults if fields are missing
 */
export function extractErrorLibraryMetadata(
  result: unknown
): Partial<ErrorLibraryEntry['metadata']> & { id: string } {
  if (!isErrorLibraryResult(result)) {
    throw new Error('Invalid error library result structure');
  }

  const metadata = result.metadata as Record<string, unknown>;
  const id = result.id;

  return {
    id,
    errorMessage: typeof metadata.errorMessage === 'string' ? metadata.errorMessage : '',
    errorType: typeof metadata.errorType === 'string' ? metadata.errorType : 'unknown',
    severity: isSeverity(metadata.severity) ? metadata.severity : 'low',
    rootCauseConfidence:
      typeof metadata.rootCauseConfidence === 'number' ? metadata.rootCauseConfidence : 0,
    causedBy: Array.isArray(metadata.causedBy) ? (metadata.causedBy as string[]) : undefined,
    causes: Array.isArray(metadata.causes) ? (metadata.causes as string[]) : undefined,
    causeConfidence:
      typeof metadata.causeConfidence === 'number' ? metadata.causeConfidence : 0.5,
    timesSeen: typeof metadata.timesSeen === 'number' ? metadata.timesSeen : 0,
  };
}

/**
 * Type guard for CodebaseIndexEntry metadata extraction
 */
export function isCodebaseIndexResult(
  obj: unknown
): obj is CollectionResult<Partial<CodebaseIndexEntry['metadata']>> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'metadata' in obj &&
    'id' in obj &&
    typeof (obj as { metadata?: unknown }).metadata === 'object' &&
    (obj as { metadata?: unknown }).metadata !== null
  );
}

/**
 * Safe extraction of CodebaseIndexEntry metadata
 */
export function extractCodebaseIndexMetadata(
  result: unknown
): Partial<CodebaseIndexEntry['metadata']> & { id: string } {
  if (!isCodebaseIndexResult(result)) {
    throw new Error('Invalid codebase index result structure');
  }

  const metadata = result.metadata as Record<string, unknown>;
  const id = result.id;

  return {
    id,
    filePath: typeof metadata.filePath === 'string' ? metadata.filePath : id,
    fileName: typeof metadata.fileName === 'string' ? metadata.fileName : id,
    fileType: typeof metadata.fileType === 'string' ? metadata.fileType : 'unknown',
    purpose: typeof metadata.purpose === 'string' ? metadata.purpose : '',
    lines: typeof metadata.lines === 'number' ? metadata.lines : 0,
    complexity: typeof metadata.complexity === 'number' ? metadata.complexity : 0,
    exports: Array.isArray(metadata.exports) ? (metadata.exports as string[]) : undefined,
    dependencies: Array.isArray(metadata.dependencies)
      ? (metadata.dependencies as string[])
      : undefined,
  };
}

/**
 * Type guard for DecompositionHistoryEntry metadata extraction
 */
export function isDecompositionHistoryResult(
  obj: unknown
): obj is CollectionResult<Partial<DecompositionHistoryEntry['metadata']>> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'metadata' in obj &&
    'id' in obj &&
    typeof (obj as { metadata?: unknown }).metadata === 'object' &&
    (obj as { metadata?: unknown }).metadata !== null
  );
}

/**
 * Safe extraction of DecompositionHistoryEntry metadata
 */
export function extractDecompositionHistoryMetadata(
  result: unknown
): Partial<DecompositionHistoryEntry['metadata']> & { id: string } {
  if (!isDecompositionHistoryResult(result)) {
    throw new Error('Invalid decomposition history result structure');
  }

  const metadata = result.metadata as Record<string, unknown>;
  const id = result.id;

  return {
    id,
    taskId: typeof metadata.taskId === 'string' ? metadata.taskId : id,
    originalTask: typeof metadata.originalTask === 'string' ? metadata.originalTask : '',
    timestamp: typeof metadata.timestamp === 'number' ? metadata.timestamp : Date.now(),
    decompositionApproach: typeof metadata.decompositionApproach === 'string' ? metadata.decompositionApproach : 'unknown',
    successRate: typeof metadata.successRate === 'number' ? metadata.successRate : 0,
    executionPhases: typeof metadata.executionPhases === 'number' ? metadata.executionPhases : 0,
    microTaskCount: typeof metadata.microTaskCount === 'number' ? metadata.microTaskCount : 0,
    finalDecision: isFinalDecision(metadata.finalDecision) ? metadata.finalDecision : 'ABORT',
  };
}


/**
 * Type guard for SecurityPatternEntry metadata extraction
 */
export function isSecurityPatternResult(
  obj: unknown
): obj is CollectionResult<Partial<SecurityPatternEntry['metadata']>> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'metadata' in obj &&
    'id' in obj &&
    typeof (obj as { metadata?: unknown }).metadata === 'object' &&
    (obj as { metadata?: unknown }).metadata !== null
  );
}

/**
 * Safe extraction of SecurityPatternEntry metadata
 */
export function extractSecurityPatternMetadata(
  result: unknown
): Partial<SecurityPatternEntry['metadata']> & { id: string } {
  if (!isSecurityPatternResult(result)) {
    throw new Error('Invalid security pattern result structure');
  }

  const metadata = result.metadata as Record<string, unknown>;
  const id = result.id;

  return {
    id,
    patternName: typeof metadata.patternName === 'string' ? metadata.patternName : 'unknown',
    vulnerabilityType: typeof metadata.vulnerabilityType === 'string' ? metadata.vulnerabilityType : 'unknown',
    vulnerabilityScore:
      typeof metadata.vulnerabilityScore === 'number'
        ? metadata.vulnerabilityScore
        : 0,
    findings: Array.isArray(metadata.findings)
      ? (metadata.findings as string[])
      : undefined,
    preventionStrategies:
      Array.isArray(metadata.preventionStrategies)
        ? (metadata.preventionStrategies as string[])
        : undefined,
    occurrenceCount:
      typeof metadata.occurrenceCount === 'number' ? metadata.occurrenceCount : 0,
  };
}

/**
 * Type guard for PerformancePatternEntry metadata extraction
 */
export function isPerformancePatternResult(
  obj: unknown
): obj is CollectionResult<Partial<PerformancePatternEntry['metadata']>> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'metadata' in obj &&
    'id' in obj &&
    typeof (obj as { metadata?: unknown }).metadata === 'object' &&
    (obj as { metadata?: unknown }).metadata !== null
  );
}

/**
 * Safe extraction of PerformancePatternEntry metadata
 */
export function extractPerformancePatternMetadata(
  result: unknown
): Partial<PerformancePatternEntry['metadata']> & { id: string } {
  if (!isPerformancePatternResult(result)) {
    throw new Error('Invalid performance pattern result structure');
  }

  const metadata = result.metadata as Record<string, unknown>;
  const id = result.id;

  return {
    id,
    patternName: typeof metadata.patternName === 'string' ? metadata.patternName : 'unknown',
    issueType: typeof metadata.issueType === 'string' ? metadata.issueType : 'unknown',
    performanceScore:
      typeof metadata.performanceScore === 'number' ? metadata.performanceScore : 0,
    issues:
      Array.isArray(metadata.issues)
        ? (metadata.issues as string[])
        : undefined,
    optimizationStrategies:
      Array.isArray(metadata.optimizationStrategies)
        ? (metadata.optimizationStrategies as string[])
        : undefined,
    occurrenceCount: typeof metadata.occurrenceCount === 'number' ? metadata.occurrenceCount : 0,
  };
}

/**
 * Type predicate for severity values
 * Narrows value to the correct Severity type
 */
function isSeverity(value: unknown): value is ErrorLibraryEntry['metadata']['severity'] {
  return (
    value === 'critical' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low'
  );
}

/**
 * Helper function to validate severity values (legacy wrapper)
 */
function validateSeverity(value: unknown): boolean {
  return isSeverity(value);
}

/**
 * Type predicate for final decision values
 * Narrows value to the correct FinalDecision type
 */
function isFinalDecision(value: unknown): value is DecompositionHistoryEntry['metadata']['finalDecision'] {
  return (
    value === 'PROCEED' ||
    value === 'ITERATE' ||
    value === 'ABORT'
  );
}

/**
 * Helper function to validate final decision values (legacy wrapper)
 */
function validateFinalDecision(value: unknown): boolean {
  return isFinalDecision(value);
}

/**
 * Helper function to validate impact level values
 */
function validateImpactLevel(value: unknown): boolean {
  return (
    value === 'high' ||
    value === 'medium' ||
    value === 'low'
  );
}

/**
 * Generic result validator
 * Validates that an unknown object has the basic CollectionResult structure
 */
export function isValidCollectionResult(obj: unknown): obj is CollectionResult<unknown> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'metadata' in obj &&
    'id' in obj &&
    typeof (obj as Record<string, unknown>).id === 'string'
  );
}

/**
 * Batch validation helper
 * Validates an array of results and filters out invalid ones
 */
export function validateCollectionResults<T>(
  results: unknown[]
): CollectionResult<T>[] {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.filter(
    (result): result is CollectionResult<T> => isValidCollectionResult(result)
  );
}

/**
 * Safe array extraction from metadata
 * Ensures proper typing and provides fallback for missing arrays
 */
export function extractArrayField(
  metadata: Record<string, unknown>,
  fieldName: string,
  defaultValue: string[] = []
): string[] {
  const value = metadata[fieldName];
  return Array.isArray(value) ? (value as string[]) : defaultValue;
}

/**
 * Safe number extraction from metadata
 * Ensures proper typing and provides fallback for missing numbers
 */
export function extractNumberField(
  metadata: Record<string, unknown>,
  fieldName: string,
  defaultValue: number = 0
): number {
  const value = metadata[fieldName];
  return typeof value === 'number' ? value : defaultValue;
}

/**
 * Safe string extraction from metadata
 * Ensures proper typing and provides fallback for missing strings
 */
export function extractStringField(
  metadata: Record<string, unknown>,
  fieldName: string,
  defaultValue: string = ''
): string {
  const value = metadata[fieldName];
  return typeof value === 'string' ? value : defaultValue;
}
