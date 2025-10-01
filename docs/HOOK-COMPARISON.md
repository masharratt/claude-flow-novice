# Hook Comparison: TDD-Enhanced vs Post-Edit Pipeline

## ⚠️ DEPRECATION NOTICE

**Status**: The standalone TDD hooks (`claude-flow-tdd-hooks.js`) are now **DEPRECATED** and have been replaced by the **unified post-edit pipeline**.

**Migration Path**: See [POST-EDIT-PIPELINE-UNIFIED.md](./POST-EDIT-PIPELINE-UNIFIED.md) for complete documentation of the unified system.

---

## Current Architecture (October 2025)

### **Unified Pipeline** (RECOMMENDED)
**Location:** `src/hooks/enhanced-post-edit-pipeline.js`
**Size:** ~2000 lines
**Focus:** Comprehensive validation with optional TDD enforcement and Rust strict mode
**Status:** ✅ Active, Fully Supported

### Legacy Hooks (DEPRECATED)

#### 1. **post-edit-pipeline.js** (Basic Hook)
**Location:** `config/hooks/post-edit-pipeline.js`
**Size:** 800 lines
**Focus:** General validation and quality checks
**Status:** ⚠️ Deprecated - Use unified pipeline instead

#### 2. **claude-flow-tdd-hooks.js** (TDD-Enhanced Hook)
**Location:** Project-specific (e.g., ourstories-v2)
**Size:** 1,729 lines
**Focus:** Test-Driven Development enforcement
**Status:** ⚠️ Deprecated - Merged into unified pipeline

---

## Migration Guide

**Old Configuration** (Deprecated):
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "node claude-flow-tdd-hooks.js tdd-post-edit \"$FILE_PATH\" --memory-key \"$MEMORY_KEY\" --minimum-coverage 80 --structured"
      }
    ]
  }
}
```

**New Configuration** (Recommended):
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "node src/hooks/enhanced-post-edit-pipeline.js \"$FILE_PATH\" --memory-key \"$MEMORY_KEY\" --minimum-coverage 80 --structured",
        "description": "Unified post-edit validation with TDD support"
      }
    ]
  }
}
```

**Changes Required**:
1. ✅ Update hook path: `claude-flow-tdd-hooks.js` → `src/hooks/enhanced-post-edit-pipeline.js`
2. ✅ Remove `tdd-post-edit` subcommand (no longer needed)
3. ✅ All other options remain the same (backward compatible)

---

## Historical Comparison (For Reference Only)

## Feature Comparison

| Feature | post-edit-pipeline.js | claude-flow-tdd-hooks.js |
|---------|----------------------|-------------------------|
| **Primary Focus** | Code quality validation | TDD enforcement |
| **File Size** | 800 lines | 1,729 lines |
| **Complexity** | Basic | Advanced |
| **Test Execution** | Project-level (npm test) | **Single-file testing** |
| **Coverage Analysis** | No | **Yes - Real-time** |
| **TDD Compliance** | No | **Yes - Phase detection** |
| **Framework Detection** | Limited | **Comprehensive** |
| **Blocking Mechanism** | Type errors only | **TDD violations configurable** |

---

## Core Differences

### post-edit-pipeline.js (Standard)

**Purpose:** Comprehensive validation after file edits

**Capabilities:**
- ✅ Code formatting (Prettier, Black, RustFmt, etc.)
- ✅ Linting (ESLint, Flake8, Clippy, etc.)
- ✅ Type checking (TypeScript, mypy, cargo check)
- ✅ Dependency verification
- ✅ Security scanning (npm audit, bandit, etc.)
- ✅ Basic test execution (full project tests)
- ✅ Logging to `post-edit-pipeline.log`

**Test Approach:**
- Runs full project test suite: `npm test`, `pytest`, `cargo test`
- Requires complete project compilation
- All-or-nothing approach
- **Limitation:** Slow for large projects

**Use Cases:**
- General purpose validation
- Projects without strict TDD requirements
- Quick validation checks
- Beginner-friendly progressive validation

---

### claude-flow-tdd-hooks.js (TDD-Enhanced)

**Purpose:** Enforce Test-Driven Development with single-file testing

**Additional Capabilities:**
- ✅ **Single-file test execution** (no full compilation needed)
- ✅ **Real-time coverage analysis** with diff reporting
- ✅ **TDD compliance checking** (Red-Green-Refactor detection)
- ✅ **Test framework auto-detection** (Jest, Mocha, Pytest, etc.)
- ✅ **TDD phase tracking** (RED/GREEN/REFACTOR/UNKNOWN)
- ✅ **Coverage thresholds** (default: 80%, configurable)
- ✅ **Test-first enforcement** (block if no tests exist)
- ✅ **Detailed test recommendations** with priority levels
- ✅ **Enhanced memory store** (`.swarm/tdd-memory.json`)
- ✅ **Structured JSON output** for agent coordination
- ✅ **Logging to `post-edit-pipeline.log`** (NOW INCLUDED)

**Test Approach:**
- Tests individual files in isolation
- No full project compilation required
- Intelligent test file discovery:
  - `file.test.js`, `test_file.py`, `file_test.go`
  - Searches multiple test directories
- **Advantage:** Fast feedback, works even with partial project setup

