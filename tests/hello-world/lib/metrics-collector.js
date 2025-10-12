/**
 * Metrics Collector
 * Aggregates and analyzes coordination metrics
 */

import { RedisKeys } from './message-protocol.js';

export class MetricsCollector {
  constructor(redis) {
    this.redis = redis;
  }

  async collectAll() {
    const [
      timeline,
      conflicts,
      claims,
      coordinators,
      reviewQueue,
      reviewerPool,
      reviewResults,
      retryLog,
      retryCounts,
      errors,
      activeAgents
    ] = await Promise.all([
      this.getTimeline(),
      this.getConflicts(),
      this.getClaims(),
      this.getCoordinators(),
      this.getReviewQueueDepth(),
      this.getReviewerPool(),
      this.getReviewResults(),
      this.getRetryLog(),
      this.getRetryCounts(),
      this.getInjectedErrors(),
      this.getActiveAgents()
    ]);

    return {
      timestamp: Date.now(),
      timeline,
      conflicts,
      claims,
      coordinators,
      review: {
        queueDepth: reviewQueue,
        reviewerPool,
        results: reviewResults
      },
      retries: {
        log: retryLog,
        counts: retryCounts
      },
      errors,
      agents: activeAgents,
      summary: await this.generateSummary()
    };
  }

  async getTimeline() {
    const entries = await this.redis.lrange(RedisKeys.timeline, 0, -1);
    const parsed = entries.map(e => JSON.parse(e));

    return {
      total: parsed.length,
      entries: parsed,
      byAction: this.groupBy(parsed, 'action'),
      byCoordinator: this.groupBy(parsed, 'coordinator')
    };
  }

  async getConflicts() {
    const conflicts = await this.redis.lrange(RedisKeys.conflicts, 0, -1);
    const parsed = conflicts.map(c => JSON.parse(c));

    return {
      total: parsed.length,
      conflicts: parsed
    };
  }

  async getClaims() {
    const claimKeys = await this.redis.keys('coordination:claims:claimed:*');
    const claims = await Promise.all(
      claimKeys.map(async key => {
        const combo = key.split(':').pop();
        const value = await this.redis.get(key);
        return { combo, claim: JSON.parse(value) };
      })
    );

    return {
      total: claims.length,
      claims,
      byCoordinator: this.groupBy(claims.map(c => c.claim), 'coordinatorId'),
      byStatus: this.groupBy(claims.map(c => c.claim), 'status')
    };
  }

  async getCoordinators() {
    const coordKeys = await this.redis.keys('coordination:coordinator:*');
    const coordIds = [...new Set(coordKeys.map(key => key.split(':')[2]))];

    const coordinators = await Promise.all(
      coordIds.map(async id => {
        const state = await this.redis.hgetall(RedisKeys.coordinatorState(id));
        const claimed = await this.redis.smembers(RedisKeys.coordinatorClaimed(id));
        const completed = await this.redis.smembers(RedisKeys.coordinatorCompleted(id));

        return {
          id,
          state,
          claimed: claimed.length,
          completed: completed.length,
          claimedCombos: claimed,
          completedCombos: completed
        };
      })
    );

    return {
      count: coordinators.length,
      coordinators
    };
  }

  async getReviewQueueDepth() {
    return await this.redis.llen(RedisKeys.reviewQueue);
  }

  async getReviewerPool() {
    const pool = await this.redis.hgetall(RedisKeys.reviewerPool);
    const reviewers = Object.entries(pool).map(([id, data]) => ({
      id,
      ...JSON.parse(data)
    }));

    return {
      total: reviewers.length,
      reviewers,
      byStatus: this.groupBy(reviewers, 'status')
    };
  }

  async getReviewResults() {
    const resultKeys = await this.redis.keys('coordination:review:result:*');
    const results = await Promise.all(
      resultKeys.map(async key => {
        const combo = key.split(':').pop();
        const value = await this.redis.get(key);
        return { combo, result: JSON.parse(value) };
      })
    );

    return {
      total: results.length,
      results,
      passRate: results.filter(r => r.result.passed).length / (results.length || 1)
    };
  }

  async getRetryLog() {
    const log = await this.redis.lrange(RedisKeys.retriesLog, 0, -1);
    return log.map(entry => JSON.parse(entry));
  }

