# Blocking Coordination Migration Guide

**Status:** DEPRECATED - Migrated to Redis BLPOP Primitives
**Effective Date:** 2025-10-19
**Migration Path:** BlockingCoordinationSignals → Redis BLPOP

---

## Executive Summary

The BlockingCoordinationSignals system (421 lines, HMAC-based pub/sub) has been **completely replaced** by simple Redis BLPOP primitives. This migration achieves:

- **-421 lines** of JavaScript removed
- **-1 cleanup script** no longer needed
- **-HMAC complexity** eliminated
- **+Zero-token blocking** (BLPOP doesn't consume API calls)
- **+Simpler testing** (8/8 passing tests vs complex state machine testing)

---

## What Changed

### Legacy System (DEPRECATED)

**Files Archived:**
- `blocking-coordination-signals.js` (421 lines)
- `coordinator-timeout-handler.js`
- `cleanup-blocking-coordination.sh`

**Location:** `legacy/v1/deprecated/`

**Pattern:**
```javascript
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals';
import { CoordinatorTimeoutHandler } from '../cfn-loop/coordinator-timeout-handler';

const signals = new BlockingCoordinationSignals(coordinatorId, process.env.HMAC_SECRET);
await signals.sendSignal('READY', targetAgentId);
await signals.waitForAck(requestId, 30000);
```

**Problems:**
- HMAC secret management complexity
- Cleanup script required every 5 minutes
- 421 lines of coordination logic
- Complex state machine testing
- Token cost during waiting periods

### Modern System (CURRENT)

**Files:**
- `.claude/skills/redis-coordination/invoke-waiting-mode.sh`
- `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
- `.claude/skills/redis-coordination/test-orchestrator.sh` (8/8 passing)

**Pattern:**
```bash
# Agent enters waiting mode (zero-token blocking)
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "task-123" \
  --agent-id "coder-1" \
  --context "iteration-1"

# Coordinator blocks until agent completes (BLPOP - no API calls)
redis-cli blpop "swarm:task-123:coder-1:done" 30

# Wake agent for next iteration
./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
  --task-id "task-123" \
  --agent-id "coder-1" \
  --reason "cfn_loop_iteration" \
  --iteration 2
```

**Benefits:**
- Zero tokens consumed while waiting (BLPOP blocks without API calls)
- Auto-cleanup (keys deleted on read)
- 2 lines of bash vs 421 lines of JavaScript
- Simple, testable primitives
- <100ms wake-up latency

---

## Migration Steps

### For Coordinator Agents

**Before (DEPRECATED):**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - blocking-coordination-validator  # REMOVE
```

**After (CURRENT):**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  # No blocking-coordination-validator needed
```

**Code Changes:**

**Before:**
```javascript
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals';

const signals = new BlockingCoordinationSignals(coordinatorId, hmacSecret);
await signals.sendSignal('READY', 'coder-1');
await signals.waitForAck(requestId, 30000);
```

**After:**
```bash
# Use Redis BLPOP skill
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" --agent-id "coder-1" --context "ready"

redis-cli blpop "swarm:${TASK_ID}:coder-1:done" 30
```

### For CFN Loop Orchestration

**Before (Manual Task Spawning):**
```bash
# Spawn agents manually, no dependency enforcement
# Problem: Loop 2 validators run before Loop 3 completes
```

**After (Orchestrator with BLPOP):**
```bash
# Use orchestrator to enforce dependencies
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "unique-task-id" \
  --mode standard \
  --loop3-agents "researcher,backend-dev,devops" \
  --loop2-agents "reviewer,architect,tester" \
  --product-owner "product-owner" \
  --max-iterations 10
```

**Benefits:**
- Loop 2 BLOCKED until Loop 3 complete (BLPOP)
- Product Owner BLOCKED until Loop 2 complete (BLPOP)
- Zero tokens consumed while blocking
- Automatic iteration management

---

## Testing

**Legacy System:**
- Complex state machine tests required
- HMAC secret injection for tests
- Mock Redis pub/sub channels
- Cleanup script validation

**Modern System:**
```bash
# Run comprehensive test suite (8 tests)
./.claude/skills/redis-coordination/test-orchestrator.sh

# Tests validate:
# - BLPOP blocking behavior
# - Agent completion protocol
# - Consensus collection
# - Wake-up latency (<100ms)
# - Timeout handling
# - Multi-iteration loops
```

**Test Results:** 8/8 passing (100% success rate)

---

## Environment Changes

**Remove (No Longer Needed):**
```bash
# .env
BLOCKING_COORDINATION_SECRET=xxx  # Remove this
```

**No new secrets required** - Redis BLPOP uses standard Redis connection.

---

## Rollback Plan

If you need to temporarily use the legacy system:

1. Copy files from `legacy/v1/deprecated/` back to `.claude/agents/cfn-loop/`
2. Restore `BLOCKING_COORDINATION_SECRET` environment variable
3. Re-enable cleanup script: `legacy/v1/scripts/cleanup-blocking-coordination.sh`
4. Add `blocking-coordination-validator` back to coordinator agents

**Not Recommended** - Modern system is superior in every metric.

---

## Documentation Updates

**Updated:**
- `.claude/agents/CLAUDE.md` - Deprecated blocking-coordination-validator
- `.claude/agents/CLAUDE.md` - Replaced examples with Redis BLPOP patterns
- Root `CLAUDE.md` - Redis Waiting Mode section added

**See:**
- `.claude/skills/redis-coordination/SKILL.md` - Complete Redis coordination guide
- `.claude/skills/redis-coordination/README.md` - Quick start examples

---

## Timeline

- **2025-09-30**: Redis BLPOP patterns introduced
- **2025-10-18**: Redis Waiting Mode validated (8/8 tests passing)
- **2025-10-19**: BlockingCoordinationSignals archived to `legacy/v1/deprecated/`
- **2025-10-19**: Documentation updated with deprecation notices
- **2026-04-19**: Full removal planned (6 months notice)

---

## Support

**Questions?** See:
- `.claude/skills/redis-coordination/SKILL.md` (primary reference)
- `.claude/skills/redis-coordination/examples/waiting-mode-pattern.sh`
- Root `CLAUDE.md` section "Redis Waiting Mode"

**Found a bug?** Report in project issues with tag `redis-coordination`

---

**Migration Status:** ✅ Complete
**Validation:** 8/8 tests passing
**Cost Savings:** Zero-token blocking achieved
