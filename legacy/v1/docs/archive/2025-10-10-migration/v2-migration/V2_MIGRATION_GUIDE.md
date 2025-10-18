# Migration Guide: v1.x → v2.0.0

**Version:** 2.0.0
**Release Date:** 2025-10-09
**Breaking Changes:** Yes (MCP → CLI migration)

---

## 🚨 Breaking Changes Overview

### Major Changes

1. **MCP Access Deprecation**: MCP server tools are now **deprecated** in favor of unified CLI
2. **CLI-First Architecture**: All functionality accessible via `claude-flow-novice` CLI
3. **Backward Compatibility**: MCP server still available but marked deprecated
4. **Migration Timeline**: 6 months deprecation period (v2.0 → v2.6)

---

## Why This Change?

### Problems with MCP-First Architecture
- **Complexity**: Required MCP server setup for basic operations
- **Fragmentation**: Tools split between MCP and CLI
- **User Confusion**: Two interfaces for same functionality
- **Maintenance**: Duplicate code paths

### Benefits of CLI-First
- **Simplicity**: Single entry point (`claude-flow-novice`)
- **Consistency**: Unified command structure
- **Performance**: Direct execution, no server overhead
- **Developer Experience**: Better autocomplete, help text, examples

---

## Migration Path

### Phase 1: v2.0.0 - Deprecation Warning (Current)
- MCP server still functional
- Deprecation warnings logged
- CLI commands fully featured
- Parallel operation supported

### Phase 2: v2.2.0 - Migration Tools (Q2 2025)
- Automated migration script
- Config converter (MCP → CLI)
- Side-by-side comparison

### Phase 3: v2.4.0 - MCP Maintenance Mode (Q3 2025)
- Bug fixes only
- No new features
- Strong deprecation warnings

### Phase 4: v2.6.0 - MCP Removal (Q4 2025)
- MCP server removed
- CLI only
- Full feature parity

---

## What's Deprecated

### MCP Tools → CLI Commands

| MCP Tool | CLI Command | Status |
|----------|-------------|--------|
| `mcp://swarm/init` | `claude-flow-novice swarm init` | ✅ Available |
| `mcp://swarm/spawn` | `claude-flow-novice swarm spawn` | ✅ Available |
| `mcp://swarm/status` | `claude-flow-novice swarm status` | ✅ Available |
| `mcp://agent/create` | `claude-flow-novice agent create` | ✅ Available |
| `mcp://memory/store` | `claude-flow-novice memory store` | ✅ Available |
| `mcp://memory/retrieve` | `claude-flow-novice memory get` | ✅ Available |
| `mcp://orchestrator/start` | `claude-flow-novice start` | ✅ Available |
| `mcp://monitor/metrics` | `claude-flow-novice monitor` | ✅ Available |
| `mcp://fleet/manage` | `claude-flow-novice fleet` | ✅ Available |

### MCP Configuration → CLI Configuration

**Old (v1.x):**
```json
{
  "mcp": {
    "transport": "http",
    "port": 3000,
    "auth": {
      "enabled": true,
      "method": "token"
    }
  }
}
```

**New (v2.0):**
```json
{
  "cli": {
    "defaultCommand": "status",
    "verbose": false,
    "outputFormat": "text"
  },
  "redis": {
    "host": "localhost",
    "port": 6379
  }
}
```

---

## Step-by-Step Migration

### Step 1: Update Package Version

```bash
npm install claude-flow-novice@2.0.0
```

### Step 2: Replace MCP Calls with CLI

**Before (MCP):**
```typescript
// Using MCP client
import { MCPClient } from 'claude-flow-novice/mcp';

const client = new MCPClient({ port: 3000 });
await client.call('swarm/init', { objective: 'Build API' });
```

**After (CLI):**
```bash
# Direct CLI usage
claude-flow-novice swarm init "Build API"
```

**Or programmatically:**
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Execute CLI command
const { stdout } = await execAsync('claude-flow-novice swarm init "Build API"');
const result = JSON.parse(stdout);
```

### Step 3: Update Configuration Files

**Migration Script:**
```bash
# Automated migration (coming in v2.2.0)
claude-flow-novice migrate --from-mcp --backup

