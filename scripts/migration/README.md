# Migration Scripts

This directory contains migration and upgrade scripts for the Claude Flow project, including installation utilities, data migration tools, and system upgrade procedures.

## Scripts

### Installation & Setup

#### `install.js` - Primary Installation Script
Main installation script for Claude Flow with comprehensive setup and configuration.

```bash
# Basic installation
node scripts/migration/install.js

# Custom installation path
node scripts/migration/install.js --path /custom/path

# Development installation
node scripts/migration/install.js --dev

# Production installation
node scripts/migration/install.js --production
```

#### `install-arm64.js` - ARM64 Architecture Installation
Specialized installation script for ARM64 (Apple Silicon, ARM-based systems).

```bash
# ARM64 installation
node scripts/migration/install-arm64.js

# ARM64 with native compilation
node scripts/migration/install-arm64.js --native

# ARM64 development setup
node scripts/migration/install-arm64.js --dev
```

### Data Migration

#### `migrate-hooks.js` - Hooks Migration Tool
Migrates Claude Flow hooks and coordination data between versions.

```bash
# Basic hooks migration
node scripts/migration/migrate-hooks.js

# Migration from specific version
node scripts/migration/migrate-hooks.js --from 1.0.0 --to 2.0.0

# Dry run migration
node scripts/migration/migrate-hooks.js --dry-run

# Backup before migration
node scripts/migration/migrate-hooks.js --backup
```

#### `migration-examples.ts` - Migration Example Templates
Provides example migration scripts and templates for custom migrations.

```bash
# View migration examples
tsx scripts/migration/migration-examples.ts --list

# Generate migration template
tsx scripts/migration/migration-examples.ts --template database

# Run example migration
tsx scripts/migration/migration-examples.ts --example simple-data-migration
```

## Migration Categories

### 1. System Installation
Scripts that handle initial system setup and installation.

**Installation Features:**
- Dependency management
- Configuration setup
- Environment preparation
- Service registration
- Initial data seeding

### 2. Version Upgrades
Scripts that handle upgrading between Claude Flow versions.

**Upgrade Features:**
- Version compatibility checking
- Data schema migration
- Configuration migration
- Feature flag migration
- Rollback capabilities

### 3. Data Migration
Scripts that handle data transformation and migration.

**Data Migration Features:**
- Database schema updates
- Data format conversions
- File system migrations
- Configuration migrations
- Cache migrations

### 4. Platform Migration
Scripts that handle migration between different platforms or architectures.

**Platform Features:**
- Cross-platform compatibility
- Architecture-specific optimizations
- Native dependency handling
- Performance optimizations
- Platform-specific configurations

## Usage Patterns

### Fresh Installation Workflow
```bash
# 1. Prepare system
npm install

# 2. Run installation
node scripts/migration/install.js --production

# 3. Verify installation
node scripts/migration/install.js --verify

# 4. Post-installation setup
npm run postinstall
```

### Version Upgrade Workflow
```bash
# 1. Backup current system
node scripts/migration/migrate-hooks.js --backup

# 2. Check compatibility
node scripts/migration/migrate-hooks.js --check-compatibility

# 3. Run migration
node scripts/migration/migrate-hooks.js --from 1.5.0 --to 2.0.0

# 4. Verify migration
node scripts/migration/migrate-hooks.js --verify

# 5. Update configuration
npm run setup
```

### ARM64 Installation Workflow
```bash
# 1. Check architecture
uname -m  # Should show arm64 or aarch64

# 2. Install ARM64 optimized version
node scripts/migration/install-arm64.js --native

# 3. Verify ARM64 installation
node scripts/migration/install-arm64.js --test

# 4. Performance validation
npm run test:performance
```

## Installation Features

### Dependency Management
- **Automatic dependency resolution**
- **Platform-specific dependencies**
- **Optional dependency handling**
- **Dependency conflict resolution**
- **Security vulnerability checking**

### Configuration Setup
- **Environment-specific configuration**
- **Custom configuration templates**
- **Configuration validation**
- **Default configuration deployment**
- **Configuration backup and restore**

### Service Integration
- **System service registration**
- **Service dependency management**
- **Health check configuration**
- **Monitoring setup**
- **Log rotation configuration**

## Migration Strategies

### Database Migration
```javascript
// Example database migration
const migration = {
  version: "2.0.0",
  description: "Add swarm coordination tables",
  up: async (db) => {
    await db.createTable("swarm_states", {
      id: "UUID PRIMARY KEY",
      topology: "VARCHAR(50)",
      agent_count: "INTEGER",
      created_at: "TIMESTAMP"
    });
  },
  down: async (db) => {
    await db.dropTable("swarm_states");
  }
};
```

### Configuration Migration
```javascript
// Example configuration migration
const configMigration = {
  from: "1.5.0",
  to: "2.0.0",
  transform: (oldConfig) => {
    return {
      ...oldConfig,
      swarm: {
        ...oldConfig.coordination,
        topology: oldConfig.coordination.type,
        agents: oldConfig.coordination.workers
      }
    };
  }
};
```

