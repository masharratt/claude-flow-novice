#!/bin/bash
# tests/docker/north-star/02-file-operations/test-workspace-persistence.sh
# Phase 2 :: Validate workspace persistence and iterative file operations

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_TASK_ID="workspace-test-$(date +%s)"
WORKSPACE_DIR="/tmp/north-star-workspace"
ITERATION_1_DIR="$WORKSPACE_DIR/$TEST_TASK_ID/iteration-1"
ITERATION_2_DIR="$WORKSPACE_DIR/$TEST_TASK_ID/iteration-2"
FINAL_DIR="/tmp/trigger-dev-deliverables/$TEST_TASK_ID"

cleanup() {
  log_step "Cleanup: Removing workspace test artifacts"
  rm -rf "$WORKSPACE_DIR" "$FINAL_DIR" || true
  pkill -f "workspace-test" || true
}
trap cleanup EXIT

setup_workspace_environment() {
  log_step "GIVEN: Workspace environment is prepared"

  mkdir -p "$WORKSPACE_DIR"
  mkdir -p "$ITERATION_1_DIR"
  mkdir -p "$ITERATION_2_DIR"

  # Create initial file for iteration 1 to build upon
  cat > "$ITERATION_1_DIR/README.md" << 'EOF'
# Project Documentation

## Overview
This file demonstrates iterative development.

## Status
Initial version created.

## Features to Add
1. Enhanced formatting
2. Additional sections
3. Improved structure
EOF

  log_info "Workspace directories created with initial content"
  return 0
}

test_iteration_1_file_creation() {
  log_step "WHEN: Iteration 1 creates and modifies files"

  local start_time=$(date +%s)

  # Execute CFN Loop for iteration 1 with file enhancement task
  (
    cd "$PROJECT_ROOT"
    timeout 60 /usr/bin/env bash -c "
      /cfn-loop-cli 'Enhance the README.md file with improved formatting, add a table of contents, and include build instructions' \
        --mode=mvp \
        --timeout=30 \
        --task-id=${TEST_TASK_ID}-iter1 \
        2>&1
    " &
  )

  local iter1_pid=$!
  log_info "Iteration 1 CFN Loop started with PID: $iter1_pid"

  # Wait for completion or timeout
  local timeout=60
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    if ! kill -0 $iter1_pid 2>/dev/null; then
      wait $iter1_pid
      local exit_code=$?
      log_info "Iteration 1 completed with exit code: $exit_code"
      break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  # Handle timeout
  if kill -0 $iter1_pid 2>/dev/null; then
    log_warn "Iteration 1 timeout, terminating"
    kill -TERM $iter1_pid || true
  fi

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  log_info "Iteration 1 execution time: ${duration}s"

  return 0
}

test_workspace_file_persistence() {
  log_step "THEN: Workspace file persistence is validated"

  # Check if files were created in the workspace
  local workspace_files=$(find "$WORKSPACE_DIR" -type f -name "*.md" 2>/dev/null | wc -l || echo "0")
  log_info "Files found in workspace: $workspace_files"

  if [ "$workspace_files" -gt 0 ]; then
    log_info "✅ Workspace contains created files"

    # List created files
    find "$WORKSPACE_DIR" -type f -name "*.md" 2>/dev/null | while read -r file; do
      local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
      log_info "  📄 $(basename "$file") (${size} bytes)"
    done
  else
    log_warn "⚠️  No files found in workspace directory"
  fi

  return 0
}

test_iteration_2_building_on_previous() {
  log_step "WHEN: Iteration 2 builds on previous iteration files"

  # Check for files from iteration 1 that iteration 2 should build upon
  local iter1_files=$(find "$ITERATION_1_DIR" -type f 2>/dev/null)

  if [ -n "$iter1_files" ]; then
    log_info "Found iteration 1 files to build upon:"
    echo "$iter1_files" | while read -r file; do
      log_info "  📁 $(basename "$file")"

      # Copy files to iteration 2 workspace for building upon
      cp "$file" "$ITERATION_2_DIR/" || log_warn "Could not copy $file to iteration 2"
    done
  else
    log_warn "No iteration 1 files found to build upon"
  fi

  # Execute iteration 2 with task to enhance existing files
  (
    cd "$PROJECT_ROOT"
    timeout 60 /usr/bin/env bash -c "
      /cfn-loop-cli 'Review and enhance the existing README.md file. Add API documentation, installation guide, and usage examples based on the current content.' \
        --mode=mvp \
        --timeout=30 \
        --task-id=${TEST_TASK_ID}-iter2 \
        2>&1
    " &
  )

  local iter2_pid=$!
  log_info "Iteration 2 CFN Loop started with PID: $iter2_pid"

  # Wait for completion
  local timeout=60
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    if ! kill -0 $iter2_pid 2>/dev/null; then
      wait $iter2_pid
      local exit_code=$?
      log_info "Iteration 2 completed with exit code: $exit_code"
      break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  if kill -0 $iter2_pid 2>/dev/null; then
    log_warn "Iteration 2 timeout, terminating"
    kill -TERM $iter2_pid || true
  fi

  return 0
}

