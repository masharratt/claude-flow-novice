# Comprehensive Feature Inventory - Claude Flow Novice (Updated)

**Date**: September 25, 2025 (Updated with user feedback)
**Status**: Complete Audit for Simplification Planning - **REVISED**
**Purpose**: Document all MCP tools, functions, and agents with updated consolidation strategy

## Executive Summary

**UPDATED**: This inventory documents **112 MCP tools**, **60+ agents** (with consolidations), and **extensive CLI functions** currently available in claude-flow-novice. Following user feedback, we focus on consolidating GitHub agents, adding React frontend capabilities, hiding experimental features, and providing configuration options for enterprise features rather than automatic progression.

**Key Updates:**
- GitHub agents consolidated from 12 → 3 unified agents
- Added dedicated React frontend developer agent
- Experimental agents moved to hidden/enterprise-only status
- Enterprise features available via configuration toggle, not automatic unlock
- Commands remain comprehensive since Claude Code handles initialization

---

## MCP Tools Inventory

### 1. Claude-Flow MCP Tools (87 tools)

#### Swarm Coordination (12 tools)
| Tool | Complexity | Usage | Simplification Priority |
|------|------------|-------|------------------------|
| `mcp__claude-flow__swarm_init` | Medium | High | ⭐⭐⭐⭐ Auto-configure |
| `mcp__claude-flow__agent_spawn` | Medium | High | ⭐⭐⭐⭐ Smart defaults |
| `mcp__claude-flow__task_orchestrate` | High | High | ⭐⭐⭐⭐⭐ Unify with workflow |
| `mcp__claude-flow__swarm_status` | Low | Medium | ⭐⭐ Keep as-is |
| `mcp__claude-flow__swarm_monitor` | Medium | Low | ⭐⭐⭐ Auto-enable |
| `mcp__claude-flow__swarm_scale` | High | Low | ⭐⭐ Advanced only |
| `mcp__claude-flow__swarm_destroy` | Low | Medium | ⭐ Keep as-is |
| `mcp__claude-flow__coordination_sync` | High | Low | ⭐ Advanced only |
| `mcp__claude-flow__topology_optimize` | High | Low | ⭐ Auto-background |
| `mcp__claude-flow__load_balance` | High | Low | ⭐ Auto-background |
| `mcp__claude-flow__agent_list` | Low | High | Keep as-is |
| `mcp__claude-flow__agent_metrics` | Medium | Medium | ⭐⭐⭐ Consolidate with analyze |

#### Neural Networks & AI (15 tools - **EXPERIMENTAL/ENTERPRISE ONLY**)
| Tool | Complexity | Usage | Simplification Priority |
|------|------------|-------|------------------------|
| `mcp__claude-flow__neural_status` | High | Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__neural_train` | Very High | Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__neural_patterns` | Very High | Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__neural_predict` | High | Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__model_load` | High | Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__model_save` | High | Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__wasm_optimize` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__inference_run` | High | Low | ⭐ **Enterprise config only** |
| `mcp__claude-flow__pattern_recognize` | High | Low | ⭐ **Enterprise config only** |
| `mcp__claude-flow__cognitive_analyze` | High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__learning_adapt` | High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__neural_compress` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__ensemble_create` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__transfer_learn` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__neural_explain` | High | Very Low | ⭐ **Hidden by default** |

**Access Method**: Enable via configuration option `features.experimental.neural = true`

