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

## Archive Contents

### Phase Documents (13 files)
- PHASE_00_SDK_FOUNDATION.md - SDK installation, session forking
- PHASE_01_STATE_MACHINE.md - Agent lifecycle state machine
- PHASE_02_DEPENDENCY_GRAPH.md - Task dependency ordering
- PHASE_03_MESSAGE_BUS.md - Complex channel system
- PHASE_04_COMPLETION_DETECTION.md - SDK-based completion
- PHASE_05_HIERARCHICAL_COORDINATION.md - Hierarchical topology (concepts extracted)
- PHASE_06_MESH_COORDINATION.md - Mesh topology (concepts extracted)
- PHASE_07_HELP_SYSTEM.md - Help request routing
- PHASE_08_DEADLOCK_DETECTION.md - Deadlock prevention
- PHASE_09_SYSTEM_INTEGRATION.md - SDK integration tests
- PHASE_10_TESTING_VALIDATION.md - SDK unit tests
- PHASE_11_DOCUMENTATION_DEPLOYMENT.md - SDK documentation
- PHASE_11_V1_V2_TOGGLE_PLAN.md - V1/V2 feature toggle
- PHASE_12_PRODUCTION_HARDENING.md - SDK-specific hardening

### Security Documents (2 files)
- SECURITY_AUDIT_PHASE3.md - Security audit (concepts extracted)
- SECURITY_HARDENING_RECOMMENDATIONS.md - Hardening tips (concepts extracted)

### Optimization Documents (2 files)
- QUERY_CONTROL_OVERHEAD_OPTIMIZATION.md - SDK query control optimization
- ruv-article.md - Rust UV article

### Artifact Documents (13 files in artifacts/ subdirectory)
- Various TypeScript implementation details and architecture documents

### Validation Files (1 file in validation/ subdirectory)
- phase10-loop2-iteration2-consensus.json - CFN Loop consensus result

## Restoration

To restore these files if needed:
```bash
mv planning/agent-coordination-v2/archives/sdk-phases-typescript/* \
   planning/agent-coordination-v2/sdk-phases/
```
