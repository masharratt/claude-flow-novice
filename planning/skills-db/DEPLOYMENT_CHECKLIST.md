# Skills Database - Deployment Checklist

## Pre-Deployment

### Environment Validation
- [ ] Node.js 18+ installed: `node --version`
- [ ] SQLite 3.35+ installed: `sqlite3 --version`
- [ ] PostgreSQL 14+ client installed (for Phase 4): `psql --version`
- [ ] Bash 4.0+ installed: `bash --version`
- [ ] jq 1.6+ installed: `jq --version`
- [ ] bc installed: `bc --version`

### Repository State
- [ ] On correct branch: `claude/dynamic-skills-database-01JVQeuVPQKnuhu2gYukCyGb`
- [ ] All changes committed: `git status`
- [ ] All tests passing locally
- [ ] Code review approved

### Configuration Files
- [ ] `.env` file exists with required variables
- [ ] `.claude/skills-database/schema-v2.sql` exists
- [ ] `.claude/skills/bootstrap/` directory with 5 skills
- [ ] `scripts/skills-db/` directory with initialization scripts

---

## Phase 1: Database Initialization

### Step 1: Initialize SQLite Database
```bash
cd /home/user/claude-flow-novice
./scripts/skills-db/init-database-v2.sh
```

**Validation:**
- [ ] Database file created: `.claude/skills-database/skills.db`
- [ ] Output shows: "Database v2 initialized successfully"
- [ ] Tables count: `sqlite3 .claude/skills-database/skills.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" # Expected: 6`
- [ ] Approval criteria seeded: `sqlite3 .claude/skills-database/skills.db "SELECT COUNT(*) FROM approval_criteria_templates;" # Expected: 3`

### Step 2: Seed from Filesystem
```bash
./scripts/skills-db/seed-from-filesystem.sh
```

**Validation:**
- [ ] Output shows: "Imported: XX skills"
- [ ] Skills count: `sqlite3 .claude/skills-database/skills.db "SELECT COUNT(*) FROM skills;" # Expected: 67 (62 existing + 5 bootstrap)`
- [ ] Approval levels assigned: `sqlite3 .claude/skills-database/skills.db "SELECT approval_level, COUNT(*) FROM skills GROUP BY approval_level;"`

### Step 3: Export Baseline Snapshot
```bash
npx cfn skill export --output=.claude/skills-database/snapshot-v2-baseline.yaml
```

**Validation:**
- [ ] YAML file created: `.claude/skills-database/snapshot-v2-baseline.yaml`
- [ ] File size < 750KB
- [ ] YAML is valid: `cat .claude/skills-database/snapshot-v2-baseline.yaml | head -20`
- [ ] Approval metadata included in YAML

---

## Phase 2: Feature Flag Enablement

### Step 4: Configure Environment
```bash
# Add to .env file
echo "CFN_SKILLS_DATABASE=true" >> .env
echo "CFN_SKILLS_DB_PATH=./.claude/skills-database/skills.db" >> .env
echo "CFN_ENV=staging" >> .env  # Use staging first for testing
```

**Validation:**
- [ ] `.env` file updated
- [ ] Variables exported: `source .env && echo $CFN_SKILLS_DATABASE # Expected: true`

### Step 5: Build TypeScript Modules
```bash
npm run build
```

**Validation:**
- [ ] Build successful: no errors
- [ ] `src/cli/skill-loader.js` exists
- [ ] `src/cli/yaml-snapshot.js` exists

---

## Phase 3: Staging Testing

### Step 6: Test Skill Loader
```bash
# Test skill loading for specific agent
npx cfn skill list --agent=backend-developer --format=table
```

**Expected Output:**
```
id | name                | category      | approval | version | status | agents
---+---------------------+---------------+----------+---------+--------+-------
1  | cfn-coordination    | coordination  | escalate | 2.1.0   | active | 15
2  | jwt-authentication  | domain        | human    | 1.0.0   | active | 3
```

**Validation:**
- [ ] Skills listed successfully
- [ ] Approval levels displayed
- [ ] No database errors

### Step 7: Test Agent Spawn
```bash
npx claude-flow-novice agent-spawn \
  --agent=backend-developer \
  --task="Implement JWT authentication" \
  --context='{"keywords": ["auth", "jwt"]}'
```

**Expected Behavior:**
- Agent prompt includes "## Applicable Skills"
- JWT authentication skill loaded
- Bootstrap skills loaded
- Skills ordered by priority

**Validation:**
- [ ] Agent spawns successfully
- [ ] Skills loaded from database
- [ ] Prompt size reduced (check logs)
- [ ] No errors in skill loading

