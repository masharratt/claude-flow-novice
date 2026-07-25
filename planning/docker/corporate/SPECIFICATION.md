# Corporate AI Organization Specification

**Version:** 1.0.0
**Date:** 2025-11-12
**Status:** Draft

---

## 1. Executive Summary

### 1.1 Vision

Build a hierarchical AI agent organization that mirrors corporate structure with:
- **Strong isolation** between teams and agents
- **Domain-specific expertise** through specialized skill access
- **Fault-tolerant knowledge persistence** across agent lifecycles
- **Scalable resource management** with budget constraints
- **Secure communication** through encrypted coordination layers

### 1.2 Core Requirements

| Requirement | Priority | Rationale |
|-------------|----------|-----------|
| Team workspace isolation | P0 | Prevent cross-team file access |
| MCP skill-based permissions | P0 | Limit agent capabilities by role |
| Hierarchical coordination | P1 | Enable scalable team management |
| Knowledge persistence | P0 | Survive agent failures |
| Network segmentation | P2 | Security hardening |
| Resource quotas | P1 | Cost control and fairness |
| Audit trails | P1 | Compliance and debugging |

### 1.3 Success Criteria

- ✅ Frontend agents cannot access backend code
- ✅ Agents only have MCP access relevant to their role
- ✅ Knowledge survives container restarts
- ✅ Team coordinators can manage 10-50 agents
- ✅ System scales to 5+ teams, 100+ agents
- ✅ 99.9% uptime with automatic recovery

---

## 2. Organizational Structure

### 2.1 Hierarchy

```
┌─────────────────────────────────────────┐
│ Main Coordinator (Strategic Oversight)  │
│ - Cross-team resource allocation        │
│ - High-level decision making            │
│ - Performance monitoring                │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┬─────────────┐
    │             │             │             │
┌───▼───┐   ┌────▼────┐   ┌────▼────┐   ┌───▼────┐
│Frontend│   │ Backend │   │ DevOps  │   │   QA   │
│  Team  │   │  Team   │   │  Team   │   │  Team  │
│Coord.  │   │ Coord.  │   │ Coord.  │   │ Coord. │
└───┬───┘   └────┬────┘   └────┬────┘   └───┬────┘
    │            │             │             │
┌───┴────┐  ┌───┴────┐   ┌────┴────┐   ┌───┴────┐
│ React  │  │  API   │   │ Docker  │   │Playwright│
│Specialist  │  Dev   │   │Specialist  │ Tester │
├────────┤  ├────────┤   ├─────────┤   ├────────┤
│   UI   │  │Database│   │   K8s   │   │Security│
│Designer│  │Architect│   │Operator │   │ Tester │
├────────┤  ├────────┤   ├─────────┤   ├────────┤
│TypeScript │  GraphQL│   │  CI/CD  │   │  Load  │
│Specialist  │Specialist   │Engineer │   │ Tester │
└────────┘  └────────┘   └─────────┘   └────────┘
```

### 2.2 Team Definitions

#### Frontend Team
**Workspace:** `/workspace/frontend/`
**MCP Skills:**
- `playwright-mcp` - Browser automation and testing
- `browser-devtools-mcp` - Chrome DevTools integration
- `redis-mcp` - Knowledge store (team namespace)
- `filesystem-mcp` - Frontend code access only

**Agents:**
- React Specialist (component development)
- UI Designer (visual implementation)
- TypeScript Specialist (type system expert)

**Memory Allocation:** 12GB total (4GB per agent)

---

#### Backend Team
**Workspace:** `/workspace/backend/`
**MCP Skills:**
- `postgres-mcp` - Database access
- `docker-mcp` - Container management
- `redis-mcp` - Knowledge store (team namespace)
- `filesystem-mcp` - Backend code access only

**Agents:**
- API Developer (REST/GraphQL endpoints)
- Database Architect (schema design, optimization)
- GraphQL Specialist (schema stitching, federation)

**Memory Allocation:** 16GB total (5-6GB per agent)

---

#### DevOps Team
**Workspace:** `/workspace/infrastructure/`
**MCP Skills:**
- `docker-mcp` - Container orchestration
- `kubernetes-mcp` - K8s cluster management
- `redis-mcp` - Knowledge store (team namespace)
- `filesystem-mcp` - Infrastructure code access

**Agents:**
- Docker Specialist (containerization)
- Kubernetes Operator (cluster management)
- CI/CD Engineer (pipeline automation)

