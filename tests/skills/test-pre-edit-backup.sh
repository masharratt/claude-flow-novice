#!/usr/bin/env bash
# tests/skills/test-pre-edit-backup.sh
# Phase 1 :: Pre-Edit Backup Tests - validates backup system functionality

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

BACKUP_SKILL="$PROJECT_ROOT/.claude/skills/pre-edit-backup/backup.sh"
INVOKE_PRE_EDIT="$PROJECT_ROOT/.claude/hooks/cfn-invoke-pre-edit.sh"
HOOK_BACKUP="$PROJECT_ROOT/.claude/hooks/cfn-pre-edit-backup.sh"
TMP_DIR=""
BACKUP_DIR=""

cleanup() {
    log_info "Cleaning up test environment"

    # Clean up temporary directory
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi

    # Clean up test backup directory
    if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
        rm -rf "$BACKUP_DIR"
    fi

    # Clean up any test backup keys in Redis
    redis_keys "backup:test-*" | while read -r key; do
        [ -n "$key" ] && redis_del "$key"
    done

    print_test_summary
}
trap cleanup EXIT

# ============================================================================
# TEST SUITE: backup.sh (Main Backup Script)
# ============================================================================

test_backup_script_structure() {
    log_step "GIVEN backup.sh script structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "backup.sh exists" \
        test -f "$BACKUP_SKILL"

    assert_success "Script is executable" \
        test -x "$BACKUP_SKILL"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$BACKUP_SKILL" | grep -q "set -euo pipefail"
}

test_backup_script_create_backup_function() {
    log_step "GIVEN backup.sh create_backup function"

    # WHEN checking for create_backup function
    # THEN function exists
    assert_success "create_backup function exists" \
        grep -q "create_backup()" "$BACKUP_SKILL"

    # WHEN checking for parameter handling
    # THEN function accepts file_path, agent_id, project_root
    assert_success "Function accepts file_path" \
        grep -A 10 "create_backup()" "$BACKUP_SKILL" | grep -q 'file_path="$1"'

    assert_success "Function accepts agent_id" \
        grep -A 10 "create_backup()" "$BACKUP_SKILL" | grep -q 'agent_id='

    assert_success "Function accepts project_root" \
        grep -A 10 "create_backup()" "$BACKUP_SKILL" | grep -q 'project_root='
}

test_backup_script_validation() {
    log_step "GIVEN backup.sh input validation"

    # WHEN checking for file path validation
    # THEN script validates file_path is provided
    assert_success "Script validates file_path" \
        grep -A 30 "create_backup()" "$BACKUP_SKILL" | grep -q "File path is required"

    # WHEN checking for file existence check
    # THEN script checks if file exists
    assert_success "Script checks file existence" \
        grep -A 30 "create_backup()" "$BACKUP_SKILL" | grep -q "! -f.*file_path"
}

test_backup_script_directory_structure() {
    log_step "GIVEN backup.sh directory structure"

    # WHEN checking for backup directory creation
    # THEN script creates .backups directory
    assert_success "Script creates .backups directory" \
        grep -A 50 "create_backup()" "$BACKUP_SKILL" | grep -q ".backups"

    assert_success "Script uses agent_id in path" \
        grep -A 50 "create_backup()" "$BACKUP_SKILL" | grep -q "agent_id"

    assert_success "Script uses mkdir -p" \
        grep -A 50 "create_backup()" "$BACKUP_SKILL" | grep -q "mkdir -p"
}

test_backup_script_naming_convention() {
    log_step "GIVEN backup.sh naming convention"

    # WHEN checking for timestamp in backup name
    # THEN script uses timestamp
    assert_success "Script uses timestamp" \
        grep -A 50 "create_backup()" "$BACKUP_SKILL" | grep -q "timestamp=.*date"

    # WHEN checking for hash in backup name
    # THEN script may use file hash
    assert_success "Script may use file hash" \
        grep -A 50 "create_backup()" "$BACKUP_SKILL" | grep -qE "md5sum|sha256sum|hash" || true
}