  async getRetryCounts() {
    const counts = await this.redis.hgetall(RedisKeys.retriesCount);
    return Object.entries(counts).map(([combo, count]) => ({
      combo,
      attempts: parseInt(count, 10)
    }));
  }

  async getInjectedErrors() {
    const errors = await this.redis.hgetall(RedisKeys.errorsInjected);
    const parsed = Object.entries(errors).map(([combo, data]) => ({
      combo,
      ...JSON.parse(data)
    }));

    return {
      total: parsed.length,
      errors: parsed,
      byType: this.groupBy(parsed, 'errorType'),
      rate: parsed.length / 70 // Assuming 70 total combos
    };
  }

  async getActiveAgents() {
    const agents = await this.redis.hgetall(RedisKeys.activeAgents);
    const parsed = Object.entries(agents).map(([id, data]) => ({
      id,
      ...JSON.parse(data)
    }));

    return {
      total: parsed.length,
      agents: parsed,
      byStatus: this.groupBy(parsed, 'status'),
      byCoordinator: this.groupBy(parsed, 'coordinator')
    };
  }

  async generateSummary() {
    const [
      timelineCount,
      conflictCount,
      claimCount,
      coordinatorCount,
      agentCount,
      reviewCount,
      retryCount,
      errorCount
    ] = await Promise.all([
      this.redis.llen(RedisKeys.timeline),
      this.redis.llen(RedisKeys.conflicts),
      this.redis.keys('coordination:claims:claimed:*').then(k => k.length),
      this.redis.keys('coordination:coordinator:*').then(k => new Set(k.map(key => key.split(':')[2])).size),
      this.redis.hlen(RedisKeys.activeAgents),
      this.redis.keys('coordination:review:result:*').then(k => k.length),
      this.redis.llen(RedisKeys.retriesLog),
      this.redis.hlen(RedisKeys.errorsInjected)
    ]);

    return {
      timeline: {
        totalEvents: timelineCount
      },
      conflicts: {
        total: conflictCount
      },
      claims: {
        total: claimCount
      },
      coordinators: {
        count: coordinatorCount
      },
      agents: {
        total: agentCount
      },
      reviews: {
        completed: reviewCount
      },
      retries: {
        total: retryCount
      },
      errors: {
        injected: errorCount
      }
    };
  }

  async validateLayer1(expectedCombos = 70) {
    const metrics = await this.collectAll();

    const checks = {
      totalAgents: {
        value: metrics.agents.total,
        expected: 72, // 2 coordinators × 35 agents + 2 coordinators
        passed: metrics.agents.total >= 70 && metrics.agents.total <= 74
      },
      uniqueFiles: {
        value: metrics.claims.total,
        expected: expectedCombos,
        passed: metrics.claims.total === expectedCombos
      },
      noOverlaps: {
        value: metrics.conflicts.total,
        expected: 0,
        passed: true // Check uniqueness
      },
      coordinationMessages: {
        value: metrics.timeline.total,
        expected: expectedCombos * 2, // claim + completion
        passed: metrics.timeline.total >= expectedCombos
      },
      balancedDistribution: {
        passed: this.checkDistribution(metrics.coordinators.coordinators, 35, 5)
      }
    };

    // Check overlaps
    const coordinatorClaims = new Map();
    for (const claim of metrics.claims.claims) {
      const coord = claim.claim.coordinatorId;
      if (!coordinatorClaims.has(coord)) {
        coordinatorClaims.set(coord, new Set());
      }
      coordinatorClaims.get(coord).add(claim.combo);
    }

    // Check for duplicates
    const allCombos = metrics.claims.claims.map(c => c.combo);
    const uniqueCombos = new Set(allCombos);
    checks.noOverlaps.passed = allCombos.length === uniqueCombos.size;

    return {
      passed: Object.values(checks).every(c => c.passed),
      checks,
      metrics
    };
  }

