# Incident Response Procedures

## Incident Severity Classification

### SEV1 - Critical (Immediate Response)

**Definition:** Production system is down or severely degraded with customer impact.

**Examples:**
- Complete system outage
- Data corruption or loss
- Security breach
- >50% of requests failing
- Cascading failure affecting multiple services

**Response Time:** 5 minutes
**Escalation:** All hands, page entire on-call team
**Communication:** Every 15 minutes

**Initial Response Checklist:**
- [ ] Declare SEV1 incident in Slack and PagerDuty
- [ ] Page incident commander
- [ ] Page on-call engineering lead
- [ ] Page DevOps team
- [ ] Open war room (Zoom)
- [ ] Begin status page updates
- [ ] Notify customers

### SEV2 - High (1 Hour Response)

**Definition:** Significant service degradation or partial outage with customer impact.

**Examples:**
- 10-50% of requests failing
- Major feature unavailable
- Significant latency increase (>2x baseline)
- Database performance degradation
- Coordination protocol issues

**Response Time:** 15 minutes
**Escalation:** On-call team + engineering manager
**Communication:** Every 30 minutes

**Initial Response Checklist:**
- [ ] Declare SEV2 incident
- [ ] Page on-call engineer
- [ ] Notify engineering manager
- [ ] Open incident ticket
- [ ] Begin initial assessment

### SEV3 - Medium (4 Hour Response)

**Definition:** Minor service degradation with limited customer impact.

**Examples:**
- <10% of requests failing
- Non-critical feature issue
- Elevated latency (1-2x baseline)
- Monitoring/logging delays
- Minor data inconsistency

**Response Time:** 1 hour
**Escalation:** On-call engineer + team lead
**Communication:** Status updates every 2 hours

### SEV4 - Low (Best Effort)

**Definition:** Cosmetic issues or non-urgent bugs.

**Examples:**
- UI glitches
- Documentation errors
- Non-critical feature requests
- Performance improvements

**Response Time:** Next business day
**Escalation:** Team lead reviews and prioritizes
**Communication:** Daily updates

---

## Incident Response Workflow

### Phase 1: Declare (5 minutes)

**Step 1.1: Determine Severity**

Use the severity classification above. When in doubt, escalate.

**Step 1.2: Notify Team**

```bash
# Create incident in PagerDuty
pagerduty-incident --severity "SEV2" \
  --title "Integration Standardization - High Error Rate" \
  --body "Error rate exceeded 1% threshold"

# Notify in Slack
slack-notify "#incident-response" \
  ":alert: **SEV2 INCIDENT**: Integration Standardization
  Error rate: 2.5%
  Started: $(date)
  Commander: @on-call-engineer"

# Page on-call
pagerduty-page "on-call-engineer"
```

**Step 1.3: Open War Room**

```bash
# Start incident war room
zoom-room --start "Integration Incident Response"

# Share room URL
slack-notify "#incident-response" \
  "War room: [Zoom URL]"
```

---

### Phase 2: Assess (10 minutes)

**Step 2.1: Gather Metrics**

```bash
# Check error rate
curl -s http://prometheus:9090/api/v1/query?query='http_request_error_rate'

# Check latency
curl -s http://prometheus:9090/api/v1/query?query='http_request_duration_seconds'

# Check services
./scripts/health-check.sh

# Recent deployments
kubectl rollout history deployment/integration-standardized -n production
```

**Step 2.2: Identify Affected Components**

```bash
# Check logs for errors
kubectl logs -n production -l app=integration-standardized --tail=100

# Check for database issues
psql -h db.internal -U admin -d cfn -c "SELECT * FROM pg_stat_activity WHERE state != 'idle';"

# Check Redis
redis-cli -h redis.internal INFO stats
```

**Step 2.3: Determine Scope**

- Which services are affected?
- How many customers are impacted?
- Is data at risk?
- Are other systems cascading?

---

### Phase 3: Respond (Ongoing)

**Step 3.1: For Application Errors (>1% error rate)**

```bash
# Check recent changes
git log --oneline -10

# Check deployment status
kubectl describe deployment integration-standardized -n production

# Check logs for stack traces
kubectl logs -n production -l app=integration-standardized | grep -i error

# Potential Actions:
# 1. Revert recent deployment: kubectl rollout undo deployment/integration-standardized
# 2. Scale down replicas if cascading: kubectl scale deployment/integration-standardized --replicas=1
# 3. Enable feature flag rollback if applicable
```

