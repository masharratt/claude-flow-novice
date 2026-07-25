#!/usr/bin/env node

/**
 * Redis Key Structure Validation Test
 * Validates that CFN Docker coordination uses correct Redis key patterns and structures
 */

const DockerTestUtils = require('../lib/docker-test-utils.cjs');
const RedisTestUtils = require('../lib/redis-test-utils.cjs');
const { execSync } = require('child_process');

class RedisKeyStructureValidationTest {
    constructor() {
        this.testUtils = new DockerTestUtils();
        this.redisUtils = new RedisTestUtils();
        this.testResults = {
            test: 'Redis Key Structure Validation',
            startTime: new Date().toISOString(),
            endTime: null,
            status: 'RUNNING',
            keyPatterns: {
                taskContext: { expected: 'cfn_docker:task:{taskId}:context', actual: null, valid: false },
                taskMetadata: { expected: 'cfn_docker:task:{taskId}:meta', actual: null, valid: false },
                agentRegistration: { expected: 'cfn_docker:agent:{agentId}', actual: null, valid: false },
                agentStatus: { expected: 'cfn_docker:agent:{agentId}:status', actual: null, valid: false },
                loopCompletion: { expected: 'cfn_docker:task:{taskId}:loop:{loopNumber}:done', actual: null, valid: false },
                consensusCollection: { expected: 'cfn_docker:task:{taskId}:loop:{loopNumber}:consensus', actual: null, valid: false },
                queueManagement: { expected: 'cfn_docker:queue:{queueType}:{taskId}', actual: null, valid: false }
            },
            keyStructure: {
                namespace: { expected: 'cfn_docker:', found: [], valid: false },
                hierarchy: { expected: ['task', 'agent', 'loop', 'queue'], found: [], valid: false },
                separators: { expected: ':', found: [], valid: false }
            },
            validationErrors: [],
            keysFound: [],
            keysAnalyzed: 0
        };
    }

    async run() {
        try {
            console.log('🔑 Starting Redis Key Structure Validation Test');
            console.log('='.repeat(60));

            // Initialize test environment
            await this.testUtils.initializeTestEnvironment();

            // Clear any existing test data
            await this.clearTestKeyspace();

            // Test different Redis key patterns
            const taskId = 'redis-key-validation-test';
            await this.testTaskKeyPatterns(taskId);

            // Test agent key patterns
            await this.testAgentKeyPatterns(taskId);

            // Test loop coordination key patterns
            await this.testLoopCoordinationKeyPatterns(taskId);

            // Test queue management key patterns
            await this.testQueueManagementKeyPatterns(taskId);

            // Validate key namespace consistency
            await this.validateNamespaceConsistency();

            // Analyze Redis key structure
            await this.analyzeKeyStructure();

            this.testResults.endTime = new Date().toISOString();
            this.testResults.status = 'COMPLETED';

            console.log('✅ Redis Key Structure Validation Test COMPLETED');
            return this.testResults;

        } catch (error) {
            this.testResults.validationErrors.push(error.message);
            this.testResults.status = 'FAILED';
            this.testResults.endTime = new Date().toISOString();
            throw error;
        } finally {
            await this.clearTestKeyspace();
        }
    }

    async clearTestKeyspace() {
        console.log('🧹 Clearing test keyspace...');

        try {
            // Find and delete all test keys
            const keys = execSync('redis-cli keys "*redis-key-validation*"', { encoding: 'utf8' }).trim().split('\n').filter(k => k);

            for (const key of keys) {
                if (key) {
                    execSync(`redis-cli del "${key}"`, { encoding: 'utf8' });
                }
            }

            // Find and delete all CFN Docker test keys
            const cfnKeys = execSync('redis-cli keys "cfn_docker:*test*"', { encoding: 'utf8' }).trim().split('\n').filter(k => k);

            for (const key of cfnKeys) {
                if (key) {
                    execSync(`redis-cli del "${key}"`, { encoding: 'utf8' });
                }
            }

            console.log('✅ Test keyspace cleared');
        } catch (error) {
            // Ignore errors during cleanup
            console.log('⚠️ Keyspace cleanup warning:', error.message);
        }
    }

