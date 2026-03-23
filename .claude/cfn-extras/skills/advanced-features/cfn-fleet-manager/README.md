# Fleet Manager Skill

Comprehensive resource allocation, performance monitoring, and load balancing for distributed agent swarms.

## Quick Start

### 1. Register an Agent
```bash
./.claude/skills/fleet-manager/invoke-fleet-register.sh \
  --agent-id backend-dev-1 \
  --tier dedicated
```

### 2. Allocate Resources
```bash
./.claude/skills/fleet-manager/invoke-fleet-allocate.sh \
  --agent-id backend-dev-1 \
  --cpu 3.0 \
  --memory 3072
```

### 3. Monitor Performance
```bash
./.claude/skills/fleet-manager/invoke-fleet-metrics.sh \
  --agent-id backend-dev-1
```

### 4. Balance Load
```bash
./.claude/skills/fleet-manager/invoke-fleet-balance.sh \
  --agents "backend-dev-1,backend-dev-2,backend-dev-3"
```

## Resource Tiers

| Tier | CPU | Memory | Use Case |
|------|-----|--------|----------|
| Shared | 0.5 cores | 512 MB | Research, documentation |
| Dedicated | 2.0 cores | 2048 MB | Backend dev, testing |
| Premium | 4.0 cores | 4096 MB | CFN Loop, compilation |

## Available Scripts

- `invoke-fleet-register.sh` - Register agent with resource tier
- `invoke-fleet-allocate.sh` - Allocate custom resources
- `invoke-fleet-metrics.sh` - Get performance metrics
- `invoke-fleet-balance.sh` - Trigger load balancing
- `test-fleet-manager.sh` - Run comprehensive test suite

## Testing

Run the full test suite:
```bash
./.claude/skills/fleet-manager/test-fleet-manager.sh
```

## Documentation

See [SKILL.md](./SKILL.md) for comprehensive documentation including:
- Detailed usage examples
- Integration patterns
- Performance characteristics
- Error handling
- Best practices

## Dependencies

- Redis (running)
- jq
- bc

## Version

1.0.0 - Initial release (2025-10-19)
