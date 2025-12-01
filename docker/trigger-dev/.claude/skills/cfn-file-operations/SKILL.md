# File Operations Skill

Centralized file locking and atomic write operations for bash scripts.

**Part of Task 4.2: Centralized File Locking & Atomic Operations**

## Overview

This skill provides:
- **File Locking**: Acquire, release, and renew locks with queuing
- **Atomic Writes**: Write-then-move pattern with SHA256 verification
- **Safety**: Backup creation, rollback, permission preservation
- **Performance**: <100ms lock acquisition target, efficient retry logic

## Features

### File Locking
- Lock acquisition with configurable timeout (default: 300s)
- Waiting queue for blocked processes
- Lock renewal for long-running operations
- Force release for stuck locks
- Owner tracking (process ID, agent ID, hostname)
- Stale lock detection and automatic cleanup

### Atomic Writes
- Write-then-move pattern (atomic operation)
- SHA256 checksum verification
- Automatic backup creation
- Rollback on failure
- Permission and ownership preservation
- Integration with file locking

## Usage

### Acquire Lock

```bash
# Basic usage
./.claude/skills/cfn-file-operations/execute.sh acquire-lock /path/to/file.txt

# With agent ID tracking
./.claude/skills/cfn-file-operations/execute.sh acquire-lock /path/to/file.txt --agent-id agent-001

# With custom timeout (30 seconds)
./.claude/skills/cfn-file-operations/execute.sh acquire-lock /path/to/file.txt --timeout 30000

# Output: LOCK_ID:LOCK_PATH (e.g., "lock-1234567890-999:/tmp/cfn-locks/abc123.lock")
```

### Release Lock

```bash
# Release lock using lock info from acquire
LOCK_INFO=$(./execute.sh acquire-lock /path/to/file.txt)
# ... perform operations ...
./execute.sh release-lock "$LOCK_INFO"
```

### Renew Lock

```bash
# Renew lock with 5-minute extension (default)
./execute.sh renew-lock "$LOCK_INFO"

# Custom extension (10 minutes)
./execute.sh renew-lock "$LOCK_INFO" --extension 600000
```

### Force Release

```bash
# Force release a stuck lock
./execute.sh force-release /tmp/cfn-locks/abc123.lock
```

### Atomic Write

```bash
# Basic write
./execute.sh atomic-write /path/to/file.txt "Content here"

# With checksum verification
./execute.sh atomic-write /path/to/file.txt "Content" --checksum

# With backup creation
./execute.sh atomic-write /path/to/file.txt "Content" --backup

# With lock (auto-acquire and release)
./execute.sh atomic-write /path/to/file.txt "Content" --lock

# All features combined
./execute.sh atomic-write /path/to/file.txt "Content" --checksum --backup --lock
```

### Atomic Read

```bash
# Read with checksum
./execute.sh atomic-read /path/to/file.txt

# Verify expected checksum
./execute.sh atomic-read /path/to/file.txt --expected-checksum abc123...
```

### Verify Checksum

```bash
./execute.sh verify-checksum /path/to/file.txt expected_sha256_hash
```

### Get Metrics

```bash
./execute.sh get-metrics

# Output (JSON):
# {
#   "activeLocks": 3,
#   "staleLocks": 0,
#   "lockDirectory": "/tmp/cfn-locks"
# }
```

## Complete Workflow Example

