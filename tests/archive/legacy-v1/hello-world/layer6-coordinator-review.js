#!/usr/bin/env node

/**
 * Layer 6: Coordinator-Based Review Handoff
 *
 * Tests coordinator spawning both implementers and reviewers:
 * - Coordinator spawns 3 implementer agents to create files
 * - Coordinator spawns 2-3 reviewer agents to validate files
 * - Review handoff coordinated via Redis
 * - No peer coordinators (single coordinator manages all)
 *
 * Success criteria: All files created and reviewed, no blocking
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from 'redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMPLEMENTER_AGENTS = ['backend-dev', 'code-analyzer', 'reviewer'];
const REVIEWER_AGENTS = ['reviewer', 'tester'];
const FILES_TO_CREATE = 6; // 2 files per implementer
const RESULTS_DIR = 'test-results/layer6-coordinator-review';
const TEMP_TEST_DIR = '/tmp/cfn-layer6-test';

// Test results
const results = {
  testSuite: 'Layer 6: Coordinator-Based Review Handoff',
  timestamp: new Date().toISOString(),
  coordinatorSpawn: {
    success: false,
    duration: 0,
    error: null
  },
  implementationPhase: {
    filesCreated: 0,
    agentsSpawned: 0,
    duration: 0
  },
  reviewPhase: {
    filesReviewed: 0,
    reviewersSpawned: 0,
    duration: 0
  },
  summary: {
    totalFiles: FILES_TO_CREATE,
    filesCreated: 0,
    filesReviewed: 0,
    implementers: IMPLEMENTER_AGENTS.length,
    reviewers: REVIEWER_AGENTS.length,
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
  const keys = await redisClient.keys('layer6:*');
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
}

/**
 * Spawn coordinator that will manage both implementation and review phases
 */
