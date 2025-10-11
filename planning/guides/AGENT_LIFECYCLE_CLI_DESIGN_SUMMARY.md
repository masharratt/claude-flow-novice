# Agent Lifecycle CLI Commands - Design Summary

**Version:** 1.0.0
**Status:** Design Complete - Ready for Implementation
**Confidence:** 0.92
**Created:** 2025-10-11
**Architect:** system-architect-agent

---

## Quick Reference

### Documents Delivered

1. **AGENT_LIFECYCLE_CLI_ARCHITECTURE.json** (Comprehensive JSON specification)
   - Complete command structure with 5 subcommands
   - Database integration using existing schema (no migrations needed)
   - CFN Loop integration patterns
   - Implementation roadmap with 4 phases
   - Testing strategy with success metrics

2. **AGENT_LIFECYCLE_CLI_IMPLEMENTATION_GUIDE.md** (Developer handbook)
   - Detailed command specifications with examples
   - Integration patterns for agent profiles
   - Error handling strategies
   - Security considerations
   - Performance targets
   - Implementation checklists

---

## Executive Summary

**Objective:** Enable agents to execute their lifecycle hooks through CLI commands with SQLite persistence, ACL enforcement, and CFN Loop integration.

**Solution:** Extend existing CLI with `agent-lifecycle` parent command containing 5 subcommands:
- `spawn` - Register agent in SQLite
- `complete` - Store confidence score and mark complete
- `update` - Update agent status during execution
- `list` - Query agents with filtering
- `inspect` - Detailed agent inspection

**Key Benefits:**
- ✅ Agents can execute documented lifecycle patterns via Bash tool
- ✅ SQLite persistence provides audit trail and recovery
- ✅ ACL enforcement prevents unauthorized data access
- ✅ CFN Loop confidence reporting becomes operational
- ✅ No database migrations required (reuses existing schema)

**Confidence: 0.92**
- High clarity of requirements
- Existing schema fully supports all operations
- Clear implementation pattern from recovery-status.ts
- Well-defined testing strategy

---

## Command Overview

### 1. agent-lifecycle spawn

**Usage:**
```bash
claude-flow-novice agent-lifecycle spawn --id coder-1 --type coder --acl-level 1
```

**Purpose:** Register agent in SQLite on spawn with ACL level

**Database:** Inserts into `agents` table, creates audit log entry

**ACL Defaults:**
- Implementers (coder, backend-dev, frontend-dev): Level 1 (Private)
- Validators (reviewer, security-specialist): Level 3 (Swarm)
- Coordinators (architect, planner): Level 3 (Swarm)
- Product Owner: Level 4 (Project)

---

### 2. agent-lifecycle complete

**Usage:**
```bash
claude-flow-novice agent-lifecycle complete \
  --id coder-1 \
  --confidence 0.85 \
  --files '["src/auth.js"]' \
  --reasoning "All tests passing"
```

**Purpose:** Mark agent as completed and store confidence score

**CFN Loop 3 Integration:**
- Stores confidence score for gate check (≥0.75 to proceed)
- Memory key: `cfn/phase-{phaseId}/loop3/agent-{agentId}`
- ACL Level: 1 (Private)
- TTL: 30 days

**Database:** Updates `agents` table status, creates audit log, stores in memory

---

### 3. agent-lifecycle update

**Usage:**
```bash
claude-flow-novice agent-lifecycle update --id coder-1 --status in_progress --progress 50
```

**Purpose:** Update agent status during execution

**Valid Statuses:** active, in_progress, idle, suspended, completed, terminated

**Database:** Updates `agents` table updated_at timestamp

---

### 4. agent-lifecycle list

**Usage:**
```bash
# Table format (human-readable)
claude-flow-novice agent-lifecycle list --swarm-id phase-7-auth

# JSON format (programmatic)
claude-flow-novice agent-lifecycle list --format json
```

**Purpose:** List agents with filtering and formatting

**CFN Loop 2 Usage:** Validators query agents by swarm ID to calculate consensus

**Database:** SELECT query with optional filters on status, type, swarm_id

---

### 5. agent-lifecycle inspect

**Usage:**
```bash
# Pretty format (human-readable)
claude-flow-novice agent-lifecycle inspect coder-1

# JSON format with full history (CFN Loop 4)
claude-flow-novice agent-lifecycle inspect coder-1 --include-history --format json
```

**Purpose:** Detailed inspection of agent lifecycle

**CFN Loop 4 Usage:** Product Owner reads full lifecycle data for GOAP decision

**Database:** SELECT from agents + agent_lifecycle_records + agent_state_history

---

## Database Architecture

### Schema Reuse (No Migrations Required!)

**Primary Table: `agents`** (src/sqlite/schema.sql, lines 14-31)
- Columns: id, name, type, status, swarm_id, capabilities, metadata, acl_level, created_at, updated_at
- Indexes: swarm_id, status, type
- Already supports all required operations

