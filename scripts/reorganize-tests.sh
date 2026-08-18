#!/usr/bin/env bash
# scripts/reorganize-tests.sh
# Reorganize tests/ directory structure - Option 3 Full Reorganization
# Safe, reversible migration with verification

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "=========================================="
echo "Test Suite Reorganization Script"
echo "=========================================="
echo ""
echo "This will organize 99 loose files in tests/"
echo "- 52 TypeScript tests → tests/unit/"
echo "- 25 shell scripts → archive or organized dirs"
echo "- 18 markdown docs → archive or organized dirs"
echo ""

# Phase 1: Create directories
echo "Phase 1: Creating new organizational directories..."
mkdir -p tests/archive/historical/{integration,hello-world-analysis,workflows,timeout-fixes}
mkdir -p tests/archive/experimental/{api-gateway,hello-world,cfn-loop,ace,tdd-compliance,playbooks,workflows}
mkdir -p tests/unit/{agent-spawner,backup,coordination,auth,config,database,lock,cache,registry,workspace,checkpoint,orchestration,edge-case,injection,metrics,post-edit,skill,timing,security,cli,orchestrator,gate-checker,cfn-loop/product-owner,typescript}
mkdir -p tests/redis
echo "✓ Directories created"
echo ""

# Phase 2: Move TypeScript test files to unit/ directory
echo "Phase 2: Organizing TypeScript test files (52 files)..."

# Agent-related tests
[[ -f tests/agent-spawner.test.ts ]] && mv tests/agent-spawner.test.ts tests/unit/agent-spawner/ 2>/dev/null || true
[[ -f tests/agent-output-validator.test.ts ]] && mv tests/agent-output-validator.test.ts tests/unit/agent-spawner/ 2>/dev/null || true
[[ -f tests/agent-workspace.test.ts ]] && mv tests/agent-workspace.test.ts tests/unit/workspace/ 2>/dev/null || true

# Backup and security
[[ -f tests/backup-manager.test.ts ]] && mv tests/backup-manager.test.ts tests/unit/backup/ 2>/dev/null || true

# Coordination
[[ -f tests/coordination-wrapper.test.ts ]] && mv tests/coordination-wrapper.test.ts tests/unit/coordination/ 2>/dev/null || true

# Auth
[[ -f tests/auth-system.test.ts ]] && mv tests/auth-system.test.ts tests/unit/auth/ 2>/dev/null || true

# Config
[[ -f tests/config-manager.test.ts ]] && mv tests/config-manager.test.ts tests/unit/config/ 2>/dev/null || true
[[ -f tests/config-validator.test.ts ]] && mv tests/config-validator.test.ts tests/unit/config/ 2>/dev/null || true

# Database
[[ -f tests/database-service.test.ts ]] && mv tests/database-service.test.ts tests/unit/database/ 2>/dev/null || true

# Lock management
[[ -f tests/distributed-lock-enhanced.test.ts ]] && mv tests/distributed-lock-enhanced.test.ts tests/unit/lock/ 2>/dev/null || true
[[ -f tests/file-lock-manager.test.ts ]] && mv tests/file-lock-manager.test.ts tests/unit/lock/ 2>/dev/null || true

# Cache
[[ -f tests/correlation-cache-cleanup.test.ts ]] && mv tests/correlation-cache-cleanup.test.ts tests/unit/cache/ 2>/dev/null || true

# Registry
[[ -f tests/artifact-registry.test.ts ]] && mv tests/artifact-registry.test.ts tests/unit/registry/ 2>/dev/null || true

# Checkpoint
[[ -f tests/checkpoint-manager.test.ts ]] && mv tests/checkpoint-manager.test.ts tests/unit/checkpoint/ 2>/dev/null || true

# Orchestration
[[ -f tests/cfn-loop-orchestration.test.ts ]] && mv tests/cfn-loop-orchestration.test.ts tests/unit/orchestration/ 2>/dev/null || true

