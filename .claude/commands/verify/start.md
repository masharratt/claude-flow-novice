# 🔍 Verification Commands

Truth verification system for ensuring code quality and correctness with a 0.95 accuracy threshold.

## Overview

The verification system provides real-time truth checking and validation for all agent tasks, ensuring high-quality outputs and automatic rollback on failures.

## Subcommands

### `verify check`
Run verification checks on current code or agent outputs.

```bash
claude-flow-novice verify check --file src/app.js
claude-flow-novice verify check --task "task-123"
claude-flow-novice verify check --threshold 0.98
```

### `verify rollback`
Automatically rollback changes that fail verification.

```bash
claude-flow-novice verify rollback --to-commit abc123
claude-flow-novice verify rollback --last-good
claude-flow-novice verify rollback --interactive
```

### `verify report`
Generate verification reports and metrics.

```bash
claude-flow-novice verify report --format json
claude-flow-novice verify report --export metrics.html
claude-flow-novice verify report --period 7d
```

### `verify dashboard`
Launch interactive verification dashboard.

```bash
claude-flow-novice verify dashboard
claude-flow-novice verify dashboard --port 3000
claude-flow-novice verify dashboard --export
```

## Configuration

Default threshold: **0.95** (95% accuracy required)

Configure in `.claude-flow/config.json`:
```json
{
  "verification": {
    "threshold": 0.95,
    "autoRollback": true,
    "gitIntegration": true,
    "hooks": {
      "preCommit": true,
      "preTask": true,
      "postEdit": true
    }
  }
}
```

## Integration

### With Swarm Commands
```bash
claude-flow-novice swarm --verify --threshold 0.98
claude-flow-novice hive-mind --verify
```

### With Training Pipeline
```bash
claude-flow-novice train --verify --rollback-on-fail
```

### With Pair Programming
```bash
claude-flow-novice pair --verify --real-time
```

## Metrics

- **Truth Score**: 0.0 to 1.0 (higher is better)
- **Confidence Level**: Statistical confidence in verification
- **Rollback Rate**: Percentage of changes rolled back
- **Quality Improvement**: Trend over time

## Examples

### Basic Verification
```bash
# Verify current directory
claude-flow-novice verify check

# Verify with custom threshold
claude-flow-novice verify check --threshold 0.99

# Verify and auto-fix
claude-flow-novice verify check --auto-fix
```

### Advanced Workflows
```bash
# Continuous verification during development
claude-flow-novice verify watch --directory src/

# Batch verification
claude-flow-novice verify batch --files "*.js" --parallel

# Integration testing
claude-flow-novice verify integration --test-suite full
```

## Performance

- Verification latency: <100ms for most checks
- Rollback time: <1s for git-based rollback
- Dashboard refresh: Real-time via WebSocket

## Related Commands

- `truth` - View truth scores and metrics
- `pair` - Collaborative development with verification
- `train` - Training with verification feedback