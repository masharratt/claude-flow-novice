# Agent Lifecycle CLI Commands - Implementation Guide

**Version:** 1.0.0
**Status:** Design Complete - Ready for Implementation
**Confidence:** 0.92
**Created:** 2025-10-11
**Architect:** system-architect-agent

---

## Executive Summary

This guide provides detailed specifications for implementing agent-lifecycle CLI commands that enable agents to execute their lifecycle hooks through executable CLI commands with SQLite persistence, ACL enforcement, and CFN Loop integration.

**Key Objectives:**
- Enable agents to execute documented lifecycle patterns via Bash tool
- Provide SQLite persistence for audit trail and cross-session recovery
- Enforce ACL levels to prevent unauthorized data access
- Make CFN Loop confidence reporting operational
- Reuse existing schema (no migrations required)

---

## Command Specifications

### 1. `agent-lifecycle spawn`

**Purpose:** Register agent in SQLite on spawn with ACL level

**Usage:**
```bash
claude-flow-novice agent-lifecycle spawn \
  --id <agent-id> \
  --type <agent-type> \
  [--acl-level <level>] \
  [--swarm-id <swarm-id>] \
  [--capabilities <json>] \
  [--metadata <json>]
```

**Parameters:**

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `--id` | Yes | string | - | Unique agent ID (format: `agent-type-N`) |
| `--type` | Yes | string | - | Agent type (coder, reviewer, architect, etc.) |
| `--acl-level` | No | integer | 1 | ACL level (1-6, default: 1 for implementers) |
| `--swarm-id` | No | string | - | Swarm ID for coordination |
| `--capabilities` | No | JSON | - | JSON array of capabilities |
| `--metadata` | No | JSON | - | JSON metadata |

**Output (JSON):**
```json
{
  "success": true,
  "agent_id": "coder-1",
  "type": "coder",
  "acl_level": 1,
  "spawned_at": "2025-10-11T10:30:00.000Z"
}
```

**Error Output:**
```json
{
  "success": false,
  "error": "Invalid agent ID format",
  "code": "INVALID_AGENT_ID",
  "details": "Agent ID must match pattern: ^[a-z-]+[a-z0-9-]*-\\d+$"
}
```

**Exit Codes:**
- `0`: Success
- `1`: Validation error (invalid parameters)
- `2`: Database error

**Example:**
```bash
# Spawn implementer agent (ACL 1)
claude-flow-novice agent-lifecycle spawn \
  --id coder-1 \
  --type coder \
  --acl-level 1 \
  --swarm-id phase-7-auth \
  --capabilities '["typescript", "testing", "security"]'

# Spawn coordinator agent (ACL 3)
claude-flow-novice agent-lifecycle spawn \
  --id coordinator-1 \
  --type coordinator \
  --acl-level 3 \
  --swarm-id phase-7-auth
```

---

### 2. `agent-lifecycle complete`

**Purpose:** Mark agent as completed and store confidence score

**Usage:**
```bash
claude-flow-novice agent-lifecycle complete \
  --id <agent-id> \
  --confidence <score> \
  [--files <json>] \
  [--reasoning <text>] \
  [--blockers <json>]
```

**Parameters:**

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `--id` | Yes | string | - | Agent ID to complete |
| `--confidence` | Yes | float | - | Confidence score (0.0-1.0) |
| `--files` | No | JSON | - | JSON array of modified files |
| `--reasoning` | No | string | - | Explanation of confidence score |
| `--blockers` | No | JSON | - | JSON array of blockers encountered |

**Output (JSON):**
```json
{
  "success": true,
  "agent_id": "coder-1",
  "confidence": 0.85,
  "status": "completed",
  "completed_at": "2025-10-11T11:45:00.000Z",
  "duration_ms": 4500000
}
```

**CFN Loop 3 Integration:**
This command automatically stores Loop 3 confidence data:
- Memory key: `cfn/phase-{phaseId}/loop3/agent-{agentId}`
- ACL level: 1 (Private)
- TTL: 30 days (2592000 seconds)

