# ADR-001: Dedicated Trigger.dev Instance Per Team vs Shared Instance with Project Isolation

**Status:** Accepted
**Date:** 2025-11-24
**Author:** System Architect
**Context:** Phase 5 - Enterprise Multi-Team Deployment Architecture

---

## Problem Statement

As we scale Trigger.dev across an enterprise with multiple teams (Engineering, Marketing, Data), we must choose between two fundamental deployment models:

1. **Option A: Shared Trigger.dev with Project Isolation** - Single Trigger.dev instance, teams isolated via projects/RBAC
2. **Option B: Dedicated Trigger.dev Per Team** - Independent Trigger.dev per team, full infrastructure isolation

This decision impacts:
- Infrastructure cost (30-50% overhead for Option B)
- Security posture and compliance readiness
- Team autonomy and operational flexibility
- Cost attribution accuracy
- Operational complexity

---

## Context

### Current State (Pre-Phase 5)
- Trigger.dev per-agent container system production-ready (Phases 0-4, 100% test pass rate)
- Redis-based CFN Loop coordination working reliably
- Single infrastructure model currently (not multi-tenant)
- Cost tracking via container labels proven effective
- Network isolation capability validated (Phase 4)

### Requirements
- Support 500-1000+ engineers across 10+ teams
- Enterprise compliance (SOC 2, PCI-DSS, GDPR)
- Accurate cost attribution per team
- Team autonomy (independent upgrades, customization)
- Resource isolation (one team's spikes don't affect others)

### Constraints
- Budget-conscious (but compliance non-negotiable)
- Limited platform engineering team (2-3 people)
- Need for observability across all teams
- Data residency requirements (future, EU/APAC expansion)

---

## Decision

**We choose Option B: Dedicated Trigger.dev Instance Per Team**

### Rationale

#### 1. Security (Primary Driver)

**Risk Level: CRITICAL**

Option A introduces unacceptable security risks:
- **Single point of failure:** One compromised team's agent → access to all teams' data
- **Privilege escalation:** Kubernetes RBAC is complex; mistakes → cross-team access
- **Data exfiltration:** Shared Redis/PostgreSQL → leaked data from all teams if breached
- **Compliance scope explosion:** One team's non-compliance affects entire organization's audit

Option B eliminates these risks:
- **Network isolation:** cfn-agent:eng cannot reach redis:marketing (network policy + separate cluster)
- **Data isolation:** Each team's PostgreSQL encrypted, deleted independently
- **Secret isolation:** Team-scoped Vault paths (eng team cannot read mkt secrets)
- **Incident containment:** One team's breach doesn't affect others

**Example Risk Scenario:**
```
Shared Model Risk:
├── Marketing team member's laptop compromised
├── Attacker gains access to mkt-agent container
├── Within shared Redis: sees ALL teams' job queues
├── Attacker reads engineering team's confidential workflow names
├── Breach of competitive product information
└── Multi-team security incident, regulatory notification required

Dedicated Model Risk:
├── Same initial compromise: attacker gains access to mkt-agent
├── Network policy blocks access to eng cluster
├── Blast radius: Marketing data only
├── Isolation contained, legal/compliance impact minimal
└── Single-team incident, easy containment
```

#### 2. Cost Attribution (Secondary Driver)

**Business Impact: HIGH**

Option B enables accurate chargeback:
- Each team's infrastructure directly maps to cost center
- Container labels + Prometheus → precise per-agent cost tracking
- Teams see their own costs clearly → incentivizes optimization
- Simple billing model (no allocation algorithms)

Option A requires complex cost allocation:
- Shared infrastructure costs require percentage allocation
- "How much of shared Redis goes to each team?" → Arbitrary decisions
- CPU/memory allocation algorithms create disputes
- Difficult to justify cost ratios to finance teams

**Example:**
```
Option B (Dedicated):
├── Engineering team costs directly to ENG-001 cost center
├── Marketing team costs directly to MKT-002 cost center
├── Clear accountability → teams optimize their own usage
└── Finance: Simple invoice, no disputed allocations

Option A (Shared):
├── Shared Redis costs: $1,200/month
├── How to allocate? By CPU %, memory %, key count?
├── Engineering claims: "We only use 20% of Redis" (engineering bias)
├── Marketing claims: "We barely use Redis at all" (also biased)
├── Finance team mediates: "Split 40/35/25% (data team gets bulk)"
├── All teams unhappy → disputes over chargeback fairness
```

