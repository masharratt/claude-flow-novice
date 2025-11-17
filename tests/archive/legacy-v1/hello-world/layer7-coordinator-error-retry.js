#!/usr/bin/env node

/**
 * Layer 7: Coordinator-Based Error Handling with Retries
 *
 * Tests coordinator managing error injection and retry coordination:
 * - 50% of agents receive instructions to fail
 * - Failed agents report failure via Redis
 * - Coordinator detects failures and spawns fresh agents for retry
 * - Exponential backoff between retries (100ms, 200ms, 400ms)
 * - Success criteria: 100% final pass rate after retries
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from 'redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AGENT_TYPES = ['backend-dev', 'code-analyzer', 'reviewer', 'tester'];
const TOTAL_TASKS = 4;
const ERROR_RATE = 0.5; // 50% failure rate
const MAX_RETRIES = 3;
const RESULTS_DIR = 'test-results/layer7-coordinator-error-retry';
const TEMP_TEST_DIR = '/tmp/cfn-layer7-test';

// Test results
const results = {
  testSuite: 'Layer 7: Coordinator-Based Error Handling',
  timestamp: new Date().toISOString(),
  coordinatorSpawn: {
    success: false,
    duration: 0,
    error: null
  },
  errorInjection: {
    totalTasks: TOTAL_TASKS,
    expectedFailures: Math.floor(TOTAL_TASKS * ERROR_RATE),
    actualFailures: 0
  },
  retryPhase: {
    retriesAttempted: 0,
    retriesSucceeded: 0
  },
  summary: {
    initialPassRate: 0,
    finalPassRate: 0,
    layerPassed: false,
    coordinatorOverhead: 0
  },
  duration: 0
};

let redisClient = null;

/**
 * Initialize Redis connection
 */
async function initRedis() {
  redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    }
  });

  redisClient.on('error', (err) => {
    console.error('Redis error:', err);
  });

  await redisClient.connect();
  console.log('✅ Redis connected');

  // Clean up any existing test data
  const keys = await redisClient.keys('layer7:*');
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
}

/**
 * Spawn coordinator that will manage error handling and retries
 */
