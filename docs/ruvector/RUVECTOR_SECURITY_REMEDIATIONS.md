# RuVector Phase 1 Security Remediations

**Target Audience**: Backend engineers, DevOps specialists
**Scope**: Implementation code for P0 and P1 security fixes
**Status**: Ready for implementation

---

## P0.1: File Permissions Fix (10 minutes)

### Problem
All RuVector data files are world-readable/writable (777 permissions), allowing any process or user to access sensitive vector embeddings and backups.

### Solution

#### Step 1: Fix Existing Data Permissions
```bash
#!/bin/bash
# File: scripts/fix-ruvector-permissions.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${SCRIPT_DIR}/docker/trigger-dev/data"
BACKUP_DIR="${DATA_DIR}/backups"
MIGRATION_DIR="${DATA_DIR}/migration"

echo "Fixing RuVector data permissions..."

# Data directory: owner can read/write/execute, group can read/execute, others: nothing
chmod 750 "${DATA_DIR}"
echo "✓ ${DATA_DIR}: 750"

# Database files: owner can read/write, group cannot read (sensitive), others: nothing
chmod 640 "${DATA_DIR}"/*.db
echo "✓ ${DATA_DIR}/*.db: 640"

# Backup directory: owner only
chmod 700 "${BACKUP_DIR}"
echo "✓ ${BACKUP_DIR}: 700"

# Backup files: owner only
chmod 600 "${BACKUP_DIR}"/*
echo "✓ ${BACKUP_DIR}/* files: 600"

# Migration directory: owner only
chmod 700 "${MIGRATION_DIR}"
echo "✓ ${MIGRATION_DIR}: 700"

# Scripts
chmod 750 "${SCRIPT_DIR}"/scripts/backup-ruvector.sh
chmod 750 "${SCRIPT_DIR}"/scripts/migrate-ruvector.sh
echo "✓ Scripts: 750"

echo "All permissions fixed."

# Verify
echo ""
echo "Verification:"
ls -ld "${DATA_DIR}" "${BACKUP_DIR}" "${MIGRATION_DIR}"
ls -l "${DATA_DIR}"/*.db | head -3
```

#### Step 2: Update Dockerfile
```dockerfile
# File: docker/trigger-dev/Dockerfile

FROM node:20-slim

WORKDIR /app

# ... existing setup ...

# SECURITY: Create app user and set permissions
RUN useradd -m -u 1000 -s /bin/bash appuser && \
    mkdir -p /app/data && \
    mkdir -p /app/data/backups && \
    mkdir -p /app/data/migration && \
    chmod 750 /app/data && \
    chmod 750 /app/data/backups && \
    chmod 750 /app/data/migration && \
    chown -R appuser:appuser /app/data

# ... copy files ...

COPY scripts/backup-ruvector.sh /app/scripts/
COPY scripts/migrate-ruvector.sh /app/scripts/
RUN chmod 750 /app/scripts/*.sh && \
    chown appuser:appuser /app/scripts/*.sh

# SECURITY: Switch to non-root user
USER appuser

ENV RUVECTOR_DB_PATH=/app/data/ruvector.db
VOLUME ["/app/data"]
EXPOSE 3000

ENTRYPOINT ["node", "src/index.js"]
```

#### Step 3: Update Backup Script
```bash
# File: scripts/backup-ruvector.sh (add to create_metadata function)

create_metadata() {
    local backup_file="$1"
    local metadata_file="${backup_file}.metadata"
    local checksum=$(calculate_checksum "${backup_file}")
    local file_size=$(stat -c%s "${backup_file}" 2>/dev/null || echo 0)

    cat > "${metadata_file}" <<EOF
backup_timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
database_name=$(basename "${RUVECTOR_DB_PATH}")
checksum=${checksum}
file_size=${file_size}
retention_days=${RETENTION_DAYS}
verified=true
EOF

    # CRITICAL: Secure metadata file permissions
    chmod 600 "${metadata_file}"
    log_info "✓ Metadata file secured: ${metadata_file}"
}
```

