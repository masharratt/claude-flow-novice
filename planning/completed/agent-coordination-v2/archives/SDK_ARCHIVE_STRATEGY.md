# SDK Phases Archive Strategy

## ✅ ARCHIVE COMPLETE (2025-10-06)

**Planning Docs**: 27 SDK phase .md files archived to `planning/agent-coordination-v2/archives/sdk-phases-typescript/`
**Implementation Code**: 112 TypeScript v2 files archived to `src/coordination/archives/v2-sdk-typescript/`
**Shared Components**: Extracted to `src/coordination/shared/` (MessageBroker, TransparencySystem, interfaces)

---

## Executive Summary

**Context**: SDK phases (planning/agent-coordination-v2/sdk-phases/) contain **~19,000 lines** of TypeScript/SDK-based coordination planning. CLI coordination MVP proved **708 agents** work with pure bash + file-based IPC.

**Recommendation**: **Archive 90%** of SDK phase content. Keep only conceptual architecture and metrics that inform CLI production planning.

**Status**: ✅ Complete - both planning docs and implementation code archived

---

## Analysis Results

### What Exists in sdk-phases/

```
Total Files: 27 (0 implementation code, all planning docs)
Total Lines: ~19,000 lines of Markdown
Focus: TypeScript SDK-based coordination (session forking, query control, checkpoints)
Status: Planning only - NO IMPLEMENTATION
```

### What CLI Coordination Actually Uses

```
Implementation: Pure bash scripts (message-bus.sh, agent-wrapper.sh, mvp-coordinator.sh)
IPC Mechanism: File-based (/dev/shm tmpfs, flock for atomicity)
Topology: Hierarchical (1 coordinator → 50 workers) + Hybrid Mesh (7 coordinators × 100 workers)
Dependencies: Zero (no TypeScript, no SDK, no external libraries)
Proven Scale: 708 agents, 97.8% delivery, 20s coordination
```

### Critical Mismatch

| SDK Phase Concept | CLI Reality | Archive Decision |
|-------------------|-------------|------------------|
| **Session Forking** (parallel agent spawning via SDK) | Claude Code Task tool spawns agents directly | ❌ Archive (SDK-specific) |
| **Query Controller** (pause/resume/interrupt via SDK) | Not used - agents run to completion | ❌ Archive (SDK-specific) |
| **Checkpoint Manager** (state snapshots via SDK) | Not used - stateless agents | ❌ Archive (SDK-specific) |
| **Artifact Storage** (binary storage via SDK) | Not used - message files only | ❌ Archive (SDK-specific) |
| **Background Orchestrator** (BashOutput monitoring) | Not used - simple process spawning | ❌ Archive (SDK-specific) |
| **State Machine** (agent lifecycle management) | Not used - fire-and-forget workers | ❌ Archive (SDK-specific) |
| **Dependency Graph** (task ordering) | Not used - independent workers | ❌ Archive (SDK-specific) |
| **Message Bus with Channels** (state/dependency/task/help) | Simple file-based IPC (one channel) | ❌ Archive (over-engineered) |
| **Hierarchical Topology** | ✅ USED - proven to 300 agents | ✅ Keep (conceptual) |
| **Mesh Topology** | ✅ USED - hybrid mesh proven to 708 agents | ✅ Keep (conceptual) |
| **Completion Detection** | ✅ USED - file polling for completion | ✅ Keep (conceptual) |
| **Performance Metrics** | ✅ USEFUL - throughput, latency targets | ✅ Keep (metrics only) |
| **Security Audit** | ✅ USEFUL - race conditions, file permissions | ✅ Keep (concepts) |

---

## Archive Strategy (Aggressive)

### Phase 1: Move to Archive Directory (IMMEDIATE)

```bash
# Create archive directory
mkdir -p planning/agent-coordination-v2/archives/sdk-phases-typescript

# Move ALL SDK phase files to archive
mv planning/agent-coordination-v2/sdk-phases/* \
   planning/agent-coordination-v2/archives/sdk-phases-typescript/

# Create archive README explaining why
```

**Rationale**: All SDK phase docs focus on TypeScript implementation that won't be used. CLI coordination is bash-only.

### Phase 2: Extract Useful Concepts (1-2 hours)

**Keep in new CLI-focused docs** (create in `planning/agent-coordination-v2/cli-phases/`):

1. **TOPOLOGY_PATTERNS.md** (extracted from PHASE_05, PHASE_06)
   - Hierarchical topology architecture (1 coordinator → N workers)
   - Mesh topology architecture (N coordinators in mesh)
   - Hybrid topology architecture (mesh of coordinators + hierarchical teams)
   - Topology selection criteria (agent count, failure tolerance)
   - **Lines**: ~200 (extracted from 42,000+ lines)

