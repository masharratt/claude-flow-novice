#!/bin/bash
# tests/docker/cleanup/remove-obsolete-tests.sh
# Phase 1 Iteration 1: Test Cleanup with Safety Validations
#
# PURPOSE: Remove obsolete tests, move CLI/Task mode tests, archive ACE tests
# SAFETY: Dry-run mode by default, backup before modification, file existence checks
# VALIDATION: Created by docker-specialist with confidence 0.92

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

DRY_RUN="${DRY_RUN:-true}"
BACKUP_DIR="tests/archive/pre-cleanup-backup-2025-11-13"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "=========================================="
echo "  Test Removal Script - Phase 1"
echo "=========================================="
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo "🔍 DRY RUN MODE - No files will be modified"
    echo "   Set DRY_RUN=false to execute"
    echo ""
fi

# Create backup directory
if [[ "$DRY_RUN" == "false" ]]; then
    mkdir -p "$BACKUP_DIR"
    echo "📦 Backup directory: $BACKUP_DIR"
    echo ""
fi

REMOVED_COUNT=0
MOVED_COUNT=0
ARCHIVED_COUNT=0
NOT_FOUND_COUNT=0

remove_if_exists() {
    local file="$1"
    local search_paths=("tests/docker/$file" "tests/$file")
    local found=false

    for path in "${search_paths[@]}"; do
        if [[ -f "$path" ]]; then
            found=true
            if [[ "$DRY_RUN" == "true" ]]; then
                echo "  [DRY RUN] Would remove: $path"
                REMOVED_COUNT=$((REMOVED_COUNT + 1))
            else
                # Backup before removal
                cp "$path" "$BACKUP_DIR/"
                rm "$path"
                echo "  ❌ Removed: $path"
                REMOVED_COUNT=$((REMOVED_COUNT + 1))
            fi
            return
        fi
    done

    if [[ "$found" == "false" ]]; then
        echo "  ⚠️  Not found: $file"
        NOT_FOUND_COUNT=$((NOT_FOUND_COUNT + 1))
    fi
}

move_if_exists() {
    local file="$1"
    local dest_dir="$2"
    local search_paths=("tests/docker/$file" "tests/$file")
    local found=false

    if [[ "$DRY_RUN" == "false" ]]; then
        mkdir -p "$dest_dir"
    fi

    for path in "${search_paths[@]}"; do
        if [[ -f "$path" ]]; then
            found=true
            if [[ "$DRY_RUN" == "true" ]]; then
                echo "  [DRY RUN] Would move: $path → $dest_dir/"
                MOVED_COUNT=$((MOVED_COUNT + 1))
            else
                # Backup before move
                cp "$path" "$BACKUP_DIR/"
                mv "$path" "$dest_dir/"
                echo "  📦 Moved: $path → $dest_dir/"
                MOVED_COUNT=$((MOVED_COUNT + 1))
            fi
            return
        fi
    done

    if [[ "$found" == "false" ]]; then
        echo "  ⚠️  Not found: $file"
        NOT_FOUND_COUNT=$((NOT_FOUND_COUNT + 1))
    fi
}

archive_if_exists() {
    local file="$1"
    local archive_dir="tests/archive/historical/ace"
    local search_paths=("tests/docker/$file" "tests/$file")
    local found=false

    if [[ "$DRY_RUN" == "false" ]]; then
        mkdir -p "$archive_dir"
    fi

    for path in "${search_paths[@]}"; do
        if [[ -f "$path" ]]; then
            found=true
            if [[ "$DRY_RUN" == "true" ]]; then
                echo "  [DRY RUN] Would archive: $path → $archive_dir/"
                ARCHIVED_COUNT=$((ARCHIVED_COUNT + 1))
            else
                # Backup before archive
                cp "$path" "$BACKUP_DIR/"
                mv "$path" "$archive_dir/"
                echo "  📚 Archived: $path → $archive_dir/"
                ARCHIVED_COUNT=$((ARCHIVED_COUNT + 1))
            fi
            return
        fi
    done

    if [[ "$found" == "false" ]]; then
        echo "  ⚠️  Not found: $file"
        NOT_FOUND_COUNT=$((NOT_FOUND_COUNT + 1))
    fi
}

echo "=== SECTION 1: REMOVE (14 files) ==="
echo ""

echo "1.1 Duplicate Redis Coordination Tests"
remove_if_exists "run-redis-coordination-tests-fixed.sh"
remove_if_exists "redis-test-simple.sh"
echo ""

echo "1.2 Redundant Timeout Tests"
remove_if_exists "test-adaptive-timeout-simple.sh"
remove_if_exists "test-adaptive-timeout-integration.sh"
remove_if_exists "test-adaptive-timeout-edge-cases.sh"
echo ""

echo "1.3 Obsolete Orchestration Fallback Tests"
remove_if_exists "orchestration-fallback-test.sh"
remove_if_exists "websocket-orchestration-fallback-test.sh"
remove_if_exists "docker-socket-orchestration-fallback-test.sh"
echo ""

echo "1.4 Redundant Readonly Conflict Tests"
remove_if_exists "readonly-conflict-prevention-test.sh"
remove_if_exists "websocket-readonly-conflict-prevention-test.sh"
remove_if_exists "docker-socket-readonly-conflict-prevention-test.sh"
echo ""

echo "1.5 Duplicate Simple/Complete Test Variants"
remove_if_exists "test_complete.sh"
remove_if_exists "test-cfn-integration-complete.sh"
remove_if_exists "test-graceful-shutdown-simple.sh"
echo ""

