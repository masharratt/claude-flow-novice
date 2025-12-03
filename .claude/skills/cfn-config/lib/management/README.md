# Configuration Management Skill

## Prerequisites
- Node.js 18+
- jq
- ajv-cli

## Installation
```bash
npm install -g ajv-cli
```

## Configuration Commands
```bash
# Get a configuration value
./manage-config.sh get redis.host

# Set a configuration value
./manage-config.sh set agent.log_level "debug"

# List all configurations
./manage-config.sh list

# Reset to defaults
./manage-config.sh reset
```

## Dependency Check
```bash
./check-dependencies.sh
```

## Permissions
```bash
chmod +x manage-config.sh
chmod +x check-dependencies.sh
```

## Security Notes
- Configuration is stored in `~/.claude-flow-config.json`
- Validated against JSON schema
- Atomic updates prevent race conditions