# Architecture Decision Records (ADRs)

**Version:** 1.0
**Last Updated:** 2025-11-16
**Status:** Complete

## Overview

This document records architectural decisions made during the standardization process. Each ADR follows a standard format:

- **Status**: Accepted, Superseded, Deprecated, or Proposed
- **Context**: Why this decision was needed
- **Decision**: What was decided
- **Consequences**: Positive and negative impacts
- **Alternatives Considered**: Other options evaluated

---

## ADR-001: Dual-Layer Persistence (Redis + SQLite/PostgreSQL)

**Status:** Accepted

**Context:**

The system needs to support both:
1. **Transient coordination data** (agent signals, temporary state) - needs fast access, expires naturally
2. **Persistent operational data** (audit logs, schemas, transaction history) - needs durability, archival support

Using a single database for both creates inefficiencies:
- Query result caching in SQLite/PostgreSQL involves expensive disk I/O
- Coordination signals in file-based database create unnecessary disk wear
- Complex TTL management in ACID database reduces performance

**Decision:**

Implement two-layer persistence:
- **Layer 1 (Redis)**: Transient data with automatic expiration
  - Query result cache (TTL: 1 hour default)
  - Coordination signals and state (TTL: 24 hours)
  - Session data (TTL: duration of operation)
  - Lock mechanisms (TTL: operation timeout + grace period)

- **Layer 2 (SQLite/PostgreSQL)**: Persistent operational data
  - Audit logs (TTL: 90 days to archival)
  - Schema definitions (TTL: permanent, versioned)
  - Transaction logs (TTL: 30 days active, then archived)
  - Artifact metadata (TTL: permanent)

**Consequences:**

**Positive:**
- Query caching performance: <1ms vs 50-100ms disk access
- Reduced database I/O: ~70% reduction in write operations
- Natural signal expiration without cleanup jobs
- Simplified transaction management (shorter logs)
- Optimal cost: Redis for hot data, SQLite for cold data

**Negative:**
- Operational complexity: managing two databases
- Data consistency challenges: Redis and disk can diverge
- Recovery complexity: need replay logs from disk after Redis restart
- Monitoring overhead: watch both systems

**Mitigation:**
- Implement write-through cache (always persist to SQLite before Redis expiry)
- Correlation keys link data across layers
- Regular consistency checks between layers

---

## ADR-002: Correlation-Based Tracing

**Status:** Accepted

**Context:**

Complex operations span multiple systems:
- Database queries → Caching → Coordination signals → Artifact storage
- Each system generates logs independently
- Debugging failures requires manual log correlation across systems
- Current approach: grep logs by timestamp (error-prone, time-consuming)

Without unified tracing:
- MTTR (Mean Time To Recovery) is 2+ hours for complex issues
- Difficult to audit operation sequences
- Performance profiling requires manual log parsing
- Compliance reporting requires manual data compilation

**Decision:**

Every operation receives a unique **correlation key** that persists through all systems:

```
Format: ${OPERATION}:${ITERATION}:${TIMESTAMP}
Example: "query-agents-v2:iter-3:1731752400000"

Lifecycle:
1. Generated at operation start
2. Passed to all sub-operations
3. Logged in every system touching operation
4. Used for conflict detection in transactions
5. Archived for audit trail
```

**Consequences:**

**Positive:**
- Complete operation tracing: follow single ID across all systems
- MTTR reduced to 15-30 minutes with correlation key searching
- Audit trail: who did what, when, where
- Conflict detection: identify write-write conflicts across databases
- Performance profiling: calculate end-to-end latency

**Negative:**
- Extra storage: ~100 bytes per operation in logs/databases
- API complexity: correlation key required in every call
- Operational overhead: monitoring correlation ID distribution
- Schema changes: need to add correlation_key column to many tables

**Mitigation:**
- Store correlation key in structured log format (JSON)
- Implement automatic correlation key injection in client libraries
- Compress old correlation keys (after 90 days)
- Build correlation key index for fast searching

---

## ADR-003: Schema-First Design

**Status:** Accepted

**Context:**

Current system has implicit schemas:
- No schema documentation
- Type validation done in application code
- Migrations done manually
- Data quality issues: invalid types, missing required fields
- New integrations discover schema by trial-and-error

Problems:
- Data corruption: wrong type (string "0.5" vs number 0.5)
- Incompatibility: field added to one database but not another
- Testing challenges: unclear what data is valid
- Performance: no index hints, query planning inefficient

**Decision:**

