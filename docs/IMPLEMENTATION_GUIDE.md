# Root Directory Cleanup Implementation Guide

## Overview
This guide provides step-by-step instructions for implementing the root directory cleanup architecture plan.

## Prerequisites
- Git repository with proper backup
- Write permissions to all directories
- Understanding of project structure

## Phase 1: Directory Structure Creation

### Create Documentation Directories
```bash
mkdir -p docs/architecture
mkdir -p docs/planning
mkdir -p docs/analysis
mkdir -p docs/api
mkdir -p docs/guides
mkdir -p docs/memory
```

### Create Test Directories
```bash
mkdir -p tests/scripts
mkdir -p tests/results
mkdir -p tests/examples
mkdir -p tests/integration
```

### Create Configuration and Tools Directories
```bash
mkdir -p config
mkdir -p tools
```

## Phase 2: File Migration Operations

### Architecture Documents
```bash
# Move architecture-related files
git mv ARCHITECTURE_DESIGN.md docs/architecture/
git mv ARCHITECTURE_EXECUTION_SUMMARY.md docs/architecture/
git mv FINAL_ARCHITECTURE_PLAN.md docs/architecture/
git mv FINAL_CLEANUP_ARCHITECTURE_REPORT.md docs/architecture/
git mv CLEANUP_ARCHITECTURE_PLAN.md docs/architecture/
```

### Planning Documents
```bash
# Move planning and execution files
git mv BACKLOG_PRIORITIZATION.md docs/planning/
git mv MIGRATION_*.md docs/planning/
git mv ROOT_CLEANUP_*.md docs/planning/
git mv STRUCTURED_CLEANUP_PLAN.md docs/planning/
git mv EXECUTION_SUMMARY.md docs/planning/
git mv migration-*.md docs/planning/
git mv cleanup-execution-plan.md docs/planning/
```

### Analysis Reports
```bash
# Move analysis and reports
git mv BREAKING_CHANGES_ANALYSIS.md docs/analysis/
git mv BREAKING_CHANGE_ANALYSIS.md docs/analysis/
git mv breaking-change-impact-analysis.md docs/analysis/
git mv breaking-changes-impact-analysis.md docs/analysis/
git mv HARDCODED_PATHS_ANALYSIS.md docs/analysis/
git mv ROOT_DIRECTORY_ANALYSIS.md docs/analysis/
git mv root-directory-analysis*.md docs/analysis/
git mv ZAI_FORK_COMPATIBILITY_REPORT.md docs/analysis/
git mv FINAL_ANALYSIS_SUMMARY.md docs/analysis/
git mv risk-assessment-summary.md docs/analysis/
```

### API Documentation
```bash
# Move API-related files
git mv api-documentation.md docs/api/
git mv api-structure.md docs/api/
git mv coordination.md docs/api/
```

### User Guides
```bash
# Move guides and setup instructions
git mv AUTO_SETUP.md docs/guides/
git mv WEB_PORTAL_INSTALL.md docs/guides/
git mv config_update_instructions.md docs/guides/
git mv README-COORDINATORS.md docs/guides/
git mv README-CFN-COORDINATORS.md docs/guides/
```

### Memory and Documentation
```bash
# Move memory-related files
git mv memory-bank.md docs/memory/
git mv AGENT_SYNC_DOCUMENTATION.md docs/memory/
```

### Test Scripts
```bash
# Move test execution scripts
git mv test-*.js tests/scripts/
git mv quick-test.js tests/scripts/
git mv test-runner.js tests/scripts/
git mv cleanup-verification-script.js tests/scripts/
git mv migration-execution-script.js tests/scripts/
git mv test-agent-*.js tests/scripts/
```

### Test Results
```bash
# Move test results and reports
git mv test-results*.json tests/results/
git mv final-cleanup-deliverable.md tests/results/
git mv final-migration-summary.md tests/results/
```

