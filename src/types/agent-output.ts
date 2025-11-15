/**
 * Agent Output Type Definitions
 * TypeScript interfaces matching agent-output-v1.json schema
 *
 * @version 1.0.0
 * @description Strict type-safe agent output interfaces for CFN Loop
 */

// ============================================================================
// Enums and Type Aliases
// ============================================================================

export type DeliverableType =
  | 'implementation'
  | 'test'
  | 'documentation'
  | 'config'
  | 'schema'
  | 'script'
  | 'other';

export type DeliverableStatus =
  | 'created'
  | 'modified'
  | 'deleted'
  | 'validated'
  | 'pending';

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type IssueCategory =
  | 'security'
  | 'performance'
  | 'quality'
  | 'style'
  | 'documentation'
  | 'testing'
  | 'architecture'
  | 'other';

export type ValidationType =
  | 'review'
  | 'test'
  | 'security'
  | 'architecture'
  | 'performance'
  | 'compliance';

export type ProductOwnerDecision = 'PROCEED' | 'ITERATE' | 'ABORT';

export type AgentOutputType = 'loop3' | 'loop2' | 'product_owner';

export type CFNLoopMode = 'mvp' | 'standard' | 'enterprise';

// ============================================================================
// Core Interfaces
// ============================================================================

/**
 * Artifact created or modified by agent
 */
export interface Deliverable {
  /** Absolute or relative file path */
  path: string;
  /** Deliverable type */
  type: DeliverableType;
  /** Deliverable status */
  status: DeliverableStatus;
  /** File size in bytes */
  size_bytes?: number;
  /** Number of lines (for text files) */
  lines?: number;
  /** SHA-256 checksum for integrity validation */
  checksum?: string;
}

/**
 * Issue found during validation
 */
export interface Issue {
  /** Issue severity level */
  severity: IssueSeverity;
  /** Issue category */
  category: IssueCategory;
  /** Human-readable issue description */
  message: string;
  /** File path and line number (e.g., 'src/file.ts:45') */
  location?: string;
  /** Suggested fix or improvement */
  recommendation?: string;
  /** Error code or rule identifier */
  code?: string;
}

/**
 * Quantitative metrics from implementation
 */
export interface Metrics {
  /** Number of files created */
  files_created?: number;
  /** Number of files modified */
  files_modified?: number;
  /** Number of files deleted */
  files_deleted?: number;
  /** Total lines of code written */
  lines_of_code?: number;
  /** Test coverage percentage (0.0-1.0) */
  test_coverage?: number;
  /** Number of tests passed */
  tests_passed?: number;
  /** Number of tests failed */
  tests_failed?: number;
  /** Execution time in milliseconds */
  execution_time_ms?: number;
  /** Memory usage in megabytes */
  memory_usage_mb?: number;
  /** Additional custom metrics (extensible numeric values) */
  custom_metrics?: Record<string, number>;
}

/**
 * Error encountered during execution
 */
export interface AgentError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Stack trace (optional) */
  stack?: string;
  /** Additional error context */
  context?: Record<string, unknown>;
}

/**
 * Agent execution metadata
 */
export interface AgentMetadata {
  /** Type of agent that produced output */
  agent_type: string;
  /** Unique agent instance ID */
  agent_id?: string;
  /** Total execution time in milliseconds */
  execution_time_ms?: number;
  /** ISO 8601 timestamp */
  timestamp?: string;
  /** Swarm/task identifier */
  swarm_id?: string;
  /** CFN Loop iteration number */
  iteration?: number;
  /** CFN Loop execution mode */
  mode?: CFNLoopMode;
  /** Additional execution context */
  context?: Record<string, unknown>;
}

/**
 * Base output common to all agent types
 */
export interface BaseAgentOutput {
  /** Whether execution was successful */
  success: boolean;
  /** Confidence score (0.0-1.0) */
  confidence: number;
  /** CFN Loop iteration number */
  iteration: number;
  /** Errors encountered during execution */
  errors: AgentError[];
  /** Agent execution metadata */
  metadata: AgentMetadata;
}