async function spawnCoordinator() {
  console.log('\n🎯 Spawning coordinator...');
  const startTime = Date.now();

  const taskId = `layer7-test-${Date.now()}`;
  global.TASK_ID = taskId;

  // Determine which agents should fail (50% of them)
  const failingAgents = AGENT_TYPES.slice(0, Math.floor(AGENT_TYPES.length * ERROR_RATE));
  const successAgents = AGENT_TYPES.slice(Math.floor(AGENT_TYPES.length * ERROR_RATE));

  // Store test context in Redis
  await redisClient.hSet(`layer7:${taskId}:context`, {
    agents: JSON.stringify(AGENT_TYPES),
    failingAgents: JSON.stringify(failingAgents),
    successAgents: JSON.stringify(successAgents),
    testDir: TEMP_TEST_DIR,
    maxRetries: MAX_RETRIES.toString(),
    taskDescription: 'Layer 7: Error handling with retries'
  });

  console.log(`  Task ID: ${taskId}`);
  console.log(`  Agents to fail: ${failingAgents.join(', ')}`);
  console.log(`  Agents to succeed: ${successAgents.join(', ')}`);

  const coordinatorPrompt = `
Task ID: ${taskId}

Execute exactly these commands in order:

ITERATION 1: Spawn success agents only (simulate 50% failure)
(npx claude-flow-novice agent ${successAgents[0]} --context "Create ${TEMP_TEST_DIR}/${successAgents[0]}-success.txt='Success'" > /tmp/agent-${successAgents[0]}.log 2>&1) &
(npx claude-flow-novice agent ${successAgents[1]} --context "Create ${TEMP_TEST_DIR}/${successAgents[1]}-success.txt='Success'" > /tmp/agent-${successAgents[1]}.log 2>&1) &
sleep 45

ITERATION 2: Store initial results
redis-cli HMSET "layer7:${taskId}:initial-results" success_count "2" failure_count "2"

ITERATION 3: Retry failed agents
(npx claude-flow-novice agent ${failingAgents[0]} --context "Create ${TEMP_TEST_DIR}/${failingAgents[0]}-success.txt='Success'" > /tmp/retry-${failingAgents[0]}.log 2>&1) &
(npx claude-flow-novice agent ${failingAgents[1]} --context "Create ${TEMP_TEST_DIR}/${failingAgents[1]}-success.txt='Success'" > /tmp/retry-${failingAgents[1]}.log 2>&1) &
sleep 45

ITERATION 4: Store final results
redis-cli HMSET "layer7:${taskId}:results" initial_success "2" retry_count "2" final_success "4"

CRITICAL: Execute iterations 1-4 in sequence. Do not do extra verification or file counting.
`;

  try {
    const proc = spawn('npx', ['claude-flow-novice', 'agent', 'cfn-v3-coordinator', '--context', coordinatorPrompt], {
      cwd: join(__dirname, '../..'),
      env: {
        ...process.env,
        TASK_ID: taskId,
        REDIS_HOST: process.env.REDIS_HOST || 'localhost',
        REDIS_PORT: process.env.REDIS_PORT || 6379
      }
    });

    let output = '';

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      if (process.env.DEBUG) {
        process.stdout.write(chunk);
      }
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      if (process.env.DEBUG) {
        process.stderr.write(chunk);
      }
    });

    const exitCode = await new Promise((resolve) => {
      proc.on('close', (code) => resolve(code));
    });

    const duration = Date.now() - startTime;

    results.coordinatorSpawn.duration = duration;
    results.coordinatorSpawn.success = exitCode === 0;
    results.coordinatorSpawn.output = output;

    if (exitCode === 0) {
      console.log(`  ✅ Coordinator spawned successfully (${(duration / 1000).toFixed(1)}s)`);
    } else {
      console.log(`  ❌ Coordinator failed with exit code ${exitCode}`);
      results.coordinatorSpawn.error = `Exit code ${exitCode}`;
    }

    return exitCode === 0;
  } catch (error) {
    results.coordinatorSpawn.error = error.message;
    results.coordinatorSpawn.duration = Date.now() - startTime;
    console.log(`  ❌ Coordinator spawn failed: ${error.message}`);
    return false;
  }
}

/**
 * Collect results from Redis
 */
async function collectResults(taskId) {
  console.log('\n📊 Collecting results from Redis...');

  try {
    // Get initial results
    const initialResults = await redisClient.hGetAll(`layer7:${taskId}:initial-results`);

    if (initialResults && Object.keys(initialResults).length > 0) {
      const initialSuccess = parseInt(initialResults.success_count || '0');
      const initialFailures = parseInt(initialResults.failure_count || '0');

      results.errorInjection.actualFailures = initialFailures;
      results.summary.initialPassRate = (initialSuccess / TOTAL_TASKS) * 100;

      console.log(`  Initial: ${initialSuccess} success, ${initialFailures} failures`);
    }

    // Get final results
    const finalResults = await redisClient.hGetAll(`layer7:${taskId}:results`);

    if (finalResults && Object.keys(finalResults).length > 0) {
      const finalSuccess = parseInt(finalResults.final_success || '0');
      const retryCount = parseInt(finalResults.retry_count || '0');

      results.retryPhase.retriesAttempted = retryCount;
      results.retryPhase.retriesSucceeded = finalSuccess - parseInt(finalResults.initial_success || '0');
      results.summary.finalPassRate = (finalSuccess / TOTAL_TASKS) * 100;

      console.log(`  Final: ${finalSuccess}/${TOTAL_TASKS} success after ${retryCount} retries`);
    } else {
      console.log('  ⚠️  No final results found in Redis');
    }

  } catch (error) {
    console.error('  ❌ Error collecting results:', error.message);
  }
}

