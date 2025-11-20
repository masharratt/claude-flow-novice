# Docs Organization Script - Quick Reference

## TL;DR

Run this to organize all loose .md files in `/docs` root:

```bash
# Preview changes
bash scripts/organize-docs.sh --dry-run

# Execute moves
bash scripts/organize-docs.sh --execute
```

## Script Location

```
scripts/organize-docs.sh
```

## What It Does

Automatically moves 80 markdown files from `/docs` root into 14 subdirectories based on naming patterns.

## Categorization Summary

| Pattern | Target | Example |
|---------|--------|---------|
| `BUG_*.md` | `docs/bugs/` | BUG_19_MEMORY_LEAK_TASK_MODE.md |
| `BASH_DEPRECATION_*.md` | `docs/migration/` | BASH_DEPRECATION_NOTICE.md |
| `CFN_ANALYSIS_*.md` | `docs/cfn-system/` | CFN_ANALYSIS_EXECUTIVE_SUMMARY.md |
| `CFN_LOOP_*.md` | `docs/cfn-loop/` | CFN_LOOP_CLI_MODE_EXECUTION_ANALYSIS.md |
| `CLI_MODE_*.md` | `docs/operations/` | CLI_MODE_DASHBOARD_TEST_FEEDBACK.md |
| `CODE_REVIEW_*.md` | `docs/reviews/` | CODE_REVIEW_BUG22_PHASES.md |
| `COORDINATOR_*.md` | `docs/cfn-system/` | COORDINATOR_ORCHESTRATOR_FIX.md |
| `DOCKER_*.md` | `docs/docker/` | DOCKER_COMPATIBILITY_REVIEW_INDEX.md |
| `TYPESCRIPT_*.md` | `docs/migration/` | TYPESCRIPT_MIGRATION_FAQ.md |
| `SECURITY_*.md` | `docs/security/` | SECURITY_AUDIT_AGENT_PROFILES_2025-11-19.md |
| `TEST_*.md` | `docs/testing/` | TEST_ANALYSIS_INDEX.md |
| `AGENT_*.md` | `docs/agent-spawner/` | AGENT_NAME_REFERENCE.md |
| `DEPRECATION_*.md` | `docs/migration/` | DEPRECATION_FILES_LIST.md |
| `DEVELOPER_*.md` | `docs/guides/` | DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md |
| `ORCHESTR*.md` | `docs/cfn-loop/` | ORCHESTRATOR_IMPLEMENTATION.md |
| `MEMORY_*.md` | `docs/quality-assurance/` | MEMORY_CLEANUP_GUIDE.md |
| `REDIS_*.md` | `docs/quality-assurance/` | REDIS_CLEANUP_EXECUTIVE_SUMMARY.md |
| `LOGGER_*.md` | `docs/quality-assurance/` | LOGGER_INTERFACE_AUDIT.md |
| `SANITIZE_*.md` | `docs/quality-assurance/` | SANITIZE_INPUT_FINAL_VERDICT.md |
| `E2E_TEST_*.md` | `docs/testing/` | E2E_TEST_VALIDATES_BUG_DETECTION.md |
| `INTEGRATION_TEST_*.md` | `docs/testing/` | INTEGRATION_TEST_VALIDATION_REPORT.md |
| `PR_*.md` | `docs/reviews/` | PR_21_REVIEW_FIXES.md |
| `ISSUE_*.md` | `docs/reports/` | ISSUE_FIXES_SUMMARY_v2.15.6.md |
| `ALL_3_MODES_*.md` | `docs/meta/` | ALL_3_MODES_VERIFIED_WORKING.md |
| `CFN_MIGRATION_*.md` | `docs/migration/` | CFN_MIGRATION_ACTION_PLAN.md |
| `HOOKS_*.md` | `docs/migration/` | HOOKS_TYPESCRIPT_MIGRATION.md |

## Command Options

```bash
# Preview only (no changes)
bash scripts/organize-docs.sh --dry-run

# Execute the moves
bash scripts/organize-docs.sh --execute

# Quiet output
bash scripts/organize-docs.sh --execute --quiet

# Show help
bash scripts/organize-docs.sh --help

# Using environment variables
DRY_RUN=false VERBOSE=false bash scripts/organize-docs.sh
```

## Expected Results

After executing the script, you'll move approximately:

- **12 files** to `docs/bugs/`
- **10 files** to `docs/cfn-system/`
- **4 files** to `docs/cfn-loop/`
- **20 files** to `docs/migration/`
- **9 files** to `docs/quality-assurance/`
- **7 files** to `docs/testing/`
- **5 files** to `docs/docker/`
- **4 files** to `docs/operations/`
- **3 files** to `docs/reviews/`
- **1 file** each to: `docs/agent-spawner/`, `docs/guides/`, `docs/reports/`, `docs/security/`, `docs/meta/`

**Total: 79 files organized, 1 skipped (already exists)**

## Safety Features

- Dry-run mode enabled by default (no changes made)
- Duplicate detection prevents overwriting files
- Target directory validation before moving
- Comprehensive error reporting
- Exit code indicates success/failure
- Colored output for easy reading

## Verify Organization

After running the script:

```bash
# Check that docs root is empty of .md files
find docs -maxdepth 1 -type f -name "*.md"
# Should return only ORGANIZATION_PLAN.md
```

## Detailed Documentation

For full documentation, see: `docs/ORGANIZATION_PLAN.md`

## Troubleshooting

**Q: Some files didn't move**
A: Run with `--dry-run` first to see which files and why. Check if target directories exist.

**Q: How do I undo changes?**
A: Use git to restore: `git checkout docs/`

**Q: Can I modify the rules?**
A: Edit the `categorize_file()` function in `scripts/organize-docs.sh`

## Files Used

- **Script**: `scripts/organize-docs.sh` - Main organization script (299 lines)
- **Documentation**: `docs/ORGANIZATION_PLAN.md` - Complete documentation
- **Reference**: `DOCS_ORGANIZATION_REFERENCE.md` - This file