**Exit Codes:**
- `0`: Success
- `1`: Agent not found
- `2`: Invalid confidence score (out of range)
- `3`: Database error

**Example:**
```bash
# Complete with confidence score (CFN Loop 3)
claude-flow-novice agent-lifecycle complete \
  --id coder-1 \
  --confidence 0.85 \
  --files '["src/auth.js", "src/auth.test.js"]' \
  --reasoning "All tests passing, security validation clean"

# Complete with blockers
claude-flow-novice agent-lifecycle complete \
  --id coder-2 \
  --confidence 0.65 \
  --blockers '["Missing Redis connection", "Test coverage at 75%"]'
```

---

### 3. `agent-lifecycle update`

**Purpose:** Update agent status during execution

**Usage:**
```bash
claude-flow-novice agent-lifecycle update \
  --id <agent-id> \
  --status <status> \
  [--progress <percentage>] \
  [--metadata <json>]
```

**Parameters:**

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `--id` | Yes | string | - | Agent ID to update |
| `--status` | Yes | string | - | New status (active, in_progress, idle, suspended) |
| `--progress` | No | integer | - | Progress percentage (0-100) |
| `--metadata` | No | JSON | - | JSON metadata to merge |

**Valid Statuses:**
- `active`: Agent is spawned and ready
- `in_progress`: Agent is actively working
- `idle`: Agent is waiting for work
- `suspended`: Agent is temporarily paused
- `completed`: Agent finished (use `complete` command instead)
- `terminated`: Agent stopped with error

**Output (JSON):**
```json
{
  "success": true,
  "agent_id": "coder-1",
  "status": "in_progress",
  "updated_at": "2025-10-11T10:35:00.000Z"
}
```

**Exit Codes:**
- `0`: Success
- `1`: Agent not found
- `2`: Invalid status
- `3`: Database error

**Example:**
```bash
# Update status to in_progress
claude-flow-novice agent-lifecycle update \
  --id coder-1 \
  --status in_progress \
  --progress 25

# Update with metadata
claude-flow-novice agent-lifecycle update \
  --id coder-1 \
  --status in_progress \
  --metadata '{"current_file": "src/auth.js", "step": "implementation"}'
```

---

### 4. `agent-lifecycle list`

**Purpose:** List agents with filtering and formatting options

**Usage:**
```bash
claude-flow-novice agent-lifecycle list [options]
```

**Parameters:**

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `--status` | No | string | - | Filter by status |
| `--type` | No | string | - | Filter by agent type |
| `--swarm-id` | No | string | - | Filter by swarm ID |
| `--format` | No | string | table | Output format (table, json) |
| `--limit` | No | integer | - | Limit number of results |

**Output (Table Format):**
```
┌──────────────┬────────────┬─────────────┬─────┬─────────────────────┬─────────────────────┬────────────┐
│ ID           │ Type       │ Status      │ ACL │ Spawned             │ Updated             │ Confidence │
├──────────────┼────────────┼─────────────┼─────┼─────────────────────┼─────────────────────┼────────────┤
│ coder-1      │ coder      │ completed   │ 1   │ 2025-10-11 10:30:00 │ 2025-10-11 11:45:00 │ 0.85       │
│ reviewer-1   │ reviewer   │ in_progress │ 3   │ 2025-10-11 10:32:00 │ 2025-10-11 11:50:00 │ -          │
│ coordinator-1│ coordinator│ active      │ 3   │ 2025-10-11 10:28:00 │ 2025-10-11 10:28:00 │ -          │
└──────────────┴────────────┴─────────────┴─────┴─────────────────────┴─────────────────────┴────────────┘
```

