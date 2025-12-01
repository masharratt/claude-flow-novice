# Enterprise Multi-Team Deployment Architecture
## Trigger.dev Per-Agent Container System

**Version:** 1.0.0
**Date:** 2025-11-24
**Status:** Architecture Design Document
**Audience:** Enterprise Infrastructure Teams, Platform Engineers, CTO/CTOs

**Context:** Phase 5 of Trigger.dev Per-Agent Container Architecture. Phases 0-4 complete with 100% test pass rates. This document defines multi-team deployment topology and cost tracking strategies.

---

## Executive Summary

This document presents a comprehensive enterprise architecture for deploying the Trigger.dev per-agent container system across multiple teams in a single organization. It compares two deployment models (shared vs. dedicated) and recommends **Option B: Dedicated Trigger.dev Per Team** for enterprise deployments.

### Key Architectural Decisions

| Decision | Recommendation | Rationale |
|----------|---|---|
| **Deployment Model** | Dedicated Trigger.dev per team | 100% resource isolation, cost accountability, team autonomy |
| **Container Orchestration** | Kubernetes (prod) / Docker Compose (smaller orgs) | Enterprise scalability, self-healing, auto-scaling |
| **Network Isolation** | Namespace-level + VPC/network policies | Defense-in-depth security model |
| **Cost Tracking** | Container labels + Prometheus metrics | Real-time cost attribution per team/project |
| **Image Strategy** | Team-specific base images from shared registry | Centralized updates + team customization |
| **Secret Management** | HashiCorp Vault per team | Team-scoped access, audit trails, rotation automation |

### Expected Outcomes

