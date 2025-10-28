# Codebase Complexity Analysis Report

**Generated:** 2025-10-26
**Analyzer:** Lizard v1.18.0
**Threshold:** CCN ≥20 (High Complexity)
**Files Analyzed:** 27 files (src/agents, src/cfn-loop, .claude/skills/cfn-loop-orchestration)

---

## Executive Summary

**Total Metrics:**
- **Lines of Code (NLOC):** 4,403
- **Functions Analyzed:** 283
- **Average Complexity:** 2.1 (Low - Excellent)
- **High Complexity Functions:** 2 (0.7% of total)

**Overall Health:** ✅ Excellent (99.3% of functions below complexity threshold)

---

## Critical Findings

### 🔴 Critical: orchestrate.sh Main Loop (Not Detected by Lizard)

**⚠️ IMPORTANT DISCREPANCY FOUND**

#### **Main Script Body** in `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
- **Complexity (simple-complexity.sh):** 74 (CRITICAL)
- **Complexity (Lizard):** Not measured (main body not in a function)
- **Lines:** 701-835 (main iteration loop)
- **Issue:** Lizard only analyzes functions, missed the main script complexity

**Why This Matters:**
- Our simple-complexity.sh tool measures **entire script** complexity
- Lizard only measures **functions** (found only 4 functions, avg CCN 5.8)
- The most complex part (main loop) is NOT in a function
- **This is the #1 refactoring priority for the entire codebase**

**Immediate Action Required:**
```bash
npx claude-flow-novice agent cyclomatic-complexity-reducer \
  --prompt "Reduce orchestrate.sh main loop complexity from 74 to <20 by extracting helpers"
```

**Refactoring Strategy:**
1. Extract argument parsing → `helpers/argument-parser.sh` (complexity ~8)
2. Extract agent spawning → `helpers/agent-spawner.sh` (complexity ~6)
3. Extract waiting logic → `helpers/parallel-wait.sh` (complexity ~6)
4. Extract validation → `helpers/validation-checker.sh` (complexity ~10)
5. Extract context building → `helpers/context-builder.sh` (complexity ~5)
6. Extract iteration management → `helpers/iteration-manager.sh` (complexity ~7)

**Expected Result:**
- Main script complexity: 74 → 15-20
- Total distributed: ~60 (across 6 testable, reusable helpers)
- Per-file complexity: All <15

**See:** `readme/cfn-loop-flow-diagram.md` for ideal low-complexity structure

---

### 🔴 High Complexity Functions (CCN ≥20)

#### 1. **step@19-40** in `src/agents/agent-loader.js`
- **Complexity:** 34 (Very High)
- **Lines:** 22
- **Tokens:** 507
- **Location:** Lines 19-40

**Issue:** TypeScript generator/async helper function with excessive branching

**Recommendation:**
- Extract to separate utility module
- Break into smaller helper functions
- Consider using modern async/await patterns instead of generators
- Target complexity: <15

**Suggested Refactoring:**
```javascript
// Extract promise handling logic
function handlePromiseResult(result) {
  if (result.done) return result.value;
  return Promise.resolve(result.value).then(fulfilled, rejected);
}

// Simplify step function
function step(result) {
  return handlePromiseResult(result);
}
```

---

#### 2. **constructor@177-235** in `src/cfn-loop/cfn-loop-orchestrator.ts`
- **Complexity:** 22 (High)
- **Lines:** 47
- **Tokens:** 373
- **Location:** Lines 177-235

**Issue:** Constructor with excessive initialization logic and branching

**Recommendation:**
- Extract initialization to separate methods
- Use builder pattern or factory method
- Reduce conditional logic in constructor
- Target complexity: <10

**Suggested Refactoring:**
```typescript
class CFNLoopOrchestrator {
  constructor(config: CFNLoopConfig) {
    this.validateConfig(config);
    this.initializeMode(config.mode);
    this.setupConsensus(config);
    this.initializeCircuitBreaker(config);
  }

  private validateConfig(config: CFNLoopConfig) { /* ... */ }
  private initializeMode(mode: string) { /* ... */ }
  private setupConsensus(config: CFNLoopConfig) { /* ... */ }
  private initializeCircuitBreaker(config: CFNLoopConfig) { /* ... */ }
}
```

---

## Moderate Complexity Functions (CCN 10-19)

### Functions Approaching Threshold

These functions should be monitored and considered for refactoring:

