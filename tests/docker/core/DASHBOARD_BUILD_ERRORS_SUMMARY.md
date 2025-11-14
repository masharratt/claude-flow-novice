# Dashboard Build Errors - Test Suite Summary

## Quick Reference

**Test Files Created:**
1. `test-dashboard-build-errors.sh` - Detects the 3 error categories
2. `test-dashboard-build-fix-validation.sh` - Validates fixes are applied
3. `README-DASHBOARD-BUILD-ERRORS.md` - Comprehensive documentation

**Total Test Coverage:** 22 test cases across 3 error categories

---

## Three Critical Error Categories

### Error 1: MCP Selector ES Module Issue 🔴
**File:** `.claude/skills/cfn-docker-skill-mcp-selection/skill-mcp-selector.js:6`
```javascript
// PROBLEM: CommonJS in ES module context
const fs = require('fs').promises;  // ❌ Line 6

// FIX OPTION A: Use ES modules
import fs from 'fs/promises';  // ✅

// FIX OPTION B: Declare CommonJS
// Add to package.json: {"type": "commonjs"}  // ✅
```

**Impact:** Primary blocker - agent spawning fails completely

**Tests:**
- `test_mcp_selector_no_commonjs_require` - Detects CommonJS require()
- `test_mcp_selector_es_module_syntax` - Validates module consistency
- `test_jq_null_safety_implemented` - Validates null-safe jq operations
- `test_mcp_selector_module_fixed` - Validates fix applied

---

### Error 2: Parameter Mismatches 🟡
**Files:** orchestrate.sh → spawn-agent.sh interface

**Specific Issues:**
```bash
# Issue 1: Context parameter mismatch
orchestrate.sh:  --context-file /path/file.json  # ❌
spawn-agent.sh:  --context /path/file.json       # ✅

# Issue 2: Non-existent flag
orchestrate.sh:  --mcp-auto-select               # ❌ Doesn't exist
spawn-agent.sh:  (no such flag)                  # spawn-agent doesn't accept it
```

**Impact:** Parameters ignored silently, agents spawn with missing config

**Tests:**
- `test_context_parameter_consistency` - Detects --context mismatch
- `test_no_mcp_auto_select_flag` - Detects invalid flag usage
- `test_orchestrate_spawn_parameter_alignment` - Full parameter validation
- `test_all_parameter_mismatches_fixed` - Validates all fixes

---

### Error 3: JSON Context Shell Injection 🔴
**File:** `.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh:400`

```bash
# ANTI-PATTERN: Executes JSON as shell code ❌
DOCKER_CMD="$DOCKER_CMD --context $(cat "$CONTEXT_FILE")"

# CORRECT PATTERN 1: Volume mount ✅
DOCKER_CMD="$DOCKER_CMD -v $CONTEXT_FILE:/app/context.json:ro"

# CORRECT PATTERN 2: Environment variable ✅
DOCKER_CMD="$DOCKER_CMD -e CONTEXT_FILE=/app/context.json"

# CORRECT PATTERN 3: Parse with jq first ✅
context_data=$(jq -r '.field' "$CONTEXT_FILE")
DOCKER_CMD="$DOCKER_CMD -e FIELD=$context_data"
```

**Impact:** Docker command syntax errors, security risk

**Tests:**
- `test_no_json_context_shell_injection` - Detects dangerous pattern
- `test_context_file_proper_handling` - Validates safe implementation
- `test_json_parsing_with_jq` - Ensures jq usage for JSON parsing
- `test_json_shell_injection_fix_applied` - Validates fix

---

## Running the Tests

### Quick Start
```bash
# Navigate to test directory
cd tests/docker/core

# Run error detection (shows what's broken)
bash test-dashboard-build-errors.sh

# Run fix validation (confirms fixes work)
bash test-dashboard-build-fix-validation.sh
```

### Expected Output

**Before Fixes:**
```
TESTS FAILED: Found 3 critical issues
- MCP selector module error
- Parameter mismatches (5 instances)
- JSON context shell injection
```

**After Fixes:**
```
All tests passed!
22/22 validations successful
```

---

## Fix Application Checklist