#### Memory & Persistence (12 tools)
| Tool | Complexity | Usage | Simplification Priority |
|------|------------|-------|------------------------|
| `mcp__claude-flow__memory_usage` | Medium | High | ⭐⭐⭐⭐⭐ Unify into 'memory' |
| `mcp__claude-flow__memory_search` | Medium | High | ⭐⭐⭐⭐⭐ Unify into 'memory' |
| `mcp__claude-flow__memory_persist` | Medium | Medium | ⭐⭐⭐⭐ Unify into 'memory' |
| `mcp__claude-flow__memory_namespace` | High | Low | ⭐⭐⭐ Advanced mode |
| `mcp__claude-flow__memory_backup` | Medium | Low | ⭐⭐⭐ Unify into 'memory' |
| `mcp__claude-flow__memory_restore` | Medium | Low | ⭐⭐⭐ Unify into 'memory' |
| `mcp__claude-flow__memory_compress` | High | Very Low | ⭐⭐ Auto-background |
| `mcp__claude-flow__memory_sync` | High | Very Low | ⭐⭐ Auto-background |
| `mcp__claude-flow__cache_manage` | High | Low | ⭐⭐ Auto-background |
| `mcp__claude-flow__state_snapshot` | High | Low | ⭐⭐ Advanced only |
| `mcp__claude-flow__context_restore` | High | Low | ⭐⭐ Advanced only |
| `mcp__claude-flow__memory_analytics` | Medium | Low | ⭐⭐⭐ Unify with analyze |

#### Analysis & Monitoring (13 tools)
| Tool | Complexity | Usage | Simplification Priority |
|------|------------|-------|------------------------|
| `mcp__claude-flow__performance_report` | High | Medium | ⭐⭐⭐⭐⭐ Unify into 'analyze' |
| `mcp__claude-flow__bottleneck_analyze` | High | Medium | ⭐⭐⭐⭐⭐ Unify into 'analyze' |
| `mcp__claude-flow__token_usage` | Medium | Medium | ⭐⭐⭐⭐ Unify into 'analyze' |
| `mcp__claude-flow__trend_analysis` | High | Low | ⭐⭐⭐ Unify into 'analyze' |
| `mcp__claude-flow__cost_analysis` | High | Low | ⭐⭐⭐ Unify into 'analyze' |
| `mcp__claude-flow__quality_assess` | High | Medium | ⭐⭐⭐⭐ Unify into 'analyze' |
| `mcp__claude-flow__error_analysis` | High | Medium | ⭐⭐⭐⭐ Unify into 'analyze' |
| `mcp__claude-flow__usage_stats` | Medium | Medium | ⭐⭐⭐ Unify into 'analyze' |
| `mcp__claude-flow__health_check` | Medium | High | ⭐⭐⭐⭐ Unify into 'analyze' |
| `mcp__claude-flow__metrics_collect` | High | Low | ⭐⭐ Auto-background |
| `mcp__claude-flow__benchmark_run` | High | Low | ⭐⭐ Advanced only |
| `mcp__claude-flow__task_status` | Low | High | Keep as-is |
| `mcp__claude-flow__task_results` | Low | High | Keep as-is |

#### Workflow & Automation (11 tools)
| Tool | Complexity | Usage | Simplification Priority |
|------|------------|-------|------------------------|
| `mcp__claude-flow__workflow_create` | High | High | ⭐⭐⭐⭐⭐ Unify with task commands |
| `mcp__claude-flow__workflow_execute` | High | High | ⭐⭐⭐⭐⭐ Unify with task commands |
| `mcp__claude-flow__workflow_export` | Medium | Low | ⭐⭐⭐ Advanced mode |
| `mcp__claude-flow__automation_setup` | Very High | Low | ⭐⭐ Advanced only |
| `mcp__claude-flow__pipeline_create` | Very High | Low | ⭐⭐ Advanced only |
| `mcp__claude-flow__scheduler_manage` | High | Low | ⭐⭐ Advanced only |
| `mcp__claude-flow__trigger_setup` | High | Low | ⭐⭐ Advanced only |
| `mcp__claude-flow__workflow_template` | Medium | Medium | ⭐⭐⭐ Template system |
| `mcp__claude-flow__batch_process` | High | Low | ⭐⭐ Advanced only |
| `mcp__claude-flow__parallel_execute` | High | Medium | ⭐⭐⭐ Auto-enable |
| `mcp__claude-flow__sparc_mode` | Medium | Medium | ⭐⭐⭐ Guided workflows |

