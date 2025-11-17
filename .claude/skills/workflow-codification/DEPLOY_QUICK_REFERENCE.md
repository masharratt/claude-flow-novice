# Deploy Approved Skill - Quick Reference

## One-Line Usage

```bash
./.claude/skills/workflow-codification/deploy-approved-skill.sh PATTERN_ID SKILL_NAME FILE [CATEGORY] [AGENTS]
```

## Common Commands

### Deploy Domain Skill
```bash
./.claude/skills/workflow-codification/deploy-approved-skill.sh \
  42 "jwt-auth" ".claude/skills/auth/jwt.md" "domain" "backend-developer,security-specialist"
```

### Deploy Coordination Skill (Auto-Approved)
```bash
./.claude/skills/workflow-codification/deploy-approved-skill.sh \
  43 "redis-pattern" ".claude/skills/coordination/redis.md" "coordination" "cfn-orchestrator"
```

### Deploy without Agent Mappings
```bash
./.claude/skills/workflow-codification/deploy-approved-skill.sh \
  44 "utility" ".claude/skills/utils/utility.md" "foundation"
```

## Parameters

| Parameter | Required | Example | Default |
|-----------|----------|---------|---------|
| PATTERN_ID | Yes | 42 | - |
| SKILL_NAME | Yes | jwt-authentication | - |
| CONTENT_PATH | Yes | .claude/skills/auth/jwt.md | - |
| CATEGORY | No | domain | domain |
| TEAM_IDS | No | backend-developer,api-designer | (empty) |

## Categories & Approval Levels

| Category | Approval Level |
|----------|---------------|
| coordination | auto |
| foundation | auto |
| testing | auto |
| infrastructure | escalate |
| domain | human |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Invalid parameters |
| 2 | File not found |
| 3 | Database error |

## Environment Setup

```bash
export CFN_SKILLS_DB_PATH="./.claude/skills-database/skills.db"
```

## Test Deployment

```bash
bash tests/integration/test-deploy-approved-skill.sh
```

## Verify Deployment

```bash
sqlite3 .claude/skills-database/skills.db "SELECT id, name, approval_level FROM skills WHERE name = 'skill-name';"
```

## Check Agent Mappings

```bash
sqlite3 .claude/skills-database/skills.db "SELECT agent_type FROM agent_skill_mappings WHERE skill_id = 1;"
```

## View Approval History

```bash
sqlite3 .claude/skills-database/skills.db "SELECT decision, approver, timestamp FROM approval_history WHERE skill_id = 1;"
```

## Troubleshooting

**Database not found**:
```bash
ls -la .claude/skills-database/skills.db
```

**Permission denied**:
```bash
chmod 644 .claude/skills-database/skills.db
```

**Skill already exists**:
- Re-running is safe (updates existing skill)
- Check uniqueness if needed

---

**Full Documentation**: `docs/PHASE7_1_DEPLOYMENT_GUIDE.md`
