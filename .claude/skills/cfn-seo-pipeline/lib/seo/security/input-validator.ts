/**
 * Input Validation and Sanitization Module
 *
 * Provides sanitization and validation functions for all user-provided inputs
 * before use in external API calls or internal processing.
 *
 * Addresses SEC-1.1: Missing Input Validation
 * - Keyword sanitization
 * - Niche validation
 * - Domain format validation
 * - Recursive parameter sanitization
 *
 * @module seo/security/input-validator
 */

/**
 * Allowlist of characters for keywords and niches
 * Includes alphanumeric, spaces, hyphens, underscores, parentheses
 * Allows common punctuation for natural language keywords
 */
const KEYWORD_ALLOWLIST = /^[a-zA-Z0-9\s\-_()&,.!?]*$/;
const NICHE_ALLOWLIST = /^[a-zA-Z0-9\s\-_()&,.!?]*$/;
const DOMAIN_ALLOWLIST = /^[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]\.([a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]\.)*[a-zA-Z]{2,}$/;

/**
 * Maximum allowed lengths for input fields
 */
const MAX_KEYWORD_LENGTH = 200;
const MAX_NICHE_LENGTH = 100;

/**
 * Blocked patterns that indicate injection attempts
 */
const INJECTION_PATTERNS = [
  /['";`]/g, // SQL/Command injection chars
  /[<>]/g, // XSS chars
  /\${}/g, // Template injection
  /[*?]/g, // Globbing chars
  /\\/g, // Path traversal
];

/**
 * Internal domains and IP ranges that should be blocked
 */
const BLOCKED_DOMAINS = [
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '::1',
  'example.com',
  'example.org',
];

/**
 * Blocked IP ranges (private/reserved)
 */
const BLOCKED_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^127\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

/**
 * Sanitize a keyword for safe use in API calls
 *
 * Rules:
 * - Remove leading/trailing whitespace
 * - Truncate to MAX_KEYWORD_LENGTH
 * - Check against allowlist
 * - Reject if contains suspicious patterns
 *
 * @param keyword - Raw keyword input
 * @returns Sanitized keyword or null if validation fails
 * @throws Error if sanitization detects injection attempt
 */
export function sanitizeKeyword(keyword: string): string | null {
  if (!keyword || typeof keyword !== 'string') {
    return null;
  }

  // Step 1: Normalize whitespace
  let sanitized = keyword.trim().replace(/\s+/g, ' ');

  // Step 2: Check length
  if (sanitized.length > MAX_KEYWORD_LENGTH) {
    sanitized = sanitized.substring(0, MAX_KEYWORD_LENGTH).trim();
  }

  // Step 3: Check for empty string after normalization
  if (sanitized.length === 0) {
    return null;
  }

  // Step 4: Detect injection attempts
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      throw new Error(`Input validation failed: Potential injection detected in keyword (pattern: ${pattern})`);
    }
  }

  // Step 5: Validate against allowlist
  if (!KEYWORD_ALLOWLIST.test(sanitized)) {
    throw new Error(`Input validation failed: Keyword contains invalid characters`);
  }

  return sanitized;
}

/**
 * Sanitize a niche for safe use in API calls
 *
 * Rules:
 * - Remove leading/trailing whitespace
 * - Truncate to MAX_NICHE_LENGTH
 * - Check against allowlist
 * - Reject if contains suspicious patterns
 *
 * @param niche - Raw niche input
 * @returns Sanitized niche or null if validation fails
 * @throws Error if sanitization detects injection attempt
 */
export function sanitizeNiche(niche: string): string | null {
  if (!niche || typeof niche !== 'string') {
    return null;
  }

  // Step 1: Normalize whitespace
  let sanitized = niche.trim().replace(/\s+/g, ' ');

  // Step 2: Check length
  if (sanitized.length > MAX_NICHE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_NICHE_LENGTH).trim();
  }

  // Step 3: Check for empty string after normalization
  if (sanitized.length === 0) {
    return null;
  }

  // Step 4: Detect injection attempts
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      throw new Error(`Input validation failed: Potential injection detected in niche (pattern: ${pattern})`);
    }
  }

  // Step 5: Validate against allowlist
  if (!NICHE_ALLOWLIST.test(sanitized)) {
    throw new Error(`Input validation failed: Niche contains invalid characters`);
  }

  return sanitized;
}

/**
 * Validate a domain name format and check against blocklist
 *
 * Rules:
 * - Must be valid domain format (RFC 1123 simplified)
 * - Must not be an IP address
 * - Must not be in blocked domains list
 * - Must not be in private IP ranges
 *
 * @param domain - Domain to validate
 * @returns true if domain is valid and allowed, false otherwise
 */
