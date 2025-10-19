# Claude Flow Novice Changelog

## v2.0.0 - Skills-First Architecture (2025-10-18)

### 🚀 Major Release - Breaking Changes

**Architecture Migration:**
- ✅ Skills-first coordination (redis-coordination, agent-spawning, cfn-loop-validation)
- ✅ Zero-token waiting via Redis BLPOP
- ✅ Orchestrated CFN Loop with automatic dependency enforcement
- ✅ Cost-savings mode (CLI spawning, 95-98% savings)
- ✅ Post-edit validation pipeline (mandatory)
- ✅ Parallel agent spawning requirement

**Breaking Changes:**
- ❌ MCP protocol deprecated (use CLI/skills)
- ❌ Manual CFN Loop Task() spawning forbidden (use orchestrator)
- ❌ Implicit coordination removed (use Redis pub/sub)

**New Features:**
- Skills system (9 production skills)
- Waiting mode protocol (enter/wake/report/collect)
- orchestrate-cfn-loop.sh for managed CFN execution
- Heartbeat monitoring and agent health tracking
- Priority wake mechanism for agent coordination

**Migration Guide:**
See README.md and log-skills.md for v1 → v2 migration patterns.

### Skills Introduced
1. Redis Coordination
2. Agent Spawning
3. CFN Loop Validation
4. Transparency Middleware
5. Event Bus
6. Fleet Management
7. Monitoring Skills
8. Web Portal
9. ACE System

## [1.6.3] - 2025-10-04

### 🐛 Critical Fix: WSL Memory Leak
- **PreToolUse Hook**: Blocks `find /mnt/c` commands that cause catastrophic memory leaks on WSL
  - Memory spike: 15GB → 36GB in 4 minutes from find commands
  - Hook returns error: "🔴 BLOCKED: find on /mnt/c paths forbidden (causes memory leak - use Glob tool instead)"
  - Files: `.claude/settings.json` in both claude-flow-novice and ourstories-v2

### 📊 Root Cause Analysis
- **Monitoring Results**: 10-minute observation confirmed `find /mnt/c` as memory bomb
  - 2-3 concurrent find commands: +16GB memory spike
  - Growth rate: 4GB/minute while finds active
  - WSL filesystem translation causes 2-10 second delays per find + 50-200MB buffered output

## [Remaining previous changelog content would follow]