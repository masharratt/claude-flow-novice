/**
 * Namespace Sanitizer - Memory Namespace Path Sanitization
 *
 * Prevents namespace collisions and injection attacks through:
 * - Character whitelisting (alphanumeric, dash, underscore only)
 * - Path component validation and length limits
 * - Deterministic ID generation with SHA-256 hashing
 * - Structured namespace building with validation at each level
 *
 * Security Features:
 * - Prevents directory traversal attacks (../, ./, etc.)
 * - Blocks path injection via special characters
 * - Enforces consistent namespace structure
 * - Validates namespace component format
 * - Limits namespace depth and component length
 *
 * Usage:
 * ```typescript
 * // Sanitize user input IDs
 * const safeEpicId = NamespaceSanitizer.sanitizeId('my-epic!@#');
 * // Result: 'my-epic'
 *
 * // Generate unique deterministic IDs
 * const uniqueId = NamespaceSanitizer.generateUniqueId('sprint', 'user-input-seed');
 * // Result: 'sprint-a1b2c3d4e5f6g7h8'
 *
 * // Build validated namespace paths
 * const namespace = NamespaceSanitizer.buildNamespace('epic-1', 'phase-1', 'sprint-1');
 * // Result: 'cfn-loop/epic-1/phase-1/sprint-1'
 * ```
 *
 * @module utils/namespace-sanitizer
 */

import crypto from 'crypto';

// ===== TYPE DEFINITIONS =====

/**
 * Namespace component types for validation
 */
export enum NamespaceComponentType {
  EPIC = 'epic',
  PHASE = 'phase',
  SPRINT = 'sprint',
  AGENT = 'agent',
  ITERATION = 'iteration',
}

/**
 * Namespace validation result
 */
export interface NamespaceValidationResult {
  /** Validation passed */
  valid: boolean;
  /** Sanitized namespace path */
  sanitizedPath: string;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Original namespace path */
  originalPath: string;
}

/**
 * Namespace sanitization options
 */
export interface SanitizationOptions {
  /** Maximum length for ID components (default: 64) */
  maxIdLength?: number;
  /** Maximum namespace depth (default: 10) */
  maxDepth?: number;
  /** Allow uppercase letters (default: true) */
  allowUppercase?: boolean;
  /** Replace invalid characters instead of removing (default: true) */
  replaceInvalid?: boolean;
  /** Replacement character for invalid chars (default: '-') */
  replacementChar?: string;
}

/**
 * Namespace building options
 */
export interface NamespaceBuildOptions {
  /** Include agent ID in namespace */
  includeAgent?: boolean;
  /** Include iteration number in namespace */
  includeIteration?: boolean;
  /** Custom prefix (default: 'cfn-loop') */
  prefix?: string;
  /** Sanitization options */
  sanitization?: SanitizationOptions;
}

// ===== CONSTANTS =====

/**
 * Default sanitization options
 */
const DEFAULT_SANITIZATION_OPTIONS: Required<SanitizationOptions> = {
  maxIdLength: 64,
  maxDepth: 10,
  allowUppercase: true,
  replaceInvalid: true,
  replacementChar: '-',
};

/**
 * Allowed characters regex pattern
 * - Alphanumeric: a-z, A-Z, 0-9
 * - Separators: dash (-), underscore (_)
 */
const ALLOWED_CHARS_PATTERN = /^[a-zA-Z0-9\-_]+$/;

/**
 * Dangerous patterns to detect and block
 */
