/**
 * RuVector Security Configuration Manager
 *
 * Centralized security settings and validation for:
 * - Encryption configuration (AES-256-GCM)
 * - Authentication methods (API key, JWT)
 * - RBAC enforcement settings
 * - Audit logging configuration
 * - Rate limiting parameters
 * - Session timeout settings
 * - Key rotation intervals
 *
 * Security Features:
 * - Environment variable validation on startup
 * - Minimum strength requirements for secrets
 * - Configuration validation and type safety
 * - Security header configuration
 * - Cryptographic algorithm strength validation
 * - No default/hardcoded secrets
 * - Comprehensive logging of configuration status
 *
 * CVSS Mitigation: Addresses security misconfiguration (OWASP A05)
 * Compliance: Supports NIST SC-2 (Access Enforcement)
 */

import * as crypto from 'crypto';
import { createLogger } from './logging.js';

const logger = createLogger('security-config');

/**
 * Security configuration constants
 */
export const SECURITY_DEFAULTS = {
  ENCRYPTION_ALGORITHM: 'aes-256-gcm' as const,
  ENCRYPTION_KEY_LENGTH: 32, // 256 bits
  JWT_ALGORITHM: 'HS256' as const,
  MIN_SECRET_LENGTH: 32, // 256 bits minimum
  SESSION_TIMEOUT_HOURS: 24,
  KEY_ROTATION_DAYS: 90,
  RATE_LIMIT_PER_MINUTE: 1000,
  RATE_LIMIT_PER_HOUR: 50000,
  RATE_LIMIT_PER_DAY: 500000,
  AUDIT_RETENTION_DAYS: 90,
  AUDIT_ARCHIVE_DAYS: 30,
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_REQUIRE_UPPERCASE: true,
  PASSWORD_REQUIRE_NUMBERS: true,
  PASSWORD_REQUIRE_SYMBOLS: true,
} as const;

/**
 * Security configuration validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  timestamp: Date;
}

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  algorithm: 'aes-256-gcm';
  key_length_bytes: number;
  key_present: boolean;
  key_valid: boolean;
  key_strength: 'weak' | 'strong';
}

/**
 * Authentication configuration
 */
export interface AuthenticationConfig {
  method: 'api-key' | 'jwt' | 'oauth2';
  api_key_required: boolean;
  jwt_secret_present: boolean;
  jwt_algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256';
  session_timeout_hours: number;
}

/**
 * RBAC configuration
 */
export interface RBACConfig {
  enforcement_enabled: boolean;
  default_deny: boolean;
  role_hierarchy: string[];
  collection_level_control: boolean;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitingConfig {
  enabled: boolean;
  per_minute: number;
  per_hour: number;
  per_day: number;
  burst_capacity: number;
}

/**
 * Audit logging configuration
 */
export interface AuditConfig {
  enabled: boolean;
  backend: 'postgres' | 'file' | 'syslog';
  retention_days: number;
  archive_enabled: boolean;
  archive_days: number;
  tamper_detection_enabled: boolean;
}

/**
 * Complete security configuration
 */
export interface SecurityConfiguration {
  encryption: EncryptionConfig;
  authentication: AuthenticationConfig;
  rbac: RBACConfig;
  rate_limiting: RateLimitingConfig;
  audit: AuditConfig;
  security_headers: Record<string, string>;
  timestamp: Date;
}

/**
 * RuVector Security Configuration Manager
 */
export class SecurityConfig {
  private config: SecurityConfiguration | null = null;
  private validationResult: ValidationResult | null = null;

  /**
   * Initialize and validate security configuration from environment
   */
  async initialize(): Promise<ValidationResult> {
    try {
      this.config = this.buildConfigFromEnvironment();
      this.validationResult = this.validateConfiguration();

      if (!this.validationResult.valid) {
        logger.error('Security configuration validation failed', {
          errors: this.validationResult.errors,
          warnings: this.validationResult.warnings,
        });
        throw new Error(`Security configuration invalid: ${this.validationResult.errors.join(', ')}`);
      }

      logger.info('Security configuration initialized successfully', {
        warnings: this.validationResult.warnings,
      });

      return this.validationResult;
    } catch (error) {
      logger.error('Failed to initialize security configuration', { error });
      throw error;
    }
  }

