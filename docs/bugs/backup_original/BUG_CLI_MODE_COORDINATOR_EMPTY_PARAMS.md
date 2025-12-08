# BUG: CLI Mode Coordinator Passes Empty Parameters to Orchestrator

**Status:** 🔴 ACTIVE (Blocking CLI mode production use)
**Date Reported:** 2025-11-18
**Severity:** P0 - Critical (Blocks CFN Loop execution)
**Component:** CLI Mode Coordinator → Orchestrator Integration
**Related:** docs/CLI_MODE_DASHBOARD_TEST_FEEDBACK.md

---

## Executive Summary

CLI mode coordinators (LLM agents) sometimes pass empty strings for `--loop3-agents`, `--loop2-agents`, or `--product-owner` parameters when invoking the orchestrator script. The orchestrator correctly rejects these with "Error: --loop3-agents value cannot be empty" (validation working as intended), but this prevents full CFN Loop execution.

**Impact:** CLI mode can spawn coordinators and create partial deliverables but cannot complete full CFN Loop cycles.

---

## Problem Description

### Observed Behavior

When users execute `/cfn-loop-cli "task description"`:

1. ✅ Main Chat spawns cfn-v3-coordinator successfully
2. ✅ Coordinator analyzes task and selects agents
3. ❌ **Coordinator passes empty parameters to orchestrator**
4. ❌ Orchestrator rejects with: `Error: --loop3-agents value cannot be empty`
5. ⚠️ Coordinator falls back to direct `cfn-spawn` calls
6. ⚠️ Spawned agents don't complete work (separate issue)
7. ❌ No Loop 2 validation, no Product Owner decision

**Result:** Partial mockups created, no backend implementation, no quality validation.

### Error Message

```bash
[tool-executor] ✗ Tool execution failed: Error: Command failed:
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode "standard" \
  --loop3-agents "$LOOP3_AGENTS" \
  --loop2-agents "$LOOP2_AGENTS" \
  --product-owner "$PRODUCT_OWNER" \
  --max-iterations 10 \
  --success-criteria "enabled"

Error: --loop3-agents value cannot be empty
```

---

## Root Cause Analysis

### What's Working

**Orchestrator Validation** (✅ Working Correctly):
- Lines 160-163, 173-176, 186-189 in `orchestrate.sh`
- Properly validates empty strings with `[[ -z "$2" ]]`
- Returns clear error messages
- Test coverage: 13/13 tests passing
- **This is NOT the bug - validation is working as designed**

### What's Failing

**Coordinator Agent Selection** (❌ Issue Here):

The cfn-v3-coordinator is an LLM agent (not a script) that needs to:
1. Analyze task description
2. Determine appropriate agents for Loop 3, Loop 2, and Product Owner
3. Pass these as comma-separated strings to orchestrator

**The Problem:** When the coordinator LLM agent executes bash commands to invoke the orchestrator, it sometimes:
- Fails to properly construct agent list variables
- Passes empty strings when variable expansion fails
- Doesn't validate parameters before invoking orchestrator

### Example Failure Pattern

**Coordinator's Intent:**
```bash
LOOP3_AGENTS="backend-developer,react-frontend-engineer,data-engineer"
LOOP2_AGENTS="code-reviewer,security-specialist,integration-tester"
PRODUCT_OWNER="product-owner"

./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --loop3-agents "$LOOP3_AGENTS" \
  --loop2-agents "$LOOP2_AGENTS" \
  --product-owner "$PRODUCT_OWNER"
```

**What Actually Happens:**
```bash
# Variable assignment fails or produces empty string
LOOP3_AGENTS=""

# Orchestrator called with empty parameter
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --loop3-agents "" \
  --loop2-agents "$LOOP2_AGENTS" \
  --product-owner "$PRODUCT_OWNER"

# Result: Error: --loop3-agents value cannot be empty
```

---

## Contributing Factors

### 1. LLM Agent Variable Handling

**Issue:** LLM agents executing bash commands may not properly:
- Initialize variables before use
- Validate variable contents before parameter passing
- Handle agent selection failures gracefully

