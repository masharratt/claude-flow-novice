# Root Directory Migration Implementation Plan

## Overview

This document provides a step-by-step implementation plan for organizing the root directory from 110 files down to essential files only, with detailed migration scripts and rollback procedures.

## Pre-Migration Checklist

### 1. Backup Strategy
```bash
# Create full backup
git checkout -b backup-before-cleanup
git add .
git commit -m "Backup before root directory cleanup"
git tag cleanup-backup-$(date +%Y%m%d-%H%M%S)

# Create file manifest
find . -maxdepth 1 -type f > backup-manifest.txt
```

### 2. Dependency Analysis
```bash
# Search for hardcoded root references
grep -r "\./[^/]" . --include="*.js" --include="*.ts" --include="*.json" --include="*.md" | grep -v node_modules > root-references.txt

# Check import statements
grep -r "from ['\"]\./" . --include="*.js" --include="*.ts" | grep -v node_modules > import-references.txt
```

## Phase 1: Documentation & Examples Migration (Low Risk)

### 1.1 Create Documentation Structure
```bash
# Create organized documentation directories
mkdir -p docs/{architecture,cleanup,coordination,migration,setup,api,testing}
mkdir -p examples/{usage,middleware,routing,scripts}
```

### 1.2 Migration Script
```bash
#!/bin/bash
# Phase 1: Documentation and Examples Migration

echo "Starting Phase 1: Documentation & Examples Migration"

# Architecture documentation
mv ARCHITECTURE_DESIGN.md docs/architecture/
mv CLEANUP_ARCHITECTURE_PLAN.md docs/cleanup/
mv FINAL_CLEANUP_ARCHITECTURE_REPORT.md docs/cleanup/
mv ROOT_CLEANUP_ANALYSIS.md docs/cleanup/
mv ROOT_CLEANUP_ANALYSIS_REPORT.md docs/cleanup/
mv ROOT_CLEANUP_IMPLEMENTATION_PLAN.md docs/cleanup/
mv STRUCTURED_CLEANUP_PLAN.md docs/cleanup/

# Coordination documentation
mv ENTERPRISE_COORDINATION_FINAL_REPORT.md docs/coordination/
mv AGENT_SYNC_DOCUMENTATION.md docs/coordination/
mv README-CFN-COORDINATORS.md docs/coordination/
mv README-COORDINATORS.md docs/coordination/
mv coordination.md docs/coordination/

# Migration documentation
mv MIGRATION_EXECUTION_PLAN.md docs/migration/
mv MIGRATION_PHASES_DETAILED.md docs/migration/
mv BREAKING_CHANGES_ANALYSIS.md docs/migration/
mv BREAKING_CHANGE_ANALYSIS.md docs/migration/

# Setup documentation
mv AUTO_SETUP.md docs/setup/
mv WEB_PORTAL_INSTALL.md docs/setup/
mv config_update_instructions.md docs/setup/

# API documentation
mv api-documentation.md docs/api/
mv api-structure.md docs/api/

# General documentation (keep in docs root)
mv ACE_NPM_INTEGRATION_COMPLETE.md docs/
mv BACKLOG_PRIORITIZATION.md docs/
mv CLAUDE-DRAFT-COST-OPTIMIZATION.md docs/
mv CLAUDE.md docs/
mv claude-copy-to-main.md docs/
mv claude-soul.md docs/
mv cleanup-execution-plan.md docs/
mv EXECUTION_SUMMARY.md docs/
mv FINAL_ANALYSIS_SUMMARY.md docs/
mv HARDCODED_PATHS_ANALYSIS.md docs/
mv HYBRID_ROUTING_MVP_SUMMARY.md docs/
mv memory-bank.md docs/
mv risk-assessment-summary.md docs/
mv TEST_FIXES_SQLITE_ACL.md docs/
mv ZAI_FORK_COMPATIBILITY_REPORT.md docs/
mv final-cleanup-deliverable.md docs/

# Examples
mv example-usage.js examples/usage/
mv middleware-examples.js examples/middleware/
mv route-examples.js examples/routing/

echo "Phase 1 completed successfully"
```

### 1.3 Validation Script
```bash
#!/bin/bash
# Phase 1 Validation

echo "Validating Phase 1 migration..."

# Check if files were moved correctly
docs_count=$(find docs -name "*.md" | wc -l)
examples_count=$(find examples -name "*.js" | wc -l)

echo "Documentation files in docs/: $docs_count"
echo "Example files in examples/: $examples_count"

# Check for any broken markdown links (basic check)
echo "Checking for broken file references..."
grep -r "\.md" docs/ | grep -v "docs/" | head -5

echo "Phase 1 validation complete"
```

