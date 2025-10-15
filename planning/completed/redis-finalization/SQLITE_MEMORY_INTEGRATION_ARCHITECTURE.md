# SQLite Memory Integration Architecture

**Document Version:** 1.0.0
**Date:** 2025-10-10
**Epic:** production-blocking-coordination
**Phase:** Phase 1 Foundation Infrastructure & Event Bus Architecture
**Status:** DESIGN SPECIFICATION

---

## Executive Summary

### Purpose

This document defines the comprehensive integration architecture for SQLite memory persistence within the Claude Flow Novice blocking coordination system. SQLite serves as the **persistent memory layer** for cross-session data recovery, audit trails, and long-term state preservation, while Redis maintains its role as the **active coordination layer** for real-time pub/sub messaging and ephemeral state.

### Problem Statement

The current blocking coordination system uses Redis exclusively for both active coordination and state management. Redis with TTL provides excellent performance for real-time operations but has three critical limitations:

1. **Session Recovery**: VS Code crashes or Redis restarts lose all coordination history, requiring manual reconstruction of phase context
2. **Compliance Requirements**: No persistent audit trail for Loop 2/4 decisions (validators consensus ≥0.90, Product Owner GOAP decisions)
3. **Knowledge Transfer**: Loop 3 implementation results (confidence scores, file changes) are lost after TTL expiration, breaking Loop 2 validators' ability to review historical context

### Strategic Solution

Implement a **dual-layer memory architecture** where:

- **Redis**: Continues handling active coordination (pub/sub, heartbeats, signal ACKs, ephemeral state) with 1-hour TTL
- **SQLite**: Provides persistent storage for CFN Loop results, consensus data, agent confidence scores, and audit trails with 5-level ACL security

This separation follows the **Command Query Responsibility Segregation (CQRS)** pattern where writes go to both layers, but reads prioritize Redis for hot data and SQLite for historical/compliance queries.

---

## Redis vs SQLite Decision Matrix

| **Data Category** | **Storage Layer** | **TTL** | **ACL Level** | **Rationale** |
|-------------------|-------------------|---------|---------------|---------------|
| **Active Coordination** |
| Pub/Sub messages | Redis only | 10 minutes | N/A | Real-time, no persistence needed |
| Heartbeat records | Redis only | 5 minutes | N/A | Health monitoring, ephemeral |
| Signal ACKs | Redis only | 1 hour | N/A | Coordination protocol, short-lived |
| Idempotency keys | Redis only | 1 hour | N/A | Deduplication, time-bound |
| **CFN Loop Results** |
| Loop 3 confidence scores | Both | Redis: 1h, SQLite: 30d | Private (1) | Persistent for retry decisions |
| Loop 3 file changes | Both | Redis: 1h, SQLite: 30d | Team (2) | Audit trail, compliance |
| Loop 2 validator votes | SQLite only | 90 days | Swarm (3) | Compliance, immutable record |
| Loop 2 consensus data | Both | Redis: 1h, SQLite: 90d | Swarm (3) | Decision history, phase context |
| Loop 4 PO decisions | SQLite only | 365 days | Project (4) | Strategic decisions, long-term |
| **Agent State** |
| Agent confidence (current) | Both | Redis: 1h, SQLite: 30d | Private (1) | Performance tracking |
| Agent metrics | SQLite only | 90 days | Team (2) | Performance analysis |
| Agent capabilities | SQLite only | N/A | Swarm (3) | Registry, static data |
| **Swarm Coordination** |
| Swarm state (active) | Redis only | 1 hour | N/A | Coordination, ephemeral |
| Swarm results | SQLite only | 90 days | Project (4) | Phase completion records |
| Phase transitions | SQLite only | 365 days | System (5) | Orchestration history |
| **Audit & Compliance** |
| Security findings | SQLite only | 365 days | System (5) | Compliance, immutable |
| Code review results | SQLite only | 90 days | Team (2) | Quality assurance |
| Consensus violations | SQLite only | 365 days | System (5) | Governance, escalation |
| Git commit metadata | SQLite only | 365 days | Project (4) | Traceability |

### Read Priority Strategy

```typescript
async getLoopResults(phaseId: string, loop: number): Promise<LoopResults> {
  // 1. Try Redis first (hot cache, <10ms latency)
  const redisKey = `cfn:phase:${phaseId}:loop${loop}:results`;
  const cached = await redis.get(redisKey);

  if (cached) {
    return JSON.parse(cached);
  }

  // 2. Fallback to SQLite (warm storage, <50ms latency)
  const results = await sqlite.query(
    'SELECT * FROM memory WHERE key = ? AND namespace = ?',
    [`phase:${phaseId}:loop${loop}`, 'cfn-loop']
  );

  if (results.length > 0) {
    // Warm Redis cache for next read
    await redis.setex(redisKey, 3600, JSON.stringify(results[0]));
    return results[0];
  }

  throw new Error(`No results found for phase ${phaseId} loop ${loop}`);
}
```

