# Legacy Hello World Test Suite (v1.x)

**Status:** ARCHIVED - Incompatible with v3.0+ architecture
**Date Archived:** 2025-11-17
**Reason:** Test suite built for `npx claude-flow-novice agent` CLI which no longer exists

## What This Test Suite Did

Validated CFN coordination capabilities through 4 progressive layers:

### Layer 0: Agent Tool Validation
- Tested 15 agent types with 7 tools each
- Validated: Read, Write, Edit, Bash, Grep, Glob, TodoWrite
- **Status:** ❌ Fails - agent spawn command obsolete

### Layer 1: Mesh Coordination
- 2 peer coordinators managing 70 Hello World files
- Redis pub/sub coordination with claim negotiation
- SQLite persistence for agent state
- **Status:** ❌ Fails - incompatible spawning mechanism

### Layer 2: Review Coordination
- Dynamic reviewer pool (3-10 reviewers)
- Queue-driven spawning/despawning
- Review handoff workflow
- **Status:** ❌ Fails - incompatible architecture

### Layer 3: Error Handling
- 50% error injection with 4 error types
- Fresh agent spawning for retries
- Exponential backoff (100ms, 200ms, 400ms)
- **Status:** ❌ Fails - retry logic changed in v3.0

## Why Archived

### v1 Architecture (What tests expected)
```bash
npx claude-flow-novice agent backend-dev --task "..." --timeout 300
```

### v3 Architecture (Current)
```bash
/cfn-loop-cli "..." → cfn-v3-coordinator → orchestrate.sh → agents
```

**Fundamental incompatibility:** Tests validate individual agent spawning, but v3.0+ only spawns agents within CFN Loop context.

## Replacement

**New test suite:** `tests/cli-mode/`
- Tests slash command workflow end-to-end
- Validates CFN Loop coordination patterns
- Tests production usage (not isolated components)

## Preservation Value

While incompatible, this test suite provides:
- ✅ **Test coverage patterns** (what to validate in v3.0)
- ✅ **Success criteria definitions** (quality gates)
- ✅ **SQLite validation patterns** (storage verification)
- ✅ **Error injection strategies** (fault tolerance testing)

Reference these tests when designing v3.0+ test suite.

## Files Archived

### Test Scripts
- `layer0-tool-validation.js` - Agent tool access validation
- `layer5-coordinator-spawning.js` - Coordinator spawn tests
- `layer6-coordinator-review.js` - Review coordination tests
- `layer7-coordinator-error-retry.js` - Error retry tests

### Test Directories
- `layer0/` - Tool validation test fixtures
- `layer1/` - Mesh coordination test data
- `layer2/` - Review coordination test data
- `layer3/` - Error handling test data

### Documentation
- `task-vs-cli-coordinator-comparison.md` - Architecture comparison
- `layer6-test-results.md` - Historical test results

## Do Not Delete

This test suite represents significant engineering effort and contains valuable patterns. Keep archived for reference when:
- Designing v3.0+ test coverage
- Troubleshooting coordination issues
- Understanding historical architecture decisions

---

**Archived:** 2025-11-17
**Replaced By:** tests/cli-mode/ (v3.0+ test suite)
**References:** planning/review-and-test/CLI_MODE_TEST_RESULTS.md
