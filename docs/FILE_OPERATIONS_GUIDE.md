# File Operations Guide

Comprehensive guide for centralized file locking and atomic operations in Claude Flow Novice.

**Part of Task 4.2: Centralized File Locking & Atomic Operations**

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [TypeScript API](#typescript-api)
- [Bash Skill API](#bash-skill-api)
- [Best Practices](#best-practices)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)
- [Performance Tuning](#performance-tuning)
- [Security Considerations](#security-considerations)

## Overview

The File Operations system provides two complementary APIs for safe concurrent file access:

1. **TypeScript API**: `FileLockManager` and `AtomicFileWriter` classes
2. **Bash Skill**: Command-line interface for shell scripts

Both implementations share the same lock directory (`/tmp/cfn-locks/`) and are fully compatible.

### Key Features

- **File Locking**: Prevent concurrent modifications with queuing support
- **Atomic Writes**: Write-then-move pattern with verification
- **SHA256 Checksums**: Verify data integrity
- **Automatic Rollback**: Restore from backup on failure
- **Lock Renewal**: Extend locks for long-running operations
- **Stale Detection**: Automatic cleanup of expired locks
- **Performance**: <100ms lock acquisition (when available)

## Architecture

### Lock Manager Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Application Layer                    │
│  ┌──────────────────┐    ┌─────────────────────┐   │
│  │  TypeScript API  │    │   Bash Skill API    │   │
│  └─────────┬────────┘    └──────────┬──────────┘   │
│            │                         │              │
├────────────┼─────────────────────────┼──────────────┤
│            │    Lock Manager Layer   │              │
│  ┌─────────▼─────────────────────────▼──────────┐  │
│  │         FileLockManager (Singleton)          │  │
│  │  - Active locks map                          │  │
│  │  - Waiting queues                            │  │
│  │  - Metrics tracking                          │  │
│  └─────────┬──────────────────────────────────┬─┘  │
├────────────┼──────────────────────────────────┼────┤
│            │   Lock Storage Layer   │          │   │
│  ┌─────────▼────────┐    ┌──────────▼──────────┐  │
│  │  Lock Files (.lock) │    │  Lock Metadata (JSON) │  │
│  │  /tmp/cfn-locks/    │    │  Owner, Expiration    │  │
│  └──────────────────┘    └─────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Atomic Write Architecture

```
┌─────────────────────────────────────────────────────┐
│              Write Operation Flow                    │
│                                                      │
│  1. Acquire Lock (optional)                         │
│           ↓                                          │
│  2. Create Backup (optional)                        │
│           ↓                                          │
│  3. Write to Temp File                              │
│           ↓                                          │
│  4. Calculate SHA256 Checksum                       │
│           ↓                                          │
│  5. Verify Checksum                                 │
│           ↓                                          │
│  6. Preserve Permissions                            │
│           ↓                                          │
│  7. Atomic Move (rename)                            │
│           ↓                                          │
│  8. Release Lock                                    │
│           ↓                                          │
│  ✓ Success (or Rollback on Failure)                │
└─────────────────────────────────────────────────────┘
```

## TypeScript API

### File Lock Manager

#### Basic Usage

```typescript
import { FileLockManager } from './lib/file-lock-manager';

const manager = new FileLockManager();

// Acquire lock
const lock = await manager.acquireLock('/path/to/file.txt', {
  agentId: 'backend-dev-001',
  timeout: 30000, // 30 seconds
  waitInQueue: true
});

try {
  // Perform file operations
  // ...
} finally {
  // Always release lock
  await manager.releaseLock(lock.id);
}
```

#### Lock Acquisition Options

```typescript
interface LockAcquisitionOptions {
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;

  /** Retry interval in milliseconds (default: 100) */
  retryInterval?: number;

  /** Agent ID for tracking */
  agentId?: string;

  /** Wait in queue if lock is held (default: true) */
  waitInQueue?: boolean;

  /** Stale lock detection timeout (default: 300000) */
  staleTimeout?: number;
}
```

#### Helper Function

```typescript
import { withFileLock } from './lib/file-lock-manager';

// Automatic lock acquisition and release
const result = await withFileLock(
  '/path/to/file.txt',
  async () => {
    // Your code here - lock is automatically managed
    return await performOperation();
  },
  { agentId: 'agent-001', timeout: 60000 }
);
```

#### Lock Renewal

```typescript
// For long-running operations
const lock = await manager.acquireLock('/path/to/file.txt');

// Renew lock (extend by 5 minutes)
await manager.renewLock(lock.id, 300000);

// Continue working...

await manager.releaseLock(lock.id);
```

#### Force Release

```typescript
// Force release a stuck lock (use with caution)
const lockPath = '/tmp/cfn-locks/abc123.lock';
await manager.forceReleaseLock(lockPath);
```

#### Metrics

```typescript
const metrics = manager.getMetrics();

console.log(`Active locks: ${metrics.activeLocks}`);
console.log(`Average acquisition time: ${metrics.avgAcquisitionTimeMs}ms`);
console.log(`Stale locks removed: ${metrics.staleLocksRemoved}`);
```

### Atomic File Writer

#### Basic Usage

```typescript
import { AtomicFileWriter } from './lib/atomic-file-writer';

const writer = new AtomicFileWriter();

const result = await writer.writeFile(
  '/path/to/file.txt',
  'Content to write',
  {
    verifyChecksum: true,
    createBackup: true,
    preservePermissions: true
  }
);

console.log(`Wrote ${result.bytesWritten} bytes`);
console.log(`Checksum: ${result.checksum}`);
console.log(`Backup: ${result.backupPath}`);
```

#### Write Options

```typescript
interface WriteOptions {
  /** File encoding (default: 'utf8') */
  encoding?: BufferEncoding;

  /** Create backup before overwrite (default: false) */
  createBackup?: boolean;

  /** Preserve file permissions (default: true) */
  preservePermissions?: boolean;

  /** Preserve file ownership (default: false, requires sudo) */
  preserveOwnership?: boolean;

  /** Verify checksum after write (default: true) */
  verifyChecksum?: boolean;

  /** Lock file during write (default: true) */
  useLock?: boolean;

  /** Lock options (if useLock is true) */
  lockOptions?: LockAcquisitionOptions;

  /** Backup directory (default: same as target) */
  backupDir?: string;
}
```

#### Helper Functions

```typescript
import { atomicWriteFile, atomicReadFile } from './lib/atomic-file-writer';

// Simplified write
await atomicWriteFile('/path/to/file.txt', 'Content', {
  verifyChecksum: true,
  createBackup: true
});

// Read with checksum verification
const { content, checksum } = await atomicReadFile(
  '/path/to/file.txt',
  'expected_checksum_here'
);
```

#### Checksum Verification

```typescript
const writer = new AtomicFileWriter();

// Verify file checksum
const isValid = await writer.verifyChecksum(
  '/path/to/file.txt',
  'abc123def456...'
);

if (!isValid) {
  console.error('File corrupted!');
}
```

## Bash Skill API

### Installation

The skill is located at:
```bash
.claude/skills/cfn-file-operations/
```

### Command Reference

#### Acquire Lock

```bash
./.claude/skills/cfn-file-operations/execute.sh acquire-lock \
  /path/to/file.txt \
  --agent-id agent-001 \
  --timeout 30000

# Output: LOCK_ID:LOCK_PATH
# Example: lock-1234567890-999:/tmp/cfn-locks/abc123.lock
```

#### Release Lock

```bash
LOCK_INFO="lock-123:/tmp/cfn-locks/abc.lock"

./.claude/skills/cfn-file-operations/execute.sh release-lock "$LOCK_INFO"
```

#### Renew Lock

```bash
./.claude/skills/cfn-file-operations/execute.sh renew-lock \
  "$LOCK_INFO" \
  --extension 300000  # 5 minutes
```

#### Atomic Write

```bash
./.claude/skills/cfn-file-operations/execute.sh atomic-write \
  /path/to/file.txt \
  "Content to write" \
  --checksum \
  --backup \
  --lock

# Output (JSON):
# {
#   "success": true,
#   "filePath": "/path/to/file.txt",
#   "checksum": "abc123...",
#   "bytesWritten": 1024,
#   "durationMs": 45,
#   "backupPath": "/path/to/file.txt.2025-11-16T04-00-00.backup"
# }
```

#### Atomic Read

```bash
./.claude/skills/cfn-file-operations/execute.sh atomic-read \
  /path/to/file.txt \
  --expected-checksum abc123...

# Output (JSON):
# {
#   "content": "File content here",
#   "checksum": "abc123..."
# }
```

#### Verify Checksum

```bash
./.claude/skills/cfn-file-operations/execute.sh verify-checksum \
  /path/to/file.txt \
  expected_sha256_hash

# Output (JSON):
# {
#   "filePath": "/path/to/file.txt",
#   "expectedChecksum": "...",
#   "actualChecksum": "...",
#   "matches": 1
# }
```

#### Get Metrics

```bash
./.claude/skills/cfn-file-operations/execute.sh get-metrics

# Output (JSON):
# {
#   "activeLocks": 3,
#   "staleLocks": 0,
#   "lockDirectory": "/tmp/cfn-locks"
# }
```

## Best Practices

### 1. Always Use Locks for Critical Operations

```typescript
// ✅ GOOD - Lock protects critical section
await withFileLock('/path/to/config.json', async () => {
  const config = JSON.parse(await fs.readFile('/path/to/config.json', 'utf8'));
  config.value++;
  await atomicWriteFile('/path/to/config.json', JSON.stringify(config));
});

// ❌ BAD - Race condition possible
const config = JSON.parse(await fs.readFile('/path/to/config.json', 'utf8'));
config.value++;
await fs.writeFile('/path/to/config.json', JSON.stringify(config));
```

### 2. Use Appropriate Timeouts

```typescript
// ✅ GOOD - Reasonable timeout for operation
const lock = await manager.acquireLock('/path/to/file.txt', {
  timeout: 30000  // 30 seconds for quick operation
});

// ❌ BAD - Indefinite wait
const lock = await manager.acquireLock('/path/to/file.txt', {
  timeout: Infinity  // Can hang forever
});
```

### 3. Always Release Locks

```typescript
// ✅ GOOD - Lock released even on error
const lock = await manager.acquireLock('/path/to/file.txt');
try {
  await performOperation();
} finally {
  await manager.releaseLock(lock.id);
}

// ❌ BAD - Lock leaked on error
const lock = await manager.acquireLock('/path/to/file.txt');
await performOperation();  // If this throws, lock is leaked
await manager.releaseLock(lock.id);
```

### 4. Use Atomic Writes with Verification

```typescript
// ✅ GOOD - Checksum verification ensures data integrity
await atomicWriteFile('/path/to/important.json', data, {
  verifyChecksum: true,
  createBackup: true
});

// ❌ BAD - No verification, corruption possible
await fs.writeFile('/path/to/important.json', data);
```

### 5. Renew Locks for Long Operations

```typescript
// ✅ GOOD - Renew lock during long operation
const lock = await manager.acquireLock('/path/to/file.txt', {
  timeout: 60000  // 1 minute
});

try {
  for (let i = 0; i < 10; i++) {
    await processChunk(i);

    // Renew every iteration
    if (i > 0 && i % 3 === 0) {
      await manager.renewLock(lock.id, 60000);
    }
  }
} finally {
  await manager.releaseLock(lock.id);
}
```

### 6. Use Agent IDs for Tracking

```typescript
// ✅ GOOD - Agent ID helps debug lock ownership
const lock = await manager.acquireLock('/path/to/file.txt', {
  agentId: 'backend-dev-001'
});

// ❌ BAD - No tracking info
const lock = await manager.acquireLock('/path/to/file.txt');
```

## Common Patterns

### Pattern 1: Read-Modify-Write

```typescript
import { withFileLock } from './lib/file-lock-manager';
import { atomicReadFile, atomicWriteFile } from './lib/atomic-file-writer';

async function incrementCounter(filePath: string): Promise<number> {
  return withFileLock(filePath, async () => {
    // Read current value
    const { content, checksum } = await atomicReadFile(filePath);
    const counter = parseInt(content, 10) || 0;

    // Modify
    const newValue = counter + 1;

    // Write back
    await atomicWriteFile(filePath, newValue.toString(), {
      verifyChecksum: true,
      createBackup: true
    });

    return newValue;
  });
}
```

### Pattern 2: Batch Operations with Single Lock

```typescript
async function batchUpdate(files: string[], transform: (content: string) => string) {
  // Sort files alphabetically to prevent deadlocks
  const sortedFiles = [...files].sort();

  const manager = new FileLockManager();
  const locks: string[] = [];

  try {
    // Acquire all locks in order
    for (const file of sortedFiles) {
      const lock = await manager.acquireLock(file, {
        agentId: 'batch-updater',
        timeout: 60000
      });
      locks.push(lock.id);
    }

    // Perform batch update
    for (const file of sortedFiles) {
      const { content } = await atomicReadFile(file);
      const updated = transform(content);
      await atomicWriteFile(file, updated, {
        verifyChecksum: true
      });
    }
  } finally {
    // Release all locks in reverse order
    for (const lockId of locks.reverse()) {
      await manager.releaseLock(lockId);
    }
  }
}
```

### Pattern 3: Conditional Write with Checksum

```typescript
async function conditionalWrite(
  filePath: string,
  newContent: string,
  expectedChecksum: string
): Promise<boolean> {
  return withFileLock(filePath, async () => {
    // Verify current checksum
    const writer = new AtomicFileWriter();
    const isValid = await writer.verifyChecksum(filePath, expectedChecksum);

    if (!isValid) {
      console.log('File changed since last read, skipping write');
      return false;
    }

    // Write only if checksum matches
    await atomicWriteFile(filePath, newContent, {
      verifyChecksum: true,
      createBackup: true
    });

    return true;
  });
}
```

### Pattern 4: Bash Script Integration

```bash
#!/bin/bash
set -euo pipefail

SKILL="./.claude/skills/cfn-file-operations/execute.sh"
CONFIG_FILE="/etc/app/config.json"
AGENT_ID="config-updater-$$"

# Acquire lock
echo "Acquiring lock..."
LOCK_INFO=$($SKILL acquire-lock "$CONFIG_FILE" --agent-id "$AGENT_ID" --timeout 30000)

# Trap to ensure lock release on exit
trap "$SKILL release-lock '$LOCK_INFO'" EXIT

# Read current config
echo "Reading config..."
CURRENT=$($SKILL atomic-read "$CONFIG_FILE")
CONTENT=$(echo "$CURRENT" | jq -r '.content')

# Modify config
echo "Updating config..."
UPDATED=$(echo "$CONTENT" | jq '.version = "2.0.0"')

# Write back atomically
echo "Writing config..."
$SKILL atomic-write "$CONFIG_FILE" "$UPDATED" --checksum --backup

echo "Config updated successfully!"
```

## Troubleshooting

### Issue: Lock Acquisition Timeout

**Symptom**: `LOCK_TIMEOUT` error when acquiring lock

**Causes**:
1. Another process holds the lock
2. Deadlock situation
3. Stale lock not cleaned up

**Solutions**:
```typescript
// 1. Check active locks
const metrics = manager.getMetrics();
console.log(`Active locks: ${metrics.activeLocks}`);

// 2. Force release if needed (use with caution)
await manager.forceReleaseLock('/tmp/cfn-locks/abc123.lock');

// 3. Increase timeout
const lock = await manager.acquireLock('/path/to/file.txt', {
  timeout: 120000  // 2 minutes instead of default
});
```

### Issue: Checksum Mismatch

**Symptom**: `CHECKSUM_MISMATCH` error during write or read

**Causes**:
1. File corrupted during write
2. Concurrent modification without lock
3. File modified between read and verification

**Solutions**:
```typescript
// Always use locks for critical files
await withFileLock('/path/to/file.txt', async () => {
  await atomicWriteFile('/path/to/file.txt', content, {
    verifyChecksum: true,
    createBackup: true  // Enable rollback
  });
});

// Verify before and after
const { checksum: beforeChecksum } = await atomicReadFile('/path/to/file.txt');
// ... perform operations ...
const isValid = await writer.verifyChecksum('/path/to/file.txt', beforeChecksum);
```

### Issue: Lock Not Released

**Symptom**: Process exits but lock file remains

**Causes**:
1. Process killed forcefully (SIGKILL)
2. Exception before release
3. Missing finally block

**Solutions**:
```typescript
// 1. Always use try-finally
const lock = await manager.acquireLock('/path/to/file.txt');
try {
  await performOperation();
} finally {
  await manager.releaseLock(lock.id);
}

// 2. Or use helper function
await withFileLock('/path/to/file.txt', async () => {
  await performOperation();
});

// 3. Manual cleanup of stale locks
await manager.forceReleaseLock('/tmp/cfn-locks/abc123.lock');
```

### Issue: Performance Degradation

**Symptom**: Lock acquisition takes >100ms

**Causes**:
1. High contention (many processes waiting)
2. Slow filesystem (network mount)
3. Lock directory on slow storage

**Solutions**:
```bash
# 1. Move lock directory to fast storage
export CFN_LOCK_DIR="/dev/shm/cfn-locks"

# 2. Reduce lock duration
const lock = await manager.acquireLock('/path/to/file.txt', {
  timeout: 10000  // Shorter timeout
});

// 3. Use queue status to detect contention
const queueStatus = manager.getQueueStatus('/path/to/file.txt');
if (queueStatus && queueStatus.total > 5) {
  console.warn('High contention detected');
}
```

## Performance Tuning

### Lock Directory Location

For best performance, use RAM-backed filesystem:

```bash
# In .env or environment
export CFN_LOCK_DIR="/dev/shm/cfn-locks"

# Or tmpfs mount
sudo mount -t tmpfs -o size=100M tmpfs /tmp/cfn-locks
```

### Retry Interval Tuning

```typescript
// Fast polling for short-lived locks
const lock = await manager.acquireLock('/path/to/file.txt', {
  retryInterval: 50  // Check every 50ms
});

// Slow polling for long-held locks
const lock = await manager.acquireLock('/path/to/file.txt', {
  retryInterval: 500  // Check every 500ms
});
```

### Batch Operations

```typescript
// ✅ GOOD - One lock for multiple operations
await withFileLock('/path/to/file.txt', async () => {
  for (let i = 0; i < 100; i++) {
    await appendToFile('/path/to/file.txt', `Line ${i}\n`);
  }
});

// ❌ BAD - Lock per operation (100x overhead)
for (let i = 0; i < 100; i++) {
  await withFileLock('/path/to/file.txt', async () => {
    await appendToFile('/path/to/file.txt', `Line ${i}\n`);
  });
}
```

## Security Considerations

### Lock Ownership Verification

The system verifies lock ownership before release:

```typescript
// This will fail if another process owns the lock
await manager.releaseLock(lock.id);  // Throws if not owner
```

### Force Release Authorization

Force release should be restricted:

```typescript
// Only allow force release for authorized users/processes
if (process.getuid && process.getuid() === 0) {
  await manager.forceReleaseLock(lockPath);
} else {
  throw new Error('Unauthorized force release attempt');
}
```

### Sensitive Data in Lock Files

Lock files contain metadata but not file content:

```json
{
  "lockId": "...",
  "filePath": "/path/to/sensitive.txt",
  "owner": { "pid": 12345, "agentId": "agent-001" }
}
```

File paths are visible in lock files. For sensitive paths, consider:

```typescript
// Hash sensitive paths
const hashPath = (path: string) => {
  return crypto.createHash('sha256').update(path).digest('hex');
};
```

### Backup File Security

Backup files inherit source file permissions:

```typescript
await atomicWriteFile('/path/to/secret.json', data, {
  createBackup: true,
  preservePermissions: true  // Backup gets same permissions
});
```

## See Also

- [FileLockManager API](../src/lib/file-lock-manager.ts)
- [AtomicFileWriter API](../src/lib/atomic-file-writer.ts)
- [Bash Skill Documentation](../.claude/skills/cfn-file-operations/SKILL.md)
- [Test Suite](../.claude/skills/cfn-file-operations/test.sh)

## Version History

- **1.0.0** (November 2025): Initial implementation (Task 4.2)
  - File lock manager with queuing
  - Atomic file writer with SHA256 verification
  - Bash skill integration
  - Comprehensive test coverage
