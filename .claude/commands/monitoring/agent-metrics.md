# agent-metrics

View agent performance metrics.

## Usage
```bash
npx cfn-spawn agent metrics [options]
```

## Options
- `--agent-id <id>` - Specific agent
- `--period <time>` - Time period
- `--format <type>` - Output format

## Examples
```bash
# All agents metrics
npx cfn-spawn agent metrics

# Specific agent
npx cfn-spawn agent metrics --agent-id agent-001

# Last hour
npx cfn-spawn agent metrics --period 1h
```
