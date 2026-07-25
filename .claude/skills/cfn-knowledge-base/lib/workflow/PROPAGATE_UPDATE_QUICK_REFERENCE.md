# Propagate Skill Update - Quick Reference

## Overview
`propagate-skill-update.sh` enables Phase 4 Edge Case Tracker to propagate approved skill improvements back to the Skills Database with proper version management and audit trails.

## Usage

```bash
./.claude/skills/workflow-codification/propagate-skill-update.sh \
  SKILL_NAME \
  NEW_VERSION \
  UPDATE_PATH \
  [CHANGE_TYPE] \
  [NOTIFY_AGENTS]
```

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| SKILL_NAME | Yes | - | Skill identifier (e.g., "jwt-authentication") |
| NEW_VERSION | Yes | - | Semantic version (e.g., "1.0.1", "1.1.0", "2.0.0") |
| UPDATE_PATH | Yes | - | Path to updated skill markdown file |
| CHANGE_TYPE | No | patch | Version change type: patch\|minor\|major |
| NOTIFY_AGENTS | No | false | Notify affected agents: true\|false |

## Change Types

### Patch (Bug Fix)
**Example:** 1.0.0 → 1.0.1

```bash
./.claude/skills/workflow-codification/propagate-skill-update.sh \
  "jwt-authentication" \
  "1.0.1" \
  ".claude/skills/auth/jwt-auth-v1.0.1.md" \
  "patch" \
  "true"
```

**Use When:**
- Fixing bugs or errors
- Improving documentation clarity
- Optimizing performance without API changes
- Correcting edge case handling

### Minor (New Feature)
**Example:** 1.0.0 → 1.1.0

```bash
./.claude/skills/workflow-codification/propagate-skill-update.sh \
  "jwt-authentication" \
  "1.1.0" \
  ".claude/skills/auth/jwt-auth-v1.1.0.md" \
  "minor" \
  "true"
```

**Use When:**
- Adding new functionality
- Enhancing existing features
- Adding backward-compatible improvements
- Expanding skill capabilities

### Major (Breaking Change)
**Example:** 1.0.0 → 2.0.0

```bash
./.claude/skills/workflow-codification/propagate-skill-update.sh \
  "jwt-authentication" \
  "2.0.0" \
  ".claude/skills/auth/jwt-auth-v2.0.0.md" \
  "major" \
  "true"
```

**Use When:**
- Breaking API compatibility
- Fundamental architecture changes
- Removing deprecated features
- Complete skill redesigns

## Exit Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 0 | Success | Skill updated successfully |
| 1 | Invalid Parameters | Missing or invalid input parameters |
| 2 | File Not Found | UPDATE_PATH file doesn't exist |
| 3 | Skill Not Found | Skill doesn't exist in database |
| 4 | Invalid Version | Version downgrade, same version, or type mismatch |
| 5 | Content Unchanged | No actual content changes (hash identical) |
| 6 | Database Error | SQLite operation failed |

## Environment Variables

```bash
# Skills Database (SQLite - required)
export CFN_SKILLS_DB_PATH="./.claude/skills-database/skills.db"

# Phase 4 PostgreSQL Integration (optional)
export PHASE4_POSTGRES_HOST="localhost"
export PHASE4_POSTGRES_DB="workflow_codification"
export PHASE4_POSTGRES_USER="cfn_user"
export PHASE4_POSTGRES_PASS="secure_password"

# Agent Notifications (optional)
export ENABLE_AGENT_NOTIFICATIONS="true"
```

## Phase 4 Integration Workflow

### 1. Edge Case Detection
Phase 4 Edge Case Tracker detects skill improvement opportunity:
```bash
# Phase 4 detects pattern deviation in agent execution
./.claude/skills/workflow-codification/track-edge-case.sh \
  --skill-name "jwt-authentication" \
  --issue "Missing refresh token validation" \
  --severity "medium"
```

### 2. Expert Review & Approval
Human expert reviews and approves the improvement:
```bash
# Expert approves edge case fix
./.claude/skills/workflow-codification/approval-workflow.sh \
  --edge-case-id 42 \
  --decision "approved" \
  --expert "security@example.com"
```

### 3. Skill Update Generation
Phase 4 generates updated skill content:
```bash
# Generate updated skill with fix
./.claude/skills/workflow-codification/generate-skill-update.sh \
  --skill-name "jwt-authentication" \
  --edge-case-id 42 \
  --output ".claude/skills/auth/jwt-auth-v1.0.1.md"
```

### 4. Propagate to Skills DB
**This script** propagates the approved update:
```bash
# Propagate approved update to Skills Database
./.claude/skills/workflow-codification/propagate-skill-update.sh \
  "jwt-authentication" \
  "1.0.1" \
  ".claude/skills/auth/jwt-auth-v1.0.1.md" \
  "patch" \
  "true"
```

### 5. Agent Reload
Agents reload the updated skill on next invocation:
```bash
# Agent detects version update via SkillLoader
# Automatically reloads skill content
# No manual intervention required
```

## Validation Rules

### Semantic Versioning
- **Format:** MAJOR.MINOR.PATCH (e.g., 2.1.3)
- **No downgrades:** 1.1.0 → 1.0.0 ❌
- **No duplicates:** 1.0.0 → 1.0.0 ❌
- **Type matching:** Major change requires change_type="major" ✅

### Version Change Type Validation
| Current | New | Expected Type | Valid? |
|---------|-----|---------------|--------|
| 1.0.0 | 1.0.1 | patch | ✅ |
| 1.0.0 | 1.1.0 | minor | ✅ |
| 1.0.0 | 2.0.0 | major | ✅ |
| 1.0.0 | 2.0.0 | patch | ❌ Type mismatch |
| 1.0.0 | 1.1.0 | major | ❌ Type mismatch |
| 1.1.0 | 1.0.0 | any | ❌ Downgrade |

