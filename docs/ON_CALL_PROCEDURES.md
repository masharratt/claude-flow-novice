# On-Call Procedures

**Version:** 1.0
**Last Updated:** 2025-11-24
**Maintainer:** Platform Team

---

## Table of Contents

1. [Overview](#overview)
2. [On-Call Rotation](#on-call-rotation)
3. [Responsibilities](#responsibilities)
4. [Handoff Procedures](#handoff-procedures)
5. [Escalation Policies](#escalation-policies)
6. [Communication Protocols](#communication-protocols)
7. [Incident Management](#incident-management)
8. [Post-Incident Review](#post-incident-review)
9. [Tools and Access](#tools-and-access)
10. [Common Issues Quick Reference](#common-issues-quick-reference)
11. [Contact Information](#contact-information)

---

## Overview

The on-call engineer is responsible for monitoring system health, responding to alerts, and resolving incidents affecting the CFN (Claude Flow Novice) platform. This document defines procedures, responsibilities, and escalation paths for on-call engineers.

**On-Call Commitment:**
- 24/7 availability during rotation (typically 1 week)
- 15-minute response time for P0 incidents
- 30-minute response time for P1 incidents
- 1-hour response time for P2 incidents

**Support Coverage:**
- Primary on-call: First responder
- Secondary on-call: Backup for escalations
- Manager escalation: After 2 hours for P0, 4 hours for P1

---

## On-Call Rotation

### Schedule

**Rotation Duration:** 1 week (Monday 9:00 AM to Monday 9:00 AM)

**Coverage Tiers:**
- **Primary On-Call:** First responder for all alerts
- **Secondary On-Call:** Backup, responds if primary unavailable
- **Manager On-Call:** Escalation point after defined thresholds

**Current Schedule Location:**
- PagerDuty: https://cfn-platform.pagerduty.com/schedules
- Shared Calendar: CFN On-Call Rotation (Google Calendar)
- Internal Wiki: https://wiki.company.com/oncall

### Rotation Frequency

| Role | Rotation | Override Policy |
|------|----------|-----------------|
| Primary On-Call | Weekly | Can swap with team member (notify manager) |
| Secondary On-Call | Weekly (offset by 3 days) | Must maintain coverage |
| Manager On-Call | Monthly | Director escalation available |

### Coverage Gaps

**If you need coverage:**
1. Find a team member to swap shifts
2. Update PagerDuty schedule at least 24 hours in advance
3. Notify team in #cfn-oncall Slack channel
4. Document swap in rotation log

**Emergency leave:**
1. Notify manager immediately
2. Manager arranges emergency coverage
3. Update PagerDuty and team channels

---

## Responsibilities

### During On-Call Shift

**Monitoring:**
- Review Grafana dashboards hourly during business hours
- Monitor PagerDuty for incoming alerts
- Check #cfn-alerts Slack channel for notifications
- Review system health at start and end of shift

**Incident Response:**
- Acknowledge alerts within response time SLAs
- Follow runbooks for known incident types
- Escalate to secondary or manager when needed
- Document all actions taken in incident log
- Update stakeholders on incident status

**Communication:**
- Post incident updates in #cfn-incidents channel
- Notify affected teams if user-facing impact
- Coordinate with security team for security incidents
- Escalate to leadership for P0 incidents >30 minutes

**Documentation:**
- Update runbooks with new findings
- Create post-incident reviews for P0/P1 incidents
- Log all incidents in incident management system
- Document workarounds and permanent fixes

### Outside On-Call Shift

**Knowledge Transfer:**
- Participate in weekly on-call retrospectives
- Review and improve runbooks quarterly
- Mentor new team members on on-call procedures
- Contribute to incident response training

**System Reliability:**
- Proactively reduce alert noise
- Improve monitoring and alerting
- Address root causes from post-incident reviews
- Implement preventive measures

---

## Handoff Procedures

### Pre-Handoff Checklist (Outgoing On-Call)

Complete 24 hours before rotation ends:

- [ ] Review all open incidents (target: zero)
- [ ] Document ongoing issues in handoff notes
- [ ] Update runbooks with any new procedures used
- [ ] Complete all post-incident reviews
- [ ] Verify all temporary fixes have follow-up tickets
- [ ] Check system health metrics (no degraded services)
- [ ] Prepare handoff document (template below)
- [ ] Schedule 30-minute handoff call with incoming on-call
- [ ] Verify incoming on-call has necessary access
- [ ] Transfer PagerDuty primary status

### Handoff Document Template

```markdown
# On-Call Handoff - [DATE]

## Outgoing: [Name]
## Incoming: [Name]

### Week Summary
- Total incidents: [count] (P0: X, P1: Y, P2: Z)
- Total pages: [count]
- Average response time: [minutes]
- System uptime: [%]

### Open Issues
1. **[Issue Title]** - Severity: [P0/P1/P2]
   - Status: [In progress / Monitoring / Escalated]
   - Description: [brief description]
   - Next steps: [action items]
   - Owner: [if escalated]
   - Ticket: [JIRA-123]

2. [Additional issues...]

### Recent Changes
- [Deployment/Config change] - [Date] - [Impact]
- [Infrastructure change] - [Date] - [Notes]

### Known Issues / Workarounds
- [System/Component]: [Issue description] - [Workaround]
- [Agent type]: [Known bug] - [Temporary fix]

### Upcoming Maintenance
- [Date]: [Maintenance description] - [Expected impact]
- [Date]: [Scheduled upgrade] - [Downtime window]

### Alerts to Watch
- [Alert name]: [Why monitoring] - [Threshold to escalate]
- [Metric]: [Trend to watch] - [Action if worsens]

### System Health Notes
- Redis: [Status and notes]
- PostgreSQL: [Status and notes]
- Docker daemon: [Status and notes]
- Agent performance: [Trends and concerns]
- Cost metrics: [Any teams over budget]

### Runbook Updates
- [Runbook name]: [What was added/changed]
- [Procedure]: [New steps documented]

### Handoff Call Notes
[Notes from 30-minute handoff call]

### Questions / Action Items
- [Question for incoming on-call]
- [Action item with ticket number]
```

### Handoff Call Agenda (30 minutes)

1. **System Overview (5 min)**
   - Current health status
   - Recent incidents summary
   - Any degraded services

2. **Open Issues (10 min)**
   - Walk through each open issue
   - Explain context and next steps
   - Identify if escalation needed

3. **Known Issues (5 min)**
   - Recurring alerts and workarounds
   - Systems requiring special attention
   - Upcoming maintenance windows

4. **Recent Changes (5 min)**
   - Deployments and configuration changes
   - New monitoring or alerts added
   - Infrastructure updates

5. **Questions & Access Verification (5 min)**
   - Answer incoming on-call questions
   - Verify access to all tools
   - Confirm PagerDuty transfer

### Post-Handoff Checklist (Incoming On-Call)

Complete within 1 hour of handoff:

- [ ] Review handoff document thoroughly
- [ ] Verify PagerDuty primary on-call status
- [ ] Test pager (send test alert)
- [ ] Access all monitoring dashboards (Grafana, Prometheus)
- [ ] Review current system health
- [ ] Read all open incident tickets
- [ ] Verify access to all critical systems
- [ ] Introduce yourself in #cfn-oncall Slack channel
- [ ] Review runbooks for any unfamiliar procedures
- [ ] Set up laptop/phone for on-call week

---

## Escalation Policies

### Incident Severity Levels

| Severity | Definition | Response Time | Escalation Time |
|----------|-----------|---------------|-----------------|
| **P0** | Total system outage, data loss risk | 5 minutes | 30 minutes |
| **P1** | Major functionality impaired | 15 minutes | 2 hours |
| **P2** | Minor functionality degraded | 30 minutes | 4 hours |
| **P3** | Cosmetic issue, low impact | 24 hours | N/A |

### P0 Escalation Path

**Definition:** Complete system unavailability, data loss in progress, security breach

1. **0-5 min:** Primary on-call acknowledges and begins incident response
2. **5 min:** Post in #cfn-incidents: "P0 incident - [brief description] - investigating"
3. **10 min:** Notify secondary on-call if assistance needed
4. **15 min:** Page manager on-call
5. **30 min:** If not resolved, escalate to director
6. **30 min:** Notify VP Engineering and security team (if security-related)
7. **Every 30 min:** Post status update in #cfn-incidents

**P0 Examples:**
- Docker daemon completely unavailable
- Redis connection loss (all coordination blocked)
- PostgreSQL connection loss (all persistence blocked)
- Security breach or data exfiltration
- Complete agent spawn failure (>90% failure rate)

### P1 Escalation Path

**Definition:** Major system degradation, significant user impact

1. **0-15 min:** Primary on-call acknowledges and begins troubleshooting
2. **15 min:** Post in #cfn-alerts: "P1 incident - [brief description] - working on fix"
3. **1 hour:** Notify secondary on-call for collaboration
4. **2 hours:** Page manager on-call if not resolved
5. **4 hours:** Escalate to director if still unresolved
6. **Every hour:** Post status update

**P1 Examples:**
- High agent spawn failure rate (>10%)
- CFN Loop stuck for >1 hour
- High cost per team (>$10/hour)
- Disk space exhaustion (>90%)
- High memory usage causing OOM kills

### P2 Escalation Path

**Definition:** Minor degradation, limited user impact, can wait for business hours

1. **0-30 min:** Primary on-call acknowledges
2. **1 hour:** Begin investigation and mitigation
3. **4 hours:** Escalate to manager if complex or assistance needed
4. **Next business day:** Resolve or create follow-up ticket

**P2 Examples:**
- Certificate expiring in <7 days
- Monitoring alert noise (false positives)
- Single agent type failing (others working)
- Performance degradation (not outage)

### Escalation Contact Methods

**Primary On-Call:**
- PagerDuty alert (high priority)
- Slack DM (urgent)
- Phone call (if no response in 5 min)

**Secondary On-Call:**
- PagerDuty escalation (automatic after timeout)
- Slack mention in #cfn-oncall
- Phone call

**Manager On-Call:**
- PagerDuty escalation
- Slack DM + #cfn-incidents mention
- Phone call (P0 only)

---

## Communication Protocols

### Slack Channels

**#cfn-alerts** (Automated Alerts)
- All Prometheus alerts post here
- Alertmanager integration
- No human discussion (alerts only)

**#cfn-incidents** (Active Incident Coordination)
- Post when starting incident response
- Status updates every 30 min (P0) or 1 hour (P1)
- Incident resolution announcements
- Tag relevant team members

**#cfn-oncall** (On-Call Coordination)
- Shift handoffs
- Schedule swaps
- General on-call questions
- Weekly retrospectives

**#cfn-postmortems** (Post-Incident Reviews)
- Share completed post-incident reviews
- Discuss lessons learned
- Track action items

### Incident Update Template

Post in **#cfn-incidents**:

```
🚨 [P0/P1/P2] [Incident Title]

Status: INVESTIGATING | MITIGATING | MONITORING | RESOLVED
Time: [HH:MM] UTC
Affected: [Systems/Teams/Users]

Description:
[Brief description of issue and impact]

Actions Taken:
- [Action 1]
- [Action 2]

Next Steps:
- [Next action]

ETA: [Estimated resolution time or "unknown"]

Updates: Will update every [30min/1hour]
```

**Example:**
```
🚨 P0 Redis Connection Loss

Status: MITIGATING
Time: 14:32 UTC
Affected: All CFN coordination workflows

Description:
Redis container crashed due to OOM. All agent coordination blocked.

Actions Taken:
- Restarted Redis container (14:35)
- Verified data persistence (14:37)
- Restarted dependent services (14:40)

Next Steps:
- Monitor for stability (15min)
- Identify root cause (memory leak?)
- Implement prevention (increase memory limit)

ETA: Service restored, monitoring for 15 min

Updates: Will update at 14:50 UTC
```

### Status Page Updates

**For user-facing incidents (P0/P1 with external impact):**

1. Update status page within 15 minutes of incident start
2. Post initial message: "Investigating reports of [issue]"
3. Update every 30 minutes with progress
4. Post resolution message when fixed
5. Schedule post-incident review link after PIR complete

**Status Page URL:** https://status.cfn-platform.com (if available)

### Stakeholder Notifications

**Who to notify:**

| Severity | Internal | External |
|----------|----------|----------|
| P0 | Manager, Director, VP Eng, Security (if applicable) | Users via status page |
| P1 | Manager, affected team leads | Users if user-facing |
| P2 | Document in ticket | None |

**When to notify:**
- P0: Immediately (within 15 minutes)
- P1: Within 1 hour if user-facing
- P2: Next business day via ticket

---

## Incident Management

### Incident Response Workflow

**1. Alert Received**
- Acknowledge in PagerDuty (stops escalation timer)
- Check Grafana dashboard for context
- Review related logs in affected systems

**2. Initial Assessment (5 minutes)**
- Determine severity (P0/P1/P2)
- Identify affected systems and user impact
- Check for known issues or recent changes
- Post initial status in #cfn-incidents (P0/P1 only)

**3. Mitigation (Focus on restoration)**
- Follow relevant runbook if available
- Document all actions taken
- Escalate if needed (see escalation policies)
- Update stakeholders every 30 min (P0) or 1 hour (P1)

**4. Resolution**
- Verify fix resolves issue
- Monitor for 15 minutes to confirm stability
- Post resolution message in #cfn-incidents
- Clear alert in Prometheus/PagerDuty

**5. Documentation**
- Create incident ticket with details
- Start post-incident review (P0/P1 within 24 hours)
- Update runbooks with new procedures
- Document temporary vs permanent fixes

### Incident Commander Role

**For P0 incidents lasting >30 minutes:**

One person becomes Incident Commander (usually primary on-call):

**Responsibilities:**
- Coordinate multiple responders
- Make decisions about mitigation approach
- Communicate with stakeholders
- Manage incident timeline
- Delegate tasks to team members
- Run post-incident review

**Delegation Examples:**
- "Engineer A: Investigate database logs"
- "Engineer B: Check agent spawn rates"
- "Manager: Notify customers via status page"

### War Room Procedures

**When to create war room:**
- P0 incidents lasting >30 minutes
- P1 incidents requiring multiple engineers
- Any incident needing real-time collaboration

**War Room Setup:**
1. Create dedicated Slack channel: #incident-YYYYMMDD-description
2. Invite: Incident Commander, responding engineers, manager
3. Post incident summary (pinned message)
4. Use thread for updates, main channel for coordination

**War Room Etiquette:**
- Incident Commander directs discussion
- Engineers report status updates
- Avoid speculation, focus on facts
- Document all significant findings
- Stay focused on resolution, not blame

---

## Post-Incident Review

### When Required

**Mandatory PIR:**
- All P0 incidents
- P1 incidents with user impact
- P1 incidents lasting >2 hours
- Any incident with data loss
- Any security incident

**Optional PIR:**
- P2 incidents with interesting learnings
- Recurring issues (even if low severity)
- Near-misses (almost caused outage)

### Timeline

- **Within 24 hours:** Draft PIR (P0/P1)
- **Within 48 hours:** Review with team (P0)
- **Within 1 week:** Complete and share (all PIRs)

### Post-Incident Review Template

See full template in each runbook. Key sections:

1. **Timeline:** Minute-by-minute incident progression
2. **Root Cause:** Technical explanation (5 whys analysis)
3. **Impact:** Duration, affected users, data loss, cost
4. **Resolution:** What fixed it (immediate and permanent)
5. **Lessons Learned:** What went well, what didn't
6. **Action Items:** Specific, assigned, with due dates

### PIR Review Meeting

**Attendees:**
- Incident responders
- Manager
- Affected team leads
- Subject matter experts

**Agenda (60 minutes):**
1. Incident summary (5 min) - Incident Commander presents
2. Timeline walkthrough (15 min) - Discuss key decision points
3. Root cause analysis (15 min) - Technical deep dive
4. Lessons learned (15 min) - What went well, what didn't
5. Action items (10 min) - Assign owners and due dates

**Blameless Culture:**
- Focus on systems and processes, not individuals
- Assume good intent
- Identify improvements, not fault
- Create psychological safety

---

## Tools and Access

### Required Access

**Before first on-call shift, verify you have:**

- [ ] PagerDuty access (admin level)
- [ ] Grafana access (editor level)
- [ ] Prometheus access (read-only)
- [ ] Slack access to all CFN channels
- [ ] SSH access to production servers
- [ ] Docker access (sudo docker commands)
- [ ] PostgreSQL access (read/write)
- [ ] Redis access (read/write)
- [ ] GitHub access (for emergency fixes)
- [ ] JIRA access (for incident tickets)
- [ ] Status page access (for customer updates)

**Request access:** Contact manager or #cfn-platform-access

### Tool Quick Reference

**Grafana Dashboards:**
- Agent Performance: http://localhost:3000/d/agent-performance
- Team Activity: http://localhost:3000/d/team-activity
- Cost Allocation: http://localhost:3000/d/cost-allocation
- System Resources: http://localhost:3000/d/system-resources

**Prometheus:**
- Alerts: http://localhost:9090/alerts
- Targets: http://localhost:9090/targets
- Graph: http://localhost:9090/graph

**PagerDuty:**
- Dashboard: https://cfn-platform.pagerduty.com
- Mobile App: Install and test before rotation

**Runbooks:**
- Location: `/mnt/wsl/.../docs/runbooks/`
- Index: `docs/runbooks/README.md`
- Quick access: Bookmark in browser

### Emergency Procedures

**If you lose access during incident:**
1. Notify secondary on-call immediately
2. Attempt access via alternate method (VPN, mobile)
3. Escalate to manager if >10 minutes to restore access
4. Document access issue for security team

**If monitoring is down:**
1. Direct SSH to servers and check manually
2. Use `docker ps`, `docker stats` for container health
3. Check logs: `docker logs <container>`
4. Monitor system with `top`, `free`, `df -h`

---

## Common Issues Quick Reference

### Top 5 Frequent Incidents

**1. Agent Spawn Failures (P1)**
- **Symptoms:** Spawn rate >10% failures
- **Quick Fix:** Clear Redis locks, restart Docker if needed
- **Runbook:** [agent-spawn-failure.md](runbooks/agent-spawn-failure.md)

**2. Redis Connection Loss (P0)**
- **Symptoms:** All coordination blocked
- **Quick Fix:** Restart Redis container, verify data persistence
- **Runbook:** [redis-connection-loss.md](runbooks/redis-connection-loss.md)

**3. High Cost Per Team (P2)**
- **Symptoms:** Team cost >$10/hour
- **Quick Fix:** Kill long-running agents, switch to Z.ai
- **Runbook:** [high-cost-per-team.md](runbooks/high-cost-per-team.md)

**4. Disk Space Exhaustion (P1)**
- **Symptoms:** >90% disk usage
- **Quick Fix:** `docker system prune -af`, truncate logs
- **Runbook:** [disk-space-exhaustion.md](runbooks/disk-space-exhaustion.md)

**5. CFN Loop Stuck (P1)**
- **Symptoms:** Task in same phase >1 hour
- **Quick Fix:** Resend coordination signal, kill stuck agents
- **Runbook:** [cfn-loop-stuck.md](runbooks/cfn-loop-stuck.md)

### Quick Commands Cheat Sheet

```bash
# Check system health
docker ps                           # Container status
docker stats --no-stream           # Resource usage
redis-cli PING                     # Redis health
docker exec cfn-postgres pg_isready # PostgreSQL health

# Common fixes
docker restart cfn-redis           # Restart Redis
docker system prune -af            # Clean Docker
redis-cli KEYS "spawn:lock:*" | xargs redis-cli DEL  # Clear locks
truncate -s 0 /var/lib/docker/containers/*/*-json.log # Truncate logs

# Monitoring
curl http://localhost:9090/alerts # Prometheus alerts
docker logs cfn-orchestrator --tail 100 # Recent logs
df -h                             # Disk space
free -h                           # Memory usage
```

---

## Contact Information

### On-Call Rotation

**Current Primary:** Check PagerDuty or #cfn-oncall Slack pinned message
**Current Secondary:** Check PagerDuty or #cfn-oncall Slack pinned message
**Manager On-Call:** Check PagerDuty escalation schedule

### Escalation Contacts

**Platform Team Manager:**
- Name: [Manager Name]
- Slack: @manager
- Phone: [REDACTED]
- Email: manager@company.com

**Director of Engineering:**
- Name: [Director Name]
- Slack: @director
- Phone: [REDACTED] (P0 only)
- Email: director@company.com

**VP Engineering:**
- Name: [VP Name]
- Phone: [REDACTED] (P0 >30 min only)
- Email: vp@company.com

**Security Team (24/7):**
- Slack: #security-incidents
- Email: security@company.com
- Phone: [REDACTED]

### Team Contacts

**Database Team:**
- Slack: #database-team
- On-Call: See PagerDuty

**Infrastructure Team:**
- Slack: #infrastructure
- On-Call: See PagerDuty

**Security Team:**
- Slack: #security
- On-Call: See PagerDuty (24/7)

---

## Appendix

### Severity Matrix

| Impact | User-Facing | Internal Only |
|--------|-------------|---------------|
| **Total Outage** | P0 | P0 |
| **Major Degradation** | P0 | P1 |
| **Minor Degradation** | P1 | P2 |
| **Cosmetic/Low Impact** | P2 | P3 |

### Response Time SLAs

| Severity | Acknowledge | Initial Response | Escalation |
|----------|-------------|------------------|------------|
| P0 | 5 min | 5 min | 30 min |
| P1 | 15 min | 15 min | 2 hours |
| P2 | 30 min | 1 hour | 4 hours |
| P3 | 24 hours | Next business day | N/A |

### On-Call Compensation

- **Base on-call pay:** Per company policy
- **Incident response:** Per company policy
- **Comp time:** Available for extended incidents (>4 hours)

### Training Resources

- **On-Call Training:** [Internal wiki link]
- **Runbook Training:** Quarterly hands-on workshop
- **Incident Response Drill:** Annual chaos engineering day
- **New Hire Training:** 2-week shadowing before first rotation

---

**Questions or Feedback:**
Contact Platform Team Manager or post in #cfn-oncall

**Document Updates:**
Submit PR to update this document or contact Platform Team