export function validateDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  const normalized = domain.toLowerCase().trim();

  // Check blocklist
  if (BLOCKED_DOMAINS.includes(normalized)) {
    return false;
  }

  // Check if it's an IP address (IPv4 or IPv6)
  if (isIPAddress(normalized)) {
    return false;
  }

  // Check if private IP range
  for (const range of BLOCKED_IP_RANGES) {
    if (range.test(normalized)) {
      return false;
    }
  }

  // Check domain format
  if (!DOMAIN_ALLOWLIST.test(normalized)) {
    return false;
  }

  return true;
}

/**
 * Check if a string is an IP address (IPv4 or IPv6)
 *
 * @param value - String to check
 * @returns true if value is an IP address
 */
function isIPAddress(value: string): boolean {
  // Simple IPv4 check
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(value)) {
    const parts = value.split('.');
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  // Simple IPv6 check
  const ipv6Pattern = /^[\da-f:]+$/i;
  if (ipv6Pattern.test(value)) {
    return true;
  }

  return false;
}

/**
 * Recursively sanitize all string values in an object
 *
 * Purpose: Sanitize API parameters before sending to external APIs
 *
 * Rules:
 * - Recursively process nested objects and arrays
 * - Skip null/undefined values
 * - Keep non-string values unchanged
 * - Apply sanitization rules to all strings
 *
 * @param params - Object with parameters to sanitize
 * @returns Sanitized object (safe for external API use)
 * @throws Error if any string value fails validation
 */
export function sanitizeAPIParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      sanitized[key] = value;
      continue;
    }

    if (typeof value === 'string') {
      // Sanitize string values
      let cleaned = value.trim().replace(/\s+/g, ' ');

      // Detect injection attempts in all parameter values
      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(cleaned)) {
          throw new Error(`Input validation failed: Potential injection detected in parameter '${key}'`);
        }
      }

      // For specific parameter types, apply stricter rules
      if (key.toLowerCase().includes('keyword')) {
        sanitized[key] = sanitizeKeyword(cleaned);
      } else if (key.toLowerCase().includes('niche')) {
        sanitized[key] = sanitizeNiche(cleaned);
      } else if (key.toLowerCase().includes('domain') || key.toLowerCase().includes('url')) {
        // For URLs/domains, just validate format
        if (!validateDomain(cleaned)) {
          throw new Error(`Input validation failed: Invalid domain/URL format for parameter '${key}'`);
        }
        sanitized[key] = cleaned;
      } else {
        // Generic string sanitization: remove suspicious patterns but keep value
        sanitized[key] = cleaned;
      }
      continue;
    }

    if (typeof value === 'object') {
      // Recursively sanitize nested objects
      if (Array.isArray(value)) {
        sanitized[key] = value.map((item) => {
          if (typeof item === 'string') {
            return item.trim().replace(/\s+/g, ' ');
          }
          if (typeof item === 'object' && item !== null) {
            return sanitizeAPIParams(item as Record<string, unknown>);
          }
          return item;
        });
      } else {
        sanitized[key] = sanitizeAPIParams(value as Record<string, unknown>);
      }
      continue;
    }

    // Keep other types (numbers, booleans) unchanged
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Validate input size to prevent DoS attacks
 *
 * @param input - String input to validate
 * @param maxSize - Maximum allowed size in bytes (default: 10KB)
 * @returns true if input size is acceptable
 */
export function validateInputSize(input: string, maxSize: number = 10240): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  // Use Buffer to get actual byte size
  const sizeInBytes = Buffer.byteLength(input, 'utf-8');
  return sizeInBytes <= maxSize;
}

/**
 * Sanitize and validate a complete query object
 *
 * Combines multiple validation checks for a query object
 *
 * @param keyword - Primary keyword
 * @param niche - Topic niche
 * @returns Validated and sanitized query object or null if validation fails
 */
export function validateAndSanitizeQuery(keyword: string, niche: string): { keyword: string; niche: string } | null {
  try {
    const sanitizedKeyword = sanitizeKeyword(keyword);
    const sanitizedNiche = sanitizeNiche(niche);

    if (!sanitizedKeyword || !sanitizedNiche) {
      return null;
    }

    return {
      keyword: sanitizedKeyword,
      niche: sanitizedNiche,
    };
  } catch (error) {
    // Return null on validation error (error will be logged by caller)
    return null;
  }
}