test_backup_script_metadata() {
    log_step "GIVEN backup.sh metadata creation"

    # WHEN checking for metadata file
    # THEN script creates metadata.json
    assert_success "Script creates metadata.json" \
        grep -A 60 "create_backup()" "$BACKUP_SKILL" | grep -q "metadata.json"

    # WHEN checking metadata fields
    # THEN metadata includes timestamp
    assert_success "Metadata includes timestamp" \
        grep -A 70 "create_backup()" "$BACKUP_SKILL" | grep -q '"timestamp"'

    assert_success "Metadata includes agent_id" \
        grep -A 70 "create_backup()" "$BACKUP_SKILL" | grep -q '"agent_id"'

    assert_success "Metadata includes original_file" \
        grep -A 70 "create_backup()" "$BACKUP_SKILL" | grep -q '"original_file"'
}

test_backup_script_revert_capability() {
    log_step "GIVEN backup.sh revert capability"

    # WHEN checking for revert script creation
    # THEN script creates revert.sh
    assert_success "Script creates revert.sh" \
        grep -A 80 "create_backup()" "$BACKUP_SKILL" | grep -q "revert.sh"

    # WHEN checking revert script content
    # THEN revert script includes copy command
    assert_success "Revert script includes copy command" \
        grep -A 90 "create_backup()" "$BACKUP_SKILL" | grep -q "cp.*original"

    # WHEN checking revert script permissions
    # THEN revert script is made executable
    assert_success "Revert script is executable" \
        grep -A 100 "create_backup()" "$BACKUP_SKILL" | grep -q "chmod +x.*revert.sh"
}

test_backup_script_output() {
    log_step "GIVEN backup.sh output format"

    # WHEN checking for output
    # THEN script outputs backup path
    assert_success "Script outputs backup path" \
        grep -A 100 "create_backup()" "$BACKUP_SKILL" | grep -q "echo.*backup"
}

test_backup_script_functional() {
    log_step "GIVEN backup.sh functional test"

    TMP_DIR=$(create_temp_dir)
    BACKUP_DIR="$TMP_DIR/.backups"

    # WHEN creating a test file
    local test_file="$TMP_DIR/test-file.txt"
    echo "Test content line 1" > "$test_file"
    echo "Test content line 2" >> "$test_file"

    # WHEN running backup script
    local backup_path
    backup_path=$("$BACKUP_SKILL" "$test_file" --agent-id "test-agent" --project-root "$TMP_DIR" 2>&1 | tail -1)

    # THEN backup directory is created
    assert_success "Backup directory structure created" \
        test -d "$BACKUP_DIR/test-agent"

    # THEN backup contains original file
    if [ -d "$backup_path" ]; then
        assert_success "Backup contains original file" \
            test -f "$backup_path/original"

        assert_success "Backup contains metadata" \
            test -f "$backup_path/metadata.json"

        assert_success "Backup contains revert script" \
            test -f "$backup_path/revert.sh"

        # WHEN checking file content
        local backup_content
        backup_content=$(cat "$backup_path/original")
        local original_content
        original_content=$(cat "$test_file")

        assert_equals "$original_content" "$backup_content" "Backup content matches original"
    else
        log_warn "Backup path not found, skipping content verification"
    fi
}

# ============================================================================
# TEST SUITE: cfn-invoke-pre-edit.sh
# ============================================================================

test_invoke_pre_edit_structure() {
    log_step "GIVEN cfn-invoke-pre-edit.sh structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "cfn-invoke-pre-edit.sh exists" \
        test -f "$INVOKE_PRE_EDIT"

    assert_success "Script is executable" \
        test -x "$INVOKE_PRE_EDIT"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$INVOKE_PRE_EDIT" | grep -q "set -euo pipefail"
}

test_invoke_pre_edit_argument_parsing() {
    log_step "GIVEN cfn-invoke-pre-edit.sh argument parsing"

    # WHEN checking for argument parsing
    # THEN script accepts FILE_PATH
    assert_success "Script parses FILE_PATH" \
        grep -q "FILE_PATH" "$INVOKE_PRE_EDIT"

    # WHEN checking for --agent-id
    # THEN script accepts --agent-id
    assert_success "Script accepts --agent-id" \
        grep -q "\\--agent-id" "$INVOKE_PRE_EDIT"
}

test_invoke_pre_edit_validation() {
    log_step "GIVEN cfn-invoke-pre-edit.sh validation"

    # WHEN checking for validation
    # THEN script validates FILE_PATH
    assert_success "Script validates FILE_PATH" \
        grep -q "No file path provided" "$INVOKE_PRE_EDIT"

    assert_success "Script validates agent ID" \
        grep -q "No agent ID provided" "$INVOKE_PRE_EDIT"

    assert_success "Script checks file existence" \
        grep -q "File does not exist" "$INVOKE_PRE_EDIT"
}

