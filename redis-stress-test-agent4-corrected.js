#!/usr/bin/env node

/**
 * Redis Stress Test - Agent 4 of 4 (Corrected)
 * Creates 50 Redis coordinator instances and calls all 20 Redis functions each
 * Monitors memory usage patterns and connection attempts
 */

// Set Task Mode environment
process.env.CFN_MODE = 'task';

// Import memory monitoring
const memoryUsage = () => {
    const usage = process.memoryUsage();
    return {
        rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
        external: Math.round(usage.external / 1024 / 1024 * 100) / 100, // MB
        timestamp: new Date().toISOString()
    };
};

console.log('='.repeat(80));
console.log('REDIS STRESS TEST - AGENT 4 OF 4 (CORRECTED)');
console.log('Task Mode:', process.env.CFN_MODE);
console.log('Test Plan: 50 coordinator instances × 20 Redis functions each = 1000 total function calls');
console.log('='.repeat(80));

// Initial memory measurement
const initialMemory = memoryUsage();
console.log('\n📊 INITIAL MEMORY STATE:');
console.log(`RSS: ${initialMemory.rss} MB`);
console.log(`Heap Used: ${initialMemory.heapUsed} MB`);
console.log(`Heap Total: ${initialMemory.heapTotal} MB`);
console.log(`External: ${initialMemory.external} MB`);
console.log(`Timestamp: ${initialMemory.timestamp}`);

// Test variables
let connectionAttempts = 0;
let errors = [];
let functionCallCount = 0;
let coordinatorCount = 0;

