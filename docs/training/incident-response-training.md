# Incident Response Training

**Duration:** Half-day (4 hours)
**Target Audience:** On-call engineers, SREs
**Prerequisites:** Completed operator training
**Last Updated:** 2025-11-24

---

## Course Objectives

By the end of this training, you will be able to:
- Respond to incidents following established procedures
- Communicate effectively during incidents
- Execute runbooks efficiently
- Escalate appropriately
- Write effective post-incident reviews

---

## Module 1: Incident Classification (45 minutes)

### 1.1 Severity Definitions

**P0 - Critical (Page Immediately)**
- **Impact:** Total system outage, data loss imminent
- **Response:** 5 minutes
- **Escalation:** 30 minutes
- **Examples:**
  - Docker daemon completely down
  - Redis/PostgreSQL unavailable
  - Security breach detected
  - All agents unable to spawn

**P1 - High (Page Business Hours)**
- **Impact:** Major degradation, significant user impact
- **Response:** 15 minutes
- **Escalation:** 2 hours
- **Examples:**
  - Agent spawn failure rate >10%
  - CFN Loop stuck >1 hour
  - Disk space >90%
  - High memory usage causing OOM

**P2 - Medium (Notify Only)**
- **Impact:** Minor degradation, limited impact
- **Response:** 30 minutes
- **Escalation:** 4 hours
- **Examples:**
  - Certificate expiring <7 days
  - Cost per team >$10/hour
  - Disk space >80%
  - Single component degraded

### 1.2 Classification Exercise

**Scenario Assessments:**

1. **Redis container stopped**
   - Severity: P0 (all coordination blocked)
   - Action: Immediate response required

2. **Agent spawn failures at 8%**
   - Severity: P2 (below 10% threshold)
   - Action: Monitor, investigate if trending up

3. **Certificate expires in 5 days**
   - Severity: P2 (warning threshold <7 days)
   - Action: Renew within 4 hours

4. **PostgreSQL connection pool 95% full**
   - Severity: P1 (near exhaustion)
   - Action: Immediate investigation

---

## Module 2: Incident Response Workflow (60 minutes)

### 2.1 Response Steps

**Step 1: Alert Received (1 minute)**
```
PagerDuty Page → Acknowledge → Stop escalation timer
```

**Step 2: Initial Assessment (3 minutes)**
```
Check Grafana → Determine severity → Verify classification
```

**Step 3: Communication (2 minutes)**
```
Post in #cfn-incidents:
"[P0/P1] [Alert Name] - Investigating"
```

**Step 4: Diagnosis (Variable)**
```
Open runbook → Follow diagnosis steps → Identify root cause
```

**Step 5: Mitigation (Variable)**
```
Execute fix → Verify resolution → Monitor stability (15 min)
```

**Step 6: Resolution (5 minutes)**
```
Clear alert → Update #cfn-incidents → Close PagerDuty
```

### 2.2 Communication Templates

**Initial Message:**
```
🚨 P0 Redis Connection Loss

Status: INVESTIGATING
Time: 14:32 UTC
Affected: All CFN coordination

Description: Redis container unavailable, all agents blocked

Next: Restarting Redis, verifying data persistence
ETA: Unknown, updates every 15 min
```

**Update Message:**
```
Update: Redis Connection Loss

Status: MITIGATING
Time: 14:37 UTC

Progress:
✅ Redis restarted
✅ Data verified intact
🔄 Restarting dependent services

Next: Monitor for stability
ETA: 5 minutes
```

**Resolution Message:**
```
✅ RESOLVED: Redis Connection Loss

Time: 14:45 UTC
Duration: 13 minutes
Impact: All coordination blocked (13 min downtime)

Resolution: Restarted Redis container, all services recovered

Follow-up: PIR to be completed within 4 hours
Root cause: OOM kill due to memory leak (under investigation)
```

### 2.3 Hands-On Exercise

**Scenario: High Disk Usage Alert**

Participants execute full workflow:
1. Receive simulated alert
2. Post initial message
3. Follow runbook
4. Execute docker prune
5. Verify resolution
6. Post resolution message

**Time Limit:** 15 minutes
**Evaluation:** Communication, runbook adherence, verification

---

## Module 3: Escalation Procedures (45 minutes)

### 3.1 When to Escalate

