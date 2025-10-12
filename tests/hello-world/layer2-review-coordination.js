#!/usr/bin/env node

/**
 * Layer 2: Review Coordination Test
 *
 * Architecture:
 * - Extends Layer 1 with 3rd coordinator (ReviewCoordinator)
 * - Dynamic reviewer pool: 3-10 reviewers based on queue depth
 * - All 70 files from Layer 1 are submitted for review
 * - Reviewers spawn/despawn dynamically based on queue depth threshold
 * - Redis pub/sub for work distribution
 *
 * Success Criteria:
 * - Total agents: 73+ (72 from Layer 1 + 3-10 reviewers)
 * - All 70 files reviewed
 * - Reviewers spawn dynamically when queue > threshold
 * - Reviewers despawn when idle and queue < threshold
 * - 100% review pass rate
 */

import { createRedisClient } from './lib/redis-client.js';
import { ImplementerCoordinator, ReviewCoordinator } from './lib/coordinator-base.js';
import { MetricsCollector } from './lib/metrics-collector.js';
import { RedisKeys } from './lib/message-protocol.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Test configuration
const LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh'];
const TRANSLATIONS = ['ja', 'ko', 'ar', 'hi', 'ru', 'tr', 'pl', 'nl', 'sv', 'no'];
const OUTPUT_DIR = path.join(__dirname, '../../test-results/hello-world');
const RESULTS_FILE = path.join(OUTPUT_DIR, 'layer2-results.json');

