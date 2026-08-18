#!/usr/bin/env bash

# Pre-Edit Backup System Test Script
# Tests backup creation, restore, and cleanup functionality

set -e

# Setup test environment
TEST_DIR="$(mktemp -d)"
cd "$TEST_DIR"

# Create test files
echo "Original Content 1" > file1.txt
echo "Original Content 2" > file2.txt

# Test 1: Pre-Edit Backup Creation
echo "=== Test 1: Pre-Edit Backup Creation ==="
./.claude/skills/pre-edit-backup/backup.sh file1.txt "test-agent-1"
./.claude/skills/pre-edit-backup/backup.sh file2.txt "test-agent-2"

# Verify backup directories created
BACKUP1=$(find .backups/test-agent-1 -type d | grep -E '[0-9]+_[a-f0-9]{64}$')
BACKUP2=$(find .backups/test-agent-2 -type d | grep -E '[0-9]+_[a-f0-9]{64}$')

[[ -n "$BACKUP1" ]] || { echo "Backup for file1.txt failed"; exit 1; }
[[ -n "$BACKUP2" ]] || { echo "Backup for file2.txt failed"; exit 1; }

# Test 2: Modify Files
echo "Modified Content 1" > file1.txt
echo "Modified Content 2" > file2.txt

# Test 3: Restore Functionality
echo "=== Test 3: Restore Functionality ==="
./.claude/skills/pre-edit-backup/restore.sh "$BACKUP1"
./.claude/skills/pre-edit-backup/restore.sh "$BACKUP2"

# Verify restore
diff file1.txt <(cat "${BACKUP1}/original_file") || { echo "Restore for file1.txt failed"; exit 1; }
diff file2.txt <(cat "${BACKUP2}/original_file") || { echo "Restore for file2.txt failed"; exit 1; }

# Test 4: Cleanup Mechanism
echo "=== Test 4: Cleanup Mechanism ==="
# Simulate time passage by modifying metadata
for backup_dir in "$BACKUP1" "$BACKUP2"; do
    jq '.backup_timestamp = 0' "${backup_dir}/backup_metadata.json" > temp.json
    mv temp.json "${backup_dir}/backup_metadata.json"
done

./.claude/skills/pre-edit-backup/cleanup.sh

# Verify cleanup
[[ ! -d "$BACKUP1" ]] || { echo "Cleanup failed for backup1"; exit 1; }
[[ ! -d "$BACKUP2" ]] || { echo "Cleanup failed for backup2"; exit 1; }

echo "All Pre-Edit Backup System Tests Passed Successfully!"

# Clean up test directory
cd /
rm -rf "$TEST_DIR"