---

## Integration Architecture

### System Context Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Flow Novice System                     │
│                                                                   │
│  ┌────────────┐      ┌────────────┐      ┌────────────┐        │
│  │  CFN Loop  │      │  Blocking  │      │   Agent    │        │
│  │Orchestrator│◄────►│Coordination│◄────►│ Lifecycle  │        │
│  └─────┬──────┘      └─────┬──────┘      └─────┬──────┘        │
│        │                   │                   │                │
│        │ ┌─────────────────┴───────────────────┘                │
│        │ │                                                       │
│        ▼ ▼                                                       │
│  ┌─────────────────────────────────────────┐                    │
│  │      Dual-Layer Memory System           │                    │
│  │                                           │                    │
│  │  ┌────────────┐        ┌──────────────┐ │                    │
│  │  │   Redis    │◄──────►│    SQLite    │ │                    │
│  │  │ Coordinator│        │Memory Manager│ │                    │
│  │  └────────────┘        └──────────────┘ │                    │
│  │                                           │                    │
│  │  Active Coordination    Persistent State │                    │
│  │  • Pub/Sub (10K/sec)    • 12-Table Schema│                    │
│  │  • Heartbeats (<10ms)   • 5-Level ACL   │                    │
│  │  • Signal ACKs          • Encryption    │                    │
│  │  • Ephemeral State      • Audit Trail   │                    │
│  └─────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Component Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   CFN Loop Execution Flow                        │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐  1. Spawn   ┌──────────────┐  2. Store    ┌─────┐
│ Loop 3 Start │─────────────►│ Implementers │─────────────►│Redis│
└──────────────┘              └──────┬───────┘              └─────┘
                                     │ 3. Persist              │
                                     ▼                         ▼
                              ┌──────────────┐         ┌──────────┐
                              │    SQLite    │         │Redis Pub │
                              │  • Confidence│◄────────┤ Broadcast│
                              │  • Files     │         └──────────┘
                              │  • Metadata  │
                              └──────┬───────┘
                                     │ 4. Gate Check (≥0.75)
                                     ▼
┌──────────────┐  5. Validate ┌──────────────┐  6. Consensus
│ Loop 2 Start │◄─────────────┤   Validators │─────────────┐
└──────┬───────┘              └──────────────┘             │
       │ 7. Read Loop 3 Data                               │
       ▼                                                    ▼
┌──────────────┐                                    ┌──────────────┐
│    SQLite    │                                    │    SQLite    │
│  • Loop 3    │                                    │  • Votes     │
│    Results   │                                    │  • Consensus │
│  • Context   │                                    │  • Issues    │
└──────────────┘                                    └──────┬───────┘
                                                           │ 8. GOAP
                                                           ▼
                                                    ┌──────────────┐
                                                    │   Loop 4     │
                                                    │Product Owner │
                                                    │  • PROCEED   │
                                                    │  • DEFER     │
                                                    │  • ESCALATE  │
                                                    └──────────────┘
