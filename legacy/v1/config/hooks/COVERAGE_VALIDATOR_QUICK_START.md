# Test Coverage Validator - Quick Start Guide

**Priority 3 Hook - Production Ready ✅**

---

## 🚀 Quick Start (30 seconds)

### Run validation on any file:

```bash
node config/hooks/post-test-coverage.js src/your-file.js
```

That's it! The hook will:
1. Find existing coverage data (or run tests)
2. Validate against default thresholds (80% line, 75% branch)
3. Show actionable recommendations

---

## 📊 Default Thresholds

- **Line:** 80%
- **Branch:** 75%
- **Function:** 80%
- **Statement:** 80%

---

## 🎯 Common Use Cases

### 1. Validate After Tests

```bash
# First, run your tests with coverage
npm test -- --coverage

# Then validate any file
node config/hooks/post-test-coverage.js src/auth.js
```

### 2. Custom Thresholds for Critical Files

```bash
node config/hooks/post-test-coverage.js src/security/auth.js \
  --line 90 --branch 85 --function 90 --statement 90
```

### 3. CI/CD Integration (JSON output)

```bash
node config/hooks/post-test-coverage.js src/auth.js --json | jq .valid
# Output: true or false
```

### 4. Per-File Thresholds (Config File)

```bash
# Create config/hooks/coverage.config.json (see example below)
node config/hooks/post-test-coverage.js src/cfn-loop/coordinator.ts \
  --config config/hooks/coverage.config.json
```

---

## 📝 Example Config File

**File:** `config/hooks/coverage.config.json`

```json
{
  "thresholds": {
    "line": 80,
    "branch": 75,
    "function": 80,
    "statement": 80
  },
  "perFileThresholds": {
    "src/critical/.*": { "line": 90, "branch": 85 },
    "src/cfn-loop/.*": { "line": 85, "branch": 80 },
    "src/experimental/.*": { "line": 60, "branch": 50 },
    "tests/.*": { "line": 70, "branch": 65 }
  }
}
```

---

## ✅ Success Output Example

```
============================================================
📊 TEST COVERAGE VALIDATION REPORT
============================================================
File: auth.js
Status: ✅ PASSED
Execution Time: 124ms

📈 COVERAGE METRICS:
  Line:      87.3% ✅ (threshold: 80%)
  Branch:    81.2% ✅ (threshold: 75%)
  Function:  88.0% ✅ (threshold: 80%)
  Statement: 87.3% ✅ (threshold: 80%)
============================================================
```

---

## ❌ Failure Output Example

```
============================================================
📊 TEST COVERAGE VALIDATION REPORT
============================================================
File: auth.js
Status: ❌ FAILED
Execution Time: 156ms

📈 COVERAGE METRICS:
  Line:      65.2% ❌ (threshold: 80%)
  Branch:    50.0% ❌ (threshold: 75%)
  Function:  75.0% ✅ (threshold: 80%)
  Statement: 65.2% ❌ (threshold: 80%)

❌ FAILURES:
  • Line coverage 65.2% < 80%
  • Branch coverage 50.0% < 75%

💡 RECOMMENDATIONS:
  1. [HIGH] Increase line coverage from 65.2% to 80%
     Action: Add tests for uncovered lines 45-52, 67-73
     Gap: 14.8%
  2. [MEDIUM] Increase branch coverage from 50.0% to 75%
     Action: Add tests for uncovered branches: if/else at line 48
     Gap: 25.0%
============================================================
```

---

## 🔧 All CLI Options

```bash
node config/hooks/post-test-coverage.js <file> [options]

Options:
  --line <number>         Line coverage threshold (default: 80)
  --branch <number>       Branch coverage threshold (default: 75)
  --function <number>     Function coverage threshold (default: 80)
  --statement <number>    Statement coverage threshold (default: 80)
  --config <file>         Load thresholds from config file
  --json                  Output results as JSON
  --verbose               Verbose logging
  --help, -h              Show help
```

---

## 🧪 Supported Test Frameworks

- **JavaScript/TypeScript:** Vitest, Jest
- **Python:** Pytest
- **Go:** go test
- **Rust:** cargo tarpaulin

---

## 📦 Supported Coverage Formats

- Istanbul JSON (`coverage/coverage-final.json`)
- Istanbul Summary (`coverage/coverage-summary.json`)
- lcov (`coverage/lcov.info`)
- NYC output (`.nyc_output/coverage-final.json`)

---

## ⚡ Performance

- **With existing coverage:** 50-150ms
- **With test execution:** 2-5s (depends on test suite size)

---

## 🚨 Important Notes

1. **Non-Blocking:** Always exits with code 0 (never blocks operations)
2. **Run Tests First:** For best results, run `npm test -- --coverage` before validation
3. **Per-File Thresholds:** Different file types can have different requirements
4. **Actionable Output:** Recommendations include specific line/branch gaps

---

## 📚 Full Documentation

See `config/hooks/POST_TEST_COVERAGE_README.md` for:
- Architecture details
- Integration examples
- Troubleshooting guide
- Advanced configuration

---

## 🤝 Need Help?

```bash
# Show help
node config/hooks/post-test-coverage.js --help

# Verbose output for debugging
node config/hooks/post-test-coverage.js src/file.js --verbose
```

---

**Version:** 1.0.0
**Status:** Production Ready ✅
**Updated:** 2025-10-11
