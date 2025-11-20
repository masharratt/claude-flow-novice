# Docs Organization Plan

## Overview

This document describes the automated organization of 80+ markdown files from `/docs` root directory into appropriate subdirectories based on semantic rules.

## Script Location

```bash
scripts/organize-docs.sh
```

## Execution

### Dry Run (Preview Changes)

```bash
bash scripts/organize-docs.sh --dry-run
```

### Execute Moves

```bash
bash scripts/organize-docs.sh --execute
```

### Options

- `--dry-run` - Show what would be moved without making changes (default)
- `--execute` - Perform the actual moves
- `--verbose` - Show detailed output (default: true)
- `--quiet` - Suppress non-essential output
- `--help` - Show usage information

## Categorization Rules

### Bug Documentation
- **Pattern**: `BUG_*.md`
- **Target**: `docs/bugs/`
- **Examples**:
  - BUG_19_MEMORY_LEAK_TASK_MODE.md
  - BUG_22_PHASE_2_IMPLEMENTATION.md
  - BUG_REDIS_AUTH_FIX.md

### CFN System & Analysis
- **Pattern**: `CFN_ANALYSIS_*.md`, `CFN_FINDINGS_*.md`, `CFN_BASH_*.md`, `CFN_TYPESCRIPT_*.md`
- **Target**: `docs/cfn-system/`
- **Examples**:
  - CFN_ANALYSIS_EXECUTIVE_SUMMARY.md
  - CFN_BASH_TO_TYPESCRIPT_AUDIT.md
  - CFN_TYPESCRIPT_MIGRATION_INDEX.md

### CFN Loop Documentation
- **Pattern**: `CFN_LOOP_*.md`, `ORCHESTR*.md`
- **Target**: `docs/cfn-loop/`
- **Examples**:
  - CFN_LOOP_CLI_MODE_EXECUTION_ANALYSIS.md
  - CFN_LOOP_COORDINATION_QUICK_REFERENCE.md
  - ORCHESTRATOR_IMPLEMENTATION.md

### Bash Migration
- **Pattern**: `BASH_DEPRECATION_*.md`, `BASH_PATTERNS_*.md`
- **Target**: `docs/migration/`

### CLI Mode Operations
- **Pattern**: `CLI_MODE_*.md`
- **Target**: `docs/operations/`
- **Examples**:
  - CLI_MODE_DASHBOARD_TEST_FEEDBACK.md
  - CLI_MODE_ORCHESTRATION_FIXES.md
  - CLI_MODE_REDIS_CONFIGURATION.md

### Code Reviews
- **Pattern**: `CODE_REVIEW_*.md`, `PR_*.md`
- **Target**: `docs/reviews/`
- **Examples**:
  - CODE_REVIEW_BUG22_PHASES.md
  - CODE_REVIEW_SANITIZE_INPUT_FUNCTION.md
  - PR_21_REVIEW_FIXES.md

### Coordinator Documentation
- **Pattern**: `COORDINATOR_*.md`
- **Target**: `docs/cfn-system/`
- **Examples**:
  - COORDINATOR_BUGS_FINAL_VALIDATION_REPORT.md
  - COORDINATOR_ORCHESTRATOR_FIX.md
  - COORDINATOR_SIMPLIFICATION_REPORT.md

### Docker Documentation
- **Pattern**: `DOCKER_*.md`
- **Target**: `docs/docker/`
- **Examples**:
  - DOCKER_COMPATIBILITY_REVIEW_INDEX.md
  - DOCKER_MODE_COMPATIBILITY_ANALYSIS.md
  - DOCKER_VS_CLI_EXECUTION_PATHS.md

### TypeScript Migration
- **Pattern**: `TYPESCRIPT_*.md`, `*_TYPESCRIPT_*.md`
- **Target**: `docs/migration/`
- **Examples**:
  - TYPESCRIPT_MIGRATION_FAQ.md
  - TYPESCRIPT_ORCHESTRATOR_MIGRATION_COMPLETE.md
  - HOOKS_TYPESCRIPT_MIGRATION.md

### Security Audits
- **Pattern**: `SECURITY_*.md`
- **Target**: `docs/security/`
- **Examples**:
  - SECURITY_AUDIT_AGENT_PROFILES_2025-11-19.md

### Testing & Validation
- **Pattern**: `TEST_*.md`, `*_TEST_*.md`, `E2E_TEST_*.md`, `INTEGRATION_TEST_*.md`
- **Target**: `docs/testing/`
- **Examples**:
  - TEST_ANALYSIS_INDEX.md
  - TEST_CONSOLIDATION_ROADMAP.md
  - E2E_TEST_VALIDATES_BUG_DETECTION.md
  - INTEGRATION_TEST_VALIDATION_REPORT.md

### Agent Documentation
- **Pattern**: `AGENT_*.md`
- **Target**: `docs/agent-spawner/`
- **Examples**:
  - AGENT_NAME_REFERENCE.md

### Deprecation Notices
- **Pattern**: `DEPRECATION_*.md`
- **Target**: `docs/migration/`
- **Examples**:
  - DEPRECATION_FILES_LIST.md
  - DEPRECATION_FILES_UPDATED.md
  - DEPRECATION_IMPLEMENTATION_COMPLETE.md

