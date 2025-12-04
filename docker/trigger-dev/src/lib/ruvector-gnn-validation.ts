/**
 * RuVector GNN Input Validation and Sanitization Layer
 *
 * Provides comprehensive input validation, sanitization, and traversal guards
 * to address CVSS 6.5-7.5 vulnerabilities:
 * - Missing Input Sanitization (CVSS 6.5)
 * - Uncontrolled Recursion in Graph Traversal (CVSS 7.5)
 *
 * Integration Points:
 * - All node ID inputs (error causality, file paths)
 * - All graph traversal operations (BFS, DFS)
 * - All external input sources (graph construction, edge validation)
 *
 * Reference: GNN Security Audit - Loop 2 Findings (2025-12-03)
 */

// =============================================
// Type Definitions
// =============================================

/**
 * Result of input validation
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: any;
}

/**
 * Configuration for traversal guards
 */
export interface TraversalConfig {
  maxIterations?: number;
  maxDepth?: number;
  timeoutMs?: number;
  maxQueueSize?: number;
}

/**
 * Sanitization options
 */
export interface SanitizationOptions {
  allowUnderscore?: boolean;
  allowHyphen?: boolean;
  allowDot?: boolean;
  customPattern?: RegExp;
}

// =============================================
// Constants - Security Thresholds
// =============================================

