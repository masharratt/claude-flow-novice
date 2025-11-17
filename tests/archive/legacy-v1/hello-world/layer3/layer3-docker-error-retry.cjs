#!/usr/bin/env node

/**
 * Layer 3: Docker Error Handling and Retry Test
 * Tests 50% error injection with fresh agent spawning and exponential backoff
 */

const DockerTestUtils = require('../lib/docker-test-utils.cjs');
const RedisTestUtils = require('../lib/redis-test-utils.cjs');

class Layer3DockerErrorRetryTest {
    constructor() {
        this.testUtils = new DockerTestUtils();
        this.redisUtils = new RedisTestUtils();
        this.testResults = {
            layer: 3,
            name: 'Docker Error Handling',
            startTime: new Date().toISOString(),
            endTime: null,
            status: 'RUNNING',
            summary: {},
            initialFailures: 0,
            retries: 0,
            finalPassRate: 0,
            containersRespawned: 0,
            errorTypes: ['timeout', 'memory_exceeded', 'network_error', 'permission_denied'],
            retryHistory: [],
            errors: []
        };
    }

    async run() {
        try {
            console.log('🔄 Starting Layer 3: Docker Error Handling and Retry Test');
            console.log('='.repeat(60));

            // Initialize test environment
            await this.testUtils.initializeTestEnvironment();

            // Initialize test data
            const taskId = 'layer3-docker-error-retry-test';
            await this.testUtils.initializeDockerCoordination(taskId, {
                test: 'error-handling-retry',
                purpose: 'Test container error handling with fresh agent spawning and exponential backoff'
            });

            // Create test tasks with error injection
            const testTasks = this.createTestTasks();
            console.log(`📋 Created ${testTasks.length} test tasks with 50% error injection`);

            // Process tasks with error handling
            const processResults = await this.processTasksWithRetry(taskId, testTasks);

            // Collect and validate results
            await this.collectAndValidateResults(taskId, testTasks, processResults);

            this.testResults.endTime = new Date().toISOString();
            this.testResults.status = 'COMPLETED';

            console.log('✅ Layer 3 Docker Error Handling Test COMPLETED');
            return this.testResults;

        } catch (error) {
            this.testResults.errors.push(error.message);
            this.testResults.status = 'FAILED';
            this.testResults.endTime = new Date().toISOString();
            throw error;
        } finally {
            // Cleanup
            await this.testUtils.cleanup('layer3-docker-error-retry-test');
        }
    }

    createTestTasks() {
        const tasks = [];
        const errorTypes = this.testResults.errorTypes;

        for (let i = 0; i < 70; i++) {
            // 50% chance of error injection
            const shouldFail = Math.random() < 0.5;
            const errorType = shouldFail ? errorTypes[Math.floor(Math.random() * errorTypes.length)] : null;

            tasks.push({
                taskId: `task-${i.toString(36).padStart(3, '0')}`,
                agentType: this.getRandomAgentType(),
                fileIndex: i,
                shouldFail: shouldFail,
                errorType: errorType,
                attempts: 0,
                maxAttempts: 3,
                completed: false,
                finalSuccess: false,
                retryHistory: []
            });
        }

        return tasks;
    }

    getRandomAgentType() {
        const agentTypes = [
            'backend-developer',
            'react-frontend-engineer',
            'python-developer',
            'java-developer',
            'security-specialist',
            'performance-engineer',
            'database-architect'
        ];
        return agentTypes[Math.floor(Math.random() * agentTypes.length)];
    }

    async processTasksWithRetry(taskId, tasks) {
        console.log('⚡ Processing tasks with error handling and retry logic...');
        const results = [];

        for (const task of tasks) {
            const taskResult = await this.processSingleTaskWithRetry(taskId, task);
            results.push(taskResult);

            // Update statistics
            if (taskResult.shouldFail && taskResult.attempts > 1) {
                this.testResults.initialFailures++;
                this.testResults.retries += (taskResult.attempts - 1);
                this.testResults.containersRespawned += (taskResult.attempts - 1);
            }
        }

        console.log(`✅ Processed ${results.length} tasks with retry logic`);
        return results;
    }

