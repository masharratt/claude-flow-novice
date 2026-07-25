/**
 * Docker Test Utilities for CFN Docker Hello World Tests
 * Provides utilities for testing container-based CFN Loop execution
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const RedisTestUtils = require('./redis-test-utils.cjs');

class DockerTestUtils {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '../../..');
        this.testResultsDir = path.join(this.projectRoot, 'test-results');
        this.dockerSkillsDir = path.join(this.projectRoot, '.claude/skills');
        this.coordinationScript = path.join(this.dockerSkillsDir, 'cfn-docker-redis-coordination/coordinate.sh');
        this.agentSpawningScript = path.join(this.dockerSkillsDir, 'cfn-docker-agent-spawning/spawn-agent.sh');
        this.orchestrationScript = path.join(this.dockerSkillsDir, 'cfn-docker-loop-orchestration/orchestrate.sh');
        this.redisUtils = new RedisTestUtils();
    }

    /**
     * Initialize test environment
     */
    async initializeTestEnvironment() {
        console.log('🚀 Initializing Docker test environment...');

        // Create test results directories
        await fs.mkdir(path.join(this.testResultsDir, 'hello-world-docker'), { recursive: true });
        await fs.mkdir(path.join(this.testResultsDir, 'layer0-docker-validation'), { recursive: true });

        // Verify Redis is running
        try {
            execSync('redis-cli ping', { encoding: 'utf8', stdio: 'pipe' });
            console.log('✅ Redis is running');
        } catch (error) {
            throw new Error('Redis is not running. Please start Redis server first.');
        }

        // Verify Docker is available
        try {
            execSync('docker --version', { encoding: 'utf8', stdio: 'pipe' });
            console.log('✅ Docker is available');
        } catch (error) {
            throw new Error('Docker is not available. Please install Docker first.');
        }

        // Create Docker network for MCP communication
        try {
            execSync('docker network create mcp-network --driver bridge 2>/dev/null || true', {
                encoding: 'utf8',
                stdio: 'pipe'
            });
            console.log('✅ Docker network ready');
        } catch (error) {
            console.warn('⚠️ Docker network creation warning:', error.message);
        }

        return true;
    }

    /**
     * Generate unique test ID
     */
    generateTestId(prefix = 'test') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${prefix}-${timestamp}-${random}`;
    }

    /**
     * Initialize CFN Docker coordination for a task
     */
    async initializeDockerCoordination(taskId, context = null) {
        console.log(`🔧 Initializing Docker coordination for task: ${taskId}`);

        let command = `bash "${this.orchestrationScript}" init "${taskId}"`;

        if (context) {
            const contextFile = `/tmp/task-context-${taskId}.json`;
            await fs.writeFile(contextFile, JSON.stringify(context, null, 2));
            command += ` --context-file "${contextFile}"`;
        }

        try {
            const result = execSync(command, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 30000
            });

            if (result.includes('SUCCESS')) {
                console.log('✅ Docker coordination initialized');
                return true;
            } else {
                console.error('❌ Docker coordination initialization failed:', result);
                return false;
            }
        } catch (error) {
            console.error('❌ Docker coordination initialization error:', error.message);
            return false;
        }
    }

    /**
     * Spawn Docker agents for testing
     */
    async spawnDockerAgents(taskId, agentTypes, options = {}) {
        console.log(`🐳 Spawning Docker agents for task: ${taskId}`);
        console.log(`Agent types: ${agentTypes.join(', ')}`);

        const {
            memoryLimit = '1g',
            network = 'mcp-network',
            verbose = false,
            image = 'claude-flow-novice:minimal'
        } = options;

        const agentIds = [];
        const spawnPromises = [];

        for (const agentType of agentTypes) {
            const agentId = `${agentType}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            agentIds.push(agentId);

            const spawnCommand = [
                'bash',
                `"${this.agentSpawningScript}"`,
                agentType,
                taskId,
                agentId,
                '--memory-limit', memoryLimit,
                '--network', network,
                '--image', image
            ];

            if (verbose) {
                spawnCommand.push('--verbose');
            }

            const spawnPromise = new Promise((resolve, reject) => {
                try {
                    const result = execSync(spawnCommand.join(' '), {
                        encoding: 'utf8',
                        stdio: 'pipe',
                        timeout: 60000
                    });

                    // Extract container ID and agent ID from output
                    const containerIdMatch = result.match(/Container ID: ([^\s]+)/);
                    const agentIdMatch = result.match(/Agent ID: ([^\s]+)/);

                    if (containerIdMatch && containerIdMatch[1]) {
                        const containerId = containerIdMatch[1];
                        const actualAgentId = agentIdMatch && agentIdMatch[1] ? agentIdMatch[1] : agentId;

                        resolve({
                            agentId: actualAgentId,
                            agentType,
                            containerId: containerId,
                            success: true,
                            output: result
                        });
                    } else {
                        resolve({
                            agentId: agentId,
                            agentType,
                            success: false,
                            error: 'Could not extract container ID from output',
                            output: result
                        });
                    }
                } catch (error) {
                    resolve({
                        agentId: agentId,
                        agentType,
                        success: false,
                        error: error.message,
                        output: error.stdout || ''
                    });
                }
            });

            spawnPromises.push(spawnPromise);
        }

        const results = await Promise.all(spawnPromises);

        const successfulSpawns = results.filter(r => r.success);
        const failedSpawns = results.filter(r => !r.success);

        console.log(`✅ ${successfulSpawns.length}/${agentTypes.length} agents spawned successfully`);

        if (failedSpawns.length > 0) {
            console.warn('⚠️ Failed spawns:');
            failedSpawns.forEach(failure => {
                console.warn(`  - ${failure.agentType}: ${failure.error}`);
            });
        }

        return {
            taskAgents: successfulSpawns,
            failedSpawns,
            totalAgents: agentTypes.length,
            successRate: successfulSpawns.length / agentTypes.length
        };
    }

    /**
     * Register agent in Redis coordination
     */
    async registerAgentInRedis(agentId, agentType, taskId, containerId = null) {
        console.log(`📝 Registering agent ${agentId} (${agentType}) in Redis`);

        // Validate parameters
        if (!agentId || !agentType || !taskId) {
            console.error(`❌ Invalid parameters: agentId=${agentId}, agentType=${agentType}, taskId=${taskId}`);
            return false;
        }

        try {
            const command = `bash "${this.coordinationScript}" register-agent \
                --agent-id "${agentId}" \
                --agent-type "${agentType}" \
                --task-id "${taskId}" \
                ${containerId ? `--container-id "${containerId}"` : ''}`;

            console.log(`   🔄 Executing: ${command}`);
            const result = execSync(command, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 10000
            });

            console.log(`   📄 Command output: ${result.trim()}`);
            const success = result.includes('SUCCESS');
            if (!success) {
                console.error(`❌ Command failed: ${result}`);
            }
            return success;
        } catch (error) {
            console.error(`❌ Failed to register agent ${agentId}:`, error.message);
            console.error(`❌ Error details:`, error);
            return false;
        }
    }

    /**
     * Wait for agents to complete with timeout
     */
    async waitForAgentCompletion(taskId, expectedAgentCount, timeoutMs = 300000) {
        console.log(`⏳ Waiting for ${expectedAgentCount} agents to complete...`);

        const startTime = Date.now();
        const checkInterval = 5000; // Check every 5 seconds

        while (Date.now() - startTime < timeoutMs) {
            try {
                const command = `bash "${this.coordinationScript}" wait-loop \
                    --task-id "${taskId}" \
                    --loop-number 3 \
                    --agent-count ${expectedAgentCount} \
                    --timeout 30`;

                const result = execSync(command, {
                    encoding: 'utf8',
                    stdio: 'pipe',
                    timeout: 35000
                });

                if (result.includes('ALL AGENTS COMPLETED') || result.includes('Loop 3 completed')) {
                    console.log('✅ All agents completed successfully');
                    return { success: true, completed: true, timeout: false };
                }

                console.log(`⏳ Still waiting... (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`);
            } catch (error) {
                // Command timeout means agents haven't completed yet, continue waiting
                if (!error.message.includes('timeout')) {
                    console.warn('⚠️ Error checking agent completion:', error.message);
                }
            }

            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        console.error('❌ Agent completion timeout');
        return { success: false, completed: false, timeout: true };
    }

    /**
     * Collect confidence scores from agents
     */
    async collectAgentConfidenceScores(taskId, agentIds) {
        console.log('📊 Collecting confidence scores from agents...');

        const scores = [];
        let totalConfidence = 0;
        let validScores = 0;

        for (const agentId of agentIds) {
            try {
                // Get agent confidence from Redis
                const command = `bash "${this.coordinationScript}" get-context \
                    --task-id "${taskId}" \
                    --agent-id "${agentId}" 2>/dev/null || echo '{}'`;

                const result = execSync(command, {
                    encoding: 'utf8',
                    stdio: 'pipe',
                    timeout: 5000
                });

                try {
                    const context = JSON.parse(result);
                    const confidence = context.confidence || context.averageConfidence || 0.0;

                    if (confidence > 0) {
                        scores.push({
                            agentId,
                            confidence: parseFloat(confidence),
                            iteration: context.iteration || 1,
                            agentType: context.agentType || 'unknown'
                        });
                        totalConfidence += parseFloat(confidence);
                        validScores++;
                    }
                } catch (parseError) {
                    console.warn(`⚠️ Could not parse confidence for agent ${agentId}`);
                }
            } catch (error) {
                console.warn(`⚠️ Could not get confidence for agent ${agentId}:`, error.message);
            }
        }

        const averageConfidence = validScores > 0 ? totalConfidence / validScores : 0.0;

        console.log(`📊 Collected ${validScores}/${agentIds.length} confidence scores`);
        console.log(`📈 Average confidence: ${averageConfidence.toFixed(3)}`);

        return {
            scores,
            averageConfidence,
            totalAgents: agentIds.length,
            validScores,
            collectionRate: validScores / agentIds.length
        };
    }

    /**
     * Perform gate check on Loop 3 results
     */
    async performGateCheck(confidenceData, gateThreshold = 0.75) {
        console.log(`🚪 Performing gate check (threshold: ${gateThreshold})`);

        const { averageConfidence, validScores } = confidenceData;

        if (validScores === 0) {
            console.error('❌ Gate check failed: No valid confidence scores');
            return { passed: false, reason: 'No valid confidence scores' };
        }

        const passed = averageConfidence >= gateThreshold;

        if (passed) {
            console.log(`✅ Gate PASSED: ${averageConfidence.toFixed(3)} >= ${gateThreshold}`);
        } else {
            console.log(`❌ Gate FAILED: ${averageConfidence.toFixed(3)} < ${gateThreshold}`);
        }

        return {
            passed,
            averageConfidence,
            threshold: gateThreshold,
            validScores,
            reason: passed ? 'Confidence above threshold' : 'Confidence below threshold'
        };
    }

    /**
     * Save test results to JSON file
     */
    async saveTestResults(layerNumber, layerName, results) {
        const timestamp = new Date().toISOString();
        const resultsData = {
            testSuite: 'CFN Docker Hello World Tests',
            layer: layerNumber,
            layerName,
            timestamp,
            ...results,
            projectRoot: this.projectRoot
        };

        const resultsFile = path.join(
            this.testResultsDir,
            'hello-world-docker',
            `layer${layerNumber}-results.json`
        );

        await fs.writeFile(resultsFile, JSON.stringify(resultsData, null, 2));
        console.log(`💾 Results saved to: ${resultsFile}`);

        return resultsFile;
    }

    /**
     * Cleanup test environment
     */
    async cleanup(taskId) {
        console.log(`🧹 Cleaning up test environment for task: ${taskId}`);

        try {
            // Clean up temporary context files
            const contextFiles = await fs.readdir('/tmp').then(files =>
                files.filter(file => file.includes(`task-context-${taskId}`))
            );

            for (const file of contextFiles) {
                await fs.unlink(path.join('/tmp', file));
            }

            // Clean up Redis data for this task (optional, let TTL handle it)
            console.log('✅ Test environment cleaned up');
        } catch (error) {
            console.warn('⚠️ Cleanup warning:', error.message);
        }
    }

    /**
     * Get system health status
     */
    async getSystemHealth() {
        const health = {
            redis: false,
            docker: false,
            network: false,
            errors: []
        };

        try {
            execSync('redis-cli ping', { encoding: 'utf8', stdio: 'pipe' });
            health.redis = true;
        } catch (error) {
            health.errors.push(`Redis: ${error.message}`);
        }

        try {
            execSync('docker --version', { encoding: 'utf8', stdio: 'pipe' });
            health.docker = true;
        } catch (error) {
            health.errors.push(`Docker: ${error.message}`);
        }

        try {
            const networks = execSync('docker network ls --filter name=mcp-network', {
                encoding: 'utf8',
                stdio: 'pipe'
            });
            health.network = networks.includes('mcp-network');
        } catch (error) {
            health.errors.push(`Docker Network: ${error.message}`);
        }

        return health;
    }
}

module.exports = DockerTestUtils;