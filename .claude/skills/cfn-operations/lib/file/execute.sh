#!/usr/bin/env bash
#
# File Operations Skill - Main Entry Point
#
# Provides file locking and atomic write operations for bash scripts.
# Part of Task 4.2: Centralized File Locking & Atomic Operations
#
# Usage:
#   # Acquire lock
#   ./.claude/skills/cfn-file-operations/execute.sh acquire-lock /path/to/file.txt --agent-id agent-001
#
#   # Write atomically
#   ./.claude/skills/cfn-file-operations/execute.sh atomic-write /path/to/file.txt "content" --checksum
#
#   # Release lock
#   ./.claude/skills/cfn-file-operations/execute.sh release-lock LOCK_ID
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/lock.sh"
source "${SCRIPT_DIR}/lib/atomic-write.sh"

# Command dispatcher
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  acquire-lock)
    file_path="${1:-}"
    shift || true
    acquire_file_lock "$file_path" "$@"
    ;;

  release-lock)
    lock_id="${1:-}"
    shift || true
    release_file_lock "$lock_id" "$@"
    ;;

  renew-lock)
    lock_id="${1:-}"
    shift || true
    renew_file_lock "$lock_id" "$@"
    ;;

  force-release)
    lock_path="${1:-}"
    shift || true
    force_release_lock "$lock_path" "$@"
    ;;

  atomic-write)
    file_path="${1:-}"
    content="${2:-}"
    shift 2 || true
    atomic_write_file "$file_path" "$content" "$@"
    ;;

  atomic-read)
    file_path="${1:-}"
    shift || true
    atomic_read_file "$file_path" "$@"
    ;;

  verify-checksum)
    file_path="${1:-}"
    expected_checksum="${2:-}"
    shift 2 || true
    verify_file_checksum "$file_path" "$expected_checksum" "$@"
    ;;

  get-metrics)
    get_lock_metrics
    ;;

  help|--help|-h)
    cat <<EOF
File Operations Skill - Usage

Commands:
  acquire-lock <file-path> [--agent-id ID] [--timeout MS]
    Acquire a file lock

  release-lock <lock-id>
    Release a file lock

  renew-lock <lock-id> [--extension MS]
    Renew a file lock (extend expiration)

  force-release <lock-path>
    Force release a stuck lock

  atomic-write <file-path> <content> [--checksum] [--backup]
    Write file atomically with optional checksum verification

  atomic-read <file-path> [--expected-checksum HASH]
    Read file with optional checksum verification

  verify-checksum <file-path> <expected-checksum>
    Verify file SHA256 checksum

  get-metrics
    Get lock manager metrics

  help
    Show this help message

Examples:
  # Acquire lock
  ./execute.sh acquire-lock /tmp/test.txt --agent-id agent-001

  # Write atomically
  ./execute.sh atomic-write /tmp/test.txt "Hello World" --checksum --backup

  # Release lock
  ./execute.sh release-lock abc123-lock-id

For more information, see SKILL.md
EOF
    ;;

  *)
    echo "Error: Unknown command: $COMMAND" >&2
    echo "Run '$0 help' for usage information" >&2
    exit 1
    ;;
esac