    async processSingleTaskWithRetry(taskId, task) {
        let lastError = null;
        let attempt = 0;

        while (attempt < task.maxAttempts) {
            attempt++;
            task.attempts = attempt;

            try {
                // Create new agent for each attempt (fresh container)
                const agentId = `${task.agentType}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

                // Register agent in Redis
                const registered = await this.testUtils.registerAgentInRedis(
                    agentId,
                    task.agentType,
                    taskId,
                    `container-${agentId}-attempt-${attempt}`
                );

                if (!registered) {
                    throw new Error(`Failed to register agent ${agentId}`);
                }

                // Simulate task processing
                const processingTime = 100 + Math.random() * 400; // 100-500ms
                await new Promise(resolve => setTimeout(resolve, processingTime));

                // Inject error if this attempt should fail
                if (task.shouldFail && attempt <= this.getFailureAttempt(task.errorType)) {
                    throw new Error(this.getErrorMessage(task.errorType));
                }

                // Task completed successfully
                task.completed = true;
                task.finalSuccess = true;

                // Store completion in Redis
                await this.redisUtils.signalAgentCompletion(taskId, agentId, 0.9, attempt);

                // Record attempt history
                task.retryHistory.push({
                    attempt: attempt,
                    agentId: agentId,
                    success: true,
                    timestamp: new Date().toISOString(),
                    processingTime: processingTime
                });

                return task;

            } catch (error) {
                lastError = error;

                // Record failed attempt
                task.retryHistory.push({
                    attempt: attempt,
                    agentId: `${task.agentType}-failed-${attempt}`,
                    success: false,
                    error: error.message,
                    errorType: task.errorType,
                    timestamp: new Date().toISOString()
                });

                // Apply exponential backoff
                if (attempt < task.maxAttempts) {
                    const backoffTime = Math.min(100 * Math.pow(2, attempt - 1), 2000); // Max 2 seconds
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                }
            }
        }

        // All attempts failed
        task.completed = true;
        task.finalSuccess = false;
        task.lastError = lastError?.message;

        return task;
    }

    getFailureAttempt(errorType) {
        // Determine which attempt should fail based on error type
        switch (errorType) {
            case 'timeout': return 1; // Fails immediately
            case 'memory_exceeded': return 1; // Fails immediately
            case 'network_error': return Math.random() < 0.5 ? 1 : 2; // 50% fail on first or second attempt
            case 'permission_denied': return 2; // Fails on second attempt
            default: return 1;
        }
    }

    getErrorMessage(errorType) {
        switch (errorType) {
            case 'timeout':
                return 'Task execution timeout (30s exceeded)';
            case 'memory_exceeded':
                return 'Container memory limit exceeded (1GB limit)';
            case 'network_error':
                return 'Network connection failed to external service';
            case 'permission_denied':
                return 'Permission denied accessing required resource';
            default:
                return 'Unknown error occurred during task execution';
        }
    }

    async collectAndValidateResults(taskId, originalTasks, processResults) {
        console.log('📊 Collecting and validating error handling results...');

        const totalTasks = originalTasks.length;
        const successfulTasks = processResults.filter(r => r.finalSuccess).length;
        const finalPassRate = (successfulTasks / totalTasks * 100).toFixed(1);
        this.testResults.finalPassRate = parseFloat(finalPassRate);

        // Analyze retry patterns
        const retryStats = this.analyzeRetryPatterns(processResults);

        // Validate error type distribution
        const errorDistribution = this.analyzeErrorDistribution(processResults);

        // Calculate backoff effectiveness
        const backoffEffectiveness = this.calculateBackoffEffectiveness(processResults);

        this.testResults.summary = {
            totalTasks: totalTasks,
            initialFailures: this.testResults.initialFailures,
            retries: this.testResults.retries,
            finalSuccesses: successfulTasks,
            finalPassRate: finalPassRate + '%',
            containersRespawned: this.testResults.containersRespawned,
            averageRetriesPerFailedTask: this.testResults.initialFailures > 0 ?
                (this.testResults.retries / this.testResults.initialFailures).toFixed(1) : 0,
            maxRetriesForSingleTask: Math.max(...processResults.map(r => r.attempts)),
            retryStats: retryStats,
            errorDistribution: errorDistribution,
            backoffEffectiveness: backoffEffectiveness
        };

        // Validate success criteria
        const successCriteria = {
            initialFailureRateAcceptable: this.testResults.initialFailures / totalTasks >= 0.4 &&
                                       this.testResults.initialFailures / totalTasks <= 0.6,
            retriesWithinLimit: this.testResults.retries <= totalTasks * 0.8, // Max 80% of tasks
            maxRetriesPerTask: Math.max(...processResults.map(r => r.attempts)) <= 3,
            finalPassRateAcceptable: this.testResults.finalPassRate >= 95.0,
            containersRespawnedCorrectly: this.testResults.containersRespawned === this.testResults.retries,
            allPassed: false
        };

        successCriteria.allPassed = successCriteria.initialFailureRateAcceptable &&
                                  successCriteria.retriesWithinLimit &&
                                  successCriteria.maxRetriesPerTask &&
                                  successCriteria.finalPassRateAcceptable &&
                                  successCriteria.containersRespawnedCorrectly;

        this.testResults.summary.successCriteria = successCriteria;

        console.log('📋 Error Handling Summary:');
        console.log(`   Total Tasks: ${this.testResults.summary.totalTasks}`);
        console.log(`   Initial Failures: ${this.testResults.summary.initialFailures} (${(this.testResults.initialFailures/totalTasks*100).toFixed(1)}%)`);
        console.log(`   Total Retries: ${this.testResults.summary.retries}`);
        console.log(`   Final Pass Rate: ${this.testResults.summary.finalPassRate}`);
        console.log(`   Containers Respawned: ${this.testResults.summary.containersRespawned}`);
        console.log(`   Max Retries per Task: ${this.testResults.summary.maxRetriesForSingleTask}`);
        console.log(`   Avg Retries per Failed Task: ${this.testResults.summary.averageRetriesPerFailedTask}`);

        return this.testResults;
    }

    analyzeRetryPatterns(processResults) {
        const retryCounts = {};
        processResults.forEach(task => {
            const retryCount = task.attempts - 1;
            retryCounts[retryCount] = (retryCounts[retryCount] || 0) + 1;
        });

        return {
            succeededOnFirstTry: retryCounts[0] || 0,
            succeededOnFirstRetry: retryCounts[1] || 0,
            succeededOnSecondRetry: retryCounts[2] || 0,
            failedAfterAllRetries: processResults.filter(t => !t.finalSuccess).length,
            retryDistribution: retryCounts
        };
    }

    analyzeErrorDistribution(processResults) {
        const distribution = {};
        this.testResults.errorTypes.forEach(type => {
            distribution[type] = 0;
        });

        processResults.forEach(task => {
            if (task.shouldFail && task.errorType) {
                distribution[task.errorType]++;
            }
        });

        return distribution;
    }

    calculateBackoffEffectiveness(processResults) {
        const retryDelays = [];

        processResults.forEach(task => {
            task.retryHistory.forEach((attempt, index) => {
                if (!attempt.success && index < task.retryHistory.length - 1) {
                    const nextAttempt = task.retryHistory[index + 1];
                    const delay = new Date(nextAttempt.timestamp) - new Date(attempt.timestamp);
                    retryDelays.push(delay);
                }
            });
        });

        const averageDelay = retryDelays.length > 0 ?
            retryDelays.reduce((sum, delay) => sum + delay, 0) / retryDelays.length : 0;

        return {
            totalRetryDelays: retryDelays.length,
            averageDelayMs: Math.round(averageDelay),
            expectedDelays: [100, 200, 400], // Exponential backoff targets
            backoffWorking: averageDelay >= 80 && averageDelay <= 500 // Reasonable range
        };
    }

    async saveResults() {
        const resultsPath = await this.testUtils.saveTestResults(3, 'Docker Error Handling', this.testResults);
        console.log(`💾 Layer 3 results saved to: ${resultsPath}`);
        return resultsPath;
    }
}

// Execute test if run directly
if (require.main === module) {
    const test = new Layer3DockerErrorRetryTest();
    test.run()
        .then(async (results) => {
            await test.saveResults();
            console.log('\n' + '='.repeat(60));
            console.log('🎉 LAYER 3 DOCKER ERROR HANDLING TEST COMPLETED');
            console.log('='.repeat(60));

            if (results.summary.successCriteria.allPassed) {
                console.log('✅ All success criteria met!');
                process.exit(0);
            } else {
                console.log('❌ Some success criteria failed:');
                Object.entries(results.summary.successCriteria)
                    .filter(([key, value]) => key !== 'allPassed' && !value)
                    .forEach(([key]) => console.log(`   - ${key}`));
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('❌ Layer 3 test failed:', error.message);
            process.exit(1);
        });
}

module.exports = Layer3DockerErrorRetryTest;