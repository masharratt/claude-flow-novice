# CFN v3 Modularization

**Purpose**: Separated CFN Loop orchestration from Redis coordination primitives

## Architecture

**Before**: Monolithic orchestrate-cfn-loop.sh (71,098 bytes)
**After**: Modular skills (cfn-loop-orchestration + redis-coordination)

**Components**:
- `cfn-loop-orchestration/` - CFN-specific workflow logic
- `redis-coordination/` - Reusable coordination primitives
- `collect-confidence-scores.sh` - Stateless confidence collection

**Line Counts**:
- Old orchestrator: ~2,000 lines (71KB)
- New orchestrator: 654 lines (19KB)
- Reduction: 67% (workflow logic only)

## Structure

### CFN Loop Orchestration

```
.claude/skills/cfn-loop-orchestration/
├── orchestrate.sh           # Main coordinator (654 lines)
├── helpers/
│   ├── gate-check.sh        # Loop 3 self-validation
│   ├── consensus.sh         # Loop 2 consensus check
│   ├── deliverable-verifier.sh  # Prevents "consensus on vapor"
│   ├── iteration-manager.sh # Iteration cycle management
│   └── timeout-calculator.sh    # Phase-specific timeouts
├── monitor-execution.sh     # Background process monitoring
├── test-cfn-orchestration.sh
└── test-edge-cases.sh       # 20 edge case tests
```

### Redis Coordination Primitives

```
.claude/skills/redis-coordination/
├── store-context.sh         # Generic JSON storage
├── retrieve-context.sh      # Context retrieval
├── collect-confidence-scores.sh  # Stateless aggregation
├── collect-results.sh       # Result collection
├── signal.sh                # Pub/sub signaling
└── invoke-waiting-mode.sh   # Zero-token waiting
```

## Usage

### Orchestrator

```bash
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "cfn-123" \
  --mode standard \
  --loop3-agents "backend-dev,researcher" \
  --loop2-agents "reviewer,tester" \
  --product-owner "product-owner"
```

### Redis Primitives

**Store Context**:
```bash
./.claude/skills/redis-coordination/store-context.sh \
  --task-id "cfn-123" \
  --key "epic" \
  --value '{"goal":"Implement auth","deliverables":["src/auth.js"]}'
```

**Collect Confidence**:
```bash
./.claude/skills/redis-coordination/collect-confidence-scores.sh \
  --task-id "cfn-123" \
  --agent-ids "agent1,agent2"
```

**Signal Completion**:
```bash
./.claude/skills/redis-coordination/signal.sh \
  --task-id "cfn-123" \
  --channel "gate-passed"
```

## Context Injection Pattern

**Agent Lifecycle**:
1. Spawn agents with explicit context from Redis
2. Agents complete work
3. Agents report confidence and exit (no waiting mode)
4. Next iteration: Fresh spawn with feedback from Redis

**No Waiting Mode**:
- Agents exit cleanly after reporting
- Enables adaptive specialist selection
- Prevents orchestrator blocking on `wait $PID`

## Key Changes

### Separation of Concerns

**Old Pattern** (Monolithic):
- CFN workflow + Redis operations + agent spawning + consensus logic in one file
- 71KB of mixed responsibilities

**New Pattern** (Modular):
- CFN workflow: `cfn-loop-orchestration/orchestrate.sh`
- Redis ops: `redis-coordination/` primitives
- Agent spawning: Handled by orchestrator using primitives
- Consensus: `helpers/consensus.sh`

### Stateless Primitives

**collect-confidence-scores.sh**:
- No CFN Loop assumptions
- Works with any agent workflow
- Returns JSON with confidence array
- Caller decides what to do with results

### Helper Decomposition

**deliverable-verifier.sh**:
```bash
# Prevents "consensus on vapor"
# Checks git diff for actual file changes
# Forces iteration if task requires implementation but no files created
```

**timeout-calculator.sh**:
```bash
# Phase-specific timeouts
# phase-1: 15min (backend)
# phase-2: 60min (React components)
# phase-3: 60min (advanced components)
# phase-4: 30min (testing)
```

## Benefits

**Modularity**:
- Test primitives independently
- Reuse Redis coordination in non-CFN workflows
- Swap implementations without breaking orchestrator

**Maintainability**:
- 654 lines vs 2,000 lines for main orchestrator
- Clear helper responsibilities
- Easier debugging (isolated components)

**Testing**:
- 20 edge case tests in `test-edge-cases.sh`
- Separate primitive tests in `redis-coordination/tests/`
- 100% pass rate on modular tests

**Flexibility**:
- Dual-mode support (CLI + Task spawning)
- Adaptive agent specialization (security-specialist for security feedback)
- Framework-agnostic primitives

## Migration Path

**Existing CFN Loops**:
- Old orchestrator preserved as `orchestrate-cfn-loop.sh` (71KB backup)
- New orchestrator symlinked for gradual migration
- Both use same Redis keys (backward compatible)

**New Workflows**:
- Use `cfn-loop-orchestration/orchestrate.sh` directly
- Compose primitives from `redis-coordination/` for custom patterns
- Reference `test-edge-cases.sh` for usage examples

## Related Documentation

- `.claude/skills/cfn-loop-orchestration/SKILL.md` - Full orchestrator spec
- `.claude/skills/redis-coordination/SKILL.md` - Primitive API reference
- `planning/cfn-v3/DUAL_MODE_IMPLEMENTATION.md` - CLI vs Task mode architecture
- `docs/AGENT_OUTPUT_STANDARDS.md` - Output structure guidelines
