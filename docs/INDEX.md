# CFN Platform Documentation Index

**Last Updated:** 2025-11-24
**Maintainer:** Platform Team

Welcome to the CFN (Claude Flow Novice) Platform documentation. This index provides quick access to all platform documentation organized by category.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Operations & Monitoring](#operations--monitoring)
3. [Incident Response](#incident-response)
4. [Training Materials](#training-materials)
5. [Development Guides](#development-guides)
6. [Architecture & Design](#architecture--design)
7. [Security & Compliance](#security--compliance)
8. [Search Tips](#search-tips)

---

## Quick Start

**New to CFN? Start here:**

### For Operations Teams
1. Read: [MONITORING_GUIDE.md](MONITORING_GUIDE.md) - Comprehensive monitoring setup (600+ lines)
2. Read: [ON_CALL_PROCEDURES.md](ON_CALL_PROCEDURES.md) - On-call responsibilities and procedures
3. Complete: [Training: Operator Training](training/operator-training.md) - 2-day workshop
4. Review: [Runbooks Index](#incident-response) - All incident response procedures

### For Development Teams
1. Complete: [Training: Team Onboarding](training/team-onboarding.md) - 1-day guide
2. Review: [CFN Loop Architecture](CFN_LOOP_ARCHITECTURE.md)
3. Explore: [Grafana Dashboards](http://localhost:3000) - Team activity, costs, performance
4. Join: #cfn-users Slack channel

### For Security Teams
1. Read: [Shell Error Handling Guide](SHELL_ERROR_HANDLING_GUIDE.md) - Security best practices
2. Review: Security runbooks (certificate expiration, backup failure)
3. Access: Security logs and audit trails

---

## Operations & Monitoring

### Core Monitoring Documentation

| Document | Description | Audience | Length |
|----------|-------------|----------|--------|
| [MONITORING_GUIDE.md](MONITORING_GUIDE.md) | Complete monitoring setup, metrics, dashboards | Ops, SRE | 600+ lines |
| [ALERTING_GUIDE.md](ALERTING_GUIDE.md) | Alert configuration, severity, routing, tuning | Ops, SRE | Comprehensive |
| [ON_CALL_PROCEDURES.md](ON_CALL_PROCEDURES.md) | Rotation, handoff, escalation, communication | On-call | Complete |

### Monitoring Components

**Prometheus:**
- **URL:** http://localhost:9090
- **Config:** `/mnt/wsl/.../monitoring/prometheus.yml`
- **Rules:** `/mnt/wsl/.../monitoring/prometheus-rules.yml` (24 alerts)
- **Docs:** [Prometheus Official](https://prometheus.io/docs/)

**Grafana:**
- **URL:** http://localhost:3000
- **Dashboards:**
  - Agent Performance: http://localhost:3000/d/agent-performance
  - Team Activity: http://localhost:3000/d/team-activity
  - Cost Allocation: http://localhost:3000/d/cost-allocation
  - System Resources: http://localhost:3000/d/system-resources
- **Guide:** See [MONITORING_GUIDE.md](MONITORING_GUIDE.md) Section 5

**Alertmanager:**
- **URL:** http://localhost:9093
- **Config:** `/mnt/wsl/.../monitoring/alertmanager-config.yml`
- **Integrations:** PagerDuty, Slack
- **Guide:** See [ALERTING_GUIDE.md](ALERTING_GUIDE.md)

### Alert Reference

**24 Configured Alerts:**

**P0 Alerts (Critical - Page Immediately):**
- DockerDaemonUnavailable
- RedisConnectionLoss
- PostgresConnectionLoss
- NetworkPartition

**P1 Alerts (High - Page Business Hours):**
- HighAgentSpawnFailureRate
- CFNLoopStuck
- HighDiskUsage
- HighMemoryUsagePerAgent
- BackupFailure
- ContainerRestartLoop
- PostgresConnectionPoolFull
- OrchestatorDeadlock
- CoordinationTimeout
- HighErrorRate

**P2 Alerts (Medium - Notify Only):**
- HighCostPerTeam
- CertificateExpiringSoon
- HighCPUUsage
- HighSwapUsage
- HighNetworkErrors
- SlowQueryDetected
- RedisMemoryHigh
- HighLatency
- LowAgentSuccessRate
- DiskWriteSlow

**Complete details:** [ALERTING_GUIDE.md](ALERTING_GUIDE.md#alert-rules-reference)

---

## Incident Response

### Runbooks

**Location:** `/mnt/wsl/.../docs/runbooks/`

**Available Runbooks (10):**

| # | Runbook | Severity | Response Time | Description |
|---|---------|----------|---------------|-------------|
| 1 | [agent-spawn-failure.md](runbooks/agent-spawn-failure.md) | P1 | 15 min | Agent spawn failure rate >10% |
| 2 | [redis-connection-loss.md](runbooks/redis-connection-loss.md) | P0 | 5 min | Redis unavailable (coordination blocked) |
| 3 | [postgres-connection-loss.md](runbooks/postgres-connection-loss.md) | P0 | 5 min | PostgreSQL unavailable (persistence blocked) |
| 4 | [docker-daemon-unavailable.md](runbooks/docker-daemon-unavailable.md) | P0 | 5 min | Docker daemon unresponsive |
| 5 | [disk-space-exhaustion.md](runbooks/disk-space-exhaustion.md) | P1 | 15 min | Disk usage >90% |
| 6 | [high-cost-per-team.md](runbooks/high-cost-per-team.md) | P2 | 30 min | Team cost >$10/hour |
| 7 | [cfn-loop-stuck.md](runbooks/cfn-loop-stuck.md) | P1 | 15 min | Task stuck >1 hour without progress |
| 8 | [certificate-expiration.md](runbooks/certificate-expiration.md) | P2 | 30 min | Certificate expiring <7 days |
| 9 | [memory-exhaustion.md](runbooks/memory-exhaustion.md) | P1 | 15 min | Agent memory >2GB |
| 10 | [backup-failure.md](runbooks/backup-failure.md) | P1 | 15 min | No successful backup in 24 hours |

### Runbook Template

All runbooks follow this structure:
1. **Alert Information** - Severity, threshold, notification channels
2. **Symptoms** - Observable signs of the issue
3. **Diagnosis** - Step-by-step investigation procedures
4. **Resolution** - Immediate actions + complete fix
5. **Verification Checklist** - Confirm issue resolved
6. **Prevention** - Configuration changes, monitoring improvements
7. **Post-Incident** - PIR template and requirements
8. **Related Alerts** - Links to related runbooks
9. **References** - Dashboards, docs, code

### Escalation & Communication

**Escalation Policies:**
- P0: Escalate after 30 minutes
- P1: Escalate after 2 hours
- P2: Escalate after 4 hours

**Communication Channels:**
- **#cfn-incidents:** Active incident coordination (P0/P1)
- **#cfn-alerts:** Automated alert notifications (all)
- **#cfn-oncall:** On-call coordination, shift swaps
- **PagerDuty:** High-urgency pages (P0/P1)

**Full procedures:** [ON_CALL_PROCEDURES.md](ON_CALL_PROCEDURES.md)

---

## Training Materials

### Available Courses

| Course | Duration | Audience | Prerequisites | Certificate |
|--------|----------|----------|---------------|-------------|
| [Operator Training](training/operator-training.md) | 2 days | Ops, SRE, On-call | Basic Docker/Linux | CFN Operator Level 1 |
| [Team Onboarding](training/team-onboarding.md) | 1 day | Dev teams | Git, CI/CD basics | N/A |
| [Incident Response](training/incident-response-training.md) | Half-day | On-call engineers | Operator training | Incident Response Certified |
| [Monitoring Workshop](training/monitoring-workshop.md) | 1 day | SRE, Platform eng | PromQL basics | CFN Monitoring Specialist |

### Training Paths

**Path 1: Operations Engineer**
1. Complete: Operator Training (2 days)
2. Shadow: On-call shift (1 week)
3. Complete: Incident Response Training (half-day)
4. Solo: First on-call shift
5. Optional: Monitoring Workshop (1 day)

**Path 2: Development Team**
1. Complete: Team Onboarding (1 day)
2. Execute: 3 real CFN tasks (week 1)
3. Attend: Tuesday office hours
4. Monitor: Cost dashboard daily

**Path 3: Monitoring Specialist**
1. Complete: Operator Training (2 days)
2. Complete: Monitoring Workshop (1 day)
3. Build: Custom dashboard
4. Contribute: Alert rule improvements

---

## Development Guides

### CFN Loop & Architecture

| Document | Description | Key Topics |
|----------|-------------|------------|
| [CFN_LOOP_ARCHITECTURE.md](CFN_LOOP_ARCHITECTURE.md) | Complete CFN Loop design | 3-phase workflow, test-driven validation |
| [CFN_LOOP_TASK_MODE.md](../. claude/commands/CFN_LOOP_TASK_MODE.md) | Task mode execution | Agent specialization, backlog management |
| [CUSTOM_PROVIDER_ROUTING.md](CUSTOM_PROVIDER_ROUTING.md) | AI provider routing | Z.ai, Kimi, Anthropic, cost optimization |

### Testing & Quality

| Document | Description | Coverage |
|----------|-------------|----------|
| [tests/README.md](../tests/README.md) | Test suite overview | CLI, Docker, integration tests |
| [tests/CLAUDE.md](../tests/CLAUDE.md) | Test authoring standards | GIVEN/WHEN/THEN patterns |
| [Test Coverage Matrix](../tests/TEST_COVERAGE_MATRIX.md) | Coverage by component | 159 CLI assertions, 45 Docker tests |

**Test Suites:**
- **CLI Mode:** 8 suites, 159 assertions (5-10 min)
- **Docker Mode:** 45 tests, 3 categories (3-5 min)
- **Unit Tests:** npm test (~1 min)
- **Integration Tests:** npm run test:integration (~2 min)

### Operational Scripts

**Location:** `/mnt/wsl/.../scripts/`

**Key Scripts:**

| Script | Purpose | Usage |
|--------|---------|-------|
| `alerting/pagerduty-integration.sh` | Send PagerDuty alerts | `./script.sh P1 "Alert" "Description"` |
| `alerting/slack-integration.sh` | Send Slack notifications | `./script.sh P2 "Alert" "Message"` |
| `backup/postgres-backup.sh` | PostgreSQL backup | Runs hourly via cron |
| `backup/redis-backup.sh` | Redis backup | Runs hourly via cron |
| `cost-allocation-tracker.sh` | Cost reporting | `./script.sh --report --team=<name>` |
| `docker/build-from-linux.sh` | Fast Docker builds | `DOCKERFILE=... ./script.sh` |
| `lib/validation.sh` | Shell error handling | Source in scripts |

---

## Architecture & Design

### System Architecture

```
User → Main Chat → CLI Mode (/cfn-loop-cli)
                       ↓
                   Coordinator
                       ↓
                   Orchestrator
                       ↓
                   Agents (Docker)
                       ↓
              Coordination Layer (Redis)
                       ↓
              Persistence Layer (PostgreSQL)
```

### Core Components

| Component | Technology | Purpose | Port |
|-----------|-----------|---------|------|
| Main Chat | Claude API | User interface, task initiation | N/A |
| Coordinator | Node.js | CFN Loop management | N/A |
| Orchestrator | Bash | Agent lifecycle, monitoring | N/A |
| Agents | Docker | Specialized AI workers | Dynamic |
| Redis | Redis 7 | Coordination signals, task queue | 6379 |
| PostgreSQL | PostgreSQL 14 | Task metadata, agent lifecycle | 5432 |
| Prometheus | Prometheus | Metrics collection, alerting | 9090 |
| Grafana | Grafana | Visualization, dashboards | 3000 |
| Alertmanager | Alertmanager | Alert routing | 9093 |

### Data Flow

**1. Task Execution:**
```
User task → Coordinator → Orchestrator → Agent spawn → Work complete → Signal Redis → Gate check → Next phase
```

**2. Monitoring Flow:**
```
Agents → Prometheus scrape → Alert rules → Alertmanager → PagerDuty/Slack
```

**3. Cost Tracking:**
```
Agent usage → PostgreSQL record → Prometheus query → Grafana dashboard → Cost alerts
```

---

## Security & Compliance

### Security Documentation

| Document | Description | Key Topics |
|----------|-------------|------------|
| [SHELL_ERROR_HANDLING_GUIDE.md](SHELL_ERROR_HANDLING_GUIDE.md) | Secure shell scripting | Input validation, error handling |
| [Security Testing](../tests/security/) | Security test suite | Label injection, access control |

### Security Best Practices

**1. Shell Script Security:**
- Always use `set -euo pipefail`
- Validate all inputs with `sanitize_input()` from validation.sh
- Use `sanitize_label()` for Docker labels
- Never hardcode API keys
- Redact sensitive data in logs

**2. Container Security:**
- Run containers as non-root
- Use minimal base images
- Scan images for vulnerabilities
- Limit container resources (CPU, memory)
- Network isolation via Docker networks

**3. Access Control:**
- Role-based access (operators, developers, admins)
- SSH key authentication (no passwords)
- Audit trails in PostgreSQL
- Secret management (no secrets in git)

**4. Monitoring Security:**
- Monitor authentication failures
- Alert on unusual spawn patterns
- Track cost anomalies (potential abuse)
- Log all administrative actions

### Compliance

**Data Retention:**
- Logs: 7 days
- Metrics: 15 days (Prometheus)
- Backups: 7 days
- Audit trails: 90 days (PostgreSQL)

**Backup & Recovery:**
- PostgreSQL: Hourly backups
- Redis: RDB + AOF persistence
- Disaster recovery: See [backup-failure.md](runbooks/backup-failure.md)

---

## Search Tips

### Finding Documentation

**By Topic:**
- Monitoring → [MONITORING_GUIDE.md](MONITORING_GUIDE.md)
- Alerts → [ALERTING_GUIDE.md](ALERTING_GUIDE.md)
- Incidents → [Runbooks](runbooks/)
- Training → [Training Materials](training/)

**By Role:**
- Operations → Monitoring Guide, On-Call Procedures, Runbooks
- Development → Team Onboarding, CFN Loop Architecture
- Security → Shell Error Handling, Security Testing
- Management → Cost dashboards, SLOs, Post-Incident Reviews

**By Urgency:**
- **Emergency (P0):** Check [Runbooks](runbooks/) first
- **On-Call Questions:** [ON_CALL_PROCEDURES.md](ON_CALL_PROCEDURES.md)
- **Learning:** Start with [Training Materials](training/)
- **Reference:** This INDEX.md

### Quick Command Reference

```bash
# Find documentation by keyword
grep -r "keyword" /mnt/wsl/.../docs/

# List all runbooks
ls /mnt/wsl/.../docs/runbooks/

# List all training materials
ls /mnt/wsl/.../docs/training/

# Find alert by name
grep -r "AlertName" /mnt/wsl/.../monitoring/

# Search monitoring guide
grep -i "prometheus" /mnt/wsl/.../docs/MONITORING_GUIDE.md
```

### External Resources

**Prometheus:**
- Official Docs: https://prometheus.io/docs/
- PromQL Guide: https://prometheus.io/docs/prometheus/latest/querying/basics/

**Grafana:**
- Official Docs: https://grafana.com/docs/
- Dashboard Gallery: https://grafana.com/grafana/dashboards/

**Docker:**
- Official Docs: https://docs.docker.com/
- Best Practices: https://docs.docker.com/develop/dev-best-practices/

---

## Document Organization

```
docs/
├── INDEX.md                          # This file
├── MONITORING_GUIDE.md               # Complete monitoring setup
├── ALERTING_GUIDE.md                 # Alert configuration
├── ON_CALL_PROCEDURES.md             # On-call responsibilities
├── SHELL_ERROR_HANDLING_GUIDE.md     # Secure shell scripting
├── CFN_LOOP_ARCHITECTURE.md          # CFN Loop design
├── CUSTOM_PROVIDER_ROUTING.md        # AI provider routing
│
├── runbooks/                         # Incident response
│   ├── agent-spawn-failure.md
│   ├── redis-connection-loss.md
│   ├── postgres-connection-loss.md
│   ├── docker-daemon-unavailable.md
│   ├── disk-space-exhaustion.md
│   ├── high-cost-per-team.md
│   ├── cfn-loop-stuck.md
│   ├── certificate-expiration.md
│   ├── memory-exhaustion.md
│   └── backup-failure.md
│
└── training/                         # Training materials
    ├── operator-training.md          # 2-day operations course
    ├── team-onboarding.md            # 1-day team guide
    ├── incident-response-training.md # Half-day incident course
    └── monitoring-workshop.md        # 1-day monitoring workshop
```

---

## Contributing to Documentation

**How to Update Documentation:**

1. **Create Branch:**
   ```bash
   git checkout -b docs/update-monitoring-guide
   ```

2. **Make Changes:**
   ```bash
   vi docs/MONITORING_GUIDE.md
   ```

3. **Test Commands:**
   - Verify all command examples work
   - Check cross-references link correctly
   - Update "Last Updated" date

4. **Create PR:**
   ```bash
   git add docs/
   git commit -m "docs: Update monitoring guide with new dashboard"
   git push origin docs/update-monitoring-guide
   ```

5. **Request Review:**
   - Tag platform team for technical review
   - Tag tech writer for style review

**Documentation Standards:**
- Clear, concise language (avoid jargon)
- Step-by-step procedures with exact commands
- Expected outputs documented
- Cross-references validated
- Table of contents for long documents (>500 lines)
- Code blocks with syntax highlighting

---

## Getting Help

**Slack Channels:**
- **#cfn-users:** General questions, usage help
- **#cfn-alerts:** System status, automated alerts
- **#cfn-oncall:** Urgent issues (tag @oncall)
- **#cfn-monitoring:** Monitoring discussions

**Office Hours:**
- **When:** Every Tuesday 2-3 PM
- **Where:** Conference Room 3A (or Zoom link in Slack)
- **Topics:** Platform questions, feedback, demos

**Email:**
- Platform Team: platform-team@company.com
- Training: training@company.com
- Security: security@company.com

**On-Call:**
- Urgent Issues: @oncall in #cfn-oncall Slack channel
- PagerDuty: High-urgency pages (P0/P1)
- Phone: See ON_CALL_PROCEDURES.md for contact numbers

---

## Frequently Asked Questions

**Q: Where do I start as a new operator?**
A: Complete [Operator Training](training/operator-training.md) (2 days), then shadow an experienced on-call engineer.

**Q: How do I respond to an alert?**
A: Check the severity (P0/P1/P2), find the corresponding [runbook](runbooks/), follow procedures step-by-step.

**Q: My team's costs are high. What should I do?**
A: Review [Cost Allocation Dashboard](http://localhost:3000/d/cost-allocation), identify expensive tasks, follow [high-cost-per-team.md](runbooks/high-cost-per-team.md) runbook.

**Q: Where are the Grafana dashboards?**
A: http://localhost:3000 - See [MONITORING_GUIDE.md](MONITORING_GUIDE.md) Section 5 for details.

**Q: How do I create a custom alert?**
A: See [ALERTING_GUIDE.md](ALERTING_GUIDE.md) Section 4 - Alert Configuration.

**Q: What's the difference between CLI mode and Task mode?**
A: CLI mode spawns agents via CLI (production, cost-optimized). Task mode spawns via Task() tool (debugging, full visibility). See [CFN_LOOP_TASK_MODE.md](../.claude/commands/CFN_LOOP_TASK_MODE.md).

**Q: How do I silence an alert?**
A: See [ALERTING_GUIDE.md](ALERTING_GUIDE.md) Section 7 - Silencing Procedures.

---

## Version History

**v1.0 - 2025-11-24**
- Initial comprehensive documentation release
- 10 runbooks created
- 4 training materials developed
- Complete monitoring and alerting guides
- Full on-call procedures documented

---

**Questions or Feedback?**
Contact platform-team@company.com or post in #cfn-users

**Documentation Issues?**
Create issue: https://github.com/company/cfn-platform/issues
