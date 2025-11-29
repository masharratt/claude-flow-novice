# CFN Loop Disaster Recovery Procedures

**Version**: 1.0.0
**Last Updated**: 2025-11-29
**Classification**: Internal - Confidential

**Purpose**: Detailed recovery procedures for disaster scenarios affecting CFN Loop production systems.

---

## Table of Contents

1. [Overview](#overview)
2. [Disaster Scenario 1: PostgreSQL Database Loss](#disaster-scenario-1-postgresql-database-loss)
3. [Disaster Scenario 2: RuVector Cluster Failure](#disaster-scenario-2-ruvector-cluster-failure)
4. [Disaster Scenario 3: Total Coordinator Failure](#disaster-scenario-3-total-coordinator-failure)
5. [Disaster Scenario 4: Provider API Outage](#disaster-scenario-4-provider-api-outage)
6. [Disaster Scenario 5: Kubernetes Cluster Failure](#disaster-scenario-5-kubernetes-cluster-failure)
7. [Recovery Testing](#recovery-testing)
8. [Backup Verification](#backup-verification)

---

## Overview

### Disaster Classification

| Severity | Impact | RTO | RPO | Escalation |
|----------|--------|-----|-----|------------|
| **P0 Critical** | Complete system down | 1 hour | 5 minutes | Immediate (CTO) |
| **P1 High** | Major component down | 2 hours | 1 hour | Within 15 min |
| **P2 Medium** | Degraded performance | 4 hours | 6 hours | Within 1 hour |
| **P3 Low** | Minor feature unavailable | 24 hours | 24 hours | Next business day |

### Recovery Principles

1. **Safety First**: Never risk data integrity for speed
2. **Communication**: Keep stakeholders informed (status page, Slack)
3. **Documentation**: Log all actions during recovery
4. **Verification**: Test restored system before declaring recovery complete
5. **Post-Mortem**: Always conduct root cause analysis within 48 hours

---

## Disaster Scenario 1: PostgreSQL Database Loss

**Severity**: P0 Critical
**Impact**: All Trigger.dev metadata lost, system non-functional
**RTO**: 2 hours
**RPO**: 5 minutes (with WAL archiving) or 24 hours (daily backup)

### Pre-Disaster Preparation

**Required Backups**:
- Daily full backup to S3 (automated via CronJob)
- Continuous WAL archiving to S3 (streaming replication)
- Point-in-time recovery enabled

**Backup Locations**:
- Primary: S3 bucket `s3://cfn-backups-prod/postgres/`
- Secondary: Off-region S3 bucket `s3://cfn-backups-dr/postgres/`

**Verification**:
```bash
# Verify latest backup exists
aws s3 ls s3://cfn-backups-prod/postgres/ --recursive | sort | tail -5

# Verify WAL archiving is active
kubectl exec -it postgres-0 -- psql -U postgres -c \
  "SELECT pg_is_in_recovery(), pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();"
```

### Recovery Steps

#### Step 1: Assess Damage (5 minutes)

```bash
# Check PostgreSQL pod status
kubectl get pods -l app=postgres -n production

# Check persistent volume
kubectl get pv | grep postgres

# Attempt connection test
kubectl exec -it postgres-0 -- psql -U postgres -c "SELECT 1;"
```

**Decision Point**:
- If pod is down but data intact → Restart pod (skip to Step 6)
- If data corrupted or volume lost → Proceed with full restore

#### Step 2: Provision New Database (15 minutes)

```bash
# Scale down coordinator to prevent writes
kubectl scale deployment cfn-coordinator --replicas=0 -n production

# Delete corrupted PostgreSQL deployment
kubectl delete deployment postgres -n production

# Provision new PostgreSQL instance
kubectl apply -f k8s/postgres-fresh-install.yaml

# Wait for pod to be ready
kubectl wait --for=condition=ready pod -l app=postgres --timeout=300s
```

#### Step 3: Restore from Backup (30-60 minutes)

**Option A: Full Backup Restore (RPO: 24 hours)**

```bash
# Download latest backup from S3
LATEST_BACKUP=$(aws s3 ls s3://cfn-backups-prod/postgres/ | sort | tail -1 | awk '{print $4}')
aws s3 cp "s3://cfn-backups-prod/postgres/$LATEST_BACKUP" /tmp/postgres-backup.sql.gz

# Decompress
gunzip /tmp/postgres-backup.sql.gz

# Copy backup to pod
kubectl cp /tmp/postgres-backup.sql postgres-0:/tmp/restore.sql

# Restore database
kubectl exec -it postgres-0 -- psql -U postgres -f /tmp/restore.sql

# Verify restore
kubectl exec -it postgres-0 -- psql -U postgres -c \
  "SELECT count(*) FROM \"RuntimeEnvironment\";"
```

**Option B: Point-in-Time Recovery (RPO: 5 minutes)**

```bash
# Restore base backup
kubectl exec -it postgres-0 -- bash -c "
  aws s3 sync s3://cfn-backups-prod/postgres/base /var/lib/postgresql/data/
"

# Configure recovery
kubectl exec -it postgres-0 -- bash -c "
  cat > /var/lib/postgresql/data/recovery.conf <<EOF
restore_command = 'aws s3 cp s3://cfn-backups-prod/postgres/wal/%f %p'
recovery_target_time = '$(date -u -d '5 minutes ago' '+%Y-%m-%d %H:%M:%S')'
EOF
"

# Start recovery
kubectl exec -it postgres-0 -- pg_ctl restart -D /var/lib/postgresql/data

# Monitor recovery progress
kubectl exec -it postgres-0 -- tail -f /var/lib/postgresql/data/log/postgresql.log
```

#### Step 4: Verify Data Integrity (10 minutes)

```bash
# Check table row counts
kubectl exec -it postgres-0 -- psql -U postgres -c "
  SELECT
    schemaname,
    tablename,
    n_live_tup AS row_count
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;
"

# Verify foreign key constraints
kubectl exec -it postgres-0 -- psql -U postgres -c "
  SELECT conname, conrelid::regclass
  FROM pg_constraint
  WHERE contype = 'f';
"

# Run data validation queries
kubectl exec -it postgres-0 -- psql -U postgres -c "
  SELECT COUNT(*) FROM \"RuntimeEnvironment\" WHERE \"apiKey\" IS NULL;
"
# Should return 0 (no null API keys)
```

#### Step 5: Update Coordinator Configuration (5 minutes)

```bash
# Update connection string if needed
kubectl create secret generic postgres-credentials \
  --from-literal=url="postgresql://postgres:$PASSWORD@postgres:5432/main" \
  --dry-run=client -o yaml | kubectl apply -f -

# Verify secret
kubectl get secret postgres-credentials -o jsonpath='{.data.url}' | base64 -d
```

#### Step 6: Restart Coordinator (10 minutes)

```bash
# Scale up coordinator
kubectl scale deployment cfn-coordinator --replicas=3 -n production

# Monitor startup
kubectl get pods -l app=cfn-coordinator -w

# Check logs for database connection
kubectl logs -l app=cfn-coordinator | grep -i postgres
```

#### Step 7: Run Smoke Tests (15 minutes)

```bash
# Test database connectivity
curl -X POST http://cfn-coordinator:8080/health/ready | jq .

# Trigger test task
curl -X POST "http://localhost:8030/api/v1/tasks/hello-world/trigger" \
  -H "Authorization: Bearer $TRIGGER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "outputDir": "/tmp/recovery-test",
      "language": "en",
      "greeting": "Recovery test",
      "progLang": "typescript",
      "extension": "ts",
      "agentType": "recovery-test"
    }
  }'

# Verify task completes
# Expected: Task completes successfully within 2 minutes
```

#### Step 8: Declare Recovery Complete (5 minutes)

**Checklist**:
- [ ] PostgreSQL pod running (3/3 ready)
- [ ] Coordinator pods running (3/3 ready)
- [ ] Smoke tests passed (100%)
- [ ] Data integrity verified (row counts match expected)
- [ ] WAL archiving re-enabled
- [ ] Monitoring dashboards green

**Communication**:
```
[STATUS UPDATE] PostgreSQL recovery COMPLETE
- Restored from: [backup timestamp]
- Data loss: [X minutes/hours]
- All systems operational
- Next steps: Post-mortem scheduled for [datetime]
```

### Post-Recovery Actions

1. **Root Cause Analysis**: Identify why database failed
2. **Backup Validation**: Test restore from secondary backup
3. **Update Runbook**: Document any deviations from this procedure
4. **Alerting Review**: Ensure alerts fired appropriately
5. **Backup Retention**: Extend retention for this backup (disaster evidence)

---

## Disaster Scenario 2: RuVector Cluster Failure

**Severity**: P1 High
**Impact**: Learning disabled, RAG unavailable, system degraded
**RTO**: 1 hour
**RPO**: 6 hours (backup every 6 hours)

### Pre-Disaster Preparation

**Required Backups**:
- Collection exports every 6 hours to S3
- Vector indices and metadata included
- Backup size: ~5GB per backup

**Graceful Degradation**:
- Coordinator continues without RuVector (Phase 4 skipped)
- RAG search returns empty results → uses default prompts
- Captures buffered in memory (up to 1000 entries)

### Recovery Steps

#### Step 1: Assess Damage (5 minutes)

```bash
# Check RuVector pods
kubectl get pods -l app=ruvector -n production

# Check RuVector health
curl -v http://ruvector:8000/health

# Check collections
curl http://ruvector:8000/collections | jq .
```

**Decision Point**:
- If pod is down but data intact → Restart pod
- If collections corrupted → Restore from backup
- If total cluster loss → Full rebuild

#### Step 2: Provision New RuVector Cluster (15 minutes)

```bash
# Delete corrupted RuVector deployment
kubectl delete deployment ruvector -n production
kubectl delete pvc ruvector-data -n production

# Provision new cluster
kubectl apply -f k8s/ruvector-fresh-install.yaml

# Wait for pods ready
kubectl wait --for=condition=ready pod -l app=ruvector --timeout=300s
```

#### Step 3: Restore Collections from Backup (20-30 minutes)

```bash
# Download latest backup
LATEST_BACKUP=$(aws s3 ls s3://cfn-backups-prod/ruvector/ | sort | tail -1 | awk '{print $4}')
aws s3 cp "s3://cfn-backups-prod/ruvector/$LATEST_BACKUP" /tmp/ruvector-backup.tar.gz

# Extract backup
tar -xzf /tmp/ruvector-backup.tar.gz -C /tmp/ruvector-restore/

# Restore each collection
for collection in decomposition_plans validation_results error_patterns decision_history code_artifacts; do
  echo "Restoring collection: $collection"

  curl -X POST http://ruvector:8000/admin/restore \
    -H "Authorization: Bearer $RUVECTOR_ADMIN_TOKEN" \
    -F "collection=$collection" \
    -F "data=@/tmp/ruvector-restore/${collection}.json"
done

# Verify collection counts
curl http://ruvector:8000/collections | jq '.[] | {name, document_count}'
```

#### Step 4: Rebuild Vector Indices (10 minutes)

```bash
# Trigger index rebuild
curl -X POST http://ruvector:8000/admin/reindex \
  -H "Authorization: Bearer $RUVECTOR_ADMIN_TOKEN" \
  -d '{"collections": ["all"]}'

# Monitor reindex progress
watch "curl -s http://ruvector:8000/admin/reindex/status | jq ."

# Verify index health
curl http://ruvector:8000/admin/indices | jq '.[] | {collection, status, size_mb}'
```

#### Step 5: Test RAG Search (5 minutes)

```bash
# Test similarity search
curl -X POST http://ruvector:8000/search \
  -H "Content-Type: application/json" \
  -d '{
    "collection": "decomposition_plans",
    "query": "implement authentication",
    "limit": 5
  }' | jq .

# Expected: Returns 5 similar decomposition plans
```

#### Step 6: Re-enable Learning Hooks (5 minutes)

```bash
# Verify coordinator can write to RuVector
curl -X POST http://ruvector:8000/test-write \
  -H "Authorization: Bearer $RUVECTOR_ADMIN_TOKEN" \
  -d '{"collection": "decomposition_plans", "test": true}'

# Restart coordinator to flush buffered captures
kubectl rollout restart deployment cfn-coordinator
```

#### Step 7: Declare Recovery Complete (5 minutes)

**Checklist**:
- [ ] RuVector pods running (2/2 ready)
- [ ] All 5 collections restored
- [ ] Vector indices rebuilt
- [ ] RAG search functional
- [ ] Learning hooks re-enabled

### Post-Recovery Actions

1. **Data Loss Assessment**: Compare collection counts before/after
2. **Backlog Replay**: Replay buffered captures (if any)
3. **Backup Frequency**: Consider increasing to every 3 hours
4. **Redundancy**: Evaluate multi-region replication

---

## Disaster Scenario 3: Total Coordinator Failure

**Severity**: P1 High
**Impact**: New tasks cannot start, existing tasks may hang
**RTO**: 30 minutes
**RPO**: N/A (stateless)

### Recovery Steps

#### Step 1: Diagnose Failure Mode (5 minutes)

```bash
# Check pod status
kubectl get pods -l app=cfn-coordinator -n production

# Check recent events
kubectl get events --sort-by='.lastTimestamp' | grep coordinator

# Check logs from crashed pod
kubectl logs -l app=cfn-coordinator --previous --tail=100
```

**Common Failure Modes**:
- CrashLoopBackOff → Config error or missing dependency
- ImagePullBackOff → Registry issue or wrong image tag
- OOMKilled → Memory limit too low
- Error → Application error or unhandled exception

#### Step 2: Fix Root Cause (10 minutes)

**If missing environment variable**:
```bash
kubectl set env deployment/cfn-coordinator \
  MISSING_VAR=value
```

**If invalid API key**:
```bash
kubectl create secret generic cerebras-api-key \
  --from-literal=api-key=$NEW_KEY \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment cfn-coordinator
```

**If dependency unavailable** (e.g., RuVector):
```bash
# Check dependency health
curl http://ruvector:8000/health

# If down, recover dependency first (see Scenario 2)
```

**If memory limit too low**:
```bash
kubectl patch deployment cfn-coordinator -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"coordinator","resources":{"limits":{"memory":"8Gi"}}}]}}}}'
```

#### Step 3: Restart Coordinator (5 minutes)

```bash
# Delete crashlooping pods (will be recreated)
kubectl delete pods -l app=cfn-coordinator

# Monitor new pods
kubectl get pods -l app=cfn-coordinator -w

# Verify startup
kubectl logs -l app=cfn-coordinator --tail=50 | grep "Coordinator started"
```

#### Step 4: Verify Health (5 minutes)

```bash
# Check liveness
curl http://cfn-coordinator:8080/health/live | jq .

# Check readiness
curl http://cfn-coordinator:8080/health/ready | jq .

# Expected: Both return {"status": "healthy"}
```

#### Step 5: Resume Queue Processing (5 minutes)

```bash
# Check for stuck tasks in queue
kubectl exec -it redis-0 -- redis-cli LLEN task:queue

# If tasks exist, verify coordinator is processing them
kubectl logs -l app=cfn-coordinator | grep "Processing task"

# Monitor queue draining
watch "kubectl exec -it redis-0 -- redis-cli LLEN task:queue"
```

### Post-Recovery Actions

1. **Log Analysis**: Identify why coordinator crashed
2. **Configuration Review**: Validate all environment variables
3. **Resource Tuning**: Adjust memory/CPU limits if needed
4. **Alerting**: Ensure crash alerts fired appropriately

---

## Disaster Scenario 4: Provider API Outage

**Severity**: P2 Medium (if multi-provider) or P1 High (if single provider)
**Impact**: Decomposers or validators fail, tasks hang
**RTO**: 10 minutes (provider failover)
**RPO**: N/A

### Recovery Steps

#### Step 1: Confirm Outage (2 minutes)

```bash
# Check provider status pages
# Cerebras: https://status.cerebras.ai
# Anthropic: https://status.anthropic.com

# Test API directly
curl -X POST https://api.cerebras.ai/v1/chat/completions \
  -H "Authorization: Bearer $CEREBRAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.1-8b","messages":[{"role":"user","content":"test"}]}'

# Check coordinator logs
kubectl logs -l app=cfn-coordinator | grep -i "cerebras\|anthropic\|timeout"
```

**Decision Point**:
- If confirmed outage → Failover to backup provider
- If rate limited → Reduce concurrency or wait
- If API key invalid → Rotate key

#### Step 2: Failover to Backup Provider (3 minutes)

```bash
# Update coordinator to use Anthropic
kubectl set env deployment/cfn-coordinator \
  DEFAULT_PROVIDER=anthropic

# Restart coordinator (optional - env change triggers rolling restart)
kubectl rollout status deployment cfn-coordinator
```

**Provider Priority**:
1. Primary: Cerebras (cost-optimized)
2. Secondary: Anthropic (quality)
3. Tertiary: OpenRouter (fallback)

#### Step 3: Verify Tasks Resume (5 minutes)

```bash
# Trigger test task
curl -X POST "http://localhost:8030/api/v1/tasks/hello-world/trigger" \
  -H "Authorization: Bearer $TRIGGER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payload": {...}}'

# Check logs for provider usage
kubectl logs -l app=cfn-coordinator | grep "Using provider: anthropic"

# Monitor task completion
kubectl logs -l app=cfn-coordinator | grep "Task completed"
```

#### Step 4: Monitor Costs (Ongoing)

```bash
# Anthropic is more expensive than Cerebras
# Monitor API usage in provider dashboards
# Set budget alerts if extended outage

# Expected cost increase: 3-5x for Anthropic vs Cerebras
```

#### Step 5: Failback to Primary (When Available)

```bash
# Verify Cerebras API restored
curl -X POST https://api.cerebras.ai/v1/chat/completions \
  -H "Authorization: Bearer $CEREBRAS_API_KEY" \
  -d '{"model":"llama3.1-8b","messages":[{"role":"user","content":"test"}]}'

# Switch back to Cerebras
kubectl set env deployment/cfn-coordinator \
  DEFAULT_PROVIDER=cerebras

# Verify failback
kubectl logs -l app=cfn-coordinator | grep "Using provider: cerebras"
```

### Post-Recovery Actions

1. **Cost Analysis**: Calculate cost impact of outage
2. **Multi-Provider Logic**: Implement automatic failover (Phase 6 enhancement)
3. **SLA Review**: Check provider SLA credits if applicable
4. **Diversity**: Consider using multiple providers in parallel (advanced)

---

## Disaster Scenario 5: Kubernetes Cluster Failure

**Severity**: P0 Critical
**Impact**: Entire system down
**RTO**: 4 hours
**RPO**: 24 hours (daily backups)

### Pre-Disaster Preparation

**Required Infrastructure-as-Code**:
- Terraform modules for cluster provisioning
- Helm charts for all services
- Persistent volume snapshots (daily)
- DNS failover to secondary cluster (if multi-cluster)

### Recovery Steps

#### Step 1: Assess Damage (10 minutes)

```bash
# Try to access cluster
kubectl cluster-info

# Check cloud provider console
# AWS: CloudWatch, EC2 dashboard
# GCP: Cloud Console, GKE dashboard

# Determine if recoverable or need new cluster
```

**Decision Point**:
- If nodes down but cluster intact → Restart nodes
- If cluster corrupted → Provision new cluster

#### Step 2: Provision New Cluster (60 minutes)

```bash
# Using Terraform (assumes IaC in place)
cd terraform/kubernetes-cluster/
terraform apply -var="cluster_name=cfn-prod-recovery" -auto-approve

# Wait for cluster ready
terraform output kubeconfig > ~/.kube/config-recovery
export KUBECONFIG=~/.kube/config-recovery

kubectl get nodes
# Expected: 5 nodes Ready
```

#### Step 3: Restore Persistent Volumes (30 minutes)

```bash
# Restore PostgreSQL volume from snapshot
aws ec2 create-volume \
  --snapshot-id snap-postgres-20251129 \
  --availability-zone us-east-1a \
  --volume-type gp3

# Restore RuVector volume from snapshot
aws ec2 create-volume \
  --snapshot-id snap-ruvector-20251129 \
  --availability-zone us-east-1a \
  --volume-type gp3

# Create PersistentVolumes pointing to restored volumes
kubectl apply -f k8s/pv-postgres-restored.yaml
kubectl apply -f k8s/pv-ruvector-restored.yaml
```

#### Step 4: Deploy All Services (45 minutes)

```bash
# Deploy via Helm charts
helm install postgres ./charts/postgres --namespace production
helm install ruvector ./charts/ruvector --namespace production
helm install redis ./charts/redis --namespace production
helm install cfn-coordinator ./charts/cfn-coordinator --namespace production

# Wait for all pods ready
kubectl wait --for=condition=ready pod --all -n production --timeout=600s
```

#### Step 5: Restore Database (if needed) (30 minutes)

```bash
# If volume restore failed, restore from backup (see Scenario 1)
```

#### Step 6: Restore RuVector (if needed) (30 minutes)

```bash
# If volume restore failed, restore from backup (see Scenario 2)
```

#### Step 7: Verify End-to-End (15 minutes)

```bash
# Run full smoke test suite
npm run test:smoke -- --env=recovery

# Verify all phases work
# - Phase 1: RuVector connection
# - Phase 2: Decomposition
# - Phase 3: Validation
# - Phase 4: Learning capture
# - Phase 5: Troubleshooting
```

#### Step 8: Update DNS (10 minutes)

```bash
# Update DNS to point to new cluster
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch file://dns-update.json

# Wait for DNS propagation
dig cfn.example.com +short
# Expected: New cluster IP
```

#### Step 9: Decommission Old Cluster (After 24 hours)

```bash
# Only after verifying new cluster stable
cd terraform/kubernetes-cluster-old/
terraform destroy -auto-approve
```

### Post-Recovery Actions

1. **Full Post-Mortem**: Why did cluster fail?
2. **Multi-Cluster**: Evaluate active-passive deployment
3. **Backup Testing**: Quarterly full recovery drills
4. **Monitoring**: Enhanced cluster health monitoring

---

## Recovery Testing

### Quarterly Recovery Drill

**Schedule**: Last Friday of each quarter, 2-6 AM UTC

**Scope**: Test one disaster scenario per quarter
- Q1: PostgreSQL restore
- Q2: RuVector restore
- Q3: Provider failover
- Q4: Full cluster rebuild

**Procedure**:
1. Announce drill 2 weeks in advance
2. Use staging environment (not production)
3. Execute recovery procedure
4. Measure RTO and RPO achieved
5. Document deviations and update runbooks
6. Brief team on lessons learned

### Backup Verification

**Monthly**: First Monday, automated verification

```bash
#!/bin/bash
# backup-verification.sh

# Download latest backup
LATEST=$(aws s3 ls s3://cfn-backups-prod/postgres/ | sort | tail -1 | awk '{print $4}')
aws s3 cp "s3://cfn-backups-prod/postgres/$LATEST" /tmp/verify-backup.sql.gz

# Restore to test database
gunzip /tmp/verify-backup.sql.gz
psql -h test-db -U postgres -f /tmp/verify-backup.sql

# Verify table counts
LIVE_ROWS=$(psql -h prod-db -U postgres -t -c "SELECT SUM(n_live_tup) FROM pg_stat_user_tables;")
TEST_ROWS=$(psql -h test-db -U postgres -t -c "SELECT SUM(n_live_tup) FROM pg_stat_user_tables;")

if [ "$LIVE_ROWS" -eq "$TEST_ROWS" ]; then
  echo "✓ Backup verification PASSED"
  exit 0
else
  echo "✗ Backup verification FAILED: Row count mismatch"
  exit 1
fi
```

---

## Appendix: Emergency Contacts

**On-Call Rotation**: See PagerDuty schedule

**Critical Vendors**:
- **AWS Support**: 1-800-xxx-xxxx (Enterprise support)
- **Cerebras Support**: support@cerebras.ai
- **Anthropic Support**: support@anthropic.com
- **RuVector Support**: support@ruvector.io

**Escalation Tree**:
1. On-call engineer (0-2 hours)
2. Engineering manager (2-4 hours)
3. CTO (4+ hours or data loss)
4. CEO (customer impact >100 users)

---

**Document Version**: 1.0.0
**Next Review**: 2025-12-29 (30 days)
