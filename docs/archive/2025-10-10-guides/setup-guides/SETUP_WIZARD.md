# Setup Wizard - Quick Start Guide

## Overview

The Interactive Setup Wizard helps novice users configure Claude Flow Novice in less than 5 minutes with guided prompts and automatic validation.

## Quick Start

```bash
npx claude-flow-novice setup
```

## What It Does

The wizard walks you through 7 steps:

### 1. Dependency Validation (30 seconds)
- ✅ Checks Node.js v20+ is installed
- ✅ Verifies npm v9+ is available
- ⚠️  Optionally checks for Redis (can continue without it)

### 2. Redis Configuration (1 minute)
- 🔍 Auto-detects local Redis instance
- 📝 Manual configuration if needed
- 🧪 Tests connection before proceeding
- ⏭️  Option to skip (uses in-memory storage)

### 3. Project Configuration (1 minute)
- 📛 Project name validation
- 🎯 Environment selection (dev/staging/prod)
- ✨ Feature selection (coordination, memory, tasks, etc.)
- 📊 Auto-configures agent limits based on environment

### 4. Optional Configuration (30 seconds)
- 🔑 API key configuration (optional)
- 🚀 Advanced feature toggles

### 5. Generate Configuration (30 seconds)
- 📝 Creates `.env` file with settings
- 📋 Generates `.env.example` template
- ⚙️  Creates `claude-flow-novice.config.json`

### 6. Initialize Project (30 seconds)
- 📁 Creates directory structure
- 📚 Generates README.md
- 🏗️  Sets up memory and log directories

### 7. Validation (30 seconds)
- ✅ Validates all configuration files
- 🔌 Tests Redis connection (if configured)
- 🎯 Verifies project structure

## Usage Examples

### Basic Setup (Interactive)
```bash
npx claude-flow-novice setup
```

### Non-Interactive (Uses Defaults)
```bash
npx claude-flow-novice setup --non-interactive
```

### Skip Dependency Check
```bash
npx claude-flow-novice setup --skip-dependencies
```

### Skip Redis Configuration
```bash
npx claude-flow-novice setup --skip-redis
```

## Configuration Options

### Environment Presets

**Development** (Default)
- Max Agents: 10
- Log Level: debug
- Metrics: Enabled
- Alerting: Disabled

**Staging**
- Max Agents: 100
- Log Level: info
- Metrics: Enabled
- Alerting: Enabled

**Production**
- Max Agents: 500
- Log Level: warn
- Metrics: Enabled
- Alerting: Enabled

### Redis Options

**Auto-Detect**
- Automatically finds Redis at localhost:6379
- Tests connection before proceeding

**Manual Configuration**
- Custom host and port
- Optional password authentication
- Connection validation

**Skip Redis**
- Uses in-memory storage
- Limited persistence
- Good for testing/development

## Generated Files

After setup completes, you'll have:

```
.
├── .env                              # Environment variables (DON'T commit)
├── .env.example                      # Template for team (safe to commit)
├── claude-flow-novice.config.json   # Project configuration
├── README.md                         # Project documentation
├── memory/                           # Memory storage
│   ├── agents/                      # Agent-specific memory
│   └── sessions/                    # Session data
├── logs/                            # Log files
├── config/                          # Additional config
└── .claude/                         # Claude-specific data
    └── agents/                      # Agent definitions
```

## Next Steps After Setup

1. **Start the system:**
   ```bash
   npx claude-flow-novice start
   ```

2. **Spawn your first agent:**
   ```bash
   npx claude-flow-novice agent spawn researcher --name "my-agent"
   ```

3. **Create a task:**
   ```bash
   npx claude-flow-novice task create research "Analyze market trends"
   ```

4. **Monitor the system:**
   ```bash
   npx claude-flow-novice monitor
   ```

## Troubleshooting

### Node.js Version Too Old
```bash
# Install Node.js v20+
# macOS: brew install node@20
# Ubuntu: sudo apt-get install nodejs
# Windows: Download from nodejs.org
```

### Redis Not Found
```bash
# Install Redis
# macOS:
brew install redis

# Ubuntu:
sudo apt-get install redis-server

# Windows:
# See https://redis.io/docs/getting-started/installation/install-redis-on-windows/
```

### Redis Connection Failed
```bash
# Start Redis server
redis-server

# Or specify custom connection
npx claude-flow-novice setup
# Choose "Custom settings" when prompted
```

### Permission Errors
```bash
# Run with proper permissions
sudo npx claude-flow-novice setup

# Or change directory ownership
sudo chown -R $USER:$USER .
```

### Already Configured Warning
The wizard will detect existing configuration files and offer to:
- Overwrite (lose current settings)
- Merge (keep existing, add new)
- Cancel (exit without changes)

## Advanced Options

### Environment Variables

You can pre-set environment variables before running setup:

```bash
# Pre-configure Redis
export REDIS_HOST=my-redis-server.com
export REDIS_PORT=6380

# Pre-set API key
export API_KEY=sk-...

# Run setup
npx claude-flow-novice setup --non-interactive
```

### Config File Templates

Create a custom template config:

```json
{
  "projectName": "my-custom-project",
  "environment": "production",
  "features": ["coordination", "memory", "neural"],
  "maxAgents": 1000
}
```

Then reference it:
```bash
npx claude-flow-novice setup --config my-template.json
```

## Help & Support

### Get Help
```bash
npx claude-flow-novice setup --help
```

### Report Issues
- GitHub: https://github.com/masharratt/claude-flow-novice/issues
- Include: OS, Node version, Redis version, error messages

### Documentation
- API Reference: `/docs/API.md`
- Examples: `/examples/`
- Troubleshooting: `/docs/TROUBLESHOOTING.md`

## Time Estimates

| Step | Estimated Time |
|------|---------------|
| Dependency Validation | 30 seconds |
| Redis Configuration | 1 minute |
| Project Configuration | 1 minute |
| Optional Settings | 30 seconds |
| File Generation | 30 seconds |
| Project Initialization | 30 seconds |
| Validation | 30 seconds |
| **Total** | **~5 minutes** |

## Features Enabled by Default

- ✅ Agent Coordination
- ✅ Memory Management
- ✅ Task Orchestration
- ✅ Performance Monitoring
- ✅ MCP Server Integration
- ❌ Neural Learning (opt-in)

## Security Best Practices

1. **Never commit `.env` files**
   - Add to `.gitignore`
   - Use `.env.example` for team templates

2. **Rotate API keys regularly**
   - Update in `.env` file
   - Restart system to apply

3. **Use Redis authentication in production**
   - Enable password protection
   - Use TLS for remote connections

4. **Limit agent counts**
   - Start small (10 agents)
   - Scale based on system resources

## FAQ

**Q: Can I run without Redis?**
A: Yes, use in-memory storage. Data won't persist between restarts.

**Q: How do I change configuration later?**
A: Edit `.env` file directly or run setup again.

**Q: What if setup fails?**
A: Check the error message, install missing dependencies, and retry.

**Q: Can I use an existing Redis instance?**
A: Yes, choose "Custom settings" during Redis configuration.

**Q: How do I upgrade from in-memory to Redis?**
A: Run setup again and configure Redis when prompted.

---

*Generated with Claude Flow Novice Setup Wizard*
