#!/usr/bin/env node

/**
 * Post-Spawn Validation Hook
 *
 * Validates agent spawning and Redis coordination setup
 * Runs after agent spawn to ensure proper coordination channels
 *
 * Phase 5: Validation & Monitoring
 */

import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

/**
 * @typedef {Object} ValidationResult
 * @property {'valid' | 'warning' | 'error'} status
 * @property {string} agentId
 * @property {'cli' | 'task' | 'unknown'} spawnMode
 * @property {Object} checks
 * @property {boolean} checks.agentIdFormat
 * @property {boolean} checks.redisConnection
 * @property {boolean} checks.feedbackChannel
 * @property {boolean} [checks.coordinatorChannel]
 * @property {boolean} checks.memorySetup
 * @property {string[]} warnings
 * @property {string[]} errors
 * @property {string[]} recommendations
 */

/**
 * Post-Spawn Validator
 */
class PostSpawnValidator {
    constructor() {
        this.redisConnected = false;
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            db: 0,
            retryStrategy: (times) => {
                if (times > 3) return null;
                return Math.min(times * 100, 1000);
            },
            lazyConnect: true
        });
    }

    /**
     * Validate agent spawn
     * @param {string} agentId
     * @param {string} [coordinatorId]
     * @returns {Promise<ValidationResult>}
     */
    async validate(agentId, coordinatorId) {
        const result = {
            status: 'valid',
            agentId,
            spawnMode: this.detectSpawnMode(agentId),
            checks: {
                agentIdFormat: false,
                redisConnection: false,
                feedbackChannel: false,
                memorySetup: false
            },
            warnings: [],
            errors: [],
            recommendations: []
        };

        // Check 1: Agent ID format
        result.checks.agentIdFormat = this.validateAgentIdFormat(agentId, result);

        // Check 2: Redis connection
        result.checks.redisConnection = await this.validateRedisConnection(result);

        // Check 3: Feedback channel setup
        if (result.checks.redisConnection) {
            result.checks.feedbackChannel = await this.validateFeedbackChannel(
                agentId,
                result.spawnMode,
                result
            );

            // Check 4: Coordinator channel (Task mode only)
            if (result.spawnMode === 'task' && coordinatorId) {
                result.checks.coordinatorChannel = await this.validateCoordinatorChannel(
                    coordinatorId,
                    result
                );
            }
        }

        // Check 5: Memory setup
        result.checks.memorySetup = await this.validateMemorySetup(agentId, result);

        // Determine overall status
        if (result.errors.length > 0) {
            result.status = 'error';
        } else if (result.warnings.length > 0) {
            result.status = 'warning';
        }

        return result;
    }

    /**
     * Detect spawn mode from agent ID pattern
     * @param {string} agentId
     * @returns {'cli' | 'task' | 'unknown'}
     */
    detectSpawnMode(agentId) {
        if (/^[a-z]+-\d+$/.test(agentId)) {
            return 'cli';
        }
        if (/^task_[a-f0-9]+$/.test(agentId)) {
            return 'task';
        }
        return 'unknown';
    }

    /**
     * Validate agent ID format
     * @param {string} agentId
     * @param {ValidationResult} result
     * @returns {boolean}
     */
    validateAgentIdFormat(agentId, result) {
        const cliPattern = /^[a-z]+-\d+$/;
        const taskPattern = /^task_[a-f0-9]+$/;

        if (cliPattern.test(agentId) || taskPattern.test(agentId)) {
            return true;
        }

        result.errors.push(`Invalid agent ID format: "${agentId}"`);
        result.recommendations.push('Agent ID should match CLI pattern (role-number) or Task pattern (task_uuid)');
        return false;
    }

    /**
     * Validate Redis connection
     * @param {ValidationResult} result
     * @returns {Promise<boolean>}
     */
    async validateRedisConnection(result) {
        if (!this.redis) {
            result.errors.push('Redis client not initialized');
            return false;
        }

        try {
            await this.redis.connect();
            await this.redis.ping();
            this.redisConnected = true;
            return true;
        } catch (error) {
            result.warnings.push(`Redis connection unavailable: ${error.message}`);
            result.recommendations.push('Ensure Redis server is running on localhost:6379');
            return false;
        }
    }

    /**
     * Validate feedback channel setup
     * @param {string} agentId
     * @param {'cli' | 'task' | 'unknown'} spawnMode
     * @param {ValidationResult} result
     * @returns {Promise<boolean>}
     */
    async validateFeedbackChannel(agentId, spawnMode, result) {
        if (!this.redis || !this.redisConnected) {
            return false;
        }

        try {
            const channel = `agent:${agentId}:feedback`;

            // For CLI mode, check if channel exists in pub/sub
            if (spawnMode === 'cli') {
                // Try publishing a test message (won't affect agents)
                const published = await this.redis.publish(channel, JSON.stringify({
                    type: 'TEST',
                    timestamp: new Date().toISOString()
                }));

                // published = 0 means no subscribers, but channel is valid
                result.recommendations.push(
                    `CLI agent should subscribe to: ${channel}`
                );
                return true;
            }

            // For Task mode, feedback goes to coordinator queue
            if (spawnMode === 'task') {
                result.recommendations.push(
                    'Task agent receives feedback via coordinator-mediated pattern'
                );
                return true;
            }

            result.warnings.push(`Unknown spawn mode: ${spawnMode}`);
            return false;

        } catch (error) {
            result.errors.push(`Failed to validate feedback channel: ${error.message}`);
            return false;
        }
    }

    /**
     * Validate coordinator channel setup (Task mode)
     * @param {string} coordinatorId
     * @param {ValidationResult} result
     * @returns {Promise<boolean>}
     */
    async validateCoordinatorChannel(coordinatorId, result) {
        if (!this.redis || !this.redisConnected) {
            return false;
        }

        try {
            const channel = `coordinator:${coordinatorId}:feedback`;

            // Check if list exists (LPUSH creates it automatically)
            const type = await this.redis.type(channel);

            if (type === 'list' || type === 'none') {
                result.recommendations.push(
                    `Coordinator should poll: ${channel} with BRPOP`
                );
                return true;
            }

            result.warnings.push(
                `Coordinator channel exists but wrong type: ${type} (expected: list)`
            );
            return false;

        } catch (error) {
            result.errors.push(`Failed to validate coordinator channel: ${error.message}`);
            return false;
        }
    }

    /**
     * Validate memory setup
     * @param {string} agentId
     * @param {ValidationResult} result
     * @returns {Promise<boolean>}
     */
    async validateMemorySetup(agentId, result) {
        try {
            const agentDir = path.join(process.cwd(), '.artifacts', 'agents', agentId);

            // Check if agent directory exists
            if (!fs.existsSync(agentDir)) {
                fs.mkdirSync(agentDir, { recursive: true });
                result.recommendations.push(`Created agent directory: ${agentDir}`);
            }

            // Check for pending feedback file
            const feedbackFile = path.join(agentDir, 'pending-feedback.json');
            if (!fs.existsSync(feedbackFile)) {
                fs.writeFileSync(feedbackFile, JSON.stringify({ feedback: [] }, null, 2));
                result.recommendations.push(`Created pending feedback file: ${feedbackFile}`);
            }

            // Check for memory database
            const memoryDb = path.join(agentDir, 'memory.db');
            if (!fs.existsSync(memoryDb)) {
                result.recommendations.push(
                    `Memory database will be created on first use: ${memoryDb}`
                );
            }

            return true;

        } catch (error) {
            result.warnings.push(`Failed to setup agent memory: ${error.message}`);
            return false;
        }
    }

    /**
     * Close Redis connection
     * @returns {Promise<void>}
     */
    async close() {
        if (this.redis && this.redisConnected) {
            await this.redis.disconnect();
        }
    }
}