  async validateLayer2(expectedReviews = 70) {
    const metrics = await this.collectAll();

    const checks = {
      allReviewed: {
        value: metrics.review.results.total,
        expected: expectedReviews,
        passed: metrics.review.results.total === expectedReviews
      },
      reviewerCount: {
        value: metrics.review.reviewerPool.total,
        min: 3,
        max: 10,
        passed: metrics.review.reviewerPool.total >= 3 && metrics.review.reviewerPool.total <= 10
      },
      dynamicSpawning: {
        passed: this.checkDynamicBehavior(metrics)
      },
      passRate: {
        value: metrics.review.results.passRate,
        expected: 1.0,
        passed: metrics.review.results.passRate === 1.0
      }
    };

    return {
      passed: Object.values(checks).every(c => c.passed),
      checks,
      metrics
    };
  }

  async validateLayer3(expectedCombos = 70) {
    const metrics = await this.collectAll();

    const errorRate = metrics.errors.injected / expectedCombos;
    const retryStats = await this.calculateRetryStats(metrics.retries.counts);

    const checks = {
      errorInjection: {
        value: errorRate,
        expected: 0.5,
        tolerance: 0.1,
        passed: Math.abs(errorRate - 0.5) <= 0.1
      },
      errorDistribution: {
        passed: this.checkErrorDistribution(metrics.errors.byType)
      },
      retryCount: {
        value: retryStats.max,
        expected: '<= 10',
        passed: retryStats.max <= 10
      },
      avgRetries: {
        value: retryStats.avg,
        expected: '<= 4',
        passed: retryStats.avg <= 4
      },
      finalPassRate: {
        value: metrics.review.results.passRate,
        expected: 1.0,
        passed: metrics.review.results.passRate === 1.0
      }
    };

    return {
      passed: Object.values(checks).every(c => c.passed),
      checks,
      retryStats,
      metrics
    };
  }

  checkDistribution(coordinators, target, tolerance) {
    if (coordinators.length !== 2) return false;

    const claims = coordinators.map(c => c.claimed);
    const balanced = Math.abs(claims[0] - claims[1]) <= tolerance;
    const total = claims[0] + claims[1];

    return balanced && total === target * 2;
  }

  checkDynamicBehavior(metrics) {
    const reviewers = metrics.review.reviewerPool.reviewers;
    if (reviewers.length === 0) return false;

    // Check if any reviewers were spawned dynamically (after startup)
    const spawnTimes = reviewers.map(r => r.spawnedAt);
    const minSpawn = Math.min(...spawnTimes);
    const maxSpawn = Math.max(...spawnTimes);

    // Dynamic spawning: span > 5 seconds
    return (maxSpawn - minSpawn) > 5000;
  }

  checkErrorDistribution(byType) {
    // Check if error distribution roughly matches expected probabilities
    const total = Object.values(byType).reduce((sum, count) => sum + count, 0);
    if (total === 0) return false;

    const actual = {
      SyntaxError: (byType.SyntaxError || 0) / total,
      LogicError: (byType.LogicError || 0) / total,
      TranslationError: (byType.TranslationError || 0) / total,
      MixedError: (byType.MixedError || 0) / total
    };

    // Allow 15% tolerance
    const tolerance = 0.15;
    return (
      Math.abs(actual.SyntaxError - 0.35) <= tolerance &&
      Math.abs(actual.LogicError - 0.35) <= tolerance &&
      Math.abs(actual.TranslationError - 0.20) <= tolerance &&
      Math.abs(actual.MixedError - 0.10) <= tolerance
    );
  }

  calculateRetryStats(retryCounts) {
    if (retryCounts.length === 0) {
      return { max: 0, avg: 0, total: 0 };
    }

    const attempts = retryCounts.map(c => c.attempts);
    return {
      max: Math.max(...attempts),
      avg: attempts.reduce((sum, a) => sum + a, 0) / attempts.length,
      total: attempts.reduce((sum, a) => sum + a, 0)
    };
  }

  groupBy(items, key) {
    return items.reduce((groups, item) => {
      const value = item[key];
      if (!groups[value]) {
        groups[value] = [];
      }
      groups[value].push(item);
      return groups;
    }, {});
  }

  async exportMetrics(filepath) {
    const metrics = await this.collectAll();
    const fs = await import('fs/promises');
    await fs.writeFile(filepath, JSON.stringify(metrics, null, 2));
    console.log(`Metrics exported to ${filepath}`);
  }
}
