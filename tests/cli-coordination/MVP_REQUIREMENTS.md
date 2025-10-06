# CLI Coordination MVP Requirements
**Version**: 1.0
**Date**: 2025-10-05
**Objective**: Determine viability of bash-based agent coordination
**Timeline**: 7 days (1 week sprint)
**Success Criteria**: 80%+ test pass rate, <100ms overhead vs SDK

---

## Executive Summary

Build a **minimal viable prototype** of CLI-based agent coordination to validate:
1. Background process management works reliably
2. Inter-process communication is fast enough (<5ms)
3. Checkpoint/restore enables crash recovery
4. Signal-based control provides instant pause/resume
5. Mesh topology supports peer-to-peer coordination

**Goal**: Determine if CLI coordination is worth full implementation or if hybrid SDK+CLI is better path.

---

## MVP Scope

### ✅ In Scope (Must Have)

#### 1. Background Process Management
**Requirement**: Spawn 3+ bash agents, monitor output, capture exit codes

**Acceptance Criteria**:
- ✅ Spawn agents via `bash script.sh &` with PIDs captured
- ✅ Monitor output in real-time (file tailing or pipes)
- ✅ Detect agent completion and capture exit codes
- ✅ Cleanup processes on coordinator shutdown

**Test**:
```bash
# Spawn 3 agents
spawn_agent agent-1 coder "implement feature"
spawn_agent agent-2 tester "write tests"
spawn_agent agent-3 reviewer "review code"

# Monitor all 3
monitor_agents  # Show real-time progress

# Wait for completion
wait_all_agents  # Exit codes: 0, 0, 0 (success)
```

**Success**: All 3 agents complete, exit codes captured, no orphans

---

#### 2. Simple File-Based IPC (Fallback from Pipes)
**Requirement**: Agent-to-coordinator communication via shared files

**Acceptance Criteria**:
- ✅ Agent writes status to `/dev/shm/agent-${ID}/status.json`
- ✅ Coordinator polls status every 100ms (acceptable latency)
- ✅ Messages delivered reliably (no data loss)
- ✅ Atomic writes via `mv temp.json status.json`

**Test**:
```bash
# Agent writes progress
echo '{"progress": 50, "message": "Working..."}' > /tmp/status.tmp
mv /tmp/status.tmp /dev/shm/agent-1/status.json

# Coordinator reads
cat /dev/shm/agent-1/status.json
# {"progress": 50, "message": "Working..."}
```

**Success**: 100% message delivery, <200ms latency (polling overhead)

**Why File-Based**: Named pipes deadlock in Test 2 - too complex for MVP

---

#### 3. Basic Checkpoint/Restore
**Requirement**: Save agent state, restore after simulated crash

**Acceptance Criteria**:
- ✅ Agent saves state to JSON checkpoint every 5 seconds
- ✅ Checkpoint includes: phase, tasks_completed, confidence, context
- ✅ Restore agent from checkpoint after kill -9
- ✅ Restored agent continues from last checkpoint

**Test**:
```bash
# Agent runs and checkpoints
spawn_agent agent-1 coder "long task"
sleep 8  # Let it checkpoint 1-2 times

# Simulate crash
kill -9 $(get_pid agent-1)

# Restore from checkpoint
restore_agent agent-1
# [agent-1] Restored from checkpoint: phase=implementation, tasks=3
```

**Success**: Agent resumes from checkpoint, no work lost

---

#### 4. Signal-Based Pause/Resume
**Requirement**: Pause/resume agents with SIGSTOP/SIGCONT

**Acceptance Criteria**:
- ✅ SIGSTOP pauses agent instantly (0ms latency)
- ✅ Agent produces no output while paused (verified)
- ✅ SIGCONT resumes agent exactly where it left off
- ✅ State preserved across multiple pause/resume cycles

**Test**:
```bash
# Start agent
spawn_agent agent-1 coder "iterative task"

# Pause
kill -STOP $(get_pid agent-1)
# Agent frozen at kernel level

# Verify paused (no new output)
sleep 2
assert_no_new_output agent-1

# Resume
kill -CONT $(get_pid agent-1)
# Agent continues immediately
```

**Success**: Pause/resume works, state preserved, 0ms latency