**Immediate Escalation (Don't Wait):**
- Security incident detected
- Data loss occurring
- Unsure how to proceed with P0
- Fix requires permissions you don't have

**Timed Escalation:**
- P0: After 30 minutes if not resolved
- P1: After 2 hours if not resolved
- P2: After 4 hours if unresolved

**Escalation Path:**
```
Primary On-Call → Secondary On-Call → Manager → Director → VP
```

### 3.2 Escalation Communication

**How to Escalate:**

**Via PagerDuty:**
```
1. Click "Escalate" on incident
2. Select escalation policy
3. Add note explaining why escalating
```

**Via Slack:**
```
@secondary-oncall Need assistance with P0 Redis outage
- Tried: Restart, restore from backup
- Status: Still unable to start Redis
- Error: "Cannot allocate memory"
- Need: Help diagnosing memory issue
```

**Via Phone:**
```
Call manager on-call (P0 only, after 30 min)
Use phone number from PagerDuty escalation policy
```

### 3.3 What NOT to Escalate

**Don't Escalate For:**
- Following documented runbook procedures (you got this!)
- Normal response time (P1 at 30 min doesn't need escalation yet)
- Asking clarifying questions (use Slack first)
- Low severity issues (P2/P3)

**Exception:** Always escalate security incidents immediately.

---

## Module 4: Advanced Runbook Usage (60 minutes)

### 4.1 Runbook Structure Review

**Every Runbook Contains:**
1. Alert Information (severity, threshold)
2. Symptoms (what you observe)
3. Diagnosis (step-by-step investigation)
4. Resolution (immediate + complete fix)
5. Verification (checklist)
6. Prevention (avoid recurrence)

### 4.2 When Runbook Doesn't Work

**Troubleshooting the Runbook:**

**Problem: Command fails with error**
```
Solution:
1. Read error message carefully
2. Check prerequisites (Is service running? Permissions correct?)
3. Try alternate approach (backup command if primary fails)
4. Document deviation and why
5. Update runbook after incident
```

**Problem: Symptoms don't match runbook**
```
Solution:
1. Re-assess diagnosis section
2. Check related runbooks (might be different root cause)
3. Search logs for specific error messages
4. Escalate if unable to identify issue within 15 min (P0) or 1 hour (P1)
```

**Problem: Fix doesn't resolve issue**
```
Solution:
1. Verify fix was applied correctly
2. Check for additional symptoms (cascade failure?)
3. Try alternative resolution steps
4. Escalate if repeated attempts fail
```

### 4.3 Multiple Simultaneous Alerts

**Alert Storm Handling:**

**Step 1: Identify Root Cause Alert**
```
Look for P0 alerts first, then P1
Example: Docker Daemon Down → causes Redis Down + PostgreSQL Down
Fix: Restart Docker Daemon (fixes all three)
```

**Step 2: Silence Derivative Alerts**
```bash
# Silence alerts caused by root issue
amtool silence add component="redis" \
  --duration=30m \
  --comment="Silenced due to Docker daemon outage - INC-123"
```

**Step 3: Focus on Root Cause**
```
Don't try to fix everything at once
Resolve root cause first, then verify derivative issues resolve automatically
```

**Practice Exercise:**
- Instructor triggers 5 simultaneous alerts
- Participant identifies root cause
- Participant silences derivatives
- Participant resolves root cause

---

## Module 5: Post-Incident Reviews (45 minutes)

### 5.1 PIR Requirements

**When Required:**
- All P0 incidents (mandatory)
- P1 incidents with user impact or >2 hour duration
- Any incident with data loss
- Security incidents (always)

**Timeline:**
- P0: Within 4 hours of resolution
- P1: Within 24 hours
- Complete and reviewed: Within 1 week

### 5.2 Writing Effective PIRs

**PIR Template Structure:**

```markdown
# Post-Incident Review: [Incident Name] - [Date]

## Timeline
- [HH:MM]: Alert fired
- [HH:MM]: On-call acknowledged
- [HH:MM]: Root cause identified
- [HH:MM]: Fix applied
- [HH:MM]: Incident resolved

## Root Cause
[Technical explanation using 5 Whys]

## Impact
- Duration: [X minutes]
- Affected: [Systems/Users]
- Data loss: [None/Details]
- Cost: [$X]

## Resolution
[What fixed it - immediate and permanent]

## Lessons Learned
**What Went Well:**
- [Item 1]
- [Item 2]

**What Didn't Go Well:**
- [Item 1]
- [Item 2]

## Action Items
1. [Action] - Owner: [Name] - Due: [Date]
2. [Action] - Owner: [Name] - Due: [Date]
```

### 5.3 PIR Writing Exercise

**Scenario:** Redis OOM kill incident (from earlier simulation)

**Task:** Write complete PIR including:
- Accurate timeline
- Root cause analysis (5 Whys)
- Impact assessment
- Action items with owners and dates

**Time:** 20 minutes
**Review:** Instructor provides feedback

### 5.4 Blameless Culture

**Core Principles:**
- Focus on systems, not individuals
- Assume good intent
- Learn from failures
- Create psychological safety

**What to Avoid:**
- ❌ "Engineer X didn't follow the runbook"
- ❌ "If they had checked logs, they would have seen..."
- ❌ "This could have been prevented if..."

**What to Say:**
- ✅ "Runbook was unclear about checking logs - we'll update it"
- ✅ "Monitoring gap - we didn't have alert for this condition"
- ✅ "Prevention: Add automated check to catch this earlier"

---

## Module 6: Practical Scenarios (45 minutes)

### Scenario 1: Cascading Failure (15 min)

**Situation:**
- 2:30 AM: Disk full alert
- 2:32 AM: PostgreSQL write failures
- 2:33 AM: Backup failure alert
- 2:35 AM: Redis persistence failure

**Your Response:**
[Participants work through scenario]

**Expected Approach:**
1. Identify root cause: Disk full
2. Free disk space (docker prune)
3. Verify PostgreSQL/Redis recover
4. Check backup status
5. Document cascade in PIR

---

### Scenario 2: Security Incident (15 min)

**Situation:**
- Alert: Unusual container spawn pattern
- 50 containers spawned in 2 minutes
- Unknown task IDs in database
- Possible unauthorized access

**Your Response:**
[Participants work through scenario]

**Expected Approach:**
1. Immediately escalate to security team
2. Stop all spawning (docker stop spawner)
3. Isolate affected containers
4. Document everything
5. Don't investigate alone (security team leads)

---

### Scenario 3: Unknown Alert (15 min)

**Situation:**
- Alert fires: "HighOrchestrationLatency"
- No runbook exists
- Symptoms unclear
- Grafana shows spike in latency

**Your Response:**
[Participants work through scenario]

**Expected Approach:**
1. Check Grafana for correlated metrics
2. Review orchestrator logs
3. Check for resource constraints (CPU/memory/disk)
4. Apply general troubleshooting (restart if safe)
5. Document findings for runbook creation
6. Escalate if unable to resolve in 30 min

---

## Final Assessment (30 minutes)

**Assessment Format:**
- 10 scenario-based questions
- Must score 8/10 to pass
- Retake available if needed

**Sample Questions:**

1. P0 alert fires at 3 AM. You're unsure how to proceed. What do you do?
   - A) Wait until morning
   - B) Escalate immediately to secondary
   - C) Try random fixes
   - D) Ignore it