# Manual migration
mv .mcp-config.json .mcp-config.json.backup
claude-flow-novice init --skip-redis
```

### Step 4: Update Import Statements

**Before:**
```typescript
import { MCPServer } from 'claude-flow-novice/mcp';
import { MCPClient } from 'claude-flow-novice/mcp/client';
```

**After:**
```typescript
// For programmatic use, import CLI wrapper
import { CLI } from 'claude-flow-novice';

const cli = new CLI();
await cli.execute('swarm', 'init', { objective: 'Build API' });
```

### Step 5: Update Scripts in package.json

**Before:**
```json
{
  "scripts": {
    "start:mcp": "node node_modules/claude-flow-novice/mcp/mcp-server.js",
    "swarm": "node -e \"require('claude-flow-novice/mcp/client').call('swarm/init')\""
  }
}
```

**After:**
```json
{
  "scripts": {
    "start": "claude-flow-novice start",
    "swarm": "claude-flow-novice swarm init"
  }
}
```

---

## What Stays the Same

✅ **Core Functionality**: All features preserved
✅ **Data Storage**: Redis, SQLite persistence unchanged
✅ **Agent Definitions**: Same agent profiles work
✅ **Templates**: Bundled templates unchanged
✅ **Security**: Same encryption, ACL, JWT
✅ **Performance**: Same WASM optimization

---

## MCP Server Deprecation Schedule

### v2.0.0 (Today) - Soft Deprecation
- MCP server included but deprecated
- Warnings logged on MCP usage
- CLI fully functional
- Documentation updated

```bash
# Will show deprecation warning
node node_modules/claude-flow-novice/mcp/mcp-server.js

# Warning: MCP server is deprecated and will be removed in v2.6.0
# Please migrate to CLI: claude-flow-novice start
```

### v2.2.0 (Q2 2025) - Migration Tools
- Automated migration script
- Config converter
- Usage analytics

```bash
claude-flow-novice migrate --from-mcp
# ✅ Migrated 15 MCP calls to CLI commands
# ✅ Updated package.json scripts
# ✅ Converted .mcp-config.json → .claude-flow-config.json
```

### v2.4.0 (Q3 2025) - Maintenance Mode
- MCP server in maintenance mode
- No new features
- Critical bug fixes only
- Strong warnings

```bash
# Will show strong warning
node node_modules/claude-flow-novice/mcp/mcp-server.js

# ⚠️ CRITICAL: MCP server will be REMOVED in v2.6.0 (2 releases)
# Action required: Migrate to CLI immediately
# Run: claude-flow-novice migrate --from-mcp
```

### v2.6.0 (Q4 2025) - MCP Removal
- MCP server removed from package
- CLI only
- Breaking change for non-migrated users

```bash
# Will fail
node node_modules/claude-flow-novice/mcp/mcp-server.js

# Error: MCP server has been removed in v2.6.0
# Please use CLI: claude-flow-novice start
# Migration guide: https://docs.claude-flow.com/migration/v2
```

---

## CLI Equivalents (Complete Mapping)

### Swarm Operations

```bash
# MCP
mcp://swarm/init { objective: "Build API", strategy: "development" }

# CLI
claude-flow-novice swarm init "Build API" --strategy development
```

### Agent Spawning

```bash
# MCP
mcp://agent/spawn { type: "coder", task: "Implement auth" }

# CLI
claude-flow-novice agent spawn coder "Implement auth"
```

### Memory Operations

```bash
# MCP
mcp://memory/store { key: "context", value: {...}, namespace: "swarm" }

# CLI
claude-flow-novice memory store context --value='{"data":"..."}' --namespace swarm
```

### Monitoring

```bash
# MCP
mcp://monitor/metrics { component: "fleet", timeframe: "1h" }

# CLI
claude-flow-novice monitor --component fleet --timeframe 1h
```

### Fleet Management

```bash
# MCP
mcp://fleet/scale { fleetId: "fleet-123", targetSize: 1000 }

# CLI
claude-flow-novice fleet scale fleet-123 --target 1000
```

---

## Programmatic Usage (SDK)

### v2.0.0 CLI Wrapper SDK

For applications that need programmatic access:

```typescript
import { ClaudeFlowCLI } from 'claude-flow-novice';

const cli = new ClaudeFlowCLI({
  verbose: false,
  outputFormat: 'json'
});

// Swarm operations
const swarm = await cli.swarm.init({
  objective: 'Build REST API',
  strategy: 'development',
  mode: 'mesh'
});