---

#### 5. 2-Agent Coordination (Simplified Mesh)
**Requirement**: Two agents coordinate via file messages

**Acceptance Criteria**:
- ✅ Agent A sends message to Agent B via shared file
- ✅ Agent B receives and acknowledges message
- ✅ Bidirectional communication works (A→B, B→A)
- ✅ No message loss or corruption

**Test**:
```bash
# Agent A sends task to Agent B
mkdir -p /dev/shm/messages
echo "TASK:implement-auth" > /dev/shm/messages/a-to-b.txt

# Agent B reads and responds
cat /dev/shm/messages/a-to-b.txt  # TASK:implement-auth
echo "COMPLETED:implement-auth" > /dev/shm/messages/b-to-a.txt

# Agent A receives acknowledgment
cat /dev/shm/messages/b-to-a.txt  # COMPLETED:implement-auth
```

**Success**: Messages delivered both directions, no data loss

---

### ❌ Out of Scope (Nice to Have)

These features are explicitly **excluded from MVP** to reduce complexity:

- ❌ Named pipe bidirectional IPC (deadlock issues in Test 2)
- ❌ Agent pooling / warm starts (optimization, not viability blocker)
- ❌ Content-addressed storage (optimization)
- ❌ Multi-hop mesh routing (3+ agents, complex)
- ❌ Byzantine consensus voting (can use simple majority)
- ❌ cgroups resource limits (platform-specific)
- ❌ Incremental checkpoints (optimization)
- ❌ Context compression (optimization)

**Rationale**: MVP proves core viability. Optimizations come after viability confirmed.

---

## MVP Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   CLI Coordinator                       │
│  ┌────────────────────────────────────────────────┐    │
│  │  Main Process (bash)                           │    │
│  │  - Spawns agents via `bash agent.sh &`        │    │
│  │  - Monitors /dev/shm/agent-*/status.json      │    │
│  │  - Sends commands via /dev/shm/control/       │    │
│  │  - Manages checkpoints                         │    │
│  └────────────────────────────────────────────────┘    │
│         ↓ spawn             ↓ monitor                   │
│  ┌──────────────┐    ┌──────────────┐                  │
│  │  Agent 1     │    │  Agent 2     │                  │
│  │  (coder)     │←──→│  (tester)    │                  │
│  │              │    │              │                  │
│  │  Writes:     │    │  Writes:     │                  │
│  │  status.json │    │  status.json │                  │
│  │  checkpoint/ │    │  checkpoint/ │                  │
│  └──────────────┘    └──────────────┘                  │
│         File-based IPC via /dev/shm                     │
└─────────────────────────────────────────────────────────┘
```

### File Structure

```
/dev/shm/cfn-mvp/
├── control/                    # Coordinator → Agent commands
│   ├── agent-1.cmd            # Latest command for agent-1
│   └── agent-2.cmd            # Latest command for agent-2
├── status/                     # Agent → Coordinator status
│   ├── agent-1.json           # Agent 1 current status
│   └── agent-2.json           # Agent 2 current status
├── checkpoints/                # Crash recovery
│   ├── agent-1/
│   │   ├── current.json       # Latest checkpoint
│   │   └── previous.json      # Previous checkpoint (rollback)
│   └── agent-2/
│       └── current.json
├── messages/                   # Agent-to-agent messages
│   ├── agent-1-to-2.txt       # A→B communication
│   └── agent-2-to-1.txt       # B→A communication
└── logs/                       # Output logs
    ├── agent-1.log
    └── agent-2.log
