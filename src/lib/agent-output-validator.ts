/**
 * Agent Output Validator
 * Zero-dependency validation library for CFN agent outputs
 *
 * @version 1.0.0
 * @description Type-safe validation with detailed error reporting
 */

import type {
  AgentOutput,
  Loop3Output,
  Loop2Output,
  ProductOwnerOutput,
  ValidationResult,
  ValidationError,
  Deliverable,
  Issue,
  Metrics,
  AgentError,
  AgentMetadata,
  DeliverableType,
  DeliverableStatus,
  IssueSeverity,
  IssueCategory,
  ValidationType,
  ProductOwnerDecision,
  CFNLoopMode,
} from '../types/agent-output.js';

// ============================================================================
// Security Helper Functions
// ============================================================================

/**
 * Sanitize values for safe logging (prevents sensitive data leakage)
 * @param value - Value to sanitize
 * @param path - Field path for sensitive field detection
 * @returns Sanitized string representation
 */
function sanitizeValue(value: unknown, path: string): string {
  // List of sensitive field patterns
  const sensitivePatterns = [
    'password',
    'passwd',
    'pwd',
    'token',
    'key',
    'secret',
    'api_key',
    'apikey',
    'api-key',
    'auth',
    'credential',
    'private',
  ];

  // Check if path contains sensitive field name
  const lowerPath = path.toLowerCase();
  const isSensitive = sensitivePatterns.some((pattern) =>
    lowerPath.includes(pattern)
  );

  if (isSensitive) {
    return '[REDACTED]';
  }

  // Sanitize value for safe display
  try {
    const str = JSON.stringify(value);

    // Truncate large values to prevent log flooding
    const maxLength = 100;
    if (str.length > maxLength) {
      return str.substring(0, maxLength) + '...[truncated]';
    }

    return str;
  } catch {
    // Handle circular references or non-serializable values
    return '[Non-serializable value]';
  }
}

// ============================================================================
// Validation Class
// ============================================================================

/**
 * AgentOutputValidator: Main validation class
 * Provides schema validation, error reporting, and type checking
 */
export class AgentOutputValidator {
  /**
   * Validate agent output object
   */
  public validate(output: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    if (typeof output !== 'object' || output === null) {
      return {
        valid: false,
        errors: [
          {
            field: 'root',
            message: 'Agent output must be a valid JSON object',
            path: '/',
            code: 'INVALID_TYPE',
          },
        ],
        warnings,
      };
    }

    const obj = output as Record<string, unknown>;

    // Validate output_type discriminator
    const outputType = obj.output_type;
    if (
      outputType !== 'loop3' &&
      outputType !== 'loop2' &&
      outputType !== 'product_owner'
    ) {
      errors.push({
        field: 'output_type',
        message:
          "output_type must be one of: 'loop3', 'loop2', 'product_owner'",
        path: '/output_type',
        code: 'INVALID_OUTPUT_TYPE',
        value: outputType,
      });
      return { valid: false, errors, warnings };
    }

    // Validate base fields common to all outputs
    this.validateBaseOutput(obj, errors);

    // Validate type-specific fields
    switch (outputType) {
      case 'loop3':
        this.validateLoop3Output(obj, errors, warnings);
        break;
      case 'loop2':
        this.validateLoop2Output(obj, errors, warnings);
        break;
      case 'product_owner':
        this.validateProductOwnerOutput(obj, errors, warnings);
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      output_type: outputType,
    };
  }

