# Redis Coordination Skill

## Quick Start

### Prerequisites
- Redis 5.0+
- bash
- jq
- redis-cli

### Installation
1. Ensure Redis is running
2. Configure Redis connection in `config.json`
3. Make scripts executable:
```bash
chmod +x invoke-waiting-mode.sh
```

### Basic Usage

#### Consensus Collection (Updated)
```bash
# Agent reports results
./invoke-waiting-mode.sh report \
  --task-id "my-task" \
  --agent-id "agent-1" \
  --confidence 0.95

# Collect and evaluate consensus
./invoke-waiting-mode.sh collect \
  --task-id "my-task" \
  --agent-ids "agent-1,agent-2,agent-3"
```

## Important Changes in P7 (Redis Script Cleanup)

### Deprecation Notices
- 🚨 `enter` and `wake` subcommands are NO LONGER SUPPORTED
- Agents should exit cleanly without waiting mode
- Coordinator spawns agents directly
- Fork-ID references have been removed

### Migration Guide
- Update agent scripts to exit cleanly after task
- Remove manual waiting mode calls
- Use direct agent spawning in orchestrator

## Script Categories
- **Production Scripts**:
  - `invoke-waiting-mode.sh`: Redis coordination wrapper
  - `orchestrate-cfn-loop.sh`: CFN Loop orchestration
- **Demos and Tests**: Located in `./demos/`

## Performance
- Zero-token waiting
- Sub-100ms wake-up latency
- Supports 10+ concurrent agents
- Configurable consensus thresholds

## Configuration Options
See `SKILL.md` for detailed configuration and usage instructions.

## Troubleshooting
- If you encounter issues with old scripts, refer to migration guide
- Test scripts are available in `./demos/` directory