2. **PERFORMANCE_TARGETS.md** (extracted from all phases)
   - Agent spawn time targets (<2s for 10 agents)
   - Coordination latency targets (<50ms resume)
   - Throughput targets (5000+ msg/sec)
   - Delivery rate thresholds (≥90%)
   - **Lines**: ~150

3. **SECURITY_CONSIDERATIONS.md** (extracted from SECURITY_AUDIT_PHASE3.md)
   - Race condition mitigation (flock, atomic operations)
   - File permission hardening (/dev/shm security)
   - Message validation strategies
   - Coordinator election security
   - **Lines**: ~200

**Total preserved**: ~550 lines of actionable CLI-relevant content
**Total archived**: ~18,450 lines of SDK-specific planning

### Phase 3: Update References (10 minutes)

**Update CLI_COORDINATION_PRODUCTION_PLAN.md**:
- Remove references to SDK phases
- Reference new `cli-phases/TOPOLOGY_PATTERNS.md` instead
- Reference new `cli-phases/PERFORMANCE_TARGETS.md` for metrics

**Update CLI_COORDINATION_RISK_ANALYSIS.md**:
- Reference `cli-phases/SECURITY_CONSIDERATIONS.md` for security validations

---

## What to Archive (90% of Content)

### Archive Immediately (Zero CLI Value)

**Phase Documents** (13 files):
- ❌ `PHASE_00_SDK_FOUNDATION.md` - SDK installation, session forking
- ❌ `PHASE_01_STATE_MACHINE.md` - Agent lifecycle state machine (not used)
- ❌ `PHASE_02_DEPENDENCY_GRAPH.md` - Task dependency ordering (not used)
- ❌ `PHASE_03_MESSAGE_BUS.md` - Complex channel system (over-engineered)
- ❌ `PHASE_04_COMPLETION_DETECTION.md` - SDK-based completion (not used)
- ❌ `PHASE_07_HELP_SYSTEM.md` - Help request routing (not needed)
- ❌ `PHASE_08_DEADLOCK_DETECTION.md` - Deadlock prevention (not applicable)
- ❌ `PHASE_09_SYSTEM_INTEGRATION.md` - SDK integration tests
- ❌ `PHASE_10_TESTING_VALIDATION.md` - SDK unit tests
- ❌ `PHASE_11_DOCUMENTATION_DEPLOYMENT.md` - SDK documentation
- ❌ `PHASE_11_V1_V2_TOGGLE_PLAN.md` - V1/V2 feature toggle (not applicable)
- ❌ `PHASE_12_PRODUCTION_HARDENING.md` - SDK-specific hardening

**Artifact Documents** (13 files):
- ❌ `artifacts/HIERARCHICAL_ARCHITECTURE.md` - TypeScript implementation details
- ❌ `artifacts/HIERARCHICAL_INTEGRATION_PLAN.md` - SDK integration specifics
- ❌ `artifacts/PHASE_03_ARCHITECTURE_VALIDATION.md` - Message bus architecture
- ❌ `artifacts/PHASE_03_INTEGRATION_ANALYSIS.md` - SDK integration analysis
- ❌ `artifacts/PHASE_08_ARCHITECTURE.md` - Deadlock detection architecture
- ❌ `artifacts/PHASE_09_COMPONENT_DIAGRAMS.md` - TypeScript component diagrams
- ❌ `artifacts/PHASE_09_INTEGRATION_ARCHITECTURE.md` - SDK integration architecture
- ❌ `artifacts/PHASE_09_SPRINT_9.2_ARTIFACT_CACHE_DELIVERABLE.md` - Artifact caching
- ❌ `artifacts/PHASE_09_SPRINT_9.2_CHECKPOINT_COMPRESSION.md` - Checkpoint compression
- ❌ `artifacts/SPRINT_5.2_BACKGROUND_PROCESS_ORCHESTRATION.md` - BashOutput monitoring
- ❌ `artifacts/phase-9-sprint-9.2-session-pool-optimizer.md` - Session pooling

**Optimization Documents** (2 files):
- ❌ `QUERY_CONTROL_OVERHEAD_OPTIMIZATION.md` - SDK query control optimization
- ❌ `ruv-article.md` - Rust UV article (not CLI related)

**Validation Files** (1 file):
- ❌ `validation/phase10-loop2-iteration2-consensus.json` - CFN Loop consensus result

### Extract Concepts Only (10% Useful)