// ============================================================================
// Discriminated Union Types
// ============================================================================

/**
 * Loop 3 (Implementer) Output
 */
export interface Loop3Output extends BaseAgentOutput {
  /** Discriminator for Loop 3 implementer output */
  output_type: 'loop3';
  /** Artifacts created or modified */
  deliverables: Deliverable[];
  /** Quantitative metrics */
  metrics?: Metrics;
  /** Brief summary of implementation work */
  summary?: string;
}

/**
 * Loop 2 (Validator) Output
 */
export interface Loop2Output extends BaseAgentOutput {
  /** Discriminator for Loop 2 validator output */
  output_type: 'loop2';
  /** Type of validation performed */
  validation_type: ValidationType;
  /** Issues found during validation */
  issues: Issue[];
  /** Recommendations for improvement */
  recommendations: string[];
  /** Whether work is approved (consensus vote) */
  approved: boolean;
  /** Brief summary of validation findings */
  summary?: string;
}

/**
 * Product Owner Output
 */
export interface ProductOwnerOutput extends BaseAgentOutput {
  /** Discriminator for Product Owner output */
  output_type: 'product_owner';
  /** Product Owner decision */
  decision: ProductOwnerDecision;
  /** Explanation for decision */
  rationale: string;
  /** Whether deliverables were validated */
  deliverables_validated: boolean;
  /** Next action to take */
  next_action: string;
  /** Consensus score from Loop 2 validators (0.0-1.0) */
  consensus_score?: number;
  /** Gate score from Loop 3 implementers (0.0-1.0) */
  gate_score?: number;
}

/**
 * Union type for all agent outputs
 */
export type AgentOutput = Loop3Output | Loop2Output | ProductOwnerOutput;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for Loop 3 output
 */
export function isLoop3Output(output: AgentOutput): output is Loop3Output {
  return output.output_type === 'loop3';
}

/**
 * Type guard for Loop 2 output
 */
export function isLoop2Output(output: AgentOutput): output is Loop2Output {
  return output.output_type === 'loop2';
}

/**
 * Type guard for Product Owner output
 */
export function isProductOwnerOutput(
  output: AgentOutput
): output is ProductOwnerOutput {
  return output.output_type === 'product_owner';
}

/**
 * Type guard for base agent output
 */
export function isValidAgentOutput(value: unknown): value is AgentOutput {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required base fields
  if (
    typeof obj.success !== 'boolean' ||
    typeof obj.confidence !== 'number' ||
    typeof obj.iteration !== 'number' ||
    !Array.isArray(obj.errors) ||
    typeof obj.metadata !== 'object' ||
    obj.metadata === null
  ) {
    return false;
  }

  // Check output_type discriminator
  const outputType = obj.output_type;
  return (
    outputType === 'loop3' ||
    outputType === 'loop2' ||
    outputType === 'product_owner'
  );
}

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Validation error details
 */
export interface ValidationError {
  /** Field that failed validation */
  field: string;
  /** Error message */
  message: string;
  /** JSON path to field */
  path: string;
  /** Error code */
  code: string;
  /** Current value (if applicable) */
  value?: unknown;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors (if any) */
  errors: ValidationError[];
  /** Warnings (non-fatal issues) */
  warnings: string[];
  /** Detected output type */
  output_type?: AgentOutputType;
}

// ============================================================================
// Parser Result Types
// ============================================================================

/**
 * Legacy parser result
 */
export interface ParseResult {
  /** Whether parsing was successful */
  success: boolean;
  /** Parsed agent output (if successful) */
  output?: AgentOutput;
  /** Parse errors (if unsuccessful) */
  errors: string[];
  /** Parser confidence (0.0-1.0) */
  confidence: number;
}

// ============================================================================
// Exports
// ============================================================================

export default AgentOutput;
