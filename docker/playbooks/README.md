# CFN Docker Infrastructure Playbooks

**Operational documentation for managing CFN Docker infrastructure**

---

## Quick Navigation

**🔥 Emergency?** → [Quick Reference](QUICK_REFERENCE.md) (print and keep handy!)

**🔧 Daily Operations?** → [Operational Runbook](OPERATIONAL_RUNBOOK.md)

**🐛 Something broken?** → [Troubleshooting Playbook](TROUBLESHOOTING_PLAYBOOK.md)

**🚨 Critical incident?** → [Incident Response Guide](INCIDENT_RESPONSE_GUIDE.md)

**💥 Disaster recovery?** → [Disaster Recovery Guide](DISASTER_RECOVERY_GUIDE.md)

---

## Document Overview

### [Quick Reference](QUICK_REFERENCE.md)
**Purpose:** One-page cheat sheet for common commands and procedures
**Audience:** All operations staff
**Use When:** Daily operations, quick lookups, emergency situations
**Read Time:** 2 minutes
**Print:** Yes! Keep a copy at your desk

**Contains:**
- Emergency commands
- Daily health check (5 min)
- Common tasks (restart, provision, etc.)
- Quick troubleshooting fixes
- Incident severity guide
- Resource limits reference
- Contact information

### [Operational Runbook](OPERATIONAL_RUNBOOK.md)
**Purpose:** Standard operating procedures for routine maintenance
**Audience:** Operations team, SREs
**Use When:** Daily operations, weekly maintenance, team provisioning
**Read Time:** 15 minutes
**Training Required:** Moderate

**Contains:**
- Daily health check procedures (10 min)
- Team provisioning/deprovisioning (20-30 min)
- Resource management procedures
- Weekly maintenance window (2 hours)
- Backup procedures (automated + verification)
- Log management
- Performance monitoring
- Security operations

**Key Procedures:**
1. Morning health check → 10 minutes
2. Provision new team → 20-30 minutes
3. Deprovision team → 15-20 minutes
4. Adjust resource limits → 15 minutes
5. Weekly maintenance → 2 hours
6. Daily backups → Automated (1 AM)

### [Troubleshooting Playbook](TROUBLESHOOTING_PLAYBOOK.md)
**Purpose:** Diagnose and resolve common infrastructure issues
**Audience:** Operations team, on-call engineers
**Use When:** Service degradation, errors, unexpected behavior
**Read Time:** 20 minutes (scan for specific issue)
**Training Required:** Moderate to Advanced