**Keep conceptual architecture from these 2 files**:
- ✅ `PHASE_05_HIERARCHICAL_COORDINATION.md` → Extract topology pattern to `cli-phases/TOPOLOGY_PATTERNS.md`
- ✅ `PHASE_06_MESH_COORDINATION.md` → Extract mesh topology to `cli-phases/TOPOLOGY_PATTERNS.md`

**Keep security concepts from these 2 files**:
- ✅ `SECURITY_AUDIT_PHASE3.md` → Extract file-based IPC security to `cli-phases/SECURITY_CONSIDERATIONS.md`
- ✅ `SECURITY_HARDENING_RECOMMENDATIONS.md` → Extract bash hardening tips to `cli-phases/SECURITY_CONSIDERATIONS.md`

---

## Execution Plan

### Step 1: Create Archive Structure (1 command)

```bash
mkdir -p planning/agent-coordination-v2/archives/sdk-phases-typescript
mkdir -p planning/agent-coordination-v2/cli-phases
```

### Step 2: Move Files to Archive (1 command)

```bash
mv planning/agent-coordination-v2/sdk-phases/* \
   planning/agent-coordination-v2/archives/sdk-phases-typescript/
```

### Step 3: Create Archive README (1 file)

```bash
cat > planning/agent-coordination-v2/archives/sdk-phases-typescript/README.md << 'EOF'
# Archived: SDK-Based Coordination Planning

**Archived Date**: 2025-10-06
**Reason**: CLI coordination approach proven with 708 agents using bash + file-based IPC

## Context

These documents planned a TypeScript SDK-based coordination system using:
- Session forking for parallel agent spawning
- Query control for pause/resume/interrupt
- Checkpoint manager for state snapshots
- Artifact storage for binary persistence
- Background bash orchestrator for child monitoring

## Why Archived

MVP proved CLI coordination (pure bash + /dev/shm IPC) scales to 708 agents with:
- 97.8% delivery rate
- 20-second coordination time
- Zero external dependencies
- Simpler implementation

TypeScript SDK approach deemed over-engineered for production use case.

## Useful Content Extracted

Topology patterns, performance metrics, and security concepts extracted to:
- `planning/agent-coordination-v2/cli-phases/TOPOLOGY_PATTERNS.md`
- `planning/agent-coordination-v2/cli-phases/PERFORMANCE_TARGETS.md`
- `planning/agent-coordination-v2/cli-phases/SECURITY_CONSIDERATIONS.md`

## References

- MVP Results: `planning/agent-coordination-v2/MVP_CONCLUSIONS.md`
- CLI Production Plan: `planning/agent-coordination-v2/CLI_COORDINATION_PRODUCTION_PLAN.md`
- Working Code: `tests/cli-coordination/message-bus.sh`
EOF
```

### Step 4: Extract Useful Concepts (3 new files)

Create these files in `planning/agent-coordination-v2/cli-phases/`:

1. **TOPOLOGY_PATTERNS.md** - Hierarchical, mesh, hybrid architectures
2. **PERFORMANCE_TARGETS.md** - Latency, throughput, delivery rate targets
3. **SECURITY_CONSIDERATIONS.md** - File permissions, race conditions, validation

### Step 5: Update Cross-References (2 files)

- Update `CLI_COORDINATION_PRODUCTION_PLAN.md` to reference `cli-phases/*` instead of `sdk-phases/*`
- Update `CLI_COORDINATION_RISK_ANALYSIS.md` to reference `cli-phases/SECURITY_CONSIDERATIONS.md`

---

## Benefits of Aggressive Archiving

1. **Clarity**: Removes 18,000+ lines of irrelevant TypeScript planning
2. **Focus**: New contributors see CLI bash approach immediately
3. **Maintainability**: No confusion about which coordination method to use
4. **Simplicity**: ~550 lines of actionable CLI content vs 19,000 lines of SDK planning
5. **Reversibility**: All content preserved in archive if needed later

---

## Risk Assessment

**Risk**: Losing valuable planning insights
**Mitigation**: Extract all useful concepts (topology, metrics, security) to new CLI-focused docs

**Risk**: Future need for TypeScript coordination
**Mitigation**: All SDK phase docs preserved in archive, can be restored if needed

**Risk**: Breaking existing references
**Mitigation**: Update CLI production plan to reference new `cli-phases/` docs

---

## Recommendation

**PROCEED with aggressive archiving**:
- ✅ Move all 27 SDK phase files to archive
- ✅ Extract ~550 lines of useful concepts to 3 new CLI-focused docs
- ✅ Archive 96% of content (18,450 lines)
- ✅ Keep 100% reversibility (archive, not delete)

**Timeline**: 1-2 hours for complete archiving + extraction

**Impact**: Massive reduction in planning doc noise, clear CLI-focused direction