Make schemas explicit and first-class:
1. **Schema Definition** (required before data access):
   ```json
   {
     "schema_id": "agents-v1",
     "version": 1,
     "fields": [
       {"name": "id", "type": "string", "required": true},
       {"name": "confidence", "type": "number", "min": 0, "max": 1}
     ]
   }
   ```

2. **Validation at Every Write**:
   - Type checking (string vs number)
   - Range checking (0-1 for confidence)
   - Required field checking
   - Enum validation (only valid statuses)

3. **Schema Versioning**:
   - Schemas versioned independently
   - Multiple versions can coexist
   - Migration path from v1 → v2 documented
   - Backwards compatibility for reads

4. **Schema Caching**:
   - Schemas cached in Redis (1-hour TTL)
   - Auto-discovery if not cached
   - Regular validation against actual schema

**Consequences:**

**Positive:**
- Data quality: guaranteed type correctness
- API clarity: caller knows valid field names and types
- Index hints: schema defines indexed fields
- Testing: schema-based test data generation
- Migration: clear transformation rules

**Negative:**
- Operational complexity: schema management overhead
- Schema change process: requires testing, migration
- Performance: validation adds ~5% latency to writes
- Flexibility: less room for ad-hoc data structures

**Mitigation:**
- Implement schema versioning to support gradual migration
- Cache schemas aggressively (99.5% cache hit rate)
- Implement schema diff tooling for migrations
- Accept schema:null for legacy data (backwards compat)

---

## ADR-004: Frontmatter-Based Metadata for Skills

**Status:** Accepted

**Context:**

Current skill execution:
- No standardization: each script defines own environment variables
- No discovery: what skills exist? What do they do?
- No version control: multiple versions of same skill cause confusion
- No dependency tracking: what command-line tools are required?

When deploying skills:
- Manual configuration required for each environment
- Skill failures due to missing dependencies
- No clear way to specify timeouts, retry behavior
- Performance degradation: no way to limit resource usage

**Decision:**

Use standardized frontmatter comments at top of skill files:

```bash
#!/bin/bash
# SKILL_NAME: "analyze-performance"
# SKILL_VERSION: "1.0"
# SKILL_DESCRIPTION: "Analyze system performance metrics"
# SKILL_AUTHOR: "performance-team"
# REQUIRED_ENVIRONMENT: ["DATABASE_URL", "REDIS_URL"]
# OPTIONAL_ENVIRONMENT: ["LOG_LEVEL"]
# REQUIRED_DEPENDENCIES: ["sqlite3", "jq", "bc"]
# TIMEOUT_SECONDS: 60
# RETRY_ATTEMPTS: 3
# RETRY_BACKOFF_SECONDS: 5
# OUTPUT_FORMAT: "json"
# MEMORY_LIMIT_MB: 512
# CPU_LIMIT_PERCENT: 50

set -euo pipefail

# Implementation here
```

**Consequences:**

**Positive:**
- Auto-discovery: list all skills and their capabilities
- Dependency injection: environment automatically prepared
- Resource management: limits prevent runaway processes
- Reliability: timeout and retry configured
- Documentation: metadata is machine-readable
- Versioning: multiple versions manageable

**Negative:**
- Boilerplate: every skill needs frontmatter
- Complexity: more fields to configure
- Overhead: frontmatter parsing on every execution
- Rigidity: standard fields may not fit all use cases

**Mitigation:**
- Provide skill template to reduce boilerplate
- Cache frontmatter parsing (minimal overhead)
- Allow extensions for custom fields
- Document frontmatter as optional (basic mode)

---

## ADR-005: JSON Output Standardization

**Status:** Accepted

**Context:**

Current output from skills and services:
- Inconsistent formats: some return JSON, some return text
- No standard error format: errors returned as strings, objects, or codes
- Parsing challenges: consumer code needs to handle 5+ output formats
- Integration difficulty: hard to build tools that work with multiple services

Problems:
- Scripting languages can't reliably parse output (string parsing brittle)
- Error handling inconsistent: some tools throw, some return codes, some return objects
- Logging inconsistent: different timestamp formats, field names
- Testing difficult: no schema to validate against

**Decision:**

All services return JSON with standardized structure:

```json
{
  "status": "success" | "error" | "partial",
  "result": {},
  "metadata": {
    "execution_time_ms": 234,
    "correlation_key": "...",
    "records_processed": 1500,
    "cache_hit": true
  },
  "errors": [
    {
      "code": "ERROR_CODE",
      "message": "Human-readable message",
      "details": {...}
    }
  ]
}
```

**Consequences:**

