# Rollback Runbook: Integration Standardization System

## Quick Reference

**Decision Authority:** On-call Engineering Lead or Director
**Execution Authority:** DevOps Team Lead
**Estimated Duration:** 15-30 minutes
**Testing Duration:** 10-15 minutes

---

## Rollback Decision Criteria

### Automatic Rollback Triggers

| Condition | Duration | Action |
|-----------|----------|--------|
| Error rate > 1% | 5 minutes | Automatic rollback |
| P99 latency > 2x baseline | 10 minutes | Automatic rollback |
| Database connection pool exhaustion | 2 minutes | Automatic rollback |
| Coordination protocol failure rate > 5% | 5 minutes | Automatic rollback |
| Data corruption detected | Immediate | Emergency rollback |

### Manual Rollback Triggers

- Customer impact reported (confirmed by support)
- Data inconsistency detected (confirmed by data team)
- Security breach or compromise
- Failed dependency discovered
- Regulatory compliance violation

---

## Rollback Process

### Phase 1: Assessment (2-5 minutes)

**Step 1.1: Declare Incident**
```bash
# Notify on-call team
slack-notify "INCIDENT: Integration Standardization - Evaluating rollback"

# Page incident commander
pagerduty-page "incident-commander"

# Create incident ticket
incident-create --severity "SEV1" \
  --description "Integration rollback evaluation" \
  --owner "on-call-engineering-lead"
```

**Step 1.2: Verify Rollback Necessity**
```bash
# Check current metrics
curl -s http://prometheus:9090/api/v1/query?query='http_request_error_rate' | jq .

# Verify symptom persistence
sleep 30
curl -s http://prometheus:9090/api/v1/query?query='http_request_error_rate' | jq .

# Confirm with data team (if data issue)
data-team-check --validate-consistency

# Check dependencies
./scripts/health-check.sh --critical-only
```

**Step 1.3: Get Approval**
```bash
# Notify decision authority
slack-notify "@engineering-lead" "Rollback recommended. Awaiting approval."

# Wait for approval (max 5 minutes)
# Approval: @engineering-lead has approved rollback - proceeding
```

---

### Phase 2: Preparation (2-3 minutes)

**Step 2.1: Communicate Rollback**
```bash
# Update status page
status-page-update "Performing planned rollback of Integration Standardization"

# Notify customers
customer-notify --priority "high" \
  --message "We are performing maintenance. Expect 10-15 minute service interruption."

# Notify internal teams
slack-notify "#incident-response" "ROLLBACK INITIATED: Integration Standardization"
```

**Step 2.2: Prepare Rollback Environment**
```bash
# Backup current state for analysis
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
backup-service --backup-name "rollback_backup_${BACKUP_TIMESTAMP}"

# Verify backup succeeded
verify-backup --backup-name "rollback_backup_${BACKUP_TIMESTAMP}"

# Store rollback metadata
cat > /tmp/rollback_${BACKUP_TIMESTAMP}.txt << EOF
Timestamp: $BACKUP_TIMESTAMP
Backup ID: rollback_backup_${BACKUP_TIMESTAMP}
Trigger: [error_rate|latency|data_corruption|other]
Approver: $(whoami)
EOF
```

**Step 2.3: Verify Rollback Resources**
```bash
# Check disk space
df -h / | tail -1 | awk '{print "Root: " $5}'

# Verify database connectivity
pg_isready -h db.internal -p 5432

# Check Redis connectivity
redis-cli -h redis.internal PING

# Verify backup restoration path
ls -la /backups/previous/ | head -5
```

---

### Phase 3: Feature Flag Rollback (3-5 minutes)

**Step 3.1: Disable Integration Flags Sequentially**
```bash
# Disable all integration feature flags in production
curl -X POST http://feature-flag-service:8080/api/v1/flags/disable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FEATURE_FLAG_TOKEN" \
  -d '{
    "environment": "production",
    "flags": [
      "integration.database_service",
      "integration.coordination_protocol",
      "integration.artifact_storage",
      "integration.metrics_collection",
      "integration.logging_standardization",
      "integration.security_hardening",
      "integration.distributed_tracing"
    ],
    "reason": "Emergency rollback"
  }'

# Verify flags are disabled
curl -s http://feature-flag-service:8080/api/v1/flags/status \
  -H "Authorization: Bearer $FEATURE_FLAG_TOKEN" | jq '.flags[] | select(.environment=="production")'
```

**Step 3.2: Wait for Flag Propagation**
```bash
# Wait 30 seconds for flags to propagate
echo "Waiting for feature flags to propagate..."
sleep 30

# Verify no new requests using standardized system
curl -s http://metrics:9090/api/v1/query?query='integration_enabled_requests' | jq '.data.result'
```

