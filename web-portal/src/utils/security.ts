/**
 * Security Utilities for Frontend Application
 * Comprehensive security measures for XSS protection, input validation, and secure data handling
 */

// Content Security Policy helper
export const CSP_CONSTANTS = {
  DEFAULT_SRC: "'self'",
  SCRIPT_SRC: "'self' 'unsafe-inline' 'unsafe-eval'",
  STYLE_SRC: "'self' 'unsafe-inline'",
  IMG_SRC: "'self' data: https:",
  CONNECT_SRC: "'self' ws: wss:",
  FONT_SRC: "'self' data:",
  OBJECT_SRC: "'none'",
  MEDIA_SRC: "'self'",
  FRAME_SRC: "'none'",
  CHILD_SRC: "'none'",
  WORKER_SRC: "'self'",
  MANIFEST_SRC: "'self'",
  UPGRADE_INSECURE_REQUESTS: true
};

// Security headers helper
export const addSecurityHeaders = (headers: Record<string, string>) => {
  return {
    ...headers,
    'Content-Security-Policy': Object.entries(CSP_CONSTANTS)
      .map(([key, value]) => {
        const cspKey = key.replace('_', '-').toLowerCase();
        return `${cspKey} ${Array.isArray(value) ? value.join(' ') : value}`;
      })
      .join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };
};

// Sanitization utilities
export class ContentSanitizer {
  private static allowedTags = [
    'p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'code', 'pre'
  ];

  private static allowedAttributes = {
    'a': ['href', 'title', 'target'],
    'img': ['src', 'alt', 'title', 'width', 'height']
  };

  private static dangerousPatterns = [
    /javascript:/gi,
    /data:(?!image\/)/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,
    /<script/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /<link/gi,
    /<meta/gi,
    /@import/gi,
    /expression\(/gi
  ];

  static sanitizeHTML(html: string): string {
    let sanitized = html;

    // Remove dangerous patterns
    this.dangerousPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Basic HTML tag removal for now (will be enhanced with DOMPurify)
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Encode special characters
    sanitized = this.encodeHTMLEntities(sanitized);

    return sanitized;
  }

  static sanitizeText(text: string): string {
    return this.encodeHTMLEntities(text)
      .replace(/[\x00-\x1F\x7F]/g, '')
      .substring(0, 10000)
      .trim();
  }

  static sanitizeURL(url: string): string {
    try {
      const parsed = new URL(url, window.location.origin);

      // Only allow http, https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return '#';
      }

      // Remove dangerous parts
      parsed.hash = '';
      parsed.username = '';
      parsed.password = '';

      return parsed.toString();
    } catch {
      return '#';
    }
  }

  private static encodeHTMLEntities(text: string): string {
    const entityMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;'
    };

    return text.replace(/[&<>"'/]/g, char => entityMap[char] || char);
  }

  static validateCSS(css: string): boolean {
    const dangerousCSS = [
      /javascript:/gi,
      /expression\(/gi,
      /@import/gi,
      /binding\(/gi,
      /behavior\s*:/gi
    ];

    return !dangerousCSS.some(pattern => pattern.test(css));
  }
}

// Input validation utilities
export class InputValidator {
  private static patterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    url: /^https?:\/\/.+/,
    phone: /^\+?[\d\s\-\(\)]+$/,
    alphanumeric: /^[a-zA-Z0-9]+$/,
    numeric: /^[0-9]*\.?[0-9]+$/,
    safeFilename: /^[a-zA-Z0-9._-]+$/
  };

  static validateEmail(email: string): boolean {
    return this.patterns.email.test(email) && email.length <= 254;
  }

  static validateURL(url: string): boolean {
    return this.patterns.url.test(url) && url.length <= 2048;
  }

  static validatePhone(phone: string): boolean {
    return this.patterns.phone.test(phone) && phone.length <= 20;
  }

  static validateLength(input: string, min: number, max: number): boolean {
    return input.length >= min && input.length <= max;
  }

  static validateNoSQL(input: string): boolean {
    const noSQLPatterns = [
      /\$where/gi,
      /\$gt/gi,
      /\$lt/gi,
      /\$ne/gi,
      /\$in/gi,
      /\$nin/gi,
      /\{.*\$.*\}/gi,
      /javascript:/gi,
      /eval\(/gi
    ];

    return !noSQLPatterns.some(pattern => pattern.test(input));
  }

  static validateSQL(input: string): boolean {
    const sqlPatterns = [
      /drop\s+table/gi,
      /delete\s+from/gi,
      /insert\s+into/gi,
      /update\s+.*set/gi,
      /union\s+select/gi,
      /exec\s*\(/gi,
      /script\s*>/gi,
      /--/gi,
      /\/\*/gi,
      /\*\//gi
    ];

    return !sqlPatterns.some(pattern => pattern.test(input));
  }

  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase()
      .substring(0, 255);
  }
}

// CSRF protection utilities
export class CSRFProtection {
  private static token: string | null = null;

  static generateToken(): string {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    this.token = token;
    this.storeToken(token);

    return token;
  }

  static getToken(): string | null {
    if (!this.token) {
      this.token = this.retrieveToken();
    }
    return this.token;
  }

  static validateToken(token: string): boolean {
    const storedToken = this.getToken();
    return storedToken !== null && storedToken === token;
  }

  private static storeToken(token: string): void {
    try {
      sessionStorage.setItem('csrf-token', token);
    } catch (error) {
      console.warn('Could not store CSRF token:', error);
    }
  }

  private static retrieveToken(): string | null {
    try {
      return sessionStorage.getItem('csrf-token');
    } catch (error) {
      console.warn('Could not retrieve CSRF token:', error);
      return null;
    }
  }

  static addToFormData(formData: FormData): void {
    const token = this.getToken();
    if (token) {
      formData.append('csrf-token', token);
    }
  }

  static addToHeaders(headers: Record<string, string>): void {
    const token = this.getToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }
}

// Secure storage utilities
export class SecureStorage {
  private static encryptionKey = 'claude-flow-secure-storage';

  static setItem(key: string, value: any, useEncryption = true): void {
    try {
      const serializedValue = JSON.stringify(value);
      const finalValue = useEncryption ? this.simpleEncrypt(serializedValue) : serializedValue;

      localStorage.setItem(key, finalValue);
    } catch (error) {
      console.warn('Could not store item:', error);
    }
  }

  static getItem<T>(key: string, useEncryption = true): T | null {
    try {
      const storedValue = localStorage.getItem(key);
      if (!storedValue) return null;

      const decryptedValue = useEncryption ? this.simpleDecrypt(storedValue) : storedValue;
      return JSON.parse(decryptedValue) as T;
    } catch (error) {
      console.warn('Could not retrieve item:', error);
      return null;
    }
  }

  static removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Could not remove item:', error);
    }
  }

  static clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.warn('Could not clear storage:', error);
    }
  }

  private static simpleEncrypt(text: string): string {
    // Simple XOR encryption (not production-grade, but better than plaintext)
    const key = this.encryptionKey;
    let result = '';

    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }

    return btoa(result);
  }

  private static simpleDecrypt(encryptedText: string): string {
    try {
      const key = this.encryptionKey;
      const decoded = atob(encryptedText);
      let result = '';

      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(
          decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
      }

      return result;
    } catch (error) {
      return '';
    }
  }
}