**Positive:**
- Consistent parsing: `jq` works with all outputs
- Error handling: standardized error codes and messages
- Monitoring: structured logging easy to parse
- Integration: tools can compose outputs reliably
- Testing: JSON schema validation possible
- Documentation: clear structure for all responses

**Negative:**
- Overhead: JSON encoding ~5% performance impact
- Verbosity: extra wrapping increases payload size
- Complexity: requires JSON library in every language
- Legacy compatibility: can't easily change format

**Mitigation:**
- Compress JSON responses with gzip (negates size overhead)
- Cache JSON parsing (compiled jq expressions)
- Accept both JSON and text for input (flexible)
- Version API to allow format evolution

---

## ADR-006: TransactionManager for Distributed Operations

**Status:** Accepted

**Context:**

Current distributed operations:
- No atomicity: updates across databases may partially succeed
- Manual conflict detection: race conditions possible
- Error handling: operator must manually rollback on failure
- Auditability: no transaction log for compliance

When coordinating writes:
- Agent A updates database 1
- Agent A updates database 2
- If step 2 fails, step 1 already committed (inconsistent state)
- No easy rollback mechanism
- No audit trail of what happened

**Decision:**

Implement TransactionManager for ACID transactions:

1. **Begin Transaction**: Create transaction context
2. **Savepoints**: Create rollback points within transaction
3. **Execute Operations**: Track all operations with correlation key
4. **Conflict Detection**: Automatic write-write conflict detection
5. **Commit/Rollback**: All-or-nothing outcome

**Example:**
```typescript
const txn = await transactionManager.beginTransaction({
  transaction_type: "write",
  databases: ["primary", "cache"]
});

await txn.query({operation: "update", table: "agents", ...});
const sp = await txn.createSavepoint("before_critical");
await txn.query({operation: "update", table: "tasks", ...});

try {
  await txn.commit();
} catch (e) {
  if (e.code === "CONFLICT_DETECTED") {
    await txn.rollbackToSavepoint(sp);
    // retry
  }
}
```

**Consequences:**

**Positive:**
- Atomicity: all operations succeed or all fail
- Consistency: no partial states visible
- Auditability: transaction log for compliance
- Recovery: can rollback to savepoint on conflict
- Performance: optimistic locking (good for low-conflict scenarios)

**Negative:**
- Complexity: transaction management overhead
- Performance: validation and logging adds latency (~10%)
- Conflict potential: may need retries in high-contention scenarios
- Distributed complexity: multi-database transactions are hard