**Output (JSON Format):**
```json
{
  "agents": [
    {
      "id": "coder-1",
      "type": "coder",
      "status": "completed",
      "acl_level": 1,
      "spawned_at": "2025-10-11T10:30:00.000Z",
      "updated_at": "2025-10-11T11:45:00.000Z",
      "confidence": 0.85
    },
    {
      "id": "reviewer-1",
      "type": "reviewer",
      "status": "in_progress",
      "acl_level": 3,
      "spawned_at": "2025-10-11T10:32:00.000Z",
      "updated_at": "2025-10-11T11:50:00.000Z",
      "confidence": null
    }
  ],
  "total": 2,
  "filters": {
    "swarm_id": "phase-7-auth"
  }
}
```

**Exit Codes:**
- `0`: Success
- `1`: Database error

**Example:**
```bash
# List all agents
claude-flow-novice agent-lifecycle list

# List by swarm (for CFN Loop 2 validation)
claude-flow-novice agent-lifecycle list \
  --swarm-id phase-7-auth \
  --format json

# List completed agents with confidence scores
claude-flow-novice agent-lifecycle list \
  --status completed \
  --format table
```

---

### 5. `agent-lifecycle inspect`

**Purpose:** Detailed inspection of agent lifecycle

**Usage:**
```bash
claude-flow-novice agent-lifecycle inspect <agent-id> [options]
```

**Parameters:**

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `agent-id` | Yes | string | - | Agent ID to inspect (positional argument) |
| `--format` | No | string | pretty | Output format (pretty, json) |
| `--include-history` | No | boolean | false | Include state history |
| `--include-metrics` | No | boolean | false | Include performance metrics |

**Output (Pretty Format):**
```
╔══════════════════════════════════════════════════════════════════════╗
║                        AGENT LIFECYCLE INSPECTION                    ║
╚══════════════════════════════════════════════════════════════════════╝

Agent ID:        coder-1
Type:            coder
Status:          completed
ACL Level:       1 (Private)
Swarm ID:        phase-7-auth

─────────────────────────────────────────────────────────────────────
LIFECYCLE TIMELINE
─────────────────────────────────────────────────────────────────────
Spawned:         2025-10-11 10:30:00
Last Updated:    2025-10-11 11:45:00
Completed:       2025-10-11 11:45:00
Duration:        1h 15m

─────────────────────────────────────────────────────────────────────
PERFORMANCE METRICS
─────────────────────────────────────────────────────────────────────
Confidence:      0.85 (85%)
Files Modified:  2
Tasks Completed: 3
Error Count:     0

─────────────────────────────────────────────────────────────────────
STATE HISTORY (Last 5 transitions)
─────────────────────────────────────────────────────────────────────
10:30:00  spawned     → active       (0ms)   ✓
10:35:00  active      → in_progress  (50ms)  ✓
11:20:00  in_progress → testing      (100ms) ✓
11:40:00  testing     → reviewing    (80ms)  ✓
11:45:00  reviewing   → completed    (120ms) ✓
```

**Output (JSON Format):**
```json
{
  "agent": {
    "id": "coder-1",
    "type": "coder",
    "status": "completed",
    "acl_level": 1,
    "swarm_id": "phase-7-auth",
    "spawned_at": "2025-10-11T10:30:00.000Z",
    "updated_at": "2025-10-11T11:45:00.000Z",
    "completed_at": "2025-10-11T11:45:00.000Z",
    "duration_ms": 4500000
  },
  "lifecycle_record": {
    "current_state": "completed",
    "previous_state": "reviewing",
    "version": 5,
    "metadata": {
      "totalStateTransitions": 5,
      "totalUptime": 4500000,
      "errorCount": 0
    }
  },
  "performance": {
    "confidence": 0.85,
    "filesModified": ["src/auth.js", "src/auth.test.js"],
    "tasksCompleted": 3,
    "availability": 1.0
  },
  "state_history": [
    {
      "from": "spawned",
      "to": "active",
      "timestamp": "2025-10-11T10:30:00.000Z",
      "duration": 0,
      "success": true
    }
  ]
}
```