#### GitHub Integration (8 tools → 3 consolidated tools)
| Tool | Complexity | Usage | Simplification Priority |
|------|------------|-------|------------------------|
| `mcp__claude-flow__github_integration` | Medium | High | ⭐⭐⭐⭐ **Unified GitHub operations** |
| `mcp__claude-flow__github_code_review` | High | Medium | ⭐⭐⭐ Code review and quality |
| `mcp__claude-flow__github_metrics` | Medium | Low | ⭐⭐⭐ Analytics integration |

**Consolidation Details:**
- **github_integration**: Combines repo_analyze, pr_manage, issue_track, release_coord, workflow_auto, sync_coord
- **Impact**: 75% reduction in GitHub-related tools while maintaining full functionality
- **Benefit**: Single entry point for all GitHub operations with intelligent routing

#### DAA (Dynamic Agent Architecture) (8 tools - **EXPERIMENTAL/ENTERPRISE ONLY**)
| Tool | Complexity | Usage | Simplification Priority |
|------|------------|-------|------------------------|
| `mcp__claude-flow__daa_agent_create` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__daa_capability_match` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__daa_resource_alloc` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__daa_lifecycle_manage` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__daa_communication` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__daa_consensus` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__daa_fault_tolerance` | Very High | Very Low | ⭐ **Hidden by default** |
| `mcp__claude-flow__daa_optimization` | Very High | Very Low | ⭐ **Hidden by default** |

**Access Method**: Enable via configuration option `features.experimental.daa = true`

#### System & Utilities (8 tools)
| Tool | Complexity | Usage | Simplification Priority |
|------|------------|-------|------------------------|
| `mcp__claude-flow__terminal_execute` | Medium | Medium | ⭐⭐ Keep with safety |
| `mcp__claude-flow__config_manage` | High | Low | ⭐⭐⭐ Auto-manage |
| `mcp__claude-flow__features_detect` | Medium | Low | ⭐⭐ Auto-background |
| `mcp__claude-flow__security_scan` | High | Low | ⭐⭐ Advanced only |
| `mcp__claude-flow__backup_create` | Medium | Low | ⭐⭐ Auto-background |
| `mcp__claude-flow__restore_system` | High | Very Low | ⭐ Advanced only |
| `mcp__claude-flow__log_analysis` | High | Low | ⭐⭐⭐ Unify with analyze |
| `mcp__claude-flow__diagnostic_run` | Medium | Low | ⭐⭐⭐ Unify with analyze |

### 2. Ruv-Swarm MCP Tools (25 tools) - **Proceed as Originally Marked**

Advanced swarm intelligence tools that overlap with claude-flow functionality:

#### Core Swarm Operations (8 tools)
- `mcp__ruv-swarm__swarm_init` - Advanced topology management
- `mcp__ruv-swarm__swarm_status` - Enhanced status reporting
- `mcp__ruv-swarm__swarm_monitor` - Real-time monitoring
- `mcp__ruv-swarm__agent_spawn` - Intelligent agent creation
- `mcp__ruv-swarm__agent_list` - Enhanced agent management
- `mcp__ruv-swarm__agent_metrics` - Performance analytics
- `mcp__ruv-swarm__task_orchestrate` - Advanced task coordination
- `mcp__ruv-swarm__task_status` - Enhanced status tracking

#### Advanced Features (17 tools)
- Neural agent training and pattern recognition
- Byzantine consensus and fault tolerance
- Distributed computing coordination
- Performance benchmarking
- Memory management
- DAA (Dynamic Agent Architecture) systems

**Simplification Impact**: These tools are largely for advanced users and could be hidden by default or consolidated with claude-flow equivalents.

### 3. Flow-Nexus MCP Tools (70+ tools, optional) - **Proceed as Originally Marked**

Cloud-based orchestration requiring authentication:
- Sandbox management and execution
- Template deployment and management
- Real-time monitoring and streaming
- Storage and file management
- User management and authentication
- Payment and billing integration
- Neural network training in cloud
- Challenge and gamification systems

**Simplification Impact**: Optional advanced features that should remain opt-in.

---

## Agent Types Inventory (60+ agents with consolidations)

