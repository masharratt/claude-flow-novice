# Source Code Development Guidelines

## Critical Learnings

### ESM Module Resolution Issues (Oct 9, 2025)

**Problem:** Node.js ESM throws `ERR_UNSUPPORTED_DIR_IMPORT` when a subdirectory contains a `package.json` with module exports.

**Root Cause:**
- Having `package.json` in subdirectories (like `src/cli/commands/package.json`) causes Node.js to treat that directory as a module package
- When importing from `./commands/index.js`, Node.js sees the package.json and tries to resolve via the `exports` field
- This breaks relative imports because the export path is relative to the subdirectory, not the importing file

**Example Error:**
```
Error [ERR_UNSUPPORTED_DIR_IMPORT]: Directory import
'/path/to/src/cli/commands' is not supported resolving ES modules
```

**Solution:**
1. **Remove subdirectory package.json files** - Don't use package.json in subdirectories unless absolutely necessary for package structure
2. **Always use explicit file paths** - Import `./commands/index.js` not `./commands`
3. **Fix build scripts** - Ensure post-build scripts add `/index.js` to directory imports

**Files Affected:**
- `src/cli/commands/package.json` - REMOVED (was causing the issue)
- `package.json` - Updated copy:assets script to not copy commands/package.json
- `scripts/fix-js-extensions.js` - Already handles directory imports correctly

**Build Process Fix:**
```bash
# The fix-js-extensions.js script automatically converts:
from './commands'          → from './commands/index.js'
from './module'            → from './module.js'
```

**Prevention:**
- ⚠️ Never add package.json files to subdirectories unless creating a true subpackage
- ✅ Always use explicit file extensions in imports (`.js`)
- ✅ Test CLI after build: `node .claude-flow-novice/dist/src/cli/main.js --version`

---

## MCP Deprecation (Oct 9, 2025)

**Implementation:** All MCP (Model Context Protocol) functionality deprecated in v2.0.0

**Key Changes:**
1. **Entry Points Disabled:**
   - `src/mcp/index.ts` - Throws error on import
   - `src/mcp/DEPRECATED.js` - Shows migration message with colors
   - `src/mcp/mcp-server*.js` - Redirect to DEPRECATED.js
   - `src/mcp/client.ts` - Throws error on import

2. **Migration Path:**
   - Old: `import { MCPServer } from 'claude-flow-novice/mcp'`
   - New: `import { ClaudeFlowCLI } from 'claude-flow-novice'`
   - CLI: `claude-flow-novice swarm init "Build API"`

3. **ES Module Compatibility:**
   - DEPRECATED.js uses ANSI color codes (no chalk dependency)
   - Works in both CommonJS and ESM contexts
   - Exit code 1 for proper error handling

**Documentation:**
- `MCP_DEPRECATION_NOTICE.md` - Complete migration guide
- `MCP_DEPRECATION_COMPLETE.md` - Implementation details
- `V2_MIGRATION_GUIDE.md` - Step-by-step migration

---

## Build System

### SWC Configuration Issues

**Issue:** SWC's `resolveExtensions` can strip file extensions from imports during compilation

**SWC Config (.swcrc):**
```json
{
  "module": {
    "resolveExtensions": [".ts", ".tsx", ".js", ".jsx"]
  }
}
```

**Problem:** This causes SWC to transform:
- Source: `from './commands/index.js'`
- Output: `from './commands'` ❌

**Solution:** Post-build script (`fix-js-extensions.js`) adds extensions back:
- Pattern matching: `from\s+(['"])(\.\.[\/\\][^'"\s]+|\.\/[^'"\s]+)(['"])`
- Directory detection: No dots in last path segment
- Fix: `./commands` → `./commands/index.js`

**Build Order:**
1. `npm run build:swc` - Compile TypeScript with SWC
2. `npm run copy:assets` - Copy static files (no package.json in subdirs!)
3. `npm run build:fix-imports` - Fix import extensions
4. `npm run build:types:reliable` - Generate types with fallback

---

## Testing & Validation

### CLI Entry Point Validation

**Critical Test:**
```bash
# Must pass before publication
node .claude-flow-novice/dist/src/cli/main.js --version
```

**Expected Output:**
```
🚀 Enhanced Commands Loaded:
  ✓ start    - Enhanced orchestration with service management
  ...
claude-flow v1.0.45
```

**Common Failures:**
- `ERR_UNSUPPORTED_DIR_IMPORT` → package.json in subdirectory
- `Cannot find module` → Missing .js extension in import
- `require is not defined` → CommonJS in ES module file

---

## File Organization Rules

### ✅ DO:
- Use explicit file extensions: `./module.js`
- Keep package.json only at project root
- Use post-build scripts to fix imports
- Test CLI after every build

### ❌ DON'T:
- Add package.json to subdirectories (causes ESM issues)
- Rely on directory resolution (`./commands` without `/index.js`)
- Use CommonJS `require()` in ES modules
- Skip the build:fix-imports step

---

## Emergency Fixes

### Quick Fix for ERR_UNSUPPORTED_DIR_IMPORT:

1. **Find the package.json causing issues:**
   ```bash
   find src -name package.json -type f
   ```

2. **Remove it:**
   ```bash
   rm src/cli/commands/package.json
   ```

3. **Update build script to not copy it:**
   ```bash
   # Remove from copy:assets in package.json
   ```

4. **Rebuild:**
   ```bash
   npm run build
   ```

5. **Test:**
   ```bash
   node .claude-flow-novice/dist/src/cli/main.js --version
   ```

---

## Version History

- **v2.0.0 (Oct 9, 2025):**
  - MCP fully deprecated
  - Fixed ESM directory import issues
  - Removed src/cli/commands/package.json
  - Updated build process for ES modules