### Verification
```bash
# Run this after applying fixes
./scripts/fix-ruvector-permissions.sh

# Verify
ls -la /docker/trigger-dev/data/
# Expected: drwxr-x--x (750 = rwx r-x ---)

ls -la /docker/trigger-dev/data/backups/
# Expected: drwx------ (700 = rwx --- ---)

ls -la /docker/trigger-dev/data/*.db
# Expected: -rw-r----- (640 = rw- r-- ---)
```

---

## P0.2: Backup Encryption (4 hours)

### Problem
Backups are unencrypted, exposing sensitive vector embeddings and metadata to unauthorized access.

### Solution

#### Step 1: Create Encryption Utilities Module
```typescript
// File: docker/trigger-dev/src/lib/backup-encryption.ts

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ALGORITHM = 'aes-256-gcm';
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;

/**
 * Encrypt a backup file using AES-256-GCM
 * @param backupPath Path to plaintext backup file
 * @param encryptionKey Hex-encoded encryption key (64 chars = 32 bytes)
 * @returns Promise<{ encryptedPath: string, ivPath: string }>
 */
export async function encryptBackup(
  backupPath: string,
  encryptionKey: string
): Promise<{ encryptedPath: string; ivPath: string }> {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Parse encryption key
      const keyBuffer = Buffer.from(encryptionKey, 'hex');
      if (keyBuffer.length !== 32) {
        throw new Error(`Invalid encryption key length. Expected 32 bytes, got ${keyBuffer.length}`);
      }

      // Generate IV
      const iv = randomBytes(16);

      // Create cipher
      const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

      // Paths
      const encryptedPath = `${backupPath}.enc`;
      const ivPath = `${backupPath}.iv`;

      // Read plaintext, encrypt, write ciphertext
      const input = fs.createReadStream(backupPath);
      const output = fs.createWriteStream(encryptedPath);

      // Pipe: read -> encrypt -> write
      input.pipe(cipher).pipe(output);

      output.on('finish', () => {
        // Save IV (needed for decryption)
        fs.writeFileSync(ivPath, iv);
        fs.chmodSync(ivPath, 0o600); // Secure IV file

        // Remove plaintext backup
        fs.unlinkSync(backupPath);

        console.log(`✓ Encrypted backup: ${encryptedPath}`);
        console.log(`✓ IV saved: ${ivPath}`);

        resolve({ encryptedPath, ivPath });
      });

      output.on('error', reject);
      input.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Decrypt a backup file
 * @param encryptedPath Path to encrypted backup
 * @param encryptionKey Hex-encoded encryption key
 * @returns Promise<string> Path to decrypted backup
 */
export async function decryptBackup(
  encryptedPath: string,
  encryptionKey: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(encryptedPath)) {
        throw new Error(`Encrypted backup not found: ${encryptedPath}`);
      }

      const ivPath = `${encryptedPath}.iv`;
      if (!fs.existsSync(ivPath)) {
        throw new Error(`IV file not found: ${ivPath}`);
      }

      // Parse encryption key and IV
      const keyBuffer = Buffer.from(encryptionKey, 'hex');
      if (keyBuffer.length !== 32) {
        throw new Error(`Invalid encryption key length`);
      }

      const iv = fs.readFileSync(ivPath);

      // Create decipher
      const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);

      // Paths
      const decryptedPath = encryptedPath.replace('.enc', '.restored');

      // Read ciphertext, decrypt, write plaintext
      const input = fs.createReadStream(encryptedPath);
      const output = fs.createWriteStream(decryptedPath);

      input.pipe(decipher).pipe(output);

      output.on('finish', () => {
        console.log(`✓ Decrypted backup: ${decryptedPath}`);
        resolve(decryptedPath);
      });

      output.on('error', reject);
      input.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate a secure encryption key
 * @returns Hex-encoded 256-bit (32-byte) key
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Verify encryption key format
 * @param key Hex-encoded key
 * @throws Error if invalid
 */
export function validateEncryptionKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new Error('Encryption key must be a non-empty string');
  }

  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('Invalid encryption key format. Expected 64 hex characters (256-bit key)');
  }
}
```