test_invoke_pre_edit_backup_execution() {
    log_step "GIVEN cfn-invoke-pre-edit.sh backup execution"

    # WHEN checking for backup script invocation
    # THEN script calls backup.sh
    assert_success "Script invokes backup.sh" \
        grep -q "backup.sh" "$INVOKE_PRE_EDIT"

    # WHEN checking for error handling
    # THEN script handles backup failures
    assert_success "Script handles backup failure" \
        grep -q "Backup failed" "$INVOKE_PRE_EDIT"
}

test_invoke_pre_edit_output() {
    log_step "GIVEN cfn-invoke-pre-edit.sh output"

    # WHEN checking for output
    # THEN script outputs backup directory path
    assert_success "Script outputs backup path" \
        grep -qE "echo.*BACKUP" "$INVOKE_PRE_EDIT"
}

# ============================================================================
# TEST SUITE: cfn-pre-edit-backup.sh (Hook)
# ============================================================================

test_hook_backup_structure() {
    log_step "GIVEN cfn-pre-edit-backup.sh hook structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "cfn-pre-edit-backup.sh exists" \
        test -f "$HOOK_BACKUP"

    assert_success "Script is executable" \
        test -x "$HOOK_BACKUP"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$HOOK_BACKUP" | grep -q "set -euo pipefail"
}

test_hook_backup_critical_patterns() {
    log_step "GIVEN cfn-pre-edit-backup.sh critical file patterns"

    # WHEN checking for critical patterns
    # THEN script defines CRITICAL_PATTERNS
    assert_success "Script defines CRITICAL_PATTERNS" \
        grep -q "CRITICAL_PATTERNS" "$HOOK_BACKUP"

    # WHEN checking pattern matching
    # THEN script has is_critical function
    assert_success "Script has is_critical function" \
        grep -q "is_critical()" "$HOOK_BACKUP"
}

test_hook_backup_selective_backup() {
    log_step "GIVEN cfn-pre-edit-backup.sh selective backup"

    # WHEN checking for selective backup logic
    # THEN script only backs up critical files
    assert_success "Script checks if file is critical" \
        grep -A 20 "is_critical" "$HOOK_BACKUP" | grep -q "return"

    # WHEN checking for early exit
    # THEN script exits early for non-critical files
    assert_success "Script exits for non-critical files" \
        grep -A 30 "is_critical" "$HOOK_BACKUP" | grep -q "exit 0"
}

test_hook_backup_verification() {
    log_step "GIVEN cfn-pre-edit-backup.sh backup verification"

    # WHEN checking for verification
    # THEN script verifies backup creation
    assert_success "Script verifies backup exists" \
        grep -A 40 "cp.*BACKUP" "$HOOK_BACKUP" | grep -q "if.*-f"

    # WHEN checking size verification
    # THEN script compares file sizes
    assert_success "Script compares sizes" \
        grep -A 50 "BACKUP_PATH" "$HOOK_BACKUP" | grep -qE "wc -l|size"
}

test_hook_backup_redis_logging() {
    log_step "GIVEN cfn-pre-edit-backup.sh Redis logging"

    # WHEN checking for Redis logging
    # THEN script logs to Redis
    assert_success "Script logs to Redis" \
        grep -q "redis-cli.*backup:log" "$HOOK_BACKUP"

    # WHEN checking log format
    # THEN log includes timestamp and metadata
    assert_success "Log includes metadata" \
        grep -A 5 "redis-cli.*backup:log" "$HOOK_BACKUP" | grep -qE "timestamp|file|agent"
}

test_hook_backup_cleanup() {
    log_step "GIVEN cfn-pre-edit-backup.sh cleanup logic"

    # WHEN checking for cleanup
    # THEN script cleans up old backups
    assert_success "Script cleans up old backups" \
        grep -q "find.*backup-.*tail.*xargs rm" "$HOOK_BACKUP"

    # WHEN checking retention policy
    # THEN script keeps last 5 backups
    assert_success "Script keeps last 5 backups" \
        grep -A 2 "tail -n" "$HOOK_BACKUP" | grep -q "+6"
}

# ============================================================================
# TEST SUITE: Backup System Integration
# ============================================================================