- **Security:** Zero cross-team container leakage, isolated secret stores, audit trails
- **Cost:** Accurate per-team billing, 95-98% savings vs. Task Mode deployment
- **Scalability:** Independent scaling per team (10-1000+ agents), zero contention
- **Observability:** Centralized dashboard + team-specific views
- **Compliance:** SOC 2 alignment, PCI-DSS ready, audit logging

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Deployment Models Analysis](#deployment-models-analysis)
3. [Recommended Architecture (Option B)](#recommended-architecture-option-b)
4. [Network Isolation Strategy](#network-isolation-strategy)
5. [Resource Allocation and Cost Tracking](#resource-allocation-and-cost-tracking)
6. [Security Boundaries and Access Control](#security-boundaries-and-access-control)
7. [Scalability Considerations](#scalability-considerations)
8. [Migration Strategy](#migration-strategy)
9. [Operational Procedures](#operational-procedures)
10. [Appendix: Implementation Details](#appendix-implementation-details)

---

## 1. Architecture Overview

### Vision

Transform Trigger.dev from a single-tenant orchestration platform into an enterprise multi-tenant system where:

- Each team operates independent Trigger.dev deployments
- Per-agent container isolation prevents cross-contamination
- Fine-grained cost tracking enables accurate chargeback
- Centralized monitoring provides organization-wide observability
- Team autonomy allows independent scaling and customization

### Core Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Organization Level                             │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                   Observability & Control Plane                    │ │
│  │  (Prometheus, Grafana, Vault, Harbor Registry, Elasticsearch)     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                           ▲         ▲         ▲                        │
│                           │         │         │                        │
│  ┌────────────┬───────────┼─────────┼─────────┼───────────┬──────────┐ │
│  │ Engineering Team      │ Marketing Team    │ Data Team │          │ │
│  │ Trigger.dev Instance  │ Trigger.dev       │ Trigger.  │ ... more │ │
│  ├────────────┤           │ Instance          │ dev       │          │ │
│  │            │           │                   │ Instance  │          │ │
│  │ Docker Host│           │ Docker Host       │ Docker    │ Docker   │ │
│  │ K8s Cluster│           │ K8s Cluster       │ Host/K8s  │ Hosts    │ │
│  │            │           │                   │           │          │ │
│  │ Redis      │           │ Redis             │ Redis     │ Redis    │ │
│  │ Postgres   │           │ Postgres          │ Postgres  │ Postgres │ │
│  │ Vault      │           │ Vault             │ Vault     │ Vault    │ │
│  │ (isolated) │           │ (isolated)        │ (isolated)│ (isolated)
│  └────────────┴───────────┴───────────────────┴───────────┴──────────┘ │
│                                                                         │
│  Network: Private VPC per team OR dedicated subnets with network       │
│  policies, zero-trust ingress/egress rules                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Roles

**Observability & Control Plane (Organization Level)**
- Centralized Prometheus for metrics aggregation from all teams
- Grafana dashboards: Organization overview + per-team views
- HashiCorp Vault: Team-scoped secret management with audit trails
- Harbor/ECR: Private image registry with team namespaces
- Elasticsearch/ECS: Centralized log aggregation

**Team-Level Infrastructure**
- **Trigger.dev Instance**: Independent workflow orchestration
- **Docker Host / Kubernetes Cluster**: Container execution environment
- **Redis**: Task queue + coordination (team-isolated)
- **PostgreSQL**: State persistence (team-isolated)
- **Vault Agent**: Local secret injection per team

---

## 2. Deployment Models Analysis

### Option A: Shared Trigger.dev with Project Isolation

#### Architecture

```yaml
shared-trigger.dev.company.com
├── Project: engineering
│   ├── Agents: cfn-agent-eng:backend, cfn-agent-eng:frontend
│   ├── Resource Limits: 10 concurrent, 100GB total storage
│   └── Secrets: ENG_ZAI_API_KEY, ENG_KIMI_API_KEY (namespace scoped)
│
├── Project: marketing
│   ├── Agents: cfn-agent-mkt:content, cfn-agent-mkt:seo
│   ├── Resource Limits: 5 concurrent, 50GB total storage
│   └── Secrets: MKT_ZAI_API_KEY, MKT_KIMI_API_KEY (namespace scoped)
│
└── Project: data
    ├── Agents: cfn-agent-data:etl, cfn-agent-data:ml
    ├── Resource Limits: 15 concurrent, 200GB total storage
    └── Secrets: DATA_ZAI_API_KEY, DATA_KIMI_API_KEY (namespace scoped)
```

#### Advantages

✅ **Lower Infrastructure Cost**
- Single Trigger.dev instance reduces license/compute costs
- Shared Redis and PostgreSQL reduce storage overhead
- Single Vault instance for secrets management
- Lower total operational burden

✅ **Simplified Monitoring**
- Single dashboard for all teams
- Unified log aggregation
- Simpler backup/disaster recovery (one database)

✅ **Easier Knowledge Sharing**
- Teams see each other's patterns
- Shared best practices propagate faster
- Cross-team visibility into workloads

#### Disadvantages

❌ **Weak Resource Isolation**
- One team's runaway agent can starve others
- Resource limits enforced via cgroups, but not guaranteed
- Noisy neighbor problem: one team's spikes affect all

❌ **Security Concerns**
- Shared Redis increases privilege escalation surface
- PostgreSQL compromise affects all teams' data
- Secret scope isolation relies on Trigger.dev RBAC (single point of failure)
- Audit trails require careful filtering per team

❌ **Cost Attribution Complexity**
- Per-project cost tracking requires custom instrumentation
- Shared infrastructure costs require allocation algorithms (CPU%, memory%)
- Difficult to chargeback accurately to teams

❌ **Team Autonomy Limited**
- Upgrades/patches affect all teams simultaneously
- One team's configuration change may affect others
- Teams cannot customize agent images independently
- Scaling strategy must balance all teams' needs

❌ **Compliance Risk**
- Data residency requirements harder to enforce (all data in one DB)
- SOC 2 audit scope includes all teams
- GDPR right-to-deletion requires careful database-level filtering
- PCI-DSS scope larger (all data in one environment)

#### Recommendation

Use Option A only for:
- Small organizations (<50 people, 3-4 teams)
- Internal tool teams (no external compliance requirements)
- Dev/test environments (non-production)
- Cost-constrained startups

---

### Option B: Dedicated Trigger.dev Per Team (RECOMMENDED)

#### Architecture

```yaml
# Engineering Team
eng.company.com/trigger.dev
├── Docker Infrastructure: eng-docker-host (or eng-k8s cluster)
├── Agent Images: cfn-agent-eng:* (team namespace in registry)
├── Resource Pool: 32 CPU, 128GB RAM, 500GB storage
├── Redis Instance: eng-redis.internal (isolated VPC)
├── PostgreSQL Instance: eng-postgres.internal (isolated VPC)
├── Vault Instance: eng-vault (or Vault agent)
├── Cost Center: Engineering-001
└── Teams: All engineering sub-teams (backend, frontend, devops)

# Marketing Team
marketing.company.com/trigger.dev
├── Docker Infrastructure: mkt-docker-host (or mkt-k8s cluster)
├── Agent Images: cfn-agent-mkt:* (team namespace in registry)
├── Resource Pool: 16 CPU, 64GB RAM, 250GB storage
├── Redis Instance: mkt-redis.internal (isolated VPC)
├── PostgreSQL Instance: mkt-postgres.internal (isolated VPC)
├── Vault Instance: mkt-vault (or Vault agent)
├── Cost Center: Marketing-002
└── Teams: Marketing, content, creative

# Data Team
data.company.com/trigger.dev
├── Docker Infrastructure: data-docker-host (or data-k8s cluster)
├── Agent Images: cfn-agent-data:* (team namespace in registry)
├── Resource Pool: 64 CPU, 256GB RAM, 1TB storage
├── Redis Instance: data-redis.internal (isolated VPC)
├── PostgreSQL Instance: data-postgres.internal (isolated VPC)
├── Vault Instance: data-vault (or Vault agent)
├── Cost Center: Data-003
└── Teams: Data science, analytics, ML engineering
```

#### Advantages

✅ **Complete Resource Isolation**
- Each team's noisy neighbor effects contained
- Resource limits enforced per team (oversubription safe)
- Independent scaling: Engineering can scale to 1000 agents while Marketing stays at 50

✅ **Security Excellence**
- Zero cross-team container leakage
- Separate Redis/PostgreSQL prevents privilege escalation across teams
- Team-specific Vault with OIDC/SAML integration
- Audit trails automatically scoped per team
- Network policies: Each team in separate VPC/subnet with zero ingress from others

✅ **Cost Attribution Simplicity**
- Per-team Docker infrastructure directly maps to cost center
- Container labels enable precise cost tracking per project/agent
- Chargeback models are straightforward
- Teams see their own costs clearly (incentivizes optimization)

✅ **Team Autonomy Maximum**
- Each team chooses their own agent images and customizations
- Teams upgrade Trigger.dev independently
- Configuration changes affect only that team
- Teams can define their own monitoring/alerting rules

✅ **Compliance Excellence**
- Data residency per team (EU data stays in EU Trigger.dev)
- SOC 2 scope reduced (per-team audit)
- GDPR deletion: Delete one team's PostgreSQL instance
- PCI-DSS: If one team is non-compliant, others unaffected

✅ **Operational Resilience**
- Team infrastructure failures isolated
- Backup/recovery per team (faster RTO)
- Blast radius of security incidents contained
- One team's misconfiguration doesn't affect others

#### Disadvantages

❌ **Higher Infrastructure Cost**
- Multiple Trigger.dev licenses (enterprise license likely needed)
- N separate Redis + PostgreSQL instances (N = number of teams)
- N separate Docker hosts or K8s clusters
- Estimated 30-50% higher infrastructure cost vs. Option A

❌ **Operational Complexity**
- N teams to monitor (requires centralized observability)
- N backup/disaster recovery procedures
- Cross-team debugging requires multiple dashboards
- Secret rotation per team (but automated via Vault)

❌ **Network Complexity**
- Multiple network policies per VPC
- Cross-team webhooks require firewall exceptions
- VPN/bastion access required per team infrastructure

#### Recommendation

Use Option B for:
- Enterprise organizations (>500 people, 10+ teams)
- Regulated industries (healthcare, finance, payments)
- Organizations with data residency requirements
- Teams with high security/compliance standards
- Organizations where cost attribution is business-critical

---

## 3. Recommended Architecture (Option B)

### Deployment Topology

#### Large Enterprise (Kubernetes)

```
┌─────────────────────────────────────────────────────────────────┐
│                       Organization Level                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Management Cluster (Centralized)            │   │
│  │  - Prometheus + Grafana (multi-cluster federation)       │   │
│  │  - Elasticsearch (ECS logs)                              │   │
│  │  - HashiCorp Vault (auth for team instances)             │   │
│  │  - Harbor Registry (container images)                    │   │
│  │  - Cross-cluster monitoring agents                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ (Secure service accounts)
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
    ▼                         ▼                         ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Engineering      │   │ Marketing        │   │ Data             │
│ Kubernetes       │   │ Kubernetes       │   │ Kubernetes       │
│ Cluster (EKS)    │   │ Cluster (EKS)    │   │ Cluster (EKS)    │
├──────────────────┤   ├──────────────────┤   ├──────────────────┤
│ Namespace: eng   │   │ Namespace: mkt   │   │ Namespace: data  │
│                  │   │                  │   │                  │
│ Pods:            │   │ Pods:            │   │ Pods:            │
│ - trigger-web    │   │ - trigger-web    │   │ - trigger-web    │
│ - trigger-worker │   │ - trigger-worker │   │ - trigger-worker │
│ - cfn-agent-*    │   │ - cfn-agent-*    │   │ - cfn-agent-*    │
│ - redis          │   │ - redis          │   │ - redis          │
│ - postgres       │   │ - postgres       │   │ - postgres       │
│ - vault-agent    │   │ - vault-agent    │   │ - vault-agent    │
│                  │   │                  │   │                  │
│ Network Policies:│   │ Network Policies:│   │ Network Policies:│
│ - Deny all       │   │ - Deny all       │   │ - Deny all       │
│ - Allow internal │   │ - Allow internal │   │ - Allow internal │
│ - Allow ingress  │   │ - Allow ingress  │   │ - Allow ingress  │
│   only from      │   │   only from      │   │   only from      │
│   org gateway    │   │   org gateway    │   │   org gateway    │
│                  │   │                  │   │                  │
│ Secrets:         │   │ Secrets:         │   │ Secrets:         │
│ - VAULT_TOKEN    │   │ - VAULT_TOKEN    │   │ - VAULT_TOKEN    │
│ - TLS certs      │   │ - TLS certs      │   │ - TLS certs      │
└──────────────────┘   └──────────────────┘   └──────────────────┘
    │                         │                         │
    │ (CloudWatch logs)       │ (CloudWatch logs)       │ (CloudWatch logs)
    │                         │                         │
    └─────────────────────────┼─────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │  Elasticsearch (Centralized)  │
              │  - All team logs aggregated  │
              │  - Indexed by team label     │
              └──────────────────────────────┘
```

#### Mid-Market (Docker Compose)

```
┌──────────────────────────────────────────────────────────┐
│                  Organization Network                    │
│                    (Corporate VPC)                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │        Monitoring & Control Plane (Shared)         │  │
│  │  - Prometheus (federation from all teams)          │  │
│  │  - Grafana (centralized dashboards)                │  │
│  │  - Vault (secrets for all teams)                   │  │
│  │  - Registry (image storage)                        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Engineering Team         Marketing Team      Data Team │
│  ┌─────────────────────┬──────────────────┬───────────┐  │
│  │ Docker Host 1       │ Docker Host 2    │ Docker 3  │  │
│  │ (ubuntu-20.04)      │ (ubuntu-20.04)   │ (ubuntu)  │  │
│  │                     │                  │           │  │
│  │ Containers:         │ Containers:      │ Containers:  │
│  │ - trigger-web       │ - trigger-web    │ - trigger-web
│  │ - trigger-worker    │ - trigger-worker │ - trigger  │
│  │ - cfn-agent:backend │ - cfn-agent:seo  │ - cfn-agent  │
│  │ - cfn-agent:ops     │ - cfn-agent:copy │ - cfn-agent  │
│  │ - redis             │ - redis          │ - redis    │
│  │ - postgres          │ - postgres       │ - postgres │
│  │                     │                  │            │
│  │ Network: bridge     │ Network: bridge  │ Network:   │
│  │ (isolated)          │ (isolated)       │ (isolated) │
│  └─────────────────────┴──────────────────┴───────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Network Isolation: iptables rules per host        │  │
│  │  - Engineering host ↔ Marketing: DENY              │  │
│  │  - Engineering host → Monitoring: ALLOW (ingress)  │  │
│  │  - All teams → Vault: ALLOW (port 8200)            │  │
│  │  - All teams → Registry: ALLOW (port 5000)         │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Per-Team Trigger.dev Instance

```
┌─────────────────────────────────────────────────────┐
│          Team Trigger.dev Instance (eng)            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌────────────────────────────────────────────────┐ │
│  │  Trigger Web Interface (Port 3000)              │ │
│  │  - Team-scoped workflow definitions             │ │
│  │  - Per-agent execution logs                     │ │
│  │  - Cost tracking dashboard                      │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌────────────────────────────────────────────────┐ │
│  │  Trigger Worker Process                         │ │
│  │  - Spawns per-agent containers                  │ │
│  │  - Monitors container health                    │ │
│  │  - Forwards events to agents                    │ │
│  └────────────────────────────────────────────────┘ │
│           │              │              │           │
│           ▼              ▼              ▼           │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────┐   │
│  │ cfn-agent    │ │ cfn-agent    │ │ cfn-agent │   │
│  │ backend      │ │ frontend     │ │ devops    │   │
│  │ Container    │ │ Container    │ │ Container │   │
│  │              │ │              │ │           │   │
│  │ Image:       │ │ Image:       │ │ Image:    │   │
│  │ cfn-agent    │ │ cfn-agent    │ │ cfn-agent │   │
│  │ -eng:latest  │ │ -eng:latest  │ │ -eng:latest    │
│  │              │ │              │ │           │   │
│  │ Labels:      │ │ Labels:      │ │ Labels:   │   │
│  │ team: eng    │ │ team: eng    │ │ team: eng │   │
│  │ role:backend │ │ role:frontend│ │ role:ops  │   │
│  │ project:auth │ │ project:web  │ │ project:  │   │
│  │              │ │              │ │ infra     │   │
│  └──────────────┘ └──────────────┘ └───────────┘   │
│                                                     │
│  ┌────────────────────────────────────────────────┐ │
│  │  Redis (Trigger Queue Management)               │ │
│  │  - Workflow execution queue                     │ │
│  │  - Agent coordination (per CFN spec)            │ │
│  │  - Team-isolated keyspace                       │ │
│  │  - NO cross-team access                         │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌────────────────────────────────────────────────┐ │
│  │  PostgreSQL (State Persistence)                 │ │
│  │  - Workflow definitions                         │ │
│  │  - Agent execution history                      │ │
│  │  - Cost tracking data                           │ │
│  │  - Team-isolated database                       │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌────────────────────────────────────────────────┐ │
│  │  Vault Agent (Secret Injection)                 │ │
│  │  - Mounts organization Vault                    │ │
│  │  - Injects secrets into agents                  │ │
│  │  - Team-scoped secret path: secret/data/eng/*  │ │
│  │  - Auto-rotation enabled                        │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 4. Network Isolation Strategy

### Network Security Layers

#### Layer 1: Kubernetes Network Policies (Cluster Level)

```yaml
# Deny all ingress by default
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: eng
spec:
  podSelector: {}
  policyTypes:
    - Ingress

---
# Allow Trigger worker to spawn agents
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-worker-to-agent
  namespace: eng
spec:
  podSelector:
    matchLabels:
      app: cfn-agent
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: eng
          podSelector:
            matchLabels:
              app: trigger-worker
      ports:
        - protocol: TCP
          port: 8000

---
# Allow agents to access Redis (internal only)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-agent-to-redis
  namespace: eng
spec:
  podSelector:
    matchLabels:
      app: redis
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: eng
          podSelector:
            matchLabels:
              component: trigger
      ports:
        - protocol: TCP
          port: 6379

---
# Allow agents to access Postgres (internal only)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-agent-to-postgres
  namespace: eng
spec:
  podSelector:
    matchLabels:
      app: postgres
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: eng
          podSelector:
            matchLabels:
              component: trigger
      ports:
        - protocol: TCP
          port: 5432

---
# Allow Trigger web (ingress traffic)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-trigger-web-ingress
  namespace: eng
spec:
  podSelector:
    matchLabels:
      app: trigger-web
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector: {}  # All namespaces
      ports:
        - protocol: TCP
          port: 3000
```

#### Layer 2: VPC-Level Network Isolation

```
Organization VPC (10.0.0.0/16)
│
├── Engineering Subnet (10.1.0.0/24)
│   └── K8s Cluster CIDR: 10.1.10.0/24
│       └── Pod CIDR: 10.1.10.0/25
│       └── Service CIDR: 10.1.10.128/25
│
├── Marketing Subnet (10.2.0.0/24)
│   └── K8s Cluster CIDR: 10.2.10.0/24
│       └── Pod CIDR: 10.2.10.0/25
│       └── Service CIDR: 10.2.10.128/25
│
├── Data Subnet (10.3.0.0/24)
│   └── K8s Cluster CIDR: 10.3.10.0/24
│       └── Pod CIDR: 10.3.10.0/25
│       └── Service CIDR: 10.3.10.128/25
│
└── Management Subnet (10.4.0.0/24)
    └── Monitoring, Vault, Registry

Security Group Rules:
- Eng → Marketing: DENY
- Eng → Data: DENY
- Marketing → Eng: DENY
- Marketing → Data: DENY
- Data → Eng: DENY
- Data → Marketing: DENY
- All → Management: ALLOW (specific ports: 8200 for Vault, 443 for registry)
- All → Org Gateway: ALLOW (ingress: 443)
```

#### Layer 3: Container-Level Isolation (cgroups)

```bash
# Run cfn-agent with network namespace isolation
docker run \
  --name cfn-agent-backend-001 \
  --network eng-net \
  --ip 10.1.10.100 \
  --label team=eng \
  --label role=backend \
  --cpus=4 \
  --memory=8g \
  --pids-limit=1024 \
  cfn-agent-eng:backend:latest

# Network namespace provides:
# - Isolated network interfaces (no host network access)
# - Isolated routing table (cannot route to other team networks)
# - Isolated iptables rules (cannot access other team containers)
```

### Network Access Patterns

#### Same-Team Access (ALLOWED)

```
┌─────────────────────────────────────────────┐
│        Engineering Team Network             │
├─────────────────────────────────────────────┤
│                                             │
│  cfn-agent:backend ──► redis (ALLOWED)     │
│  cfn-agent:backend ──► postgres (ALLOWED)  │
│  cfn-agent:backend ──► cfn-agent:frontend  │
│                       (via Redis pub/sub,   │
│                        ALLOWED)             │
│                                             │
│  trigger-web ──► postgres (ALLOWED)        │
│  trigger-worker ──► cfn-agent:* (ALLOWED)  │
│                                             │
│  vault-agent ──► org-vault (ALLOWED)       │
│                                             │
└─────────────────────────────────────────────┘
```

#### Cross-Team Access (DENIED)

```
┌───────────────────────────────────────────────────────┐
│                 Cross-Team Access                     │
├───────────────────────────────────────────────────────┤
│                                                       │
│  cfn-agent:eng:backend ──► redis:marketing (DENIED)  │
│  cfn-agent:eng:backend ──► postgres:data (DENIED)    │
│  cfn-agent:eng:backend ──► cfn-agent:mkt:* (DENIED)  │
│                                                       │
│  Network policy rejects:                             │
│  1. DNS resolution of marketing-redis.internal       │
│  2. ARP requests for marketing subnet                │
│  3. IP routing to 10.2.0.0/24 (marketing subnet)     │
│  4. Connection attempts to port 6379/5432 outside    │
│     team namespace                                    │
│                                                       │
└───────────────────────────────────────────────────────┘
```

#### Organization-Level Access (CONTROLLED)

```
All Teams → Organization Services (ALLOWED with restrictions)
├── All Teams → Vault (ALLOWED, port 8200)
│   └── Each team uses team-scoped secret path
│       (Vault RBAC enforces: eng team can only access secret/data/eng/*)
│
├── All Teams → Harbor Registry (ALLOWED, port 443)
│   └── Each team pulls from team-scoped image registry path
│       (harbor.io/trigger/eng/cfn-agent:latest)
│
├── All Teams → Prometheus (ALLOWED, port 9090)
│   └── Scrape only team-labeled metrics
│       (metrics with label team="eng")
│
└── All Teams → Elasticsearch (ALLOWED, port 9200)
    └── Index isolation via team-scoped indices
        (logs-eng-*, logs-mkt-*, logs-data-*)
```

---

## 5. Resource Allocation and Cost Tracking

### Resource Allocation Strategy

#### Per-Team Resource Pools

| Team | CPU (reserved/limit) | Memory (reserved/limit) | Storage | Concurrent Agents |
|------|---|---|---|---|
| Engineering | 8/32 cores | 16/128 GB | 500 GB | 64 |
| Marketing | 4/16 cores | 8/64 GB | 250 GB | 32 |
| Data | 16/64 cores | 32/256 GB | 1 TB | 128 |
| **Total** | **28/112 cores** | **56/448 GB** | **1.75 TB** | **224 agents** |

#### Per-Agent Resource Limits

```yaml
# cfn-agent resource limits (Kubernetes)
apiVersion: v1
kind: Pod
metadata:
  name: cfn-agent-backend-001
  namespace: eng
  labels:
    team: eng
    role: backend
    project: auth-service
spec:
  containers:
    - name: cfn-agent
      image: cfn-agent-eng:backend:latest
      resources:
        requests:
          cpu: 0.5
          memory: 512Mi
        limits:
          cpu: 2
          memory: 2Gi
      env:
        - name: CFN_COST_CENTER
          value: ENG-001
        - name: CFN_PROJECT
          value: auth-service
        - name: CFN_AGENT_ROLE
          value: backend
```

#### CPU/Memory Allocation Rules

**Reserved Resources (guaranteed):**
- Used for baseline operation (Trigger processes, agent startup)
- Never overcommitted (reserved × num_teams < total_capacity)
- Prevents one team from starving others

**Limit Resources (burstable):**
- Allows temporary spikes (agent intensive workload)
- Can be overcommitted (limit × num_teams > total_capacity)
- Enforced via cgroups (kernel throttles if exceeded)

**Example Burst Scenario:**
```
Total cluster capacity: 112 cores
Reserved: 28 cores (25%)
Limit: 112 cores (100%)

Scenario: Data team runs 128 concurrent agents
- Data team base load: 16 cores (reserved)
- Data team burst load: 48 cores (limit - reserved)
- Data team CPU request: 16 + 48 = 64 cores
- Remaining capacity: 112 - 64 = 48 cores
- If Data exceeds 64 cores → kernel throttles at limit

Other teams still have access to:
- Engineering reserved: 8 cores (guaranteed)
- Marketing reserved: 4 cores (guaranteed)
- Burst capacity if Data doesn't exceed limits
```

### Cost Tracking Implementation

#### Container Label Schema

```bash
# All containers labeled with cost metadata
docker run \
  --label team=engineering \
  --label role=backend \
  --label project=auth-service \
  --label cost-center=ENG-001 \
  --label cost-pool=cpu-intensive \
  --label environment=production \
  cfn-agent-eng:backend:latest
```

#### Kubernetes Pod Labels

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: cfn-agent-backend-001
  namespace: eng
  labels:
    team: eng
    role: backend
    project: auth-service
    cost-center: ENG-001
    cost-pool: cpu-intensive
    environment: production
    billing-period: "2025-11"
```

#### Cost Tracking Metrics (Prometheus)

```promql
# CPU cost per team (example: $0.40 per core-hour)
CPU_COST_PER_HOUR = sum(rate(container_cpu_usage_seconds_total[1h]))
                    by (team) * 0.40

# Memory cost per team (example: $0.05 per GB-hour)
MEMORY_COST_PER_HOUR = (sum(container_memory_usage_bytes) by (team) / 1024^3)
                        * 0.05

# Storage cost per team (example: $0.10 per GB/month)
STORAGE_COST_PER_MONTH = (sum(container_rootfs_usage_bytes) by (team) / 1024^3)
                         * 0.10

# Total cost per team
TEAM_COST = CPU_COST_PER_HOUR + MEMORY_COST_PER_HOUR + STORAGE_COST_PER_MONTH
```

#### Cost Dashboard (Grafana)

```
┌─────────────────────────────────────────────────────────────┐
│           Team Cost Tracking Dashboard (Grafana)            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Current Month Costs (as of 2025-11-24)                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Engineering: $4,250  (40% of total)                    │ │
│  │   - CPU (32c avg): $2,000                              │ │
│  │   - Memory (128GB avg): $1,200                         │ │
│  │   - Storage (500GB): $1,050                            │ │
│  │                                                        │ │
│  │ Data: $5,100  (48% of total)                           │ │
│  │   - CPU (64c avg): $3,200                              │ │
│  │   - Memory (256GB avg): $1,500                         │ │
│  │   - Storage (1TB): $2,400                              │ │
│  │                                                        │ │
│  │ Marketing: $1,350  (12% of total)                      │ │
│  │   - CPU (16c avg): $600                                │ │
│  │   - Memory (64GB avg): $300                            │ │
│  │   - Storage (250GB): $450                              │ │
│  │                                                        │ │
│  │ Total Organization Cost: $10,700                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  CPU Usage Trend (Last 7 Days)                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ █████████ Eng  █████ Mkt  ██████████ Data             │ │
│  │ Mon    Tue    Wed    Thu    Fri    Sat    Sun         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  Allocation vs Limit (Current Hour)                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Eng:  ████████░░ (16/32 cores = 50%)                 │ │
│  │ Mkt:  ██░░░░░░░░ (2/16 cores = 12%)                  │ │
│  │ Data: ███████░░░ (56/64 cores = 88%)                 │ │
│  │                                                        │ │
│  │ Remaining burst capacity: 38 cores                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  Cost per Agent (Last 7 Days Avg)                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Eng backend:      $12.50 per agent per day            │ │
│  │ Eng frontend:     $8.75 per agent per day             │ │
│  │ Mkt seo:         $5.00 per agent per day              │ │
│  │ Data etl:        $18.75 per agent per day             │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Chargeback Model

**Monthly chargeback to teams:**

```
Formula:
  Team_Cost = Team_CPU_Hours * $0.40 + Team_Memory_GB_Hours * $0.05 + Team_Storage_GB * $0.10

Example (Engineering Team):
  - CPU: 32 cores average × 730 hours/month = 23,360 core-hours × $0.40 = $9,344
  - Memory: 128 GB average × 730 hours/month = 93,440 GB-hours × $0.05 = $4,672
  - Storage: 500 GB × $0.10 = $50
  - Total Monthly Cost: $14,066

Chargeback:
  - Actual cost: $14,066
  - Discount (volume): -15% = -$2,109
  - Final chargeback: $11,957
```

---

## 6. Security Boundaries and Access Control

### Identity and Access Management (IAM)

#### Team-Scoped Access

```
Organization Level:
├── Platform Admin (CTO, Platform Lead)
│   └── Access: All teams, all infrastructure, Vault admin
│
├── Team Lead (each team)
│   └── Access: Own team Trigger.dev, own Vault secrets, own metrics
│       └── Cannot: Access other teams' infrastructure
│       └── Can: Create/delete agents, view execution logs, adjust resource limits
│
├── Developer (each team)
│   └── Access: Own team Trigger.dev workflows, own project logs
│       └── Cannot: Delete workflows, modify resource limits, access other teams
│       └── Can: Execute workflows, view logs, debug agents
│
└── Service Account (automation)
    └── Access: Limited to specific operations (backup, monitoring, logging)
```

#### RBAC Implementation (Kubernetes)

```yaml
# Engineering team lead role
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: team-lead
  namespace: eng
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/logs"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["delete"]
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "patch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "patch"]

---
# Bind role to team lead user
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: team-lead-binding
  namespace: eng
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: team-lead
subjects:
  - kind: User
    name: alice@company.com
    apiGroup: rbac.authorization.k8s.io
```

### Secret Management (Vault)

#### Per-Team Vault Paths

```
vault/
├── secret/data/engineering/
│   ├── zai-api-key
│   ├── kimi-api-key
│   ├── github-token
│   └── slack-webhook
│
├── secret/data/marketing/
│   ├── zai-api-key
│   ├── mailchimp-token
│   └── hubspot-api-key
│
└── secret/data/data/
    ├── zai-api-key
    ├── warehouse-credentials
    └── ml-model-keys
```

#### Vault Access Policy (per team)

```hcl
# Engineering team Vault policy
path "secret/data/engineering/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/data/engineering/*" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Deny access to other teams
path "secret/data/marketing/*" {
  capabilities = ["deny"]
}

path "secret/data/data/*" {
  capabilities = ["deny"]
}
```

### Audit Logging

#### Events Logged (per team)

```
Vault Audit Log:
├── Secret access (who, when, path)
├── Secret rotation (automated, manual)
├── Policy changes
└── Authentication failures

Kubernetes Audit Log:
├── Pod creation/deletion
├── Exec into pod (command executed)
├── Configuration changes
├── RBAC violations (denied access)

Trigger.dev Audit Log:
├── Workflow execution
├── Agent deployment
├── Resource limit changes
├── Cost quota exceeded

Elasticsearch Centralized Logs:
├── All audit events aggregated
├── Indexed by team label
├── Searchable by team (team can only see own logs)
├── Retention: 90 days (SOC 2 requirement)
└── Immutable (no deletion, only retention policy)
```

#### Audit Log Access Control

```
Team members can search logs:
  - Only their team's logs (elasticsearch index: logs-eng-*)
  - Filtered by their own user ID (cannot see other users' commands)
  - Cannot see infrastructure audit (Kubernetes API server logs)

Platform admins can search logs:
  - All teams' logs
  - Cross-team audit analysis
  - Security investigation
  - Compliance reporting (SOC 2, PCI-DSS)
```

---

## 7. Scalability Considerations

### Horizontal Scaling Strategy

#### Scenario 1: Single Team Scales to 1000 Agents

```
Initial State:
├── Engineering team: 64 agents (16 core reserved, 32 core limit)
└── Cluster capacity: 112 cores

Target State:
├── Engineering team: 1000 agents (needs 500 cores)
└── Solution: Expand engineering K8s cluster to 512 cores

Steps:
1. Add 4 additional worker nodes to eng-k8s (each 128 cores)
2. Update team resource pool: reserved 40 cores, limit 512 cores
3. Increase per-agent resource limits if needed (or reduce to 0.5 core per agent)
4. Scale trigger-worker deployment: replicas 1 → 4 (distribute load)
5. Update Prometheus/Grafana scrape configs for new nodes
6. Monitor: CPU, memory, network bandwidth consumption
```

#### Scenario 2: New Team Joins Organization

```
New ML Engineering Team joining:
├── Size: 15 engineers, 100 agents
├── Requirements: 24 cores, 96 GB RAM, 300 GB storage
└── Estimated cost: $3,500/month

Solution:
1. Allocate team subnet: 10.5.0.0/24 (ML team)
2. Create new Kubernetes cluster: ml-k8s (128 cores capacity)
3. Create Vault paths: secret/data/ml-team/*
4. Create Harbor registry paths: harbor.io/trigger/ml-team/*
5. Configure network policies: Deny all ingress by default
6. Provision Trigger.dev instance: ml.company.com/trigger.dev
7. Set up team-scoped Prometheus scraping
8. Create Grafana dashboards (team view + shared dashboards)
9. Configure cost tracking: Label all containers with team=ml-team
10. Implement chargeback: Monthly ML team invoice
```

#### Scenario 3: Organization Reaches Infrastructure Limits

```
Current state:
├── Total capacity: 112 cores, 448 GB RAM, 1.75 TB storage
├── Utilization: 85% (CPU), 80% (memory), 70% (storage)
└── Growth rate: +20% per quarter

Projected in 2 quarters:
├── Needed capacity: 112 × 1.20² = 161 cores, 646 GB RAM, 2.5 TB
└── Current utilization: 93% (CPU), 88% (memory), 84% (storage)

Options:
1. **Horizontal expansion:** Add new regional clusters
   - Create EU cluster for data residency
   - Create APAC cluster for low latency
   - Data team splits across regions

2. **Vertical expansion:** Upgrade existing nodes
   - Replace 64-core nodes with 128-core nodes
   - Add high-memory nodes (512 GB) for ML workloads
   - Add GPU nodes for specialized workloads

3. **Resource optimization:**
   - Reduce per-agent reserved resources (0.5 → 0.25 core)
   - Implement request autoscaling (HPA - Horizontal Pod Autoscaler)
   - Schedule agents to run during off-peak hours

4. **Multi-cloud deployment:**
   - AWS EKS for primary workload
   - Google GKE for burst capacity
   - Azure AKS for BCDR (backup/restore)
```

### Auto-Scaling Configuration

#### Kubernetes Horizontal Pod Autoscaler (HPA)

```yaml
# Auto-scale cfn-agents based on CPU and memory
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cfn-agent-autoscaler
  namespace: eng
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cfn-agent-pool
  minReplicas: 1
  maxReplicas: 128
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 85
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 15
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 200
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max
```

#### Cluster Auto-Scaling (AWS)

```bash
# Configure Cluster Autoscaler for engineering K8s
helm install cluster-autoscaler stable/cluster-autoscaler \
  --set autoDiscovery.clusterName=eng-k8s \
  --set awsRegion=us-east-1 \
  --set cloudProvider=aws \
  --set extraArgs.scale-down-enabled=true \
  --set extraArgs.scale-down-delay-after-add=10m \
  --namespace kube-system
```

### Load Balancing Strategy

#### Across Multiple Agents (same team)

```
Trigger Worker distributes jobs:
├── Job 1 → cfn-agent-backend-001 (8% CPU)
├── Job 2 → cfn-agent-backend-002 (12% CPU)
├── Job 3 → cfn-agent-backend-003 (9% CPU)
├── Job 4 → cfn-agent-backend-004 (15% CPU)
└── ...
└── Average utilization per agent: ~10-15% (no single point of overload)
```

#### Across Multiple Clusters (same organization)

```
DNS Round-Robin:
eng.company.com resolves to:
  - eng-k8s-us-east-1.company.com (primary)
  - eng-k8s-us-west-2.company.com (secondary)
  - eng-k8s-eu-west-1.company.com (BCDR)

Failover Logic:
├── Primary healthy → route to US-East
├── Primary down → route to US-West (30s failover)
├── Both down → route to EU (cross-region failover)
└── All down → return 503 Service Unavailable (alerting triggered)
```

---

## 8. Migration Strategy

### Phase 1: Pilot Deployment (Week 1-2)

**Objective:** Validate architecture with single team in controlled environment

```
Target Team: Engineering (smallest risk, highest stakeholder support)
  ├── Team size: 25 engineers
  ├── Current workload: 200 agents/week
  └── Risk level: Low (can rollback to Redis-based if issues)

Milestones:
  Day 1-2: Build engineering K8s cluster + Trigger.dev instance
  Day 3-4: Migrate 10% of workflows (low-risk, internal tools)
  Day 5:   Validate functionality, cost tracking, performance
  Day 6-7: Migrate remaining 90% (gradual rollout)
  Day 8-9: Observe 1 week of production behavior
  Day 10-14: Performance tuning, documentation, lessons learned

Success Criteria:
  ✓ 100% workflow success rate (vs 98% on Redis baseline)
  ✓ Cost tracking accurate within 5%
  ✓ Performance: p99 latency < 200ms (vs 150ms Redis baseline, acceptable)
  ✓ Zero cross-team security incidents
  ✓ Team reports 95%+ satisfaction (NPS)
  ✓ Zero data loss or corruption
```

### Phase 2: Rollout to Additional Teams (Week 3-4)

**Objective:** Deploy to all remaining teams with lessons from pilot

```
Timeline:
  Week 3:
  ├── Day 1-3: Deploy marketing K8s + Trigger.dev
  ├── Day 4:   Migrate 50% of marketing workflows (gradual)
  └── Day 5-7: Observe, tune, finalize

  Week 4:
  ├── Day 1-3: Deploy data K8s + Trigger.dev
  ├── Day 4:   Migrate 50% of data workflows
  └── Day 5-7: Observe, production hardening

Target: All teams production-ready by end of Week 4
```

### Phase 3: Decommission Legacy Systems (Week 5+)

**Objective:** Remove Redis-based coordination, consolidate infrastructure

```
Decommissioning Steps:
  1. Verify all teams using new Trigger.dev system exclusively (1 week observation)
  2. Run comparative metrics: new system vs old system (same workloads)
  3. Backup old Redis data (compliance, audits)
  4. Shutdown old orchestrator/coordinator infrastructure
  5. Reduce Kubernetes node counts (delete old agent pools)
  6. Archive old CFN Loop documentation
  7. Update internal documentation (single source of truth)

Expected Outcome:
  - 95-98% cost savings (vs Task Mode)
  - 20-30% cost reduction (vs old Redis system)
  - Simplified operations (single orchestration system)
  - Faster scaling (Trigger.dev native)
```

### Rollback Plan

```
If critical issues detected during migration:

Rollback Trigger (Issue: Agent failure rate > 2%)
  1. Stop new Trigger.dev deployments
  2. Redirect traffic to Redis-based system (DNS CNAME change)
  3. Investigate root cause (check logs, metrics, resources)
  4. Fix and re-test in lab environment (2 hours)
  5. Restart migration Phase 2 after fix validation

Rollback Trigger (Issue: Security breach detected)
  1. Isolate affected team's K8s cluster (network policy: deny all egress)
  2. Preserve all logs/evidence for forensics
  3. Restore PostgreSQL from daily backup (1 hour)
  4. Investigate in isolated lab environment
  5. Re-deploy cluster from clean image template after fix

Rollback Trigger (Issue: Cost overrun > 50%)
  1. Implement resource quotas (limit per-team CPU, memory)
  2. Enable cost anomaly alerts (Prometheus alert rule)
  3. Reduce agent concurrency limits (temporary, while investigating)
  4. Optimize resource allocation (per-agent limits, reservation adjustments)
  5. Resume gradual rollout after optimization
```

---

## 9. Operational Procedures

### Daily Operations

#### Monitoring Dashboard

Team lead checks dashboard each morning:
```
Engineering Team Trigger Dashboard (eng.company.com/trigger.dev)
├── Health Status
│   ├── Trigger Web: UP (99.98% uptime)
│   ├── Trigger Worker: UP (4 replicas)
│   ├── Redis: UP (memory 45%)
│   ├── PostgreSQL: UP (disk 30%)
│   └── Overall: HEALTHY
│
├── Workload
│   ├── Agents running: 34/64 (53%)
│   ├── Agents queued: 8 (avg wait 3s)
│   ├── Recent errors: 0
│   └── Agent success rate: 99.7%
│
├── Cost (current hour)
│   ├── CPU: $18.50 (16 cores × $0.40/hr)
│   ├── Memory: $5.60 (112GB × $0.05/hr)
│   ├── Storage: $0.50 (500GB ÷ 720 hrs)
│   └── Total hourly: $24.60
│
└── Alerts
    ├── None currently active
    ├── Last alert: 48 hours ago (memory spike, resolved)
    └── Upcoming maintenance: None
```

#### Weekly Operations

Operations team performs weekly health check:
```
Monday 9:00 AM - Engineering Team Infrastructure Check
├── Verification
│   ├── All 3 nodes responding to ping
│   ├── All 4 Trigger worker replicas running
│   ├── Redis replication lag < 1ms
│   ├── PostgreSQL backups completed (7 × daily backups verified)
│   └── Network policies blocking cross-team traffic (verified via test)
│
├── Performance Metrics (last 7 days)
│   ├── Average CPU utilization: 35%
│   ├── Average memory utilization: 42%
│   ├── Agent success rate: 99.8%
│   ├── Avg agent execution time: 45s (up 2% vs week prior, acceptable)
│   └── Cost: $7,850 (on track for $28,000/month budget)
│
├── Log Review
│   ├── Error rate: 0.2% (4 errors out of 2000 executions)
│   ├── Unique error types: 2 (OOM once, timeout once)
│   ├── No security events detected
│   └── No network policy violations
│
└── Actions
    ├── Increase per-agent memory limit: 512Mi → 768Mi (to prevent OOM)
    └── Ticket: Schedule architecture review with team lead (1:1 context)
```

#### Monthly Operations

Director reviews organizational metrics:
```
November 2025 - Organization Cost & Performance Review
├── Infrastructure Cost
│   ├── Engineering: $14,066 (on budget)
│   ├── Marketing: $3,854 (on budget)
│   ├── Data: $18,200 (on budget)
│   ├── Infrastructure (shared): $2,500
│   └── Total: $38,620 (well within $50k budget)
│
├── Performance vs SLOs
│   ├── Uptime: 99.98% (target 99.9%) ✓
│   ├── Agent success rate: 99.7% (target 99%) ✓
│   ├── Mean execution time: 47s (target 60s) ✓
│   └── P99 execution time: 180s (target 300s) ✓
│
├── Growth
│   ├── New agents added: +200 (mostly data team)
│   ├── Workflows created: +45
│   ├── Storage growth: +120 GB (12% month-over-month)
│   └── Utilization trend: Steady (no bottlenecks detected)
│
├── Capacity Planning
│   ├── Forecast 3 months ahead: 120% of current utilization
│   ├── Planned expansion: Q1 2026 (add 20% capacity)
│   └── Growth rate: 18% per month (sustainable)
│
└── Improvements Made
    ├── Implemented cost anomaly alerting (Prometheus)
    ├── Automated daily backups with verification
    ├── Reduced agent startup time: 5s → 2s (container pre-warming)
    └── Added team-specific Slack notifications (cost alerts)
```

### Troubleshooting Procedures

#### Scenario: Agent Stuck in Running State

```
Symptom: cfn-agent-backend-042 status shows "Running" for 4 hours
         (normal execution time is 60s)

Diagnosis:
  $ kubectl logs -n eng cfn-agent-backend-042
  → Logs stop at "Initializing network..." (network issue?)

  $ kubectl describe pod -n eng cfn-agent-backend-042
  → Node: eng-k8s-worker-3
  → Memory: 1.2 Gi / 2 Gi limit
  → CPU: 180m / 2000m limit (utilization looks normal)

  $ kubectl exec -n eng cfn-agent-backend-042 -- ps aux
  → python /app/agent.py (process exists, not hung)

Resolution:
  1. Check network connectivity to Redis:
     $ kubectl exec -n eng cfn-agent-backend-042 -- redis-cli -h redis ping
     → (PONG response) ✓ Network is fine

  2. Check Redis queue:
     $ kubectl exec -n eng redis -- redis-cli LLEN cfn:queue
     → 342 jobs in queue
     → Agent may be stuck waiting for job assignment

  3. Check trigger-worker logs:
     $ kubectl logs -n eng -l app=trigger-worker --tail=100
     → ERROR: Worker process crashed at 2:47 AM
     → Webhook receiver not responding

  4. Restart trigger-worker:
     $ kubectl rollout restart deployment/trigger-worker -n eng

  5. Monitor recovery:
     $ kubectl logs -n eng -f -l app=trigger-worker
     → Agent starts accepting jobs
     → cfn-agent-backend-042 transitions to "Completed" (job finished)

Action Items:
  - [ ] Add memory limit check (memory creep detected, increase limit 2 Gi → 3 Gi)
  - [ ] Update alert rule: Agent stuck > 2 hours (not just 4 hours)
  - [ ] Add redundancy to trigger-worker (2 replicas minimum, not 1)
```

#### Scenario: Cross-Team Network Access Detected

```
Symptom: Security audit finds connection from eng-agent-backend to mkt-redis:6379

Investigation:
  $ kubectl logs -n kube-system -l component=cilium | grep DENY
  → 2025-11-24 14:23:45: Policy DENY eng/cfn-agent-backend → mkt/redis:6379
  → Verdict: Policy denied, connection blocked ✓

  $ kubectl get networkpolicy -n eng
  → No policy explicitly allowing cross-namespace traffic ✓

  $ kubectl get networkpolicy -n mkt
  → Deny all ingress (default policy) ✓

Finding: Policy is working as intended, network isolation is effective
         Agent was attempting to reach marketing Redis (misconfiguration in agent image)

Resolution:
  1. Identify misconfigured agent image:
     $ grep -r "mkt-redis" docker/teams/eng/ → Found in env var!

  2. Fix Dockerfile:
     FROM cfn-agent-eng:base
     ENV REDIS_HOST=redis (should be same cluster, not mkt-redis)

  3. Rebuild image:
     $ make build-agent-image TEAM=eng

  4. Deploy new image:
     $ kubectl rollout restart deployment/cfn-agent-backend -n eng

  5. Verify no further attempts:
     $ kubectl logs -n kube-system -l component=cilium --since=2m | grep DENY
     → No more policy violations detected ✓

Action Items:
  - [ ] Add pre-deploy validation (check for cross-team env vars)
  - [ ] Update team documentation: Redis endpoints are always 'redis' in same cluster
  - [ ] Add test case: Verify no hardcoded cross-team hostnames in images
```

---

## 10. Appendix: Implementation Details

### Directory Structure

```
docker/
├── teams/                              # Team-specific configurations
│   ├── engineering/
│   │   ├── Dockerfile.agent            # Team-specific agent image
│   │   ├── requirements.txt             # Python dependencies
│   │   ├── config/
│   │   │   ├── logging.yaml
│   │   │   ├── trigger.yaml
│   │   │   └── vault-config.hcl
│   │   └── docker-compose.yml           # Local dev for team
│   │
│   ├── marketing/
│   │   ├── Dockerfile.agent
│   │   ├── requirements.txt
│   │   ├── config/
│   │   └── docker-compose.yml
│   │
│   └── data/
│       ├── Dockerfile.agent
│       ├── requirements.txt
│       ├── config/
│       └── docker-compose.yml
│
├── base/
│   ├── Dockerfile.agent-base           # Base image (all teams)
│   └── scripts/
│       ├── entrypoint.sh
│       ├── healthcheck.sh
│       └── vault-inject.sh
│
├── kubernetes/
│   ├── base/
│   │   ├── trigger-web.yaml            # Trigger web deployment
│   │   ├── trigger-worker.yaml          # Trigger worker deployment
│   │   ├── redis.yaml                   # Redis statefulset
│   │   ├── postgres.yaml                # PostgreSQL statefulset
│   │   └── vault-agent.yaml             # Vault agent sidecar
│   │
│   ├── overlays/
│   │   ├── engineering/
│   │   │   ├── kustomization.yaml
│   │   │   ├── resource-quotas.yaml     # Team resource limits
│   │   │   ├── network-policies.yaml    # Team network isolation
│   │   │   └── config.yaml              # Team-specific config
│   │   │
│   │   ├── marketing/
│   │   └── data/
│   │
│   └── monitoring/
│       ├── prometheus-config.yaml       # Multi-team scraping
│       ├── grafana-dashboards.yaml
│       └── alerting-rules.yaml
│
└── trigger-dev/
    ├── docker-compose.yml               # Local dev environment
    ├── docker-compose.secrets.yml       # Secret injection
    ├── environments/
    │   ├── dev.yml
    │   ├── staging.yml
    │   └── prod.yml
    └── config/
        └── trigger-config.json
```

### Team Dockerfile Template

```dockerfile
# File: docker/teams/engineering/Dockerfile.agent

FROM cfn-agent-eng:base:latest

ARG TEAM_NAME=engineering
ARG BUILD_DATE
ARG VCS_REF

# Team metadata
LABEL team="${TEAM_NAME}"
LABEL cost-center="ENG-001"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${VCS_REF}"

# Team-specific dependencies
COPY teams/${TEAM_NAME}/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt

# Team-specific configuration
COPY teams/${TEAM_NAME}/config/ /etc/cfn/config/
RUN chown -R app:app /etc/cfn/config

# Team-specific scripts
COPY teams/${TEAM_NAME}/scripts/ /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh

# Set team environment
ENV CFN_TEAM="${TEAM_NAME}"
ENV CFN_COST_CENTER="ENG-001"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD /usr/local/bin/healthcheck.sh || exit 1

# Entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

### Network Policy Example

```yaml
# File: docker/kubernetes/overlays/engineering/network-policies.yaml

apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: eng
spec:
  podSelector: {}
  policyTypes:
    - Ingress

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-trigger-web-ingress
  namespace: eng
spec:
  podSelector:
    matchLabels:
      app: trigger-web
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 3000

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-worker-to-agents
  namespace: eng
spec:
  podSelector:
    matchLabels:
      component: agent
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: trigger-worker
      ports:
        - protocol: TCP
          port: 8000

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-cross-team
  namespace: eng
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: eng
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-public
```

### Cost Tracking Query (SQL)

```sql
-- File: docs/COST_TRACKING_QUERIES.sql

-- Monthly cost per team
SELECT
  team,
  SUM(cpu_cost) as total_cpu_cost,
  SUM(memory_cost) as total_memory_cost,
  SUM(storage_cost) as total_storage_cost,
  SUM(cpu_cost) + SUM(memory_cost) + SUM(storage_cost) as total_monthly_cost
FROM
  container_costs
WHERE
  billing_period = '2025-11'
GROUP BY
  team
ORDER BY
  total_monthly_cost DESC;

-- Cost breakdown by project within team
SELECT
  team,
  project,
  role,
  COUNT(DISTINCT container_id) as num_agents,
  AVG(cpu_usage) as avg_cpu,
  AVG(memory_usage) as avg_memory,
  SUM(execution_duration_seconds) / 3600.0 as total_hours,
  SUM(execution_duration_seconds) / 3600.0 * 0.40 as cpu_cost
FROM
  container_costs
WHERE
  billing_period = '2025-11'
  AND team = 'engineering'
GROUP BY
  team, project, role
ORDER BY
  cpu_cost DESC;

-- Forecast next month based on growth
SELECT
  team,
  SUM(total_monthly_cost) * 1.15 as forecasted_cost_next_month,
  ROUND((SUM(total_monthly_cost) * 1.15) / SUM(total_monthly_cost) - 1, 3) as growth_rate
FROM
  container_costs
WHERE
  billing_period IN ('2025-10', '2025-11')
GROUP BY
  team
ORDER BY
  forecasted_cost_next_month DESC;
```

---

## Summary and Recommendations

### Key Architectural Decisions

| Element | Recommendation | Trade-off |
|---------|---|---|
| **Deployment Model** | **Option B: Dedicated Trigger.dev per team** | Higher cost (+30-50%) but 100% isolation, better compliance, team autonomy |
| **Orchestration** | **Kubernetes (Prod) / Docker Compose (Dev)** | Operational complexity vs scalability and self-healing benefits |
| **Network Isolation** | **Namespace + VPC + Network Policies** | Minimal performance overhead for defense-in-depth security |
| **Secret Management** | **Team-scoped Vault** | Slight operational complexity for per-team secret rotation and audit trails |
| **Cost Tracking** | **Container labels + Prometheus** | Custom integration required, but real-time cost visibility and team chargeback |
| **Scaling** | **Horizontal (add clusters) + Auto-scaling** | Infrastructure management complexity but unlimited growth potential |

### Success Criteria (12-Month Horizon)

✓ **Security:** Zero cross-team security incidents, 100% audit coverage
✓ **Cost:** 95-98% savings vs Task Mode deployment, accurate chargeback
✓ **Performance:** 99.9%+ uptime, sub-100ms latency, 99%+ success rate
✓ **Compliance:** SOC 2 Type II certified, PCI-DSS ready, GDPR compliant
✓ **Scalability:** Support 1000+ agents across all teams without contention
✓ **Operational Excellence:** Team-scoped dashboards, automated troubleshooting

### Migration Timeline

- **Week 1-2:** Pilot with Engineering team
- **Week 3-4:** Rollout to Marketing and Data teams
- **Week 5+:** Legacy system decommissioning
- **Target:** Full production by end of Month 2

---

**Document Owner:** System Architect
**Last Updated:** 2025-11-24
**Next Review:** 2025-12-01 (Post-Phase-5-Implementation)
**Status:** Complete - Ready for Implementation Team Review
