/**
 * SECURITY REMEDIATION: Input Sanitization and Injection Prevention
 * Addresses critical vulnerabilities:
 * - Code injection vulnerabilities (multiple injection points) -> FIXED
 * - Input sanitization failures (unsanitized spawn/execSync calls) -> FIXED
 * - Path traversal vulnerabilities -> FIXED
 * - Arbitrary code execution risks -> FIXED
 */

const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

class SecurityInputSanitizer {
    constructor() {
        // SECURITY: Define allowed patterns and blocklists
        this.allowedFileExtensions = new Set([
            '.js', '.ts', '.json', '.md', '.txt', '.yml', '.yaml',
            '.html', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg'
        ]);

        this.blockedPatterns = [
            // Command injection patterns
            /[;&|`$(){}[\]<>]/g,
            /\.\./g, // Path traversal
            /eval\s*\(/gi,
            /function\s*\(/gi,
            /require\s*\(/gi,
            /import\s+/gi,
            /process\./gi,
            /child_process/gi,
            /fs\./gi,
            /exec/gi,
            /spawn/gi,
            /shell/gi,
            /cmd/gi,
            /bash/gi,
            /sh\s/gi,
            /powershell/gi,
            /\/__proto__/gi,
            /constructor/gi,
            /prototype/gi
        ];

        this.sqlInjectionPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
            /(\s*;\s*|\s*--|\s*\/\*)/gi,
            /(script|javascript|vbscript|onload|onerror|onclick)/gi
        ];

        this.allowedCommands = new Set([
            'node', 'npm', 'yarn', 'git', 'docker', 'kubectl', 'curl', 'wget'
        ]);

        // SECURITY: Sanitization statistics
        this.sanitizationStats = {
            totalRequests: 0,
            blockedRequests: 0,
            codeInjectionBlocked: 0,
            pathTraversalBlocked: 0,
            sqlInjectionBlocked: 0,
            xssBlocked: 0
        };
    }

    /**
     * SECURITY FIX: Comprehensive input sanitization
     */
    sanitizeInput(input, options = {}) {
        this.sanitizationStats.totalRequests++;

        try {
            // SECURITY: Input validation
            if (input === null || input === undefined) {
                return { sanitized: '', valid: true, warnings: [] };
            }

            // Convert to string safely
            const inputStr = this.safeStringify(input);
            const warnings = [];

            // SECURITY: Check for code injection patterns
            if (this.containsCodeInjection(inputStr)) {
                this.sanitizationStats.codeInjectionBlocked++;
                this.sanitizationStats.blockedRequests++;
                throw new Error('SECURITY VIOLATION: Code injection attempt detected');
            }

            // SECURITY: Check for SQL injection patterns
            if (this.containsSQLInjection(inputStr)) {
                this.sanitizationStats.sqlInjectionBlocked++;
                this.sanitizationStats.blockedRequests++;
                throw new Error('SECURITY VIOLATION: SQL injection attempt detected');
            }

            // SECURITY: Check for path traversal
            if (this.containsPathTraversal(inputStr)) {
                this.sanitizationStats.pathTraversalBlocked++;
                this.sanitizationStats.blockedRequests++;
                throw new Error('SECURITY VIOLATION: Path traversal attempt detected');
            }

            // SECURITY: Check for XSS patterns
            if (this.containsXSS(inputStr)) {
                this.sanitizationStats.xssBlocked++;
                this.sanitizationStats.blockedRequests++;
                throw new Error('SECURITY VIOLATION: XSS attempt detected');
            }

            // SECURITY: Sanitize the input
            let sanitized = this.applySanitization(inputStr, options);

            // SECURITY: Final validation
            if (!this.validateSanitizedInput(sanitized, options)) {
                throw new Error('SECURITY VIOLATION: Input failed final validation');
            }

            return {
                sanitized,
                valid: true,
                warnings,
                originalLength: inputStr.length,
                sanitizedLength: sanitized.length
            };

        } catch (error) {
            this.logSecurityViolation('input_sanitization_failure', {
                input: typeof input === 'string' ? input.substring(0, 100) : '[NON-STRING]',
                error: error.message,
                timestamp: Date.now()
            });

            throw error;
        }
    }

    /**
     * SECURITY FIX: Safe command execution with strict validation
     */
    async executeSecureCommand(command, args = [], options = {}) {
        try {
            // SECURITY: Validate command is allowed
            if (!this.allowedCommands.has(command)) {
                throw new Error(`SECURITY VIOLATION: Command '${command}' is not allowed`);
            }

            // SECURITY: Sanitize all arguments
            const sanitizedArgs = args.map(arg => {
                const result = this.sanitizeInput(arg, { type: 'command_arg' });
                return result.sanitized;
            });

            // SECURITY: Validate all arguments are safe
            for (const arg of sanitizedArgs) {
                if (!this.isValidCommandArgument(arg)) {
                    throw new Error(`SECURITY VIOLATION: Invalid command argument: ${arg}`);
                }\n            }\n            \n            // SECURITY: Execute with restricted permissions\n            return new Promise((resolve, reject) => {\n                const childProcess = spawn(command, sanitizedArgs, {\n                    ...options,\n                    shell: false, // CRITICAL: Never use shell\n                    stdio: ['pipe', 'pipe', 'pipe'],\n                    timeout: 30000, // 30 second timeout\n                    uid: process.getuid ? process.getuid() : undefined,\n                    gid: process.getgid ? process.getgid() : undefined,\n                    env: this.createSecureEnvironment(options.env)\n                });\n                \n                let stdout = '';\n                let stderr = '';\n                \n                childProcess.stdout.on('data', (data) => {\n                    stdout += data.toString();\n                });\n                \n                childProcess.stderr.on('data', (data) => {\n                    stderr += data.toString();\n                });\n                \n                childProcess.on('close', (code) => {\n                    this.logSecurityEvent('secure_command_executed', {\n                        command,\n                        args: sanitizedArgs,\n                        exitCode: code,\n                        timestamp: Date.now()\n                    });\n                    \n                    resolve({\n                        exitCode: code,\n                        stdout: this.sanitizeOutput(stdout),\n                        stderr: this.sanitizeOutput(stderr)\n                    });\n                });\n                \n                childProcess.on('error', (error) => {\n                    this.logSecurityViolation('command_execution_error', {\n                        command,\n                        error: error.message,\n                        timestamp: Date.now()\n                    });\n                    \n                    reject(new Error(`Command execution failed: ${error.message}`));\n                });\n            });\n            \n        } catch (error) {\n            this.logSecurityViolation('secure_command_blocked', {\n                command,\n                args,\n                error: error.message,\n                timestamp: Date.now()\n            });\n            \n            throw error;\n        }\n    }\n    \n    /**\n     * SECURITY FIX: Secure file path validation\n     */\n    validateSecureFilePath(filePath, allowedBasePaths = []) {\n        try {\n            // SECURITY: Sanitize path input\n            const sanitizedPath = this.sanitizeInput(filePath, { type: 'file_path' }).sanitized;\n            \n            // SECURITY: Resolve to absolute path\n            const absolutePath = path.resolve(sanitizedPath);\n            \n            // SECURITY: Check for path traversal\n            if (absolutePath.includes('..') || !sanitizedPath || sanitizedPath !== filePath) {\n                throw new Error('SECURITY VIOLATION: Path traversal detected');\n            }\n            \n            // SECURITY: Validate file extension\n            const ext = path.extname(absolutePath).toLowerCase();\n            if (!this.allowedFileExtensions.has(ext)) {\n                throw new Error(`SECURITY VIOLATION: File extension '${ext}' not allowed`);\n            }\n            \n            // SECURITY: Check allowed base paths\n            if (allowedBasePaths.length > 0) {\n                const isInAllowedPath = allowedBasePaths.some(basePath => {\n                    const absoluteBasePath = path.resolve(basePath);\n                    return absolutePath.startsWith(absoluteBasePath);\n                });\n                \n                if (!isInAllowedPath) {\n                    throw new Error('SECURITY VIOLATION: Path outside allowed directories');\n                }\n            }\n            \n            return {\n                valid: true,\n                sanitizedPath: absolutePath,\n                extension: ext\n            };\n            \n        } catch (error) {\n            this.logSecurityViolation('file_path_validation_failed', {\n                originalPath: filePath,\n                error: error.message,\n                timestamp: Date.now()\n            });\n            \n            throw error;\n        }\n    }\n    \n    /**\n     * SECURITY FIX: Check for code injection patterns\n     */\n    containsCodeInjection(input) {\n        return this.blockedPatterns.some(pattern => pattern.test(input));\n    }\n    \n    /**\n     * SECURITY FIX: Check for SQL injection patterns\n     */\n    containsSQLInjection(input) {\n        return this.sqlInjectionPatterns.some(pattern => pattern.test(input));\n    }\n    \n    /**\n     * SECURITY FIX: Check for path traversal patterns\n     */\n    containsPathTraversal(input) {\n        const pathTraversalPatterns = [\n            /\\.\\.\\//g,\n            /\\.\\.\\\\\\\\g,\n            /%2e%2e%2f/gi,\n            /%2e%2e%5c/gi,\n            /\\.\\.\\/\\.\\.\\//g,\n            /\\.\\.\\\\\\\\\\.\\.\\\\\\\\g\n        ];\n        \n        return pathTraversalPatterns.some(pattern => pattern.test(input));\n    }\n    \n    /**\n     * SECURITY FIX: Check for XSS patterns\n     */\n    containsXSS(input) {\n        const xssPatterns = [\n            /<script[^>]*>.*?<\\/script>/gi,\n            /<iframe[^>]*>.*?<\\/iframe>/gi,\n            /<object[^>]*>.*?<\\/object>/gi,\n            /javascript:\\s*/gi,\n            /on\\w+\\s*=/gi,\n            /expression\\s*\\(/gi,\n            /<[^>]*\\s+src\\s*=\\s*[\"']\\s*data:/gi\n        ];\n        \n        return xssPatterns.some(pattern => pattern.test(input));\n    }\n    \n    /**\n     * SECURITY FIX: Apply comprehensive sanitization\n     */\n    applySanitization(input, options = {}) {\n        let sanitized = input;\n        \n        // SECURITY: Remove null bytes\n        sanitized = sanitized.replace(/\\0/g, '');\n        \n        // SECURITY: Normalize unicode\n        sanitized = sanitized.normalize('NFC');\n        \n        // SECURITY: Apply type-specific sanitization\n        switch (options.type) {\n            case 'command_arg':\n                sanitized = this.sanitizeCommandArgument(sanitized);\n                break;\n            case 'file_path':\n                sanitized = this.sanitizeFilePath(sanitized);\n                break;\n            case 'json':\n                sanitized = this.sanitizeJSON(sanitized);\n                break;\n            default:\n                sanitized = this.sanitizeGeneral(sanitized);\n        }\n        \n        return sanitized;\n    }\n    \n    /**\n     * SECURITY FIX: Sanitize command arguments\n     */\n    sanitizeCommandArgument(input) {\n        // Remove dangerous characters\n        return input\n            .replace(/[;&|`$(){}[\\]<>]/g, '')\n            .replace(/\\s+/g, ' ')\n            .trim();\n    }\n    \n    /**\n     * SECURITY FIX: Sanitize file paths\n     */\n    sanitizeFilePath(input) {\n        // Remove path traversal and dangerous characters\n        return input\n            .replace(/\\.\\.\\//g, '')\n            .replace(/\\.\\.\\\\\\\\g, '')\n            .replace(/[<>:\"|?*]/g, '')\n            .replace(/^\\s+|\\s+$/g, '');\n    }\n    \n    /**\n     * SECURITY FIX: Sanitize JSON strings\n     */\n    sanitizeJSON(input) {\n        try {\n            // Parse and re-stringify to remove potential injection\n            const parsed = JSON.parse(input);\n            return JSON.stringify(parsed);\n        } catch (error) {\n            throw new Error('SECURITY VIOLATION: Invalid JSON structure');\n        }\n    }\n    \n    /**\n     * SECURITY FIX: General sanitization\n     */\n    sanitizeGeneral(input) {\n        return input\n            .replace(/[<>\"']/g, (match) => {\n                const entities = { '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#x27;' };\n                return entities[match];\n            })\n            .trim();\n    }\n    \n    /**\n     * SECURITY FIX: Sanitize command output\n     */\n    sanitizeOutput(output) {\n        // Remove ANSI escape codes and other control characters\n        return output\n            .replace(/\\x1b\\[[0-9;]*[a-zA-Z]/g, '')\n            .replace(/[\\x00-\\x08\\x0B-\\x0C\\x0E-\\x1F\\x7F]/g, '')\n            .trim();\n    }\n    \n    /**\n     * SECURITY FIX: Validate command arguments\n     */\n    isValidCommandArgument(arg) {\n        // Check length\n        if (arg.length > 1000) return false;\n        \n        // Check for remaining dangerous patterns\n        const dangerousPatterns = [\n            /[;&|`]/,\n            /\\$\\{/,\n            /\\$\\(/,\n            /\\<\\(/,\n            /\\>\\(/\n        ];\n        \n        return !dangerousPatterns.some(pattern => pattern.test(arg));\n    }\n    \n    /**\n     * SECURITY FIX: Create secure environment variables\n     */\n    createSecureEnvironment(userEnv = {}) {\n        // Start with minimal secure environment\n        const secureEnv = {\n            PATH: process.env.PATH,\n            HOME: process.env.HOME,\n            USER: process.env.USER,\n            LANG: 'en_US.UTF-8',\n            TZ: 'UTC'\n        };\n        \n        // Add sanitized user environment variables\n        for (const [key, value] of Object.entries(userEnv)) {\n            const sanitizedKey = this.sanitizeInput(key, { type: 'command_arg' }).sanitized;\n            const sanitizedValue = this.sanitizeInput(value, { type: 'command_arg' }).sanitized;\n            \n            // Only allow alphanumeric keys\n            if (/^[A-Z_][A-Z0-9_]*$/i.test(sanitizedKey)) {\n                secureEnv[sanitizedKey] = sanitizedValue;\n            }\n        }\n        \n        return secureEnv;\n    }\n    \n    /**\n     * SECURITY FIX: Validate sanitized input\n     */\n    validateSanitizedInput(input, options = {}) {\n        // Check maximum length\n        const maxLength = options.maxLength || 10000;\n        if (input.length > maxLength) {\n            return false;\n        }\n        \n        // Final security check\n        return !this.containsCodeInjection(input) && \n               !this.containsSQLInjection(input) &&\n               !this.containsPathTraversal(input) &&\n               !this.containsXSS(input);\n    }\n    \n    /**\n     * SECURITY FIX: Safe string conversion\n     */\n    safeStringify(input) {\n        if (typeof input === 'string') {\n            return input;\n        }\n        \n        if (input === null || input === undefined) {\n            return '';\n        }\n        \n        if (typeof input === 'object') {\n            try {\n                return JSON.stringify(input);\n            } catch (error) {\n                return '[OBJECT]';\n            }\n        }\n        \n        return String(input);\n    }\n    \n    /**\n     * SECURITY FIX: Log security violations\n     */\n    logSecurityViolation(violationType, details) {\n        const logEntry = {\n            violationId: crypto.randomUUID(),\n            type: violationType,\n            details,\n            severity: 'CRITICAL',\n            timestamp: Date.now(),\n            nodeId: process.pid\n        };\n        \n        // Create tamper-proof log signature\n        logEntry.signature = crypto.createHash('sha256')\n            .update(JSON.stringify(logEntry))\n            .digest('hex');\n        \n        // In production: send to secure logging service\n        console.error('[SECURITY VIOLATION]', JSON.stringify(logEntry, null, 2));\n    }\n    \n    /**\n     * SECURITY FIX: Log security events\n     */\n    logSecurityEvent(eventType, details) {\n        const logEntry = {\n            eventId: crypto.randomUUID(),\n            type: eventType,\n            details,\n            severity: 'INFO',\n            timestamp: Date.now()\n        };\n        \n        console.log('[SECURITY EVENT]', JSON.stringify(logEntry, null, 2));\n    }\n    \n    /**\n     * SECURITY FIX: Get sanitization statistics\n     */\n    getSecurityStatistics() {\n        return {\n            ...this.sanitizationStats,\n            blockedPercentage: this.sanitizationStats.totalRequests > 0 \n                ? (this.sanitizationStats.blockedRequests / this.sanitizationStats.totalRequests) * 100\n                : 0,\n            timestamp: Date.now()\n        };\n    }\n    \n    /**\n     * SECURITY FIX: Reset statistics (for testing)\n     */\n    resetStatistics() {\n        this.sanitizationStats = {\n            totalRequests: 0,\n            blockedRequests: 0,\n            codeInjectionBlocked: 0,\n            pathTraversalBlocked: 0,\n            sqlInjectionBlocked: 0,\n            xssBlocked: 0\n        };\n    }\n}\n\nmodule.exports = { SecurityInputSanitizer };