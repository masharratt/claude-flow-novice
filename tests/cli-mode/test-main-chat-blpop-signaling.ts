#!/usr/bin/env tsx
/**
 * Test: Main Chat Redis BLPOP Signaling for CLI Agent Coordination
 *
 * This test validates that Main Chat can use Redis BLPOP to wait for
 * signals from CLI-launched agents in practice, not just theory.
 *
 * Phase: Immediate Deliverable
 * Reference: CLI Mode Redefinition Implementation Plan
 */

import { createClient, RedisClientType } from 'redis';
import { spawn } from 'child_process';
import { resolve } from 'path';

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface TestSuite {
  name: string;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    totalDuration: number;
  };
}

/**
 * Test Main Chat BLPOP waiting for CLI agent completion signal
 */
async function testMainChatBLPOPWaiting(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'Main Chat BLPOP Waiting';

  let redisClient: RedisClientType | null = null;

  try {
    // Connect to Redis
    redisClient = createClient({
      url: 'redis://localhost:6379'
    });
    await redisClient.connect();

    // Test configuration
    const taskId = 'test-blpop-' + Date.now();
    const signalKey = `cfn:agent:signal:${taskId}`;

    console.log(`Testing BLPOP on key: ${signalKey}`);

    // Start BLPOP listener in background
    const blpopPromise = new Promise<{ key: string; value: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('BLPOP timeout after 15 seconds'));
      }, 15000);

      redisClient!.blPop(signalKey, 20).then(result => {
        clearTimeout(timeout);
        if (result) {
          resolve({
            key: result.key,
            value: result.value
          });
        } else {
          reject(new Error('BLPOP returned null'));
        }
      }).catch(reject);
    });

    // Wait a moment to ensure BLPOP is listening
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Spawn CLI agent that will send signal
    const agentTaskId = taskId;
    const cliArgs = [
      'backend-developer',
      '--task-id', agentTaskId,
      '--provider', 'kimi',
      '--model', 'moonshot-v1-8k'
    ];

    console.log(`Spawning CLI agent with task ID: ${agentTaskId}`);

    // Execute CLI agent
    const cliProcess = spawn('npx', ['tsx', 'src/cli/spawn-agent-cli.ts', ...cliArgs], {
      stdio: 'pipe',
      env: {
        ...process.env,
        PROJECT_ROOT: process.cwd(),
        // Signal that agent should send completion message
        SEND_COMPLETION_SIGNAL: 'true',
        REDIS_SIGNAL_KEY: signalKey
      }
    });

    // Wait for agent to complete and send signal
    const signalResult = await blpopPromise;

    // Validate signal content
    const signalData = JSON.parse(signalResult.value);

    if (signalData.taskId !== agentTaskId) {
      throw new Error(`Expected taskId ${agentTaskId}, got ${signalData.taskId}`);
    }

    if (signalData.status !== 'completed') {
      throw new Error(`Expected status 'completed', got ${signalData.status}`);
    }

    const duration = Date.now() - startTime;

    return {
      testName,
      passed: true,
      duration,
      metadata: {
        signalKey,
        signalData,
        agentTaskId,
        waitingTime: duration
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      testName,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (redisClient) {
      await redisClient.disconnect();
    }
  }
}

/**
 * Test Redis signal sending from CLI agent
 */