    async testTaskKeyPatterns(taskId) {
        console.log('\n📋 Testing Task Key Patterns...');

        // Test task context storage
        const taskContext = {
            epicGoal: "Test key structure validation",
            deliverables: ["test-file.js"],
            directory: "/tmp/test",
            acceptanceCriteria: ["Keys follow correct pattern"]
        };

        const stored = await this.redisUtils.storeTaskContext(taskId, taskContext);
        if (!stored.success) {
            throw new Error('Failed to store task context for key validation');
        }

        // Verify task context key exists and has correct pattern
        const expectedContextKey = `cfn_docker:task:${taskId}:context`;
        const actualKeys = await this.getRedisKeys('*context*');

        const foundContextKey = actualKeys.find(key => key.includes(taskId) && key.includes('context'));

        this.testResults.keyPatterns.taskContext.actual = foundContextKey;
        this.testResults.keyPatterns.taskContext.valid =
            foundContextKey === expectedContextKey || foundContextKey?.endsWith(`:${taskId}:context`);

        // Test task metadata key
        const initResult = await this.testUtils.initializeDockerCoordination(taskId, {
            test: 'key-validation',
            purpose: 'Test Redis key patterns'
        });

        if (initResult) {
            const expectedMetaKey = `cfn_docker:task:${taskId}:meta`;
            const actualMetaKeys = await this.getRedisKeys('*meta*');
            const foundMetaKey = actualMetaKeys.find(key => key.includes(taskId) && key.includes('meta'));

            this.testResults.keyPatterns.taskMetadata.actual = foundMetaKey;
            this.testResults.keyPatterns.taskMetadata.valid =
                foundMetaKey === expectedMetaKey || foundMetaKey?.endsWith(`:${taskId}:meta`);
        }

        console.log(`   ✅ Task Context Key: ${this.testResults.keyPatterns.taskContext.valid ? 'VALID' : 'INVALID'}`);
        console.log(`   ✅ Task Metadata Key: ${this.testResults.keyPatterns.taskMetadata.valid ? 'VALID' : 'INVALID'}`);
    }

    async testAgentKeyPatterns(taskId) {
        console.log('\n🤖 Testing Agent Key Patterns...');

        const agents = [
            { agentId: 'agent-test-001', agentType: 'backend-developer' },
            { agentId: 'agent-test-002', agentType: 'security-specialist' }
        ];

        for (const agent of agents) {
            // Test agent registration key
            const registered = await this.testUtils.registerAgentInRedis(agent.agentId, agent.agentType, taskId);

            if (registered) {
                // Check for agent registration key
                const expectedRegKey = `cfn_docker:agent:${agent.agentId}`;
                const actualRegKeys = await this.getRedisKeys('*agent*');
                const foundRegKey = actualRegKeys.find(key => key.includes(agent.agentId));

                this.testResults.keyPatterns.agentRegistration.actual = foundRegKey;
                this.testResults.keyPatterns.agentRegistration.valid =
                    foundRegKey?.startsWith('cfn_docker:agent:');

                // Test agent status key
                await this.redisUtils.updateAgentStatus(agent.agentId, 'working');

                const expectedStatusKey = `cfn_docker:agent:${agent.agentId}:status`;
                const actualStatusKeys = await this.getRedisKeys('*status*');
                const foundStatusKey = actualStatusKeys.find(key => key.includes(agent.agentId) && key.includes('status'));

                this.testResults.keyPatterns.agentStatus.actual = foundStatusKey;
                this.testResults.keyPatterns.agentStatus.valid =
                    foundStatusKey?.endsWith(':status');
            }
        }

        console.log(`   ✅ Agent Registration Key: ${this.testResults.keyPatterns.agentRegistration.valid ? 'VALID' : 'INVALID'}`);
        console.log(`   ✅ Agent Status Key: ${this.testResults.keyPatterns.agentStatus.valid ? 'VALID' : 'INVALID'}`);
    }

    async testLoopCoordinationKeyPatterns(taskId) {
        console.log('\n🔄 Testing Loop Coordination Key Patterns...');

        // Test loop completion tracking
        for (let loopNumber = 1; loopNumber <= 3; loopNumber++) {
            // Simulate agent completion for loop
            const agentId = `test-agent-loop${loopNumber}`;
            await this.redisUtils.signalAgentCompletion(taskId, agentId, 0.85, loopNumber);

            // Check for loop completion key
            const expectedLoopKey = `cfn_docker:task:${taskId}:loop:${loopNumber}:done`;
            const actualLoopKeys = await this.getRedisKeys('*loop*');
            const foundLoopKey = actualLoopKeys.find(key => key.includes(`loop:${loopNumber}`) && key.includes('done'));

            if (loopNumber === 3) { // Store the pattern for loop 3 as representative
                this.testResults.keyPatterns.loopCompletion.actual = foundLoopKey;
                this.testResults.keyPatterns.loopCompletion.valid =
                    foundLoopKey?.includes(':loop:') && foundLoopKey?.endsWith(':done');
            }
        }

        // Test consensus collection key
        try {
            const consensusResult = await this.redisUtils.collectConsensus(taskId, 2, 0.90, 5);
            const expectedConsensusKey = `cfn_docker:task:${taskId}:loop:2:consensus`;
            const actualConsensusKeys = await this.getRedisKeys('*consensus*');
            const foundConsensusKey = actualConsensusKeys.find(key => key.includes('consensus'));

            this.testResults.keyPatterns.consensusCollection.actual = foundConsensusKey;
            this.testResults.keyPatterns.consensusCollection.valid =
                foundConsensusKey?.includes(':consensus');
        } catch (error) {
            // Consensus collection might fail, but we can still check for key patterns
            console.log('⚠️ Consensus collection failed, checking key patterns anyway');
        }

        console.log(`   ✅ Loop Completion Key: ${this.testResults.keyPatterns.loopCompletion.valid ? 'VALID' : 'INVALID'}`);
        console.log(`   ✅ Consensus Collection Key: ${this.testResults.keyPatterns.consensusCollection.valid ? 'VALID' : 'INVALID'}`);
    }

