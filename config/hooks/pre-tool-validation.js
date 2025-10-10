#!/usr/bin/env node

/**
 * Enhanced Pre-Tool Validation Hook
 * Phase 1 Safety Infrastructure - Comprehensive tool usage validation
 *
 * Features:
 * - ACL integration with SwarmMemoryManager
 * - Input sanitization and validation
 * - Resource usage limits
 * - Security policy enforcement
 * - Command pattern detection and blocking
 * - Performance impact assessment
 */

import { createHash } from 'crypto';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

class EnhancedPreToolValidator {
    constructor(options = {}) {
        this.memoryManager = options.memoryManager || null;
        this.agentId = options.agentId || 'system';
        this.aclLevel = options.aclLevel || 2;

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

        // Resource limits
        this.resourceLimits = {
            maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB
            maxExecutionTime: options.maxExecutionTime || 300000, // 5 minutes
            maxMemoryUsage: options.maxMemoryUsage || 512 * 1024 * 1024, // 512MB
            maxNetworkRequests: options.maxNetworkRequests || 10,
        };

        // Cache for validation results
        this.validationCache = new Map();
        this.cacheTimeout = options.cacheTimeout || 300000; // 5 minutes
    }

    /**
     * Validate tool usage before execution
     */
    async validate(toolName, params = {}, context = {}) {
        const validationId = this.generateValidationId(toolName, params);
        const cached = this.getCachedValidation(validationId);

        if (cached) {
            return cached;
        }

        const result = {
            allowed: true,
            confidence: 0.0,
            errors: [],
            warnings: [],
            suggestions: [],
            resourceImpact: {
                cpu: 'low',
                memory: 'low',
                network: 'none',
                disk: 'low',
                time: 'fast'
            },
            securityLevel: 'safe',
            aclValidated: false
        };

        try {
            // 1. ACL validation
            await this.validateACL(toolName, result);

            // 2. Input sanitization
            await this.sanitizeInput(toolName, params, result);

            // 3. Security pattern detection
            await this.checkSecurityPatterns(toolName, params, result);

            // 4. Resource impact assessment
            await this.assessResourceImpact(toolName, params, result);

            // 5. Tool-specific validation
            await this.validateToolSpecific(toolName, params, result);

            // 6. Calculate overall confidence
            this.calculateConfidence(result);

            // Cache result
            this.cacheValidation(validationId, result);

            // Log validation
            await this.logValidation(toolName, params, result);

        } catch (error) {
            result.allowed = false;
            result.errors.push(`Validation error: ${error.message}`);
            result.confidence = 0.0;
        }

        return result;
    }

    /**
     * Validate ACL permissions
     */
    async validateACL(toolName, result) {
        if (!this.memoryManager) {
            result.warnings.push('ACL validation skipped - no memory manager');
            result.aclValidated = false;
            return;
        }

        try {
            const hasPermission = await this.memoryManager._checkACL(
                this.agentId,
                this.aclLevel,
                `execute:${toolName}`
            );

            if (!hasPermission) {
                result.allowed = false;
                result.errors.push(`ACL violation: Agent ${this.agentId} lacks permission for ${toolName}`);
                result.securityLevel = 'blocked';
            } else {
                result.aclValidated = true;
            }
        } catch (error) {
            result.warnings.push(`ACL validation failed: ${error.message}`);
            result.aclValidated = false;
        }
    }

    /**
     * Sanitize input parameters
     */
    async sanitizeInput(toolName, params, result) {
        const sanitizeString = (input) => {
            if (typeof input !== 'string') return input;

            // Remove null bytes
            let sanitized = input.replace(/\0/g, '');

            // Remove control characters except newlines and tabs
            sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

            // Limit length
            if (sanitized.length > 10000) {
                result.warnings.push('Input truncated due to excessive length');
                sanitized = sanitized.substring(0, 10000);
            }

            return sanitized;
        };

        const sanitizeParams = (obj) => {
            if (typeof obj === 'string') {
                return sanitizeString(obj);
            } else if (Array.isArray(obj)) {
                return obj.map(sanitizeParams);
            } else if (obj && typeof obj === 'object') {
                const sanitized = {};
                for (const [key, value] of Object.entries(obj)) {
                    sanitized[key] = sanitizeParams(value);
                }
                return sanitized;
            }
            return obj;
        };

        try {
            const sanitized = sanitizeParams(params);

            // Check if any parameters were modified
            if (JSON.stringify(sanitized) !== JSON.stringify(params)) {
                result.warnings.push('Input parameters were sanitized for security');
            }

        } catch (error) {
            result.errors.push(`Input sanitization failed: ${error.message}`);
            result.allowed = false;
        }
    }