**Lifecycle Table: `agent_lifecycle_records`** (src/lifecycle/memory-schema.ts, lines 29-47)
- Columns: agent_id, session_id, current_state, previous_state, metadata_json, performance_json
- Links to agents.id via foreign key
- Tracks state transitions and performance

**Audit Table: `audit_log`** (src/sqlite/schema.sql, lines 196-216)
- Columns: entity_id, entity_type, action, changed_by, swarm_id, acl_level, created_at
- Provides complete audit trail for all operations
- ACL Level 4 for compliance

**Memory Table: `memory`** (src/sqlite/schema.sql, lines 114-146)
- Stores CFN Loop confidence scores
- ACL enforcement at storage level
- TTL support for automatic cleanup

---

## CFN Loop Integration

### Loop 3: Implementation Confidence

**Implementer Flow:**
```bash
# 1. Spawn agent
claude-flow-novice agent-lifecycle spawn --id coder-1 --type coder

# 2. Work execution (agent implements features)

# 3. Complete with confidence
claude-flow-novice agent-lifecycle complete --id coder-1 --confidence 0.85
```

**Coordinator Gate Check:**
```bash
# Query all Loop 3 agents
agents=$(claude-flow-novice agent-lifecycle list --swarm-id phase-auth --format json)

# Check all confidence >= 0.75
if all_confidence_above_threshold; then
  echo "PASS: Proceed to Loop 2"
else
  echo "FAIL: Retry Loop 3 with targeted improvements"
fi
```

---

### Loop 2: Consensus Validation

**Validators Query Loop 3 Results:**
```bash
# Read Loop 3 confidence scores
claude-flow-novice agent-lifecycle list \
  --swarm-id phase-auth \
  --status completed \
  --format json | jq '.agents[] | select(.confidence >= 0.75)'

# Calculate consensus (average confidence)
# Target: >= 0.90 consensus
```

---

### Loop 4: Product Owner Decision

**Product Owner Inspection:**
```bash
# Read full lifecycle data
claude-flow-novice agent-lifecycle inspect coder-1 \
  --include-history \
  --include-metrics \
  --format json > /tmp/agent-lifecycle.json

# Make GOAP decision (PROCEED/DEFER/ESCALATE)
# Based on confidence, blockers, metrics, history
```

---

## Implementation Strategy

### Pattern: Follow recovery-status.ts

**File Locations:**
- Implementation: `src/cli/commands/agent-lifecycle.ts`
- Registration: `src/cli/commands/index.ts` (setupCommands)
- Types: `src/types/agent-lifecycle-cli-types.ts`
- Database ops: Use existing `SQLiteLifecycleMemoryManager` (src/lifecycle/memory-schema.ts)

**Key Classes:**
```typescript
class AgentLifecycleCommands {
  async handleSpawn(options: SpawnOptions): Promise<void>
  async handleComplete(options: CompleteOptions): Promise<void>
  async handleUpdate(options: UpdateOptions): Promise<void>
  async handleList(options: ListOptions): Promise<void>
  async handleInspect(agentId: string, options: InspectOptions): Promise<void>
}

export function registerAgentLifecycleCommands(program: Command): void
```

---

## Error Handling

### Database Errors

**SQLITE_BUSY:** Retry with exponential backoff (100ms, 200ms, 400ms)
```javascript
for (let i = 0; i < maxRetries; i++) {
  try {
    return await operation();
  } catch (error) {
    if (error.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
      await sleep(Math.pow(2, i) * 100);
    } else throw error;
  }
}
```

**SQLITE_LOCKED:** Wait for lock release with timeout (5 seconds)

**SQLITE_CONSTRAINT:** Return validation error with details

### Validation Errors

**Invalid Agent ID:**
- Pattern: `^[a-z-]+[a-z0-9-]*-\d+$`
- Examples: coder-1, backend-dev-3, system-architect-1

**Invalid Confidence:**
- Range: 0.0 - 1.0 inclusive

**Invalid ACL Level:**
- Range: 1 - 6 inclusive

---

## Implementation Roadmap

### Phase 1: Core Commands (4-6 hours)
- Create agent-lifecycle.ts
- Implement spawn/complete/update handlers
- Database operations with retry logic
- Validation and error handling

### Phase 2: Query Commands (2-3 hours)
- Implement list with filtering
- Implement inspect with detailed output
- Table and JSON formatting

### Phase 3: Integration (2-3 hours)
- Register in CLI index.ts
- Update help system
- Test from agent profiles

### Phase 4: Testing (4-6 hours)
- Unit tests (90% coverage target)
- Integration tests with SQLite
- End-to-end CFN Loop workflow tests
- Performance testing (<100ms per operation)

**Total Estimated Effort:** 12-16 hours

---

## Success Metrics

### Functional
- ✅ All 5 commands execute without errors
- ✅ CRUD operations work for all agent states
- ✅ Graceful handling of all error scenarios
- ✅ CFN Loop confidence reporting operational

### Performance
- ✅ spawn: <50ms
- ✅ complete: <100ms
- ✅ update: <50ms
- ✅ list (100 agents): <200ms
- ✅ inspect: <100ms
- ✅ Concurrent throughput: >100 ops/sec

