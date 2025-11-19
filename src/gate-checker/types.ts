/**
 * Gate Checker Type Definitions
 *
 * Core types and interfaces for the CFN Loop gate checking system including:
 * - Test result tracking
 * - Pass rate calculations
 * - Gate validation and thresholds
 * - Execution modes and strategies
 * - Error handling
 *
 * @module gate-checker/types
 */

// ===== EXECUTION MODE TYPES =====

export type ExecutionMode = 'mvp' | 'standard' | 'enterprise';

export type GateCheckStrategy = 'test-driven' | 'confidence' | 'auto';

// ===== TEST RESULT TYPES =====

/**
 * Individual test result from a test suite execution
 */
export interface TestResult {
  pass_rate: number; // 0.0 to 1.0
  passed: number; // Number of passed tests
  failed: number; // Number of failed tests
  total: number; // Total number of tests
  status: 'success' | 'timeout' | 'parse_error' | 'failure' | 'parsed';
}

/**
 * Test suite definition from success criteria
 */
export interface TestSuite {
  name: string;
  command: string;
  timeout?: number; // Timeout in seconds
  framework?: string; // Test framework (jest, pytest, mocha, etc.)
  required?: boolean; // Whether this test suite is required for gate to pass
}

/**
 * Success criteria containing test suites and thresholds
 */
export interface SuccessCriteria {
  test_suites: TestSuite[];
  mode?: ExecutionMode;
  description?: string;
}

// ===== GATE RESULT TYPES =====

/**
 * Result of gate check validation
 */
export interface GateResult {
  passed: boolean;
  pass_rate: number;
  threshold: number;
  mode: ExecutionMode;
  gap?: number; // threshold - pass_rate when gate fails
  test_results: TestResult[];
  failed_suites: string[]; // Names of failed test suites
  execution_time_ms: number;
  timestamp: number;
}

/**
 * Context for iteration when gate fails
 */
export interface IterationContext {
  gate_status: 'failed' | 'passed';
  pass_rate: number;
  threshold: number;
  gap?: number;
  failed_tests: TestResult[];
  recommendations: string[];
}

// ===== QUORUM & CONSENSUS TYPES =====

export type QuorumFormat = 'count' | 'percentage' | 'ratio';

/**
 * Parsed quorum specification
 */
export interface QuorumSpec {
  format: QuorumFormat;
  value: number;
}

/**
 * Confidence-based gate result (legacy)
 */
export interface ConfidenceGateResult {
  consensus: number; // Consensus score 0.0 to 1.0
  threshold: number;
  passed: boolean;
  gap?: number;
}

// ===== VALIDATION ERROR TYPES =====

export class GateCheckError extends Error {
  constructor(
    message: string,
    public code: string,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GateCheckError';
  }
}

export class ValidationError extends GateCheckError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', metadata);
    this.name = 'ValidationError';
  }
}

export class SecurityError extends GateCheckError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'SECURITY_ERROR', metadata);
    this.name = 'SecurityError';
  }
}

export class TimeoutError extends GateCheckError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'TIMEOUT_ERROR', metadata);
    this.name = 'TimeoutError';
  }
}

// ===== SECURITY CONSTRAINT TYPES =====

export interface SecurityConstraints {
  maxTestSuites: number; // Maximum number of test suites allowed
  maxFieldLength: number; // Maximum length for field names
  passThresholdMin: number; // Minimum value for pass threshold
  passThresholdMax: number; // Maximum value for pass threshold
  timeoutMin: number; // Minimum timeout in seconds
  timeoutMax: number; // Maximum timeout in seconds
  maxTotalTime: number; // Maximum total execution time in seconds
}

// ===== AGGREGATE RESULTS TYPES =====

/**
 * Aggregated pass rate from multiple test results
 */
export interface AggregatePassRate {
  total_passed: number;
  total_tests: number;
  pass_rate: number;
  results: TestResult[];
}

// ===== TYPE GUARDS =====

/**
 * Type guard to check if a value is a valid TestResult
 */
export function isValidTestResult(value: unknown): value is TestResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const result = value as Record<string, unknown>;
  const validStatuses = ['success', 'timeout', 'parse_error', 'failure', 'parsed'];
  return (
    typeof result.pass_rate === 'number' &&
    typeof result.passed === 'number' &&
    typeof result.failed === 'number' &&
    typeof result.total === 'number' &&
    typeof result.status === 'string' &&
    result.pass_rate >= 0 &&
    result.pass_rate <= 1 &&
    result.passed >= 0 &&
    result.failed >= 0 &&
    result.total >= 0 &&
    validStatuses.indexOf(result.status as string) !== -1
  );
}

/**
 * Type guard to check if a value is a valid SuccessCriteria
 */
export function isValidSuccessCriteria(value: unknown): value is SuccessCriteria {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const criteria = value as Record<string, unknown>;
  return (
    Array.isArray(criteria.test_suites) &&
    criteria.test_suites.length > 0 &&
    criteria.test_suites.every(suite => isValidTestSuite(suite))
  );
}

/**
 * Type guard to check if a value is a valid TestSuite
 */
export function isValidTestSuite(value: unknown): value is TestSuite {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const suite = value as Record<string, unknown>;
  return (
    typeof suite.name === 'string' &&
    typeof suite.command === 'string' &&
    (suite.timeout === undefined || typeof suite.timeout === 'number') &&
    (suite.framework === undefined || typeof suite.framework === 'string') &&
    (suite.required === undefined || typeof suite.required === 'boolean')
  );
}

/**
 * Type guard to check if a value is a valid ExecutionMode
 */
export function isValidExecutionMode(value: unknown): value is ExecutionMode {
  return value === 'mvp' || value === 'standard' || value === 'enterprise';
}

/**
 * Type guard to check if a value is a valid GateCheckStrategy
 */
export function isValidGateCheckStrategy(value: unknown): value is GateCheckStrategy {
  return value === 'test-driven' || value === 'confidence' || value === 'auto';
}

// ===== EXPORTS =====

export default {
  isValidTestResult,
  isValidSuccessCriteria,
  isValidTestSuite,
  isValidExecutionMode,
  isValidGateCheckStrategy,
};
