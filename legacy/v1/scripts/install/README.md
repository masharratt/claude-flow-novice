# Claude Flow Novice - Installation Toolkit

A comprehensive installation and setup toolkit for the Claude Flow Novice NPM package. This toolkit provides seamless installation, configuration, and management across multiple platforms.

## Features

- 🔍 **System Requirements Check** - Validates system dependencies and requirements
- ⚙️ **Interactive Setup Wizard** - Guided configuration with sensible defaults
- 🔧 **Automatic Redis Installation** - Platform-specific Redis setup and optimization
- 🚀 **One-Command Installation** - Complete setup with minimal user intervention
- 🔄 **Update Management** - Seamless updates with configuration preservation
- 🛠️ **Service Management** - Cross-platform service start/stop/restart operations
- 🏥 **Health Monitoring** - Comprehensive system health verification
- 🗑️ **Clean Uninstallation** - Complete removal with configuration preservation options

## Quick Start

### One-Command Installation

```bash
npm install claude-flow-novice && claude-flow-novice setup
```

Or using NPX (no installation required):

```bash
npx claude-flow-novice install
```

### Manual Installation Steps

1. **Check System Requirements**
   ```bash
   npx claude-flow-novice install check
   ```

2. **Run Setup Wizard**
   ```bash
   npx claude-flow-novice install setup
   ```

3. **Setup Redis**
   ```bash
   npx claude-flow-novice install redis
   ```

4. **Verify Installation**
   ```bash
   npx claude-flow-novice install health
   ```

## Installation Commands

### Full Installation

```bash
npx claude-flow-novice install
```

Runs the complete installation process:
- System requirements validation
- Interactive configuration setup
- Redis installation and configuration
- Service initialization
- Installation verification

### Individual Components

#### System Requirements Check
```bash
npx claude-flow-novice install check
```
Validates:
- Node.js version (>= 20.0.0)
- npm version (>= 9.0.0)
- Available memory and disk space
- Platform compatibility
- Network connectivity

#### Setup Wizard
```bash
npx claude-flow-novice install setup
```
Interactive configuration for:
- Installation type (development/production/minimal)
- Redis settings
- Feature selection
- Service configuration
- Performance tuning

#### Redis Setup
```bash
npx claude-flow-novice install redis
```
Platform-specific Redis installation:
- **Windows**: Chocolatey package installation
- **macOS**: Homebrew installation and service setup
- **Linux**: Distribution-specific package installation

**NPM Script Alternatives:**
```bash
# Automated setup (install + configure + test)
npm run redis:setup

# Test Redis connection
npm run redis:test

# Check Redis status
npm run redis:status

# Service management
npm run redis:start
npm run redis:stop
npm run redis:restart

# Installation guide
npm run redis:guide
```

**Detailed Platform Instructions:**

See [Redis Installation Guide](./redis-install-guides.md) for comprehensive platform-specific installation instructions.

#### Health Check
```bash
npx claude-flow-novice install health
```
Comprehensive system health verification:
- System resources (CPU, memory, disk)
- Dependency validation
- Configuration integrity
- Service status
- Network connectivity

## Service Management

### Start Services
```bash
# Start all services
npx claude-flow-novice install service start

# Start specific service
npx claude-flow-novice install service start redis
npx claude-flow-novice install service start dashboard
```

### Stop Services
```bash
# Stop all services
npx claude-flow-novice install service stop

# Stop specific service
npx claude-flow-novice install service stop redis
```

### Restart Services
```bash
# Restart all services
npx claude-flow-novice install service restart

# Restart specific service
npx claude-flow-novice install service restart dashboard
```

### Service Status
```bash
# Show all services status
npx claude-flow-novice install service status

# Show specific service status
npx claude-flow-novice install service status redis
```

## Update Management

### Check for Updates
```bash
npx claude-flow-novice install update check
```

### Update Installation
```bash
npx claude-flow-novice install update
```

The update process:
1. Creates automatic backup
2. Downloads latest version
3. Migrates configurations
4. Preserves user data
5. Verifies installation