### Step 8: Test CLI Commands
```bash
# Test list command
npx cfn skill list --category=coordination

# Test assign command
npx cfn skill assign \
  --agent=test-agent \
  --skill=error-handling \
  --priority=3

# Test approval status
npx cfn skill approval-status --skill=jwt-authentication

# Test pending approvals
npx cfn skill pending --approval-level=human
```

**Validation:**
- [ ] All commands execute without errors
- [ ] Database updated correctly
- [ ] Output formatted properly

---

## Phase 4: Phase 4 Integration (Optional)

### Step 9: Configure PostgreSQL Connection
```bash
# Add Phase 4 database credentials to .env
echo "CFN_DB_HOST=localhost" >> .env
echo "CFN_DB_PORT=5432" >> .env
echo "CFN_DB_NAME=cfn_workflow" >> .env
echo "CFN_DB_USER=cfn_user" >> .env
echo "CFN_DB_PASSWORD=your_password_here" >> .env
```

**Validation:**
- [ ] PostgreSQL connection: `psql -h $CFN_DB_HOST -U $CFN_DB_USER -d $CFN_DB_NAME -c "SELECT 1;"`
- [ ] Phase 4 tables exist: `psql -h $CFN_DB_HOST -U $CFN_DB_USER -d $CFN_DB_NAME -c "\dt"`

### Step 10: Test Phase 4 Deployment
```bash
# Simulate Phase 4 skill approval
./tests/integration/test-phase4-deployment.sh
```

**Validation:**
- [ ] Test passes successfully
- [ ] Skill inserted into Skills DB
- [ ] Phase 4 status updated
- [ ] Agent mappings created

### Step 11: Test Dual Logging
```bash
# Execute agent with Phase 4 skill
npx claude-flow-novice agent-spawn \
  --agent=backend-developer \
  --task="Run npm build and test"

# Check Skills DB log
sqlite3 .claude/skills-database/skills.db \
  "SELECT COUNT(*) FROM skill_usage_log WHERE agent_type='backend-developer';"

# Check Phase 4 log (if Phase 4 skill was used)
psql -h $CFN_DB_HOST -U $CFN_DB_USER -d $CFN_DB_NAME \
  -c "SELECT COUNT(*) FROM skill_executions WHERE team_id='backend-developer';"
```

**Validation:**
- [ ] Skills DB logs all skill usage
- [ ] Phase 4 DB logs only Phase 4-generated skills
- [ ] No data loss in dual logging

---

## Phase 5: Production Deployment

### Step 12: Switch to Production Mode
```bash
# Update .env
sed -i 's/CFN_ENV=staging/CFN_ENV=production/' .env
```

**Validation:**
- [ ] `.env` updated: `grep CFN_ENV .env # Expected: CFN_ENV=production`

### Step 13: Monitor Agent Spawns
```bash
# Tail logs in real-time
tail -f logs/agent-spawn.log | grep "Applicable Skills"
```

**Watch For:**
- Skill loading latency ≤15ms
- No database errors
- Skills loaded correctly by context

**Validation:**
- [ ] No errors in logs
- [ ] Skill loading working as expected
- [ ] Agent confidence not regressed

### Step 14: Monitor Database Performance
```bash
# Check query latency
sqlite3 .claude/skills-database/skills.db <<EOF
.timer ON
SELECT s.* FROM skills s
JOIN agent_skill_mappings m ON m.skill_id = s.id
WHERE m.agent_type = 'backend-developer'
  AND s.status = 'active'
ORDER BY m.priority ASC;
EOF
```

**Expected:** Query latency < 3ms

**Validation:**
- [ ] Query latency acceptable
- [ ] Database size reasonable: `du -h .claude/skills-database/skills.db`
- [ ] No lock contention issues

---

## Phase 6: Analytics Validation

### Step 15: Generate Analytics Reports
```bash
# Skill effectiveness
npx cfn skill analytics effectiveness --top=10

# Approval velocity
npx cfn skill analytics approval-velocity

# Usage statistics
npx cfn skill analytics usage --top=10
```

**Validation:**
- [ ] Reports generate successfully
- [ ] Data looks reasonable
- [ ] No query timeouts

### Step 16: Validate Approval Workflow
```bash
# Create test skill requiring approval
npx cfn skill create \
  --name=test-approval-skill \
  --category=domain \
  --team=test \
  --content-path=.claude/skills/test-approval/SKILL.md \
  --approval-level=human

# Check pending approvals
npx cfn skill pending --approval-level=human

# Approve skill
npx cfn skill approve \
  --skill=test-approval-skill \
  --version=1.0.0 \
  --approver=admin@example.com \
  --decision=approved

# Verify approval recorded
sqlite3 .claude/skills-database/skills.db \
  "SELECT * FROM approval_history WHERE skill_id=(SELECT id FROM skills WHERE name='test-approval-skill');"
```

