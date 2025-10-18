---
name: Test Execution
version: 1.1.0
complexity: High
keywords: [
    "coordinator-pattern",
    "distributed test framework",
    "single-run caching",
    "conflict prevention",
    "resource-optimized testing",
    "test distribution",
    "parallel test management"
]
triggers: [
    "preventing test conflicts",
    "optimizing test resources",
    "distributed test environments"
]
performance_targets: {
    "test_run_time_ms": 5000,
    "coverage_accuracy_pct": 95,
    "caching_efficiency_pct": 90,
    "max_concurrent_workers": 10
}
---

# Test Execution Skill

**Pattern:** Coordinator-Cached Test Execution

## Problem Statement

Concurrent test execution causes conflicts, resource contention, and flaky results. Multiple agents running tests simultaneously creates:
- Port conflicts (test servers)
- Database/file system race conditions
- Unreliable coverage reports
- Wasted computation

[Rest of the content remains the same as in the previous file]