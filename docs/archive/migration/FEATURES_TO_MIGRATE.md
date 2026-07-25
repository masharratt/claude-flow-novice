# Features to Migrate from Legacy v1 to v2

Based on analysis of `readme/logs-features.md` and `readme/logs-functions.md`

## Priority 1: Core CFN Loop System (MUST HAVE)

### Files to Migrate from `legacy/v1/src/`:

**CFN Loop Engine:**
- `cfn-loop/cfn-loop-orchestrator.ts` - Main orchestrator
- `cfn-loop/consensus-validator.ts` - Consensus validation
- `cfn-loop/mode-config.ts` - MVP/Standard/Enterprise modes
- `cfn-loop/loop-state-manager.ts` - State persistence

**CFN Coordinators:**
- `.claude/agents/cfn-loop/cfn-coordinator-mvp.md`
- `.claude/agents/cfn-loop/cfn-coordinator-standard.md`
- `.claude/agents/cfn-loop/cfn-coordinator-enterprise.md`

**Configuration:**
- `config/cfn-loop/mvp-criteria.json`
- `config/cfn-loop/enterprise-criteria.json`
- `config/cfn-loop/coordinator-modes.json`

## Priority 2: Redis Coordination (CRITICAL)

### Files to Migrate:

**Core Coordination:**
- `coordination/redis-coordinator.ts` - Main Redis coordination
- `coordination/coordination-types.ts` - Type definitions
- `coordination/blocking-coordination.ts` - Blocking patterns
- `coordination/mesh-coordinator.ts` - Mesh topology
- `coordination/hierarchical-coordinator.ts` - Tree topology

**Scripts:**
- `scripts/blocking-coordination-cleanup.lua` - Lua cleanup script
- `scripts/unified-memory-monitor.js` - Memory monitoring

## Priority 3: SQLite Memory Management (CRITICAL)

### Files to Migrate:

**Memory System:**
- `memory/sqlite-memory-system.ts` - Main SQLite manager
- `memory/memory-adapter.ts` - ACL system (5 levels)
- `memory/dual-write-pattern.ts` - Redis + SQLite CQRS
- `memory/encryption-manager.ts` - AES-256-GCM encryption

**Database:**
- `.artifacts/database/swarm-memory.db` - Already preserved ✅

## Priority 4: Agent Management (HIGH)

### Files to Migrate:

**Agent System:**
- `agents/agent-registry.ts` - Agent registration
- `agents/agent-loader.ts` - Agent discovery
- `agents/agent-optimization.ts` - Description optimization
- `agents/use-case-registry.ts` - Intelligent selection

**Hybrid Routing:**
- `cli/hybrid-routing/spawn-workers.js` - Worker spawning
- `cli/hybrid-routing/recommend-agents.js` - Agent recommendations
- `cli/hybrid-routing/optimize-agents.js` - Optimization tools

## Priority 5: ACE (Adaptive Context Extension)

### Files to Migrate:

**ACE System:**
- `ace/ace-reflector.ts` - Meta-cognitive analysis
- `ace/ace-curator.ts` - Context merging
- `ace/ace-generator.ts` - Context creation
- `ace/context-injection.ts` - Dynamic injection

**Agents:**
- `.claude/agents/context/context-reflector.md`
- `.claude/agents/context/context-curator.md`

## Priority 6: Performance & WASM Engine

### Files to Migrate:

**WASM Optimization:**
- `wasm/performance-engine.rs` - 40x performance engine
- `wasm/message-serializer.rs` - Event bus serialization
- `wasm/state-manager.rs` - State serialization

**Performance:**
- `performance/performance-optimizer.ts`
- `performance/memory-safety.ts`

## Priority 7: Web Portal

### Already Preserved:
- `packages/web-portal/` - Already in root ✅

## Priority 8: Testing Infrastructure

### Files to Migrate:

**Test Suites:**
- `tests/hello-world-tests/` - Layer 0-3 validation
- `tests/integration/cfn-loop-tests.ts` - CFN integration
- `tests/chaos/redis-failure-tests.ts` - Chaos testing

**Configuration:**
- `config/jest/jest.config.js`
- `config/jest/jest.setup.cjs`

## Priority 9: Slash Commands

### Files to Migrate:

**.claude/commands/:**
- `cfn-loop.md` - CFN Loop command
- `cfn-loop-epic.md` - Epic orchestration
- `cfn-loop-sprints.md` - Sprint execution
- `fullstack.md` - Fullstack teams
- `swarm.md` - Swarm management
- `sparc.md` - SPARC methodology
- `cost-savings-on.md` / `cost-savings-off.md` - Mode toggle
- `context-*.md` - ACE commands (reflect, curate, query, inject, stats)

## Priority 10: Hooks & Automation

### Files to Migrate:

**Post-Edit Pipeline:**
- `config/hooks/post-edit-pipeline.js` - Main pipeline
- `config/hooks/post-edit-security.js` - Security scanning
- `config/hooks/post-test-coverage.js` - Coverage validation
- `config/hooks/post-cfn-loop-reflection.js` - ACE reflection

**Pre-Commit:**
- `config/hooks/pre-commit-db-scan` - Database scanning
- `config/hooks/pre-tool-validation.js` - Tool validation

## Files Already in v2 Structure ✅

- ✅ `.claude/` - Agent configurations (already preserved)
- ✅ `agents/` - Agent definitions (already preserved)
- ✅ `planning/` - Planning docs (already preserved)
- ✅ `packages/web-portal/` - Web portal (already preserved)
- ✅ `.artifacts/database/swarm-memory.db` - Memory database (already preserved)

## Migration Strategy

### Phase 3.1: Core Engine (Week 1)
1. CFN Loop orchestrator + coordinators
2. Redis coordination system
3. SQLite memory management
4. Basic slash commands

### Phase 3.2: Agent System (Week 1)
1. Agent registry + loader
2. Hybrid routing CLI
3. Use case intelligence
4. Agent optimization

### Phase 3.3: Advanced Features (Week 2)
1. ACE system
2. WASM performance engine
3. Testing infrastructure
4. Hooks & automation

### Phase 3.4: Integration (Week 2)
1. Web portal integration
2. Command integration
3. End-to-end testing
4. Documentation updates

## Estimated File Counts

- **Core files**: ~50 TypeScript files
- **Agent definitions**: ~85 markdown files
- **Slash commands**: ~30 markdown files
- **Configuration**: ~20 JSON/JS files
- **Tests**: ~30 test files
- **WASM**: ~5 Rust files

**Total**: ~220 files to migrate (vs 1,485 v1 files = 85% reduction)

## Success Criteria

- ✅ CFN Loop 3→2→4 workflow functional
- ✅ Redis coordination working
- ✅ SQLite memory with ACL operational
- ✅ Agent spawning via hybrid routing
- ✅ Web portal connected to backend
- ✅ 0 TypeScript errors (strict mode)
- ✅ Core slash commands functional
- ✅ Build succeeds in <1 minute
