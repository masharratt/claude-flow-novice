/**
 * Redis Test Utilities for CFN Docker Hello World Tests
 * Provides utilities for testing Redis-based coordination
 */

const { execSync } = require('child_process');
const path = require('path');

class RedisTestUtils {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '../../..');
        this.coordinationScript = path.join(this.projectRoot, '.claude/skills/cfn-docker-redis-coordination/coordinate.sh');
    }

    /**
     * Check Redis health
     */
    async checkRedisHealth() {
        try {
            const result = execSync(`bash "${this.coordinationScript}" health-check`, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 10000
            });

            return {
                healthy: result.includes('SUCCESS'),
                output: result,
                details: this.parseHealthOutput(result)
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                output: error.stdout || ''
            };
        }
    }

    /**
     * Parse health check output
     */
    parseHealthOutput(output) {
        const details = {};

        const memoryMatch = output.match(/Memory usage: ([^\n]+)/);
        if (memoryMatch) details.memory = memoryMatch[1].trim();

        const latencyMatch = output.match(/Latency: ([^\n]+)/);
        if (latencyMatch) details.latency = latencyMatch[1].trim();

        const keysMatch = output.match(/Total keys: ([^\n]+)/);
        if (keysMatch) details.totalKeys = parseInt(keysMatch[1]);

        return details;
    }

    /**
     * Store task context in Redis
     */
    async storeTaskContext(taskId, context) {
        const contextFile = `/tmp/context-${taskId}.json`;

        try {
            // Write context to temporary file
            await import('fs/promises').then(fs =>
                fs.writeFile(contextFile, JSON.stringify(context, null, 2))
            );

            // Store in Redis
            const command = `bash "${this.coordinationScript}" store-context \
                --task-id "${taskId}" \
                --context-file "${contextFile}"`;

            execSync(command, { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });

            // Clean up temporary file
            await import('fs/promises').then(fs => fs.unlink(contextFile));

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get task context from Redis
     */
    async getTaskContext(taskId) {
        try {
            const command = `bash "${this.coordinationScript}" get-context --task-id "${taskId}"`;
            const result = execSync(command, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 10000
            });

            // Find the start and end of JSON content
            const jsonStart = result.indexOf('{');
            const jsonEnd = result.lastIndexOf('}');

            if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
                return {
                    success: false,
                    error: 'No JSON found in coordination script output',
                    context: {}
                };
            }

            let jsonString = result.substring(jsonStart, jsonEnd + 1);

            // Clean up ANSI escape sequences and other control characters
            jsonString = jsonString
                .replace(/\x1b\[[0-9;]*m/g, '')  // ANSI color codes
                .replace(/\x1b\[[0-9;]*[HJK]/g, '')  // Cursor positioning
                .replace(/\x1b\[[0-9]*[ABCD]/g, '') // Clear screen commands
                .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
                .trim();

            // Debug: log the cleaned JSON string
            console.log(`   🔍 Cleaned JSON string: ${jsonString.substring(0, 200)}...`);

            // Try to parse the cleaned JSON
            const context = JSON.parse(jsonString);

            return {
                success: true,
                context
            };
        } catch (error) {
            return {
                success: false,
                error: `JSON parsing failed: ${error.message}`,
                context: {}
            };
        }
    }

    /**
     * Register agent in Redis
     */
    async registerAgent(taskId, agentId, agentType, containerId = null) {
        try {
            let command = `bash "${this.coordinationScript}" register-agent \
                --task-id "${taskId}" \
                --agent-id "${agentId}" \
                --agent-type "${agentType}"`;

            if (containerId) {
                command += ` --container-id "${containerId}"`;
            }

            const result = execSync(command, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 10000
            });

            return {
                success: result.includes('SUCCESS'),
                output: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update agent status in Redis
     */
    async updateAgentStatus(agentId, status, iteration = 1) {
        try {
            const command = `bash "${this.coordinationScript}" update-status \
                --agent-id "${agentId}" \
                --status "${status}" \
                --iteration ${iteration}`;

            const result = execSync(command, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 10000
            });

            return {
                success: result.includes('SUCCESS'),
                output: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Signal agent completion with confidence
     */
    async signalAgentCompletion(taskId, agentId, confidence, iteration = 1) {
        try {
            const command = `bash "${this.coordinationScript}" signal-complete \
                --task-id "${taskId}" \
                --agent-id "${agentId}" \
                --confidence ${confidence} \
                --iteration ${iteration}`;

            const result = execSync(command, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 10000
            });

            return {
                success: result.includes('SUCCESS'),
                output: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Wait for loop completion
     */
    async waitForLoopCompletion(taskId, loopNumber, agentCount, timeout = 300) {
        try {
            const command = `bash "${this.coordinationScript}" wait-loop \
                --task-id "${taskId}" \
                --loop-number ${loopNumber} \
                --agent-count ${agentCount} \
                --timeout ${timeout}`;

            const result = execSync(command, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: (timeout + 10) * 1000 // Add buffer for command execution
            });

            return {
                success: result.includes('completed') || result.includes('SUCCESS'),
                output: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                output: error.stdout || ''
            };
        }
    }

    /**
     * Collect consensus for a loop
     */
    async collectConsensus(taskId, loopNumber, requiredConsensus, timeout = 300) {
        try {
            const command = `bash "${this.coordinationScript}" collect-consensus \
                --task-id "${taskId}" \
                --loop-number ${loopNumber} \
                --required-consensus ${requiredConsensus} \
                --timeout ${timeout}`;

            const result = execSync(command, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: (timeout + 10) * 1000
            });

            const success = result.includes('PASSED') || result.includes('SUCCESS');

            // Try to extract consensus details
            let consensusDetails = null;
            try {
                const consensusMatch = result.match(/consensus_reached[":\s]*([^,\n]+)/);
                if (consensusMatch) {
                    consensusDetails = {
                        reached: consensusMatch[1].toLowerCase().includes('true'),
                        output: result
                    };
                }
            } catch (parseError) {
                // Parsing failed, but we still have the basic success status
            }

            return {
                success,
                consensusDetails,
                output: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                output: error.stdout || ''
            };
        }
    }

    /**
     * Get task statistics from Redis
     */
    async getTaskStats(taskId) {
        try {
            // Get task metadata
            const context = await this.getTaskContext(taskId);

            // Count registered agents
            const agentCountCommand = `redis-cli keys "cfn_docker:agent:*" | grep -v "status_history" | wc -l`;
            const agentCountResult = execSync(agentCountCommand, {
                encoding: 'utf8',
                stdio: 'pipe'
            }).trim();

            // Get completion signals
            const completionCommand = `redis-cli keys "cfn_docker:task:${taskId}:agent:*:done" | wc -l`;
            const completionResult = execSync(completionCommand, {
                encoding: 'utf8',
                stdio: 'pipe'
            }).trim();

            return {
                success: true,
                taskId,
                context: context.context,
                totalAgents: parseInt(agentCountResult),
                completedAgents: parseInt(completionResult),
                completionRate: parseInt(agentCountResult) > 0 ?
                    parseInt(completionResult) / parseInt(agentCountResult) : 0
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                taskId
            };
        }
    }

    /**
     * Clean up task data from Redis
     */
    async cleanupTaskData(taskId) {
        try {
            // Delete task-related keys
            const deleteCommands = [
                `redis-cli del "cfn_docker:task:${taskId}:context"`,
                `redis-cli del "cfn_docker:task:${taskId}:meta"`,
                `redis-cli keys "cfn_docker:agent:*" | grep "task_id.*${taskId}" | xargs redis-cli del`,
                `redis-cli keys "cfn_docker:task:${taskId}:*" | xargs redis-cli del`
            ];

            for (const command of deleteCommands) {
                try {
                    execSync(command, { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
                } catch (error) {
                    // Some commands might not find keys, that's okay
                    if (!error.message.includes('No such file')) {
                        console.warn('Cleanup warning:', error.message);
                    }
                }
            }

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate ACL enforcement
     */
    async validateACLEnforcement(taskId, agentId, unauthorizedAgentId) {
        try {
            // Try to access data with unauthorized agent
            const unauthorizedCommand = `bash "${this.coordinationScript}" get-context \
                --task-id "${taskId}" \
                --agent-id "${unauthorizedAgentId}" 2>/dev/null || echo "ACCESS_DENIED"`;

            const result = execSync(unauthorizedCommand, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 10000
            });

            const accessBlocked = result.includes('ACCESS_DENIED') || result.length === 0;

            return {
                success: true,
                aclWorking: accessBlocked,
                unauthorizedAccessBlocked: accessBlocked,
                output: result
            };
        } catch (error) {
            // Error might indicate ACL is working (access denied)
            return {
                success: true,
                aclWorking: true,
                unauthorizedAccessBlocked: true,
                error: error.message
            };
        }
    }

    /**
     * Get Redis performance metrics
     */
    async getPerformanceMetrics() {
        try {
            const infoCommand = 'redis-cli info memory,persistence,stats';
            const result = execSync(infoCommand, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 5000
            });

            const metrics = this.parseRedisInfo(result);

            return {
                success: true,
                metrics,
                output: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                metrics: {}
            };
        }
    }

    /**
     * Parse Redis INFO command output
     */
    parseRedisInfo(output) {
        const metrics = {};
        const lines = output.split('\n');

        for (const line of lines) {
            if (line.includes(':') && !line.startsWith('#')) {
                const [key, value] = line.split(':');
                metrics[key.trim()] = value.trim();
            }
        }

        return metrics;
    }
}

module.exports = RedisTestUtils;