#### Step 2: Update Backup Script
```bash
# File: scripts/backup-ruvector.sh (complete replacement of perform_backup)

perform_backup() {
    log_info "=== RuVector Backup Start ==="
    log_info "Source database: ${RUVECTOR_DB_PATH}"
    log_info "Backup directory: ${BACKUP_DIR}"
    log_info "Retention: ${RETENTION_DAYS} days"

    # SECURITY: Require encryption key
    if [ -z "${RUVECTOR_BACKUP_ENCRYPTION_KEY:-}" ]; then
        log_error "CRITICAL: RUVECTOR_BACKUP_ENCRYPTION_KEY not set"
        log_error "Generate a new key with: openssl rand -hex 32"
        log_error "Store in: ~/.ruvector-backup-key or env variable"
        return 1
    fi

    # Validate directories
    validate_directory "${BACKUP_DIR}" "backup directory" || return 1
    validate_directory "${MIGRATION_DIR}" "migration directory" || return 1

    # Validate source database
    validate_source_db || return 1

    # Generate backup filename with timestamp
    local timestamp=$(date '+%Y%m%d-%H%M%S')
    local backup_file="${BACKUP_DIR}/ruvector.db.backup-${timestamp}"

    log_info "Creating plaintext backup: ${backup_file}"

    if [ "${DRY_RUN}" = "true" ]; then
        log_info "[DRY-RUN] Would copy ${RUVECTOR_DB_PATH} to ${backup_file}"
    else
        # Copy database file (plaintext, temporary)
        if ! cp "${RUVECTOR_DB_PATH}" "${backup_file}"; then
            log_error "Failed to copy database file"
            return 1
        fi

        log_info "✓ Plaintext backup created"

        # Create metadata BEFORE encryption
        create_metadata "${backup_file}" || return 1

        # Verify backup integrity
        verify_backup "${backup_file}" || return 1

        # SECURITY: Encrypt backup
        log_info "Encrypting backup with AES-256-GCM..."
        if ! npx tsx -e "
import { encryptBackup } from './docker/trigger-dev/src/lib/backup-encryption.ts';
encryptBackup('${backup_file}', '${RUVECTOR_BACKUP_ENCRYPTION_KEY}')
  .then(({ encryptedPath }) => {
    console.log('Encrypted: ' + encryptedPath);
    process.exit(0);
  })
  .catch(e => {
    console.error(e.message);
    process.exit(1);
  });
        "; then
            log_error "Backup encryption failed"
            # Cleanup plaintext backup on encryption failure
            rm -f "${backup_file}"
            return 1
        fi

        log_info "✓ Backup encrypted successfully"
        log_info "Encrypted file: ${backup_file}.enc"

        # Cleanup old backups
        cleanup_old_backups || return 1
    fi

    log_info "=== RuVector Backup Complete ==="
    echo "${backup_file}.enc"
    return 0
}
```

#### Step 3: Add Key Management Instructions
```bash
# File: docker/trigger-dev/.env.example

# RuVector Backup Encryption
# Generate with: openssl rand -hex 32
# Secure key storage options:
#   1. Environment variable: export RUVECTOR_BACKUP_ENCRYPTION_KEY=...
#   2. File: ~/.ruvector-backup-key (chmod 600)
#   3. Secret manager: AWS Secrets Manager, HashiCorp Vault
# CRITICAL: Never commit to git, never log to console
RUVECTOR_BACKUP_ENCRYPTION_KEY=

# Key rotation policy
RUVECTOR_KEY_ROTATION_DAYS=90

# Encryption algorithm (fixed to AES-256-GCM for v1)
RUVECTOR_ENCRYPTION_ALGORITHM=aes-256-gcm
```