**Exit Codes:**
- `0`: Success
- `1`: Agent not found
- `2`: Database error

**Example:**
```bash
# Basic inspection
claude-flow-novice agent-lifecycle inspect coder-1

# Full inspection with history (CFN Loop 4)
claude-flow-novice agent-lifecycle inspect coder-1 \
  --include-history \
  --include-metrics \
  --format json

# Quick status check
claude-flow-novice agent-lifecycle inspect coder-1 --format json
```

---

## Integration with Agent Profiles

### Updated Lifecycle Hooks

**Before (Non-executable TypeScript):**
```yaml
lifecycle:
  pre_task: |
    # Register agent in SQLite
    await sqlite.query(`
      INSERT INTO agents (id, name, type, status, capabilities, spawned_at)
      VALUES (?, ?, 'coder', 'spawned', ?, datetime('now'))
    `, [agentId, agentName, JSON.stringify(capabilities)]);
```

**After (Executable CLI):**
```yaml
lifecycle:
  pre_task: |
    # Register agent in SQLite on spawn
    claude-flow-novice agent-lifecycle spawn \
      --id "${AGENT_ID}" \
      --type "coder" \
      --acl-level 1 \
      --swarm-id "${SWARM_ID}" \
      --capabilities '["coding","refactoring","debugging"]'

  post_task: |
    # Update agent status and confidence on completion
    claude-flow-novice agent-lifecycle complete \
      --id "${AGENT_ID}" \
      --confidence "${CONFIDENCE_SCORE}" \
      --files "${FILES_MODIFIED}" \
      --reasoning "${COMPLETION_REASONING}"
```

### Environment Variables

Agents should have access to these environment variables:
- `AGENT_ID`: Unique agent identifier (e.g., `coder-1`)
- `AGENT_TYPE`: Agent type (e.g., `coder`)
- `SWARM_ID`: Current swarm identifier
- `CONFIDENCE_SCORE`: Final confidence (0.0-1.0) on completion
- `FILES_MODIFIED`: JSON array of modified files (optional)
- `COMPLETION_REASONING`: Human-readable explanation (optional)

---

## CFN Loop Integration

### Loop 3: Implementation Confidence

**Agent Execution:**
```bash
# Implementer completes work
claude-flow-novice agent-lifecycle complete \
  --id coder-1 \
  --confidence 0.85 \
  --files '["src/auth.js", "src/auth.test.js"]' \
  --reasoning "All tests passing, security validation clean"
```

**Automatic Storage:**
- SQLite: `agents` table updated with status=completed
- Memory: `cfn/phase-auth/loop3/agent-coder-1` stored with ACL 1, TTL 30 days
- Audit: `audit_log` entry created

**Gate Check:**
```bash
# Coordinator checks all Loop 3 agents
claude-flow-novice agent-lifecycle list \
  --swarm-id phase-auth \
  --status completed \
  --format json

# Parse JSON, check all confidence >= 0.75
# If pass: Proceed to Loop 2
# If fail: Retry Loop 3
```

### Loop 2: Consensus Validation

**Validators Query:**
```bash
# Validators read Loop 3 results
claude-flow-novice agent-lifecycle list \
  --swarm-id phase-auth \
  --format json | jq '.agents[] | select(.confidence >= 0.75)'
```

**Consensus Calculation:**
- Average confidence across all Loop 3 agents
- Target: >= 0.90 consensus
- Store result in `consensus` table with ACL 3

### Loop 4: Product Owner Decision

**Product Owner Inspection:**
```bash
# Read full lifecycle data
claude-flow-novice agent-lifecycle inspect coder-1 \
  --include-history \
  --include-metrics \
  --format json > /tmp/agent-lifecycle.json

# Make GOAP decision based on confidence, blockers, metrics
```

---

## Database Schema Reuse

### Primary Table: `agents`

**Location:** `src/sqlite/schema.sql` (lines 14-31)