```

---

## Memory Persistence Patterns for CFN Loop

### Pattern 1: Loop 3 Implementation Results

**Storage Location:** Both Redis (hot) and SQLite (persistent)

**Redis Schema:**
```typescript
interface Loop3RedisState {
  key: `cfn:phase:${phaseId}:loop3:agent:${agentId}`;
  ttl: 3600; // 1 hour
  value: {
    agentId: string;
    confidence: number; // 0.0-1.0
    filesModified: string[];
    linesChanged: number;
    timestamp: number;
    iteration: number;
    status: 'in_progress' | 'completed' | 'blocked';
  };
}
```

**SQLite Schema:**
```sql
-- Uses existing memory table with enhanced metadata
INSERT INTO memory (
  id, key, value, namespace, type, swarm_id, agent_id,
  acl_level, metadata, created_at
) VALUES (
  'mem-' || hex(randomblob(16)),
  'cfn/phase-auth/loop3/agent-1/results',
  '{"confidence": 0.85, "files": ["auth.js"], "lines": 247}',
  'cfn-loop',
  'state',
  'phase-auth-swarm',
  'agent-1',
  1, -- Private: Only agent can read/write
  '{"loop": 3, "phase": "auth", "iteration": 1}',
  CURRENT_TIMESTAMP
);
```

**Write Pattern:**
```typescript
async storeLoop3Results(
  phaseId: string,
  agentId: string,
  results: AgentResults
): Promise<void> {
  // 1. Write to Redis first (fail fast if coordination issue)
  const redisKey = `cfn:phase:${phaseId}:loop3:agent:${agentId}`;
  await this.redis.setex(redisKey, 3600, JSON.stringify(results));

  // 2. Persist to SQLite asynchronously (don't block on disk I/O)
  setImmediate(async () => {
    try {
      await this.sqlite.memoryAdapter.set(
        `cfn/phase:${phaseId}/loop3/${agentId}/results`,
        results,
        {
          agentId,
          aclLevel: 1, // Private
          namespace: 'cfn-loop',
          metadata: { loop: 3, phase: phaseId, iteration: results.iteration }
        }
      );
    } catch (error) {
      this.logger.error('Failed to persist Loop 3 results to SQLite', {
        phaseId,
        agentId,
        error: error.message
      });
      // Don't throw - Redis write already succeeded
    }
  });

  // 3. Broadcast to event bus for real-time coordination
  await this.redis.publish(`cfn:loop3:complete:${phaseId}`, JSON.stringify({
    agentId,
    confidence: results.confidence,
    timestamp: Date.now()
  }));
}
```

### Pattern 2: Loop 2 Consensus Validation

**Storage Location:** SQLite only (immutable compliance record)

**SQLite Schema:**
```sql
-- Uses consensus table with validator votes
INSERT INTO consensus (
  id, type, target_id, target_type, swarm_id, phase, loop_number,
  threshold, current_score, status, total_participants, metadata
) VALUES (
  'consensus-' || hex(randomblob(16)),
  'validation',
  'phase-auth',
  'phase',
  'phase-auth-swarm',
  'auth',
  2, -- Loop 2
  0.90,
  0.92, -- Achieved consensus
  'achieved',
  2, -- reviewer-1, security-specialist-2
  '{"validators": [{"agent": "reviewer-1", "confidence": 0.88}, {"agent": "security-specialist-2", "confidence": 0.95}]}'
);

-- Store individual votes in audit_log for immutability
INSERT INTO audit_log (
  id, entity_id, entity_type, action, new_values, changed_by,
  swarm_id, acl_level, risk_level, created_at
) VALUES (
  'audit-' || hex(randomblob(16)),
  'consensus-abc123',
  'consensus',
  'validator_vote',
  '{"vote": "APPROVE", "confidence": 0.88, "issues": []}',
  'reviewer-1',
  'phase-auth-swarm',
  3, -- Swarm: All swarm agents can read
  'low',
  CURRENT_TIMESTAMP
);
```

**Write Pattern:**
```typescript
async recordLoop2Consensus(
  phaseId: string,
  validatorVotes: ValidatorVote[]
): Promise<ConsensusSummary> {
  // 1. Calculate consensus score
  const consensusScore = this.calculateWeightedConsensus(validatorVotes);
  const consensusThreshold = 0.90;
  const status = consensusScore >= consensusThreshold ? 'achieved' : 'failed';

  // 2. Store consensus record in SQLite (immutable)
  const consensusId = `consensus-${Date.now()}-${randomBytes(8).toString('hex')}`;
  await this.sqlite.query(`
    INSERT INTO consensus (
      id, type, target_id, target_type, swarm_id, phase, loop_number,
      threshold, current_score, status, total_participants, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    consensusId,
    'validation',
    phaseId,
    'phase',
    this.swarmId,
    phaseId,
    2,
    consensusThreshold,
    consensusScore,
    status,
    validatorVotes.length,
    JSON.stringify({ validators: validatorVotes, timestamp: Date.now() })
  ]);

  // 3. Store each vote as immutable audit log entry
  for (const vote of validatorVotes) {
    await this.sqlite.query(`
      INSERT INTO audit_log (
        id, entity_id, entity_type, action, new_values, changed_by,
        swarm_id, acl_level, risk_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `audit-${Date.now()}-${randomBytes(8).toString('hex')}`,
      consensusId,
      'consensus',
      'validator_vote',
      JSON.stringify(vote),
      vote.agentId,
      this.swarmId,
      3, // Swarm
      vote.issues.length > 0 ? 'medium' : 'low'
    ]);
  }

  // 4. Publish to Redis for real-time notification (ephemeral)
  await this.redis.publish(`cfn:loop2:consensus:${phaseId}`, JSON.stringify({
    consensusId,
    score: consensusScore,
    status,
    timestamp: Date.now()
  }));

  return { consensusId, score: consensusScore, status, votes: validatorVotes };
}
```

### Pattern 3: Loop 4 Product Owner Decision

**Storage Location:** SQLite only (strategic decision record)

**SQLite Schema:**
```sql
-- Store Product Owner GOAP decision in memory table
INSERT INTO memory (
  id, key, value, namespace, type, swarm_id,
  acl_level, metadata, created_at
) VALUES (
  'mem-' || hex(randomblob(16)),
  'cfn/phase-auth/loop4/decision',
  '{"decision": "DEFER", "confidence": 0.92, "backlog": ["rate-limiting", "token-refresh"]}',
  'cfn-loop',
  'artifact', -- Decision artifact
  'phase-auth-swarm',
  4, -- Project: All project agents can read
  '{"loop": 4, "phase": "auth", "decision_type": "GOAP", "authority": "product-owner"}',
  CURRENT_TIMESTAMP
);

