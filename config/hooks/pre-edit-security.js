#!/usr/bin/env node

/**
 * Pre-Edit Security Hook
 * Prevents dangerous edits and enforces security policies
 */

const path = require('path');
const fs = require('fs');

class PreEditSecurityHook {
    constructor() {
        this.blockedPatterns = [
            /\.env$/,           // Block .env files
            /\.env\.local$/,    // Block local env files
            /\.env\.production$/, // Block production env files
            /secrets?\.(json|yaml|yml)$/i, // Block secret files
            /credentials?\.(json|yaml|yml)$/i, // Block credential files
        ];

        this.allowedPatterns = [
            /\.env\.example$/,  // Allow example files
            /\.env\.template$/, // Allow template files
            /\.env\.sample$/,   // Allow sample files
        ];

        this.dangerousOperations = [
            /process\.env\[\s*['"`]([^'"`]+)['"`]\s*\]\s*=/,
            /export\s+\w+\s*=.*password/i,
            /export\s+\w+\s*=.*secret/i,
            /export\s+\w+\s*=.*key/i,
        ];
    }

    async validate(filePath, content, operation) {
        const results = {
            allowed: true,
            warnings: [],
            errors: [],
            suggestions: []
        };

        // Check file path security
        await this.validateFilePath(filePath, results);

        // Check content security if file edit is allowed
        if (results.allowed && content) {
            await this.validateContent(content, filePath, results);
        }

        return results;
    }

    async validateFilePath(filePath, results) {
        const filename = path.basename(filePath);

        // Check if file is explicitly blocked
        const isBlocked = this.blockedPatterns.some(pattern => pattern.test(filename));
        const isAllowed = this.allowedPatterns.some(pattern => pattern.test(filename));

        if (isBlocked && !isAllowed) {
            results.allowed = false;
            results.errors.push(`🚫 BLOCKED: Cannot edit ${filename} - Environment files are protected`);
            results.suggestions.push(`💡 Use ${filename.replace(/\.env$/, '.env.example')} for examples`);
            return;
        }

        // Warn about sensitive directories
        if (filePath.includes('.git/') || filePath.includes('.ssh/')) {
            results.warnings.push(`⚠️  WARNING: Editing sensitive directory: ${path.dirname(filePath)}`);
        }
    }

    async validateContent(content, filePath, results) {
        // Check for dangerous operations
        for (const pattern of this.dangerousOperations) {
            const matches = content.match(pattern);
            if (matches) {
                results.warnings.push(`⚠️  SECURITY: Detected potential secret assignment: ${matches[0]}`);
                results.suggestions.push(`💡 Consider using environment variables or config files`);
            }
        }

        // Check for hardcoded secrets
        const secretPatterns = [
            /password\s*[:=]\s*['"`][^'"`]+['"`]/i,
            /secret\s*[:=]\s*['"`][^'"`]+['"`]/i,
            /api[_-]?key\s*[:=]\s*['"`][^'"`]+['"`]/i,
            /token\s*[:=]\s*['"`][^'"`]+['"`]/i,
        ];

        for (const pattern of secretPatterns) {
            if (pattern.test(content)) {
                results.warnings.push(`🔐 SECURITY: Potential hardcoded secret detected in ${path.basename(filePath)}`);
                results.suggestions.push(`💡 Use environment variables or encrypted config`);
            }
        }
    }
}

// Hook execution
async function main() {
    const args = process.argv.slice(2);
    const filePath = args[0];
    const operation = args[1] || 'edit';

    if (!filePath) {
        console.error('Usage: pre-edit-security.js <file-path> [operation]');
        process.exit(1);
    }

    const hook = new PreEditSecurityHook();

    // Read content if file exists
    let content = '';
    try {
        if (fs.existsSync(filePath)) {
            content = fs.readFileSync(filePath, 'utf8');
        }
    } catch (error) {
        // File might not exist yet, that's okay
    }

    const results = await hook.validate(filePath, content, operation);

    // Output results
    if (results.errors.length > 0) {
        console.error('\n🚨 SECURITY VIOLATIONS:');
        results.errors.forEach(error => console.error(`  ${error}`));
    }

    if (results.warnings.length > 0) {
        console.warn('\n⚠️  SECURITY WARNINGS:');
        results.warnings.forEach(warning => console.warn(`  ${warning}`));
    }

    if (results.suggestions.length > 0) {
        console.info('\n💡 SUGGESTIONS:');
        results.suggestions.forEach(suggestion => console.info(`  ${suggestion}`));
    }

    // Exit with error code if blocked
    if (!results.allowed) {
        console.error('\n❌ Edit operation blocked by security policy');
        process.exit(1);
    }

    if (results.warnings.length === 0 && results.errors.length === 0) {
        console.log('✅ Security check passed');
    }

    process.exit(0);
}

if (require.main === module) {
    main().catch(error => {
        console.error('Security hook error:', error);
        process.exit(1);
    });
}

module.exports = PreEditSecurityHook;