---
name: file-operations
category: foundation
team: foundation
approval_level: auto
approval_criteria:
  max_commands: 3
  test_coverage: 0.95
  no_external_calls: true
tags: [file-io, filesystem, foundation]
version: 1.0.0
owner: cfn-core
---

# File Operations - Bootstrap Skill

## Overview
Comprehensive file I/O operations, path resolution, content validation, and permission management. Essential patterns for safe and robust file manipulation.

## File I/O Operations

### Safe File Reading
```bash
#!/bin/bash
set -euo pipefail

read_file() {
    local file_path="$1"

    # Validate file exists
    if [[ ! -f "$file_path" ]]; then
        echo "ERROR: File not found: $file_path" >&2
        return 1
    fi

    # Validate file is readable
    if [[ ! -r "$file_path" ]]; then
        echo "ERROR: File not readable: $file_path" >&2
        return 1
    fi

    # Read file content
    cat "$file_path"
}

# Usage
CONTENT=$(read_file "data.txt")
```

### Line-by-Line Processing
```bash
process_file_lines() {
    local file_path="$1"

    while IFS= read -r line || [[ -n "$line" ]]; do
        # Process each line
        echo "Line: $line"
    done < "$file_path"
}

# With line numbers
process_with_line_numbers() {
    local file_path="$1"
    local line_num=0

    while IFS= read -r line || [[ -n "$line" ]]; do
        ((line_num++))
        echo "$line_num: $line"
    done < "$file_path"
}
```

### Safe File Writing
```bash
write_file() {
    local file_path="$1"
    local content="$2"
    local backup="${3:-true}"

    # Create backup if file exists
    if [[ "$backup" == "true" && -f "$file_path" ]]; then
        local backup_path="${file_path}.backup.$(date +%s)"
        cp "$file_path" "$backup_path"
        echo "Backup created: $backup_path" >&2
    fi

    # Ensure directory exists
    local dir_path=$(dirname "$file_path")
    mkdir -p "$dir_path"

    # Write atomically using temp file
    local temp_file="${file_path}.tmp.$$"

    if ! echo "$content" > "$temp_file"; then
        rm -f "$temp_file"
        echo "ERROR: Failed to write to temporary file" >&2
        return 1
    fi

    # Move temp file to final location
    if ! mv "$temp_file" "$file_path"; then
        rm -f "$temp_file"
        echo "ERROR: Failed to move temporary file to final location" >&2
        return 1
    fi

    echo "File written successfully: $file_path"
}

# Usage
write_file "output.txt" "Hello, World!" true
```

### Append to File
```bash
append_to_file() {
    local file_path="$1"
    local content="$2"

    # Create file if it doesn't exist
    touch "$file_path"

    # Append content
    echo "$content" >> "$file_path"
}

# Append with timestamp
append_with_timestamp() {
    local file_path="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    echo "[${timestamp}] ${message}" >> "$file_path"
}
```

### Atomic File Operations
```bash
atomic_write() {
    local file_path="$1"
    local content="$2"

    local temp_file
    temp_file=$(mktemp "${file_path}.XXXXXX")

    # Cleanup on error
    trap "rm -f '$temp_file'" EXIT

    # Write to temp file
    echo "$content" > "$temp_file"

    # Set permissions to match original (if exists)
    if [[ -f "$file_path" ]]; then
        chmod --reference="$file_path" "$temp_file"
    fi

    # Atomic move
    mv "$temp_file" "$file_path"

    trap - EXIT
}
```

## Path Resolution

### Absolute Path Resolution
```bash
get_absolute_path() {
    local path="$1"

    # Check if path is already absolute
    if [[ "$path" = /* ]]; then
        echo "$path"
        return 0
    fi

    # Resolve relative path
    local resolved
    resolved=$(cd "$(dirname "$path")" && pwd)/$(basename "$path")
    echo "$resolved"
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Get current directory
CURRENT_DIR="$(pwd)"

# Get parent directory
PARENT_DIR="$(dirname "$(pwd)")"
```

