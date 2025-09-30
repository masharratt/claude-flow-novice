# Validation Architecture Summary
## Executive Briefing for Implementation Teams

**Date**: 2025-09-30
**Architect**: System Architect Agent
**Status**: ✅ Ready for Implementation
**Implementation Time**: 7-8 hours total

---

## Quick Reference

### What We're Building

Two automated validation features to enforce CLAUDE.md coordination patterns:

1. **Swarm Init Validation** (4 hours) - Prevents agent spawning without swarm initialization
2. **TodoWrite Batching Validation** (3 hours) - Detects incremental todo anti-patterns

### Why We're Building This

**Current Problem**: SI-05 and TD-05 tests show PARTIAL PASS - validation relies on manual compliance

**Solution**: Automated validation with progressive enforcement (warnings → blocking)

**Expected Outcome**: Tests upgrade to PASS, coordination compliance reaches 100%

---

## Architecture at a Glance

```
User Command → Pre-Command Hook → Validator → State Manager → Response
                                      ↓
                              ValidationResult
                                      ↓
                        ┌─────────────┴─────────────┐
                        ↓                           ↓
                   PASS/WARN                     BLOCK
                (continue execution)        (error + exit)
```

### Core Components

1. **SwarmInitValidator** (`src/validators/swarm-init-validator.ts`)
   - Tracks swarm initialization state
   - Validates agent count vs swarm capacity
   - Suggests appropriate topology (mesh/hierarchical)

2. **TodoWriteBatchValidator** (`src/validators/todowrite-batch-validator.ts`)
   - Monitors TodoWrite call frequency
   - Detects small batches (<5 items)
   - Identifies incremental anti-patterns

3. **ValidationStateManager** (`src/validators/validation-state-manager.ts`)
   - Persists validation state to `.claude-flow/validation-state.json`
   - Tracks metrics (validations, warnings, blocks)
   - Manages configuration

---

## File Structure Overview

```
src/
├── validators/                    # NEW
│   ├── swarm-init-validator.ts
│   ├── todowrite-batch-validator.ts
│   ├── validation-state-manager.ts
│   └── __tests__/
│       ├── swarm-init-validator.test.ts
│       └── todowrite-batch-validator.test.ts
│
├── types/                         # NEW
│   ├── validation.ts
│   └── validation-config.ts
│
├── hooks/
│   └── pre-command-validator.ts   # NEW
│
├── cli/commands/
│   ├── swarm.ts                   # UPDATED
│   ├── agent.ts                   # UPDATED
│   └── validate.ts                # NEW
│
└── utils/
    └── validation-formatter.ts    # NEW

.claude-flow/
├── validation-state.json          # Runtime state
└── validation-config.json         # User configuration
```

---

## Integration Points

### 1. Swarm Spawn Command

**Before** (current):
```typescript
// No validation, agents spawn regardless
await spawnAgents(agentCount);
```

**After** (with validation):
```typescript
// Validate swarm initialized before spawning
const validation = await validateSwarmInit(agentCount);

if (!validation.valid && validation.blocking) {
  console.error('❌ Swarm not initialized');
  process.exit(1);
}

await spawnAgents(agentCount);
await recordAgentSpawn(agentCount);
```

### 2. Swarm Init Command

**After** (record initialization):
```typescript
const swarmId = await initializeSwarm(topology, maxAgents);

// Record swarm init for validation
await recordSwarmInit(swarmId, topology, maxAgents);
```

### 3. TodoWrite Calls

**Before**:
```typescript
TodoWrite([...items]);
```

**After**:
```typescript
const validation = await validateTodoWriteBatch(items.length);

if (!validation.valid) {
  // Display warnings (non-blocking by default)
  validation.warnings.forEach(w => console.warn(w.message));
}

TodoWrite([...items]);
```

---

## Configuration System

### Default Config (`.claude-flow/validation-config.json`)

```json
{
  "enabled": true,
  "defaultMode": "warn",

  "swarmInit": {
    "enabled": true,
    "mode": "warn",
    "minAgentsForSwarm": 2
  },

  "todoWrite": {
    "enabled": true,
    "mode": "warn",
    "minBatchSize": 5,
    "timeWindowMs": 300000,
    "maxCallsInWindow": 2
  }
}
```

### Modes

- **`disabled`**: No validation
- **`warn`**: Display warnings, continue execution ✅ Default
- **`block`**: Display errors, exit with code 1

### CLI Flags

```bash
# Enable/disable validation
--validate-swarm-init
--no-validate-swarm-init
--block-on-swarm-fail

# Override settings
--validation-mode block
--min-batch-size 10
```

---

## Error Message Examples

### Swarm Init Error (Blocking Mode)

```
❌ Validation Failed: Swarm initialization required

Error Code: SWARM_NOT_INITIALIZED
Message: Attempting to spawn 3 agents without initialized swarm

Fix:
  npx claude-flow-novice swarm init --topology mesh --max-agents 3

Documentation: See CLAUDE.md section "Swarm Initialization (MANDATORY)"

Exit code: 1
```

### TodoWrite Warning (Warning Mode)

```
⚠️  Warning: TodoWrite batching anti-pattern detected

3 TodoWrite calls in 5 minutes (threshold: 2)

Recent Calls:
  1. 3 items at 10:00:00
  2. 2 items at 10:02:30
  3. 5 items at 10:04:15

Recommendation: Batch ALL todos in SINGLE call with 5-10+ items

Continuing with execution...
```

---

## Implementation Timeline

