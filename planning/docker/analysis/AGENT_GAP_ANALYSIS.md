# Agent Gap Analysis - Docker Organizational Architecture Epic

**Epic:** cfn-organizational-architecture-hybrid
**Existing Agents:** 48 specialists
**Analysis Date:** 2025-10-30

---

## Executive Summary

**Agents Needed:** 4 new specialists
**Agents Sufficient:** 44 existing specialists cover 92% of epic requirements
**Priority:** Create missing agents in Phase 1 (Week 1)

---

## Epic Requirements Analysis

### Phase 1: Infrastructure Templates & Hybrid Routing (Weeks 1-2)

#### Sprint 1.1: ACE System Enhancement

**Tasks:**
- PostgreSQL schema migration (SQLite → PostgreSQL)
- Add scope fields (agent, team, org)
- Team isolation validation
- Scope hierarchy implementation

**Required Agents:**
- ✅ **database-architect** (HAVE) - Schema design, migration scripts
- ✅ **backend-dev** (HAVE) - ACE system enhancement
- ✅ **tester** (HAVE) - Scope isolation tests
- ❌ **postgresql-specialist** (MISSING) - PostgreSQL-specific optimization

**Gap:** PostgreSQL specialist (can use database-architect + backend-dev instead)

---

#### Sprint 1.2: Docker Templates & Hybrid Routing

**Tasks:**
- Create team-providers.json (coordinator/worker split)
- Enhanced execute-agent.sh (role-based routing)
- Docker compose files (5 coordinators + infrastructure)
- Environment variable templates

**Required Agents:**
- ✅ **docker-specialist** (HAVE) - Dockerfile, docker-compose
- ✅ **devops-engineer** (HAVE) - Infrastructure configuration
- ✅ **backend-dev** (HAVE) - Agent execution logic
- ✅ **security-specialist** (HAVE) - API key security, container isolation
- ❌ **environment-config-specialist** (MISSING) - .env templates, variable validation

**Gap:** Environment config specialist (can use devops-engineer instead)

---

#### Sprint 1.3: Hybrid Routing Validation

**Tasks:**
- Single worker spawn test
- Concurrent workers test (25 total)
- Cross-team coordination test
- Cost tracking script
- Grafana dashboards

**Required Agents:**
- ✅ **tester** (HAVE) - Test script creation
- ✅ **load-testing-specialist** (HAVE) - Concurrent worker testing
- ✅ **monitoring-specialist** (HAVE) - Grafana dashboards
- ✅ **devops-engineer** (HAVE) - Cost tracking scripts
- ❌ **grafana-dashboard-specialist** (MISSING) - Advanced Grafana queries, alerting

**Gap:** Grafana specialist (monitoring-specialist covers 80%)

---

### Phase 2: Team Deployments (Weeks 3-6)

#### Sprint 2.1-2.4: Team Rollouts

**Tasks:**
- Deploy 5 coordinators (marketing, engineering, sales, support, finance)
- Spawn workers per team (3-15 workers)
- Cross-team escalation testing
- Cost validation per team

**Required Agents:**
- ✅ **docker-specialist** (HAVE) - Container deployment
- ✅ **devops-engineer** (HAVE) - Orchestration
- ✅ **kubernetes-specialist** (HAVE) - If deploying to K8s (optional)
- ✅ **monitoring-specialist** (HAVE) - Health checks, alerting
- ✅ **tester** (HAVE) - Validation tests
- ❌ **team-coordinator-template-agent** (MISSING) - Generate team-specific configs

**Gap:** Team coordinator template agent (critical for 5 team deployments)

---

### Phase 3: C-Suite + Optimization (Weeks 7-9)

#### Sprint 3.1: C-Suite Deployment

**Tasks:**
- Deploy C-Suite agents (CTO, CMO, CFO, COO, CEO)
- Strategic decision workflow
- Escalation validation