-- Link decision to consensus in audit log
INSERT INTO audit_log (
  id, entity_id, entity_type, action, old_values, new_values,
  changed_by, swarm_id, acl_level, risk_level
) VALUES (
  'audit-' || hex(randomblob(16)),
  'phase-auth',
  'phase',
  'product_owner_decision',
  '{"status": "validation_complete"}',
  '{"decision": "DEFER", "status": "complete", "next_action": "auto_transition"}',
  'product-owner',
  'phase-auth-swarm',
  4, -- Project
  'low'
);
```

**Write Pattern:**
```typescript
async recordLoop4Decision(
  phaseId: string,
  decision: GOAPDecision
): Promise<void> {
  const timestamp = Date.now();

  // 1. Store decision as artifact in SQLite (permanent record)
  const memoryKey = `cfn/phase:${phaseId}/loop4/decision`;
  await this.sqlite.memoryAdapter.set(
    memoryKey,
    {
      decision: decision.action, // 'PROCEED' | 'DEFER' | 'ESCALATE'
      confidence: decision.confidence,
      backlog: decision.backlogItems || [],
      reasoning: decision.reasoning,
      timestamp
    },
    {
      agentId: 'product-owner',
      aclLevel: 4, // Project: Visible to entire project
      namespace: 'cfn-loop',
      metadata: {
        loop: 4,
        phase: phaseId,
        decisionType: 'GOAP',
        authority: 'product-owner'
      }
    }
  );

  // 2. Create audit trail entry (immutable decision record)
  await this.sqlite.query(`
    INSERT INTO audit_log (
      id, entity_id, entity_type, action, old_values, new_values,
      changed_by, swarm_id, acl_level, risk_level, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    `audit-${timestamp}-${randomBytes(8).toString('hex')}`,
    phaseId,
    'phase',
    'product_owner_decision',
    JSON.stringify({ status: 'validation_complete' }),
    JSON.stringify({ decision: decision.action, status: 'complete' }),
    'product-owner',
    this.swarmId,
    4, // Project
    decision.action === 'ESCALATE' ? 'high' : 'low',
    JSON.stringify({ consensusScore: decision.consensusScore })
  ]);

  // 3. Publish to Redis for immediate phase transition (ephemeral)
  await this.redis.publish(`cfn:loop4:decision:${phaseId}`, JSON.stringify({
    decision: decision.action,
    timestamp,
    nextPhase: decision.nextPhase
  }));

  // 4. If DEFER, create backlog items
  if (decision.action === 'DEFER' && decision.backlogItems) {
    for (const item of decision.backlogItems) {
      await this.createBacklogItem(phaseId, item);
    }
  }
}
```

---

## Agent Lifecycle Integration

### All Agent Types Must Use SQLite for Audit Trail

**Critical Requirement:** ALL agents (coders, testers, reviewers, validators, coordinators) MUST write audit records to SQLite for compliance tracking.

### Agent Spawn Event

```typescript
async onAgentSpawn(agentId: string, agentType: string, swarmId: string): Promise<void> {
  // 1. Register in SQLite agents table
  await this.sqlite.query(`
    INSERT INTO agents (
      id, name, type, status, swarm_id, capabilities, acl_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    agentId,
    `${agentType}-${Date.now()}`,
    agentType,
    'active',
    swarmId,
    JSON.stringify(this.getAgentCapabilities(agentType)),
    2 // Team: Agents in same team can see each other
  ]);

  // 2. Create audit log entry
  await this.sqlite.query(`
    INSERT INTO audit_log (
      id, entity_id, entity_type, action, new_values, changed_by, swarm_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    `audit-${Date.now()}-${randomBytes(8).toString('hex')}`,
    agentId,
    'agent',
    'agent_spawned',
    JSON.stringify({ type: agentType, swarmId, timestamp: Date.now() }),
    'system',
    swarmId
  ]);

  // 3. Register in Redis for active coordination (ephemeral)
  await this.redis.setex(`agent:${agentId}:state`, 3600, JSON.stringify({
    status: 'active',
    type: agentType,
    swarmId,
    spawnedAt: Date.now()
  }));
}
```

### Agent Confidence Update (Loop 3)

```typescript
async updateAgentConfidence(
  agentId: string,
  phaseId: string,
  confidence: number,
  files: string[]
): Promise<void> {
  // 1. Write to Redis (hot cache)
  await this.redis.setex(
    `cfn:phase:${phaseId}:agent:${agentId}:confidence`,
    3600,
    JSON.stringify({ confidence, files, timestamp: Date.now() })
  );

  // 2. Persist to SQLite memory table
  await this.sqlite.memoryAdapter.set(
    `cfn/phase:${phaseId}/agent:${agentId}/confidence`,
    { confidence, files, timestamp: Date.now() },
    {
      agentId,
      aclLevel: 1, // Private: Only this agent
      namespace: 'cfn-loop',
      metadata: { loop: 3, phase: phaseId }
    }
  );

  // 3. Update agent performance metrics in SQLite
  await this.sqlite.query(`
    INSERT INTO metrics (
      id, metric_name, metric_type, value, labels, swarm_id, agent_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    `metric-${Date.now()}-${randomBytes(8).toString('hex')}`,
    'agent_confidence',
    'gauge',
    confidence,
    JSON.stringify({ phase: phaseId, loop: 3, files: files.length }),
    this.swarmId,
    agentId
  ]);
}
```

### Agent Termination Event

```typescript
async onAgentTerminate(agentId: string, reason: string): Promise<void> {
  // 1. Update SQLite agent status (permanent record)
  await this.sqlite.query(`
    UPDATE agents SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, ['terminated', agentId]);

  // 2. Create audit log entry
  await this.sqlite.query(`
    INSERT INTO audit_log (
      id, entity_id, entity_type, action, old_values, new_values,
      changed_by, swarm_id, risk_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    `audit-${Date.now()}-${randomBytes(8).toString('hex')}`,
    agentId,
    'agent',
    'agent_terminated',
    JSON.stringify({ status: 'active' }),
    JSON.stringify({ status: 'terminated', reason }),
    'system',
    this.swarmId,
    reason.includes('error') ? 'high' : 'low'
  ]);

  // 3. Remove from Redis (cleanup ephemeral state)
  await this.redis.del(`agent:${agentId}:state`);
}
```

---

## Cross-Session Recovery

### Scenario: VS Code Crash During Loop 2 Validation

**Problem:** User closes VS Code while Loop 2 validators are running. On restart, how do we recover?

**Recovery Strategy:**

```typescript
async recoverCFNLoopState(phaseId: string): Promise<RecoveryState> {
  this.logger.info('Recovering CFN Loop state after crash', { phaseId });

  // 1. Check if any active consensus in SQLite
  const activeConsensus = await this.sqlite.query(`
    SELECT * FROM consensus
    WHERE target_id = ? AND status IN ('pending', 'in_progress')
    ORDER BY created_at DESC LIMIT 1
  `, [phaseId]);

  if (activeConsensus.length > 0) {
    const consensus = activeConsensus[0];

    // 2. Recover Loop 3 implementation results from SQLite
    const loop3Results = await this.sqlite.query(`
      SELECT * FROM memory
      WHERE key LIKE ? AND namespace = 'cfn-loop'
    `, [`cfn/phase:${phaseId}/loop3/%`]);

    // 3. Check if consensus was achieved before crash
    if (consensus.current_score >= consensus.threshold) {
      // Loop 2 passed, ready for Loop 4
      return {
        loop: 4,
        action: 'await_product_owner_decision',
        context: {
          consensusId: consensus.id,
          consensusScore: consensus.current_score,
          validatorVotes: JSON.parse(consensus.metadata).validators
        }
      };
    } else {
      // Loop 2 incomplete, resume validation
      return {
        loop: 2,
        action: 'resume_validation',
        context: {
          consensusId: consensus.id,
          currentScore: consensus.current_score,
          requiredScore: consensus.threshold,
          completedValidators: JSON.parse(consensus.metadata).validators || []
        }
      };
    }
  }

  // 4. Check if Loop 3 was in progress
  const loop3State = await this.sqlite.query(`
    SELECT * FROM tasks
    WHERE parent_task_id LIKE ? AND status = 'in_progress'
  `, [`phase:${phaseId}:loop3`]);

  if (loop3State.length > 0) {
    return {
      loop: 3,
      action: 'resume_implementation',
      context: {
        inProgressTasks: loop3State.map(t => t.id),
        completedAgents: loop3Results.length
      }
    };
  }

  // 5. No active state, start fresh
  return {
    loop: 3,
    action: 'start_fresh',
    context: { phaseId }
  };
}
```

---

## Migration Requirements

### Phase 1: SQLite Schema Deployment (COMPLETED)

- ✅ 12-table schema deployed (`src/sqlite/schema.sql`)
- ✅ 5-level ACL system implemented
- ✅ AES-256-GCM encryption for private/team data
- ✅ Redis coordination integration

### Phase 2: CFN Loop Integration (CURRENT SPRINT)

**Sprint 1.5: SQLite Memory Integration**

1. **Update Loop 3 Orchestration:**
   - Modify `cfn-loop-orchestrator.ts` to write agent confidence to SQLite
   - Add dual-write pattern: Redis (primary) + SQLite (async persistence)
   - Implement ACL enforcement (agent confidence = Private level)

2. **Update Loop 2 Validation:**
   - Store validator votes in SQLite `consensus` table
   - Create immutable audit log entries for each vote
   - Implement consensus calculation with SQLite fallback

3. **Update Loop 4 Product Owner:**
   - Persist GOAP decisions to SQLite `memory` table (ACL: Project level)
   - Create audit trail for decision history
   - Implement backlog item creation in SQLite `tasks` table

4. **Implement Recovery System:**
   - Add `CFNLoopRecovery` class to handle crash recovery
   - Query SQLite for in-progress loops on startup
   - Reconstruct Redis state from SQLite persistence layer

### Phase 3: Agent Lifecycle Hooks (SPRINT 1.6)

**Integration Points:**

1. **Blocking Coordination Integration:**
   - Modify `blocking-coordination.ts` to emit SQLite persistence events
   - Add dual-write for signal ACKs (Redis ephemeral + SQLite audit)
   - Implement coordinator timeout cleanup for both layers

2. **Heartbeat Warning System Integration:**
   - Update `heartbeat-warning-system.ts` to log dead coordinator events to SQLite
   - Store escalation records in SQLite `audit_log` table
   - Implement coordinator replacement history tracking

3. **Coordinator Timeout Handler Integration:**
   - Modify `coordinator-timeout-handler.ts` to persist timeout events
   - Store work transfer records in SQLite for audit trail
   - Implement spawn request history in SQLite

### Phase 4: Compliance & Reporting (SPRINT 1.7)

1. **Audit Trail Queries:**
   - Create SQL views for common compliance queries
   - Implement retention policy enforcement (90/365 days)
   - Add audit log export functionality (JSON/CSV)

2. **Performance Monitoring:**
   - Track SQLite write latency (target: <50ms p95)
   - Monitor disk usage (memory table growth)
   - Implement automatic vacuum/optimize jobs

3. **Testing:**
   - Add integration tests for dual-layer writes
   - Test crash recovery scenarios
   - Validate ACL enforcement across all data types

---

## Performance Considerations

### Write Performance

**Target Latencies:**
- Redis write: <10ms (p95)
- SQLite write: <50ms (p95)
- Dual-write total: <60ms (p95)

**Optimization Strategies:**

1. **Asynchronous SQLite Writes:**
   ```typescript
   // Don't block on SQLite persistence
   async dualWrite(key: string, value: any): Promise<void> {
     // 1. Redis write (blocking, fail fast)
     await this.redis.setex(key, 3600, JSON.stringify(value));

     // 2. SQLite write (non-blocking, best effort)
     setImmediate(async () => {
       try {
         await this.sqlite.memoryAdapter.set(key, value);
       } catch (error) {
         this.logger.error('SQLite persistence failed', { key, error });
         // Emit metric for monitoring
         sqliteWriteFailures.labels('dual_write').inc();
       }
     });
   }
   ```

2. **Batch SQLite Writes:**
   ```typescript
   // Accumulate writes in memory, flush every 5s or 100 items
   class BatchedSQLiteWriter {
     private batch: Array<{ key: string; value: any }> = [];
     private maxBatchSize = 100;
     private flushInterval = 5000; // 5 seconds

     async add(key: string, value: any): Promise<void> {
       this.batch.push({ key, value });

       if (this.batch.length >= this.maxBatchSize) {
         await this.flush();
       }
     }

     async flush(): Promise<void> {
       if (this.batch.length === 0) return;

       const transaction = await this.sqlite.beginTransaction();
       try {
         for (const { key, value } of this.batch) {
           await transaction.execute(`
             INSERT INTO memory (id, key, value, namespace)
             VALUES (?, ?, ?, ?)
           `, [generateId(), key, JSON.stringify(value), 'cfn-loop']);
         }
         await transaction.commit();
         this.batch = [];
       } catch (error) {
         await transaction.rollback();
         throw error;
       }
     }
   }
   ```

3. **WAL Mode Optimization:**
   ```sql
   -- Already configured in schema.sql
   PRAGMA journal_mode = WAL;
   PRAGMA synchronous = NORMAL; -- Balance durability vs performance
   PRAGMA wal_autocheckpoint = 1000; -- Checkpoint every 1000 pages
   ```

### Read Performance

**Target Latencies:**
- Redis read: <5ms (p95)
- SQLite read (hot): <20ms (p95)
- SQLite read (cold): <50ms (p95)

**Cache Strategy:**

```typescript
class TieredMemoryCache {
  async get(key: string): Promise<any> {
    // L1: Redis (hot cache, 1h TTL)
    const redisValue = await this.redis.get(key);
    if (redisValue) {
      return JSON.parse(redisValue);
    }

    // L2: SQLite (warm storage, 30d retention)
    const sqliteValue = await this.sqlite.memoryAdapter.get(key);
    if (sqliteValue) {
      // Warm Redis cache for next read
      await this.redis.setex(key, 3600, JSON.stringify(sqliteValue));
      return sqliteValue;
    }

    // L3: Not found
    throw new Error(`Key not found: ${key}`);
  }
}
```

---

## Security Implications

### ACL Enforcement Across Layers

**5-Level Security Model:**

1. **Private (Level 1):**
   - Agent-specific data (confidence scores, internal state)
   - Encrypted in SQLite with agent-specific key
   - Redis key includes agent ID: `agent:${agentId}:private:*`

2. **Team (Level 2):**
   - Team collaboration data (shared context, task assignments)
   - Encrypted in SQLite with team-specific key
   - Redis key includes team ID: `team:${teamId}:*`

3. **Swarm (Level 3):**
   - Swarm coordination data (consensus, phase state)
   - Not encrypted (shared within swarm)
   - Redis key includes swarm ID: `swarm:${swarmId}:*`

4. **Project (Level 4):**
   - Project-wide data (Product Owner decisions, phase results)
   - Not encrypted (shared within project)
   - SQLite only (permanent record)

5. **System (Level 5):**
   - System administration data (audit logs, compliance records)
   - Encrypted with system master key
   - SQLite only (immutable)

### Encryption Strategy

**Implementation:**

```typescript
class ACLEncryptionService {
  async encrypt(value: any, aclLevel: number, entityId: string): Promise<string> {
    if (aclLevel <= 2) { // Private or Team
      const key = this.deriveKey(aclLevel, entityId);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(value), 'utf8'),
        cipher.final()
      ]);

      const authTag = cipher.getAuthTag();

      return JSON.stringify({
        encrypted: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        algorithm: 'aes-256-gcm'
      });
    }

    // ACL 3-5: No encryption
    return JSON.stringify(value);
  }

  private deriveKey(aclLevel: number, entityId: string): Buffer {
    const masterKey = Buffer.from(process.env.SQLITE_ENCRYPTION_KEY!, 'hex');
    return crypto.pbkdf2Sync(
      `${aclLevel}:${entityId}`,
      masterKey,
      100000, // iterations
      32, // key length
      'sha256'
    );
  }
}
```

---

## Implementation Checklist

### Sprint 1.5: Core Integration (Estimated: 3 days)

- [ ] **Day 1: Loop 3 Integration**
  - [ ] Add `SQLiteMemorySystem` to `CFNLoopOrchestrator`
  - [ ] Implement dual-write pattern in `storeLoop3Results()`
  - [ ] Add ACL validation (agent confidence = Private)
  - [ ] Write unit tests for dual-write failure scenarios
  - [ ] Add Prometheus metrics: `sqlite_write_latency_seconds`

- [ ] **Day 2: Loop 2 Integration**
  - [ ] Update `recordLoop2Consensus()` to persist to SQLite
  - [ ] Store validator votes in `consensus` table
  - [ ] Create immutable audit log entries for votes
  - [ ] Implement consensus query from SQLite
  - [ ] Write integration tests for consensus recovery

- [ ] **Day 3: Loop 4 Integration**
  - [ ] Update `recordLoop4Decision()` to persist GOAP decisions
  - [ ] Store backlog items in SQLite `tasks` table
  - [ ] Implement decision history queries
  - [ ] Add recovery logic for incomplete Loop 4 decisions
  - [ ] Write end-to-end tests for full CFN Loop with SQLite

### Sprint 1.6: Agent Lifecycle Integration (Estimated: 2 days)

- [ ] **Day 1: Blocking Coordination**
  - [ ] Add SQLite persistence to `BlockingCoordination`
  - [ ] Implement dual-write for signal ACKs (audit trail)
  - [ ] Update `CoordinatorTimeoutHandler` to log to SQLite
  - [ ] Add dead coordinator history tracking
  - [ ] Write tests for timeout recovery from SQLite

- [ ] **Day 2: Heartbeat System**
  - [ ] Update `HeartbeatWarningSystem` to log escalations
  - [ ] Implement coordinator replacement history
  - [ ] Add work transfer audit trail
  - [ ] Write tests for heartbeat recovery scenarios

### Sprint 1.7: Compliance & Testing (Estimated: 2 days)

- [ ] **Day 1: Audit Trail**
  - [ ] Create SQL views for compliance queries
  - [ ] Implement retention policy enforcement
  - [ ] Add audit log export functionality
  - [ ] Write compliance report generator

- [ ] **Day 2: Testing & Validation**
  - [ ] Run full CFN Loop with SQLite persistence
  - [ ] Test crash recovery scenarios
  - [ ] Validate ACL enforcement across all layers
  - [ ] Load test: 1000 agent spawns with dual-write
  - [ ] Measure latencies: Redis (<10ms), SQLite (<50ms)

---

## Appendix A: SQL Query Examples

### Query 1: Retrieve Loop 3 Results for Phase

```sql
SELECT
  m.agent_id,
  json_extract(m.value, '$.confidence') AS confidence,
  json_extract(m.value, '$.files') AS files,
  m.created_at