**Example:** If agent selection script fails:
```bash
SELECTED_AGENTS=$(bash .claude/skills/cfn-agent-selector/select-agents.sh --task-type "$TASK_TYPE" 2>/dev/null || echo "")

# If script fails, SELECTED_AGENTS=""
# Subsequent jq parsing produces empty LOOP3_AGENTS
LOOP3_AGENTS=$(echo "$SELECTED_AGENTS" | jq -r '.loop3 // empty | join(",")')
# Result: LOOP3_AGENTS=""
```

### 2. Missing Fallback Enforcement

**Coordinator has hardcoded fallbacks** (lines 823-825 in cfn-v3-coordinator.md):
```bash
LOOP3_AGENTS="terraform-engineer,devops-engineer"  # Infrastructure default
LOOP2_AGENTS="security-auditor,compliance-checker,cost-optimizer"  # Validation default
PRODUCT_OWNER="product-owner"
```

**But LLM execution may not:**
- Execute these initialization lines
- Use fallbacks when dynamic selection fails
- Validate parameters before invoking orchestrator

### 3. No Pre-Invocation Validation

Coordinator doesn't validate parameters before calling orchestrator:

**Missing Check:**
```bash
# Should happen BEFORE orchestrator invocation
if [[ -z "$LOOP3_AGENTS" ]] || [[ -z "$LOOP2_AGENTS" ]] || [[ -z "$PRODUCT_OWNER" ]]; then
  echo "ERROR: Agent parameters cannot be empty"
  echo "LOOP3_AGENTS='$LOOP3_AGENTS'"
  echo "LOOP2_AGENTS='$LOOP2_AGENTS'"
  echo "PRODUCT_OWNER='$PRODUCT_OWNER'"
  exit 1
fi
```

---

## Evidence

### CLI Mode Dashboard Test (2025-11-18)

**Test:** Create comprehensive dashboard with Express.js backend, SQLite integration, Chart.js frontend

**Result:**
- Three coordinator spawns: `cfn-cli-095578-2839`, `cfn-cli-621962-26773`, `cfn-cli-934309-15726`
- All three hit orchestrator parameter validation errors
- All three fell back to direct `cfn-spawn` calls
- Partial deliverables created (HTML mockup, data-generator.js)
- No backend implementation, no SQLite integration, no quality validation

**Files:**
- Feedback document: `docs/CLI_MODE_DASHBOARD_TEST_FEEDBACK.md`
- Deliverables: `dashboard/index.html` (44KB mockup)
- Missing: `dashboard/server/index.js`, `package.json`, backend code

---

## Impact Assessment

### Immediate Impact (Current State)

- ❌ **CLI mode cannot execute full CFN Loop workflows**
- ⚠️ **Coordinators spawn but orchestrator fails**
- ⚠️ **Fallback to direct spawning produces incomplete deliverables**
- ❌ **No Loop 2 validation or Product Owner decisions**
- 📉 **Confidence degradation:** From 0.90 expected to 0.30 actual

### User Experience

**Expected:**
```
/cfn-loop-cli "Create dashboard" → Coordinator → Orchestrator → Loop 3 → Tests → Gate → Loop 2 → Consensus → Product Owner → Complete dashboard
```

**Actual:**
```
/cfn-loop-cli "Create dashboard" → Coordinator → Orchestrator FAILS → Direct cfn-spawn → Incomplete mockup → No validation → Partial success
```

### Business Impact

- **Development:** CLI mode unsuitable for production use (MVP/Standard/Enterprise)
- **Quality:** No validation gates applied to deliverables
- **Confidence:** Users get partial results with no quality assurance
- **Cost:** Wasted API calls on incomplete workflows

---

## Related Issues

### Issue 1: Redis Authentication (Secondary)

**Problem:** Redis NOAUTH errors when storing success criteria

**Impact:** Even if orchestrator executes, test-driven validation fails

**Status:** Separate issue tracked under todo item #2

### Issue 2: Agent Completion Tracking (Secondary)

**Problem:** Spawned agents don't report completion

**Impact:** Even direct `cfn-spawn` fallback doesn't work reliably

**Status:** Separate issue tracked under todo item #3

---

## Solution Options

### Option 1: Enforce Hardcoded Fallbacks (Quick Fix)

**Approach:** Update coordinator agent profile with strict initialization and validation