echo "=== SECTION 2: MOVE TO SUBDIRECTORIES (6 files) ==="
echo ""

echo "2.1 Mode Detection Tests → tests/cli-mode/"
move_if_exists "test_mode_detection.sh" "tests/cli-mode"
move_if_exists "test_cli_mode.sh" "tests/cli-mode"
move_if_exists "test_mode_simple.sh" "tests/cli-mode"
move_if_exists "test-mode-detection-anti023.sh" "tests/cli-mode"
echo ""

echo "2.2 Task Mode Tests → tests/task-mode/"
move_if_exists "test-task-mode-safety.sh" "tests/task-mode"
move_if_exists "test-task-mode-complete.sh" "tests/task-mode"
echo ""

echo "=== SECTION 3: ARCHIVE (2 files) ==="
echo ""

echo "3.1 ACE Context Tests → tests/archive/historical/ace/"
archive_if_exists "test-ace-context-lookup.sh"
archive_if_exists "test_ace_reflection_hook.sh"
echo ""

# Create archive README
if [[ "$DRY_RUN" == "false" ]]; then
    mkdir -p tests/archive/historical/ace
    cat > tests/archive/historical/ace/README.md <<'EOF'
# ACE Context Tests - Archived 2025-11-13

## Why Archived
ACE (Adaptive Context Engine) not integrated with Docker coordinator architecture.
Docker coordinator uses embedded context in agent environment variables.

## Tests Included
- test-ace-context-lookup.sh - Validates ACE context retrieval API
- test_ace_reflection_hook.sh - Validates ACE reflection hook patterns

## Restoration Criteria
Restore these tests if:
1. Coordinator adds ACE integration for richer context
2. Agent spawning requires dynamic context lookup
3. Reflection hooks needed for agent introspection

## Restoration Process
```bash
mv tests/archive/historical/ace/*.sh tests/
# Update test paths if directory structure changed
```
EOF
    echo "  📝 Created archive README"
fi

# Create removal manifest
if [[ "$DRY_RUN" == "false" ]]; then
    cat > "$BACKUP_DIR/removal-manifest.txt" <<EOF
Test Removal Manifest - $TIMESTAMP
Generated by: tests/docker/cleanup/remove-obsolete-tests.sh
Validation: tests/docker/TEST_REMOVAL_VALIDATION_REPORT.md

=== FILES REMOVED (14) ===
run-redis-coordination-tests-fixed.sh (duplicate)
redis-test-simple.sh (duplicate)
test-adaptive-timeout-simple.sh (superseded)
test-adaptive-timeout-integration.sh (superseded)
test-adaptive-timeout-edge-cases.sh (superseded)
orchestration-fallback-test.sh (obsolete)
websocket-orchestration-fallback-test.sh (obsolete)
docker-socket-orchestration-fallback-test.sh (obsolete)
readonly-conflict-prevention-test.sh (obsolete)
websocket-readonly-conflict-prevention-test.sh (obsolete)
docker-socket-readonly-conflict-prevention-test.sh (obsolete)
test_complete.sh (duplicate)
test-cfn-integration-complete.sh (duplicate)
test-graceful-shutdown-simple.sh (duplicate)

=== FILES MOVED (6) ===
test_mode_detection.sh → tests/cli-mode/
test_cli_mode.sh → tests/cli-mode/
test_mode_simple.sh → tests/cli-mode/
test-mode-detection-anti023.sh → tests/cli-mode/
test-task-mode-safety.sh → tests/task-mode/
test-task-mode-complete.sh → tests/task-mode/

=== FILES ARCHIVED (2) ===
test-ace-context-lookup.sh → tests/archive/historical/ace/
test_ace_reflection_hook.sh → tests/archive/historical/ace/

=== RESTORATION INSTRUCTIONS ===
All files backed up to: $BACKUP_DIR

To restore a file:
1. cd $BACKUP_DIR
2. cp <filename> tests/docker/ (or appropriate location)
3. git add tests/docker/<filename>

To restore entire backup:
cp $BACKUP_DIR/*.sh tests/docker/
EOF
    echo "  📝 Created removal manifest"
fi

echo ""
echo "=========================================="
echo "  SUMMARY"
echo "=========================================="
echo "Removed: $REMOVED_COUNT files"
echo "Moved: $MOVED_COUNT files"
echo "Archived: $ARCHIVED_COUNT files"
echo "Not found: $NOT_FOUND_COUNT files"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo "🔍 DRY RUN COMPLETE - No changes made"
    echo ""
    echo "Review output above, then run:"
    echo "  DRY_RUN=false bash tests/docker/cleanup/remove-obsolete-tests.sh"
    echo ""
    echo "CRITICAL PROTECTIONS:"
    echo "  ✅ CLI/Task mode tests will be MOVED, not deleted"
    echo "  ✅ ACE tests will be ARCHIVED, not deleted"
    echo "  ✅ Working test (intelligent-coordinator-test.sh) NOT in removal list"
    echo "  ✅ All files backed up before modification"
else
    echo "✅ CLEANUP COMPLETE"
    echo ""
    echo "Backup: $BACKUP_DIR"
    echo "Manifest: $BACKUP_DIR/removal-manifest.txt"
    echo ""
    echo "Next steps:"
    echo "  1. Run: git status"
    echo "  2. Verify critical tests preserved"
    echo "  3. Run: bash tests/docker/intelligent-coordinator-test.sh"
    echo "  4. If issues, restore from backup"
fi