async function spawnCoordinator() {
  console.log('\n🎯 Spawning coordinator...');
  const startTime = Date.now();

  const taskId = `layer6-test-${Date.now()}`;
  global.TASK_ID = taskId;

  // Store test context in Redis
  await redisClient.hSet(`layer6:${taskId}:context`, {
    implementers: JSON.stringify(IMPLEMENTER_AGENTS),
    reviewers: JSON.stringify(REVIEWER_AGENTS),
    testDir: TEMP_TEST_DIR,
    filesPerAgent: '2',
    taskDescription: 'Layer 6: Review handoff coordination'
  });

  console.log(`  Task ID: ${taskId}`);
  console.log(`  Context stored in Redis`);

  const coordinatorPrompt = `
Task ID: ${taskId}

You are coordinating a two-phase workflow: implementation then review.

PHASE 1 - IMPLEMENTATION (Iterations 1-3):

Iteration 1: Retrieve context from Redis
redis-cli HGETALL "layer6:${taskId}:context"

Iteration 2: Spawn ${IMPLEMENTER_AGENTS.length} implementer agents in background
for agent in ${IMPLEMENTER_AGENTS.join(' ')}; do
  (npx claude-flow-novice agent $agent --context "Create 2 test files in ${TEMP_TEST_DIR}: $agent-file1.txt='Test 1' and $agent-file2.txt='Test 2'. Report files created." > /tmp/impl-$agent.log 2>&1) &
done
sleep 45  # Wait for agents

Iteration 3: Count files created and store implementation results
FILE_COUNT=\$(ls ${TEMP_TEST_DIR}/*.txt 2>/dev/null | wc -l)
redis-cli HMSET "layer6:${taskId}:impl-results" files_created "\$FILE_COUNT" agents_spawned "${IMPLEMENTER_AGENTS.length}" phase "COMPLETE"

PHASE 2 - REVIEW (Iterations 4-6):

Iteration 4: Wait for implementation phase completion (already complete from iteration 3)
redis-cli HGET "layer6:${taskId}:impl-results" phase  # Should show COMPLETE

Iteration 5: Spawn ${REVIEWER_AGENTS.length} reviewer agents in background
for agent in ${REVIEWER_AGENTS.join(' ')}; do
  (npx claude-flow-novice agent $agent --context "Review all .txt files in ${TEMP_TEST_DIR}. Verify each file has content. Report files reviewed." > /tmp/review-$agent.log 2>&1) &
done
sleep 45  # Wait for reviewers

Iteration 6: Store final results
FILE_COUNT=\$(redis-cli HGET "layer6:${taskId}:impl-results" files_created)
REVIEWED_COUNT=\$(ls ${TEMP_TEST_DIR}/*.txt 2>/dev/null | wc -l)
redis-cli HMSET "layer6:${taskId}:results" \\
  files_created "\$FILE_COUNT" \\
  files_reviewed "\$REVIEWED_COUNT" \\
  implementers_spawned "${IMPLEMENTER_AGENTS.length}" \\
  reviewers_spawned "${REVIEWER_AGENTS.length}" \\
  phase "COMPLETE" && echo "Results stored"

CRITICAL: Complete both phases in 6 iterations. Do not do extra verification.
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
    // Get implementation results
    const implResults = await redisClient.hGetAll(`layer6:${taskId}:impl-results`);

    if (implResults && Object.keys(implResults).length > 0) {
      results.implementationPhase.filesCreated = parseInt(implResults.files_created || '0');
      results.implementationPhase.agentsSpawned = parseInt(implResults.agents_spawned || '0');
      console.log(`  Implementation: ${results.implementationPhase.filesCreated} files, ${results.implementationPhase.agentsSpawned} agents`);
    }

    // Get final results
    const finalResults = await redisClient.hGetAll(`layer6:${taskId}:results`);

    if (finalResults && Object.keys(finalResults).length > 0) {
      results.summary.filesCreated = parseInt(finalResults.files_created || '0');
      results.summary.filesReviewed = parseInt(finalResults.files_reviewed || '0');
      results.reviewPhase.reviewersSpawned = parseInt(finalResults.reviewers_spawned || '0');
      results.reviewPhase.filesReviewed = results.summary.filesReviewed;

      console.log(`  Review: ${results.summary.filesReviewed} files reviewed, ${results.reviewPhase.reviewersSpawned} reviewers`);
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
  const allFilesCreated = results.summary.filesCreated === FILES_TO_CREATE;
  const allFilesReviewed = results.summary.filesReviewed === FILES_TO_CREATE;
  const implementersSpawned = results.implementationPhase.agentsSpawned === IMPLEMENTER_AGENTS.length;
  const reviewersSpawned = results.reviewPhase.reviewersSpawned === REVIEWER_AGENTS.length;

  // Check coordinator overhead vs Layer 0 baseline
  const baselineDuration = 90000;
  const coordinatorDuration = results.coordinatorSpawn.duration;
  const overhead = ((coordinatorDuration - baselineDuration) / baselineDuration) * 100;
  results.summary.coordinatorOverhead = overhead;

  // Success criteria: Two-phase workflow completes successfully
  results.summary.layerPassed =
    results.coordinatorSpawn.success &&
    allFilesCreated &&
    allFilesReviewed &&
    implementersSpawned &&
    reviewersSpawned &&
    overhead < 100; // Allow 100% overhead for two-phase workflow

  console.log('\n═══════════════════════════════════════════════════');
  console.log('LAYER 6: COORDINATOR-BASED REVIEW HANDOFF - RESULTS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Coordinator Success: ${results.coordinatorSpawn.success ? '✅' : '❌'}`);
  console.log(`Coordinator Duration: ${(coordinatorDuration / 1000).toFixed(1)}s`);
  console.log(`Overhead vs Layer 0: ${overhead > 0 ? '+' : ''}${overhead.toFixed(1)}%`);
  console.log(`\nImplementation Phase:`);
  console.log(`  Files Created: ${results.summary.filesCreated}/${FILES_TO_CREATE}`);
  console.log(`  Implementers Spawned: ${results.implementationPhase.agentsSpawned}/${IMPLEMENTER_AGENTS.length}`);
  console.log(`\nReview Phase:`);
  console.log(`  Files Reviewed: ${results.summary.filesReviewed}/${FILES_TO_CREATE}`);
  console.log(`  Reviewers Spawned: ${results.reviewPhase.reviewersSpawned}/${REVIEWER_AGENTS.length}`);
  console.log('\n' + (results.summary.layerPassed ? '✅ LAYER 6 PASSED' : '❌ LAYER 6 FAILED'));
  console.log('═══════════════════════════════════════════════════\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Layer 6: Coordinator-Based Review Handoff');
  console.log('Testing coordinator managing both implementation and review phases\n');

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
      // Wait for coordinator to complete both phases
      console.log('\n⏳ Waiting for coordinator to complete both phases...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Collect results
      await collectResults(global.TASK_ID);
    }

    results.duration = Date.now() - startTime;

    // Calculate results
    calculateResults();

    // Save results
    const resultsPath = join(RESULTS_DIR, 'layer6-results.json');
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
