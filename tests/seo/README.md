# SEO Test Suite

## Overview

This directory contains integration tests for the SEO Site Onboarding & Keyword Discovery system with RuVector intelligence.

## Test Files

### test-onboarding-coordinator.sh

**Sprint:** 1.1, Deliverable 1.1.5
**Purpose:** Phase Orchestration Tests with RuVector Integration
**Confidence:** 0.95

Tests the SEO onboarding coordinator's ability to orchestrate 7 phases sequentially with RuVector caching integration.

**Test Coverage (29 tests):**

1. **Coordinator Spawning** (3 tests)
   - Context storage in Redis
   - Domain metadata persistence
   - Status tracking

2. **Parameter Validation** (7 tests)
   - Domain format validation
   - Missing required parameters
   - Optional parameters (competitors, industry)
   - Multi-value parsing

3. **Phase Failure Handling** (3 tests)
   - Blocking conditions (technical_health_score < 0.5)
   - Error message propagation
   - Phase rollback logic

4. **Phase 1-7 Sequential Execution** (1 test)
   - All 7 phases complete in order
   - Status transitions tracked

5. **Phase Transitions** (2 tests)
   - Phase dependencies enforced
   - Sequential progression validated

6. **Redis Storage/Retrieval** (2 tests)
   - Artifact persistence
   - JSON output storage and retrieval

7. **RuVector Pre-Research Queries** (Step 0) (3 tests)
   - Site profile cache lookup
   - Competitor intelligence cache lookup
   - Keyword research cache lookup

8. **RuVector Post-Phase Storage** (Step 4.5) (3 tests)
   - New site profile storage
   - Competitor intelligence storage
   - Data persistence validation

9. **Cache Hit Scenarios** (3 tests)
   - Cache hit detection
   - Redundant work skipping
   - Cache hit rate measurement (66%+ target)

10. **Error Handling** (2 tests)
    - Redis connection validation
    - RuVector query timeout handling
    - Malformed JSON detection

## Running Tests

### Single Test

```bash
bash tests/seo/test-onboarding-coordinator.sh
```

### All SEO Tests

```bash
for test in tests/seo/test-*.sh; do
  bash "$test" || exit 1
done
```

## Test Requirements

- **Redis:** Running on localhost:6379 (or CFN_REDIS_PORT)
- **Permissions:** Execute permission on test files
- **Dependencies:** test-utils.sh from tests/ directory

## Mock Components

Tests use mock implementations to avoid external dependencies:

- **Mock RuVector:** File-based simulation in /tmp/ruvector-mock-*
- **Mock Redis:** Real Redis with test-prefixed keys
- **Mock Phase Execution:** Simulated phase completion without actual agents

## Test Isolation

- Each test uses unique test IDs (timestamp-based)
- Redis keys prefixed with test domain/task ID
- Cleanup trap ensures test data removal
- Test ordering prevents state pollution

## Expected Output

```
========================================
Test Suite: seo-onboarding-coordinator
========================================

Total:  29
Passed: 29
Failed: 0

✅ All tests passed!
✅ All tests passed - High confidence in implementation

==================================================
Confidence Score: 0.95
==================================================
```

## Future Tests

Additional test files to be created in subsequent sprints:

- `test-phases-1-3.sh` (Sprint 1.2, Deliverable 1.2.5)
- `test-phases-4-5.sh` (Sprint 1.3, Deliverable 1.3.5)
- `test-onboarding-e2e.sh` (Sprint 1.4, Deliverable 1.4.5)
- `test-keyword-discovery.sh` (Sprint 2.1, Deliverable 2.1.4)
- `test-all-commands.sh` (Sprint 2.2, Deliverable 2.2.5)

## References

- **Epic:** [planning/epics/seo-onboarding-discovery/epic.json](../../planning/epics/seo-onboarding-discovery/epic.json)
- **Design:** [planning/seo/SEO_SITE_ONBOARDING_DESIGN.md](../../planning/seo/SEO_SITE_ONBOARDING_DESIGN.md)
- **Coordinator:** [.claude/cfn-extras/agents/cfn-seo-team/cfn-seo-coordinator.md](../../.claude/cfn-extras/agents/cfn-seo-team/cfn-seo-coordinator.md)
- **Test Standards:** [tests/CLAUDE.md](../CLAUDE.md)