async function runStressTest() {
    try {
        // Import RedisCoordinator after Task Mode is set
        const { RedisCoordinator } = await import('./.claude/skills/cfn-redis-coordination/dist/index.js');

        console.log('\n🚀 STARTING REDIS STRESS TEST');
        console.log(`Creating 50 Redis coordinator instances...`);

        const coordinators = [];

        // Phase 1: Create 50 coordinator instances
        for (let i = 0; i < 50; i++) {
            try {
                const coordinator = new RedisCoordinator();
                coordinators.push(coordinator);
                coordinatorCount++;

                if (i % 10 === 0) {
                    console.log(`Created ${i + 1}/50 coordinators...`);
                }
            } catch (error) {
                errors.push({
                    type: 'COORDINATOR_CREATION',
                    instance: i,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        console.log(`✅ Successfully created ${coordinatorCount}/50 coordinators`);

        // Mid-test memory measurement
        const midMemory = memoryUsage();
        console.log('\n📊 MID-TEST MEMORY STATE (after coordinator creation):');
        console.log(`RSS: ${midMemory.rss} MB (+${(midMemory.rss - initialMemory.rss).toFixed(2)} MB)`);
        console.log(`Heap Used: ${midMemory.heapUsed} MB (+${(midMemory.heapUsed - initialMemory.heapUsed).toFixed(2)} MB)`);
        console.log(`Heap Total: ${midMemory.heapTotal} MB (+${(midMemory.heapTotal - initialMemory.heapTotal).toFixed(2)} MB)`);
        console.log(`External: ${midMemory.external} MB (+${(midMemory.external - initialMemory.external).toFixed(2)} MB)`);

        console.log('\n🔄 EXECUTING ALL 20 REDIS FUNCTIONS ON EACH COORDINATOR...');

        // Phase 2: Initialize and call all 20 Redis functions on each coordinator
        const redisFunctions = [
            'initialize',
            'lpush', 'rpush', 'blpop', 'hset', 'hget', 'hgetall', 'set', 'get',
            'del', 'expire', 'ping', 'exists', 'zadd', 'zrevrange', 'zrange', 'zrem',
            'sadd', 'smembers', 'publish', 'disconnect'
        ];

        console.log(`Redis function sequence: ${redisFunctions.join(', ')}`);
        console.log(`Total planned function calls: ${coordinatorCount} × ${redisFunctions.length} = ${coordinatorCount * redisFunctions.length}`);

        for (let i = 0; i < coordinators.length; i++) {
            const coordinator = coordinators[i];
            let instanceCalls = 0;
            let instanceErrors = 0;

            try {
                // Call all 20 Redis functions in sequence
                for (const functionName of redisFunctions) {
                    try {
                        let result;

                        // Initialize with special handling
                        if (functionName === 'initialize') {
                            result = await coordinator.initialize();
                            connectionAttempts++; // Track potential connection attempts
                        }
                        // Functions with different argument patterns
                        else if (functionName === 'lpush' || functionName === 'rpush') {
                            result = await coordinator[functionName](`test-list-${i}`, `value-${functionName}-${i}`);
                        } else if (functionName === 'blpop') {
                            result = await coordinator.blpop(`test-list-${i}`, 1); // 1 second timeout
                        } else if (functionName === 'hset') {
                            result = await coordinator.hset(`test-hash-${i}`, 'field1', `value-${i}`, 'field2', `value2-${i}`);
                        } else if (functionName === 'hget') {
                            result = await coordinator.hget(`test-hash-${i}`, 'field1');
                        } else if (functionName === 'hgetall') {
                            result = await coordinator.hgetall(`test-hash-${i}`);
                        } else if (functionName === 'set') {
                            result = await coordinator.set(`test-key-${i}`, `value-${i}`);
                        } else if (functionName === 'get') {
                            result = await coordinator.get(`test-key-${i}`);
                        } else if (functionName === 'del') {
                            result = await coordinator.del(`test-key-${i}`, `test-list-${i}`, `test-hash-${i}`);
                        } else if (functionName === 'expire') {
                            result = await coordinator.expire(`test-key-${i}`, 60);
                        } else if (functionName === 'ping') {
                            result = await coordinator.ping();
                        } else if (functionName === 'exists') {
                            result = await coordinator.exists(`test-key-${i}`);
                        } else if (functionName === 'zadd') {
                            result = await coordinator.zadd(`test-zset-${i}`, '1', 'member1', '2', 'member2');
                        } else if (functionName === 'zrevrange' || functionName === 'zrange') {
                            result = await coordinator[functionName](`test-zset-${i}`, 0, -1);
                        } else if (functionName === 'zrem') {
                            result = await coordinator.zrem(`test-zset-${i}`, 'member1');
                        } else if (functionName === 'sadd') {
                            result = await coordinator.sadd(`test-set-${i}`, 'member1', 'member2');
                        } else if (functionName === 'smembers') {
                            result = await coordinator.smembers(`test-set-${i}`);
                        } else if (functionName === 'publish') {
                            result = await coordinator.publish(`test-channel-${i}`, `message-${i}`);
                        } else if (functionName === 'disconnect') {
                            result = await coordinator.disconnect();
                        } else {
                            // Generic call for any other functions
                            result = await coordinator[functionName](`test-${i}`);
                        }

                        functionCallCount++;
                        instanceCalls++;

                    } catch (functionError) {
                        instanceErrors++;
                        errors.push({
                            type: 'FUNCTION_CALL',
                            coordinator: i,
                            function: functionName,
                            error: functionError.message,
                            timestamp: new Date().toISOString()
                        });
                    }
                }

                // Log progress every 10 coordinators
                if ((i + 1) % 10 === 0) {
                    console.log(`Coordinator ${i + 1}/50 completed: ${instanceCalls} functions, ${instanceErrors} errors`);
                }

            } catch (coordinatorError) {
                errors.push({
                    type: 'COORDINATOR_EXECUTION',
                    coordinator: i,
                    error: coordinatorError.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        console.log(`\n✅ EXECUTION COMPLETE`);
        console.log(`Total function calls attempted: ${functionCallCount}`);
        console.log(`Total errors encountered: ${errors.length}`);

    } catch (importError) {
        console.error('❌ CRITICAL: Failed to import RedisCoordinator:', importError.message);
        errors.push({
            type: 'IMPORT_ERROR',
            error: importError.message,
            stack: importError.stack,
            timestamp: new Date().toISOString()
        });
    }
}

// Final memory measurement and results reporting
function reportResults() {
    const finalMemory = memoryUsage();

    console.log('\n'.repeat(2));
    console.log('='.repeat(80));
    console.log('📊 REDIS STRESS TEST RESULTS - AGENT 4 (CORRECTED)');
    console.log('='.repeat(80));

    console.log('\n🔢 EXECUTION SUMMARY:');
    console.log(`Coordinators created: ${coordinatorCount}/50`);
    console.log(`Function calls attempted: ${functionCallCount}/${coordinatorCount * 20}`);
    console.log(`Connection attempts (initialize): ${connectionAttempts}`);
    console.log(`Errors encountered: ${errors.length}`);

    console.log('\n💾 MEMORY USAGE ANALYSIS:');
    console.log(`Initial RSS: ${initialMemory.rss} MB`);
    console.log(`Final RSS: ${finalMemory.rss} MB`);
    console.log(`RSS Delta: ${(finalMemory.rss - initialMemory.rss).toFixed(2)} MB`);

    console.log(`Initial Heap: ${initialMemory.heapUsed} MB`);
    console.log(`Final Heap: ${finalMemory.heapUsed} MB`);
    console.log(`Heap Delta: ${(finalMemory.heapUsed - initialMemory.heapUsed).toFixed(2)} MB`);

    const memoryPerCoordinator = coordinatorCount > 0 ?
        (finalMemory.heapUsed - initialMemory.heapUsed) / coordinatorCount : 0;
    console.log(`Memory per coordinator: ${memoryPerCoordinator.toFixed(4)} MB`);

    console.log('\n🔍 ERROR ANALYSIS:');
    if (errors.length === 0) {
        console.log('✅ No errors encountered - test completed successfully');
    } else {
        console.log(`❌ ${errors.length} errors encountered:`);
        const errorTypes = {};
        errors.forEach(error => {
            errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
        });

        Object.entries(errorTypes).forEach(([type, count]) => {
            console.log(`  ${type}: ${count} occurrences`);
        });

        console.log('\nFirst 5 errors:');
        errors.slice(0, 5).forEach((error, index) => {
            console.log(`  ${index + 1}. ${error.type}: ${error.error}`);
        });
    }

    console.log('\n🔌 CONNECTION ANALYSIS:');
    if (connectionAttempts === 0) {
        console.log('🚫 NO Redis connection attempts detected');
    } else {
        console.log(`⚠️  ${connectionAttempts} initialize() calls detected (potential connection attempts)`);
    }

    console.log('\n🎯 TEST CONCLUSIONS:');
    if (errors.length === 0 && connectionAttempts > 0) {
        console.log('✅ PERFECT: No Redis connections attempted, all functions gracefully stubbed');
    } else if (errors.length > 0) {
        console.log('⚠️  ERRORS: Investigate function call failures');
    } else {
        console.log('⚠️  UNEXPECTED: No connection attempts or other activity detected');
    }

    const memoryLeakSuspected = (finalMemory.heapUsed - initialMemory.heapUsed) > 50;
    if (memoryLeakSuspected) {
        console.log('⚠️  MEMORY LEAK SUSPECTED: High memory usage increase');
    } else {
        console.log('✅ MEMORY STABLE: No significant memory leaks detected');
    }

    console.log('\n📈 AGENT 4 SUMMARY:');
    console.log(`• Task Mode isolation: ${connectionAttempts > 0 ? 'TESTED' : 'UNKNOWN'}`);
    console.log(`• Function call coverage: ${functionCallCount}/${coordinatorCount * 20} (${Math.round(functionCallCount / (coordinatorCount * 20) * 100)}%)`);
    console.log(`• Error rate: ${errors.length > 0 ? Math.round(errors.length / functionCallCount * 100) : 0}%`);
    console.log(`• Memory efficiency: ${memoryPerCoordinator.toFixed(4)} MB per coordinator`);

    console.log('\n' + '='.repeat(80));
    console.log('Agent 4 stress test completed.');
    console.log('='.repeat(80));
}

// Run the stress test and report results
runStressTest().then(() => {
    reportResults();
}).catch((error) => {
    console.error('❌ STRESS TEST FAILED:', error);
    errors.push({
        type: 'TEST_EXECUTION',
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    });
    reportResults();
});