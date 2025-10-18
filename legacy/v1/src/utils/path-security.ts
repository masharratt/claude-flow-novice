/**
 * Path Traversal Security Prevention (CVE-2025-004)
 *
 * Provides comprehensive path sanitization and validation to prevent
 * directory traversal attacks via malicious file paths.
 *
 * Features:
 * - Path normalization and canonicalization
 * - Base directory containment validation
 * - Whitelist-based directory access control
 * - Symlink resolution and validation
 * - File existence verification
 *
 * Security Controls:
 * - Blocks: ../../../../etc/passwd patterns
 * - Blocks: Absolute paths outside allowed directories
 * - Blocks: Symlinks pointing outside base directory
 * - Validates: All resolved paths remain within allowed scope
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Security error thrown when path validation fails
 */
export class PathSecurityError extends Error {
  constructor(
    message: string,
    public readonly attemptedPath: string,
    public readonly violationType: 'traversal' | 'unauthorized' | 'symlink' | 'not_found',
  ) {
    super(message);
    this.name = 'PathSecurityError';
  }
}

/**
 * Allowed base directories for epic/phase file operations
 */
const ALLOWED_BASE_PATHS = [
  'planning',
  'docs',
  'epics',
  'phases',
  'sprints',
];

/**
 * Sanitize file path and ensure it stays within base directory
 *
 * @param baseDir - Base directory that user paths must remain within
 * @param userPath - User-provided path (may be relative or absolute)
 * @returns Sanitized absolute path
 * @throws PathSecurityError if path traversal detected or path invalid
 */
export function sanitizeFilePath(baseDir: string, userPath: string): string {
  // Resolve base directory to absolute path
  const resolvedBase = path.resolve(baseDir);

  // Resolve user path relative to base directory
  const resolvedPath = path.resolve(baseDir, userPath);

  // Normalize to canonical form (removes . and ..)
  const normalizedPath = path.normalize(resolvedPath);

  // SECURITY CHECK 1: Ensure result is within base directory
  if (!normalizedPath.startsWith(resolvedBase + path.sep) && normalizedPath !== resolvedBase) {
    throw new PathSecurityError(
      `Path traversal detected: attempted to access ${userPath} outside base directory ${baseDir}`,
      userPath,
      'traversal',
    );
  }

  // SECURITY CHECK 2: Validate file exists
  if (!fs.existsSync(normalizedPath)) {
    throw new PathSecurityError(
      `File not found: ${userPath}`,
      userPath,
      'not_found',
    );
  }

  // SECURITY CHECK 3: Resolve symlinks and re-validate containment
  const realPath = fs.realpathSync(normalizedPath);
  if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
    throw new PathSecurityError(
      `Symlink traversal detected: ${userPath} resolves to ${realPath} outside base directory`,
      userPath,
      'symlink',
    );
  }

  return normalizedPath;
}

/**
 * Validate epic directory is within allowed paths
 *
 * @param epicDir - Epic directory path to validate
 * @throws PathSecurityError if directory outside allowed paths
 */
export function validateEpicDirectory(epicDir: string): void {
  const allowedPaths = ALLOWED_BASE_PATHS.map(p =>
    path.resolve(process.cwd(), p)
  );

  const resolvedDir = path.resolve(epicDir);

  const isAllowed = allowedPaths.some(allowed =>
    resolvedDir.startsWith(allowed + path.sep) || resolvedDir === allowed
  );

  if (!isAllowed) {
    throw new PathSecurityError(
      `Epic directory outside allowed paths: ${epicDir}. Allowed: ${ALLOWED_BASE_PATHS.join(', ')}`,
      epicDir,
      'unauthorized',
    );
  }

  // Validate directory exists
  if (!fs.existsSync(resolvedDir)) {
    throw new PathSecurityError(
      `Epic directory not found: ${epicDir}`,
      epicDir,
      'not_found',
    );
  }

  // Validate it's actually a directory
  if (!fs.statSync(resolvedDir).isDirectory()) {
    throw new PathSecurityError(
      `Path is not a directory: ${epicDir}`,
      epicDir,
      'not_found',
    );
  }
}

/**
 * Validate phase file path is within epic directory
 *
 * @param epicDir - Validated epic directory
 * @param phaseFile - Phase file path (relative or absolute)
 * @returns Sanitized absolute path to phase file
 * @throws PathSecurityError if path invalid or outside epic directory
 */
export function validatePhaseFile(epicDir: string, phaseFile: string): string {
  // First validate epic directory
  validateEpicDirectory(epicDir);

  // Then sanitize phase file path relative to epic directory
  return sanitizeFilePath(epicDir, phaseFile);
}

/**
 * Safe file read with path validation
 *
 * @param baseDir - Base directory for validation
 * @param filePath - File path to read
 * @returns File contents as string
 * @throws PathSecurityError if path invalid
 */
export function safeReadFile(baseDir: string, filePath: string): string {
  const safePath = sanitizeFilePath(baseDir, filePath);
  return fs.readFileSync(safePath, 'utf-8');
}

/**
 * Safe file write with path validation
 *
 * @param baseDir - Base directory for validation
 * @param filePath - File path to write
 * @param content - Content to write
 * @throws PathSecurityError if path invalid
 */
export function safeWriteFile(baseDir: string, filePath: string, content: string): void {
  // Sanitize path (but allow creating new files)
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(baseDir, filePath);
  const normalizedPath = path.normalize(resolvedPath);

  // Ensure within base directory
  if (!normalizedPath.startsWith(resolvedBase + path.sep) && normalizedPath !== resolvedBase) {
    throw new PathSecurityError(
      `Path traversal detected: attempted to write ${filePath} outside base directory ${baseDir}`,
      filePath,
      'traversal',
    );
  }

  // Ensure parent directory exists and is within base
  const parentDir = path.dirname(normalizedPath);
  if (!parentDir.startsWith(resolvedBase)) {
    throw new PathSecurityError(
      `Parent directory outside base: ${filePath}`,
      filePath,
      'traversal',
    );
  }

  fs.writeFileSync(normalizedPath, content, 'utf-8');
}

/**
 * Add custom allowed base path (for testing or extensions)
 *
 * @param basePath - Base path to allow
 */
export function addAllowedBasePath(basePath: string): void {
  if (!ALLOWED_BASE_PATHS.includes(basePath)) {
    ALLOWED_BASE_PATHS.push(basePath);
  }
}

/**
 * Get current allowed base paths
 */
export function getAllowedBasePaths(): string[] {
  return [...ALLOWED_BASE_PATHS];
}
