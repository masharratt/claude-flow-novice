# Workflow Codification Enhancement - Deployment Guide

**Version:** 1.0.0
**Status:** APPROVED
**Last Updated:** 2025-11-16

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Deployment Strategies](#deployment-strategies)
3. [Migration Execution](#migration-execution)
4. [Canary Rollout](#canary-rollout)
5. [Validation & Monitoring](#validation--monitoring)
6. [Rollback Procedures](#rollback-procedures)
7. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Infrastructure Requirements

- [ ] PostgreSQL 13+ database available
- [ ] Redis 6+ instance operational
- [ ] Prometheus monitoring configured
- [ ] Grafana dashboards prepared
- [ ] Application servers (≥3 instances for canary)
- [ ] Load balancer configured for traffic splitting
- [ ] DNS/ingress routing ready

### Code Requirements

- [ ] All tests passing (unit, integration, deployment)
- [ ] Code review completed and approved
- [ ] Security scanning completed (no critical findings)
- [ ] Documentation complete and reviewed
- [ ] Version number updated

### Access & Permissions

- [ ] Database credentials configured (non-production format)
- [ ] Redis credentials configured
- [ ] Prometheus API access enabled
- [ ] Deployment scripts tested in staging
- [ ] Runbook reviewed with team

### Communication

- [ ] Stakeholders notified of deployment window
- [ ] Incident response team on standby
- [ ] Monitoring dashboards prepared
- [ ] Alert channels verified (PagerDuty, Slack, etc.)

---

## Deployment Strategies

### Strategy 1: Standard Deployment (Recommended for Production)

```bash
# Full canary rollout: 10% → 50% → 100%
bash deployment/canary-rollout.sh production

# or individual stages:
bash deployment/deploy.sh production 10  # 10% canary
bash deployment/deploy.sh production 50  # 50% canary
bash deployment/deploy.sh production 100 # Full deployment
```

### Strategy 2: Direct Deployment (Staging Only)

```bash
# Direct 100% deployment
bash deployment/deploy.sh staging 100
```

### Strategy 3: Dry Run (Testing)

```bash
# Test without actual deployment
DRY_RUN=true bash deployment/deploy.sh test 10
```

---

## Migration Execution

### Database Migrations

The deployment script automatically executes migrations in order:

```bash
001_skill_health_history.sql       # Health score tracking
002_circuit_breaker_state.sql      # Circuit breaker state
003_retry_telemetry.sql            # Retry behavior tracking
004_regression_test_suites.sql     # Test suite definitions
005_regression_test_results.sql    # Test execution results
006_pattern_recommendations.sql    # Pattern recommendations
007_composite_skills.sql           # Composite skill definitions
008_execution_traces.sql           # Distributed tracing
```

### Manual Migration Execution

If needed, execute migrations manually:

```bash
bash deployment/run-migrations.sh production
```

### Migration Verification

Verify all tables created:

```bash
psql -d workflow_codification_prod -c \
  "SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;"
```

---

## Canary Rollout

### Stage 1: 10% Canary (30 minutes monitoring)

1. Deploy to 10% of instances
2. Monitor error rate (threshold: <0.5%)
3. Monitor P95 latency (threshold: <1000ms)
4. Wait 30 minutes before proceeding

**Decision Point:**
- ✅ Metrics healthy → proceed to Stage 2
- ❌ Metrics unhealthy → automatic rollback

### Stage 2: 50% Canary (30 minutes monitoring)

1. Deploy to 50% of instances
2. Monitor error rate and latency
3. Check circuit breaker transitions
4. Verify data consistency
5. Wait 30 minutes before proceeding

**Decision Point:**
- ✅ Metrics healthy → proceed to Stage 3
- ❌ Metrics unhealthy → automatic rollback

### Stage 3: 100% Full Deployment (10 minutes monitoring)

1. Deploy to all instances
2. Monitor overall system health
3. Verify all endpoints responding
4. Check metrics pipeline complete
5. Final monitoring window (10 minutes)

**Success Criteria:**
- All instances running new version
- Health check endpoints responding
- Metrics being collected
- No alert escalations

---

## Validation & Monitoring

### Post-Deployment Validation

```bash
bash deployment/validate-deployment.sh production
```

Validates:
- ✓ Health check endpoint (HTTP 200)
- ✓ Readiness endpoint (HTTP 200)
- ✓ Prometheus metrics exposed
- ✓ Database connectivity
- ✓ Redis connectivity
- ✓ Critical API endpoints
- ✓ Alerting rules configured

### Continuous Monitoring

**Key Metrics to Monitor:**

```
workflow_codification_health_score       # Overall health (0-100)
workflow_codification_executions_total   # Total skill executions
workflow_codification_circuit_breaker    # Circuit breaker state
workflow_codification_duration_seconds   # Execution latency
workflow_codification_cache_hits         # Redis cache hits
```

**Alert Thresholds:**

| Metric | Threshold | Action |
|--------|-----------|--------|
| Error Rate | >0.5% | Page on-call |
| P95 Latency | >1000ms | Warning, monitor |
| Circuit Breaker | OPEN for >5min | Escalate |
| Cache Miss Rate | >20% | Investigate |

---

## Rollback Procedures

### Automatic Rollback (Triggered by)

- Health check endpoint down
- Error rate exceeds 0.5%
- P95 latency exceeds 1000ms
- Critical service dependency down
- Manual intervention requested

### Manual Rollback

```bash
bash deployment/rollback.sh production
```

### Rollback Execution Steps

1. **Revert Application**
   - Stop new version services
   - Restore previous version
   - Wait for service restart

2. **Rollback Migrations**
   - Execute rollback migrations
   - Verify table structure
   - Verify data integrity

3. **Clear Caches**
   - Flush Redis cache
   - Clear application cache
   - Warm hot data

4. **Verify System**
   - Health checks pass
   - Database accessible
   - Redis accessible
   - All endpoints responding

### Post-Rollback

- Notify stakeholders
- Document rollback reason
- Begin incident investigation
- Schedule post-mortem

---

## Troubleshooting

### Issue: Health Check Endpoint Returning 503

**Cause:** Service not fully initialized

**Resolution:**
```bash
# Check service status
systemctl status workflow-codification

# Check logs
tail -100f /var/log/workflow-codification/app.log

# Verify dependencies
bash deployment/validate-deployment.sh
```

### Issue: Database Migration Failed

**Cause:** Schema conflict or constraint violation

**Resolution:**
```bash
# Check migration log
psql -d workflow_codification_prod -c \
  "SELECT * FROM schema_migrations ORDER BY created_at DESC LIMIT 5;"

# Manually rollback problematic migration
psql -f src/workflow-codification/migrations/00X_rollback.sql

# Restart deployment
bash deployment/deploy.sh production 10
```

### Issue: Circuit Breaker Stuck in OPEN State

**Cause:** Continuous errors during deployment

**Resolution:**
```bash
# Check error details
curl http://localhost:8000/v2/circuit-breaker/cfn-coordination/state

# Reset circuit breaker (if safe)
redis-cli HSET cb:cfn-coordination status CLOSED

# Monitor for recovery
watch 'curl -s http://localhost:8000/v2/circuit-breaker/cfn-coordination/state | jq'
```

### Issue: High Latency During Canary

**Cause:** Resource contention or inefficient queries

**Resolution:**
```bash
# Check database performance
psql -d workflow_codification_prod -c "\d+ skill_health_history"

# Analyze slow queries
SELECT query, calls, mean_time FROM pg_stat_statements
ORDER BY mean_time DESC LIMIT 10;

# If necessary, rollback and optimize
bash deployment/rollback.sh production
```

---

## Performance Tuning

### Database Optimization

```sql
-- Analyze tables for optimizer
ANALYZE skill_health_history;
ANALYZE regression_test_results;
ANALYZE execution_traces;

-- Reindex if necessary
REINDEX INDEX idx_skill_health_composite;
REINDEX INDEX idx_test_results_composite;
```

### Redis Optimization

```bash
# Monitor Redis memory
redis-cli INFO memory

# Enable persistence if needed
redis-cli CONFIG SET save "900 1 300 10 60 10000"

# Monitor key statistics
redis-cli --stat
```

---

## Success Criteria

✅ Deployment successful when:
- All 8 migrations executed successfully
- All validation tests passing
- Health check endpoints responding
- Metrics being collected in Prometheus
- No circuit breaker trips
- Error rate < 0.5%
- P95 latency < 1000ms
- All instances running new version
- Stakeholders notified

---

## Emergency Contacts

- **On-Call Engineer:** [Contact Info]
- **Database Administrator:** [Contact Info]
- **Infrastructure Team:** [Contact Info]
- **Product Manager:** [Contact Info]

---

## Appendix: Script Reference

### deploy.sh

Main deployment orchestrator with canary support.

```bash
Usage: bash deployment/deploy.sh <environment> <canary_percent> <rollback_on_error>
Example: bash deployment/deploy.sh production 10 true
```

### canary-rollout.sh

Automates complete 3-stage canary deployment.

```bash
Usage: bash deployment/canary-rollout.sh <environment>
Example: bash deployment/canary-rollout.sh production
```

### run-migrations.sh

Executes all database migrations.

```bash
Usage: bash deployment/run-migrations.sh <environment>
Example: bash deployment/run-migrations.sh production
```

### validate-deployment.sh

Post-deployment validation and health checks.

```bash
Usage: bash deployment/validate-deployment.sh <environment> <base_url> <prometheus_url>
Example: bash deployment/validate-deployment.sh production http://localhost:8000
```

### rollback.sh

Emergency rollback to previous version.

```bash
Usage: bash deployment/rollback.sh <environment>
Example: bash deployment/rollback.sh production
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-16 | DevOps Team | Initial deployment guide |

---