---

### Phase 4: Deployment Rollback (5-10 minutes)

**Step 4.1: Rollback Kubernetes Deployment**
```bash
# Get current deployment status
kubectl get deployment -n production integration-standardized

# Trigger rollback
kubectl rollout undo deployment/integration-standardized \
  -n production \
  --to-revision=0

# Monitor rollback progress
kubectl rollout status deployment/integration-standardized \
  -n production \
  --timeout=5m

# Wait for all pods to be ready
kubectl wait --for=condition=Ready pod \
  -l app=integration-standardized \
  -n production \
  --timeout=5m
```

**Step 4.2: Verify Previous Version Running**
```bash
# Confirm deployment version
kubectl get deployment integration-standardized -n production -o jsonpath='{.spec.template.spec.containers[0].image}'

# Check pod status
kubectl get pods -n production -l app=integration-standardized

# Verify service endpoints
kubectl get endpoints integration-standardized -n production
```

---

### Phase 5: Database Rollback (2-5 minutes)

**Step 5.1: Assess Database State**
```bash
# Check for pending migrations
psql -h db.internal -U admin -d cfn << EOF
SELECT name, installed_on FROM schema_migrations ORDER BY installed_on DESC LIMIT 10;
EOF

# Check transaction log position
psql -h db.internal -U admin -d cfn << EOF
SELECT version();
SELECT pg_current_wal_lsn();
EOF
```

**Step 5.2: Revert to Previous Database Snapshot**
```bash
# Only if data corruption is confirmed
# CRITICAL: Requires approval from data team

# Create pre-rollback checkpoint
psql -h db.internal -U admin -d cfn << EOF
CREATE CHECKPOINT;
SELECT pg_current_wal_lsn();
EOF

# If point-in-time recovery needed:
# Follow your PITR procedure in docs/BACKUP_RESTORE_GUIDE.md
# psql-pitr --timestamp "$(date -d '30 minutes ago' '+%Y-%m-%d %H:%M:%S')"
```

**Step 5.3: Verify Data Consistency**
```bash
# Run consistency checks
psql -h db.internal -U admin -d cfn << EOF
-- Check for orphaned records
SELECT count(*) FROM integration_tasks WHERE parent_id NOT IN (SELECT id FROM jobs);
SELECT count(*) FROM skill_executions WHERE parent_id NOT IN (SELECT id FROM integration_tasks);

-- Verify foreign keys
ALTER TABLE integration_tasks VALIDATE CONSTRAINT fk_integration_tasks_jobs;
ALTER TABLE skill_executions VALIDATE CONSTRAINT fk_skill_executions_tasks;
EOF
```

---

### Phase 6: Verification (5-10 minutes)

**Step 6.1: Health Checks**
```bash
# Run comprehensive health checks
./scripts/health-check.sh --validate-all

# Expected output:
# ✓ Database connectivity
# ✓ Redis coordination
# ✓ API endpoints responding
# ✓ No error spikes
# ✓ Normal latency
```

**Step 6.2: Smoke Tests**
```bash
# Test critical integration points
./tests/smoke-tests.sh

# Expected:
# - All test suites pass
# - Integration latency < 5s
# - Error rate < 0.01%
```

**Step 6.3: Metrics Validation**
```bash
# Verify error rate dropped
curl -s http://prometheus:9090/api/v1/query?query='http_request_error_rate' | jq '.data.result[0].value'
# Expected: < 0.0001

# Verify latency normalized
curl -s http://prometheus:9090/api/v1/query?query='histogram_quantile(0.95,http_request_duration_seconds)' | jq '.data.result[0].value'
# Expected: < 2.0 (seconds)

# Verify deployment health
kubectl get pods -n production -l app=integration-standardized -o wide
# Expected: All Running, Ready: 1/1
```

**Step 6.4: Data Validation**
```bash
# Verify no data loss
psql -h db.internal -U admin -d cfn << EOF
SELECT count(*) as total_records FROM jobs;
SELECT count(*) as total_tasks FROM integration_tasks;
SELECT count(*) as total_skills FROM skill_executions;
EOF

# Compare with pre-rollback counts (stored in incident ticket)
# Difference should be minimal (< 10 records)
```

---

### Phase 7: Post-Rollback Verification (5 minutes)

**Step 7.1: Customer Impact Assessment**
```bash
# Check error logs for customer impact
tail -f /var/log/application.log | grep -i "customer\|error"

# Monitor support ticket queue
support-tickets --filter "integration" --limit 20

# Query customer feedback
zendesk-query --after "$(date -d '10 minutes ago' '+%Y-%m-%dT%H:%M:%SZ')"
```