#### TypeScript/JavaScript

| File | Function | Complexity | Lines | Recommendation |
|------|----------|------------|-------|----------------|
| `src/cfn-loop/types.ts` | `isValidValidatorVote` | 11 | 18 | Extract validation rules |
| `src/cfn-loop/feedback-injection-system.ts` | `generateActionableSteps` | 9 | 42 | Break into smaller helpers |
| `src/cfn-loop/consensus/enterprise-planning-consensus.ts` | Multiple functions | 7-9 | Varies | Consider simplification |

#### Bash Scripts

| File | Function | Complexity | Lines | Recommendation |
|------|----------|------------|-------|----------------|
| `.claude/skills/cfn-loop-orchestration/orchestrate.sh` | `wait_for_agents` | 13 | 154 | Extract to parallel-wait.sh helper |
| `.claude/skills/cfn-loop-orchestration/orchestrate.sh` | `build_agent_context` | 7 | 17 | Extract context injection logic |

---

## Refactoring Recommendations by Priority

### Priority 0: CRITICAL - Bash Script Main Body (Missed by Lizard)

**0. .claude/skills/cfn-loop-orchestration/orchestrate.sh - Main Loop**
- **Complexity:** 74 → Target: <20
- **Action:** Extract to modular helper scripts
- **Why Urgent:** This is the CFN Loop execution engine used by all coordinators
- **Command:**
```bash
npx claude-flow-novice agent cyclomatic-complexity-reducer \
  --prompt "Reduce orchestrate.sh from complexity 74 to <20 by extracting 6 helper scripts"
```

**Impact:**
- ✅ Testable helpers (each <15 complexity)
- ✅ Reusable across coordinators
- ✅ Easier debugging and maintenance
- ✅ Better error isolation

---

### Priority 1: Critical (Immediate Action Required)

**1. src/agents/agent-loader.js - step() function**
- **Complexity:** 34 → Target: <15
- **Action:** Spawn `cyclomatic-complexity-reducer` agent
- **Command:**
```bash
npx claude-flow-novice agent cyclomatic-complexity-reducer \
  --prompt "Reduce complexity in src/agents/agent-loader.js step() function from 34 to <15"
```

**2. src/cfn-loop/cfn-loop-orchestrator.ts - constructor()**
- **Complexity:** 22 → Target: <10
- **Action:** Refactor using builder pattern
- **Command:**
```bash
npx claude-flow-novice agent cyclomatic-complexity-reducer \
  --prompt "Refactor CFNLoopOrchestrator constructor from complexity 22 to <10 using builder pattern"
```

---

### Priority 2: Moderate (Recommended)

**3. orchestrate.sh - wait_for_agents()**
- **Complexity:** 13 → Target: <10
- **Action:** Extract to `helpers/parallel-wait.sh`
- **Benefit:** Reusable across coordinators

**4. feedback-injection-system.ts - generateActionableSteps()**
- **Complexity:** 9 → Target: <7
- **Action:** Extract step generation logic
- **Benefit:** Improved testability

---

### Priority 3: Monitoring (Watch for Growth)

Functions currently acceptable but should be monitored:

- `isValidValidatorVote()` (CCN: 11)
- `identifyFailedCriteria()` (CCN: 6)
- `formatForInjection()` (CCN: 9)

**Action:** Set up automated monitoring with post-edit hooks (already configured)

---

## File-Level Complexity Analysis

### Excellent (Avg CCN <3)

Most files in the codebase have excellent complexity metrics:

| File | Avg CCN | Functions | Status |
|------|---------|-----------|--------|
| `src/agents/agent-loader.ts` | 1.4 | 25 | ✅ Excellent |
| `src/agents/lifecycle-manager.ts` | 1.3 | 22 | ✅ Excellent |
| `src/cfn-loop/consensus/mvp-consensus.ts` | 1.4 | 7 | ✅ Excellent |
| `src/cfn-loop/modes/index.ts` | 3.0 | 3 | ✅ Good |
| `src/cfn-loop/byzantine-consensus-adapter.ts` | 2.5 | 8 | ✅ Good |

### Needs Attention (Avg CCN >3)

| File | Avg CCN | Functions | Primary Issue |
|------|---------|-----------|---------------|
| `src/cfn-loop/types.ts` | 6.5 | 2 | Validation logic complexity |
| `src/cfn-loop/consensus/enterprise-planning-consensus.ts` | 4.2 | 4 | Business rule complexity |
| `src/cfn-loop/circuit-breaker.ts` | 2.4 | 5 | Acceptable (state management) |