**Required Agents:**
- ✅ **product-owner** (HAVE) - Strategic decisions (PROCEED/ITERATE/ABORT)
- ✅ **cto-agent** (HAVE) - CTO persona
- ❌ **c-suite-agent-template** (MISSING) - CMO, CFO, COO, CEO personas
- ✅ **devops-engineer** (HAVE) - Deployment

**Gap:** C-Suite personas (CMO, CFO, COO, CEO)

---

#### Sprint 3.2: Cost Optimization

**Tasks:**
- Worker model tiering (Haiku vs Sonnet)
- Batch spawning optimization
- Playbook-driven execution

**Required Agents:**
- ✅ **perf-analyzer** (HAVE) - Performance optimization
- ✅ **backend-dev** (HAVE) - Model tiering logic
- ✅ **data-engineer** (HAVE) - Cost analytics
- ✅ **context-curator** (HAVE) - Playbook optimization
- ❌ **cost-optimization-specialist** (MISSING) - Z.ai cost analysis, budget alerts

**Gap:** Cost optimization specialist (perf-analyzer covers 70%)

---

#### Sprint 3.3: Monitoring & Dashboards

**Tasks:**
- Grafana dashboards (per-team costs, coordinator health)
- Alerting (rate limits, failures, costs)
- Cost anomaly detection

**Required Agents:**
- ✅ **monitoring-specialist** (HAVE) - Grafana, Prometheus
- ✅ **devops-engineer** (HAVE) - Alerting configuration
- ✅ **data-engineer** (HAVE) - Cost analytics
- ❌ **alerting-specialist** (MISSING) - Advanced alerting rules, anomaly detection

**Gap:** Alerting specialist (monitoring-specialist covers 80%)

---

### Phase 4: Operational Hardening (Weeks 10-11)

#### Sprint 4.1: Production Testing

**Tasks:**
- Load test (50 concurrent workers)
- Failover testing (coordinator restart, Redis loss)
- Security audit (container isolation, MCP permissions)

**Required Agents:**
- ✅ **load-testing-specialist** (HAVE) - Concurrent worker load
- ✅ **chaos-engineering-specialist** (HAVE) - Failover testing
- ✅ **security-specialist** (HAVE) - Security audit
- ✅ **tester** (HAVE) - General testing
- ❌ **failover-testing-specialist** (MISSING) - Redis connection loss, coordinator restart

**Gap:** Failover specialist (chaos-engineering-specialist covers 90%)

---

#### Sprint 4.2: Documentation & Handoff

**Tasks:**
- Operational runbooks
- Troubleshooting guides
- Cost optimization playbooks
- Operations team training

**Required Agents:**
- ✅ **api-docs** (HAVE) - Documentation generation
- ✅ **researcher** (HAVE) - Research best practices
- ✅ **context-curator** (HAVE) - Playbook creation
- ❌ **technical-writer-specialist** (MISSING) - Runbook formatting, training materials

**Gap:** Technical writer (api-docs covers 70%)

---

## Summary of Gaps

### Critical (Create in Phase 1)

**1. Team Coordinator Template Agent** 🔴 HIGH PRIORITY
- **Why Critical:** Need to generate 5 team-specific coordinator configs
- **Epic Impact:** Phase 2 blocked without this (Sprints 2.1-2.4)
- **Workaround:** None (manual config for each team = error-prone)
- **Create:** `.claude/agents/cfn-dev-team/infrastructure/team-coordinator-template.md`

**2. C-Suite Agent Template** 🟡 MEDIUM PRIORITY
- **Why Critical:** Need CMO, CFO, COO, CEO personas (CTO exists)
- **Epic Impact:** Phase 3 Sprint 3.1 blocked
- **Workaround:** Use product-owner for all C-Suite roles (loses specialization)
- **Create:** `.claude/agents/cfn-dev-team/csuite/c-suite-template.md`

### Nice-to-Have (Existing agents cover 80%+)

