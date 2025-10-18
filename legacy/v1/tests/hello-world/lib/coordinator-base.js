/**
 * Base Coordinator Class
 * Foundation for all coordinator types with Redis pub/sub coordination
 */

import { MessageBuilder, MessageTypes, Channels, RedisKeys, TimelineLogger, ConflictLogger } from './message-protocol.js';

export class CoordinatorBase {
  constructor(id, redis, options = {}) {
    this.id = id;
    this.redis = redis;
    this.options = {
      claimConflictWindowMs: 100,
      heartbeatIntervalMs: 5000,
      maxRetries: 10,
      ...options
    };

    this.status = 'init';
    this.claimedCombos = new Set();
    this.completedCombos = new Set();
    this.activeAgents = new Map();
    this.messageHandlers = new Map();

    this.timelineLogger = new TimelineLogger(redis);
    this.conflictLogger = new ConflictLogger(redis);

    this.setupMessageHandlers();
  }

  setupMessageHandlers() {
    // Default message handlers - can be overridden
    this.messageHandlers.set(MessageTypes.CLAIM_ATTEMPT, this.handleClaimAttempt.bind(this));
    this.messageHandlers.set(MessageTypes.CLAIM_SUCCESS, this.handleClaimSuccess.bind(this));
    this.messageHandlers.set(MessageTypes.CLAIM_CONFLICT, this.handleClaimConflict.bind(this));
    this.messageHandlers.set(MessageTypes.WORK_COMPLETE, this.handleWorkComplete.bind(this));
    this.messageHandlers.set(MessageTypes.HEARTBEAT, this.handleHeartbeat.bind(this));
  }

  async startup() {
    console.log(`[${this.id}] Starting up...`);
    this.status = 'starting';

    // Initialize coordinator state in Redis
    await this.redis.hset(RedisKeys.coordinatorState(this.id), 'status', 'starting');
    await this.redis.hset(RedisKeys.coordinatorState(this.id), 'agentCount', 0);
    await this.redis.hset(RedisKeys.coordinatorState(this.id), 'lastHeartbeat', Date.now());

    // Subscribe to coordination channels
    await this.redis.subscribe(Channels.CLAIMS, this.handleMessage.bind(this));
    await this.redis.subscribe(Channels.MESSAGES(this.id), this.handleMessage.bind(this));

    // Publish startup message
    await this.redis.publish(Channels.CLAIMS, MessageBuilder.coordinatorStartup(this.id, {
      type: this.constructor.name,
      capabilities: this.getCapabilities()
    }));

    // Start heartbeat
    this.startHeartbeat();

    this.status = 'active';
    await this.redis.hset(RedisKeys.coordinatorState(this.id), 'status', 'active');

    console.log(`[${this.id}] Started successfully`);
  }