  /**
   * Build configuration from environment variables
   */
  private buildConfigFromEnvironment(): SecurityConfiguration {
    const env = process.env;

    return {
      encryption: {
        algorithm: 'aes-256-gcm',
        key_length_bytes: SECURITY_DEFAULTS.ENCRYPTION_KEY_LENGTH,
        key_present: !!env.RUVECTOR_BACKUP_KEY,
        key_valid: this.validateEncryptionKey(env.RUVECTOR_BACKUP_KEY),
        key_strength: this.checkKeyStrength(env.RUVECTOR_BACKUP_KEY) ? 'strong' : 'weak',
      },
      authentication: {
        method: (env.RUVECTOR_AUTH_METHOD as any) ?? 'api-key',
        api_key_required: env.RUVECTOR_REQUIRE_API_KEY !== 'false',
        jwt_secret_present: !!env.RUVECTOR_JWT_SECRET,
        jwt_algorithm: (env.RUVECTOR_JWT_ALGORITHM as any) ?? 'HS256',
        session_timeout_hours: parseInt(env.RUVECTOR_SESSION_TIMEOUT_HOURS ?? '24', 10),
      },
      rbac: {
        enforcement_enabled: env.RUVECTOR_RBAC_ENABLED !== 'false',
        default_deny: env.RUVECTOR_RBAC_DEFAULT_DENY !== 'false',
        role_hierarchy: this.parseRoleHierarchy(env.RUVECTOR_ROLE_HIERARCHY),
        collection_level_control: env.RUVECTOR_COLLECTION_ACL_ENABLED !== 'false',
      },
      rate_limiting: {
        enabled: env.RUVECTOR_RATE_LIMITING_ENABLED !== 'false',
        per_minute: parseInt(env.RUVECTOR_RATE_LIMIT_PER_MINUTE ?? '1000', 10),
        per_hour: parseInt(env.RUVECTOR_RATE_LIMIT_PER_HOUR ?? '50000', 10),
        per_day: parseInt(env.RUVECTOR_RATE_LIMIT_PER_DAY ?? '500000', 10),
        burst_capacity: parseInt(env.RUVECTOR_BURST_CAPACITY ?? '100', 10),
      },
      audit: {
        enabled: env.RUVECTOR_AUDIT_ENABLED !== 'false',
        backend: (env.RUVECTOR_AUDIT_BACKEND as any) ?? 'postgres',
        retention_days: parseInt(env.RUVECTOR_AUDIT_RETENTION_DAYS ?? '90', 10),
        archive_enabled: env.RUVECTOR_AUDIT_ARCHIVE_ENABLED !== 'false',
        archive_days: parseInt(env.RUVECTOR_AUDIT_ARCHIVE_DAYS ?? '30', 10),
        tamper_detection_enabled: env.RUVECTOR_AUDIT_TAMPER_DETECTION !== 'false',
      },
      security_headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Content-Security-Policy': env.RUVECTOR_CSP_HEADER ?? "default-src 'self'",
        'Strict-Transport-Security':
          env.RUVECTOR_HSTS_HEADER ?? 'max-age=31536000; includeSubDomains',
      },
      timestamp: new Date(),
    };
  }

  /**
   * Validate encryption key strength and format
   */
  private validateEncryptionKey(key?: string): boolean {
    if (!key) {
      return false;
    }

    try {
      // Key should be hex-encoded 32-byte value (64 characters)
      if (!/^[0-9a-fA-F]{64}$/.test(key)) {
        logger.warn('Encryption key format invalid', { length: key.length });
        return false;
      }

      const keyBuffer = Buffer.from(key, 'hex');
      return keyBuffer.length === SECURITY_DEFAULTS.ENCRYPTION_KEY_LENGTH;
    } catch (error) {
      logger.error('Encryption key validation failed', { error });
      return false;
    }
  }

  /**
   * Check if key meets strength requirements
   */
  private checkKeyStrength(key?: string): boolean {
    if (!key) {
      return false;
    }

    // Key should be at least 32 bytes (256 bits)
    return key.length >= SECURITY_DEFAULTS.MIN_SECRET_LENGTH;
  }