### Core Development Agents (6 agents) ⭐⭐⭐⭐⭐
**Priority**: Essential - Always visible
- `coder` - Implementation and development
- `reviewer` - Quality assurance and feedback
- `tester` - Testing and validation
- `planner` - Strategy and coordination
- `researcher` - Information gathering and analysis
- **`frontend-dev` - React/Frontend specialist** (**NEW ADDITION**)

### GitHub & Repository Agents (3 agents - **CONSOLIDATED**) ⭐⭐⭐⭐
**Priority**: High value - Consolidated from 12 agents
- `github-integration` - **Unified GitHub operations** (consolidates: github-modes, pr-manager, issue-tracker, workflow-automation, project-board-sync, swarm-pr, swarm-issue)
- `code-review-agent` - Intelligent code reviews and quality assurance
- `release-coordinator` - Release management and deployment (consolidates: release-manager, release-swarm, repo-architect, multi-repo-swarm)

**Consolidation Impact**: 12 → 3 agents (75% reduction) while maintaining all functionality through unified interfaces

### Swarm Coordination Agents (5 agents) ⭐⭐⭐
**Priority**: Auto-configure - Hide complexity
- `hierarchical-coordinator` - Queen-led hierarchical swarm
- `mesh-coordinator` - Peer-to-peer mesh network
- `adaptive-coordinator` - Dynamic topology switching
- `collective-intelligence-coordinator` - Distributed decision making
- `swarm-memory-manager` - Shared memory coordination

### Consensus & Distributed Agents (7 agents) ⭐ **EXPERIMENTAL/ENTERPRISE ONLY**
**Priority**: Configuration toggle - Hidden by default
- `byzantine-coordinator` - Byzantine fault-tolerant consensus
- `raft-manager` - Raft consensus algorithm
- `gossip-coordinator` - Gossip-based consensus
- `consensus-builder` - General consensus mechanisms
- `crdt-synchronizer` - Conflict-free replicated data types
- `quorum-manager` - Dynamic quorum management
- `security-manager` - Distributed security protocols

**Access Method**: Enable via configuration option `features.experimental.consensus = true`

### Performance & Optimization Agents (5 agents) ⭐⭐⭐
**Priority**: Consolidate into 'analyze' functionality
- `perf-analyzer` - Performance bottleneck analysis
- `performance-benchmarker` - Comprehensive benchmarking
- `task-orchestrator` - Task coordination optimization
- `memory-coordinator` - Memory management across sessions
- `smart-agent` - Intelligent coordination and spawning

### SPARC Methodology Agents (6 agents) ⭐⭐⭐⭐
**Priority**: High value - Guided development process
- `sparc-coord` - SPARC methodology orchestration
- `sparc-coder` - Transform specs to code with TDD
- `specification` - Requirements analysis specialist
- `pseudocode` - Algorithm design specialist
- `architecture` - System design specialist
- `refinement` - Iterative improvement specialist

### Specialized Development Agents (8 agents) ⭐⭐⭐
**Priority**: Context-dependent - Auto-select based on project
- `backend-dev` - Backend API development
- `mobile-dev` - React Native development
- `ml-developer` - Machine learning development
- `cicd-engineer` - CI/CD pipeline creation
- `api-docs` - OpenAPI/Swagger documentation
- `system-architect` - System architecture design
- `code-analyzer` - Advanced code analysis
- `base-template-generator` - Foundational templates

### Testing & Validation Agents (4 agents) ⭐⭐⭐⭐
**Priority**: Essential - Auto-enable for quality
- `tdd-london-swarm` - Mock-driven development
- `production-validator` - Deployment readiness
- `pagerank` - Graph analysis with PageRank
- `consciousness-evolution` - Advanced validation (hide)

### Advanced/Experimental Agents (10+ agents) ⭐ **EXPERIMENTAL/ENTERPRISE ONLY**
**Priority**: Configuration toggle - Hidden by default
- `nanosecond-scheduler` - Ultra-high-performance scheduling
- `matrix-solver` - Sublinear matrix operations
- `psycho-symbolic` - Advanced reasoning models
- `phi-calculator` - Integrated Information Theory
- `temporal-advantage` - Temporal computational lead
- `sublinear-goal-planner` - Advanced planning algorithms
- `migration-planner` - System migration planning
- `swarm-init` - Advanced swarm initialization
- Various Flow-Nexus specialized agents

