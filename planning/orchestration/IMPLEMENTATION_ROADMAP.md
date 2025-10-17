# Redis Agent Coordination - Implementation Roadmap

**Epic:** System-Wide Redis Agent Coordination
**Epic ID:** redis-coord-2025-001
**Mode:** Standard (75% gate, 90% consensus, 4 validators, 10 iterations)
**Status:** 🟢 Phase 4 Complete - CFN Loop Integration
**Estimated Duration:** 3-4 weeks
**Updated:** 2025-10-17 (Phase 4 CFN Loop Redis coordination complete)

---

## Executive Summary

Replace all file-based agent coordination with Redis lists (LPUSH/BLPOP) system-wide. Implement two patterns:
1. **Hierarchical** - Coordinator broadcasts for 1:many dependencies (3+ agents)
2. **Mesh Hybrid** - Peer-to-peer LPUSH+SET for simple topologies (2-5 agents)

**Current State:** Documentation complete, both patterns tested and verified working
**Target State:** Zero file-based coordination, all agents use Redis, CFN Loop integrated

---

## Architecture Overview

### Current Problem
- Agents coordinate via file writes (race conditions, no ordering guarantees)
- No explicit dependency management
- Difficult to debug coordination issues
- Cannot scale beyond 5-7 agents

### Solution
```
Main Chat (Thin Layer)
  ↓
  Spawn: coordinator + agents (single message)
  ↓
Coordinator + Agents communicate via Redis
  ↓
Redis Lists (LPUSH/BLPOP) for coordination
```

### Coordination Patterns

**Pattern 1: Hierarchical (1:Many)**
```
Researcher → Coordinator ─┬→ Analyzer (inbox)
                          ├→ Architect (inbox)
                          └→ Security (inbox)
```
- Coordinator receives from producer
- Broadcasts to separate inboxes
- Scales to N dependents
- Use for: 3+ agents, complex workflows

**Pattern 2: Mesh Hybrid (Peer-to-Peer)**
```
Researcher ─┬→ Analyzer (BLPOP)
            └→ Architect (GET)
```
- Producer does LPUSH + SET
- First consumer: BLPOP (efficient)
- Additional: GET (polling)
- Use for: 2-5 agents, simple topologies

---

## Phase-by-Phase Implementation

### Phase 1: Templates & Core Coordination Patterns (3-5 days)

**Objective:** Create reusable templates and update coordinator agents

**Deliverables:**
1. `.claude/templates/redis-coordination.md` - Injectable template
2. `.claude/templates/agent-spawn-template.md` - Updated spawn template
3. Update coordinators:
   - `.claude/agents/cfn-loop/cfn-coordinator-unified.md`
   - `.claude/agents/coordinators/coordinator-hybrid.md`
   - `.claude/agents/coordinators/adaptive-coordinator-enhanced.md`
4. Topology detection logic (agent count → pattern selection)
5. Broadcast pattern for hierarchical coordinators

**Implementation Steps:**

```markdown
1. Create Redis Coordination Template
   - Mandatory Redis channel declaration
   - Dependency wait patterns (BLPOP)
   - Completion signal (LPUSH)
   - Timeout handling
   - Error recovery

2. Update Coordinator Agents
   - Add topology detection section
   - Add hierarchical broadcast logic
   - Add mesh hybrid logic
   - Add monitoring and aggregation
   - Add timeout/error handling

3. Test Pattern Selection
   - 1:1 → Simple LPUSH/BLPOP
   - Chain (A→B→C) → Sequential LPUSH/BLPOP
   - 1:Many (A→B,C,D) → Hierarchical broadcast
   - Mesh (2-5) → Hybrid LPUSH+SET
```

**Acceptance Criteria:**
- [x] Redis coordination template created and tested
- [ ] All coordinator agents include topology-aware Redis patterns
- [ ] Hierarchical broadcast pattern verified working (✅ tested manually)
- [ ] Mesh hybrid pattern verified working (✅ tested manually)
- [ ] Documentation complete with examples

**Agents:** architect (1), coder (2), reviewer (1) = 4 agents

---

### Phase 2: CLI Spawning Integration ✅ COMPLETE (1 day, 2025-10-17)

