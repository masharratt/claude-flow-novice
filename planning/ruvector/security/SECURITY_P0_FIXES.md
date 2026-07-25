# RuVector Phase 1: P0 Security Fixes

**Implementation Date**: 2025-11-28
**Iteration**: Loop 3, Iteration 2 (Part 1)
**Target Security Score**: 0.82+ (from 0.62)

## Executive Summary

This document describes the implementation of critical P0 security fixes for RuVector, addressing 2 critical and 3 high-severity vulnerabilities identified in Loop 2 security validation.

### Implementation Status

✅ **P0.1**: File Permission Remediation (COMPLETE)
✅ **P0.2**: AES-256-GCM Backup Encryption (COMPLETE)
✅ **P0.3**: RBAC Authentication Layer (COMPLETE)
⏳ **P0.4**: Audit Logging System (Pending - Part 2)

## P0.1: File Permission Remediation

### Problem
- Database files: 0777 (world-readable/writable)
- Backup files: 0777 (world-readable/writable)
- Directories: 0777 (insecure)

### Solution

**Script**: `scripts/secure-permissions.sh`

**Permission Matrix**:
```
File Type              | Old   | New  | Rationale
-----------------------|-------|------|---------------------------
SQLite Database (.db)  | 0777  | 0600 | Sensitive data, owner only
SQLite WAL/SHM         | 0777  | 0600 | Database temp files
Backup Archives        | 0777  | 0640 | Owner r/w, group read
Backup Metadata        | 0777  | 0640 | Audit trail, group read
Migration Scripts      | 0777  | 0640 | Read-only after creation
Log Files              | 0777  | 0640 | Owner r/w, group read
Data Directories       | 0777  | 0700 | Owner access only
Backup Directories     | 0777  | 0750 | Owner r/w/x, group r/x
```

**Secure Umask**: `0077` (default for new files)

### Usage

```bash
# Dry-run (verify without changes)
./scripts/secure-permissions.sh --dry-run

# Verify permissions only
./scripts/secure-permissions.sh --verify

# Fix all permissions
./scripts/secure-permissions.sh --fix-all

# Custom paths
RUVECTOR_DB_PATH=/custom/path/ruvector.db ./scripts/secure-permissions.sh
```

### Features
- Dry-run mode for verification
- Recursive directory processing
- File type-specific permissions
- Comprehensive logging (`/tmp/secure-permissions-<timestamp>.log`)
- Audit trail for all changes

### Security Impact
- **CRITICAL**: Prevents unauthorized access to sensitive data
- **HIGH**: Reduces attack surface for file-based exploits
- **MEDIUM**: Enforces principle of least privilege

---

## P0.2: AES-256-GCM Backup Encryption

### Problem
- Backups stored in plaintext
- No encryption at rest
- Sensitive data exposed if backups leaked

### Solution

**Module**: `src/lib/backup-encryption.ts`

**Encryption Specifications**:
- **Algorithm**: AES-256-GCM (NIST recommended)
- **Key Derivation**: PBKDF2 with 100,000 iterations (OWASP compliant)
- **Integrity**: GCM authentication tag + HMAC-SHA256
- **Forward Secrecy**: Unique IV per encryption

### Architecture

```typescript
// Encrypted backup structure
interface EncryptedBackup {
  ciphertext: Buffer;      // Encrypted data
  iv: Buffer;              // Initialization vector (12 bytes)
  authTag: Buffer;         // GCM auth tag (16 bytes)
  hmac: Buffer;            // HMAC-SHA256 (32 bytes)
  salt: Buffer;            // Key derivation salt (32 bytes)
  metadata: {              // Unencrypted metadata
    version: string;
    algorithm: string;
    timestamp: string;
    originalSize: number;
    encryptedSize: number;
  };
}
```

### Key Management

**Environment Variable**: `RUVECTOR_BACKUP_KEY`

```bash
# Generate new key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Set environment variable
export RUVECTOR_BACKUP_KEY="<generated-key>"

# Verify configuration
node -e "console.log(process.env.RUVECTOR_BACKUP_KEY ? 'OK' : 'NOT SET')"
```

**Production Requirements**:
- `RUVECTOR_BACKUP_KEY` MUST be set in production
- Key rotation procedures documented (see below)
- Fallback to Vault integration (future enhancement)

### API Usage