const DANGEROUS_PATTERNS = [
  /\.\./,        // Directory traversal
  /^\./,         // Hidden files/relative paths
  /\/{2,}/,      // Multiple slashes
  /\\+/,         // Backslashes (Windows paths)
  /[<>"|?*]/,    // Shell/filesystem special chars
  /[\x00-\x1f\x7f]/, // Control characters including null byte
  /\s{2,}/,      // Multiple consecutive spaces
];

/**
 * Reserved namespace component names (prevent conflicts)
 */
const RESERVED_NAMES = new Set([
  'admin',
  'system',
  'root',
  'null',
  'undefined',
  'config',
  'internal',
  'private',
  'public',
  'test',
  '__proto__',
  'constructor',
  'prototype',
]);

// ===== NAMESPACE SANITIZER CLASS =====

/**
 * Namespace Sanitizer - Validates and sanitizes memory namespace paths
 */
export class NamespaceSanitizer {
  /**
   * Sanitize an ID component
   *
   * Removes/replaces invalid characters and enforces length limits.
   *
   * @param id - Raw ID string to sanitize
   * @param options - Sanitization options
   * @returns Sanitized ID safe for namespace use
   * @throws Error if ID is empty after sanitization or contains only invalid chars
   */
  static sanitizeId(
    id: string,
    options: SanitizationOptions = {}
  ): string {
    const opts = { ...DEFAULT_SANITIZATION_OPTIONS, ...options };

    // Normalize input
    let sanitized = id.trim();

    // Check against dangerous patterns BEFORE sanitization
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(sanitized)) {
        throw new Error(`ID contains dangerous pattern: '${id}'`);
      }
    }

    // Convert to lowercase if uppercase not allowed
    if (!opts.allowUppercase) {
      sanitized = sanitized.toLowerCase();
    }

    // Replace or remove invalid characters
    if (opts.replaceInvalid) {
      // Replace runs of invalid chars with single replacement char
      sanitized = sanitized.replace(/[^a-zA-Z0-9\-_]+/g, opts.replacementChar);
      // Remove leading/trailing replacement chars
      sanitized = sanitized.replace(new RegExp(`^${opts.replacementChar}+|${opts.replacementChar}+$`, 'g'), '');
      // Collapse multiple consecutive replacement chars
      sanitized = sanitized.replace(new RegExp(`${opts.replacementChar}{2,}`, 'g'), opts.replacementChar);
    } else {
      // Remove all invalid characters
      sanitized = sanitized.replace(/[^a-zA-Z0-9\-_]/g, '');
    }

    // Validate format after sanitization
    if (!sanitized || sanitized.length === 0) {
      throw new Error(`Invalid ID format: '${id}' produced empty result after sanitization`);
    }

    // Check reserved names
    if (RESERVED_NAMES.has(sanitized.toLowerCase())) {
      throw new Error(`ID uses reserved name: '${id}'`);
    }

    // Validate final format
    if (!ALLOWED_CHARS_PATTERN.test(sanitized)) {
      throw new Error(`ID contains invalid characters after sanitization: '${sanitized}'`);
    }

    // Limit length (preserve start for readability)
    if (sanitized.length > opts.maxIdLength) {
      sanitized = sanitized.substring(0, opts.maxIdLength);
      // Remove trailing separators after truncation
      sanitized = sanitized.replace(/[\-_]+$/, '');
    }

    return sanitized;
  }

  /**
   * Generate unique deterministic ID with hash
   *
   * Creates a collision-resistant ID by combining a prefix with a SHA-256 hash
   * of the seed value. Useful for generating IDs from user input while ensuring
   * uniqueness and preventing namespace collisions.
   *
   * @param prefix - ID prefix (will be sanitized)
   * @param seed - Seed value for hash generation (ensures deterministic uniqueness)
   * @param options - Sanitization options
   * @returns Unique ID in format: {sanitized-prefix}-{hash-16-chars}
   */
  static generateUniqueId(
    prefix: string,
    seed: string,
    options: SanitizationOptions = {}
  ): string {
    // Sanitize prefix
    const sanitizedPrefix = this.sanitizeId(prefix, options);

    // Generate deterministic hash from seed
    const hash = crypto
      .createHash('sha256')
      .update(seed)
      .digest('hex')
      .substring(0, 16); // 16 hex chars = 64 bits of entropy

    // Combine prefix and hash
    return `${sanitizedPrefix}-${hash}`;
  }

  /**
   * Build structured namespace path
   *
   * Constructs a validated namespace path with standardized format:
   * cfn-loop/{epic-id}/phase-{phase-id}/sprint-{sprint-id}[/agent-{agent-id}][/iteration-{n}]
   *
   * All components are sanitized and validated before assembly.
   *
   * @param epicId - Epic identifier
   * @param phaseId - Phase identifier
   * @param sprintId - Sprint identifier
   * @param agentId - Optional agent identifier
   * @param iterationNum - Optional iteration number
   * @param options - Namespace building options
   * @returns Validated namespace path
   * @throws Error if any component is invalid or depth exceeds limit
   */
  static buildNamespace(
    epicId: string,
    phaseId: string,
    sprintId: string,
    agentId?: string,
    iterationNum?: number,
    options: NamespaceBuildOptions = {}
  ): string {
    const opts = {
      includeAgent: options.includeAgent ?? (agentId !== undefined),
      includeIteration: options.includeIteration ?? (iterationNum !== undefined),
      prefix: options.prefix ?? 'cfn-loop',
      sanitization: options.sanitization ?? {},
    };

    // Build path components
    const components: string[] = [
      this.sanitizeId(opts.prefix, opts.sanitization),
      this.sanitizeId(epicId, opts.sanitization),
      `phase-${this.sanitizeId(phaseId, opts.sanitization)}`,
      `sprint-${this.sanitizeId(sprintId, opts.sanitization)}`,
    ];

    // Add optional agent component
    if (agentId && opts.includeAgent) {
      components.push(`agent-${this.sanitizeId(agentId, opts.sanitization)}`);
    }

    // Add optional iteration component
    if (iterationNum !== undefined && opts.includeIteration) {
      if (iterationNum < 0) {
        throw new Error(`Invalid iteration number: ${iterationNum} (must be >= 0)`);
      }
      components.push(`iteration-${iterationNum}`);
    }

    // Validate depth
    const maxDepth = opts.sanitization?.maxDepth ?? DEFAULT_SANITIZATION_OPTIONS.maxDepth;
    if (components.length > maxDepth) {
      throw new Error(`Namespace depth ${components.length} exceeds maximum ${maxDepth}`);
    }

    // Join components with forward slash
    const namespace = components.join('/');

    // Final validation
    this.validateNamespacePath(namespace);

    return namespace;
  }

  /**
   * Validate namespace path structure
   *
   * Performs comprehensive validation:
   * - Component count and depth
   * - Character whitelist compliance
   * - Dangerous pattern detection
   * - Structural integrity
   *
   * @param namespacePath - Full namespace path to validate
   * @returns Validation result with errors/warnings
   */
  static validateNamespacePath(
    namespacePath: string,
    options: SanitizationOptions = {}
  ): NamespaceValidationResult {
    const opts = { ...DEFAULT_SANITIZATION_OPTIONS, ...options };
    const result: NamespaceValidationResult = {
      valid: true,
      sanitizedPath: namespacePath,
      errors: [],
      warnings: [],
      originalPath: namespacePath,
    };

    // Check empty path
    if (!namespacePath || namespacePath.trim().length === 0) {
      result.valid = false;
      result.errors.push('Namespace path is empty');
      return result;
    }

    // Split into components
    const components = namespacePath.split('/').filter(c => c.length > 0);

    // Validate depth
    if (components.length === 0) {
      result.valid = false;
      result.errors.push('Namespace contains no valid components');
      return result;
    }

    if (components.length > opts.maxDepth) {
      result.valid = false;
      result.errors.push(`Namespace depth ${components.length} exceeds maximum ${opts.maxDepth}`);
    }

    // Validate each component
    for (let i = 0; i < components.length; i++) {
      const component = components[i];

      // Check length
      if (component.length > opts.maxIdLength) {
        result.valid = false;
        result.errors.push(`Component '${component}' exceeds maximum length ${opts.maxIdLength}`);
      }

      // Check character whitelist
      if (!ALLOWED_CHARS_PATTERN.test(component)) {
        result.valid = false;
        result.errors.push(`Component '${component}' contains invalid characters`);
      }

      // Check dangerous patterns
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(component)) {
          result.valid = false;
          result.errors.push(`Component '${component}' contains dangerous pattern`);
        }
      }

      // Check reserved names
      if (RESERVED_NAMES.has(component.toLowerCase())) {
        result.warnings.push(`Component '${component}' uses reserved name`);
      }

      // Check for numeric-only components (might indicate ID collision)
      if (/^\d+$/.test(component)) {
        result.warnings.push(`Component '${component}' is numeric-only (potential collision risk)`);
      }
    }

    // Check for duplicate components (indicates potential collision)
    const uniqueComponents = new Set(components);
    if (uniqueComponents.size !== components.length) {
      result.warnings.push('Namespace contains duplicate components');
    }

    // Sanitize path if needed
    if (result.errors.length > 0) {
      try {
        const sanitizedComponents = components.map(c => this.sanitizeId(c, opts));
        result.sanitizedPath = sanitizedComponents.join('/');
        result.warnings.push('Path was automatically sanitized due to validation errors');
      } catch (error) {
        result.errors.push(`Failed to sanitize path: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  /**
   * Parse namespace path into components
   *
   * Extracts and validates individual components from a namespace path.
   *
   * @param namespacePath - Full namespace path
   * @returns Parsed components with type information
   */
  static parseNamespace(namespacePath: string): {
    prefix: string;
    epicId: string | null;
    phaseId: string | null;
    sprintId: string | null;
    agentId: string | null;
    iterationNum: number | null;
    components: string[];
  } {
    const components = namespacePath.split('/').filter(c => c.length > 0);

    const parsed = {
      prefix: components[0] || '',
      epicId: null as string | null,
      phaseId: null as string | null,
      sprintId: null as string | null,
      agentId: null as string | null,
      iterationNum: null as number | null,
      components,
    };

    // Extract IDs from components
    for (let i = 1; i < components.length; i++) {
      const component = components[i];

      // Check for prefixed components
      if (component.startsWith('phase-')) {
        parsed.phaseId = component.substring(6);
      } else if (component.startsWith('sprint-')) {
        parsed.sprintId = component.substring(7);
      } else if (component.startsWith('agent-')) {
        parsed.agentId = component.substring(6);
      } else if (component.startsWith('iteration-')) {
        const iterStr = component.substring(10);
        const iterNum = parseInt(iterStr, 10);
        if (!isNaN(iterNum)) {
          parsed.iterationNum = iterNum;
        }
      } else if (i === 1) {
        // First non-prefix component is epic ID
        parsed.epicId = component;
      }
    }

    return parsed;
  }

  /**
   * Compare two namespace paths for hierarchy relationship
   *
   * Determines if one namespace is a parent/child of another.
   *
   * @param path1 - First namespace path
   * @param path2 - Second namespace path
   * @returns Relationship: 'parent', 'child', 'sibling', or 'unrelated'
   */
  static compareNamespaces(path1: string, path2: string): 'parent' | 'child' | 'sibling' | 'unrelated' {
    const components1 = path1.split('/').filter(c => c.length > 0);
    const components2 = path2.split('/').filter(c => c.length > 0);

    // Check if path1 is parent of path2
    if (components1.length < components2.length) {
      const isParent = components1.every((c, i) => c === components2[i]);
      if (isParent) return 'parent';
    }

    // Check if path2 is parent of path1
    if (components2.length < components1.length) {
      const isParent = components2.every((c, i) => c === components1[i]);
      if (isParent) return 'child';
    }

    // Check if siblings (same parent)
    if (components1.length === components2.length && components1.length > 1) {
      const sameParent = components1.slice(0, -1).every((c, i) => c === components2[i]);
      if (sameParent) return 'sibling';
    }

    return 'unrelated';
  }

  /**
   * Generate namespace prefix for memory storage
   *
   * Creates a consistent prefix for memory keys based on namespace hierarchy.
   *
   * @param epicId - Epic identifier
   * @param phaseId - Optional phase identifier
   * @param sprintId - Optional sprint identifier
   * @returns Memory key prefix
   */
  static generateMemoryPrefix(
    epicId: string,
    phaseId?: string,
    sprintId?: string
  ): string {
    const components = [this.sanitizeId(epicId)];

    if (phaseId) {
      components.push(`phase-${this.sanitizeId(phaseId)}`);
    }

    if (sprintId) {
      components.push(`sprint-${this.sanitizeId(sprintId)}`);
    }

    return components.join(':');
  }
}

// ===== EXPORTS =====

export default NamespaceSanitizer;