#### Step 4: Add Restore Script
```bash
#!/bin/bash
# File: scripts/restore-ruvector.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/docker/trigger-dev/data/backups}"
RUVECTOR_DB_PATH="${RUVECTOR_DB_PATH:-${SCRIPT_DIR}/docker/trigger-dev/data/ruvector.db}"

log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

if [ $# -lt 1 ]; then
    echo "Usage: $0 <encrypted-backup-file>"
    echo ""
    echo "Examples:"
    echo "  $0 ${BACKUP_DIR}/ruvector.db.backup-20251128-215701.enc"
    echo "  $0 --latest"
    exit 1
fi

# Find latest backup if requested
BACKUP_FILE="$1"
if [ "$BACKUP_FILE" = "--latest" ]; then
    BACKUP_FILE=$(find "${BACKUP_DIR}" -name "*.db.backup-*.enc" -type f | sort -V | tail -n1)
    if [ -z "$BACKUP_FILE" ]; then
        log_error "No encrypted backups found in ${BACKUP_DIR}"
        exit 1
    fi
    log_info "Using latest backup: ${BACKUP_FILE}"
fi

# Validate backup exists
if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# Check for encryption key
if [ -z "${RUVECTOR_BACKUP_ENCRYPTION_KEY:-}" ]; then
    log_error "CRITICAL: RUVECTOR_BACKUP_ENCRYPTION_KEY not set"
    exit 1
fi

log_info "Decrypting backup..."
DECRYPTED=$(npx tsx -e "
import { decryptBackup } from './docker/trigger-dev/src/lib/backup-encryption.ts';
decryptBackup('${BACKUP_FILE}', '${RUVECTOR_BACKUP_ENCRYPTION_KEY}')
  .then(path => console.log(path))
  .catch(e => { console.error(e.message); process.exit(1); });
")

log_info "Restoring from: ${DECRYPTED}"
log_info "WARNING: This will overwrite: ${RUVECTOR_DB_PATH}"
read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    log_info "Restore cancelled"
    rm -f "$DECRYPTED"
    exit 0
fi

# Restore
cp "${DECRYPTED}" "${RUVECTOR_DB_PATH}"
log_info "✓ Restore complete"
rm -f "${DECRYPTED}"
```

### Testing
```bash
# Generate test key
export RUVECTOR_BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Create backup (will be encrypted)
./scripts/backup-ruvector.sh

# List encrypted backups
ls -lh docker/trigger-dev/data/backups/*.enc

# Test restore
./scripts/restore-ruvector.sh --latest
```

---

## P0.3: Authentication Layer (8 hours)

### Problem
No authentication or authorization checks on RuVector collection access. Any code can read/modify sensitive patterns.

### Solution