// Agent operations
const agent = await cli.agent.spawn({
  type: 'coder',
  task: 'Implement authentication'
});

// Memory operations
await cli.memory.store({
  key: 'auth/context',
  value: { user: 'admin' },
  namespace: 'swarm'
});

// Fleet operations
await cli.fleet.scale({
  fleetId: 'fleet-123',
  targetSize: 1000
});
```

**Note**: SDK wrapper uses child process execution internally, same as CLI.

---

## Configuration Migration

### MCP Config (Deprecated)

**File**: `.mcp-config.json`
```json
{
  "transport": "http",
  "host": "0.0.0.0",
  "port": 3000,
  "auth": {
    "enabled": true,
    "method": "token",
    "tokens": ["secret-token"]
  },
  "sessionTimeout": 3600000
}
```

### CLI Config (v2.0)

**File**: `.claude-flow-config.json`
```json
{
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": null,
    "db": 0
  },
  "cli": {
    "defaultCommand": "status",
    "verbose": false,
    "outputFormat": "text",
    "colorOutput": true
  },
  "swarm": {
    "defaultStrategy": "development",
    "defaultMode": "mesh",
    "maxAgents": 50
  },
  "fleet": {
    "maxFleetSize": 1000,
    "autoScaling": true,
    "efficiencyTarget": 0.40
  },
  "monitoring": {
    "dashboardPort": 3001,
    "metricsInterval": 1000,
    "enableAlerts": true
  }
}
```

---

## Backward Compatibility

### Keep MCP Running (Temporary)

If you need to keep MCP server running during migration:

```bash
# v2.0.0 supports both
npm start:mcp  # Old MCP server (deprecated)
claude-flow-novice start  # New CLI (recommended)
```

### Gradual Migration

1. **Week 1**: Install v2.0.0, keep MCP running
2. **Week 2**: Test CLI commands alongside MCP
3. **Week 3**: Migrate critical workflows to CLI
4. **Week 4**: Deprecate MCP, CLI only

---

## Testing Your Migration

### Validation Script

```bash
# Run migration validation
claude-flow-novice migrate --validate

# Expected output:
# ✅ CLI commands accessible
# ✅ Redis connection working
# ✅ Templates bundled
# ✅ Configuration valid
# ⚠️ 3 MCP calls detected (migration recommended)
```

### Side-by-Side Testing

```bash
# Terminal 1: MCP (deprecated)
node node_modules/claude-flow-novice/mcp/mcp-server.js

# Terminal 2: CLI (new)
claude-flow-novice start

# Compare functionality
curl http://localhost:3000/tools  # MCP
claude-flow-novice status          # CLI
```

---

## FAQ

### Q: Will my existing MCP integrations break?
**A**: No, MCP server still works in v2.0.0 with deprecation warnings. You have 6 months to migrate.

### Q: Can I use both MCP and CLI?
**A**: Yes, v2.0-2.4 support both. But we recommend migrating to CLI immediately.

### Q: What happens to my MCP configuration?
**A**: It's ignored. CLI uses `.claude-flow-config.json` instead.

### Q: Will MCP tools be available in v3.0?
**A**: No, MCP will be completely removed in v2.6.0.

### Q: How do I migrate programmatic MCP usage?
**A**: Use the new CLI SDK wrapper (see Programmatic Usage section).

### Q: What if I can't migrate by v2.6.0?
**A**: Stay on v2.4.x (LTS support until Q2 2026). But migration is strongly recommended.

---

## Support

**Migration Help:**
- GitHub Issues: https://github.com/<org>/<repo>/issues
- Migration Guide: https://docs.claude-flow.com/migration/v2
- CLI Documentation: `claude-flow-novice help`

**Community:**
- Discord: https://discord.gg/claude-flow
- Stack Overflow: Tag `claude-flow-novice`

---

## Summary

✅ **Install v2.0.0**: `npm install claude-flow-novice@2.0.0`
✅ **Test CLI**: `claude-flow-novice status`
✅ **Migrate gradually**: MCP works until v2.6.0
✅ **Use migration tool**: `claude-flow-novice migrate --from-mcp` (v2.2+)
✅ **Complete by Q4 2025**: MCP removed in v2.6.0

**The CLI is simpler, faster, and more maintainable. Start migrating today!**
