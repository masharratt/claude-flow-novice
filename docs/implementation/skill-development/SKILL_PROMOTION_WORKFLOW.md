# Skill Promotion Workflow - Operational Guide

**Task 1.2**: Staging → Production Promotion Workflow
**Status**: Implemented
**Version**: 1.0.0

---

## Overview

The Skill Promotion Workflow automates the process of promoting generated skills from the staging directory to production with comprehensive validation, SLA enforcement, and operational monitoring.

## Architecture

### Directory Structure

```
.claude/skills/
├── staging/                    # Temporary staging area
│   ├── auth-v2/               # Skill pending promotion
│   │   ├── SKILL.md           # Skill metadata
│   │   ├── execute.sh         # Execution script (must be executable)
│   │   └── test.sh            # Optional: tests
│   └── logging-v3/
│       └── ...
└── [production]/              # Production skills
    ├── authentication/
    ├── logging/
    └── ...
```

### Promotion Flow Diagram

```
┌─────────────────┐
│  Skill Created  │
│   in Staging    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Validation    │
│   - Content     │
│   - Schema      │
│   - Tests       │
│   - Conflicts   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Validation     ├─NO─►│  Report Errors  │
│    Passed?      │     │   & Exit        │
└────────┬────────┘     └─────────────────┘
         │ YES
         ▼
┌─────────────────┐
│  Atomic Move    │
│  staging → prod │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Optional:      │
│  - Git Commit   │
│  - Auto-Deploy  │
│  - Notify       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Promotion     │
│   Complete      │
└─────────────────┘
```

---

## Usage

### CLI Script

#### List Staged Skills

```bash
./scripts/promote-staged-skills.sh --list
```

**Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGED SKILLS (3 total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Skill:    auth-v2
  Version:  2.0.0
  Age:      12h
  Path:     .claude/skills/staging/auth-v2

  Skill:    logging-v3
  Version:  3.1.0
  Age:      36h
  Path:     .claude/skills/staging/logging-v3
...
```

#### Check for Stale Skills

```bash
./scripts/promote-staged-skills.sh --check-stale
```

**Output:**
```
⚠ Stale skill: logging-v3 (52h, 4h over SLA)
  Path: .claude/skills/staging/logging-v3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SLA BREACH: 1 skill(s) older than 48 hours
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Promote a Skill (Interactive)

```bash
./scripts/promote-staged-skills.sh .claude/skills/staging/auth-v2
```

**Output:**
```
ℹ Validating skill: auth-v2
✓ Validation passed

Promote skill to production? [y/N] y

ℹ Promoting skill: auth-v2
  From: .claude/skills/staging/auth-v2
  To:   .claude/skills/auth-v2

ℹ Performing atomic move...
✓ Skill promoted to production

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SKILL PROMOTION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Skill:       auth-v2
  Location:    .claude/skills/auth-v2
  Promoted:    2025-11-15T10:30:00.000Z
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Auto-Promote (No Confirmation)

```bash
./scripts/promote-staged-skills.sh .claude/skills/staging/auth-v2 --auto
```

#### Promote with Git Commit

```bash
./scripts/promote-staged-skills.sh .claude/skills/staging/auth-v2 --auto --git-commit
```

**Git Commit Message:**
```
feat(skills): Promote auth-v2 from staging to production

Automated promotion via promote-staged-skills.sh
Validation: PASSED
Tests: PASSED
SLA: Within 48 hours

Promoted-at: 2025-11-15T10:30:00.000Z
Promoted-by: automated-promotion-script
```

#### Force Promotion (Skip Validation)

```bash
./scripts/promote-staged-skills.sh .claude/skills/staging/auth-v2 --force --auto
```

**⚠️ Warning:** Only use `--force` when absolutely necessary (e.g., emergency hotfix).

### TypeScript API

#### Promote a Single Skill

```typescript
import { SkillPromotionService } from './src/services/skill-promotion';
import { DatabaseService } from './src/lib/database-service';

const dbService = new DatabaseService({ type: 'sqlite', path: './data/cfn.db' });
const promotionService = new SkillPromotionService(dbService);

const result = await promotionService.promoteSkill(
  '.claude/skills/staging/auth-v2',
  {
    autoDeploy: true,
    gitCommit: true,
    notify: true,
    promotedBy: 'admin@example.com'
  }
);

if (result.success) {
  console.log(`✓ Skill promoted: ${result.skillName}`);
  console.log(`  Production path: ${result.productionPath}`);
  console.log(`  Deployment ID: ${result.deploymentId}`);
  console.log(`  Commit hash: ${result.commitHash}`);
} else {
  console.error(`✗ Promotion failed: ${result.error}`);
}
```

#### List Staged Skills

```typescript
const stagedSkills = await promotionService.listStagedSkills();

console.log(`${stagedSkills.length} skills in staging:`);
for (const skill of stagedSkills) {
  console.log(`  - ${skill.name} (${skill.ageHours}h old)`);
}
```

#### Check for Stale Skills

```typescript
const staleSkills = await promotionService.checkStaleness();

if (staleSkills.length > 0) {
  console.log(`⚠️ ${staleSkills.length} stale skills detected:`);
  for (const skill of staleSkills) {
    console.log(`  - ${skill.name}`);
    console.log(`    Age: ${skill.ageHours}h`);
    console.log(`    SLA breach: ${skill.slaBreachHours}h over threshold`);
  }
}
```

---

## SLA Enforcement

### Policy

**48-Hour Rule:** Skills must be promoted or removed from staging within 48 hours.

**Rationale:**
- Prevents staging directory from becoming cluttered
- Ensures timely deployment of new features
- Identifies abandoned or problematic skills

### Automated Enforcement

#### Cron Job (Recommended)

```bash
# Add to crontab (daily at 9am)
0 9 * * * cd /path/to/project && ./scripts/promote-staged-skills.sh --check-stale
```

#### Background Job (TypeScript)

```typescript
import { PromotionSLAEnforcer } from './src/jobs/promotion-sla-enforcer';

const enforcer = new PromotionSLAEnforcer(dbService, {
  autoPromote: true,     // Auto-promote stale skills
  notifyStale: true,     // Send notifications
  enableGitCommit: true, // Create git commits
  enableAutoDeploy: false, // Don't auto-deploy (safer)
});

const result = await enforcer.enforceSLA();

console.log(`SLA Enforcement Results:`);
console.log(`  Stale skills found: ${result.staleSkillsFound}`);
console.log(`  Auto-promoted: ${result.promoted}`);
console.log(`  Notifications sent: ${result.notified}`);
```

#### CLI Execution

```bash
# Dry run (no actual promotion)
npx ts-node src/jobs/promotion-sla-enforcer.ts --dry-run

# Auto-promote stale skills
npx ts-node src/jobs/promotion-sla-enforcer.ts --auto-promote

# Auto-promote with deployment
npx ts-node src/jobs/promotion-sla-enforcer.ts --auto-promote --auto-deploy
```

### Manual Override

If a skill should remain in staging beyond 48 hours:

1. **Document the reason** in the skill's SKILL.md frontmatter:
   ```yaml
   ---
   name: complex-skill
   sla_override: true
   sla_override_reason: "Awaiting security review"
   sla_override_expires: "2025-11-20"
   ---
   ```

2. **Notify the team** via Slack/email

3. **Set a reminder** to follow up

---

## Validation Checks

### 1. Content Integrity

**Required Files:**
- `SKILL.md` - Skill metadata and documentation
- `execute.sh` - Execution script (must be executable)

**Optional Files:**
- `test.sh` - Test script (executable)
- `README.md` - Additional documentation

**Validation:**
```bash
# Check files exist
ls -la .claude/skills/staging/skill-name/

# Check execute.sh is executable
ls -l .claude/skills/staging/skill-name/execute.sh
# Should show: -rwxr-xr-x (x = executable)

# Fix if not executable
chmod +x .claude/skills/staging/skill-name/execute.sh
```

### 2. Schema Compliance

**Required Frontmatter Fields:**
```yaml
---
name: skill-name
version: 1.0.0
description: Brief description of skill
---
```

**Optional Fields:**
```yaml
author: Author Name
tags: [tag1, tag2]
dependencies: [skill1, skill2]
```

**Version Format:**
- Must follow semantic versioning: `MAJOR.MINOR.PATCH`
- Examples: `1.0.0`, `2.3.1`, `10.0.0`
- Invalid: `v1.0.0`, `1.0`, `1.0.0.0`

**Validation:**
```bash
# Check frontmatter
head -10 .claude/skills/staging/skill-name/SKILL.md

# Should show:
# ---
# name: skill-name
# version: 1.0.0
# description: ...
# ---
```

### 3. Test Execution

If `test.sh` exists:
- Must be executable (`chmod +x test.sh`)
- Must exit with code 0 (success)
- Runs with 30-second timeout

**Test failures are non-fatal** (warnings only). Use `--force` to bypass.

**Example test.sh:**
```bash
#!/bin/bash
set -euo pipefail

echo "Running tests for skill..."

# Test 1: Check files exist
if [[ ! -f "SKILL.md" ]]; then
  echo "ERROR: SKILL.md missing"
  exit 1
fi

# Test 2: Validate frontmatter
if ! grep -q "^name:" SKILL.md; then
  echo "ERROR: Missing 'name' field"
  exit 1
fi

# Test 3: Execute skill (dry run)
./execute.sh --dry-run

echo "✓ All tests passed"
exit 0
```

### 4. Conflict Detection

**Checks:**
- Does production skill already exist?
- Is production version different from staging?
- Are there uncommitted changes in production?

**Resolution:**
```bash
# Option 1: Use --overwrite flag
./scripts/promote-staged-skills.sh .claude/skills/staging/skill-name --auto --overwrite

# Option 2: Rename staging skill
mv .claude/skills/staging/skill-name .claude/skills/staging/skill-name-v2

# Option 3: Remove production skill first (dangerous)
rm -rf .claude/skills/skill-name
```

---

## Monitoring

### Dashboard Queries

#### Skills in Staging (Current State)

```sql
SELECT
  name,
  created_at,
  ROUND((julianday('now') - julianday(created_at)) * 24, 1) as age_hours
FROM staged_skills
WHERE promoted = 0
ORDER BY created_at ASC;
```

**Example Output:**
```
name          | created_at          | age_hours
--------------|---------------------|----------
auth-v2       | 2025-11-14 10:00:00 | 12.5
logging-v3    | 2025-11-13 18:00:00 | 52.3
```

#### Promotion Success Rate (Last 30 Days)

```sql
SELECT
  COUNT(*) as total_promotions,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
  ROUND(100.0 * SUM(success) / COUNT(*), 2) as success_rate
FROM skill_promotions
WHERE promoted_at > datetime('now', '-30 days');
```

**Example Output:**
```
total_promotions | successful | success_rate
-----------------|------------|-------------
45               | 42         | 93.33
```

#### SLA Breaches (Skills >48h in Staging)

```sql
SELECT
  name,
  created_at,
  ROUND((julianday('now') - julianday(created_at)) * 24, 1) as age_hours,
  ROUND((julianday('now') - julianday(created_at)) * 24 - 48, 1) as breach_hours
FROM staged_skills
WHERE promoted = 0
  AND created_at < datetime('now', '-48 hours')
ORDER BY created_at ASC;
```

#### Promotion History (Recent)

```sql
SELECT
  skill_name,
  promoted_at,
  promoted_by,
  production_path
FROM skill_promotions
ORDER BY promoted_at DESC
LIMIT 10;
```

### Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Staged Skills Count** | < 10 | > 20 |
| **Average Time in Staging** | < 24h | > 36h |
| **SLA Breach Count** | 0 | > 2 |
| **Promotion Success Rate** | > 95% | < 90% |
| **Auto-Deploy Success Rate** | > 90% | < 85% |

---

## Troubleshooting

### Error: "Validation failed: Missing required file: SKILL.md"

**Cause:** SKILL.md file is missing from staged skill.

**Solution:**
```bash
# Create SKILL.md
cat > .claude/skills/staging/skill-name/SKILL.md <<'EOF'
---
name: skill-name
version: 1.0.0
description: Skill description
---

# Skill Name

Documentation here...
EOF
```

### Error: "execute.sh is not executable"

**Cause:** execute.sh file doesn't have execute permissions.

**Solution:**
```bash
chmod +x .claude/skills/staging/skill-name/execute.sh
```

### Error: "Tests failed (exit code 1)"

**Cause:** test.sh script exited with non-zero code.

**Solutions:**
1. Fix the failing tests
2. Use `--force` to bypass (admin only)

**Debug:**
```bash
cd .claude/skills/staging/skill-name
./test.sh  # Run tests manually to see errors
```

### Error: "Skill already exists in production"

**Cause:** A skill with the same name already exists in production.

**Solutions:**
1. Use `--overwrite` flag (backs up existing skill)
2. Rename staging skill to avoid conflict
3. Remove production skill first (dangerous)

**Recommended:**
```bash
./scripts/promote-staged-skills.sh .claude/skills/staging/skill-name --auto --overwrite
```

### Error: "Git commit failed"

**Cause:** Git repository not initialized or configured.

**Solutions:**
```bash
# Check git status
git status

# Initialize git if needed
git init

# Configure git
git config user.name "Your Name"
git config user.email "your@email.com"

# Or disable git commits
./scripts/promote-staged-skills.sh .claude/skills/staging/skill-name --auto
```

### Warning: "Optional file missing: test.sh"

**Cause:** test.sh is optional but recommended.

**Solution (optional):**
```bash
# Create basic test.sh
cat > .claude/skills/staging/skill-name/test.sh <<'EOF'
#!/bin/bash
echo "No tests defined yet"
exit 0
EOF

chmod +x .claude/skills/staging/skill-name/test.sh
```

---

## Manual Override Procedures

### Emergency Promotion (Skip All Validation)

**⚠️ Use only in emergencies (production outage, critical hotfix)**

```bash
./scripts/promote-staged-skills.sh .claude/skills/staging/hotfix-skill --force --auto
```

**Procedure:**
1. Document reason in ticket/issue
2. Notify team via Slack
3. Run promotion with --force
4. Create follow-up ticket to add proper validation
5. Review and fix validation issues within 24h

### Manual Rollback

If promotion succeeded but skill is broken:

```bash
# 1. Remove broken production skill
rm -rf .claude/skills/skill-name

# 2. Restore from backup (created automatically if overwriting)
mv .claude/skills/skill-name.backup.1234567890 .claude/skills/skill-name

# 3. Or restore from staging backup (if available)
git checkout HEAD~1 -- .claude/skills/staging/skill-name

# 4. Update database (mark as not promoted)
sqlite3 ./data/cfn.db "UPDATE skill_promotions SET success = 0 WHERE skill_name = 'skill-name'"
```

### Batch Promotion

To promote multiple skills at once:

```bash
# List all staged skills
./scripts/promote-staged-skills.sh --list

# Promote each skill
for skill in auth-v2 logging-v3 caching-v1; do
  ./scripts/promote-staged-skills.sh ".claude/skills/staging/$skill" --auto
done
```

---

## Best Practices

1. **Validate before promoting** - Don't use `--force` unless absolutely necessary
2. **Run tests in staging** - Add test.sh to all skills
3. **Monitor SLA breaches** - Check daily for stale skills
4. **Use git commits** - Maintain audit trail
5. **Enable auto-deployment** - For production-ready skills
6. **Backup production skills** - Before overwriting
7. **Test promotions in dev** - Test workflow before production use
8. **Document overrides** - When skipping validation
9. **Review promotion logs** - Check for patterns/issues
10. **Clean up staging regularly** - Don't let it accumulate

---

## Integration with Other Systems

### Task 1.1: Skill Deployment Pipeline

After promotion, skills can be automatically deployed:

```typescript
const result = await promotionService.promoteSkill(stagingPath, {
  autoDeploy: true  // Triggers SkillDeploymentPipeline
});

if (result.deploymentId) {
  console.log(`Deployed as version: ${result.deploymentId}`);
}
```

### Phase 4: Skill Generation

Generated skills output to staging:

```typescript
// Skill generator outputs to staging
const stagingPath = await skillGenerator.generate({
  output: '.claude/skills/staging/new-skill'
});

// Auto-promote after generation
await promotionService.promoteSkill(stagingPath, {
  autoDeploy: true,
  gitCommit: true,
});
```

### CI/CD Integration

```yaml
# .github/workflows/promote-skills.yml
name: Promote Skills

on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9am

jobs:
  check-stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check for stale skills
        run: ./scripts/promote-staged-skills.sh --check-stale
```

---

## Related Documentation

- **Implementation**: `src/services/skill-promotion.ts`
- **Validator**: `src/services/promotion-validator.ts`
- **SLA Enforcer**: `src/jobs/promotion-sla-enforcer.ts`
- **Tests**: `tests/skill-promotion.test.ts`
- **Skill Guide**: `.claude/skills/cfn-promotion/SKILL.md`
- **Deployment Pipeline**: `docs/SKILL_DEPLOYMENT_PIPELINE.md` (Task 1.1)

---

## Changelog

### v1.0.0 (2025-11-15)
- Initial implementation
- Atomic promotion from staging to production
- Comprehensive validation (content, schema, tests, conflicts)
- SLA enforcement (48-hour rule)
- Git integration
- Auto-deployment support
- CLI script with colored output
- TypeScript API
- Comprehensive tests (≥90% coverage)