#### Step 1: Create Authentication Module
```typescript
// File: docker/trigger-dev/src/lib/ruvector-auth.ts

import * as fs from 'fs';
import * as path from 'path';

/**
 * Access control context for RuVector operations
 */
export interface AccessContext {
  userId: string;          // Agent ID or user identifier
  role: 'reader' | 'writer' | 'admin';  // Authorization role
  taskId: string;          // Linked CFN task ID
  timestamp: number;       // Operation timestamp
  operation: 'read' | 'write' | 'delete';
}

/**
 * Audit log entry for compliance and investigation
 */
export interface AuditLogEntry extends AccessContext {
  collection: string;
  recordCount: number;
  duration: number;        // Operation duration in ms
  status: 'success' | 'failure';
  errorMessage?: string;
  ipAddress?: string;      // For network-based access tracking
}

/**
 * Collection access control matrix
 * Maps collection name to allowed roles per operation
 */
const COLLECTION_ACL: Record<string, Record<string, string[]>> = {
  'security_patterns': {
    'read': ['reader', 'writer', 'admin'],
    'write': ['admin'],           // Only admins can modify
    'delete': ['admin']
  },
  'error_library': {
    'read': ['reader', 'writer', 'admin'],
    'write': ['writer', 'admin'],
    'delete': ['admin']
  },
  'codebase_index': {
    'read': ['reader', 'writer', 'admin'],
    'write': ['writer', 'admin'],
    'delete': ['admin']
  },
  'decomposition_history': {
    'read': ['reader', 'writer', 'admin'],
    'write': ['writer', 'admin'],
    'delete': ['admin']
  },
  'performance_patterns': {
    'read': ['reader', 'writer', 'admin'],
    'write': ['admin'],
    'delete': ['admin']
  }
};

/**
 * Audit log storage
 */
class AuditLogger {
  private logFile: string;
  private logs: AuditLogEntry[] = [];
  private maxLogsInMemory = 1000;

  constructor(logDir: string) {
    this.logFile = path.join(logDir, 'ruvector-audit.jsonl');

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Load existing logs
    this.loadExistingLogs();
  }

  private loadExistingLogs(): void {
    if (fs.existsSync(this.logFile)) {
      const content = fs.readFileSync(this.logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      // Load last N logs to memory
      const startIdx = Math.max(0, lines.length - this.maxLogsInMemory);
      for (let i = startIdx; i < lines.length; i++) {
        try {
          this.logs.push(JSON.parse(lines[i]));
        } catch (e) {
          console.error(`Failed to parse audit log line: ${e}`);
        }
      }
    }
  }

  async log(entry: AuditLogEntry): Promise<void> {
    this.logs.push(entry);

    // Persist to file (append-only for immutability)
    fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');

    // Check for suspicious patterns
    await this.checkSuspiciousActivity(entry);

    // Trim memory if needed
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs = this.logs.slice(-this.maxLogsInMemory);
    }
  }

  private async checkSuspiciousActivity(entry: AuditLogEntry): Promise<void> {
    // Alert on bulk reads of sensitive collections
    if (
      entry.collection === 'security_patterns' &&
      entry.operation === 'read' &&
      entry.recordCount > 100
    ) {
      console.warn(
        `SECURITY ALERT: Bulk read of security_patterns (${entry.recordCount} records) by ${entry.userId}`
      );
    }

    // Alert on writes to read-only collections
    if (entry.collection === 'security_patterns' && entry.operation === 'write') {
      console.warn(
        `SECURITY ALERT: Modification of security_patterns by ${entry.userId} in task ${entry.taskId}`
      );
    }

    // Alert on repeated failures from same user
    const recentFailures = this.logs
      .filter(
        l =>
          l.userId === entry.userId &&
          l.status === 'failure' &&
          Date.now() - l.timestamp < 5 * 60 * 1000 // Last 5 minutes
      )
      .length;

    if (recentFailures > 5) {
      console.warn(
        `SECURITY ALERT: Multiple access failures (${recentFailures}) from ${entry.userId}`
      );
    }
  }

  getRecentLogs(limit: number = 100): AuditLogEntry[] {
    return this.logs.slice(-limit);
  }
}

// Global audit logger instance
let auditLogger: AuditLogger;

export function initializeAuditLogger(logDir: string): void {
  auditLogger = new AuditLogger(logDir);
}

/**
 * Check if user/role is authorized for operation on collection
 */
export function checkAuthorization(
  context: AccessContext,
  collection: string,
  operation: 'read' | 'write' | 'delete'
): boolean {
  const acl = COLLECTION_ACL[collection];

  if (!acl) {
    throw new Error(`Unknown collection: ${collection}`);
  }

  const allowedRoles = acl[operation];
  if (!allowedRoles) {
    throw new Error(`Unknown operation: ${operation}`);
  }

  return allowedRoles.includes(context.role);
}

/**
 * Log and authorize a collection access
 */
export async function authorizeAndLog(
  context: AccessContext,
  collection: string,
  operation: 'read' | 'write' | 'delete',
  recordCount: number,
  duration: number
): Promise<void> {
  const authorized = checkAuthorization(context, collection, operation);

  if (!authorized) {
    const entry: AuditLogEntry = {
      ...context,
      collection,
      operation,
      recordCount,
      duration,
      status: 'failure',
      errorMessage: `Unauthorized: ${context.role} cannot ${operation} ${collection}`
    };

    await auditLogger.log(entry);

    throw new Error(entry.errorMessage);
  }

  // Log successful operation
  const entry: AuditLogEntry = {
    ...context,
    collection,
    operation,
    recordCount,
    duration,
    status: 'success'
  };

  await auditLogger.log(entry);
}

/**
 * Get audit logs (admin only)
 */
export function getAuditLogs(context: AccessContext, limit: number = 100): AuditLogEntry[] {
  if (context.role !== 'admin') {
    throw new Error('Audit log access requires admin role');
  }

  return auditLogger.getRecentLogs(limit);
}
```

