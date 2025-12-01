# CFN Loop Production Operational Runbook

**Version**: 1.0.0
**Last Updated**: 2025-11-29
**Maintainers**: CFN DevOps Team

**Purpose**: Complete operational guide for deploying, monitoring, and maintaining the CFN Loop system in production environments.

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Procedures](#deployment-procedures)
4. [Monitoring and Alerting](#monitoring-and-alerting)
5. [Common Operations](#common-operations)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Disaster Recovery](#disaster-recovery)
8. [Scaling Guidelines](#scaling-guidelines)
9. [Security Operations](#security-operations)
10. [Maintenance Windows](#maintenance-windows)

---

## System Architecture Overview

### Components

| Component | Purpose | Technology | Criticality |
|-----------|---------|------------|-------------|
| **Coordinator** | Orchestrates CFN Loop phases | Trigger.dev v4 | Critical |
| **RuVector** | Vector database for learning | RuVector | High |
| **Decomposers** | Break down tasks (4 types) | Cerebras/Anthropic | High |
| **Validators** | Async quality gates (5 types) | Anthropic API | High |
| **Troubleshooter** | Error recovery | Cerebras | Medium |
| **PostgreSQL** | Trigger.dev metadata | PostgreSQL 14+ | Critical |
| **Redis** | Task queue coordination | Redis 7 | High |

### Data Flow

```
User Request → Coordinator → Phase 1: RuVector Init
                           ↓
                    Phase 2: Decomposition Swarm (4 decomposers sequential)
                           ↓
                    Phase 3: Async Validation (5 validators parallel)
                           ↓
                    Phase 4: RuVector Learning Capture
                           ↓
                    Phase 5: Troubleshooting (if ITERATE)
                           ↓
                    Decision: PROCEED / ITERATE / ABORT
```

### Network Topology

```
Internet → Load Balancer → Coordinator Pods (3 replicas)
                                ↓
                         RuVector Service (replicated)
                                ↓
                         PostgreSQL (primary + replica)
                         Redis Cluster (3 nodes)
```

---

## Pre-Deployment Checklist

### Infrastructure Requirements

- [ ] **Compute**: Minimum 3 coordinator pods × 2 CPU / 4GB RAM each
- [ ] **Database**: PostgreSQL 14+ with 100GB storage, 4 CPU / 8GB RAM
- [ ] **RuVector**: 2 instances with 8GB RAM each, SSD storage
- [ ] **Redis**: 3-node cluster with 2GB RAM per node
- [ ] **Network**: Internal service mesh, external ingress
- [ ] **Storage**: Persistent volumes for PostgreSQL and RuVector

### Configuration Requirements

- [ ] **Environment Variables**: All required vars set (see `.env.example`)
- [ ] **Secrets**: API keys stored in Kubernetes secrets or vault
- [ ] **SSL/TLS**: Certificates for external endpoints
- [ ] **DNS**: Internal service discovery configured
- [ ] **Backup**: Automated backup jobs scheduled

### Security Requirements

- [ ] **RBAC**: RuVector RBAC policies configured (Phase 1 requirement)
- [ ] **Audit Logging**: Enabled for all critical operations
- [ ] **Encryption**: Data at rest encrypted (PostgreSQL, RuVector backups)
- [ ] **Network Policies**: Service-to-service authentication
- [ ] **Secrets Rotation**: Automated rotation for API keys

### Monitoring Requirements

- [ ] **Metrics**: Prometheus exporters configured
- [ ] **Logs**: Centralized logging (ELK/Datadog)
- [ ] **Traces**: Distributed tracing enabled
- [ ] **Alerts**: All critical alerts configured
- [ ] **Dashboards**: Grafana dashboards imported

---

## Deployment Procedures

### Standard Deployment (Blue-Green)

**Duration**: 30-45 minutes
**Risk Level**: Low
**Rollback Time**: <5 minutes

#### Pre-Deployment

1. **Verify Green Environment Readiness**
   ```bash
   kubectl get pods -n cfn-green
   kubectl get svc -n cfn-green
   ```

2. **Run Health Checks**
   ```bash
   curl http://cfn-coordinator-green:8080/health/ready
   curl http://ruvector-green:8000/health
   ```

3. **Database Migration (if needed)**
   ```bash
   npm run migrate:up
   # Verify migration
   npm run migrate:status
   ```

#### Deployment Steps

1. **Deploy New Version to Green**
   ```bash
   kubectl apply -f k8s/coordinator-green.yaml
   kubectl rollout status deployment/cfn-coordinator-green -n cfn-green
   ```

2. **Verify Startup Probes**
   ```bash
   kubectl get pods -n cfn-green -w
   # Wait for all pods to be Ready (1/1)
   ```

3. **Run Smoke Tests**
   ```bash
   npm run test:smoke -- --env=green
   # Verify 100% pass rate
   ```

4. **Switch Traffic to Green**
   ```bash
   kubectl patch svc cfn-coordinator -n production \
     -p '{"spec":{"selector":{"version":"green"}}}'
   ```

5. **Monitor for 15 minutes**
   - Watch error rates in Grafana
   - Check latency metrics
   - Verify SLA compliance

6. **Decommission Blue** (after verification)
   ```bash
   kubectl scale deployment cfn-coordinator-blue --replicas=0
   ```

#### Rollback Procedure

If errors detected within 15 minutes:

```bash
# Immediate rollback
kubectl patch svc cfn-coordinator -n production \
  -p '{"spec":{"selector":{"version":"blue"}}}'

# Scale up blue
kubectl scale deployment cfn-coordinator-blue --replicas=3

# Investigate green
kubectl logs -n cfn-green deployment/cfn-coordinator-green --tail=100
```

---

### Canary Deployment (High-Risk Changes)

**Duration**: 2-4 hours
**Risk Level**: Medium
**Use When**: Major version upgrades, algorithm changes

#### Canary Traffic Split

1. **Deploy Canary (10% traffic)**
   ```bash
   kubectl apply -f k8s/coordinator-canary.yaml
   kubectl apply -f k8s/traffic-split-canary-10.yaml
   ```

2. **Monitor Canary Metrics**
   - Error rate: Must be ≤ 1.2× baseline
   - Latency p95: Must be ≤ 1.3× baseline
   - SLA compliance: Must be ≥ 95%

3. **Progressive Rollout**
   - 10% for 30 minutes → 25% for 30 minutes → 50% for 1 hour → 100%
   - Rollback immediately if any metric breaches threshold

4. **Full Rollout**
   ```bash
   kubectl apply -f k8s/traffic-split-canary-100.yaml
   kubectl scale deployment cfn-coordinator-stable --replicas=0
   ```

---

## Monitoring and Alerting

### Key Metrics

#### SLA Metrics

| Metric | Target | Warning | Critical | Action |
|--------|--------|---------|----------|--------|
| Phase 2 Latency | <10s | >8s | >12s | Scale decomposers |
| Phase 3 Latency | <30s | >24s | >36s | Check validator pool |
| Total Loop Time | <150s | >120s | >180s | Investigate bottleneck |
| Error Rate | <1% | >2% | >5% | Trigger incident |
| SLA Compliance | >95% | <90% | <80% | Escalate to on-call |

#### Resource Metrics

| Metric | Normal | Warning | Critical | Action |
|--------|--------|---------|----------|--------|
| CPU Usage | <60% | >75% | >90% | Scale out pods |
| Memory Usage | <70% | >85% | >95% | Scale out pods |
| DB Connections | <50 | >75 | >90 | Check connection pools |
| RuVector Disk | <70% | >85% | >95% | Expand storage |

### Alert Configurations

#### Critical Alerts (PagerDuty)

1. **Coordinator Down**
   ```yaml
   alert: CoordinatorDown
   expr: up{job="cfn-coordinator"} == 0
   for: 2m
   severity: critical
   message: "Coordinator pod is down for >2 minutes"
   ```

2. **SLA Breach Spike**
   ```yaml
   alert: SLABreachSpike
   expr: rate(cfn_sla_breaches_total[5m]) > 0.1
   for: 5m
   severity: critical
   message: "SLA breach rate >10% over 5 minutes"
   ```

3. **Database Unavailable**
   ```yaml
   alert: PostgresDown
   expr: up{job="postgres-exporter"} == 0
   for: 1m
   severity: critical
   message: "PostgreSQL is unreachable"
   ```

#### Warning Alerts (Slack)

1. **High Latency**
   ```yaml
   alert: HighLatency
   expr: histogram_quantile(0.95, cfn_phase_latency_ms) > 30000
   for: 10m
   severity: warning
   message: "P95 latency >30s for 10 minutes"
   ```

2. **Resource Pressure**
   ```yaml
   alert: HighMemoryUsage
   expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.85
   for: 15m
   severity: warning
   message: "Memory usage >85% for 15 minutes"
   ```

### Grafana Dashboards

#### Primary Dashboard: CFN Loop Overview

**Panels**:
1. Request rate (req/s)
2. Phase latencies (heatmap)
3. SLA compliance (%)
4. Error rate (%)
5. Active tasks (gauge)
6. Resource usage (CPU, memory)

**URL**: `https://grafana.example.com/d/cfn-overview`

#### Secondary Dashboard: Phase Breakdown

**Panels**:
1. Phase 2: Decomposer latencies (4 decomposers)
2. Phase 3: Validator latencies (5 validators)
3. Phase 5: Troubleshooting effectiveness
4. RuVector query performance

---

## Common Operations

### Scaling Operations

#### Horizontal Scaling (Add Pods)

```bash
# Scale coordinator
kubectl scale deployment cfn-coordinator --replicas=5

# Verify scaling
kubectl get pods -l app=cfn-coordinator -w
```

**When to scale:**
- CPU usage >75% sustained for >10 minutes
- Queue depth >100 tasks
- Latency p95 >120s

#### Vertical Scaling (Resize Pods)

```bash
# Edit deployment
kubectl edit deployment cfn-coordinator

# Update resources:
#   requests:
#     cpu: 4
#     memory: 8Gi
#   limits:
#     cpu: 8
#     memory: 16Gi

# Trigger rolling restart
kubectl rollout restart deployment cfn-coordinator
```

### Database Operations

#### Backup PostgreSQL

```bash
# Manual backup
kubectl exec -it postgres-0 -- pg_dump -U postgres main > backup-$(date +%Y%m%d-%H%M%S).sql

# Automated backup (CronJob)
kubectl apply -f k8s/cronjob-postgres-backup.yaml
```

**Backup Schedule**: Daily at 2 AM UTC, retained for 30 days

#### Restore PostgreSQL

```bash
# Stop coordinator to prevent writes
kubectl scale deployment cfn-coordinator --replicas=0

# Restore database
kubectl exec -i postgres-0 -- psql -U postgres main < backup-20251129-020000.sql

# Restart coordinator
kubectl scale deployment cfn-coordinator --replicas=3
```

### RuVector Operations

#### Backup RuVector Collections

```bash
# Export collections
curl -X POST http://ruvector:8000/admin/backup \
  -H "Authorization: Bearer $RUVECTOR_ADMIN_TOKEN" \
  -d '{"collections": ["decomposition_plans", "validation_results", "error_patterns"]}'

# Download backup
curl -O http://ruvector:8000/admin/backup/latest.tar.gz
```

**Backup Schedule**: Every 6 hours, retained for 7 days

#### Restore RuVector Collections

```bash
# Upload backup
curl -X POST http://ruvector:8000/admin/restore \
  -H "Authorization: Bearer $RUVECTOR_ADMIN_TOKEN" \
  -F "backup=@latest.tar.gz"

# Verify collections
curl http://ruvector:8000/collections
```

### Log Management

#### View Recent Logs

```bash
# Coordinator logs (last 100 lines)
kubectl logs deployment/cfn-coordinator --tail=100

# Filter by error level
kubectl logs deployment/cfn-coordinator | jq 'select(.level=="error")'

# Follow logs in real-time
kubectl logs -f deployment/cfn-coordinator
```

#### Search Logs (ELK)

```
# Find SLA breaches
level:warn AND message:"SLA breach" AND @timestamp:[now-1h TO now]

# Find errors by trace ID
traceId:"abc123def456" AND level:error
```

### Secret Rotation

#### Rotate Cerebras API Key

```bash
# Update secret
kubectl create secret generic cerebras-api-key \
  --from-literal=api-key=$NEW_CEREBRAS_KEY \
  --dry-run=client -o yaml | kubectl apply -f -

# Trigger rolling restart
kubectl rollout restart deployment cfn-coordinator

# Verify new key works
kubectl logs deployment/cfn-coordinator | grep "Cerebras API"
```

**Rotation Schedule**: Quarterly (every 90 days)

---

## Troubleshooting Guide

### Decision Tree: Task Failures

```
Task Failed
  ├─ Error: "RuVector unavailable"
  │   ├─ Check RuVector health: curl http://ruvector:8000/health
  │   ├─ If down: kubectl get pods -l app=ruvector
  │   ├─ If up but slow: Check disk space (RuVector dashboard)
  │   └─ Mitigation: Scale RuVector replicas or expand storage
  │
  ├─ Error: "SLA breach: phase2_decomposition"
  │   ├─ Check decomposer latencies (Grafana dashboard)
  │   ├─ Identify slow decomposer (architecture/security/performance/testing)
  │   ├─ Check Cerebras API status: curl https://api.cerebras.ai/health
  │   └─ Mitigation: Switch to Anthropic provider or increase timeout
  │
  ├─ Error: "Validation failed"
  │   ├─ Check validator consensus threshold (mode-specific)
  │   ├─ Review validator outputs in RuVector
  │   ├─ Check if validators are using correct context
  │   └─ Mitigation: Adjust consensus threshold or retry with more context
  │
  └─ Error: "Database connection pool exhausted"
      ├─ Check active connections: SELECT count(*) FROM pg_stat_activity;
      ├─ Identify slow queries: SELECT * FROM pg_stat_statements ORDER BY total_time DESC;
      ├─ Kill long-running queries if needed
      └─ Mitigation: Increase connection pool size or scale database
```

### Common Issues and Solutions

#### Issue 1: High Latency (P95 >30s)

**Symptoms**:
- Grafana shows p95 latency >30s
- SLA breach alerts firing
- User complaints about slow responses

**Investigation**:
```bash
# Check which phase is slow
kubectl logs deployment/cfn-coordinator | jq 'select(.phase) | {phase, elapsed}'

# Check resource usage
kubectl top pods -l app=cfn-coordinator

# Check database performance
kubectl exec -it postgres-0 -- psql -U postgres -c \
  "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

**Solutions**:
1. **Slow decomposers**: Switch provider (Cerebras → Anthropic) or scale up
2. **Database bottleneck**: Add read replicas or optimize queries
3. **RuVector slow**: Expand disk I/O or add replicas
4. **Resource constrained**: Scale coordinator pods horizontally

#### Issue 2: RuVector Connection Failures

**Symptoms**:
- Error: "RuVector unavailable"
- Readiness probe failing
- Tasks failing at Phase 1

**Investigation**:
```bash
# Check RuVector pods
kubectl get pods -l app=ruvector

# Check RuVector logs
kubectl logs deployment/ruvector --tail=50

# Test connection
curl -v http://ruvector:8000/health
```

**Solutions**:
1. **Pod crash**: Check OOM or disk full → Scale resources
2. **Network issue**: Verify service discovery → Check DNS
3. **Collection corruption**: Restore from backup
4. **Temporary outage**: Retry with exponential backoff (built-in)

#### Issue 3: Task Queue Backlog

**Symptoms**:
- Queue depth >100 tasks
- Tasks waiting >5 minutes
- Coordinator logs show "Queue processing slow"

**Investigation**:
```bash
# Check Redis queue length
kubectl exec -it redis-0 -- redis-cli LLEN task:queue

# Check coordinator throughput
kubectl logs deployment/cfn-coordinator | jq 'select(.message=="Task completed") | .taskId' | wc -l
```

**Solutions**:
1. **Insufficient capacity**: Scale coordinator pods (3 → 5 → 10)
2. **Slow tasks**: Investigate why tasks are slow (see Issue 1)
3. **Dead tasks**: Clear queue of failed tasks older than 1 hour
4. **Burst traffic**: Enable autoscaling based on queue depth

#### Issue 4: Memory Leak

**Symptoms**:
- Memory usage increasing over time
- OOMKilled restarts
- Coordinator logs show high heap usage

**Investigation**:
```bash
# Check memory usage trend
kubectl top pods -l app=cfn-coordinator

# Trigger heap snapshot (if configured)
curl http://cfn-coordinator:8080/admin/heap-snapshot > heap-$(date +%s).heapsnapshot

# Analyze with Chrome DevTools or clinic.js
```

**Solutions**:
1. **Leak confirmed**: Deploy hotfix or rollback to stable version
2. **Expected growth**: Increase memory limits (4GB → 8GB)
3. **Cache bloat**: Clear RuVector cache or reduce retention
4. **Temporary mitigation**: Restart coordinator pods daily (CronJob)

---

## Disaster Recovery

### Disaster Scenarios

#### Scenario 1: Total Database Loss

**Impact**: Critical - all Trigger.dev metadata lost
**RTO**: 2 hours
**RPO**: 24 hours (daily backup)

**Recovery Steps**:
1. Provision new PostgreSQL instance
2. Restore from latest backup (S3 or persistent volume)
3. Verify data integrity (row counts, foreign keys)
4. Update coordinator connection strings
5. Restart coordinator pods
6. Run smoke tests to verify functionality

**Prevention**:
- Continuous WAL archiving (RPO <5 minutes)
- Multi-region replication for critical data
- Automated backup testing (monthly)

#### Scenario 2: RuVector Cluster Failure

**Impact**: High - learning disabled, RAG unavailable
**RTO**: 1 hour
**RPO**: 6 hours (backup every 6 hours)

**Recovery Steps**:
1. Provision new RuVector cluster
2. Restore collections from latest backup
3. Rebuild vector indices (automatic on restore)
4. Update coordinator RuVector endpoints
5. Verify collection counts and query performance
6. Re-enable learning hooks

**Graceful Degradation**:
- Coordinator continues without RuVector (Phase 4 optional)
- RAG search returns empty results → fallback to default prompts
- Captures buffered in memory until RuVector restored

#### Scenario 3: Coordinator Pod Crash Loop

**Impact**: Medium - new tasks cannot start
**RTO**: 15 minutes
**RPO**: N/A (stateless)

**Recovery Steps**:
1. Check pod events: `kubectl describe pod cfn-coordinator-abc123`
2. Review logs: `kubectl logs cfn-coordinator-abc123 --previous`
3. Identify root cause (config error, missing secret, dependency unavailable)
4. Fix root cause (update config, rotate secret, wait for dependency)
5. Delete crashlooping pod (new pod auto-created)
6. Verify new pod is healthy

**Common Causes**:
- Missing environment variable
- Invalid API key (Cerebras, Anthropic)
- RuVector unreachable
- PostgreSQL connection refused

#### Scenario 4: Cerebras API Outage

**Impact**: Medium - decomposers fail
**RTO**: 10 minutes (provider failover)
**RPO**: N/A

**Recovery Steps**:
1. Confirm Cerebras API outage (check status page)
2. Switch to Anthropic provider:
   ```bash
   kubectl set env deployment/cfn-coordinator \
     DEFAULT_PROVIDER=anthropic
   ```
3. Verify tasks now using Anthropic
4. Monitor costs (Anthropic is more expensive)
5. Switch back to Cerebras when available

**Automatic Failover**:
- Implement multi-provider retry logic (Phase 6 enhancement)
- Use Anthropic as fallback for critical tasks

#### Scenario 5: Kubernetes Cluster Failure

**Impact**: Critical - entire system down
**RTO**: 4 hours
**RPO**: 24 hours

**Recovery Steps**:
1. Provision new Kubernetes cluster (IaC: Terraform)
2. Restore persistent volumes from snapshots
3. Deploy all services from Helm charts
4. Restore database from backup
5. Restore RuVector from backup
6. Verify end-to-end functionality
7. Update DNS to point to new cluster

**Prevention**:
- Multi-cluster deployment (active-passive)
- Cross-region backups
- Chaos engineering tests (monthly)

---

## Scaling Guidelines

### When to Scale Up

| Metric | Threshold | Action | Expected Impact |
|--------|-----------|--------|-----------------|
| CPU >75% sustained | >10 min | Add 2 coordinator pods | 30% latency reduction |
| Memory >85% | >5 min | Increase pod memory | Prevent OOMKilled |
| Queue depth >100 | >15 min | Add 3 coordinator pods | 50% throughput increase |
| DB connections >75 | >10 min | Add read replica | 40% read latency reduction |
| RuVector p95 >1s | >10 min | Add RuVector replica | 50% query latency reduction |

### Autoscaling Configuration

#### Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cfn-coordinator-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cfn-coordinator
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # Wait 5 min before scaling down
    scaleUp:
      stabilizationWindowSeconds: 60   # Scale up quickly
```

#### Custom Metrics Autoscaler (Queue Depth)

```yaml
- type: External
  external:
    metric:
      name: redis_queue_depth
      selector:
        matchLabels:
          queue: task_queue
    target:
      type: AverageValue
      averageValue: "50"  # Scale up if queue >50 tasks per pod
```

### Capacity Planning

**Current Capacity** (3 coordinator pods):
- Throughput: ~20 tasks/hour
- Concurrent tasks: ~15
- Max latency p95: 120s

**Scaling Projections**:

| Pods | Throughput | Concurrent | Max Latency | Cost Increase |
|------|------------|------------|-------------|---------------|
| 3 | 20/hour | 15 | 120s | Baseline |
| 5 | 35/hour | 25 | 100s | +67% compute |
| 10 | 65/hour | 50 | 80s | +233% compute |

**Recommendation**: Start with 3 pods, scale to 5 at 60% utilization, max out at 10.

---

## Security Operations

### Security Checklist

- [ ] **API Keys**: Rotated quarterly, stored in vault
- [ ] **RBAC**: Least privilege for all RuVector collections
- [ ] **Audit Logs**: Enabled and retained for 90 days
- [ ] **Encryption**: TLS for all network traffic
- [ ] **Secrets**: No secrets in code or logs
- [ ] **Vulnerability Scanning**: Weekly Trivy scans
- [ ] **Penetration Testing**: Annual third-party audit

### Incident Response

#### Security Incident Workflow

1. **Detection**: Alert fired or manual report
2. **Containment**: Isolate affected components
3. **Investigation**: Collect logs, analyze attack vector
4. **Remediation**: Patch vulnerability, rotate secrets
5. **Recovery**: Restore service, verify integrity
6. **Lessons Learned**: Document and improve defenses

#### Example: Compromised API Key

**Steps**:
1. Immediately revoke old key in provider dashboard
2. Generate new key
3. Update Kubernetes secret
4. Restart all pods to pick up new key
5. Audit all API calls made with old key (24 hours before revoke)
6. Check for unauthorized access or data exfiltration
7. Document incident and add monitoring for similar patterns

---

## Maintenance Windows

### Scheduled Maintenance

**Monthly**: First Sunday 2-4 AM UTC

**Tasks**:
- Database vacuuming and index rebuilding
- RuVector index optimization
- Rotate non-critical secrets
- Apply security patches (OS, dependencies)
- Clear old logs and backups (>30 days)

**Procedure**:
1. Announce maintenance 7 days in advance
2. Scale down to 1 coordinator pod (reduce disruption)
3. Run maintenance scripts
4. Run smoke tests
5. Scale back to 3 coordinator pods
6. Monitor for 1 hour post-maintenance

### Emergency Maintenance

**Triggers**:
- Critical security vulnerability (CVE score >9.0)
- Data corruption detected
- Performance degradation >50%

**Procedure**:
1. Assess impact and urgency
2. If critical: immediate deployment (no window)
3. If high: schedule emergency window within 24 hours
4. Communicate via status page and Slack
5. Execute fix with rollback plan ready
6. Post-mortem within 48 hours

---

## Appendix

### Environment Variables Reference

See `docker/trigger-dev/.env.example` for complete list.

**Critical Variables**:
- `TRIGGER_SECRET_KEY`: Trigger.dev API key (tr_dev_* or tr_prod_*)
- `CEREBRAS_API_KEY`: Cerebras API key for decomposers
- `ANTHROPIC_API_KEY`: Anthropic API key (fallback)
- `RUVECTOR_URL`: RuVector endpoint (http://ruvector:8000)
- `POSTGRES_URL`: PostgreSQL connection string

### Contact Information

**On-Call Rotation**: PagerDuty schedule
**Slack Channels**:
- `#cfn-alerts`: Automated alerts
- `#cfn-incidents`: Active incidents
- `#cfn-deployments`: Deployment announcements

**Escalation**:
1. On-call engineer (Slack/PagerDuty)
2. Team lead (if >2 hours)
3. CTO (if >4 hours or critical data loss)

---

**Document Version**: 1.0.0
**Next Review**: 2025-12-29 (30 days)
