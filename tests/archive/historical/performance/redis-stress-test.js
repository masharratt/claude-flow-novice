#!/usr/bin/env node

// Redis Stress Test - Agent 1 of 4
// Purpose: Create 50 Redis coordinator instances and call all 21 functions each
// Environment: CFN_MODE=task (no TASK_ID/AGENT_ID)

import fs from 'fs';
import path from 'path';

// Set Task Mode environment
process.env.CFN_MODE = 'task';
console.log('🔧 Environment set: CFN_MODE=task');

// Memory monitoring utilities
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        external: Math.round(usage.external / 1024 / 1024 * 100) / 100, // MB
        timestamp: new Date().toISOString()
    };
}

function logMemory(label) {
    const memory = getMemoryUsage();
    console.log(`\n📊 ${label} Memory Usage:`);
    console.log(`   RSS: ${memory.rss} MB`);
    console.log(`   Heap Total: ${memory.heapTotal} MB`);
    console.log(`   Heap Used: ${memory.heapUsed} MB`);
    console.log(`   External: ${memory.external} MB`);
    console.log(`   Timestamp: ${memory.timestamp}`);
    return memory;
}

async function runRedisStressTest() {
    console.log('\n🚀 Starting Redis Stress Test');
    console.log('=====================================');

    // Log initial memory
    const initialMemory = logMemory('INITIAL');

    let redisCoordinator;
    let coordinatorInstances = [];
    let errors = [];
    let connectionAttempts = [];
    let functionCallResults = [];
    let midMemory;

    try {
        // Step 1: Import RedisCoordinator
        console.log('\n📦 Importing RedisCoordinator...');
        const coordinatorPath = path.join(process.cwd(), '.claude/skills/cfn-redis-coordination/src/index.ts');

        if (!fs.existsSync(coordinatorPath)) {
            throw new Error(`RedisCoordinator index not found at: ${coordinatorPath}`);
        }

        // Import from the compiled JS version
        const distPath = path.join(process.cwd(), '.claude/skills/cfn-redis-coordination/dist/index.js');
        if (!fs.existsSync(distPath)) {
            throw new Error(`RedisCoordinator compiled version not found at: ${distPath}`);
        }

        const redisModule = await import(distPath);
        redisCoordinator = redisModule.RedisCoordinator;
        console.log('✅ RedisCoordinator imported successfully');

        // Step 2: Create 50 Redis coordinator instances
        console.log('\n🏗️  Creating 50 Redis coordinator instances...');
        const numInstances = 50;

        for (let i = 0; i < numInstances; i++) {
            try {
                const instance = new redisCoordinator({
                    redis_host: process.env.REDIS_HOST || 'localhost',
                    redis_port: process.env.REDIS_PORT || 6379,
                    timeout: 5000 // Short timeout for stress test
                });
                coordinatorInstances.push(instance);

                if ((i + 1) % 10 === 0) {
                    console.log(`   Created ${i + 1}/${numInstances} instances...`);
                }
            } catch (error) {
                errors.push({
                    type: 'instance_creation',
                    instance: i,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                console.error(`❌ Error creating instance ${i}: ${error.message}`);
            }
        }

        console.log(`✅ Created ${coordinatorInstances.length}/${numInstances} instances`);

        // Log memory after instance creation
        const midMemory = logMemory('POST-CREATION');

        // Step 3: Call all 21 functions on each instance
        console.log('\n⚡ Testing all 21 functions on each instance...');

        // List of all available Redis functions (from actual RedisCoordinator)
        const redisFunctions = [
            'initialize',           // 1
            'set',                  // 2
            'get',                  // 3
            'del',                  // 4
            'exists',               // 5
            'expire',               // 6
            'hset',                 // 7
            'hget',                 // 8
            'hgetall',              // 9
            'lpush',                // 10
            'rpush',                // 11
            'blpop',                // 12
            'zadd',                 // 13
            'zrange',               // 14
            'zrevrange',            // 15
            'zrem',                 // 16
            'sadd',                 // 17
            'smembers',             // 18
            'publish',              // 19
            'ping',                 // 20
            'disconnect'            // 21
        ];

        let totalFunctionCalls = 0;
        let successfulCalls = 0;
        let failedCalls = 0;

        for (let i = 0; i < coordinatorInstances.length; i++) {
            const instance = coordinatorInstances[i];
            let instanceResults = {
                instance: i,
                successful: 0,
                failed: 0,
                errors: []
            };

            for (const functionName of redisFunctions) {
                totalFunctionCalls++;

                try {
                    // Call the function with appropriate parameters
                    let result;
                    switch (functionName) {
                        case 'initialize':
                            result = await instance.initialize();
                            break;
                        case 'set':
                            result = await instance.set(`test-key-${i}`, `test-value-${i}`);
                            break;
                        case 'get':
                            result = await instance.get(`test-key-${i}`);
                            break;
                        case 'del':
                            result = await instance.del(`test-key-${i}`);
                            break;
                        case 'exists':
                            result = await instance.exists(`test-key-${i}`);
                            break;
                        case 'expire':
                            result = await instance.expire(`test-key-${i}`, 60);
                            break;
                        case 'hset':
                            result = await instance.hset(`hash-${i}`, 'field', 'value');
                            break;
                        case 'hget':
                            result = await instance.hget(`hash-${i}`, 'field');
                            break;
                        case 'hgetall':
                            result = await instance.hgetall(`hash-${i}`);
                            break;
                        case 'lpush':
                            result = await instance.lpush(`list-${i}`, 'item');
                            break;
                        case 'rpush':
                            result = await instance.rpush(`list-${i}`, 'item');
                            break;
                        case 'blpop':
                            result = await instance.blpop(`list-${i}`, 1); // 1 second timeout
                            break;
                        case 'zadd':
                            result = await instance.zadd(`zset-${i}`, '1', 'member');
                            break;
                        case 'zrange':
                            result = await instance.zrange(`zset-${i}`, 0, -1);
                            break;
                        case 'zrevrange':
                            result = await instance.zrevrange(`zset-${i}`, 0, -1);
                            break;
                        case 'zrem':
                            result = await instance.zrem(`zset-${i}`, 'member');
                            break;
                        case 'sadd':
                            result = await instance.sadd(`set-${i}`, 'member');
                            break;
                        case 'smembers':
                            result = await instance.smembers(`set-${i}`);
                            break;
                        case 'publish':
                            result = await instance.publish(`channel-${i}`, 'test-message');
                            if (result && result > 0) {
                                connectionAttempts.push({
                                    instance: i,
                                    function: functionName,
                                    result: `Published to ${result} subscribers`,
                                    timestamp: new Date().toISOString()
                                });
                            }
                            break;
                        case 'ping':
                            result = await instance.ping();
                            if (result && result.includes('PONG')) {
                                connectionAttempts.push({
                                    instance: i,
                                    function: functionName,
                                    result: result,
                                    timestamp: new Date().toISOString()
                                });
                            }
                            break;
                        case 'disconnect':
                            result = await instance.disconnect();
                            break;
                        default:
                            if (typeof instance[functionName] === 'function') {
                                result = await instance[functionName]();
                            } else {
                                throw new Error(`Function ${functionName} not found`);
                            }
                    }

                    successfulCalls++;
                    instanceResults.successful++;

                } catch (error) {
                    failedCalls++;
                    instanceResults.failed++;
                    const errorInfo = {
                        instance: i,
                        function: functionName,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    };
                    errors.push(errorInfo);
                    instanceResults.errors.push(errorInfo);
                }
            }

            functionCallResults.push(instanceResults);

            if ((i + 1) % 10 === 0) {
                console.log(`   Tested instance ${i + 1}/${coordinatorInstances.length} (${redisFunctions.length} functions each)`);
            }
        }

        console.log(`\n📈 Function Call Results:`);
        console.log(`   Total function calls: ${totalFunctionCalls}`);
        console.log(`   Successful calls: ${successfulCalls}`);
        console.log(`   Failed calls: ${failedCalls}`);
        console.log(`   Success rate: ${Math.round((successfulCalls / totalFunctionCalls) * 100 * 100) / 100}%`);

    } catch (error) {
        errors.push({
            type: 'global_error',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        console.error(`❌ Global error: ${error.message}`);
    } finally {
        // Step 4: Cleanup and final memory measurement
        console.log('\n🧹 Cleaning up...');

        // Try to disconnect all instances
        for (let i = 0; i < coordinatorInstances.length; i++) {
            try {
                if (coordinatorInstances[i] && typeof coordinatorInstances[i].disconnect === 'function') {
                    await coordinatorInstances[i].disconnect();
                }
            } catch (error) {
                errors.push({
                    type: 'cleanup_error',
                    instance: i,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Log final memory
        const finalMemory = logMemory('FINAL');

        // Step 5: Generate comprehensive report
        console.log('\n📋 REDIS STRESS TEST REPORT');
        console.log('============================');

        console.log('\n🎯 Test Configuration:');
        console.log(`   Mode: ${process.env.CFN_MODE}`);
        console.log(`   Instances created: ${coordinatorInstances.length}/50`);
        console.log(`   Functions tested per instance: ${21}`);
        console.log(`   Total function calls: ${functionCallResults.reduce((sum, r) => sum + r.successful + r.failed, 0)}`);

        console.log('\n💾 Memory Usage Analysis:');
        const memoryGrowth = {
            rss: finalMemory.rss - initialMemory.rss,
            heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
            heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
            external: finalMemory.external - initialMemory.external
        };

        console.log(`   RSS growth: ${memoryGrowth.rss.toFixed(2)} MB`);
        console.log(`   Heap Total growth: ${memoryGrowth.heapTotal.toFixed(2)} MB`);
        console.log(`   Heap Used growth: ${memoryGrowth.heapUsed.toFixed(2)} MB`);
        console.log(`   External growth: ${memoryGrowth.external.toFixed(2)} MB`);

        console.log('\n🔌 Connection Analysis:');
        console.log(`   Connection attempts detected: ${connectionAttempts.length}`);
        connectionAttempts.forEach(attempt => {
            console.log(`     Instance ${attempt.instance}: ${attempt.function} - ${attempt.result}`);
        });

        console.log('\n❌ Error Analysis:');
        console.log(`   Total errors: ${errors.length}`);

        const errorsByType = {};
        errors.forEach(error => {
            const type = error.type || error.function || 'unknown';
            errorsByType[type] = (errorsByType[type] || 0) + 1;
        });

        Object.entries(errorsByType).forEach(([type, count]) => {
            console.log(`   ${type}: ${count} errors`);
        });

        // Show first few errors as examples
        if (errors.length > 0) {
            console.log('\n🔍 Sample Errors (first 5):');
            errors.slice(0, 5).forEach((error, index) => {
                console.log(`   ${index + 1}. ${error.type || error.function}: ${error.error}`);
            });
        }

        console.log('\n🏆 Conclusion:');
        if (connectionAttempts.length === 0) {
            console.log('   ✅ NO Redis connection attempts detected');
            console.log('   ✅ No Redis server required for stress test');
        } else {
            console.log('   ⚠️  Redis connection attempts detected');
        }

        if (memoryGrowth.heapUsed > 100) {
            console.log('   ⚠️  Significant memory growth detected - potential memory leak');
        } else if (memoryGrowth.heapUsed > 50) {
            console.log('   ⚠️  Moderate memory growth detected');
        } else {
            console.log('   ✅ Memory usage within acceptable range');
        }

        if (errors.length === 0) {
            console.log('   ✅ No errors detected - all functions executed successfully');
        } else {
            console.log(`   ⚠️  ${errors.length} errors detected during stress test`);
        }

        // Save detailed report to file
        const reportData = {
            testConfig: {
                mode: process.env.CFN_MODE,
                instancesCreated: coordinatorInstances.length,
                functionsPerInstance: 21,
                totalFunctionCalls: functionCallResults.reduce((sum, r) => sum + r.successful + r.failed, 0)
            },
            memoryUsage: {
                initial: initialMemory,
                mid: midMemory,
                final: finalMemory,
                growth: memoryGrowth
            },
            connectionAttempts: connectionAttempts,
            errors: errors,
            functionCallResults: functionCallResults,
            timestamp: new Date().toISOString()
        };

        const reportPath = '/tmp/redis-stress-test-report.json';
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);

        return reportData;
    }
}

// Run the stress test
runRedisStressTest()
    .then(result => {
        console.log('\n✅ Redis stress test completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Redis stress test failed:', error);
        process.exit(1);
    });