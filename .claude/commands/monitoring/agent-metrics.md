# agent-metrics

View agent performance metrics.

## Usage
```bash
npx claude-flow-novice agent metrics [options]
```

## Options
- `--agent-id <id>` - Specific agent
- `--period <time>` - Time period
- `--format <type>` - Output format

## Examples
```bash
# All agents metrics
npx claude-flow-novice agent metrics

# Specific agent
npx claude-flow-novice agent metrics --agent-id agent-001

# Last hour
npx claude-flow-novice agent metrics --period 1h
```