FROM memory m
WHERE
  m.namespace = 'cfn-loop'
  AND m.key LIKE 'cfn/phase:auth/loop3/%/results'
ORDER BY m.created_at DESC;
```

### Query 2: Retrieve Loop 2 Consensus History for Phase

```sql
SELECT
  c.id,
  c.current_score,
  c.threshold,
  c.status,
  c.metadata AS validator_votes,
  c.created_at,
  c.resolved_at
FROM consensus c
WHERE
  c.target_id = 'phase-auth'
  AND c.loop_number = 2
ORDER BY c.created_at DESC;
```

### Query 3: Retrieve Product Owner Decision History

```sql
SELECT
  m.key,
  json_extract(m.value, '$.decision') AS decision,
  json_extract(m.value, '$.confidence') AS confidence,
  json_extract(m.value, '$.reasoning') AS reasoning,
  m.created_at
FROM memory m
WHERE
  m.namespace = 'cfn-loop'
  AND m.key LIKE 'cfn/phase:%/loop4/decision'
ORDER BY m.created_at DESC;
```

### Query 4: Audit Trail for Phase Lifecycle

```sql
SELECT
  a.action,
  a.entity_type,
  a.old_values,
  a.new_values,
  a.changed_by,
  a.risk_level,
  a.created_at