## Phase 2: Configuration Migration (Medium Risk)

### 2.1 Create Configuration Structure
```bash
# Create configuration directories
mkdir -p config/{linting,git,docker,testing,security}
```

### 2.2 Migration Script
```bash
#!/bin/bash
# Phase 2: Configuration Migration

echo "Starting Phase 2: Configuration Migration"

# Linting configuration
mv .eslintignore config/linting/
mv .prettierignore config/linting/
mv .swcrc config/linting/

# Git configuration
mv .gitattributes config/git/
mv .gitleaks.toml config/git/

# Docker configuration
mv .dockerignore config/docker/

# Testing configuration
mv .audit-ci.json config/testing/

# Security configuration
mv .mcp.json config/security/

# General configuration
mv .npmignore config/
mv .releaserc.json config/

# Docker files
mkdir -p docker
mv Dockerfile docker/
mv docker-compose.yml docker/

echo "Phase 2 completed successfully"
```

### 2.3 Configuration Update Script
```bash
#!/bin/bash
# Update configuration references

echo "Updating configuration file references..."

# Update package.json scripts to use new paths
if [ -f package.json ]; then
    # This would need to be customized based on actual package.json content
    echo "Check package.json for hardcoded config paths"
fi

# Update any scripts that reference config files
find . -name "*.js" -o -name "*.ts" -o -name "*.sh" | xargs grep -l "\.eslintignore\|\.prettierignore" | while read file; do
    echo "Update needed in: $file"
done

echo "Configuration update analysis complete"
```

## Phase 3: Test & Runtime Data Migration (High Risk)

### 3.1 Create Test Structure
```bash
# Create test directories
mkdir -p tests/{unit,integration,e2e,fixtures,data}
mkdir -p data/{databases,logs,results,temp}
mkdir -p scripts/{build,deploy,testing}
```

### 3.2 Migration Script
```bash
#!/bin/bash
# Phase 3: Test and Runtime Data Migration

echo "Starting Phase 3: Test & Runtime Data Migration"

# Test files
mv advanced.test.js tests/
mv math.test.js tests/
mv test_quick_tool.test.js tests/

# Test scripts and utilities
mv test-agent-compliance.js tests/
mv test-agent-with-zai.js tests/
mv test-fork-zai-actual.js tests/
mv test-fork-zai-as-provider.js tests/
mv test-fork-zai.js tests/
mv test-provider-routing.js tests/
mv test-signals.js tests/
mv test-zai-direct-call.js tests/

# Test runners
mv test-runner.cjs scripts/testing/
mv test-runner.js scripts/testing/

# Test databases and temp files
mv test-*.db* tests/data/
mv test-memory-acl.db* tests/data/

# Test results
mv test-results*.json data/results/
mv test-results*.txt data/results/

# Runtime scripts
mv spawn-workers-enterprise.js scripts/deploy/
mv spawn-workers.cjs scripts/deploy/

# Development scripts
mv claude-flow.bat scripts/
mv claude-flow.ps1 scripts/

# Utility scripts
mv cleanup-verification-script.js scripts/
mv cleanup_plan.sh scripts/

# Runtime data and databases
mv claude-flow.db data/databases/
mv coordinator-registry.db data/databases/

# Configuration files
mv claude-flow.config.json config/

# Logs and temporary files
mv post-edit-pipeline.log data/logs/
mv output.txt data/temp/
mv test.txt data/temp/
mv test-fifo-results.txt data/temp/

# Development artifacts
mv dev-server.pid data/temp/

# VS Code configuration
mkdir -p .vscode
mv claude-flow-novice.code-workspace .vscode/

# Planning files
mkdir -p planning
mv sprint-1.2-implementation-plan.json planning/

# Quick utilities
mv quick-test.js scripts/

echo "Phase 3 completed successfully"
```

### 3.3 Test Validation Script
```bash
#!/bin/bash
# Phase 3 Validation

echo "Validating Phase 3 migration..."

# Check if tests can still be discovered
echo "Checking test discovery..."
find tests -name "*.test.js" -o -name "*.test.ts" | wc -l

# Check if test runners still work
echo "Testing basic test runner functionality..."
if command -v npm &> /dev/null; then
    npm test 2>&1 | head -10
fi

# Check database connections
echo "Checking database file locations..."
find data -name "*.db" -o -name "*.db-*"

echo "Phase 3 validation complete"
```

## Phase 4: Cleanup & Final Organization

