#!/usr/bin/env node

/**
 * Layer 3: Error Handling & Retry Coordination Test (Standalone)
 *
 * Architecture:
 * - 2 error-prone implementer coordinators (Coordinator-A, Coordinator-B)
 * - 1 review coordinator with dynamic reviewer pool
 * - 50% error injection rate
 * - 4 error types: SyntaxError (35%), LogicError (35%), TranslationError (20%), MixedError (10%)
 * - Retry coordination with exponential backoff (100ms → 2000ms)
 * - Fresh agent spawning for each retry (agent-{coord}-{combo}-retry{N})
 * - Max 10 retries per file
 *
 * Success Criteria:
 * - 50% initial error rate (±10% tolerance)
 * - Error distribution matches expected probabilities (±15% tolerance)
 * - All 70 files pass after retries
 * - Max retries per file ≤10
 * - Avg retries per file ≤4
 * - 100% final success rate
 */

import { createClient } from 'redis';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Test configuration
const LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh'];
const TRANSLATIONS = ['ja', 'ko', 'ar', 'hi', 'ru', 'tr', 'pl', 'nl', 'sv', 'no'];
const OUTPUT_DIR = path.join(__dirname, '../../test-results/hello-world');
const RESULTS_FILE = path.join(OUTPUT_DIR, 'layer3-results.json');
const ERROR_RATE = 0.5;
const MAX_RETRIES = 10;

// Error type configuration
const ERROR_TYPES = {
  SYNTAX: {
    name: 'SyntaxError',
    probability: 0.35,
    simulate: () => ({
      error: 'SyntaxError',
      message: 'Missing semicolon at line 42',
      line: 42,
      column: 15
    })
  },
  LOGIC: {
    name: 'LogicError',
    probability: 0.35,
    simulate: () => ({
      error: 'LogicError',
      message: 'Incorrect translation logic: expected greeting format',
      expected: 'Hello, World!',
      actual: 'World, Hello!'
    })
  },
  TRANSLATION: {
    name: 'TranslationError',
    probability: 0.20,
    simulate: () => ({
      error: 'TranslationError',
      message: 'Invalid Unicode character in translation',
      character: '\\uFFFD',
      position: 7
    })
  },
  MIXED: {
    name: 'MixedError',
    probability: 0.10,
    simulate: () => ({
      error: 'MixedError',
      message: 'Multiple issues detected',
      issues: [
        'Syntax error on line 10',
        'Logic error: incorrect output format',
        'Translation error: missing diacritical mark'
      ]
    })
  }
};

// Redis key patterns
const RedisKeys = {
  claim: (combo) => `coordination:claims:claimed:${combo}`,
  timeline: 'coordination:timeline',
  conflicts: 'coordination:conflicts:log',
  coordinatorState: (id) => `coordination:coordinator:${id}`,
  coordinatorClaimed: (id) => `coordination:coordinator:${id}:claimed`,
  coordinatorCompleted: (id) => `coordination:coordinator:${id}:completed`,
  reviewQueue: 'coordination:review:queue',
  reviewerPool: 'coordination:reviewers:pool',
  reviewResult: (combo) => `coordination:review:result:${combo}`,
  errorsInjected: 'coordination:errors:injected',
  retriesCount: 'coordination:retries:count',
  retriesLog: 'coordination:retries:log',
  activeAgents: 'coordination:agents:active'
};

// Message channels
const Channels = {
  CLAIMS: 'coordination:claims:channel',
  HEARTBEAT: 'coordination:heartbeat'
};

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
 * Base Coordinator Class - Direct Redis implementation
 */
class MeshCoordinator {
  constructor(id, redisUrl) {
    this.id = id;
    this.status = 'init';
    this.claimedCombos = new Set();
    this.completedCombos = new Set();
    this.activeAgents = new Map();
    this.retryAttempts = new Map();

    // Separate clients for pub and sub (Redis requirement)
    this.redisClient = createClient({ url: redisUrl });
    this.pubClient = createClient({ url: redisUrl });
    this.subClient = createClient({ url: redisUrl });
  }

