# Artifact Registry Adoption Guide

**Version:** 1.0.0
**Last Updated:** 2025-11-15
**Integration Point:** 2.11 - Artifact Registry

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [API Reference](#api-reference)
4. [Query Patterns](#query-patterns)
5. [TTL and Retention Policies](#ttl-and-retention-policies)
6. [Cleanup Automation](#cleanup-automation)
7. [Migration Guide](#migration-guide)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Artifact Registry provides centralized management for all project artifacts with automatic TTL-based cleanup, comprehensive querying, and audit trails.

### Key Features

- **Centralized Storage**: All artifacts in `artifacts/registry/` with organized subdirectories
- **Automatic TTL Cleanup**: Policy-based expiration and archival (ephemeral, standard, permanent)
- **Comprehensive Metadata**: Tags, versioning, lineage tracking, checksums
- **Query Interface**: Flexible filtering by type, status, tags, dates
- **Concurrent Safety**: WAL mode for safe concurrent access
- **Audit Trail**: Complete lifecycle tracking (created, updated, archived, deleted)

### Artifact Types

- `code` - Source code files
- `documentation` - Markdown, PDFs, text files
- `test` - Test files and reports
- `config` - Configuration files
- `binary` - Compiled binaries and executables
- `data` - Data files (CSV, JSON, databases)
- `model` - Machine learning models
- `report` - Generated reports and analytics
- `other` - Miscellaneous artifacts

---

## Quick Start

### 1. Installation

```typescript
import { ArtifactRegistry } from '../src/lib/artifact-registry';

// Initialize registry (creates database if needed)
const registry = new ArtifactRegistry('./artifacts/database/registry.db');

// Or use singleton pattern
const registry = ArtifactRegistry.getInstance('./artifacts/database/registry.db');
```

### 2. Create Your First Artifact

```typescript
import { ArtifactMetadata } from '../src/lib/artifact-registry';

const metadata: ArtifactMetadata = {
    name: 'api-server.ts',
    type: 'code',
    format: 'typescript',
    storage_location: './artifacts/registry/codes/api-server.ts',
    tags: ['backend', 'api'],
    retention_policy: 'standard', // 30 days retention
    metadata: {
        author: 'backend-developer-agent',
        purpose: 'REST API implementation'
    }
};

const artifact = registry.createArtifact(metadata);
console.log(`Created artifact: ${artifact.id}`);
```

### 3. Query Artifacts

```typescript
// Find all code artifacts
const codeArtifacts = registry.listArtifacts({ type: 'code' });

// Find artifacts by tags
const backendArtifacts = registry.listArtifacts({ tags: ['backend'] });

// Find expired artifacts
const expired = registry.findExpiredArtifacts();
```

### 4. Archive and Delete

```typescript
// Archive an artifact (mark as archived)
const archived = registry.archiveArtifact(artifact.id);

// Delete an artifact (soft delete)
const deleted = registry.deleteArtifact(artifact.id);
```

---

## API Reference

### ArtifactRegistry Class

#### Constructor

```typescript
constructor(dbPath: string)
```

Creates new registry instance and initializes database schema.

**Parameters:**
- `dbPath` (string) - Path to SQLite database file

**Example:**
```typescript
const registry = new ArtifactRegistry('./artifacts/database/registry.db');
```

---

#### createArtifact(metadata)

Creates new artifact with metadata.

**Parameters:**
- `metadata` (ArtifactMetadata) - Artifact metadata

**Returns:** `Artifact` - Created artifact with generated ID

**Throws:**
- `ArtifactValidationError` - Invalid metadata
- `ArtifactDatabaseError` - Database operation failed

**Example:**
```typescript
const artifact = registry.createArtifact({
    name: 'test-report.pdf',
    type: 'report',
    storage_location: './artifacts/registry/reports/test-report.pdf',
    retention_policy: 'ephemeral', // 7 days
    tags: ['testing', 'qa']
});
```

---

#### getArtifact(id)

Retrieves artifact by ID.

**Parameters:**
- `id` (string) - Artifact ID

**Returns:** `Artifact | null` - Found artifact or null

**Example:**
```typescript
const artifact = registry.getArtifact('artifact-1731939872-abc123');
if (artifact) {
    console.log(`Found: ${artifact.name}`);
}
```

---

#### listArtifacts(filters?)

Lists artifacts with optional filters.

**Parameters:**
- `filters` (ArtifactFilters, optional) - Query filters

**Returns:** `Artifact[]` - Array of matching artifacts

**Example:**
```typescript
// Filter by multiple criteria
const artifacts = registry.listArtifacts({
    type: 'code',
    status: 'active',
    tags: ['frontend'],
    created_after: new Date('2025-01-01'),
    limit: 10
});
```

---

#### archiveArtifact(id)

Archives an artifact (marks as archived, not deleted).

**Parameters:**
- `id` (string) - Artifact ID

**Returns:** `Artifact` - Updated artifact

**Throws:**
- `ArtifactNotFoundError` - Artifact not found
- `ArtifactValidationError` - Cannot archive deleted artifact

**Example:**
```typescript
const archived = registry.archiveArtifact('artifact-1731939872-abc123');
console.log(`Archived at: ${archived.archived_at}`);
```

---

#### deleteArtifact(id)

Soft deletes an artifact (marks as deleted, preserves record).

**Parameters:**
- `id` (string) - Artifact ID

**Returns:** `Artifact` - Updated artifact

**Throws:**
- `ArtifactNotFoundError` - Artifact not found

**Example:**
```typescript
const deleted = registry.deleteArtifact('artifact-1731939872-abc123');
console.log(`Deleted at: ${deleted.deleted_at}`);
```

---

#### getStatsByRetentionPolicy()

Gets artifact statistics grouped by retention policy.

**Returns:** `Record<RetentionPolicy, ArtifactStats>`

**Example:**
```typescript
const stats = registry.getStatsByRetentionPolicy();
console.log(`Standard policy: ${stats.standard.total} total, ${stats.standard.active} active`);
```

---

#### findExpiredArtifacts()

Finds all expired artifacts eligible for archival.

**Returns:** `Artifact[]` - Array of expired artifacts

**Example:**
```typescript
const expired = registry.findExpiredArtifacts();
console.log(`Found ${expired.length} expired artifacts`);
```

---

## Query Patterns

### Filter Options

```typescript
interface ArtifactFilters {
    type?: ArtifactType;              // Filter by artifact type
    status?: ArtifactStatus;          // 'active', 'archived', 'deleted'
    retention_policy?: RetentionPolicy; // 'ephemeral', 'standard', 'permanent', 'custom'
    swarm_id?: string;                // Filter by swarm
    agent_id?: string;                // Filter by agent
    task_id?: string;                 // Filter by task
    tags?: string[];                  // Filter by tags (AND logic)
    cleanup_eligible?: boolean;       // Only cleanup-eligible artifacts
    created_after?: Date;             // Created after date
    created_before?: Date;            // Created before date
    expires_before?: Date;            // Expires before date
    limit?: number;                   // Pagination limit
    offset?: number;                  // Pagination offset
}
```

### Common Query Examples

#### Find All Active Code Artifacts

```typescript
const activeCode = registry.listArtifacts({
    type: 'code',
    status: 'active'
});
```

#### Find Recent Documentation

```typescript
const recentDocs = registry.listArtifacts({
    type: 'documentation',
    created_after: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    limit: 20
});
```

#### Find Artifacts by Multiple Tags

```typescript
const backendTests = registry.listArtifacts({
    type: 'test',
    tags: ['backend', 'integration']
});
```

#### Find Expiring Soon

```typescript
const expiringSoon = registry.listArtifacts({
    status: 'active',
    expires_before: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
});
```

#### Paginate Through All Artifacts

```typescript
const pageSize = 50;
let offset = 0;
let hasMore = true;

while (hasMore) {
    const page = registry.listArtifacts({ limit: pageSize, offset });

    // Process page
    page.forEach(artifact => {
        console.log(`${artifact.name} - ${artifact.type}`);
    });

    offset += pageSize;
    hasMore = page.length === pageSize;
}
```

#### Find Artifacts by Agent

```typescript
const agentArtifacts = registry.listArtifacts({
    agent_id: 'backend-developer-1731939872',
    status: 'active'
});
```

---

## TTL and Retention Policies

### Retention Policy Types

| Policy | Retention Period | Use Case |
|--------|-----------------|----------|
| `ephemeral` | 7 days | Temporary files, debug logs, cache |
| `standard` | 30 days | Most artifacts, work products |
| `permanent` | Never expires | Critical artifacts, compliance docs |
| `custom` | User-defined | Flexible retention needs |

### Retention Policy Configuration

```typescript
// Ephemeral (7 days)
const tempArtifact = registry.createArtifact({
    name: 'debug.log',
    type: 'other',
    storage_location: './artifacts/registry/other/debug.log',
    retention_policy: 'ephemeral'
});

// Standard (30 days) - default
const standardArtifact = registry.createArtifact({
    name: 'api.ts',
    type: 'code',
    storage_location: './artifacts/registry/codes/api.ts',
    retention_policy: 'standard'
});

// Permanent (never expires)
const permanentArtifact = registry.createArtifact({
    name: 'license.pdf',
    type: 'documentation',
    storage_location: './artifacts/registry/documentation/license.pdf',
    retention_policy: 'permanent'
});

// Custom retention
const customArtifact = registry.createArtifact({
    name: 'quarterly-report.pdf',
    type: 'report',
    storage_location: './artifacts/registry/reports/quarterly-report.pdf',
    retention_policy: 'custom',
    retention_days: 90 // 90 days
});
```

### Automatic Expiration

The database automatically calculates `expires_at` using triggers:

```sql
expires_at = created_at + retention_days
```

**Example:**
- Created: 2025-01-01 00:00:00
- Retention: 30 days (standard)
- Expires: 2025-01-31 00:00:00

---

## Cleanup Automation

### Cleanup Script Usage

The `artifact-cleanup.sh` script automates TTL-based cleanup:

```bash
# Dry run (preview what would be cleaned)
./scripts/artifact-cleanup.sh --dry-run

# Production cleanup
./scripts/artifact-cleanup.sh

# Cleanup specific retention policy
./scripts/artifact-cleanup.sh --policy ephemeral

# Custom archive retention (default 90 days)
./scripts/artifact-cleanup.sh --archive-days 180

# Verbose logging
./scripts/artifact-cleanup.sh --verbose

# Custom database and log paths
./scripts/artifact-cleanup.sh \
    --db-path ./artifacts/database/registry.db \
    --log-file ./artifacts/logs/cleanup.log
```

### Cleanup Process

1. **Find Expired Active Artifacts**
   - Query: `status = 'active' AND datetime('now') >= expires_at`
   - Action: Archive (set `status = 'archived'`, `archived_at = now`)

2. **Find Old Archived Artifacts**
   - Query: `status = 'archived' AND datetime('now') >= archived_at + archive_days`
   - Action: Delete (set `status = 'deleted'`, `deleted_at = now`)

### Cron Configuration

Set up automatic cleanup with cron:

```bash
# Edit crontab
crontab -e

# Run cleanup daily at 2 AM
0 2 * * * /path/to/claude-flow-novice/scripts/artifact-cleanup.sh >> /path/to/cleanup-cron.log 2>&1

# Run cleanup weekly on Sunday at 3 AM
0 3 * * 0 /path/to/claude-flow-novice/scripts/artifact-cleanup.sh >> /path/to/cleanup-cron.log 2>&1
```

### Monitoring Cleanup

```bash
# View cleanup logs
tail -f ./artifacts/logs/cleanup.log

# Check statistics before cleanup
./scripts/artifact-cleanup.sh --dry-run

# View database statistics
sqlite3 ./artifacts/database/registry.db <<EOF
SELECT
    retention_policy,
    COUNT(*) as total,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
    SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived,
    SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) as deleted
FROM artifacts
GROUP BY retention_policy;
EOF
```

---

## Migration Guide

### Migrating Scattered Artifacts

Use the migration script to consolidate scattered artifacts:

```bash
# Dry run to preview migration
./scripts/migrate-artifacts.sh \
    --dry-run \
    --source-dirs "/tmp,docs,artifacts" \
    --auto-detect-type \
    --verbose

# Production migration
./scripts/migrate-artifacts.sh \
    --source-dirs "/tmp,docs,artifacts,legacy" \
    --auto-detect-type \
    --registry-path ./artifacts/registry \
    --db-path ./artifacts/database/registry.db
```

### Migration Options

```bash
--source-dirs <dirs>       # Comma-separated directories to scan
--registry-path <path>     # Centralized registry location
--db-path <path>          # Database path
--exclude-patterns <pat>   # Exclude file patterns (comma-separated)
--auto-detect-type        # Auto-detect artifact type from extension
--dry-run                 # Preview without changes
--verbose                 # Detailed logging
```

### Manual Migration Example

```typescript
import { ArtifactRegistry } from '../src/lib/artifact-registry';
import { readdirSync, copyFileSync } from 'fs';
import { join } from 'path';

const registry = new ArtifactRegistry('./artifacts/database/registry.db');

// Find scattered files
const scatteredFiles = readdirSync('/tmp/scattered-artifacts');

for (const file of scatteredFiles) {
    const sourcePath = join('/tmp/scattered-artifacts', file);
    const destPath = join('./artifacts/registry/other', file);

    // Copy file to registry
    copyFileSync(sourcePath, destPath);

    // Register in database
    registry.createArtifact({
        name: file,
        type: 'other',
        storage_location: destPath,
        retention_policy: 'standard'
    });

    console.log(`Migrated: ${file}`);
}
```

---

## Best Practices

### 1. Choose Appropriate Retention Policies

- **Ephemeral**: Debug logs, temp files, cache
- **Standard**: Code, tests, documentation
- **Permanent**: Licenses, compliance docs, contracts
- **Custom**: Quarterly reports, backups

### 2. Use Meaningful Tags

```typescript
// Good: Specific, searchable tags
tags: ['backend', 'authentication', 'jwt', 'v2.0']

// Avoid: Generic or redundant tags
tags: ['file', 'artifact', 'thing']
```

### 3. Include Rich Metadata

```typescript
metadata: {
    author: 'backend-developer-agent',
    purpose: 'JWT authentication implementation',
    dependencies: ['jsonwebtoken', 'bcrypt'],
    build_info: {
        commit: 'abc123',
        timestamp: '2025-11-15T10:30:00Z'
    }
}
```

### 4. Use Lineage Tracking

```typescript
// Track artifact versions and lineage
const v2Artifact = registry.createArtifact({
    name: 'api-v2.ts',
    type: 'code',
    storage_location: './artifacts/registry/codes/api-v2.ts',
    version: 2,
    parent_artifact_id: v1Artifact.id,
    artifact_chain: [v0Id, v1Id] // Full lineage
});
```

### 5. Centralize All Artifacts

**DO:**
```typescript
storage_location: './artifacts/registry/codes/api.ts'
storage_location: './artifacts/registry/reports/test-report.pdf'
```

**DON'T:**
```typescript
storage_location: '/tmp/api.ts'  // Scattered
storage_location: './docs/random.md'  // Not centralized
```

### 6. Regular Cleanup Monitoring

```bash
# Weekly review of cleanup operations
grep "Cleanup Summary" ./artifacts/logs/cleanup.log | tail -10

# Alert on high error counts
ERRORS=$(grep "Errors:" ./artifacts/logs/cleanup.log | tail -1 | awk '{print $NF}')
if [ "$ERRORS" -gt 0 ]; then
    echo "Cleanup errors detected: $ERRORS"
fi
```

### 7. Database Backup

```bash
# Backup before cleanup
cp ./artifacts/database/registry.db ./artifacts/database/registry.db.backup

# Automated backup in cleanup script
./scripts/artifact-cleanup.sh --backup
```

---

## Troubleshooting

### Issue: Database locked error

**Cause:** Concurrent access without WAL mode

**Solution:**
```typescript
// WAL mode is enabled by default in ArtifactRegistry constructor
this.db.pragma('journal_mode = WAL');
```

### Issue: Artifacts not expiring

**Cause:** Permanent retention policy or missing expires_at

**Check:**
```sql
SELECT id, name, retention_policy, retention_days, expires_at
FROM artifacts
WHERE status = 'active' AND retention_policy != 'permanent';
```

**Fix:**
```sql
-- Manually set expires_at if missing
UPDATE artifacts
SET expires_at = datetime(created_at, '+' || retention_days || ' days')
WHERE expires_at IS NULL AND retention_policy != 'permanent';
```

### Issue: Migration script skipping files

**Cause:** Files match exclusion patterns or already in registry

**Debug:**
```bash
./scripts/migrate-artifacts.sh \
    --dry-run \
    --verbose \
    --exclude-patterns ".git,.DS_Store"
```

### Issue: Cleanup script reports errors

**Check logs:**
```bash
tail -50 ./artifacts/logs/cleanup.log
```

**Common causes:**
- Database permission issues
- Missing artifacts table
- Invalid retention policy values

### Issue: Query performance slow

**Solution:** Ensure indexes exist
```sql
-- Check indexes
SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'artifacts';

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts(expires_at);
```

---

## Support

For issues, questions, or feature requests:

1. Check [Troubleshooting](#troubleshooting) section
2. Review [Best Practices](#best-practices)
3. Consult [API Reference](#api-reference)
4. File an issue in the project repository

---

**End of Guide**
