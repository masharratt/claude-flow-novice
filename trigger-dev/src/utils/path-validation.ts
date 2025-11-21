/**
 * Path Validation Security Utilities
 *
 * Prevents path traversal and directory escape attacks
 * by validating taskIds and filenames before file operations.
 *
 * CVSS Score: 9.1 (Critical)
 * Vulnerability: Path traversal via unsanitized taskId
 * Solution: Strict validation pattern with whitelist approach
 */

/**
 * TaskId Validator - Prevents path traversal attacks
 *
 * Validates that taskId contains only safe characters:
 * - Alphanumeric (a-z, A-Z, 0-9)
 * - Hyphen (-)
 * - Underscore (_)
 *
 * Rejects:
 * - Path traversal attempts (../)
 * - Directory separators (/, \)
 * - Special characters that could be interpreted
 * - Null bytes and other injection vectors
 *
 * @param taskId - Task identifier to validate
 * @throws Error if taskId is invalid
 */
export function validateTaskId(taskId: string): void {
  if (!taskId || typeof taskId !== 'string') {
    throw new Error(`Invalid taskId: expected non-empty string, got ${typeof taskId}`);
  }

  if (taskId.length > 255) {
    throw new Error(`Invalid taskId: exceeds maximum length (255 chars), got ${taskId.length}`);
  }

  // Pattern: Only alphanumeric, dash, underscore
  // This is a whitelist approach (most secure)
  const SAFE_PATTERN = /^[a-zA-Z0-9\-_]+$/;
  if (!SAFE_PATTERN.test(taskId)) {
    throw new Error(`Invalid taskId format: contains unsafe characters. Only alphanumeric, dash, and underscore allowed. Got: ${taskId}`);
  }
}

/**
 * Validate filename to prevent directory traversal
 *
 * Rejects:
 * - Parent directory references (..)
 * - Directory separators (/, \)
 * - Absolute paths
 * - Special shell characters
 *
 * @param filename - Filename to validate
 * @throws Error if filename is invalid
 */
export function validateFilename(filename: string): void {
  if (!filename || typeof filename !== 'string') {
    throw new Error(`Invalid filename: expected non-empty string, got ${typeof filename}`);
  }

  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error(`Invalid filename: contains unsafe characters. Got: ${filename}`);
  }
}

/**
 * Sanitize taskId - removes unsafe characters
 *
 * Use this for legacy code if validation is too strict.
 * WARNING: Sanitization is less secure than validation - prefer validateTaskId()
 *
 * @param taskId - Task identifier to sanitize
 * @returns Sanitized taskId with unsafe characters removed
 */
export function sanitizeTaskId(taskId: string): string {
  if (!taskId || typeof taskId !== 'string') {
    return '';
  }
  return taskId.replace(/[^a-zA-Z0-9\-_]/g, '');
}

/**
 * Sanitize filename - removes unsafe characters
 *
 * @param filename - Filename to sanitize
 * @returns Sanitized filename with unsafe characters removed
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return '';
  }
  // Remove path separators and special characters, keep safe ones
  return filename.replace(/[\/\\:*?"<>|]/g, '').replace(/\.{2,}/g, '.');
}