### Reliability
- ✅ Database retry success: >99%
- ✅ Error recovery: 100% graceful degradation
- ✅ Data integrity: Zero data loss or corruption

### Usability
- ✅ Clear help text for all commands
- ✅ Actionable error messages
- ✅ Readable table and JSON output

---

## Security Considerations

### Input Validation
- Agent ID: Regex validation to prevent injection
- Confidence: Range check (0.0-1.0)
- JSON: Parse and validate structure
- SQL Injection: Parameterized queries only

### ACL Enforcement
- Verify ACL level matches agent type conventions
- Private data (ACL 1) only accessible by creating agent
- All operations logged to audit_log

### Error Leakage
- Hide internal database paths
- Log stack traces to file only
- Redact sensitive data in logs

---

## Migration Path

### From Current State (Non-executable TypeScript)

**Agent Profile Before:**
```yaml
lifecycle:
  pre_task: |
    # TypeScript example (not executable)
    await sqlite.query(`INSERT INTO agents...`);
```

**Agent Profile After:**
```yaml
lifecycle:
  pre_task: |
    # Executable CLI command
    claude-flow-novice agent-lifecycle spawn \
      --id "${AGENT_ID}" \
      --type "coder" \
      --acl-level 1
```

**Transition Strategy:**
1. Implement CLI commands
2. Test CLI end-to-end
3. Update agent profiles to use CLI
4. Validate with real agents

---

## Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SQLite locking under load | Medium | Medium | Retry logic, WAL mode, connection pooling |
| Breaking existing AgentManager | Low | High | Use existing tables, no modifications to AgentManager |
| Agent profile updates break workflows | Low | Medium | Phased rollout, keep temporary logging |
| Performance degradation (100+ agents) | Medium | Medium | Database indexes, caching, batch operations |

---

## Future Enhancements

### Phase 2 (Post-MVP)
- `agent-lifecycle metrics` - Performance dashboard
- `agent-lifecycle export` - Export to JSON/CSV
- `agent-lifecycle replay` - Replay state transitions
- `agent-lifecycle visualize` - Generate state diagrams

### Phase 3 (Advanced)
- Real-time WebSocket updates
- Integration with existing /agent command
- Distributed coordination across machines
- Time-series analysis

---

## Confidence Assessment

**Overall Confidence: 0.92**

**Breakdown:**
- Requirements clarity: 0.95 ✅
- Technical feasibility: 0.95 ✅
- Schema compatibility: 1.0 ✅ (perfect match)
- Integration complexity: 0.85 (testing needed)
- Testing coverage: 0.90 ✅

**Reasoning:**
- Existing schema fully supports requirements
- Clear command pattern from recovery-status.ts
- SQLiteLifecycleMemoryManager already implemented
- Well-defined agent lifecycle requirements
- Lower confidence on integration due to need for real agent testing

**Blockers:** None

**Assumptions:**
- SQLiteLifecycleMemoryManager is production-ready
- Agent profiles can execute Bash commands
- Swarm IDs available at agent spawn time
- CFN Loop coordinators will read from SQLite

---

## References

### Documents Delivered
1. **AGENT_LIFECYCLE_CLI_ARCHITECTURE.json** - Complete JSON specification
2. **AGENT_LIFECYCLE_CLI_IMPLEMENTATION_GUIDE.md** - Developer handbook
3. **AGENT_LIFECYCLE_CLI_DESIGN_SUMMARY.md** - This document

### Existing Code
- `src/cli/commands/recovery-status.ts` - Command pattern reference
- `src/cli/commands/agent.ts` - Agent management patterns
- `src/lifecycle/memory-schema.ts` - Database schema (SQLiteLifecycleMemoryManager)
- `src/sqlite/schema.sql` - Primary schema definition
- `src/core/persistence.ts` - Persistence layer

### Documentation
- `.claude/agents/core-agents/coder.md` - Agent lifecycle requirements
- `CLAUDE.md` - CLI command patterns
- `planning/sprints/SPRINT_AGENT_COMPLIANCE_TESTING.md` - Requirements context

---

## Next Steps

### Immediate
1. ✅ **Review Architecture** - Validate design with stakeholders
2. 📋 **Implement Phase 1** - Core commands (spawn, complete, update)
3. 🧪 **Test Phase 1** - Unit and integration tests
4. 📋 **Implement Phase 2** - Query commands (list, inspect)
5. 🧪 **Test End-to-End** - Full CFN Loop workflow
6. 📝 **Update Agent Profiles** - Migrate to CLI commands
7. 🚀 **Production Deployment** - Roll out to all 53 agents

### Success Criteria
- All 5 commands implemented and tested
- At least one agent can execute full lifecycle
- CFN Loop 3 patterns work end-to-end
- Documentation updated with working examples

**Ready to Proceed:** YES

---

**Architecture Design Complete**
**Confidence:** 0.92
**Status:** Ready for Implementation
**Estimated Effort:** 12-16 hours
