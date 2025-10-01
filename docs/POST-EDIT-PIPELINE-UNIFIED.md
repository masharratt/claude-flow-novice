# Unified Post-Edit Pipeline Documentation

## Overview

The **unified post-edit pipeline** combines standard validation with advanced TDD enforcement and Rust quality controls into a single, comprehensive system. This document describes the complete feature set, configuration options, and usage patterns.

**Current Implementation**: `src/hooks/enhanced-post-edit-pipeline.js`

---

## Feature Matrix

| Feature Category | Standard Mode | TDD Mode | Rust Strict Mode |
|-----------------|---------------|----------|------------------|
| **Code Formatting** | ✅ Prettier, Black, RustFmt | ✅ With diff preview | ✅ With enforcement |
| **Linting** | ✅ ESLint, Clippy, Flake8 | ✅ With error locations | ✅ Clippy warnings = errors |
| **Type Checking** | ✅ TSC, cargo check, mypy | ✅ With detailed errors | ✅ Blocking on errors |
| **Single-File Testing** | ❌ Project-level only | ✅ Isolated file tests | ✅ Module-level tests |
| **Coverage Analysis** | ❌ Not available | ✅ Real-time with thresholds | ✅ Required ≥80% |
| **TDD Phase Detection** | ❌ Not available | ✅ Red/Green/Refactor | ✅ Enabled |
| **Security Scanning** | ✅ Basic audit | ✅ Enhanced detection | ✅ Strict mode |
| **Dependency Analysis** | ✅ Basic checks | ✅ Smart detection | ✅ cargo tree required |
| **Agent Feedback** | ✅ JSON output | ✅ Structured recommendations | ✅ Blocking feedback |

---

## Installation & Setup

### Prerequisites

```bash
# JavaScript/TypeScript
npm install -g prettier eslint jest

# Python
pip install black flake8 pytest pytest-cov

# Rust
cargo install rustfmt clippy cargo-tarpaulin

# Go
go install golang.org/x/tools/cmd/gofmt@latest
go install golang.org/x/lint/golint@latest
```

### Hook Configuration

Add to `.claude/hooks.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node src/hooks/enhanced-post-edit-pipeline.js \"$FILE_PATH\" --memory-key \"$MEMORY_KEY\" --structured",
            "description": "Unified post-edit validation with TDD support"
          }
        ]
      }
    ]
  }
}
```

---

## Command-Line Interface

### Basic Usage

```bash
# Standard validation mode
node src/hooks/enhanced-post-edit-pipeline.js <file-path>

# With memory key for agent coordination
node src/hooks/enhanced-post-edit-pipeline.js <file-path> --memory-key "swarm/coder/auth-module"

# TDD mode with coverage threshold
node src/hooks/enhanced-post-edit-pipeline.js <file-path> --minimum-coverage 80 --structured

# Rust strict mode
node src/hooks/enhanced-post-edit-pipeline.js <file-path> --rust-strict --structured
```

### Command-Line Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--memory-key` | string | null | Memory key for agent coordination (format: `swarm/[agent]/[step]`) |
| `--minimum-coverage` | number | 80 | Minimum test coverage percentage (0-100) |
| `--structured` | flag | false | Return structured JSON output for agent consumption |
| `--rust-strict` | flag | false | Enable strict Rust quality enforcement |
| `--no-format` | flag | false | Skip formatting step |
| `--no-lint` | flag | false | Skip linting step |
| `--no-tests` | flag | false | Skip test execution |
| `--no-coverage` | flag | false | Skip coverage analysis |
| `--agent-type` | string | null | Agent type for context tracking |
| `--agent-name` | string | null | Agent name for context tracking |
| `--swarm-id` | string | null | Swarm ID for multi-agent coordination |

---

## Configuration File

Create `config/hooks/enhanced-pipeline-config.json`:

```json
{
  "formatters": {
    "javascript": ["prettier", "--write"],
    "typescript": ["prettier", "--write"],
    "python": ["black", "--quiet"],
    "rust": ["rustfmt", "--edition", "2021"],
    "go": ["gofmt", "-w"]
  },
  "linters": {
    "javascript": ["eslint", "--fix"],
    "typescript": ["eslint", "--fix"],
    "python": ["flake8"],
    "rust": ["cargo", "clippy", "--", "-W", "clippy::all"],
    "go": ["golint"]
  },
  "typeCheckers": {
    "typescript": ["tsc", "--noEmit"],
    "python": ["mypy"],
    "rust": ["cargo", "check"],
    "go": ["go", "vet"]
  },
  "testCommands": {
    "javascript": {
      "runner": "jest",
      "singleFile": ["jest", "--testPathPattern"],
      "coverage": ["jest", "--coverage", "--testPathPattern"]
    },
    "python": {
      "runner": "pytest",
      "singleFile": ["pytest"],
      "coverage": ["pytest", "--cov", "--cov-report=json"]
    },
    "rust": {
      "runner": "cargo",
      "singleFile": ["cargo", "test", "--test"],
      "coverage": ["cargo", "tarpaulin", "--out", "Json"]
    }
  },
  "coverageThresholds": {
    "statements": 80,
    "branches": 75,
    "functions": 80,
    "lines": 80
  },
  "rustStrict": {
    "clippyWarningsAsErrors": true,
    "requiredCoverage": 80,
    "blockOnTestFailure": true,
    "enforceFormatting": true
  }
}
```

---

## Usage Examples

### Example 1: Basic Validation (JavaScript)

```bash
node src/hooks/enhanced-post-edit-pipeline.js src/utils/auth.js

# Output:
# ✅ Formatting: Formatted successfully with 3 changes
# ✅ Linting: No issues found
# ✅ Type Checking: All types valid
# 🧪 Testing: 12 tests passed
# 📊 Coverage: 85% (exceeds 80% threshold)
# ✅ Overall Status: PASSED
```

### Example 2: TDD Mode with Coverage (Python)

```bash
node src/hooks/enhanced-post-edit-pipeline.js src/calculator.py \
  --minimum-coverage 90 \
  --memory-key "swarm/tester/calculator" \
  --structured

# Output (JSON):
{
  "success": true,
  "file": "src/calculator.py",
  "validation": {
    "passed": true,
    "coverage": "advanced"
  },
  "testing": {
    "executed": true,
    "framework": "pytest",
    "results": {
      "passed": 15,
      "failed": 0,
      "total": 15
    }
  },
  "tddCompliance": {
    "hasTests": true,
    "coverage": 92,
    "phase": "green",
    "recommendations": [
      {
        "type": "tdd_green",
        "priority": "low",
        "message": "TDD GREEN phase - consider refactoring",
        "action": "Improve code design while keeping tests green"
      }
    ]
  },
  "coverage": {
    "overall": 92,
    "statements": 95,
    "branches": 88,
    "functions": 94,
    "lines": 92
  }
}
```

### Example 3: Rust Strict Mode

```bash
node src/hooks/enhanced-post-edit-pipeline.js src/lib.rs \
  --rust-strict \
  --minimum-coverage 80 \
  --structured

# Output (JSON):
{
  "success": true,
  "file": "src/lib.rs",
  "rustStrict": {
    "enabled": true,
    "checks": {
      "formatting": true,
      "clippy": true,
      "tests": true,
      "coverage": true
    }
  },
  "validation": {
    "rustfmt": { "passed": true, "changes": 0 },
    "clippy": { "passed": true, "warnings": 0, "errors": 0 },
    "cargoCheck": { "passed": true, "errors": [] }
  },
  "testing": {
    "executed": true,
    "framework": "cargo",
    "results": {
      "passed": 24,
      "failed": 0,
      "ignored": 2,
      "total": 26
    }
  },
  "coverage": {
    "overall": 87,
    "statements": 89,
    "branches": 84,
    "functions": 88,
    "lines": 87
  },
  "tddCompliance": {
    "hasTests": true,
    "coverage": 87,
    "phase": "green"
  }
}
```

### Example 4: Combined TDD + Rust Mode

```bash
node src/hooks/enhanced-post-edit-pipeline.js src/auth.rs \
  --rust-strict \
  --minimum-coverage 90 \
  --memory-key "swarm/security-specialist/auth-module" \
  --structured

# Enables:
# ✓ Rust strict quality enforcement
# ✓ TDD phase detection
# ✓ 90% coverage requirement
# ✓ Agent memory coordination
# ✓ Structured JSON output
```