**Step 3.2: For Latency Issues (>2x baseline)**

```bash
# Check slow query logs
psql -h db.internal -U admin -d cfn << EOF
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;
EOF

# Check connection pool
curl -s http://prometheus:9090/api/v1/query?query='pg_stat_activity_count'

# Potential Actions:
# 1. Increase connection pool size temporarily
# 2. Kill long-running queries: SELECT pg_terminate_backend(pid) FROM ...
# 3. Scale up service: kubectl scale deployment/integration-standardized --replicas=5
# 4. Check for queue backlog: redis-cli LLEN coordination:queue
```

**Step 3.3: For Database Issues**

```bash
# Check replication status
psql -h db.internal -U admin -d cfn -c "SELECT * FROM pg_stat_replication;"

# Check for locks
psql -h db.internal -U admin -d cfn -c "SELECT * FROM pg_locks WHERE NOT granted;"

# Monitor connections
watch 'psql -h db.internal -U admin -d cfn -c "SELECT count(*) FROM pg_stat_activity;"'

# Potential Actions:
# 1. Scale read replicas
# 2. Kill idle connections
# 3. Failover to replica if primary is down
```

**Step 3.4: For Coordination Issues**

```bash
# Check Redis memory
redis-cli -h redis.internal INFO memory

# Check queue depth
redis-cli -h redis.internal LLEN coordination:queue

# Check for connection issues
redis-cli -h redis.internal CLIENT LIST

# Potential Actions:
# 1. Restart Redis: sudo systemctl restart redis-server
# 2. Clear old messages: redis-cli LTRIM coordination:queue 0 10000
# 3. Switch to fallback mode (disable coordination protocol flag)
```

**Step 3.5: Update Status**

```bash
# Every 15 minutes (SEV1) or 30 minutes (SEV2):
status-page-update \
  --status "investigating" \
  --message "We are investigating higher than normal error rates. Details: [link]"

# Slack update
slack-notify "#incident-response" \
  "**Update**: Error rate now 1.2% (was 2.5%)
  Working on: Database connection pool investigation
  ETA: 15 minutes"
```

---

### Phase 4: Resolve (Variable)

**Step 4.1: Implement Fix**

The fix depends on root cause:

- **Code bug:** Deploy fix → test → rollout (10-30 min)
- **Resource exhaustion:** Scale up resources (5-10 min)
- **Database issue:** Failover or optimize (10-20 min)
- **Coordination issue:** Restart service or failover (5-15 min)

**Step 4.2: Validate Fix**

```bash
# Run health checks
./scripts/health-check.sh --validate-all

# Monitor metrics for 5 minutes
watch -n 5 'curl -s http://prometheus:9090/api/v1/query?query="http_request_error_rate" | jq'

# Check for cascading issues
kubectl describe nodes
kubectl top nodes
```

**Step 4.3: Declare Resolution**

```bash
# Update incident status
incident-update --status "resolved" \
  --resolution "Deployed database connection pool optimization"

# Update status page
status-page-update --status "resolved" \
  --message "Issue resolved. Service is normal."

# Notify team
slack-notify "#incident-response" \
  ":white_check_mark: **INCIDENT RESOLVED**
  Root Cause: Database connection pool exhaustion
  Fix: Optimized connection parameters
  Duration: 45 minutes"
```

---

## Communication Templates

### Initial Notification (SEV1/SEV2)

```
:alert: **[SEVERITY] INCIDENT**: [Service Name]

**What's Happening:**
[Brief description of issue and impact]

**Affected Systems:**
- [Service 1]
- [Service 2]

**Customer Impact:**
[% of requests affected, affected regions, etc.]

**Commander:** @[on-call-engineer]
**War Room:** [Zoom Link]
**Runbook:** [Link to relevant runbook]

Updates every 15 minutes.
```

### Status Update

```
**Update at [Time]**

**Status:** [Investigating | Mitigating | Monitoring | Resolved]

**Current Metrics:**
- Error Rate: [X%]
- Latency P99: [Xms]
- Affected Customers: [X%]

**Actions Taken:**
- [Action 1]
- [Action 2]

**Next Steps:**
- [Next action]

**ETA:** [Time estimate]
```

### Resolution Notification

```
:white_check_mark: **INCIDENT RESOLVED**

**Duration:** [Start time] - [End time] ([Duration])

**Root Cause:**
[Clear explanation]

**Resolution:**
[What was done to fix]

**Impact:**
[Data loss? No. Customer complaints? Yes, X tickets. Revenue impact? Estimated $X]

**Prevention:**
[What we'll do to prevent in future]

**Postmortem:** Scheduled for [Date/Time]
```