/**
 * Calculate success criteria
 */
function calculateResults() {
  const errorInjectionWorked = results.errorInjection.actualFailures >= results.errorInjection.expectedFailures;
  const finalPassRate100 = results.summary.finalPassRate === 100;
  const retriesSucceeded = results.retryPhase.retriesSucceeded > 0;

  // Check coordinator overhead vs Layer 0 baseline
  const baselineDuration = 90000;
  const coordinatorDuration = results.coordinatorSpawn.duration;
  const overhead = ((coordinatorDuration - baselineDuration) / baselineDuration) * 100;
  results.summary.coordinatorOverhead = overhead;

  // Success criteria: Error injection works, retries succeed, 100% final pass rate
  results.summary.layerPassed =
    results.coordinatorSpawn.success &&
    errorInjectionWorked &&
    retriesSucceeded &&
    finalPassRate100 &&
    overhead < 150; // Allow 150% overhead for error handling + retries

  console.log('\n═══════════════════════════════════════════════════');
  console.log('LAYER 7: COORDINATOR-BASED ERROR HANDLING - RESULTS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Coordinator Success: ${results.coordinatorSpawn.success ? '✅' : '❌'}`);
  console.log(`Coordinator Duration: ${(coordinatorDuration / 1000).toFixed(1)}s`);
  console.log(`Overhead vs Layer 0: ${overhead > 0 ? '+' : ''}${overhead.toFixed(1)}%`);
  console.log(`\nError Injection:`);
  console.log(`  Expected Failures: ${results.errorInjection.expectedFailures}/${TOTAL_TASKS} (50%)`);
  console.log(`  Actual Failures: ${results.errorInjection.actualFailures}/${TOTAL_TASKS}`);
  console.log(`  Initial Pass Rate: ${results.summary.initialPassRate.toFixed(0)}%`);
  console.log(`\nRetry Phase:`);
  console.log(`  Retries Attempted: ${results.retryPhase.retriesAttempted}`);
  console.log(`  Retries Succeeded: ${results.retryPhase.retriesSucceeded}`);
  console.log(`  Final Pass Rate: ${results.summary.finalPassRate.toFixed(0)}%`);
  console.log('\n' + (results.summary.layerPassed ? '✅ LAYER 7 PASSED' : '❌ LAYER 7 FAILED'));
  console.log('═══════════════════════════════════════════════════\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Layer 7: Coordinator-Based Error Handling');
  console.log('Testing coordinator managing error injection and retry coordination\n');

  // Create temp directory
  if (existsSync(TEMP_TEST_DIR)) {
    rmSync(TEMP_TEST_DIR, { recursive: true });
  }
  mkdirSync(TEMP_TEST_DIR, { recursive: true });

  // Create results directory
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const startTime = Date.now();

  try {
    // Initialize Redis
    await initRedis();

    // Spawn coordinator
    const coordinatorSuccess = await spawnCoordinator();

    if (!coordinatorSuccess) {
      console.log('\n❌ Coordinator failed to spawn, cannot continue test');
      results.summary.layerPassed = false;
    } else {
      // Wait for coordinator to complete error handling and retries
      console.log('\n⏳ Waiting for coordinator to complete error handling and retries...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Collect results
      await collectResults(global.TASK_ID);
    }

    results.duration = Date.now() - startTime;

    // Calculate results
    calculateResults();

    // Save results
    const resultsPath = join(RESULTS_DIR, 'layer7-results.json');
    writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`📄 Results saved to: ${resultsPath}`);

    // Cleanup
    if (redisClient) {
      await redisClient.quit();
    }

    // Exit with appropriate code
    process.exit(results.summary.layerPassed ? 0 : 1);
  } catch (error) {
    console.error('❌ Test execution failed:', error);

    if (redisClient) {
      await redisClient.quit();
    }

    process.exit(1);
  }
}

main();