const CONSTANTS = {
  // Input size limits
  MAX_NODE_ID_LENGTH: 256,
  MAX_ERROR_MESSAGE_LENGTH: 4096,
  MAX_FILE_PATH_LENGTH: 512,
  MAX_COLLECTION_QUERY_SIZE: 100000,

  // Traversal limits (CVSS 7.5 mitigation)
  MAX_BFS_ITERATIONS: 10000,
  MAX_DFS_DEPTH: 100,
  MAX_QUEUE_SIZE: 50000,
  MAX_TRAVERSAL_TIME_MS: 30000,

  // Dangerous character patterns for sanitization
  DANGEROUS_PATTERNS: [
    /<|>/g, // HTML tags
    /["']/g, // Quotes
    /&/g, // HTML entity
    /;/g, // SQL injection
    /\x00/g, // Null bytes
    /\\/g, // Backslashes (file path traversal)
    /\//g, // Forward slashes (directory traversal, URL injection)
    /\(|\)/g, // Parentheses (command injection)
    /\$|`/g, // Template injection and command substitution
  ],

  // Allowed patterns for node IDs
  ALPHANUMERIC_PATTERN: /^[a-zA-Z0-9_-]+$/,
  NODE_ID_PATTERN: /^[a-zA-Z0-9._-]+$/,
  FILE_PATH_PATTERN: /^[a-zA-Z0-9._\-/\\:]+$/,
};

// =============================================
// Input Validation Class
// =============================================

/**
 * Validates and sanitizes all GNN input data
 */
export class GNNInputValidator {
  /**
   * Validate a node identifier (error ID, file path, etc.)
   *
   * Checks:
   * - Type must be string
   * - Length 1-256 characters
   * - Matches alphanumeric + safe characters (after sanitization)
   * - No dangerous patterns (sanitized)
   *
   * Security Flow: Type → Length → Sanitize → Pattern → Verify non-empty
   *
   * @param id - Node ID to validate
   * @param options - Sanitization options
   * @returns ValidationResult with sanitized ID if valid
   */
  static validateNodeId(
    id: unknown,
    options: SanitizationOptions = {}
  ): ValidationResult {
    // Type check
    if (typeof id !== 'string') {
      return {
        valid: false,
        error: `Node ID must be string, got ${typeof id}`,
      };
    }

    // Length check (before sanitization)
    if (id.length === 0) {
      return {
        valid: false,
        error: 'Node ID must be non-empty string',
      };
    }

    if (id.length > CONSTANTS.MAX_NODE_ID_LENGTH) {
      return {
        valid: false,
        error: `Node ID exceeds max length (${CONSTANTS.MAX_NODE_ID_LENGTH}), got ${id.length}`,
      };
    }

    // Sanitization: Remove dangerous characters FIRST (CVSS 6.5 mitigation)
    let sanitized = id;
    for (const dangerousPattern of CONSTANTS.DANGEROUS_PATTERNS) {
      sanitized = sanitized.replace(dangerousPattern, '');
    }

    // Ensure sanitization didn't empty the ID
    if (sanitized.length === 0) {
      return {
        valid: false,
        error: 'Node ID became empty after sanitization',
      };
    }

    // Pattern validation AFTER sanitization
    const pattern = options.customPattern || CONSTANTS.NODE_ID_PATTERN;
    if (!pattern.test(sanitized)) {
      return {
        valid: false,
        error: `Node ID contains invalid characters after sanitization: ${sanitized}`,
      };
    }

    return {
      valid: true,
      sanitized,
    };
  }

  /**
   * Validate hop count for graph traversal
   *
   * Checks:
   * - Must be integer
   * - Range 1-3 (configurable max)
   *
   * @param hops - Hop count to validate
   * @param maxHops - Maximum allowed hops (default: 3)
   * @returns ValidationResult
   */
  static validateHopCount(
    hops: unknown,
    maxHops: number = 3
  ): ValidationResult {
    // Type and integer check
    if (typeof hops !== 'number' || !Number.isInteger(hops)) {
      return {
        valid: false,
        error: `Hops must be integer, got ${typeof hops}`,
      };
    }

    // Range check
    if (hops < 1 || hops > maxHops) {
      return {
        valid: false,
        error: `Hops must be 1-${maxHops}, got ${hops}`,
      };
    }

    return {
      valid: true,
      sanitized: hops,
    };
  }

  /**
   * Validate graph size (number of nodes/edges)
   *
   * Checks:
   * - Must be non-negative integer
   * - Range 0-100000
   *
   * @param size - Graph size to validate
   * @param maxSize - Maximum allowed size (default: 100000)
   * @returns ValidationResult
   */
  static validateGraphSize(
    size: unknown,
    maxSize: number = CONSTANTS.MAX_COLLECTION_QUERY_SIZE
  ): ValidationResult {
    // Type and integer check
    if (typeof size !== 'number' || !Number.isInteger(size)) {
      return {
        valid: false,
        error: `Graph size must be integer, got ${typeof size}`,
      };
    }

    // Range check
    if (size < 0) {
      return {
        valid: false,
        error: 'Graph size must be non-negative',
      };
    }

    if (size > maxSize) {
      return {
        valid: false,
        error: `Graph size exceeds max (${maxSize}), got ${size}`,
      };
    }

    return {
      valid: true,
      sanitized: size,
    };
  }

  /**
   * Validate confidence score
   *
   * Checks:
   * - Must be number
   * - Range 0.0-1.0
   * - Not NaN or Infinity
   *
   * @param confidence - Confidence score to validate
   * @returns ValidationResult
   */
  static validateConfidence(confidence: unknown): ValidationResult {
    if (typeof confidence !== 'number') {
      return {
        valid: false,
        error: `Confidence must be number, got ${typeof confidence}`,
      };
    }

    if (!Number.isFinite(confidence)) {
      return {
        valid: false,
        error: `Confidence must be finite, got ${confidence}`,
      };
    }

    if (confidence < 0 || confidence > 1) {
      return {
        valid: false,
        error: `Confidence must be 0.0-1.0, got ${confidence}`,
      };
    }

    return {
      valid: true,
      sanitized: confidence,
    };
  }

  /**
   * Validate error message
   *
   * Checks:
   * - Must be string
   * - Length 1-4096
   * - No dangerous patterns (sanitized)
   *
   * Security Flow: Type → Length → Sanitize dangerous patterns
   *
   * @param message - Error message to validate
   * @returns ValidationResult with sanitized message
   */
  static validateErrorMessage(message: unknown): ValidationResult {
    if (typeof message !== 'string') {
      return {
        valid: false,
        error: `Error message must be string, got ${typeof message}`,
      };
    }

    if (message.length === 0) {
      return {
        valid: false,
        error: 'Error message must not be empty',
      };
    }

    if (message.length > CONSTANTS.MAX_ERROR_MESSAGE_LENGTH) {
      return {
        valid: false,
        error: `Error message exceeds max length (${CONSTANTS.MAX_ERROR_MESSAGE_LENGTH})`,
      };
    }

    // Sanitize: Remove dangerous patterns (CVSS 6.5 mitigation)
    let sanitized = message;
    for (const dangerousPattern of CONSTANTS.DANGEROUS_PATTERNS) {
      sanitized = sanitized.replace(dangerousPattern, '');
    }

    return {
      valid: true,
      sanitized,
    };
  }

  /**
   * Validate file path
   *
   * Checks:
   * - Must be string
   * - Length 1-512
   * - Valid path characters
   * - No path traversal attempts
   *
   * @param filePath - File path to validate
   * @returns ValidationResult with sanitized path
   */
  static validateFilePath(filePath: unknown): ValidationResult {
    if (typeof filePath !== 'string') {
      return {
        valid: false,
        error: `File path must be string, got ${typeof filePath}`,
      };
    }

    if (filePath.length === 0) {
      return {
        valid: false,
        error: 'File path must not be empty',
      };
    }

    if (filePath.length > CONSTANTS.MAX_FILE_PATH_LENGTH) {
      return {
        valid: false,
        error: `File path exceeds max length (${CONSTANTS.MAX_FILE_PATH_LENGTH})`,
      };
    }

    // Check for path traversal attempts
    if (filePath.includes('..')) {
      return {
        valid: false,
        error: 'File path contains path traversal attempt (..)',
      };
    }

    // Validate characters
    if (!CONSTANTS.FILE_PATH_PATTERN.test(filePath)) {
      return {
        valid: false,
        error: `File path contains invalid characters: ${filePath}`,
      };
    }

    return {
      valid: true,
      sanitized: filePath,
    };
  }

  /**
   * Validate array of node IDs
   *
   * @param ids - Array of node IDs to validate
   * @param maxCount - Maximum number of IDs (default: 1000)
   * @returns ValidationResult with array of sanitized IDs
   */
  static validateNodeIdArray(
    ids: unknown,
    maxCount: number = 1000
  ): ValidationResult {
    if (!Array.isArray(ids)) {
      return {
        valid: false,
        error: `Node ID array must be array, got ${typeof ids}`,
      };
    }

    if (ids.length === 0) {
      return {
        valid: false,
        error: 'Node ID array must not be empty',
      };
    }

    if (ids.length > maxCount) {
      return {
        valid: false,
        error: `Node ID array exceeds max count (${maxCount}), got ${ids.length}`,
      };
    }

    const sanitized: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const result = this.validateNodeId(ids[i]);
      if (!result.valid) {
        return {
          valid: false,
          error: `Node ID at index ${i} invalid: ${result.error}`,
        };
      }
      sanitized.push(result.sanitized);
    }

    return {
      valid: true,
      sanitized,
    };
  }
}

// =============================================
// Traversal Guard Class (CVSS 7.5 mitigation)
// =============================================

/**
 * Guards against unbounded recursion and DoS attacks in graph traversal
 *
 * Tracks:
 * - Iteration count (prevents infinite loops)
 * - Current depth (prevents stack overflow)
 * - Queue size (prevents memory exhaustion)
 * - Elapsed time (prevents timeout)
 *
 * Usage:
 * ```typescript
 * const guard = new TraversalGuard({ maxIterations: 10000, maxDepth: 100 });
 *
 * while (queue.length > 0) {
 *   guard.checkIteration(); // Throws if limit exceeded
 *   // ... process queue
 * }
 * ```
 */
export class TraversalGuard {
  private maxIterations: number;
  private maxDepth: number;
  private maxQueueSize: number;
  private timeoutMs: number;

  private iterations: number = 0;
  private currentDepth: number = 0;
  private startTime: number;

  /**
   * Create a new traversal guard
   *
   * @param config - Guard configuration
   */
  constructor(config: TraversalConfig = {}) {
    this.maxIterations = config.maxIterations ?? CONSTANTS.MAX_BFS_ITERATIONS;
    this.maxDepth = config.maxDepth ?? CONSTANTS.MAX_DFS_DEPTH;
    this.maxQueueSize = config.maxQueueSize ?? CONSTANTS.MAX_QUEUE_SIZE;
    this.timeoutMs = config.timeoutMs ?? CONSTANTS.MAX_TRAVERSAL_TIME_MS;
    this.startTime = Date.now();
  }

  /**
   * Check if next iteration is allowed
   *
   * Throws if any limit is exceeded:
   * - Max iterations
   * - Max depth
   * - Max timeout
   *
   * Call at the start of each loop iteration.
   *
   * @throws Error if any traversal limit is exceeded
   */
  checkIteration(): void {
    this.iterations++;

    // Check iteration limit
    if (this.iterations > this.maxIterations) {
      throw new Error(
        `Traversal exceeded max iterations (${this.maxIterations}). ` +
        `This prevents DoS attacks via unbounded graph traversal.`
      );
    }

    // Check timeout
    const elapsed = Date.now() - this.startTime;
    if (elapsed > this.timeoutMs) {
      throw new Error(
        `Traversal exceeded max timeout (${this.timeoutMs}ms). ` +
        `Elapsed: ${elapsed}ms. This prevents infinite loops.`
      );
    }
  }

  /**
   * Track entering a new depth level (for DFS)
   *
   * @throws Error if max depth exceeded
   */
  enterDepth(): void {
    this.currentDepth++;
    if (this.currentDepth > this.maxDepth) {
      throw new Error(
        `Traversal exceeded max depth (${this.maxDepth}). ` +
        `This prevents stack overflow attacks.`
      );
    }
  }

  /**
   * Track exiting depth level (for DFS)
   */
  exitDepth(): void {
    this.currentDepth--;
  }

  /**
   * Check queue size before adding items
   *
   * @param currentSize - Current queue size
   * @throws Error if queue would exceed max size
   */
  checkQueueSize(currentSize: number): void {
    if (currentSize >= this.maxQueueSize) {
      throw new Error(
        `Queue exceeded max size (${this.maxQueueSize}). ` +
        `This prevents memory exhaustion attacks.`
      );
    }
  }

  /**
   * Reset guard state (for reuse)
   */
  reset(): void {
    this.iterations = 0;
    this.currentDepth = 0;
    this.startTime = Date.now();
  }

  /**
   * Get current statistics
   */
  getStats(): {
    iterations: number;
    currentDepth: number;
    elapsedMs: number;
    depthUtilization: number;
    iterationUtilization: number;
  } {
    const elapsed = Date.now() - this.startTime;
    return {
      iterations: this.iterations,
      currentDepth: this.currentDepth,
      elapsedMs: elapsed,
      depthUtilization: this.currentDepth / this.maxDepth,
      iterationUtilization: this.iterations / this.maxIterations,
    };
  }
}

// =============================================
// Edge Validation
// =============================================

/**
 * Validates graph edges for consistency and safety
 */
export class EdgeValidator {
  /**
   * Validate an edge configuration
   *
   * Checks:
   * - Source and target node IDs are valid
   * - Confidence in valid range
   * - Edge type is one of allowed types
   *
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @param confidence - Edge confidence (0-1)
   * @param edgeType - Type of edge (causedBy, causes, imports, etc.)
   * @param allowedTypes - Allowed edge types
   * @returns ValidationResult
   */
  static validateEdge(
    sourceId: unknown,
    targetId: unknown,
    confidence: unknown,
    edgeType: unknown,
    allowedTypes: string[] = ['causedBy', 'causes', 'imports', 'imported_by', 'related']
  ): ValidationResult {
    // Validate source
    const sourceValidation = GNNInputValidator.validateNodeId(sourceId);
    if (!sourceValidation.valid) {
      return {
        valid: false,
        error: `Invalid source ID: ${sourceValidation.error}`,
      };
    }

    // Validate target
    const targetValidation = GNNInputValidator.validateNodeId(targetId);
    if (!targetValidation.valid) {
      return {
        valid: false,
        error: `Invalid target ID: ${targetValidation.error}`,
      };
    }

    // Validate confidence
    const confValidation = GNNInputValidator.validateConfidence(confidence);
    if (!confValidation.valid) {
      return {
        valid: false,
        error: `Invalid confidence: ${confValidation.error}`,
      };
    }

    // Validate edge type
    if (typeof edgeType !== 'string' || !allowedTypes.includes(edgeType)) {
      return {
        valid: false,
        error: `Invalid edge type "${edgeType}". Must be one of: ${allowedTypes.join(', ')}`,
      };
    }

    // Prevent self-loops
    if (sourceValidation.sanitized === targetValidation.sanitized) {
      return {
        valid: false,
        error: 'Self-loops are not allowed in security-critical graphs',
      };
    }

    return {
      valid: true,
      sanitized: {
        sourceId: sourceValidation.sanitized,
        targetId: targetValidation.sanitized,
        confidence: confValidation.sanitized,
        edgeType,
      },
    };
  }
}

// =============================================
// Batch Validation
// =============================================

/**
 * Validates batches of input data for bulk operations
 */
export class BatchValidator {
  /**
   * Validate a batch of graph operations
   *
   * @param operations - Array of operations to validate
   * @param maxBatchSize - Maximum batch size (default: 1000)
   * @returns ValidationResult with sanitized operations or error
   */
  static validateOperationBatch(
    operations: unknown[],
    maxBatchSize: number = 1000
  ): ValidationResult {
    if (!Array.isArray(operations)) {
      return {
        valid: false,
        error: 'Operations must be array',
      };
    }

    if (operations.length === 0) {
      return {
        valid: false,
        error: 'Batch must contain at least one operation',
      };
    }

    if (operations.length > maxBatchSize) {
      return {
        valid: false,
        error: `Batch exceeds max size (${maxBatchSize}), got ${operations.length}`,
      };
    }

    return {
      valid: true,
      sanitized: operations,
    };
  }
}

// =============================================
// Export
// =============================================

export {
  GNNInputValidator,
  TraversalGuard,
  EdgeValidator,
  BatchValidator,
  CONSTANTS,
  ValidationResult,
  TraversalConfig,
  SanitizationOptions,
};