### Restore from Backup
```bash
npx claude-flow-novice install update restore
```

## Uninstallation

### Standard Uninstall
```bash
npx claude-flow-novice install uninstall
```

Interactive uninstallation with options to:
- Keep configuration files
- Preserve user data
- Remove system services

### Force Uninstall
```bash
npx claude-flow-novice install uninstall force
```

Complete removal of all files and services.

## Configuration

### Default Configuration Location
- **Linux/macOS**: `~/.claude-flow-novice/config/`
- **Windows**: `%USERPROFILE%\.claude-flow-novice\config\`

### Configuration Files
- `config.json` - Main configuration
- `redis.json` - Redis settings
- `services.json` - Service configuration
- `.env` - Environment variables

### Environment Variables
```bash
# Claude Flow Configuration
CLAUDE_FLOW_ENV=~/.claude-flow-novice/config/.env
CLAUDE_FLOW_DATA_PATH=~/.claude-flow-novice
CLAUDE_FLOW_LOG_LEVEL=info

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# System Configuration
MAX_AGENTS=10
AGENT_TIMEOUT=30000
MEMORY_LIMIT=1GB
```

## Platform Support

### Windows
- PowerShell and CMD support
- Chocolatey package management
- Windows service integration
- Registry cleanup

### macOS
- Homebrew integration
- Launch agent support
- Shell profile configuration
- System permission handling

### Linux
- Distribution-specific packages
- systemd service integration
- Shell configuration
- Permission management

### Docker
```bash
# Docker installation
docker run -it --rm \
  -v $(pwd):/workspace \
  -v ~/.claude-flow-novice:/root/.claude-flow-novice \
  claude-flow-novice install
```

## Troubleshooting

### Common Issues

#### Redis Installation Failed
```bash
# Manual Redis installation
# Windows
choco install redis-64

# macOS
brew install redis

# Linux (Ubuntu/Debian)
sudo apt-get install redis-server
```

#### Permission Errors
```bash
# Fix permissions
sudo chown -R $USER ~/.claude-flow-novice
chmod -R 755 ~/.claude-flow-novice
```

#### Port Conflicts
```bash
# Check port usage
netstat -an | grep :6379  # Redis
netstat -an | grep :3000  # Dashboard

# Kill conflicting processes
sudo kill -9 <PID>
```

### Debug Mode
```bash
# Run installation with debug output
DEBUG=claude-flow:* npx claude-flow-novice install
```

### Verbose Output
```bash
# Detailed installation logs
npx claude-flow-novice install --verbose
```

## Advanced Usage

### Custom Configuration
```bash
# Use custom configuration file
CLAUDE_FLOW_CONFIG=/path/to/config.json npx claude-flow-novice install
```

### Silent Installation
```bash
# Non-interactive installation with defaults
echo -e "\n\n\n\n\n" | npx claude-flow-novice install
```

### Development Setup
```bash
# Development installation with monitoring
npx claude-flow-novice install setup --type=development --features=monitoring,debug
```

### Production Setup
```bash
# Production-optimized installation
npx claude-flow-novice install setup --type=production --memory=2GB --agents=50
```

## Support

### Documentation
- [Main Documentation](https://github.com/masharratt/claude-flow-novice)
- [API Reference](https://github.com/masharratt/claude-flow-novice/docs)
- [Troubleshooting Guide](https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting)

### Community
- [GitHub Issues](https://github.com/masharratt/claude-flow-novice/issues)
- [Discussions](https://github.com/masharratt/claude-flow-novice/discussions)
- [Discord Community](https://discord.gg/claude-flow)

### Health Check Integration
```bash
# Regular health monitoring
npx claude-flow-novice install health --json > health-report.json

# Automated health checks
0 */6 * * * npx claude-flow-novice install health --quiet
```

## License

MIT License - see [LICENSE](https://github.com/masharratt/claude-flow-novice/blob/main/LICENSE) for details.

---

**Claude Flow Novice** - AI Agent Orchestration Made Easy 🚀