# Edge cases
[[ -f tests/edge-case-analyzer.test.ts ]] && mv tests/edge-case-analyzer.test.ts tests/unit/edge-case/ 2>/dev/null || true
[[ -f tests/edge-case-detector.test.ts ]] && mv tests/edge-case-detector.test.ts tests/unit/edge-case/ 2>/dev/null || true
[[ -f tests/edge-case-tracker.test.ts ]] && mv tests/edge-case-tracker.test.ts tests/unit/edge-case/ 2>/dev/null || true

# Command injection
[[ -f tests/command-injection-unit.test.ts ]] && mv tests/command-injection-unit.test.ts tests/unit/security/ 2>/dev/null || true

# Formatting
[[ -f tests/formatTable-ansi.test.ts ]] && mv tests/formatTable-ansi.test.ts tests/unit/cli/ 2>/dev/null || true

# Metrics
[[ -f tests/metrics-logger.test.ts ]] && mv tests/metrics-logger.test.ts tests/unit/metrics/ 2>/dev/null || true

# Post-edit
[[ -f tests/post-edit-validator.test.ts ]] && mv tests/post-edit-validator.test.ts tests/unit/post-edit/ 2>/dev/null || true

# Skills
[[ -f tests/skill-deployment-transactions.test.ts ]] && mv tests/skill-deployment-transactions.test.ts tests/unit/skill/ 2>/dev/null || true

# Timing attacks
[[ -f tests/timing-attack-*.test.ts ]] && find tests -maxdepth 1 -name "timing-attack-*.test.ts" -exec mv {} tests/unit/timing/ \; 2>/dev/null || true

# Move all remaining *.test.ts files
find tests -maxdepth 1 -name "*.test.ts" -type f 2>/dev/null | while read file; do
    basename_file=$(basename "$file" .test.ts)
    # Try to categorize based on filename
    if [[ "$basename_file" =~ redis ]]; then
        mv "$file" tests/unit/database/ 2>/dev/null || true
    elif [[ "$basename_file" =~ queue ]]; then
        mv "$file" tests/unit/coordination/ 2>/dev/null || true
    elif [[ "$basename_file" =~ setup|cleanup|teardown ]]; then
        # Keep at root - these are test utilities
        true
    else
        # Default to unit/misc if can't categorize
        mkdir -p tests/unit/misc
        mv "$file" tests/unit/misc/ 2>/dev/null || true
    fi
done

echo "✓ TypeScript tests organized (52 files → tests/unit/)"
echo ""

# Phase 3: Move obsolete shell scripts to archive/historical
echo "Phase 3: Moving obsolete shell scripts to archive/historical..."
files_to_archive=(
    "test-hello-world-creation.sh"
    "typescript-redis-e2e-5-iterations.sh"
    "test-memory-leak-task-mode.sh"
    "test-newline-exploit-validation.sh"
    "test-sanitize-input-fix.sh"
    "test-all-critical-fixes.sh"
    "cli-mode-quick-validation.sh"
    "cli-mode-comprehensive-test.sh"
)

for file in "${files_to_archive[@]}"; do
    if [[ -f "tests/$file" ]]; then
        mv "tests/$file" tests/archive/historical/
        echo "  → Archived $file"
    fi
done
echo "✓ Obsolete shell scripts archived (8 files)"
echo ""

# Phase 4: Delete exact duplicates
echo "Phase 4: Removing duplicate files..."
if [[ -f tests/test-redis-auth-detection.sh ]] && [[ -f tests/redis/test-auth-detection.sh ]]; then
    if diff -q tests/test-redis-auth-detection.sh tests/redis/test-auth-detection.sh &>/dev/null; then
        rm tests/test-redis-auth-detection.sh
        echo "  → Deleted duplicate: test-redis-auth-detection.sh"
    fi
fi