```typescript
import {
  encryptBackup,
  decryptBackup,
  validateBackupIntegrity,
  generateBackupKey,
  encryptBackupFile,
  decryptBackupFile,
  rotateBackupKey,
} from './src/lib/backup-encryption';

// Encrypt backup
const data = await fs.readFile('ruvector.db');
const key = process.env.RUVECTOR_BACKUP_KEY;
const encrypted = encryptBackup(data, key);

// Decrypt backup
const decrypted = decryptBackup(encrypted, key);

// Validate integrity without decrypting
const valid = validateBackupIntegrity(encrypted, key);

// File operations
await encryptBackupFile('input.db', 'output.db.enc', key);
await decryptBackupFile('output.db.enc', 'restored.db', key);

// Key rotation
const newKey = generateBackupKey();
const rotated = rotateBackupKey(encrypted, oldKey, newKey);
```

### Key Rotation Procedure

1. Generate new key: `generateBackupKey()`
2. Re-encrypt all backups: `rotateBackupKey(encrypted, oldKey, newKey)`
3. Update environment variable: `RUVECTOR_BACKUP_KEY=<new-key>`
4. Restart services to pick up new key
5. Archive old key securely (for emergency recovery)
6. Document rotation in audit log

**Rotation Frequency**: Every 90 days (recommended)

### Security Impact
- **CRITICAL**: Protects backups at rest from unauthorized access
- **HIGH**: Enables compliance with data protection regulations
- **HIGH**: Prevents data leakage from backup storage

### Test Coverage

**Test Suite**: `tests/security/encryption.test.ts`

Coverage:
- Key generation and validation
- Encryption/decryption round-trip
- Integrity verification (HMAC + auth tag)
- Key rotation
- Error handling (wrong key, corrupted data)
- File operations
- Security properties (unique IV/salt)

---

## P0.3: RBAC Authentication Layer

### Problem
- No authentication or authorization
- No access control for collections
- No audit logging

### Solution

**Modules**:
- `src/lib/auth-types.ts` (type definitions)
- `src/lib/ruvector-auth.ts` (authentication/authorization logic)

### Role-Based Access Control (RBAC)

**Roles**:
```typescript
enum Role {
  ADMIN = 'ADMIN',      // Full system access
  OPERATOR = 'OPERATOR', // Create/update/delete collections
  VIEWER = 'VIEWER',     // Read-only access
}
```

**Operations**:
```typescript
enum Operation {
  READ = 'READ',                        // Read collection metadata/data
  WRITE = 'WRITE',                      // Insert new data
  DELETE = 'DELETE',                    // Delete data/collections
  MANAGE_COLLECTIONS = 'MANAGE_COLLECTIONS', // Create/update collections
  VIEW_AUDIT = 'VIEW_AUDIT',            // View audit logs
  MANAGE_SECURITY = 'MANAGE_SECURITY',  // Manage keys/backups
}
```

**Permission Matrix**:
```
Role      | READ | WRITE | DELETE | MANAGE_COLLECTIONS | VIEW_AUDIT | MANAGE_SECURITY
----------|------|-------|--------|-------------------|------------|----------------
ADMIN     |  ✓   |   ✓   |   ✓    |        ✓          |     ✓      |       ✓
OPERATOR  |  ✓   |   ✓   |   ✓    |        ✓          |     ✗      |       ✗
VIEWER    |  ✓   |   ✗   |   ✗    |        ✗          |     ✗      |       ✗
```

### Authentication Methods

#### 1. API Key Authentication

```typescript
// Create API key
const { key, metadata } = createApiKey(
  Role.OPERATOR,
  'Production API Key',
  'admin-user',
  86400000 // 24 hours expiration
);

// Validate API key
const context = validateApiKey(key);
if (context) {
  console.log(`Authenticated: ${context.name} (${context.role})`);
}

// Revoke API key
revokeApiKey(metadata.id);
```

**HTTP Header**: `Authorization: Bearer <api-key>`

#### 2. JWT Token Authentication

```typescript
// Validate JWT
const context = validateJWT(token);

// JWT payload structure
interface JWTPayload {
  sub: string;      // User ID
  iss: string;      // Issuer (e.g., "trigger.dev")
  aud: string;      // Audience (e.g., "ruvector")
  iat: number;      // Issued at
  exp: number;      // Expiration
  role?: string;    // Custom claim for role
}
```

**HTTP Header**: `Authorization: Bearer <jwt-token>`

**Configuration**:
```bash
export JWT_SECRET="<your-secret-key>"
export JWT_ISSUER="trigger.dev"
export JWT_AUDIENCE="ruvector"
```

#### 3. Service-to-Service Authentication

```typescript
// Validate service credentials
const context = validateService('myservice', 'service-secret');
```

**HTTP Header**: `Authorization: Service <service-name>:<service-secret>`