### Path Normalization
```bash
normalize_path() {
    local path="$1"

    # Remove duplicate slashes
    path="${path//\/\//\/}"

    # Remove trailing slash (unless root)
    if [[ "$path" != "/" ]]; then
        path="${path%/}"
    fi

    echo "$path"
}

# Usage
NORMALIZED=$(normalize_path "//path/to//file/")
echo "$NORMALIZED"  # "/path/to/file"
```

### Path Validation
```bash
validate_path() {
    local path="$1"
    local base_dir="${2:-}"

    # Get absolute path
    local abs_path
    abs_path=$(realpath -m "$path" 2>/dev/null) || {
        echo "ERROR: Invalid path: $path" >&2
        return 1
    }

    # Check if path is within base directory (prevent directory traversal)
    if [[ -n "$base_dir" ]]; then
        local abs_base
        abs_base=$(realpath -m "$base_dir")

        if [[ "$abs_path" != "$abs_base"/* && "$abs_path" != "$abs_base" ]]; then
            echo "ERROR: Path outside allowed directory: $path" >&2
            return 1
        fi
    fi

    echo "$abs_path"
}

# Usage - prevent directory traversal attacks
SAFE_PATH=$(validate_path "$USER_INPUT" "/var/app/data") || exit 1
```

### Temporary File Management
```bash
create_temp_file() {
    local prefix="${1:-temp}"
    local suffix="${2:-}"

    local temp_file
    temp_file=$(mktemp "/tmp/${prefix}.XXXXXX${suffix}")

    echo "$temp_file"
}

create_temp_dir() {
    local prefix="${1:-temp}"

    local temp_dir
    temp_dir=$(mktemp -d "/tmp/${prefix}.XXXXXX")

    echo "$temp_dir"
}

# Cleanup temp files on exit
cleanup_temp_files() {
    local -a temp_files=("$@")

    for file in "${temp_files[@]}"; do
        [[ -e "$file" ]] && rm -rf "$file"
    done
}

# Usage
TEMP_FILE=$(create_temp_file "myapp")
TEMP_DIR=$(create_temp_dir "myapp")

trap "cleanup_temp_files '$TEMP_FILE' '$TEMP_DIR'" EXIT

# Use temporary files...
```

## Content Validation

### File Type Detection
```bash
detect_file_type() {
    local file_path="$1"

    if [[ ! -f "$file_path" ]]; then
        echo "ERROR: Not a regular file: $file_path" >&2
        return 1
    fi

    # Use file command
    local file_type
    file_type=$(file -b --mime-type "$file_path")

    echo "$file_type"
}

# Validate specific file type
validate_file_type() {
    local file_path="$1"
    local expected_type="$2"

    local actual_type
    actual_type=$(detect_file_type "$file_path") || return 1

    if [[ "$actual_type" != "$expected_type" ]]; then
        echo "ERROR: Invalid file type. Expected: $expected_type, Got: $actual_type" >&2
        return 1
    fi
}

# Usage
validate_file_type "image.png" "image/png"
```

### File Size Validation
```bash
get_file_size() {
    local file_path="$1"

    if [[ ! -f "$file_path" ]]; then
        echo "ERROR: File not found: $file_path" >&2
        return 1
    fi

    stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path"
}

validate_file_size() {
    local file_path="$1"
    local max_size="${2:-10485760}"  # Default 10MB

    local size
    size=$(get_file_size "$file_path") || return 1

    if [[ $size -gt $max_size ]]; then
        echo "ERROR: File too large: $size bytes (max: $max_size)" >&2
        return 1
    fi

    echo "$size"
}

# Usage
if SIZE=$(validate_file_size "upload.bin" 5242880); then
    echo "File size valid: $SIZE bytes"
fi
```

