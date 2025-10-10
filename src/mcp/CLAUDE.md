# MCP Module - Deprecated

## ⚠️ DEPRECATED in v2.0.0

**Status:** All MCP functionality has been removed and replaced with CLI-based architecture.

**Migration Required:** See [MCP_DEPRECATION_NOTICE.md](../../MCP_DEPRECATION_NOTICE.md)

---

## Deprecation Implementation (Oct 9, 2025)

### Strategy: Immediate Removal

All MCP entry points now throw errors with migration instructions.

### Files Modified

#### 1. **DEPRECATED.js** ✅
- **Purpose:** Centralized deprecation error message
- **Key Learning:** Must use ANSI color codes instead of chalk for ES module compatibility

**Implementation:**
```javascript
// ❌ DON'T: Use chalk (causes require() in ES module)
const chalk = require('chalk');

// ✅ DO: Use ANSI codes directly
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;
```

**Why:** ES modules can't use `require()`, and importing chalk as ESM adds unnecessary dependency. ANSI codes work universally.

#### 2. **index.ts** ✅
- **Purpose:** Main module entry point
- **Implementation:** Throws error immediately on import

**Key Learning:**
```typescript
// ✅ Throw error before any imports
const ERROR = `Migration message...`;
throw new Error(ERROR);

// ❌ Don't import and then throw - import errors happen first
import { something } from './module';
throw new Error('deprecated'); // Never reached if import fails
```

#### 3. **mcp-server*.js** ✅
- Files: `mcp-server.js`, `mcp-server-sdk.js`, `mcp-server-novice.js`, `mcp-server-novice-simplified.js`
- **Pattern:** Redirect to DEPRECATED.js using ES module imports

**Implementation Pattern:**
```javascript
#!/usr/bin/env node
/**
 * ⚠️ DEPRECATED: MCP server removed in v2.0.0
 */

// Redirect to deprecation notice
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('./DEPRECATED.js');
process.exit(1);

/* LEGACY CODE - NON-FUNCTIONAL
... original code commented out ...
*/
```

**Key Learning:** Use `createRequire` to load DEPRECATED.js from ES module context.

#### 4. **client.ts** ✅
- **Purpose:** MCP client entry point
- **Implementation:** Throw error with message constant

**Key Learning:** Define error message as constant to avoid TypeScript parsing issues:
```typescript
const MCP_DEPRECATION_ERROR = `...message...`;
throw new Error(MCP_DEPRECATION_ERROR);
export default undefined;
```

---

## NPM Scripts Updated

### package.json Changes

```json
{
  "scripts": {
    "mcp:start": "echo '❌ MCP removed in v2.0.0 - Use: claude-flow-novice start' && node .claude-flow-novice/dist/mcp/DEPRECATED.js",
    "mcp:status": "echo '❌ MCP removed in v2.0.0 - See: MCP_DEPRECATION_NOTICE.md'"
  }
}
```

**Key Learning:** Show deprecation message in npm scripts to guide users even before execution.

---

## Error Messages

### User Experience

**When running MCP server:**
```bash
$ node src/mcp/mcp-server.js

❌ ERROR: MCP Server has been removed in v2.0.0

Migration Required:
  Old (MCP): node node_modules/claude-flow-novice/mcp/mcp-server.js
  New (CLI): claude-flow-novice start

[Complete command mapping with colors...]
```

**When importing MCP module:**
```typescript
import { MCPServer } from 'claude-flow-novice/mcp';

// Error: MCP module has been removed in v2.0.0
// Migration Required: Use ClaudeFlowCLI from 'claude-flow-novice'
```

---

## Testing Deprecation

### Validation Commands

```bash
# Test deprecation message displays
node src/mcp/DEPRECATED.js
# Exit code: 1
# Output: Colored deprecation message

# Test import fails
node -e "import('./index.js').catch(e => console.log('✓ Error thrown:', e.message))"
# Output: ✓ Error thrown: MCP module has been removed...

# Test npm scripts
npm run mcp:start
# Output: ❌ MCP removed in v2.0.0...
```

---

## Build Process Impact

### Assets Not Copied

**Removed from copy:assets script:**
```bash
# ❌ REMOVED: Don't copy package.json to commands dir
cp src/cli/commands/package.json .claude-flow-novice/dist/src/cli/commands/

# Why: Causes ERR_UNSUPPORTED_DIR_IMPORT in Node.js ESM
```