```bash
#!/bin/bash
set -euo pipefail

SKILL_PATH="./.claude/skills/cfn-file-operations/execute.sh"
FILE_PATH="/path/to/important-file.txt"
AGENT_ID="backend-dev-001"

# Acquire lock
echo "Acquiring lock..."
LOCK_INFO=$($SKILL_PATH acquire-lock "$FILE_PATH" --agent-id "$AGENT_ID" --timeout 60000)

if [ $? -ne 0 ]; then
  echo "Failed to acquire lock"
  exit 1
fi

echo "Lock acquired: $LOCK_INFO"

# Perform operations with atomic write
echo "Writing file..."
RESULT=$($SKILL_PATH atomic-write "$FILE_PATH" "New content here" --checksum --backup)

if [ $? -ne 0 ]; then
  echo "Write failed, releasing lock"
  $SKILL_PATH release-lock "$LOCK_INFO"
  exit 1
fi

echo "Write successful: $RESULT"

# Renew lock for extended operation
echo "Renewing lock for extended operation..."
$SKILL_PATH renew-lock "$LOCK_INFO" --extension 300000

# Release lock
echo "Releasing lock..."
$SKILL_PATH release-lock "$LOCK_INFO"

echo "Complete!"
```

## Lock File Format

Locks are stored in `/tmp/cfn-locks/` (configurable via `CFN_LOCK_DIR`).

Lock file naming: `${SHA256_HASH_OF_TARGET_PATH}.lock`

Lock metadata (JSON):
```json
{
  "lockId": "lock-1234567890-999",
  "filePath": "/absolute/path/to/file.txt",
  "owner": {
    "pid": 12345,
    "agentId": "backend-dev-001",
    "hostname": "server01"
  },
  "acquiredAt": "2025-11-16T04:00:00.123Z",
  "expiresAt": "2025-11-16T04:05:00.123Z",
  "timeoutMs": 300000,
  "renewalCount": 0,
  "lastRenewedAt": null
}
```

## Write Result Format

Atomic write operations return JSON:
```json
{
  "success": true,
  "filePath": "/absolute/path/to/file.txt",
  "checksum": "abc123def456...",
  "bytesWritten": 1024,
  "durationMs": 45,
  "backupPath": "/absolute/path/to/file.txt.2025-11-16T04-00-00.backup"
}
```

## Integration with TypeScript

This skill integrates with the TypeScript file operations:

```typescript
import { FileLockManager } from './lib/file-lock-manager';
import { AtomicFileWriter } from './lib/atomic-file-writer';

// Use TypeScript API
const manager = new FileLockManager();
const lock = await manager.acquireLock('/path/to/file.txt', {
  agentId: 'agent-001',
  timeout: 30000
});

try {
  const writer = new AtomicFileWriter();
  await writer.writeFile('/path/to/file.txt', content, {
    verifyChecksum: true,
    createBackup: true
  });
} finally {
  await manager.releaseLock(lock.id);
}
```

## Configuration

Environment variables:
- `CFN_LOCK_DIR`: Lock directory (default: `/tmp/cfn-locks`)

Default timeouts:
- Lock acquisition: 300000ms (5 minutes)
- Retry interval: 100ms
- Stale lock detection: 300000ms (5 minutes)

## Error Handling

The skill uses exit codes for error signaling:
- `0`: Success
- `1`: General error (invalid arguments, operation failed)

Error messages are written to stderr.

## Performance

Target metrics:
- Lock acquisition: <100ms (when lock available)
- Atomic write: <50ms (small files)
- Checksum calculation: O(file size)

## Stale Lock Cleanup

Stale locks are automatically cleaned up:
- Locks past expiration time are considered stale
- Cleanup occurs during lock acquisition attempts
- Manual cleanup via `force-release` command

## Security Considerations

- Locks are process-scoped (not system-wide semaphores)
- Lock files are world-readable by default (chmod 644)
- Force release should be used with caution
- Ownership verification prevents unauthorized release

## Testing

See `test.sh` for comprehensive test suite covering:
- Lock acquisition and release
- Timeout scenarios
- Concurrent access
- Atomic writes with verification
- Stale lock detection
- Error handling

## See Also

- TypeScript API: `src/lib/file-lock-manager.ts`
- Atomic Writer: `src/lib/atomic-file-writer.ts`
- Usage Guide: `docs/FILE_OPERATIONS_GUIDE.md`
- Tests: `.claude/skills/cfn-file-operations/test.sh`

## Version

1.0.0 (Task 4.2 - November 2025)
