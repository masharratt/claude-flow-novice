# Configuration Migration Rollback Procedure
## Task 2.4: YAML to JSON Migration Rollback

**Purpose:** Emergency restoration of YAML configuration files if JSON migration causes issues
**Task:** Integration Standardization Plan - Task 2.4
**Last Updated:** 2025-11-16

---

## When to Rollback

**Rollback is recommended if:**
- Configuration loading fails after migration
- Application startup errors related to config parsing
- Unexpected behavior due to config format changes
- CI/CD pipeline failures related to config validation

**Do NOT rollback if:**
- Issues are unrelated to configuration (troubleshoot separately)
- Only cosmetic differences in config output
- Migration completed successfully without errors

---

## Pre-Rollback Checklist

Before initiating rollback, verify:

1. **Identify the Issue**
   - [ ] Document the specific error or failure
   - [ ] Confirm issue is config-related (not code, network, etc.)
   - [ ] Check application logs for config parsing errors
   - [ ] Verify issue started after YAML cleanup

2. **Locate Backup**
   - [ ] Confirm backup directory exists: `.backups/yaml-cleanup-*`
   - [ ] Verify backup contains all 7 YAML files
   - [ ] Check backup timestamp matches cleanup date

3. **Notify Team**
   - [ ] Alert team of rollback intention
   - [ ] Document reason for rollback
   - [ ] Create incident report if critical

---

## Rollback Methods

### Method 1: Quick Restore (Recommended)

**Time Required:** < 2 minutes
**Risk Level:** Low

```bash
#!/bin/bash
# Quick Restore Script

# 1. Locate backup directory
BACKUP_DIR=".backups/yaml-cleanup-1763254966"

# 2. Verify backup exists
if [ ! -d "$BACKUP_DIR" ]; then
  echo "ERROR: Backup directory not found: $BACKUP_DIR"
  echo "Available backups:"
  ls -la .backups/
  exit 1
fi

# 3. Restore YAML files (preserves existing JSON files)
echo "Restoring YAML configs from backup..."
cp -v "$BACKUP_DIR/docker/config/teams/"*.yaml docker/config/teams/

# 4. Verify restoration
echo -e "\n=== Verification ==="
ls -la docker/config/teams/

echo -e "\n✅ Rollback complete"
echo "Team configs directory now contains both YAML and JSON files"
```

**Save as:** `scripts/rollback-yaml-configs.sh`
**Execute:** `bash scripts/rollback-yaml-configs.sh`

### Method 2: Manual Restore

**Time Required:** 5-10 minutes
**Risk Level:** Low

```bash
# Step 1: Navigate to backup directory
cd .backups/yaml-cleanup-1763254966

# Step 2: Copy YAML files back to original location
cp docker/config/teams/backend.yaml ../../docker/config/teams/
cp docker/config/teams/csuite.yaml ../../docker/config/teams/
cp docker/config/teams/devops.yaml ../../docker/config/teams/
cp docker/config/teams/frontend.yaml ../../docker/config/teams/
cp docker/config/teams/marketing.yaml ../../docker/config/teams/
cp docker/config/teams/qa.yaml ../../docker/config/teams/
cp docker/config/teams/seo.yaml ../../docker/config/teams/

# Step 3: Return to project root
cd ../..

# Step 4: Verify restoration
ls -la docker/config/teams/*.yaml

# Expected output: 7 YAML files
```

### Method 3: Selective Restore

**Use Case:** Restore only specific config files that are causing issues

```bash
# Restore only backend team config
BACKUP_DIR=".backups/yaml-cleanup-1763254966"
cp "$BACKUP_DIR/docker/config/teams/backend.yaml" docker/config/teams/

# Verify
ls -la docker/config/teams/backend.*

# Expected output:
# backend.json (exists)
# backend.yaml (restored)
```

---

## Post-Rollback Verification

After restoring YAML files, verify the system is operational:

### 1. File Verification

```bash
# Count YAML files (should be 7)
ls docker/config/teams/*.yaml | wc -l

# Count JSON files (should be 7)
ls docker/config/teams/*.json | wc -l

# List all configs
ls -la docker/config/teams/
```

**Expected Result:**
- 7 YAML files present
- 7 JSON files present (rollback preserves JSON files)
- Total: 14 config files + README.md

### 2. Application Startup Test

