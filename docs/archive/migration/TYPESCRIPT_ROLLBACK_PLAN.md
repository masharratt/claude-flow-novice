# TypeScript Rollback Plan

**Version:** v2.16.0+
**Last Updated:** 2025-11-20
**Purpose:** Emergency rollback procedures for TypeScript migration issues

## Table of Contents

1. [When to Rollback](#when-to-rollback)
2. [Rollback Decision Makers](#rollback-decision-makers)
3. [Immediate Rollback (< 5 minutes)](#immediate-rollback--5-minutes)
4. [Short-Term Rollback (< 1 hour)](#short-term-rollback--1-hour)
5. [Long-Term Rollback (< 1 day)](#long-term-rollback--1-day)
6. [Verification Checklist](#verification-checklist)
7. [Communication Protocol](#communication-protocol)
8. [Post-Rollback Analysis](#post-rollback-analysis)

---

## When to Rollback

Execute rollback if **any** of these conditions occur:

### Critical (Immediate Rollback)
- **Production errors > 5%** - Critical failure rate
- **Data corruption or loss** - Any data integrity issues
- **Security vulnerability** - TypeScript introduces security hole
- **Complete system failure** - CFN Loop non-functional
- **Coordinator spawn failures > 20%** - Cannot spawn agents

### High Priority (Rollback within 1 hour)
- **Performance degradation > 20%** - Significantly slower than bash
- **Memory leaks** - Increasing memory usage over time
- **Redis connection failures** - Coordination layer broken
- **Test pass rate < 85%** - Quality gates failing
- **Agent spawn failures > 10%** - Spawning unreliable

### Medium Priority (Evaluate for rollback)
- **Performance degradation 10-20%** - Moderate slowdown
- **Error rate 2-5%** - Elevated but not critical
- **Team cannot debug issues** - Excessive debugging time
- **Test pass rate 85-95%** - Below target but functional
- **Agent spawn failures 5-10%** - Some reliability issues

### Low Priority (Monitor, do not rollback)
- **Performance degradation < 10%** - Within acceptable range
- **Error rate < 2%** - Expected during soft launch
- **Minor bugs** - Non-critical issues
- **Test pass rate > 95%** - Meeting targets
- **Agent spawn failures < 5%** - Acceptable failure rate

---

## Rollback Decision Makers

### Authority Levels

1. **CTO Agent** - Final decision authority
2. **Tech Lead** - Can initiate immediate rollback (< 5 min)
3. **On-Call Engineer** - Can initiate immediate rollback for critical issues
4. **Team Lead** - Can recommend rollback to CTO

### Decision Matrix

| Severity | Who Decides | Approval Required | Time Limit |
|----------|-------------|-------------------|------------|
| Critical | Tech Lead / On-Call | None (immediate) | < 5 minutes |
| High | CTO Agent | None | < 1 hour |
| Medium | CTO Agent | Team consensus | < 4 hours |
| Low | Team Lead | CTO approval | < 1 day |

---

## Immediate Rollback (< 5 minutes)

**Use for:** Critical production errors, complete system failure, data corruption

### Step 1: Disable TypeScript Globally

```bash
# Set environment variable to disable TypeScript
export USE_TYPESCRIPT=false

# Persist to .env file
echo "USE_TYPESCRIPT=false" >> .env

# Verify
echo $USE_TYPESCRIPT  # Should output: false
```

### Step 2: Restart All Coordinators

```bash
# Kill all running coordinators
pkill -f cfn-v3-coordinator

# Verify no coordinators running
pgrep -f cfn-v3-coordinator  # Should return nothing

# Coordinators will auto-respawn with bash fallback
# Wait 30 seconds for respawn
sleep 30

# Verify coordinators running
pgrep -f cfn-v3-coordinator  # Should show PIDs
```

### Step 3: Verify Bash Execution

```bash
# Check coordinator logs for bash execution
grep "spawn-agent.sh" /tmp/coordinator-*.log

# Expected output:
# Executing: ./.claude/skills/cfn-agent-spawning/spawn-agent.sh

# Verify no TypeScript execution
grep "agent-executor.ts" /tmp/coordinator-*.log  # Should return nothing
```

### Step 4: Monitor Error Rate

```bash
# Check error logs
tail -100 .artifacts/logs/cfn-errors.log

# Count recent errors (last 5 minutes)
grep "ERROR" .artifacts/logs/cfn-errors.log | \
  awk -v t=$(date -d '5 minutes ago' +%s) \
  '{ts=mktime($1" "$2); if(ts>t) print}' | wc -l

# Should be significantly reduced after rollback
```

### Step 5: Notify Team

```bash
# Post to Slack (automated)
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "🚨 EMERGENCY ROLLBACK: TypeScript disabled",
    "attachments": [{
      "color": "danger",
      "fields": [
        {"title": "Reason", "value": "Critical production errors"},
        {"title": "Status", "value": "Bash fallback active"},
        {"title": "Action Required", "value": "Monitor error rates"}
      ]
    }]
  }'
```

**Time to Complete:** 3-5 minutes

---

## Short-Term Rollback (< 1 hour)

**Use for:** High priority issues, persistent errors, performance problems

### Step 1: Update Coordinator Profiles

```bash
# Edit all coordinator profiles
for profile in .claude/agents/cfn-dev-team/coordinators/*.md; do
  # Remove TypeScript references
  sed -i 's/USE_TYPESCRIPT=true/USE_TYPESCRIPT=false/g' "$profile"

  # Update skill references
  sed -i 's|src/agent-spawner|.claude/skills/cfn-agent-spawning/spawn-agent.sh|g' "$profile"

  echo "Updated: $profile"
done
```

### Step 2: Remove TypeScript Imports

```bash
# Edit orchestrator scripts
for script in .claude/skills/cfn-loop-orchestration/*.sh; do
  # Comment out TypeScript imports
  sed -i 's/^npx.*agent-spawn/# npx (disabled) # /g' "$script"

  # Restore bash script calls
  sed -i 's|^# \(\.\.\/.*\.sh\)|\1|g' "$script"

  echo "Updated: $script"
done
```

### Step 3: Restore Bash Skill References

```bash
# Update SKILL.md files
sed -i 's|src/agent-spawner|.claude/skills/cfn-agent-spawning|g' \
  .claude/skills/*/SKILL.md

sed -i 's|src/coordination|.claude/skills/cfn-coordination|g' \
  .claude/skills/*/SKILL.md

sed -i 's|src/validation|.claude/skills/cfn-loop-validation|g' \
  .claude/skills/*/SKILL.md
```

### Step 4: Deploy Updated Configs

```bash
# If using Docker, rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Verify services healthy
docker-compose ps

# Check logs
docker-compose logs --tail=100 coordinator
```

### Step 5: Monitor for 1 Hour

```bash
# Continuous monitoring script
while true; do
  echo "=== $(date) ==="

  # Error rate
  echo "Errors (last 5 min):"
  grep "ERROR" .artifacts/logs/cfn-errors.log | \
    tail -100 | wc -l

  # Agent spawns
  echo "Agent spawns (last 5 min):"
  grep "Spawned agent" /tmp/coordinator-*.log | \
    tail -100 | wc -l

  # Performance
  echo "Avg spawn time (last 10 spawns):"
  grep "Spawn time:" /tmp/coordinator-*.log | \
    tail -10 | awk '{sum+=$3; n++} END {print sum/n "s"}'

  sleep 300  # 5 minutes
done
```

**Time to Complete:** 30-60 minutes

---

## Long-Term Rollback (< 1 day)

**Use for:** Persistent issues requiring investigation, team decision to revert

### Step 1: Investigate Root Cause

```bash
# Collect comprehensive logs
mkdir -p .artifacts/rollback-$(date +%Y%m%d)

# TypeScript error logs
cp .artifacts/logs/typescript-errors.log \
  .artifacts/rollback-$(date +%Y%m%d)/

# Coordinator logs
cp /tmp/coordinator-*.log \
  .artifacts/rollback-$(date +%Y%m%d)/

# Performance metrics
cp .artifacts/metrics/* \
  .artifacts/rollback-$(date +%Y%m%d)/

# Analyze errors
echo "Top 10 errors:"
grep "ERROR" .artifacts/logs/typescript-errors.log | \
  awk '{print $5}' | sort | uniq -c | sort -rn | head -10

# Analyze performance
echo "Performance comparison:"
cat .artifacts/metrics/performance-comparison.json | jq '.'
```

### Step 2: Create Bug Report

```bash
# Create GitHub issue with full context
cat > /tmp/rollback-issue.md <<'EOF'
# TypeScript Rollback - Critical Issues

## Rollback Date
$(date)

## Root Cause
[Detailed analysis of what went wrong]

## Impact
- Error rate: X%
- Performance degradation: Y%
- Affected components: [list]

## Evidence
- Logs: .artifacts/rollback-$(date +%Y%m%d)/
- Screenshots: [attach]
- Metrics: [attach]

## Recommendation
[REVERT / FIX / DEFER]

## Next Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Assignees
@tech-lead @cto-agent
EOF

gh issue create \
  --title "TypeScript Rollback - Critical Issues" \
  --body-file /tmp/rollback-issue.md \
  --label typescript-migration,rollback,P0
```

### Step 3: Fix TypeScript Issues

```bash
# Create fix branch
git checkout -b fix/typescript-rollback-$(date +%Y%m%d)

# Apply fixes based on root cause analysis
# Example: Fix Redis connection handling
cat > src/coordination/redis-client.ts <<'EOF'
import Redis from 'ioredis';

export function createRedisClient(): Redis {
  const redis = new Redis({
    host: process.env.CFN_REDIS_HOST || 'localhost',
    port: parseInt(process.env.CFN_REDIS_PORT || '6379'),
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false
  });

  redis.on('error', (err) => {
    console.error('Redis error:', err);
  });

  return redis;
}
EOF

# Run tests
npm test

# Verify fix
npm run test:integration
```

### Step 4: Re-Test Thoroughly

```bash
# Full test suite
npm test -- --coverage

# Integration tests
./tests/cli-mode/run-all-tests.sh

# Docker tests
./tests/docker-mode/run-all-implementations.sh

# Performance benchmarks
node scripts/measure-performance.js

# Load testing
./tests/load-testing/run-load-test.sh
```

### Step 5: Plan Second Rollout

```bash
# Create rollout plan
cat > docs/TYPESCRIPT_ROLLOUT_V2.md <<'EOF'
# TypeScript Rollout v2 - Post-Rollback

## Issues Fixed
1. [Issue 1] - Fixed by [solution]
2. [Issue 2] - Fixed by [solution]

## Additional Testing
- [Test 1]
- [Test 2]

## Extended Soft Launch
- Duration: 4 weeks (was 2 weeks)
- Error threshold: < 1% (was < 2%)
- Performance target: Within 5% (was 10%)

## Rollback Triggers (Stricter)
- Error rate > 2% (was 5%)
- Performance degradation > 10% (was 20%)
- Any data corruption (unchanged)

## Timeline
Week 1-4: Extended soft launch
Week 5-6: Validation
Week 7-8: Hard cutover (if validated)
EOF

# Share with team
gh pr create \
  --title "TypeScript Rollout v2 - Post-Rollback Plan" \
  --body-file docs/TYPESCRIPT_ROLLOUT_V2.md \
  --label typescript-migration,rollback-recovery
```

**Time to Complete:** 4-24 hours

---

## Verification Checklist

After rollback, verify all systems are functioning:

### System Health

- [ ] **Bash scripts executing**
  ```bash
  grep "spawn-agent.sh" /tmp/coordinator-*.log
  ```

- [ ] **Error rate back to baseline**
  ```bash
  # Should be < 1%
  tail -1000 .artifacts/logs/cfn-errors.log | \
    grep "ERROR" | wc -l
  ```

- [ ] **Performance back to baseline**
  ```bash
  # Avg spawn time should match pre-TypeScript metrics
  grep "Spawn time:" /tmp/coordinator-*.log | \
    tail -100 | awk '{sum+=$3; n++} END {print sum/n "s"}'
  ```

- [ ] **All tests passing**
  ```bash
  npm test  # Should be 100%
  ./tests/cli-mode/run-all-tests.sh  # All passing
  ```

### Service Health

- [ ] **Redis connection stable**
  ```bash
  redis-cli ping  # Should return PONG
  ```

- [ ] **Coordinators spawning**
  ```bash
  pgrep -f cfn-v3-coordinator  # Should show PIDs
  ```

- [ ] **Agents completing tasks**
  ```bash
  grep "Agent completed" /tmp/coordinator-*.log | tail -10
  ```

- [ ] **No memory leaks**
  ```bash
  # Monitor for 1 hour - memory should be stable
  while true; do
    ps aux | grep coordinator | awk '{print $6}'
    sleep 300
  done
  ```

### Team Communication

- [ ] **Team notified of rollback**
  - Slack message sent
  - Email sent
  - GitHub issue created

- [ ] **Documentation updated**
  - CHANGELOG.md updated
  - Known issues documented
  - Rollback recorded

- [ ] **Post-mortem scheduled**
  - Within 24 hours of rollback
  - All stakeholders invited
  - Root cause analysis prepared

---

## Communication Protocol

### Immediate Communication (< 5 minutes)

**Slack Message Template:**
```
🚨 EMERGENCY ROLLBACK EXECUTED

TypeScript migration rolled back due to critical issues.

REASON: [Brief description]
STATUS: Bash fallback active
ERROR RATE: [X%] → [Y%]
PERFORMANCE: [Improved/Stable]

ACTION REQUIRED:
- Monitor error logs
- Verify bash execution
- Report any issues immediately

CONTACT: @tech-lead @on-call
```

### Team Email Template

**Subject:** TypeScript Migration Rollback - [DATE]

**Body:**
```
Team,

We have executed a rollback of the TypeScript migration due to [REASON].

WHAT HAPPENED:
[Detailed explanation of issues]

WHAT WE DID:
1. Disabled TypeScript (USE_TYPESCRIPT=false)
2. Restarted coordinators with bash fallback
3. Verified system stability

CURRENT STATUS:
- Error rate: [X%]
- Performance: [Within Y% of baseline]
- System health: [Stable/Recovering]

NEXT STEPS:
1. Root cause analysis (in progress)
2. Bug fixes (within 24 hours)
3. Post-mortem (scheduled for [DATE])
4. Rollout v2 plan (within 1 week)

WHAT YOU NEED TO DO:
- Continue using bash scripts
- Report any issues immediately
- Attend post-mortem meeting

Questions? Contact @tech-lead or @on-call

Thanks,
CTO Agent
```

### GitHub Issue Template

**Title:** TypeScript Rollback - [DATE] - [BRIEF REASON]

**Labels:** `typescript-migration`, `rollback`, `P0`

**Body:**
```markdown
## Rollback Summary

**Date:** [DATE]
**Time:** [TIME]
**Severity:** Critical

## Root Cause

[Detailed analysis of what went wrong]

## Impact

- **Error Rate:** X% (baseline: Y%)
- **Performance:** Z% slower than bash
- **Affected Components:**
  - Agent spawning
  - Coordination layer
  - [Others]

## Evidence

- **Error Logs:** .artifacts/rollback-[DATE]/typescript-errors.log
- **Performance Metrics:** .artifacts/rollback-[DATE]/performance.json
- **Coordinator Logs:** .artifacts/rollback-[DATE]/coordinator-*.log

## Rollback Actions Taken

1. ✅ Disabled TypeScript globally
2. ✅ Restarted coordinators
3. ✅ Verified bash execution
4. ✅ Notified team

## Current Status

- [ ] System stable
- [ ] Error rate back to baseline
- [ ] Performance back to baseline
- [ ] Root cause identified

## Next Steps

1. [ ] Complete root cause analysis
2. [ ] Implement fixes
3. [ ] Re-test thoroughly
4. [ ] Create rollout v2 plan
5. [ ] Schedule post-mortem

## Assignees

@tech-lead @cto-agent @on-call
```

---

## Post-Rollback Analysis

### Required within 24 hours

#### 1. Root Cause Analysis Document

**File:** `docs/TYPESCRIPT_ROLLBACK_ANALYSIS_[DATE].md`

**Template:**
```markdown
# TypeScript Rollback Root Cause Analysis

**Date:** [DATE]
**Incident Duration:** [X hours]
**Impact:** [Brief summary]

## Timeline

| Time | Event |
|------|-------|
| 10:00 | TypeScript enabled by default |
| 10:15 | Error rate increases to 5% |
| 10:20 | Performance degradation detected |
| 10:25 | Rollback decision made |
| 10:30 | Rollback executed |
| 10:35 | System stable |

## Root Cause

[Detailed technical analysis]

### Primary Cause
[Main issue that triggered rollback]

### Contributing Factors
1. [Factor 1]
2. [Factor 2]
3. [Factor 3]

## Evidence

### Error Logs
```
[Sample error messages]
```

### Performance Metrics
```
TypeScript: 3.2s avg spawn time
Bash: 2.1s avg spawn time
Degradation: 52%
```

### System Metrics
```
Memory: 450MB (TypeScript) vs 150MB (bash)
CPU: 45% (TypeScript) vs 20% (bash)
```

## Impact Assessment

- **Users Affected:** [Number/Percentage]
- **Services Affected:** [List]
- **Data Loss:** [None/Description]
- **Duration:** [X hours]

## Resolution

### Immediate Fixes Applied
1. [Fix 1]
2. [Fix 2]

### Long-Term Solutions
1. [Solution 1]
2. [Solution 2]

## Prevention

### What Went Well
- Rollback executed quickly (5 minutes)
- No data loss
- Team communication effective

### What Could Be Improved
- Better pre-rollout testing
- More gradual rollout
- Enhanced monitoring

### Action Items
- [ ] Improve TypeScript error handling
- [ ] Add performance benchmarks to CI/CD
- [ ] Extend soft launch period (2 → 4 weeks)
- [ ] Stricter rollback triggers

## Lessons Learned

1. [Lesson 1]
2. [Lesson 2]
3. [Lesson 3]

## Recommendations

### For Rollout v2
1. [Recommendation 1]
2. [Recommendation 2]

### For Future Migrations
1. [Recommendation 1]
2. [Recommendation 2]
```

#### 2. Post-Mortem Meeting

**Agenda:**
1. Timeline review (10 min)
2. Root cause analysis (20 min)
3. Impact assessment (10 min)
4. What went well (10 min)
5. What could be improved (15 min)
6. Action items (15 min)
7. Rollout v2 planning (20 min)

**Attendees:**
- CTO Agent
- Tech Lead
- On-Call Engineer
- Team Leads
- All developers

**Deliverable:**
- Action items with owners and deadlines
- Rollout v2 plan
- Updated rollback plan

---

## Resources

- **Rollout Overview:** `docs/TYPESCRIPT_ROLLOUT_OVERVIEW.md`
- **Developer Guide:** `docs/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md`
- **Deprecation Timeline:** `docs/BASH_DEPRECATION_TIMELINE.md`
- **FAQ:** `docs/TYPESCRIPT_MIGRATION_FAQ.md`
- **Metrics Dashboard:** `docs/TYPESCRIPT_METRICS_DASHBOARD.md`

## Emergency Contacts

- **On-Call Engineer:** [Phone/Pager]
- **Tech Lead:** [Slack/Phone]
- **CTO Agent:** [Slack]
- **Slack Channel:** #typescript-migration-emergency

---

**Last Updated:** 2025-11-20
**Next Review:** After any rollback event
**Document Owner:** CTO Agent
