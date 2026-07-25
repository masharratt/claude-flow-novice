# Configuration Management System

**Version:** 2.0.0
**Status:** Production Ready
**Last Updated:** 2025-11-16

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [YAML Format Specification](#yaml-format-specification)
- [Type System](#type-system)
- [Environment Overrides](#environment-overrides)
- [Hot Reload](#hot-reload)
- [Migration Guide](#migration-guide)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The Configuration Management System v2 provides a standardized, type-safe approach to application configuration using YAML as the primary format. It replaces the legacy patchwork of JSON, ENV, and bash variable configurations with a unified system.

### Key Features

- **YAML-First**: Single source of truth using YAML format
- **Type Safety**: Automatic type coercion and validation
- **Schema Validation**: JSON Schema-based validation
- **Environment Overrides**: Environment-specific configuration merging
- **Hot Reload**: Live configuration updates without restart
- **Migration Tools**: Automatic migration from legacy formats
- **Backward Compatible**: Reads legacy JSON with deprecation warnings

### Design Principles

1. **Single Source of Truth**: YAML configuration is canonical
2. **Zero Data Loss**: Migration preserves all data and types
3. **Type Safety**: Automatic type inference and validation
4. **Environment Flexibility**: Easy overrides for dev/staging/prod
5. **Developer Experience**: Clear errors, helpful defaults

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           Application Code                          │
├─────────────────────────────────────────────────────┤
│   ConfigManager                                     │
│   ├─ Load YAML/JSON                                 │
│   ├─ Merge Environment Overrides                    │
│   ├─ Type Coercion                                  │
│   ├─ Schema Validation                              │
│   ├─ Hot Reload (Optional)                          │
│   └─ Get/Set Interface                              │
├─────────────────────────────────────────────────────┤
│   ConfigMigrator                                    │
│   ├─ JSON → YAML                                    │
│   ├─ ENV → YAML                                     │
│   ├─ Bash → YAML                                    │
│   └─ Validation                                     │
├─────────────────────────────────────────────────────┤
│   JSON Schema Validator                             │
│   └─ config-v1.schema.json                          │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │   Configuration Files       │
         │   ├─ config/default.yml     │
         │   ├─ config/production.yml  │
         │   ├─ config/development.yml │
         │   └─ config/testing.yml     │
         └─────────────────────────────┘
```

## YAML Format Specification

### Basic Structure

```yaml
version: '1.0'

# Comments are supported and encouraged
database:
  type: sqlite
  path: ./data/cfn.db
  pool:
    min: 2
    max: 10

redis:
  enabled: true
  host: localhost
  port: 6379

agents:
  maxConcurrent: 10
  timeout: 300
```

### Supported Types

| YAML Type | JavaScript Type | Example |
|-----------|----------------|---------|
| String | string | `type: sqlite` |
| Number | number | `port: 6379` |
| Boolean | boolean | `enabled: true` |
| Null | null | `value: null` |
| Array | Array | `items: [1, 2, 3]` |
| Object | Object | `pool: { min: 2 }` |

### Environment Variable References

Reference environment variables using `${VAR_NAME}` syntax:

```yaml
database:
  password: ${DB_PASSWORD}

redis:
  password: ${REDIS_PASSWORD}
```

**Important:** Environment variables are NOT automatically expanded. You must implement expansion in your application code if needed.

## Type System

### Automatic Type Coercion

The ConfigManager automatically coerces string values to appropriate types:

```yaml
# Input YAML
redis:
  enabled: 'true'      # String "true"
  port: '6379'         # String "6379"

# After coercion
{
  redis: {
    enabled: true,     // Boolean true
    port: 6379         // Number 6379
  }
}
```

### Coercion Rules

1. **Boolean**: `'true'` → `true`, `'false'` → `false`
2. **Integer**: `'123'` → `123`
3. **Float**: `'3.14'` → `3.14`
4. **Null**: `'null'` → `null`
5. **String**: Everything else remains string

### Type Validation

Types are validated against the JSON schema:

```json
{
  "properties": {
    "redis": {
      "properties": {
        "port": { "type": "number" }
      }
    }
  }
}
```

If coercion fails or results in wrong type, validation error is thrown.

## Environment Overrides

### Override Strategy

Configuration files are merged in order:

1. Load `config/default.yml` (base configuration)
2. Load `config/{environment}.yml` (environment-specific)
3. Deep merge: environment overrides base
4. Validate merged configuration

### Example: Production Override

**config/default.yml**
```yaml
database:
  type: sqlite
  path: ./data/cfn.db
  pool:
    min: 2
    max: 10

agents:
  maxConcurrent: 10
```

**config/production.yml**
```yaml
database:
  type: postgres
  host: db.production.local
  port: 5432
  pool:
    max: 50  # Override only max, keep min: 2

agents:
  maxConcurrent: 100
```

**Merged Result (production)**
```yaml
database:
  type: postgres                    # From production
  host: db.production.local         # From production
  port: 5432                        # From production
  path: ./data/cfn.db               # From default (preserved)
  pool:
    min: 2                          # From default
    max: 50                         # From production (overridden)

agents:
  maxConcurrent: 100                # From production (overridden)
```

### Deep Merge Behavior

- Objects are merged recursively
- Arrays are replaced (not merged)
- Primitives are replaced
- Null values override existing values

## Hot Reload

### Enabling Hot Reload

```typescript
import { ConfigManager } from './src/lib/config-manager';

const manager = new ConfigManager('config/default.yml', 'schemas/config-v1.schema.json');
await manager.load('production');

// Enable hot reload
await manager.enableHotReload();

// Listen for reload events
manager.on('reload', (newConfig) => {
  console.log('Configuration reloaded:', newConfig);
});

// Listen for errors
manager.on('error', (error) => {
  console.error('Hot reload error:', error);
});
```

### How It Works

1. **File Watching**: Uses `chokidar` to watch configuration files
2. **Debouncing**: Waits for file writes to stabilize (300ms)
3. **Reload**: Automatically reloads and re-validates configuration
4. **Events**: Emits `reload` event on success, `error` on failure
5. **Zero Downtime**: Application continues running during reload

### Performance

- **File Watch Overhead**: ~1-2MB memory, <0.1% CPU
- **Reload Time**: <200ms for typical configs
- **Validation Time**: <50ms with schema

### Production Considerations

**Recommended**: Disable hot reload in production for stability

```yaml
# config/production.yml
features:
  hotReload: false
```

**When to Enable**:
- Development environments
- Staging with dynamic feature flags
- Production with robust error handling

## Migration Guide

### Step 1: Install and Test

```bash
# Run tests to verify implementation
npm test -- config-manager.test.ts

# Check for legacy configuration files
npm run migrate-configs -- --dry-run --scan ./config
```

### Step 2: Preview Migration

```bash
# Preview what will be migrated
npm run migrate-configs -- --dry-run
```

### Step 3: Migrate Configurations

```bash
# Perform migration (creates backups automatically)
npm run migrate-configs

# Or migrate specific directory
npm run migrate-configs -- --scan ./legacy-config --output ./config
```

### Step 4: Update Application Code

**Before (Legacy)**
```typescript
import ConfigManager from './src/cli/config-manager';

const manager = ConfigManager.getInstance();
const redisPort = await manager.getValue('redis.port');
```

**After (v2)**
```typescript
import { ConfigManager } from './src/lib/config-manager';

const manager = new ConfigManager('config/default.yml', 'schemas/config-v1.schema.json');
await manager.load('production');

const redisPort = manager.get('redis.port', 6379);
```

### Step 5: Verify and Cleanup

```bash
# Test with new configuration
npm test

# Run application
npm start

# Archive legacy configs (after verification)
mkdir -p archive/legacy-configs
mv config/*.json archive/legacy-configs/
mv .env* archive/legacy-configs/
```

## API Reference

### ConfigManager

#### Constructor

```typescript
new ConfigManager(
  configPath: string,
  schemaPath: string,
  options?: ConfigManagerOptions
)
```

**Parameters:**
- `configPath`: Path to base YAML/JSON config file
- `schemaPath`: Path to JSON schema file
- `options`: Optional configuration
  - `enableHotReload`: Enable file watching (default: false)
  - `validateOnLoad`: Validate against schema (default: true)
  - `coerceTypes`: Auto-convert types (default: true)

#### Methods

##### load(environment?)

Load configuration with optional environment override.

```typescript
await manager.load('production');
```

##### get<T>(keyPath, defaultValue?)

Get configuration value by dot-notation path.

```typescript
const port = manager.get<number>('redis.port', 6379);
const config = manager.get('database');
```

##### getAll()

Get entire configuration object.

```typescript
const config = manager.getAll();
```

##### set(keyPath, value)

Set configuration value (runtime only, not persisted).

```typescript
manager.set('redis.port', 7000);
```

##### has(keyPath)

Check if configuration key exists.

```typescript
if (manager.has('redis.password')) {
  // Use password
}
```

##### enableHotReload()

Enable file watching for hot reload.

```typescript
await manager.enableHotReload();
```

##### disableHotReload()

Disable file watching.

```typescript
await manager.disableHotReload();
```

##### reload()

Manually reload configuration from disk.

```typescript
await manager.reload();
```

#### Events

- `loaded`: Configuration loaded successfully
- `reload`: Configuration reloaded (hot reload)
- `changed`: Configuration value changed (via set)
- `warning`: Non-fatal warning (e.g., deprecated format)
- `error`: Error during hot reload
- `hotReloadEnabled`: Hot reload was enabled
- `hotReloadDisabled`: Hot reload was disabled

```typescript
manager.on('reload', (config) => {
  console.log('Config reloaded');
});

manager.on('error', (error) => {
  console.error('Hot reload failed:', error);
});
```

### ConfigMigrator

#### Constructor

```typescript
new ConfigMigrator(schemaPath?: string)
```

#### Methods

##### migrateJsonToYaml(jsonPath, yamlPath, options?)

Migrate JSON file to YAML.

```typescript
const migrator = new ConfigMigrator('schemas/config-v1.schema.json');
await migrator.migrateJsonToYaml('config.json', 'config.yml', {
  dryRun: false,
  createBackup: true,
  validate: true
});
```

##### migrateEnvToYaml(envPath, yamlPath, options?)

Migrate .env file to YAML.

```typescript
await migrator.migrateEnvToYaml('.env', 'config/env.yml');
```

##### migrateBashToYaml(bashPath, yamlPath, options?)

Migrate bash variable file to YAML.

```typescript
await migrator.migrateBashToYaml('config.sh', 'config/bash.yml');
```

##### scanForLegacyConfigs(directory)

Scan directory for legacy configuration files.

```typescript
const legacyFiles = await migrator.scanForLegacyConfigs('./config');
// Returns: ['/path/to/config.json', '/path/to/.env']
```

##### batchMigrate(files, outputDir, options?)

Migrate multiple files at once.

```typescript
const results = await migrator.batchMigrate(
  ['/config/app.json', '/config/.env'],
  './config',
  { dryRun: true }
);
```

## Best Practices

### Configuration Organization

```
config/
├── default.yml              # Base configuration (version controlled)
├── development.yml          # Dev overrides (version controlled)
├── production.yml.example   # Prod template (version controlled)
├── production.yml           # Prod secrets (NOT version controlled)
├── testing.yml              # Test overrides (version controlled)
└── local.yml                # Local overrides (NOT version controlled)

schemas/
└── config-v1.schema.json    # JSON Schema (version controlled)
```

### .gitignore Patterns

```gitignore
# Ignore production configs with secrets
config/production.yml
config/staging.yml
config/local.yml

# Keep examples
!config/*.yml.example

# Ignore backups
config/*.backup.*
```

### Security Best Practices

1. **Never Commit Secrets**
   ```yaml
   # ❌ BAD - Hardcoded secret
   database:
     password: my_secret_password

   # ✅ GOOD - Environment variable
   database:
     password: ${DB_PASSWORD}
   ```

2. **Use Environment Variables for Secrets**
   ```bash
   export DB_PASSWORD="secret"
   export REDIS_PASSWORD="secret"
   ```

3. **Validate in Production**
   ```typescript
   const manager = new ConfigManager('config/default.yml', 'schemas/config-v1.schema.json', {
     validateOnLoad: true  // Always validate in production
   });
   ```

4. **Restrict File Permissions**
   ```bash
   chmod 600 config/production.yml
   ```

### Performance Optimization

1. **Load Once**: Load configuration at application startup
2. **Cache Values**: Cache frequently accessed values
3. **Disable Hot Reload in Production**: Reduces memory and CPU overhead
4. **Use Typed Getters**: Type parameters improve performance

```typescript
// Good - typed, cached
const port = manager.get<number>('redis.port', 6379);

// Better - cache in variable
const REDIS_PORT = manager.get<number>('redis.port', 6379);
```

### Testing

```typescript
import { ConfigManager } from './src/lib/config-manager';

describe('Application Config', () => {
  it('should load production config', async () => {
    const manager = new ConfigManager('config/default.yml', 'schemas/config-v1.schema.json');
    await manager.load('production');

    expect(manager.get('database.type')).toBe('postgres');
    expect(manager.get('redis.enabled')).toBe(true);
  });
});
```

## Troubleshooting

### Common Errors

#### "YAML parsing error"

**Cause**: Invalid YAML syntax

**Solution**: Validate YAML online (https://www.yamllint.com/) or with:
```bash
npm install -g yaml-lint
yamllint config/default.yml
```

#### "Configuration schema validation failed"

**Cause**: Configuration doesn't match JSON schema

**Solution**: Check schema requirements:
```typescript
// Check what's required
const schema = JSON.parse(fs.readFileSync('schemas/config-v1.schema.json', 'utf-8'));
console.log(schema.required);
```

#### "Type validation failed"

**Cause**: Value cannot be coerced to expected type

**Solution**: Check value types in YAML:
```yaml
# ❌ BAD - Invalid boolean
redis:
  enabled: 'yes'  # Can't coerce 'yes' to boolean

# ✅ GOOD
redis:
  enabled: true
```

#### "Environment config not found"

**Cause**: Environment-specific file doesn't exist (this is a warning, not an error)

**Solution**: Create environment file or ignore warning:
```bash
cp config/production.yml.example config/production.yml
```

### Debug Mode

Enable verbose logging:

```typescript
const manager = new ConfigManager('config/default.yml', 'schemas/config-v1.schema.json');

manager.on('warning', (msg) => console.warn('WARNING:', msg));
manager.on('loaded', (config) => console.log('Loaded:', config));
manager.on('error', (error) => console.error('ERROR:', error));

await manager.load('production');
```

### Performance Issues

If hot reload causes performance issues:

1. **Disable Hot Reload**
   ```yaml
   features:
     hotReload: false
   ```

2. **Increase Debounce Time**
   ```typescript
   // Modify in src/lib/config-manager.ts
   awaitWriteFinish: {
     stabilityThreshold: 1000,  // Increase to 1 second
     pollInterval: 250
   }
   ```

3. **Limit Watched Files**
   ```typescript
   // Only watch default.yml, not environment overrides
   const watchPaths = [this.configPath];
   ```

## Version History

### v2.0.0 (2025-11-16)
- Initial release of YAML-based configuration system
- JSON, ENV, and bash migration support
- Hot reload functionality
- Environment override system
- Comprehensive JSON schema validation

### Migration from v1.x
- v1.x used JSON format only
- v2.x is backward compatible (reads JSON with warnings)
- Migrate using `npm run migrate-configs`

## License

Part of Claude Flow Novice project. See LICENSE file for details.