  /**
   * Parse role hierarchy from environment variable
   */
  private parseRoleHierarchy(hierarchyStr?: string): string[] {
    if (!hierarchyStr) {
      return ['viewer', 'editor', 'admin', 'super_admin'];
    }

    try {
      return hierarchyStr.split(',').map((r) => r.trim());
    } catch (error) {
      logger.warn('Failed to parse role hierarchy, using defaults', { error });
      return ['viewer', 'editor', 'admin', 'super_admin'];
    }
  }

  /**
   * Validate complete security configuration
   */
  private validateConfiguration(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.config) {
      errors.push('Configuration not initialized');
      return { valid: false, errors, warnings, timestamp: new Date() };
    }

    // Validate encryption
    if (!this.config.encryption.key_present) {
      errors.push('RUVECTOR_BACKUP_KEY environment variable not set (required for encryption)');
    }

    if (this.config.encryption.key_present && !this.config.encryption.key_valid) {
      errors.push('RUVECTOR_BACKUP_KEY format invalid (must be 64-char hex string)');
    }

    if (this.config.encryption.key_present && this.config.encryption.key_strength === 'weak') {
      warnings.push('RUVECTOR_BACKUP_KEY appears weak (less than 32 bytes)');
    }

    // Validate authentication
    if (this.config.authentication.method === 'jwt' && !this.config.authentication.jwt_secret_present) {
      errors.push('JWT authentication configured but RUVECTOR_JWT_SECRET not set');
    }

    if (this.config.authentication.session_timeout_hours < 1) {
      errors.push('Session timeout must be at least 1 hour');
    }

    // Validate RBAC
    if (this.config.rbac.enforcement_enabled && !this.config.rbac.default_deny) {
      warnings.push('RBAC enabled but default-deny policy not enforced');
    }

    // Validate rate limiting
    if (this.config.rate_limiting.enabled) {
      if (this.config.rate_limiting.per_minute < 1) {
        errors.push('Rate limit per_minute must be >= 1');
      }
      if (this.config.rate_limiting.burst_capacity > this.config.rate_limiting.per_minute) {
        errors.push('Burst capacity cannot exceed per_minute limit');
      }
    }

    // Validate audit
    if (this.config.audit.enabled && this.config.audit.retention_days < 1) {
      errors.push('Audit retention days must be >= 1');
    }