  async shutdown() {
    console.log(`[${this.id}] Shutting down...`);
    this.status = 'shutdown';

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Publish shutdown message
    await this.redis.publish(Channels.CLAIMS, MessageBuilder.coordinatorShutdown(this.id, {
      claimed: this.claimedCombos.size,
      completed: this.completedCombos.size,
      agents: this.activeAgents.size
    }));

    // Update state
    await this.redis.hset(RedisKeys.coordinatorState(this.id), 'status', 'shutdown');

    console.log(`[${this.id}] Shutdown complete`);
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      await this.redis.publish(Channels.HEARTBEAT, MessageBuilder.heartbeat(this.id, this.status));
      await this.redis.hset(RedisKeys.coordinatorState(this.id), 'lastHeartbeat', Date.now());
    }, this.options.heartbeatIntervalMs);
  }

  async handleMessage(message) {
    // Ignore our own messages
    if (message.coordinator === this.id || message.coordinatorId === this.id) {
      return;
    }

    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      await handler(message);
    }
  }

  async handleClaimAttempt(message) {
    // Log other coordinator's claim attempt
    console.log(`[${this.id}] Observed claim attempt: ${message.coordinator} -> ${message.combo}`);
  }

  async handleClaimSuccess(message) {
    // Log other coordinator's successful claim
    console.log(`[${this.id}] Observed claim success: ${message.coordinator} -> ${message.combo}`);
  }

  async handleClaimConflict(message) {
    // Log conflict resolution
    console.log(`[${this.id}] Observed conflict: ${message.coordinator} vs ${message.conflictWith} for ${message.combo}`);
  }

  async handleWorkComplete(message) {
    // Log work completion
    console.log(`[${this.id}] Observed work complete: ${message.coordinator} -> ${message.combo}`);
  }

  async handleHeartbeat(message) {
    // Track peer coordinators
  }

  async attemptClaim(combo) {
    const timestamp = Date.now();

    console.log(`[${this.id}] Attempting to claim: ${combo}`);

    // Publish claim attempt
    await this.redis.publish(Channels.CLAIMS, MessageBuilder.claimAttempt(this.id, combo, timestamp));

    // Log attempt
    await this.timelineLogger.logClaimAttempt(this.id, combo);

    // Wait for conflict window
    await this.sleep(this.options.claimConflictWindowMs);

    // Check for existing claim
    const existingClaimStr = await this.redis.get(RedisKeys.claim(combo));

    if (!existingClaimStr) {
      // No conflict - claim success
      return await this.completeClaim(combo, timestamp);
    }

    const existingClaim = JSON.parse(existingClaimStr);

    // Conflict resolution: earlier timestamp wins
    if (existingClaim.timestamp < timestamp) {
      // We lose - withdraw
      console.log(`[${this.id}] Claim conflict (lost): ${combo} - existing claim by ${existingClaim.coordinatorId}`);

      await this.redis.publish(Channels.CLAIMS, MessageBuilder.claimConflict(
        this.id,
        combo,
        existingClaim.coordinatorId,
        'withdraw'
      ));

      await this.timelineLogger.logClaimConflict(this.id, combo, existingClaim.coordinatorId);

      await this.conflictLogger.log(
        combo,
        [this.id, existingClaim.coordinatorId],
        existingClaim.coordinatorId,
        'earlier_timestamp'
      );

      return false;
    } else {
      // We win (shouldn't happen with proper conflict window)
      console.log(`[${this.id}] Claim conflict (won): ${combo} - overriding claim by ${existingClaim.coordinatorId}`);
      return await this.completeClaim(combo, timestamp);
    }
  }

  async completeClaim(combo, timestamp) {
    const agentId = `agent-${this.id}-${combo}`;

    // Set claim in Redis
    await this.redis.setex(RedisKeys.claim(combo), 300, JSON.stringify({
      coordinatorId: this.id,
      timestamp,
      agentId,
      status: 'claimed'
    }));

    // Update local state
    this.claimedCombos.add(combo);
    await this.redis.sadd(RedisKeys.coordinatorClaimed(this.id), combo);

    // Publish success
    await this.redis.publish(Channels.CLAIMS, MessageBuilder.claimSuccess(this.id, combo, agentId, Date.now()));

    // Log success
    await this.timelineLogger.logClaimSuccess(this.id, combo, agentId);

    console.log(`[${this.id}] Claim success: ${combo} -> ${agentId}`);

    return true;
  }

  async spawnAgent(combo) {
    const agentId = `agent-${this.id}-${combo}`;
    const [source, target] = combo.split('-');

    const agent = {
      id: agentId,
      coordinator: this.id,
      task: `Translate "Hello, World!" from ${source} to ${target}`,
      combo,
      spawnedAt: Date.now(),
      status: 'active'
    };

    this.activeAgents.set(agentId, agent);

    // Update Redis
    await this.redis.hset(RedisKeys.activeAgents, agentId, JSON.stringify(agent));
    await this.redis.hincrby(RedisKeys.coordinatorState(this.id), 'agentCount', 1);

    // Log spawn
    await this.timelineLogger.logAgentSpawned(this.id, combo, agentId);

    console.log(`[${this.id}] Spawned agent: ${agentId}`);

    return agent;
  }

  async completeWork(combo, agentId, success = true) {
    // Update claim status
    const claimStr = await this.redis.get(RedisKeys.claim(combo));
    if (claimStr) {
      const claim = JSON.parse(claimStr);
      claim.status = success ? 'completed' : 'failed';
      await this.redis.setex(RedisKeys.claim(combo), 300, JSON.stringify(claim));
    }

    // Update local state
    if (success) {
      this.completedCombos.add(combo);
      await this.redis.sadd(RedisKeys.coordinatorCompleted(this.id), combo);
    }

    // Update agent status
    const agent = this.activeAgents.get(agentId);
    if (agent) {
      agent.status = success ? 'completed' : 'failed';
      agent.completedAt = Date.now();
      await this.redis.hset(RedisKeys.activeAgents, agentId, JSON.stringify(agent));
    }

    // Publish completion
    await this.redis.publish(Channels.CLAIMS, MessageBuilder.workComplete(this.id, combo, agentId, success));

    // Log completion
    await this.timelineLogger.logWorkComplete(this.id, combo, agentId, success);

    console.log(`[${this.id}] Work complete: ${combo} (success: ${success})`);

    return success;
  }

  async releaseClaimForRetry(combo, reason) {
    console.log(`[${this.id}] Releasing claim for retry: ${combo} (reason: ${reason})`);

    // Delete claim
    await this.redis.del(RedisKeys.claim(combo));

    // Remove from claimed set
    this.claimedCombos.delete(combo);
    await this.redis.srem(RedisKeys.coordinatorClaimed(this.id), combo);

    // Publish release
    await this.redis.publish(Channels.CLAIMS, MessageBuilder.claimRelease(this.id, combo, reason));

    console.log(`[${this.id}] Released claim: ${combo}`);
  }

  async getStats() {
    const state = await this.redis.hgetall(RedisKeys.coordinatorState(this.id));
    const claimed = await this.redis.smembers(RedisKeys.coordinatorClaimed(this.id));
    const completed = await this.redis.smembers(RedisKeys.coordinatorCompleted(this.id));

    return {
      id: this.id,
      status: this.status,
      claimed: claimed.length,
      completed: completed.length,
      activeAgents: this.activeAgents.size,
      claimedCombos: Array.from(this.claimedCombos),
      completedCombos: Array.from(this.completedCombos),
      redisState: state
    };
  }

  getCapabilities() {
    return {
      canClaim: true,
      canSpawn: true,
      canReview: false
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class ImplementerCoordinator extends CoordinatorBase {
  constructor(id, redis, combos, options = {}) {
    super(id, redis, options);
    this.combos = combos;
    this.assignedCombos = combos.slice();
  }

  async run() {
    await this.startup();

    console.log(`[${this.id}] Processing ${this.assignedCombos.length} combos`);

    // Process all assigned combos
    for (const combo of this.assignedCombos) {
      const claimed = await this.attemptClaim(combo);

      if (claimed) {
        const agent = await this.spawnAgent(combo);
        await this.executeWork(agent);
      }
    }

    // Wait for all work to complete
    await this.waitForCompletion();

    this.status = 'idle';
    await this.redis.hset(RedisKeys.coordinatorState(this.id), 'status', 'idle');
    console.log(`[${this.id}] All work complete, now idle`);
  }

  async executeWork(agent) {
    // Simulate work (translation task)
    const workDuration = 100 + Math.random() * 200; // 100-300ms
    await this.sleep(workDuration);

    // Complete work
    await this.completeWork(agent.combo, agent.id, true);
  }

  async waitForCompletion() {
    // Wait for all active agents to complete
    while (this.activeAgents.size > 0) {
      const activeCount = Array.from(this.activeAgents.values())
        .filter(a => a.status === 'active').length;

      if (activeCount === 0) {
        break;
      }

      await this.sleep(100);
    }
  }
}

export class ReviewCoordinator extends CoordinatorBase {
  constructor(id, redis, options = {}) {
    super(id, redis, options);
    this.minReviewers = options.minReviewers || 3;
    this.maxReviewers = options.maxReviewers || 10;
    this.queueThreshold = options.queueThreshold || 5;
    this.activeReviewers = [];
    this.running = false;
  }

  getCapabilities() {
    return {
      canClaim: false,
      canSpawn: false,
      canReview: true
    };
  }

  async run() {
    await this.startup();
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
      const queueDepth = await this.redis.llen(RedisKeys.reviewQueue);
      const activeCount = this.activeReviewers.filter(r => r.status === 'active').length;

      // Spawn logic
      if (queueDepth > this.queueThreshold && activeCount < this.maxReviewers) {
        console.log(`[${this.id}] Queue depth ${queueDepth} > threshold ${this.queueThreshold}, spawning reviewer`);
        await this.spawnReviewer();
      }

      // Despawn logic (queue low + idle reviewers + above minimum)
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
    await this.redis.hset(RedisKeys.reviewerPool, reviewerId, JSON.stringify(reviewer));

    console.log(`[${this.id}] Spawned reviewer: ${reviewerId}`);

    // Start review loop
    this.reviewLoop(reviewer);

    return reviewer;
  }

  async reviewLoop(reviewer) {
    while (reviewer.status === 'active' && this.running) {
      const itemStr = await this.redis.lpop(RedisKeys.reviewQueue);

      if (!itemStr) {
        await this.sleep(1000);
        continue;
      }

      const work = JSON.parse(itemStr);
      reviewer.assignedCombo = work.combo;
      await this.redis.hset(RedisKeys.reviewerPool, reviewer.id, JSON.stringify(reviewer));

      // Simulate review
      const reviewDuration = 500 + Math.random() * 1000; // 500-1500ms
      await this.sleep(reviewDuration);

      // Store result
      const result = {
        combo: work.combo,
        reviewerId: reviewer.id,
        passed: true,
        issues: [],
        reviewedAt: Date.now()
      };

      await this.redis.setex(RedisKeys.reviewResult(work.combo), 300, JSON.stringify(result));

      // Log review
      await this.timelineLogger.logReviewComplete(reviewer.id, work.combo, true);

      console.log(`[${this.id}] Reviewer ${reviewer.id} completed review of ${work.combo}`);

      reviewer.reviewCount++;
      reviewer.assignedCombo = null;
      reviewer.lastReviewAt = Date.now();
      await this.redis.hset(RedisKeys.reviewerPool, reviewer.id, JSON.stringify(reviewer));
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
      await this.redis.hset(RedisKeys.reviewerPool, idleReviewer.id, JSON.stringify(idleReviewer));
    }
  }

  async stop() {
    this.running = false;
    console.log(`[${this.id}] Stopping review coordination`);

    // Terminate all reviewers
    for (const reviewer of this.activeReviewers) {
      reviewer.status = 'terminated';
      await this.redis.hset(RedisKeys.reviewerPool, reviewer.id, JSON.stringify(reviewer));
    }

    await this.shutdown();
  }
}
