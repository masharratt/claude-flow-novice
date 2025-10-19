# Hybrid Routing Skill

## Overview
Provides adaptive routing strategies for distributed communication systems, supporting multiple communication channels and fallback mechanisms.

## Features
- Dynamic route selection
- Primary and secondary communication channels
- Load-balanced path selection
- Contextual routing strategies

## Dependencies
- jq
- redis-cli
- openssl
- (Optional) websocketd

## Configuration
Refer to `config.json` for detailed routing configuration parameters.

### Spawning Workers
```bash
./spawn-worker.sh
```

### Dependency Check
```bash
./check-dependencies.sh
```

## Performance Targets
- Routing Accuracy: ≥0.85
- Channel Transition Time: <50ms
- Packet Loss: Minimal

## Security
- TLS 1.3 Encryption
- JWT Authentication
- Rate Limiting

## Usage Example
```bash
# Spawn routing workers
.claude/skills/hybrid-routing/spawn-worker.sh
```

## Troubleshooting
1. Ensure all dependencies are installed
2. Verify Redis server connectivity
3. Check network configurations