# Pre-Edit Backup Skill

Creates and manages file backups before edit operations in agent workflows.

## Overview

The Pre-Edit Backup Skill safely preserves file content before modifications, enabling safe recovery if edits encounter issues. It maintains a structured backup directory with metadata and verification capabilities.

## Features

- **Atomic Backup Creation**: Creates timestamped backups with file hash validation
- **Metadata Storage**: JSON metadata tracks backup timestamp, original path, agent ID, and file stats
- **Hash Verification**: SHA256 hash generation (8-char truncated) for change detection
- **Automatic Cleanup**: Removes old backups (24h TTL by default, configurable)
- **Revert Capability**: Restore files to backed-up state
- **Concurrent Safety**: Handles parallel backup operations safely

## Architecture

### Directory Structure
```
.backups/
├── agent-id-1/
│   ├── 1700000000000_a1b2c3d4/
│   │   ├── original-file.ts          (backed-up file)
│   │   ├── metadata.json             (backup metadata)
│   │   └── revert.sh                 (restoration script)
│   └── 1700000010000_e5f6g7h8/
│       ├── original-file.ts
│       ├── metadata.json
│       └── revert.sh
└── agent-id-2/
    └── 1700000020000_i9j0k1l2/
        ├── different-file.ts
        ├── metadata.json
        └── revert.sh
```

### Metadata Format
```json
{
  "timestamp": "2024-11-20T10:30:45.123Z",
  "agentId": "backend-dev-123",
  "originalFile": "/absolute/path/to/file.ts",
  "fileHash": "a1b2c3d4",
  "backupPath": "/absolute/path/.backups/agent-id/timestamp_hash",
  "createdAt": "2024-11-20T10:30:45.000Z",
  "fileSize": 2048,
  "lineCount": 42
}
```

## TypeScript API

### BackupManager Class

```typescript
import { BackupManager, BackupResult } from '@/hooks/backup-manager';

const manager = new BackupManager(projectRoot, {
  retentionHours: 24,
  maxBackups: 10,
  backupDir: '.backups',
});

// Create backup
const result: BackupResult = await manager.createBackup(filePath, agentId);
// Result: {
//   backupPath: "/project/.backups/agent-123/1700000000000_a1b2c3d4",
//   timestamp: "2024-11-20T10:30:45.123Z",
//   fileHash: "a1b2c3d4",
//   originalPath: "/project/src/file.ts",
//   metadata: { ... }
// }

// List all backups for a file
const backups = await manager.listBackups(filePath);
// Returns sorted by most recent first

// Revert to most recent backup
await manager.revertFile(filePath, agentId);

// Verify backup integrity
const isValid = await manager.verifyBackup(backupPath);

// Clean old backups
const deletedCount = await manager.cleanOldBackups(agentId);
```

## CLI Interface

### Pre-Edit Hook CLI

Creates backup before file edits:

```bash
# TypeScript compiled version
node dist/cli/pre-edit-hook.js /path/to/file.ts --agent-id agent-123

# Output: /project/.backups/agent-123/1700000000000_a1b2c3d4
```

### Bash Wrapper

For agent compatibility, use the bash wrapper:

```bash
# Primary wrapper (tries TypeScript, falls back to bash)
./.claude/hooks/cfn-invoke-pre-edit-ts.sh /path/to/file.ts --agent-id agent-123

# Legacy bash-only wrapper
./.claude/hooks/cfn-invoke-pre-edit.sh /path/to/file.ts --agent-id agent-123
```

## Integration

### In Agent Prompts

Pre-edit backup is automatically injected into agent prompts via `src/cli/agent-prompt-builder.ts`:

```bash
# Before any Edit/Write operation
BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE_PATH" --agent-id "$AGENT_ID")

# On validation failure, revert
./.claude/skills/pre-edit-backup/revert-file.sh "$FILE_PATH" --agent-id "$AGENT_ID"
```

### Configuration

Backup behavior is configured in agent initialization:

```typescript
interface BackupConfig {
  retentionHours: number;  // Default: 24
  maxBackups: number;      // Default: 10
  backupDir: string;       // Default: '.backups'
}
```

## Use Cases

### 1. Safe File Modifications

```typescript
// Create backup before risky edit
const backup = await manager.createBackup(filePath, agentId);

try {
  // Perform complex transformations
  await modifyFile(filePath, changes);
} catch (error) {
  // Restore on error
  await manager.revertFile(filePath, agentId);
  throw error;
}
```

### 2. Change Tracking