// Security event logging
export class SecurityLogger {
  private static logEndpoint = '/api/security-events';

  static logSecurityEvent(
    event: {
      type: 'xss_attempt' | 'csrf_failure' | 'invalid_input' | 'unauthorized_access';
      severity: 'low' | 'medium' | 'high' | 'critical';
      details: Record<string, any>;
      timestamp?: number;
    }
  ): void {
    const securityEvent = {
      ...event,
      timestamp: event.timestamp || Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: this.getSessionId()
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('Security Event:', securityEvent);
    }

    // Store locally for debugging
    this.storeLocalEvent(securityEvent);

    // Send to server (in production)
    if (process.env.NODE_ENV === 'production') {
      this.sendToServer(securityEvent);
    }
  }

  private static getSessionId(): string {
    let sessionId = sessionStorage.getItem('security-session-id');
    if (!sessionId) {
      sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('security-session-id', sessionId);
    }
    return sessionId;
  }

  private static storeLocalEvent(event: any): void {
    try {
      const events = JSON.parse(localStorage.getItem('security-events') || '[]');
      events.push(event);

      // Keep only last 100 events
      if (events.length > 100) {
        events.splice(0, events.length - 100);
      }

      localStorage.setItem('security-events', JSON.stringify(events));
    } catch (error) {
      console.warn('Could not store security event:', error);
    }
  }

  private static async sendToServer(event: any): Promise<void> {
    try {
      await fetch(this.logEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      });
    } catch (error) {
      console.warn('Could not send security event to server:', error);
    }
  }
}

// Rate limiting utilities
export class RateLimiter {
  private static attempts: Map<string, number[]> = new Map();

  static isAllowed(
    identifier: string,
    maxAttempts: number = 5,
    windowMs: number = 60000
  ): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];

    // Remove old attempts outside the window
    const validAttempts = attempts.filter(timestamp => now - timestamp < windowMs);

    if (validAttempts.length >= maxAttempts) {
      SecurityLogger.logSecurityEvent({
        type: 'unauthorized_access',
        severity: 'medium',
        details: {
          action: 'rate_limit_exceeded',
          identifier,
          attempts: validAttempts.length
        }
      });
      return false;
    }

    // Add current attempt
    validAttempts.push(now);
    this.attempts.set(identifier, validAttempts);

    return true;
  }

  static getRemainingAttempts(
    identifier: string,
    maxAttempts: number = 5,
    windowMs: number = 60000
  ): number {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];
    const validAttempts = attempts.filter(timestamp => now - timestamp < windowMs);

    return Math.max(0, maxAttempts - validAttempts.length);
  }

  static reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

// Security configuration
export const SECURITY_CONFIG = {
  // Input limits
  MAX_INPUT_LENGTH: 10000,
  MAX_FILENAME_LENGTH: 255,
  MAX_URL_LENGTH: 2048,

  // Rate limiting
  RATE_LIMIT: {
    LOGIN_ATTEMPTS: 5,
    LOGIN_WINDOW: 15 * 60 * 1000, // 15 minutes
    API_REQUESTS: 100,
    API_WINDOW: 60 * 1000 // 1 minute
  },

  // Password requirements
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBERS: true,
    REQUIRE_SPECIAL_CHARS: true
  },

  // Session settings
  SESSION: {
    TIMEOUT: 30 * 60 * 1000, // 30 minutes
    WARNING_TIMEOUT: 5 * 60 * 1000, // 5 minutes before timeout
    RENEWAL_THRESHOLD: 5 * 60 * 1000 // Renew if less than 5 minutes left
  }
};