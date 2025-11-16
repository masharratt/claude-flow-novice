#!/bin/bash

##############################################################################
# Workspace Cleanup Script
#
# Manual cleanup utility for operators to manage workspaces.
# Part of Task P2-1.3: Supervised Workspace Cleanup (Phase 2)
#
# Features:
# - List all workspaces with details
# - Show orphaned workspaces
# - Manual cleanup with confirmation
# - Force cleanup (override TTL)
# - Size reports
#
# Usage:
#   ./scripts/cleanup-workspaces.sh --list
#   ./scripts/cleanup-workspaces.sh --orphans
#   ./scripts/cleanup-workspaces.sh --cleanup <workspace-id>
#   ./scripts/cleanup-workspaces.sh --force-cleanup <workspace-id>
#   ./scripts/cleanup-workspaces.sh --report
#
##############################################################################

set -euo pipefail

# Configuration
WORKSPACE_ROOT="${WORKSPACE_ROOT:-./.cfn-workspaces}"
DB_PATH="${DB_PATH:-./.cfn-workspaces/metadata.db}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

##############################################################################
# Helper Functions
##############################################################################

print_header() {
  echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

format_size() {
  local bytes=$1
  if ((bytes < 1024)); then
    echo "${bytes}B"
  elif ((bytes < 1048576)); then
    echo "$((bytes / 1024))KB"
  elif ((bytes < 1073741824)); then
    echo "$((bytes / 1048576))MB"
  else
    echo "$((bytes / 1073741824))GB"
  fi
}

##############################################################################
# Workspace Operations
##############################################################################

list_workspaces() {
  print_header "Workspace Listing"

  if [[ ! -d "$WORKSPACE_ROOT" ]]; then
    print_warning "No workspaces directory found: $WORKSPACE_ROOT"
    return 0
  fi

  if [[ ! -f "$DB_PATH" ]]; then
    print_warning "Database not found: $DB_PATH"
    return 0
  fi

  echo -e "\nActive Workspaces:"
  echo -e "ID\t\tAgent\t\tTask\t\tSize\t\tCreated"
  echo "────────────────────────────────────────────────────────────────"

  # Query database for workspaces
  sqlite3 "$DB_PATH" <<EOF 2>/dev/null || true
.mode column
.headers on
SELECT
  substr(id, 1, 8) AS 'ID (short)',
  agent_id AS 'Agent',
  task_id AS 'Task',
  current_size_bytes AS 'Size (bytes)',
  created_at AS 'Created'
FROM workspaces
ORDER BY created_at DESC;
EOF
}

show_orphans() {
  print_header "Orphaned Workspaces"

  if [[ ! -f "$DB_PATH" ]]; then
    print_warning "Database not found: $DB_PATH"
    return 0
  fi

  echo -e "\nOrphaned Workspaces (no active process):"
  echo -e "ID\t\tAgent\t\tTask\t\tLast Accessed\t\tGrace Expires"
  echo "────────────────────────────────────────────────────────────────"

  # Query database for orphans in grace period
  sqlite3 "$DB_PATH" <<EOF 2>/dev/null || true
.mode column
.headers on
SELECT
  substr(w.id, 1, 8) AS 'ID (short)',
  w.agent_id AS 'Agent',
  w.task_id AS 'Task',
  w.last_accessed_at AS 'Last Accessed',
  ot.grace_period_expires_at AS 'Grace Expires'
FROM orphan_tracking ot
JOIN workspaces w ON w.id = ot.workspace_id
WHERE ot.cleaned_at IS NULL
ORDER BY ot.grace_period_expires_at ASC;
EOF
}

cleanup_workspace() {
  local workspace_id="$1"

  if [[ -z "$workspace_id" ]]; then
    print_error "Workspace ID required"
    return 1
  fi

  # Get workspace path from database
  local workspace_path
  workspace_path=$(sqlite3 "$DB_PATH" "SELECT path FROM workspaces WHERE id = '$workspace_id';" 2>/dev/null || echo "")

  if [[ -z "$workspace_path" ]]; then
    print_error "Workspace not found: $workspace_id"
    return 1
  fi

  if [[ ! -d "$workspace_path" ]]; then
    print_warning "Workspace directory not found: $workspace_path"
    return 0
  fi

  # Calculate size
  local size
  size=$(du -sb "$workspace_path" | awk '{print $1}')
  local size_formatted
  size_formatted=$(format_size "$size")

  # Confirm cleanup
  echo -e "\n${YELLOW}About to delete workspace:${NC}"
  echo "  ID: $workspace_id"
  echo "  Path: $workspace_path"
  echo "  Size: $size_formatted"
  echo ""
  read -p "Continue? (yes/no): " -r response

  if [[ ! "$response" =~ ^[Yy]es$ ]]; then
    print_warning "Cleanup cancelled"
    return 0
  fi

  # Perform cleanup
  rm -rf "$workspace_path"

  # Record cleanup in database
  sqlite3 "$DB_PATH" <<EOF 2>/dev/null || true
UPDATE workspaces
SET current_size_bytes = 0, file_count = 0
WHERE id = '$workspace_id';

INSERT INTO cleanup_history
(workspace_id, cleaned_at, reason, size_freed, files_removed, duration_ms)
VALUES ('$workspace_id', datetime('now'), 'manual', $size, 0, NULL);
EOF

  print_success "Workspace cleaned up: $workspace_id ($size_formatted freed)"
}

force_cleanup_workspace() {
  local workspace_id="$1"

  if [[ -z "$workspace_id" ]]; then
    print_error "Workspace ID required"
    return 1
  fi

  # Get workspace path from database
  local workspace_path
  workspace_path=$(sqlite3 "$DB_PATH" "SELECT path FROM workspaces WHERE id = '$workspace_id';" 2>/dev/null || echo "")

  if [[ -z "$workspace_path" ]]; then
    print_error "Workspace not found: $workspace_id"
    return 1
  fi

  # Calculate size before cleanup
  local size=0
  if [[ -d "$workspace_path" ]]; then
    size=$(du -sb "$workspace_path" | awk '{print $1}')
    rm -rf "$workspace_path"
  fi

  # Record force cleanup
  sqlite3 "$DB_PATH" <<EOF 2>/dev/null || true
INSERT INTO cleanup_history
(workspace_id, cleaned_at, reason, size_freed, files_removed, duration_ms, metadata)
VALUES (
  '$workspace_id',
  datetime('now'),
  'manual',
  $size,
  0,
  NULL,
  json_object('force_cleanup', true, 'skipped_grace_period', true)
);
EOF

  local size_formatted
  size_formatted=$(format_size "$size")
  print_success "Force cleaned workspace: $workspace_id ($size_formatted freed)"
}

show_report() {
  print_header "Workspace Report"

  if [[ ! -f "$DB_PATH" ]]; then
    print_warning "Database not found: $DB_PATH"
    return 0
  fi

  # Total statistics
  echo -e "\n${BLUE}Overall Statistics:${NC}"
  sqlite3 "$DB_PATH" <<EOF 2>/dev/null || true
.mode column
.headers on
SELECT
  COUNT(*) AS 'Total Workspaces',
  SUM(current_size_bytes) AS 'Total Size (bytes)',
  SUM(file_count) AS 'Total Files',
  MAX(created_at) AS 'Most Recent'
FROM workspaces;
EOF

  # Recent cleanups
  echo -e "\n${BLUE}Recent Cleanups:${NC}"
  sqlite3 "$DB_PATH" <<EOF 2>/dev/null || true
.mode column
.headers on
SELECT
  substr(workspace_id, 1, 8) AS 'ID (short)',
  reason AS 'Reason',
  size_freed AS 'Size (bytes)',
  cleaned_at AS 'When'
FROM cleanup_history
ORDER BY cleaned_at DESC
LIMIT 10;
EOF

  # Largest workspaces
  echo -e "\n${BLUE}Largest Workspaces:${NC}"
  sqlite3 "$DB_PATH" <<EOF 2>/dev/null || true
.mode column
.headers on
SELECT
  substr(id, 1, 8) AS 'ID (short)',
  agent_id AS 'Agent',
  task_id AS 'Task',
  current_size_bytes AS 'Size (bytes)',
  file_count AS 'Files'
FROM workspaces
ORDER BY current_size_bytes DESC
LIMIT 10;
EOF
}

cleanup_orphans() {
  print_header "Cleaning Orphaned Workspaces"

  if [[ ! -d "$WORKSPACE_ROOT" ]]; then
    print_warning "No workspaces directory found: $WORKSPACE_ROOT"
    return 0
  fi

  local cleaned_count=0
  local total_freed=0

  for workspace_dir in "$WORKSPACE_ROOT"/*; do
    if [[ ! -d "$workspace_dir" ]]; then
      continue
    fi

    # Check if process exists (if metadata has PID)
    if [[ -f "$workspace_dir/.metadata.json" ]]; then
      local pid
      pid=$(grep -o '"processId":\s*[0-9]*' "$workspace_dir/.metadata.json" | grep -o '[0-9]*' || echo "")

      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        # Process still active
        continue
      fi
    fi

    # Check access time (should be in grace period)
    local access_time
    access_time=$(stat -f%Sa "$workspace_dir" 2>/dev/null || stat -c%y "$workspace_dir" | awk '{print $1}')
    local access_epoch
    access_epoch=$(date -d "$access_time" +%s 2>/dev/null || date -jf "%Y-%m-%dT%H:%M:%S" "$access_time" +%s 2>/dev/null || echo "0")
    local current_epoch
    current_epoch=$(date +%s)
    local age=$((current_epoch - access_epoch))

    # Grace period: 10 minutes (600 seconds)
    if [[ $age -gt 600 ]]; then
      local size
      size=$(du -sb "$workspace_dir" | awk '{print $1}')
      rm -rf "$workspace_dir"
      total_freed=$((total_freed + size))
      cleaned_count=$((cleaned_count + 1))
      print_success "Cleaned orphan: $(basename "$workspace_dir") ($size bytes)"
    fi
  done

  print_success "Orphan cleanup complete: $cleaned_count workspaces, $((total_freed / 1048576))MB freed"
}

##############################################################################
# Main
##############################################################################

main() {
  if [[ $# -eq 0 ]]; then
    cat <<EOF
Workspace Cleanup Utility

Usage:
  $0 --list              List all workspaces
  $0 --orphans           Show orphaned workspaces
  $0 --cleanup <id>      Manually cleanup workspace (interactive)
  $0 --force-cleanup <id> Force cleanup (skip grace period)
  $0 --cleanup-orphans   Clean up stale orphaned workspaces
  $0 --report            Show comprehensive report
  $0 --help              Show this help message

Environment Variables:
  WORKSPACE_ROOT        Root directory for workspaces (default: ./.cfn-workspaces)
  DB_PATH               Path to workspace database (default: \$WORKSPACE_ROOT/metadata.db)

Examples:
  # List all workspaces
  $0 --list

  # Show detailed report
  $0 --report

  # Cleanup specific workspace
  $0 --cleanup abc123def456

  # Force cleanup (skip 10-minute grace period)
  $0 --force-cleanup abc123def456

  # Clean all orphaned workspaces in grace period
  $0 --cleanup-orphans
EOF
    exit 0
  fi

  case "${1:-}" in
  --list)
    list_workspaces
    ;;
  --orphans)
    show_orphans
    ;;
  --cleanup)
    cleanup_workspace "${2:-}"
    ;;
  --force-cleanup)
    force_cleanup_workspace "${2:-}"
    ;;
  --cleanup-orphans)
    cleanup_orphans
    ;;
  --report)
    show_report
    ;;
  --help)
    "$0"
    ;;
  *)
    print_error "Unknown command: $1"
    "$0" --help
    exit 1
    ;;
  esac
}

main "$@"
