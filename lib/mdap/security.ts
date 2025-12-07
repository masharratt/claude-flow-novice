/**
 * Security Utilities for MDAP
 *
 * Common security functions for input validation, sanitization,
 * and secure defaults across MDAP modules.
 *
 * @module security
 * @version 1.0.0
 */

// =============================================
// Types
// =============================================

export interface SecurityConfig {
  /** Maximum length for text inputs */
  maxTextLength?: number;
  /** Minimum length for text inputs */
  minTextLength?: number;
  /** Whether to strip HTML */
  stripHtml?: boolean;
  /** Whether to allow special characters */
  allowSpecialChars?: boolean;
}

export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Sanitized value if valid */
  sanitized?: any;
  /** Error message if invalid */
  error?: string;
}

// =============================================
// Constants
// =============================================

/** Default security configuration */
const DEFAULT_SECURITY_CONFIG: Required<SecurityConfig> = {
  maxTextLength: 100000,
  minTextLength: 0,
  stripHtml: true,
  allowSpecialChars: false,
};

/** Dangerous patterns to strip from inputs */
const DANGEROUS_PATTERNS = [
  // Script injections
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /onload\s*=/gi,
  /onerror\s*=/gi,
  /onclick\s*=/gi,
  
  // Data URIs
  /data:text\/html/gi,
  /data:application\/javascript/gi,
  
  // Shell command patterns
  /\$\(/g,           // Command substitution
  /`[^`]*`/g,        // Backtick execution
  /\|\s*pipe/gi,     // Pipe with spaces
  /&&\s*rm/gi,       // Dangerous combinations
  /;\s*rm/gi,
  
  // Path traversal
  /\.\.\//g,
  /\.\.\\/g,
];

/** Whitelisted file extensions */
const ALLOWED_FILE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".json",
  ".py", ".go", ".rs", ".java", ".c", ".cpp",
  ".h", ".hpp", ".md", ".txt", ".yml", ".yaml",
  ".sql", ".sh", ".bash", ".zsh", ".ps1",
];

// =============================================
// Validation Functions
// =============================================

/**
 * Sanitize a string input by removing dangerous content
 */
export function sanitizeString(
  input: string,
  config: Partial<SecurityConfig> = {}
): ValidationResult {
  const cfg = { ...DEFAULT_SECURITY_CONFIG, ...config };
  
  if (!input || typeof input !== "string") {
    return { isValid: false, error: "Input must be a non-empty string" };
  }
  
  // Length checks
  if (input.length < cfg.minTextLength || input.length > cfg.maxTextLength) {
    return { 
      isValid: false, 
      error: `Input length must be between ${cfg.minTextLength} and ${cfg.maxTextLength} characters` 
    };
  }
  
  let sanitized = input.trim();
  
  // Strip HTML if configured
  if (cfg.stripHtml) {
    // Simple HTML tag removal
    sanitized = sanitized.replace(/<[^>]*>/g, "");
  }
  
  // Remove dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  
  // Remove or replace special characters if not allowed
  if (!cfg.allowSpecialChars) {
    sanitized = sanitized.replace(/[;&|`$(){}[\]<>"'\\]/g, "");
  }
  
  // Validate that we still have content after sanitization
  if (sanitized.length === 0 && input.length > 0) {
    return { isValid: false, error: "Input contains only invalid characters" };
  }
  
  return { isValid: true, sanitized };
}

/**
 * Validate and sanitize a file path
 */
