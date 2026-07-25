#!/usr/bin/env node

/**
 * Detailed Test of Task Mode Redis Operations
 *
 * Tests each Redis operation individually and captures exact return values
 */

const path = require('path');

// Set up Task Mode environment
delete process.env.TASK_ID;
delete process.env.AGENT_ID;
process.env.CFN_MODE = 'task';

console.log('='.repeat(60));
console.log('DETAILED TASK MODE REDIS OPERATIONS TEST');
console.log('='.repeat(60));

console.log('\nEnvironment Setup:');
console.log('CFN_MODE:', process.env.CFN_MODE);
console.log('TASK_ID:', process.env.TASK_ID || 'undefined');
console.log('AGENT_ID:', process.env.AGENT_ID || 'undefined');

async function testRedisOperations() {
    try {
        // Import RedisCoordinator
        const { RedisCoordinator } = require('../.claude/skills/cfn-redis-coordination/dist/redis-client.js');

        console.log('\n1. Creating RedisCoordinator...');
        const coordinator = new RedisCoordinator();

        console.log('\n2. Initializing coordinator...');
        await coordinator.initialize();

        console.log('\n3. Coordinator Properties:');
        console.log('Mode:', coordinator.mode);
        console.log('Can Use Redis:', coordinator.canUseRedis);
        console.log('Redis Connected:', coordinator.redisConnected);
        console.log('Has Redis Client:', !!coordinator.redisClient);

        // Test each operation individually
        const operations = [
            { name: 'ping', args: [], description: 'Redis ping command' },
            { name: 'set', args: ['test:key', 'test:value'], description: 'Set key-value pair' },
            { name: 'get', args: ['test:key'], description: 'Get value by key' },
            { name: 'exists', args: ['test:key'], description: 'Check if key exists' },
            { name: 'del', args: ['test:key'], description: 'Delete key' },
            { name: 'expire', args: ['test:key', 60], description: 'Set key expiration' },
            { name: 'lpush', args: ['test:list', 'item1'], description: 'Push item to left of list' },
            { name: 'rpush', args: ['test:list', 'item2'], description: 'Push item to right of list' },
            { name: 'blpop', args: ['test:list', 1], description: 'Blocking pop from left (1s timeout)' },
            { name: 'hset', args: ['test:hash', 'field1', 'value1'], description: 'Set hash field' },
            { name: 'hget', args: ['test:hash', 'field1'], description: 'Get hash field value' },
            { name: 'hgetall', args: ['test:hash'], description: 'Get all hash fields' },
            { name: 'zadd', args: ['test:zset', 1, 'member1'], description: 'Add to sorted set' },
            { name: 'zrange', args: ['test:zset', 0, -1], description: 'Get sorted set range (ASC)' },
            { name: 'zrevrange', args: ['test:zset', 0, -1], description: 'Get sorted set range (DESC)' },
            { name: 'zrem', args: ['test:zset', 'member1'], description: 'Remove from sorted set' },
            { name: 'sadd', args: ['test:set', 'member1'], description: 'Add to set' },
            { name: 'smembers', args: ['test:set'], description: 'Get all set members' },
            { name: 'publish', args: ['test:channel', 'test:message'], description: 'Publish message to channel' }
        ];

        console.log('\n4. Testing Redis Operations:');
        console.log('-'.repeat(60));

        const results = [];

        for (const op of operations) {
            try {
                console.log(`\nTesting ${op.name}(${op.args.map(a => JSON.stringify(a)).join(', ')})`);
                console.log(`Description: ${op.description}`);

                // Check if method exists
                if (typeof coordinator[op.name] !== 'function') {
                    console.log(`❌ Method '${op.name}' does not exist`);
                    results.push({ operation: op.name, success: false, error: 'Method does not exist', result: null });
                    continue;
                }

                // Call the method
                const result = await coordinator[op.name](...op.args);

                console.log(`✅ Success!`);
                console.log(`Return type: ${typeof result}`);
                console.log(`Return value:`, JSON.stringify(result, null, 2));

                results.push({
                    operation: op.name,
                    success: true,
                    error: null,
                    result: result,
                    resultType: typeof result
                });

            } catch (error) {
                console.log(`❌ Error: ${error.message}`);
                results.push({
                    operation: op.name,
                    success: false,
                    error: error.message,
                    result: null
                });
            }
        }

        console.log('\n5. Testing disconnect...');
        try {
            const disconnectResult = await coordinator.disconnect();
            console.log('✅ Disconnect result:', JSON.stringify(disconnectResult, null, 2));
        } catch (error) {
            console.log('❌ Disconnect error:', error.message);
        }

        console.log('\n6. SUMMARY REPORT');
        console.log('='.repeat(60));
        console.log(`Total operations tested: ${operations.length}`);
        console.log(`Successful operations: ${results.filter(r => r.success).length}`);
        console.log(`Failed operations: ${results.filter(r => !r.success).length}`);

        console.log('\nDetailed Results:');
        results.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${result.operation}`);
            if (result.error) {
                console.log(`    Error: ${result.error}`);
            }
            if (result.success) {
                console.log(`    Return type: ${result.resultType}`);
                console.log(`    Return value: ${JSON.stringify(result.result)}`);
            }
        });

        // Analyze patterns
        console.log('\n7. PATTERN ANALYSIS');
        console.log('-'.repeat(30));

        const successfulResults = results.filter(r => r.success);
        if (successfulResults.length > 0) {
            console.log('Return value patterns for successful operations:');

            // Group by return value
            const returnPatterns = {};
            successfulResults.forEach(r => {
                const key = JSON.stringify(r.result);
                returnPatterns[key] = (returnPatterns[key] || 0) + 1;
            });

            Object.entries(returnPatterns).forEach(([value, count]) => {
                console.log(`  ${count} operations returned: ${value}`);
            });
        }

        const failedResults = results.filter(r => !r.success);
        if (failedResults.length > 0) {
            console.log('Error patterns for failed operations:');

            // Group by error message
            const errorPatterns = {};
            failedResults.forEach(r => {
                const key = r.error;
                errorPatterns[key] = (errorPatterns[key] || 0) + 1;
            });

            Object.entries(errorPatterns).forEach(([error, count]) => {
                console.log(`  ${count} operations failed with: ${error}`);
            });
        }

        return results;

    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error.message);
        console.error('Stack trace:', error.stack);
        return null;
    }
}

// Check if Redis connection was attempted
console.log('\n8. REDIS CONNECTION ATTEMPT ANALYSIS');
console.log('-'.repeat(40));

// Monitor console output for Redis connection attempts
const originalConsoleLog = console.log;
const redisConnectionAttempts = [];
const redisOperationSkipped = [];

console.log = function(...args) {
    const message = args.join(' ');

    if (message.includes('Redis connection') ||
        message.includes('Connecting to Redis') ||
        message.includes('Redis client')) {
        redisConnectionAttempts.push(message);
    }

    if (message.includes('Redis operation skipped') ||
        message.includes('⚠️')) {
        redisOperationSkipped.push(message);
    }

    originalConsoleLog.apply(console, args);
};

// Run the test
testRedisOperations().then(results => {
    console.log('\n9. FINAL ANALYSIS');
    console.log('='.repeat(30));

    console.log(`Redis connection attempts detected: ${redisConnectionAttempts.length}`);
    if (redisConnectionAttempts.length > 0) {
        console.log('Connection attempts:');
        redisConnectionAttempts.forEach(attempt => console.log(`  - ${attempt}`));
    }

    console.log(`Operations skipped warnings: ${redisOperationSkipped.length}`);
    if (redisOperationSkipped.length > 0) {
        console.log('First few skipped operations:');
        redisOperationSkipped.slice(0, 3).forEach(skip => console.log(`  - ${skip}`));
    }

    console.log('\n🎯 CONCLUSION:');
    if (results) {
        const successRate = results.filter(r => r.success).length / results.length;
        console.log(`Success rate: ${(successRate * 100).toFixed(1)}%`);

        if (redisConnectionAttempts.length === 0 && successRate === 1.0) {
            console.log('✅ Task Mode successfully stubs all Redis operations');
            console.log('✅ No Redis connection attempts detected');
            console.log('✅ All operations return appropriate stub values');
        } else {
            console.log('⚠️  Unexpected behavior detected');
        }
    }

    // Restore original console
    console.log = originalConsoleLog;

}).catch(error => {
    console.error('Test failed:', error);
    console.log = originalConsoleLog;
});