    async testQueueManagementKeyPatterns(taskId) {
        console.log('\n📊 Testing Queue Management Key Patterns...');

        // Test different queue types
        const queueTypes = ['review', 'coordination', 'completion'];

        for (const queueType of queueTypes) {
            // Simulate adding items to queue
            const queueData = JSON.stringify({
                type: queueType,
                taskId: taskId,
                timestamp: new Date().toISOString(),
                data: 'test-data'
            });

            // Use Redis lpush to add to queue
            execSync(`redis-cli lpush "cfn_docker:queue:${queueType}:${taskId}" '${queueData}'`, { encoding: 'utf8' });

            // Check for queue key
            const expectedQueueKey = `cfn_docker:queue:${queueType}:${taskId}`;
            const actualQueueKeys = await this.getRedisKeys('*queue*');
            const foundQueueKey = actualQueueKeys.find(key => key.includes(`queue:${queueType}`));

            if (queueType === 'review') { // Store review queue as representative
                this.testResults.keyPatterns.queueManagement.actual = foundQueueKey;
                this.testResults.keyPatterns.queueManagement.valid =
                    foundQueueKey?.startsWith('cfn_docker:queue:');
            }
        }

        console.log(`   ✅ Queue Management Key: ${this.testResults.keyPatterns.queueManagement.valid ? 'VALID' : 'INVALID'}`);
    }

    async validateNamespaceConsistency() {
        console.log('\n🏷️ Validating Namespace Consistency...');

        // Get all CFN Docker keys
        const allKeys = await this.getRedisKeys('cfn_docker:*');

        // Check namespace consistency
        const namespaceConsistent = allKeys.every(key => key.startsWith('cfn_docker:'));
        this.testResults.keyStructure.namespace.valid = namespaceConsistent;
        this.testResults.keyStructure.namespace.found = allKeys;

        // Check hierarchy consistency
        const hierarchyComponents = ['task', 'agent', 'loop', 'queue'];
        const foundComponents = new Set();

        allKeys.forEach(key => {
            const parts = key.split(':');
            parts.forEach(part => {
                if (hierarchyComponents.includes(part)) {
                    foundComponents.add(part);
                }
            });
        });

        const hierarchyComplete = hierarchyComponents.every(comp => foundComponents.has(comp));
        this.testResults.keyStructure.hierarchy.found = Array.from(foundComponents);
        this.testResults.keyStructure.hierarchy.valid = hierarchyComplete;

        // Check separator consistency
        const separatorConsistent = allKeys.every(key => key.includes(':'));
        this.testResults.keyStructure.separators.valid = separatorConsistent;

        console.log(`   ✅ Namespace Consistency: ${namespaceConsistent ? 'VALID' : 'INVALID'}`);
        console.log(`   ✅ Hierarchy Completeness: ${hierarchyComplete ? 'VALID' : 'INVALID'} (${Array.from(foundComponents).join(', ')})`);
        console.log(`   ✅ Separator Consistency: ${separatorConsistent ? 'VALID' : 'INVALID'}`);
    }

