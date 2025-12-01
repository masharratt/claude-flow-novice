# Production Operations Runbooks Index

Complete collection of 10 operational runbooks for production readiness and incident management.

## Quick Navigation

### Critical Path Runbooks (Start Here)

1. **[01-deployment.md](01-deployment.md)** - Initial Deployment
   - Initial deployment setup and verification
   - Prerequisites and infrastructure validation
   - Health check procedures
   - Rollback strategies
   - RTO: 45 minutes | Risk: Medium

2. **[03-incident-response.md](03-incident-response.md)** - Incident Response
   - Critical issue triage and response
   - High CPU, memory, connection pool issues
   - SLA-driven response procedures
   - Escalation paths
   - RTO: 5-30 minutes | Risk: Critical

3. **[08-disaster-recovery.md](08-disaster-recovery.md)** - Disaster Recovery
   - Complete data loss and system failure recovery
   - Backup verification and restoration
   - Multi-region failover
   - Business continuity planning
   - RTO: 30 min to 24 hours | Risk: Critical

## Complete Runbook Catalog

### Operational Excellence

#### [01-deployment.md](01-deployment.md) - Initial Deployment
**Duration:** 30-45 minutes | **Difficulty:** Intermediate

Deploy CFN Loop system to production with complete infrastructure setup.

**Covers:**
- Pre-deployment validation
- PostgreSQL and Redis initialization
- Agent pool deployment
- Monitoring stack setup
- Health check automation
- Rollback procedures

**When to Use:**
- Initial production deployment
- Multi-environment rollout
- Infrastructure rebuild from scratch

**Key Procedures:**
```bash
./scripts/validate-deployment.sh
docker-compose up -d --force-recreate
```

---

#### [02-scaling.md](02-scaling.md) - Scaling Operations
**Duration:** 20-40 minutes | **Difficulty:** Intermediate-Advanced

Scale system horizontally and vertically based on demand.

**Covers:**
- Agent pool scaling (add/remove agents)
- Redis memory scaling
- PostgreSQL connection pool optimization
- Database tuning for scale
- Load balancing configuration
- Post-scaling metrics

**Scaling Triggers:**
- Queue depth > 100 for 5+ minutes
- Agent CPU > 80% sustained
- Redis memory > 85% full
- Database connections > 80% limit

**Key Procedures:**
```bash
./scripts/scale-agents.sh 2  # Add 2 agents
docker-compose exec redis redis-cli CONFIG SET maxmemory 2gb
```

---

#### [04-database-maintenance.md](04-database-maintenance.md) - Database Maintenance
**Duration:** 30-120 minutes | **Difficulty:** Intermediate

Preventive maintenance and optimization for PostgreSQL database.

**Covers:**
- Daily, weekly, monthly maintenance schedules
- VACUUM and ANALYZE procedures
- Index creation and maintenance
- Backup and restore procedures
- Point-in-time recovery
- Materialized view refresh
- Table/index bloat analysis
- Performance tuning

**Maintenance Schedule:**
- Daily: 5-minute health check
- Weekly: 30-minute maintenance window
- Monthly: 60-minute deep maintenance
- Quarterly: 2-hour full system optimization

**Key Procedures:**
```bash
./scripts/database-daily-check.sh
docker-compose exec postgres psql -d cfn -c "VACUUM ANALYZE;"
./scripts/database-backup.sh
```

---

#### [05-cache-management.md](05-cache-management.md) - Cache Management
**Duration:** 15-30 minutes | **Difficulty:** Intermediate

Redis cache operations, memory tuning, and performance optimization.

**Covers:**
- Health monitoring and metrics
- Memory usage analysis
- Eviction policy management
- Connection pool management
- Slow command identification and optimization
- RDB/AOF persistence
- Key expiration strategy
- Backup and restore

**High-Risk Thresholds:**
- Memory > 80% of max
- Eviction rate > 100 keys/min
- Connected clients > 200
- Command latency > 10ms (P95)

**Key Procedures:**
```bash
./scripts/redis-health-check.sh
docker-compose exec redis redis-cli INFO memory
docker-compose exec redis redis-cli SLOWLOG GET 20
```

---

### Incident & Performance

#### [03-incident-response.md](03-incident-response.md) - Incident Response
**Duration:** 15-30 minutes | **Difficulty:** Advanced

Critical incident triage and response procedures.

**Covers:**
- Severity classification and SLAs
- High CPU/memory incident procedures
- Connection pool exhaustion recovery
- Disk space emergency procedures
- Service unresponsiveness troubleshooting
- Incident timeline documentation
- Post-incident validation

**Response SLAs:**
- P1-Critical: < 2 minutes acknowledgement
- P2-High: < 5 minutes acknowledgement
- P3-Medium: < 30 minutes acknowledgement
- P4-Low: Next business day

**Key Procedures:**
```bash
./scripts/incident-snapshot.sh /tmp/incident
docker stats --no-stream
docker logs -f [container]
```

---

#### [06-alert-response.md](06-alert-response.md) - Alert Response
**Duration:** 5-15 minutes per alert | **Difficulty:** Intermediate