### 4.1 Final Cleanup Script
```bash
#!/bin/bash
# Phase 4: Final Cleanup

echo "Starting Phase 4: Final Cleanup"

# Remove any remaining temporary files that shouldn't be in root
rm -f *.tmp *.log *.pid 2>/dev/null

# Ensure only essential files remain in root
echo "Files remaining in root:"
ls -la | grep "^-"

# Create .gitignore updates if needed
echo "Checking .gitignore coverage..."
echo "# Additions from cleanup" >> .gitignore
echo "*.tmp" >> .gitignore
echo "*.pid" >> .gitignore
echo "output.txt" >> .gitignore
echo "test.txt" >> .gitignore

echo "Phase 4 completed successfully"
```

### 4.2 Final Validation
```bash
#!/bin/bash
# Final Validation

echo "Performing final validation..."

# Count files in root
root_files=$(find . -maxdepth 1 -type f | wc -l)
echo "Files in root: $root_files (target: ≤15)"

# Essential files check
essential_files=".gitignore package.json package-lock.json tsconfig.json README.md LICENSE"
for file in $essential_files; do
    if [ -f "$file" ]; then
        echo "✓ $file present"
    else
        echo "✗ $file missing"
    fi
done

# Test basic functionality
echo "Testing basic npm commands..."
npm run test 2>&1 | head -5
npm run build 2>&1 | head -5 2>/dev/null || echo "No build script found"

echo "Final validation complete"
```

## Rollback Procedures

### Complete Rollback Script
```bash
#!/bin/bash
# Complete Rollback Script

echo "Starting complete rollback..."

# Return to backup branch
git checkout main
git checkout backup-before-cleanup

# Verify restoration
echo "Files restored in root:"
find . -maxdepth 1 -type f | wc -l

echo "Rollback complete"
```

### Partial Rollback Script
```bash
#!/bin/bash
# Partial Rollback Script (by phase)

PHASE=$1

case $PHASE in
    "1")
        echo "Rolling back Phase 1..."
        # Move documentation back to root
        find docs -name "*.md" -exec mv {} . \;
        find examples -name "*.js" -exec mv {} . \;
        ;;
    "2")
        echo "Rolling back Phase 2..."
        # Move config back to root
        find config -type f -exec mv {} . \;
        ;;
    "3")
        echo "Rolling back Phase 3..."
        # Move tests and data back to root
        find tests -type f -exec mv {} . \;
        find data -type f -exec mv {} . \;
        find scripts -type f -exec mv {} . \;
        ;;
    *)
        echo "Usage: $0 <phase_number>"
        echo "Available phases: 1, 2, 3"
        ;;
esac
```

## Automated Migration Script

### Complete Migration Automation
```bash
#!/bin/bash
# Complete Migration Script

set -e  # Exit on any error

echo "Starting automated root directory migration..."

# Pre-migration checks
echo "Running pre-migration checks..."
[ ! -f backup-manifest.txt ] && echo "Creating backup manifest..." && find . -maxdepth 1 -type f > backup-manifest.txt

# Create backup branch
echo "Creating backup branch..."
git checkout -b backup-before-cleanup 2>/dev/null || git checkout backup-before-cleanup
git add .
git commit -m "Backup before root directory cleanup - $(date)"

# Execute phases
echo "Executing Phase 1..."
./migrate-phase1.sh

echo "Executing Phase 2..."
./migrate-phase2.sh

echo "Executing Phase 3..."
./migrate-phase3.sh

echo "Executing Phase 4..."
./migrate-phase4.sh

# Final validation
echo "Running final validation..."
./final-validation.sh

echo "Migration completed successfully!"
echo "Please review changes and commit when satisfied."
```

## Post-Migration Tasks

### 1. Update Documentation
- Update README.md with new directory structure
- Update any onboarding documentation
- Create developer setup guide

### 2. Update CI/CD Pipelines
- Update GitHub Actions to use new paths
- Update any deployment scripts
- Test automated builds

### 3. Team Communication
- Announce changes to team
- Provide migration guide for any local changes
- Update project documentation

### 4. Monitoring
- Monitor for any build failures
- Watch for import errors in new code
- Collect feedback from team

## Success Metrics

1. **File Count**: Root directory files ≤15
2. **Build Success**: All builds pass without modification
3. **Test Success**: All tests pass without modification
4. **Navigation**: Team can find files easily
5. **No Regressions**: No functionality broken

## Risk Mitigation

1. **Backup**: Full git backup before starting
2. **Phased Approach**: Execute in phases with validation
3. **Rollback Ready**: Immediate rollback capability
4. **Testing**: Comprehensive testing after each phase
5. **Communication**: Clear communication with team

This implementation plan provides a safe, systematic approach to reorganizing the root directory while minimizing risk and ensuring all functionality remains intact.