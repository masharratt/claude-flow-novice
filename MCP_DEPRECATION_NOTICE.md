# MCP Server Deprecation Notice

**Effective Date:** v2.0.0 (October 9, 2025)
**Status:** ⚠️ IMMEDIATELY DEPRECATED
**Removal Date:** v2.0.0 (MCP functionality disabled)

---

## 🚨 BREAKING CHANGE: MCP Server Removed in v2.0.0

The Model Context Protocol (MCP) server has been **completely removed** from claude-flow-novice v2.0.0.

### Why Immediate Removal?

✅ **100% CLI Coverage:** Every MCP command has a bash/CLI equivalent
✅ **Better Performance:** Direct CLI execution, no server overhead
✅ **Simpler Architecture:** One interface, easier maintenance
✅ **User Feedback:** Community requested unified CLI

---

## Migration Required

### All MCP Commands → CLI Commands

**Complete mapping:**

```bash
# Swarm Operations
mcp://swarm/init          → claude-flow-novice swarm init <objective>
mcp://swarm/spawn         → claude-flow-novice swarm spawn <agent-type> <task>
mcp://swarm/status        → claude-flow-novice swarm status
mcp://swarm/terminate     → claude-flow-novice swarm stop

# Agent Operations
mcp://agent/create        → claude-flow-novice agent create <name>
mcp://agent/spawn         → claude-flow-novice agent spawn <type> <task>
mcp://agent/list          → claude-flow-novice agent list

# Memory Operations
mcp://memory/store        → claude-flow-novice memory store <key> --value <value>
mcp://memory/retrieve     → claude-flow-novice memory get <key>
mcp://memory/search       → claude-flow-novice memory search <query>

# Fleet Operations
mcp://fleet/init          → claude-flow-novice fleet init --max-agents <n>
mcp://fleet/scale         → claude-flow-novice fleet scale --target <n>
mcp://fleet/status        → claude-flow-novice fleet status

# Monitoring
mcp://monitor/metrics     → claude-flow-novice monitor --component <name>
mcp://monitor/dashboard   → claude-flow-novice dashboard start
mcp://monitor/alerts      → claude-flow-novice monitor --alerts

# Orchestration
mcp://orchestrator/start  → claude-flow-novice start
mcp://orchestrator/stop   → claude-flow-novice stop
mcp://orchestrator/status → claude-flow-novice status
```

---

## What Happens in v2.0.0

### MCP Server Files Marked Deprecated

All MCP files are now marked as deprecated and will throw errors:

```bash
# This will FAIL in v2.0.0
node node_modules/claude-flow-novice/mcp/mcp-server.js

# Error:
# ❌ MCP server has been removed in v2.0.0
# Please use CLI: claude-flow-novice start
# Migration guide: https://github.com/ruvnet/claude-flow-novice/blob/main/MCP_DEPRECATION_NOTICE.md
```

### Import Statements Will Fail

```typescript
// ❌ This will fail in v2.0.0
import { MCPServer } from 'claude-flow-novice/mcp';

// Error: MCP module has been removed
// Use CLI wrapper instead: import { ClaudeFlowCLI } from 'claude-flow-novice'
```

---

## Migration Steps (REQUIRED)

### Step 1: Install v2.0.0

```bash
npm install claude-flow-novice@2.0.0
```

### Step 2: Remove MCP References

**package.json:**
```json
{
  "scripts": {
    // ❌ REMOVE
    "start:mcp": "node node_modules/claude-flow-novice/mcp/mcp-server.js",

    // ✅ REPLACE WITH
    "start": "claude-flow-novice start"
  }
}
```

### Step 3: Update Code

**Before (MCP):**
```typescript
import { MCPClient } from 'claude-flow-novice/mcp/client';

const client = new MCPClient({ port: 3000 });
await client.call('swarm/init', { objective: 'Build API' });
```

**After (CLI):**
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const { stdout } = await execAsync('claude-flow-novice swarm init "Build API" --json');
const result = JSON.parse(stdout);
```

**Or use CLI wrapper:**
```typescript
import { ClaudeFlowCLI } from 'claude-flow-novice';

const cli = new ClaudeFlowCLI();
await cli.swarm.init({ objective: 'Build API' });
```

### Step 4: Update Configuration

**Delete MCP config:**
```bash
rm .mcp-config.json
```

**Create CLI config:**
```bash
claude-flow-novice init
```

### Step 5: Test Migration

```bash
# Test CLI commands
claude-flow-novice status
claude-flow-novice swarm init "Test swarm"
claude-flow-novice monitor
```

---

## Programmatic Access (CLI Wrapper)

For applications needing programmatic access, use the new CLI wrapper:

```typescript
import { ClaudeFlowCLI } from 'claude-flow-novice';

const cli = new ClaudeFlowCLI({
  verbose: false,
  outputFormat: 'json'
});

// All operations via CLI
const swarm = await cli.swarm.init({
  objective: 'Build REST API',
  strategy: 'development'
});

const agent = await cli.agent.spawn({
  type: 'coder',
  task: 'Implement auth'
});

await cli.memory.store({
  key: 'context',
  value: { user: 'admin' }
});