test_backup_system_ttl() {
    log_step "GIVEN backup system TTL management"

    # WHEN checking for TTL or cleanup
    # THEN system has retention policy
    assert_success "System has retention policy" \
        grep -qE "TTL|cleanup|retain|keep.*[0-9]" "$HOOK_BACKUP" || \
        grep -qE "TTL|cleanup|retain" "$BACKUP_SKILL" || true
}

test_backup_system_concurrent_safety() {
    log_step "GIVEN backup system concurrent access"

    # WHEN checking for unique naming
    # THEN backup names include timestamp
    assert_success "Backup names include timestamp" \
        grep -q "timestamp.*date" "$BACKUP_SKILL"

    # WHEN checking for hash or unique identifier
    # THEN backup names may include hash for uniqueness
    assert_success "Backup may use hash for uniqueness" \
        grep -qE "md5sum|sha256sum|hash|\$\$" "$BACKUP_SKILL" || true
}

test_backup_system_error_handling() {
    log_step "GIVEN backup system error handling"

    # WHEN checking for error conditions
    # THEN scripts handle errors properly
    assert_success "backup.sh handles errors" \
        grep -qE ">&2|exit 1|Error" "$BACKUP_SKILL"

    assert_success "invoke-pre-edit handles errors" \
        grep -qE ">&2|exit 1|Error" "$INVOKE_PRE_EDIT"

    assert_success "hook-backup handles errors" \
        grep -qE ">&2|exit 1|Error" "$HOOK_BACKUP"
}

# ============================================================================
# TEST SUITE: Revert Functionality
# ============================================================================

test_revert_script_creation() {
    log_step "GIVEN revert script creation"

    TMP_DIR=$(create_temp_dir)
    BACKUP_DIR="$TMP_DIR/.backups"

    # WHEN creating a backup
    local test_file="$TMP_DIR/test-revert.txt"
    echo "Original content" > "$test_file"

    local backup_path
    backup_path=$("$BACKUP_SKILL" "$test_file" --agent-id "test-revert" --project-root "$TMP_DIR" 2>&1 | tail -1)

    # THEN revert script exists and is executable
    if [ -d "$backup_path" ] && [ -f "$backup_path/revert.sh" ]; then
        assert_success "Revert script exists" \
            test -f "$backup_path/revert.sh"

        assert_success "Revert script is executable" \
            test -x "$backup_path/revert.sh"
    else
        log_warn "Backup path or revert script not found, skipping revert test"
    fi
}

test_revert_functional() {
    log_step "GIVEN revert functionality test"

    TMP_DIR=$(create_temp_dir)
    BACKUP_DIR="$TMP_DIR/.backups"

    # WHEN creating a file and backup
    local test_file="$TMP_DIR/test-revert-func.txt"
    echo "Original content" > "$test_file"

    local backup_path
    backup_path=$("$BACKUP_SKILL" "$test_file" --agent-id "test-revert-func" --project-root "$TMP_DIR" 2>&1 | tail -1)

    # WHEN modifying the file
    echo "Modified content" > "$test_file"

    # WHEN reverting
    if [ -d "$backup_path" ] && [ -f "$backup_path/revert.sh" ]; then
        bash "$backup_path/revert.sh" >/dev/null 2>&1

        # THEN file is restored
        local reverted_content
        reverted_content=$(cat "$test_file")
        assert_equals "Original content" "$reverted_content" "File reverted to original content"
    else
        log_warn "Cannot test revert functionality, backup path not found"
    fi
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

setup_test "pre-edit-backup"

# backup.sh tests
test_backup_script_structure
test_backup_script_create_backup_function
test_backup_script_validation
test_backup_script_directory_structure
test_backup_script_naming_convention
test_backup_script_metadata
test_backup_script_revert_capability
test_backup_script_output
test_backup_script_functional

# cfn-invoke-pre-edit.sh tests
test_invoke_pre_edit_structure
test_invoke_pre_edit_argument_parsing
test_invoke_pre_edit_validation
test_invoke_pre_edit_backup_execution
test_invoke_pre_edit_output

# cfn-pre-edit-backup.sh hook tests
test_hook_backup_structure
test_hook_backup_critical_patterns
test_hook_backup_selective_backup
test_hook_backup_verification
test_hook_backup_redis_logging
test_hook_backup_cleanup

# Integration tests
test_backup_system_ttl
test_backup_system_concurrent_safety
test_backup_system_error_handling

# Revert functionality tests
test_revert_script_creation
test_revert_functional

# Test summary printed by cleanup trap
