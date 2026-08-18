#!/usr/bin/env bash
# tests/docker/phase5-update-existing-tests.sh
# Phase 5 Iteration 1 :: Update 12 existing test files with architecture helper adoption

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Configuration
AGENT_ID="phase5-iter1-loop3"
UPDATED_COUNT=0
FAILED_COUNT=0

# List of files to update (excluding redis-coordination-tests.sh which is already done)
FILES_TO_UPDATE=(
    "intelligent-coordinator-test.sh"
    "b10-typescript-fix-test.sh"
    "50-agent-parallel-test.sh"
    "agent-lifecycle-tests.sh"
    "memory-budget-tests.sh"
    "coordinator-iteration-tests.sh"
    "clustering-accuracy-tests.sh"
    "test-docker-stabilization.sh"
    "docker-hello-world-parity-tests.sh"
    "container-test-runner.sh"
    "simple-container-test.sh"
)

log_step "Phase 5 - Update Existing Tests with Architecture Helpers"
echo "Files to update: ${#FILES_TO_UPDATE[@]}"
echo ""

# Function to add helper sourcing if missing
add_helper_sourcing() {
    local file="$1"
    local full_path="$PROJECT_ROOT/tests/docker/$file"

    if [ ! -f "$full_path" ]; then
        log_error "File not found: $file"
        return 1
    fi

    # Check if already sourcing architecture-test-helpers.sh
    if grep -q "architecture-test-helpers.sh" "$full_path"; then
        log_info "$file: Already sources architecture helpers (skipping)"
        return 0
    fi

    # Create backup
    log_step "$file: Creating backup..."
    BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$full_path" --agent-id "$AGENT_ID" 2>&1 | grep "Backup created" | awk '{print $NF}')

    if [ -z "$BACKUP_PATH" ]; then
        log_error "$file: Backup creation failed"
        return 1
    fi

    log_info "$file: Backup created: $BACKUP_PATH"

    # Check if file sources test-utils.sh
    if grep -q "source.*test-utils.sh" "$full_path"; then
        # Add architecture helpers after test-utils.sh
        log_step "$file: Adding architecture helper sourcing..."
        sed -i '/source.*test-utils.sh/a source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"' "$full_path"
    elif grep -q "PROJECT_ROOT=\$(git rev-parse --show-toplevel)" "$full_path"; then
        # Add both test-utils.sh and architecture helpers
        log_step "$file: Adding test-utils.sh and architecture helper sourcing..."
        sed -i '/PROJECT_ROOT=\$(git rev-parse --show-toplevel)/a source "$PROJECT_ROOT/tests/test-utils.sh"\nsource "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"' "$full_path"
    else
        log_warn "$file: Could not find proper insertion point for helper sourcing"
        return 1
    fi

    # Run post-edit validation
    log_step "$file: Running post-edit validation..."
    if ./.claude/hooks/cfn-invoke-post-edit.sh "$full_path" --agent-id "$AGENT_ID" > /tmp/post-edit-$file.log 2>&1; then
        log_pass "$file: Post-edit validation passed"
        ((UPDATED_COUNT++))
        return 0
    else
        log_error "$file: Post-edit validation failed (see /tmp/post-edit-$file.log)"
        ((FAILED_COUNT++))
        return 1
    fi
}

# Process each file
for file in "${FILES_TO_UPDATE[@]}"; do
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    add_helper_sourcing "$file" || true
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_step "Phase 5 Update Summary"
echo "  Total files processed: ${#FILES_TO_UPDATE[@]}"
echo "  Successfully updated: $UPDATED_COUNT"
echo "  Failed: $FAILED_COUNT"
echo "  Already updated: redis-coordination-tests.sh (1)"
echo ""
echo "  Total files with helpers: $((UPDATED_COUNT + 1))"
echo ""

if [ $FAILED_COUNT -eq 0 ]; then
    log_success "All files updated successfully!"
    exit 0
else
    log_error "Some files failed to update"
    exit 1
fi
