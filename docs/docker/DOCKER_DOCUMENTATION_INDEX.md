# Docker Documentation Index

Complete navigation for Claude Flow Novice Docker infrastructure, patterns, and processes.

---

## Quick Navigation

### 🎯 Start Here

- **[Architecture Summary](DOCKER_ARCHITECTURE_SUMMARY.md)** - Quick reference for patterns and recipes
- **[Comprehensive Architecture Report](architecture/DOCKER_ARCHITECTURE_COMPREHENSIVE_REPORT.md)** - Detailed technical documentation
- **[Multi-Worktree Guide](reference/DOCKER_MULTI_WORKTREE.md)** - Parallel development setup

### 📚 Core Documentation

#### Architecture

- [Comprehensive Architecture Report](architecture/DOCKER_ARCHITECTURE_COMPREHENSIVE_REPORT.md) - Complete system design
- [Coordinator Architecture](architecture/DOCKER_COORDINATOR_ARCHITECTURE.md) - Coordinator pattern details
- [CFN Agent System](reference/DOCKER_CFN_AGENT_SYSTEM.md) - 62 agent containerization

#### Reference Guides

- [Multi-Worktree Support](reference/DOCKER_MULTI_WORKTREE.md) - Parallel worktree development
- [Environment Standardization](reference/DOCKER_ENV_STANDARDIZATION.md) - CFN_ variable contract
- [Linux Native Build](reference/DOCKER_LINUX_NATIVE_BUILD.md) - 96% faster builds
- [Container Lifecycle](reference/DOCKER_CONTAINER_LIFECYCLE.md) - Spawn, monitor, cleanup

#### Implementation

- [Production Implementation](implementation/DOCKER_PRODUCTION_IMPLEMENTATION_COMPLETE.md) - Production stack
- [Dual Mode Implementation](implementation/DOCKER_DUAL_MODE_IMPLEMENTATION.md) - CLI vs Task mode
- [Multi-Language Images](implementation/DOCKER_MULTI_LANGUAGE_IMAGES_COMPLETE.md) - TypeScript, Python, Rust, etc.

#### Testing

- [Integration Test Plan](testing/DOCKER_INTEGRATION_TEST_PLAN.md) - Test strategy
- [Test Results](testing/DOCKER_TEST_RESULTS.md) - Validation reports
- [50-Agent Parallel Test](testing/DOCKER_50_AGENT_PARALLEL_TEST_PLAN.md) - Stress testing

#### Troubleshooting

- [Quick Reference](troubleshooting/DOCKER_TROUBLESHOOTING_QUICK_REFERENCE.md) - Common issues
- [CFN Loop Fixes](troubleshooting/DOCKER_CFN_LOOP_FIXES.md) - Loop-specific problems
- [WSL2 Mount Issue](troubleshooting/DOCKER_CHMOD_WSL2_MOUNT_ISSUE.md) - Permission problems

---

## Skills Reference

### Docker Build

- **Location:** `.claude/skills/docker-build/`
- **Purpose:** WSL2-optimized Docker image building (96% faster)
- **Usage:** `./.claude/skills/docker-build/build.sh`
- **Documentation:** `.claude/skills/docker-build/SKILL.md`

### CFN Docker Agent Spawning

- **Location:** `.claude/skills/cfn-docker-agent-spawning/`
- **Purpose:** Spawn agents in isolated containers with MCP selection
- **Documentation:** `.claude/skills/cfn-docker-agent-spawning/SKILL.md`

### CFN Docker Loop Orchestration

- **Location:** `.claude/skills/cfn-docker-loop-orchestration/`
- **Purpose:** Orchestrate Loop 3 → Loop 2 → Product Owner flow
- **Documentation:** `.claude/skills/cfn-docker-loop-orchestration/SKILL.md`

### CFN Docker Redis Coordination

- **Location:** `.claude/skills/cfn-docker-redis-coordination/`
- **Purpose:** State management and swarm recovery
- **Documentation:** `.claude/skills/cfn-docker-redis-coordination/SKILL.md`

### CFN Docker Wave Execution

- **Location:** `.claude/skills/cfn-docker-wave-execution/`
- **Purpose:** Wave-based container spawning with memory budget
- **Documentation:** `.claude/skills/cfn-docker-wave-execution/SKILL.md`

### CFN Docker Skill MCP Selection

- **Location:** `.claude/skills/cfn-docker-skill-mcp-selection/`
- **Purpose:** Skill-based MCP server selection for agents
- **Documentation:** `.claude/skills/cfn-docker-skill-mcp-selection/SKILL.md`

---

**Last Updated:** 2025-11-19
**Maintainer:** docker-specialist agent
**Status:** Production Ready
