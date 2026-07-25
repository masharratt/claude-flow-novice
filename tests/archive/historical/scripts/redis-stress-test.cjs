#!/usr/bin/env node

/**
 * Redis Stress Test - Agent 3 of 4
 *
 * Tests memory usage and connection attempts with Redis coordinators
 * in Task Mode (should gracefully no-op Redis operations)
 */

const { performance } = require('perf_hooks');

// Set Task Mode environment (CFN_MODE=task, no TASK_ID/AGENT_ID)
process.env.CFN_MODE = 'task';
delete process.env.TASK_ID;
delete process.env.AGENT_ID;

console.log('='.repeat(80));
console.log('REDIS STRESS TEST - AGENT 3 OF 4');
console.log('='.repeat(80));
console.log('Mode: Task Mode (Redis operations should gracefully no-op)');
console.log('Environment: CFN_MODE=task, no TASK_ID/AGENT_ID');
console.log('');

// Memory measurement utilities
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
        external: Math.round(usage.external / 1024 / 1024 * 100) / 100 // MB
    };
}

// Import RedisCoordinator from the compiled dist folder
let RedisCoordinator;
try {
    const redisCoordModule = require('../.claude/skills/cfn-redis-coordination/dist/index.js');
    RedisCoordinator = redisCoordModule.RedisCoordinator;
    console.log('✓ Successfully imported RedisCoordinator');
} catch (error) {
    console.error('✗ Failed to import RedisCoordinator:', error.message);
    process.exit(1);
}

// Test configuration
const NUM_INSTANCES = 50;
const ALL_FUNCTIONS = [
    'initialize',
    'set',
    'get',
    'del',
    'exists',
    'hset',
    'hget',
    'hgetall',
    'hdel',
    'sadd',
    'smembers',
    'srem',
    'lpush',
    'lrange',
    'lpop',
    'rpush',
    'rpop',
    'expire',
    'ttl',
    'keys',
    'flushdb'
];

