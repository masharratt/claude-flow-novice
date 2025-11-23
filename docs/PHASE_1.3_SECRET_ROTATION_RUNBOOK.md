# Phase 1.3 Secret Rotation Runbook

## Overview

This runbook provides step-by-step procedures for rotating production secrets in the trigger.dev deployment. All rotations maintain zero downtime through atomic file operations and comprehensive rollback support.

**Completion Date:** 2025-11-23
**Phase:** 1.3 - Production Deployment Preparation
**Security Classification:** Sensitive

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Pre-Rotation Checklist](#pre-rotation-checklist)
3. [Single Secret Rotation](#single-secret-rotation)
4. [Full Rotation Procedure](#full-rotation-procedure)
5. [Rollback Procedure](#rollback-procedure)
6. [Post-Rotation Validation](#post-rotation-validation)
7. [Troubleshooting](#troubleshooting)
8. [Audit and Compliance](#audit-and-compliance)

---

## Quick Start

### For Emergency Secret Rotation (1 Secret)

```bash
# Run the rotation script in single-secret mode
./scripts/security/rotate-secrets.sh --single SECRET_NAME --value "new-secret-value"
```

### For Scheduled Maintenance Rotation (All Secrets)

```bash
# Run pre-deployment gate first
./scripts/security/pre-deployment-security-check.sh

# If gate passes, rotate all secrets
./scripts/security/rotate-secrets.sh --full
```

### To Validate Secrets After Rotation

```bash
./scripts/security/validate-secrets.sh --report
```

---

## Pre-Rotation Checklist

Before rotating any secrets, ensure the following:

### 1. Backup Current State

```bash
# Create dated backup of all current secrets
mkdir -p .backups/secrets/pre-rotation-$(date +%Y%m%d)
cp docker/trigger-dev/secrets/* .backups/secrets/pre-rotation-$(date +%Y%m%d)/
```

### 2. Run Security Gate

```bash
# Ensure all security checks pass
./scripts/security/pre-deployment-security-check.sh
```

**Expected Output:**
```
[GATE] ... [PASS] ✓ Phase 1.2a tests passed
[GATE] ... [PASS] ✓ Socket proxy service configured
[GATE] ... [PASS] ✓ Socket proxy denies privileged mode
[GATE] ... [PASS] ✓ Age encryption key found
[GATE] ... [PASS] ✓ All secret patterns in .gitignore
[GATE] ... [PASS] ✓ No obvious hardcoded secrets found
[GATE] ... [PASS] ✓ Environment variable whitelist defined
[GATE] ... [PASS] ✓ All 10 production secrets present
[GATE] ... [PASS] ✓ CIS Docker Benchmark target acknowledged

Security gate PASSED - Ready for deployment
```

### 3. Verify No Active Deployments

```bash
# Check if any worker containers are running
docker ps -f "name=trigger-worker" --format "table {{.ID}}\t{{.Status}}"

# If containers are running, wait for them to complete
# or gracefully shutdown before proceeding
```

### 4. Notify Team

- Send notification to ops team about scheduled rotation
- Expected duration: 5-15 minutes
- Estimated downtime: 0 minutes (zero-downtime rotation)

---

## Single Secret Rotation

### Scenario: Emergency API Key Rotation

**When to use:** One secret compromised, needs immediate rotation

**Time Required:** 2-5 minutes

### Step 1: Identify the Compromised Secret

```bash
# List all 10 production secrets
./scripts/security/validate-secrets.sh --report

# Example: TRIGGER_API_KEY needs rotation
SECRET_NAME="TRIGGER_API_KEY"
```

### Step 2: Generate New Secret Value

```bash
# Generate a strong random secret
# Method 1: Using openssl
NEW_SECRET=$(openssl rand -base64 32)
echo "New secret: $NEW_SECRET"

# Method 2: Using Python
NEW_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
echo "New secret: $NEW_SECRET"
```

### Step 3: Rotate the Secret

```bash
# Perform the rotation
./scripts/security/rotate-secrets.sh --single TRIGGER_API_KEY --value "$NEW_SECRET"
```

**Expected Output:**
```
[ROTATE] ... [STEP] Rotating secret: TRIGGER_API_KEY
[ROTATE] ... [INFO] Backed up TRIGGER_API_KEY to .backups/secrets/TRIGGER_API_KEY.1700747890.backup
[ROTATE] ... [SUCCESS] Rotated TRIGGER_API_KEY
[ROTATE] ... [STEP] Validating rotated secret: TRIGGER_API_KEY
[ROTATE] ... [SUCCESS] Validated TRIGGER_API_KEY
[ROTATE] ... [STEP] Testing secret loading in worker container: TRIGGER_API_KEY
[ROTATE] ... [SUCCESS] Worker container test passed for TRIGGER_API_KEY
```

### Step 4: Verify Rotation

```bash
# Check that the new secret is in place
cat docker/trigger-dev/secrets/TRIGGER_API_KEY

# Verify it matches the new value
echo "New secret: $NEW_SECRET"
```

### Step 5: Check Audit Log

```bash
# View rotation audit log
tail -5 .backups/secrets/audit.log
```

**Expected Output:**
```
2025-11-23 13:45:23 | user | BACKUP | TRIGGER_API_KEY | saved to .backups/secrets/TRIGGER_API_KEY.1700747890.backup
2025-11-23 13:45:24 | user | ROTATE | TRIGGER_API_KEY | new value written
2025-11-23 13:45:25 | user | VALIDATE | TRIGGER_API_KEY | format and permissions verified
2025-11-23 13:45:26 | user | TEST_CONTAINER | TRIGGER_API_KEY | container validation passed
```

---

## Full Rotation Procedure

### Scenario: Quarterly Scheduled Maintenance

**When to use:** Regular rotation schedule (quarterly or per policy)

**Time Required:** 15-30 minutes

**Secrets to Rotate:**
1. TRIGGER_API_KEY
2. TRIGGER_SECRET_KEY
3. DATABASE_URL
4. REDIS_PASSWORD
5. ENCRYPTION_KEY
6. ANTHROPIC_API_KEY
7. GITHUB_OAUTH_SECRET
8. AUTH_SECRET
9. MINIO_SECRET_KEY
10. TRIGGER_ORG_ID

### Step 1: Schedule Maintenance Window

- Choose off-peak hours
- Notify team 24 hours in advance
- Schedule 30 minutes for rotation + validation

### Step 2: Create Backup

```bash
# Create timestamped backup before rotation
BACKUP_DIR=".backups/secrets/full-rotation-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp docker/trigger-dev/secrets/* "$BACKUP_DIR/"
echo "Backup created in: $BACKUP_DIR"
```

### Step 3: Run Pre-Deployment Gate

```bash
./scripts/security/pre-deployment-security-check.sh
```

If gate fails, resolve issues before proceeding to rotation.

### Step 4: Start Full Rotation

```bash
# Interactive mode guides through all 10 secrets
./scripts/security/rotate-secrets.sh --full
```

**Process:**
- Script prompts for each secret value
- Validates before rotating
- Tests in container after rotation
- Logs all changes
- Shows progress bar

**Example Interaction:**
```
[ROTATE] [STEP] Starting full secret rotation procedure
[ROTATE] [INFO] Rotating 10 production secrets
[ROTATE] [STEP] Processing secret [1/10]: TRIGGER_API_KEY
Enter new value for TRIGGER_API_KEY: [user enters new value]
[ROTATE] [SUCCESS] Successfully rotated TRIGGER_API_KEY

[ROTATE] [STEP] Processing secret [2/10]: TRIGGER_SECRET_KEY
Enter new value for TRIGGER_SECRET_KEY: [user enters new value]
[ROTATE] [SUCCESS] Successfully rotated TRIGGER_SECRET_KEY

... continues for all 10 secrets ...

[ROTATE] [SUCCESS] Full rotation complete
[ROTATE] [INFO] Successfully rotated: 10 secrets
```

### Step 5: Validate All Rotated Secrets

```bash
# Run comprehensive validation
./scripts/security/validate-secrets.sh --report
```

**Expected Summary:**
```
Summary:
  Total Checks: 80+ (8 checks per 10 secrets)
  Passed: 80+
  Failed: 0
  Warnings: 0
  Pass Rate: 100%

Status: PASS - All validations passed
```

### Step 6: Document Rotation

```bash
# Record rotation details
echo "Full rotation completed at $(date)" >> .backups/secrets/audit.log
echo "Rotated secrets: TRIGGER_API_KEY, TRIGGER_SECRET_KEY, ..." >> .backups/secrets/audit.log
```

---

## Rollback Procedure

### When to Rollback

- Rotation caused service failure
- New secret format incorrect
- Container test failures after rotation
- Security validation errors

### Automatic Rollback (Built-in)

The rotation script automatically rolls back if:

```bash
# Validation fails
✗ FAIL: Secret format invalid

# Container test fails
✗ FAIL: Container test failed for SECRET_NAME

# Permissions incorrect
✗ FAIL: Invalid permissions on /path/to/secret
```

When automatic rollback triggers:

```
[ROTATE] [ERROR] Rotation failed, rolling back...
[ROTATE] [STEP] Rolling back secret: TRIGGER_API_KEY
[ROTATE] [SUCCESS] Restored TRIGGER_API_KEY from backup
```

### Manual Rollback

If needed, manually restore from backup:

```bash
# 1. Identify the backup to restore
ls -lth .backups/secrets/TRIGGER_API_KEY.*.backup | head -5

# 2. Restore from specific backup
BACKUP_FILE=".backups/secrets/TRIGGER_API_KEY.1700747890.backup"
cp "$BACKUP_FILE" docker/trigger-dev/secrets/TRIGGER_API_KEY

# 3. Verify restoration
cat docker/trigger-dev/secrets/TRIGGER_API_KEY

# 4. Validate restored secret
./scripts/security/validate-secrets.sh --report
```

### Rollback All Secrets

If full rotation failed and needs complete rollback:

```bash
# Find the pre-rotation backup directory
BACKUP_DIR=".backups/secrets/full-rotation-20251123_134500"

# Restore all secrets
cp "$BACKUP_DIR"/* docker/trigger-dev/secrets/

# Verify all restored
ls -lh docker/trigger-dev/secrets/

# Run validation
./scripts/security/validate-secrets.sh --report
```

---

## Post-Rotation Validation

### Validation Steps

#### 1. Run Security Validation

```bash
./scripts/security/validate-secrets.sh --report
```

Check for:
- All 10 secrets exist
- Correct file permissions (0600)
- Valid format (no newlines, null bytes)
- Proper encryption if applicable

#### 2. Run Pre-Deployment Gate

```bash
./scripts/security/pre-deployment-security-check.sh
```

Should show:
```
[GATE] [PASS] ✓ Phase 1.2a tests passed (8/8)
[GATE] [PASS] ✓ Socket proxy configuration valid
[GATE] [PASS] ✓ All 10 production secrets present
[GATE] [PASS] Security gate PASSED - Ready for deployment
```

#### 3. Test Worker Container

```bash
# Verify worker can load new secrets
docker-compose -f docker/trigger-dev/docker-compose.yml up -d trigger-worker

# Check logs for errors
docker logs trigger-worker --tail=20 | grep -i "error\|secret"

# If no errors, rotation successful
docker-compose -f docker/trigger-dev/docker-compose.yml down
```

#### 4. Check Audit Trail

```bash
# View rotation history
cat .backups/secrets/audit.log | tail -20

# Should show entries like:
# 2025-11-23 13:45:23 | user | ROTATE | SECRET_NAME | new value written
# 2025-11-23 13:45:24 | user | VALIDATE | SECRET_NAME | format and permissions verified
```

### Sign-Off

When validation complete, document approval:

```bash
# Add sign-off to audit log
echo "$(date) | ops-team | VALIDATED | ALL_SECRETS | Full rotation validated and approved" >> .backups/secrets/audit.log

# Commit audit log to version control (not secrets!)
git add .backups/secrets/audit.log
git commit -m "docs: audit log for secret rotation on $(date +%Y-%m-%d)"
git push
```

---

## Troubleshooting

### Issue: "Secret contains newlines"

**Cause:** Newline included in secret value

**Solution:**
```bash
# Ensure secret value has no newlines when entering
# Use: echo -n "value" (not echo "value")

# Or use generated value without manual entry
NEW_SECRET=$(openssl rand -base64 32)
./scripts/security/rotate-secrets.sh --single SECRET_NAME --value "$NEW_SECRET"
```

### Issue: "Invalid permissions on secret file"

**Cause:** Secret file has incorrect permissions

**Solution:**
```bash
# Fix permissions on all secrets
chmod -R 600 docker/trigger-dev/secrets/*

# Verify
ls -lh docker/trigger-dev/secrets/

# Should show: -rw------- 1 user user
```

### Issue: "Container test failed"

**Cause:** Worker container cannot load secret

**Solution:**
```bash
# Check Docker socket proxy health
docker ps | grep socket-proxy

# If not running, start it
docker-compose -f docker/trigger-dev/docker-compose.yml up -d socket-proxy

# Check logs
docker logs socket-proxy --tail=20

# Retry validation
./scripts/security/validate-secrets.sh --report
```

### Issue: "Age decryption failed"

**Cause:** Encrypted secrets but age key missing

**Solution:**
```bash
# Generate age key if missing
mkdir -p ~/.age
age-keygen -o ~/.age/key.txt

# Re-run validation
./scripts/security/validate-secrets.sh --report
```

### Issue: "Rollback failed: No backup found"

**Cause:** Backup not created before rotation

**Solution:**
```bash
# Check backup directory
ls -lh .backups/secrets/

# If empty, restore from git (if committed)
git show HEAD:docker/trigger-dev/secrets/SECRET_NAME > docker/trigger-dev/secrets/SECRET_NAME

# If not in git, check system backups
ls -lh /var/backups/ | grep trigger

# Last resort: Generate new secret and update all references
# Contact security team if production secret lost
```

---

## Audit and Compliance

### Audit Log Format

```
TIMESTAMP | USER | ACTION | SECRET_NAME | DETAILS

Examples:
2025-11-23 13:45:23 | john.doe | ROTATE | TRIGGER_API_KEY | new value written
2025-11-23 13:45:24 | john.doe | VALIDATE | TRIGGER_API_KEY | format and permissions verified
2025-11-23 13:45:26 | john.doe | TEST_CONTAINER | TRIGGER_API_KEY | container validation passed
2025-11-23 13:45:30 | john.doe | BACKUP | TRIGGER_API_KEY | saved to .backups/secrets/TRIGGER_API_KEY.1700747890.backup
```

### Compliance Requirements

1. **Who?** Document user performing rotation
2. **When?** Timestamp all operations
3. **What?** Record which secrets were rotated
4. **Why?** Note reason (emergency, scheduled, etc.)
5. **Result?** Log success/failure and validation status

### Retention Policy

- **Audit logs:** Keep indefinitely (encrypted)
- **Backup secrets:** Keep 30 days (7-day rotation schedule)
- **Validation reports:** Keep 90 days
- **Security gate logs:** Keep 1 year

### Sample Audit Entry

```bash
# Full rotation on 2025-11-23 by ops team
2025-11-23 09:00:00 | ops-team | ROTATION_START | FULL | rotation_id=rotation_20251123_090000
2025-11-23 09:02:15 | ops-team | ROTATE | TRIGGER_API_KEY | new value written
2025-11-23 09:02:16 | ops-team | VALIDATE | TRIGGER_API_KEY | format and permissions verified
2025-11-23 09:02:18 | ops-team | TEST_CONTAINER | TRIGGER_API_KEY | container validation passed
... (repeated for all 10 secrets) ...
2025-11-23 09:15:45 | ops-team | ROTATION_COMPLETE | FULL | rotated=10, failed=0
2025-11-23 09:16:00 | ops-team | VALIDATED | ALL_SECRETS | Full rotation validated and approved
```

---

## Summary

### Key Principles

1. **Zero Downtime:** Atomic file operations ensure no service interruption
2. **Rollback Support:** Automatic backups enable quick recovery
3. **Audit Trail:** All operations logged for compliance
4. **Validation:** Comprehensive checks before and after rotation
5. **Automation:** Scripts handle complexity, reduce human error

### Standard Rotation Schedule

- **Emergency rotations:** As needed (compromised secret)
- **Quarterly rotation:** All secrets (policy requirement)
- **Annual review:** Audit logs and rotation history

### Success Criteria

- All 10 secrets rotated without errors
- Pass rate ≥95% on validation tests
- Zero service downtime during rotation
- All audit logs captured
- Security gate passes

---

## References

- [Secret Rotation Script](../../scripts/security/rotate-secrets.sh)
- [Secret Validation Script](../../scripts/security/validate-secrets.sh)
- [Pre-Deployment Security Gate](../../scripts/security/pre-deployment-security-check.sh)
- [Security Test Suite](../../tests/security/test-secret-rotation.sh)
- [Phase 1.2a Documentation](./PHASE_1.2a_SECURITY_HARDENING.md)

---

**Last Updated:** 2025-11-23
**Version:** 1.0
**Approval:** Security Team