**Memory Allocation:** 12GB total (4GB per agent)

---

#### QA Team
**Workspace:** `/workspace/tests/`
**MCP Skills:**
- `playwright-mcp` - E2E testing
- `redis-mcp` - Knowledge store (team namespace)
- `filesystem-mcp` - Test code access (read-only to src/)

**Agents:**
- Playwright Tester (E2E automation)
- Security Tester (vulnerability scanning)
- Load Tester (performance validation)

**Memory Allocation:** 10GB total (3-4GB per agent)

---

## 3. Isolation Model

### 3.1 File System Isolation

**Principle:** Agents can only access their team's workspace directory.

**Implementation:**
```yaml
# Frontend agent mount
volumes:
  - /workspace/frontend:/workspace:rw

# Backend agent mount
volumes:
  - /workspace/backend:/workspace:rw

# QA agent mount (read-only source, read-write tests)
volumes:
  - /workspace/frontend:/workspace/frontend:ro
  - /workspace/backend:/workspace/backend:ro
  - /workspace/tests:/workspace/tests:rw
```

**Access Matrix:**

| Agent Type | `/workspace/frontend` | `/workspace/backend` | `/workspace/infrastructure` | `/workspace/tests` |
|------------|----------------------|----------------------|----------------------------|-------------------|
| Frontend   | RW                   | ❌                   | ❌                         | RO                |
| Backend    | ❌                   | RW                   | ❌                         | RO                |
| DevOps     | RO                   | RO                   | RW                         | RO                |
| QA         | RO                   | RO                   | RO                         | RW                |

---

### 3.2 MCP Skill Isolation

**Principle:** Agents only have access to MCP servers relevant to their domain.

**Configuration System:**
```
.docker/mcp-configs/
├── base.json                      # Shared by all agents (redis-mcp)
├── teams/
│   ├── frontend/
│   │   ├── team-base.json        # Shared by all frontend agents
│   │   └── agents/
│   │       ├── react-specialist.json
│   │       ├── ui-designer.json
│   │       └── typescript-specialist.json
│   ├── backend/
│   │   ├── team-base.json
│   │   └── agents/
│   │       ├── api-developer.json
│   │       ├── database-architect.json
│   │       └── graphql-specialist.json
│   ├── devops/
│   │   ├── team-base.json
│   │   └── agents/
│   │       ├── docker-specialist.json
│   │       ├── kubernetes-operator.json
│   │       └── cicd-engineer.json
│   └── qa/
│       ├── team-base.json
│       └── agents/
│           ├── playwright-tester.json
│           ├── security-tester.json
│           └── load-tester.json
```

**MCP Permission Matrix:**

| MCP Server | Frontend | Backend | DevOps | QA |
|------------|----------|---------|--------|----|
| `playwright-mcp` | ✅ | ❌ | ❌ | ✅ |
| `browser-devtools-mcp` | ✅ | ❌ | ❌ | ✅ |
| `postgres-mcp` | ❌ | ✅ | ❌ | ❌ |
| `docker-mcp` | ❌ | ✅ | ✅ | ❌ |
| `kubernetes-mcp` | ❌ | ❌ | ✅ | ❌ |
| `redis-mcp` | ✅ (team NS) | ✅ (team NS) | ✅ (team NS) | ✅ (team NS) |
| `filesystem-mcp` | ✅ (scoped) | ✅ (scoped) | ✅ (scoped) | ✅ (scoped) |

**Namespace Scoping:**
```json
{
  "mcpServers": {
    "redis": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-redis"],
      "env": {
        "REDIS_NAMESPACE": "team:frontend:agent:react-specialist-001"
      }
    }
  }
}
```

---

### 3.3 Network Isolation

**Principle:** Agents communicate only through their team coordinator.