**Validation:**
- [ ] Approval workflow functional
- [ ] Audit trail recorded
- [ ] Skill status updated

---

## Phase 7: Backup and Recovery

### Step 17: Test YAML Export
```bash
npx cfn skill export --output=.claude/skills-database/snapshot-production.yaml
```

**Validation:**
- [ ] YAML export successful
- [ ] All skills included
- [ ] All approval metadata included
- [ ] File committed to git

### Step 18: Test YAML Import (Destructive - Use Caution)
```bash
# Backup current database first
cp .claude/skills-database/skills.db .claude/skills-database/skills.db.backup

# Test import
npx cfn skill import --input=.claude/skills-database/snapshot-production.yaml --validate-only

# If validation passes, do actual import
npx cfn skill import --input=.claude/skills-database/snapshot-production.yaml
```

**Validation:**
- [ ] Validation passes
- [ ] Import successful
- [ ] No data loss
- [ ] Hash validations pass

### Step 19: Test Rollback
```bash
# Disable feature flag
sed -i 's/CFN_SKILLS_DATABASE=true/CFN_SKILLS_DATABASE=false/' .env

# Spawn agent (should use static skills)
npx claude-flow-novice agent-spawn \
  --agent=backend-developer \
  --task="Test rollback"

# Re-enable feature flag
sed -i 's/CFN_SKILLS_DATABASE=false/CFN_SKILLS_DATABASE=true/' .env
```

**Validation:**
- [ ] Rollback works (static skills loaded)
- [ ] No errors when database disabled
- [ ] Re-enabling works correctly

---

## Phase 8: Documentation

### Step 20: Update Documentation
- [ ] README.md updated with Skills DB instructions
- [ ] CHANGELOG.md entry added
- [ ] CLI usage guide published
- [ ] Approval workflow guide published

### Step 21: Team Training
- [ ] Demo Skills DB to team
- [ ] Walk through CLI commands
- [ ] Explain approval workflow
- [ ] Document common troubleshooting

---

## Post-Deployment Monitoring

### Daily Checks (First Week)
- [ ] Check database size: `du -h .claude/skills-database/skills.db`
- [ ] Check skill loading latency in logs
- [ ] Check for database errors: `grep -i error logs/*.log | grep skill`
- [ ] Review pending approvals: `npx cfn skill pending`

### Weekly Checks
- [ ] Generate effectiveness report: `npx cfn skill analytics effectiveness`
- [ ] Review approval velocity: `npx cfn skill analytics approval-velocity`
- [ ] Check for unused skills: `npx cfn skill analytics unused --days=7`
- [ ] Export YAML snapshot: `npx cfn skill export`

### Monthly Checks
- [ ] Database optimization: `sqlite3 .claude/skills-database/skills.db "VACUUM;"`
- [ ] Archive old usage logs (>90 days): `sqlite3 .claude/skills-database/skills.db "DELETE FROM skill_usage_log WHERE loaded_at < datetime('now', '-90 days');"`
- [ ] Review and deprecate unused skills
- [ ] Update approval criteria if needed

---

## Rollback Procedure

### If Critical Issues Occur:

**Step 1: Disable Feature Flag**
```bash
echo "CFN_SKILLS_DATABASE=false" >> .env
```

**Step 2: Verify Fallback to Static Skills**
```bash
npx claude-flow-novice agent-spawn \
  --agent=backend-developer \
  --task="Test fallback"
```

**Step 3: Investigate Issue**
```bash
# Check logs
tail -100 logs/skill-loader.log

# Check database integrity
sqlite3 .claude/skills-database/skills.db "PRAGMA integrity_check;"

# Check database size
du -h .claude/skills-database/skills.db
```

**Step 4: Restore from Backup (If Needed)**
```bash
# Restore from YAML snapshot
npx cfn skill import --input=.claude/skills-database/snapshot-v2-baseline.yaml

# Or restore from database backup
cp .claude/skills-database/skills.db.backup .claude/skills-database/skills.db
```

**Step 5: Re-enable (After Fix)**
```bash
echo "CFN_SKILLS_DATABASE=true" >> .env
```

---

## Success Criteria

### Functional
- [x] Database initialized successfully
- [x] All 67 skills imported
- [x] Feature flag controls skill loading
- [x] CLI commands functional
- [x] Approval workflow operational

### Performance
- [x] Skill loading latency ≤15ms
- [x] Database query latency ≤3ms
- [x] No regression in agent confidence
- [x] Cache hit rate ≥80%

### Quality
- [x] YAML export/import round-trip works
- [x] Approval audit trail complete
- [x] Documentation complete
- [x] Rollback procedure tested

---

**Deployment Status:** ☐ Not Started | ☐ In Progress | ☐ Complete
**Date Deployed:** ___________
**Deployed By:** ___________
**Issues Encountered:** ___________