/**
 * Format validation result as JSON
 * @param {ValidationResult} result
 * @returns {string}
 */
function formatResultJSON(result) {
    return JSON.stringify(result, null, 2);
}

/**
 * Format validation result as human-readable text
 * @param {ValidationResult} result
 * @returns {string}
 */
function formatResultText(result) {
    const lines = [];

    // Header
    lines.push('');
    lines.push('╔═══════════════════════════════════════════════════════════╗');
    lines.push('║         POST-SPAWN VALIDATION REPORT                      ║');
    lines.push('╚═══════════════════════════════════════════════════════════╝');
    lines.push('');

    // Agent info
    lines.push(`Agent ID:     ${result.agentId}`);
    lines.push(`Spawn Mode:   ${result.spawnMode.toUpperCase()}`);
    lines.push(`Status:       ${result.status.toUpperCase()}`);
    lines.push('');

    // Checks
    lines.push('Validation Checks:');
    lines.push(`  ✓ Agent ID Format:       ${result.checks.agentIdFormat ? '✅ PASS' : '❌ FAIL'}`);
    lines.push(`  ✓ Redis Connection:      ${result.checks.redisConnection ? '✅ PASS' : '⚠️  SKIP'}`);
    lines.push(`  ✓ Feedback Channel:      ${result.checks.feedbackChannel ? '✅ PASS' : '❌ FAIL'}`);

    if (result.checks.coordinatorChannel !== undefined) {
        lines.push(`  ✓ Coordinator Channel:   ${result.checks.coordinatorChannel ? '✅ PASS' : '❌ FAIL'}`);
    }

    lines.push(`  ✓ Memory Setup:          ${result.checks.memorySetup ? '✅ PASS' : '⚠️  WARN'}`);
    lines.push('');

    // Errors
    if (result.errors.length > 0) {
        lines.push('❌ Errors:');
        result.errors.forEach(err => lines.push(`   - ${err}`));
        lines.push('');
    }

    // Warnings
    if (result.warnings.length > 0) {
        lines.push('⚠️  Warnings:');
        result.warnings.forEach(warn => lines.push(`   - ${warn}`));
        lines.push('');
    }

    // Recommendations
    if (result.recommendations.length > 0) {
        lines.push('💡 Recommendations:');
        result.recommendations.forEach(rec => lines.push(`   - ${rec}`));
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Post-Spawn Validation Hook

Usage:
  post-spawn-validation.js <agent-id> [options]

Arguments:
  <agent-id>              Agent ID to validate (required)

Options:
  --coordinator-id <id>   Coordinator ID (for Task-spawned agents)
  --format json|text      Output format (default: text)
  --log-file <path>       Write results to log file
  --help, -h              Show this help message

Examples:
  # Validate CLI agent
  post-spawn-validation.js coder-1

  # Validate Task agent with coordinator
  post-spawn-validation.js task_abc123 --coordinator-id coordinator-cfn-standard

  # Output as JSON
  post-spawn-validation.js coder-1 --format json
        `);
        process.exit(0);
    }

    const agentId = args[0];
    const coordinatorIdIndex = args.indexOf('--coordinator-id');
    const coordinatorId = coordinatorIdIndex >= 0 ? args[coordinatorIdIndex + 1] : undefined;

    const formatIndex = args.indexOf('--format');
    const format = formatIndex >= 0 ? args[formatIndex + 1] : 'text';

    const logFileIndex = args.indexOf('--log-file');
    const logFile = logFileIndex >= 0 ? args[logFileIndex + 1] : null;

    // Run validation
    const validator = new PostSpawnValidator();

    try {
        const result = await validator.validate(agentId, coordinatorId);

        // Format output
        const output = format === 'json'
            ? formatResultJSON(result)
            : formatResultText(result);

        // Write to console
        console.log(output);

        // Write to log file if specified
        if (logFile) {
            const logDir = path.dirname(logFile);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            fs.writeFileSync(logFile, output);
            console.log(`\n✅ Validation report written to: ${logFile}`);
        }

        // Exit with appropriate code
        process.exit(result.status === 'error' ? 1 : 0);

    } catch (error) {
        console.error(`\n❌ Validation failed: ${error.message}`);
        console.error(error.stack);
        process.exit(1);

    } finally {
        await validator.close();
    }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { PostSpawnValidator };
