# Environment Variable Contract Alignment Report

**Date:** 2025-11-14
**Purpose:** Verify alignment between contract specification, coordinator entrypoint, and documentation
**Contract Reference:** `docker/runtime/cfn-runtime.contract.yml`
**Entrypoint Reference:** `docker/coordinator-entrypoint.sh`
**Documentation Reference:** `docker/CLAUDE.md`, `planning/docker/handoff/HANDOFF_DOCKER_COORDINATOR_LAUNCH_FIX.md`

---

## Executive Summary

**Status:** ⚠️ MISALIGNMENT DETECTED

**Critical Issues Found:** 2
- Missing `TASK_DESCRIPTION` in contract (used by entrypoint as **required**)
- Missing `MODE` in contract (used by entrypoint with default)

**Minor Issues Found:** 3
- Inconsistent variable naming (CFN_ prefix vs legacy)
- Missing `AGENTS` variable in contract
- Missing threshold variables with CFN_ prefix

---

## Detailed Alignment Analysis

### 1. CRITICAL: TASK_DESCRIPTION Missing from Contract

**Used in entrypoint** (line 10-13):
```bash
if [ -z "${TASK_DESCRIPTION:-}" ]; then
    echo "❌ ERROR: TASK_DESCRIPTION environment variable required"
    exit 1
fi
```

**Contract status:** ❌ NOT DEFINED

**Impact:**
- Entrypoint treats this as **required**
- Contract has no specification for this variable
- No default value, type, or scope defined
- Handoff documentation mentions it as required

**Recommendation:**
Add to contract under `task:` section:
```yaml
  CFN_TASK_DESCRIPTION:
    description: "Human-readable task description"
    default: null
    type: "string"
    scope: ["coordinator", "orchestrator"]
    legacy_aliases: ["TASK_DESCRIPTION"]
    required: true
    example: "Fix TypeScript errors in frontend codebase"
```

---

### 2. CRITICAL: MODE Missing from Contract

**Used in entrypoint** (line 15):
```bash
MODE="${MODE:-standard}"
```

**Contract status:** ❌ NOT DEFINED (similar to `CFN_ORCHESTRATOR_MODE` but different scope)

**Impact:**
- Entrypoint uses `MODE` directly (no CFN_ prefix)
- Contract defines `CFN_ORCHESTRATOR_MODE` but not coordinator `MODE`
- Default is "standard" but not documented in contract

**Recommendation:**
Add to contract under `coordinator:` section:
```yaml
  CFN_COORDINATOR_MODE:
    description: "Execution mode for coordinator (mvp, standard, enterprise)"
    default: "standard"
    type: "string"
    scope: ["coordinator"]
    legacy_aliases: ["MODE"]
    required: false
    example: "standard"
    allowed_values: ["mvp", "standard", "enterprise"]
```

---

### 3. MINOR: AGENTS Variable Missing

**Used in entrypoint** (lines 56, 99):
```bash
"agents": "${AGENTS:-}",
...
--agents "${AGENTS:-}" \
```

**Contract status:** ❌ NOT DEFINED

**Impact:**
- Optional variable (defaults to empty)
- Used to pass agent specifications to orchestrator
- Not critical but should be documented

**Recommendation:**
Add to contract under `coordinator:` section:
```yaml
  CFN_AGENTS_LIST:
    description: "Comma-separated list of agent types to spawn"
    default: null
    type: "string"
    scope: ["coordinator", "orchestrator"]
    legacy_aliases: ["AGENTS"]
    required: false
    example: "coder,reviewer,tester"
```

---

### 4. MINOR: Threshold Variables Naming Inconsistency

**Used in entrypoint** (lines 58-59, 101-102):
```bash
"gate_threshold": ${GATE_THRESHOLD:-0.75},
"consensus_threshold": ${CONSENSUS_THRESHOLD:-0.90},
...
--gate-threshold "${GATE_THRESHOLD:-0.75}" \
--consensus-threshold "${CONSENSUS_THRESHOLD:-0.90}" \
```

**Contract defines** (lines 163-177):
```yaml
CFN_GATE_CONFIDENCE_THRESHOLD: "0.75"
CFN_CONSENSUS_THRESHOLD: "0.90"
```

**Impact:**
- Entrypoint uses `GATE_THRESHOLD` (no CFN_ prefix)
- Contract defines `CFN_GATE_CONFIDENCE_THRESHOLD`
- Variable name mismatch (no legacy alias defined)
- Consensus threshold matches but missing legacy alias

**Recommendation:**
Update contract to add legacy aliases:
```yaml
  CFN_GATE_CONFIDENCE_THRESHOLD:
    legacy_aliases: ["GATE_THRESHOLD", "GATE_CONFIDENCE_THRESHOLD"]

  CFN_CONSENSUS_THRESHOLD:
    legacy_aliases: ["CONSENSUS_THRESHOLD"]
```

