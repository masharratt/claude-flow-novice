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
chmod +x invoke-redis-pattern.sh test-waiting-mode.sh
```

### Basic Usage

#### Waiting Mode
```bash
# Agent enters waiting mode
./invoke-redis-pattern.sh wait \
  --task-id "my-task" \
  --agent-id "agent-1" \
  --context "iteration-1"

# Coordinator wakes agent
./invoke-redis-pattern.sh wake \
  --task-id "my-task" \
  --agent-id "agent-1" \
  --payload '{"instruction": "proceed"}'
```

#### Consensus Collection
```bash
# Multiple agents report results
./invoke-redis-pattern.sh report \
  --task-id "my-task" \
  --agent-id "agent-1" \
  --confidence 0.95 \
  --result '{"status": "completed"}'

# Collect and evaluate consensus
./invoke-redis-pattern.sh collect \
  --task-id "my-task" \
  --agent-ids "agent-1,agent-2,agent-3"
```

## Testing
Run comprehensive tests:
```bash
./test-waiting-mode.sh
```

## Configuration Options
See `SKILL.md` for detailed configuration and usage instructions.

## Performance
- Zero-token waiting
- Sub-100ms wake-up latency
- Supports 10+ concurrent agents
- Configurable consensus thresholds