  async initialize() {
    await this.redisClient.connect();
    await this.pubClient.connect();
    await this.subClient.connect();

    console.log(`[${this.id}] Connected to Redis (3 clients)`);

    // Subscribe to coordination channel
    await this.subClient.subscribe(Channels.CLAIMS, (message) => {
      try {
        const msg = JSON.parse(message);
        this.handlePeerMessage(msg);
      } catch (error) {
        console.error(`[${this.id}] Error parsing message:`, error);
      }
    });

    // Initialize coordinator state
    await this.redisClient.hSet(RedisKeys.coordinatorState(this.id), {
      status: 'active',
      agentCount: '0',
      lastHeartbeat: Date.now().toString()
    });

    console.log(`[${this.id}] Initialized successfully`);
  }

  handlePeerMessage(msg) {
    // Ignore own messages
    if (msg.coordinator === this.id || msg.coordinatorId === this.id) {
      return;
    }

    // Track peer claims for conflict detection
    if (msg.action === 'claim' || msg.type === 'claim_attempt') {
      console.log(`[${this.id}] Observed peer claim: ${msg.coordinator} -> ${msg.combo}`);
    }
  }

  async claimCombination(combo) {
    const timestamp = Date.now();
    const claimKey = RedisKeys.claim(combo);

    console.log(`[${this.id}] Attempting to claim: ${combo}`);

    // Atomic claim attempt (SET NX)
    const result = await this.redisClient.set(claimKey, JSON.stringify({
      coordinatorId: this.id,
      timestamp,
      status: 'claimed'
    }), { NX: true, EX: 3600 });

    if (result !== 'OK') {
      console.log(`[${this.id}] Failed to claim ${combo} (already claimed)`);
      return false;
    }

    // Publish claim message
    await this.pubClient.publish(Channels.CLAIMS, JSON.stringify({
      coordinator: this.id,
      combo,
      action: 'claim',
      type: 'claim_attempt',
      timestamp
    }));

    // Update local state
    this.claimedCombos.add(combo);
    await this.redisClient.sAdd(RedisKeys.coordinatorClaimed(this.id), combo);

    // Log to timeline
    await this.redisClient.rPush(RedisKeys.timeline, JSON.stringify({
      timestamp,
      action: 'claim_success',
      coordinator: this.id,
      combo
    }));

    console.log(`[${this.id}] Successfully claimed: ${combo}`);

    return true;
  }

  async spawnAgent(combo, attempt = 0) {
    const agentId = attempt > 0
      ? `agent-${this.id}-${combo}-retry${attempt}`
      : `agent-${this.id}-${combo}`;

    const [source, target] = combo.split('-');

    const agent = {
      id: agentId,
      coordinator: this.id,
      task: `Translate "Hello, World!" from ${source} to ${target}`,
      combo,
      attempt,
      spawnedAt: Date.now(),
      status: 'active',
      isRetry: attempt > 0
    };

    this.activeAgents.set(agentId, agent);

    // Update Redis
    await this.redisClient.hSet(RedisKeys.activeAgents, agentId, JSON.stringify(agent));
    await this.redisClient.hIncrBy(RedisKeys.coordinatorState(this.id), 'agentCount', 1);

    // Log spawn
    const action = attempt > 0 ? 'fresh_agent_spawned' : 'agent_spawned';
    await this.redisClient.rPush(RedisKeys.timeline, JSON.stringify({
      timestamp: Date.now(),
      action,
      coordinator: this.id,
      combo,
      agentId,
      attempt
    }));

    console.log(`[${this.id}] Spawned agent: ${agentId}${attempt > 0 ? ` (retry ${attempt})` : ''}`);

    return agent;
  }

  async completeWork(combo, agentId, success) {
    // Update claim status
    const claimStr = await this.redisClient.get(RedisKeys.claim(combo));
    if (claimStr) {
      const claim = JSON.parse(claimStr);
      claim.status = success ? 'completed' : 'failed';
      await this.redisClient.setEx(RedisKeys.claim(combo), 3600, JSON.stringify(claim));
    }

    // Update local state
    if (success) {
      this.completedCombos.add(combo);
      await this.redisClient.sAdd(RedisKeys.coordinatorCompleted(this.id), combo);
    }

    // Update agent status
    const agent = this.activeAgents.get(agentId);
    if (agent) {
      agent.status = success ? 'completed' : 'failed';
      agent.completedAt = Date.now();
      await this.redisClient.hSet(RedisKeys.activeAgents, agentId, JSON.stringify(agent));
    }

    // Log completion
    await this.redisClient.rPush(RedisKeys.timeline, JSON.stringify({
      timestamp: Date.now(),
      action: 'work_complete',
      coordinator: this.id,
      combo,
      agentId,
      success
    }));

    console.log(`[${this.id}] Work complete: ${combo} (success: ${success})`);

    return success;
  }