### Content Hash Validation
- **Must differ:** New content hash must be different from current
- **SHA256:** Content integrity verified via SHA256 hash
- **Idempotent:** Re-running with same content returns exit code 5

## Database Changes

### Skills Table Update
```sql
UPDATE skills
SET version = '1.0.1',
    content_hash = 'sha256_hash_of_new_content',
    content_path = '.claude/skills/auth/jwt-auth-v1.0.1.md',
    updated_at = datetime('now')
WHERE name = 'jwt-authentication';
```

### Approval History Record
```sql
INSERT INTO approval_history (
    skill_id, version, approval_level, approver, decision, reasoning
) VALUES (
    42,
    '1.0.1',
    'auto',
    'phase4-edge-case-tracker',
    'approved',
    'Edge case update propagated from Phase 4 after expert review and validation'
);
```

## Agent Notification

When `NOTIFY_AGENTS=true`, the script lists all agents using the skill:

```
[INFO] Agents using this skill (3):
  - backend-developer
  - api-designer
  - security-specialist

[SUCCESS] Notification: Skill 'jwt-authentication' updated from 1.0.0 to 1.0.1 (patch)
[INFO] Affected agents should reload skill content on next invocation
```

## Error Handling Examples

### Invalid Version Format
```bash
$ propagate-skill-update.sh "skill-name" "1.0" "path.md" "patch"
[ERROR] NEW_VERSION must follow semantic versioning (e.g., 1.2.3): 1.0
Exit Code: 1
```

### File Not Found
```bash
$ propagate-skill-update.sh "skill-name" "1.0.1" "/missing/path.md" "patch"
[ERROR] UPDATE_PATH file not found: /missing/path.md
Exit Code: 2
```

### Skill Not Found
```bash
$ propagate-skill-update.sh "nonexistent" "1.0.1" "path.md" "patch"
[ERROR] Skill not found in database: nonexistent
Exit Code: 3
```

### Version Downgrade
```bash
$ propagate-skill-update.sh "skill-name" "0.9.0" "path.md" "patch"
[ERROR] Version downgrade not allowed: 1.0.0 → 0.9.0
Exit Code: 4
```

### Content Unchanged
```bash
$ propagate-skill-update.sh "skill-name" "1.0.1" "path.md" "patch"
[WARNING] Content hash unchanged - no actual content changes detected
[ERROR] Content hash unchanged - update not needed
Exit Code: 5
```

## Testing

Run comprehensive integration tests:
```bash
bash tests/integration/test-propagate-skill-update.sh
```

**Test Coverage:**
- ✅ Patch version updates (1.0.0 → 1.0.1)
- ✅ Minor version updates (1.0.0 → 1.1.0)
- ✅ Major version updates (1.0.0 → 2.0.0)
- ✅ Content hash validation
- ✅ Approval history creation
- ✅ Agent notification listing
- ✅ Error handling (invalid version, missing file)
- ✅ Idempotency (unchanged content detection)
- ✅ Version type mismatch detection
- ✅ Version downgrade rejection

## Best Practices

### 1. Always Specify Change Type
```bash
# Good - Explicit change type
propagate-skill-update.sh "skill" "1.0.1" "path.md" "patch"

# Risky - Relies on default (patch)
propagate-skill-update.sh "skill" "1.0.1" "path.md"
```

### 2. Enable Notifications for Breaking Changes
```bash
# Major version - notify all agents
propagate-skill-update.sh "skill" "2.0.0" "path.md" "major" "true"

# Patch version - optional notification
propagate-skill-update.sh "skill" "1.0.1" "path.md" "patch" "false"
```

### 3. Version Files Consistently
```bash
# Consistent naming pattern
.claude/skills/auth/jwt-auth-v1.0.0.md
.claude/skills/auth/jwt-auth-v1.0.1.md
.claude/skills/auth/jwt-auth-v1.1.0.md
.claude/skills/auth/jwt-auth-v2.0.0.md
```

### 4. Document Changes
Update skill content with changelog:
```markdown
# JWT Authentication Skill

**Version:** 1.0.1
**Last Updated:** 2025-11-16

## Changelog

### v1.0.1 (2025-11-16)
- **Bug Fix:** Added missing refresh token validation
- **Improvement:** Enhanced error handling for expired tokens
- **Documentation:** Clarified token rotation process

### v1.0.0 (2025-11-01)
- Initial release
```

## Troubleshooting

### Database Locked
```bash
# Check for concurrent processes
lsof .claude/skills-database/skills.db

# Wait and retry
sleep 2
propagate-skill-update.sh ...
```

### Permission Denied
```bash
# Ensure script is executable
chmod +x .claude/skills/workflow-codification/propagate-skill-update.sh

# Check database permissions
chmod 664 .claude/skills-database/skills.db
```

### Hash Calculation Failure
```bash
# Verify file exists and is readable
ls -lh "$UPDATE_PATH"
sha256sum "$UPDATE_PATH"

# Check file permissions
chmod 644 "$UPDATE_PATH"
```

## Related Documentation
- Phase 4 Edge Case Tracking: `.claude/skills/workflow-codification/EDGE_CASE_TRACKING.md`
- Approval Workflow: `.claude/skills/workflow-codification/APPROVAL_WORKFLOW.md`
- Skill Deployment: `.claude/skills/workflow-codification/DEPLOY_QUICK_REFERENCE.md`
- Skills Database Schema: `.claude/skills-database/schema-v2.sql`