```bash
# If Docker-based
docker-compose up --build

# Monitor logs for config loading
docker-compose logs -f | grep -i config

# Verify no errors
docker-compose ps
```

### 3. Configuration Loading Test

```bash
# Test config validator with YAML (if applicable)
npx tsx scripts/validate-team-configs.ts

# Verify JSON configs still work
node -e "console.log(JSON.parse(require('fs').readFileSync('docker/config/teams/backend.json', 'utf-8')))"
```

### 4. Integration Tests

```bash
# Run full test suite
npm test

# Run config-specific tests (if available)
npm run test:config
```

---

## Troubleshooting Rollback Issues

### Issue: Backup Directory Not Found

**Symptom:**
```
ERROR: Backup directory not found: .backups/yaml-cleanup-1763254966
```

**Solution:**
```bash
# List all available backups
ls -la .backups/

# Use the correct backup directory
BACKUP_DIR=$(ls -td .backups/yaml-cleanup-* | head -1)
echo "Using backup: $BACKUP_DIR"
cp -r "$BACKUP_DIR/docker/" ./docker/
```

### Issue: Permission Denied

**Symptom:**
```
cp: cannot create regular file 'docker/config/teams/backend.yaml': Permission denied
```

**Solution:**
```bash
# Check directory permissions
ls -la docker/config/teams/

# Fix permissions if needed
sudo chown -R $(whoami):$(whoami) docker/config/teams/

# Retry restore
cp "$BACKUP_DIR/docker/config/teams/"*.yaml docker/config/teams/
```

### Issue: Files Already Exist

**Symptom:**
```
cp: overwrite 'docker/config/teams/backend.yaml'?
```

**Solution:**
```bash
# Force overwrite (if YAML files were partially restored)
cp -f "$BACKUP_DIR/docker/config/teams/"*.yaml docker/config/teams/

# Or interactive mode to selectively overwrite
cp -i "$BACKUP_DIR/docker/config/teams/"*.yaml docker/config/teams/
```

### Issue: Incomplete Restore

**Symptom:** Some YAML files restored, others missing

**Solution:**
```bash
# Verify backup integrity
find "$BACKUP_DIR" -name "*.yaml" -type f

# Expected output: 7 YAML files
# docker/config/teams/backend.yaml
# docker/config/teams/csuite.yaml
# docker/config/teams/devops.yaml
# docker/config/teams/frontend.yaml
# docker/config/teams/marketing.yaml
# docker/config/teams/qa.yaml
# docker/config/teams/seo.yaml

# Force complete restore
rsync -av "$BACKUP_DIR/docker/config/teams/" docker/config/teams/
```

---

## Rollback Validation Checklist

After rollback, verify:

