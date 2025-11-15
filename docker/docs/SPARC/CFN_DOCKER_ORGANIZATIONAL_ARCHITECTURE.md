# CFN Docker Organizational Architecture

**Document Version:** 1.0.0
**Date:** 2025-11-15
**Status:** Phase 0A Complete - Ready for Implementation
**Purpose:** Define organizational architecture for multi-team CFN Loop Docker infrastructure

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Three-Tier Hierarchy](#2-three-tier-hierarchy)
3. [Team Structure](#3-team-structure)
4. [Network Topology](#4-network-topology)
5. [Storage Architecture](#5-storage-architecture)
6. [Resource Allocation](#6-resource-allocation)
7. [Communication Patterns](#7-communication-patterns)

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                         Docker Host (Linux)                            │
│                     Host Requirements: 90GB RAM, 25 CPU cores          │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │               cfn-docker-main-coordinator                         ││
│  │  - Cross-team resource allocation                                 ││
│  │  - Escalation handling                                            ││
│  │  - Performance monitoring                                         ││
│  │  Network: cfn-coordination (172.18.0.10)                         ││
│  └────────────┬──────────────────────────────────────────────────────┘│
│               │                                                        │
│    ┌──────────┼────────┬──────────┬──────────┬──────────┬────────┐   │
│    │          │        │          │          │          │        │   │
│  ┌─▼────┐  ┌─▼────┐ ┌─▼────┐  ┌─▼────┐  ┌─▼────┐  ┌─▼────┐  ┌─▼──┐│
│  │  SEO │  │ Mktg │ │Front │  │Back  │  │DevOps│  │  QA  │  │CSte││
│  │Coord │  │Coord │ │Coord │  │Coord │  │Coord │  │Coord │  │Crd ││
│  └──┬───┘  └──┬───┘ └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘  └─┬──┘│
│     │         │        │         │         │         │         │   │
│  ┌──┴───┐  ┌─┴────┐ ┌─┴────┐ ┌──┴───┐ ┌──┴───┐  ┌──┴───┐  ┌──┴─┐ │
│  │Agents│  │Agents│ │Agents│ │Agents│ │Agents│  │Agents│  │Agts│ │
│  │(3-5) │  │(3-4) │ │(3-5) │ │(3-6) │ │(3-4) │  │(3-4) │  │(2-3│ │
│  └──────┘  └──────┘ └──────┘ └──────┘ └──────┘  └──────┘  └────┘ │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │                    Shared Infrastructure                          ││
│  │  ┌────────────┐  ┌─────────────┐  ┌───────┐  ┌───────┐  ┌────┐ ││
│  │  │cfn-redis-  │  │cfn-redis-   │  │ cfn-  │  │ cfn-  │  │... │ ││
│  │  │shared      │  │seo/mktg/    │  │redis- │  │redis- │  │    │ ││
│  │  │(172.18.0.20│  │front/back/  │  │devops │  │qa     │  │    │ ││
│  │  │)           │  │...          │  │       │  │       │  │    │ ││
│  │  └────────────┘  └─────────────┘  └───────┘  └───────┘  └────┘ ││
│  │  ┌──────────────────────────────────────────────────────────────┐││
│  │  │ cfn-postgres (172.18.0.30)                                   │││
│  │  │ - agents, playbooks, knowledge_entries, task_history         │││
│  │  │ - operational_logs, teams                                    │││
│  │  └──────────────────────────────────────────────────────────────┘││
│  └──────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities

| Component | Role | Instances | Memory | CPU |
|-----------|------|-----------|--------|-----|
| Main Coordinator | Cross-team coordination, escalations | 1 | 4GB | 2 cores |
| Team Coordinator | Team agent management, resource tracking | 7 | 2GB each | 1 core each |
| Agent | Task execution, knowledge building | 31 max | 2-8GB each | 0.5-2 cores |
| Redis (Shared) | Cross-team coordination | 1 | 2GB | 1 core |
| Redis (Team) | Team-specific coordination | 7 | 512MB each | 0.5 cores |
| PostgreSQL | Persistence, audit logs | 1 | 8GB | 2 cores |

---

## 2. Three-Tier Hierarchy

### 2.1 Tier 1: Main Coordinator

**Container:** `cfn-docker-main-coordinator`
**Image:** `cfn-docker-main-coordinator:latest`
**Network:** `cfn-coordination` (172.18.0.10)
**Resources:** 4GB RAM, 2 CPU cores

**Responsibilities:**
- Spawn and monitor team coordinators
- Handle cross-team resource allocation
- Process escalations from team coordinators
- Monitor system-wide performance
- Enforce global resource limits (90GB RAM total)

**Does NOT:**
- Spawn agents directly (delegates to team coordinators)
- Execute tasks
- Access team workspaces

### 2.2 Tier 2: Team Coordinators

**Containers:** 7 team coordinators (one per team)
**Images:** `cfn-docker-team-coordinator:latest` (shared image)
**Networks:** `cfn-coordination` (coordin ation) + `team-{id}` (agent management)
**Resources:** 2GB RAM, 1 CPU core each

**Responsibilities:**
- Spawn and monitor team agents
- Assign tasks to agents
- Track team resource usage (memory, CPU, disk)
- Escalate to main coordinator when limits exceeded
- Manage team-specific Redis namespace

**Team Coordinators:**
1. `cfn-docker-team-coordinator-seo` (172.18.0.15)
2. `cfn-docker-team-coordinator-marketing` (172.18.0.16)
3. `cfn-docker-team-coordinator-frontend` (172.18.0.11)
4. `cfn-docker-team-coordinator-backend` (172.18.0.12)
5. `cfn-docker-team-coordinator-devops` (172.18.0.13)
6. `cfn-docker-team-coordinator-qa` (172.18.0.14)
7. `cfn-docker-team-coordinator-csuite` (172.18.0.17)

### 2.3 Tier 3: Agents

**Containers:** Up to 31 concurrent agents (team limits)
**Images:** `cfn-docker-agent-nodejs`, `cfn-docker-agent-python`, `cfn-docker-agent-rust`, `cfn-docker-agent-go`
**Networks:** `team-{id}` only (isolated per team)
**Resources:** 2-8GB RAM, 0.5-2 CPU cores (varies by agent type)

**Responsibilities:**
- Execute assigned tasks
- Build and use playbooks
- Update knowledge base
- Report status to team coordinator
- Send heartbeats every 30s

**Naming Convention:**
- `cfn-agent-{team}-{role}-{id}`
- Example: `cfn-agent-seo-content-001`

---

## 3. Team Structure

### 3.1 Team Definitions

**7 Teams:**

#### 1. SEO Team
```yaml
id: seo
name: "SEO Team"
workspace_path: /workspace/seo
network_subnet_id: 5  # 172.18.5.0/24
coordinator_ip: 172.18.0.15

resources:
  memory: 12GB
  cpu_cores: 4
  max_agents: 5
  disk_quota: 50GB

allowed_skills:
  - content-generation
  - keyword-research
  - database-readonly
  - web-scraping
```

#### 2. Marketing Team
```yaml
id: marketing
name: "Marketing Team"
workspace_path: /workspace/marketing
network_subnet_id: 6  # 172.18.6.0/24
coordinator_ip: 172.18.0.16

resources:
  memory: 10GB
  cpu_cores: 3
  max_agents: 4
  disk_quota: 40GB

allowed_skills:
  - email-campaigns
  - analytics
  - database-readonly
  - content-generation
```

#### 3. Frontend Team
```yaml
id: frontend
name: "Frontend Team"
workspace_path: /workspace/frontend
network_subnet_id: 1  # 172.18.1.0/24
coordinator_ip: 172.18.0.11

resources:
  memory: 12GB
  cpu_cores: 4
  max_agents: 5
  disk_quota: 50GB

allowed_skills:
  - playwright
  - browser-devtools
  - database-readonly
  - react-development
```

#### 4. Backend Team
```yaml
id: backend
name: "Backend Team"
workspace_path: /workspace/backend
network_subnet_id: 2  # 172.18.2.0/24
coordinator_ip: 172.18.0.12

resources:
  memory: 16GB
  cpu_cores: 5
  max_agents: 6
  disk_quota: 100GB

allowed_skills:
  - database-readwrite
  - docker-readonly
  - api-design
  - graphql-development
```

#### 5. DevOps Team
```yaml
id: devops
name: "DevOps Team"
workspace_path: /workspace/infrastructure
network_subnet_id: 3  # 172.18.3.0/24
coordinator_ip: 172.18.0.13

resources:
  memory: 12GB
  cpu_cores: 4
  max_agents: 4
  disk_quota: 75GB

allowed_skills:
  - docker-readwrite
  - kubernetes
  - database-readonly
  - cicd-pipelines
```

#### 6. QA Team
```yaml
id: qa
name: "QA Team"
workspace_path: /workspace/tests
network_subnet_id: 4  # 172.18.4.0/24
coordinator_ip: 172.18.0.14

resources:
  memory: 10GB
  cpu_cores: 3
  max_agents: 4
  disk_quota: 50GB

allowed_skills:
  - playwright
  - load-testing
  - database-readonly
  - security-scanning
```

#### 7. C-Suite Team
```yaml
id: csuite
name: "C-Suite Team"
workspace_path: /workspace/csuite
network_subnet_id: 7  # 172.18.7.0/24
coordinator_ip: 172.18.0.17

resources:
  memory: 8GB
  cpu_cores: 2
  max_agents: 3
  disk_quota: 30GB

allowed_skills:
  - analytics
  - reporting
  - database-readonly
  - data-visualization
```

### 3.2 Total Resource Requirements

```yaml
total_resources:
  coordinators:
    main: 4GB RAM, 2 CPU
    teams: 14GB RAM (7 × 2GB), 7 CPU (7 × 1)
    subtotal: 18GB RAM, 9 CPU

  agents:
    max_concurrent: 31 agents
    max_memory: 80GB (team budgets)
    max_cpu: 25 cores

  infrastructure:
    redis_shared: 2GB RAM, 1 CPU
    redis_teams: 3.5GB RAM (7 × 512MB), 3.5 CPU (7 × 0.5)
    postgres: 8GB RAM, 2 CPU
    subtotal: 13.5GB RAM, 6.5 CPU

  host_requirement:
    memory: 111.5GB (rounded to 120GB for safety)
    cpu: 40.5 cores (rounded to 48 cores for safety)
    disk: 500GB minimum (395GB quotas + logs + images)
```

---

## 4. Network Topology

### 4.1 Network Architecture

**8 Docker Networks:**

```bash
# Coordination network (main + team coordinators)
cfn-coordination
  Subnet: 172.18.0.0/24
  Gateway: 172.18.0.1
  Containers:
    - 172.18.0.10: cfn-docker-main-coordinator
    - 172.18.0.11-17: Team coordinators (7)
    - 172.18.0.20: cfn-redis-shared
    - 172.18.0.30: cfn-postgres

# Team networks (team coordinator + agents)
team-frontend
  Subnet: 172.18.1.0/24
  Gateway: 172.18.1.1
  Containers:
    - 172.18.1.10: cfn-docker-team-coordinator-frontend
    - 172.18.1.11-15: Frontend agents (max 5)
    - 172.18.1.20: cfn-redis-frontend

team-backend
  Subnet: 172.18.2.0/24
  Gateway: 172.18.2.1
  Containers:
    - 172.18.2.10: cfn-docker-team-coordinator-backend
    - 172.18.2.11-16: Backend agents (max 6)
    - 172.18.2.20: cfn-redis-backend

team-devops
  Subnet: 172.18.3.0/24
  Gateway: 172.18.3.1
  Containers:
    - 172.18.3.10: cfn-docker-team-coordinator-devops
    - 172.18.3.11-14: DevOps agents (max 4)
    - 172.18.3.20: cfn-redis-devops

team-qa
  Subnet: 172.18.4.0/24
  Gateway: 172.18.4.1
  Containers:
    - 172.18.4.10: cfn-docker-team-coordinator-qa
    - 172.18.4.11-14: QA agents (max 4)
    - 172.18.4.20: cfn-redis-qa

team-seo
  Subnet: 172.18.5.0/24
  Gateway: 172.18.5.1
  Containers:
    - 172.18.5.10: cfn-docker-team-coordinator-seo
    - 172.18.5.11-15: SEO agents (max 5)
    - 172.18.5.20: cfn-redis-seo

team-marketing
  Subnet: 172.18.6.0/24
  Gateway: 172.18.6.1
  Containers:
    - 172.18.6.10: cfn-docker-team-coordinator-marketing
    - 172.18.6.11-14: Marketing agents (max 4)
    - 172.18.6.20: cfn-redis-marketing

team-csuite
  Subnet: 172.18.7.0/24
  Gateway: 172.18.7.1
  Containers:
    - 172.18.7.10: cfn-docker-team-coordinator-csuite
    - 172.18.7.11-13: C-Suite agents (max 3)
    - 172.18.7.20: cfn-redis-csuite
```

### 4.2 Network Isolation Rules

**Firewall Configuration (iptables):**

```bash
# Allow: Agents → Team Coordinator
iptables -A DOCKER-USER -s 172.18.X.11/28 -d 172.18.X.10 -j ACCEPT

# Allow: Agents → Team Redis
iptables -A DOCKER-USER -s 172.18.X.11/28 -d 172.18.X.20 -j ACCEPT

# Block: Agents → Other Team Networks
for team_subnet in 1 2 3 4 5 6 7; do
  iptables -A DOCKER-USER -s 172.18.X.11/28 -d 172.18.${team_subnet}.0/24 -j DROP
done

# Block: Agents → Coordination Network
iptables -A DOCKER-USER -s 172.18.X.11/28 -d 172.18.0.0/24 -j DROP

# Allow: Team Coordinators → Main Coordinator
iptables -A DOCKER-USER -s 172.18.0.11/30 -d 172.18.0.10 -j ACCEPT

# Allow: Team Coordinators → Shared Redis
iptables -A DOCKER-USER -s 172.18.0.11/30 -d 172.18.0.20 -j ACCEPT

# Allow: Team Coordinators → PostgreSQL
iptables -A DOCKER-USER -s 172.18.0.11/30 -d 172.18.0.30 -j ACCEPT
```

---

## 5. Storage Architecture

### 5.1 Workspace Layout

```
/workspace/
├── seo/
│   ├── code/              # SEO team's work output
│   └── skills/            # Allowed skills (copied during provisioning)
│       ├── content-generation/
│       ├── keyword-research/
│       └── database-readonly/
│
├── marketing/
│   ├── code/
│   └── skills/
│       ├── email-campaigns/
│       └── analytics/
│
├── frontend/
│   ├── code/
│   └── skills/
│       ├── playwright/
│       └── react-development/
│
├── backend/
│   ├── code/
│   └── skills/
│       ├── database-readwrite/
│       └── api-design/
│
├── infrastructure/  # DevOps workspace
│   ├── code/
│   └── skills/
│
├── tests/          # QA workspace
│   ├── code/
│   └── skills/
│
└── csuite/
    ├── code/
    └── skills/
```

### 5.2 Redis Namespace Layout

```
# Shared Redis (cross-team coordination)
main:directives                           # Broadcast channel
main:escalations                          # Escalation queue
coordination:cross-team                   # Cross-team requests
team:{team_id}:budget                     # Team resource tracking

# Team Redis (team-specific)
team:{team_id}:coordinator:heartbeat      # Team coordinator heartbeat
team:{team_id}:agent:{role}:{id}:state    # Agent state
team:{team_id}:agent:{role}:{id}:knowledge:* # Agent knowledge
agent:{team_id}:inbox:{id}                # Agent task inbox
coordinator:{team_id}:inbox               # Coordinator inbox
```

### 5.3 PostgreSQL Schema

**Database:** `cfn_corporate`

**Tables:**
- `teams` - Team registry and status
- `agents` - Agent lifecycle tracking
- `playbooks` - Versioned playbook library
- `knowledge_entries` - Persistent knowledge base
- `task_history` - Task execution history (partitioned by month)
- `operational_logs` - Troubleshooting logs (partitioned by day, 7-day retention)

---

## 6. Resource Allocation

### 6.1 Team Budgets

| Team | Memory | CPU | Max Agents | Disk | Priority |
|------|--------|-----|------------|------|----------|
| Backend | 16GB | 5 | 6 | 100GB | High |
| Frontend | 12GB | 4 | 5 | 50GB | High |
| SEO | 12GB | 4 | 5 | 50GB | Medium |
| DevOps | 12GB | 4 | 4 | 75GB | High |
| Marketing | 10GB | 3 | 4 | 40GB | Medium |
| QA | 10GB | 3 | 4 | 50GB | High |
| C-Suite | 8GB | 2 | 3 | 30GB | Low |
| **Total** | **80GB** | **25** | **31** | **395GB** | - |

### 6.2 Resource Enforcement

**Team Coordinator Responsibilities:**
1. Track current memory/CPU usage
2. Prevent spawning agents beyond budget
3. Escalate to main coordinator when >90% utilized
4. Terminate idle agents to free resources
5. Queue tasks when budget exhausted

**Main Coordinator Responsibilities:**
1. Monitor total system resource usage
2. Approve temporary budget increases (manual)
3. Rebalance resources across teams (future)
4. Alert on system-wide resource pressure

---

## 7. Communication Patterns

### 7.1 Main Coordinator ↔ Team Coordinator

**Channels:**
- `main:directives` (broadcast)
- `coordinator:{team_id}:inbox` (targeted)
- `main:escalations` (team → main)

**Message Types:**
- `directive` - Main → Team (spawn/shutdown commands)
- `escalation` - Team → Main (resource requests, failures)
- `status_update` - Team → Main (periodic health reports)

### 7.2 Team Coordinator ↔ Agent

**Channels:**
- `agent:{team_id}:inbox:{id}` (task assignment)
- `coordinator:{team_id}:inbox` (status updates)
- `team:{team_id}:monitoring:heartbeats` (health checks)

**Message Types:**
- `task` - Coordinator → Agent (task assignment)
- `status` - Agent → Coordinator (progress updates)
- `heartbeat` - Agent → Coordinator (liveness proof)

---

## Document Metadata

**Version:** 1.0.0
**Last Updated:** 2025-11-15
**Author:** Phase 0A Documentation Team
**Status:** Ready for Implementation

**Related Documents:**
- CFN_DOCKER_INFRASTRUCTURE_REQUIREMENTS_SPEC.md
- CFN_DOCKER_TEAM_PROVISIONING_GUIDE.md (upcoming)
- CFN_DOCKER_INFRASTRUCTURE_ALGORITHMS.md
- CFN_DOCKER_INFRASTRUCTURE_STAKEHOLDER_ANALYSIS.md