**Network Architecture:**
```
┌─────────────────────────────────────────────────┐
│ Docker Host Network: 172.18.0.0/16             │
│                                                 │
│ ┌──────────────────────────────────────────┐  │
│ │ cfn-coordination (172.18.0.0/24)         │  │
│ │ - Main Coordinator: 172.18.0.10          │  │
│ │ - Team Coordinators: 172.18.0.11-14      │  │
│ │ - Redis Shared: 172.18.0.20              │  │
│ │ - PostgreSQL Shared: 172.18.0.30         │  │
│ └──────────────────────────────────────────┘  │
│                                                 │
│ ┌──────────────────────────────────────────┐  │
│ │ team-frontend (172.18.1.0/24)            │  │
│ │ - Team Coordinator: 172.18.1.10          │  │
│ │ - Agents: 172.18.1.11-50                 │  │
│ │ - Team Redis: 172.18.1.20                │  │
│ └──────────────────────────────────────────┘  │
│                                                 │
│ ┌──────────────────────────────────────────┐  │
│ │ team-backend (172.18.2.0/24)             │  │
│ │ - Team Coordinator: 172.18.2.10          │  │
│ │ - Agents: 172.18.2.11-50                 │  │
│ │ - Team Redis: 172.18.2.20                │  │
│ └──────────────────────────────────────────┘  │
│                                                 │
│ ┌──────────────────────────────────────────┐  │
│ │ team-devops (172.18.3.0/24)              │  │
│ │ - Team Coordinator: 172.18.3.10          │  │
│ │ - Agents: 172.18.3.11-50                 │  │
│ │ - Team Redis: 172.18.3.20                │  │
│ └──────────────────────────────────────────┘  │
│                                                 │
│ ┌──────────────────────────────────────────┐  │
│ │ team-qa (172.18.4.0/24)                  │  │
│ │ - Team Coordinator: 172.18.4.10          │  │
│ │ - Agents: 172.18.4.11-50                 │  │
│ │ - Team Redis: 172.18.4.20                │  │
│ └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Firewall Rules:**
```yaml
# Agents (172.18.{1-4}.11-50)
allow_outbound:
  - team_coordinator: 172.18.{team_id}.10
  - team_redis: 172.18.{team_id}.20

deny_outbound:
  - other_teams: 172.18.{other_id}.0/24
  - coordination_network: 172.18.0.0/24
  - internet: 0.0.0.0/0

# Team Coordinators (172.18.{1-4}.10)
allow_outbound:
  - main_coordinator: 172.18.0.10
  - team_agents: 172.18.{team_id}.11-50
  - team_redis: 172.18.{team_id}.20
  - shared_redis: 172.18.0.20
  - shared_postgres: 172.18.0.30

# Main Coordinator (172.18.0.10)
allow_outbound:
  - all_team_coordinators: 172.18.{1-4}.10
  - shared_redis: 172.18.0.20
  - shared_postgres: 172.18.0.30
```

---

## 4. Knowledge Persistence

### 4.1 Multi-Tier Storage

**Architecture:**
```
┌────────────────────────────────────────────────┐
│ Agent Runtime (Ephemeral)                      │
│ - In-memory state during task execution        │
│ - Discarded on container exit                  │
└─────────────────┬──────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────────┐
│ Redis (Hot Storage - Real-Time)                │
│ Namespace: team:{team}:agent:{role}:{id}:*     │
│ - Current task context (TTL: 1 hour)           │
│ - Recent learnings (TTL: 7 days)               │
│ - Performance metrics (TTL: 30 days)           │
│ - Team coordination state (TTL: 24 hours)      │
└─────────────────┬──────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────────┐
│ PostgreSQL (Warm Storage - Long-Term)          │
│ Tables: agents, playbooks, knowledge, tasks    │
│ - Agent profile (permanent)                    │
│ - Playbook library (versioned)                 │
│ - Domain knowledge (permanent)                 │
│ - Task history (7 years retention)             │
└─────────────────┬──────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────────┐
│ S3/Object Storage (Cold Storage - Archival)    │
│ - Old playbook versions (>180 days)            │
│ - Historical task logs (>90 days)              │
│ - Audit trails (7 years compliance)            │
│ - Large artifacts (models, datasets)           │
└────────────────────────────────────────────────┘
```

### 4.2 Redis Schema

**Namespace Convention:**
```
team:{team_name}:agent:{role}:{agent_id}:{category}:{key}