await cli.fleet.scale({
  fleetId: 'fleet-123',
  targetSize: 1000
});
```

---

## Why This Change?

### Problems with MCP

1. **Complexity:** Required separate server process
2. **Fragmentation:** Functionality split across MCP + CLI
3. **Maintenance:** Duplicate code paths
4. **Performance:** Server overhead for simple operations
5. **User Confusion:** Two interfaces for same functionality

### Benefits of CLI-Only

1. **Simplicity:** Single entry point
2. **Performance:** Direct execution
3. **Consistency:** Unified command structure
4. **DX:** Better help, autocomplete, examples
5. **Maintenance:** Single code path

---

## Affected Files (Deprecated)

The following files are marked deprecated and will throw errors:

```
src/mcp/
├── mcp-server.js                    ❌ DEPRECATED
├── mcp-server-novice.js            ❌ DEPRECATED
├── mcp-server-sdk.js               ❌ DEPRECATED
├── mcp-server-novice-simplified.js ❌ DEPRECATED
├── client.ts                        ❌ DEPRECATED
├── auth.ts                          ❌ DEPRECATED
├── lifecycle-manager.ts            ❌ DEPRECATED
├── load-balancer.ts                ❌ DEPRECATED
├── orchestration-integration.ts    ❌ DEPRECATED
└── README.md                        ❌ DEPRECATED
```

**Alternative:** All functionality available via CLI commands

---

## Error Handling

### Runtime Errors

If you try to use MCP in v2.0.0:

```javascript
// Attempting to import MCP
import { MCPServer } from 'claude-flow-novice/mcp';

// Throws:
// Error: MCP server has been removed in v2.0.0
//
// Migration required:
// 1. Use CLI: claude-flow-novice start
// 2. Or use CLI wrapper: import { ClaudeFlowCLI } from 'claude-flow-novice'
//
// See: https://github.com/ruvnet/claude-flow-novice/blob/main/MCP_DEPRECATION_NOTICE.md
```

### Build Errors

If MCP files are referenced in your build:

```bash
# Error during build
ERROR: Cannot resolve 'claude-flow-novice/mcp/server'
  MCP module has been removed in v2.0.0
  Use: import { ClaudeFlowCLI } from 'claude-flow-novice'
```

---

## CLI Wrapper SDK

**New in v2.0.0:** Programmatic CLI wrapper for applications

```typescript
import { ClaudeFlowCLI } from 'claude-flow-novice';

// Initialize
const cli = new ClaudeFlowCLI({
  verbose: false,
  outputFormat: 'json',
  logLevel: 'info'
});

// Swarm operations
await cli.swarm.init({ objective: 'Build API' });
await cli.swarm.status();
await cli.swarm.spawn('coder', 'Implement auth');

// Fleet operations
await cli.fleet.init({ maxAgents: 1000 });
await cli.fleet.scale({ target: 2000 });
await cli.fleet.status();

// Memory operations
await cli.memory.store('key', { data: 'value' });
const data = await cli.memory.get('key');

// Monitoring
await cli.monitor.start();
await cli.dashboard.launch();
```

---

## Support & Resources

### Migration Help

- **GitHub Issues:** https://github.com/ruvnet/claude-flow-novice/issues
- **Migration Guide:** [V2_MIGRATION_GUIDE.md](./V2_MIGRATION_GUIDE.md)
- **CLI Documentation:** `claude-flow-novice help`
- **Discord:** https://discord.gg/claude-flow

### CLI Reference

```bash
# Get help
claude-flow-novice help
claude-flow-novice <command> --help

# Example commands
claude-flow-novice swarm init "Build API"
claude-flow-novice agent spawn coder "Add auth"
claude-flow-novice fleet scale --target 1000
claude-flow-novice monitor --dashboard
```

---

## Timeline

| Version | Date | MCP Status | Action Required |
|---------|------|------------|-----------------|
| **v2.0.0** | Oct 2025 | ❌ **REMOVED** | **Migrate immediately** |
| v1.6.6 | Sep 2025 | ✅ Available | Upgrade to v2.0 |

**No grace period.** MCP is completely removed in v2.0.0.

---

## FAQ

### Q: Can I keep using MCP?
**A:** No, MCP has been completely removed in v2.0.0. You must migrate to CLI.

### Q: Will old MCP code work?
**A:** No, all MCP imports and calls will throw errors in v2.0.0.

### Q: How do I migrate programmatic MCP usage?
**A:** Use the new CLI wrapper SDK (see Programmatic Access section above).

### Q: What if I can't migrate immediately?
**A:** Stay on v1.6.6, but it's not recommended. v2.0.0 has critical security fixes and performance improvements.

### Q: Is there an automated migration tool?
**A:** Not yet, but manual migration is straightforward (see Migration Steps above).

### Q: What about my MCP configuration?
**A:** Delete `.mcp-config.json` and run `claude-flow-novice init` to create CLI config.

---

## Action Required

✅ **Install v2.0.0:** `npm install claude-flow-novice@2.0.0`
✅ **Remove MCP references:** Update package.json scripts
✅ **Update code:** Replace MCP calls with CLI commands
✅ **Test migration:** Run `claude-flow-novice status`
✅ **Delete MCP config:** Remove `.mcp-config.json`

---

## Summary

**MCP server has been completely removed in v2.0.0.**

- ❌ No MCP server
- ❌ No MCP client
- ❌ No MCP tools
- ✅ All functionality via CLI
- ✅ New CLI wrapper SDK
- ✅ Better performance
- ✅ Simpler architecture

**Migrate to CLI today for a better experience!**

---

**Status:** MCP REMOVED ❌
**Alternative:** CLI (`claude-flow-novice`) ✅
**Support:** [Migration Guide](./V2_MIGRATION_GUIDE.md)
