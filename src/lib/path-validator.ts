/**
 * Path Validator - Security Utility for Safe File Operations
 *
 * Provides robust path sanitization and validation to prevent path traversal attacks (CVSS 7.0+).
 * Enforces strict rules on file access with protection against encoding attacks:
 *
 * CRITICAL FIXES (CVSS 7.0+):
 * - Iterative URL decoding prevents double-encoding bypasses (%252e%252e%252f → ../)
 * - Unicode normalization (NFC) prevents overlong UTF-8 bypasses (%c0%ae → .)
 * - Null byte detection prevents null injection attacks
 * - All decoding performed BEFORE path normalization to prevent layered attacks
 * - Encoding attack detection with security logging
 *
 * Base Security Controls:
 * - Path normalization to resolve ".." and "." sequences
 * - Validation that resolved paths stay within allowed directories
 * - Detection and rejection of symlinks
 * - Rejection of absolute paths outside allowed directories
 * - Prevention of home directory access ("~")
 *
 * @module path-validator
 * @version 2.0.0 (SECURITY CRITICAL)
 */

import * as path from 'path';
import * as fs from 'fs';
import { StandardError } from './errors';

/**
 * Path validation error - thrown when a path violates security constraints
 */
export class PathValidationError extends StandardError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('PATH_VALIDATION_ERROR', message, context);
    this.name = 'PathValidationError';
  }
}

/**
 * Security encoding attack detection
 */
export interface EncodingAttackDetection {
  detected: boolean;
  type?: 'double_encoding' | 'unicode_encoding' | 'mixed_encoding';
  originalInput: string;
  decodedOutput: string;
  iterationsRequired: number;
}

/**
 * Path validation result with detailed information
 */
export interface PathValidationResult {
  valid: boolean;
  resolvedPath: string;
  normalizedPath: string;
  isWithinBase: boolean;
  isSymlink: boolean;
  reason?: string;
}

/**
 * Safely decode a path with protection against encoding attacks
 *
 * Performs iterative URL decoding and Unicode normalization to prevent:
 * - Double encoding bypass (e.g., %252e%252e%252f → %2e%2e%2f → ../)
 * - Overlong UTF-8 encoding (e.g., %c0%ae%c0%ae/ → ../)
 * - Mixed encoding attacks
 *
 * @param inputPath - The potentially encoded path
 * @returns Decoded path and attack detection info
 * @throws PathValidationError if encoding attack detected
 *
 * @example
 * const { decoded, encoding } = decodePathSafely('%252e%252e%252f');
 * // Detects double-encoding attempt
 */
