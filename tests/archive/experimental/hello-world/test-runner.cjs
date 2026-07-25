#!/usr/bin/env node

/**
 * Docker Hello World Test Runner
 * Simplified test runner for docker-compatible Hello World tests
 */

const DockerTestUtils = require('./lib/docker-test-utils.cjs');

class TestRunner {
    constructor() {
        this.testUtils = new DockerTestUtils();
    }

    async runTest(testName, testFunction) {
        console.log(`\n🧪 Running ${testName}...`);
        console.log('='.repeat(50));

        const startTime = Date.now();

        try {
            const result = await testFunction();
            const duration = Date.now() - startTime;

            console.log(`✅ ${testName} PASSED (${Math.round(duration / 1000)}s)`);
            return true;
        } catch (error) {
            console.error(`❌ ${testName} FAILED:`, error.message);
            return false;
        }
    }
}

async function main() {
    console.log('🐳 Docker Hello World Test Suite');
    console.log('='.repeat(50));

    const runner = new TestRunner();
    const results = [];

    // Test 1: Environment Initialization
    results.push(await runner.runTest('Environment Initialization', async () => {
        await runner.testUtils.initializeTestEnvironment();
        const health = await runner.testUtils.getSystemHealth();
        if (!health.redis || !health.docker) {
            throw new Error('System health check failed');
        }
        return true;
    }));

    // Test 2: Basic Coordination
    results.push(await runner.runTest('Basic Coordination', async () => {
        const taskId = 'test-basic-coordination';
        const initResult = await runner.testUtils.initializeDockerCoordination(taskId, {
            test: 'basic',
            purpose: 'Test Redis coordination initialization'
        });

        if (!initResult) {
            throw new Error('Docker coordination initialization failed');
        }

        // Test Redis storage
        const context = { test: 'data', timestamp: new Date().toISOString() };
        const stored = await runner.testUtils.redisUtils.storeTaskContext(taskId, context);

        if (!stored.success) {
            throw new Error('Redis context storage failed');
        }

        const retrieved = await runner.testUtils.redisUtils.getTaskContext(taskId);
        if (!retrieved.success || !retrieved.context.test) {
            throw new Error('Redis context retrieval failed');
        }

        await runner.testUtils.cleanup(taskId);
        return true;
    }));

    // Test 3: Agent Spawning Logic (mock mode to test coordination logic)
    results.push(await runner.runTest('Agent Spawning Logic', async () => {
        // Test Docker coordination initialization for spawning
        const taskId = 'test-agent-spawning-logic';
        const initResult = await runner.testUtils.initializeDockerCoordination(taskId, {
            test: 'spawning-logic',
            purpose: 'Test agent spawning coordination logic'
        });

        if (!initResult) {
            throw new Error('Docker coordination initialization for spawning logic failed');
        }

        // Test mock agent registration in Redis (simulating successful spawns)
        const mockAgents = [
            { agentId: 'backend-developer-mock-001', agentType: 'backend-developer' },
            { agentId: 'react-frontend-engineer-mock-002', agentType: 'react-frontend-engineer' }
        ];

        let registrationSuccess = 0;
        for (const agent of mockAgents) {
            const registered = await runner.testUtils.registerAgentInRedis(
                agent.agentId,
                agent.agentType,
                taskId,
                `mock-container-${agent.agentId}`
            );

            if (registered) {
                registrationSuccess++;
            }
        }

        if (registrationSuccess === 0) {
            throw new Error('No mock agents registered successfully in Redis');
        }

        const registrationRate = registrationSuccess / mockAgents.length;
        if (registrationRate < 0.5) {
            throw new Error(`Low mock registration rate: ${(registrationRate * 100).toFixed(1)}%`);
        }

        console.log(`✅ Mock agent registration: ${registrationSuccess}/${mockAgents.length} successful`);
        await runner.testUtils.cleanup(taskId);
        return true;
    }));

    // Print summary
    const passedCount = results.filter(r => r).length;
    const totalCount = results.length;

    console.log('\n' + '='.repeat(50));
    console.log('📊 Docker Hello World Test Suite Results');
    console.log('='.repeat(50));
    console.log(`   Total Tests: ${totalCount}`);
    console.log(`   Passed: ${passedCount}`);
    console.log(`   Failed: ${totalCount - passedCount}`);
    console.log(`   Success Rate: ${((passedCount / totalCount) * 100).toFixed(1)}%`);
    console.log(`   Status: ${passedCount === totalCount ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log('='.repeat(50));

    process.exit(passedCount === totalCount ? 0 : 1);
}

if (require.main === module) {
    main().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = TestRunner;