---

## Postmortem Template

**To be completed within 24 hours of resolution**

```markdown
# Postmortem: [Incident Title]

## Incident Overview
- **Date:** [Date]
- **Duration:** [Start time] - [End time] ([Duration])
- **Severity:** [SEV1/2/3/4]
- **Commander:** [Name]
- **Attendees:** [Names]

## Timeline
- **[Time]** - Issue detected via [alert/customer report/health check]
- **[Time]** - Root cause identified as [cause]
- **[Time]** - Mitigation action taken: [action]
- **[Time]** - System recovered
- **[Time]** - Service back to normal

## Root Cause Analysis
[Detailed explanation of what went wrong]

## Contributing Factors
- [Factor 1]
- [Factor 2]

## What Went Well
- [Good response]
- [Good process]

## What We Could Improve
- [Area 1]
- [Area 2]

## Action Items
- [ ] [Action] (Owner: @[name], Due: [date])
- [ ] [Action] (Owner: @[name], Due: [date])

## Lessons Learned
- [Learning 1]
- [Learning 2]
```

---

## Escalation Procedures

### SEV1/SEV2 Escalation Path

1. **On-call Engineer** (L1)
   - Detect incident
   - Page incident commander
   - Begin initial response
   - Response time: 5-15 minutes

2. **Incident Commander** (L2)
   - Take command of incident
   - Coordinate response
   - Make key decisions
   - Response time: 10-15 minutes

3. **Engineering Manager** (L3)
   - Coordinate across teams
   - Allocate additional resources
   - Response time: 15-30 minutes

4. **Director of Engineering** (L4)
   - Executive oversight
   - Customer communication
   - Response time: 30 minutes

5. **VP Engineering/CTO** (L5)
   - Strategic decisions
   - Business decisions
   - Response time: 30-60 minutes

---

## Critical Incident Procedures

### When to Declare Critical Incident

- Production system down >5 minutes
- Data loss or corruption
- Security breach
- Revenue-impacting issue
- Customer escalation to C-level

### Critical Incident Actions

1. **Immediate:** Page VP Engineering, CTO
2. **Within 5 min:** War room established, status page updated
3. **Within 15 min:** Customer communication sent
4. **Every 15 min:** Status updates to leadership
5. **Every 30 min:** Public status page updates

---

## Prevention and Monitoring

### Preventing Future Incidents

- Enhanced testing (unit, integration, E2E)
- Load testing before deployments
- Feature flag rollout procedures
- Chaos engineering exercises
- Regular postmortems

### Monitoring and Alerting

- Error rate > 0.1%: Warning
- Error rate > 1%: Critical (auto-escalate)
- Latency 1.5x-2x baseline: Warning
- Latency >2x baseline: Critical
- Database connection pool > 85%: Warning
- Connection pool > 95%: Critical (auto-rollback)

---

## Useful Commands

```bash
# Quick metrics check
curl -s http://prometheus:9090/api/v1/query?query='http_request_error_rate'

# View recent logs
kubectl logs -n production -l app=integration-standardized --tail=50 -f

# Check Kubernetes status
kubectl get pods -n production
kubectl describe pod [pod-name] -n production

# Database queries
psql -h db.internal -U admin -d cfn
  SELECT * FROM pg_stat_activity;
  SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC;

# Redis commands
redis-cli -h redis.internal
  LLEN coordination:queue
  INFO memory
  CLIENT LIST

# Health check
./scripts/health-check.sh --validate-all

# Deployment status
kubectl rollout status deployment/integration-standardized -n production
kubectl get events -n production --sort-by='.lastTimestamp'
```

---

## Contacts

| Role | Name | Phone | Slack |
|------|------|-------|-------|
| On-Call Lead | [Auto-rotation via PagerDuty] | [PagerDuty] | @on-call-engineer |
| Engineering Manager | [Team manager] | [Number] | @[slack-handle] |
| DevOps Lead | [Lead name] | [Number] | @[slack-handle] |
| Database Team | [Team] | [Channel] | #database-team |
| Product | [PM name] | [Number] | @[slack-handle] |
| Customer Support | [Team] | [Channel] | #support-escalation |

---

**Last Updated:** 2025-11-16
**Reviewed By:** Engineering Leadership
**Next Review:** 2025-12-16
