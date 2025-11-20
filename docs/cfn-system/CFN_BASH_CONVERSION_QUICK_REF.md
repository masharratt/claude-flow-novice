# CFN Bash to TypeScript Conversion - Quick Reference

## At a Glance

| Metric | Value |
|--------|-------|
| Total Bash Scripts | 244 |
| Total Bash LOC | 51,558 |
| TypeScript Existing | 2,231 LOC |
| TypeScript Needed | 3,500-4,000 LOC |
| **Total Conversion Effort** | **346 hours (6-8 weeks)** |
| Team Size (Recommended) | 2-3 developers |
| Risk Level | Low-Medium (parallel implementation) |

---

## Priority Summary

### Phase 1: Critical Path (MUST DO)
**Timeline:** 3 weeks | **Effort:** 70 hours | **Scripts:** 13
- Agent Spawning (spawn-agent.sh, spawn-worker.sh, spawn-templates.sh)
- Core Orchestration wrappers
- Basic coordination
- Pre-edit hooks

**Business Impact:** Medium-High (affects CFN Loop reliability)
**Dependencies:** Must complete before Phase 2

### Phase 2: High Priority (SHOULD DO)
**Timeline:** 2 weeks | **Effort:** 99 hours | **Scripts:** 8
- Agent selection/classification
- Advanced validation
- Confidence calculation
- Output processing

**Business Impact:** High (improves code quality gates)
**Dependencies:** Phase 1 completion

### Phase 3: Medium Priority (NICE TO DO)
**Timeline:** 2 weeks | **Effort:** 88 hours | **Scripts:** 12
- Hook infrastructure
- Monitoring/logging
- Memory management
- Configuration

**Business Impact:** Medium (observability improvements)
**Dependencies:** Phase 1-2 completion

### Phase 4: Low Priority (OPTIONAL)
**Timeline:** 2 weeks | **Effort:** 89 hours | **Scripts:** 10
- Docker helpers
- Testing utilities
- Deployment helpers

**Business Impact:** Low (nice-to-have utilities)
**Dependencies:** Any phase

---

## Critical Path Scripts (17 Total)

### Agent Spawning (4 scripts)
```
.claude/skills/cfn-agent-spawning/
├── spawn-agent.sh          [282 LOC] → AgentSpawner.ts (16h)
├── spawn-worker.sh         [175 LOC] → WorkerSpawner.ts (12h)
├── spawn-templates.sh      [613 LOC] → TemplateEngine.ts (20h)
└── check-dependencies.sh   [29 LOC]  → DependencyChecker.ts (2h)
```

### Orchestration (2 scripts - 1 already converted)
```
.claude/skills/cfn-loop-orchestration/
├── orchestrate.sh          [182 LOC] → ALREADY orchestrate.ts (✓)
└── orchestrate-wrapper.sh  [278 LOC] → orchestrator-cli.ts (✓ - just needs testing)
```

### Coordination & Validation (4 scripts)
```
.claude/skills/cfn-*/
├── coordinate.sh           [245 LOC] → RedisCoordinator.ts (10h)
├── gate-check.sh           [145 LOC] → EXTENDED gate-checker.ts (✓)
├── parse-test-results.sh   [189 LOC] → ALREADY parse-test-results.ts (✓)
└── confidence-calculator.sh [98 LOC] → ConfidenceCalculator.ts (7h)
```

### File Lifecycle Hooks (5 scripts)
```
.claude/hooks/
├── cfn-invoke-pre-edit.sh       [109 LOC] → FileManager.preEditBackup() (8h)
├── cfn-invoke-post-edit.sh      [87 LOC]  → FileManager.postEditValidate() (7h)
├── cfn-pre-edit-backup.sh       [71 LOC]  → Included above (6h)
├── cfn-post-edit.sh             [61 LOC]  → Included above (4h)
└── cfn-restore-from-backup.sh   [69 LOC]  → FileManager.restore() (4h)
```

---

## What's Already Done

### ✅ Orchestration Core (696 LOC)
- orchestrate.ts - Main loop orchestration
- orchestrator-cli.ts - CLI interface (365 LOC)
- Full test coverage available

### ✅ Helpers (1,100+ LOC)
- gate-checker.ts (100% coverage)
- consensus.ts (100% coverage)
- parse-test-results.ts
- iteration-manager.ts
- redis-coordinator.ts (100% coverage)
- logger.ts (100% coverage)

### ✅ Docker Coordination (600+ LOC)
- cfn-docker-coordination/src/ - Complete TypeScript implementation

**Status:** Core orchestration is ~40% complete in TypeScript

---

## What Still Needs Conversion

### P1 Critical (50 hours)
1. Agent Spawner module (16h) - Process management, provider detection
2. Agent Selection module (24h) - Task classification, agent matching
3. Hooks module (8h) - File backup, restore, validation
4. Orchestration wrappers (2h) - Remaining CLI setup