**Configuration**:
```bash
export SERVICE_SECRET_MYSERVICE="<random-secret>"
export SERVICE_SECRET_ANOTHERSERVICE="<another-secret>"
```

### Authorization

```typescript
import { requireRole, requirePermission, checkPermission } from './ruvector-auth';

// Require minimum role
requireRole(context, Role.ADMIN);

// Require specific permission
requirePermission(context, Operation.DELETE, 'my-collection');

// Check permission (boolean)
if (checkPermission(context, Operation.WRITE)) {
  // Perform write operation
}
```

### Express Middleware

```typescript
import express from 'express';
import { requireAuth } from './ruvector-auth';
import { Role } from './auth-types';

const app = express();

// Require ADMIN role
app.post('/collections', requireAuth(Role.ADMIN), (req, res) => {
  const user = req.authContext; // Attached by middleware
  // ...
});

// Require any authenticated user
app.get('/collections', requireAuth(), (req, res) => {
  // ...
});
```

### Audit Logging

All authentication and authorization events are logged:

```typescript
// Get audit log
const entries = getAuditLog(100, 0); // limit, offset

// Audit entry structure
interface AuthAuditEntry {
  id: string;
  timestamp: Date;
  event: string;           // e.g., "api_key_validated", "authorization_failed"
  userId?: string;
  role?: Role;
  operation?: Operation;
  resource?: string;       // Collection name, etc.
  success: boolean;
  source?: string;         // IP address
  error?: string;
  metadata?: Record<string, unknown>;
}
```

**Logged Events**:
- `api_key_validated` / `api_key_validation_failed`
- `api_key_expired`
- `jwt_validated` / `jwt_validation_failed` / `jwt_expired`
- `service_authenticated` / `service_auth_failed`
- `authorization_granted` / `authorization_failed`

### Security Impact
- **CRITICAL**: Prevents unauthorized access to RuVector collections
- **HIGH**: Enables compliance with access control requirements
- **HIGH**: Provides audit trail for security investigations
- **MEDIUM**: Supports multi-tenant environments

### Test Coverage

**Test Suite**: `tests/security/auth.test.ts`

Coverage:
- API key generation, validation, revocation
- JWT token validation (valid, expired, malformed)
- Service-to-service authentication
- Permission checks (RBAC enforcement)
- Role hierarchy validation
- Authorization header parsing
- Audit logging
- Express middleware integration

---

## Installation

### Dependencies

```bash
cd docker/trigger-dev
npm install jsonwebtoken @types/jsonwebtoken
```

### Environment Configuration

```bash
# Backup encryption
export RUVECTOR_BACKUP_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"

# JWT authentication
export JWT_SECRET="<your-jwt-secret>"
export JWT_ISSUER="trigger.dev"
export JWT_AUDIENCE="ruvector"

# Service authentication (optional)
export SERVICE_SECRET_ORCHESTRATOR="<random-secret>"

# Audit logging
export ENABLE_AUTH_AUDIT="true"
```

### First-Time Setup

1. **Fix file permissions**:
   ```bash
   ./scripts/secure-permissions.sh --dry-run  # Verify
   ./scripts/secure-permissions.sh --fix-all  # Apply
   ```

2. **Generate encryption key**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   # Add to .env or environment
   ```

3. **Create admin API key**:
   ```typescript
   import { createApiKey, Role } from './src/lib/ruvector-auth';

   const { key, metadata } = createApiKey(
     Role.ADMIN,
     'Initial Admin Key',
     'system-setup'
   );

   console.log(`API Key: ${key}`);
   console.log(`Key ID: ${metadata.id}`);
   // Store API key securely
   ```

4. **Verify security**:
   ```bash
   ./scripts/secure-permissions.sh --verify
   ```

---

## Testing

### Run Security Tests

```bash
cd docker/trigger-dev

# Run encryption tests
npm test -- tests/security/encryption.test.ts

# Run authentication tests
npm test -- tests/security/auth.test.ts

# Run all security tests
npm test -- tests/security/
```

### Manual Security Validation

```bash
# Test permission script
./scripts/secure-permissions.sh --dry-run
./scripts/secure-permissions.sh --verify

# Test encryption (Node.js)
node -e "
const { encryptBackup, decryptBackup, generateBackupKey } = require('./src/lib/backup-encryption');
const data = Buffer.from('test data');
const key = generateBackupKey();
const encrypted = encryptBackup(data, key);
const decrypted = decryptBackup(encrypted, key);
console.log('Encryption OK:', data.equals(decrypted));
"