### Day 1: Core Validators (4 hours)
- [ ] Implement `SwarmInitValidator`
- [ ] Implement `TodoWriteBatchValidator`
- [ ] Implement `ValidationStateManager`
- [ ] Write unit tests (≥90% coverage)

### Day 2: Integration (2 hours)
- [ ] Create `pre-command-validator.ts` hook
- [ ] Update `swarm.ts` command
- [ ] Update `agent.ts` command
- [ ] Write integration tests

### Day 3: CLI & Testing (2 hours)
- [ ] Add CLI flags
- [ ] Create `validate.ts` command
- [ ] Re-run SI-05 and TD-05 tests
- [ ] Update documentation

**Total**: 7-8 hours

---

## Testing Strategy

### Unit Tests (≥90% coverage)

```typescript
describe('SwarmInitValidator', () => {
  it('should pass when swarm initialized');
  it('should fail when swarm not initialized');
  it('should suggest mesh for 2-7 agents');
  it('should suggest hierarchical for 8+ agents');
  it('should skip validation for single agent');
});

describe('TodoWriteBatchValidator', () => {
  it('should pass for batch size >= 5');
  it('should warn for small batches');
  it('should detect anti-patterns');
  it('should clean old calls');
});
```

### Integration Tests

- Test CLI integration (`swarm spawn --validate-swarm-init`)
- Test blocking mode enforcement
- Test warning mode display
- Test configuration loading

### E2E Validation

- **SI-05**: Multi-agent spawn without swarm init → BLOCKED
- **TD-05**: Multiple small TodoWrite calls → WARNING
- Both tests should upgrade from PARTIAL PASS to PASS

---

## API Reference (Quick)

### Swarm Init Validation

```typescript
// Validate before spawning agents
await validateSwarmInit(agentCount: number): Promise<ValidationResult>

// Record swarm initialization
await recordSwarmInit(swarmId: string, topology: string, maxAgents: number): Promise<void>

// Record agent spawn
await recordAgentSpawn(agentCount: number): Promise<void>
```

### TodoWrite Batching

```typescript
// Validate batching pattern
await validateTodoWriteBatch(itemCount: number, source?: string): Promise<ValidationResult>

// Get statistics
await getBatchingStats(): Promise<{
  totalCalls: number;
  averageBatchSize: number;
  antiPatternDetections: number;
  complianceRate: number;
}>
```

### ValidationResult Type

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  blocking?: boolean;
  metadata?: Record<string, any>;
}
```

---

## Success Criteria

### Functional Requirements
- ✅ SI-05 test: PARTIAL PASS → PASS
- ✅ TD-05 test: PARTIAL PASS → PASS
- ✅ No breaking changes to existing functionality
- ✅ Backward compatible (opt-in initially)

### Quality Requirements
- ✅ Unit test coverage ≥90%
- ✅ Integration tests passing
- ✅ Validation latency <100ms
- ✅ Clear error messages with fixes

### Documentation Requirements
- ✅ Architecture document (this)
- ✅ API documentation
- ✅ User guide
- ✅ Migration guide

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking existing workflows | High | Low | Default to warn mode, opt-in blocking |
| Performance overhead | Medium | Low | <100ms validation target, caching |
| False positives | Medium | Low | Comprehensive testing, configurable thresholds |
| User confusion | Low | Medium | Clear error messages, documentation |

**Overall Risk**: LOW ✅

---

## Next Actions

### Immediate (Today)
1. Review architecture document
2. Get approval from stakeholders
3. Create file structure
4. Set up testing infrastructure

### Day 1 (Tomorrow)
1. Implement `SwarmInitValidator` class
2. Implement `TodoWriteBatchValidator` class
3. Implement `ValidationStateManager` class
4. Write unit tests

### Day 2
1. Create pre-command hook integration
2. Update CLI commands
3. Write integration tests

### Day 3
1. Add CLI flags and validation commands
2. Re-run SI-05 and TD-05 tests
3. Update documentation
4. Final validation and sign-off

---

## Questions & Answers

**Q: Will this break existing workflows?**
A: No. Default mode is `warn` (non-blocking). Users can opt-in to `block` mode.

**Q: What if users want to disable validation?**
A: Use `--no-validate` flag or set `enabled: false` in config.

**Q: How do we handle edge cases (e.g., external agent spawning)?**
A: Configuration allows `minAgentsForSwarm` adjustment. Default is 2, can be set to 1 to disable.

**Q: What about performance impact?**
A: Target <100ms validation time. In-memory caching, async I/O, minimal overhead.

**Q: How do we test this thoroughly?**
A: Unit tests (≥90%), integration tests, E2E tests using SI-05 and TD-05 scenarios.

---

## Additional Resources

- **Full Architecture Document**: `planning/VALIDATION_ARCHITECTURE.md`
- **Test Strategy**: `planning/AGENT_COORDINATION_TEST_STRATEGY.md` (SI-05, TD-05)
- **Next Steps**: `test-results/next-steps.md` (lines 114-209)
- **CLAUDE.md Template**: Defines coordination requirements

---

## Contact & Support

**Architecture Owner**: System Architect Agent
**Implementation Team**: Coder + Tester agents
**Review Team**: Reviewer + Security Specialist agents

**For Questions**:
- Architecture questions → System Architect
- Implementation questions → Coder agents
- Testing questions → Tester agents

---

**Document Status**: ✅ Ready for Implementation
**Last Updated**: 2025-09-30
**Version**: 1.0

