/**
 * MDAP Library - Modular Decomposition and Processing
 *
 * Standalone library extracted from Trigger.dev for AI-powered task decomposition,
 * processing, and validation. Contains core utilities for working with GLM 4.6
 * and common validation patterns.
 *
 * @version 1.0.0
 */

// =============================================
// Export Types
// =============================================
export type {
  CompilerError,
  FixInstruction,
  DecomposedTask,
  MDAPResult,
  AIProvider,
  ValidationResult,
  MemoryTier,
  BatchConfig,
} from './types';

// Import types for internal use
import type {
  AIProvider,
  MDAPResult,
} from './types';

// =============================================
// Export GLM Client
// =============================================
export {
  callGLM,
  callGLMWithThinking,
  callGLMFast,
  GLM_MODEL_ID,
  DECOMPOSER_PRESET,
  IMPLEMENTER_PRESET,
  VALIDATOR_PRESET,
  type GLMRequestOptions,
  type GLMResponse,
} from './glm-client';

// =============================================
// Export Implementer
// =============================================
export {
  implement,
  type ImplementerPayload,
  type ImplementerResult,
} from './implementer';

// =============================================
// Export Orchestrator
// =============================================
export {
  orchestrate,
  type OrchestratorPayload,
  type OrchestratorResult,
  type ModeConfig,
} from './orchestrator';

// =============================================
// Export Diff Applicator
// =============================================
export {
  applyFixes,
  validateFix,
  applySingleFix,
  previewFixes,
  type ApplyFixesResult,
} from './diff-applicator';

// =============================================
// Export Error Fixer
// =============================================
export {
  ErrorFixer,
  createErrorFixer,
  quickFix,
  HARD_ERRORS,
  EASY_ERRORS,
  type ErrorFixerConfig,
} from './error-fixer';

// =============================================
// Export Validation Utilities
// =============================================
export {
  validateDecomposerInput,
  validateCerebrasResponse,
  validateDecompositionOutput,
  validateNonEmptyString,
  validateArray,
  validateObject,
  extractJSONFromResponse,
  parseJSONFromResponse,
  type ValidationError,
} from './validation';

// =============================================
// Export Decomposers
// =============================================
export {
  decomposeArchitecture,
  decomposeTesting,
  decomposePerformance,
  decomposeSecurity,
  getDecomposer,
  getAvailablePerspectives,
  type DecomposerPerspective,
  type ArchitectureDecomposerPayload,
  type ArchitectureAnalysis,
  type ArchitectureComponent,
  type ArchitectureBoundary,
  type TestingDecomposerPayload,
  type TestingAnalysis,
  type TestRequirement,
  type PerformanceDecomposerPayload,
  type PerformanceAnalysis,
  type PerformanceConstraint,
  type SecurityDecomposerPayload,
  type SecurityAnalysis,
  type SecurityBoundary,
} from './decomposers';

// =============================================
// Version Information
// =============================================
export const MDAP_VERSION = '1.0.0';

/**
 * MDAP Library configuration
 */
export interface MDAPConfig {
  /** Default AI provider to use */
  defaultProvider?: AIProvider;
  /** Default timeout for API calls (ms) */
  defaultTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Global MDAP configuration (can be modified at runtime)
 */
export let mdapConfig: MDAPConfig = {
  defaultTimeout: 30000,
  debug: false,
};

/**
 * Configure MDAP library settings
 *
 * @param config - Configuration options
 */
export function configureMDAP(config: Partial<MDAPConfig>): void {
  mdapConfig = { ...mdapConfig, ...config };
}

/**
 * Get current MDAP configuration
 *
 * @returns Current configuration
 */
export function getMDAPConfig(): MDAPConfig {
  return { ...mdapConfig };
}

// =============================================
// Utility Functions
// =============================================

/**
 * Creates a standardized error object for consistent error handling
 *
 * @param code - Error code
 * @param message - Error message
 * @param details - Additional error details
 * @returns Standardized error object
 */
export function createMDAPError(
  code: string,
  message: string,
  details?: Record<string, any>
): Error & { code: string; details?: Record<string, any> } {
  const error = new Error(message) as Error & { code: string; details?: Record<string, any> };
  error.code = code;
  error.details = details;
  return error;
}

/**
 * Checks if a value is a valid MDAP result
 *
 * @param value - Value to check
 * @returns True if value is a valid MDAPResult
 */
export function isMDAPResult(value: any): value is MDAPResult {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.success === 'boolean' &&
    typeof value.confidence === 'number'
  );
}

/**
 * Creates a successful MDAP result
 *
 * @param data - Result data
 * @param confidence - Confidence score (0.0-1.0)
 * @param durationMs - Execution duration in milliseconds
 * @returns MDAPResult object
 */
export function createMDAPResult(
  data: {
    filePath?: string;
    linesWritten?: number;
  },
  confidence: number = 0.9,
  durationMs?: number
): MDAPResult {
  return {
    success: true,
    ...data,
    confidence,
    durationMs,
  };
}

/**
 * Creates a failed MDAP result
 *
 * @param error - Error message or Error object
 * @param confidence - Confidence score (0.0-1.0)
 * @returns MDAPResult object
 */
export function createMDAPErrorResult(
  error: string | Error,
  confidence: number = 0.0
): MDAPResult {
  return {
    success: false,
    confidence,
    error: error instanceof Error ? error.message : error,
  };
}