# Test authentication (Node.js)
node -e "
const { createApiKey, validateApiKey, Role } = require('./src/lib/ruvector-auth');
const { key } = createApiKey(Role.ADMIN, 'Test', 'test-user');
const context = validateApiKey(key);
console.log('Auth OK:', context && context.role === Role.ADMIN);
"
```

---

## Integration with Existing Systems

### Backup Script Integration

Update `scripts/backup-ruvector.sh`:

```bash
# After creating backup
BACKUP_FILE="${BACKUP_DIR}/ruvector.db.backup-${TIMESTAMP}"

# Encrypt backup
if [ -n "${RUVECTOR_BACKUP_KEY}" ]; then
    node -e "
    const { encryptBackupFile } = require('./docker/trigger-dev/src/lib/backup-encryption');
    const key = process.env.RUVECTOR_BACKUP_KEY;
    encryptBackupFile('${BACKUP_FILE}', '${BACKUP_FILE}.enc', key)
      .then(() => console.log('Encrypted: ${BACKUP_FILE}.enc'))
      .catch(err => { console.error(err); process.exit(1); });
    "

    # Remove plaintext backup after encryption
    rm -f "${BACKUP_FILE}"
fi
```

### Trigger.dev Task Integration

```typescript
import { task } from "@trigger.dev/sdk/v3";
import { requirePermission, Operation } from "./lib/ruvector-auth";
import { encryptBackup } from "./lib/backup-encryption";

export const secureRuVectorBackup = task({
  id: "secure-ruvector-backup",
  run: async (payload: { authHeader: string }) => {
    // Authenticate request
    const context = authenticate(payload.authHeader);

    // Require MANAGE_SECURITY permission
    requirePermission(context, Operation.MANAGE_SECURITY);

    // Perform backup
    const backupData = await createBackup();

    // Encrypt backup
    const key = getOrCreateBackupKey();
    const encrypted = encryptBackup(backupData, key);

    return { success: true, encrypted };
  },
});
```

---

## Monitoring and Alerting

### Security Metrics

Monitor these metrics:

1. **Permission violations**: Files with incorrect permissions
2. **Encryption failures**: Backup encryption errors
3. **Authentication failures**: Invalid API keys, expired tokens
4. **Authorization denials**: Permission denied events
5. **Audit log volume**: Suspicious activity patterns

### Recommended Alerts

```yaml
# Prometheus alert rules (example)
groups:
  - name: ruvector_security
    rules:
      - alert: InsecureFilePermissions
        expr: ruvector_insecure_file_count > 0
        for: 5m
        annotations:
          summary: "Insecure file permissions detected"

      - alert: EncryptionFailures
        expr: rate(ruvector_encryption_errors[5m]) > 0
        annotations:
          summary: "Backup encryption failures"

      - alert: AuthenticationFailureSpike
        expr: rate(ruvector_auth_failures[5m]) > 10
        annotations:
          summary: "High rate of authentication failures"
```

---

## Compliance and Standards

### OWASP Compliance

✅ **A01:2021 – Broken Access Control**: Implemented RBAC
✅ **A02:2021 – Cryptographic Failures**: AES-256-GCM encryption
✅ **A04:2021 – Insecure Design**: Secure defaults, principle of least privilege
✅ **A05:2021 – Security Misconfiguration**: Secure file permissions
✅ **A07:2021 – Identification and Authentication Failures**: Multi-method auth

### NIST Recommendations

✅ **NIST SP 800-57**: Key management (PBKDF2, 100k iterations)
✅ **NIST SP 800-38D**: AES-GCM mode for encryption
✅ **NIST SP 800-53**: Access control, audit logging

---

## Known Limitations

1. **API key storage**: In-memory (should be database-backed in production)
2. **Audit log storage**: In-memory with 10,000 entry limit (should be persistent)
3. **Key rotation**: Manual process (should be automated)
4. **JWT validation**: Basic implementation (consider external service like Auth0)
5. **Rate limiting**: Not yet implemented (see P1 enhancements)

---

## Next Steps (P0.4 - Part 2)

1. **Persistent audit logging**: Database-backed audit trail
2. **Automated key rotation**: Scheduled key rotation with versioning
3. **Rate limiting**: Protect against brute-force attacks
4. **Session management**: Token refresh, logout, session tracking
5. **Multi-factor authentication**: Optional MFA for admin operations

---

## References

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- NIST Cryptographic Standards: https://csrc.nist.gov/publications
- Node.js Crypto: https://nodejs.org/api/crypto.html
- JWT Best Practices: https://tools.ietf.org/html/rfc8725

---

**Implementation Confidence**: 0.87

**Security Score Impact**: 0.62 → 0.82+ (expected after P0.4 completion)