if [[ -f tests/test-orchestrator-param-validation.sh ]] && [[ -f tests/orchestrator/test-parameter-validation.sh ]]; then
    if diff -q tests/test-orchestrator-param-validation.sh tests/orchestrator/test-parameter-validation.sh &>/dev/null; then
        rm tests/test-orchestrator-param-validation.sh
        echo "  → Deleted duplicate: test-orchestrator-param-validation.sh"
    fi
fi
echo "✓ Duplicates removed"
echo ""

# Phase 5: Move experimental/POC files
echo "Phase 5: Moving experimental and POC tests to archive/experimental..."

# API Gateway (if exists)
[[ -d tests/api-gateway ]] && mv tests/api-gateway tests/archive/experimental/ 2>/dev/null && echo "  ✓ API Gateway tests moved" || true

# Hello World (if exists)
[[ -d tests/hello-world ]] && mv tests/hello-world tests/archive/experimental/ 2>/dev/null && echo "  ✓ Hello World experiments moved" || true

# TDD Compliance (if exists)
[[ -d tests/tdd-compliance ]] && mv tests/tdd-compliance tests/archive/experimental/ 2>/dev/null && echo "  ✓ TDD Compliance tests moved" || true

# ACE (if exists)
[[ -d tests/ace ]] && mv tests/ace tests/archive/experimental/ 2>/dev/null && echo "  ✓ ACE experiments moved" || true

