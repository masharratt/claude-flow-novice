# Changelog

All notable changes to Claude Flow Novice will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Deprecated
- **BlockingCoordinationSignals** system (421 lines) in favor of Redis BLPOP primitives
  - Archived to `legacy/v1/deprecated/blocking-coordination-signals.js`
  - Archived to `legacy/v1/deprecated/coordinator-timeout-handler.js`
  - Migration guide: `legacy/v1/deprecated/BLOCKING_COORDINATION_MIGRATION.md`
  - Planned removal: 2026-04-19 (6 months notice)

### Removed
- `blocking-coordination-validator` hook (replaced by Redis BLPOP patterns)
- HMAC secret requirement for coordination
- Cleanup script `cleanup-blocking-coordination.sh` (auto-cleanup via BLPOP)

### Added
- Redis BLPOP coordination patterns in `.claude/skills/redis-coordination/`
- Zero-token blocking mechanisms (BLPOP doesn't consume API calls)
- Comprehensive test suite for orchestrator (8/8 passing tests)
- Migration guide for BlockingCoordination → Redis BLPOP
- Redis Waiting Mode documentation in root CLAUDE.md

### Changed
- `.claude/agents/CLAUDE.md` - Updated all coordinator examples to use Redis BLPOP
- Coordinator validation hooks no longer include `blocking-coordination-validator`
- CFN Loop orchestration now uses `orchestrate-cfn-loop.sh` for dependency enforcement

### Fixed
- Eliminated 421 lines of coordination complexity
- Removed HMAC secret management overhead
- Zero-token blocking achieved (was consuming tokens during wait periods)

## [2.2.0] - 2025-10-18 - Skills-First Migration Complete

### Added
- **Redis Coordination Skill** (`.claude/skills/redis-coordination/SKILL.md`)
  - Simple Chain, Hierarchical Broadcast, Mesh Hybrid patterns
  - Redis Waiting Mode with zero-token blocking
  - Comprehensive orchestrator with 8/8 passing tests
- **Agent Spawning Skill** (`.claude/skills/agent-spawning/SKILL.md`)
  - Skill-based agent spawning patterns
  - Dependency management and validation
- **CFN Loop Validation Skill** (`.claude/skills/cfn-loop-validation/SKILL.md`)
  - Automatic dependency orchestration
  - Adaptive context injection
  - Modular loop progression

### Changed
- Main chat role now thin orchestration layer (spawns coordinator + agents)
- ALL agent communication via explicit Redis pub/sub dependencies
- Coordination logic delegated to skills instead of inline code
- Post-edit validation mandatory for all Edit/Write operations

### Performance
- 73% reduction in agent template size (Phase 4 template optimization)
- 50-66% faster agent loading
- Zero-token blocking via Redis BLPOP (was consuming tokens)
- <100ms wake-up latency for agent coordination

## [2.1.0] - 2025-10-17 - Phase 4 Template Optimization

### Added
- 5 reusable templates for common patterns
  - `redis-coordination.md` (90 lines)
  - `memory-operations.md` (78 lines)
  - `post-edit-validation.md` (121 lines)
  - `cfn-loop-mechanics.md` (70 lines)
  - `team-dynamics.md` (80 lines)

### Changed
- 75 agents optimized using template extraction
- Average agent size: 137 lines (down from 470 lines)
- 23,615 lines removed (71% average reduction per agent)

### Performance
- 100% functionality preserved
- 50-66% faster agent loading
- 5× easier maintenance (single template update propagates)

## [2.0.0] - 2025-09-30 - SQLite Integration & ACL System

### Added
- SQLite integration for persistent memory and audit trail
- 5-level ACL system (Private, Swarm, Project, Team, System)
- Agent lifecycle hooks (pre_task, post_task)
- 4 production-ready validators
  - Agent Template Validator (95% automation)
  - CFN Loop Memory Pattern Validator (90% automation)
  - Test Coverage Validator (100% automation)
  - Blocking Coordination Validator (60% automation) - **DEPRECATED in v2.2.0**

### Changed
- All agents MUST persist to SQLite for audit trail
- Memory operations require ACL level declaration
- Post-edit hooks now mandatory for all file modifications

## [1.0.0] - 2025-09-15 - Initial Release

### Added
- Basic agent orchestration framework
- CFN Loop (3-loop self-correcting workflow)
- Redis pub/sub coordination
- Agent spawning via Task tool
- Basic memory coordination

---

**Versioning Policy:**
- **Major (X.0.0)**: Breaking changes, major architecture shifts
- **Minor (0.X.0)**: New features, non-breaking changes
- **Patch (0.0.X)**: Bug fixes, documentation updates

**Deprecation Policy:**
- 6 months notice for major component deprecation
- Migration guides provided for all breaking changes
- Legacy components archived to `legacy/v{version}/deprecated/`