---

## Automated Prevention Measures

### Post-Edit Hook Configuration ✅ ACTIVE

Complexity checks now run automatically:

**Thresholds:**
- Warning (CCN 30-39): Exit code 8
- Critical (CCN ≥40): Exit code 7, triggers Lizard analysis

**Files Monitored:**
- All `.js`, `.ts`, `.sh`, `.py` files >200 lines

**Integration:**
```bash
# Runs automatically on save via .claude/hooks/cfn-invoke-post-edit.sh
# Manual check:
./tools/simple-complexity.sh <file>
lizard <file> --CCN 30
```

---

## Long-Term Maintenance Strategy

### 1. Continuous Monitoring

**Weekly:** Review complexity reports from GitHub Actions
```bash
# Trigger manual analysis
gh workflow run complexity-report.yml
```

**Monthly:** Full codebase scan
```bash
lizard src/ .claude/skills/ --exclude "*/node_modules/*" --csv > reports/complexity-$(date +%Y%m).csv
```

### 2. Refactoring Budget

**Recommended allocation:**
- 10% of sprint time for technical debt
- Focus on functions with CCN >15
- Prioritize frequently modified files

### 3. Code Review Guidelines

**Merge Criteria:**
- No new functions with CCN >20
- Existing high-complexity functions must have refactoring plan
- All complexity warnings addressed or justified

### 4. Documentation

**Update these files after refactoring:**
- `docs/COMPLEXITY_ANALYSIS_OVERHEAD.md`
- `readme/cfn-loop-flow-diagram.md` (architectural changes)
- Agent documentation (if behavior changes)

---

## Tools Reference

### Quick Analysis

```bash
# Single file
./tools/simple-complexity.sh path/to/file.sh

# Function-level breakdown
./tools/calculate-complexity.sh path/to/file.sh

# Multi-language professional analysis
lizard path/to/file.ts --CCN 30
```

### Batch Analysis

```bash
# All TypeScript files
lizard src/ -l typescript --CCN 20

# All bash scripts
find .claude/skills -name "*.sh" -exec ./tools/simple-complexity.sh {} \;

# Generate CSV report
lizard src/ .claude/skills/ --csv > complexity-report.csv
```

### Automated Refactoring

```bash
# Spawn complexity reducer agent
npx claude-flow-novice agent cyclomatic-complexity-reducer \
  --prompt "Reduce complexity in <file> from <current> to <target>"
```

---

## Conclusion

**Overall Assessment:** ⚠️ **Good with Critical Exception**

The codebase demonstrates excellent complexity management for TypeScript/JavaScript:
- 99.3% of **functions** below complexity threshold
- Average function complexity of 2.1 (excellent)
- Automated prevention measures in place

**However:** Bash scripts are NOT fully measured by Lizard
- **orchestrate.sh main loop:** 74 complexity (CRITICAL - not in a function)
- Lizard only found 4 functions (avg 5.8), missed the main script body
- This is the most complex component in the entire codebase

**Immediate Actions (Prioritized):**
1. **🔴 CRITICAL:** Refactor orchestrate.sh main loop (CCN: 74 → <20)
2. Refactor `step()` in agent-loader.js (CCN: 34 → <15)
3. Refactor `constructor()` in cfn-loop-orchestrator.ts (CCN: 22 → <10)
4. Monitor moderate complexity functions (CCN 10-19)

**Prevention:**
- Post-edit hooks active (30/40 thresholds)
- Lizard auto-installed with npm package
- GitHub Actions workflow available for manual triggers
- cyclomatic-complexity-reducer agent ready for automated refactoring

**Next Review:** 2025-11-26 (30 days)

---

## Appendix: Full Lizard Output

<details>
<summary>Complete Analysis Results (283 functions)</summary>

```
[Full lizard output truncated for brevity - see /tmp/complexity-report.txt for complete results]

Key Statistics:
- Total NLOC: 4,403
- Total Functions: 283
- Average CCN: 2.1
- Warning Count: 2
- Function Warning Rate: 0.01 (1%)
- NLOC Warning Rate: 0.04 (4%)
```

</details>

---

**Report Generated By:** Claude Flow Novice Complexity Analysis System
**Next Steps:** Use `/cfn:cfn-loop-document` to update documentation after refactoring