---

## Rust Quality Enforcement Rules

When `--rust-strict` is enabled:

### 1. Formatting Enforcement
- **Rule**: All code must pass `rustfmt` without changes
- **Blocking**: Yes (pipeline fails if formatting needed)
- **Command**: `rustfmt --check --edition 2021`

### 2. Clippy Warning Escalation
- **Rule**: All Clippy warnings treated as errors
- **Blocking**: Yes (pipeline fails on any warning)
- **Command**: `cargo clippy -- -W clippy::all -D warnings`

### 3. Type Checking
- **Rule**: `cargo check` must pass without errors
- **Blocking**: Yes
- **Command**: `cargo check --all-features`

### 4. Test Requirements
- **Rule**: All tests must pass
- **Blocking**: Yes
- **Command**: `cargo test`

### 5. Coverage Thresholds
- **Rule**: Minimum coverage (default: 80%)
- **Blocking**: Yes (configurable via `--minimum-coverage`)
- **Command**: `cargo tarpaulin --out Json`

### 6. Dependency Verification
- **Rule**: `cargo tree` must succeed
- **Blocking**: No (warning only)
- **Command**: `cargo tree`

---

## TDD Features

### Phase Detection

The pipeline automatically detects TDD phases:

| Phase | Detection Criteria | Recommendations |
|-------|-------------------|-----------------|
| **RED** | Tests exist but are failing | "Fix failing tests to move to GREEN phase" |
| **GREEN** | All tests passing, coverage adequate | "Consider refactoring for better design" |
| **REFACTOR** | Tests passing, code recently modified | "Maintain test coverage while improving code" |
| **UNKNOWN** | No tests found or ambiguous state | "Write tests first (TDD RED phase)" |

### Single-File Testing

Tests only the specific file being edited:

```bash
# JavaScript: Tests only auth.test.js
jest --testPathPattern=auth.test.js

# Python: Tests only test_auth.py
pytest test_auth.py

# Rust: Tests only auth_tests module
cargo test --test auth_tests

# Go: Tests only auth_test.go
go test -run TestAuth
```

**Advantages**:
- ⚡ Fast feedback (1-5 seconds vs 10-60 seconds)
- 🎯 Focused validation
- 🚀 Works without full project compilation
- 💡 Ideal for iterative development

### Coverage Analysis

Real-time coverage with diff reporting:

```json
{
  "coverage": {
    "overall": 85,
    "statements": 87,
    "branches": 82,
    "functions": 89,
    "lines": 85,
    "diff": {
      "added": 12,
      "covered": 10,
      "percentage": 83.3
    }
  }
}
```

---

## Agent Integration

### Memory Key Format

Memory keys follow the pattern: `swarm/[agent-type]/[task-step]`

```bash
# Examples:
--memory-key "swarm/coder/authentication-module"
--memory-key "swarm/tester/unit-tests"
--memory-key "swarm/reviewer/security-audit"
```

### Structured Output

When `--structured` is enabled, returns JSON for agent consumption:

```json
{
  "success": true,
  "file": "src/component.js",
  "language": "javascript",
  "timestamp": "2025-10-01T10:30:00Z",
  "agent": {
    "memoryKey": "swarm/coder/component",
    "agentType": "coder",
    "swarmId": "auth-swarm-001"
  },
  "validation": {
    "passed": true,
    "coverage": "advanced",
    "issues": []
  },
  "formatting": {
    "needed": true,
    "changes": 3,
    "formatter": "prettier"
  },
  "linting": {
    "passed": true,
    "issues": 0
  },
  "testing": {
    "executed": true,
    "framework": "jest",
    "results": {
      "passed": 12,
      "failed": 0,
      "total": 12
    }
  },
  "tddCompliance": {
    "hasTests": true,
    "coverage": 85,
    "phase": "green",
    "recommendations": [
      {
        "type": "tdd_green",
        "priority": "low",
        "message": "Tests passing, consider refactoring",
        "action": "Improve code design while maintaining tests"
      }
    ]
  },
  "recommendations": [
    {
      "type": "security",
      "priority": "high",
      "message": "XSS vulnerability detected",
      "action": "Sanitize user input before rendering"
    },
    {
      "type": "performance",
      "priority": "medium",
      "message": "Inefficient loop detected",
      "action": "Consider using Array.map() instead of forEach"
    }
  ],
  "memory": {
    "stored": true,
    "enhancedStore": true,
    "location": ".swarm/tdd-memory.json"
  }
}
```

