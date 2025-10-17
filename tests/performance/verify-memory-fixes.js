#!/usr/bin/env node

import { RealtimeServer } from '../../src/web/dashboard/realtime/RealtimeServer.js';
import { getRedisMonitoringService } from '../../src/web/dashboard/realtime/RedisMonitoringService.js';
import { performance } from 'perf_hooks';
import { memoryUsage } from 'process';

async function runMemoryLeakTest() {
    console.log('🔍 Memory Leak Verification Test');

    const config = {
        port: 3005,
        enableWebSocket: true,
        enableRedisMonitoring: true,
        redisMonitoringConfig: {
            maxHistorySize: 1000,
            monitoringInterval: 1000
        }
    };

    // Measure initial memory
    const initialMemoryUsage = memoryUsage().heapUsed;
    console.log(`Initial Memory Usage: ${(initialMemoryUsage / 1024 / 1024).toFixed(2)} MB`);

    // Create server instances multiple times
    const serverIterations = 10;
    const iterations = [];

    for (let i = 0; i < serverIterations; i++) {
        const start = performance.now();
        const server = new RealtimeServer(config);
        const redisService = getRedisMonitoringService(config.redisMonitoringConfig);

        await server.start(config.port);
        await redisService.start();

        // Simulate event-heavy scenario
        for (let j = 0; j < 500; j++) {
            redisService.emit('redis_feedback', {
                timestamp: new Date().toISOString(),
                agentId: `test-agent-${j}`,
                type: 'ROOT_WARNING',
                file: `/path/to/test-file-${j}.ts`
            });
        }

        // Simulate multiple events
        await new Promise(resolve => setTimeout(resolve, 100));

        // Shutdown
        await server.shutdown();
        await redisService.stop();

        const end = performance.now();
        iterations.push(end - start);
    }

    // Final memory check
    const finalMemoryUsage = memoryUsage().heapUsed;
    console.log(`Final Memory Usage: ${(finalMemoryUsage / 1024 / 1024).toFixed(2)} MB`);

    // Memory growth calculation
    const memoryGrowth = finalMemoryUsage - initialMemoryUsage;
    const percentageGrowth = (memoryGrowth / initialMemoryUsage) * 100;

    // Performance analysis
    const avgIterationTime = iterations.reduce((a, b) => a + b, 0) / iterations.length;

    console.log('\n📊 Memory Leak Analysis:');
    console.log(`- Memory Growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Percentage Growth: ${percentageGrowth.toFixed(2)}%`);
    console.log(`- Average Iteration Time: ${avgIterationTime.toFixed(2)}ms`);

    // Success criteria
    const MEMORY_GROWTH_THRESHOLD = 5; // 5% acceptable memory growth
    const MEMORY_ABSOLUTE_THRESHOLD = 10; // 10 MB absolute growth

    if (percentageGrowth <= MEMORY_GROWTH_THRESHOLD && memoryGrowth <= MEMORY_ABSOLUTE_THRESHOLD * 1024 * 1024) {
        console.log('\n✅ Memory Leak Test: PASSED');
        process.exit(0);
    } else {
        console.error('\n❌ Memory Leak Test: FAILED');
        console.error(`   Excessive memory growth detected: ${percentageGrowth.toFixed(2)}%`);
        process.exit(1);
    }
}

runMemoryLeakTest().catch(error => {
    console.error('🚨 Test failed:', error);
    process.exit(1);
});