  /**
   * Validate JSON string
   */
  public validateJSON(jsonString: string): ValidationResult {
    try {
      const output = JSON.parse(jsonString);
      return this.validate(output);
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            field: 'json',
            message: `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
            path: 'root',
            code: 'JSON_PARSE_ERROR',
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * Validate base output fields (common to all types)
   */
  private validateBaseOutput(
    obj: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    // Validate success (required boolean)
    if (typeof obj.success !== 'boolean') {
      errors.push({
        field: 'success',
        message: 'success must be a boolean',
        path: '/success',
        code: 'INVALID_TYPE',
        value: obj.success,
      });
    }

    // Validate confidence (required number 0.0-1.0)
    if (typeof obj.confidence !== 'number') {
      errors.push({
        field: 'confidence',
        message: 'confidence must be a number',
        path: '/confidence',
        code: 'INVALID_TYPE',
        value: obj.confidence,
      });
    } else if (obj.confidence < 0.0 || obj.confidence > 1.0) {
      errors.push({
        field: 'confidence',
        message: 'confidence must be between 0.0 and 1.0',
        path: '/confidence',
        code: 'CONSTRAINT_VIOLATION',
        value: obj.confidence,
      });
    }

    // Validate iteration (required positive integer)
    if (typeof obj.iteration !== 'number') {
      errors.push({
        field: 'iteration',
        message: 'iteration must be a number',
        path: '/iteration',
        code: 'INVALID_TYPE',
        value: obj.iteration,
      });
    } else if (!Number.isInteger(obj.iteration) || obj.iteration < 1) {
      errors.push({
        field: 'iteration',
        message: 'iteration must be a positive integer',
        path: '/iteration',
        code: 'CONSTRAINT_VIOLATION',
        value: obj.iteration,
      });
    }

    // Validate errors (required array)
    if (!Array.isArray(obj.errors)) {
      errors.push({
        field: 'errors',
        message: 'errors must be an array',
        path: '/errors',
        code: 'INVALID_TYPE',
        value: obj.errors,
      });
    } else {
      for (let i = 0; i < obj.errors.length; i++) {
        this.validateError(obj.errors[i], i, errors);
      }
    }

    // Validate metadata (required object)
    if (typeof obj.metadata !== 'object' || obj.metadata === null) {
      errors.push({
        field: 'metadata',
        message: 'metadata must be an object',
        path: '/metadata',
        code: 'INVALID_TYPE',
        value: obj.metadata,
      });
    } else {
      this.validateMetadata(
        obj.metadata as Record<string, unknown>,
        errors
      );
    }
  }

  /**
   * Validate Loop 3 (Implementer) output
   */
  private validateLoop3Output(
    obj: Record<string, unknown>,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    // Validate deliverables (required array)
    if (!Array.isArray(obj.deliverables)) {
      errors.push({
        field: 'deliverables',
        message: 'deliverables must be an array',
        path: '/deliverables',
        code: 'INVALID_TYPE',
        value: obj.deliverables,
      });
    } else {
      for (let i = 0; i < obj.deliverables.length; i++) {
        this.validateDeliverable(obj.deliverables[i], i, errors);
      }

      if (obj.deliverables.length === 0) {
        warnings.push('Loop 3 output has no deliverables (empty array)');
      }
    }

    // Validate metrics (optional object)
    if (obj.metrics !== undefined) {
      if (typeof obj.metrics !== 'object' || obj.metrics === null) {
        errors.push({
          field: 'metrics',
          message: 'metrics must be an object',
          path: '/metrics',
          code: 'INVALID_TYPE',
          value: obj.metrics,
        });
      } else {
        this.validateMetrics(obj.metrics as Record<string, unknown>, errors);
      }
    }

    // Validate summary (optional string)
    if (obj.summary !== undefined && typeof obj.summary !== 'string') {
      errors.push({
        field: 'summary',
        message: 'summary must be a string',
        path: '/summary',
        code: 'INVALID_TYPE',
        value: obj.summary,
      });
    }
  }

  /**
   * Validate Loop 2 (Validator) output
   */
  private validateLoop2Output(
    obj: Record<string, unknown>,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    // Validate validation_type (required enum)
    const validationTypes: ValidationType[] = [
      'review',
      'test',
      'security',
      'architecture',
      'performance',
      'compliance',
    ];
    if (!validationTypes.includes(obj.validation_type as ValidationType)) {
      errors.push({
        field: 'validation_type',
        message: `validation_type must be one of: ${validationTypes.join(', ')}`,
        path: '/validation_type',
        code: 'INVALID_ENUM',
        value: obj.validation_type,
      });
    }

    // Validate issues (optional array, default to empty)
    if (obj.issues !== undefined) {
      if (!Array.isArray(obj.issues)) {
        errors.push({
          field: 'issues',
          message: 'issues must be an array',
          path: '/issues',
          code: 'INVALID_TYPE',
          value: obj.issues,
        });
      } else {
        for (let i = 0; i < obj.issues.length; i++) {
          this.validateIssue(obj.issues[i], i, errors);
        }
      }
    }

    // Validate recommendations (optional array, default to empty)
    if (obj.recommendations !== undefined) {
      if (!Array.isArray(obj.recommendations)) {
        errors.push({
          field: 'recommendations',
          message: 'recommendations must be an array',
          path: '/recommendations',
          code: 'INVALID_TYPE',
          value: obj.recommendations,
        });
      } else {
        for (let i = 0; i < obj.recommendations.length; i++) {
          if (typeof obj.recommendations[i] !== 'string') {
            errors.push({
              field: `recommendations[${i}]`,
              message: 'recommendation must be a string',
              path: `/recommendations/${i}`,
              code: 'INVALID_TYPE',
              value: obj.recommendations[i],
            });
          }
        }
      }
    }

    // Validate approved (required boolean)
    if (typeof obj.approved !== 'boolean') {
      errors.push({
        field: 'approved',
        message: 'approved must be a boolean',
        path: '/approved',
        code: 'INVALID_TYPE',
        value: obj.approved,
      });
    }

    // Validate summary (optional string)
    if (obj.summary !== undefined && typeof obj.summary !== 'string') {
      errors.push({
        field: 'summary',
        message: 'summary must be a string',
        path: '/summary',
        code: 'INVALID_TYPE',
        value: obj.summary,
      });
    }
  }

  /**
   * Validate Product Owner output
   */
  private validateProductOwnerOutput(
    obj: Record<string, unknown>,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    // Validate decision (required enum)
    const decisions: ProductOwnerDecision[] = [
      'PROCEED',
      'ITERATE',
      'ABORT',
    ];
    if (!decisions.includes(obj.decision as ProductOwnerDecision)) {
      errors.push({
        field: 'decision',
        message: `decision must be one of: ${decisions.join(', ')}`,
        path: '/decision',
        code: 'INVALID_ENUM',
        value: obj.decision,
      });
    }

    // Validate rationale (required non-empty string)
    if (typeof obj.rationale !== 'string') {
      errors.push({
        field: 'rationale',
        message: 'rationale must be a string',
        path: '/rationale',
        code: 'INVALID_TYPE',
        value: obj.rationale,
      });
    } else if ((obj.rationale as string).length === 0) {
      errors.push({
        field: 'rationale',
        message: 'rationale must be a non-empty string',
        path: '/rationale',
        code: 'CONSTRAINT_VIOLATION',
        value: obj.rationale,
      });
    }

    // Validate deliverables_validated (required boolean)
    if (typeof obj.deliverables_validated !== 'boolean') {
      errors.push({
        field: 'deliverables_validated',
        message: 'deliverables_validated must be a boolean',
        path: '/deliverables_validated',
        code: 'INVALID_TYPE',
        value: obj.deliverables_validated,
      });
    }

    // Validate next_action (required string)
    if (typeof obj.next_action !== 'string') {
      errors.push({
        field: 'next_action',
        message: 'next_action must be a string',
        path: '/next_action',
        code: 'INVALID_TYPE',
        value: obj.next_action,
      });
    }

    // Validate consensus_score (optional number 0.0-1.0)
    if (obj.consensus_score !== undefined) {
      if (typeof obj.consensus_score !== 'number') {
        errors.push({
          field: 'consensus_score',
          message: 'consensus_score must be a number',
          path: '/consensus_score',
          code: 'INVALID_TYPE',
          value: obj.consensus_score,
        });
      } else if (
        obj.consensus_score < 0.0 ||
        obj.consensus_score > 1.0
      ) {
        errors.push({
          field: 'consensus_score',
          message: 'consensus_score must be between 0.0 and 1.0',
          path: '/consensus_score',
          code: 'CONSTRAINT_VIOLATION',
          value: obj.consensus_score,
        });
      }
    }

    // Validate gate_score (optional number 0.0-1.0)
    if (obj.gate_score !== undefined) {
      if (typeof obj.gate_score !== 'number') {
        errors.push({
          field: 'gate_score',
          message: 'gate_score must be a number',
          path: '/gate_score',
          code: 'INVALID_TYPE',
          value: obj.gate_score,
        });
      } else if (obj.gate_score < 0.0 || obj.gate_score > 1.0) {
        errors.push({
          field: 'gate_score',
          message: 'gate_score must be between 0.0 and 1.0',
          path: '/gate_score',
          code: 'CONSTRAINT_VIOLATION',
          value: obj.gate_score,
        });
      }
    }
  }

  /**
   * Validate deliverable object
   */
  private validateDeliverable(
    deliverable: unknown,
    index: number,
    errors: ValidationError[]
  ): void {
    if (typeof deliverable !== 'object' || deliverable === null) {
      errors.push({
        field: `deliverables[${index}]`,
        message: 'deliverable must be an object',
        path: `/deliverables/${index}`,
        code: 'INVALID_TYPE',
        value: deliverable,
      });
      return;
    }

    const obj = deliverable as Record<string, unknown>;

    // Validate path (required non-empty string)
    if (typeof obj.path !== 'string' || obj.path.length === 0) {
      errors.push({
        field: `deliverables[${index}].path`,
        message: 'path must be a non-empty string',
        path: `/deliverables/${index}/path`,
        code: 'INVALID_TYPE',
        value: obj.path,
      });
    }

    // Validate type (required enum)
    const types: DeliverableType[] = [
      'implementation',
      'test',
      'documentation',
      'config',
      'schema',
      'script',
      'other',
    ];
    if (!types.includes(obj.type as DeliverableType)) {
      errors.push({
        field: `deliverables[${index}].type`,
        message: `type must be one of: ${types.join(', ')}`,
        path: `/deliverables/${index}/type`,
        code: 'INVALID_ENUM',
        value: obj.type,
      });
    }

    // Validate status (required enum)
    const statuses: DeliverableStatus[] = [
      'created',
      'modified',
      'deleted',
      'validated',
      'pending',
    ];
    if (!statuses.includes(obj.status as DeliverableStatus)) {
      errors.push({
        field: `deliverables[${index}].status`,
        message: `status must be one of: ${statuses.join(', ')}`,
        path: `/deliverables/${index}/status`,
        code: 'INVALID_ENUM',
        value: obj.status,
      });
    }

    // Validate optional fields
    if (
      obj.size_bytes !== undefined &&
      (typeof obj.size_bytes !== 'number' ||
        !Number.isInteger(obj.size_bytes) ||
        obj.size_bytes < 0)
    ) {
      errors.push({
        field: `deliverables[${index}].size_bytes`,
        message: 'size_bytes must be a non-negative integer',
        path: `/deliverables/${index}/size_bytes`,
        code: 'INVALID_TYPE',
        value: obj.size_bytes,
      });
    }

    if (
      obj.lines !== undefined &&
      (typeof obj.lines !== 'number' ||
        !Number.isInteger(obj.lines) ||
        obj.lines < 0)
    ) {
      errors.push({
        field: `deliverables[${index}].lines`,
        message: 'lines must be a non-negative integer',
        path: `/deliverables/${index}/lines`,
        code: 'INVALID_TYPE',
        value: obj.lines,
      });
    }

    if (obj.checksum !== undefined && typeof obj.checksum !== 'string') {
      errors.push({
        field: `deliverables[${index}].checksum`,
        message: 'checksum must be a string',
        path: `/deliverables/${index}/checksum`,
        code: 'INVALID_TYPE',
        value: obj.checksum,
      });
    }
  }

  /**
   * Validate issue object
   */
  private validateIssue(
    issue: unknown,
    index: number,
    errors: ValidationError[]
  ): void {
    if (typeof issue !== 'object' || issue === null) {
      errors.push({
        field: `issues[${index}]`,
        message: 'issue must be an object',
        path: `/issues/${index}`,
        code: 'INVALID_TYPE',
        value: issue,
      });
      return;
    }

    const obj = issue as Record<string, unknown>;

    // Validate severity (required enum)
    const severities: IssueSeverity[] = [
      'critical',
      'high',
      'medium',
      'low',
      'info',
    ];
    if (!severities.includes(obj.severity as IssueSeverity)) {
      errors.push({
        field: `issues[${index}].severity`,
        message: `severity must be one of: ${severities.join(', ')}`,
        path: `/issues/${index}/severity`,
        code: 'INVALID_ENUM',
        value: obj.severity,
      });
    }

    // Validate category (required enum)
    const categories: IssueCategory[] = [
      'security',
      'performance',
      'quality',
      'style',
      'documentation',
      'testing',
      'architecture',
      'other',
    ];
    if (!categories.includes(obj.category as IssueCategory)) {
      errors.push({
        field: `issues[${index}].category`,
        message: `category must be one of: ${categories.join(', ')}`,
        path: `/issues/${index}/category`,
        code: 'INVALID_ENUM',
        value: obj.category,
      });
    }

    // Validate message (required non-empty string)
    if (typeof obj.message !== 'string' || obj.message.length === 0) {
      errors.push({
        field: `issues[${index}].message`,
        message: 'message must be a non-empty string',
        path: `/issues/${index}/message`,
        code: 'INVALID_TYPE',
        value: obj.message,
      });
    }

    // Validate optional fields
    if (obj.location !== undefined && typeof obj.location !== 'string') {
      errors.push({
        field: `issues[${index}].location`,
        message: 'location must be a string',
        path: `/issues/${index}/location`,
        code: 'INVALID_TYPE',
        value: obj.location,
      });
    }

    if (
      obj.recommendation !== undefined &&
      typeof obj.recommendation !== 'string'
    ) {
      errors.push({
        field: `issues[${index}].recommendation`,
        message: 'recommendation must be a string',
        path: `/issues/${index}/recommendation`,
        code: 'INVALID_TYPE',
        value: obj.recommendation,
      });
    }

    if (obj.code !== undefined && typeof obj.code !== 'string') {
      errors.push({
        field: `issues[${index}].code`,
        message: 'code must be a string',
        path: `/issues/${index}/code`,
        code: 'INVALID_TYPE',
        value: obj.code,
      });
    }
  }

  /**
   * Validate metrics object
   */
  private validateMetrics(
    metrics: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    // All metrics fields are optional numbers
    const knownMetrics = [
      'files_created',
      'files_modified',
      'files_deleted',
      'lines_of_code',
      'test_coverage',
      'tests_passed',
      'tests_failed',
      'execution_time_ms',
      'memory_usage_mb',
    ];

    for (const key of knownMetrics) {
      if (metrics[key] !== undefined && typeof metrics[key] !== 'number') {
        errors.push({
          field: `metrics.${key}`,
          message: `${key} must be a number`,
          path: `/metrics/${key}`,
          code: 'INVALID_TYPE',
          value: metrics[key],
        });
      }
    }

    // Validate test_coverage range
    if (
      metrics.test_coverage !== undefined &&
      typeof metrics.test_coverage === 'number' &&
      (metrics.test_coverage < 0.0 || metrics.test_coverage > 1.0)
    ) {
      errors.push({
        field: 'metrics.test_coverage',
        message: 'test_coverage must be between 0.0 and 1.0',
        path: '/metrics/test_coverage',
        code: 'CONSTRAINT_VIOLATION',
        value: metrics.test_coverage,
      });
    }

    // Validate custom_metrics (if present)
    if (metrics.custom_metrics !== undefined) {
      if (
        typeof metrics.custom_metrics !== 'object' ||
        metrics.custom_metrics === null
      ) {
        errors.push({
          field: 'metrics.custom_metrics',
          message: 'custom_metrics must be an object',
          path: '/metrics/custom_metrics',
          code: 'INVALID_TYPE',
          value: metrics.custom_metrics,
        });
      } else {
        const customMetrics = metrics.custom_metrics as Record<string, unknown>;
        for (const [key, value] of Object.entries(customMetrics)) {
          if (typeof value !== 'number') {
            errors.push({
              field: `metrics.custom_metrics.${key}`,
              message: `custom_metrics.${key} must be a number`,
              path: `/metrics/custom_metrics/${key}`,
              code: 'INVALID_TYPE',
              value,
            });
          }
        }
      }
    }

    // Check for unknown fields (not in known metrics or custom_metrics)
    for (const key of Object.keys(metrics)) {
      if (key !== 'custom_metrics' && !knownMetrics.includes(key)) {
        errors.push({
          field: `metrics.${key}`,
          message: `Unknown metric field '${key}'. Use 'custom_metrics' for extensibility.`,
          path: `/metrics/${key}`,
          code: 'UNKNOWN_FIELD',
          value: metrics[key],
        });
      }
    }
  }

  /**
   * Validate error object
   */
  private validateError(
    error: unknown,
    index: number,
    errors: ValidationError[]
  ): void {
    if (typeof error !== 'object' || error === null) {
      errors.push({
        field: `errors[${index}]`,
        message: 'error must be an object',
        path: `/errors/${index}`,
        code: 'INVALID_TYPE',
        value: error,
      });
      return;
    }

    const obj = error as Record<string, unknown>;

    // Validate code (required string)
    if (typeof obj.code !== 'string') {
      errors.push({
        field: `errors[${index}].code`,
        message: 'code must be a string',
        path: `/errors/${index}/code`,
        code: 'INVALID_TYPE',
        value: obj.code,
      });
    }

    // Validate message (required non-empty string)
    if (typeof obj.message !== 'string' || obj.message.length === 0) {
      errors.push({
        field: `errors[${index}].message`,
        message: 'message must be a non-empty string',
        path: `/errors/${index}/message`,
        code: 'INVALID_TYPE',
        value: obj.message,
      });
    }

    // Validate optional fields
    if (obj.stack !== undefined && typeof obj.stack !== 'string') {
      errors.push({
        field: `errors[${index}].stack`,
        message: 'stack must be a string',
        path: `/errors/${index}/stack`,
        code: 'INVALID_TYPE',
        value: obj.stack,
      });
    }

    if (
      obj.context !== undefined &&
      (typeof obj.context !== 'object' || obj.context === null)
    ) {
      errors.push({
        field: `errors[${index}].context`,
        message: 'context must be an object',
        path: `/errors/${index}/context`,
        code: 'INVALID_TYPE',
        value: obj.context,
      });
    }
  }

  /**
   * Validate metadata object
   */
  private validateMetadata(
    metadata: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    // Validate agent_type (required string)
    if (typeof metadata.agent_type !== 'string') {
      errors.push({
        field: 'metadata.agent_type',
        message: 'agent_type must be a string',
        path: '/metadata/agent_type',
        code: 'INVALID_TYPE',
        value: metadata.agent_type,
      });
    }

    // Validate optional fields
    if (
      metadata.agent_id !== undefined &&
      typeof metadata.agent_id !== 'string'
    ) {
      errors.push({
        field: 'metadata.agent_id',
        message: 'agent_id must be a string',
        path: '/metadata/agent_id',
        code: 'INVALID_TYPE',
        value: metadata.agent_id,
      });
    }

    if (
      metadata.execution_time_ms !== undefined &&
      (typeof metadata.execution_time_ms !== 'number' ||
        !Number.isInteger(metadata.execution_time_ms) ||
        metadata.execution_time_ms < 0)
    ) {
      errors.push({
        field: 'metadata.execution_time_ms',
        message: 'execution_time_ms must be a non-negative integer',
        path: '/metadata/execution_time_ms',
        code: 'INVALID_TYPE',
        value: metadata.execution_time_ms,
      });
    }

    if (
      metadata.timestamp !== undefined &&
      typeof metadata.timestamp !== 'string'
    ) {
      errors.push({
        field: 'metadata.timestamp',
        message: 'timestamp must be a string (ISO 8601 format)',
        path: '/metadata/timestamp',
        code: 'INVALID_TYPE',
        value: metadata.timestamp,
      });
    }

    if (
      metadata.swarm_id !== undefined &&
      typeof metadata.swarm_id !== 'string'
    ) {
      errors.push({
        field: 'metadata.swarm_id',
        message: 'swarm_id must be a string',
        path: '/metadata/swarm_id',
        code: 'INVALID_TYPE',
        value: metadata.swarm_id,
      });
    }

    if (
      metadata.iteration !== undefined &&
      (typeof metadata.iteration !== 'number' ||
        !Number.isInteger(metadata.iteration) ||
        metadata.iteration < 1)
    ) {
      errors.push({
        field: 'metadata.iteration',
        message: 'iteration must be a positive integer',
        path: '/metadata/iteration',
        code: 'INVALID_TYPE',
        value: metadata.iteration,
      });
    }

    if (metadata.mode !== undefined) {
      const modes: CFNLoopMode[] = ['mvp', 'standard', 'enterprise'];
      if (!modes.includes(metadata.mode as CFNLoopMode)) {
        errors.push({
          field: 'metadata.mode',
          message: `mode must be one of: ${modes.join(', ')}`,
          path: '/metadata/mode',
          code: 'INVALID_ENUM',
          value: metadata.mode,
        });
      }
    }

    if (
      metadata.context !== undefined &&
      (typeof metadata.context !== 'object' || metadata.context === null)
    ) {
      errors.push({
        field: 'metadata.context',
        message: 'context must be an object',
        path: '/metadata/context',
        code: 'INVALID_TYPE',
        value: metadata.context,
      });
    }
  }

  /**
   * Format validation errors for display
   */
  public formatErrors(result: ValidationResult): string {
    if (result.valid) {
      return 'Agent output is valid.';
    }

    let output = `Validation failed with ${result.errors.length} error(s):\n\n`;

    for (const error of result.errors) {
      output += `[${error.code}] ${error.field}\n`;
      output += `  ${error.message}\n`;
      if (error.value !== undefined) {
        // Use sanitizeValue to prevent sensitive data leakage
        output += `  Current value: ${sanitizeValue(error.value, error.field)}\n`;
      }
      output += '\n';
    }

    if (result.warnings.length > 0) {
      output += `\nWarnings (${result.warnings.length}):\n`;
      for (const warning of result.warnings) {
        output += `  - ${warning}\n`;
      }
    }

    return output;
  }
}

// ============================================================================
// Singleton Instance and Convenience Functions
// ============================================================================

let validatorInstance: AgentOutputValidator | null = null;

/**
 * Get or create validator instance
 */
export function getValidator(): AgentOutputValidator {
  if (!validatorInstance) {
    validatorInstance = new AgentOutputValidator();
  }
  return validatorInstance;
}

/**
 * Validate agent output object
 */
export function validateAgentOutput(output: unknown): ValidationResult {
  return getValidator().validate(output);
}

/**
 * Validate JSON string
 */
export function validateJSON(jsonString: string): ValidationResult {
  return getValidator().validateJSON(jsonString);
}

/**
 * Validate Loop 3 output
 */
export function validateLoop3Output(output: unknown): ValidationResult {
  const result = getValidator().validate(output);
  if (result.valid && result.output_type !== 'loop3') {
    return {
      valid: false,
      errors: [
        {
          field: 'output_type',
          message: "Expected output_type 'loop3'",
          path: '/output_type',
          code: 'INVALID_OUTPUT_TYPE',
          value: result.output_type,
        },
      ],
      warnings: [],
    };
  }
  return result;
}

/**
 * Validate Loop 2 output
 */
export function validateLoop2Output(output: unknown): ValidationResult {
  const result = getValidator().validate(output);
  if (result.valid && result.output_type !== 'loop2') {
    return {
      valid: false,
      errors: [
        {
          field: 'output_type',
          message: "Expected output_type 'loop2'",
          path: '/output_type',
          code: 'INVALID_OUTPUT_TYPE',
          value: result.output_type,
        },
      ],
      warnings: [],
    };
  }
  return result;
}

/**
 * Validate Product Owner output
 */
export function validateProductOwnerOutput(output: unknown): ValidationResult {
  const result = getValidator().validate(output);
  if (result.valid && result.output_type !== 'product_owner') {
    return {
      valid: false,
      errors: [
        {
          field: 'output_type',
          message: "Expected output_type 'product_owner'",
          path: '/output_type',
          code: 'INVALID_OUTPUT_TYPE',
          value: result.output_type,
        },
      ],
      warnings: [],
    };
  }
  return result;
}

/**
 * Check if output is valid (boolean shortcut)
 */
export function isValidOutput(output: unknown): boolean {
  return getValidator().validate(output).valid;
}

/**
 * Reset validator instance (useful for testing)
 */
export function resetValidator(): void {
  validatorInstance = null;
}

export default AgentOutputValidator;