### Example Code
```bash
# Move example files
git mv example-usage.js tests/examples/
git mv middleware-examples.js tests/examples/
git mv route-examples.js tests/examples/
```

### Integration Tests
```bash
# Move test files
git mv advanced.test.js tests/integration/
git mv math.test.js tests/integration/
git mv test_quick_tool.test.js tests/integration/
```

### Configuration Files
```bash
# Move configuration files
git mv package-scripts.json config/
git mv sprint-1.2-implementation-plan.json config/
git mv claude-flow.config.json config/
git mv *.yml config/  # if not essential to root
```

### Development Tools
```bash
# Move development tools
git mv spawn-workers-enterprise.js tools/
```

### Miscellaneous Documentation
```bash
# Move remaining documentation files
git mv CLAUDE*.md docs/memory/
git mv ENTERPRISE_COORDINATION_FINAL_REPORT.md docs/planning/
git mv HYBRID_ROUTING_MVP_SUMMARY.md docs/planning/
git mv TEST_FIXES_SQLITE_ACL.md docs/analysis/
```

## Phase 3: File Reference Updates

### Update Import Statements
Search for and update any relative path references in moved files:

```bash
# Find files that might need path updates
grep -r "\.\./\.\." docs/ tests/ config/ tools/
grep -r "from.*\.\." docs/ tests/ config/ tools/
```

### Update Documentation References
Update any documentation that references the old file locations:

```bash
# Find documentation references
grep -r "\.md" docs/ | grep -v "Binary file"
```

## Phase 4: Validation

### Verify All Files Moved
```bash
# Count remaining files in root
find . -maxdepth 1 -type f \( -name "*.md" -o -name "*.js" -o -name "*.json" -o -name "*.yml" \) | wc -l

# Should only show essential files: README.md, package.json, tsconfig.json, etc.
```

### Verify Directory Structure
```bash
# Display new structure
tree -L 3 docs/ tests/ config/ tools/
```

### Check Git Status
```bash
# Verify all moves are tracked
git status
```

### Run Tests
```bash
# Ensure tests still work
npm test
```

## Phase 5: Final Cleanup

### Update Root README
Update the main README.md to reflect the new directory structure.

### Create Directory README Files
Create README.md files in each major directory explaining their purpose:

```bash
# Create docs/README.md
echo "# Documentation Directory" > docs/README.md
echo "This directory contains all project documentation organized by category." >> docs/README.md

# Create tests/README.md
echo "# Tests Directory" > tests/README.md
echo "This directory contains all test files, scripts, and results." >> tests/README.md
```

### Commit Changes
```bash
git add .
git commit -m "feat: reorganize root directory structure

- Move 87+ files from root to organized directories
- Create logical structure: docs/, tests/, config/, tools/
- Preserve git history using git mv
- Update file references where needed
- Improve project maintainability and navigation"
```

## Rollback Procedures

If issues arise:

### Partial Rollback
```bash
# Move specific files back
git mv docs/architecture/ARCHITECTURE_DESIGN.md ./
```

### Full Rollback
```bash
# Reset to before migration
git reset --hard HEAD~1
```

## Validation Checklist

- [ ] All files successfully moved from root
- [ ] Only essential files remain in root (README.md, package.json, etc.)
- [ ] Directory structure matches architecture plan
- [ ] All git moves are properly tracked
- [ ] No broken file references
- [ ] Tests still pass after migration
- [ ] Documentation updated to reflect new structure
- [ ] Commit message is clear and descriptive

## Troubleshooting

### Common Issues

1. **Broken Import Paths**: Update relative paths in moved files
2. **Missing Files**: Check git status to ensure all moves are tracked
3. **Test Failures**: Update test configuration and paths
4. **Documentation Links**: Update internal documentation links

### Recovery Steps

1. Identify the specific issue
2. Use git log to track changes
3. Apply targeted fixes or rollback as needed
4. Re-run validation checks

This implementation guide ensures a systematic, safe, and reversible migration process.