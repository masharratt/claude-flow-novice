# Configuration Troubleshooting Guide

This guide covers configuration-related issues, validation, migration, and management problems in Claude Flow.

## Table of Contents

1. [Configuration File Issues](#configuration-file-issues)
2. [Environment Variables](#environment-variables)
3. [Configuration Validation](#configuration-validation)
4. [Migration and Compatibility](#migration-and-compatibility)
5. [Feature Configuration](#feature-configuration)
6. [Security Configuration](#security-configuration)
7. [Debugging Configuration](#debugging-configuration)

## Configuration File Issues

### Error: `Configuration file not found`

**Common Locations:**
```bash
# Check common configuration locations
ls -la ~/.claude-flow/config.json
ls -la ./claude-flow.config.json
ls -la ./package.json  # Check for claudeFlow section
ls -la ./.claude-flow/config.json
```

**Solutions:**

#### 1. Initialize Configuration
```bash
# Create new configuration
claude-flow-novice init

# Create minimal configuration
claude-flow-novice config create --minimal

# Create configuration with prompts
claude-flow-novice config create --interactive
```

#### 2. Specify Configuration File
```bash
# Use specific config file
claude-flow-novice --config /path/to/config.json status

# Set environment variable
export CLAUDE_FLOW_CONFIG=/path/to/config.json

# Use configuration in package.json
# Add "claudeFlow": { ... } section to package.json
```

#### 3. Generate Default Configuration
```bash
# Generate with defaults
claude-flow-novice config generate --defaults

# Generate for specific environment
claude-flow-novice config generate --env development

# Generate with templates
claude-flow-novice config generate --template basic
```

### Error: `Invalid JSON syntax`

**Diagnostic Commands:**
```bash
# Validate JSON syntax
python -m json.tool ~/.claude-flow/config.json

# Check with jq
jq . ~/.claude-flow/config.json

# Use built-in validator
claude-flow-novice config validate --syntax
```

**Common JSON Issues:**

#### 1. Trailing Commas
```json
// ❌ Invalid - trailing comma
{
  "swarm": {
    "maxAgents": 5,
    "topology": "mesh",  // <- Remove this comma
  }
}

// ✅ Valid
{
  "swarm": {
    "maxAgents": 5,
    "topology": "mesh"
  }
}
```

#### 2. Missing Quotes
```json
// ❌ Invalid - unquoted keys
{
  swarm: {
    maxAgents: 5
  }
}

// ✅ Valid
{
  "swarm": {
    "maxAgents": 5
  }
}
```

#### 3. Comment Issues
```json
// ❌ Invalid - JSON doesn't support comments
{
  // This is a comment
  "swarm": {
    "maxAgents": 5
  }
}

// ✅ Valid - use JSONC or remove comments
{
  "swarm": {
    "maxAgents": 5
  }
}
```

**Fix JSON Issues:**
```bash
# Auto-fix common issues
claude-flow-novice config fix --syntax

# Convert from YAML
claude-flow-novice config convert --from yaml --to json

# Validate and fix
claude-flow-novice config validate --fix
```

### Error: `Configuration schema validation failed`

**Schema Validation:**
```bash
# Validate against schema
claude-flow-novice config validate --schema

# Show validation errors
claude-flow-novice config validate --verbose

# Get schema documentation
claude-flow-novice config schema --docs
```

**Common Schema Issues:**

#### 1. Invalid Property Types
```json
// ❌ Invalid - string instead of number
{
  "swarm": {
    "maxAgents": "5"  // Should be number
  }
}

// ✅ Valid
{
  "swarm": {
    "maxAgents": 5
  }
}
```

#### 2. Missing Required Properties
```json
// ❌ Invalid - missing required properties
{
  "swarm": {}
}

// ✅ Valid
{
  "swarm": {
    "topology": "mesh",
    "maxAgents": 5
  }
}
```

#### 3. Invalid Enum Values
```json
// ❌ Invalid - invalid topology value
{
  "swarm": {
    "topology": "invalid-topology"
  }
}

// ✅ Valid
{
  "swarm": {
    "topology": "mesh"  // Valid: mesh, hierarchical, ring, star
  }
}
```

## Environment Variables

### Environment Variable Issues

**List Environment Variables:**
```bash
# Show all Claude Flow environment variables
claude-flow-novice env list

# Show specific variables
echo $CLAUDE_FLOW_CONFIG
echo $NODE_ENV
echo $DEBUG
echo $CLAUDE_API_KEY
```

**Common Environment Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `CLAUDE_FLOW_CONFIG` | Configuration file path | `/path/to/config.json` |
| `NODE_ENV` | Environment mode | `development`, `production` |
| `DEBUG` | Debug categories | `claude-flow:*`, `agent:*` |
| `CLAUDE_API_KEY` | Claude API key | `sk-...` |
| `HTTP_PROXY` | HTTP proxy server | `http://proxy:8080` |
| `HTTPS_PROXY` | HTTPS proxy server | `https://proxy:8080` |
| `NODE_OPTIONS` | Node.js options | `--max-old-space-size=8192` |

### Setting Environment Variables

#### 1. Temporary (Current Session)
```bash
# Set for current session
export CLAUDE_FLOW_CONFIG=/path/to/config.json
export NODE_ENV=development
export DEBUG=claude-flow:*
```

#### 2. Permanent (Shell Profile)
```bash
# Add to ~/.bashrc or ~/.zshrc
echo 'export CLAUDE_FLOW_CONFIG=/path/to/config.json' >> ~/.bashrc
echo 'export NODE_ENV=development' >> ~/.bashrc
source ~/.bashrc
```

#### 3. Project-specific (.env file)
```bash
# Create .env file in project root
cat > .env << EOF
CLAUDE_FLOW_CONFIG=./claude-flow.config.json
NODE_ENV=development
DEBUG=claude-flow:*
EOF

# Load environment
source .env
```

#### 4. Using dotenv
```bash
# Install dotenv-cli
npm install -g dotenv-cli

# Run with .env file
dotenv claude-flow-novice status
```

### Environment Variable Priority

**Priority Order (highest to lowest):**
1. Command-line arguments
2. Environment variables
3. .env files
4. Configuration files
5. Default values

```bash
# Command-line overrides environment
CLAUDE_FLOW_CONFIG=file1.json claude-flow-novice --config file2.json status
# Uses file2.json (command-line wins)
```

## Configuration Validation

### Comprehensive Validation

```bash
# Full validation suite
claude-flow-novice config validate --comprehensive

# Validate specific sections
claude-flow-novice config validate --section swarm
claude-flow-novice config validate --section agents

# Validate against environment
claude-flow-novice config validate --env production
```

### Configuration Testing

```bash
# Test configuration
claude-flow-novice config test

# Dry-run with configuration
claude-flow-novice --dry-run sparc run "test task"

# Validate external dependencies
claude-flow-novice config validate --external-deps
```

### Common Validation Errors

#### 1. Resource Limits
```bash
# Error: Memory limit too low
claude-flow-novice config validate
# Warning: agents.memoryLimit (256MB) is below recommended minimum (512MB)

# Fix:
claude-flow-novice config set agents.memoryLimit 512
```

#### 2. Network Configuration
```bash
# Error: Invalid proxy URL
claude-flow-novice config validate
# Error: network.proxy.http "invalid-url" is not a valid URL

# Fix:
claude-flow-novice config set network.proxy.http "http://proxy:8080"
```

#### 3. Path Issues
```bash
# Error: Invalid path
claude-flow-novice config validate
# Error: storage.path "/invalid/path" does not exist

# Fix:
mkdir -p /valid/path
claude-flow-novice config set storage.path "/valid/path"
```

## Migration and Compatibility

### Configuration Migration

```bash
# Check for migration needs
claude-flow-novice config migration-check

# Migrate configuration
claude-flow-novice config migrate

# Migrate from specific version
claude-flow-novice config migrate --from-version 1.0.0

# Backup before migration
claude-flow-novice config backup --name pre-migration
```

### Version Compatibility

```bash
# Check compatibility
claude-flow-novice config compatibility-check

# Show version requirements
claude-flow-novice config version-requirements

# Upgrade configuration format
claude-flow-novice config upgrade --to-version 2.0.0
```

### Legacy Configuration Support

```bash
# Convert from legacy format
claude-flow-novice config convert --from legacy --to current

# Support legacy keys
claude-flow-novice config legacy-support --enable

# Show deprecated options
claude-flow-novice config deprecated --list
```

### Migration Examples

#### From v1.0 to v2.0
```json
// Old format (v1.0)
{
  "maxAgents": 5,
  "topology": "mesh",
  "memory": 1024
}

// New format (v2.0)
{
  "swarm": {
    "maxAgents": 5,
    "topology": "mesh"
  },
  "agents": {
    "memoryLimit": 1024
  }
}
```

**Migration Command:**
```bash
claude-flow-novice config migrate --from 1.0 --to 2.0
```

## Feature Configuration

### Feature Flags

```bash
# List available features
claude-flow-novice features list

# Enable feature
claude-flow-novice config set features.analytics true

# Disable experimental features
claude-flow-novice config set features.experimental false

# Check feature status
claude-flow-novice features status
```

### Common Feature Configurations

#### 1. Analytics and Telemetry
```json
{
  "features": {
    "analytics": false,
    "telemetry": false,
    "errorReporting": true,
    "performanceMetrics": true
  }
}
```

#### 2. Experimental Features
```json
{
  "features": {
    "experimental": {
      "enabled": false,
      "betaFeatures": false,
      "advancedSwarm": false
    }
  }
}
```

#### 3. Debug Features
```json
{
  "features": {
    "debug": {
      "verbose": false,
      "tracing": false,
      "profiling": false
    }
  }
}
```

### Feature Dependencies

```bash
# Check feature dependencies
claude-flow-novice features dependencies

# Resolve dependency conflicts
claude-flow-novice features resolve-conflicts

# Enable feature with dependencies
claude-flow-novice features enable analytics --with-deps
```

## Security Configuration

### Authentication Configuration

```bash
# Configure authentication
claude-flow-novice config set auth.method api-key
claude-flow-novice config set auth.apiKey your-api-key

# Test authentication
claude-flow-novice auth test

# Refresh authentication
claude-flow-novice auth refresh
```

### SSL/TLS Configuration

```json
{
  "network": {
    "ssl": {
      "enabled": true,
      "verify": true,
      "ca": "/path/to/ca.pem",
      "cert": "/path/to/cert.pem",
      "key": "/path/to/key.pem"
    }
  }
}
```

### Security Validation

```bash
# Security audit
claude-flow-novice config security-audit

# Check for sensitive data
claude-flow-novice config check-sensitive

# Encrypt sensitive values
claude-flow-novice config encrypt --key api-key
```

### Permission Configuration

```bash
# Set file permissions
chmod 600 ~/.claude-flow/config.json

# Secure directory
chmod 700 ~/.claude-flow/

# Check permissions
claude-flow-novice config check-permissions
```

## Debugging Configuration

### Configuration Debugging

```bash
# Show effective configuration
claude-flow-novice config show --effective

# Show configuration sources
claude-flow-novice config sources

# Trace configuration loading
DEBUG=config:* claude-flow-novice config show
```

### Configuration Diff

```bash
# Compare configurations
claude-flow-novice config diff config1.json config2.json

# Compare with defaults
claude-flow-novice config diff --with-defaults

# Compare environments
claude-flow-novice config diff --env dev prod
```

### Configuration Analysis

```bash
# Analyze configuration
claude-flow-novice config analyze

# Performance impact analysis
claude-flow-novice config performance-impact

# Security analysis
claude-flow-novice config security-analysis
```

## Common Configuration Patterns

### Development Configuration
```json
{
  "environment": "development",
  "logging": {
    "level": "debug",
    "console": true
  },
  "features": {
    "hotReload": true,
    "debugging": true
  },
  "swarm": {
    "maxAgents": 3,
    "timeout": 60000
  }
}
```

### Production Configuration
```json
{
  "environment": "production",
  "logging": {
    "level": "info",
    "file": "/var/log/claude-flow.log"
  },
  "features": {
    "analytics": true,
    "errorReporting": true
  },
  "swarm": {
    "maxAgents": 10,
    "timeout": 30000
  },
  "performance": {
    "mode": "high",
    "optimization": "aggressive"
  }
}
```

### Testing Configuration
```json
{
  "environment": "test",
  "logging": {
    "level": "warn",
    "console": false
  },
  "features": {
    "analytics": false,
    "telemetry": false
  },
  "swarm": {
    "maxAgents": 2,
    "timeout": 10000
  }
}
```

## Configuration Management Tools

### Configuration Templates

```bash
# List available templates
claude-flow-novice config templates list

# Generate from template
claude-flow-novice config generate --template production

# Create custom template
claude-flow-novice config template create --name custom
```

### Configuration Profiles

```bash
# Create profile
claude-flow-novice config profile create development

# Switch profile
claude-flow-novice config profile switch production

# List profiles
claude-flow-novice config profile list
```

### Configuration Backup and Restore

```bash
# Backup configuration
claude-flow-novice config backup --name backup-$(date +%Y%m%d)

# List backups
claude-flow-novice config backup list

# Restore configuration
claude-flow-novice config restore --name backup-20240926

# Auto-backup before changes
claude-flow-novice config set autoBackup true
```

## Troubleshooting Workflow

### Step 1: Identify Configuration Issues
```bash
# Quick health check
claude-flow-novice config health-check

# Validation
claude-flow-novice config validate --comprehensive

# Show effective configuration
claude-flow-novice config show --effective
```

### Step 2: Diagnose Problems
```bash
# Check configuration sources
claude-flow-novice config sources

# Compare with working configuration
claude-flow-novice config diff --baseline working-config.json

# Analyze configuration
claude-flow-novice config analyze --issues
```

### Step 3: Fix Issues
```bash
# Auto-fix common issues
claude-flow-novice config fix --auto

# Reset problematic sections
claude-flow-novice config reset --section swarm

# Restore from backup
claude-flow-novice config restore --name last-working
```

### Step 4: Verify Fix
```bash
# Test configuration
claude-flow-novice config test

# Dry-run operations
claude-flow-novice --dry-run sparc run "test"

# Monitor for issues
claude-flow-novice monitor --config-issues
```

---

**Next Steps:**
- [Platform-Specific Troubleshooting](./windows-troubleshooting.md)
- [Debug Mode Guide](./debug-mode.md)
- [Log Analysis Guide](./log-analysis.md)