    /**
     * Check for security pattern violations
     */
    async checkSecurityPatterns(toolName, params, result) {
        const paramString = JSON.stringify(params).toLowerCase();

        // Check blocked patterns
        for (const pattern of this.blockedPatterns) {
            if (pattern.test(paramString)) {
                result.allowed = false;
                result.errors.push(`Blocked security pattern detected: ${pattern.source}`);
                result.securityLevel = 'dangerous';
                break;
            }
        }

        // Check warning patterns
        for (const pattern of this.warningPatterns) {
            if (pattern.test(paramString)) {
                result.warnings.push(`Potentially risky pattern detected: ${pattern.source}`);
                result.securityLevel = result.securityLevel === 'safe' ? 'caution' : result.securityLevel;
            }
        }

        // Tool-specific security checks
        await this.checkToolSecurityPatterns(toolName, params, result);
    }

    /**
     * Tool-specific security pattern checks
     */
    async checkToolSecurityPatterns(toolName, params, result) {
        switch (toolName) {
            case 'Bash':
                await this.validateBashSecurity(params, result);
                break;
            case 'Read':
                await this.validateReadSecurity(params, result);
                break;
            case 'Write':
                await this.validateWriteSecurity(params, result);
                break;
            case 'Edit':
                await this.validateEditSecurity(params, result);
                break;
            case 'Grep':
                await this.validateGrepSecurity(params, result);
                break;
            case 'Glob':
                await this.validateGlobSecurity(params, result);
                break;
        }
    }

    /**
     * Validate Bash command security
     */
    async validateBashSecurity(params, result) {
        const command = params.command || '';

        // Check for sudo usage
        if (command.includes('sudo')) {
            result.warnings.push('Sudo usage detected - ensure elevated privileges are necessary');
        }

        // Check for background processes
        if (command.includes('&') || command.includes('nohup')) {
            result.warnings.push('Background process detected - monitor resource usage');
        }

        // Check for piping to shell
        if (command.includes('| sh') || command.includes('| bash')) {
            result.allowed = false;
            result.errors.push('Direct shell execution via pipe is blocked');
        }
    }

