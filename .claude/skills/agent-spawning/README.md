# Agent Spawning Skill

## Overview
Dynamic agent initialization and coordination skill enabling intelligent multi-agent system deployment with complex topology management and dependency resolution.

## Status
**OPERATIONAL** - Agent-accessible via CLI wrapper

## Dependencies

### Required
- **Node.js** >= 18.0.0 (Runtime for coordination scripts)
- **Bash** >= 4.0 (Shell scripting support)
- **jq** (JSON processing in shell scripts)

### Optional (for enhanced features)
- **Redis** (Optional for async agent coordination)
  - Package: `redis-server` and `redis-cli`
  - Purpose: Real-time agent pub/sub communication

## Installation

### Install Required Dependencies

```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Install jq (if not already installed)
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq

# Windows (WSL)
sudo apt-get install jq
```

### Install Optional Dependencies (Recommended)

```bash
# Install Redis (for agent coordination)
# Ubuntu/Debian
sudo apt-get install redis-server redis-tools

# macOS
brew install redis

# Start Redis server
redis-server &

# Verify Redis is running
redis-cli ping  # Should return "PONG"
```

### Verify Installation

```bash
# Check Node.js
node --version  # Should be >= 18.0.0

# Check jq
jq --version  # Should show version info

# Check Redis (optional)
redis-cli ping  # Should return "PONG"

# Test agent spawning CLI
./.claude/skills/agent-spawning/spawn-agent.sh --help
```

## Quick Start

### Basic Usage

```bash
# Direct spawning with specific agent types
./.claude/skills/agent-spawning/spawn-agent.sh \
  --task "Implement user authentication" \
  --agents coder,security-specialist,tester \
  --agent-id coordinator-1

# Template-based spawning
./.claude/skills/agent-spawning/spawn-agent.sh \
  --template feature-development \
  --task "Add user login functionality" \
  --agent-id coordinator-2

# List available templates
./.claude/skills/agent-spawning/spawn-agent.sh --list-templates

# List available agent types
./.claude/skills/agent-spawning/spawn-agent.sh --list-agents
```

## Common Issues

### Issue: "jq: command not found"
**Solution:** Install jq using package manager (see Installation section)

### Issue: Redis connection errors
**Solution:** Redis is optional. Agent spawning works without Redis, but async coordination features will be unavailable.

```bash
# Check if Redis is running
redis-cli ping

# Start Redis if needed
redis-server &
```

### Issue: Permission denied on spawn-agent.sh
**Solution:** Make script executable

```bash
chmod +x ./.claude/skills/agent-spawning/spawn-agent.sh
```

## Documentation
See `SKILL.md` for comprehensive documentation including:
- Three spawning methods (CLI, Task Tool, Templates)
- Redis coordination patterns
- Agent selection guide
- Cost optimization strategies
- Error handling

## Performance Targets
- Spawn time: <200ms per agent
- Success rate: >99.5%
- Max concurrent agents: 15

## Related Skills
- **Redis Coordination** - `.claude/skills/redis-coordination/SKILL.md`
- **CFN Loop Validation** - `.claude/skills/cfn-loop-validation/SKILL.md`

---
**Version:** 1.2.0
**Last Updated:** 2025-10-18
**Maintainer:** Claude Flow Novice Team
