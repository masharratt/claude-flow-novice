# Pre-Edit Backup System Design

## Overview

The Pre-Edit Backup System is designed to provide a robust, low-overhead mechanism for capturing file states before modifications in parallel agent sessions, eliminating the need for destructive git operations like `git revert`.

## Architecture Diagram

```
Pre-Edit Backup System
├── .backups/
│   ├── [agent-id]/
│   │   ├── [timestamp]_[file-hash]/
│   │   │   ├── original_file
│   │   │   └── backup_metadata.json
│   │   └── ...
│   └── cleanup.lock
├── pre-edit-backup.sh (Backup Utility)
├── pre-edit-restore.sh (Restore Utility)
└── backup-cleanup.sh (Retention Management)
```

## Folder Structure Specification

### Base Backup Directory
- Location: `.backups/` (untracked, added to .gitignore)
- Rationale: Isolated from git, prevents accidental commits
- Permissions: 700 (rwx for owner only)

### Backup Subdirectory Structure
- Primary Path: `.backups/[agent-id]/[timestamp]_[file-hash]/`
- Components:
  - `[agent-id]`: Unique identifier for the agent creating the backup
  - `[timestamp]`: Unix timestamp (precise to milliseconds)
  - `[file-hash]`: SHA-256 hash of the original file content

### Backup Metadata
File: `backup_metadata.json`
```json
{
  "agent_id": "system-architect-1",
  "original_path": "/path/to/original/file.txt",
  "backup_timestamp": 1703116800000,
  "file_hash": "sha256_hash_of_original_content",
  "backup_ttl": 86400,  // 24h in seconds
  "backup_status": "active"
}
```

## Hook Interface Specification

### Pre-Edit Hook: `.claude/hooks/cfn-invoke-pre-edit.sh`
```bash
#!/bin/bash

# Pre-Edit Backup Hook
# Usage: .claude/hooks/cfn-invoke-pre-edit.sh "$FILE_PATH" --agent-id "$AGENT_ID"

FILE_PATH="$1"
AGENT_ID=""

# Parse agent-id
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --agent-id) AGENT_ID="$2"; shift ;;
    esac
    shift
done

# Validate inputs
[[ -z "$FILE_PATH" ]] && { echo "Error: No file path provided"; exit 1; }
[[ -z "$AGENT_ID" ]] && { echo "Error: No agent ID provided"; exit 1; }

# Execute pre-edit backup
./.claude/skills/pre-edit-backup/backup.sh "$FILE_PATH" "$AGENT_ID"
```

## Revert Utility API

### Pre-Edit Backup Script: `.claude/skills/pre-edit-backup/backup.sh`
```bash
#!/bin/bash

FILE_PATH="$1"
AGENT_ID="$2"

BACKUP_BASE_DIR=".backups"
TIMESTAMP=$(date +%s%3N)
FILE_HASH=$(sha256sum "$FILE_PATH" | cut -d' ' -f1)

# Create backup directory
BACKUP_DIR="${BACKUP_BASE_DIR}/${AGENT_ID}/${TIMESTAMP}_${FILE_HASH}"
mkdir -p "$BACKUP_DIR"

# Copy original file
cp "$FILE_PATH" "${BACKUP_DIR}/original_file"

# Generate metadata
jq -n \
    --arg agent_id "$AGENT_ID" \
    --arg original_path "$FILE_PATH" \
    --arg timestamp "$TIMESTAMP" \
    --arg file_hash "$FILE_HASH" \
    '{
        agent_id: $agent_id,
        original_path: $original_path,
        backup_timestamp: ($timestamp | tonumber),
        file_hash: $file_hash,
        backup_ttl: 86400,
        backup_status: "active"
    }' > "${BACKUP_DIR}/backup_metadata.json"

echo "Backup created: ${BACKUP_DIR}"
```

### Restore Utility: `.claude/skills/pre-edit-backup/restore.sh`
```bash
#!/bin/bash

BACKUP_DIR="$1"
ORIGINAL_PATH=$(jq -r '.original_path' "${BACKUP_DIR}/backup_metadata.json")

# Restore file
cp "${BACKUP_DIR}/original_file" "$ORIGINAL_PATH"

# Update backup status
jq '.backup_status = "restored"' "${BACKUP_DIR}/backup_metadata.json" > temp.json
mv temp.json "${BACKUP_DIR}/backup_metadata.json"

echo "File restored from backup: ${BACKUP_DIR}"
```

### Cleanup Utility: `.claude/skills/pre-edit-backup/cleanup.sh`
```bash
#!/bin/bash

BACKUP_BASE_DIR=".backups"
CURRENT_TIME=$(date +%s)

# Prevent concurrent cleanup
LOCKFILE="${BACKUP_BASE_DIR}/cleanup.lock"
exec 9>"$LOCKFILE"
flock -n 9 || { echo "Cleanup already in progress"; exit 1; }

# Find and remove expired backups
find "$BACKUP_BASE_DIR" -mindepth 2 -maxdepth 2 -type d | while read -r backup_dir; do
    metadata_file="${backup_dir}/backup_metadata.json"

    if [[ -f "$metadata_file" ]]; then
        backup_timestamp=$(jq -r '.backup_timestamp' "$metadata_file")
        backup_ttl=$(jq -r '.backup_ttl' "$metadata_file")

        # Check if backup has expired
        if (( CURRENT_TIME - backup_timestamp > backup_ttl )); then
            echo "Removing expired backup: ${backup_dir}"
            rm -rf "$backup_dir"
        fi
    fi
done
```

## Migration Plan

1. Update `.gitignore` to include `.backups/`
2. Add execution permissions to scripts
3. Update post-edit hook to optionally call pre-edit backup
4. Modify agent Edit/Write operations to use new hook

## Configuration

Add to `.claude/hooks/post-edit.config.json`:
```json
{
    "pre_edit_backup": {
        "enabled": true,
        "default_ttl": 86400,
        "retention_strategy": "oldest_first"
    }
}
```

## Success Validation

- Automated Test Script: `tests/pre-edit-backup-test.sh`
  - Parallel agent file edit simulation
  - Backup creation verification
  - Restore functionality check
  - Cleanup process validation

## Performance Considerations

- Use SHA-256 for efficient file identification
- Lightweight JSON for metadata
- Background cleanup process
- Optional backup (configurable)

## Security Considerations

- Backup files stored with 700 permissions
- Agent-specific backup directories
- Metadata includes traceability information
- Optional TTL for automatic cleanup