### Blocking Mechanisms

Pipeline can block on critical failures:

| Condition | Blocking | Exit Code | Message |
|-----------|----------|-----------|---------|
| Type errors | Yes | 1 | "Type checking failed" |
| Test failures | Yes* | 1 | "Tests failed" |
| Coverage below threshold | Yes* | 1 | "Coverage below minimum" |
| Security vulnerabilities | No** | 0 | Warning only |
| Linting issues | No | 0 | Warning only |
| Formatting needed | No | 0 | Auto-fixed |

\* Only when TDD mode or Rust strict mode enabled
\*\* Configurable via pipeline settings

---

## Performance Characteristics

| Operation | Time (ms) | Cacheable |
|-----------|-----------|-----------|
| Language detection | 1-5 | Yes |
| Formatting | 100-500 | No |
| Linting | 200-800 | Yes |
| Type checking | 500-2000 | Yes |
| Single-file tests | 1000-5000 | No |
| Coverage analysis | 2000-8000 | No |
| Full project tests | 10000-60000 | No |

**Optimization Tips**:
1. Use single-file testing instead of full project tests (10x faster)
2. Enable caching for type checking and linting
3. Run coverage analysis only when needed
4. Skip security scans during rapid iteration

---

## Logging & Debugging

### Log Output Location

All validation results logged to: `post-edit-pipeline.log`

**Log Format**:
```
════════════════════════════════════════════════════════════════════════════════
TIMESTAMP: 10/01/2025 10:30
FILE: src/auth.js
LANGUAGE: javascript
STATUS: PASSED

AGENT CONTEXT:
  Memory Key: swarm/coder/auth-module
  Agent Type: coder
  Agent Name: N/A
  Swarm ID: auth-swarm-001

VALIDATION STEPS:
  ✓ Formatting: ✅
  ✓ Linting: ✅
  ✓ Type Check: ✅
  ✓ Dependencies: ✅
  ✓ Security: ✅
  ✓ Tests: ✅

ERRORS (0):

WARNINGS (0):

SUGGESTIONS (1):
  • Consider adding JSDoc comments for public methods

JSON:
{
  "timestamp": "2025-10-01T10:30:00Z",
  "file": "src/auth.js",
  ...
}
════════════════════════════════════════════════════════════════════════════════
```

### Log Management

- **Max Entries**: 500 most recent validations
- **Auto-Cleanup**: Oldest entries removed automatically
- **Format**: Human-readable + JSON for parsing
- **Location**: Project root directory

### Debug Mode

Enable verbose logging:

```bash
DEBUG=1 node src/hooks/enhanced-post-edit-pipeline.js <file-path>

# Outputs:
# 🔍 Detecting language for: src/auth.js
# 🔍 Language detected: javascript
# 🔍 Checking tool availability: prettier
# 🔍 Tool found: /usr/local/bin/prettier
# 🔍 Running formatter: prettier --write src/auth.js
# 🔍 Formatter exit code: 0
```

---

## Migration Guide

### From claude-flow-tdd-hooks.js

The unified pipeline fully replaces the standalone TDD hooks.

**Before** (old approach):
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

**After** (unified pipeline):
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "node src/hooks/enhanced-post-edit-pipeline.js \"$FILE_PATH\" --memory-key \"$MEMORY_KEY\" --minimum-coverage 80 --structured"
      }
    ]
  }
}
```

### Migration Checklist

- [ ] Update `.claude/hooks.json` to use new pipeline path
- [ ] Remove standalone `claude-flow-tdd-hooks.js` if present
- [ ] Update memory key format if needed (should be compatible)
- [ ] Test with existing agent workflows
- [ ] Verify coverage thresholds are still enforced
- [ ] Check that TDD phase detection still works

### Breaking Changes

**None** - The unified pipeline is backward compatible with:
- ✅ All command-line options from TDD hooks
- ✅ Memory key formats
- ✅ Structured JSON output format
- ✅ Agent context tracking

---

## Troubleshooting

### Common Issues

#### 1. "Tool not found" errors

**Problem**: Formatter, linter, or test runner not installed

**Solution**:
```bash
# Check which tools are missing
which prettier eslint jest  # JavaScript
which black flake8 pytest   # Python
which rustfmt clippy        # Rust

