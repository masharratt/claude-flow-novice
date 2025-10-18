# Hardcoded Path Dependencies Analysis

## Files with Root Directory References

### 1. test-provider-routing.js
**Issue:** Hardcoded import path referencing `.claude-flow-novice/dist/`
```javascript
// Current (problematic)
import { ProviderManager } from './.claude-flow-novice/dist/src/providers/provider-manager.js';

// Should be (after cleanup)
import { ProviderManager } from './src/providers/provider-manager.js';
```

**Impact:** Will break after directory reorganization
**Fix Required:** ✅ Yes

### 2. example-usage.js
**Issue:** Hardcoded require path to root-level file
```javascript
// Current (problematic)
const QuickTest = require('./quick-test');

// Should be (after moving quick-test.js to scripts/testing/)
const QuickTest = require('./scripts/testing/quick-test');
```

**Impact:** Will break when quick-test.js is moved
**Fix Required:** ✅ Yes

## Configuration Files Analysis

### No Issues Found
- `tsconfig.json` - Uses relative paths `./src`, `./tests` ✅
- `vitest.config.ts` - Uses relative paths `./tests` ✅  
- `jest.config.cjs` - Uses relative paths `./tests` ✅
- `package.json` - No hardcoded root file references ✅

## Symlink Analysis
- `swarm-memory.db*` - Already correctly symlinked to `database/` ✅
- No action required for symlinks

## Summary
- **Total files with hardcoded paths:** 2
- **Files requiring updates:** 2
- **Risk Level:** Low (easily fixable)
- **Estimated fix time:** 10 minutes