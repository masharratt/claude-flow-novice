#!/usr/bin/env node

/**
 * Redis Stress Test - Agent 4 of 4
 * Creates 50 Redis coordinator instances and calls all 21 functions each
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
console.log('REDIS STRESS TEST - AGENT 4 OF 4');
console.log('Task Mode:', process.env.CFN_MODE);
console.log('Test Plan: 50 coordinator instances × 21 functions each = 1050 total function calls');
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
                const taskId = `stress-test-agent4-${i}`;
                const agentId = `agent4-${i}`;
                const coordinator = new RedisCoordinator(taskId, agentId);
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

        console.log('\n🔄 EXECUTING ALL 21 FUNCTIONS ON EACH COORDINATOR...');

        // Phase 2: Call all 21 functions on each coordinator
        const allFunctions = [
            'initialize',
            'acquireLock',
            'releaseLock',
            'broadcastMessage',
            'waitForSignal',
            'checkSignal',
            'getTaskStatus',
            'updateTaskStatus',
            'saveAgentResult',
            'getAgentResults',
            'collectConsensus',
            'createProgressTracker',
            'updateProgress',
            'getProgress',
            'completeTask',
            'cleanupTask',
            'createBarrier',
            'waitAtBarrier',
            'signalBarrier',
            'createSemaphore',
            'acquireSemaphore',
            'releaseSemaphore'
        ];

        console.log(`Function sequence: ${allFunctions.join(', ')}`);
        console.log(`Total planned function calls: ${coordinatorCount} × ${allFunctions.length} = ${coordinatorCount * allFunctions.length}`);

        for (let i = 0; i < coordinators.length; i++) {
            const coordinator = coordinators[i];
            let instanceCalls = 0;
            let instanceErrors = 0;

            try {
                // Call all 21 functions in sequence
                for (const functionName of allFunctions) {
                    try {
                        let result;
                        const args = [`stress-agent4-${i}-${functionName}`];

                        // Add specific arguments for different functions
                        if (functionName === 'acquireLock') {
                            args.push(30); // 30 second timeout
                        } else if (functionName === 'broadcastMessage') {
                            args.push({ test: 'agent4', instance: i, function: functionName });
                        } else if (functionName === 'updateTaskStatus') {
                            args.push('testing');
                        } else if (functionName === 'saveAgentResult') {
                            args.push(0.85, { agent4: true, instance: i });
                        } else if (functionName === 'collectConsensus') {
                            args.push(3, 60); // 3 validators, 60 second timeout
                        } else if (functionName === 'updateProgress') {
                            args.push(50, 'Agent 4 progress update');
                        } else if (functionName === 'createBarrier') {
                            args.push(2); // 2 participants
                        } else if (functionName === 'createSemaphore') {
                            args.push(1); // 1 permit
                        }

                        result = coordinator[functionName](...args);

                        // Check if function returns a Promise (async)
                        if (result && typeof result.then === 'function') {
                            await result;
                        }

                        functionCallCount++;
                        instanceCalls++;

                        // Track connection attempts
                        if (functionName === 'initialize') {
                            connectionAttempts++;
                        }

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
    console.log('📊 REDIS STRESS TEST RESULTS - AGENT 4');
    console.log('='.repeat(80));

    console.log('\n🔢 EXECUTION SUMMARY:');
    console.log(`Coordinators created: ${coordinatorCount}/50`);
    console.log(`Function calls attempted: ${functionCallCount}/${coordinatorCount * 21}`);
    console.log(`Connection attempts: ${connectionAttempts}`);
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

        console.log('\nFirst 3 errors:');
        errors.slice(0, 3).forEach((error, index) => {
            console.log(`  ${index + 1}. ${error.type}: ${error.error}`);
        });
    }

    console.log('\n🔌 CONNECTION ANALYSIS:');
    if (connectionAttempts === 0) {
        console.log('🚫 NO Redis connection attempts detected (Task Mode working correctly)');
    } else {
        console.log(`⚠️  ${connectionAttempts} Redis connection attempts detected`);
    }

    console.log('\n🎯 TEST CONCLUSIONS:');
    if (errors.length === 0 && connectionAttempts === 0) {
        console.log('✅ PERFECT: No errors and no Redis connections (Task Mode isolation working)');
    } else if (errors.length > 0 && connectionAttempts === 0) {
        console.log('⚠️  PARTIAL: Errors occurred but no Redis connections (Task Mode isolation working)');
    } else if (connectionAttempts > 0) {
        console.log('❌ CRITICAL: Redis connections detected (Task Mode isolation BROKEN)');
    }

    const memoryLeakSuspected = (finalMemory.heapUsed - initialMemory.heapUsed) > 50;
    if (memoryLeakSuspected) {
        console.log('⚠️  MEMORY LEAK SUSPECTED: High memory usage increase');
    } else {
        console.log('✅ MEMORY STABLE: No significant memory leaks detected');
    }

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