function decodePathSafely(inputPath: string): {
  decoded: string;
  encoding: EncodingAttackDetection;
} {
  let decoded = inputPath;
  let previous = '';
  let iterations = 0;
  const MAX_ITERATIONS = 5;
  const originalInput = inputPath;
  let invalidEncodingDetected = false;

  // Iteratively decode URL-encoded characters until stable
  // This prevents bypass attacks using multiple encoding layers
  while (decoded !== previous && iterations < MAX_ITERATIONS) {
    previous = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch (error) {
      // Invalid URL encoding can be legitimate (e.g., file100%, %PATH%)
      // These are literal percent signs in filenames, not attacks
      // Only flag as attack if it's malformed UTF-8 (overlong encoding)
      const errorMessage = (error as Error).message || '';

      // Malformed UTF-8 sequences like %c0%ae are attacks
      if (decoded.match(/%[cC][0-9a-fA-F]/) || decoded.match(/%[eE][0-9a-fA-F]/)) {
        invalidEncodingDetected = true;
        break;
      }

      // Otherwise, it's just a literal % in the filename - OK
      // Keep the path as-is and stop decoding
      break;
    }
    iterations++;
  }

  // Check if we hit max iterations (indicates potential encoding attack)
  if (iterations >= MAX_ITERATIONS && decoded !== previous) {
    throw new PathValidationError(
      'Path validation failed: excessive encoding layers detected',
      {
        originalInput,
        decodedOutput: decoded,
        iterations,
        reason: 'ENCODING_ATTACK_DETECTED',
      }
    );
  }

  // Invalid encoding like malformed UTF-8 is itself an attack indicator
  if (invalidEncodingDetected) {
    throw new PathValidationError(
      'Path validation failed: invalid encoding detected (possible encoding attack)',
      {
        originalInput,
        decodedOutput: decoded,
        iterations,
        reason: 'INVALID_ENCODING_DETECTED',
      }
    );
  }

  // Detect double+ encoding attacks (3+ iterations = double-encoded or more)
  // Single-level URL encoding requires 2 iterations: decode + stability check
  // Example: subdir%2ffile.txt → subdir/file.txt → stable (2 iterations, legitimate)
  // Example: %252e%252e%252f → %2e%2e%2f → ../ (3 iterations, attack)
  const encodingAttackDetected = iterations > 2;

  // Unicode normalization to handle overlong UTF-8 sequences
  // e.g., %c0%ae (%c0%ae = UTF-8 overlong encoding for ".")
  let normalized = decoded;
  try {
    normalized = decoded.normalize('NFC');
  } catch (error) {
    // Some paths may not be valid Unicode, continue with non-normalized version
  }

  // Check for null bytes (another common encoding attack vector)
  if (normalized.includes('\0')) {
    throw new PathValidationError(
      'Path validation failed: null byte injection detected',
      {
        originalInput,
        decodedOutput: normalized,
        reason: 'NULL_BYTE_INJECTION',
      }
    );
  }

  return {
    decoded: normalized,
    encoding: {
      detected: encodingAttackDetected,
      type: encodingAttackDetected ? 'double_encoding' : undefined,
      originalInput,
      decodedOutput: normalized,
      iterationsRequired: iterations,
    },
  };
}

/**
 * Validate a file path to prevent directory traversal attacks
 *
 * Security checks performed (in order):
 * 1. CRITICAL: Iteratively decode URL encoding to handle %252e%252e%252f and similar bypasses
 * 2. CRITICAL: Normalize Unicode (NFC) to handle overlong UTF-8 like %c0%ae%c0%ae/
 * 3. CRITICAL: Detect null bytes and excessive encoding layers
 * 4. Check for home directory expansion ("~") on DECODED path
 * 5. Normalize path to resolve ".." and "."
 * 6. Verify all suspicious patterns are eliminated
 * 7. Check if path is within base directory
 * 8. Reject symlinks to prevent symlink attacks
 * 9. Log any encoding attacks detected for security monitoring
 *
 * @param filePath - The file path to validate (may be encoded)
 * @param baseDirectory - The base directory that file must reside within
 * @returns PathValidationResult with validation details
 * @throws PathValidationError if path validation fails or encoding attack detected
 *
 * @example
 * const result = validatePath('docs/FEATURE.md', './.claude/skills');
 * if (!result.valid) {
 *   throw result; // Safe to throw, contains all context
 * }
 * // Use result.resolvedPath
 *
 * @security
 * Designed to prevent:
 * - Double-encoding bypasses: %252e%252e%252f
 * - Overlong UTF-8: %c0%ae%c0%ae/
 * - Mixed encoding: URL + Unicode combinations
 * - Null byte injection: file.txt%00.jpg
 * - Traditional path traversal: ../../../etc/passwd
 */
