# Quick Start - Operational Runbooks

**Print this page and post in war room**

---

## I Need Help With...

### Emergency/On-Call
**Alert triggered?** → [06-alert-response.md](06-alert-response.md)
- P1 (critical): < 2 min response
- P2 (high): < 5 min response
- P3 (medium): < 30 min response

**System down?** → [03-incident-response.md](03-incident-response.md)
- CPU spike: CPU diagnosis steps
- Memory leak: Memory investigation + restart
- No agents: Pool recovery
- Disk full: Emergency cleanup

**Data lost?** → [08-disaster-recovery.md](08-disaster-recovery.md)
- Restore from backup
- Verify data integrity
- Test recovery

---

### Maintenance Windows
**Need to deploy?** → [10-upgrade-procedures.md](10-upgrade-procedures.md)
- Agent upgrade: Zero-downtime rolling
- Database schema: Plan downtime window
- Infrastructure: Full replacement

**Need more capacity?** → [02-scaling.md](02-scaling.md)
- Add agents: `./scripts/scale-agents.sh`
- Expand Redis: CONFIG SET maxmemory
- Increase PostgreSQL: ALTER SYSTEM

**Database slow?** → [04-database-maintenance.md](04-database-maintenance.md)
- Weekly: VACUUM ANALYZE
- Monthly: Full backup, index maintenance
- Quarterly: Deep optimization

**Application slow?** → [07-performance-degradation.md](07-performance-degradation.md)
- Establish baseline
- Identify bottleneck
- Optimize specific component

---

### Security Issues
**Potential breach?** → [09-security-incident.md](09-security-incident.md)
- Contain immediately
- Preserve evidence
- Investigate
- Notify security team

**Credentials exposed?** → [09-security-incident.md](09-security-incident.md) - Credential Compromise
- Revoke immediately
- Rotate credentials
- Check for lateral movement
- Enable monitoring

---

### First Time?
**First deployment?** → [01-deployment.md](01-deployment.md)
1. Create volumes: `docker volume create`
2. Start PostgreSQL: `docker-compose up -d postgres`
3. Initialize database: `psql -f schema.sql`
4. Start Redis: `docker-compose up -d redis`
5. Deploy orchestrator and agents
6. Verify health checks pass

**Need overview?** → [INDEX.md](INDEX.md)
- Full index of all 10 runbooks
- How to find right procedure
- Contact information

---

## Critical Commands

### Emergency Stop
```bash
# Stop all containers (emergency only)
docker-compose down

# Emergency database recovery
./scripts/restore-from-backup.sh /backups/cfn-latest.sql.gz
```

### Check Health
```bash
# System status
docker-compose ps

# Database responsive
docker-compose exec postgres pg_isready -U postgres

# Redis responsive
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" PING

# Agents running
docker ps --filter "label=cfn.component=agent"
```

### Scale Up
```bash
# Add agents
./scripts/scale-agents.sh 2  # Add 2 agents

# Increase Redis memory
docker-compose exec redis redis-cli CONFIG SET maxmemory 2gb

# Increase database connections
docker-compose exec postgres psql -U postgres -c "ALTER SYSTEM SET max_connections = 200;"
```

### View Logs
```bash
# Recent logs
docker logs cfn-agent-1 --tail 50

# Live logs
docker logs -f cfn-agent-1

# All errors
docker logs cfn-agent-1 2>&1 | grep ERROR
```

---

## Response SLA

| Severity | Response Time | Runbook |
|----------|---------------|---------|
| P1-Critical | Immediate (0 min) | 03-Incident or 09-Security |
| P2-High | 15 minutes | 06-Alert or 02-Scaling |
| P3-Medium | 1 hour | 07-Performance or 06-Alert |
| P4-Low | Next business day | 04-Database or backlog |

---

## Escalation Contacts

### Primary
- **On-Call SRE:** PagerDuty (page immediately for P1)
- **Engineering Lead:** Slack #engineering-oncall (P2+)
- **Database DBA:** Slack #database (database issues)

### Secondary
- **Platform Lead:** Slack #platform (infrastructure)
- **Security Lead:** Slack #security-incidents (security)
- **CTO:** cto@example.com (major incidents)

---

## Backup & Recovery