Examples:
team:frontend:agent:react-specialist:001:knowledge:component-patterns
team:backend:agent:api-developer:042:state:current-task
team:devops:agent:docker-specialist:007:metrics:avg-build-time
```

**Key Categories:**

| Category | TTL | Purpose | Example Keys |
|----------|-----|---------|--------------|
| `state` | 1 hour | Current task execution context | `current-task`, `execution-progress`, `last-checkpoint` |
| `knowledge` | 7 days | Recent learnings and insights | `best-practices`, `error-solutions`, `code-patterns` |
| `metrics` | 30 days | Performance tracking | `avg-task-time`, `success-rate`, `confidence-history` |
| `coordination` | 24 hours | Team communication state | `task-queue`, `agent-status`, `team-broadcast` |

### 4.3 PostgreSQL Schema

```sql
-- Agents table
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id VARCHAR(50) NOT NULL,
    role VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL, -- active, idle, failed, terminated
    spawned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_heartbeat TIMESTAMP,
    total_tasks_completed INTEGER DEFAULT 0,
    avg_confidence DECIMAL(3, 2),
    cost_to_date DECIMAL(10, 2),
    metadata JSONB,

    CONSTRAINT unique_team_role_id UNIQUE (team_id, role, id)
);

-- Playbooks table
CREATE TABLE playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    team_id VARCHAR(50) NOT NULL,
    playbook_name VARCHAR(200) NOT NULL,
    playbook_content JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    success_rate DECIMAL(5, 2),
    times_used INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_agent_playbook_version UNIQUE (agent_id, playbook_name, version)
);

-- Knowledge entries table
CREATE TABLE knowledge_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    team_id VARCHAR(50) NOT NULL,
    scope VARCHAR(20) NOT NULL, -- agent, team, org
    category VARCHAR(100) NOT NULL,
    content JSONB NOT NULL,
    confidence DECIMAL(3, 2),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    INDEX idx_team_scope (team_id, scope),
    INDEX idx_category (category)
);

-- Task history table
CREATE TABLE task_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    team_id VARCHAR(50) NOT NULL,
    task_description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    status VARCHAR(20) NOT NULL, -- success, failed, timeout
    confidence_reported DECIMAL(3, 2),
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost DECIMAL(8, 4),
    error_log TEXT,
    metadata JSONB,

    INDEX idx_agent_time (agent_id, start_time DESC),
    INDEX idx_team_status (team_id, status)
);

-- Team coordinators table
CREATE TABLE team_coordinators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL, -- active, standby, failed
    spawned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_heartbeat TIMESTAMP,
    agent_count INTEGER DEFAULT 0,
    budget_allocated DECIMAL(10, 2),
    budget_spent DECIMAL(10, 2),
    metadata JSONB
);
```

---

## 5. Communication Protocols

### 5.1 Message Format

**Standard Message Schema:**
```json
{
  "message_id": "uuid-v4",
  "correlation_id": "uuid-v4",
  "from": {
    "type": "agent|coordinator|main-coordinator",
    "team": "frontend",
    "id": "react-specialist-001"
  },
  "to": {
    "type": "agent|coordinator|broadcast",
    "team": "frontend",
    "id": "coordinator"
  },
  "message_type": "task|status|request|escalation|directive|broadcast",
  "priority": "low|medium|high|critical",
  "timestamp": "2025-11-12T10:30:00Z",
  "payload": {
    // Message-specific content
  },
  "metadata": {
    "retry_count": 0,
    "ttl_seconds": 3600
  }
}
```

### 5.2 Redis Pub/Sub Channels

**Channel Naming Convention:**
```
{scope}:{team}:{type}:{identifier}

Examples:
agent:frontend:inbox:react-specialist-001
team:frontend:broadcast
coordinator:frontend:inbox
coordination:cross-team
main:all-hands
```

**Channel Types:**

| Channel Pattern | Publisher | Subscriber | Purpose |
|----------------|-----------|------------|---------|
| `agent:{team}:inbox:{id}` | Team Coordinator | Specific Agent | Task assignment, feedback |
| `team:{team}:broadcast` | Team Coordinator | All Team Agents | Team announcements |
| `coordinator:{team}:inbox` | Team Agents | Team Coordinator | Status updates, requests |
| `coordination:cross-team` | Team Coordinators | Team Coordinators | Peer collaboration |
| `main:directives` | Main Coordinator | All Team Coordinators | Strategic directives |
| `main:all-hands` | Main Coordinator | Everyone (cascaded) | Org-wide announcements |

### 5.3 Communication Patterns

**Pattern 1: Task Assignment (Coordinator → Agent)**
```json
{
  "message_type": "task",
  "priority": "high",
  "payload": {
    "task_id": "task-12345",
    "description": "Fix TypeScript errors in /workspace/frontend/src/components/Header.tsx",
    "deadline": "2025-11-12T12:00:00Z",
    "resources": {
      "files": ["/workspace/frontend/src/components/Header.tsx"],
      "mcp_servers": ["filesystem-mcp", "redis-mcp"]
    },
    "context": {
      "related_tasks": ["task-12344"],
      "dependencies": []
    }
  }
}
```

**Pattern 2: Status Update (Agent → Coordinator)**
```json
{
  "message_type": "status",
  "priority": "medium",
  "payload": {
    "task_id": "task-12345",
    "status": "completed",
    "confidence": 0.92,
    "duration_seconds": 145,
    "result": {
      "files_modified": ["/workspace/frontend/src/components/Header.tsx"],
      "errors_fixed": 3,
      "summary": "Fixed missing type annotations and import paths"
    }
  }
}
```

**Pattern 3: Escalation (Team Coordinator → Main Coordinator)**
```json
{
  "message_type": "escalation",
  "priority": "critical",
  "payload": {
    "issue": "Team budget exceeded by 20%",
    "team": "frontend",
    "details": {
      "budget_allocated": 5000,
      "budget_spent": 6000,
      "reason": "Unexpected spike in task complexity"
    },
    "requested_action": "Increase budget by $2000 or reduce task scope"
  }
}
```

---

## 6. Resource Management

### 6.1 Budget Allocation

**Per-Team Monthly Budget:**
```yaml
frontend:
  compute: $3000
  storage: $200
  api_calls: $800
  total: $4000