export function sanitizeFilePath(filePath: string): ValidationResult {
  if (!filePath || typeof filePath !== "string") {
    return { isValid: false, error: "File path must be a non-empty string" };
  }
  
  // Resolve path and normalize
  const normalized = filePath.replace(/\\/g, "/");
  
  // Check for directory traversal
  if (normalized.includes("../") || normalized.includes("..\\")) {
    return { isValid: false, error: "Directory traversal not allowed" };
  }
  
  // Check for absolute paths (should be relative to work directory)
  if (normalized.startsWith("/")) {
    return { isValid: false, error: "Absolute paths not allowed" };
  }
  
  // Check file extension
  const ext = normalized.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_FILE_EXTENSIONS.includes("." + ext)) {
    return { 
      isValid: false, 
      error: "File extension not allowed. Allowed: " + ALLOWED_FILE_EXTENSIONS.join(", ")
    };
  }
  
  // Remove dangerous characters from filename
  const sanitized = normalized.replace(/[;&|`$<>{}[\]]/g, "");
  
  return { isValid: true, sanitized };
}

/**
 * Validate a numeric input within bounds
 */
export function validateNumber(
  input: any,
  min: number = Number.MIN_SAFE_INTEGER,
  max: number = Number.MAX_SAFE_INTEGER
): ValidationResult {
  const num = Number(input);
  
  if (isNaN(num) || !isFinite(num)) {
    return { isValid: false, error: "Input must be a valid number" };
  }
  
  if (num < min || num > max) {
    return { isValid: false, error: `Number must be between ${min} and ${max}` };
  }
  
  return { isValid: true, sanitized: num };
}

/**
 * Validate a boolean input
 */
export function validateBoolean(input: any): ValidationResult {
  if (typeof input === "boolean") {
    return { isValid: true, sanitized: input };
  }
  
  if (typeof input === "string") {
    const lower = input.toLowerCase();
    if (["true", "1", "yes", "on"].includes(lower)) {
      return { isValid: true, sanitized: true };
    }
    if (["false", "0", "no", "off"].includes(lower)) {
      return { isValid: true, sanitized: false };
    }
  }
  
  if (typeof input === "number") {
    return { isValid: true, sanitized: input !== 0 };
  }
  
  return { isValid: false, error: "Input must be a boolean value" };
}

/**
 * Validate an API key or token
 */
export function validateApiKey(
  apiKey: string,
  service: string = "api"
): ValidationResult {
  if (!apiKey || typeof apiKey !== "string") {
    return { isValid: false, error: service + " key is required" };
  }
  
  // Check minimum length
  if (apiKey.length < 10) {
    return { isValid: false, error: service + " key appears to be too short" };
  }
  
  // Check for common placeholder values
  const placeholders = ["your-api-key", "sk-xxxxxxxx", "dummy", "test", "example", "placeholder"];
  if (placeholders.some(placeholder => apiKey.toLowerCase().includes(placeholder))) {
    return { isValid: false, error: service + " key appears to be a placeholder" };
  }
  
  // Check for whitespace
  if (/\s/.test(apiKey)) {
    return { isValid: false, error: service + " key cannot contain whitespace" };
  }
  
  return { isValid: true, sanitized: apiKey.trim() };
}

/**
 * Validate an object against a schema
 */
export function validateObject(
  obj: any,
  schema: Record<string, (value: any) => ValidationResult>
): ValidationResult {
  if (!obj || typeof obj !== "object") {
    return { isValid: false, error: "Input must be an object" };
  }
  
  const errors: string[] = [];
  const sanitized: Record<string, any> = {};
  
  for (const [key, validator] of Object.entries(schema)) {
    const result = validator(obj[key]);
    
    if (!result.isValid) {
      errors.push(key + ": " + result.error);
    } else if (result.sanitized !== undefined) {
      sanitized[key] = result.sanitized;
    }
  }
  
  if (errors.length > 0) {
    return { isValid: false, error: errors.join("; ") };
  }
  
  return { isValid: true, sanitized };
}

/**
 * Create a rate limiter for API calls
 */
export function createRateLimiter(maxCalls: number, windowMs: number): {
  checkLimit: () => { allowed: boolean; resetTime?: number };
} {
  const calls: number[] = [];
  
  return {
    checkLimit: () => {
      const now = Date.now();
      
      // Remove old calls outside window
      const windowStart = now - windowMs;
      while (calls.length > 0 && calls[0] < windowStart) {
        calls.shift();
      }
      
      if (calls.length >= maxCalls) {
        // Return when the oldest call will expire
        return {
          allowed: false,
          resetTime: calls[0] + windowMs,
        };
      }
      
      calls.push(now);
      return { allowed: true };
    },
  };
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  if (length < 8 || length > 128) {
    throw new Error("Token length must be between 8 and 128 characters");
  }
  
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

// =============================================
// Export security middleware helpers
// =============================================

/**
 * Middleware to validate request body
 */
export function createValidationMiddleware<T>(
  validator: (data: any) => ValidationResult
) {
  return (data: unknown): { isValid: boolean; data?: T; error?: string } => {
    const result = validator(data);
    
    if (!result.isValid) {
      return { isValid: false, error: result.error };
    }
    
    return { isValid: true, data: result.sanitized as T };
  };
}

/**
 * Create a safe wrapper for async functions with input validation
 */
export function withValidation<T, R>(
  fn: (input: T) => Promise<R>,
  validator: (input: any) => ValidationResult
) {
  return async (input: any): Promise<{ success: boolean; data?: R; error?: string }> => {
    const validation = validator(input);
    
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }
    
    try {
      const result = await fn(validation.sanitized);
      return { success: true, data: result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  };
}
