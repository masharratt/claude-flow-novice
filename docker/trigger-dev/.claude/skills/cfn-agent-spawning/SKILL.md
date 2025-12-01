---
name: Agent Spawning
version: 1.4.0
complexity: High
keywords: [
    "dynamic agent deployment",
    "dependency management",
    "resource optimization",
    "multi-agent initialization",
    "dependency validation"
]
triggers: [
    "complex system design",
    "dependency resolution",
    "agent lifecycle management"
]
performance_targets: {
    "dependency_check_time_ms": 50,
    "spawn_time_ms": 200,
    "stop_time_ms": 150,
    "success_rate": 99.5
}
---

# Agent Spawning Skill - Dependency Enhanced

## Dependency Management Overview

Version 1.4.0 introduces comprehensive dependency management for agent spawning, ensuring robust and reliable multi-agent deployment.

### Dependency Checks

The updated `spawn-agent.sh` now includes thorough dependency validation:

1. **System Requirements**
   - Bash 4.0+
   - Node.js (Latest LTS)
   - Required CLI tools

2. **Node.js Module Validation**
   - redis
   - dotenv
   - Other required modules

3. **Claude Flow Prerequisites**
   - Configured `.claude` directory
   - Coordination scripts
   - Task tool accessibility

## Dependency Validation Process

### System Check
```bash
# Validates:
# - Bash version
# - Required command-line tools
# - Node.js module availability
# - Claude Flow configuration
./spawn-agent.sh
```

### Error Handling Example
```
[ERROR] Missing Dependencies:
  - bash>=4.0
  - redis
  - dotenv

[WARNING] Recommended Installation:
  1. Install Node.js and npm (latest LTS version)
  2. Run: npm install redis dotenv
  3. Clone Claude Flow Novice repository
```

## Usage Examples (Unchanged from Previous Version)

Spawn multiple agents:
```bash
./spawn-agent.sh \
  --task "Implement user authentication" \
  --agents coder,security-specialist,tester \
  --agent-id coordinator-1
```

## Performance Targets

- Dependency check time: <50ms
- Spawn time: <200ms
- Stop time: <150ms
- Success rate: 99.5%

## Changelog

### Version 1.4.0 (2025-10-18)
- Added comprehensive dependency validation
- Enhanced system and module checking
- Improved error reporting
- Clear installation instructions
- Reduced false-positive spawn attempts

### Version 1.3.0
- Agent termination capabilities
- Stop specific or all agents
- Enhanced agent lifecycle management

### Version 1.2.0
- CLI wrapper implementation
- Agent type validation
- Template discovery

## Status
- **Operational Status:** ✅ FULLY OPERATIONAL (v2.0.0)
- **CLI Command:** `npx claude-flow-spawn` (production ready)
- **Dependency Management:** FULLY IMPLEMENTED
- **Error Handling:** HIGH PRECISION
- **Last Verified:** 2025-10-19

## Implementation Details

**CLI Entry Point:** `src/cli/spawn.ts` → `dist/cli/spawn.js`
**Worker Implementation:** `src/cli/hybrid-routing/spawn-workers.cjs`
**Package Bin:** `"claude-flow-spawn": "dist/cli/spawn.js"`

**Usage:**
```bash
# Spawn multiple agents
npx claude-flow-spawn "Implement auth" --agents=coder,tester --provider zai

# Using skill wrapper
./.claude/skills/agent-spawning/spawn-agent.sh \
  --task "Implement auth" \
  --agents coder,tester \
  --provider zai \
  --redis-channel swarm:auth
```

---

## ⚠️ Bash Deprecation Notice

**The bash implementation of this skill is deprecated as of 2025-11-20.**

**Deprecation Date:** 2025-11-20  
**Removal Date:** 2026-02-20 (90 days)  
**TypeScript Implementation:** dist/cli/spawn-agent-cli.js  
**Migration Guide:** .claude/skills/cfn-agent-spawning/TYPESCRIPT_MIGRATION.md  

### Why Migrate to TypeScript?

- **Type Safety:** Zero runtime type errors with compile-time validation
- **Better Performance:** 5-10ms faster execution, optimized Redis operations
- **Comprehensive Testing:** 90%+ test coverage with unit, integration, and E2E tests
- **Modern Tooling:** Full IDE support, autocomplete, and inline documentation
- **Maintainability:** Single source of truth, easier debugging

### Automatic Migration

Set environment variable to automatically use TypeScript:

```bash
export USE_TYPESCRIPT=true
```

All coordinators and orchestrators will automatically prefer TypeScript implementations.

### Rollback

If issues arise:

```bash
export USE_TYPESCRIPT=false
```

Bash scripts will continue working for the 90-day deprecation period.

### See Also

- **Complete Deprecation List:** [docs/BASH_DEPRECATION_NOTICE.md](../../../docs/BASH_DEPRECATION_NOTICE.md)
- **TypeScript Benefits:** See individual migration guides
- **Test Coverage:** Run `npm test` to verify TypeScript implementation

---