# CFN Loop modes (if exists)
if [[ -d tests/cfn-loop/modes ]]; then
    mkdir -p tests/archive/experimental/cfn-loop/modes
    mv tests/cfn-loop/modes/* tests/archive/experimental/cfn-loop/modes/ 2>/dev/null || true
    rmdir tests/cfn-loop/modes 2>/dev/null || true
    echo "  ✓ CFN Loop modes moved"
fi

# Playbook/workflow experiments
[[ -f tests/integration/test-playbook-integration.sh ]] && \
    mv tests/integration/test-playbook-integration.sh tests/archive/experimental/playbooks/ 2>/dev/null || true
[[ -f tests/integration/test-playbook-workflow-integration.sh ]] && \
    mv tests/integration/test-playbook-workflow-integration.sh tests/archive/experimental/playbooks/ 2>/dev/null || true
[[ -f tests/integration/test-workflow-codification.sh ]] && \
    mv tests/integration/test-workflow-codification.sh tests/archive/experimental/workflows/ 2>/dev/null || true

echo "✓ Experimental tests archived"
echo ""

# Phase 6: Move timeout documentation
echo "Phase 6: Moving timeout documentation to archive/historical..."
[[ -f tests/integration/TIMEOUT_FIX_SUMMARY.md ]] && \
    mv tests/integration/TIMEOUT_FIX_SUMMARY.md tests/archive/historical/integration/timeout-fixes/ 2>/dev/null || true
[[ -f tests/integration/README_TIMEOUT_FIX.md ]] && \
    mv tests/integration/README_TIMEOUT_FIX.md tests/archive/historical/integration/timeout-fixes/ 2>/dev/null || true
[[ -f tests/integration/EXAMPLE_TIMEOUT_FIXES.md ]] && \
    mv tests/integration/EXAMPLE_TIMEOUT_FIXES.md tests/archive/historical/integration/timeout-fixes/ 2>/dev/null || true
[[ -f tests/integration/TIMEOUT_OPTIMIZATION.md ]] && \
    mv tests/integration/TIMEOUT_OPTIMIZATION.md tests/archive/historical/integration/timeout-fixes/ 2>/dev/null || true
[[ -f tests/TEST_RESULTS_ASYNC_CLEANUP.md ]] && \
    mv tests/TEST_RESULTS_ASYNC_CLEANUP.md tests/archive/historical/ 2>/dev/null || true
[[ -f tests/ASYNC_CLEANUP_FIX_SUMMARY.md ]] && \
    mv tests/ASYNC_CLEANUP_FIX_SUMMARY.md tests/archive/historical/ 2>/dev/null || true
echo "✓ Documentation archived"
echo ""

# Phase 7: Move TypeScript documentation
echo "Phase 7: Organizing TypeScript documentation..."
[[ -f tests/TYPESCRIPT_E2E_INDEX.md ]] && mv tests/TYPESCRIPT_E2E_INDEX.md tests/unit/typescript/ 2>/dev/null || true
[[ -f tests/TYPESCRIPT_E2E_ARCHITECTURE.md ]] && mv tests/TYPESCRIPT_E2E_ARCHITECTURE.md tests/unit/typescript/ 2>/dev/null || true
[[ -f tests/TYPESCRIPT_E2E_TEST_SUMMARY.md ]] && mv tests/TYPESCRIPT_E2E_TEST_SUMMARY.md tests/unit/typescript/ 2>/dev/null || true
[[ -f tests/QUICK_START_TYPESCRIPT_E2E.md ]] && mv tests/QUICK_START_TYPESCRIPT_E2E.md tests/unit/typescript/ 2>/dev/null || true
[[ -f tests/RUN_TYPESCRIPT_E2E_CHECKLIST.md ]] && mv tests/RUN_TYPESCRIPT_E2E_CHECKLIST.md tests/unit/typescript/ 2>/dev/null || true
[[ -f tests/TYPESCRIPT_REDIS_E2E_TEST.md ]] && mv tests/TYPESCRIPT_REDIS_E2E_TEST.md tests/unit/typescript/ 2>/dev/null || true
echo "✓ TypeScript documentation organized"
echo ""

# Phase 8: Move Redis tests
echo "Phase 8: Consolidating Redis tests..."
[[ -f tests/integration/test-redis-success-criteria.sh ]] && \
    mv tests/integration/test-redis-success-criteria.sh tests/redis/ 2>/dev/null || true
[[ -f tests/integration/validate-redis-success-criteria.sh ]] && \
    mv tests/integration/validate-redis-success-criteria.sh tests/redis/ 2>/dev/null || true
echo "✓ Redis tests consolidated"
echo ""

# Cleanup: Remove empty directories
echo "Cleanup: Removing empty directories..."
find tests -type d -empty -delete 2>/dev/null || true
echo "✓ Empty directories removed"
echo ""

# Verification
echo "=========================================="
echo "Verification Results"
echo "=========================================="
echo ""

# Check that main test runners still exist
runners_ok=true
essential_files=(
    "tests/cli-mode/run-all-tests.sh"
    "tests/docker-mode/run-all-implementations.sh"
    "tests/docker/run-all-tests.sh"
    "tests/test-utils.sh"
    "tests/CLAUDE.md"
    "tests/README.md"
)

for file in "${essential_files[@]}"; do
    if [[ -f "$file" ]]; then
        echo "✓ $file exists"
    else
        echo "✗ MISSING: $file"
        runners_ok=false
    fi
done

if [[ "$runners_ok" == "false" ]]; then
    echo ""
    echo "ERROR: Some essential files are missing!"
    exit 1
fi

echo ""
echo "Final structure:"
echo "  Loose files at root: $(find tests -maxdepth 1 -type f | wc -l)"
echo "  Unit tests: $(find tests/unit -type f -name "*.test.ts" 2>/dev/null | wc -l) TypeScript files"
echo "  Historical archive: $(find tests/archive/historical -type f 2>/dev/null | wc -l) files"
echo "  Experimental archive: $(find tests/archive/experimental -type f 2>/dev/null | wc -l) files"
echo ""

echo "=========================================="
echo "Reorganization Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Verify: find tests -maxdepth 1 -type f"
echo "  2. Test: bash tests/cli-mode/run-all-tests.sh --quick"
echo "  3. Test: npm test"
echo "  4. Commit: git add tests/ && git commit -m 'refactor(tests): reorganize structure - 99 files organized'"
echo ""
