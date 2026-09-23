#!/usr/bin/env bash
# Atomic file operations and locking for CFN system

# Source logging if not already loaded
if ! declare -f log_info >/dev/null 2>&1; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "$SCRIPT_DIR/logging.sh"
fi

# Atomic file write (write-then-move pattern)
# Usage: atomic_write "/path/to/file.txt" "content here"
atomic_write() {
    local filepath="${1:?Filepath required}"
    local content="${2:?Content required}"

    # Create parent directory if needed
    local dirpath
    dirpath=$(dirname "$filepath")
    mkdir -p "$dirpath"

    # Write to temporary file first
    local tmpfile
    tmpfile="${filepath}.tmp.$$"

    if ! echo "$content" > "$tmpfile"; then
        log_error "Failed to write temporary file" "{\"file\":\"$tmpfile\"}"
        rm -f "$tmpfile"
        return 1
    fi

    # Atomic move
    if ! mv "$tmpfile" "$filepath"; then
        log_error "Failed to move temporary file" "{\"tmpfile\":\"$tmpfile\",\"target\":\"$filepath\"}"
        rm -f "$tmpfile"
        return 1
    fi

    log_debug "Atomic write succeeded" "{\"file\":\"$filepath\",\"bytes\":${#content}}"
    return 0
}

# Acquire file lock with timeout
# Usage: if acquire_lock "/path/to/resource.lock" 30; then ... fi
acquire_lock() {
    local lockfile="${1:?Lockfile required}"
    local timeout_sec="${2:-30}"

    local start_time
    start_time=$(date +%s)
    local end_time=$((start_time + timeout_sec))

    # Create lock directory if needed
    local lockdir
    lockdir=$(dirname "$lockfile")
    mkdir -p "$lockdir"

    while [ "$(date +%s)" -lt "$end_time" ]; do
        # Try to create lock file atomically
        if (set -o noclobber; echo $$ > "$lockfile") 2>/dev/null; then
            log_debug "Lock acquired" "{\"lockfile\":\"$lockfile\",\"pid\":$$}"
            return 0
        fi

        # Check if lock holder is still alive
        if [ -f "$lockfile" ]; then
            local lock_pid
            lock_pid=$(cat "$lockfile" 2>/dev/null || echo "")

            if [ -n "$lock_pid" ] && ! kill -0 "$lock_pid" 2>/dev/null; then
                log_warn "Stale lock detected, removing" "{\"lockfile\":\"$lockfile\",\"stale_pid\":$lock_pid}"
                rm -f "$lockfile"
                continue
            fi
        fi

        # Wait before retry
        sleep 0.5
    done

    log_error "Failed to acquire lock (timeout)" "{\"lockfile\":\"$lockfile\",\"timeout\":$timeout_sec}"
    return 1
}

# Release file lock
# Usage: release_lock "/path/to/resource.lock"
release_lock() {
    local lockfile="${1:?Lockfile required}"

    if [ ! -f "$lockfile" ]; then
        log_warn "Lock file does not exist" "{\"lockfile\":\"$lockfile\"}"
        return 1
    fi

    # Verify we own the lock
    local lock_pid
    lock_pid=$(cat "$lockfile" 2>/dev/null || echo "")

    if [ "$lock_pid" != "$$" ]; then
        log_warn "Cannot release lock owned by another process" "{\"lockfile\":\"$lockfile\",\"owner\":$lock_pid,\"current\":$$}"
        return 1
    fi

    if ! rm -f "$lockfile"; then
        log_error "Failed to remove lock file" "{\"lockfile\":\"$lockfile\"}"
        return 1
    fi

    log_debug "Lock released" "{\"lockfile\":\"$lockfile\",\"pid\":$$}"
    return 0
}

# Execute command with file lock held
# Usage: with_lock "/path/to/resource.lock" timeout_sec command [args...]
with_lock() {
    local lockfile="${1:?Lockfile required}"
    local timeout_sec="${2:?Timeout required}"
    shift 2
    local command=("$@")

    # Acquire lock
    if ! acquire_lock "$lockfile" "$timeout_sec"; then
        log_error "Failed to acquire lock for command execution" "{\"lockfile\":\"$lockfile\",\"command\":\"${command[0]}\"}"
        return 1
    fi

    # Setup trap to release lock on exit
    trap "release_lock '$lockfile'" EXIT INT TERM

    # Execute command
    local exit_code=0
    "${command[@]}" || exit_code=$?

    # Release lock
    release_lock "$lockfile" || true

    # Remove trap
    trap - EXIT INT TERM

    return $exit_code
}

# Check if file lock exists and is held by a living process
# Usage: if is_locked "/path/to/resource.lock"; then ... fi
is_locked() {
    local lockfile="${1:?Lockfile required}"

    if [ ! -f "$lockfile" ]; then
        return 1
    fi

    local lock_pid
    lock_pid=$(cat "$lockfile" 2>/dev/null || echo "")

    if [ -z "$lock_pid" ]; then
        return 1
    fi

    # Check if process is alive
    if kill -0 "$lock_pid" 2>/dev/null; then
        return 0  # Locked by living process
    else
        return 1  # Stale lock
    fi
}