# Install missing tools (see Prerequisites section)
```

#### 2. Coverage analysis fails

**Problem**: Coverage tool not configured or not installed

**Solution**:
```bash
# JavaScript
npm install --save-dev jest

# Python
pip install pytest-cov

# Rust
cargo install cargo-tarpaulin
```

#### 3. Tests not found

**Problem**: Test file naming doesn't match conventions

**Solution**: Use standard naming patterns:
- JavaScript: `*.test.js`, `*.spec.js`
- Python: `test_*.py`, `*_test.py`
- Rust: `*_test.rs` in `tests/` directory
- Go: `*_test.go`

#### 4. Pipeline hangs or times out

**Problem**: Test execution taking too long

**Solution**:
```bash
# Use single-file testing mode
# Configure timeout in pipeline-config.json:
{
  "timeouts": {
    "formatting": 5000,
    "linting": 10000,
    "testing": 30000,
    "coverage": 60000
  }
}
```

#### 5. Memory key not stored

**Problem**: `.swarm/` directory doesn't exist

**Solution**:
```bash
# Create swarm memory directory
mkdir -p .swarm
chmod 755 .swarm
```

---

## Best Practices

### For Solo Development
```bash
# Basic validation without TDD enforcement
node src/hooks/enhanced-post-edit-pipeline.js <file> --no-coverage
```

### For TDD Workflows
```bash
# Full TDD with coverage
node src/hooks/enhanced-post-edit-pipeline.js <file> \
  --minimum-coverage 80 \
  --structured
```

### For Agent Coordination
```bash
# Always use memory keys and structured output
node src/hooks/enhanced-post-edit-pipeline.js <file> \
  --memory-key "swarm/[agent]/[step]" \
  --structured
```

### For Rust Projects
```bash
# Enable strict mode for production-quality code
node src/hooks/enhanced-post-edit-pipeline.js <file> \
  --rust-strict \
  --minimum-coverage 85
```

### For CI/CD Integration
```bash
# Strict mode with all checks
node src/hooks/enhanced-post-edit-pipeline.js <file> \
  --rust-strict \
  --minimum-coverage 90 \
  --structured || exit 1
```

---

## FAQ

**Q: Can I use both standard and TDD modes in the same project?**
A: Yes, use different memory keys or configure per-file patterns in hooks.json.

**Q: Does the unified pipeline work with all languages?**
A: Yes, but TDD features require test runner support. Currently supported: JS, TS, Python, Rust, Go, Java, C/C++.

**Q: How do I disable TDD phase detection?**
A: Use `--no-coverage` and `--no-tests` flags.

**Q: Can I customize coverage thresholds per-language?**
A: Yes, configure in `enhanced-pipeline-config.json` under `coverageThresholds`.

**Q: What happens if a tool is missing?**
A: Pipeline gracefully degrades - validation continues with available tools.

**Q: Is the pipeline compatible with existing CI/CD?**
A: Yes, returns exit code 0 (success) or 1 (failure) for script integration.

---

## Related Documentation

- [HOOK-COMPARISON.md](./HOOK-COMPARISON.md) - Comparison with legacy hooks
- [POST-EDIT-PIPELINE-AGENT-INFO.md](./POST-EDIT-PIPELINE-AGENT-INFO.md) - Agent integration details
- [CHANGELOG-POST-EDIT-PIPELINE.md](../CHANGELOG-POST-EDIT-PIPELINE.md) - Version history

---

## Support

For issues or questions:
- GitHub Issues: [claude-flow-novice/issues](https://github.com/your-org/claude-flow-novice/issues)
- Documentation: `/docs` directory
- Examples: `examples/hooks/` directory
