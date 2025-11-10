#!/usr/bin/env node

/**
 * CFN Loop Container Coordination Test
 * Tests Redis-based coordination protocols between containers
 */

import Redis from 'ioredis';
import { performance } from 'perf_hooks';

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TEST_TASK_ID = `coordination-test-${Date.now()}`;
const TEST_TIMEOUT = 30000; // 30 seconds

// Test results
const testResults = {
    connectivity: false,
    signalBroadcast: false,
    agentCompletion: false,
    consensusCollection: false,
    performance: {}
};

// Redis client
let redis;

async function connectRedis() {
    try {
        redis = new Redis(REDIS_URL);
        await redis.ping();
        console.log('✓ Redis connection established');
        return true;
    } catch (error) {
        console.error('✗ Redis connection failed:', error.message);
        return false;
    }
}

async function testConnectivity() {
    console.log('\n=== Testing Redis Connectivity ===');

    try {
        const startTime = performance.now();

        // Test basic operations
        await redis.set('test:connectivity', 'ok');
        const value = await redis.get('test:connectivity');

        // Cleanup
        await redis.del('test:connectivity');

        const endTime = performance.now();
        testResults.performance.connectivity = endTime - startTime;

        if (value === 'ok') {
            console.log('✓ Basic Redis operations work');
            testResults.connectivity = true;
            return true;
        }

        return false;
    } catch (error) {
        console.error('✗ Connectivity test failed:', error.message);
        return false;
    }
}

async function testSignalBroadcast() {
    console.log('\n=== Testing Signal Broadcasting ===');

    try {
        const startTime = performance.now();

        // Simulate coordinator broadcast
        const broadcastKey = `swarm:${TEST_TASK_ID}:broadcast`;
        const signalData = {
            type: 'task-start',
            taskId: TEST_TASK_ID,
            timestamp: Date.now(),
            coordinator: 'container-test'
        };

        // Broadcast signal
        await redis.publish(broadcastKey, JSON.stringify(signalData));

        // Simulate agent subscription
        let messageReceived = false;
        const subscriber = new Redis(REDIS_URL);

        await subscriber.subscribe(broadcastKey);
        subscriber.on('message', (channel, message) => {
            if (channel === broadcastKey) {
                const data = JSON.parse(message);
                if (data.taskId === TEST_TASK_ID) {
                    messageReceived = true;
                }
            }
        });

        // Wait for message
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test direct signal (alternative to pub/sub)
        const signalKey = `swarm:${TEST_TASK_ID}:coordinator:signal`;
        await redis.set(signalKey, JSON.stringify(signalData));
        const storedSignal = await redis.get(signalKey);

        // Cleanup
        await subscriber.quit();
        await redis.del(signalKey);

        const endTime = performance.now();
        testResults.performance.signalBroadcast = endTime - startTime;

        if (storedSignal && JSON.parse(storedSignal).taskId === TEST_TASK_ID) {
            console.log('✓ Signal broadcasting works');
            testResults.signalBroadcast = true;
            return true;
        }

        return false;
    } catch (error) {
        console.error('✗ Signal broadcast test failed:', error.message);
        return false;
    }
}

