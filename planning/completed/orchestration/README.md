# Redis Agent Coordination - Planning Directory

**Epic:** System-Wide Redis Agent Coordination
**Epic ID:** redis-coord-2025-001
**Status:** Phase 1 Complete → Ready for Phase 2 ✅

---

## Directory Contents

### Planning Documents

📋 **redis-coordination-epic.json**
- CFN epic configuration file
- 6 phases, 30 agents, 3-4 weeks
- Mode: Standard (75% gate, 90% consensus)
- Complete phase breakdown with deliverables and acceptance criteria

📊 **IMPLEMENTATION_ROADMAP.md**
- Detailed phase-by-phase implementation guide
- Implementation steps, code samples, acceptance criteria
- Risk assessment and mitigation strategies
- Success metrics and monitoring plan
- Resource requirements and dependencies

### Technical Documentation

🔧 **redis-agent-dependencies.md**
- Complete Redis coordination patterns
- Hierarchical coordinator broadcast (1:many)
- Mesh hybrid LPUSH+SET (peer-to-peer)
- BLPOP vs GET polling comparison
- Topology decision guide

📝 **spawn-pattern-examples.md**
- Real-world spawn examples
- Research task (hierarchical)
- Security fix (sequential)
- Feature implementation (mesh)
- Performance optimization (parallel)

### Test Documentation

✅ **test-hierarchical-coordinator.md**
- 4-agent hierarchical test (Researcher → Coordinator → Analyzer + Architect)
- Coordinator broadcast pattern verification
- Expected output and verification steps

✅ **test-mesh-hybrid.md**
- 3-agent mesh test (Researcher → Analyzer + Architect, no coordinator)
- LPUSH+SET hybrid pattern verification
- BLPOP vs GET polling comparison

✅ **test-redis-agent-wait.md**
- Basic 3-agent sequential wait test
- BLPOP blocking behavior verification
- Initial pattern validation

---

## Quick Start

### Review Planning Documents

1. **Start with:** `IMPLEMENTATION_ROADMAP.md`
   - Understand overall architecture
   - Review phase-by-phase plan
   - Check resource requirements

2. **Then review:** `redis-coordination-epic.json`
   - Detailed phase deliverables
   - Agent estimates
   - Acceptance criteria

### Review Technical Patterns

3. **Study patterns:** `redis-agent-dependencies.md`
   - Understand LPUSH/BLPOP mechanics
   - Learn hierarchical vs mesh patterns
   - Review topology decision guide

4. **See examples:** `spawn-pattern-examples.md`
   - Real-world usage patterns
   - Different task types
   - Coordinator integration

### Verify Tests

5. **Run tests:**
   ```bash
   # Hierarchical pattern (recommended)
   # Follow: test-hierarchical-coordinator.md

   # Mesh pattern (optional)
   # Follow: test-mesh-hybrid.md
   ```

---

## Architecture Summary

### Current Problem
- File-based coordination (race conditions, no ordering)
- No explicit dependency management
- Cannot scale beyond 5-7 agents
- Difficult to debug

### Solution
```
Main Chat (Thin Layer)
  ↓
  Spawn: coordinator + agents (single message)
  ↓
Coordinator + Agents communicate via Redis
  ↓
Redis Lists (LPUSH/BLPOP) for guaranteed delivery
```

### Two Patterns

**Hierarchical (1:Many Dependencies)**
```
Producer → Coordinator ─┬→ Consumer 1
                        ├→ Consumer 2
                        └→ Consumer N
```
- Use for: 3+ agents, complex workflows
- Coordinator broadcasts to separate inboxes
- Solves BLPOP destructive consumption

**Mesh Hybrid (Peer-to-Peer)**
```
Producer ─┬→ Consumer 1 (BLPOP)
          └→ Consumer 2 (GET)
```
- Use for: 2-5 agents, simple topologies
- LPUSH + SET from producer
- First consumer: BLPOP (efficient)
- Additional: GET (polling)

---