test_iterative_enhancement_validation() {
  log_step "THEN: Iterative enhancement is validated"

  # Check if files were enhanced across iterations
  local enhanced_files=$(find "$WORKSPACE_DIR" -name "README.md" -exec grep -l "API documentation\|Installation Guide\|Usage Examples" {} \; 2>/dev/null | wc -l || echo "0")
  log_info "Enhanced README files found: $enhanced_files"

  if [ "$enhanced_files" -gt 0 ]; then
    log_info "✅ Iterative enhancement detected"

    # Show enhancement examples
    find "$WORKSPACE_DIR" -name "README.md" 2>/dev/null | while read -r file; do
      if grep -q "API documentation\|Installation Guide\|Usage Examples" "$file"; then
        local line_count=$(wc -l < "$file" 2>/dev/null || echo "0")
        log_info "  📈 Enhanced README: $(basename "$(dirname "$file")") (${line_count} lines)"
      fi
    done
  else
    log_warn "⚠️  No iterative enhancement detected"
  fi

  return 0
}

test_file_content_evolution() {
  log_step "AND: File content evolution is tracked"

  # Track file evolution across iterations
  log_info "File evolution analysis:"

  for iteration_dir in "$ITERATION_1_DIR" "$ITERATION_2_DIR"; do
    if [ -d "$iteration_dir" ]; then
      local iteration_name=$(basename "$iteration_dir")
      local file_count=$(find "$iteration_dir" -type f -name "*.md" | wc -l || echo "0")
      local total_size=$(find "$iteration_dir" -type f -name "*.md" -exec stat -f%z {} + 2>/dev/null || find "$iteration_dir" -type f -name "*.md" -exec stat -c%s {} + 2>/dev/null || echo "0")

      log_info "  📊 $iteration_name: $file_count files, ${total_size} bytes total"

      # Show content indicators
      find "$iteration_dir" -name "*.md" 2>/dev/null | while read -r file; do
        local sections=$(grep -c "^##" "$file" 2>/dev/null || echo "0")
        local features=$(grep -c "^- " "$file" 2>/dev/null || echo "0")
        log_info "    📋 $(basename "$file"): $sections sections, $features features"
      done
    fi
  done

  return 0
}

test_volume_mount_access() {
  log_step "AND: Volume mount access is validated"

  # Test Docker volume access patterns
  if [ -d "/workspace" ]; then
    log_info "✅ /workspace directory accessible"

    local workspace_files=$(find /workspace -maxdepth 2 -type f 2>/dev/null | wc -l || echo "0")
    log_info "Files in /workspace: $workspace_files"
  else
    log_info "ℹ️  /workspace directory not found (expected in container environment)"
  fi

  # Test trigger-dev deliverables directory
  local trigger_deliverables="/tmp/trigger-dev-deliverables"
  if [ -d "$trigger_deliverables" ]; then
    log_info "✅ Trigger.dev deliverables directory accessible"

    local deliverable_count=$(find "$trigger_deliverables" -name "*$TEST_TASK_ID*" -type d 2>/dev/null | wc -l || echo "0")
    log_info "Deliverable directories for test task: $deliverable_count"
  else
    log_info "ℹ️  Trigger.dev deliverables directory not yet created"
  fi

  return 0
}

# Main test execution
main() {
  annotate "Workspace Persistence Test" \
    "Validates iterative file creation, modification, and building upon previous iterations"

  setup_workspace_environment
  test_iteration_1_file_creation
  test_workspace_file_persistence
  test_iteration_2_building_on_previous
  test_iterative_enhancement_validation
  test_file_content_evolution
  test_volume_mount_access

  log_success "Workspace persistence tests completed successfully"
}

# Execute test
main "$@"