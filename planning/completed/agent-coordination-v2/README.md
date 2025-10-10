# Agent Coordination System V2 (SDK - Research Track)

**Status**: Research track - NOT being pursued for production
**Active Development**: See [../cli-validation-epic/](../cli-validation-epic/) for CLI Coordination V2 (production track)

## Overview

This directory contains the TypeScript SDK V2 architecture and research artifacts. The SDK approach was explored but proven less effective than CLI coordination at large scale (708+ agents).

**Decision**: CLI coordination V2 prioritized for production deployment. SDK V2 remains as research track for future reference.

## Directory Structure

### SDK V2 Design

**[sdk-v2-overview/](./sdk-v2-overview/)** - Core SDK architecture documents
- ARCHITECTURE.md - System design with state machines
- SYSTEM_OVERVIEW.md - Visual architecture summary
- TECHNICAL_SPECS.md - Data structures and APIs
- PSEUDOCODE.md - Algorithm designs
- PHASE_OVERVIEW.md - Implementation phases
- IMPLEMENTATION_PLAN.md - 12-week rollout plan
- MIGRATION_GUIDE.md - V1 → V2 migration

### Research Artifacts

**[sdk-research/](./sdk-research/)** - Research findings and analysis
- RESEARCH.md - Coordination research
- METRICS_ANALYSIS_REPORT.md - Performance metrics
- claude-sdk-integration-implementation.md - SDK integration design

### Validation Framework

**[validation-framework/](./validation-framework/)** - Validation system design
- VALIDATION_ARCHITECTURE.md - Validation architecture
- VALIDATION_ARCHITECTURE_SUMMARY.md - Validation summary
- VALIDATION_IMPLEMENTATION_CHECKLIST.md - Implementation checklist
- AGENT_COORDINATION_TEST_STRATEGY.md - Test strategy
- SWARM_INIT_VALIDATOR_IMPLEMENTATION.md - Validator implementation
- VALIDATION_SYSTEM_DIAGRAM.txt - System diagram

### Sprint Orchestration

**[sprint-orchestration/](./sprint-orchestration/)** - Sprint orchestrator system
- sprint-orchestrator-architecture.md - Orchestrator design
- sprint-orchestrator-quick-reference.md - Quick reference
- sprint-orchestrator-interfaces.ts - TypeScript interfaces

### Archives

**[archives/](./archives/)** - Historical SDK phases and deprecated designs
- sdk-phases-typescript/ - 12 TypeScript SDK phases (deprecated)
- SDK_ARCHIVE_STRATEGY.md - Archive strategy
- SDK_INTEGRATION_DESIGN.md - Integration design
- SDK_UPGRADE_ANALYSIS.md - Upgrade analysis

### Other Directories

**[cli-phases/](./cli-phases/)** - CLI coordination phase documentation (moved to cli-validation-epic)
**[large-coordination/](./large-coordination/)** - Large-scale coordination research
**[implementation/](./implementation/)** - Implementation artifacts
**[cli-analysis/](./cli-analysis/)** - CLI analysis work

## Why CLI Over SDK?

**CLI Coordination V2 Advantages**:
- ✅ Proven at 708 agents (97.8% delivery rate)
- ✅ Zero external dependencies (pure bash)
- ✅ File-based IPC on /dev/shm tmpfs (fast, simple)
- ✅ Lower complexity and maintenance burden

**SDK V2 Limitations**:
- ❌ Higher complexity with TypeScript state machines
- ❌ External dependencies and runtime requirements
- ❌ Less effective at scale (not validated beyond design)

## See Also

- [CLI Coordination V2 Epic](../cli-validation-epic/CLI_COORDINATION_V2_EPIC.md) - Production implementation
- [MVP Conclusions](../cli-validation-epic/supporting-docs/MVP_CONCLUSIONS.md) - 708-agent validation results
- [CLI Production Plan](./CLI_COORDINATION_RISK_ANALYSIS.md) - CLI production deployment plan
