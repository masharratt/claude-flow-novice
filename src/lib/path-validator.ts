/**
 * Path Validator - Security Utility for Safe File Operations
 *
 * Provides robust path sanitization and validation to prevent path traversal attacks (CVSS 7.5).
 * Enforces strict rules on file access:
 * - Path normalization to resolve ".." and "." sequences
 * - Validation that resolved paths stay within allowed directories
 * - Detection and rejection of symlinks
 * - Rejection of absolute paths outside allowed directories
 * - Prevention of home directory access ("~")
 *
 * @module path-validator
 * @version 1.0.0
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
 * Validate a file path to prevent directory traversal attacks
 *
 * Security checks performed:
 * 1. Normalize path to resolve ".." and "."
 * 2. Reject paths containing absolute path markers when base is relative
 * 3. Reject symlinks to prevent symlink attacks
 * 4. Verify resolved path is within allowed base directory
 * 5. Reject home directory expansion ("~")
 *
 * @param filePath - The file path to validate
 * @param baseDirectory - The base directory that file must reside within
 * @returns PathValidationResult with validation details
 * @throws PathValidationError if path validation fails
 *
 * @example
 * const result = validatePath('docs/FEATURE.md', './.claude/skills');
 * if (!result.valid) {
 *   throw result; // Safe to throw, contains all context
 * }
 * // Use result.resolvedPath
 */
export function validatePath(filePath: string, baseDirectory: string): PathValidationResult {
  // Check for home directory expansion attempts
  if (filePath.startsWith('~') || filePath.includes('/~') || filePath.includes('\\~')) {
    throw new PathValidationError(
      'Path validation failed: home directory access denied',
      {
        filePath,
        baseDirectory,
        reason: 'HOME_DIRECTORY_ACCESS',
      }
    );
  }

  // Check for home directory expansion attempts in baseDirectory
  if (baseDirectory.startsWith('~')) {
    throw new PathValidationError(
      'Base directory validation failed: home directory access denied',
      {
        baseDirectory,
        reason: 'BASE_HOME_DIRECTORY_ACCESS',
      }
    );
  }

  // Normalize the base directory first
  const normalizedBase = path.normalize(baseDirectory);
  const resolvedBase = path.resolve(normalizedBase);

  // Normalize and resolve the file path relative to base
  const normalizedPath = path.normalize(filePath);

  // Check if path contains suspicious patterns after normalization
  if (normalizedPath.includes('..') || normalizedPath === '.' || normalizedPath.includes('/./')) {
    throw new PathValidationError(
      'Path validation failed: path contains directory traversal patterns',
      {
        filePath,
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