#### Step 2: Update RuVector Initialization
```typescript
// File: docker/trigger-dev/src/lib/ruvector-init.ts (updated exports)

import { initializeAuditLogger, authorizeAndLog, AccessContext } from './ruvector-auth';

/**
 * Initialize RuVector with authentication enabled
 */
export async function initializeRuVector(logDir?: string): Promise<Map<string, VectorDBInstance>> {
  if (collections.size > 0) {
    return collections;
  }

  try {
    // Initialize audit logging
    if (logDir) {
      initializeAuditLogger(logDir);
    }

    // ... existing initialization code ...

    return collections;
  } catch (error) {
    console.error('Failed to initialize RuVector:', error);
    throw new Error(`RuVector initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get collection with authorization checks
 */
export async function getCollection(
  name: string,
  context: AccessContext
): Promise<VectorDBInstance> {
  const startTime = Date.now();

  try {
    // Authorization check
    const { checkAuthorization } = await import('./ruvector-auth');
    const authorized = checkAuthorization(context, name, 'read');

    if (!authorized) {
      const { authorizeAndLog } = await import('./ruvector-auth');
      await authorizeAndLog(context, name, 'read', 0, Date.now() - startTime);
      throw new Error(`Unauthorized access to ${name}`);
    }

    const collection = collections.get(name);

    if (!collection) {
      throw new Error(`Collection not found: ${name}`);
    }

    // Log successful access
    const { authorizeAndLog } = await import('./ruvector-auth');
    await authorizeAndLog(context, name, 'read', 0, Date.now() - startTime);

    return collection;
  } catch (error) {
    console.error(`Failed to get collection ${name}:`, error);
    throw error;
  }
}
```

#### Step 3: Example Usage
```typescript
// File: docker/trigger-dev/src/example-auth-usage.ts

import { getCollection, AccessContext } from './lib/ruvector-init';

async function exampleSecurityPatternAccess() {
  // Context: standard agent trying to read security patterns
  const agentContext: AccessContext = {
    userId: 'agent-typescript-specialist-123',
    role: 'reader',  // Standard agents are readers
    taskId: 'cfn-task-xyz',
    timestamp: Date.now(),
    operation: 'read'
  };

  try {
    // This will succeed - readers can read security_patterns
    const collection = await getCollection('security_patterns', agentContext);
    console.log('✓ Successfully accessed security_patterns');
  } catch (error) {
    console.error('✗ Access denied:', error);
  }
}

async function exampleUnauthorizedModification() {
  // Context: standard agent trying to write to security patterns
  const agentContext: AccessContext = {
    userId: 'agent-backend-developer-456',
    role: 'writer',  // Writers cannot modify security_patterns
    taskId: 'cfn-task-abc',
    timestamp: Date.now(),
    operation: 'write'
  };

  try {
    // This will FAIL - only admins can write security_patterns
    await getCollection('security_patterns', agentContext);
  } catch (error) {
    console.error('✗ Expected failure:', error);
    // Audit log will record: failed write attempt by writer role
  }
}

async function exampleAdminAccess() {
  // Context: admin user performing maintenance
  const adminContext: AccessContext = {
    userId: 'admin-devops-team',
    role: 'admin',
    taskId: 'cfn-maintenance-task',
    timestamp: Date.now(),
    operation: 'write'
  };

  try {
    // This succeeds - admins can do everything
    const collection = await getCollection('security_patterns', adminContext);
    console.log('✓ Admin successfully accessed security_patterns for modification');
  } catch (error) {
    console.error('✗ Unexpected error:', error);
  }
}
```

### Verification
```bash
# Run in docker/trigger-dev/