```

---

## MVP Components

### Component 1: Coordinator Script

**File**: `mvp-coordinator.sh`

**Responsibilities**:
- Spawn agents as background processes
- Monitor agent status files (poll every 100ms)
- Send commands via control files
- Trigger checkpoints via signals
- Cleanup on shutdown

**API**:
```bash
./mvp-coordinator.sh init           # Setup /dev/shm structure
./mvp-coordinator.sh spawn agent-1 coder "task description"
./mvp-coordinator.sh status         # Show all agent statuses
./mvp-coordinator.sh pause agent-1  # Send SIGSTOP
./mvp-coordinator.sh resume agent-1 # Send SIGCONT
./mvp-coordinator.sh checkpoint agent-1  # Trigger checkpoint
./mvp-coordinator.sh shutdown       # Cleanup all agents
```

**Size**: ~200 lines of bash

---

### Component 2: Agent Script

**File**: `mvp-agent.sh`

**Responsibilities**:
- Execute agent logic (simulated work)
- Write status updates to `/dev/shm/status/agent-${ID}.json`
- Read commands from `/dev/shm/control/agent-${ID}.cmd`
- Checkpoint state every 5 seconds
- Handle SIGTERM gracefully

**API**:
```bash
./mvp-agent.sh agent-1 coder "implement auth"
# Runs in background, writes status, checkpoints periodically
```

**Status Format**:
```json
{
  "agent_id": "agent-1",
  "type": "coder",
  "phase": "implementation",
  "progress": 75,
  "confidence": 0.85,
  "message": "Implementing JWT validation",
  "timestamp": 1696512000
}
```

**Checkpoint Format**:
```json
{
  "agent_id": "agent-1",
  "timestamp": 1696512000,
  "phase": "implementation",
  "tasks_completed": 5,
  "current_task": "JWT validation",
  "confidence": 0.85,
  "context": {
    "files_modified": ["auth.ts", "token.ts"],
    "findings": ["Need refresh token logic"]
  },
  "can_resume": true
}
```

**Size**: ~150 lines of bash

---

### Component 3: Test Harness

**File**: `mvp-test.sh`

**Responsibilities**:
- Run all 5 MVP tests
- Measure performance (latency, throughput)
- Generate pass/fail report
- Calculate viability score

**Tests**:
1. `test_background_spawning()` - 3 agents spawn and complete
2. `test_file_ipc()` - File-based message delivery
3. `test_checkpoint_restore()` - State persistence after crash
4. `test_signal_control()` - SIGSTOP/SIGCONT pause/resume
5. `test_2agent_coordination()` - Agent-to-agent messaging

**Output**:
```
========================================
MVP Test Results
========================================
Test 1: Background Spawning     ✅ PASS (spawn: 250ms, cleanup: 100%)
Test 2: File-based IPC          ✅ PASS (latency: 150ms, reliability: 100%)
Test 3: Checkpoint/Restore      ✅ PASS (save: 80ms, restore: 50ms)
Test 4: Signal Control          ✅ PASS (pause: 0ms, resume: 0ms)
Test 5: 2-Agent Coordination    ✅ PASS (round-trip: 300ms)

Overall: 5/5 PASS (100%)
Viability: VIABLE ✅

Performance vs SDK:
- Spawn: 250ms (CLI) vs 50ms (SDK) = 5x slower
- IPC: 150ms (CLI) vs 1ms (SDK) = 150x slower
- Checkpoint: 80ms (CLI) vs 10ms (SDK) = 8x slower