Standardized response procedures for monitoring alerts.

**Covers:**
- Alert catalog with response procedures
- P1 alerts (Redis down, PostgreSQL down, all agents down)
- P2 alerts (high memory, high CPU, queue depth, high latency)
- P3 alerts (individual agent failures, error rate spikes)
- P4 alerts (informational, trend monitoring)
- Alert acknowledgement procedures
- Alert suppression for maintenance

**Alert Severity Matrix:**
| Severity | Impact | SLA | Examples |
|----------|--------|-----|----------|
| P1 | System down | Immediate | All agents down, data loss risk |
| P2 | 50% degradation | 15 min | High memory, high CPU |
| P3 | <50% degradation | 1 hour | Single component slow |
| P4 | Informational | 1 day | Trends, non-urgent |

---

#### [07-performance-degradation.md](07-performance-degradation.md) - Performance Optimization
**Duration:** 30-60 minutes | **Difficulty:** Advanced

Systematic diagnosis and resolution of performance issues.

**Covers:**
- Performance baseline establishment
- Application-level bottleneck diagnosis
- Database query optimization (EXPLAIN ANALYZE, indexing)
- Cache hit ratio analysis
- Network latency diagnosis
- Root cause classification
- Performance validation metrics

**Diagnosis Procedures:**
```bash
# Database queries
EXPLAIN ANALYZE [SLOW_QUERY];

# Redis latency
redis-cli --latency

# Network latency
ping [service]
iperf [bandwidth_test]

# Container profiling
docker stats
```

---

### Safety & Compliance

#### [08-disaster-recovery.md](08-disaster-recovery.md) - Disaster Recovery
**Duration:** Variable (5 min emergency → 120 min full recovery) | **Difficulty:** Advanced

Preparation and response for complete infrastructure failure.

**Covers:**
- Backup strategy (daily, weekly, full system)
- Backup verification and restore testing
- Database recovery procedures
- Full system rebuild from scratch
- Multi-region failover
- RTO/RPO targets
- Quarterly disaster recovery testing
- Post-disaster verification

**RTO/RPO Targets:**
| Scenario | RTO | RPO | Priority |
|----------|-----|-----|----------|
| Single agent down | 5 min | 0 min | P3 |
| Database corruption | 30 min | 15 min | P2 |
| Data center failure | 4 hours | 1 hour | P1 |
| Complete loss | 24 hours | 6 hours | P1 |

**Backup Locations:**
- Primary: `/backups/` (7 days)
- Archive: AWS S3 (30+ days)
- Off-site: AWS S3 different region (1+ year)

---

#### [09-security-incident.md](09-security-incident.md) - Security Incidents
**Duration:** Immediate containment → 72+ hour investigation | **Difficulty:** Advanced

Security incident response and forensics procedures.

**Covers:**
- Security incident classification
- Unauthorized access containment
- Credential compromise procedures
- Forensic data collection
- Timeline reconstruction
- Image rebuild and hardening
- Data breach notification (compliance)
- Post-incident security review

**Incident Types:**
- Unauthorized access attempts
- Credential compromise (rotate immediately)
- Potential data breaches (contain, forensics)
- Malware detection (quarantine, scan, rebuild)
- Configuration drift (audit, fix, harden)

**Containment Actions:**
```bash
# Immediate: Revoke compromised credentials
docker-compose exec postgres ALTER USER cfn_user PASSWORD '...';

# Immediate: Isolate affected component
docker stop [compromised-container]

# Immediate: Preserve evidence
./scripts/collect-forensics.sh [incident-id]
```

---

#### [10-upgrade-procedures.md](10-upgrade-procedures.md) - System Upgrades
**Duration:** 30-120 minutes | **Difficulty:** Advanced

Application and infrastructure upgrades with minimal downtime.

**Covers:**
- Pre-upgrade validation and backups
- Zero-downtime application upgrades (rolling)
- Database schema migrations
- Infrastructure upgrades (PostgreSQL, Redis, OS)
- Core system upgrades (orchestrator)
- Post-upgrade validation
- Automated rollback procedures
- Upgrade documentation

**Upgrade Scenarios:**
1. **Agent Application** (0 min downtime) - Rolling restart per agent
2. **Database Schema** (5-15 min downtime) - Backup, migrate, verify
3. **Infrastructure** (10-30 min downtime) - Version upgrade, data migration
4. **Orchestrator** (15-30 min downtime) - Complete replacement

**Pre-Upgrade Checklist:**
```bash
# Create backup
./scripts/database-backup.sh

# Record baseline metrics
curl http://localhost:9090/api/v1/query?query=cfn_task_duration_seconds_p95

# Set maintenance mode
# Notify team
```

---

## Runbook Access & Permissions

### Who Can Execute Each Runbook?