**Columns Used:**
- `id` (TEXT PRIMARY KEY): Agent ID
- `name` (TEXT): Display name
- `type` (TEXT): Agent type (coder, reviewer, etc.)
- `status` (TEXT): Current status
- `swarm_id` (TEXT): Swarm association
- `capabilities` (TEXT): JSON capabilities
- `metadata` (TEXT): JSON metadata
- `acl_level` (INTEGER): ACL enforcement
- `created_at` (DATETIME): Spawn timestamp
- `updated_at` (DATETIME): Last update

**Indexes:**
- `idx_agents_swarm_id`: Filter by swarm
- `idx_agents_status`: Filter by status
- `idx_agents_type`: Filter by type

### Lifecycle Table: `agent_lifecycle_records`

**Location:** `src/lifecycle/memory-schema.ts` (lines 29-47)

**Columns Used:**
- `agent_id` (TEXT PRIMARY KEY): Links to agents.id
- `session_id` (TEXT): Session tracking
- `current_state` (TEXT): Current state
- `previous_state` (TEXT): Previous state
- `metadata_json` (TEXT): Lifecycle metadata
- `performance_json` (TEXT): Performance metrics
- `created_at` (DATETIME): Record creation
- `updated_at` (DATETIME): Last update

### Audit Table: `audit_log`

**Location:** `src/sqlite/schema.sql` (lines 196-216)

**Columns Used:**
- `entity_id` (TEXT): Agent ID
- `entity_type` (TEXT): 'agent'
- `action` (TEXT): 'spawn', 'update', 'complete'
- `changed_by` (TEXT): Executing agent
- `swarm_id` (TEXT): Swarm context
- `acl_level` (INTEGER): Audit ACL
- `created_at` (DATETIME): Audit timestamp

**No migrations required** - all tables exist and support required operations.

---

## Error Handling

### Database Errors

**SQLITE_BUSY:**
```javascript
// Retry with exponential backoff
async function retryWithBackoff(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 100; // 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

**SQLITE_LOCKED:**
```javascript
// Wait for lock release with timeout
async function waitForLockRelease(operation, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      return await operation();
    } catch (error) {
      if (error.code !== 'SQLITE_LOCKED') throw error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw new Error('Database lock timeout exceeded');
}
```

### Validation Errors

**Invalid Agent ID:**
```bash
$ claude-flow-novice agent-lifecycle spawn --id invalid_id --type coder
Error: Invalid agent ID format
Expected: agent-type-N (lowercase letters, hyphens, digits)
Examples: coder-1, backend-dev-3, system-architect-1
```

**Invalid Confidence:**
```bash
$ claude-flow-novice agent-lifecycle complete --id coder-1 --confidence 1.5
Error: Invalid confidence score: 1.5
Confidence must be between 0.0 and 1.0 inclusive
```

---

## Implementation Checklist

### Phase 1: Core Commands (4-6 hours)

- [ ] Create `src/cli/commands/agent-lifecycle.ts`
- [ ] Implement `AgentLifecycleCommands` class
- [ ] Add `spawn` handler with validation
- [ ] Add `complete` handler with CFN Loop integration
- [ ] Add `update` handler
- [ ] Implement database operations using `SQLiteLifecycleMemoryManager`
- [ ] Add error handling with retry logic
- [ ] Export `registerAgentLifecycleCommands` function

### Phase 2: Query Commands (2-3 hours)

- [ ] Implement `list` handler with filtering
- [ ] Implement `inspect` handler with detailed output
- [ ] Add table formatting using `cli-table3`
- [ ] Add JSON output mode for programmatic use
- [ ] Test filtering and pagination

### Phase 3: Integration (2-3 hours)

- [ ] Register commands in `src/cli/commands/index.ts`
- [ ] Update CLI help system
- [ ] Add to CLAUDE.md command reference
- [ ] Test from agent profiles via Bash tool
- [ ] Verify environment variable handling

### Phase 4: Testing (4-6 hours)

- [ ] Write unit tests for each command handler
- [ ] Write integration tests with SQLite
- [ ] Test error handling scenarios
- [ ] Test CFN Loop confidence reporting workflow
- [ ] Test ACL enforcement
- [ ] Performance testing with concurrent operations
- [ ] End-to-end test with real agents

### Phase 5: Documentation (2 hours)

- [ ] Update agent profile templates
- [ ] Create migration guide
- [ ] Add command examples to CLAUDE.md
- [ ] Document environment variables
- [ ] Create troubleshooting guide

---

## Performance Targets

| Operation | Target Latency | Notes |
|-----------|----------------|-------|
| spawn | <50ms | Single INSERT + audit log |
| complete | <100ms | UPDATE + memory storage + audit |
| update | <50ms | Single UPDATE |
| list (100 agents) | <200ms | Single SELECT with indexes |
| inspect | <100ms | SELECT + JOIN for history |

**Concurrent Throughput:** >100 operations/second

**Database Configuration:**
- WAL mode enabled (journal_mode = WAL)
- 64MB cache (cache_size = -64000)
- Connection pooling (5 connections)
- Prepared statement caching

---

## Security Considerations

### Input Validation

**Agent ID:**
```javascript
const AGENT_ID_PATTERN = /^[a-z-]+[a-z0-9-]*-\d+$/;
if (!AGENT_ID_PATTERN.test(agentId)) {
  throw new ValidationError('Invalid agent ID format');
}
```

**Confidence Score:**
```javascript
if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
  throw new ValidationError('Confidence must be between 0.0 and 1.0');
}
```

**JSON Parameters:**
```javascript
try {
  const capabilities = JSON.parse(capabilitiesStr);
  if (!Array.isArray(capabilities)) {
    throw new ValidationError('Capabilities must be JSON array');
  }
} catch {
  throw new ValidationError('Invalid JSON format');
}
```

### SQL Injection Prevention

**Always use parameterized queries:**
```javascript
// GOOD
db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);