**Contains:**
- Quick reference table (80% of problems)
- 15 common issues with step-by-step fixes
- Coordinator issues (won't start, heartbeat missing)
- Team provisioning failures
- Network issues
- Resource exhaustion
- Agent issues
- Skill access problems
- Database connection issues
- Health check failures
- Escalation procedures
- Useful diagnostic commands

**Issue Categories:**
1. Coordinator Issues (3 scenarios)
2. Team Provisioning Issues (2 scenarios)
3. Network Issues (2 scenarios)
4. Resource Exhaustion (2 scenarios)
5. Agent Issues (2 scenarios)
6. Skill Access Issues (2 scenarios)
7. Database Connection Issues (1 scenario)
8. Health Check Failures (1 scenario)

### [Incident Response Guide](INCIDENT_RESPONSE_GUIDE.md)
**Purpose:** Handle critical incidents and service disruptions
**Audience:** On-call engineers, incident commanders
**Use When:** Service outages, security breaches, critical failures
**Read Time:** 25 minutes
**Training Required:** Advanced

**Contains:**
- Incident severity levels (SEV-1, SEV-2, SEV-3)
- Incident response process (6 steps)
- Critical incidents (SEV-1) procedures
- Major incidents (SEV-2) procedures
- Minor incidents (SEV-3) procedures
- Post-incident review template
- Communication templates
- Emergency contacts

**Severity Definitions:**
- **SEV-1:** Critical → Immediate response → Main coordinator down, all teams affected
- **SEV-2:** Major → 30 min response → Multiple coordinators down, significant degradation
- **SEV-3:** Minor → 4 hour response → Single team issues, limited impact

**Response Process:**
1. Detect and Assess (0-5 min)
2. Communicate (5-10 min)
3. Investigate (parallel)
4. Mitigate (immediate action)
5. Monitor (30-60 min)
6. Resolve

### [Disaster Recovery Guide](DISASTER_RECOVERY_GUIDE.md)
**Purpose:** Recover from catastrophic failures
**Audience:** Senior operations staff, infrastructure leads
**Use When:** Host failure, data corruption, complete outages
**Read Time:** 15 minutes
**Training Required:** Advanced
**RTO (Recovery Time Objective):** 2 hours
**RPO (Recovery Point Objective):** 24 hours

**Contains:**
- Disaster scenarios (3 major scenarios)
- Complete recovery procedures
- Backup verification procedures
- Failover procedures
- Recovery time estimates
- Recovery checklist

**Disaster Scenarios:**
1. Complete host failure → 2 hour RTO, 24 hour RPO
2. PostgreSQL data corruption → 30 min RTO, 24 hour RPO
3. Team workspace data loss → 15 min RTO, 24 hour RPO

---

## When to Use Which Document

### Daily Operations
1. **Morning:** Quick Reference (5 min) + Operational Runbook: Daily Health Check (10 min)
2. **End of Day:** Operational Runbook: End-of-Day Summary (5 min)
3. **Weekly:** Operational Runbook: Weekly Maintenance (2 hours, Sunday 2-4 AM)

### Something Goes Wrong
1. **Check Quick Reference** for emergency commands
2. **Use Troubleshooting Playbook** to diagnose issue
3. **If critical:** Follow Incident Response Guide
4. **If disaster:** Use Disaster Recovery Guide

### Team Management
1. **Provision new team:** Operational Runbook → Team Management → Provisioning
2. **Deprovision team:** Operational Runbook → Team Management → Deprovisioning
3. **Adjust resources:** Operational Runbook → Resource Management

### Backups
1. **Daily backups:** Operational Runbook → Backup Procedures (automated)
2. **Verify backups:** Disaster Recovery Guide → Backup Verification (monthly)
3. **Restore from backup:** Disaster Recovery Guide → Recovery Procedures

---

## Training Path

### Level 1: Basic Operations (Week 1)
**Required Reading:**
1. Quick Reference (2 min)
2. Operational Runbook: Daily Operations (30 min)
3. Troubleshooting Playbook: Quick Reference section (10 min)

**Hands-On:**
- Perform daily health check (shadowed)
- Review logs for errors
- Run quick diagnostic script

**Competency:** Can perform daily health checks independently

### Level 2: Advanced Operations (Week 2-3)
**Required Reading:**
1. Operational Runbook: Full document (1 hour)
2. Troubleshooting Playbook: Full document (1 hour)
3. Incident Response Guide: SEV-3 incidents (30 min)

**Hands-On:**
- Provision test team (with supervision)
- Adjust resource limits (test environment)
- Restart coordinators during maintenance window
- Resolve simulated SEV-3 incident

**Competency:** Can perform routine maintenance and handle minor incidents

### Level 3: Incident Response (Week 4+)
**Required Reading:**
1. Incident Response Guide: Full document (1 hour)
2. Disaster Recovery Guide: Full document (45 min)
3. All playbooks reviewed

**Hands-On:**
- Participate in incident response drill
- Perform backup restore test
- Shadow on-call engineer for one week
- Lead post-incident review

**Competency:** Ready for on-call rotation

---

## Document Maintenance

### Update Frequency
- Quick Reference: After any procedure change
- Operational Runbook: Monthly review, update as needed
- Troubleshooting Playbook: After each new issue resolved
- Incident Response Guide: After each SEV-1 or SEV-2 incident
- Disaster Recovery Guide: Quarterly review, after each DR test

### Version Control
All playbooks are version-controlled in Git:
- Location: `docker/playbooks/`
- Changes: Submit PR for review
- Approvers: Operations Lead, Infrastructure Lead

### Feedback
Found an issue or have a suggestion?
- Slack: #cfn-ops
- Email: ops@company.com
- GitHub: Submit issue or PR

---

## Related Documentation

### Technical Documentation
- **Architecture:** `docker/docs/SPARC/CFN_DOCKER_ORGANIZATIONAL_ARCHITECTURE.md`
- **Requirements:** `docker/docs/SPARC/CFN_DOCKER_INFRASTRUCTURE_REQUIREMENTS_SPEC.md`
- **Provisioning Guide:** `docker/docs/SPARC/CFN_DOCKER_TEAM_PROVISIONING_GUIDE.md`

### Implementation Documentation
- **Phase 1 README:** `docker/PHASE_1_README.md` (deployment guide)
- **Phase 2 Validation:** `docker/PHASE_2_VALIDATION_SUMMARY.md` (test results)
- **Scripts README:** `docker/scripts/README.md` (automation scripts)

### Code
- **Team Configurations:** `docker/config/teams/*.yaml`
- **Automation Scripts:** `docker/scripts/*.sh`
- **Coordinator Code:** `docker/coordinator/main/` and `docker/coordinator/team/`
- **Skills:** `docker/skills/*/`

---

## Quick Commands Cheat Sheet

### Health Checks
```bash
# Overall status
docker ps --format "table {{.Names}}\t{{.Status}}" | grep cfn-

# Resource usage
docker stats --no-stream | grep cfn-

# Service connectivity
docker exec cfn-redis redis-cli PING
docker exec cfn-postgres pg_isready
```

### Common Operations
```bash
# Restart main coordinator
docker restart cfn-docker-main-coordinator

# Restart team coordinator
docker restart cfn-docker-team-coordinator-[TEAM]

# Provision new team
./docker/scripts/provision-team.sh --config docker/config/teams/[TEAM].yaml --dry-run
./docker/scripts/provision-team.sh --config docker/config/teams/[TEAM].yaml \
  --create-workspace --create-network --spawn-redis --spawn-coordinator
```

### Diagnostics
```bash
# Logs (last 50 lines)
docker logs cfn-docker-main-coordinator --tail 50

# Logs (follow)
docker logs cfn-docker-team-coordinator-seo --follow

# Full diagnostic
/tmp/cfn-diagnostic.sh
```

---

## Emergency Procedures

### SEV-1: Main Coordinator Down
1. Check Quick Reference → Emergency Commands
2. Follow Incident Response Guide → SEV-1 → Main Coordinator Down
3. Page on-call immediately
4. Update status page every 15 minutes

### SEV-1: PostgreSQL Offline
1. Check Incident Response Guide → SEV-1 → PostgreSQL Database Offline
2. Attempt restart: `docker start cfn-postgres`
3. If failed, follow Disaster Recovery Guide → PostgreSQL Data Corruption
4. Page database administrator immediately

### Complete Disaster
1. Declare SEV-1 incident
2. Follow Disaster Recovery Guide → Scenario 1: Complete Host Failure
3. Notify management within 15 minutes
4. Estimated recovery time: 2 hours

---

## Support

**Operations Team:**
- Email: ops@company.com
- Slack: #cfn-ops
- Phone: +1-XXX-XXX-XXXX

**On-Call Engineer:**
- PagerDuty: [rotation link]
- Emergency: +1-XXX-XXX-XXXX

**Infrastructure Team:**
- Email: infra@company.com
- Slack: #infra-team

---

## Document Status

| Document | Version | Last Updated | Status |
|----------|---------|--------------|--------|
| Quick Reference | 1.0.0 | 2025-11-15 | ✅ Current |
| Operational Runbook | 1.0.0 | 2025-11-15 | ✅ Current |
| Troubleshooting Playbook | 1.0.0 | 2025-11-15 | ✅ Current |
| Incident Response Guide | 1.0.0 | 2025-11-15 | ✅ Current |
| Disaster Recovery Guide | 1.0.0 | 2025-11-15 | ✅ Current |

**All playbooks:** Phase 4 - Operational Codification complete ✅

---

**Need something else?** Check the main project README or contact the operations team.