**Access Method**: Enable via configuration option `features.experimental.advanced = true`

---

## Updated CLI Commands & Configuration Strategy

### Command Strategy - **REVISED**
Based on feedback that Claude Code handles command initialization, we maintain comprehensive command availability while focusing on consolidation to prevent overwhelm:

#### Core Commands (Always Available)
```bash
claude-flow init <project>              # Project initialization
claude-flow build <description>         # Build with agents
claude-flow status                      # System status
claude-flow help                        # Interactive help
claude-flow config                      # Configuration management
```

#### Consolidated Command Groups
```bash
# Memory operations (12 → 3 commands)
claude-flow memory store <key> <value>  # Unified memory operations
claude-flow memory get <key>            # Smart retrieval with search
claude-flow memory backup               # Backup/restore operations

# Analysis tools (13 → 1 command with modes)
claude-flow analyze                     # Interactive analysis menu
claude-flow analyze --performance       # Performance bottlenecks
claude-flow analyze --health           # System health check
claude-flow analyze --usage            # Resource usage stats

# GitHub operations (8 → 1 unified command)
claude-flow github                      # Unified GitHub operations
claude-flow github --pr                 # Pull request management
claude-flow github --release            # Release coordination
```

#### Enterprise Features Toggle
```bash
# Configuration-based feature enabling
claude-flow config set features.experimental.neural true
claude-flow config set features.experimental.daa true
claude-flow config set features.experimental.consensus true
claude-flow config set features.experimental.advanced true

# Enterprise mode toggle
claude-flow config set mode enterprise   # Enable all advanced features
claude-flow config set mode standard     # Standard feature set
```

### Configuration System - **UPDATED APPROACH**

#### Two-Path Configuration Strategy
```javascript
// Path 1: Detailed Control (for users who want options)
const detailedConfig = {
  setupMode: 'detailed',
  questions: [
    'Project type and framework preferences?',
    'Development workflow style (TDD, BDD, etc.)?',
    'Quality gates and standards?',
    'Team collaboration requirements?',
    'Agent coordination preferences?',
    'Integration and deployment targets?',
    'Experimental features to enable?'
  ],
  estimatedTime: '10-15 minutes',
  control: 'maximum'
};

// Path 2: AI Auto-Setup (for quick start)
const aiAutoSetup = {
  setupMode: 'ai-guided',
  questions: [
    'What type of project are you building?',
    'What\'s your experience level?',
    'Any specific requirements or constraints?'
  ],
  estimatedTime: '2-3 minutes',
  control: 'AI makes optimal decisions'
};
```

#### Enterprise Features Configuration
```json
{
  "features": {
    "standard": {
      "agents": ["coder", "tester", "reviewer", "frontend-dev", "planner"],
      "github": "integrated",
      "analysis": "basic",
      "memory": "standard"
    },
    "experimental": {
      "neural": false,
      "daa": false,
      "consensus": false,
      "advanced": false
    },
    "enterprise": {
      "enabled": false,
      "unlocks": ["all_neural", "all_daa", "all_consensus", "all_advanced"]
    }
  }
}
```

---

## Updated Simplification Priorities

### 🟢 Keep and Enhance (High Value Features)
- **Core Development Agents**: coder, tester, reviewer, **frontend-dev (React)**, planner, researcher
- **Consolidated GitHub Agent**: Single unified GitHub integration
- **Memory Operations**: Unified into 3 intuitive commands
- **Analysis Tools**: Consolidated into single command with modes
- **SPARC Methodology**: Guided development workflows

### 🟡 Consolidate and Improve (Medium Value)
- **GitHub Agents**: 12 → 3 consolidated agents ✅
- **Memory Tools**: 12 → 3 unified commands
- **Analysis Tools**: 13 → 1 command with multiple modes
- **Performance Agents**: Consolidate into analyze functionality
- **Workflow Management**: Streamline template system