backend:
  compute: $4000
  storage: $500
  api_calls: $1000
  total: $5500

devops:
  compute: $2500
  storage: $300
  api_calls: $500
  total: $3300

qa:
  compute: $2000
  storage: $100
  api_calls: $600
  total: $2700

total_org: $15500/month
```

### 6.2 Memory Allocation

**Per-Agent Tier:**
```yaml
tier_1_lightweight:
  memory: 2GB
  cpu: 0.5 cores
  roles: [ui-designer, security-tester]

tier_2_standard:
  memory: 4GB
  cpu: 1.0 cores
  roles: [react-specialist, api-developer, playwright-tester]

tier_3_heavy:
  memory: 6GB
  cpu: 1.5 cores
  roles: [database-architect, docker-specialist]

tier_4_intensive:
  memory: 8GB
  cpu: 2.0 cores
  roles: [kubernetes-operator, load-tester]
```

### 6.3 Scaling Rules

**Auto-Scaling Triggers:**
```yaml
scale_up:
  - queue_depth > 20 tasks
  - avg_task_wait_time > 5 minutes
  - team_cpu_utilization > 80%

scale_down:
  - queue_depth < 5 tasks
  - avg_cpu_utilization < 20%
  - idle_agent_count > 50%

constraints:
  min_agents_per_team: 2
  max_agents_per_team: 10
  cooldown_period: 5 minutes
```

---

## 7. Security & Compliance

### 7.1 Container Security

**Security Configuration:**
```yaml
security_opts:
  - no-new-privileges:true
  - seccomp:runtime/default
  - apparmor:docker-default

capabilities:
  drop: [ALL]
  add: [NET_BIND_SERVICE]  # Only if required

read_only_root_filesystem: true
tmpfs:
  - /tmp:rw,noexec,nosuid,size=100m

resource_limits:
  cpu_quota: 1.0
  memory: 4GB
  pids_limit: 100
```

### 7.2 Audit Logging

**Logged Events:**
```yaml
authentication:
  - agent_spawn
  - agent_termination
  - mcp_server_connection

authorization:
  - permission_grant
  - permission_denial
  - access_violation_attempt

data_access:
  - knowledge_read
  - knowledge_write
  - file_modification

communication:
  - message_sent
  - message_received
  - escalation_triggered

compliance:
  - policy_acknowledgment
  - policy_violation
  - security_incident
```

**Storage:**
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    event_type VARCHAR(50) NOT NULL,
    actor_type VARCHAR(20) NOT NULL,
    actor_id VARCHAR(100),
    team_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(200),
    result VARCHAR(20) NOT NULL, -- success, denied, error
    metadata JSONB,

    INDEX idx_timestamp (timestamp DESC),
    INDEX idx_actor (actor_type, actor_id),
    INDEX idx_event_type (event_type)
);

-- Retention: 7 years (compliance)
-- Partition by month for performance
```

---

## 8. Failure Recovery

### 8.1 Agent Recovery