### MCP Files Still Copied

```bash
# ✅ Still copied for deprecation messages
cp src/mcp/*.js .claude-flow-novice/dist/src/mcp/
cp .claude-flow-novice/dist/src/mcp/*.js .claude-flow-novice/dist/mcp/
```

**Why:** DEPRECATED.js and error files must be accessible for proper error messages.

---

## Migration Path

### Old (MCP) → New (CLI)

**Server Start:**
```bash
# Old
node node_modules/claude-flow-novice/mcp/mcp-server.js

# New
claude-flow-novice start
```

**Tool Calls:**
```bash
# Old
mcp://swarm/init { objective: "Build API" }

# New
claude-flow-novice swarm init "Build API"
```

**Programmatic:**
```typescript
// Old
import { MCPClient } from 'claude-flow-novice/mcp/client';
const client = new MCPClient({ transport });
await client.request('swarm/init', { objective: 'Build API' });

// New
import { ClaudeFlowCLI } from 'claude-flow-novice';
const cli = new ClaudeFlowCLI();
await cli.swarm.init({ objective: 'Build API' });
```

---

## Remaining MCP Files

### Non-Functional Support Modules

These files remain in codebase but are **non-functional** due to broken import chain:

- `auth.ts`, `lifecycle-manager.ts`, `load-balancer.ts`
- `orchestration-integration.ts`, `performance-monitor.ts`
- `protocol-manager.ts`, `router.ts`, `server.ts`
- `session-manager.ts`, `tools.ts`
- `recovery/*`, `transports/*`, `implementations/*`

**Status:** Will be removed in future version (v2.2+, Q2 2025)

**Why Keep:** Historical reference, gradual cleanup

---

## Documentation

### Created Files

1. **MCP_DEPRECATION_NOTICE.md** - Complete migration guide
2. **MCP_DEPRECATION_COMPLETE.md** - Implementation details
3. **V2_MIGRATION_GUIDE.md** - Step-by-step migration
4. **V2_RELEASE_SUMMARY.md** - Executive summary

### Key Sections

- Complete MCP→CLI command mapping
- Programmatic SDK migration examples
- Error handling and troubleshooting
- Timeline and support resources

---

## Lessons Learned

### 1. ES Module Compatibility
- ✅ Use ANSI codes instead of chalk for colors
- ✅ Use `createRequire` to load CommonJS from ESM
- ✅ Define error messages as constants to avoid parsing issues

### 2. Deprecation Strategy
- ✅ Immediate removal is cleaner than gradual deprecation
- ✅ Provide complete command mapping in error messages
- ✅ Link to detailed documentation for complex migrations

### 3. User Experience
- ✅ Show colored, formatted error messages
- ✅ Include "Old vs New" examples in errors
- ✅ Provide multiple support channels (docs, GitHub, Discord)

### 4. Build Process
- ✅ Update npm scripts to show deprecation
- ✅ Keep deprecation files in build output
- ✅ Don't copy package.json files that break ESM

---

## Future Cleanup (v2.2+)

### Files to Remove

```bash
# Complete MCP directory removal planned for v2.2.0
rm -rf src/mcp/*
# Keep only: CLAUDE.md (this file) for historical reference
```

### Migration Monitoring

Track user migration via:
- GitHub issues mentioning MCP
- npm download stats for v1.x vs v2.x
- Community feedback on Discord

**Target:** 90% migration by v2.2.0 (Q2 2025)

---

## Quick Reference

### Test Deprecation Working

```bash
# Should show colored error message and exit 1
node .claude-flow-novice/dist/src/mcp/DEPRECATED.js

# Should throw error
node -e "import('.claude-flow-novice/dist/src/mcp/index.js')"

# Should show deprecation
npm run mcp:start
```

### CLI Replacement Commands

| MCP Command | CLI Replacement |
|------------|-----------------|
| `mcp://swarm/init` | `claude-flow-novice swarm init <objective>` |
| `mcp://agent/spawn` | `claude-flow-novice swarm spawn <agent> <task>` |
| `mcp://fleet/scale` | `claude-flow-novice fleet scale --target <n>` |
| `mcp://memory/store` | `claude-flow-novice memory store <key> --value <val>` |
| `mcp://monitor/dashboard` | `claude-flow-novice dashboard start` |

---

**Status:** Deprecation Complete ✅
**Version:** 2.0.0
**Date:** October 9, 2025