Recommendation: Viable for 2-3 agents, consider hybrid for 5+ agents
```

**Size**: ~300 lines of bash

---

## Success Criteria

### Hard Requirements (Must Pass)

| Requirement | Target | Minimum Acceptable |
|-------------|--------|-------------------|
| **Test Pass Rate** | 100% (5/5) | 80% (4/5) |
| **Background Spawning** | <500ms | <1000ms |
| **IPC Latency** | <200ms | <500ms |
| **Checkpoint Save** | <100ms | <200ms |
| **Checkpoint Restore** | <100ms | <200ms |
| **Pause Latency** | 0ms | <10ms |
| **Process Cleanup** | 100% | 95% |
| **Message Reliability** | 100% | 95% |

### Soft Requirements (Nice to Have)

- Agent status updates < 100ms
- Coordinator memory usage < 50MB
- Handles 3+ concurrent agents
- Graceful shutdown on Ctrl+C

---

## Performance Benchmarks

### Baseline Targets (vs SDK)

| Metric | SDK Target | CLI MVP Target | Acceptable Gap |
|--------|-----------|----------------|----------------|
| Agent spawn | 50-100ms | 200-500ms | 5x slower OK |
| IPC latency | 0.3-1ms | 100-200ms | 200x slower OK |
| Checkpoint | 10-50ms | 50-200ms | 4x slower OK |
| Memory/agent | 50MB | 20MB | Better (CLI) |
| Max agents | 100+ | 3-5 (MVP) | N/A (scale later) |

**Rationale**: CLI is cost optimization, not performance optimization. 5x-200x slower is acceptable if $0 cost.

---

## Deliverables

### Code Artifacts

1. **`mvp-coordinator.sh`** (200 LOC)
   - Agent lifecycle management
   - Status monitoring
   - Command dispatch
   - Cleanup logic

2. **`mvp-agent.sh`** (150 LOC)
   - Agent execution loop
   - Status reporting
   - Checkpoint/restore
   - Signal handling

3. **`mvp-test.sh`** (300 LOC)
   - 5 automated tests
   - Performance benchmarks
   - Pass/fail report

**Total Code**: ~650 lines of bash

---

### Documentation

1. **`MVP_USAGE.md`** - How to run MVP
2. **`MVP_RESULTS.md`** - Test results and analysis
3. **`ARCHITECTURE.md`** - System design decisions
4. **`NEXT_STEPS.md`** - Recommendations based on results

---

### Test Reports

1. **Performance Report**
   - Latency measurements
   - Throughput metrics
   - Resource usage

2. **Viability Assessment**
   - Pass/fail analysis
   - Comparison to SDK
   - Recommendation (proceed/pivot/stop)

---

## Timeline

### Day 1-2: Core Infrastructure
- ✅ `mvp-coordinator.sh` - spawning, monitoring, cleanup
- ✅ `mvp-agent.sh` - basic execution loop, status reporting
- ✅ File structure setup (`/dev/shm/cfn-mvp/`)

**Deliverable**: Agents spawn and report status

---

### Day 3-4: Checkpointing & Signals
- ✅ Checkpoint save/restore logic
- ✅ SIGSTOP/SIGCONT signal handling
- ✅ Crash recovery test

**Deliverable**: Agents can pause/resume and survive crashes

---

### Day 5: Agent Coordination
- ✅ File-based IPC for agent-to-agent messages
- ✅ 2-agent coordination test
- ✅ Message reliability validation

**Deliverable**: Agents can communicate reliably

---

### Day 6: Testing & Benchmarking
- ✅ `mvp-test.sh` - all 5 tests automated
- ✅ Performance benchmarking
- ✅ Comparison to SDK baseline

**Deliverable**: Automated test suite with pass/fail results

---

### Day 7: Analysis & Recommendation
- ✅ `MVP_RESULTS.md` - detailed analysis
- ✅ Viability assessment (proceed/pivot/stop)
- ✅ Next steps recommendation

**Deliverable**: Go/no-go decision with data

---

## Risk Mitigation

### Risk 1: File-based IPC too slow
**Mitigation**: Use `/dev/shm` (tmpfs in RAM) instead of disk
**Fallback**: If >500ms latency, escalate to hybrid SDK approach

### Risk 2: Agent cleanup fails (orphans)
**Mitigation**: Process groups (`setsid`) + cleanup trap on signals
**Fallback**: Manual `pkill` script for emergency cleanup

### Risk 3: Checkpoint/restore unreliable
**Mitigation**: Atomic writes via `mv temp.json final.json`
**Fallback**: Simplify checkpoint format if corruption occurs

### Risk 4: Can't complete in 7 days
**Mitigation**: Cut scope to 3 tests (spawn, checkpoint, signals)
**Fallback**: Extend to 10 days OR pivot to hybrid approach

---

## Decision Criteria

### Go Decision (Proceed with Full CLI Implementation)

**Criteria**:
- ✅ 4/5 tests pass (80%+)
- ✅ IPC latency < 500ms (acceptable for coordination)
- ✅ Checkpoint/restore works reliably
- ✅ No blocking technical issues discovered

**Next Steps**: Proceed to full implementation (Phase 1-4, 14-18 days)

---

### Pivot Decision (Hybrid SDK + CLI)

**Criteria**:
- ⚠️ 2-3/5 tests pass (40-60%)
- ⚠️ IPC latency > 500ms (too slow)
- ⚠️ Technical complexity higher than expected
- ⚠️ File-based coordination unreliable

**Next Steps**: Adopt hybrid approach (SDK execution + CLI coordination)

---

### Stop Decision (Use Pure SDK)

**Criteria**:
- ❌ 0-1/5 tests pass (<20%)
- ❌ Fundamental technical blockers (deadlocks, corruption)
- ❌ Performance unacceptable (>1s latency)
- ❌ Engineering effort not worth cost savings

**Next Steps**: Use pure SDK with Z.ai routing for cost optimization

---

## Open Questions

### Q1: File-based IPC vs Named Pipes?
**Answer**: Start with file-based (simpler, more reliable). Named pipes if performance critical.

### Q2: Polling interval for status checks?
**Answer**: 100ms (10 checks/sec). Configurable if too slow/fast.

### Q3: How many agents for MVP?
**Answer**: 2-3 agents maximum. Scale testing comes after viability proven.

### Q4: tmpfs or disk for checkpoints?
**Answer**: tmpfs (`/dev/shm`) for speed. Disk optional for persistence.

### Q5: What if MVP fails?
**Answer**: Pivot to hybrid SDK+CLI (recommended backup plan).

---

## Success Metrics

### Quantitative

- **Test Pass Rate**: ≥80% (4/5 tests)
- **Performance**: Within 10x of SDK (acceptable for $0 cost)
- **Reliability**: 95%+ message delivery, 100% cleanup
- **Code Size**: <1000 LOC total

### Qualitative

- **Simplicity**: Can junior dev understand in <1 hour?
- **Debuggability**: Can trace issues via logs and status files?
- **Maintainability**: Clear code structure, minimal dependencies
- **Extensibility**: Easy to add features (pooling, mesh, etc.)?

---

## Post-MVP Path

### If MVP Succeeds (≥80% pass rate):

**Phase 1 (Week 2-3)**: Scale to 5 agents
- Add agent pooling (50-100ms warm start)
- Implement 3-5 agent mesh topology
- Optimize IPC (reduce latency to <100ms)

**Phase 2 (Week 4)**: Production Hardening
- Error recovery and retry logic
- Monitoring and metrics
- Documentation and examples

**Phase 3 (Month 2)**: Advanced Features
- Multi-level hierarchy (coordinator → workers)
- Content-addressed storage (deduplication)
- Consensus voting

---

### If MVP Fails (<80% pass rate):

**Immediate**: Pivot to Hybrid SDK + CLI
- Use SDK for agent execution (proven, fast)
- Use CLI for coordination metadata (topology, state)
- Leverage Z.ai routing for cost savings

**Timeline**: 7-10 days (faster than full CLI)

**Outcome**: 95% viability, $150/month cost, proven reliability

---

## Approval

### Stakeholder Sign-off

- [ ] **Technical Lead**: Architecture approved
- [ ] **Product Owner**: Scope and timeline approved
- [ ] **Engineering**: Resource allocation confirmed
- [ ] **QA**: Test criteria approved

### Go/No-Go Checkpoint

**Date**: End of Day 7
**Decision Point**: Proceed with full CLI OR pivot to hybrid
**Required Attendance**: Tech lead, product owner, lead engineer

---

## Appendix A: Quick Start

### Run MVP Tests

```bash
# Setup
cd /mnt/c/Users/masha/Documents/claude-flow-novice/tests/cli-coordination
chmod +x mvp-*.sh

# Run all tests
./mvp-test.sh

# Or run individually
./mvp-coordinator.sh init
./mvp-coordinator.sh spawn agent-1 coder "implement auth"
./mvp-coordinator.sh status
./mvp-coordinator.sh shutdown
```

---

## Appendix B: File Manifest

```
tests/cli-coordination/
├── MVP_REQUIREMENTS.md          # This document
├── mvp-coordinator.sh           # Coordinator process (200 LOC)
├── mvp-agent.sh                 # Agent process (150 LOC)
├── mvp-test.sh                  # Test harness (300 LOC)
├── MVP_USAGE.md                 # Usage instructions
├── MVP_RESULTS.md               # Test results (generated)
└── reports/
    ├── performance.json         # Benchmark data
    └── viability-assessment.md  # Final recommendation
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-05
**Author**: AI Architect (via swarm analysis)
**Status**: Ready for Implementation
**Estimated Effort**: 7 days (1 engineer)