**Objective:** Auto-inject Redis coordination into spawned agents via CLI

**Status:** ✅ Complete with coordinator-based pattern

**Deliverables Completed:**
1. ✅ `src/cli/hybrid-routing/spawn-workers.js` modifications:
   - ✅ `--topology` flag (sequential, bidirectional, collaborative, release-gate)
   - ✅ `--dependencies` flag (graph parsing)
   - ✅ Coordinator spawning for non-sequential topologies
   - ✅ Topology-specific worker instructions
   - ✅ Dependency inference logic (3-tier priority)
2. ✅ Redis coordination injection via `generateTopologyInstructions()`
3. ✅ Coordinator manages Redis complexity, workers signal completion

**Implementation Steps:**

```javascript
// spawn-workers.js modifications

1. Add Redis Injection Function
function injectRedisCoordination(agentPrompt, config) {
  const { taskId, agentRole, dependencies, topology } = config;

  // Build wait pattern based on dependencies
  const waitCommands = dependencies.map(dep =>
    `timeout 300 redis-cli --csv blpop "swarm:${taskId}:${dep}:done" 0`
  ).join('\n');

  // Inject Redis section
  const redisSection = `
## MANDATORY REDIS COORDINATION

**Channel:** swarm:${taskId}:${agentRole}

**Dependencies:**
${dependencies.length > 0 ? waitCommands : 'None - can start immediately'}

**Completion Signal:**
Use Bash tool:
redis-cli lpush "swarm:${taskId}:${agentRole}:done" '{
  "agent": "${agentRole}",
  "confidence": 0.XX,
  "result": "..."
}'
`;

  return agentPrompt + '\n\n' + redisSection;
}

2. Add CLI Flags
--topology=hierarchical|mesh (default: auto-detect)
--dependencies='{"analyst":["researcher"],"architect":["researcher","analyst"]}'

3. Auto-Topology Detection
if (agentCount <= 2) topology = 'simple';
else if (agentCount <= 5) topology = 'mesh';
else topology = 'hierarchical';

4. Coordinator Injection (if hierarchical)
- Inject broadcast logic to coordinator
- Map agent outputs to coordinator inbox
- Map coordinator broadcasts to agent inboxes
```

**Acceptance Criteria:**
- [x] CLI spawning auto-injects Redis coordination ✅
- [x] Topology flag controls coordination pattern ✅
- [x] Coordinator handles BLPOP/LPUSH complexity ✅
- [x] Channel naming follows convention (swarm:topology:agent:event) ✅
- [x] All 3 topologies tested with coordinator agent ✅
- [x] Documentation complete (5 planning docs created) ✅

**Key Learnings from Phase 2:**
1. Hub-and-spoke pattern required (coordinator orchestrates, workers signal)
2. Polling loops prevent coordinator early exit
3. Topology-specific worker instructions needed (release-gate)
4. CLI spawning provides full visibility (vs Task tool silent execution)
5. Use coordinator/analyst agents for testing (not generic tester)

**Agents:** analyst (1), architect (1), coder (2), tester (1) = 5 agents

---

### Phase 3: Advanced Coordination Patterns ✅ COMPLETE (1 day, 2025-10-17)

**Objective:** Production-ready enhancements based on Phase 2 learnings

**Status:** ✅ Complete 2025-10-17

**Why Phase 3 Changed:**
Phase 2 testing revealed critical production readiness gaps:
- Timeout handling (2-min default insufficient for complex tasks)
- Background execution (long-running coordination needs it)
- Error recovery (no worker failure handling)
- Monitoring (debugging coordination requires visibility)
- Performance (polling loops inefficient)

**Original Phase 3 (CFN Loop) deferred to Phase 4** - Stable foundation needed first.

**Deliverables Completed:**
1. ✅ Topology-specific timeouts (sequential: 2min, bidirectional: 5min, collaborative/release-gate: 6min)
2. ✅ Background execution mode (--background flag, immediate return, Redis monitoring)
3. ✅ Error recovery & worker failure handling (coordinator detects failures, partial completion)
4. ✅ Real-time monitoring dashboard (scripts/monitor-swarm-coordination.sh)
5. ✅ Performance optimization (BRPOPLPUSH/BLPOP instead of polling)
6. ✅ Comprehensive testing documentation (tests/manual/test-phase-3-enhancements.md)