export function validatePath(filePath: string, baseDirectory: string): PathValidationResult {
  // SECURITY FIX: Decode all encoding layers first before any path normalization
  // This prevents double-encoding bypasses like %252e%252e%252f
  const { decoded: decodedPath, encoding: pathEncoding } = decodePathSafely(filePath);
  const { decoded: decodedBase } = decodePathSafely(baseDirectory);

  // Log encoding attacks for security monitoring
  if (pathEncoding.detected) {
    // In production, this should trigger security alerts
    console.warn('Security: Encoding attack detected in path input', {
      originalInput: pathEncoding.originalInput,
      decodedOutput: pathEncoding.decodedOutput,
      iterationsRequired: pathEncoding.iterationsRequired,
    });
  }

  // Check for home directory expansion attempts on DECODED path
  if (decodedPath.startsWith('~') || decodedPath.includes('/~') || decodedPath.includes('\\~')) {
    throw new PathValidationError(
      'Path validation failed: home directory access denied',
      {
        filePath,
        decodedPath,
        baseDirectory,
        reason: 'HOME_DIRECTORY_ACCESS',
      }
    );
  }

  // Check for home directory expansion attempts in baseDirectory
  if (decodedBase.startsWith('~')) {
    throw new PathValidationError(
      'Base directory validation failed: home directory access denied',
      {
        baseDirectory,
        decodedBase,
        reason: 'BASE_HOME_DIRECTORY_ACCESS',
      }
    );
  }

  // Normalize the base directory first
  const normalizedBase = path.normalize(decodedBase);
  const resolvedBase = path.resolve(normalizedBase);

  // Normalize and resolve the file path relative to base
  // NOW normalized on already-decoded path to prevent encoding bypasses
  const normalizedPath = path.normalize(decodedPath);

  // Check if path contains suspicious patterns after normalization
  if (normalizedPath.includes('..') || normalizedPath === '.' || normalizedPath.includes('/./')) {
    throw new PathValidationError(
      'Path validation failed: path contains directory traversal patterns',
      {
        filePath,
        decodedPath,
        normalizedPath,
        baseDirectory,
        reason: 'TRAVERSAL_PATTERN_DETECTED',
      }
    );
  }

  // Resolve the path relative to base directory
  const resolvedPath = path.resolve(resolvedBase, normalizedPath);

  // Check if resolved path is within base directory
  const isWithinBase = isPathWithinBase(resolvedPath, resolvedBase);

  if (!isWithinBase) {
    throw new PathValidationError(
      'Path validation failed: resolved path is outside allowed directory',
      {
        filePath,
        resolvedPath,
        baseDirectory: resolvedBase,
        reason: 'PATH_OUTSIDE_BASE',
      }
    );
  }

  // Check for symlinks (prevents symlink attacks)
  let isSymlink = false;
  try {
    const stats = fs.lstatSync(resolvedPath);
    isSymlink = stats.isSymbolicLink();

    if (isSymlink) {
      throw new PathValidationError(
        'Path validation failed: symbolic links are not allowed',
        {
          filePath,
          resolvedPath,
          reason: 'SYMLINK_NOT_ALLOWED',
        }
      );
    }
  } catch (error) {
    // File doesn't exist yet (expected for validation before creation)
    // or it's a symlink that was rejected above
    if (error instanceof PathValidationError) {
      throw error;
    }
    // Other errors (permission denied, etc.) are not path validation failures
    // The file validation happens later
  }

  return {
    valid: true,
    resolvedPath,
    normalizedPath,
    isWithinBase: true,
    isSymlink: false,
  };
}

/**
 * Check if a path is within a base directory
 *
 * Uses path resolution and string comparison to ensure the resolved path
 * is actually within the base directory (not just sharing a prefix).
 *
 * @param filePath - The path to check
 * @param baseDirectory - The base directory
 * @returns True if filePath is within baseDirectory
 *
 * @example
 * isPathWithinBase('/home/user/project/src/file.ts', '/home/user/project')  // true
 * isPathWithinBase('/home/user/project-evil/file.ts', '/home/user/project') // false
 */
export function isPathWithinBase(filePath: string, baseDirectory: string): boolean {
  // Ensure both paths are normalized and absolute
  const normalizedFile = path.normalize(path.resolve(filePath));
  const normalizedBase = path.normalize(path.resolve(baseDirectory));

  // Exact match
  if (normalizedFile === normalizedBase) {
    return true;
  }

  // Check if file is within base (use path.relative to ensure it's not going up)
  const relative = path.relative(normalizedBase, normalizedFile);

  // If relative path starts with "..", it's outside the base directory
  if (relative.startsWith('..')) {
    return false;
  }

  // If relative path is absolute, it's outside the base directory
  if (path.isAbsolute(relative)) {
    return false;
  }

  return true;
}

/**
 * Validate multiple paths within the same base directory
 *
 * Efficiently validates multiple paths, returning results for each.
 *
 * @param filePaths - Array of file paths to validate
 * @param baseDirectory - The base directory that all files must reside within
 * @returns Map of file path to validation result
 *
 * @example
 * const results = validatePaths(['docs/SKILL.md', 'src/index.ts'], './.claude/skills');
 * results.forEach((result, filePath) => {
 *   if (!result.valid) {
 *     console.error(`Invalid path: ${filePath}`, result.reason);
 *   }
 * });
 */