// Load environment variables
const envPath = path.join(__dirname, '../../.env');
try {
  const envContent = await fs.readFile(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
} catch (error) {
  console.error('Warning: Could not load .env file');
}

/**
 * Generate all 70 language-translation combinations
 */
function generateCombinations() {
  const combos = [];
  for (const lang of LANGUAGES) {
    for (const trans of TRANSLATIONS) {
      combos.push(`${lang}-${trans}`);
    }
  }
  return combos;
}

/**
 * Split combinations between two implementer coordinators
 */
function splitCombinations(combos) {
  const shuffled = [...combos].sort(() => Math.random() - 0.5);
  const mid = Math.ceil(shuffled.length / 2);
  return [shuffled.slice(0, mid), shuffled.slice(mid)];
}

/**
 * Simulate work execution for implementer agents
 */
async function executeImplementation(coordinator, combo) {
  const agent = await coordinator.spawnAgent(combo);

  // Simulate translation work (100-300ms)
  const workDuration = 100 + Math.random() * 200;
  await sleep(workDuration);

  // Complete work successfully
  await coordinator.completeWork(combo, agent.id, true);

  return agent;
}

/**
 * Submit completed work to review queue
 */
async function submitForReview(redis, combo, coordinatorId, agentId) {
  const queueItem = {
    combo,
    coordinatorId,
    agentId,
    completedAt: Date.now(),
    status: 'pending'
  };

  await redis.rpush(RedisKeys.reviewQueue, JSON.stringify(queueItem));
  console.log(`[${coordinatorId}] Submitted ${combo} for review`);
}

/**
 * Wait for all reviews to complete
 */
async function waitForReviewCompletion(redis, expectedCount, timeoutMs = 120000) {
  const startTime = Date.now();
  let lastCount = 0;

  console.log(`\nWaiting for ${expectedCount} reviews to complete...`);

  while (Date.now() - startTime < timeoutMs) {
    const resultKeys = await redis.keys('coordination:review:result:*');
    const completedCount = resultKeys.length;

    if (completedCount !== lastCount) {
      console.log(`Reviews completed: ${completedCount}/${expectedCount}`);
      lastCount = completedCount;
    }

    if (completedCount >= expectedCount) {
      console.log(`✅ All ${expectedCount} reviews completed!`);
      return true;
    }

    await sleep(1000);
  }

  console.error(`❌ Review timeout: ${lastCount}/${expectedCount} completed`);
  return false;
}

/**
 * Monitor reviewer pool dynamics
 */
async function monitorReviewerPool(redis, durationMs = 30000) {
  const startTime = Date.now();
  const snapshots = [];

  console.log('\nMonitoring reviewer pool dynamics...');

  while (Date.now() - startTime < durationMs) {
    const pool = await redis.hgetall(RedisKeys.reviewerPool);
    const reviewers = Object.entries(pool || {}).map(([id, data]) => ({
      id,
      ...JSON.parse(data)
    }));

    const queueDepth = await redis.llen(RedisKeys.reviewQueue);

    const snapshot = {
      timestamp: Date.now(),
      queueDepth,
      totalReviewers: reviewers.length,
      activeReviewers: reviewers.filter(r => r.status === 'active').length,
      terminatedReviewers: reviewers.filter(r => r.status === 'terminated').length,
      reviewers: reviewers.map(r => ({
        id: r.id,
        status: r.status,
        reviewCount: r.reviewCount,
        assignedCombo: r.assignedCombo
      }))
    };

    snapshots.push(snapshot);

    console.log(`Queue: ${queueDepth}, Active reviewers: ${snapshot.activeReviewers}/${snapshot.totalReviewers}`);

    await sleep(2000);
  }

  return snapshots;
}

/**
 * Validate Layer 2 specific criteria
 */
async function validateLayer2(redis) {
  console.log('\n' + '━'.repeat(60));
  console.log('LAYER 2 VALIDATION');
  console.log('━'.repeat(60));

  const metrics = new MetricsCollector(redis);
  const validation = await metrics.validateLayer2(70);

  console.log('\nValidation Results:');
  console.log('─'.repeat(60));

  for (const [name, check] of Object.entries(validation.checks)) {
    const status = check.passed ? '✅' : '❌';
    console.log(`${status} ${name}:`, JSON.stringify(check, null, 2));
  }

  console.log('─'.repeat(60));
  console.log(`\nOverall: ${validation.passed ? '✅ PASSED' : '❌ FAILED'}`);

  return validation;
}

/**
 * Print detailed results
 */
function printResults(validation, poolSnapshots, duration) {
  console.log('\n' + '━'.repeat(60));
  console.log('LAYER 2 TEST RESULTS');
  console.log('━'.repeat(60));

  const m = validation.metrics;

  console.log('\n📊 Coordination Metrics:');
  console.log(`   Coordinators: ${m.coordinators.count}`);
  console.log(`   Total agents: ${m.agents.total}`);
  console.log(`   Timeline events: ${m.timeline.total}`);
  console.log(`   Conflicts: ${m.conflicts.total}`);

  console.log('\n📝 Claims:');
  console.log(`   Total claims: ${m.claims.total}`);
  console.log(`   Completed: ${m.claims.byStatus?.completed?.length || 0}`);

  m.coordinators.coordinators.forEach(coord => {
    if (coord.id.startsWith('Coordinator-')) {
      console.log(`   ${coord.id}: ${coord.claimed} claimed, ${coord.completed} completed`);
    }
  });

  console.log('\n👥 Reviewer Pool:');
  console.log(`   Total reviewers spawned: ${m.review.reviewerPool.total}`);
  console.log(`   Active: ${m.review.reviewerPool.byStatus?.active?.length || 0}`);
  console.log(`   Terminated: ${m.review.reviewerPool.byStatus?.terminated?.length || 0}`);

  console.log('\n✅ Reviews:');
  console.log(`   Total completed: ${m.review.results.total}`);
  console.log(`   Pass rate: ${(m.review.results.passRate * 100).toFixed(1)}%`);

  console.log('\n📈 Queue Dynamics:');
  if (poolSnapshots.length > 0) {
    const queueDepths = poolSnapshots.map(s => s.queueDepth);
    const reviewerCounts = poolSnapshots.map(s => s.activeReviewers);

    console.log(`   Max queue depth: ${Math.max(...queueDepths)}`);
    console.log(`   Avg queue depth: ${(queueDepths.reduce((a, b) => a + b, 0) / queueDepths.length).toFixed(1)}`);
    console.log(`   Min reviewers: ${Math.min(...reviewerCounts)}`);
    console.log(`   Max reviewers: ${Math.max(...reviewerCounts)}`);
    console.log(`   Avg reviewers: ${(reviewerCounts.reduce((a, b) => a + b, 0) / reviewerCounts.length).toFixed(1)}`);
  }

  console.log('\n⏱️  Performance:');
  console.log(`   Total duration: ${duration}s`);
  console.log(`   Avg review time: ${(duration / m.review.results.total).toFixed(2)}s`);

  console.log('\n' + '━'.repeat(60));

  if (validation.passed) {
    console.log('\n🎉 LAYER 2 TEST PASSED!');
    console.log('\n✅ Key Success Metrics:');
    console.log(`   - ${m.agents.total} total agents (≥73 expected)`);
    console.log(`   - ${m.review.results.total} reviews completed (70 expected)`);
    console.log(`   - ${m.review.reviewerPool.total} reviewers spawned (3-10 range)`);
    console.log(`   - Dynamic spawning/despawning validated`);
    console.log(`   - 100% review pass rate achieved`);
  } else {
    console.log('\n❌ LAYER 2 TEST FAILED');
    console.log('\nFailure reasons:');

    for (const [name, check] of Object.entries(validation.checks)) {
      if (!check.passed) {
        console.log(`   - ${name}: ${JSON.stringify(check)}`);
      }
    }
  }

  console.log('\n');
}

/**
 * Main test execution
 */
async function runLayer2Test() {
  console.log('🚀 Starting Layer 2: Review Coordination Test');
  console.log('');
  console.log('Test Configuration:');
  console.log('  - Implementer coordinators: 2 (mesh topology)');
  console.log('  - Review coordinator: 1 (dynamic pool)');
  console.log('  - Combinations: 70 (7 languages × 10 translations)');
  console.log('  - Reviewer pool: 3-10 reviewers (dynamic)');
  console.log('  - Queue threshold: 5');
  console.log('  - Coordination: Redis Pub/Sub');
  console.log('');

  // Create output directory
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists
  }

  // Connect to Redis
  console.log('━'.repeat(60));
  console.log('PHASE 1: REDIS CONNECTION & CLEANUP');
  console.log('━'.repeat(60));
  console.log('');

  const redis = await createRedisClient();
  await redis.connect();
  console.log('✅ Connected to Redis');

  // Clear old test data
  const oldKeys = await redis.keys('coordination:*');
  if (oldKeys.length > 0) {
    await Promise.all(oldKeys.map(key => redis.del(key)));
    console.log(`🧹 Cleared ${oldKeys.length} old coordination keys`);
  }

  console.log('');

  // Generate combinations and split
  const allCombos = generateCombinations();
  const [combosA, combosB] = splitCombinations(allCombos);

  console.log('━'.repeat(60));
  console.log('PHASE 2: INITIALIZE COORDINATORS');
  console.log('━'.repeat(60));
  console.log('');

  // Create implementer coordinators
  const coordA = new ImplementerCoordinator('Coordinator-A', redis, combosA);
  const coordB = new ImplementerCoordinator('Coordinator-B', redis, combosB);

  // Create review coordinator
  const reviewCoord = new ReviewCoordinator('ReviewCoordinator', redis, {
    minReviewers: 3,
    maxReviewers: 10,
    queueThreshold: 5
  });

  console.log(`Coordinator-A: ${combosA.length} combinations assigned`);
  console.log(`Coordinator-B: ${combosB.length} combinations assigned`);
  console.log(`ReviewCoordinator: 3-10 dynamic reviewers`);
  console.log('');

  // Start coordinators
  await coordA.startup();
  console.log('✅ Coordinator-A started');

  await coordB.startup();
  console.log('✅ Coordinator-B started');

  await reviewCoord.startup();
  console.log('✅ ReviewCoordinator started');

  console.log('');
  console.log('━'.repeat(60));
  console.log('PHASE 3: CLAIM & IMPLEMENT');
  console.log('━'.repeat(60));
  console.log('');

  const startTime = Date.now();

  // Process combinations in parallel
  const implementationPromises = [];

  // Coordinator A implementation
  const processCoordA = async () => {
    for (const combo of combosA) {
      const claimed = await coordA.attemptClaim(combo);
      if (claimed) {
        await executeImplementation(coordA, combo);
      }
    }
  };

  // Coordinator B implementation
  const processCoordB = async () => {
    for (const combo of combosB) {
      const claimed = await coordB.attemptClaim(combo);
      if (claimed) {
        await executeImplementation(coordB, combo);
      }
    }
  };

  implementationPromises.push(processCoordA(), processCoordB());

  // Wait for all implementations
  await Promise.all(implementationPromises);

  console.log('');
  console.log('✅ All implementations complete');

  // Set coordinators to idle
  coordA.status = 'idle';
  await redis.hset(RedisKeys.coordinatorState(coordA.id), 'status', 'idle');

  coordB.status = 'idle';
  await redis.hset(RedisKeys.coordinatorState(coordB.id), 'status', 'idle');

  console.log('');
  console.log('━'.repeat(60));
  console.log('PHASE 4: SUBMIT FOR REVIEW');
  console.log('━'.repeat(60));
  console.log('');

  // Start review coordinator monitoring
  const reviewPromise = reviewCoord.run();

  // Give reviewers time to start
  await sleep(1000);

  // Submit all completed work for review
  const submissionPromises = [];

  for (const combo of combosA) {
    const agentId = `agent-${coordA.id}-${combo}`;
    submissionPromises.push(submitForReview(redis, combo, coordA.id, agentId));
  }

  for (const combo of combosB) {
    const agentId = `agent-${coordB.id}-${combo}`;
    submissionPromises.push(submitForReview(redis, combo, coordB.id, agentId));
  }

  await Promise.all(submissionPromises);

  console.log(`✅ Submitted ${allCombos.length} items for review`);
  console.log('');

  console.log('━'.repeat(60));
  console.log('PHASE 5: MONITOR REVIEWS');
  console.log('━'.repeat(60));
  console.log('');

  // Start monitoring reviewer pool
  const monitorPromise = monitorReviewerPool(redis, 60000);

  // Wait for all reviews to complete
  const reviewSuccess = await waitForReviewCompletion(redis, allCombos.length, 120000);

  if (!reviewSuccess) {
    console.error('❌ Review completion timeout');

    // Stop review coordinator
    reviewCoord.running = false;
    await reviewCoord.stop();

    if (redis && redis.disconnect) await redis.disconnect();
    process.exit(1);
  }

  // Stop review coordinator
  reviewCoord.running = false;
  await reviewCoord.stop();

  // Wait a bit for monitoring to capture final state
  await sleep(2000);

  const poolSnapshots = await monitorPromise;

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log('');
  console.log('━'.repeat(60));
  console.log('PHASE 6: VALIDATION');
  console.log('━'.repeat(60));

  const validation = await validateLayer2(redis);

  // Print results
  printResults(validation, poolSnapshots, duration);

  // Export metrics
  const metrics = new MetricsCollector(redis);
  const fullMetrics = await metrics.collectAll();

  const results = {
    test: 'Layer 2: Review Coordination',
    timestamp: new Date().toISOString(),
    duration,
    validation,
    poolSnapshots,
    metrics: fullMetrics
  };

  await fs.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`📄 Results saved to ${RESULTS_FILE}`);

  // Cleanup
  console.log('');
  console.log('🧹 Cleaning up...');

  await coordA.shutdown();
  await coordB.shutdown();
  if (redis && redis.disconnect) await redis.disconnect();

  console.log('✅ Cleanup complete');
  console.log('');

  process.exit(validation.passed ? 0 : 1);
}

/**
 * Helper: sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n\n🛑 Test interrupted by user');
  process.exit(1);
});

// Run test
runLayer2Test().catch((error) => {
  console.error('❌ Test failed with error:', error);
  console.error(error.stack);
  process.exit(1);
});
