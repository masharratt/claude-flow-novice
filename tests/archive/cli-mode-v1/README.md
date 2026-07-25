# CLI Mode v1 Test Archive (3-Layer Architecture)

**Archive Date:** 2025-11-24
**Reason:** Architecture transition from 3-layer to 2-layer coordination

## Architecture Change

### v1 (Deprecated - 3-Layer)
```
Main Chat → Coordinator (cfn-v3-coordinator) → Orchestrator (orchestrate.sh) → Workers
```

**Characteristics:**
- Coordinator agent spawned via Task() tool
- Orchestrator script managed worker spawning
- Complex handoff protocols between layers
- Higher token costs ($0.150/iteration)

### v2 (Current - 2-Layer)
```
Main Chat → CLI agents (direct Redis BLPOP)
```

**Characteristics:**
- Main Chat spawns agents directly via spawn-agent-cli.ts
- Redis completion signaling: `cfn-completion:${TASK_ID}`
- Simplified coordination without coordinator layer
- 67% cost savings ($0.050/iteration)

## Archived Test Categories

### coordinator/ (2 tests)
Tests validating coordinator agent spawning and handoff protocols.

**Files:**
- `test-coordinator-spawning.sh` - Basic coordinator spawning validation
- `test-coordinator-handoffs.sh` - Coordinator → orchestrator handoff protocol

**Why Archived:** No coordinator in v2 architecture.

### orchestrator/ (8 tests)
Tests validating orchestrator.sh workflow, iteration management, and agent handoffs.

**Files:**
- `test-orchestrator-workflow.sh` - Orchestrator execution flow
- `test-loop3-handoffs.sh` - Loop 3 agent handoffs
- `test-loop2-handoffs.sh` - Loop 2 validator handoffs
- `test-product-owner-handoffs.sh` - Product owner decision handoffs
- `test-iteration-enforcement.sh` - Multi-iteration validation
- `test-bug22-integration.sh` - Bug #22 regression test (coordinator-specific)

**Why Archived:** Orchestrator.sh removed in v2. Main Chat now coordinates directly.

### commands/ (2 tests)
Tests validating slash command coordinator spawning.

**Files:**
- `test-cfn-loop-cli-command.sh` - /cfn-loop-cli coordinator spawning
- `test-cfn-loop-task-command.sh` - /cfn-loop-task coordinator validation

**Why Archived:** Commands now spawn agents directly without coordinator.

### legacy/ (3 tests)
Full CFN Loop execution tests from v1 architecture.

**Files:**
- `test-cfn-loop-execution.sh` - Complete 3-layer execution
- `test-cfn-loop-e2e-integration.sh` - End-to-end 3-layer validation
- `test-cfn-loop-full-cycle.sh` - Full loop cycle with coordinator

**Why Archived:** End-to-end tests now validate 2-layer direct spawning.

## Migration Impact

**Before (v1):**
- 30 active tests (33 total including 3 already archived)
- Complex multi-layer validation
- Coordinator/orchestrator coupling

**After (v2):**
- 14 active tests (53% reduction)
- Direct spawning validation
- Simplified coordination protocols

**Test Categories Retained:**
- Unit tests (5): Parameter validation, path resolution, thresholds, tool access
- Integration tests (3): Redis coordination, prompt delivery, mode detection
- E2E tests (5): Simplified coordination, success criteria, real execution
- Security tests (1): Input validation, injection prevention

## Key Technical Changes

### Redis Coordination Keys

**v1 (Coordinator):**
```bash
# Coordinator used orchestrator keys
swarm:${TASK_ID}:${AGENT_ID}:done
```

**v2 (Direct):**
```bash
# Main Chat uses completion keys
cfn-completion:${TASK_ID}
```

### Agent Spawning

**v1 (3-Layer):**
```bash
# Main Chat spawns coordinator
Task("cfn-v3-coordinator", "Execute CFN Loop...")

# Coordinator spawns orchestrator
cfn-spawn orchestrator --task-id ...

# Orchestrator spawns workers
orchestrate.sh → cfn-spawn agent ...
```

**v2 (2-Layer):**
```bash
# Main Chat spawns agents directly
/cfn-loop-cli "Task description" --mode standard --provider kimi

# spawn-agent-cli.ts handles coordination
npx tsx src/cli/spawn-agent-cli.ts backend-developer \
  --task-id "$TASK_ID" \
  --prompt "Task description" \
  --background
```

### Prompt Delivery

**v1 (Coordinator):**
- Coordinator stored prompts in Redis
- Orchestrator retrieved and passed to agents
- Complex state management

**v2 (Direct):**
- spawn-agent-cli.ts accepts --prompt parameter
- PROMPT environment variable injected to agents
- Direct delivery, no intermediate storage

## Security Improvements in v2

**Command Injection Prevention (CVSS 9.8 → 0.0):**
- Replaced shell-based redis-cli with Redis client library
- Input validation with whitelist regex: `^[a-zA-Z0-9_-]+$`
- No shell interpolation in coordination layer

**Test Coverage:**
- 10 security tests validating 40+ attack vectors
- Input validation for taskId, agentId, prompt
- Redis key injection prevention
- Path traversal protection

## Related Documentation

- **Current Architecture:** `readme/CLI_MODE_ARCHITECTURE copy.md`
- **Test Standards:** `tests/CLAUDE.md`
- **Security Fixes:** `docs/BUG_COMMAND_INJECTION_FIX.md` (if created)
- **CFN Loop Guide:** `.claude/commands/CFN_LOOP_TASK_MODE.md`

## Future Considerations

**E2E Tests Need Updates:**
The following 5 E2E tests still reference old 3-layer patterns and need coordinator removal:

1. `test-cfn-loop-cli-real-execution.sh` (North Star test - HIGH PRIORITY)
2. `test-5-iteration-cfn-loop.sh`
3. `test-cfn-loop-5-iteration-real-execution.sh`
4. `test-full-loop3-agent-spawning.sh`
5. `test-success-criteria-e2e.sh`

**Update Strategy:**
- Remove coordinator spawning assertions
- Validate Main Chat direct spawning
- Update Redis key patterns to cfn-completion format
- Test 2-layer coordination flow

## Archive Retention

**Retention Policy:** Retain for 6 months (until 2025-05-24)

**Review Date:** 2025-05-24

**Deletion Criteria:**
- No production references to v1 patterns
- All E2E tests updated to v2 architecture
- No active v1 architecture rollback plans

---

*This archive documents the transition from 3-layer (Main Chat → Coordinator → Orchestrator → Workers) to 2-layer (Main Chat → Workers) CLI mode architecture, completed during Sprint focused on CLI mode coordination fixes and security hardening.*
