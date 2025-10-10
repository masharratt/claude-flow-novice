#!/usr/bin/env node

/**
 * Input Sanitizer
 * Specialized input sanitization and validation
 * Extracted from EnhancedPreToolValidator for Single Responsibility Principle
 */

export class InputSanitizer {
    constructor() {
        this.maxInputLength = 10000;
    }

    /**
     * Sanitize input parameters
     */
    async sanitizeInput(params) {
        const warnings = [];

        // Standard JavaScript sanitization
        const sanitized = this.sanitizeParams(params, warnings);
        return { sanitized, warnings };
    }

    /**
     * Recursively sanitize parameters
     */
    sanitizeParams(obj, warnings = []) {
        if (typeof obj === 'string') {
            return this.sanitizeString(obj, warnings);
        } else if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeParams(item, warnings));
        } else if (obj && typeof obj === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[key] = this.sanitizeParams(value, warnings);
            }
            return sanitized;
        }
        return obj;
    }

    /**
     * Sanitize a single string
     */
    sanitizeString(input, warnings = []) {
        if (typeof input !== 'string') return input;

        // Remove null bytes
        let sanitized = input.replace(/\0/g, '');

        // Remove control characters except newlines and tabs
        sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

        // Limit length
        if (sanitized.length > this.maxInputLength) {
            warnings.push('Input truncated due to excessive length');
            sanitized = sanitized.substring(0, this.maxInputLength);
        }

        return sanitized;
    }

    /**
     * Decode content variants to detect obfuscation
     */
    decodeBeforeValidation(params) {
        const paramsString = JSON.stringify(params);
        const variants = [paramsString];

        // Attempt Base64 decoding
        const base64Matches = paramsString.match(/atob\s*\(\s*['"]([A-Za-z0-9+/=]{20,})['"]\)/gi);
        if (base64Matches) {
            base64Matches.forEach(match => {
                try {
                    const encoded = match.match(/['"]([A-Za-z0-9+/=]+)['"]/)[1];
                    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
                    variants.push(decoded);
                } catch (e) {
                    // Invalid Base64, skip
                }
            });
        }

        // Attempt direct Base64 pattern detection
        const base64Pattern = /[A-Za-z0-9+/]{40,}={0,2}/g;
        const base64Strings = paramsString.match(base64Pattern);
        if (base64Strings) {
            base64Strings.forEach(encoded => {
                try {
                    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
                    // Only add if decoded looks like text (not binary)
                    if (/^[\x20-\x7E\s]+$/.test(decoded)) {
                        variants.push(decoded);
                    }
                } catch (e) {
                    // Invalid Base64, skip
                }
            });
        }

        return variants;
    }

    /**
     * Detect zero-width characters (obfuscation technique)
     */
    detectZeroWidth(content) {
        const zeroWidthPattern = /[\u200B-\u200D\uFEFF]/g;
        return zeroWidthPattern.test(content);
    }

    /**
     * Sanitize params for logging (remove sensitive data)
     */
    sanitizeForLogging(params) {
        const sanitized = { ...params };

        // Remove sensitive fields
        const sensitiveFields = ['password', 'secret', 'token', 'key', 'auth'];
        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }

        // Truncate long content
        if (sanitized.content && sanitized.content.length > 1000) {
            sanitized.content = sanitized.content.substring(0, 1000) + '...[TRUNCATED]';
        }

        return sanitized;
    }
}