**Files Modified:**
- `src/cli/hybrid-routing/spawn-workers.js` (+200 lines)

**Files Created:**
- `scripts/monitor-swarm-coordination.sh` (real-time monitoring)
- `tests/manual/test-phase-3-enhancements.md` (test scenarios)

**Backlog Item Added:**
- Integrate CLI monitoring dashboard with existing web dashboard to eliminate duplication

**Agents:** N/A (infrastructure enhancements via subagents)

---

### Phase 4: CFN Loop Integration ✅ COMPLETE (5-7 days)

**Objective:** Integrate Redis coordination into CFN Loop (Loops 3→2→4)

**Status:** ✅ Completed 2025-10-17

**Deliverables:**
1. Update `.claude/cfn-loop-rules.md`:
   - Loop 3: Workers coordinate via Redis
   - Loop 2: Validators wait for Loop 3 completion
   - Loop 4: Product Owner decision based on Redis state
2. Mode-specific patterns:
   - MVP: 2-3 workers, simple chain
   - Standard: 3-5 workers, mesh with coordinator
   - Enterprise: 5-8 workers, hierarchical broadcast
3. Inter-loop signaling (Loop 3 → Loop 2 → Loop 4)

**Implementation Steps:**

```markdown
1. Loop 3 Integration (Primary Swarm)
   - Workers execute tasks
   - Each worker: redis-cli lpush "swarm:cfn:loop3:worker{N}:done" '{...}'
   - Coordinator aggregates: Wait for all workers
   - Gate check: Average confidence ≥ mode threshold
   - Signal Loop 2: redis-cli lpush "swarm:cfn:loop3:complete" '{...}'

2. Loop 2 Integration (Consensus Validation)
   - Wait for Loop 3: redis-cli blpop "swarm:cfn:loop3:complete" 0
   - Spawn validators (2-5 based on mode)
   - Each validator: redis-cli lpush "swarm:cfn:loop2:validator{N}:done" '{...}'
   - Coordinator aggregates consensus
   - Consensus check: Average ≥ mode threshold
   - Signal Loop 4: redis-cli lpush "swarm:cfn:loop2:complete" '{...}'

3. Loop 4 Integration (Product Owner Decision)
   - Wait for Loop 2: redis-cli blpop "swarm:cfn:loop2:complete" 0
   - Read Loop 3 gate results
   - Read Loop 2 consensus results
   - Execute GOAP decision (PROCEED/DEFER/ESCALATE)
   - If PROCEED: Signal next phase
   - If DEFER: Store concerns, continue
   - If ESCALATE: Return to main chat

4. Mode-Specific Patterns
   MVP:
   - Gate: 0.70, Consensus: 0.85
   - 2 workers, 2 validators
   - Simple chain coordination

   Standard:
   - Gate: 0.75, Consensus: 0.90
   - 3-5 workers, 4 validators
   - Mesh with coordinator

   Enterprise:
   - Gate: 0.75, Consensus: 0.95
   - 5-8 workers, 4 validators
   - Hierarchical broadcast
   - Loop 0.5 planning phase
```

**Acceptance Criteria:**
- [ ] CFN Loop coordinators use Redis for all loops
- [ ] Loop 3 workers coordinate via Redis
- [ ] Loop 2 validators wait for Loop 3 completion
- [ ] Loop 4 PO decision based on Redis consensus state
- [ ] Mode-specific patterns work correctly
- [ ] Full CFN Loop test passes with Redis coordination

**Agents:** architect (1), coder (3), tester (1), validator (1) = 6 agents

---

### Phase 4: Validation & Monitoring (3-4 days)

**Objective:** Create validation hooks and monitoring tools

**Deliverables:**
1. `config/hooks/post-spawn-validation.js` - Validate Redis patterns
2. `scripts/monitor-swarm-redis.sh` - Runtime monitoring
3. Validation checks:
   - LPUSH/BLPOP (not publish/subscribe)
   - Timeout values reasonable (60-1800s)
   - Completion signals include confidence