FROM audit_log a
WHERE
  a.entity_id LIKE 'phase-auth%'
  OR a.metadata LIKE '%"phase":"auth"%'
ORDER BY a.created_at ASC;
```

---

## Appendix B: Performance Benchmarks

### Expected Performance Characteristics

| **Operation** | **Layer** | **Latency (p50)** | **Latency (p95)** | **Throughput** |
|---------------|-----------|-------------------|-------------------|----------------|
| Redis write | Redis | 2ms | 8ms | 50,000/sec |
| Redis read | Redis | 1ms | 5ms | 100,000/sec |
| SQLite write | SQLite | 15ms | 45ms | 5,000/sec |
| SQLite read (hot) | SQLite | 8ms | 18ms | 20,000/sec |
| Dual-write | Both | 17ms | 53ms | 5,000/sec |
| Dual-read (cached) | Redis | 1ms | 5ms | 100,000/sec |
| Dual-read (miss) | SQLite | 8ms | 18ms | 20,000/sec |

### Load Test Scenario: 1000 Agent CFN Loop

**Test Setup:**
- 1000 agents spawned in Loop 3
- Each agent writes confidence score + 5 file changes
- 10 validators in Loop 2
- 1 Product Owner in Loop 4

**Expected Results:**
- Total writes: 1000 (Loop 3) + 10 (Loop 2) + 1 (Loop 4) = 1011
- Redis writes: 1011 * 10ms = 10.1 seconds
- SQLite writes: 1011 * 45ms = 45.5 seconds (async, non-blocking)
- Total wall time: ~12 seconds (Redis + coordination overhead)

---

## Document Control

**Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-10-10 | System Architect | Initial architecture specification |

**Review Status:**
- [ ] Architect Review
- [ ] Security Review
- [ ] DevOps Review
- [ ] Product Owner Approval

**Related Documents:**
- `src/sqlite/README.md` - SQLite Memory Management System
- `docs/architecture/REDIS_COORDINATION_SYSTEM.md` - Redis Coordination Architecture
- `CLAUDE.md` - CFN Loop Specification (lines 151-164)
- `planning/SPRINT_1.4_LOOP2_VALIDATION_REPORT.json` - Sprint 1.4 Completion

---

**END OF DOCUMENT**