async function testAgentCompletionProtocol() {
    console.log('\n=== Testing Agent Completion Protocol ===');

    try {
        const startTime = performance.now();

        const agentId = `test-agent-${Date.now()}`;
        const completionKey = `swarm:${TEST_TASK_ID}:${agentId}:done`;
        const confidenceKey = `swarm:${TEST_TASK_ID}:${agentId}:confidence`;

        // Simulate agent completion
        const completionData = {
            agentId,
            taskId: TEST_TASK_ID,
            status: 'complete',
            timestamp: Date.now(),
            deliverables: ['test-file.js', 'test-result.json']
        };

        const confidenceData = {
            agentId,
            taskId: TEST_TASK_ID,
            confidence: 0.85,
            iteration: 1,
            metadata: { test: true }
        };

        // Store completion data
        await redis.hset(completionKey, 'data', JSON.stringify(completionData));
        await redis.hset(confidenceKey, 'data', JSON.stringify(confidenceData));

        // Set expiration
        await redis.expire(completionKey, 3600);
        await redis.expire(confidenceKey, 3600);

        // Retrieve completion data
        const retrievedCompletion = await redis.hget(completionKey, 'data');
        const retrievedConfidence = await redis.hget(confidenceKey, 'data');

        // Cleanup
        await redis.del(completionKey, confidenceKey);

        const endTime = performance.now();
        testResults.performance.agentCompletion = endTime - startTime;

        if (retrievedCompletion && retrievedConfidence) {
            const completion = JSON.parse(retrievedCompletion);
            const confidence = JSON.parse(retrievedConfidence);

            if (completion.agentId === agentId && confidence.confidence === 0.85) {
                console.log('✓ Agent completion protocol works');
                testResults.agentCompletion = true;
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('✗ Agent completion protocol test failed:', error.message);
        return false;
    }
}

async function testConsensusCollection() {
    console.log('\n=== Testing Consensus Collection ===');

    try {
        const startTime = performance.now();

        const consensusKey = `swarm:${TEST_TASK_ID}:consensus`;

        // Simulate multiple agent completions
        const agents = ['agent-1', 'agent-2', 'agent-3'];
        const confidences = [0.85, 0.90, 0.88];

        // Store individual confidences
        for (let i = 0; i < agents.length; i++) {
            const confidenceKey = `swarm:${TEST_TASK_ID}:${agents[i]}:confidence`;
            await redis.hset(confidenceKey, 'data', JSON.stringify({
                agentId: agents[i],
                confidence: confidences[i],
                timestamp: Date.now()
            }));
        }

        // Collect consensus
        const consensusData = {
            taskId: TEST_TASK_ID,
            agents: agents.length,
            averageConfidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
            timestamp: Date.now(),
            status: 'complete'
        };

        await redis.set(consensusKey, JSON.stringify(consensusData));

        // Retrieve consensus
        const retrievedConsensus = await redis.get(consensusKey);

        // Cleanup
        for (const agent of agents) {
            const confidenceKey = `swarm:${TEST_TASK_ID}:${agent}:confidence`;
            await redis.del(confidenceKey);
        }
        await redis.del(consensusKey);

        const endTime = performance.now();
        testResults.performance.consensusCollection = endTime - startTime;

        if (retrievedConsensus) {
            const consensus = JSON.parse(retrievedConsensus);
            if (consensus.agents === agents.length && consensus.averageConfidence >= 0.85) {
                console.log('✓ Consensus collection works');
                testResults.consensusCollection = true;
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('✗ Consensus collection test failed:', error.message);
        return false;
    }
}

async function generatePerformanceReport() {
    console.log('\n=== Performance Report ===');

    const totalPerformance = Object.values(testResults.performance).reduce((sum, time) => sum + time, 0);

    console.log('Performance Metrics:');
    Object.entries(testResults.performance).forEach(([test, time]) => {
        console.log(`  ${test}: ${time.toFixed(2)}ms`);
    });
    console.log(`  Total: ${totalPerformance.toFixed(2)}ms`);

    // Determine overall success
    const passedTests = Object.values(testResults).filter(value =>
        typeof value === 'boolean' ? value : false
    ).length;

    const totalTests = Object.keys(testResults).filter(key =>
        typeof testResults[key] === 'boolean'
    ).length;

    console.log(`\nTest Results: ${passedTests}/${totalTests} tests passed`);

    if (passedTests === totalTests) {
        console.log('🎉 All CFN Loop coordination tests passed!');
        return true;
    } else {
        console.log('❌ Some tests failed');
        return false;
    }
}

async function runTests() {
    console.log('CFN Loop Container Coordination Test');
    console.log('=====================================');
    console.log(`Task ID: ${TEST_TASK_ID}`);
    console.log(`Redis URL: ${REDIS_URL}`);

    // Connect to Redis
    if (!await connectRedis()) {
        process.exit(1);
    }

    try {
        // Run all tests
        await testConnectivity();
        await testSignalBroadcast();
        await testAgentCompletionProtocol();
        await testConsensusCollection();

        // Generate report
        const success = await generatePerformanceReport();

        process.exit(success ? 0 : 1);

    } catch (error) {
        console.error('Test execution failed:', error);
        process.exit(1);
    } finally {
        if (redis) {
            await redis.quit();
        }
    }
}

// Handle timeout
const timeout = setTimeout(() => {
    console.error('Tests timed out after', TEST_TIMEOUT, 'ms');
    process.exit(1);
}, TEST_TIMEOUT);

// Run tests
runTests().then(() => {
    clearTimeout(timeout);
}).catch(error => {
    clearTimeout(timeout);
    console.error('Test suite failed:', error);
    process.exit(1);
});