**3. Cost Optimization Specialist** 🟢 LOW PRIORITY
- **Coverage:** perf-analyzer (70%), data-engineer (20%)
- **Epic Impact:** Phase 3 Sprint 3.2 less optimal (but functional)
- **Workaround:** Use perf-analyzer + data-engineer together
- **Create:** Optional

**4. Grafana Dashboard Specialist** 🟢 LOW PRIORITY
- **Coverage:** monitoring-specialist (80%)
- **Epic Impact:** Phase 1 Sprint 1.3, Phase 3 Sprint 3.3 less optimal
- **Workaround:** Use monitoring-specialist (basic dashboards work)
- **Create:** Optional

**5. PostgreSQL Specialist** 🟢 LOW PRIORITY
- **Coverage:** database-architect (90%)
- **Epic Impact:** Phase 1 Sprint 1.1 slightly slower
- **Workaround:** database-architect handles PostgreSQL fine
- **Create:** Optional

---

## Recommended New Agents

### 1. Team Coordinator Template Agent 🔴 CRITICAL

**File:** `.claude/agents/cfn-dev-team/infrastructure/team-coordinator-template.md`

**Specialization:**
- Generate team-specific Docker configs
- Create coordinator environment variables
- Populate team-providers.json entries
- Generate MCP config per team
- Create network isolation configs

**Tools:** Read, Write, Edit, Bash (for templating)

**Why Can't Existing Agents Do This:**
- docker-specialist: Generic Docker knowledge (not team-specific templating)
- devops-engineer: Infrastructure orchestration (not config generation)
- base-template-generator: Generic templates (not team coordinator-specific)

**Example Usage:**
```bash
Task("team-coordinator-template", "
  Generate coordinator configuration for marketing team.

  Inputs:
  - Team: marketing
  - Agents: 10 (email-campaigns, social-publishing, analytics, ...)
  - Coordinator API key env var: MARKETING_COORDINATOR_API_KEY
  - Worker count: 3-5 concurrent

  Outputs:
  - docker-compose entry for marketing-coordinator
  - .env template for marketing team
  - team-providers.json entry
  - MCP config for marketing agents
")
```

---

### 2. C-Suite Agent Template 🟡 MEDIUM PRIORITY

**File:** `.claude/agents/cfn-dev-team/csuite/c-suite-template.md`

**Specialization:**
- CMO persona (marketing strategy, campaign decisions)
- CFO persona (budget decisions, cost optimization)
- COO persona (operational efficiency, team coordination)
- CEO persona (strategic vision, epic-level decisions)
- Escalation handling from team coordinators

**Tools:** Read, Write, TodoWrite (for strategic planning)

**Why Can't Existing Agents Do This:**
- cto-agent: Only CTO persona (technical decisions)
- product-owner: Generic GOAP decisions (not role-specific)
- planner: Planning focus (not executive decision-making)

**Example Usage:**
```bash
Task("c-suite-template", "
  Act as CFO. Engineering team requests $10K budget increase for infrastructure.

  Context:
  - Current budget: $44K (11 weeks)
  - Request: +$10K for Redis clustering
  - Justification: Support 1000+ concurrent agents

  Decision: APPROVE/DEFER/REJECT with financial rationale
")
```

---

### 3. Cost Optimization Specialist 🟢 OPTIONAL

**File:** `.claude/agents/cfn-dev-team/analytics/cost-optimization-specialist.md`

**Specialization:**
- Z.ai cost analysis per team
- Budget alert configuration
- Model tiering recommendations (Haiku vs Sonnet)
- Cost anomaly detection
- ROI tracking

**Tools:** Read, Bash (for cost queries), Write (for reports)

**Why Can't Existing Agents Do This:**
- perf-analyzer: Performance focus (not cost-specific)
- data-engineer: Data pipelines (not cost optimization)

**Workaround:** Use perf-analyzer + data-engineer together (80% coverage)

---

## Implementation Priority

### Week 1 (Phase 1 Sprint 1.1)

