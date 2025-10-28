# Complexity Analysis Integration - Summary

## ✅ Installation Complete

**Lizard installed successfully:**
- Version: 1.18.0
- Location: `~/.local/bin/lizard`
- Dependencies: pathspec-0.12.1

**To use in your shell, add to `~/.bashrc` or `~/.zshrc`:**
```bash
export PATH="$HOME/.local/bin:$PATH"
```

---

## 📊 What Was Added

### 1. Simple Complexity Checker (Bash-native)

**File:** `tools/simple-complexity.sh`

**Usage:**
```bash
./tools/simple-complexity.sh path/to/script.sh
```

**Output:**
```
Cyclomatic Complexity Analysis: orchestrate.sh
==================================================
Decision Points:
  if/elif:        43
  loops:          13
  case:           3
  &&/||:          28
  functions:      8

Total Complexity: 74

Rating: Very Complex (refactor required)
==================================================
```

**Performance:** ~23ms per file

---

### 2. Post-Edit Pipeline Integration

**File:** `config/hooks/post-edit-pipeline.js`

**Added Phase 5.1:** Cyclomatic Complexity Analysis

**Logic:**
```javascript
if (lines > 200 && ext.match(/\.(sh|js|ts|jsx|tsx|py)$/)) {
  // Run simple-complexity.sh for bash
  // Run lizard for JS/TS

  if (complexity >= 30 && complexity < 40) {
    // ⚠️ Warning
  }

  if (complexity >= 40) {
    // 🔴 Critical - invoke lizard for detailed analysis
  }
}
```

**Triggers:**
- Files >200 lines
- Bash, JS, TS, JSX, TSX, Python
- Automatic on every save

---

### 3. Complexity Reducer Agent

**File:** `.claude/agents/cfn-dev-team/quality/cyclomatic-complexity-reducer.md`

**Usage:**
```bash
npx claude-flow-novice agent cyclomatic-complexity-reducer \
  --prompt "Reduce complexity in orchestrate.sh from 74 to <20"
```

**What it does:**
- Analyzes complexity hotspots
- Extracts helper functions
- Simplifies conditionals
- Validates refactoring

---

### 4. GitHub Actions Workflow

**File:** `.github/workflows/complexity-report.yml`

**Runs:**
- On every PR
- Weekly (Sunday midnight)

**Actions:**
- Analyze all code files
- Flag functions with complexity >40
- Post report as PR comment
- Fail if critical complexity found

---

### 5. Documentation

**Created:**
- `docs/COMPLEXITY_ANALYSIS_OVERHEAD.md` - Performance benchmarks
- `docs/POST_EDIT_COMPLEXITY_CHECKS.md` - Feature documentation
- `docs/COMPLEXITY_INTEGRATION_SUMMARY.md` - This file

**Updated:**
- `readme/cfn-loop-flow-diagram.md` - Added ideal low-complexity structure diagram

---

## 🎯 How It Works Now

### Scenario 1: Edit Small File (<200 lines)

```bash
# Save file.sh (150 lines)
# Post-edit hook runs
# Complexity check: SKIPPED (too small)
# Overhead: 0ms
```

### Scenario 2: Edit Medium File (200-500 lines, complexity <30)

```bash
# Save helper.sh (350 lines, complexity 22)
# Post-edit hook runs
# Complexity check: PASSED ✅
# Overhead: ~23ms
```

**Output:**
```json
{
  "status": "SUCCESS",
  "metrics": {
    "cyclomaticComplexity": 22
  }
}
```

### Scenario 3: Edit File with Warning (complexity 30-39)

```bash
# Save validator.sh (450 lines, complexity 35)
# Post-edit hook runs
# Complexity check: WARNING ⚠️
# Overhead: ~23ms
```

**Output:**
```json
{
  "status": "COMPLEXITY_WARNING",
  "metrics": {
    "cyclomaticComplexity": 35
  },
  "recommendations": [
    {
      "type": "complexity",
      "priority": "medium",
      "message": "Cyclomatic complexity is 35 (threshold: 30)",
      "action": "Consider refactoring to reduce complexity"
    }
  ]
}
```

**Exit Code:** 8

### Scenario 4: Edit File with Critical Complexity (≥40)

```bash
# Save orchestrate.sh (841 lines, complexity 74)
# Post-edit hook runs
# Complexity check: CRITICAL 🔴
# Invokes lizard for detailed analysis
# Overhead: ~73ms (23ms + 50ms lizard)
```

