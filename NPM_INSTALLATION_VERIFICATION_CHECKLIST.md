# NPM Package Installation Verification Checklist

## Overview
Comprehensive verification checklist for claude-flow-novice@2.1.0 npm package installation in external repositories.

## Verification Criteria: 90% Consensus Required

### ✅ AGENTS (137 files) - CRITICAL
**Location**: `.claude/agents/`

#### Core Categories (must be present):
- [ ] **analysis/** (2 agents): code-analyzer.md, perf-analyzer.md
- [ ] **architecture/** (1 agent): system-architect.md
- [ ] **cfn-loop/** (3 agents): cfn-coordinator-enterprise.md, cfn-coordinator-mvp.md, product-owner.md
- [ ] **consensus/** (2 agents): gossip-coordinator.md, performance-benchmarker.md
- [ ] **core-agents/** (10 agents): analyst.md, architect.md, coder.md, planner.md, researcher.md, reviewer.md, tester.md, task-coordinator.md, coordinator-hybrid.md, base-template-generator.md
- [ ] **development/** (1 agent): dev-backend-api.md
- [ ] **devops/** (1 agent): devops-engineer.md
- [ ] **documentation/** (1 agent): docs-api-openapi.md
- [ ] **frontend/** (4 agents): interaction-tester.md, react-frontend-engineer.md, state-architect.md, ui-designer.md
- [ ] **goal/** (1 agent): goal-planner.md
- [ ] **optimized/** (37 agents): All optimized variants of core agents
- [ ] **planning-team/** (3 agents): api-designer-persona.md, security-architect-persona.md, system-architect-persona.md
- [ ] **product-owner-team/** (4 agents): accessibility-advocate-persona.md, cto-agent.md, power-user-persona.md, product-owner-agent.md
- [ ] **security/** (2 agents): security-specialist.md, security-specialist-optimized.md
- [ ] **sparc/** (4 agents): architecture.md, pseudocode.md, refinement.md, specification.md
- [ ] **specialized/** (8 agents): cli-agent-optimizer.md, code-booster.md, mobile-dev.md, rust-developer.md, etc.
- [ ] **swarm/** (6 agents): adaptive-coordinator.md, hierarchical-coordinator.md, mesh-coordinator.md, etc.
- [ ] **testing/** (4 agents): interaction-tester.md, playwright-tester.md, production-validator.md, tdd-london-swarm.md

#### Special Files:
- [ ] **CLAUDE.md** (Agent configuration guidelines)
- [ ] **README-VALIDATION.md** (Validation instructions)
- [ ] **validate-agent.js** (Agent validation script)

### ✅ COMMANDS (30+ commands) - CRITICAL
**Location**: `.claude/commands/`

#### Registered Slash Commands (must be in register-all-commands.js):
- [ ] **Core Commands**: /sparc, /swarm, /hooks, /neural, /performance, /github, /workflow
- [ ] **CFN Loop Commands**: /cfn-loop, /cfn-loop-sprints, /cfn-loop-single, /cfn-loop-epic, /cfn-claude-sync, /cfn-optimize-agents
- [ ] **Context Commands**: /context-query, /context-reflect, /context-curate, /context-inject, /context-stats
- [ ] **Development Commands**: /fullstack, /list-agents-rebuild, /launch-web-dashboard, /parse-epic, /github-commit
- [ ] **Utility Commands**: /hello-world-tests, /auto-compact, /suggest-improvements, /suggest-templates, /dependency-recommendations, /switch-api
- [ ] **Legacy Commands**: /claude-md, /claude-soul

#### Command Implementation Files (.js):
- [ ] All command files present in `dist/.claude/commands/`
- [ ] register-all-commands.js updated with all commands
- [ ] Command aliases properly configured

#### Command Documentation (.md):
- [ ] All command documentation files present (181 files)
- [ ] Usage examples and parameters documented

### ✅ CORE SYSTEM FILES - CRITICAL
**Location**: `.claude/core/`

- [ ] **agent-manager.js** (Agent lifecycle management)
- [ ] **config.js** (Configuration management)
- [ ] **orchestrator.js** (Task orchestration)
- [ ] **persistence.js** (Data persistence)
- [ ] **event-bus.js** (Event handling)
- [ ] **logger.js** (Logging system)
- [ ] **slash-command.js** (Slash command framework)

### ✅ CONFIGURATION FILES - CRITICAL
**Location**: `.claude/`

- [ ] **settings.json** (Main configuration)
- [ ] **settings.local.json** (Local overrides)
- [ ] **hooks.json** (Hook configuration)
- [ ] **slash-commands.json** (Command registry)
- [ ] **SLASH-COMMANDS-READY.md** (Installation confirmation)

### ✅ HELPERS - IMPORTANT
**Location**: `.claude/helpers/`

- [ ] **setup-mcp.sh** (MCP setup script)
- [ ] **github-setup.sh** (GitHub setup)
- [ ] **standard-checkpoint-hooks.sh** (Checkpoint hooks)
- [ ] **quick-start.sh** (Quick start script)

### ✅ MAIN ENTRY POINTS - CRITICAL
**Location**: Project root

- [ ] **dist/src/cli/main.js** (Main CLI entry point)
- [ ] **dist/src/index.js** (Package entry point)
- [ ] **package.json** (Package configuration with correct bin entry)

### ✅ DOCUMENTATION - IMPORTANT
**Location**: `readme/`

- [ ] **CLAUDE.md** (Main documentation)
- [ ] **additional-commands.md** (Advanced commands reference)
- [ ] **logs-slash-commands.md** (Slash command documentation)
- [ ] **CFN_LOOP_CHEATSHEET.md** (CFN Loop reference)
- [ ] **logs-features.md** (Feature documentation)

### ✅ BUILD CONFIGURATION - IMPORTANT
**Location**: `config/`

- [ ] **build configuration files**
- [ ] **CFN Loop criteria files**
- [ ] **Docker configuration files**

## Verification Tests

### Functional Tests:
1. [ ] **CLI Test**: `npx claude-flow-novice --version` works
2. [ ] **Help Test**: `npx claude-flow-novice --help` shows commands
3. [ ] **Command Test**: At least 5 slash commands execute successfully
4. [ ] **Agent Test**: Agent files are discoverable and readable
5. [ ] **Config Test**: Configuration files load correctly

### Integration Tests:
1. [ ] **Swarm Init**: Basic swarm initialization works
2. [ ] **Agent Spawning**: Can spawn at least 3 different agent types
3. [ ] **CFN Loop**: Basic CFN loop executes without errors
4. [ ] **Hooks**: Hook system loads and executes

## Success Criteria

### Consensus Threshold: 90%
- **Total Items**: ~200 critical files and features
- **Required Present**: 180+ items (90%)
- **Blockers**: Any failure in CRITICAL categories blocks consensus

### Validation Method:
1. **Automated Scripts**: File presence verification
2. **Functional Testing**: Command execution verification
3. **Manual Review**: Expert validation of critical components
4. **Integration Testing**: End-to-end workflow verification

## Failure Handling

### If Consensus < 90%:
- **Identify Missing Items**: Catalog all missing components
- **Root Cause Analysis**: Determine why items are missing
- **Fix Implementation**: Update build/packaging process
- **Re-run Verification**: Complete verification cycle
- **Retry Loop**: Continue until 90% consensus achieved

### Critical Failures:
- **CLI Entry Point Missing**: Immediate rebuild required
- **Agent Files Missing**: Check packaging configuration
- **Command Registration Failed**: Update registration system
- **Configuration Corruption**: Restore from backup

---

**Status**: Ready for CFN Loop Sprint verification
**Target**: 90% consensus on complete package installation
**Next Step**: Execute CFN Loop Sprint with validation team