# File Categorization and Migration Plan

## Architecture Files → docs/architecture/
```bash
git mv ARCHITECTURE_DESIGN.md docs/architecture/
git mv ARCHITECTURE_EXECUTION_SUMMARY.md docs/architecture/
git mv CLEANUP_ARCHITECTURE_PLAN.md docs/architecture/
git mv FINAL_ARCHITECTURE_PLAN.md docs/architecture/
git mv FINAL_CLEANUP_ARCHITECTURE_REPORT.md docs/architecture/
git mv api-documentation.md docs/architecture/
git mv api-structure.md docs/architecture/
```

## Planning Files → docs/planning/
```bash
git mv MIGRATION_EXECUTION_PLAN.md docs/planning/
git mv MIGRATION_IMPLEMENTATION_PLAN.md docs/planning/
git mv MIGRATION_PHASES_DETAILED.md docs/planning/
git mv ROOT_CLEANUP_IMPLEMENTATION_PLAN.md docs/planning/
git mv STRUCTURED_CLEANUP_PLAN.md docs/planning/
git mv cleanup-execution-plan.md docs/planning/
git mv migration-implementation-plan.md docs/planning/
git mv AUTO_SETUP.md docs/planning/
git mv config_update_instructions.md docs/planning/
git mv BACKLOG_PRIORITIZATION.md docs/planning/
```

## Technical Analysis → docs/technical/
```bash
git mv BREAKING_CHANGES_ANALYSIS.md docs/technical/
git mv breaking-change-impact-analysis.md docs/technical/
git mv HARDCODED_PATHS_ANALYSIS.md docs/technical/
git mv ROOT_DIRECTORY_ANALYSIS.md docs/technical/
git mv TEST_FIXES_SQLITE_ACL.md docs/technical/
git mv risk-assessment-summary.md docs/technical/
git mv AGENT_SYNC_DOCUMENTATION.md docs/technical/
git mv CLAUDE-DRAFT-COST-OPTIMIZATION.md docs/technical/
git mv CLAUDE.md docs/technical/
git mv memory-bank.md docs/technical/
git mv coordination.md docs/technical/
```

## Reports → docs/reports/
```bash
git mv EXECUTION_SUMMARY.md docs/reports/
git mv FINAL_ANALYSIS_SUMMARY.md docs/reports/
git mv ROOT_CLEANUP_ANALYSIS_REPORT.md docs/reports/
git mv ROOT_CLEANUP_EXECUTION_SUMMARY.md docs/reports/
git mv ENTERPRISE_COORDINATION_FINAL_REPORT.md docs/reports/
git mv HYBRID_ROUTING_MVP_SUMMARY.md docs/reports/
git mv final-cleanup-deliverable.md docs/reports/
```

## Test Scripts → tests/
```bash
# Unit tests
git mv advanced.test.js tests/unit/
git mv math.test.js tests/unit/
git mv test_quick_tool.test.js tests/unit/

# Integration tests
git mv test-agent-compliance.js tests/integration/
git mv test-agent-with-zai.js tests/integration/
git mv test-fork-zai-actual.js tests/integration/
git mv test-fork-zai-as-provider.js tests/integration/
git mv test-fork-zai.js tests/integration/
git mv test-provider-routing.js tests/integration/
git mv test-zai-direct-call.js tests/integration/

# Test utilities
git mv test-runner.js tests/scripts/
git mv test-signals.js tests/scripts/
```

## Files to Keep in Root
- README.md
- README-CFN-COORDINATORS.md
- README-COORDINATORS.md
- ZAI_FORK_COMPATIBILITY_REPORT.md

## Duplicate Files to Review
- BREAKING_CHANGE_ANALYSIS.md (review vs BREAKING_CHANGES_ANALYSIS.md)
- breaking-changes-impact-analysis.md (review vs breaking-change-impact-analysis.md)
- root-cleanup-analysis.md (review vs ROOT_CLEANUP_ANALYSIS.md)
- root-directory-analysis.md (review vs ROOT_DIRECTORY_ANALYSIS.md)
- root-cleanup-execution-summary.md (review vs ROOT_CLEANUP_EXECUTION_SUMMARY.md)
- claude-copy-to-main.md (review necessity)
- claude-soul.md (review necessity)
- final-migration-summary.md (review necessity)