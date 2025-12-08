# Active Bugs - Open Issues

Generated: 2025-12-08T07:23:16.868741

Current bugs requiring attention or investigation.

**Total Active:** 5

## 🚨 Critical Issues

### Active Bugs - Open Issues

**File:** `ACTIVE_BUGS.md` | **Status:** active | **Priority:** critical

---

### RUVECTOR INDEXING ROOT CAUSE

**File:** `BUG_RUVECTOR_INDEXING_ROOT_CAUSE.md` | **Status:** active | **Priority:** critical

**Description:**
The RuVector codebase indexer fails to index more than 1 file due to multiple architectural issues in the script coordination between Bash and Node.js. The failures manifest as either missing dependencies, incorrect module paths, or missing environment variables.

**Root Cause:**
 Executive Summary

---

### 25 COORDINATOR HALLUCINATION

**File:** `BUG_25_COORDINATOR_HALLUCINATION.md` | **Status:** unknown | **Priority:** critical

**Description:**
Orchestrator spawns Product Owner with --agent-id "product-owner-1-decision" but agent stores Redis keys using runtime ID product-owner-1 . Result: Orchestrator cannot find decision despite agent successfully storing "ITERATE" .

**Root Cause:**
 orchestrate-cfn-loop.sh:1530 bash PO AGENT ID="product-owner-${PO INSTANCE NUM}-decision" Spawn with suffix

---

### Orchestrator Parameter Validation - Test Report

**File:** `ORCHESTRATOR_PARAM_VALIDATION_TEST_REPORT.md` | **Status:** unknown | **Priority:** critical

**Description:**
 Result: ✅ ALL TESTS PASSED (13/13) 

---

### REDIS AUTH FIX

**File:** `BUG_REDIS_AUTH_FIX.md` | **Status:** unknown | **Priority:** critical

**Description:**
Redis CLI wrapper was attempting AUTH when REDIS PASSWORD environment variable was set, regardless of whether Redis actually required authentication. This caused harmless but confusing warnings:

**Root Cause:**
In .claude/skills/cfn-redis-coordination/redis-cli-wrapper.sh (lines 16-18), the script blindly used AUTH arguments whenever REDIS PASSWORD was set, without first checking if Redis actually required authentication.

---

