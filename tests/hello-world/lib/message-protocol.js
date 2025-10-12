/**
 * Message Protocol Definitions
 * Standardized message formats for coordinator communication
 */

export const MessageTypes = {
  // Claim coordination
  CLAIM_ATTEMPT: 'claim_attempt',
  CLAIM_SUCCESS: 'claim_success',
  CLAIM_CONFLICT: 'claim_conflict',
  CLAIM_RELEASE: 'claim_release',

  // Work lifecycle
  WORK_START: 'work_start',
  WORK_COMPLETE: 'work_complete',
  WORK_FAILED: 'work_failed',

  // Review coordination
  REVIEW_SUBMITTED: 'review_submitted',
  REVIEW_ASSIGNED: 'review_assigned',
  REVIEW_COMPLETE: 'review_complete',

  // Retry coordination
  RETRY_REQUIRED: 'retry_required',
  RETRY_STARTED: 'retry_started',
  FRESH_AGENT_SPAWNED: 'fresh_agent_spawned',

  // Coordinator lifecycle
  COORDINATOR_STARTUP: 'coordinator_startup',
  COORDINATOR_IDLE: 'coordinator_idle',
  COORDINATOR_SHUTDOWN: 'coordinator_shutdown',
  HEARTBEAT: 'heartbeat'
};

export const Channels = {
  CLAIMS: 'coordination:claims:channel',
  HEARTBEAT: 'coordination:heartbeat',
  MESSAGES: (coordinatorId) => `coordination:messages:${coordinatorId}`
};

export const RedisKeys = {
  // Claims
  claim: (combo) => `coordination:claims:claimed:${combo}`,

  // Timeline and audit
  timeline: 'coordination:timeline',
  conflicts: 'coordination:conflicts:log',

  // Coordinator state
  coordinatorState: (id) => `coordination:coordinator:${id}`,
  coordinatorClaimed: (id) => `coordination:coordinator:${id}:claimed`,
  coordinatorCompleted: (id) => `coordination:coordinator:${id}:completed`,

  // Review coordination
  reviewQueue: 'coordination:review:queue',
  reviewerPool: 'coordination:reviewers:pool',
  reviewResult: (combo) => `coordination:review:result:${combo}`,

  // Error and retry
  errorsInjected: 'coordination:errors:injected',
  retriesCount: 'coordination:retries:count',
  retriesLog: 'coordination:retries:log',

  // Active agents
  activeAgents: 'coordination:agents:active'
};

export class MessageBuilder {
  static claimAttempt(coordinator, combo, timestamp = Date.now()) {
    return {
      type: MessageTypes.CLAIM_ATTEMPT,
      coordinator,
      combo,
      timestamp,
      priority: 1
    };
  }

  static claimSuccess(coordinator, combo, agentId, timestamp = Date.now()) {
    return {
      type: MessageTypes.CLAIM_SUCCESS,
      coordinator,
      combo,
      agentId,
      timestamp
    };
  }

  static claimConflict(coordinator, combo, conflictWith, resolution = 'withdraw', timestamp = Date.now()) {
    return {
      type: MessageTypes.CLAIM_CONFLICT,
      coordinator,
      combo,
      conflictWith,
      resolution,
      timestamp
    };
  }

  static claimRelease(coordinator, combo, reason, timestamp = Date.now()) {
    return {
      type: MessageTypes.CLAIM_RELEASE,
      coordinator,
      combo,
      reason,
      timestamp
    };
  }

  static workStart(coordinator, combo, agentId, timestamp = Date.now()) {
    return {
      type: MessageTypes.WORK_START,
      coordinator,
      combo,
      agentId,
      timestamp
    };
  }

  static workComplete(coordinator, combo, agentId, success = true, timestamp = Date.now()) {
    return {
      type: MessageTypes.WORK_COMPLETE,
      coordinator,
      combo,
      agentId,
      success,
      timestamp
    };
  }

  static workFailed(coordinator, combo, agentId, error, timestamp = Date.now()) {
    return {
      type: MessageTypes.WORK_FAILED,
      coordinator,
      combo,
      agentId,
      error,
      timestamp
    };
  }

  static reviewSubmitted(coordinator, combo, agentId, timestamp = Date.now()) {
    return {
      type: MessageTypes.REVIEW_SUBMITTED,
      coordinator,
      combo,
      agentId,
      timestamp
    };
  }

  static reviewAssigned(reviewerId, combo, timestamp = Date.now()) {
    return {
      type: MessageTypes.REVIEW_ASSIGNED,
      reviewerId,
      combo,
      timestamp
    };
  }