**Implementation:**
```markdown
## Step 2: Initialize Agent Lists (REQUIRED - NEVER SKIP)

```bash
# MANDATORY: Initialize with fallbacks BEFORE dynamic selection
LOOP3_AGENTS="backend-developer,frontend-developer"
LOOP2_AGENTS="code-reviewer,security-specialist,tester"
PRODUCT_OWNER="product-owner"

# THEN attempt dynamic selection (overrides fallbacks if successful)
if [[ -f ".claude/skills/cfn-agent-selector/select-agents.sh" ]]; then
  SELECTED=$(bash .claude/skills/cfn-agent-selector/select-agents.sh --task-type "$TASK_TYPE" 2>/dev/null || echo "")
  if [[ -n "$SELECTED" ]]; then
    PARSED=$(echo "$SELECTED" | jq -r '.loop3 // empty | join(",")')
    [[ -n "$PARSED" ]] && LOOP3_AGENTS="$PARSED"

    PARSED=$(echo "$SELECTED" | jq -r '.loop2 // empty | join(",")')
    [[ -n "$PARSED" ]] && LOOP2_AGENTS="$PARSED"
  fi
fi

# MANDATORY: Validate before orchestrator invocation
if [[ -z "$LOOP3_AGENTS" ]] || [[ -z "$LOOP2_AGENTS" ]] || [[ -z "$PRODUCT_OWNER" ]]; then
  echo "❌ FATAL: Agent parameters cannot be empty"
  echo "LOOP3_AGENTS='$LOOP3_AGENTS'"
  echo "LOOP2_AGENTS='$LOOP2_AGENTS'"
  echo "PRODUCT_OWNER='$PRODUCT_OWNER'"
  exit 1
fi
```
```

**Pros:**
- ✅ Quick to implement (agent profile update)
- ✅ Ensures fallbacks always used
- ✅ Clear validation before orchestrator call
- ✅ No code changes required

**Cons:**
- ⚠️ Relies on LLM agent following instructions
- ⚠️ Doesn't fix underlying variable handling issues

**Estimated Effort:** 1 hour
**Risk:** Low

### Option 2: Wrapper Script for Orchestrator (Medium Fix)

**Approach:** Create `orchestrate-wrapper.sh` that validates parameters and applies fallbacks

**Implementation:**
```bash
#!/bin/bash
# .claude/skills/cfn-loop-orchestration/orchestrate-wrapper.sh

set -euo pipefail

# Apply fallbacks if parameters empty
[[ -z "${LOOP3_AGENTS:-}" ]] && LOOP3_AGENTS="backend-developer,frontend-developer"
[[ -z "${LOOP2_AGENTS:-}" ]] && LOOP2_AGENTS="code-reviewer,tester"
[[ -z "${PRODUCT_OWNER:-}" ]] && PRODUCT_OWNER="product-owner"

# Log what we're using
echo "📋 Agent Configuration:"
echo "  Loop 3: $LOOP3_AGENTS"
echo "  Loop 2: $LOOP2_AGENTS"
echo "  Product Owner: $PRODUCT_OWNER"

# Invoke orchestrator with validated parameters
exec ./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  "$@" \
  --loop3-agents "$LOOP3_AGENTS" \
  --loop2-agents "$LOOP2_AGENTS" \
  --product-owner "$PRODUCT_OWNER"
```

**Coordinators would call:**
```bash
./.claude/skills/cfn-loop-orchestration/orchestrate-wrapper.sh \
  --task-id "$TASK_ID" \
  --mode "standard" \
  --max-iterations 10
```

**Pros:**
- ✅ Guarantees parameters never empty
- ✅ Centralized fallback logic
- ✅ Works regardless of coordinator behavior
- ✅ Easy to test

**Cons:**
- ⚠️ Another layer of indirection
- ⚠️ Coordinators need to use wrapper, not direct orchestrator

**Estimated Effort:** 2 hours
**Risk:** Low

### Option 3: Skill-Based Agent Selection (Robust Fix)

**Approach:** Create `.claude/skills/cfn-agent-selection-with-fallback/` skill

**Features:**
- Task analysis
- Dynamic agent selection
- Hardcoded fallbacks
- Parameter validation
- Returns validated agent lists guaranteed non-empty

