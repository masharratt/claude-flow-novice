#!/bin/bash
#
# Atomic Write Operations Library
#
# Provides atomic file write functions with SHA256 verification.
# Part of Task 4.2: Centralized File Locking & Atomic Operations
#

#
# Calculate SHA256 checksum of content
#
# Usage: calculate_checksum <content>
#
calculate_checksum() {
  local content="$1"
  echo -n "$content" | sha256sum | awk '{print $1}'
}

#
# Calculate SHA256 checksum of file
#
# Usage: calculate_file_checksum <file-path>
#
calculate_file_checksum() {
  local file_path="$1"

  if [ ! -f "$file_path" ]; then
    echo "Error: File not found: $file_path" >&2
    return 1
  fi

  sha256sum "$file_path" | awk '{print $1}'
}

#
# Write file atomically
#
# Usage: atomic_write_file <file-path> <content> [--checksum] [--backup] [--lock]
#
atomic_write_file() {
  local file_path="$1"
  local content="$2"
  shift 2

  if [ -z "$file_path" ]; then
    echo "Error: file-path required" >&2
    return 1
  fi

  local verify_checksum=0
  local create_backup=0
  local use_lock=0
  local lock_info=""

  # Parse options
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --checksum)
        verify_checksum=1
        shift
        ;;
      --backup)
        create_backup=1
        shift
        ;;
      --lock)
        use_lock=1
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  local start_time
  start_time=$(date +%s%3N)

  # Acquire lock if requested
  if [ "$use_lock" -eq 1 ]; then
    lock_info=$(acquire_file_lock "$file_path" --timeout 30000)
    if [ $? -ne 0 ]; then
      echo "Error: Failed to acquire lock for $file_path" >&2
      return 1
    fi
  fi

  local dir
  dir=$(dirname "$file_path")

  local temp_path
  temp_path="${dir}/.$(basename "$file_path").$(date +%s%N).tmp"

  local backup_path=""
  local success=0

  # Calculate expected checksum
  local expected_checksum
  expected_checksum=$(calculate_checksum "$content")

  # Create backup if requested and file exists
  if [ "$create_backup" -eq 1 ] && [ -f "$file_path" ]; then
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H-%M-%S")
    backup_path="${file_path}.${timestamp}.backup"

    cp "$file_path" "$backup_path" 2>/dev/null || {
      echo "Error: Failed to create backup" >&2
      [ -n "$lock_info" ] && release_file_lock "$lock_info"
      return 1
    }

    echo "Backup created: $backup_path" >&2
  fi

  # Write to temporary file
  echo -n "$content" > "$temp_path" || {
    echo "Error: Failed to write temporary file" >&2
    [ -n "$lock_info" ] && release_file_lock "$lock_info"
    return 1
  }

  # Verify checksum if requested
  if [ "$verify_checksum" -eq 1 ]; then
    local actual_checksum
    actual_checksum=$(calculate_file_checksum "$temp_path")

    if [ "$actual_checksum" != "$expected_checksum" ]; then
      echo "Error: Checksum verification failed" >&2
      echo "  Expected: $expected_checksum" >&2
      echo "  Actual:   $actual_checksum" >&2
      rm -f "$temp_path"
      [ -n "$lock_info" ] && release_file_lock "$lock_info"
      return 1
    fi

    echo "Checksum verified: $actual_checksum" >&2
  fi

  # Preserve permissions if file exists
  if [ -f "$file_path" ]; then
    chmod --reference="$file_path" "$temp_path" 2>/dev/null || true
  fi

  # Atomic move
  if mv "$temp_path" "$file_path" 2>/dev/null; then
    success=1
  else
    echo "Error: Failed to move temporary file to target" >&2

    # Rollback from backup if available
    if [ -n "$backup_path" ] && [ -f "$backup_path" ]; then
      cp "$backup_path" "$file_path" 2>/dev/null && {
        echo "Restored from backup after failed write" >&2
      }
    fi

    rm -f "$temp_path"
    [ -n "$lock_info" ] && release_file_lock "$lock_info"
    return 1
  fi

  # Get file size
  local bytes_written
  bytes_written=$(stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path" 2>/dev/null || echo "0")

  local end_time
  end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))

  # Release lock if acquired
  if [ -n "$lock_info" ]; then
    release_file_lock "$lock_info"
  fi

  # Output result as JSON
  jq -n \
    --argjson success "$success" \
    --arg filePath "$file_path" \
    --arg checksum "$expected_checksum" \
    --argjson bytesWritten "$bytes_written" \
    --argjson durationMs "$duration" \
    --arg backupPath "$backup_path" \
    '{
      success: $success,
      filePath: $filePath,
      checksum: $checksum,
      bytesWritten: $bytesWritten,
      durationMs: $durationMs,
      backupPath: $backupPath
    }'
}

#
# Read file atomically
#
# Usage: atomic_read_file <file-path> [--expected-checksum HASH]
#
atomic_read_file() {
  local file_path="$1"
  shift

  if [ -z "$file_path" ]; then
    echo "Error: file-path required" >&2
    return 1
  fi

  if [ ! -f "$file_path" ]; then
    echo "Error: File not found: $file_path" >&2
    return 1
  fi

  local expected_checksum=""

  # Parse options
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --expected-checksum)
        expected_checksum="$2"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done

  # Read content
  local content
  content=$(cat "$file_path")

  # Calculate checksum
  local actual_checksum
  actual_checksum=$(calculate_checksum "$content")

  # Verify if expected checksum provided
  if [ -n "$expected_checksum" ]; then
    if [ "$actual_checksum" != "$expected_checksum" ]; then
      echo "Error: Checksum verification failed" >&2
      echo "  Expected: $expected_checksum" >&2
      echo "  Actual:   $actual_checksum" >&2
      return 1
    fi
  fi

  # Output result as JSON
  jq -n \
    --arg content "$content" \
    --arg checksum "$actual_checksum" \
    '{
      content: $content,
      checksum: $checksum
    }'
}

#
# Verify file checksum
#
# Usage: verify_file_checksum <file-path> <expected-checksum>
#
verify_file_checksum() {
  local file_path="$1"
  local expected_checksum="$2"

  if [ -z "$file_path" ] || [ -z "$expected_checksum" ]; then
    echo "Error: file-path and expected-checksum required" >&2
    return 1
  fi

  if [ ! -f "$file_path" ]; then
    echo "Error: File not found: $file_path" >&2
    return 1
  fi

  local actual_checksum
  actual_checksum=$(calculate_file_checksum "$file_path")

  local matches=0
  if [ "$actual_checksum" = "$expected_checksum" ]; then
    matches=1
  fi

  jq -n \
    --arg filePath "$file_path" \
    --arg expected "$expected_checksum" \
    --arg actual "$actual_checksum" \
    --argjson matches "$matches" \
    '{
      filePath: $filePath,
      expectedChecksum: $expected,
      actualChecksum: $actual,
      matches: $matches
    }'
}