// BAD - NEVER DO THIS
db.exec(`SELECT * FROM agents WHERE id = '${agentId}'`);
```

### ACL Enforcement

**Verify ACL level matches agent type:**
```javascript
const ACL_DEFAULTS = {
  coder: 1, 'backend-dev': 1, 'frontend-dev': 1,
  reviewer: 3, 'security-specialist': 3, architect: 3,
  'product-owner': 4
};

if (aclLevel !== ACL_DEFAULTS[agentType]) {
  console.warn(`Non-standard ACL level ${aclLevel} for ${agentType}`);
}
```

---

## References

### Existing Code
- `src/cli/commands/recovery-status.ts` - Command pattern reference
- `src/cli/commands/agent.ts` - Agent management patterns
- `src/lifecycle/memory-schema.ts` - Database schema and operations
- `src/sqlite/schema.sql` - Primary schema definition
- `src/core/persistence.ts` - Persistence layer

### Documentation
- `.claude/agents/core-agents/coder.md` - Agent lifecycle requirements
- `CLAUDE.md` - CLI command patterns and conventions
- `planning/sprints/SPRINT_AGENT_COMPLIANCE_TESTING.md` - Context and requirements
- `planning/guides/AGENT_LIFECYCLE_CLI_ARCHITECTURE.json` - Detailed architecture

---

## Next Steps

1. **Review Architecture:** Validate design with team and stakeholders
2. **Implement Phase 1:** Core commands (spawn, complete, update)
3. **Test Phase 1:** Unit and integration tests
4. **Implement Phase 2:** Query commands (list, inspect)
5. **Test End-to-End:** Full CFN Loop workflow
6. **Update Agent Profiles:** Migrate from TypeScript examples to CLI commands
7. **Production Deployment:** Roll out to all 53 agents

**Estimated Completion:** 16-20 hours of focused development

---

**Confidence:** 0.92
**Blockers:** None
**Ready to Proceed:** YES