### Content Integrity Validation
```bash
compute_file_hash() {
    local file_path="$1"
    local algorithm="${2:-sha256}"

    case "$algorithm" in
        md5)
            md5sum "$file_path" | cut -d' ' -f1
            ;;
        sha1)
            sha1sum "$file_path" | cut -d' ' -f1
            ;;
        sha256)
            sha256sum "$file_path" | cut -d' ' -f1
            ;;
        *)
            echo "ERROR: Unsupported hash algorithm: $algorithm" >&2
            return 1
            ;;
    esac
}

verify_file_hash() {
    local file_path="$1"
    local expected_hash="$2"
    local algorithm="${3:-sha256}"

    local actual_hash
    actual_hash=$(compute_file_hash "$file_path" "$algorithm") || return 1

    if [[ "$actual_hash" != "$expected_hash" ]]; then
        echo "ERROR: Hash mismatch" >&2
        echo "  Expected: $expected_hash" >&2
        echo "  Actual: $actual_hash" >&2
        return 1
    fi

    echo "Hash verified: $actual_hash"
}

# Usage
HASH=$(compute_file_hash "data.txt" "sha256")
verify_file_hash "data.txt" "$HASH" "sha256"
```

### Text File Validation
```bash
validate_text_file() {
    local file_path="$1"

    # Check if file is text
    if ! file "$file_path" | grep -q "text"; then
        echo "ERROR: Not a text file: $file_path" >&2
        return 1
    fi

    # Check for valid UTF-8 encoding
    if ! iconv -f UTF-8 -t UTF-8 "$file_path" &>/dev/null; then
        echo "ERROR: Invalid UTF-8 encoding: $file_path" >&2
        return 1
    fi

    echo "Valid text file"
}
```

### JSON Validation
```bash
validate_json_file() {
    local file_path="$1"

    if ! jq empty "$file_path" 2>/dev/null; then
        echo "ERROR: Invalid JSON file: $file_path" >&2
        return 1
    fi

    echo "Valid JSON file"
}

# Extract JSON value
get_json_value() {
    local file_path="$1"
    local key="$2"

    validate_json_file "$file_path" || return 1

    jq -r ".$key" "$file_path"
}
```

## Permission Management

### Permission Checking
```bash
check_permissions() {
    local file_path="$1"

    # Check read permission
    if [[ -r "$file_path" ]]; then
        echo "Readable: YES"
    else
        echo "Readable: NO"
    fi

    # Check write permission
    if [[ -w "$file_path" ]]; then
        echo "Writable: YES"
    else
        echo "Writable: NO"
    fi

    # Check execute permission
    if [[ -x "$file_path" ]]; then
        echo "Executable: YES"
    else
        echo "Executable: NO"
    fi
}

# Get file permissions (octal)
get_file_permissions() {
    local file_path="$1"

    stat -f%Lp "$file_path" 2>/dev/null || stat -c%a "$file_path"
}
```

### Safe Permission Setting
```bash
set_permissions() {
    local file_path="$1"
    local permissions="$2"

    # Validate permissions format (octal)
    if ! [[ "$permissions" =~ ^[0-7]{3,4}$ ]]; then
        echo "ERROR: Invalid permissions format: $permissions" >&2
        return 1
    fi

    # Set permissions
    if ! chmod "$permissions" "$file_path"; then
        echo "ERROR: Failed to set permissions: $permissions on $file_path" >&2
        return 1
    fi

    echo "Permissions set: $permissions on $file_path"
}

# Set restrictive permissions (owner only)
set_restrictive_permissions() {
    local file_path="$1"

    if [[ -d "$file_path" ]]; then
        chmod 700 "$file_path"  # drwx------
    else
        chmod 600 "$file_path"  # -rw-------
    fi
}
```

### Ownership Management
```bash
get_file_owner() {
    local file_path="$1"

    stat -f%Su "$file_path" 2>/dev/null || stat -c%U "$file_path"
}

get_file_group() {
    local file_path="$1"

    stat -f%Sg "$file_path" 2>/dev/null || stat -c%G "$file_path"
}

# Check if current user owns file
is_owner() {
    local file_path="$1"
    local owner
    owner=$(get_file_owner "$file_path")

    [[ "$owner" == "$(whoami)" ]]
}
```