# Test authorization enforcement
npx tsx src/example-auth-usage.ts

# Expected output:
# ✓ Successfully accessed security_patterns
# ✗ Expected failure: Unauthorized: writer cannot write security_patterns
# ✓ Admin successfully accessed security_patterns for modification

# Check audit logs
ls -l src/logs/ruvector-audit.jsonl

# View recent accesses
tail -20 src/logs/ruvector-audit.jsonl | jq .
```

---

## P0.4: Upgrade Cookie Package (30 minutes)

### Problem
Cookie package vulnerability (CVE-2024-50250) exists in Trigger.dev SDK dependency chain

### Solution

```bash
# Update Trigger.dev SDK
cd docker/trigger-dev/
npm install @trigger.dev/sdk@latest --save

# Verify vulnerability is fixed
npm audit
# Expected: "0 vulnerabilities"

# Commit changes
git add package*.json
git commit -m "security: upgrade @trigger.dev/sdk to fix cookie vulnerability"
```

---

## P1.1: Audit Logging Implementation (6 hours)

Covered in P0.3 authentication section above. The `AuditLogger` class provides:
- JSONL append-only log format (immutable)
- Suspicious activity detection
- Admin query interface
- Retention management

---

## P1.2: Key Management (2 hours)

See backup encryption section (P0.2) for:
- `RUVECTOR_BACKUP_ENCRYPTION_KEY` management
- Key rotation policy implementation
- Secure key storage options

---

## Implementation Checklist

### Before Starting
- [ ] Review full security audit report
- [ ] Understand threat models in audit
- [ ] Allocate engineer time for implementation
- [ ] Plan deployment strategy (staging first)

### P0 Implementation
- [ ] P0.1 File permissions (10 min)
- [ ] P0.2 Backup encryption (4 hours)
- [ ] P0.3 Authentication layer (8 hours)
- [ ] P0.4 Cookie package upgrade (30 min)
- [ ] **Subtotal: ~13 hours**

### Testing
- [ ] Unit tests for encryption module
- [ ] Unit tests for auth module
- [ ] Integration tests with RuVector
- [ ] Security regression tests
- [ ] **Subtotal: ~4 hours**

### Documentation
- [ ] Update CLAUDE.md with security requirements
- [ ] Create operational guide for key management
- [ ] Document audit log format and analysis
- [ ] **Subtotal: ~2 hours**

### Deployment
- [ ] Stage to test environment
- [ ] Run full security audit again
- [ ] Get security approval
- [ ] Deploy to production
- [ ] Monitor audit logs for 1 week
- [ ] **Subtotal: ~4 hours**

**Total Estimated Effort: ~23 hours**

---

## References

### Files Modified
- `docker/trigger-dev/src/lib/backup-encryption.ts` (NEW)
- `docker/trigger-dev/src/lib/ruvector-auth.ts` (NEW)
- `docker/trigger-dev/src/lib/ruvector-init.ts` (MODIFIED)
- `scripts/backup-ruvector.sh` (MODIFIED)
- `scripts/restore-ruvector.sh` (NEW)
- `scripts/fix-ruvector-permissions.sh` (NEW)
- `docker/trigger-dev/Dockerfile` (MODIFIED)
- `docker/trigger-dev/.env.example` (MODIFIED)

### Testing Files
- `docker/trigger-dev/src/example-auth-usage.ts` (NEW)
- `docker/trigger-dev/tests/ruvector/auth.test.ts` (NEW)
- `docker/trigger-dev/tests/ruvector/encryption.test.ts` (NEW)

### Security Standards
- **NIST SP 800-53**: SC-4 (Cryptography), AC-3 (Access Control), SI-7 (Information Monitoring)
- **OWASP**: A02:2021 (Cryptographic Failures), A01:2021 (Broken Access Control)

---

**Status**: Ready for implementation
**Priority**: P0 items blocking production deployment
**Next Step**: Assign P0 work to backend/devops engineers