```typescript
// Get file history for an agent
const backups = await manager.listBackups(filePath);

backups.forEach((backup) => {
  console.log(`Modified by ${backup.metadata.agentId} at ${backup.timestamp}`);
  console.log(`  Size: ${backup.metadata.fileSize} bytes`);
  console.log(`  Hash: ${backup.metadata.fileHash}`);
});
```

### 3. Parallel Agent Safety

```typescript
// Multiple agents backing up same file
const promises = agents.map((agent) =>
  manager.createBackup(filePath, agent.id)
);
const results = await Promise.all(promises);
// Each backup isolated by agent ID
```

## Testing

Run tests with Jest:

```bash
npm test tests/backup-manager.test.ts

# With coverage
npm test tests/backup-manager.test.ts -- --coverage
```

Test coverage includes:
- Backup creation and directory structure
- Metadata generation and storage
- File hash generation and consistency
- Revert functionality
- List operations and sorting
- Cleanup (age-based and count-based)
- Verification and integrity checks
- Edge cases (empty files, large files, special characters, concurrency)

## Performance

- **Backup Creation**: <50ms typical (mostly file I/O)
- **Hash Generation**: <5ms for typical files
- **Cleanup**: <100ms for 10 backups
- **List Operations**: Linear in number of backups
- **Concurrent Backups**: Safe, isolated by agent ID

## Troubleshooting

### Backup Creation Fails

```bash
# Check file exists and is readable
ls -lah "$FILE_PATH"

# Check backup directory is writable
touch .backups/test-write && rm .backups/test-write

# Check disk space
df -h
```

### Cannot Revert

```bash
# List available backups
node -e "
  const { BackupManager } = require('./dist/hooks/backup-manager.js');
  const m = new BackupManager('.');
  m.listBackups('$FILE_PATH').then(b => console.log(JSON.stringify(b, null, 2)))
"

# Verify backup integrity
node -e "
  const { BackupManager } = require('./dist/hooks/backup-manager.js');
  const m = new BackupManager('.');
  m.verifyBackup('$BACKUP_PATH').then(r => console.log(r ? '✅ Valid' : '❌ Corrupted'))
"
```

### Old Backups Not Cleaning

```bash
# Manual cleanup with custom retention
const manager = new BackupManager('.', { retentionHours: 12 });
const deleted = await manager.cleanOldBackups(agentId);
console.log(`Deleted ${deleted} old backups`);
```

## Migration Guide

### From Bash to TypeScript

The TypeScript implementation maintains compatibility with bash:

1. **Existing bash hooks continue working** via wrapper scripts
2. **TypeScript implementation is opt-in** via environment check in wrappers
3. **Gradual rollout**: Use `CFN_USE_TS_HOOKS=true` to enable globally

```bash
# Enable TypeScript hooks for new workflows
export CFN_USE_TS_HOOKS=true

# Old bash API still works
./.claude/hooks/cfn-invoke-pre-edit.sh file.ts --agent-id agent-1
```

## References

- **CLI Configuration**: `.claude/hooks/cfn-post-edit.config.json`
- **Agent Prompt Builder**: `src/cli/agent-prompt-builder.ts`
- **Tests**: `tests/backup-manager.test.ts`
- **Hook Wrappers**: `.claude/hooks/cfn-invoke-pre-edit*.sh`

---

## ⚠️ Bash Deprecation Notice

**The bash implementation of this skill is deprecated as of 2025-11-20.**

**Deprecation Date:** 2025-11-20  
**Removal Date:** 2026-02-20 (90 days)  
**TypeScript Implementation:** dist/cli/pre-edit-hook.js and dist/cli/post-edit-hook.js  
**Migration Guide:** src/hooks/README.md  

### Why Migrate to TypeScript?

- **Type Safety:** Zero runtime type errors with compile-time validation
- **Better Performance:** 5-10ms faster execution, optimized Redis operations
- **Comprehensive Testing:** 90%+ test coverage with unit, integration, and E2E tests
- **Modern Tooling:** Full IDE support, autocomplete, and inline documentation
- **Maintainability:** Single source of truth, easier debugging

### Automatic Migration

Set environment variable to automatically use TypeScript:

```bash
export USE_TYPESCRIPT=true
```

All coordinators and orchestrators will automatically prefer TypeScript implementations.

### Rollback

If issues arise:

```bash
export USE_TYPESCRIPT=false
```

Bash scripts will continue working for the 90-day deprecation period.

### See Also

- **Complete Deprecation List:** [docs/BASH_DEPRECATION_NOTICE.md](../../../docs/BASH_DEPRECATION_NOTICE.md)
- **TypeScript Benefits:** See individual migration guides
- **Test Coverage:** Run `npm test` to verify TypeScript implementation

---