- [ ] **7 YAML files restored** in `docker/config/teams/`
- [ ] **7 JSON files preserved** (rollback doesn't delete JSON)
- [ ] **Application starts successfully** without config errors
- [ ] **Logs show no config parsing warnings**
- [ ] **Integration tests pass**
- [ ] **Team notified** of rollback completion
- [ ] **Incident report created** documenting rollback reason

---

## Permanent Reversion (Reverting Migration)

If you need to **permanently** revert to YAML configs (not recommended):

### Step 1: Restore YAML Files
```bash
cp -r .backups/yaml-cleanup-1763254966/docker/config/teams/*.yaml docker/config/teams/
```

### Step 2: Remove JSON Files (Optional)
```bash
# Create backup of JSON files first
mkdir -p .backups/json-configs-$(date +%s)
cp docker/config/teams/*.json .backups/json-configs-$(date +%s)/

# Remove JSON files
rm docker/config/teams/*.json
```

### Step 3: Update Code References
```bash
# Search for JSON config references
grep -r "\.json" --include="*.ts" --include="*.js" | grep "config/teams"

# Update code to use .yaml extension instead
# (Manual code changes required)
```

### Step 4: Disable Schema Validation
```bash
# Comment out JSON schema validation in code
# src/lib/config-validator.ts (if referencing team configs)
```

**Warning:** Permanent reversion is NOT recommended. Consider fixing issues with JSON configs instead.

---

## Alternative: Dual Format Support (Temporary)

Instead of full rollback, support both YAML and JSON temporarily:

### Approach 1: Prefer JSON, Fallback to YAML

```typescript
// config-loader.ts
import fs from 'fs';
import yaml from 'yaml';

export function loadTeamConfig(teamName: string) {
  const jsonPath = `./docker/config/teams/${teamName}.json`;
  const yamlPath = `./docker/config/teams/${teamName}.yaml`;

  // Try JSON first
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  }

  // Fallback to YAML
  if (fs.existsSync(yamlPath)) {
    console.warn(`Using YAML fallback for ${teamName} config`);
    return yaml.parse(fs.readFileSync(yamlPath, 'utf-8'));
  }

  throw new Error(`Config not found for team: ${teamName}`);
}
```

### Approach 2: Validate Both Formats

```bash
# Validate JSON configs
npx tsx scripts/validate-team-configs.ts

# Also validate YAML equivalents
npx tsx scripts/validate-yaml-configs.ts

# Ensure consistency
npx tsx scripts/compare-yaml-json-configs.ts
```

---

## Rollback Timeline

**Estimated Rollback Duration:**

| Phase | Time | Risk |
|-------|------|------|
| Pre-rollback verification | 5 min | Low |
| Backup location | 1 min | Low |
| File restoration | 2 min | Low |
| Post-rollback verification | 10 min | Low |
| Integration testing | 15 min | Medium |
| **Total** | **33 min** | **Low** |

**Downtime:** 0-5 minutes (if hot-reload supported), otherwise full restart required

---

## Escalation Procedure

If rollback fails or issues persist:

### Level 1: Self-Service Rollback
- Follow this document
- Use automated rollback script
- Verify with checklist

### Level 2: Team Lead Escalation
- Contact: Team Lead / Senior DevOps Engineer
- Provide: Error logs, rollback attempts, backup location
- Action: Manual intervention, advanced troubleshooting

### Level 3: Emergency Rollback
- Contact: CTO / Platform Architecture Team
- Provide: Incident report, system state, business impact
- Action: Full system restore, infrastructure changes

---

## Prevention of Future Issues

To avoid rollback scenarios:

1. **Gradual Migration**
   - Test JSON configs in development first
   - Deploy to staging before production
   - Monitor for 48 hours before cleanup

2. **Automated Validation**
   - Add JSON schema validation to CI/CD
   - Pre-commit hooks for config validation
   - Automated testing of config loading

3. **Backup Retention**
   - Keep backups for 90 days (not 30)
   - Automated backup verification
   - Offsite backup storage

4. **Monitoring**
   - Alert on config parsing errors
   - Track config load times
   - Monitor application startup failures

---

## Backup Retention Policy

**Current Backup:** `.backups/yaml-cleanup-1763254966/`

**Retention Schedule:**
- **Day 0-30:** Keep backup, monitor for issues
- **Day 30:** Review incidents, extend retention if needed
- **Day 90:** Delete backup if no issues reported

**Backup Verification:**
```bash
# Weekly backup integrity check (cronjob)
0 0 * * 0 /usr/bin/find .backups/yaml-cleanup-* -name "*.yaml" | wc -l | grep -q 7 && echo "Backup OK" || echo "Backup CORRUPT"
```

---

## Contact Information

**For Rollback Assistance:**
- DevOps Team: devops@example.com
- On-Call Engineer: +1-555-DEVOPS
- Incident Channel: #incidents-config

**Escalation Path:**
1. Self-service rollback (this document)
2. Team Lead (15-minute response SLA)
3. Senior DevOps Engineer (30-minute response SLA)
4. CTO (1-hour response SLA)

---

## Rollback Success Criteria

Rollback is considered **successful** when:

- ✅ All 7 YAML files restored from backup
- ✅ Application starts without config errors
- ✅ No config parsing warnings in logs
- ✅ Integration tests pass
- ✅ System behavior matches pre-migration state
- ✅ Team notified and incident closed

---

## Conclusion

This rollback procedure provides multiple methods to restore YAML configuration files if needed. The backup is preserved for 90 days to ensure safe recovery from any migration-related issues.

**Recommendation:** Before initiating rollback, thoroughly investigate the root cause. Most config issues can be resolved by fixing JSON syntax or schema validation rather than reverting to YAML.

---

**Document Version:** 1.0
**Last Updated:** 2025-11-16T01:10:00Z
**Backup Location:** `.backups/yaml-cleanup-1763254966/`
**Retention:** 90 days (expires 2026-02-14)