**Mitigation:**
- Implement optimistic locking (most scenarios don't conflict)
- Automatic retry with backoff
- Conflict detection via correlation keys
- Limit transaction scope to minimize conflicts

---

## ADR-007: Why Database Service Abstraction

**Status:** Accepted

**Context:**

Originally: Direct SQL queries in application code
- Each code location writes different SQL
- No reuse of query patterns
- No caching strategy
- Connection management scattered
- No schema validation

Problems:
- Query inconsistency: same logical query written differently
- Performance: no coordinated caching
- Security: SQL injection possible if not careful
- Debugging: unclear why query is slow (indexes? network? cache?)
- Maintenance: schema changes affect many code locations

**Decision:**

Centralize all database access through DatabaseService:
1. Single query interface for all databases
2. Built-in schema validation
3. Automatic connection pooling
4. Query result caching with configurable TTL
5. Correlation key injection
6. Comprehensive error handling
7. Query profiling and metrics

**Consequences:**

**Positive:**
- Consistency: same query logic everywhere
- Performance: coordinated caching reduces DB load
- Security: centralized input validation
- Debuggability: query profiling built-in
- Monitoring: all queries flow through one service
- Maintenance: schema changes in one place

**Negative:**
- Extra layer: performance overhead (~5%)
- Complexity: another abstraction to understand
- Flexibility: harder to write custom SQL
- Learning curve: team needs to learn DatabaseService API

**Mitigation:**
- Implement DatabaseService with minimal overhead
- Cache heavily to offset performance cost
- Document API thoroughly
- Provide query building utilities

---

## ADR-008: Async/Await Coordination Protocol

**Status:** Accepted

**Context:**

Coordinating multiple agents:
- Agent 1 starts work
- Agent 2 needs to wait for Agent 1 to complete
- How does Agent 2 know when to continue?

Options:
1. **Polling**: Agent 2 repeatedly checks status (wasteful, high latency)
2. **Blocking Wait**: Agent 2 blocks until signal arrives (efficient, low latency)

Problems with polling:
- CPU waste: many agents polling simultaneously
- Latency: 5-60 second delays (polling interval)
- Scale issues: thousands of agents = thousands of polls/second

**Decision:**

Implement blocking wait with Redis Pub/Sub:
- Agent 2 calls `wait(topic)` and blocks
- Agent 1 completes and calls `broadcastSignal(topic)`
- Agent 2 wakes immediately (<100ms)
- No polling, no CPU waste

**Example:**
```typescript
// Agent 2: Wait for Agent 1
const response = await coordinationManager.wait({
  agent_id: "agent-2",
  topic: "swarm:task-001:agent-1:done",
  timeout_seconds: 300
});

// Agent 1: Signal completion
await coordinationManager.broadcastSignal({
  topic: "swarm:task-001:agent-1:done",
  message: {status: "completed"}
});
```

**Consequences:**

**Positive:**
- Efficiency: no polling overhead
- Latency: <100ms wake time
- Scalability: thousands of agents without slowdown
- Resource usage: minimal CPU and memory
- Simplicity: clean async/await pattern

**Negative:**
- Redis dependency: critical infrastructure
- Signal loss: if signal expires before agent starts waiting
- Timeout complexity: need proper timeout handling
- Debugging: async code harder to trace

**Mitigation:**
- Redis redundancy: cluster with failover
- Signal persistence: write to log before pub/sub
- Timeout recovery: automatic retry after timeout
- Tracing: detailed logs with correlation keys

---

## ADR-009: Why NOT Implement Distributed Consensus

**Status:** Accepted (Decision: Don't Implement)

**Context:**

Considered implementing distributed consensus (Raft, Paxos) for:
- Automatic leader election
- Distributed state synchronization
- Byzantine fault tolerance

**Decision:**

Do NOT implement distributed consensus because:

1. **Unnecessary Complexity**:
   - Project has a clear coordinator role (not peer-based)
   - Consensus overkill for our coordination needs
   - Implementation complexity: 500+ lines of tricky code

2. **Simpler Alternative Works Better**:
   - Coordinator orchestrates sequentially
   - No conflicting decisions from peers
   - Simpler, easier to debug, fewer failure modes

3. **Operational Overhead**:
   - Consensus requires network quorum
   - Network partitions break consensus
   - Complex failure recovery

4. **Our Requirements Don't Need It**:
   - We don't have Byzantine failures
   - Coordinator can be restarted
   - Sequential execution is acceptable

**Decision Alternative:**
- Keep coordinator as single point of control
- Use correlation keys for traceability
- Use transactional semantics for consistency
- Implement checkpointing for recovery

**Consequences:**

**Positive:**
- Simpler codebase: easier to maintain
- Fewer failure modes: fewer things to debug
- Faster execution: no consensus overhead
- Easier operations: straightforward recovery

**Negative:**
- Single coordinator is potential bottleneck
- Coordinator failure requires manual restart
- Can't achieve true Byzantine fault tolerance

**Mitigation:**
- Monitor coordinator health aggressively
- Implement automatic health-based restart
- Document coordinator recovery procedures
- Keep coordinator stateless (can restart anytime)

---

## ADR-010: JSON Log Format with Correlation Keys

**Status:** Accepted

**Context:**

Current logging:
- Text format: "Query took 45ms"
- Impossible to parse programmatically
- Timestamps in different formats
- No correlation between logs from different systems

Challenges:
- Can't aggregate logs from multiple systems
- Difficult to identify log spam (what's normal?)
- Performance analysis requires manual log analysis

**Decision:**

All logs output as JSON with standard fields:

```json
{
  "timestamp": "2025-11-16T10:00:00.123Z",
  "level": "info",
  "correlation_key": "query-001:iter-1:1731752400000",
  "service": "database-service",
  "event": "query_executed",
  "message": "Executed SELECT query",
  "duration_ms": 45,
  "fields": {
    "table": "agents",
    "row_count": 5,
    "from_cache": false
  }
}
```

**Consequences:**

**Positive:**
- Parseable: structured log aggregation possible
- Correlation: follow operations across systems
- Analysis: metrics extraction via jq
- Monitoring: real-time log analysis
- Compliance: structured audit trail

**Negative:**
- Verbosity: larger log files
- Human readability: can't quickly scan logs
- Storage: more disk space required
- Performance: JSON encoding overhead

**Mitigation:**
- Compress logs with gzip
- Implement log sampling for high-volume events
- Use structured log viewer for human inspection
- Archive old logs to cold storage

---

**Document Reference:** ARCHITECTURE_DECISION_RECORDS.md
**Maintained By:** API Documentation Specialist
**Last Reviewed:** 2025-11-16