### 🔴 Hide by Default (Low Value for Most Users)
- **Neural Network Tools**: All 15 tools → Configuration toggle
- **DAA Systems**: All 8 tools → Configuration toggle
- **Advanced Consensus**: All 7 tools → Configuration toggle
- **Experimental Agents**: 10+ agents → Configuration toggle

### ⚙️ Configuration-Based Access
```bash
# Enable experimental features via configuration
claude-flow config set features.experimental.neural true
claude-flow config set features.experimental.daa true
claude-flow config set features.enterprise.mode true

# Features become available after configuration
claude-flow neural train <model>        # Available after neural=true
claude-flow daa consensus <proposal>    # Available after daa=true
```

---

## Implementation Roadmap - **UPDATED**

### Phase 1: Core Consolidations (Week 1-2)
1. **GitHub Agent Consolidation** ✅
   - Merge 12 GitHub agents into 3 unified agents
   - Create single entry point with intelligent routing
   - Maintain all functionality through unified interface

2. **Add React Frontend Developer** ✅
   - Create specialized React/frontend development agent
   - Include modern React patterns (hooks, context, etc.)
   - Integration with existing coder agent workflows

3. **Hide Experimental Features** ✅
   - Move neural networks, DAA, consensus to config toggles
   - Create enterprise feature configuration system
   - Maintain backward compatibility

### Phase 2: Command Consolidation (Week 2-3)
1. **Memory Command Unification**
   - Consolidate 12 memory tools into 3 commands
   - Smart defaults and intelligent routing
   - Maintain advanced functionality for power users

2. **Analysis Tool Integration**
   - Unify 13 analysis tools into single command
   - Mode-based operation (--performance, --health, etc.)
   - Interactive menu for discovery

3. **Configuration System Enhancement**
   - Implement two-path setup (detailed vs AI-guided)
   - Create enterprise feature toggles
   - User preference learning and adaptation

### Phase 3: Polish and Optimization (Week 3-4)
1. **User Experience Refinement**
   - A/B testing of consolidated interfaces
   - Documentation updates for new structure
   - Community feedback integration

2. **Performance and Reliability**
   - Optimize consolidated command routing
   - Ensure enterprise feature isolation
   - Comprehensive testing of new structure

---

## Success Metrics - **UPDATED**

### Consolidation Impact
- **GitHub Agents**: 75% reduction (12 → 3) while maintaining functionality
- **Commands**: Streamlined without losing capability
- **Experimental Features**: Clean separation via configuration
- **User Choice**: Both detailed control and AI automation available

### User Experience Goals
- **Reduced Overwhelm**: Fewer visible options by default
- **Maintained Power**: Full functionality available when needed
- **Clear Path**: Configuration-based access to advanced features
- **Flexibility**: User choice between control and automation

### Technical Objectives
- **Backward Compatibility**: All existing functionality preserved
- **Performance**: No degradation from consolidation
- **Maintainability**: Cleaner codebase with unified interfaces
- **Extensibility**: Easy to add new features within consolidated structure

---

## Conclusion - **REVISED**

This updated inventory reflects the user feedback emphasizing practical consolidation over automatic progression. Key improvements include:

1. **GitHub Agent Consolidation**: 75% reduction with maintained functionality
2. **React Frontend Addition**: Specialized React development capabilities
3. **Configuration-Based Enterprise**: User choice rather than automatic unlock
4. **Experimental Feature Isolation**: Clean separation with toggle access
5. **Command Flexibility**: Comprehensive availability with consolidation focus

The approach balances simplification for novices with full power for advanced users, providing clear paths for both detailed control and AI-guided automation based on user preference rather than imposed progression.

---

## Files Referenced in This Analysis
- `/mnt/c/Users/masha/Documents/claude-flow-novice/CLAUDE.md`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/CHANGELOG.md`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/README.md`
- Previous analysis documents with user feedback integration

**Total Features Audited**: 200+ tools, agents, and functions with strategic consolidation plan