export function validatePaths(
  filePaths: string[],
  baseDirectory: string
): Map<string, PathValidationResult> {
  const results = new Map<string, PathValidationResult>();

  for (const filePath of filePaths) {
    try {
      const result = validatePath(filePath, baseDirectory);
      results.set(filePath, result);
    } catch (error) {
      if (error instanceof PathValidationError) {
        results.set(filePath, {
          valid: false,
          resolvedPath: '',
          normalizedPath: '',
          isWithinBase: false,
          isSymlink: false,
          reason: error.context?.reason as string | undefined,
        });
      } else {
        throw error;
      }
    }
  }

  return results;
}

/**
 * Get the safe path for a file (or throw if validation fails)
 *
 * Convenience function that validates and returns the resolved path,
 * or throws an error if validation fails.
 *
 * @param filePath - The file path to validate
 * @param baseDirectory - The base directory that file must reside within
 * @returns The resolved, validated absolute path
 * @throws PathValidationError if path validation fails
 *
 * @example
 * const safePath = getSafePath('docs/SKILL.md', './.claude/skills');
 * fs.readFileSync(safePath); // Safe to use
 */
export function getSafePath(filePath: string, baseDirectory: string): string {
  const result = validatePath(filePath, baseDirectory);
  return result.resolvedPath;
}

/**
 * Check if a path is considered safe for operations
 *
 * This is a non-throwing version of validatePath for conditional logic.
 *
 * @param filePath - The file path to check
 * @param baseDirectory - The base directory
 * @returns True if path is safe, false otherwise
 *
 * @example
 * if (isPathSafe(userInput, './.claude/skills')) {
 *   // Process the file
 * } else {
 *   // Reject the request
 * }
 */
export function isPathSafe(filePath: string, baseDirectory: string): boolean {
  try {
    validatePath(filePath, baseDirectory);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get validation error details for a path (if invalid)
 *
 * Useful for logging and diagnostics.
 *
 * @param filePath - The file path to validate
 * @param baseDirectory - The base directory
 * @returns Error with details, or undefined if path is valid
 *
 * @example
 * const error = getPathValidationError('../../etc/passwd', './.claude/skills');
 * if (error) {
 *   logger.error(error.message, error.context);
 * }
 */
export function getPathValidationError(
  filePath: string,
  baseDirectory: string
): PathValidationError | undefined {
  try {
    validatePath(filePath, baseDirectory);
    return undefined;
  } catch (error) {
    if (error instanceof PathValidationError) {
      return error;
    }
    throw error;
  }
}

/**
 * List allowed files within a base directory (safely)
 *
 * Recursively lists all files within base directory, validating
 * each path to ensure it's within bounds.
 *
 * @param baseDirectory - The base directory to scan
 * @param options - Options for listing (maxDepth, filter)
 * @returns Array of validated, safe paths relative to baseDirectory
 *
 * @example
 * const files = safeListDirectory('./.claude/skills');
 * files.forEach(file => {
 *   // All paths are guaranteed safe
 *   console.log(file);
 * });
 */
export function safeListDirectory(
  baseDirectory: string,
  options?: {
    maxDepth?: number;
    filter?: (path: string) => boolean;
  }
): string[] {
  const safeFiles: string[] = [];
  const maxDepth = options?.maxDepth ?? Infinity;
  const filter = options?.filter ?? (() => true);

  function walkDirectory(dir: string, currentDepth: number = 0): void {
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDirectory, fullPath);

        // Validate the path is still within base
        if (!isPathWithinBase(fullPath, baseDirectory)) {
          continue;
        }

        // Apply filter
        if (!filter(relativePath)) {
          continue;
        }

        safeFiles.push(relativePath);

        // Recursively walk directories
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          walkDirectory(fullPath, currentDepth + 1);
        }
      }
    } catch (error) {
      // Silently skip directories we can't read (permission denied, etc.)
    }
  }

  walkDirectory(baseDirectory);
  return safeFiles;
}