#### 3. Team Autonomy (Strategic Driver)

**Organizational Impact: MEDIUM-HIGH**

Option B enables team independence:
- Engineering upgrades Trigger.dev when ready (doesn't affect Marketing)
- Data team adds custom agent images (doesn't impact other teams)
- Marketing team runs experiments (zero risk to prod services)
- Each team controls their own scaling, monitoring, alerting

Option A limits autonomy:
- Upgrade to new Trigger.dev version? Affects all teams
- One team's experimental feature → affects job queue for others
- Configuration change in one team → potential side effects elsewhere
- Scaling decisions require consensus (slower)

#### 4. Compliance and Data Residency (Future-Proofing)

**Regulatory Impact: MEDIUM-HIGH**

Option B prepares for future requirements:
- EU data team → EU cluster, zero cross-border data flow
- PCI-DSS team → isolated cluster, simpler audit scope
- GDPR deletion → delete one team's PostgreSQL instance (simple)
- SOC 2 audit → per-team audit trail, clear segregation

Option A creates compliance complexity:
- Multi-tenant database → complex GDPR deletion (per-row)
- Data residency → requires sophisticated data placement policies
- Audit scope → all teams' data in scope regardless of team's compliance level

---

## Alternative Analysis

### Option A: Shared Trigger.dev (Rejected)

**Advantages:**
- ✅ 30-50% cost savings in infrastructure
- ✅ Simpler operational model (one dashboard)
- ✅ Easier knowledge sharing across teams
- ✅ Lower initial setup complexity

**Critical Disadvantages:**
- ❌ Security: Single point of failure for all teams' data
- ❌ Compliance: Difficult GDPR/data residency implementation
- ❌ Cost attribution: Complex allocation algorithms, team disputes
- ❌ Autonomy: Teams blocked by other teams' changes
- ❌ Scalability: Resource contention between teams

**When This Works:**
- Small organizations (<50 people)
- Internal tools only (no external compliance)
- Early-stage startups (cost-critical phase)
- Development/test environments

**Verdict:** Option A acceptable ONLY for dev/test environments or small orgs. Rejected for enterprise production.

### Option B: Dedicated Trigger.dev Per Team (Accepted)

**Advantages:**
- ✅ Security: Zero cross-team container leakage
- ✅ Compliance: SOC 2, PCI-DSS, GDPR ready
- ✅ Cost attribution: Precise per-team chargeback
- ✅ Autonomy: Teams upgrade/scale independently
- ✅ Operational resilience: Team incidents isolated
- ✅ Scalability: No resource contention, unlimited growth

**Disadvantages:**
- ❌ Infrastructure cost: 30-50% higher (multiple Trigger instances)
- ❌ Operational complexity: N teams × N infrastructure instances
- ❌ Network complexity: Cross-team webhooks need coordination

**Cost Justification:**
```
Base infrastructure cost: $10,000/month
Option A additional: N/A (baseline)
Option B additional: ~$4,000/month (+40%)

Cost savings from Trigger.dev vs Task Mode: 95-98% savings
Trigger.dev baseline (single): $20,000/month
Task Mode equivalent: $400,000/month

Additional Option B cost: $4,000
Avoided security incident costs: $100,000+ (breach response, legal, notification)
Compliance readiness value: $50,000+ (audit efficiency, certification cost)
Team productivity gains: $100,000+ (no cross-team blocking, independent scaling)

Net value: Option B cost is negligible vs security/compliance/productivity benefits
```

---

## Implementation Plan

### Phase 1: Pilot (Week 1-2)
- Deploy dedicated Trigger.dev for Engineering team
- Validate network isolation, cost tracking, performance
- Document operational procedures

### Phase 2: Rollout (Week 3-4)
- Deploy dedicated Trigger.dev for Marketing team
- Deploy dedicated Trigger.dev for Data team
- Consolidate operational playbooks

### Phase 3: Optimization (Week 5+)
- Monitor cross-team patterns (identify shared infrastructure needs)
- Implement centralized observability (Prometheus federation)
- Optimize team sizing based on actual usage

---

## Monitoring and Success Criteria

### Security Success Criteria
- ✓ Zero cross-team network connection attempts (or all blocked by policy)
- ✓ Zero cross-team secret access attempts
- ✓ Audit logs show 100% same-team access, 0% cross-team
- ✓ Team data completely isolated in separate PostgreSQL instances

### Cost Success Criteria
- ✓ Cost attribution accurate within 5% vs actual metrics
- ✓ Teams report satisfaction with chargeback fairness (>80% satisfaction)
- ✓ Cost anomalies detected and alerted within 1 hour
- ✓ Monthly team invoices generated automatically from metrics

### Operational Success Criteria
- ✓ MTTR (mean time to recovery) ≤ 30 minutes for team incidents
- ✓ Blast radius of failures isolated to single team
- ✓ Platform team handling N teams with <10% additional overhead vs single instance

---

## Risks and Mitigation

### Risk 1: Higher Infrastructure Cost
**Severity:** Medium | **Likelihood:** High

**Risk:** +$4,000/month recurring cost for organization

**Mitigation:**
- Cost is offset by compliance readiness and security incident prevention
- Monitor cost trends; optimize resource allocation if overages detected
- Consider cost-saving measures: CPU/memory reduction, storage optimization

### Risk 2: Operational Complexity
**Severity:** Medium | **Likelihood:** Medium

**Risk:** Platform team must manage N teams worth of infrastructure

**Mitigation:**
- Automate deployment: Terraform templates for team instances
- Implement infrastructure-as-code: Version control, code review for changes
- Develop runbooks: Automated troubleshooting, self-healing capabilities
- Monitor team health centrally: Prometheus federation, single pane of glass

### Risk 3: Cross-Team Coordination
**Severity:** Low | **Likelihood:** Low

**Risk:** Teams may need to coordinate (e.g., data team → marketing team reports)

**Mitigation:**
- Design webhook system: Cross-team API calls via Trigger webhooks (isolated)
- Publish event schemas: Teams can subscribe to cross-team events safely
- Rate limiting: Prevent one team's volume from affecting others

---

## Consequences

### Positive
- **Security posture dramatically improved:** Dedicated infrastructure eliminates multi-team risk vectors
- **Compliance ready:** SOC 2, PCI-DSS, GDPR all straightforward to implement
- **Team autonomy enabled:** Teams move faster without blocking each other
- **Cost transparency:** Teams see their actual costs, incentivizes optimization
- **Future-proof:** Easy to add regional deployments, data residency compliance

### Negative
- **Higher infrastructure cost:** +30-50% vs shared model
- **Operational burden:** Platform team must manage N instances
- **Complexity for small teams:** May be overkill for very small organizations

### Neutral
- **Monitoring changes:** Requires federation approach (Prometheus, Grafana)
- **Team onboarding:** Additional context needed about dedicated infrastructure

---

## Alternative Approaches Considered

### Hybrid Approach: Shared Trigger with Team-Dedicated Docker Hosts
**Rejected:** Violates security principle (shared PostgreSQL = single point of failure)

### Serverless Model: AWS Lambda + Step Functions
**Rejected:** Incompatible with Trigger.dev architecture, loses job persistence

### Virtual Machine Per Team
**Rejected:** Higher operational overhead than containers, worse resource utilization

---

## Related Decisions

- **ADR-002:** Kubernetes vs Docker Compose for orchestration
- **ADR-003:** Team-scoped Vault for secret management
- **ADR-004:** Prometheus federation for centralized observability

---

## References

- `docs/ENTERPRISE_MULTI_TEAM_DEPLOYMENT.md` - Full architecture guide
- `planning/trigger/TRIGGER_DEV_PER_AGENT_CONTAINER_PLAN.md` - Phase 5 requirements
- CTO Strategic Assessment - Trigger.dev integration analysis
- Security audit reports (Phase 4 deliverables)

---

**Approval:** System Architect
**Stakeholder Review:** Required before Phase 5 implementation
**Implementation Owner:** Infrastructure/DevOps Team