## Directory Operations

### Safe Directory Creation
```bash
create_directory() {
    local dir_path="$1"
    local permissions="${2:-755}"

    # Create directory with parents
    if ! mkdir -p "$dir_path"; then
        echo "ERROR: Failed to create directory: $dir_path" >&2
        return 1
    fi

    # Set permissions
    if ! chmod "$permissions" "$dir_path"; then
        echo "ERROR: Failed to set permissions on directory: $dir_path" >&2
        return 1
    fi

    echo "Directory created: $dir_path"
}
```

### Directory Traversal
```bash
find_files() {
    local dir_path="$1"
    local pattern="${2:-*}"
    local max_depth="${3:-}"

    if [[ ! -d "$dir_path" ]]; then
        echo "ERROR: Not a directory: $dir_path" >&2
        return 1
    fi

    local find_cmd="find '$dir_path'"
    [[ -n "$max_depth" ]] && find_cmd+=" -maxdepth $max_depth"
    find_cmd+=" -type f -name '$pattern'"

    eval "$find_cmd"
}

# Process all files in directory
process_directory() {
    local dir_path="$1"
    local pattern="$2"

    while IFS= read -r -d '' file; do
        echo "Processing: $file"
        # Process file...
    done < <(find "$dir_path" -type f -name "$pattern" -print0)
}
```

### Directory Size Calculation
```bash
get_directory_size() {
    local dir_path="$1"
    local human_readable="${2:-false}"

    if [[ ! -d "$dir_path" ]]; then
        echo "ERROR: Not a directory: $dir_path" >&2
        return 1
    fi

    if [[ "$human_readable" == "true" ]]; then
        du -sh "$dir_path" | cut -f1
    else
        du -sb "$dir_path" | cut -f1
    fi
}
```

## File Locking

### Advisory File Locking
```bash
acquire_lock() {
    local lock_file="$1"
    local timeout="${2:-10}"
    local waited=0

    while [[ $waited -lt $timeout ]]; do
        if mkdir "$lock_file" 2>/dev/null; then
            echo "Lock acquired: $lock_file"
            return 0
        fi

        echo "Waiting for lock... ($waited/$timeout)" >&2
        sleep 1
        ((waited++))
    done

    echo "ERROR: Failed to acquire lock after ${timeout}s" >&2
    return 1
}

release_lock() {
    local lock_file="$1"

    if rmdir "$lock_file" 2>/dev/null; then
        echo "Lock released: $lock_file"
    else
        echo "WARNING: Failed to release lock: $lock_file" >&2
    fi
}

# Usage with trap
LOCK_FILE="/tmp/myapp.lock"
if acquire_lock "$LOCK_FILE"; then
    trap "release_lock '$LOCK_FILE'" EXIT

    # Critical section...
fi
```

### File Descriptor Locking
```bash
exec_with_lock() {
    local lock_file="$1"
    shift
    local command=("$@")

    # Open lock file descriptor
    exec 200>"$lock_file"

    # Acquire exclusive lock
    if ! flock -x -w 10 200; then
        echo "ERROR: Failed to acquire lock" >&2
        return 1
    fi

    # Execute command
    "${command[@]}"
    local exit_code=$?

    # Release lock (automatic on fd close)
    exec 200>&-

    return $exit_code
}

# Usage
exec_with_lock "/tmp/myapp.lock" process_data
```

## Success Criteria

- ✅ File existence and readability validation
- ✅ Atomic write operations with temp files
- ✅ Absolute path resolution and normalization
- ✅ Directory traversal attack prevention
- ✅ File type and size validation
- ✅ Content integrity verification (hashing)
- ✅ Safe permission and ownership management
- ✅ Directory creation with proper permissions
- ✅ File locking for concurrent access
- ✅ Temporary file cleanup on exit
- ✅ Comprehensive error handling