2. You've been working on P1 for 1.5 hours with no progress. What do you do?
   - A) Keep trying for another hour
   - B) Escalate to manager now
   - C) Wait until 2 hour mark
   - D) Give up

3. During incident, you discover a new symptom not in runbook. You should:
   - A) Ignore it, stick to runbook
   - B) Document it for later
   - C) Stop and escalate
   - D) Update runbook immediately

[7 more questions...]

---

## Certification & Next Steps

**Certification Requirements:**
- ✓ Attended full training
- ✓ Passed scenarios (hands-on)
- ✓ Passed assessment (8/10)
- ✓ Completed PIR exercise

**Certificate:** Incident Response Certified

**Next Steps:**
1. Shadow on-call shift (recommended)
2. Review all 10 runbooks
3. Participate in monthly incident drills
4. Contribute to runbook improvements

---

## Resources

**Documentation:**
- Runbooks: `/mnt/wsl/.../docs/runbooks/`
- On-Call Procedures: `/mnt/wsl/.../docs/ON_CALL_PROCEDURES.md`
- Alerting Guide: `/mnt/wsl/.../docs/ALERTING_GUIDE.md`

**Support:**
- #cfn-oncall (Slack)
- PagerDuty escalation
- Manager phone number

**Continuous Learning:**
- Monthly incident response drills
- Quarterly runbook reviews
- Weekly on-call retrospectives

---

**Questions?**
Contact: training@company.com