---

### 5. MINOR: Memory/Network Variables

**Used in entrypoint** (lines 60-61):
```bash
"memory_limit": "${MEMORY_LIMIT:-1g}",
"network": "${NETWORK:-mcp-network}",
```

**Contract status:**
- `MEMORY_LIMIT` → Not in contract (similar to `CFN_MEMORY_BUDGET` but different scope)
- `NETWORK` → Defined as `CFN_NETWORK_NAME` with default "cfn-network"

**Impact:**
- Network default mismatch: entrypoint uses "mcp-network", contract says "cfn-network"
- Memory limit not defined (agent-level allocation vs coordinator budget)

**Recommendation:**
Add `CFN_AGENT_MEMORY_LIMIT` and fix network default:
```yaml
  CFN_AGENT_MEMORY_LIMIT:
    description: "Memory limit for individual agent containers"
    default: "1g"
    type: "string"
    scope: ["coordinator"]
    legacy_aliases: ["MEMORY_LIMIT"]
    required: false
    example: "2g"

  CFN_NETWORK_NAME:
    # Update default to match entrypoint or vice versa
    default: "mcp-network"  # OR update entrypoint to use "cfn-network"
```

---

## Variable Usage Matrix

| Variable | Contract | Entrypoint | Required | Status | Recommendation |
|----------|----------|------------|----------|--------|----------------|
| `TASK_ID` | ✅ `CFN_TASK_ID` | ✅ | ✅ | ✅ Aligned | - |
| `TASK_DESCRIPTION` | ❌ | ✅ | ✅ | 🚨 **MISSING** | Add to contract |
| `MODE` | ❌ | ✅ | ❌ | 🚨 **MISSING** | Add as `CFN_COORDINATOR_MODE` |
| `AGENTS` | ❌ | ✅ | ❌ | ⚠️ Missing | Add as `CFN_AGENTS_LIST` |
| `MAX_ITERATIONS` | ✅ `CFN_ITERATION_LIMIT` | ✅ | ❌ | ⚠️ Name mismatch | Add legacy alias |
| `GATE_THRESHOLD` | ✅ `CFN_GATE_CONFIDENCE_THRESHOLD` | ✅ | ❌ | ⚠️ Name mismatch | Add legacy alias |
| `CONSENSUS_THRESHOLD` | ✅ `CFN_CONSENSUS_THRESHOLD` | ✅ | ❌ | ⚠️ Missing alias | Add legacy alias |
| `MEMORY_LIMIT` | ❌ | ✅ | ❌ | ⚠️ Missing | Add as `CFN_AGENT_MEMORY_LIMIT` |
| `NETWORK` | ✅ `CFN_NETWORK_NAME` | ✅ | ❌ | ⚠️ Default mismatch | Align defaults |
| `CFN_REDIS_HOST` | ✅ | ✅ | ❌ | ✅ Aligned | - |
| `CFN_REDIS_PORT` | ✅ | ✅ | ❌ | ✅ Aligned | - |
| `CFN_DOCKER_MODE` | ❌ | ✅ (export) | ❌ | ⚠️ Missing | Add to contract |
| `CFN_DOCKER_CONTAINER` | ✅ `CFN_CONTAINER_MODE` | ✅ (export) | ❌ | ⚠️ Name mismatch | Add legacy alias |

---

## Handoff Document Alignment

**Document:** `planning/docker/handoff/HANDOFF_DOCKER_COORDINATOR_LAUNCH_FIX.md`

### Variables Mentioned in Handoff

**Lines 286-289** (smoke test example):
```bash
-e TASK_ID="test-task-${TEST_ID}"
-e TASK_DESCRIPTION="Smoke test"
-e MODE="standard"
```

**Status:**
- ✅ `TASK_ID` - Aligned with contract
- ❌ `TASK_DESCRIPTION` - NOT in contract
- ❌ `MODE` - NOT in contract

**Lines 362-365** (integration test example):
```bash
-e TASK_ID="integration-test-$(date +%s)"
-e TASK_DESCRIPTION="Integration test of parameter handoff"
-e MODE="standard"
```

**Status:** Same alignment issues as above

---

## Docker CLAUDE.md Alignment

**Section:** "Environment Configuration" (lines 891-925)

**Variables Listed:**
- ✅ `MEMORY_BUDGET` - Aligned (legacy of `CFN_MEMORY_BUDGET`)
- ✅ `MAX_ITERATIONS` - Should reference `CFN_ITERATION_LIMIT`
- ✅ `REDIS_HOST` - Aligned (legacy of `CFN_REDIS_HOST`)
- ✅ `NETWORK_NAME` - Aligned (legacy of `CFN_NETWORK_NAME`)
- ✅ `AGENT_IMAGE` - Aligned with `CFN_AGENT_IMAGE`