    if (this.config.audit.archive_enabled && this.config.audit.archive_days > this.config.audit.retention_days) {
      errors.push('Archive days cannot exceed retention days');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date(),
    };
  }

  /**
   * Get current configuration
   */
  getConfiguration(): SecurityConfiguration {
    if (!this.config) {
      throw new Error('Security configuration not initialized');
    }
    return { ...this.config };
  }

  /**
   * Get validation result
   */
  getValidationResult(): ValidationResult {
    if (!this.validationResult) {
      throw new Error('Configuration not validated');
    }
    return { ...this.validationResult };
  }

  /**
   * Check if encryption is properly configured
   */
  isEncryptionEnabled(): boolean {
    if (!this.config) return false;
    return this.config.encryption.key_present && this.config.encryption.key_valid;
  }

  /**
   * Check if RBAC is enforced
   */
  isRBACEnabled(): boolean {
    if (!this.config) return false;
    return this.config.rbac.enforcement_enabled && this.config.rbac.default_deny;
  }

  /**
   * Check if audit logging is enabled
   */
  isAuditEnabled(): boolean {
    if (!this.config) return false;
    return this.config.audit.enabled;
  }

  /**
   * Check if rate limiting is enabled
   */
  isRateLimitingEnabled(): boolean {
    if (!this.config) return false;
    return this.config.rate_limiting.enabled;
  }

  /**
   * Get security headers for HTTP responses
   */
  getSecurityHeaders(): Record<string, string> {
    if (!this.config) {
      return {};
    }
    return { ...this.config.security_headers };
  }

  /**
   * Validate session timeout (in hours)
   */
  validateSessionTimeout(hours: number): boolean {
    return hours > 0 && hours <= 720; // Max 30 days
  }

  /**
   * Validate password complexity
   */
  validatePasswordComplexity(password: string): {
    valid: boolean;
    requirements: Record<string, boolean>;
  } {
    const requirements = {
      length: password.length >= SECURITY_DEFAULTS.PASSWORD_MIN_LENGTH,
      uppercase: SECURITY_DEFAULTS.PASSWORD_REQUIRE_UPPERCASE
        ? /[A-Z]/.test(password)
        : true,
      numbers: SECURITY_DEFAULTS.PASSWORD_REQUIRE_NUMBERS ? /[0-9]/.test(password) : true,
      symbols: SECURITY_DEFAULTS.PASSWORD_REQUIRE_SYMBOLS ? /[!@#$%^&*]/.test(password) : true,
    };

    const valid = Object.values(requirements).every((r) => r);

    return { valid, requirements };
  }

  /**
   * Generate a cryptographically secure random key
   */
  generateRandomKey(lengthBytes: number = 32): string {
    const buffer = crypto.randomBytes(lengthBytes);
    return buffer.toString('hex');
  }

  /**
   * Validate API key format and strength
   */
  validateAPIKey(apiKey: string): boolean {
    // API key should be at least 32 characters
    if (apiKey.length < 32) {
      return false;
    }

    // Should contain mix of characters
    const hasAlpha = /[a-zA-Z]/.test(apiKey);
    const hasNumbers = /[0-9]/.test(apiKey);

    return hasAlpha && hasNumbers;
  }

  /**
   * Get a summary of security posture
   */
  getSecuritySummary(): {
    encryption_status: 'enabled' | 'disabled' | 'misconfigured';
    authentication_status: 'strong' | 'weak' | 'misconfigured';
    rbac_status: 'enforced' | 'permissive' | 'disabled';
    audit_status: 'enabled' | 'disabled';
    rate_limiting_status: 'enabled' | 'disabled';
    overall_score: number;
  } {
    if (!this.config) {
      return {
        encryption_status: 'disabled',
        authentication_status: 'weak',
        rbac_status: 'disabled',
        audit_status: 'disabled',
        rate_limiting_status: 'disabled',
        overall_score: 0.0,
      };
    }

    let score = 0.0;

    // Encryption (25%)
    const encryptionStatus = this.config.encryption.key_valid ? 'enabled' : 'disabled';
    if (this.config.encryption.key_valid && this.config.encryption.key_strength === 'strong') {
      score += 0.25;
    }

    // Authentication (25%)
    const authStatus = this.config.authentication.jwt_secret_present ? 'strong' : 'weak';
    if (this.config.authentication.jwt_secret_present) {
      score += 0.25;
    }

    // RBAC (20%)
    const rbacStatus =
      this.config.rbac.enforcement_enabled && this.config.rbac.default_deny
        ? 'enforced'
        : 'permissive';
    if (rbacStatus === 'enforced') {
      score += 0.2;
    }

    // Audit (15%)
    const auditStatus = this.config.audit.enabled ? 'enabled' : 'disabled';
    if (this.config.audit.enabled) {
      score += 0.15;
    }

    // Rate limiting (15%)
    const rateLimitStatus = this.config.rate_limiting.enabled ? 'enabled' : 'disabled';
    if (this.config.rate_limiting.enabled) {
      score += 0.15;
    }

    return {
      encryption_status: encryptionStatus as any,
      authentication_status: authStatus as any,
      rbac_status: rbacStatus as any,
      audit_status: auditStatus as any,
      rate_limiting_status: rateLimitStatus as any,
      overall_score: parseFloat(score.toFixed(2)),
    };
  }
}

/**
 * Create a singleton security configuration instance
 */
let securityConfigInstance: SecurityConfig | null = null;

export async function getSecurityConfig(): Promise<SecurityConfig> {
  if (!securityConfigInstance) {
    securityConfigInstance = new SecurityConfig();
    await securityConfigInstance.initialize();
  }
  return securityConfigInstance;
}

/**
 * Initialize security configuration at startup
 */
export async function initializeSecurityConfig(): Promise<ValidationResult> {
  const config = new SecurityConfig();
  const result = await config.initialize();

  if (!result.valid) {
    logger.error('CRITICAL: Security configuration validation failed on startup', {
      errors: result.errors,
    });
    process.exit(1);
  }

  logger.info('Security configuration validated at startup', {
    status: 'VALID',
    warnings: result.warnings.length,
  });

  securityConfigInstance = config;
  return result;
}
