/**
 * Validation Type Definitions
 *
 * Core types for CFN Loop validation system including:
 * - Deliverable validation
 * - Success criteria
 * - Consensus and gate checking
 * - Vapor detection
 *
 * @module cfn-loop-validation/types
 */

// ===== EXECUTION MODE TYPES =====

export type ExecutionMode = 'mvp' | 'standard' | 'enterprise';

// ===== DELIVERABLE VALIDATION =====

/**
 * File validation result
 */
export interface DeliverableValidation {
  path: string;
  exists: boolean;
  sizeBytes?: number;
  lastModified?: string;
  mimeType?: string;
  readable?: boolean;
  error?: string;
}

/**
 * Batch deliverable validation result
 */
export interface DeliverableValidationResult {
  deliverables: DeliverableValidation[];
  totalFiles: number;
  existingFiles: number;
  missingFiles: number;
  totalSizeBytes: number;
  allExist: boolean;
  timestamp: number;
}

// ===== SUCCESS CRITERIA TYPES =====

/**
 * Success criteria definition
 */
export interface SuccessCriteria {
  description: string;
  type: 'file_exists' | 'test_pass' | 'command_output' | 'custom';
  condition: string;
  expected?: string | number | boolean;
  command?: string;
  paths?: string[];
  timeout?: number;
}

/**
 * Success criteria validation result
 */
export interface SuccessCriteriaValidationResult {
  passed: boolean;
  criteria: SuccessCriteria[];
  passedCount: number;
  failedCount: number;
  details: {
    criterion: SuccessCriteria;
    passed: boolean;
    result?: any;
    error?: string;
  }[];
  timestamp: number;
}

// ===== GATE VALIDATION =====

/**
 * Gate validation result
 */
export interface GateValidationResult {
  passed: boolean;
  passRate: number;
  threshold: number;
  mode: ExecutionMode;
  gap?: number;
  reason: string;
  timestamp: number;
}

/**
 * Consensus validation result
 */
export interface ConsensusValidationResult {
  passed: boolean;
  consensusScore: number;
  threshold: number;
  mode: ExecutionMode;
  validatorCount: number;
  scores: number[];
  timestamp: number;
}

// ===== VAPOR DETECTION =====

/**
 * Vapor detection result
 */
export interface VaporDetectionResult {
  detected: boolean;
  claimsCompletion: boolean;
  deliverablesMissing: boolean;
  missingDeliverables: string[];
  agentOutput: string;
  expectedDeliverables: string[];
  confidence: number; // 0.0 - 1.0, confidence level of detection
  timestamp: number;
}

// ===== VALIDATION CONFIG =====

/**
 * Validation configuration
 */
export interface ValidationConfig {
  mode: ExecutionMode;
  gateThreshold?: number;
  consensusThreshold?: number;
  taskId: string;
  agentId?: string;
  timeout?: number; // milliseconds
  allowCaching?: boolean;
}

// ===== VALIDATION RESULT (UNIFIED) =====

/**
 * Unified validation result containing all validation types
 */
export interface ValidationResult {
  taskId: string;
  timestamp: number;
  mode: ExecutionMode;
  deliverables?: DeliverableValidationResult;
  successCriteria?: SuccessCriteriaValidationResult;
  gate?: GateValidationResult;
  consensus?: ConsensusValidationResult;
  vapor?: VaporDetectionResult;
  passed: boolean;
  errors: ValidationError[];
  warnings: string[];
}

// ===== ERROR TYPES =====

/**
 * Validation error
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Consensus on vapor error
 */
export class ConsensusOnVaporError extends ValidationError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'CONSENSUS_ON_VAPOR', details);
    this.name = 'ConsensusOnVaporError';
  }
}

// ===== VALIDATION HELPERS =====

/**
 * Type guard for execution mode
 */
export function isExecutionMode(value: any): value is ExecutionMode {
  return ['mvp', 'standard', 'enterprise'].includes(value);
}

/**
 * Type guard for validation config
 */
export function isValidationConfig(value: any): value is ValidationConfig {
  return (
    value &&
    typeof value === 'object' &&
    isExecutionMode(value.mode) &&
    typeof value.taskId === 'string'
  );
}

/**
 * Type guard for success criteria
 */
export function isSuccessCriteria(value: any): value is SuccessCriteria {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.description === 'string' &&
    ['file_exists', 'test_pass', 'command_output', 'custom'].includes(value.type)
  );
}