## Implementation Phases

### Phase 1: Templates & Coordinators (3-5 days)
- Create Redis coordination templates
- Update coordinator agents with topology-aware patterns
- **Status:** Ready to start

### Phase 2: CLI Integration (4-6 days)
- Modify spawn-workers.js to auto-inject Redis coordination
- Add --topology and --dependencies flags
- **Depends on:** Phase 1

### Phase 3: CFN Loop Integration (5-7 days)
- Integrate Redis into Loop 3→2→4
- Mode-specific patterns (MVP/Standard/Enterprise)
- **Depends on:** Phases 1, 2

### Phase 4: Validation & Monitoring (3-4 days)
- Post-spawn validation hooks
- Runtime monitoring scripts
- **Depends on:** Phases 2, 3

### Phase 5: Documentation & Testing (4-5 days)
- Runbook, migration guide
- Integration test suite
- **Depends on:** Phases 3, 4

### Phase 6: Rollout (2-3 weeks)
- Gradual production rollout
- Monitoring and iteration
- **Depends on:** All phases

**Total:** 3-4 weeks, 30 agents

---

## Key Decisions Made

✅ **Use Redis Lists (LPUSH/BLPOP), not Pub/Sub**
- Reason: Guaranteed delivery, blocking wait, no missed messages
- BLPOP blocks efficiently (no polling overhead)

✅ **Two Patterns: Hierarchical + Mesh**
- Hierarchical for 3+ agents (coordinator broadcasts)
- Mesh for 2-5 agents (peer-to-peer LPUSH+SET)
- Auto-detect based on agent count and dependency graph

✅ **Main Chat = Thin Orchestration Layer**
- Spawn coordinator + agents in single message
- Coordinator handles all Redis coordination
- Main chat waits for coordinator summary

✅ **CFN Loop Integration Critical**
- Loop 3→2→4 coordination via Redis
- Mode-specific patterns and thresholds
- Inter-loop signaling for autonomous execution

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Coordination Reliability | 99%+ message delivery |
| Latency | BLPOP < 10ms average |
| Throughput | 100+ agents concurrent |
| Coverage | 100% multi-agent spawns |
| Validation Rate | 95%+ pass validation |
| Rollback Rate | < 5% workflows |

---

## Testing Status

| Test | Status | Location |
|------|--------|----------|
| LPUSH/BLPOP basics | ✅ Passed | test-redis-agent-wait.md |
| Hierarchical coordinator | ✅ Passed | test-hierarchical-coordinator.md |
| Mesh hybrid | ✅ Passed | test-mesh-hybrid.md |
| Bidirectional feedback | ✅ Passed | test-bidirectional-feedback.md |
| Collaborative waiting | ✅ Passed | test-collaborative-waiting.md |
| CFN Loop integration | ⏳ Pending | Phase 3 |
| Full integration suite | ⏳ Pending | Phase 5 |

---

## Next Steps

1. ✅ Planning complete (Phase 0)
2. ✅ Documentation complete (Phase 0)
3. ✅ Patterns tested (Phase 0)
4. ✅ Phase 1 complete (Templates & Coordinators)
5. ⏳ **Next:** Launch Phase 2 (CLI Integration)

To begin implementation:
```bash
# Launch CFN Loop epic
/cfn-loop-epic "System-Wide Redis Agent Coordination" --mode=standard

# Or launch by phase
/cfn-loop-single "Phase 1: Templates & Core Coordination Patterns" --mode=standard
```

---

## Questions & Support

**Architecture Questions:**
- Review: `redis-agent-dependencies.md` (patterns)
- Review: `IMPLEMENTATION_ROADMAP.md` (phases)

**Implementation Questions:**
- Review: `redis-coordination-epic.json` (deliverables)
- Review: `spawn-pattern-examples.md` (examples)

**Testing Questions:**
- Review: `test-*.md` files (test procedures)

---

**Last Updated:** 2025-10-16
**Status:** Ready for Phase 1 Implementation