### File System Migration
```bash
# Example file system migration
mv .claude-flow/coordination .claude-flow/swarm
mv .claude-flow/workers .claude-flow/agents
mkdir -p .claude-flow/topology
```

## Platform-Specific Considerations

### ARM64 (Apple Silicon)
- **Native binary compilation**
- **Rosetta 2 compatibility**
- **Performance optimizations**
- **Memory efficiency**
- **Battery optimization**

### x86_64 (Intel/AMD)
- **Legacy compatibility**
- **Performance tuning**
- **Memory management**
- **Vectorization support**
- **Cache optimization**

### Windows
- **Path handling differences**
- **Service registration**
- **Registry configuration**
- **PowerShell integration**
- **Windows-specific dependencies**

### Linux
- **Distribution-specific packages**
- **systemd integration**
- **Permission management**
- **Container compatibility**
- **Package manager integration**

### macOS
- **Homebrew integration**
- **LaunchAgent configuration**
- **Keychain integration**
- **Code signing requirements**
- **App notarization**

## Safety & Recovery

### Backup Strategies
```bash
# Create system backup
node scripts/migration/migrate-hooks.js --backup --include-data

# Create configuration backup
node scripts/migration/install.js --backup-config

# Create selective backup
node scripts/migration/migrate-hooks.js --backup --selective "swarm,agents"
```

### Rollback Procedures
```bash
# Rollback to previous version
node scripts/migration/migrate-hooks.js --rollback

# Rollback to specific version
node scripts/migration/migrate-hooks.js --rollback --to 1.5.0

# Rollback with data restoration
node scripts/migration/migrate-hooks.js --rollback --restore-data
```

### Verification & Testing
```bash
# Verify installation
node scripts/migration/install.js --verify --comprehensive

# Test migration integrity
node scripts/migration/migrate-hooks.js --test

# Performance verification
npm run test:performance:migration
```

## Package.json Integration

Migration scripts integrate with npm lifecycle hooks:

```json
{
  "scripts": {
    "preinstall": "node scripts/migration/install.js --check-requirements",
    "postinstall": "node scripts/migration/install.js --setup",
    "migrate": "node scripts/migration/migrate-hooks.js",
    "migrate:dry-run": "node scripts/migration/migrate-hooks.js --dry-run",
    "install:arm64": "node scripts/migration/install-arm64.js",
    "backup": "node scripts/migration/migrate-hooks.js --backup"
  }
}
```

## Environment Configuration

### Development Environment
```bash
export CLAUDE_FLOW_ENV=development
export CLAUDE_FLOW_MIGRATION_MODE=safe
export CLAUDE_FLOW_BACKUP_ENABLED=true
```

### Production Environment
```bash
export CLAUDE_FLOW_ENV=production
export CLAUDE_FLOW_MIGRATION_MODE=strict
export CLAUDE_FLOW_BACKUP_ENABLED=true
export CLAUDE_FLOW_ROLLBACK_ENABLED=true
```

### Staging Environment
```bash
export CLAUDE_FLOW_ENV=staging
export CLAUDE_FLOW_MIGRATION_MODE=testing
export CLAUDE_FLOW_VALIDATION_STRICT=true
```

## Troubleshooting

### Installation Issues
```bash
# Check system requirements
node scripts/migration/install.js --check-requirements

# Debug installation
node scripts/migration/install.js --debug --verbose

# Force reinstallation
node scripts/migration/install.js --force --clean
```

### Migration Failures
```bash
# Check migration status
node scripts/migration/migrate-hooks.js --status

# Resume failed migration
node scripts/migration/migrate-hooks.js --resume

# Rollback failed migration
node scripts/migration/migrate-hooks.js --rollback --force
```

### Platform-Specific Issues
```bash
# ARM64 compatibility check
node scripts/migration/install-arm64.js --check-compatibility

# Force native compilation
node scripts/migration/install-arm64.js --force-native

# Use compatibility mode
node scripts/migration/install-arm64.js --compatibility-mode
```

## Best Practices

### Pre-Migration
1. **Create comprehensive backups**
2. **Test migration in staging**
3. **Check system requirements**
4. **Review migration logs**
5. **Plan rollback strategy**

### During Migration
1. **Monitor progress closely**
2. **Check for errors immediately**
3. **Maintain system logs**
4. **Verify each step**
5. **Document any issues**

### Post-Migration
1. **Verify system functionality**
2. **Run comprehensive tests**
3. **Update documentation**
4. **Monitor performance**
5. **Clean up temporary files**

## Contributing Migration Scripts

When adding new migration scripts:

1. **Include comprehensive error handling**
2. **Implement dry-run capabilities**
3. **Provide rollback functionality**
4. **Add progress monitoring**
5. **Write detailed documentation**
6. **Test across all platforms**
7. **Include backup strategies**

## Related Documentation

- Migration Planning Guide
- Version Compatibility Matrix
- Platform Installation Guides
- Troubleshooting Documentation
- Recovery Procedures

For legacy migration scripts, see `../legacy/` directory.