### Developer Guides
- **Pattern**: `DEVELOPER_*.md`
- **Target**: `docs/guides/`
- **Examples**:
  - DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md

### Operational Metadata
- **Pattern**: `ALL_3_MODES_*.md`, `DOCUMENTATION_*.md`
- **Target**: `docs/meta/`
- **Examples**:
  - ALL_3_MODES_VERIFIED_WORKING.md

### Quality Assurance & Audits
- **Pattern**: `MEMORY_*.md`, `REDIS_*.md`, `LOGGER_*.md`, `SANITIZE_*.md`
- **Target**: `docs/quality-assurance/`
- **Examples**:
  - MEMORY_CLEANUP_GUIDE.md
  - MEMORY_LEAK_FIX_SUMMARY.md
  - REDIS_CLEANUP_EXECUTIVE_SUMMARY.md
  - LOGGER_INTERFACE_AUDIT.md
  - SANITIZE_INPUT_FINAL_VERDICT.md

### Issue Tracking & Reports
- **Pattern**: `ISSUE_*.md`
- **Target**: `docs/reports/`
- **Examples**:
  - ISSUE_FIXES_SUMMARY_v2.15.6.md

### Migration & Framework
- **Pattern**: `CFN_MIGRATION_*.md`
- **Target**: `docs/migration/`
- **Examples**:
  - CFN_MIGRATION_ACTION_PLAN.md

## Dry Run Output Example

```
================================================================================
DOCS ORGANIZATION SCRIPT
================================================================================

Mode: DRY RUN (no changes)
Source: /path/to/docs

[INFO] Found 80 markdown files to process

[DRY RUN] Would move: BUG_19_MEMORY_LEAK_TASK_MODE.md → bugs/
[DRY RUN] Would move: CFN_ANALYSIS_EXECUTIVE_SUMMARY.md → cfn-system/
[DRY RUN] Would move: DOCKER_COMPATIBILITY_REVIEW_INDEX.md → docker/
[DRY RUN] Would move: TEST_ANALYSIS_INDEX.md → testing/
...

================================================================================
SUMMARY
================================================================================
Total files processed: 80
Files moved:         0
Files skipped:       1
Errors:              0

To execute the moves, run:
  DRY_RUN=false /path/to/scripts/organize-docs.sh
```

## Features

- **Dry-run mode**: Preview all changes before execution
- **Flexible execution**: Use CLI arguments or environment variables
- **Colored output**: Easy-to-read status messages
- **Duplicate detection**: Prevents overwriting existing files
- **Error handling**: Comprehensive error reporting
- **Verbose & quiet modes**: Control output verbosity
- **Git integration**: Detects project root automatically
- **Summary reporting**: Statistics on files processed/moved/skipped

## File Handling

### Files Already in Target Directory

If a file already exists in the target directory, the script:
- Logs a warning
- Skips the file
- Counts it in the skipped statistics

### Unrecognized Files

Files that don't match any rule are:
- Logged with a warning
- Skipped
- Left in the docs root directory

### Directory Validation

The script verifies all target directories exist before moving files. If a target directory doesn't exist, an error is logged and the file is not moved.

## Error Recovery

If the script encounters an error:
1. Review the error messages in the output
2. Run `--dry-run` to verify the changes
3. Fix any issues (missing directories, permission problems, etc.)
4. Re-run with `--execute`

## Statistics

According to the dry-run output:

- **Total files found**: 80
- **Files with categorization rules**: 79
- **Files skipped**: 1 (TEST_COVERAGE_GAP_ANALYSIS.md - already exists in target)
- **Ready to organize**: 79 files

## Affected Subdirectories

The script will populate or add files to these subdirectories:

```
docs/
├── agent-spawner/     (1 file)
├── bugs/              (12 files)
├── cfn-loop/          (4 files)
├── cfn-system/        (10 files)
├── docker/            (5 files)
├── guides/            (1 file)
├── meta/              (1 file)
├── migration/         (20 files)
├── operations/        (4 files)
├── quality-assurance/ (9 files)
├── reports/           (1 file)
├── reviews/           (3 files)
├── security/          (1 file)
└── testing/           (7 files)
```

## Post-Organization Tasks

After running the script:

1. Verify all files moved correctly:
   ```bash
   find docs -type f -name "*.md" | grep -v "/" | wc -l
   # Should return 0 if all files organized
   ```

2. Update any cross-references in code or documentation

3. Review affected subdirectories for consistency

4. Consider creating an index or table of contents for heavily populated directories

## Script Features

### Usage Help

```bash
bash scripts/organize-docs.sh --help
```

### Environment Variables

```bash
# Override dry-run mode
DRY_RUN=false bash scripts/organize-docs.sh

# Suppress verbose output
VERBOSE=false bash scripts/organize-docs.sh --execute
```

### Exit Codes

- `0` - Success (no errors)
- `1` - One or more errors occurred

## Implementation Notes

- Script uses `sort -z` for safe filename handling
- Validates target directories before moving
- Detects duplicate files in target locations
- Provides detailed logging for troubleshooting
- Uses ANSI color codes for readable output
- Compatible with bash 4.0+