### P2 High Priority (99 hours)
1. Output processing (20h)
2. Advanced validation (28h)
3. Docker coordination fallback (10h)
4. Memory management (8h)
5. Testing utilities (33h)

### P3 Medium Priority (88 hours)
1. Monitoring & logging (37h)
2. Hook infrastructure (29h)
3. Configuration management (18h)
4. Cleanup utilities (4h)

### P4 Low Priority (89 hours)
1. Docker helpers (40h)
2. Testing utilities (31h)
3. Deployment helpers (18h)

---

## Migration Pattern

### Recommended: Parallel Implementation

**Step 1:** Implement TypeScript module
```typescript
// src/spawning/agent-spawner.ts
export class AgentSpawner {
  async spawnAgent(config: AgentSpawnConfig): Promise<SpawnResult>
  async validateDependencies(): Promise<boolean>
  // ... other methods
}
```

**Step 2:** Create JavaScript wrapper that calls TypeScript
```bash
#!/usr/bin/env node
// .claude/skills/cfn-agent-spawning/spawn-agent.js
import { AgentSpawner } from '../../../dist/spawning/agent-spawner.js';

const spawner = new AgentSpawner();
const result = await spawner.spawnAgent(parseArgs(process.argv));
```

**Step 3:** Update references (optional, maintain backward compat)
```bash
# Old: source .claude/skills/cfn-agent-spawning/spawn-agent.sh
# New: node .claude/skills/cfn-agent-spawning/spawn-agent.js
#      OR just use: import { AgentSpawner } from 'dist/spawning/agent-spawner.js'
```

**Step 4:** Feature flag for gradual rollout
```typescript
if (process.env.USE_TYPESCRIPT_MIGRATION === 'true') {
  // Use new TypeScript implementation
} else {
  // Fallback to bash script
}
```

**Advantages:**
- Zero risk (can rollback to bash anytime)
- Allows incremental migration
- Enables A/B testing between implementations
- Team learns TypeScript patterns gradually
- No downtime during migration

---

## Team Organization

### Recommended Team Structure
```
Migration Lead (Architect)
├── Backend Specialist 1 (Agent Spawning + Coordination)
│   ├── Implement spawn-agent.ts (16h)
│   ├── Implement redis-coordinator wrapper (10h)
│   └── Testing & integration (12h)
│   └── Subtotal: 38h
│
└── Backend Specialist 2 (Selection + Validation)
    ├── Implement agent-selector.ts (24h)
    ├── Implement validation modules (15h)
    ├── Implement file-lifecycle module (12h)
    └── Testing & integration (12h)
    └── Subtotal: 63h
```

### Phase 1 Parallel Work (70 hours / 3 weeks)
```
Week 1:
  Specialist 1: Agent Spawning (Days 1-5) → 16 hours
  Specialist 2: Agent Selection (Days 1-4) → 16 hours
  Lead: Set up TypeScript module structure, review design
  
Week 2:
  Specialist 1: Coordination module (Days 1-3) → 10 hours
  Specialist 1: Testing & integration (Days 4-5) → 6 hours
  Specialist 2: File Lifecycle hooks (Days 1-4) → 8 hours
  Specialist 2: Validation modules (Days 5) → 5 hours
  
Week 3:
  Specialist 1: Integration testing & fixes → 8 hours
  Specialist 2: Integration testing & fixes → 8 hours
  Lead: Documentation, migration guide → 6 hours
```

---

## Testing Requirements

### Phase 1 Coverage Goals
- Unit tests: 35+ for agent spawner
- Unit tests: 30+ for agent selector
- Unit tests: 25+ for coordination
- Integration tests: 15+ for hooks
- **Total: 105+ new test cases**
- **Coverage Target: 90%+ lines, 85%+ branches**

### Example Test Pattern
```typescript
describe('AgentSpawner', () => {
  describe('happy path', () => {
    it('should spawn agent with valid config', async () => {
      const spawner = new AgentSpawner();
      const result = await spawner.spawnAgent({
        agentType: 'backend-dev',
        taskId: 'task-123',
        iteration: 1
      });
      
      expect(result.success).toBe(true);
      expect(result.processId).toBeDefined();
      expect(result.agentId).toMatch(/^agent-/);
    });
  });
  
  describe('error scenarios', () => {
    it('should fail with missing task ID', async () => {
      const spawner = new AgentSpawner();
      const result = await spawner.spawnAgent({
        agentType: 'backend-dev',
        taskId: '', // Invalid
        iteration: 1
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
  
  describe('edge cases', () => {
    it('should handle process cleanup on signal', async () => {
      // Test process.SIGTERM handling
    });
  });
});
```

---

## Risk Mitigation Strategies

### High Risk: Agent Spawning
**Risk:** Process crashes could fail entire CFN Loop
**Mitigations:**
- Comprehensive signal handling (SIGTERM, SIGKILL)
- Process group management with cleanup
- Process state validation before spawn
- Timeout detection and recovery
- Test: 15+ edge case scenarios