**Step 7.2: System Stability**
```bash
# Monitor for 5 minutes
watch -n 5 'kubectl top pods -n production -l app=integration-standardized'

# Alert if any spikes
./scripts/health-check.sh --continuous --interval 30s
```

**Step 7.3: Update Incident Status**
```bash
# All checks passed, update incident
incident-update --status "mitigated" \
  --resolution "Rolled back Integration Standardization deployment"

# Schedule post-mortem
calendar-invite --meeting "Integration Rollback Postmortem" \
  --attendees "engineering-team,product,devops" \
  --time "next-business-day 2pm"
```

---

### Phase 8: Communication (2 minutes)

**Step 8.1: Customer Notification**
```bash
# Update status page
status-page-update --status "resolved" \
  --message "Integration Standardization has been rolled back to stable version. Service is normal."

# Customer notification email
customer-notify --priority "high" \
  --message "We have successfully completed maintenance and restored service. Thank you for your patience."
```

**Step 8.2: Team Communication**
```bash
# Post-incident summary
slack-post "#incident-response" << EOF
**INCIDENT RESOLVED: Integration Rollback**

Duration: [start_time] - [end_time]
Impact: Restored to stable version
Next Steps: Postmortem scheduled for [date/time]
EOF

# Notify leadership
slack-notify "@engineering-lead @cto" \
  "Integration Standardization rollback completed successfully. All systems nominal."
```

---

## Validation Checklist

Use this checklist to verify rollback success:

- [ ] Feature flags disabled in production
- [ ] Kubernetes deployment rolled back
- [ ] All pods ready and running
- [ ] Error rate < 0.01%
- [ ] P99 latency < 3 seconds
- [ ] Database connections normal
- [ ] Redis queue depth < 100
- [ ] Health checks passing
- [ ] Smoke tests passing
- [ ] No data loss detected
- [ ] Customer notifications sent
- [ ] Incident ticket updated
- [ ] Postmortem scheduled

---

## Rollback Failure Recovery

### If Rollback Fails

**Immediate Actions:**
```bash
# 1. Stop the rollback attempt
kubectl rollout undo deployment/integration-standardized \
  -n production --to-revision=CURRENT

# 2. Re-enable feature flags
curl -X POST http://feature-flag-service:8080/api/v1/flags/enable \
  -H "Authorization: Bearer $FEATURE_FLAG_TOKEN" \
  -d '{"environment": "production", "flags": ["all"]}'

# 3. Escalate to infrastructure team
pagerduty-page "infrastructure-team" --urgent
```

### Database Rollback Failure

**If Database Won't Revert:**
```bash
# Contact database team immediately
slack-notify "@database-team" "URGENT: Database rollback failed"

# Initiate manual recovery
psql -h db.internal -U admin -d cfn << EOF
-- Revert schema if needed
SELECT version();
-- DO NOT EXECUTE without explicit data team approval
EOF
```

---

## Post-Incident Activities

### Postmortem (Within 24 hours)
- [ ] Schedule and complete postmortem
- [ ] Identify root cause
- [ ] Document lessons learned
- [ ] Create follow-up action items

### Root Cause Analysis
- [ ] Why did the integration fail?
- [ ] Why wasn't it caught in testing?
- [ ] What preventive measures can we take?

### Prevention Measures
- [ ] Enhance pre-deployment testing
- [ ] Improve monitoring coverage
- [ ] Update feature flag strategy
- [ ] Strengthen canary validation

---

## Useful Commands Reference

```bash
# Check feature flag status
curl -s http://feature-flag-service:8080/api/v1/flags/status | jq .

# Get deployment revision history
kubectl rollout history deployment/integration-standardized -n production

# View pod logs
kubectl logs -n production -l app=integration-standardized --tail=100

# Database status
pg_isready -h db.internal -v

# Check Redis
redis-cli -h redis.internal CLIENT LIST

# Metrics query (Prometheus)
curl -s 'http://prometheus:9090/api/v1/query?query=QUERY'

# System resources
kubectl top nodes
kubectl top pods -n production
```

---

## Escalation Contacts

| Role | Contact | Response Time |
|------|---------|----------------|
| On-Call Engineer | PagerDuty | 5 minutes |
| Engineering Lead | Slack + Phone | 10 minutes |
| Director of Engineering | Emergency contact | 15 minutes |
| VP Engineering | CEO cascading | 30 minutes |

---

**Last Updated:** 2025-11-16
**Tested:** Yes
**Status:** Ready for Production