### Fix 1: MCP Selector Module
```bash
# Option A: Convert to ES modules (recommended)
cd .claude/skills/cfn-docker-skill-mcp-selection
# Edit skill-mcp-selector.js
# Change line 6: const fs = require('fs').promises;
# To: import fs from 'fs/promises';
# Change line 8: const AgentTokenManager = require(...)
# To: import AgentTokenManager from '...'

# Option B: Declare CommonJS
echo '{"type": "commonjs"}' > package.json
```

### Fix 2: Parameter Mismatches
```bash
# Fix context parameter
cd .claude/skills/cfn-docker-loop-orchestration
sed -i 's/--context-file/--context/g' orchestrate.sh

# Remove invalid mcp-auto-select flag
sed -i '/--mcp-auto-select/d' orchestrate.sh
```

### Fix 3: JSON Context Injection
```bash
# Fix spawn-agent.sh line 400
cd .claude/skills/cfn-docker-agent-spawning

# Replace:
# DOCKER_CMD="$DOCKER_CMD --context $(cat "$CONTEXT_FILE")"

# With:
# DOCKER_CMD="$DOCKER_CMD -v $CONTEXT_FILE:/app/context.json:ro"
```

---

## Integration with CI/CD

### Pre-commit Hook
```bash
#!/bin/bash
# .git/hooks/pre-commit
./tests/docker/core/test-dashboard-build-errors.sh || {
    echo "Fix dashboard build errors before committing"
    exit 1
}
```

### GitHub Actions
```yaml
- name: Dashboard Build Error Tests
  run: |
    bash tests/docker/core/test-dashboard-build-errors.sh
    bash tests/docker/core/test-dashboard-build-fix-validation.sh
```

---

## Troubleshooting

### Tests Won't Run
```bash
# Fix line endings (WSL2 issue)
sed -i 's/\r$//' tests/docker/core/test-dashboard-build*.sh

# Fix MCP selector line endings
sed -i 's/\r$//' .claude/skills/cfn-docker-skill-mcp-selection/skill-mcp-selector.js

# Make executable
chmod +x tests/docker/core/test-dashboard-build*.sh
```

### Test Hangs/Timeouts
```bash
# Run with explicit bash
bash tests/docker/core/test-dashboard-build-errors.sh

# Run with timeout
timeout 30 bash tests/docker/core/test-dashboard-build-errors.sh

# Debug specific test
bash -x tests/docker/core/test-dashboard-build-errors.sh 2>&1 | head -100
```

---

## Test Architecture

```
tests/docker/core/
├── test-dashboard-build-errors.sh           # Error detection (11 tests)
├── test-dashboard-build-fix-validation.sh   # Fix validation (11 tests)
├── README-DASHBOARD-BUILD-ERRORS.md         # Full documentation
└── DASHBOARD_BUILD_ERRORS_SUMMARY.md        # This file (quick reference)
```

**Test Categories:**
- MCP Selector Module: 4 tests (2 detection + 2 validation)
- Parameter Consistency: 6 tests (3 detection + 3 validation)
- JSON Context Safety: 6 tests (3 detection + 3 validation)
- Integration/Regression: 6 tests (2 detection + 4 validation)

---

## Related Documentation

- **Full Documentation:** `README-DASHBOARD-BUILD-ERRORS.md`
- **Root Cause Analysis:** `/tmp/dashboard-build-diagnosis.md` (session file)
- **Parameter Contract:** `.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md`
- **Test Standards:** `tests/CLAUDE.md`

---

## Success Criteria

✅ All 22 tests pass
✅ No CommonJS require() in MCP selector
✅ All parameters match between orchestrate.sh and spawn-agent.sh
✅ No $(cat ...) patterns in Docker commands
✅ Valid bash syntax in all scripts
✅ No hardcoded passwords

---

## Next Steps After Fixing

1. Run full test suite: `npm run test:docker`
2. Test actual dashboard build workflow
3. Monitor for regressions in future sessions
4. Consider adding these tests to CI/CD pipeline

---

*Created: 2025-01-14*
*Test Suite Version: 1.0*
*Error Categories: 3*
*Total Tests: 22*
