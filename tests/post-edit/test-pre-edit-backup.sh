#!/usr/bin/env bash

# Pre-Edit Backup System Test
# Tests backup, restore, and cleanup functionality
#
# Usage: ./tests/test-pre-edit-backup.sh
#
# Tests:
#   1. Backup creation with valid file
#   2. Backup metadata validation
#   3. File modification after backup
#   4. Restoration from backup
#   5. Restoration verification
#   6. Cleanup dry-run
#   7. Cleanup with expired backups

set -euo pipefail

# === Configuration ===

TEST_DIR="/tmp/pre-edit-backup-test"
TEST_FILE="${TEST_DIR}/test-file.txt"
TEST_AGENT_ID="test-agent-1"
BACKUP_BASE_DIR=".backups"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# === Test Utilities ===

test_passed=0
test_failed=0

log() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    test_passed=$((test_passed + 1))
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    test_failed=$((test_failed + 1))
}

# === Setup ===

log "Setting up test environment..."

# Clean up any previous test data
rm -rf "$TEST_DIR" "$BACKUP_BASE_DIR" 2>/dev/null || true

# Create test directory
mkdir -p "$TEST_DIR"

# Create test file
echo "Original content" > "$TEST_FILE"

log "Test environment ready"
echo ""

# === Test 1: Backup Creation ===

log "Test 1: Creating backup..."

if ! BACKUP_DIR=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$TEST_FILE" --agent-id "$TEST_AGENT_ID" 2>&1); then
    fail "Test 1: Failed to create backup"
    echo "Error: $BACKUP_DIR"
    exit 1
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
    fail "Test 1: Backup directory not created: $BACKUP_DIR"
    exit 1
fi

if [[ ! -f "${BACKUP_DIR}/original_file" ]]; then
    fail "Test 1: Backup file not found"
    exit 1
fi

if [[ ! -f "${BACKUP_DIR}/backup_metadata.json" ]]; then
    fail "Test 1: Backup metadata not found"
    exit 1
fi

success "Test 1: Backup created successfully at $BACKUP_DIR"
echo ""

# === Test 2: Metadata Validation ===

log "Test 2: Validating backup metadata..."

if ! command -v jq &>/dev/null; then
    error "Test 2: jq not found, skipping metadata validation"
else
    METADATA_FILE="${BACKUP_DIR}/backup_metadata.json"

    AGENT_ID=$(jq -r '.agent_id' "$METADATA_FILE")
    ORIGINAL_PATH=$(jq -r '.original_path' "$METADATA_FILE")
    BACKUP_STATUS=$(jq -r '.backup_status' "$METADATA_FILE")

    if [[ "$AGENT_ID" != "$TEST_AGENT_ID" ]]; then
        fail "Test 2: Agent ID mismatch (expected: $TEST_AGENT_ID, got: $AGENT_ID)"
    elif [[ "$ORIGINAL_PATH" != "$TEST_FILE" ]]; then
        fail "Test 2: Original path mismatch (expected: $TEST_FILE, got: $ORIGINAL_PATH)"
    elif [[ "$BACKUP_STATUS" != "active" ]]; then
        fail "Test 2: Backup status incorrect (expected: active, got: $BACKUP_STATUS)"
    else
        success "Test 2: Metadata validation passed"
    fi
fi

echo ""

# === Test 3: File Modification ===

log "Test 3: Modifying original file..."

echo "Modified content" > "$TEST_FILE"

ORIGINAL_CONTENT=$(cat "${BACKUP_DIR}/original_file")
MODIFIED_CONTENT=$(cat "$TEST_FILE")

if [[ "$ORIGINAL_CONTENT" == "$MODIFIED_CONTENT" ]]; then
    fail "Test 3: File modification failed"
else
    success "Test 3: File modified successfully"
fi

echo ""

# === Test 4: File Restoration ===

log "Test 4: Restoring file from backup..."

if ! ./.claude/skills/pre-edit-backup/restore.sh "$BACKUP_DIR" 2>&1; then
    fail "Test 4: Restoration failed"
    exit 1
fi

success "Test 4: File restored successfully"
echo ""

# === Test 5: Restoration Verification ===

log "Test 5: Verifying restored content..."

RESTORED_CONTENT=$(cat "$TEST_FILE")

if [[ "$RESTORED_CONTENT" != "Original content" ]]; then
    fail "Test 5: Restored content incorrect (expected: 'Original content', got: '$RESTORED_CONTENT')"
else
    success "Test 5: Restored content matches original"
fi

echo ""

# === Test 6: List Backups ===

log "Test 6: Listing available backups..."

if ./.claude/skills/pre-edit-backup/restore.sh --list "$TEST_FILE" "$TEST_AGENT_ID" 2>&1 | grep -q "Backup:"; then
    success "Test 6: Backup listing works"
else
    fail "Test 6: Backup listing failed"
fi

echo ""

# === Test 7: Cleanup Dry-Run ===

log "Test 7: Testing cleanup dry-run..."

if ./.claude/skills/pre-edit-backup/cleanup.sh --dry-run 2>&1 | grep -q "Cleanup completed"; then
    success "Test 7: Cleanup dry-run works"
else
    fail "Test 7: Cleanup dry-run failed"
fi

echo ""

# === Test 8: Cleanup with Expired Backups ===

log "Test 8: Testing cleanup with expired backups..."

# Modify metadata to expire the backup (set TTL to 0)
if command -v jq &>/dev/null; then
    METADATA_FILE="${BACKUP_DIR}/backup_metadata.json"
    TEMP_FILE=$(mktemp)
    jq '.backup_ttl = 0' "$METADATA_FILE" > "$TEMP_FILE"
    mv "$TEMP_FILE" "$METADATA_FILE"

    # Run cleanup
    ./.claude/skills/pre-edit-backup/cleanup.sh 2>&1 | grep -q "Cleanup completed"

    # Check if backup was removed
    if [[ ! -d "$BACKUP_DIR" ]]; then
        success "Test 8: Expired backup cleaned up successfully"
    else
        fail "Test 8: Expired backup was not removed"
    fi
else
    echo -e "${YELLOW}[SKIP]${NC} Test 8: jq not available, skipping cleanup test"
fi

echo ""

# === Cleanup ===

log "Cleaning up test environment..."
rm -rf "$TEST_DIR" "$BACKUP_BASE_DIR" 2>/dev/null || true

# === Summary ===

echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="
echo -e "${GREEN}Passed:${NC} $test_passed"
echo -e "${RED}Failed:${NC} $test_failed"
echo "========================================="

if [[ $test_failed -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