**Recovery Workflow:**
```yaml
detection:
  heartbeat_timeout: 90 seconds
  health_check_interval: 30 seconds

recovery_steps:
  1_detect:
    - monitor_heartbeat
    - trigger_on_timeout

  2_diagnose:
    - query_redis_state
    - query_postgres_history
    - check_container_logs
    - determine_failure_type

  3_restore:
    - spawn_new_container (same agent_id)
    - load_knowledge_from_redis
    - load_playbooks_from_postgres
    - restore_mcp_configuration

  4_validate:
    - verify_heartbeat_restored
    - verify_mcp_connections
    - verify_knowledge_loaded

  5_resume:
    - if task_in_progress and checkpoint_valid:
        resume_from_checkpoint
    - else:
        notify_coordinator_task_failed

recovery_time_objective: 2 minutes
recovery_point_objective: 1 second (last Redis snapshot)
```

### 8.2 Team Coordinator Recovery

**High-Availability Setup:**
```yaml
deployment:
  primary: team-coordinator-primary
  standby: team-coordinator-standby

failover:
  detection: 60 seconds (3 missed heartbeats)
  promotion: standby → primary (30 seconds)
  total_downtime: 90 seconds

state_replication:
  method: redis_replication
  sync_mode: asynchronous
  max_data_loss: 5 seconds
```

---

## 9. Non-Functional Requirements

### 9.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent spawn time | <30 seconds | Time from request to first heartbeat |
| Task assignment latency | <1 second | Time from coordinator publish to agent receive |
| Knowledge retrieval | <100ms | Redis GET operation P99 |
| Playbook query | <500ms | PostgreSQL query P95 |
| Cross-team message delivery | <2 seconds | End-to-end pub/sub latency |

### 9.2 Scalability

| Dimension | Target | Notes |
|-----------|--------|-------|
| Teams | 5-20 | Limited by coordinator capacity |
| Agents per team | 2-50 | Configurable based on budget |
| Total agents | 100-500 | Limited by network bandwidth |
| Messages per second | 1000+ | Redis pub/sub capacity |
| Knowledge entries | 10M+ | PostgreSQL with partitioning |

### 9.3 Reliability

| Component | Target Uptime | Recovery Time |
|-----------|---------------|---------------|
| Agent | 99% | 2 minutes |
| Team Coordinator | 99.9% | 90 seconds |
| Main Coordinator | 99.95% | 60 seconds |
| Redis | 99.99% | 10 seconds (failover) |
| PostgreSQL | 99.99% | 5 minutes (replica promotion) |

---

## 10. Open Questions

### 10.1 Unresolved Decisions

| Question | Options | Recommendation |
|----------|---------|----------------|
| Should QA agents have read-write access to src/? | Yes (fix bugs) / No (read-only) | **No** - Read-only, fixes go through PR |
| Can agents request temporary elevated permissions? | Yes (with approval) / No (fixed permissions) | **Yes** - With team coordinator approval + audit |
| How to handle cross-team dependencies? | Direct / Via coordinators / Via main coordinator | **Via coordinators** - Peer-to-peer with logging |
| Should agents be able to transfer teams? | Yes / No | **Yes** - With both coordinators' approval |
| Maximum budget overage before auto-shutdown? | 10% / 20% / 50% | **20%** - Escalate at 10%, hard stop at 20% |

### 10.2 Future Enhancements

- **Knowledge graph:** Semantic relationships between knowledge entries
- **Agent mentorship:** Senior agents train junior agents
- **Dynamic role creation:** Spawn new agent roles on-demand
- **Multi-region deployment:** Geo-distributed teams for latency
- **Cost optimization ML:** Predict and optimize resource allocation

---

## 11. Acceptance Criteria

### 11.1 Phase 1: Core Isolation

- [ ] Frontend agent cannot read `/workspace/backend/`
- [ ] Backend agent cannot access `playwright-mcp`
- [ ] Agent knowledge persists across container restart
- [ ] Agents can only communicate via team coordinator

### 11.2 Phase 2: Team Coordination

- [ ] Team coordinator can spawn/terminate agents
- [ ] Team coordinator tracks budget spending
- [ ] Cross-team coordination works (coordinator → coordinator)
- [ ] Escalation to main coordinator functional

### 11.3 Phase 3: Production Readiness

- [ ] 99% uptime over 1 week test period
- [ ] Agent recovery <2 minutes (10 failure tests)
- [ ] Knowledge loss <1 second of work (measured)
- [ ] Security audit passes (no cross-team access violations)
- [ ] Performance targets met (see 9.1)

---

**End of Specification v1.0.0**