    async analyzeKeyStructure() {
        console.log('\n🔍 Analyzing Key Structure...');

        const allKeys = await this.getRedisKeys('cfn_docker:*');
        this.testResults.keysFound = allKeys;
        this.testResults.keysAnalyzed = allKeys.length;

        // Analyze key patterns
        const keyAnalysis = {
            averageLength: 0,
            maxDepth: 0,
            keyTypes: {},
            patternConsistency: 0
        };

        if (allKeys.length > 0) {
            // Calculate average key length
            const totalLength = allKeys.reduce((sum, key) => sum + key.length, 0);
            keyAnalysis.averageLength = Math.round(totalLength / allKeys.length);

            // Calculate maximum depth (number of components)
            keyAnalysis.maxDepth = Math.max(...allKeys.map(key => key.split(':').length));

            // Categorize key types
            allKeys.forEach(key => {
                const parts = key.split(':');
                if (parts.length >= 2) {
                    const keyType = parts[1]; // Second component indicates type
                    keyAnalysis.keyTypes[keyType] = (keyAnalysis.keyTypes[keyType] || 0) + 1;
                }
            });

            // Calculate pattern consistency (how many keys follow expected patterns)
            const expectedPatterns = Object.values(this.testResults.keyPatterns)
                .filter(p => p.expected)
                .map(p => p.expected.replace(/\{[^}]+\}/g, '*'));

            const matchingPatterns = allKeys.filter(key =>
                expectedPatterns.some(pattern => this.keyMatchesPattern(key, pattern))
            ).length;

            keyAnalysis.patternConsistency = Math.round((matchingPatterns / allKeys.length) * 100);
        }

        console.log(`   📊 Keys Analyzed: ${this.testResults.keysAnalyzed}`);
        console.log(`   📏 Average Key Length: ${keyAnalysis.averageLength} characters`);
        console.log(`   📊 Maximum Key Depth: ${keyAnalysis.maxDepth} components`);
        console.log(`   🏷️ Key Types: ${Object.entries(keyAnalysis.keyTypes).map(([type, count]) => `${type}(${count})`).join(', ')}`);
        console.log(`   ✅ Pattern Consistency: ${keyAnalysis.patternConsistency}%`);

        // Store analysis in results
        this.testResults.keyAnalysis = keyAnalysis;
    }

    async getRedisKeys(pattern) {
        try {
            const result = execSync(`redis-cli keys "${pattern}"`, { encoding: 'utf8' });
            return result.trim().split('\n').filter(key => key.length > 0);
        } catch (error) {
            // Redis keys command might return empty result
            return [];
        }
    }

    keyMatchesPattern(key, pattern) {
        // Simple pattern matching with wildcards
        const keyParts = key.split(':');
        const patternParts = pattern.split(':');

        if (keyParts.length !== patternParts.length) {
            return false;
        }

        return patternParts.every((part, index) =>
            part === '*' || part === keyParts[index]
        );
    }

    generateValidationReport() {
        const validationResults = Object.entries(this.testResults.keyPatterns).map(([name, pattern]) => ({
            name,
            expected: pattern.expected,
            actual: pattern.actual,
            valid: pattern.valid
        }));

        const allValid = validationResults.every(result => result.valid);

        return {
            overallValid: allValid,
            keyPatternValidation: validationResults,
            structureValidation: this.testResults.keyStructure,
            analysis: this.testResults.keyAnalysis,
            summary: {
                totalKeys: this.testResults.keysAnalyzed,
                validPatterns: validationResults.filter(r => r.valid).length,
                invalidPatterns: validationResults.filter(r => !r.valid).length,
                patternConsistency: this.testResults.keyAnalysis?.patternConsistency || 0
            }
        };
    }

    async saveResults() {
        const validationReport = this.generateValidationReport();
        this.testResults.validationReport = validationReport;

        const resultsPath = await this.testUtils.saveTestResults('specialized-redis-keys', 'Redis Key Structure Validation', this.testResults);
        console.log(`💾 Redis key validation results saved to: ${resultsPath}`);
        return resultsPath;
    }
}

// Execute test if run directly
if (require.main === module) {
    const test = new RedisKeyStructureValidationTest();
    test.run()
        .then(async (results) => {
            await test.saveResults();
            console.log('\n' + '='.repeat(60));
            console.log('🎉 REDIS KEY STRUCTURE VALIDATION TEST COMPLETED');
            console.log('='.repeat(60));

            const report = results.validationReport;
            console.log(`🏆 Overall Validation: ${report.overallValid ? '✅ VALID' : '❌ INVALID'}`);
            console.log(`📊 Keys Analyzed: ${report.summary.totalKeys}`);
            console.log(`✅ Valid Patterns: ${report.summary.validPatterns}/${Object.keys(results.keyPatterns).length}`);
            console.log(`📏 Pattern Consistency: ${report.summary.patternConsistency}%`);

            if (!report.overallValid) {
                console.log('\n❌ Invalid Key Patterns:');
                report.keyPatternValidation
                    .filter(p => !p.valid)
                    .forEach(p => {
                        console.log(`   - ${p.name}: Expected "${p.expected}", Got "${p.actual}"`);
                    });
                process.exit(1);
            }

            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Redis key structure validation failed:', error.message);
            process.exit(1);
        });
}

module.exports = RedisKeyStructureValidationTest;