**Missing from CLAUDE.md:**
- `TASK_ID` / `CFN_TASK_ID` (critical)
- `TASK_DESCRIPTION` (critical)
- `MODE` (critical)

---

## Recommended Actions

### Immediate (Before Next Deployment)

1. **Add `CFN_TASK_DESCRIPTION` to contract**
   - File: `docker/runtime/cfn-runtime.contract.yml`
   - Location: Under `task:` section
   - Required: true
   - Scope: ["coordinator", "orchestrator"]

2. **Add `CFN_COORDINATOR_MODE` to contract**
   - File: `docker/runtime/cfn-runtime.contract.yml`
   - Location: Under `coordinator:` section
   - Legacy alias: `MODE`
   - Default: "standard"

3. **Update entrypoint to use CFN_ prefixed variables**
   - File: `docker/coordinator-entrypoint.sh`
   - Support both `CFN_TASK_DESCRIPTION` and `TASK_DESCRIPTION` (legacy)
   - Support both `CFN_COORDINATOR_MODE` and `MODE` (legacy)

### Short-term (Next Week)

4. **Add missing variables to contract**
   - `CFN_AGENTS_LIST` (legacy: `AGENTS`)
   - `CFN_AGENT_MEMORY_LIMIT` (legacy: `MEMORY_LIMIT`)
   - `CFN_DOCKER_MODE`

5. **Add legacy aliases to existing contract entries**
   - `CFN_GATE_CONFIDENCE_THRESHOLD` → add `GATE_THRESHOLD`
   - `CFN_ITERATION_LIMIT` → add `MAX_ITERATIONS`
   - `CFN_CONTAINER_MODE` → add `CFN_DOCKER_CONTAINER`

6. **Align network name defaults**
   - Decision needed: "cfn-network" vs "mcp-network"
   - Update either contract or entrypoint for consistency

7. **Update documentation**
   - Add contract reference to Docker CLAUDE.md (✅ DONE)
   - Update handoff documentation with contract variables
   - Update smoke test scripts to use CFN_ prefixed variables

### Medium-term (Next Sprint)

8. **Create contract validation test**
   - Script: `tests/docker/core/test-contract-alignment.sh`
   - Validates all variables in entrypoint exist in contract
   - Validates all required variables have defaults or are enforced
   - Runs as part of core test suite

9. **Add contract version negotiation**
   - Allow containers to report contract version they expect
   - Warn on version mismatch
   - Provide migration path for legacy variables

---

## Test Coverage Recommendations

### New Test: Contract Alignment Validation

**File:** `tests/docker/core/test-contract-alignment.sh`

**Purpose:** Ensure entrypoint variables match contract specification

**Test Cases:**
1. All variables used in entrypoint exist in contract
2. All required variables have validation in entrypoint
3. Default values in entrypoint match contract defaults
4. Legacy aliases are properly mapped
5. Variable types match contract specification

**Example Implementation:**
```bash
#!/bin/bash
set -euo pipefail

CONTRACT_FILE="docker/runtime/cfn-runtime.contract.yml"
ENTRYPOINT_FILE="docker/coordinator-entrypoint.sh"

echo "Validating contract alignment..."

# Extract variables from entrypoint
ENTRYPOINT_VARS=$(grep -oE '\$\{[A-Z_]+' "$ENTRYPOINT_FILE" | sed 's/\${//g' | sort -u)

# Check each variable exists in contract (or has legacy alias)
for VAR in $ENTRYPOINT_VARS; do
    if ! grep -q "CFN_$VAR\|$VAR:" "$CONTRACT_FILE"; then
        echo "❌ FAIL: Variable $VAR used in entrypoint but not in contract"
        exit 1
    fi
done

echo "✅ PASS: All entrypoint variables exist in contract"
```

---

## Risk Assessment

**Current Risk Level:** ⚠️ MEDIUM

**Risks:**
1. **High:** Missing `TASK_DESCRIPTION` will cause confusion for new users
2. **High:** Missing `MODE` documentation makes configuration unclear
3. **Medium:** Inconsistent naming makes migration difficult
4. **Low:** Missing optional variables reduce flexibility

**Mitigation:**
- Update contract BEFORE next coordinator deployment
- Add validation tests to prevent future misalignment
- Document legacy aliases clearly for transition period

---

## Sign-Off

**Alignment Status:** ⚠️ MISALIGNED - Action Required

**Critical Blockers:** 2 (TASK_DESCRIPTION, MODE)

**Recommended Timeline:**
- Contract updates: 30 minutes
- Entrypoint updates: 15 minutes
- Documentation updates: 15 minutes
- Testing: 30 minutes
- **Total: ~90 minutes**

**Ready to proceed with fixes:** ✅ YES (after contract updates)

---

**Document Status:** COMPLETE
**Last Updated:** 2025-11-14
**Confidence:** 0.95