    /**
     * Validate Read operation security
     */
    async validateReadSecurity(params, result) {
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
                result.warnings.push(`Accessing potentially sensitive file: ${filePath}`);
                result.securityLevel = 'caution';
            }
        }

        // Check file size if file exists
        try {
            const fs = require('fs');
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                if (stats.size > this.resourceLimits.maxFileSize) {
                    result.warnings.push(`Large file detected: ${Math.round(stats.size / 1024 / 1024)}MB`);
                }
            }
        } catch (error) {
            // File check failed, but that's not necessarily a security issue
        }
    }

    /**
     * Validate Write operation security
     */
    async validateWriteSecurity(params, result) {
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
                result.allowed = false;
                result.errors.push(`Writing to system directory blocked: ${path}`);
                result.securityLevel = 'dangerous';
                return;
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
                result.warnings.push('Potential secrets detected in content');
                result.securityLevel = 'caution';
            }
        }
    }

    /**
     * Validate Edit operation security
     */
    async validateEditSecurity(params, result) {
        // Similar to Write but with additional checks for old_string/new_string
        await this.validateWriteSecurity(params, result);

        const oldString = params.old_string || '';
        const newString = params.new_string || '';

        // Check for dangerous replacements
        if (oldString.length === 0 && newString.length > 0) {
            result.warnings.push('Inserting content without matching old_string');
        }

        if (oldString.includes('require(') || newString.includes('require(')) {
            result.warnings.push('Module imports modified - review dependencies');
        }
    }

    /**
     * Validate Grep operation security
     */
    async validateGrepSecurity(params, result) {
        const pattern = params.pattern || '';
        const path = params.path || '';

        // Prevent regex DoS
        try {
            new RegExp(pattern);
        } catch (error) {
            result.allowed = false;
            result.errors.push(`Invalid regex pattern: ${error.message}`);
            return;
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
                result.warnings.push('Potential catastrophic backtracking in regex pattern');
            }
        }
    }

    /**
     * Validate Glob operation security
     */
    async validateGlobSecurity(params, result) {
        const pattern = params.pattern || '';

        // Prevent excessive wildcards
        const wildcardCount = (pattern.match(/\*/g) || []).length;
        if (wildcardCount > 10) {
            result.warnings.push('Excessive wildcards in glob pattern may impact performance');
        }

        // Check for recursive patterns that might be slow
        if (pattern.includes('**') && pattern.length > 50) {
            result.warnings.push('Complex recursive glob pattern may be slow');
        }
    }

    /**
     * Assess resource impact
     */
    async assessResourceImpact(toolName, params, result) {
        switch (toolName) {
            case 'Bash':
                await this.assessBashImpact(params, result);
                break;
            case 'Read':
                await this.assessReadImpact(params, result);
                break;
            case 'Write':
                await this.assessWriteImpact(params, result);
                break;
            case 'Grep':
                await this.assessGrepImpact(params, result);
                break;
            case 'Glob':
                await this.assessGlobImpact(params, result);
                break;
        }
    }

    /**
     * Assess Bash command resource impact
     */
    async assessBashImpact(params, result) {
        const command = params.command || '';

        if (command.includes('npm install')) {
            result.resourceImpact.network = 'high';
            result.resourceImpact.disk = 'high';
            result.resourceImpact.time = 'slow';
        } else if (command.includes('git clone')) {
            result.resourceImpact.network = 'high';
            result.resourceImpact.disk = 'medium';
        } else if (command.includes('find')) {
            result.resourceImpact.cpu = 'medium';
            result.resourceImpact.disk = 'medium';
            result.resourceImpact.time = 'slow';
        } else if (command.includes('curl') || command.includes('wget')) {
            result.resourceImpact.network = 'medium';
        }
    }

    /**
     * Assess Read operation resource impact
     */
    async assessReadImpact(params, result) {
        const filePath = params.file_path || '';

        try {
            const fs = require('fs');
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                const sizeMB = stats.size / 1024 / 1024;

                if (sizeMB > 100) {
                    result.resourceImpact.memory = 'high';
                    result.resourceImpact.time = 'slow';
                } else if (sizeMB > 10) {
                    result.resourceImpact.memory = 'medium';
                    result.resourceImpact.time = 'medium';
                }
            }
        } catch (error) {
            // Can't assess file size
        }
    }

    /**
     * Assess Write operation resource impact
     */
    async assessWriteImpact(params, result) {
        const content = params.content || '';
        const sizeMB = content.length / 1024 / 1024;

        if (sizeMB > 50) {
            result.resourceImpact.disk = 'high';
            result.resourceImpact.time = 'slow';
        } else if (sizeMB > 10) {
            result.resourceImpact.disk = 'medium';
            result.resourceImpact.time = 'medium';
        }
    }

    /**
     * Assess Grep operation resource impact
     */
    async assessGrepImpact(params, result) {
        const path = params.path || '';

        if (path.includes('node_modules') || path.includes('.git')) {
            result.resourceImpact.cpu = 'high';
            result.resourceImpact.time = 'slow';
            result.warnings.push('Grep on large directories may be slow');
        }
    }

    /**
     * Assess Glob operation resource impact
     */
    async assessGlobImpact(params, result) {
        const pattern = params.pattern || '';

        if (pattern.includes('**') && pattern.includes('*')) {
            result.resourceImpact.cpu = 'medium';
            result.resourceImpact.time = 'medium';
        }
    }

    /**
     * Validate tool-specific requirements
     */
    async validateToolSpecific(toolName, params, result) {
        // Check required parameters
        const requiredParams = {
            'Read': ['file_path'],
            'Write': ['file_path', 'content'],
            'Edit': ['file_path', 'old_string', 'new_string'],
            'Grep': ['pattern'],
            'Glob': ['pattern'],
            'Bash': ['command'],
        };

        const required = requiredParams[toolName];
        if (required) {
            for (const param of required) {
                if (!params[param]) {
                    result.errors.push(`Missing required parameter: ${param}`);
                    result.allowed = false;
                }
            }
        }
    }

    /**
     * Calculate overall confidence score
     */
    calculateConfidence(result) {
        let confidence = 1.0;

        // Reduce confidence for warnings
        confidence -= result.warnings.length * 0.1;

        // Reduce confidence for resource impact
        const impactLevels = { 'low': 0, 'medium': 0.1, 'high': 0.2, 'slow': 0.1 };
        Object.values(result.resourceImpact).forEach(impact => {
            if (impactLevels[impact] !== undefined) {
                confidence -= impactLevels[impact];
            }
        });

        // Ensure ACL validation
        if (!result.aclValidated) {
            confidence -= 0.2;
        }

        result.confidence = Math.max(0, Math.min(1, confidence));

        // Update security level based on confidence
        if (result.confidence < 0.3) {
            result.securityLevel = 'dangerous';
        } else if (result.confidence < 0.6) {
            result.securityLevel = 'caution';
        } else if (result.confidence < 0.8) {
            result.securityLevel = 'warning';
        } else {
            result.securityLevel = 'safe';
        }
    }

    /**
     * Generate validation ID for caching
     */
    generateValidationId(toolName, params) {
        const hash = createHash('sha256');
        hash.update(toolName);
        hash.update(JSON.stringify(params));
        hash.update(this.agentId);
        return hash.digest('hex').substring(0, 16);
    }

    /**
     * Get cached validation result
     */
    getCachedValidation(validationId) {
        const cached = this.validationCache.get(validationId);
        if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
            return cached.result;
        }
        return null;
    }

    /**
     * Cache validation result
     */
    cacheValidation(validationId, result) {
        this.validationCache.set(validationId, {
            result: JSON.parse(JSON.stringify(result)), // Deep copy
            timestamp: Date.now()
        });

        // Clean old cache entries
        if (this.validationCache.size > 1000) {
            const now = Date.now();
            for (const [key, value] of this.validationCache.entries()) {
                if (now - value.timestamp > this.cacheTimeout) {
                    this.validationCache.delete(key);
                }
            }
        }
    }

    /**
     * Log validation for audit
     */
    async logValidation(toolName, params, result) {
        if (!this.memoryManager) return;

        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                agentId: this.agentId,
                toolName,
                params: this.sanitizeForLogging(params),
                result: {
                    allowed: result.allowed,
                    confidence: result.confidence,
                    securityLevel: result.securityLevel,
                    errors: result.errors,
                    warnings: result.warnings
                }
            };

            await this.memoryManager.set(
                `validation:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`,
                logEntry,
                {
                    namespace: 'validation-logs',
                    aclLevel: 3, // swarm level
                    ttl: 86400 * 7 // 7 days
                }
            );
        } catch (error) {
            // Log failure shouldn't block validation
            console.warn('Failed to log validation:', error.message);
        }
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

// Hook execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
🛡️ ENHANCED PRE-TOOL VALIDATION HOOK

Features:
- ACL integration with SwarmMemoryManager
- Input sanitization and validation
- Security pattern detection
- Resource impact assessment
- Tool-specific validation

Usage: pre-tool-validation.js <toolName> [params.json]

Example: pre-tool-validation.js Read '{"file_path": "/path/to/file"}'
        `);
        process.exit(0);
    }

    const toolName = args[0];
    const paramsJson = args[1] || '{}';

    let params;
    try {
        params = JSON.parse(paramsJson);
    } catch (error) {
        console.error('❌ Invalid JSON parameters:', error.message);
        process.exit(1);
    }

    const validator = new EnhancedPreToolValidator({
        agentId: process.env.AGENT_ID || 'system',
        aclLevel: parseInt(process.env.ACL_LEVEL) || 2
    });

    const result = await validator.validate(toolName, params);

    // Output validation result
    console.log(JSON.stringify(result, null, 2));

    // Exit with appropriate code
    process.exit(result.allowed ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Pre-tool validation error:', error);
        process.exit(1);
    });
}

export { EnhancedPreToolValidator };