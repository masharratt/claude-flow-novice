#!/usr/bin/env node

/**
 * Security Pattern Scanner
 * Specialized scanner for security pattern detection
 * Extracted from EnhancedPreToolValidator for Single Responsibility Principle
 */

import { createHash } from 'crypto';

export class SecurityPatternScanner {
    constructor() {
        // Security patterns
        this.blockedPatterns = [
            // Command injection
            /;\s*(rm|del|format|shutdown|reboot)/i,
            /\|\s*(rm|del|format|shutdown|reboot)/i,
            /&&\s*(rm|del|format|shutdown|reboot)/i,
            /"command":\s*"rm\s+(-rf|--recursive|-r)/i,

            // Path traversal
            /\.\.\//g,
            /\.\.\\/g,
            /\/etc\/passwd/i,
            /\/etc\/shadow/i,

            // Sensitive file access
            /~\/\.ssh\//i,
            /~\/\.aws\//i,
            /\.env$/i,
            /config\.json$/i,

            // Dangerous commands
            /sudo\s+rm/i,
            /chmod\s+777/i,
            /chown\s+root/i,
            /dd\s+if=/i,

            // Network attacks
            /curl.*\|\s*sh/i,
            /wget.*\|\s*sh/i,
            /nc\s+-l/i,
            /socat\s+TCP-LISTEN/i,

            // System compromise
            /export\s+PATH/i,
            /alias\s+.*=/i,
            /eval\s*\(/i,
            /\$\(.*\)/i,
        ];

        this.warningPatterns = [
            // Resource intensive
            /find\s+\.\s+-name/i,
            /grep\s+-r/i,
            /npm\s+install/i,
            /git\s+clone/i,

            // File operations (less dangerous)
            /mv\s+.*\//i,
            /cp\s+-r/i,

            // Network operations
            /curl/i,
            /wget/i,
            /ping/i,
            /telnet/i,
        ];

        // Security pattern cache
        this.patternCache = new Map();
    }

    /**
     * Check for security pattern violations
     */
    async scanSecurityPatterns(input) {
        const paramString = typeof input === 'string' ? input : JSON.stringify(input);
        const lowerString = paramString.toLowerCase();

        // Cache check for repeated scans
        const cacheKey = createHash('sha256').update(lowerString).digest('hex').substring(0, 16);
        if (this.patternCache.has(cacheKey)) {
            return this.patternCache.get(cacheKey);
        }

        // Standard JavaScript security pattern matching
        const result = {
            blocked: false,
            pattern: null,
            warnings: [],
            securityLevel: 'safe'
        };

        // Check blocked patterns
        for (const pattern of this.blockedPatterns) {
            if (pattern.test(lowerString)) {
                result.blocked = true;
                result.pattern = pattern.source;
                result.securityLevel = 'dangerous';
                break;
            }
        }

        // Check warning patterns
        for (const pattern of this.warningPatterns) {
            if (pattern.test(lowerString)) {
                result.warnings.push(pattern.source);
                result.securityLevel = result.securityLevel === 'safe' ? 'caution' : result.securityLevel;
            }
        }

        // Cache the result
        this.patternCache.set(cacheKey, result);

        // Limit cache size to prevent memory issues
        if (this.patternCache.size > 500) {
            const firstKey = this.patternCache.keys().next().value;
            this.patternCache.delete(firstKey);
        }

        return result;
    }

    /**
     * Tool-specific security checks
     */
    async checkToolSecurity(toolName, params) {
        const checks = {
            Bash: () => this.validateBashSecurity(params),
            Read: () => this.validateReadSecurity(params),
            Write: () => this.validateWriteSecurity(params),
            Edit: () => this.validateEditSecurity(params),
            Grep: () => this.validateGrepSecurity(params),
            Glob: () => this.validateGlobSecurity(params),
        };

        const checkFn = checks[toolName];
        if (checkFn) {
            return await checkFn();
        }

        return { warnings: [], errors: [] };
    }

    /**
     * Validate Bash command security
     */
    async validateBashSecurity(params) {
        const warnings = [];
        const errors = [];
        const command = params.command || '';

        // Check for sudo usage
        if (command.includes('sudo')) {
            warnings.push('Sudo usage detected - ensure elevated privileges are necessary');
        }

        // Check for background processes
        if (command.includes('&') || command.includes('nohup')) {
            warnings.push('Background process detected - monitor resource usage');
        }

        // Check for piping to shell
        if (command.includes('| sh') || command.includes('| bash')) {
            errors.push('Direct shell execution via pipe is blocked');
        }

        return { warnings, errors };
    }

    /**
     * Validate Read operation security
     */
    async validateReadSecurity(params) {
        const warnings = [];
        const filePath = params.file_path || '';

        // Check for sensitive file patterns
        const sensitivePatterns = [
            /\.env$/,
            /config\.json$/,
            /private.*key/,
            /\/\.ssh\//,
            /\/\.aws\//,
            /password/,
            /secret/,
            /token/,
        ];

        for (const pattern of sensitivePatterns) {
            if (pattern.test(filePath.toLowerCase())) {
                warnings.push(`Accessing potentially sensitive file: ${filePath}`);
            }
        }

        return { warnings, errors: [] };
    }

    /**
     * Validate Write operation security
     */
    async validateWriteSecurity(params) {
        const warnings = [];
        const errors = [];
        const filePath = params.file_path || '';
        const content = params.content || '';

        // Prevent writing to system directories
        const systemPaths = [
            '/bin/',
            '/sbin/',
            '/usr/bin/',
            '/usr/sbin/',
            '/etc/',
            '/var/',
            '/sys/',
            '/proc/',
        ];

        for (const path of systemPaths) {
            if (filePath.startsWith(path)) {
                errors.push(`Writing to system directory blocked: ${path}`);
                return { warnings, errors };
            }
        }

        // Check for secrets in content
        const secretPatterns = [
            /password\s*[:=]\s*\S+/i,
            /secret\s*[:=]\s*\S+/i,
            /token\s*[:=]\s*\S+/i,
            /api[_-]?key\s*[:=]\s*\S+/i,
        ];

        for (const pattern of secretPatterns) {
            if (pattern.test(content)) {
                warnings.push('Potential secrets detected in content');
            }
        }

        return { warnings, errors };
    }

    /**
     * Validate Edit operation security
     */
    async validateEditSecurity(params) {
        const result = await this.validateWriteSecurity(params);
        const oldString = params.old_string || '';
        const newString = params.new_string || '';

        // Check for dangerous replacements
        if (oldString.length === 0 && newString.length > 0) {
            result.warnings.push('Inserting content without matching old_string');
        }

        if (oldString.includes('require(') || newString.includes('require(')) {
            result.warnings.push('Module imports modified - review dependencies');
        }

        return result;
    }

    /**
     * Validate Grep operation security
     */
    async validateGrepSecurity(params) {
        const warnings = [];
        const errors = [];
        const pattern = params.pattern || '';

        // Prevent regex DoS
        try {
            new RegExp(pattern);
        } catch (error) {
            errors.push(`Invalid regex pattern: ${error.message}`);
            return { warnings, errors };
        }

        // Check for catastrophic backtracking patterns
        const catastrophicPatterns = [
            /\(.*\)\+/,
            /\(.*\)\*/,
            /.*\+.*\+/,
            /.*\*.*\*/,
        ];

        for (const catPattern of catastrophicPatterns) {
            if (catPattern.test(pattern)) {
                warnings.push('Potential catastrophic backtracking in regex pattern');
            }
        }

        return { warnings, errors };
    }

    /**
     * Validate Glob operation security
     */
    async validateGlobSecurity(params) {
        const warnings = [];
        const pattern = params.pattern || '';

        // Prevent excessive wildcards
        const wildcardCount = (pattern.match(/\*/g) || []).length;
        if (wildcardCount > 10) {
            warnings.push('Excessive wildcards in glob pattern may impact performance');
        }

        // Check for recursive patterns that might be slow
        if (pattern.includes('**') && pattern.length > 50) {
            warnings.push('Complex recursive glob pattern may be slow');
        }

        return { warnings, errors: [] };
    }
}