**Output:**
```json
{
  "status": "COMPLEXITY_CRITICAL",
  "metrics": {
    "cyclomaticComplexity": 74
  },
  "complexityAnalysis": {
    "tool": "lizard",
    "complexity": 74,
    "detailedReport": "================================================\n  NLOC    CCN   token  PARAM  length  location  \n------------------------------------------------\n      17      7    125      0      25 build_agent_context@319-343@orchestrate.sh\n     154     13    450      0     187 wait_for_agents@396-582@orchestrate.sh\n..."
  },
  "recommendations": [
    {
      "type": "complexity",
      "priority": "critical",
      "message": "Critical complexity level: 74 (threshold: 40)",
      "action": "Refactor immediately. Run cyclomatic-complexity-reducer agent",
      "details": "... per-function lizard report ..."
    }
  ]
}
```

**Exit Code:** 7

**Lizard Breakdown:**
```
NLOC    CCN   token  PARAM  length  location
------------------------------------------------
17      7     125    0      25      build_agent_context@319-343
154     13    450    0      187     wait_for_agents@396-582
25      2     103    0      32      spawn_product_owner@629-660
27      1     91     0      30      output_result@662-691

Avg Complexity: 5.8 per function
Most Complex: wait_for_agents (CCN: 13)
```

---

## 📈 Test Results

**Tested on `orchestrate.sh`:**

**Simple Complexity Check:**
- Complexity: 74
- Decision points: 43 if/elif, 13 loops, 3 case, 28 &&/||
- Time: 23ms

**Lizard Analysis:**
- 4 functions detected
- Average complexity: 5.8 per function
- Highest: `wait_for_agents` (CCN: 13, NLOC: 154)
- Time: 50ms

**Total overhead:** 73ms for critical complexity file

---

## 🔧 Configuration

### Disable Complexity Checks

Edit `.claude/hooks/post-edit.config.json`:
```json
{
  "complexityChecks": {
    "enabled": false
  }
}
```

### Adjust Thresholds

Edit `config/hooks/post-edit-pipeline.js`:
```javascript
// Line 359: Warning threshold (default: 30)
if (complexity >= 30 && complexity < 40) {

// Line 374: Critical threshold (default: 40)
if (complexity >= 40) {
```

### Change Minimum File Size

```javascript
// Line 336: Minimum lines (default: 200)
if (lines > 200 && ext.match(/\.(sh|js|ts|jsx|tsx|py)$/)) {
```

---

## 🚀 Usage Examples

### Manual Analysis

```bash
# Single file (bash)
./tools/simple-complexity.sh orchestrate.sh

# Single file (any language)
lizard orchestrate.sh

# Show only complex functions (>15)
lizard -C 15 orchestrate.sh

# Entire project
lizard src/ .claude/skills/ --exclude "*/node_modules/*"

# JSON output
lizard src/ --json > complexity.json
```

### Automated Analysis

**On every file save:** Automatic via post-edit hook

**On PR:** GitHub Actions workflow runs

**Weekly report:** Sunday midnight via cron

### Refactoring

```bash
# Spawn complexity reducer agent
npx claude-flow-novice agent cyclomatic-complexity-reducer \
  --prompt "Reduce complexity in orchestrate.sh from 74 to <20"
```

---

## 📊 Exit Codes Reference

| Code | Status | Meaning |
|------|--------|---------|
| 0 | SUCCESS | No issues |
| 7 | COMPLEXITY_CRITICAL | Complexity ≥40 |
| 8 | COMPLEXITY_WARNING | Complexity 30-39 |

---

## 🎯 Next Steps

1. **Monitor warnings:** Check `.artifacts/logs/post-edit-pipeline.log`
2. **Refactor critical files:** Use complexity-reducer agent
3. **Track trends:** Review weekly GitHub Actions reports
4. **Adjust thresholds:** Fine-tune based on your codebase

---

## 📚 Related Files

**Tools:**
- `tools/simple-complexity.sh` - Fast bash checker
- `tools/install-lizard.sh` - Lizard installer

**Agents:**
- `.claude/agents/cfn-dev-team/quality/cyclomatic-complexity-reducer.md`

**Workflows:**
- `.github/workflows/complexity-report.yml`

**Documentation:**
- `docs/COMPLEXITY_ANALYSIS_OVERHEAD.md`
- `docs/POST_EDIT_COMPLEXITY_CHECKS.md`
- `readme/cfn-loop-flow-diagram.md`

---

## ✅ Summary

**What you now have:**
- ✅ Automatic complexity analysis on every save
- ✅ Two-tier warnings (30 and 40 thresholds)
- ✅ Detailed lizard analysis for critical cases
- ✅ Minimal overhead (~23ms for most files)
- ✅ Dedicated refactoring agent
- ✅ CI/CD integration via GitHub Actions
- ✅ Comprehensive documentation

**Prevention of "orchestrate.sh" situations:**
- Early detection prevents complexity accumulation
- Automated warnings force complexity awareness
- Detailed analysis guides refactoring
- Agent automation makes refactoring easier