async function testRedisSignalSending(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'Redis Signal Sending';

  let redisClient: RedisClientType | null = null;

  try {
    // Connect to Redis
    redisClient = createClient({
      url: 'redis://localhost:6379'
    });
    await redisClient.connect();

    const taskId = 'test-signal-' + Date.now();
    const signalKey = `cfn:agent:signal:${taskId}`;

    // Create signal message
    const signalMessage = {
      agentId: `agent-test-${Date.now()}`,
      taskId: taskId,
      status: 'completed',
      timestamp: new Date().toISOString(),
      provider: 'kimi',
      model: 'moonshot-v1-8k',
      metadata: {
        testType: 'CLI_MODE_REDEFINITION',
        signalTest: true
      }
    };

    // Send signal to Redis
    await redisClient.lPush(signalKey, JSON.stringify(signalMessage));

    // Wait a moment and verify signal exists
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await redisClient.rPop(signalKey);
    if (!result) {
      throw new Error('Signal not found in Redis');
    }

    const receivedSignal = JSON.parse(result);

    if (receivedSignal.taskId !== taskId) {
      throw new Error(`Signal taskId mismatch: expected ${taskId}, got ${receivedSignal.taskId}`);
    }

    const duration = Date.now() - startTime;

    return {
      testName,
      passed: true,
      duration,
      metadata: {
        signalKey,
        signalMessage,
        receivedSignal,
        roundTripTime: duration
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      testName,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (redisClient) {
      await redisClient.disconnect();
    }
  }
}

/**
 * Test concurrent BLPOP waiting for multiple agents
 */
async function testConcurrentBLPOP(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'Concurrent BLPOP';

  let redisClient: RedisClientType | null = null;

  try {
    // Connect to Redis
    redisClient = createClient({
      url: 'redis://localhost:6379'
    });
    await redisClient.connect();

    const baseTaskId = 'test-concurrent-' + Date.now();
    const agentCount = 3;
    const signalKeys = Array.from({ length: agentCount }, (_, i) =>
      `cfn:agent:signal:${baseTaskId}-${i}`
    );

    // Start BLPOP listeners for multiple agents
    const blpopPromises = signalKeys.map(async (key, index) => {
      const result = await redisClient!.blPop(key, 10);
      return {
        key,
        index,
        result: result ? JSON.parse(result.value) : null
      };
    });

    // Wait a moment to ensure all BLPOP listeners are active
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send signals for each agent
    for (let i = 0; i < agentCount; i++) {
      const signalMessage = {
        agentId: `agent-${i}-${Date.now()}`,
        taskId: `${baseTaskId}-${i}`,
        status: 'completed',
        agentIndex: i,
        timestamp: new Date().toISOString()
      };

      await redisClient!.lPush(signalKeys[i], JSON.stringify(signalMessage));
    }

    // Wait for all BLPOP operations to complete
    const results = await Promise.all(blpopPromises);

    // Validate all signals were received
    const successCount = results.filter(r => r.result && r.result.status === 'completed').length;

    if (successCount !== agentCount) {
      throw new Error(`Expected ${agentCount} signals, received ${successCount}`);
    }

    const duration = Date.now() - startTime;

    return {
      testName,
      passed: true,
      duration,
      metadata: {
        agentCount,
        signalKeys,
        receivedCount: successCount,
        averageTimePerAgent: duration / agentCount
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      testName,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (redisClient) {
      await redisClient.disconnect();
    }
  }
}

/**
 * Test BLPOP timeout and error handling
 */
async function testBLPOPTimeoutHandling(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'BLPOP Timeout Handling';

  let redisClient: RedisClientType | null = null;

  try {
    // Connect to Redis
    redisClient = createClient({
      url: 'redis://localhost:6379'
    });
    await redisClient.connect();

    const signalKey = `cfn:agent:signal:test-timeout-${Date.now()}`;

    // Start BLPOP with short timeout (3 seconds)
    const blopStartTime = Date.now();
    const result = await redisClient.blPop(signalKey, 3);
    const blopDuration = Date.now() - blopStartTime;

    // Should return null after timeout
    if (result !== null) {
      throw new Error('BLPOP should have returned null after timeout');
    }

    // Should have waited approximately 3 seconds (allow 500ms variance)
    if (blopDuration < 2500 || blopDuration > 3500) {
      throw new Error(`BLPOP timeout duration unexpected: ${blopDuration}ms`);
    }

    const duration = Date.now() - startTime;

    return {
      testName,
      passed: true,
      duration,
      metadata: {
        signalKey,
        timeoutDuration: blopDuration,
        expectedTimeout: 3000
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      testName,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (redisClient) {
      await redisClient.disconnect();
    }
  }
}

/**
 * Run all tests and generate report
 */
async function runTestSuite(): Promise<TestSuite> {
  console.log('🚀 Starting Main Chat Redis BLPOP Signaling Tests\n');
  console.log('Purpose: Validate Main Chat can wait for CLI agent signals via Redis BLPOP');
  console.log('Target: CLI mode redefinition with Main Chat coordination\n');

  // Check if Redis is available
  try {
    const redisClient = createClient({ url: 'redis://localhost:6379' });
    await redisClient.connect();
    await redisClient.ping();
    await redisClient.disconnect();
    console.log('✅ Redis connection established\n');
  } catch (error) {
    console.log('❌ Redis connection failed. Please ensure Redis is running on localhost:6379');
    console.log('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const tests = [
    testRedisSignalSending,
    testBLPOPTimeoutHandling,
    testConcurrentBLPOP,
    testMainChatBLPOPWaiting
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    console.log(`⏳ Running: ${test.name}`);
    const result = await test();
    results.push(result);

    if (result.passed) {
      console.log(`✅ ${test.name} - PASSED (${result.duration}ms)`);
      if (result.metadata) {
        console.log(`   ${JSON.stringify(result.metadata, null, 2)}`);
      }
    } else {
      console.log(`❌ ${test.name} - FAILED (${result.duration}ms)`);
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  }

  // Calculate summary
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const summary = {
    total: totalTests,
    passed: passedTests,
    failed: failedTests,
    totalDuration
  };

  const testSuite: TestSuite = {
    name: 'Main Chat Redis BLPOP Signaling Test Suite',
    results,
    summary
  };

  // Print summary
  console.log('📊 Test Suite Summary:');
  console.log(`Total Tests: ${summary.total}`);
  console.log(`Passed: ${summary.passed} ✅`);
  console.log(`Failed: ${summary.failed} ❌`);
  console.log(`Total Duration: ${summary.totalDuration}ms`);
  console.log(`Success Rate: ${((summary.passed / summary.total) * 100).toFixed(1)}%`);

  return testSuite;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const testSuite = await runTestSuite();

    // Exit with appropriate code
    process.exit(testSuite.summary.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Test suite execution failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  testMainChatBLPOPWaiting,
  testRedisSignalSending,
  testConcurrentBLPOP,
  testBLPOPTimeoutHandling,
  runTestSuite
};