### High Risk: Coordination
**Risk:** Race conditions, deadlocks, message loss
**Mitigations:**
- Idempotent operations
- Timeout handling for all blocking operations
- Message persistence with retry logic
- Detailed debug logging
- Test: Concurrent agent execution, failure scenarios

### Medium Risk: File Lifecycle
**Risk:** Data loss if backup/restore fails
**Mitigations:**
- Atomic operations with transaction logs
- Integrity verification (SHA-256 hashing)
- Rollback capability for all operations
- Test: Backup/restore scenarios, corruption detection

### Medium Risk: Gate Checking
**Risk:** Incorrect decisions ship broken code
**Mitigations:**
- Multiple validation layers
- Audit logging of all decisions
- Consensus verification
- Test: All test result formats, boundary conditions

---

## Success Metrics

### Phase 1 Completion Criteria
- [ ] 0 bash scripts in critical path (spawn, coordinate, orchestrate)
- [ ] 200+ unit tests passing (90%+ coverage)
- [ ] Performance within 5% of bash baseline
- [ ] Zero test failures in full CFN Loop execution
- [ ] Deprecation notices on old bash scripts

### Phase 2-4 Completion Criteria
- [ ] All 244 bash scripts migrated (or deprecated)
- [ ] 300+ unit tests (80%+ average coverage)
- [ ] Unified TypeScript codebase
- [ ] Full documentation
- [ ] Zero security vulnerabilities

---

## Files & Paths

### Main Audit Report
`/mnt/c/Users/masha/Documents/claude-flow-novice/docs/CFN_BASH_TO_TYPESCRIPT_AUDIT.md` (1,017 lines)

### Implementation Location
`/mnt/c/Users/masha/Documents/claude-flow-novice/src/cfn-loop/` (Existing orchestration)
`/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-orchestration/src/` (New modules)

### Existing TypeScript (2,231 LOC)
```
.claude/skills/cfn-loop-orchestration/src/
├── orchestrate.ts              [696 LOC] ✓
├── cli/orchestrator-cli.ts     [365 LOC] ✓
├── helpers/
│   ├── gate-checker.ts         [115 LOC] ✓ (100% coverage)
│   ├── consensus.ts            [87 LOC]  ✓ (100% coverage)
│   ├── parse-test-results.ts   [372 LOC] ✓
│   ├── deliverable-verifier.ts [103 LOC] ✓
│   ├── iteration-manager.ts    [45 LOC]  ✓ (100% coverage)
│   └── timeout-calculator.ts   [41 LOC]
├── redis/redis-coordinator.ts  [72 LOC]  ✓ (100% coverage)
├── utils/logger.ts             [32 LOC]  ✓ (100% coverage)
└── types.ts                    [188 LOC]
```

---

## Recommended Next Steps

1. **Immediate (This Week)**
   - [ ] Review this audit with team
   - [ ] Identify 2-3 developers for migration team
   - [ ] Set up feature branch for Phase 1
   - [ ] Create TypeScript module template

2. **Short Term (Week 1-2)**
   - [ ] Begin Phase 1: Agent Spawning module
   - [ ] Establish testing patterns and coverage gates
   - [ ] Create CI/CD pipeline for new modules
   - [ ] Document API contracts

3. **Medium Term (Week 3-9)**
   - [ ] Execute Phase 1-4 according to timeline
   - [ ] Maintain 90%+ test coverage throughout
   - [ ] Perform weekly performance benchmarking
   - [ ] Collect team feedback on TypeScript patterns

4. **Long Term (After Week 9)**
   - [ ] Complete deprecation of bash scripts
   - [ ] Archive original bash implementations
   - [ ] Create unified TypeScript documentation
   - [ ] Plan TypeScript training for new team members

---

## Quick Decision Matrix

| Need | Decision |
|------|----------|
| Eliminate bash from critical path? | **Do Phase 1 (3 weeks, 70h)** |
| Improve code quality gates? | **Do Phase 2 (2 weeks, 99h)** |
| Better observability? | **Do Phase 3 (2 weeks, 88h)** |
| Complete TypeScript codebase? | **Do Phase 4 (2 weeks, 89h)** |
| Minimize risk/cost? | **Do Phase 1 only (3 weeks, 70h)** |
| Production-ready in 4 weeks? | **Do Phase 1 + Phase 2 (5 weeks, 169h)** |
| Complete migration? | **Do all phases (9 weeks, 346h)** |

---

## See Also

- Full Audit Report: `/docs/CFN_BASH_TO_TYPESCRIPT_AUDIT.md`
- Current TypeScript Implementation: `.claude/skills/cfn-loop-orchestration/src/`
- Test Coverage Report: `.claude/skills/cfn-loop-orchestration/TEST_COVERAGE_SUMMARY.md`
- CI/CD Integration: `docker/CI_CD_TEST_INTEGRATION.md`