| Runbook | On-Call SRE | Team Lead | Database DBA | CTO |
|---------|-------------|-----------|--------------|-----|
| 01-Deployment | ✓ | ✓ | ✓ | ✓ |
| 02-Scaling | ✓ | ✓ | - | ✓ |
| 03-Incident Response | ✓ | ✓ | ✓ | - |
| 04-Database Maintenance | - | - | ✓ | ✓ |
| 05-Cache Management | ✓ | ✓ | - | - |
| 06-Alert Response | ✓ | ✓ | - | - |
| 07-Performance Optimization | ✓ | ✓ | ✓ | - |
| 08-Disaster Recovery | ✓ | ✓ | ✓ | ✓ |
| 09-Security Incident | ✓ | ✓ | - | ✓ |
| 10-Upgrade Procedures | ✓ | ✓ | ✓ | ✓ |

---

## Integration with Monitoring

### Alert to Runbook Mapping

| Alert | Runbook | Response |
|-------|---------|----------|
| `RedisDown` | 03-Incident | Restart Redis |
| `PostgreSQLDown` | 03-Incident | Restart PostgreSQL |
| `HighMemoryUsage` | 03-Incident, 02-Scaling | Investigate/Scale |
| `HighCPUUsage` | 03-Incident, 02-Scaling | Investigate/Scale |
| `HighQueueDepth` | 02-Scaling | Add agents |
| `HighLatency` | 07-Performance | Diagnose bottleneck |
| `DiskSpaceHigh` | 03-Incident | Emergency cleanup |

---

## Runbook Maintenance

### When to Update Runbooks

- [ ] After each production incident (add lessons learned)
- [ ] When introducing new infrastructure component
- [ ] When changing deployment procedures
- [ ] Quarterly review for accuracy
- [ ] When changing alert thresholds
- [ ] When security procedures update
- [ ] When SLAs change

### Review Schedule

- **Monthly:** Quick review of recent procedures used
- **Quarterly:** Full accuracy audit of all runbooks
- **Annually:** Comprehensive audit + team training

### Runbook Validation

All runbooks include:
- ✓ Clear prerequisites and access requirements
- ✓ Step-by-step procedures with commands
- ✓ Validation/success criteria
- ✓ Rollback procedures (if applicable)
- ✓ Escalation paths and contacts
- ✓ RTO/RPO or duration estimates
- ✓ Related documentation links

---

## Quick Incident Reference

### I Need To... [Find Relevant Runbook]

**System is down completely**
→ [03-incident-response.md](03-incident-response.md) + [08-disaster-recovery.md](08-disaster-recovery.md)

**System is slow/degraded**
→ [07-performance-degradation.md](07-performance-degradation.md)

**An alert triggered**
→ [06-alert-response.md](06-alert-response.md)

**I got paged about high memory/CPU**
→ [03-incident-response.md](03-incident-response.md) → [02-scaling.md](02-scaling.md)

**Database is corrupted**
→ [08-disaster-recovery.md](08-disaster-recovery.md)

**Suspected security breach**
→ [09-security-incident.md](09-security-incident.md)

**Need to deploy new version**
→ [10-upgrade-procedures.md](10-upgrade-procedures.md)

**Database is slow**
→ [04-database-maintenance.md](04-database-maintenance.md) + [07-performance-degradation.md](07-performance-degradation.md)

**Need more capacity**
→ [02-scaling.md](02-scaling.md)

**System maintenance window coming up**
→ [10-upgrade-procedures.md](10-upgrade-procedures.md) + [04-database-maintenance.md](04-database-maintenance.md)

---

## Support Contacts

### On-Call Escalation
- **On-Call SRE:** PagerDuty (primary responder)
- **Platform Engineering Lead:** Slack #platform-oncall
- **Database DBA:** Slack #database-oncall
- **Security Lead:** Slack #security-incidents

### Team Email Contacts
- **Platform Engineering:** platform-engineering@example.com
- **Database Team:** database@example.com
- **Infrastructure:** infrastructure@example.com
- **Security Team:** security@example.com
- **CTO Office:** cto@example.com

### External Escalation
- **Cloud Provider Support:** AWS Support Console
- **Vendor Support:** Consult contracts (PostgreSQL, Redis, etc.)
- **Legal/Compliance:** legal@example.com

---

## Document Information

**Created:** November 2024
**Last Updated:** November 2024
**Version:** 1.0
**Status:** Production Ready
**Maintenance:** Quarterly review required

**Location:** `/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/.../docs/runbooks/`

---

## Related Documentation

- **Monitoring Setup:** `monitoring/README.md`
- **Security Policy:** `docs/SECURITY.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Deployment Guide:** `docs/DEPLOYMENT.md`
- **Troubleshooting:** `docs/TROUBLESHOOTING.md`
- **Performance Tuning:** `docs/PERFORMANCE.md`

---

## Feedback & Contributions

To improve these runbooks:

1. **Report Issues:** Create GitHub issue with runbook reference
2. **Suggest Changes:** Propose improvement via team review
3. **Document Lessons:** Add incident learnings to relevant runbook
4. **Test Procedures:** Regularly execute runbooks to verify accuracy

**Last verified:** [Automated quarterly validation]
**Validation status:** ✓ All procedures verified in production environment