**Create:**
1. ✅ **Team Coordinator Template Agent** (CRITICAL)
   - Needed for Phase 2 (Sprints 2.1-2.4)
   - No workaround available
   - 200-300 lines (based on base-template-generator)

**Skip (use existing):**
- PostgreSQL specialist → use database-architect
- Environment config specialist → use devops-engineer

### Week 7 (Phase 3 Sprint 3.1)

**Create:**
2. ✅ **C-Suite Agent Template** (MEDIUM)
   - Needed for C-Suite deployment
   - Workaround: Use product-owner (loses specialization)
   - 300-400 lines (4 personas × 75-100 lines each)

**Skip (use existing):**
- Grafana specialist → use monitoring-specialist
- Cost optimization specialist → use perf-analyzer + data-engineer

### Optional (Post-Epic)

**Create if needed:**
3. Cost Optimization Specialist (after Phase 3 Sprint 3.2 if perf-analyzer insufficient)
4. Grafana Dashboard Specialist (after Phase 1 Sprint 1.3 if monitoring-specialist insufficient)

---

## Existing Agent Coverage

**Agents covering 90%+ of epic:**
- ✅ docker-specialist (Phase 1-2, 4)
- ✅ devops-engineer (Phase 1-4, all sprints)
- ✅ backend-dev (Phase 1, 3)
- ✅ database-architect (Phase 1 Sprint 1.1)
- ✅ security-specialist (Phase 1, 4)
- ✅ tester (Phase 1, 2, 4)
- ✅ load-testing-specialist (Phase 1, 4)
- ✅ monitoring-specialist (Phase 1, 3, 4)
- ✅ chaos-engineering-specialist (Phase 4)
- ✅ product-owner (Phase 3 Sprint 3.1 workaround)

**Total Coverage:**
- Existing agents: 44/48 (92%)
- Epic-specific agents needed: 2 (team-coordinator-template, c-suite-template)
- Optional agents: 3 (cost-optimization, grafana-dashboard, postgresql)

---

## Decision Matrix

| Agent | Priority | Epic Impact | Workaround | Create? |
|-------|----------|-------------|------------|---------|
| Team Coordinator Template | 🔴 HIGH | Phase 2 blocked | None | ✅ YES (Week 1) |
| C-Suite Template | 🟡 MEDIUM | Phase 3 Sprint 3.1 | product-owner | ✅ YES (Week 7) |
| Cost Optimization Specialist | 🟢 LOW | Phase 3 Sprint 3.2 | perf-analyzer + data-engineer | ❌ NO (optional) |
| Grafana Dashboard Specialist | 🟢 LOW | Phase 1, 3 | monitoring-specialist | ❌ NO (optional) |
| PostgreSQL Specialist | 🟢 LOW | Phase 1 Sprint 1.1 | database-architect | ❌ NO (optional) |
| Environment Config Specialist | 🟢 LOW | Phase 1 Sprint 1.2 | devops-engineer | ❌ NO (optional) |
| Alerting Specialist | 🟢 LOW | Phase 3 Sprint 3.3 | monitoring-specialist | ❌ NO (optional) |
| Failover Testing Specialist | 🟢 LOW | Phase 4 Sprint 4.1 | chaos-engineering-specialist | ❌ NO (optional) |
| Technical Writer Specialist | 🟢 LOW | Phase 4 Sprint 4.2 | api-docs | ❌ NO (optional) |

---

## Conclusion

**Create 2 new agents:**
1. **Team Coordinator Template Agent** (Week 1, critical for Phase 2)
2. **C-Suite Agent Template** (Week 7, medium priority for Phase 3)

**Existing 44 agents cover 92% of epic requirements.** No other agents needed for successful epic execution.

**Next Steps:**
1. Create team-coordinator-template agent in Week 1
2. Test with marketing team config generation
3. Create c-suite-template agent in Week 7
4. Evaluate optional agents post-epic based on pain points