**TDD Enforcement:**
```javascript
// Example TDD compliance output
{
  "tddCompliance": {
    "hasTests": true,
    "coverage": 85,
    "testsPassed": 12,
    "testsFailed": 0,
    "phase": "green",  // red, green, or refactor
    "recommendations": [
      {
        "type": "tdd_green",
        "priority": "low",
        "message": "TDD GREEN phase - consider refactoring",
        "action": "Improve code design while keeping tests green"
      }
    ]
  }
}
```

**Use Cases:**
- Strict TDD projects
- Agent-driven development with consensus validation
- Projects requiring high test coverage
- Fast iteration with single-file testing
- Multi-agent coordination (swarm development)

---

## Test Execution Examples

### Standard Hook (post-edit-pipeline.js)
```bash
# Runs full project test suite
npm test  # All tests in project
pytest    # All Python tests
cargo test # All Rust tests

# Problem: Slow for large projects, requires full compilation
```

### TDD Hook (claude-flow-tdd-hooks.js)
```bash
# Tests only the edited file
jest src/utils/auth.test.js  # Just auth tests
pytest test_calculator.py     # Just calculator tests
cargo test --test auth_test   # Just auth tests

# Advantage: Fast, isolated, works without full project build
```

---

## When to Use Each Hook

### Use **post-edit-pipeline.js** when:
- ✅ You need basic validation and formatting
- ✅ Project doesn't enforce strict TDD
- ✅ Full project test runs are acceptable
- ✅ You want simpler, beginner-friendly validation
- ✅ Progressive validation (graceful degradation) is preferred

### Use **claude-flow-tdd-hooks.js** when:
- ✅ Enforcing Test-Driven Development
- ✅ Need fast, single-file testing
- ✅ Require real-time coverage analysis
- ✅ Working with AI agent swarms (coordination)
- ✅ Want TDD phase detection (Red-Green-Refactor)
- ✅ Need configurable coverage thresholds
- ✅ Projects with strict quality gates

---

## Configuration Examples

### Standard Hook Configuration
`.claude/hooks.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node config/hooks/post-edit-pipeline.js \"$FILE_PATH\"",
            "description": "Standard validation pipeline"
          }
        ]
      }
    ]
  }
}
```

### TDD Hook Configuration
`.claude/hooks.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node claude-flow-tdd-hooks.js tdd-post-edit \"$FILE_PATH\" --memory-key \"$MEMORY_KEY\" --minimum-coverage 80 --structured",
            "description": "TDD-enhanced validation with single-file testing"
          }
        ]
      }
    ]
  }
}
```

---

## Memory Storage

### Standard Hook
- Logs to: `post-edit-pipeline.log`
- Format: Human-readable + JSON
- No specialized memory store

### TDD Hook
- Logs to: `post-edit-pipeline.log` (NEW - just added)
- Memory store: `.swarm/tdd-memory.json`
- Enhanced coordination: Cross-agent state sharing
- Versioned entries with TDD phase tracking

---

## Performance Comparison

| Metric | Standard Hook | TDD Hook |
|--------|--------------|----------|
| **File Validation** | ~2-5 seconds | ~2-5 seconds |
| **Test Execution** | 10-60+ seconds (full suite) | **1-5 seconds (single file)** |
| **Coverage Analysis** | Not available | **Real-time** |
| **Project Setup Required** | Full | **Partial OK** |
| **Large Project Performance** | Slow | **Fast** |

---

## Recent Enhancement (October 2025)

### TDD Hook Logging Added
The TDD hook now includes the same `logToRootFile()` functionality as the standard hook:

**What was added:**
- `formatTimestamp()` method for human-readable dates
- `logToRootFile()` method (lines 1124-1387)
- Integrated logging call in `tddPostEditHook()` (line 1325)
- 500-entry limit with auto-cleanup
- Full TDD metrics in log entries

**Result:**
Both hooks now write to the same `post-edit-pipeline.log` file with consistent formatting, making it easy to track all file edits regardless of which hook was used.

---

## Recommendation

**For most users:** Start with **post-edit-pipeline.js** (standard hook)
- Simpler configuration
- Beginner-friendly
- Progressive validation (doesn't break if tools missing)

**For TDD projects:** Use **claude-flow-tdd-hooks.js** (TDD hook)
- Faster feedback with single-file testing
- Enforces TDD principles
- Better for agent coordination
- Real-time coverage analysis

**Best practice:** You can use **both** hooks in different projects based on requirements!

---

## Key Insight

The main difference is **testing philosophy**:

- **post-edit-pipeline.js**: "Did the code pass validation?"
- **claude-flow-tdd-hooks.js**: "Was TDD followed? Are tests written first?"

The TDD hook is essentially a **superset** of the standard hook with specialized TDD enforcement and single-file testing capabilities.

---

## ✅ Next Steps

**This document is maintained for historical reference only.**

**For current usage**, please refer to:
- **[POST-EDIT-PIPELINE-UNIFIED.md](./POST-EDIT-PIPELINE-UNIFIED.md)** - Complete unified pipeline documentation
- **Command-line options** - All TDD features now available in unified pipeline
- **Migration guide** - Step-by-step migration instructions above
- **Configuration examples** - See unified documentation for latest patterns

**Key Benefits of Unified Pipeline**:
- ✅ Single tool for all validation needs
- ✅ Optional TDD enforcement (enable when needed)
- ✅ Rust strict mode support
- ✅ Better performance and caching
- ✅ Simplified maintenance
- ✅ Backward compatible with existing workflows