**Usage:**
```bash
AGENT_CONFIG=$(./.claude/skills/cfn-agent-selection-with-fallback/select.sh \
  --task-description "$TASK_DESCRIPTION" \
  --mode "$MODE")

LOOP3_AGENTS=$(echo "$AGENT_CONFIG" | jq -r '.loop3')
LOOP2_AGENTS=$(echo "$AGENT_CONFIG" | jq -r '.loop2')
PRODUCT_OWNER=$(echo "$AGENT_CONFIG" | jq -r '.product_owner')

# Guaranteed to be non-empty at this point
```

**Pros:**
- ✅ Robust, testable, reusable
- ✅ Centralizes agent selection logic
- ✅ Easy to extend with new selection strategies
- ✅ Clear error handling

**Cons:**
- ⚠️ More work to implement
- ⚠️ Coordinators need to use skill correctly

**Estimated Effort:** 4 hours
**Risk:** Low-Medium

---

## Recommended Solution

**Phase 1 (Immediate - Option 1):**
- Update cfn-v3-coordinator.md with strict initialization and validation
- Add explicit validation before orchestrator invocation
- Document the requirement in coordinator profile

**Phase 2 (Short-term - Option 2):**
- Create orchestrate-wrapper.sh with fallback enforcement
- Update coordinator to use wrapper
- Add integration test for coordinator → wrapper → orchestrator flow

**Phase 3 (Medium-term - Option 3):**
- Build cfn-agent-selection-with-fallback skill
- Migrate coordinators to use skill
- Deprecate inline agent selection logic

---

## Testing Strategy

### Unit Tests

**Test 1: Coordinator Parameter Validation**
```bash
# Verify coordinator validates before orchestrator call
# Should fail with clear error, not silent failure
```

**Test 2: Orchestrator Wrapper Fallbacks**
```bash
# Call wrapper with empty params
# Should apply fallbacks and succeed
```

### Integration Tests

**Test 3: Full CLI Mode Workflow**
```bash
# Execute /cfn-loop-cli with simple task
# Verify:
#   - Coordinator spawns
#   - Orchestrator executes (no param errors)
#   - Loop 3 agents spawn
#   - Tests run
#   - Gate check passes/fails appropriately
#   - Loop 2 validators spawn (if gate passes)
#   - Product Owner spawns
#   - Decision recorded
```

**Test 4: Fallback Agent Selection**
```bash
# Execute with task that has no obvious agent match
# Verify fallback agents used
# Verify orchestrator accepts parameters
```

---

## Success Criteria

**Fix Verified When:**

1. ✅ CLI mode dashboard test completes with full backend implementation
2. ✅ No "value cannot be empty" orchestrator errors in logs
3. ✅ Loop 2 validation executes
4. ✅ Product Owner decision recorded
5. ✅ Deliverables include backend code, not just HTML mockups
6. ✅ Integration test passes 3+ consecutive runs

---

## Related Documentation

- **Orchestrator Validation:** `docs/bugs/BUG_ORCHESTRATOR_EMPTY_PARAM_VALIDATION.md` (Fixed, working correctly)
- **CLI Mode Feedback:** `docs/CLI_MODE_DASHBOARD_TEST_FEEDBACK.md` (Test results)
- **Coordinator Profile:** `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`
- **Orchestrator Script:** `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
- **Agent Selection:** `.claude/skills/cfn-agent-selector/select-agents.sh` (if exists)

---

## Action Items

- [ ] **P0:** Update cfn-v3-coordinator.md with strict parameter initialization and validation
- [ ] **P0:** Add pre-invocation validation check in coordinator
- [ ] **P1:** Create orchestrate-wrapper.sh with fallback enforcement
- [ ] **P1:** Create integration test for coordinator → orchestrator flow
- [ ] **P2:** Build cfn-agent-selection-with-fallback skill
- [ ] **P2:** Re-run CLI mode dashboard test to validate fix

---

**Report Generated By:** Claude Code Analysis
**Confidence Score:** 0.90 (High confidence in root cause, solution needs validation)
**Recommendation:** Implement Phase 1 immediately, test with dashboard task, then proceed with Phase 2/3
