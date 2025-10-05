#!/usr/bin/env node

/**
 * Pre-Tool Memory Safety Hook
 * Prevents commands that cause memory leaks in WSL/Windows environments
 *
 * BLOCKED COMMANDS (Memory Bombs):
 * - find /mnt/c/... - Causes heap exhaustion (2-10s per command, 50-200MB buffered)
 * - find . -type f - Large directory traversal memory usage
 *
 * SAFE ALTERNATIVES:
 * - Glob tool for file pattern matching (<100ms, minimal memory)
 * - git ls-files for tracked files (<50ms, minimal memory)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

class PreToolMemorySafetyHook {
    constructor() {
        this.blockedPatterns = [
            // WSL Windows path memory bombs
            /find\s+\/mnt\/c\//i,
            /find\s+\/mnt\/[a-z]\//i,

            // Large directory traversals
            /find\s+\.\s+-type\s+f/i,
            /find\s+\.\s+-name\s+["\']?\*\.(js|ts|py|json|md)["\']?/i,

            // Recursive find with large output
            /find\s+.+\s+-exec\s+grep/i,
            /find\s+.+\s+-exec\s+cat/i,

            // Memory-intensive variations
            /find\s+.+\s+-type\s+f\s+-exec/i,
        ];

        this.safeAlternatives = {
            'find pattern': 'Use Glob tool: Glob("**/*.js")',
            'find tracked files': 'Use git: git ls-files "*.js"',
            'find source files': 'Use git: git ls-files -- "src/**/*"',
            'find test files': 'Use Glob: Glob("**/*.test.*")',
        };
    }

    async validate(command) {
        const results = {
            allowed: true,
            warnings: [],
            errors: [],
            suggestions: [],
            alternatives: []
        };

        const commandString = typeof command === 'string' ? command : command.join(' ');

        // Check for blocked patterns
        for (const pattern of this.blockedPatterns) {
            if (pattern.test(commandString)) {
                results.allowed = false;
                results.errors.push(`🚫 BLOCKED: Memory-unsafe find command detected`);

                // Suggest specific alternatives
                if (commandString.includes('/mnt/c/')) {
                    results.alternatives.push('💡 Use Glob tool for Windows paths: Glob("**/*")');
                    results.suggestions.push('Windows find commands cause WSL memory leaks');
                } else if (commandString.includes('-type f')) {
                    results.alternatives.push('💡 Use git ls-files for tracked files: git ls-files "*.js"');
                    results.alternatives.push('💡 Use Glob tool: Glob("**/*.js")');
                } else if (commandString.includes('-exec')) {
                    results.alternatives.push('💡 Use Grep tool: Grep("pattern", "**/*.js")');
                    results.suggestions.push('Combine tools instead of find -exec');
                }

                // Add memory leak warning
                results.warnings.push(`⚠️  MEMORY LEAK: find commands on WSL/Windows cause 100MB+ memory usage`);
                results.warnings.push(`⚠️  PERFORMANCE: find takes 2-10 seconds vs <100ms for alternatives`);

                break;
            }
        }

        // Check for potentially problematic patterns (warnings only)
        const warningPatterns = [
            /find\s+.+\s+-name\s+["\']?\*["\']?/i,  // find with wildcard
            /find\s+.+\s+-print/i,                  // large output
            /find\s+.+\s+-type\s+f.*-o/i,           // complex conditions
        ];

        for (const pattern of warningPatterns) {
            if (pattern.test(commandString)) {
                results.warnings.push(`⚠️  WARNING: Potentially memory-intensive find command`);
                results.suggestions.push('Consider using Glob tool or git ls-files instead');
                break;
            }
        }

        return results;
    }

    async suggestAlternative(command) {
        const commandString = typeof command === 'string' ? command : command.join(' ');

        // Extract the intent from the command and suggest specific alternatives
        if (commandString.includes('test')) {
            return {
                command: 'Glob("**/*.test.*")',
                reason: 'Fast test file discovery without memory leaks',
                performance: '<100ms, minimal memory'
            };
        } else if (commandString.includes('src/') || commandString.includes('lib/')) {
            return {
                command: 'Glob("**/*.js") or git ls-files "*.js"',
                reason: 'Efficient source file discovery',
                performance: '<50ms, minimal memory'
            };
        } else if (commandString.includes('-exec grep')) {
            const match = commandString.match(/grep\s+["']([^"']+)["']/);
            const pattern = match ? match[1] : 'pattern';
            return {
                command: `Grep("${pattern}", "**/*.js")`,
                reason: 'Direct pattern matching without find overhead',
                performance: '<200ms, buffered output'
            };
        }

        return {
            command: 'Glob("**/*")',
            reason: 'General file discovery without memory leaks',
            performance: '<100ms, minimal memory'
        };
    }
}

// Hook execution
async function main() {
    const args = process.argv.slice(2);
    const command = args.join(' ');

    if (!command) {
        console.log(`
🛡️ PRE-TOOL MEMORY SAFETY HOOK

Blocked Commands (Memory Bombs):
- find /mnt/c/* - WSL Windows path traversal (causes heap exhaustion)
- find . -type f - Large directory traversal memory usage
- find ... -exec grep - Memory-intensive process creation

Safe Alternatives:
- Glob("**/*.js") - Fast file pattern matching
- git ls-files "*.js" - Tracked file discovery
- Grep("pattern", "**/*.js") - Direct pattern matching

Usage: pre-tool-memory-safety.js <command>
        `);
        process.exit(0);
    }

    const hook = new PreToolMemorySafetyHook();
    const results = await hook.validate(command);

    // Output results
    if (results.errors.length > 0) {
        console.error('\n🚨 MEMORY SAFETY VIOLATIONS:');
        results.errors.forEach(error => console.error(`  ${error}`));
    }

    if (results.warnings.length > 0) {
        console.warn('\n⚠️  MEMORY WARNINGS:');
        results.warnings.forEach(warning => console.warn(`  ${warning}`));
    }

    if (results.alternatives.length > 0) {
        console.info('\n💡 SAFE ALTERNATIVES:');
        results.alternatives.forEach(alt => console.info(`  ${alt}`));
    }

    // Suggest specific alternative
    const alternative = await hook.suggestAlternative(command);
    if (alternative) {
        console.info('\n🔧 RECOMMENDED ALTERNATIVE:');
        console.info(`  Command: ${alternative.command}`);
        console.info(`  Reason: ${alternative.reason}`);
        console.info(`  Performance: ${alternative.performance}`);
    }

    // Exit with error code if blocked
    if (!results.allowed) {
        console.error('\n❌ Command blocked by memory safety policy');
        console.error('   WSL/Windows find commands cause memory leaks and heap exhaustion');
        process.exit(1);
    }

    if (results.warnings.length === 0 && results.errors.length === 0) {
        console.log('✅ Memory safety check passed');
    }

    process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Memory safety hook error:', error);
        process.exit(1);
    });
}

export { PreToolMemorySafetyHook };