  static reviewComplete(reviewerId, combo, passed, issues = [], timestamp = Date.now()) {
    return {
      type: MessageTypes.REVIEW_COMPLETE,
      reviewerId,
      combo,
      passed,
      issues,
      timestamp
    };
  }

  static retryRequired(combo, originalAgent, attempt, errorType, timestamp = Date.now()) {
    return {
      type: MessageTypes.RETRY_REQUIRED,
      combo,
      originalAgent,
      attempt,
      errorType,
      timestamp
    };
  }

  static retryStarted(coordinator, combo, freshAgentId, attempt, timestamp = Date.now()) {
    return {
      type: MessageTypes.RETRY_STARTED,
      coordinator,
      combo,
      freshAgentId,
      attempt,
      timestamp
    };
  }

  static freshAgentSpawned(coordinator, combo, agentId, attempt, timestamp = Date.now()) {
    return {
      type: MessageTypes.FRESH_AGENT_SPAWNED,
      coordinator,
      combo,
      agentId,
      attempt,
      timestamp
    };
  }

  static coordinatorStartup(coordinatorId, capabilities, timestamp = Date.now()) {
    return {
      type: MessageTypes.COORDINATOR_STARTUP,
      coordinatorId,
      capabilities,
      timestamp
    };
  }

  static coordinatorIdle(coordinatorId, timestamp = Date.now()) {
    return {
      type: MessageTypes.COORDINATOR_IDLE,
      coordinatorId,
      timestamp
    };
  }

  static coordinatorShutdown(coordinatorId, stats, timestamp = Date.now()) {
    return {
      type: MessageTypes.COORDINATOR_SHUTDOWN,
      coordinatorId,
      stats,
      timestamp
    };
  }

  static heartbeat(coordinatorId, status, timestamp = Date.now()) {
    return {
      type: MessageTypes.HEARTBEAT,
      coordinatorId,
      status,
      timestamp
    };
  }
}

export class TimelineLogger {
  constructor(redis) {
    this.redis = redis;
  }

  async log(action, metadata = {}) {
    const entry = {
      timestamp: Date.now(),
      action,
      ...metadata
    };

    await this.redis.rpush(RedisKeys.timeline, JSON.stringify(entry));
    return entry;
  }

  async logClaimAttempt(coordinator, combo) {
    return await this.log('claim_attempt', { coordinator, combo });
  }

  async logClaimSuccess(coordinator, combo, agentId) {
    return await this.log('claim_success', { coordinator, combo, agentId });
  }

  async logClaimConflict(coordinator, combo, conflictWith) {
    return await this.log('claim_conflict', { coordinator, combo, conflictWith });
  }

  async logAgentSpawned(coordinator, combo, agentId) {
    return await this.log('agent_spawned', { coordinator, combo, agentId });
  }

  async logWorkComplete(coordinator, combo, agentId, success) {
    return await this.log('work_complete', { coordinator, combo, agentId, success });
  }

  async logFreshAgentSpawned(coordinator, combo, agentId, attempt) {
    return await this.log('fresh_agent_spawned', { coordinator, combo, agentId, attempt });
  }

  async logReviewSubmitted(coordinator, combo) {
    return await this.log('review_submitted', { coordinator, combo });
  }

  async logReviewComplete(reviewerId, combo, passed) {
    return await this.log('review_complete', { reviewerId, combo, passed });
  }

  async getRecentEntries(count = 100) {
    const entries = await this.redis.lrange(RedisKeys.timeline, -count, -1);
    return entries.map(e => JSON.parse(e));
  }

  async getEntriesByAction(action) {
    const all = await this.redis.lrange(RedisKeys.timeline, 0, -1);
    const entries = all.map(e => JSON.parse(e));
    return entries.filter(e => e.action === action);
  }

  async getEntriesByCoordinator(coordinatorId) {
    const all = await this.redis.lrange(RedisKeys.timeline, 0, -1);
    const entries = all.map(e => JSON.parse(e));
    return entries.filter(e => e.coordinator === coordinatorId);
  }
}

export class ConflictLogger {
  constructor(redis) {
    this.redis = redis;
  }

  async log(combo, coordinators, winner, resolution) {
    const entry = {
      timestamp: Date.now(),
      combo,
      coordinators,
      winner,
      resolution
    };

    await this.redis.rpush(RedisKeys.conflicts, JSON.stringify(entry));
    return entry;
  }

  async getAll() {
    const conflicts = await this.redis.lrange(RedisKeys.conflicts, 0, -1);
    return conflicts.map(c => JSON.parse(c));
  }

  async getByCombo(combo) {
    const all = await this.getAll();
    return all.filter(c => c.combo === combo);
  }

  async getCount() {
    return await this.redis.llen(RedisKeys.conflicts);
  }
}
