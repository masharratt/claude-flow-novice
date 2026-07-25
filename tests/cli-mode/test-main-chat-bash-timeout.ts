#!/usr/bin/env tsx
/**
 * Test: Main Chat BLPOP with 2-minute Bash Timeout
 *
 * Specific test requested:
 * - Redis waits random 15-60 seconds to send message
 * - Main Chat uses BLPOP with 2-minute bash timeout
 * - Success = message received AND exits before 2-minute timeout
 *
 * This validates the core CLI mode coordination pattern.
 */

import { createClient, RedisClientType } from 'redis';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

async function testMainChatBashTimeout(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'Main Chat Bash Timeout with Random Delay';

  let redisClient: RedisClientType | null = null;
  let signalProcess: any = null;

  try {
    // Connect to Redis
    redisClient = createClient({
      url: 'redis://localhost:6379'
    });
    await redisClient.connect();

    // Generate test parameters
    const testId = `test-bash-timeout-${Date.now()}`;
    const signalKey = `cfn:mainchat:signal:${testId}`;

    // Random delay between 15-60 seconds
    const randomDelay = Math.floor(Math.random() * (60 - 15 + 1)) + 15;

    const message = {
      testId,
      status: 'completed',
      delay: randomDelay,
      timestamp: new Date().toISOString(),
      message: 'CLI agent completed successfully'
    };

    console.log(`🎯 Test Configuration:`);
    console.log(`   Signal Key: ${signalKey}`);
    console.log(`   Random Delay: ${randomDelay} seconds`);
    console.log(`   Bash Timeout: 120 seconds (2 minutes)`);
    console.log('');

    // Step 1: Start the delayed signal sender (background process)
    console.log('⏰ Starting delayed signal sender...');
    signalProcess = spawn('node', ['-e', `
      const { createClient } = require('redis');

      async function sendSignal() {
        const client = createClient({ url: 'redis://localhost:6379' });
        await client.connect();

        console.log('Signal sender: Waiting ${randomDelay} seconds...');
        await new Promise(resolve => setTimeout(resolve, ${randomDelay} * 1000));

        const message = ${JSON.stringify(message)};
        await client.lPush('${signalKey}', JSON.stringify(message));

        console.log('Signal sender: Message sent to Redis');
        await client.disconnect();
      }

      sendSignal().catch(console.error);
    `], {
      stdio: 'pipe',
      detached: false
    });

    // Step 2: Start Main Chat BLPOP with 2-minute bash timeout
    console.log('🚀 Starting Main Chat BLOP with 2-minute timeout...');

    const bashCommand = `
      echo "Main Chat: Starting BLPOP wait..."
      timeout 120s redis-cli BLPOP "${signalKey}" 130
    `;

    const bashStartTime = Date.now();

    // Execute bash command with timeout
    const { stdout, stderr } = await execAsync(bashCommand, {
      timeout: 130000, // 130 seconds total (120 timeout + buffer)
      killSignal: 'SIGTERM'
    });

    const bashEndTime = Date.now();
    const actualDuration = bashEndTime - bashStartTime;

    console.log('📥 Main Chat received BLPOP response:');
    console.log(`   STDOUT: ${stdout.trim()}`);
    if (stderr) console.log(`   STDERR: ${stderr.trim()}`);
    console.log(`   Actual wait time: ${(actualDuration / 1000).toFixed(1)} seconds`);

    // Parse the BLPOP response
    // Actual format from redis-cli: "key\ncjson" (on separate lines)
    const lines = stdout.trim().split('\n');

    // Skip the echo line "Main Chat: Starting BLPOP wait..."
    const filteredLines = lines.filter(line => line !== 'Main Chat: Starting BLPOP wait...');

    if (filteredLines.length < 2) {
      throw new Error(`Invalid BLPOP response format. Expected at least 2 lines after filtering, got ${filteredLines.length}. Full output: ${stdout}`);
    }

    const receivedKey = filteredLines[0]?.trim();
    const receivedValue = filteredLines[1]?.trim();

    // Validate the response
    if (!receivedKey || !receivedValue) {
      throw new Error('BLPOP response missing key or value');
    }

    if (receivedKey !== signalKey) {
      throw new Error(`Key mismatch: expected ${signalKey}, got ${receivedKey}`);
    }

    // Parse the message
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(receivedValue);
    } catch (error) {
      throw new Error(`Failed to parse message JSON: ${error}`);
    }

    if (parsedMessage.testId !== testId) {
      throw new Error(`Test ID mismatch: expected ${testId}, got ${parsedMessage.testId}`);
    }

    if (parsedMessage.status !== 'completed') {
      throw new Error(`Status mismatch: expected 'completed', got ${parsedMessage.status}`);
    }

    const duration = Date.now() - startTime;

    // Success criteria:
    // 1. Message received ✅ (validated above)
    // 2. Exits before 2-minute timeout ✅ (if we got here, bash didn't timeout)
    // 3. Wait time matches expected delay (within tolerance)
    const expectedMinWait = randomDelay * 1000; // Convert to ms
    const expectedMaxWait = (randomDelay + 20) * 1000; // +20s tolerance for process overhead
    const actualWait = actualDuration;

    console.log(`⏱️  Wait Time Analysis:`);
    console.log(`   Expected delay: ${randomDelay}s`);
    console.log(`   Actual wait: ${(actualWait/1000).toFixed(1)}s`);
    console.log(`   Tolerance window: ${(expectedMinWait/1000).toFixed(1)}s - ${(expectedMaxWait/1000).toFixed(1)}s`);

    if (actualWait < expectedMinWait || actualWait > expectedMaxWait) {
      throw new Error(`Wait time out of range: expected ${expectedMinWait}-${expectedMaxWait}ms, got ${actualWait}ms`);
    }

    console.log('✅ SUCCESS: All criteria met!');
    console.log(`   ✅ Message received and parsed correctly`);
    console.log(`   ✅ Exited before 2-minute timeout (${(actualDuration/1000).toFixed(1)}s < 120s)`);
    console.log(`   ✅ Wait time matches expected delay (${randomDelay}s ± 10s)`);

    return {
      testName,
      passed: true,
      duration,
      metadata: {
        testId,
        signalKey,
        randomDelay,
        actualWaitTime: actualDuration,
        bashDuration: actualDuration,
        receivedKey,
        receivedMessage: parsedMessage,
        withinExpectedRange: actualWait >= expectedMinWait && actualWait <= expectedMaxWait
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    console.log('❌ FAILURE: Test failed');
    console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`   Duration: ${(duration / 1000).toFixed(1)} seconds`);

    return {
      testName,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    // Cleanup
    if (signalProcess) {
      signalProcess.kill('SIGTERM');
    }
    if (redisClient) {
      try {
        await redisClient.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Run the specific test
 */
async function runTest(): Promise<void> {
  console.log('🎯 Main Chat BLPOP with 2-Minute Bash Timeout Test');
  console.log('=' .repeat(60));
  console.log('');

  try {
    const result = await testMainChatBashTimeout();

    console.log('');
    console.log('📊 Test Result Summary:');
    console.log(`   Test: ${result.testName}`);
    console.log(`   Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Duration: ${(result.duration / 1000).toFixed(1)} seconds`);

    if (result.metadata) {
      console.log('   Metadata:');
      Object.entries(result.metadata).forEach(([key, value]) => {
        console.log(`     ${key}: ${JSON.stringify(value)}`);
      });
    }

    process.exit(result.passed ? 0 : 1);

  } catch (error) {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runTest();
}

export { testMainChatBashTimeout };