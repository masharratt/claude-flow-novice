# Claude Flow Novice - Simplified MCP Reference

## 🎯 Project Mission
Claude Flow Novice is a **simplified version** of the original enterprise claude-flow platform. We took the overwhelming 112-tool enterprise system and pared it back to **focus on transparency and reduce feature bloat** for novice developers.

## 📋 Current Implementation Status

Based on the changelog, claude-flow-novice achieved **~80% complexity reduction** while preserving advanced capabilities through progressive disclosure:

### ✅ **What Was Actually Implemented:**

#### 1. Command Simplification (95.5% reduction)
- **Before**: 112 enterprise commands
- **After**: 5 core commands for novices (`init`, `build`, `status`, `help`, `learn`)
- **Progressive Tiers**: Novice → Intermediate (+10 commands) → Expert (full access)

#### 2. GitHub Agent Consolidation (75% reduction)
- **Before**: 12 separate GitHub agents
- **After**: 3 consolidated agents:
  - `GitHubIntegrationManager` - Repository operations, workflows, architecture
  - `GitHubCollaborationManager` - PR management, code review, issue tracking
  - `GitHubReleaseCoordinator` - Multi-repo coordination, releases, deployment

#### 3. Configuration Simplification (92% reduction)
- **Before**: 95+ configuration options
- **After**: 8 essential choices with intelligent defaults
- **Zero-config setup**: <15 seconds with automatic project detection

#### 4. Feature Safety (17 experimental features hidden)
- Hidden from novices: `byzantine-coordinator`, `consciousness-evolution`, `temporal-advantage`
- Progressive access based on user experience level
- Interactive consent flows for advanced features

## 🔧 Core MCP Endpoints (Actually Available)

### Essential Coordination (8 tools)
- `swarm_init` - Initialize swarm with topology
- `agent_spawn` - Create specialized agents
- `task_orchestrate` - Orchestrate workflows
- `swarm_status` - Monitor swarm health
- `agent_list` - List active agents
- `swarm_destroy` - Gracefully shutdown swarm (prevents memory leaks)
- `swarm_scale` - Auto-scale agent count
- `memory_usage` - Store/retrieve persistent memory

### Agent Lifecycle Management (6 tools)
- `daa_lifecycle_manage` - Agent lifecycle management with cleanup
- `daa_fault_tolerance` - Fault tolerance & recovery for hanging processes
- `agent_metrics` - Monitor agent resource usage
- `health_check` - System health monitoring with memory leak detection
- `task_status` - Check task execution status
- `performance_report` - Generate reports with resource usage

### GitHub Integration (3 consolidated tools)
- `github_repo_analyze` - Repository analysis
- `github_pr_manage` - Pull request management
- `github_release_coord` - Release coordination

### Essential Workflow (4 tools)
- `workflow_create` - Create custom workflows
- `workflow_execute` - Execute workflows
- `terminal_execute` - Execute terminal commands
- `coordination_sync` - Sync agent coordination to prevent deadlocks

## 🎯 Available Agents (Progressive Disclosure)

### 🟢 **Core Novice Agents (Always Available)**
- `coder` - Implementation specialist
- `reviewer` - Code review and quality assurance
- `tester` - Testing specialist
- `planner` - Strategic planning
- `researcher` - Research and analysis
- `backend-dev` - Backend development specialist
- `system-architect` - System architecture design
- `api-docs` - API documentation expert
- `cicd-engineer` - CI/CD pipeline specialist

### 🟢 **Coordination Agents (All Available to Novices)**
- `hierarchical-coordinator` - Queen-led hierarchical swarm coordination
- `mesh-coordinator` - Peer-to-peer mesh network swarm with fault tolerance
- `adaptive-coordinator` - Dynamic topology switching coordinator
- `memory-coordinator` - Manage persistent memory across sessions

### 🟠 **Consolidated GitHub Agents** (Simplified from 12→3)
- `GitHubIntegrationManager` - Consolidated repository operations
- `GitHubCollaborationManager` - Consolidated PR and review management
- `GitHubReleaseCoordinator` - Consolidated release coordination

### 🟡 **SPARC Methodology Agents** (Available to Novices)
- `sparc-coord` - SPARC methodology orchestrator
- `sparc-coder` - Transform specifications into code with TDD
- `specification` - SPARC Specification phase specialist
- `pseudocode` - SPARC Pseudocode phase specialist
- `architecture` - SPARC Architecture phase specialist
- `refinement` - SPARC Refinement phase specialist

### 🔴 **Advanced/Enterprise** (Hidden from novices)
- Experimental features: `consciousness-evolution`, `temporal-advantage`, `byzantine-coordinator`
- Neural networks: `safla-neural`, `psycho-symbolic`, `phi-calculator`
- Advanced math: `nanosecond-scheduler`, `matrix-solver`, `pagerank`

## 🚀 Setup Commands (Simplified)

```bash
# Core MCP server (simplified version)
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Optional enhanced coordination
claude mcp add ruv-swarm npx ruv-swarm mcp start

# Start with auto-orchestrator
npx claude-flow@alpha mcp start --auto-orchestrator --daemon

# Check status
npx claude-flow@alpha mcp status
```

## 📊 Achievements vs Original Enterprise Platform

### Complexity Reduction for Novices:
- **95.5% CLI command reduction** (112→5 core commands)
- **75% GitHub agent reduction** (12→3 consolidated agents)
- **92% configuration reduction** (95+→8 essential choices)
- **17 experimental features** safely hidden from beginners
- **Essential agents accessible**: 25+ agents available to novices (vs overwhelming enterprise list)

### What Was Preserved & Enhanced:
- **100% Backward Compatibility** - All existing workflows still work
- **Full Coordination Access** - All 4 coordinator types available to novices
- **Memory Leak Management** - Built-in agent lifecycle management with cleanup
- **Resource Monitoring** - Agent termination when memory/CPU limits exceeded
- **Fault Tolerance** - Recovery from hanging processes and deadlocks
- **Performance Benefits** - 84.8% SWE-Bench solve rate, 32.3% token reduction

### Memory Leak & Process Management:
- **`swarm_destroy`** - Gracefully shutdown entire swarm to prevent memory leaks
- **`daa_lifecycle_manage`** - Terminate individual agents with resource cleanup
- **`daa_fault_tolerance`** - Recover from hanging or stuck processes
- **`agent_metrics`** - Monitor memory/CPU usage with automatic termination when limits exceeded
- **Process cleanup** - SIGTERM/SIGKILL cascade for complete cleanup

## 🔑 Key Difference from Original Claude Flow

**Original claude-flow**: Enterprise platform with 112 tools, 78+ agents, overwhelming for beginners

**claude-flow-novice**: Simplified version focusing on:
- **5 core commands** for novices
- **Essential MCP tools only** (~16 core tools vs 87+ enterprise tools)
- **Progressive complexity** rather than overwhelming feature lists
- **Transparency and reduced bloat** as primary goals

The novice version successfully achieved its mission of making AI agent orchestration accessible to beginners while preserving the powerful capabilities for those who need them.