4. Monitoring:
   - Stale keys detection (agents never completed)
   - Timeout alerts
   - Message flow tracking (who's waiting for whom)

**Implementation Steps:**

```javascript
// config/hooks/post-spawn-validation.js

1. Validate Redis Pattern Usage
   - Check for "redis-cli lpush" (not publish)
   - Check for "redis-cli blpop" (not subscribe)
   - Verify timeout values present
   - Verify channel naming convention

2. Validate Dependencies
   - Check all dependencies declared
   - Verify BLPOP targets exist
   - Check for circular dependencies

3. Validate Completion Signals
   - Check lpush on completion
   - Verify confidence field present
   - Check result/findings field present

// scripts/monitor-swarm-redis.sh

1. Monitor Active Coordination
   - redis-cli keys "swarm:*"
   - List all active coordination channels
   - Show last update time for each

2. Detect Stale Keys
   - Find keys older than expected duration
   - Alert on potential timeouts
   - Suggest cleanup commands

3. Track Message Flow
   - Show dependency graph
   - Highlight blocked agents (waiting)
   - Show completed agents
```

**Acceptance Criteria:**
- [ ] Post-spawn validation catches Redis pattern violations
- [ ] Monitoring detects stale keys and timeouts
- [ ] Error handling recovers from common failures
- [ ] Alerts trigger on coordination issues
- [ ] Documentation includes troubleshooting guide

**Agents:** coder (2), tester (1), security-specialist (1) = 4 agents

---

### Phase 5: Documentation & Testing (4-5 days)

**Objective:** Comprehensive documentation and integration tests

**Deliverables:**
1. `docs/redis-coordination-runbook.md`:
   - Quick start guide
   - Debugging common issues
   - Pattern selection guide
   - Troubleshooting flowcharts
2. `readme/additional-commands.md` - Updated with Redis examples
3. `tests/integration/test-redis-coordination.js` - Full test suite
4. `tests/manual/test-cfn-loop-redis.md` - Manual CFN Loop test
5. Migration guide for existing workflows
6. Performance benchmarks

**Test Coverage:**
```javascript
// Integration test scenarios

1. Simple Chain (A→B→C)
   - No coordinator needed
   - Sequential LPUSH/BLPOP
   - Verify order

2. 1:Many Hierarchical (A→B,C,D)
   - Coordinator broadcast
   - All dependents receive data
   - No BLPOP destructive issue

3. Mesh Hybrid (A→B,C)
   - LPUSH + SET from producer
   - BLPOP by first consumer
   - GET by additional consumers

4. CFN Loop 3→2→4
   - Loop 3 workers coordinate
   - Loop 2 waits for Loop 3
   - Loop 4 makes decision
   - Mode-specific thresholds

5. Timeout Handling
   - Agent doesn't complete
   - Timeout triggers
   - Error recovery

6. Connection Failure
   - Redis disconnects
   - Retry logic works
   - Fallback to polling
```

**Acceptance Criteria:**
- [ ] Runbook complete with troubleshooting steps
- [ ] All examples updated with Redis patterns
- [ ] Integration test suite passes (95%+ coverage)
- [ ] Manual CFN Loop test documented and verified
- [ ] Migration guide helps teams adopt Redis coordination
- [ ] Performance benchmarks show BLPOP efficiency (< 10ms latency)

**Agents:** analyst (1), coder (1), tester (2), api-docs (1) = 5 agents

---

### Phase 6: Rollout & Production Testing (2-3 weeks)

**Objective:** Gradual rollout to production with monitoring

**Rollout Schedule:**

**Week 1: MVP Mode (Opt-In)**
- Deploy coordinator agents with Redis patterns
- Enable for MVP mode only
- Monitoring dashboard active
- User feedback collection

**Week 2: CLI Integration (Beta)**
- Enable CLI auto-injection (opt-in flag)
- Test with real workflows
- Performance monitoring
- Bug fixes and iteration

**Week 3: Standard Mode**
- Enable CFN Loop coordination
- Standard mode deployment
- Validation hooks active
- Full monitoring

**Week 4: Enterprise Mode + Full Rollout**
- Enterprise mode deployment
- Remove opt-in flags (default enabled)
- Full production rollout
- Continuous monitoring

**Rollback Plan:**
```bash
# If critical issues:
1. Disable CLI auto-injection
2. Revert coordinator agents
3. Fallback to file-based coordination
4. Investigate issues
5. Fix and redeploy
```

**Acceptance Criteria:**
- [ ] MVP mode production deployment successful
- [ ] Standard mode production deployment successful
- [ ] Enterprise mode production deployment successful
- [ ] Zero critical incidents during rollout
- [ ] Performance metrics meet targets (BLPOP < 10ms)
- [ ] User feedback positive (coordination more reliable)
- [ ] Rollback plan tested and documented

**Agents:** coordinator (1), analyst (1), coder (1), tester (1), validator (1), devops-engineer (1) = 6 agents

---

## Risk Assessment & Mitigation

| Risk | Severity | Probability | Mitigation | Owner |
|------|----------|-------------|------------|-------|
| Agents ignore Redis commands | High | Medium | Post-spawn validation, explicit Bash usage, monitoring | Phase 4 |
| Redis connection failures | High | Low | Retry logic, fallback polling, monitoring | Phase 4 |
| Coordinator not broadcasting | High | Medium | Integration tests, validation, templates | Phase 1 |
| Performance degradation | Medium | Low | BLPOP preferred, benchmarking, optimization | Phase 5 |
| Complex dependencies break | Medium | Medium | Topology auto-detection, error messages | Phase 2 |
| Migration disrupts workflows | Medium | Medium | Gradual rollout, opt-in, rollback plan | Phase 6 |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Coordination Reliability | 99%+ | Message delivery success rate |
| Latency | < 10ms | BLPOP wait time average |
| Throughput | 100+ agents | Concurrent agents coordinating |
| Coverage | 100% | Multi-agent spawns using Redis |
| Validation Rate | 95%+ | Pass post-spawn validation |
| Rollback Rate | < 5% | Workflows requiring rollback |

---

## Resources & Dependencies

**Team:**
- 30 agents total across 6 phases
- Mix: architects (4), coders (9), testers (7), validators (2), specialists (8)

**Infrastructure:**
- Redis server (running and accessible)
- Node.js environment
- Bash shell support
- SQLite memory system (existing)
- CFN Loop infrastructure (existing)

**Key Files:**
```
.claude/
├── redis-agent-dependencies.md (✅ complete)
├── spawn-pattern-examples.md (✅ complete)
├── templates/
│   ├── redis-coordination.md (Phase 1)
│   └── agent-spawn-template.md (Phase 1)
├── agents/
│   ├── cfn-loop/cfn-coordinator-unified.md (Phase 1)
│   └── coordinators/ (Phase 1)
├── cfn-loop-rules.md (Phase 3)

src/cli/hybrid-routing/
└── spawn-workers.js (Phase 2)

config/hooks/
└── post-spawn-validation.js (Phase 4)

scripts/
└── monitor-swarm-redis.sh (Phase 4)

docs/
└── redis-coordination-runbook.md (Phase 5)

tests/
├── integration/test-redis-coordination.js (Phase 5)
└── manual/test-cfn-loop-redis.md (Phase 5)
```

---

## Next Steps

1. **Immediate:** Review and approve epic config
2. **Week 1:** Launch Phase 1 (Templates & Coordinators)
3. **Week 2:** Launch Phase 2 (CLI Integration)
4. **Week 3:** Launch Phase 3 (CFN Loop)
5. **Week 4:** Launch Phase 4 & 5 (Validation, Docs, Testing)
6. **Week 5-7:** Launch Phase 6 (Gradual Rollout)

---

## Supporting Documentation

Located in: `planning/orchestration/`

- ✅ `redis-agent-dependencies.md` - Full coordination patterns
- ✅ `spawn-pattern-examples.md` - Real-world examples
- ✅ `test-hierarchical-coordinator.md` - Hierarchical test
- ✅ `test-mesh-hybrid.md` - Mesh test
- ✅ `test-redis-agent-wait.md` - Basic wait test
- ✅ `redis-coordination-epic.json` - CFN epic config
- ✅ `IMPLEMENTATION_ROADMAP.md` - This document

---

**Status:** Ready for Phase 1 implementation
**Last Updated:** 2025-10-16
**Owner:** System Architecture Team