async function runStressTest() {
    const startTime = performance.now();
    const instances = [];
    const errors = [];
    const connectionAttempts = [];

    // Initial memory measurement
    console.log('\n--- INITIAL MEMORY MEASUREMENT ---');
    const initialMemory = getMemoryUsage();
    console.log(`RSS: ${initialMemory.rss} MB`);
    console.log(`Heap Used: ${initialMemory.heapUsed} MB`);
    console.log(`Heap Total: ${initialMemory.heapTotal} MB`);
    console.log(`External: ${initialMemory.external} MB`);

    // Phase 1: Create 50 Redis coordinator instances
    console.log(`\n--- PHASE 1: Creating ${NUM_INSTANCES} Redis coordinator instances ---`);

    for (let i = 0; i < NUM_INSTANCES; i++) {
        try {
            const coordinator = new RedisCoordinator({
                host: 'localhost',
                port: 6379,
                lazyConnect: true,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3
            });
            instances.push(coordinator);

            if ((i + 1) % 10 === 0) {
                console.log(`Created ${i + 1}/${NUM_INSTANCES} instances`);
            }
        } catch (error) {
            errors.push({
                phase: 'creation',
                instance: i,
                error: error.message,
                stack: error.stack
            });
            console.error(`Error creating instance ${i}:`, error.message);
        }
    }

    // Mid-creation memory measurement
    console.log('\n--- MID-CREATION MEMORY MEASUREMENT ---');
    const midMemory = getMemoryUsage();
    console.log(`RSS: ${midMemory.rss} MB (+${midMemory.rss - initialMemory.rss} MB)`);
    console.log(`Heap Used: ${midMemory.heapUsed} MB (+${midMemory.heapUsed - initialMemory.heapUsed} MB)`);
    console.log(`Heap Total: ${midMemory.heapTotal} MB (+${midMemory.heapTotal - initialMemory.heapTotal} MB)`);
    console.log(`External: ${midMemory.external} MB (+${midMemory.external - initialMemory.external} MB)`);

    // Phase 2: Call ALL 21 functions on each instance
    console.log(`\n--- PHASE 2: Executing ${ALL_FUNCTIONS.length} functions on ${instances.length} instances ---`);

    let totalFunctionCalls = 0;
    let successfulCalls = 0;

    for (let i = 0; i < instances.length; i++) {
        const coordinator = instances[i];
        let instanceSuccessful = 0;

        for (const functionName of ALL_FUNCTIONS) {
            totalFunctionCalls++;

            try {
                // Track if initialize attempts connection
                if (functionName === 'initialize') {
                    const originalConnect = coordinator.client?.connect;
                    if (originalConnect) {
                        connectionAttempts.push({
                            instance: i,
                            function: functionName,
                            phase: 'initialize'
                        });
                    }
                }

                // Call the function with appropriate parameters
                let result;
                switch (functionName) {
                    case 'initialize':
                        result = await coordinator.initialize();
                        break;
                    case 'set':
                        result = await coordinator.set(`test:key:${i}`, `value:${i}`);
                        break;
                    case 'get':
                        result = await coordinator.get(`test:key:${i}`);
                        break;
                    case 'del':
                        result = await coordinator.del(`test:key:${i}`);
                        break;
                    case 'exists':
                        result = await coordinator.exists(`test:key:${i}`);
                        break;
                    case 'hset':
                        result = await coordinator.hset(`test:hash:${i}`, 'field', 'value');
                        break;
                    case 'hget':
                        result = await coordinator.hget(`test:hash:${i}`, 'field');
                        break;
                    case 'hgetall':
                        result = await coordinator.hgetall(`test:hash:${i}`);
                        break;
                    case 'hdel':
                        result = await coordinator.hdel(`test:hash:${i}`, 'field');
                        break;
                    case 'sadd':
                        result = await coordinator.sadd(`test:set:${i}`, 'member');
                        break;
                    case 'smembers':
                        result = await coordinator.smembers(`test:set:${i}`);
                        break;
                    case 'srem':
                        result = await coordinator.srem(`test:set:${i}`, 'member');
                        break;
                    case 'lpush':
                        result = await coordinator.lpush(`test:list:${i}`, 'value');
                        break;
                    case 'lrange':
                        result = await coordinator.lrange(`test:list:${i}`, 0, -1);
                        break;
                    case 'lpop':
                        result = await coordinator.lpop(`test:list:${i}`);
                        break;
                    case 'rpush':
                        result = await coordinator.rpush(`test:list:${i}`, 'value');
                        break;
                    case 'rpop':
                        result = await coordinator.rpop(`test:list:${i}`);
                        break;
                    case 'expire':
                        result = await coordinator.expire(`test:key:${i}`, 60);
                        break;
                    case 'ttl':
                        result = await coordinator.ttl(`test:key:${i}`);
                        break;
                    case 'keys':
                        result = await coordinator.keys('*');
                        break;
                    case 'flushdb':
                        result = await coordinator.flushdb();
                        break;
                }

                instanceSuccessful++;
                successfulCalls++;

                // Log any non-null results (might indicate actual Redis calls)
                if (result !== null && result !== undefined && functionName !== 'initialize') {
                    console.log(`Instance ${i}, function ${functionName}: Result = ${JSON.stringify(result)}`);
                }

            } catch (error) {
                errors.push({
                    phase: 'execution',
                    instance: i,
                    function: functionName,
                    error: error.message
                });
                // Don't log all errors to avoid spam, just count them
            }
        }

        // Progress update every 10 instances
        if ((i + 1) % 10 === 0) {
            console.log(`Completed instance ${i + 1}/${instances.length} (${instanceSuccessful}/${ALL_FUNCTIONS.length} functions successful)`);
        }
    }

    // Final memory measurement
    console.log('\n--- FINAL MEMORY MEASUREMENT ---');
    const finalMemory = getMemoryUsage();
    console.log(`RSS: ${finalMemory.rss} MB (+${finalMemory.rss - initialMemory.rss} MB total)`);
    console.log(`Heap Used: ${finalMemory.heapUsed} MB (+${finalMemory.heapUsed - initialMemory.heapUsed} MB total)`);
    console.log(`Heap Total: ${finalMemory.heapTotal} MB (+${finalMemory.heapTotal - initialMemory.heapTotal} MB total)`);
    console.log(`External: ${finalMemory.external} MB (+${finalMemory.external - initialMemory.external} MB total)`);

    // Cleanup phase
    console.log('\n--- PHASE 3: Cleanup ---');
    let cleanupSuccess = 0;
    let cleanupErrors = 0;

    for (let i = 0; i < instances.length; i++) {
        try {
            const coordinator = instances[i];
            if (coordinator && coordinator.client) {
                await coordinator.client.quit();
                cleanupSuccess++;
            }
        } catch (error) {
            cleanupErrors++;
            errors.push({
                phase: 'cleanup',
                instance: i,
                error: error.message
            });
        }
    }

    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Results summary
    console.log('\n' + '='.repeat(80));
    console.log('REDIS STRESS TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`Test Duration: ${duration} seconds`);
    console.log(`Instances Created: ${instances.length}/${NUM_INSTANCES}`);
    console.log(`Total Function Calls: ${totalFunctionCalls}`);
    console.log(`Successful Calls: ${successfulCalls}`);
    console.log(`Success Rate: ${((successfulCalls / totalFunctionCalls) * 100).toFixed(2)}%`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Connection Attempts Detected: ${connectionAttempts.length}`);
    console.log(`Cleanup Successful: ${cleanupSuccess}`);
    console.log(`Cleanup Errors: ${cleanupErrors}`);

    console.log('\n--- MEMORY ANALYSIS ---');
    console.log(`Initial RSS: ${initialMemory.rss} MB`);
    console.log(`Final RSS: ${finalMemory.rss} MB`);
    console.log(`RSS Growth: ${finalMemory.rss - initialMemory.rss} MB`);
    console.log(`Initial Heap Used: ${initialMemory.heapUsed} MB`);
    console.log(`Final Heap Used: ${finalMemory.heapUsed} MB`);
    console.log(`Heap Growth: ${finalMemory.heapUsed - initialMemory.heapUsed} MB`);

    // Memory per instance calculation
    const memoryPerInstance = ((finalMemory.rss - initialMemory.rss) / instances.length).toFixed(2);
    console.log(`Memory per Instance: ${memoryPerInstance} MB`);

    console.log('\n--- CONNECTION ANALYSIS ---');
    console.log(`Connection Attempts: ${connectionAttempts.length}`);
    if (connectionAttempts.length > 0) {
        console.log('⚠️  WARNING: Connection attempts detected in Task Mode!');
        connectionAttempts.forEach(attempt => {
            console.log(`  - Instance ${attempt.instance}, function ${attempt.function}, phase ${attempt.phase}`);
        });
    } else {
        console.log('✓ No connection attempts detected (expected for Task Mode)');
    }

    if (errors.length > 0) {
        console.log('\n--- ERROR SUMMARY ---');
        console.log(`Total Errors: ${errors.length}`);

        // Group errors by phase
        const errorsByPhase = {};
        errors.forEach(error => {
            if (!errorsByPhase[error.phase]) {
                errorsByPhase[error.phase] = [];
            }
            errorsByPhase[error.phase].push(error);
        });

        Object.entries(errorsByPhase).forEach(([phase, phaseErrors]) => {
            console.log(`  ${phase}: ${phaseErrors.length} errors`);
            if (phaseErrors.length <= 5) {
                phaseErrors.forEach(error => {
                    console.log(`    Instance ${error.instance}${error.function ? `, ${error.function}` : ''}: ${error.error}`);
                });
            } else {
                console.log(`    (showing first 5 of ${phaseErrors.length})`);
                phaseErrors.slice(0, 5).forEach(error => {
                    console.log(`    Instance ${error.instance}${error.function ? `, ${error.function}` : ''}: ${error.error}`);
                });
            }
        });
    }

    console.log('\n--- TASK MODE VALIDATION ---');
    if (connectionAttempts.length === 0 && errors.length === 0) {
        console.log('✓ SUCCESS: Task Mode is working correctly - no Redis connections attempted');
    } else if (connectionAttempts.length === 0 && errors.length > 0) {
        console.log('⚠️  PARTIAL: No Redis connections but some errors occurred');
    } else {
        console.log('✗ FAILURE: Task Mode may not be working - connection attempts detected!');
    }

    console.log('\n' + '='.repeat(80));

    // Exit with appropriate code
    if (connectionAttempts.length > 0) {
        console.log('EXIT CODE: 1 (Task Mode failure detected)');
        process.exit(1);
    } else {
        console.log('EXIT CODE: 0 (Task Mode working correctly)');
        process.exit(0);
    }
}

// Run the test
runStressTest().catch(error => {
    console.error('\n✗ FATAL ERROR during stress test:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
});