### Last Backup Status
```bash
ls -lh /backups/cfn-postgres-*.sql.gz | tail -1
ls -lh /backups/redis-*.rdb | tail -1
```

### Quick Restore
```bash
# Database
./scripts/restore-from-backup.sh /backups/cfn-latest.sql.gz

# Redis
docker-compose stop redis
cp /backups/redis-latest.rdb /var/lib/docker/volumes/redis-data/_data/dump.rdb
docker-compose up -d redis
```

### Test Restore (Quarterly)
```bash
./scripts/verify-backups.sh
```

---

## Monitoring Dashboards

**Access:** http://localhost:3000 (admin/admin)

Key dashboards:
- Agent Performance: Queue depth, latency, errors
- System Resources: CPU, memory, disk usage
- Database: Connections, query latency, cache hit ratio
- Redis: Memory usage, eviction rate, clients

---

## Common Alerts

| Alert | Severity | Action | Runbook |
|-------|----------|--------|---------|
| RedisDown | P1 | `docker-compose restart redis` | 06-Alert |
| PostgreSQLDown | P1 | `docker-compose restart postgres` | 06-Alert |
| AllAgentsDown | P1 | Restart agents, check dependencies | 03-Incident |
| HighMemory | P2 | Check agent, scale up if needed | 02-Scaling |
| HighCPU | P2 | Scale up agents | 02-Scaling |
| HighQueueDepth | P2 | Add agents | 02-Scaling |
| DiskSpaceHigh | P2 | Emergency cleanup | 03-Incident |
| HighLatency | P3 | Check resource usage | 07-Performance |
| HighErrorRate | P3 | Check logs | 06-Alert |

---

## Documentation Location

All runbooks located in: `/docs/runbooks/`

- `01-deployment.md` - Initial deployment
- `02-scaling.md` - Scaling procedures
- `03-incident-response.md` - Critical incidents
- `04-database-maintenance.md` - Database procedures
- `05-cache-management.md` - Redis operations
- `06-alert-response.md` - Alert procedures
- `07-performance-degradation.md` - Troubleshooting
- `08-disaster-recovery.md` - Backup/restore
- `09-security-incident.md` - Security response
- `10-upgrade-procedures.md` - Deployments/upgrades

**Index:** `INDEX.md` - Full navigation guide

---

## Team Training

### Essential Knowledge
- [ ] Find right runbook for your role
- [ ] Understand incident response SLAs
- [ ] Know how to check system health
- [ ] Know how to restart services
- [ ] Know escalation path for your role

### Advanced Skills
- [ ] Execute scaling procedures
- [ ] Restore from backups
- [ ] Analyze performance issues
- [ ] Investigate security incidents
- [ ] Deploy application updates

### Expert Skills
- [ ] Database maintenance procedures
- [ ] Redis optimization
- [ ] Complete system recovery
- [ ] Disaster recovery planning
- [ ] Security hardening

---

## For Your Role

### On-Call SRE (Primary Responder)
Essential:
- [06-alert-response.md](06-alert-response.md) - All alerts
- [03-incident-response.md](03-incident-response.md) - Critical issues
- [02-scaling.md](02-scaling.md) - Quick scaling

### Platform Engineer
Essential:
- [02-scaling.md](02-scaling.md) - Daily scaling
- [04-database-maintenance.md](04-database-maintenance.md) - Maintenance
- [10-upgrade-procedures.md](10-upgrade-procedures.md) - Deployments

### Database DBA
Essential:
- [04-database-maintenance.md](04-database-maintenance.md) - Database ops
- [08-disaster-recovery.md](08-disaster-recovery.md) - Backups
- [07-performance-degradation.md](07-performance-degradation.md) - Tuning

### Security Engineer
Essential:
- [09-security-incident.md](09-security-incident.md) - Security incidents
- [01-deployment.md](01-deployment.md) - Secure deployment
- [10-upgrade-procedures.md](10-upgrade-procedures.md) - Patch management

### Engineering Manager
Essential:
- [INDEX.md](INDEX.md) - Overview
- [03-incident-response.md](03-incident-response.md) - Incident SLAs
- [08-disaster-recovery.md](08-disaster-recovery.md) - RTO/RPO

---

**Last Updated:** November 24, 2024
**Status:** ✓ Production Ready
**All 10 Runbooks:** ✓ Complete