  async releaseClaimForRetry(combo) {
    console.log(`[${this.id}] Releasing claim for retry: ${combo}`);

    // Delete claim
    await this.redisClient.del(RedisKeys.claim(combo));

    // Remove from claimed set
    this.claimedCombos.delete(combo);
    await this.redisClient.sRem(RedisKeys.coordinatorClaimed(this.id), combo);

    console.log(`[${this.id}] Released claim: ${combo}`);
  }

  async shutdown() {
    console.log(`[${this.id}] Shutting down...`);
    this.status = 'shutdown';

    await this.redisClient.hSet(RedisKeys.coordinatorState(this.id), 'status', 'shutdown');

    await this.redisClient.quit();
    await this.pubClient.quit();
    await this.subClient.quit();

    console.log(`[${this.id}] Shutdown complete`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Error-Prone Implementer Coordinator with inline error injection
 */
class ErrorProneCoordinator extends MeshCoordinator {
  constructor(id, redisUrl, combos) {
    super(id, redisUrl);
    this.assignedCombos = combos.slice();
    this.successfulCombos = new Set();
  }

  shouldInjectError() {
    return Math.random() < ERROR_RATE;
  }

  selectErrorType() {
    const rand = Math.random();
    let cumulative = 0;

    for (const [typeName, config] of Object.entries(ERROR_TYPES)) {
      cumulative += config.probability;
      if (rand < cumulative) {
        return config;
      }
    }

    return ERROR_TYPES.SYNTAX;
  }

  async injectError(combo, agentId) {
    if (!this.shouldInjectError()) {
      return null;
    }

    const errorType = this.selectErrorType();
    const error = {
      combo,
      agentId,
      errorType: errorType.name,
      errorDetails: errorType.simulate(),
      injectedAt: Date.now()
    };

    // Store in Redis
    await this.redisClient.hSet(RedisKeys.errorsInjected, combo, JSON.stringify(error));

    console.log(`[${this.id}] ❌ Injected ${error.errorType} for ${combo}`);

    return error;
  }

  async handleRetry(combo, agentId, error) {
    const attempts = this.retryAttempts.get(combo) || 0;

    if (attempts >= MAX_RETRIES) {
      console.error(`[${this.id}] ⚠️  Max retries (${MAX_RETRIES}) exceeded for ${combo}`);
      return false;
    }

    const newAttempt = attempts + 1;
    this.retryAttempts.set(combo, newAttempt);

    // Increment retry count in Redis
    await this.redisClient.hIncrBy(RedisKeys.retriesCount, combo, 1);

    // Log retry
    await this.redisClient.rPush(RedisKeys.retriesLog, JSON.stringify({
      combo,
      originalAgent: agentId,
      attempt: newAttempt,
      errorType: error?.errorType || 'unknown',
      timestamp: Date.now()
    }));

    console.log(`[${this.id}] 🔄 Handling retry ${newAttempt}/${MAX_RETRIES} for ${combo}`);

    // Exponential backoff
    const backoff = Math.min(100 * Math.pow(2, attempts), 2000);
    await this.sleep(backoff);

    return newAttempt;
  }

  async executeWork(agent) {
    const combo = agent.combo;
    const agentId = agent.id;
    const attempt = agent.attempt || 0;

    // Simulate work duration
    const workDuration = 100 + Math.random() * 200;
    await this.sleep(workDuration);

    // Check if error should be injected
    const error = await this.injectError(combo, agentId);

    if (error) {
      // Error injected - work fails
      await this.completeWork(combo, agentId, false);

      // Handle retry
      const retryAttempt = await this.handleRetry(combo, agentId, error);

      if (retryAttempt !== false) {
        // Release claim for retry
        await this.releaseClaimForRetry(combo);

        // Re-claim and spawn fresh agent
        await this.sleep(100); // Brief delay before re-claiming

        const reClaimed = await this.claimCombination(combo);

        if (reClaimed) {
          const freshAgent = await this.spawnAgent(combo, retryAttempt);
          await this.executeWork(freshAgent); // Recursive retry
        }
      }
    } else {
      // No error - work succeeds
      console.log(`[${this.id}] ✅ ${agentId} succeeded on ${combo}`);

      await this.completeWork(combo, agentId, true);
      this.successfulCombos.add(combo);
    }
  }

  async run() {
    await this.initialize();

    console.log(`[${this.id}] Processing ${this.assignedCombos.length} combos with error injection`);

    // Process all assigned combos
    for (const combo of this.assignedCombos) {
      const claimed = await this.claimCombination(combo);

      if (claimed) {
        const agent = await this.spawnAgent(combo);
        await this.executeWork(agent);
      }
    }

    this.status = 'idle';
    await this.redisClient.hSet(RedisKeys.coordinatorState(this.id), 'status', 'idle');

    console.log(`[${this.id}] All work complete: ${this.successfulCombos.size}/${this.assignedCombos.length} successful`);
  }
}

/**
 * Review Coordinator with dynamic reviewer pool
 */
class ReviewCoordinator extends MeshCoordinator {
  constructor(id, redisUrl, options = {}) {
    super(id, redisUrl);
    this.minReviewers = options.minReviewers || 3;
    this.maxReviewers = options.maxReviewers || 10;
    this.queueThreshold = options.queueThreshold || 5;
    this.activeReviewers = [];
    this.running = false;
  }

  async run() {
    await this.initialize();
    this.running = true;

    console.log(`[${this.id}] Starting review coordination (${this.minReviewers}-${this.maxReviewers} reviewers)`);

    // Start with minimum reviewers
    for (let i = 0; i < this.minReviewers; i++) {
      await this.spawnReviewer();
    }

    // Monitor queue and manage reviewers
    await this.monitorQueue();
  }

  async monitorQueue() {
    while (this.running) {
      const queueDepth = await this.redisClient.lLen(RedisKeys.reviewQueue);
      const activeCount = this.activeReviewers.filter(r => r.status === 'active').length;

      // Spawn logic
      if (queueDepth > this.queueThreshold && activeCount < this.maxReviewers) {
        console.log(`[${this.id}] Queue depth ${queueDepth} > threshold ${this.queueThreshold}, spawning reviewer`);
        await this.spawnReviewer();
      }

      // Despawn logic
      if (queueDepth < this.queueThreshold && activeCount > this.minReviewers) {
        await this.despawnIdleReviewer();
      }

      await this.sleep(1000);
    }
  }

  async spawnReviewer() {
    const reviewerId = `reviewer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const reviewer = {
      id: reviewerId,
      coordinator: this.id,
      status: 'active',
      assignedCombo: null,
      reviewCount: 0,
      spawnedAt: Date.now()
    };

    this.activeReviewers.push(reviewer);
    await this.redisClient.hSet(RedisKeys.reviewerPool, reviewerId, JSON.stringify(reviewer));

    console.log(`[${this.id}] Spawned reviewer: ${reviewerId}`);

    // Start review loop
    this.reviewLoop(reviewer);

    return reviewer;
  }

  async reviewLoop(reviewer) {
    while (reviewer.status === 'active' && this.running) {
      const itemStr = await this.redisClient.lPop(RedisKeys.reviewQueue);

      if (!itemStr) {
        await this.sleep(1000);
        continue;
      }

      const work = JSON.parse(itemStr);
      reviewer.assignedCombo = work.combo;
      await this.redisClient.hSet(RedisKeys.reviewerPool, reviewer.id, JSON.stringify(reviewer));

      // Simulate review
      const reviewDuration = 500 + Math.random() * 1000;
      await this.sleep(reviewDuration);

      // Store result
      const result = {
        combo: work.combo,
        reviewerId: reviewer.id,
        passed: true,
        issues: [],
        reviewedAt: Date.now()
      };

      await this.redisClient.setEx(RedisKeys.reviewResult(work.combo), 300, JSON.stringify(result));

      // Log review
      await this.redisClient.rPush(RedisKeys.timeline, JSON.stringify({
        timestamp: Date.now(),
        action: 'review_complete',
        reviewerId: reviewer.id,
        combo: work.combo,
        passed: true
      }));

      console.log(`[${this.id}] Reviewer ${reviewer.id} completed review of ${work.combo}`);

      reviewer.reviewCount++;
      reviewer.assignedCombo = null;
      reviewer.lastReviewAt = Date.now();
      await this.redisClient.hSet(RedisKeys.reviewerPool, reviewer.id, JSON.stringify(reviewer));
    }
  }

  async despawnIdleReviewer() {
    const idleReviewer = this.activeReviewers.find(r =>
      r.status === 'active' &&
      !r.assignedCombo &&
      (Date.now() - (r.lastReviewAt || r.spawnedAt)) > 5000
    );

    if (idleReviewer) {
      console.log(`[${this.id}] Despawning idle reviewer: ${idleReviewer.id}`);
      idleReviewer.status = 'terminated';
      await this.redisClient.hSet(RedisKeys.reviewerPool, idleReviewer.id, JSON.stringify(idleReviewer));
    }
  }

  async stop() {
    this.running = false;
    console.log(`[${this.id}] Stopping review coordination`);

    // Terminate all reviewers
    for (const reviewer of this.activeReviewers) {
      reviewer.status = 'terminated';
      await this.redisClient.hSet(RedisKeys.reviewerPool, reviewer.id, JSON.stringify(reviewer));
    }

    await this.shutdown();
  }
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

  await redis.rPush(RedisKeys.reviewQueue, JSON.stringify(queueItem));
}

/**
 * Wait for all reviews to complete
 */
async function waitForReviewCompletion(redis, expectedCount, timeoutMs = 180000) {
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

    await sleep(2000);
  }

  console.error(`❌ Review timeout: ${lastCount}/${expectedCount} completed`);
  return false;
}

/**
 * Validate Layer 3 specific criteria
 */
async function validateLayer3(redis) {
  console.log('\n' + '━'.repeat(60));
  console.log('LAYER 3 VALIDATION');
  console.log('━'.repeat(60));

  const checks = {};

  // Check error injection rate
  const errorsObj = await redis.hGetAll(RedisKeys.errorsInjected);
  const errorCount = Object.keys(errorsObj).length;
  const errorRate = errorCount / 70;

  checks.errorRate = {
    passed: errorRate >= 0.40 && errorRate <= 0.60,
    actual: errorRate,
    expected: '0.40-0.60 (50% ±10%)',
    count: errorCount
  };

  // Check error distribution
  const errorsByType = {};
  for (const errorStr of Object.values(errorsObj)) {
    const error = JSON.parse(errorStr);
    errorsByType[error.errorType] = (errorsByType[error.errorType] || 0) + 1;
  }

  const syntaxPct = (errorsByType['SyntaxError'] || 0) / errorCount;
  const logicPct = (errorsByType['LogicError'] || 0) / errorCount;
  const translationPct = (errorsByType['TranslationError'] || 0) / errorCount;
  const mixedPct = (errorsByType['MixedError'] || 0) / errorCount;

  checks.errorDistribution = {
    passed: (
      syntaxPct >= 0.20 && syntaxPct <= 0.50 &&
      logicPct >= 0.20 && logicPct <= 0.50 &&
      translationPct >= 0.05 && translationPct <= 0.35 &&
      mixedPct >= 0.00 && mixedPct <= 0.25
    ),
    actual: { syntaxPct, logicPct, translationPct, mixedPct },
    expected: 'Syntax: 35%±15%, Logic: 35%±15%, Translation: 20%±15%, Mixed: 10%±15%'
  };

  // Check retry statistics
  const retryCounts = await redis.hGetAll(RedisKeys.retriesCount);
  const retryLog = await redis.lRange(RedisKeys.retriesLog, 0, -1);

  const retryValues = Object.values(retryCounts).map(v => parseInt(v, 10));
  const maxRetries = Math.max(...retryValues, 0);
  const avgRetries = retryValues.length > 0
    ? retryValues.reduce((a, b) => a + b, 0) / retryValues.length
    : 0;

  checks.maxRetries = {
    passed: maxRetries <= MAX_RETRIES,
    actual: maxRetries,
    expected: `≤${MAX_RETRIES}`
  };

  checks.avgRetries = {
    passed: avgRetries <= 4,
    actual: avgRetries,
    expected: '≤4'
  };

  // Check final success rate
  const resultKeys = await redis.keys('coordination:review:result:*');
  checks.finalSuccess = {
    passed: resultKeys.length === 70,
    actual: resultKeys.length,
    expected: 70
  };

  // Print validation results
  console.log('\nValidation Results:');
  console.log('─'.repeat(60));

  for (const [name, check] of Object.entries(checks)) {
    const status = check.passed ? '✅' : '❌';
    console.log(`${status} ${name}:`, JSON.stringify(check, null, 2));
  }

  const allPassed = Object.values(checks).every(c => c.passed);

  console.log('─'.repeat(60));
  console.log(`\nOverall: ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);

  return {
    passed: allPassed,
    checks,
    retryStats: {
      total: retryLog.length,
      max: maxRetries,
      avg: avgRetries,
      counts: retryValues
    }
  };
}

/**
 * Print detailed results
 */
function printResults(validation, duration) {
  console.log('\n' + '━'.repeat(60));
  console.log('LAYER 3 TEST RESULTS');
  console.log('━'.repeat(60));

  console.log('\n🐛 Error Injection:');
  console.log(`   Errors injected: ${validation.checks.errorRate.count}`);
  console.log(`   Error rate: ${(validation.checks.errorRate.actual * 100).toFixed(1)}%`);
  console.log(`   Expected rate: 50% ±10%`);

  console.log('\n   Error Distribution:');
  const dist = validation.checks.errorDistribution.actual;
  console.log(`     SyntaxError: ${(dist.syntaxPct * 100).toFixed(1)}%`);
  console.log(`     LogicError: ${(dist.logicPct * 100).toFixed(1)}%`);
  console.log(`     TranslationError: ${(dist.translationPct * 100).toFixed(1)}%`);
  console.log(`     MixedError: ${(dist.mixedPct * 100).toFixed(1)}%`);

  console.log('\n🔄 Retry Coordination:');
  console.log(`   Total retries: ${validation.retryStats.total}`);
  console.log(`   Files with retries: ${validation.retryStats.counts.length}`);
  console.log(`   Max retries per file: ${validation.retryStats.max}`);
  console.log(`   Avg retries per file: ${validation.retryStats.avg.toFixed(2)}`);

  console.log('\n✅ Final Results:');
  console.log(`   Total completed: ${validation.checks.finalSuccess.actual}/70`);
  console.log(`   Success rate: ${((validation.checks.finalSuccess.actual / 70) * 100).toFixed(1)}%`);

  console.log('\n⏱️  Performance:');
  console.log(`   Total duration: ${duration}s`);

  console.log('\n' + '━'.repeat(60));

  if (validation.passed) {
    console.log('\n🎉 LAYER 3 TEST PASSED!');
    console.log('\n✅ Key Success Metrics:');
    console.log(`   - ${validation.checks.errorRate.count} errors injected (${(validation.checks.errorRate.actual * 100).toFixed(1)}% rate)`);
    console.log(`   - Error distribution matches expected probabilities`);
    console.log(`   - ${validation.retryStats.total} retries executed`);
    console.log(`   - Max ${validation.retryStats.max} retries per file (≤10)`);
    console.log(`   - Avg ${validation.retryStats.avg.toFixed(2)} retries per file (≤4)`);
    console.log(`   - 100% final success rate achieved`);
    console.log(`   - Fresh agents spawned for each retry`);
  } else {
    console.log('\n❌ LAYER 3 TEST FAILED');
    console.log('\nFailure reasons:');

    for (const [name, check] of Object.entries(validation.checks)) {
      if (!check.passed) {
        console.log(`   - ${name}: Expected ${check.expected}, got ${JSON.stringify(check.actual)}`);
      }
    }
  }

  console.log('\n');
}

/**
 * Main test execution
 */
async function runLayer3Test() {
  console.log('🚀 Starting Layer 3: Error Handling & Retry Coordination Test');
  console.log('');
  console.log('Test Configuration:');
  console.log('  - Implementer coordinators: 2 (error-prone)');
  console.log('  - Review coordinator: 1 (dynamic pool)');
  console.log('  - Combinations: 70 (7 languages × 10 translations)');
  console.log('  - Error injection rate: 50%');
  console.log('  - Error types: Syntax (35%), Logic (35%), Translation (20%), Mixed (10%)');
  console.log('  - Max retries per file: 10');
  console.log('  - Retry backoff: Exponential (100ms → 2000ms)');
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

  const redis = createClient({ url: 'redis://localhost:6379' });
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
  console.log('PHASE 2: INITIALIZE COORDINATORS & ERROR INJECTION');
  console.log('━'.repeat(60));
  console.log('');

  // Create error-prone implementer coordinators
  const coordA = new ErrorProneCoordinator('Coordinator-A', 'redis://localhost:6379', combosA);
  const coordB = new ErrorProneCoordinator('Coordinator-B', 'redis://localhost:6379', combosB);

  // Create review coordinator
  const reviewCoord = new ReviewCoordinator('ReviewCoordinator', 'redis://localhost:6379', {
    minReviewers: 3,
    maxReviewers: 10,
    queueThreshold: 5
  });

  console.log(`Coordinator-A: ${combosA.length} combinations assigned`);
  console.log(`Coordinator-B: ${combosB.length} combinations assigned`);
  console.log(`ReviewCoordinator: 3-10 dynamic reviewers`);
  console.log('');

  console.log('━'.repeat(60));
  console.log('PHASE 3: EXECUTE WITH ERROR INJECTION & RETRY');
  console.log('━'.repeat(60));
  console.log('');

  const startTime = Date.now();

  // Start review coordinator
  const reviewPromise = reviewCoord.run();

  // Give reviewers time to start
  await sleep(1000);

  // Process implementations with error injection
  await Promise.all([
    coordA.run(),
    coordB.run()
  ]);

  console.log('');
  console.log('✅ All implementations complete (including retries)');

  console.log('');
  console.log('━'.repeat(60));
  console.log('PHASE 4: SUBMIT FOR REVIEW');
  console.log('━'.repeat(60));
  console.log('');

  // Submit successful work for review
  const submissionPromises = [];

  for (const combo of coordA.successfulCombos) {
    const agentId = `agent-${coordA.id}-${combo}`;
    submissionPromises.push(submitForReview(redis, combo, coordA.id, agentId));
  }

  for (const combo of coordB.successfulCombos) {
    const agentId = `agent-${coordB.id}-${combo}`;
    submissionPromises.push(submitForReview(redis, combo, coordB.id, agentId));
  }

  await Promise.all(submissionPromises);

  const totalSuccessful = coordA.successfulCombos.size + coordB.successfulCombos.size;
  console.log(`✅ Submitted ${totalSuccessful} successful items for review`);

  console.log('');
  console.log('━'.repeat(60));
  console.log('PHASE 5: WAIT FOR REVIEWS');
  console.log('━'.repeat(60));
  console.log('');

  // Wait for all reviews
  const reviewSuccess = await waitForReviewCompletion(redis, totalSuccessful, 180000);

  if (!reviewSuccess) {
    console.error('❌ Review completion timeout');

    // Stop coordinators
    reviewCoord.running = false;
    await reviewCoord.stop();

    await redis.quit();
    process.exit(1);
  }

  // Stop review coordinator
  reviewCoord.running = false;
  await reviewCoord.stop();

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log('');
  console.log('━'.repeat(60));
  console.log('PHASE 6: VALIDATION');
  console.log('━'.repeat(60));

  const validation = await validateLayer3(redis);

  // Print results
  printResults(validation, duration);

  // Export metrics
  const results = {
    test: 'Layer 3: Error Handling & Retry Coordination',
    timestamp: new Date().toISOString(),
    duration,
    config: {
      errorRate: ERROR_RATE,
      maxRetries: MAX_RETRIES,
      errorTypes: Object.keys(ERROR_TYPES)
    },
    validation
  };

  await fs.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`📄 Results saved to ${RESULTS_FILE}`);

  // Cleanup
  console.log('');
  console.log('🧹 Cleaning up...');

  await coordA.shutdown();
  await coordB.shutdown();
  await redis.quit();

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
runLayer3Test().catch((error) => {
  console.error('❌ Test failed with error:', error);
  console.error(error.stack);
  process.exit(1);
});
