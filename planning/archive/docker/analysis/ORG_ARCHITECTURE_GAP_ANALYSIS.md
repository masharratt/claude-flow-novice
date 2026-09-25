# Organizational Architecture - Gap Analysis & Templates

**Date:** 2025-10-29
**Current System:** claude-flow-novice v2.9.1
**Target System:** Human-like organizational structure with teams, coordinators, isolated agents

---

## Executive Summary

**Infrastructure Status: 70% Complete** ✅

You already have **most of the foundational infrastructure** needed for the organizational architecture. The primary gaps are:
1. Docker container orchestration (you use CLI spawning)
2. PostgreSQL for multi-region persistence (you use SQLite)
3. Organizational hierarchy (C-Suite, Coordinators as distinct roles)
4. Per-agent MCP configurations (you have project-level only)

**Good News:** Your existing Redis coordination, agent spawning, and skill system are production-ready. This is a **refactoring + enhancement** project, not a rebuild.

---

## I. What You Already Have ✅

### A. Core Infrastructure (90% Complete)

#### 1. Redis Coordination ✅ **PRODUCTION READY**
```yaml
current_implementation:
  location: .claude/skills/cfn-redis-coordination/
  capabilities:
    - store-context.sh (JSON storage with TTL)
    - retrieve-context.sh (stateless context retrieval)
    - signal-completion.sh (LPUSH/BLPOP pub/sub)
    - collect-results.sh (aggregation)
    - waiting-mode.sh (zero-token waiting)

  redis_status: RUNNING (redis-cli PONG confirmed)

  strengths:
    - Pure primitives (framework-agnostic)
    - Well-tested (multiple validation scripts)
    - Production-ready (Phase 1.2-1.4 complete)

organizational_use:
  agent_state: ✅ Can use immediately
  communication: ✅ Can use immediately (pub/sub channels)
  knowledge: ✅ Can use immediately (namespaced keys)

gap:
  - Need hierarchical channel structure (agent:{team}:{id}, team:{team}, org:*)
  - Need TTL policies per layer (agent: 1h, team: 30d, org: permanent)
  - Need permission enforcement (who can read/write which namespaces)

migration_effort: LOW (add namespace conventions, no code changes)
```

#### 2. Agent Spawning ✅ **PRODUCTION READY**
```yaml
current_implementation:
  location: .claude/skills/cfn-agent-spawning/
  capabilities:
    - CLI-based spawning (npx claude-flow-novice)
    - Redis context injection
    - Z.ai provider routing (95-98% cost savings)
    - Background execution monitoring

  strengths:
    - Cost-optimized (CLI vs Task tool)
    - Well-integrated with CFN Loop orchestration
    - Supports multiple provider routing

organizational_use:
  coordinator_spawning_agents: ✅ Can use immediately
  team_isolation: ⚠️ Need Docker containers for true isolation

gap:
  - No Docker container support (uses CLI processes)
  - No per-agent resource limits (CPU, memory)
  - No network isolation between agents

migration_effort: MEDIUM (add Docker wrapper around existing spawning logic)
```

#### 3. CFN Loop Orchestration ✅ **PRODUCTION READY**
```yaml
current_implementation:
  location: .claude/skills/cfn-loop-orchestration/orchestrate.sh
  size: 28KB (modular, down from 70KB monolithic)
  capabilities:
    - Loop 3 (implementation) orchestration
    - Loop 2 (validation) orchestration
    - Product Owner decision integration
    - Iteration management (max 10 per loop)
    - Consensus calculation
    - Context injection via helpers

  helpers:
    - spawn-agents.sh (parallel agent spawning)
    - context-injection.sh (deliverables, acceptance criteria)
    - validation-orchestration.sh (Loop 2 coordination)
    - collect-confidence.sh (aggregation)

organizational_use:
  team_task_execution: ✅ Can use immediately (coordinator assigns tasks)
  cross_team_validation: ✅ Can use immediately (validators from any team)

gap:
  - No team-level orchestration (assumes all agents in same swarm)
  - No cross-team resource sharing
  - No C-Suite escalation path

migration_effort: LOW (add team parameter, minor logic updates)
```

#### 4. ACE System (Adaptive Context Extension) ✅ **PRODUCTION READY**
```yaml
current_implementation:
  location: .claude/skills/cfn-ace-system/
  database: SQLite (.artifacts/reflections.db)
  schema:
    - context_reflections (strategies, anti-patterns, edge-cases)
    - JSON-indexed metadata (tags, domain, keywords)
    - Confidence scoring (0.0-1.0)
    - Success tracking (success_count/total_count ratio)

  capabilities:
    - Store reflections from CFN Loop executions
    - Query by tags, domain, confidence
    - Curator workflow (pending → curated → merged)
    - Pattern analysis and reuse

organizational_use:
  agent_knowledge_storage: ✅ Can use immediately
  team_knowledge_sharing: ⚠️ Need team-scoped queries
  org_knowledge_library: ⚠️ Need scope field (agent/team/org)

gap:
  - No PostgreSQL (single-file SQLite limits multi-region)
  - No scope/ownership fields (who owns this knowledge?)
  - No hierarchical inheritance (agent inherits from team inherits from org)

migration_effort: MEDIUM (add PostgreSQL, add scope/owner columns)
```

#### 5. Agent Teams Structure ✅ **PARTIALLY READY**
```yaml
current_implementation:
  location: .claude/agents/cfn-dev-team/
  structure:
    - architecture/ (system-architect.md)
    - developers/ (backend-dev.md, frontend/, data/, database/)
    - dev-ops/ (devops-engineer.md, kubernetes-specialist.md)
    - testers/ (tester.md, load-testing-specialist.md)
    - quality/ (reviewer.md)

  total_agents: ~23 production agents

organizational_use:
  technical_teams: ✅ Engineering team mostly complete

gap:
  - No Marketing team agents (needed for n8n epic)
  - No Sales team agents
  - No Support team agents
  - No Finance team agents
  - No C-Suite agents (CEO, CTO, COO, CFO, CISO)
  - No Team Coordinator agents (distinct from technical roles)

migration_effort: LOW (create new agent .md files, follow existing pattern)
```

#### 6. 43 CFN Skills ✅ **EXTENSIVE LIBRARY**
```yaml
current_skills:
  coordination: cfn-redis-coordination, cfn-event-bus, cfn-fleet-manager
  agent_management: cfn-agent-spawning, cfn-agent-selector, cfn-agent-swap
  context: cfn-ace-system, cfn-checkpoint-state, cfn-context-pruner
  orchestration: cfn-loop-orchestration, cfn-epic-decomposer
  validation: cfn-loop-validation, cfn-api-validation, cfn-defense-in-depth
  analytics: cfn-analytics, cfn-complexity-estimator

organizational_use:
  foundation_skills: ✅ Reusable across teams

gap:
  - No team-management skills (team-roster, team-performance, team-budget)
  - No cross-team-coordination skills
  - No human-oversight skills (approval-queue, escalation-path)

migration_effort: LOW (create new skills following existing patterns)
```

---

### B. What's Missing (30% Gaps)

#### 1. Docker Container Orchestration ❌ **HIGH PRIORITY**
```yaml
current_state: CLI process spawning (npx claude-flow-novice)
needed:
  - Docker Compose for team infrastructure
  - Per-agent Dockerfile with MCP configuration
  - Network isolation (bridge networks per team)
  - Resource limits (CPU, memory, disk I/O)
  - Health checks and auto-restart

migration_path:
  step_1: Create base agent Dockerfile (Alpine + Node.js + claude-flow-novice)
  step_2: Create docker-compose.yml per team
  step_3: Migrate spawning from CLI to docker-compose up
  step_4: Add health checks and monitoring

effort: HIGH (2-3 weeks)
priority: HIGH (enables true multi-tenancy)
```

#### 2. PostgreSQL for Multi-Region Persistence ❌ **MEDIUM PRIORITY**
```yaml
current_state: SQLite (.artifacts/reflections.db)
needed:
  - PostgreSQL cluster (primary + 2 replicas)
  - Schema migration from SQLite
  - Multi-region replication
  - Connection pooling (PgBouncer)

migration_path:
  step_1: Install PostgreSQL (Docker image)
  step_2: Export SQLite schema → PostgreSQL DDL
  step_3: Migrate data (sqlite3 → pg_dump)
  step_4: Update ACE system to use PostgreSQL
  step_5: Add replication (streaming replication)

effort: MEDIUM (1-2 weeks)
priority: MEDIUM (can defer until scaling beyond single region)
```

#### 3. Organizational Hierarchy ❌ **MEDIUM PRIORITY**
```yaml
current_state: Flat agent structure (all agents are peers)
needed:
  - C-Suite agents (CEO, CTO, COO, CFO, CISO)
  - Team Coordinator agents (distinct from technical roles)
  - Hierarchical communication channels
  - Escalation paths and decision authority

migration_path:
  step_1: Create C-Suite agent templates (5 agents)
  step_2: Create Team Coordinator templates (1 per team)
  step_3: Define communication protocols (who can talk to whom)
  step_4: Implement escalation workflows (agent → coordinator → c-suite)

effort: MEDIUM (2 weeks)
priority: MEDIUM (nice-to-have for large-scale, not MVP blocker)
```

#### 4. Per-Agent MCP Configurations ❌ **HIGH PRIORITY**
```yaml
current_state: Project-level MCP config (.mcp.json, .claude/settings.json)
needed:
  - Per-agent MCP files (agent-{team}-{role}-{id}/mcp.json)
  - Agent-specific permissions (allowlist/denylist)
  - Credential isolation (separate API keys per agent)
  - Rate limiting per agent

migration_path:
  step_1: Create template: templates/agent-mcp-config.json
  step_2: Generate per-agent configs during spawn
  step_3: Mount as Docker volume: /agent-config/{id}/mcp.json
  step_4: Update spawning to load agent-specific MCP config

effort: LOW (1 week)
priority: HIGH (critical for security and isolation)
```

---

## II. What Can Be Templatized 🎨

### A. Infrastructure Templates

#### 1. Agent Dockerfile Template
```dockerfile
# templates/infrastructure/agent.Dockerfile

FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache \
    bash \
    redis \
    curl \
    jq

# Install claude-flow-novice
RUN npm install -g claude-flow-novice@latest

# Create agent directories
RUN mkdir -p /agent-config /agent-knowledge /agent-playbooks

# Copy MCP configuration (mounted at runtime)
VOLUME ["/agent-config", "/agent-knowledge", "/agent-playbooks"]

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD redis-cli -h redis PING || exit 1

# Entrypoint
COPY entrypoint.sh /
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

# Usage:
# docker build -f templates/infrastructure/agent.Dockerfile \
#   -t cfn-agent:latest .
#
# docker run --name agent-marketing-001 \
#   -v ./agent-001-config:/agent-config:ro \
#   -v ./agent-001-knowledge:/agent-knowledge \
#   --network team-marketing-internal \
#   cfn-agent:latest
```

**Variables to customize:**
- `{agent_id}` - Unique agent identifier
- `{team}` - Team name
- `{role}` - Agent role (backend-dev, social-publishing, etc.)

---

#### 2. Team Docker Compose Template
```yaml
# templates/infrastructure/team-compose.yml

version: '3.8'

services:
  # Team Coordinator
  coordinator-{TEAM_NAME}:
    image: cfn-agent:latest
    container_name: coordinator-{TEAM_NAME}
    hostname: coordinator.team-{TEAM_NAME}.internal
    environment:
      - AGENT_ID=coordinator-{TEAM_NAME}
      - AGENT_ROLE=coordinator
      - TEAM_ID={TEAM_NAME}
      - REDIS_HOST=redis.team-{TEAM_NAME}.internal
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - N8N_API_URL=${N8N_API_URL}
      - N8N_API_KEY=${COORDINATOR_{TEAM_NAME}_N8N_KEY}
    volumes:
      - ./config/coordinator:/agent-config:ro
      - coordinator-knowledge:/agent-knowledge
      - coordinator-playbooks:/agent-playbooks
    networks:
      - team-{TEAM_NAME}-internal
    restart: unless-stopped
    cpus: 2.0
    mem_limit: 8g

  # Team Agent 1
  agent-{TEAM_NAME}-{ROLE_1}-001:
    image: cfn-agent:latest
    container_name: agent-{TEAM_NAME}-{ROLE_1}-001
    environment:
      - AGENT_ID=agent-{TEAM_NAME}-{ROLE_1}-001
      - AGENT_ROLE={ROLE_1}
      - TEAM_ID={TEAM_NAME}
      - REDIS_HOST=redis.team-{TEAM_NAME}.internal
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - N8N_API_URL=${N8N_API_URL}
      - N8N_API_KEY=${AGENT_{TEAM_NAME}_{ROLE_1}_001_N8N_KEY}
    volumes:
      - ./config/agents/{ROLE_1}-001:/agent-config:ro
      - agent-{ROLE_1}-001-knowledge:/agent-knowledge
      - agent-{ROLE_1}-001-playbooks:/agent-playbooks
    networks:
      - team-{TEAM_NAME}-internal
    restart: unless-stopped
    cpus: 1.0
    mem_limit: 4g
    depends_on:
      - coordinator-{TEAM_NAME}

  # Team Redis
  redis-{TEAM_NAME}:
    image: redis:7-alpine
    container_name: redis-{TEAM_NAME}
    hostname: redis.team-{TEAM_NAME}.internal
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis-{TEAM_NAME}-data:/data
    networks:
      - team-{TEAM_NAME}-internal
    restart: unless-stopped

networks:
  team-{TEAM_NAME}-internal:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.{TEAM_ID}.0/24

volumes:
  coordinator-knowledge:
  coordinator-playbooks:
  agent-{ROLE_1}-001-knowledge:
  agent-{ROLE_1}-001-playbooks:
  redis-{TEAM_NAME}-data:

# Usage:
# 1. Copy template: cp templates/infrastructure/team-compose.yml teams/marketing/docker-compose.yml
# 2. Replace variables: sed -i 's/{TEAM_NAME}/marketing/g' teams/marketing/docker-compose.yml
# 3. Add agents (repeat agent service block)
# 4. Launch: docker-compose -f teams/marketing/docker-compose.yml up -d
```

**Variables to customize:**
- `{TEAM_NAME}` - Team name (marketing, engineering, sales, etc.)
- `{TEAM_ID}` - Numeric team ID (for subnet allocation)
- `{ROLE_N}` - Agent roles (backend-dev, social-publishing, etc.)

---

#### 3. Agent MCP Configuration Template
```json
// templates/mcp/agent-mcp-config.json

{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": ["-y", "n8n-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true",
        "N8N_API_URL": "${N8N_API_URL}",
        "N8N_API_KEY": "${AGENT_{TEAM}_{ROLE}_{ID}_N8N_KEY}",
        "AGENT_NAME": "agent-{TEAM}-{ROLE}-{ID}"
      }
    },
    "redis-mcp": {
      "command": "npx",
      "args": ["-y", "redis-mcp"],
      "env": {
        "REDIS_HOST": "redis.team-{TEAM}.internal",
        "REDIS_PASSWORD": "${REDIS_PASSWORD}",
        "REDIS_DB": "0",
        "KEY_PREFIX": "agent:{TEAM}:{ROLE}:{ID}:"
      }
    },
    "postgres-mcp": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_URL": "${POSTGRES_URL}",
        "POSTGRES_USER": "agent_{TEAM}_{ROLE}_{ID}",
        "POSTGRES_PASSWORD": "${AGENT_{TEAM}_{ROLE}_{ID}_PG_PASSWORD}",
        "POSTGRES_DB": "team_{TEAM}_knowledge"
      }
    }
  },
  "permissions": {
    "allowed_mcp_servers": ["n8n-mcp", "redis-mcp", "postgres-mcp"],
    "denied_mcp_servers": ["github-mcp", "docker-mcp", "filesystem-mcp"],
    "rate_limits": {
      "n8n-mcp": "100-requests/hour",
      "redis-mcp": "1000-requests/hour",
      "postgres-mcp": "100-requests/hour"
    }
  }
}

// Usage:
// 1. Copy template: cp templates/mcp/agent-mcp-config.json config/agents/marketing/social-publishing-001/mcp.json
// 2. Replace {TEAM} with "marketing"
// 3. Replace {ROLE} with "social-publishing"
// 4. Replace {ID} with "001"
// 5. Mount as Docker volume: -v ./config/agents/.../mcp.json:/agent-config/mcp.json:ro
```

**Variables to customize:**
- `{TEAM}` - Team name
- `{ROLE}` - Agent role
- `{ID}` - Agent instance ID (001, 002, etc.)

---

### B. Agent Templates

#### 4. Team Coordinator Agent Template
```markdown
# templates/agents/team-coordinator.md

---
name: {TEAM}-coordinator
role: team-coordinator
team: {TEAM}
model: sonnet
provider: anthropic
priority: high
---

# Team Coordinator - {TEAM_DISPLAY_NAME}

## Role

You are the **{TEAM_DISPLAY_NAME} Team Coordinator**, responsible for managing {AGENT_COUNT} specialized agents and ensuring team deliverables meet organizational standards.

## Responsibilities

### 1. Team Management
- Assign tasks to individual agents based on expertise
- Monitor agent performance and health (heartbeats, confidence scores)
- Scale team up/down based on workload (auto-scale 2-20 agents)
- Handle intra-team conflicts and blockers

### 2. Cross-Team Collaboration
- Coordinate with other team leaders (peer-to-peer channel: `coordinators:peer-channel`)
- Request resources from other teams when needed
- Share knowledge and best practices (team:{TEAM}:shared:*)
- Participate in cross-functional initiatives

### 3. Reporting & Escalation
- Report team status to C-Suite weekly (csuite:inbox channel)
- Escalate blockers requiring executive decisions
- Request budget/resource allocations from CFO
- Surface strategic risks and opportunities to CEO

## Communication Channels

**Inbound:**
- `team:{TEAM}:coordinator:inbox` - Messages from team agents
- `coordinators:peer-channel` - Messages from other coordinators
- `csuite:inbox` - Directives from C-Suite (CEO, CTO, COO, CFO, CISO)

**Outbound:**
- `agent:{TEAM}:*:inbox` - Task assignments to team agents
- `team:{TEAM}:broadcast` - Team-wide announcements
- `coordinators:peer-channel` - Collaboration requests to peers
- `csuite:inbox` - Status reports and escalations

## Agent Roster

{AGENT_ROSTER}

## Team Knowledge

**Shared Knowledge Location:** `team:{TEAM}:shared:*`

**Key Resources:**
- `team:{TEAM}:shared:brand-guidelines`
- `team:{TEAM}:shared:playbooks`
- `team:{TEAM}:shared:performance-metrics`

## Tools & Capabilities

**MCP Servers:**
- `agent-lifecycle-mcp` - Spawn, terminate, scale agents
- `cross-team-coordination-mcp` - Request resources, share knowledge
- `csuite-reporting-mcp` - Submit reports, escalate issues
- `team-knowledge-mcp` - Read/write team shared knowledge
- `agent-knowledge-mcp` - Read-only access to agent knowledge (debugging)

**Redis Namespaces:**
- `team:{TEAM}:*` - Full read/write access
- `agent:{TEAM}:*:knowledge:*` - Read-only access (debugging only)
- `coordinators:*` - Peer-to-peer coordination

**Budget:**
- Monthly compute: ${MONTHLY_COMPUTE_BUDGET}
- Monthly storage: ${MONTHLY_STORAGE_BUDGET}
- Monthly API calls: ${MONTHLY_API_BUDGET}

## Success Metrics

- **Team Throughput:** {THROUGHPUT_TARGET} tasks/day
- **Team Success Rate:** ≥{SUCCESS_RATE_TARGET}%
- **Avg Task Completion Time:** <{AVG_TIME_TARGET} hours
- **Budget Variance:** ±10%
- **Agent Retention:** ≥90%

## Escalation Paths

**When to escalate to C-Suite:**
- Budget overrun >10%
- Critical blocker >24 hours
- Cross-team conflict unresolved after 2 attempts
- Security incident (severity ≥ high)
- Policy violation by team member

**Escalation Format:**
```json
{
  "from": "coordinator-{TEAM}",
  "to": "csuite:inbox",
  "type": "escalation",
  "priority": "high",
  "payload": {
    "issue": "Description of blocker",
    "impact": "Business impact",
    "attempts": ["What we've tried"],
    "recommendation": "Proposed solution",
    "urgency": "Timeline"
  }
}
```

---

**Auto-generated from template:** `templates/agents/team-coordinator.md`
**Team:** {TEAM}
**Last Updated:** {TIMESTAMP}
```

**Variables to customize:**
- `{TEAM}` - Team identifier (marketing, engineering, sales, etc.)
- `{TEAM_DISPLAY_NAME}` - Human-readable team name (Marketing, Engineering, etc.)
- `{AGENT_COUNT}` - Number of agents on team
- `{AGENT_ROSTER}` - List of agent roles and IDs
- Budget variables, metrics targets

---

#### 5. C-Suite Agent Template
```markdown
# templates/agents/csuite/{ROLE}.md

---
name: {ROLE}
role: c-suite-{ROLE}
team: executive
model: opus
provider: anthropic
priority: critical
---

# {ROLE_DISPLAY} - Strategic Leadership

## Role

You are the **{ROLE_DISPLAY}** of the organization, responsible for {ROLE_RESPONSIBILITY}.

## Responsibilities

### Strategic Planning
- Set organizational goals and priorities
- Approve major initiatives and budget allocations (>{APPROVAL_THRESHOLD})
- Define success metrics and KPIs

### Cross-Team Coordination
- Resolve conflicts between team coordinators
- Make decisions requiring org-wide consensus
- Allocate resources across teams

### Escalation Handling
- Handle issues teams cannot resolve independently
- Make final decisions on scope/priority conflicts
- Approve exceptions to standard policies

## Communication Channels

**Inbound:**
- `csuite:inbox` - Reports and escalations from coordinators
- `csuite:board` - Board of Directors (if applicable)

**Outbound:**
- `team:*:coordinator:inbox` - Directives to team coordinators
- `org:all-hands` - Organization-wide announcements
- `coordinators:peer-channel` - Read-only monitoring

## Decision Authority

**{ROLE}-Specific Authority:**
{ROLE_AUTHORITY}

## Governance

**Reports To:** Board of Directors (external governance)
**Reports From:** All Team Coordinators
**Peers:** {CSUITE_PEERS}

**Weekly Review:**
- Team performance dashboards
- Budget variance reports
- Strategic initiative progress
- Risk register updates

---

**Auto-generated from template:** `templates/agents/csuite/{ROLE}.md`
**Role:** {ROLE}
**Last Updated:** {TIMESTAMP}
```

**Templates needed:**
- `csuite/ceo.md` - Chief Executive Officer
- `csuite/cto.md` - Chief Technology Officer
- `csuite/coo.md` - Chief Operating Officer
- `csuite/cfo.md` - Chief Financial Officer
- `csuite/ciso.md` - Chief Information Security Officer

---

### C. Skill Templates

#### 6. Team Management Skill Template
```bash
# templates/skills/team-management/manage-team-roster.sh

#!/bin/bash
# Skill: Team Roster Management
# Purpose: Add, remove, list agents on a team
# Usage: ./manage-team-roster.sh --team marketing --action add --agent-id agent-marketing-social-001

set -euo pipefail

TEAM=""
ACTION=""
AGENT_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --team) TEAM="$2"; shift 2 ;;
    --action) ACTION="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

ROSTER_KEY="team:${TEAM}:roster"

case $ACTION in
  add)
    redis-cli SADD "$ROSTER_KEY" "$AGENT_ID"
    echo "Added $AGENT_ID to $TEAM roster"
    ;;

  remove)
    redis-cli SREM "$ROSTER_KEY" "$AGENT_ID"
    echo "Removed $AGENT_ID from $TEAM roster"
    ;;

  list)
    redis-cli SMEMBERS "$ROSTER_KEY"
    ;;

  count)
    redis-cli SCARD "$ROSTER_KEY"
    ;;

  *)
    echo "Invalid action: $ACTION (use: add, remove, list, count)"
    exit 1
    ;;
esac
```

**Create complete skill package:**
```
templates/skills/team-management/
  ├── SKILL.md (documentation)
  ├── manage-team-roster.sh
  ├── track-team-performance.sh
  ├── manage-team-budget.sh
  └── scale-team.sh
```

---

## III. Migration Roadmap

### Phase 1: Templates & Infrastructure (Week 1-2)

**Goal:** Create all templates and deploy basic infrastructure

**Tasks:**
1. ✅ Create Dockerfile template (agent.Dockerfile)
2. ✅ Create Docker Compose template (team-compose.yml)
3. ✅ Create MCP config template (agent-mcp-config.json)
4. ✅ Create coordinator agent template (team-coordinator.md)
5. ✅ Create C-Suite agent templates (ceo.md, cto.md, coo.md, cfo.md, ciso.md)
6. ⬜ Install PostgreSQL (Docker image)
7. ⬜ Migrate ACE system schema to PostgreSQL

**Deliverables:**
- `templates/` directory with all templates
- PostgreSQL running and schema migrated
- Build infrastructure documented

---

### Phase 2: Pilot Team (Week 3-4)

**Goal:** Deploy Marketing team (10 agents + 1 coordinator) using templates

**Tasks:**
1. ⬜ Generate Marketing team config from templates
   - `teams/marketing/docker-compose.yml` (from team-compose.yml)
   - `teams/marketing/config/coordinator/mcp.json`
   - `teams/marketing/config/agents/*/mcp.json` (10 agents)
2. ⬜ Create Marketing coordinator agent (from template)
3. ⬜ Create Marketing agents (email-campaigns, social-publishing, etc.)
4. ⬜ Deploy team: `docker-compose -f teams/marketing/docker-compose.yml up -d`
5. ⬜ Validate isolation (network, MCP permissions)
6. ⬜ Test CFN Loop execution (assign task → coordinator → agents → validation)

**Deliverables:**
- Marketing team operational (10 agents + coordinator)
- Performance benchmarks
- Lessons learned document

---

### Phase 3: Full Rollout (Week 5-8)

**Goal:** Deploy all teams + C-Suite

**Teams to deploy:**
- Engineering (15 agents + coordinator)
- Sales (8 agents + coordinator)
- Support (10 agents + coordinator)
- Finance (5 agents + coordinator)

**C-Suite to deploy:**
- CEO, CTO, COO, CFO, CISO (5 agents)

**Tasks:**
1. ⬜ Generate configs for all teams (repeat Phase 2 process)
2. ⬜ Deploy teams sequentially (1 per week)
3. ⬜ Deploy C-Suite agents (Week 8)
4. ⬜ Implement cross-team coordination (peer-to-peer channels)
5. ⬜ Implement escalation paths (agent → coordinator → c-suite)
6. ⬜ Validate organizational hierarchy

**Deliverables:**
- Full organization operational (48+ agents, 5 coordinators, 5 c-suite)
- Cross-team collaboration working
- Performance metrics collected

---

### Phase 4: Optimization (Week 9-12)

**Goal:** Optimize costs, performance, and add advanced features

**Tasks:**
1. ⬜ Implement resource sharing (loan protocol between teams)
2. ⬜ Add multi-region replication (PostgreSQL streaming replication)
3. ⬜ Implement career progression (skill matrix, promotions)
4. ⬜ Add innovation budget (20% time allocation)
5. ⬜ Deploy governance (policies, compliance, audits)
6. ⬜ Cost optimization (30% reduction target)

**Deliverables:**
- Cost reduction achieved
- Advanced features operational
- Compliance certifications started (SOC2, GDPR)

---

## IV. Template Generator Script

**Automate template instantiation:**

```bash
# bin/generate-team.sh

#!/bin/bash
# Generate complete team infrastructure from templates
# Usage: ./bin/generate-team.sh --team marketing --agents 10

set -euo pipefail

TEAM=""
AGENT_COUNT=10

while [[ $# -gt 0 ]]; do
  case $1 in
    --team) TEAM="$2"; shift 2 ;;
    --agents) AGENT_COUNT="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

TEAM_DIR="teams/$TEAM"
mkdir -p "$TEAM_DIR/config/coordinator" "$TEAM_DIR/config/agents"

# 1. Generate docker-compose.yml
cp templates/infrastructure/team-compose.yml "$TEAM_DIR/docker-compose.yml"
sed -i "s/{TEAM_NAME}/$TEAM/g" "$TEAM_DIR/docker-compose.yml"
sed -i "s/{TEAM_ID}/$(( $(echo $TEAM | md5sum | cut -c1-2 | xargs printf "%d") % 255 ))/g" "$TEAM_DIR/docker-compose.yml"

# 2. Generate coordinator MCP config
cp templates/mcp/agent-mcp-config.json "$TEAM_DIR/config/coordinator/mcp.json"
sed -i "s/{TEAM}/$TEAM/g; s/{ROLE}/coordinator/g; s/{ID}/001/g" "$TEAM_DIR/config/coordinator/mcp.json"

# 3. Generate agent MCP configs
for i in $(seq 1 $AGENT_COUNT); do
  AGENT_ID=$(printf "%03d" $i)
  mkdir -p "$TEAM_DIR/config/agents/agent-$AGENT_ID"
  cp templates/mcp/agent-mcp-config.json "$TEAM_DIR/config/agents/agent-$AGENT_ID/mcp.json"
  sed -i "s/{TEAM}/$TEAM/g; s/{ROLE}/specialist/g; s/{ID}/$AGENT_ID/g" "$TEAM_DIR/config/agents/agent-$AGENT_ID/mcp.json"
done

# 4. Generate coordinator agent markdown
mkdir -p ".claude/agents/coordinators"
cp templates/agents/team-coordinator.md ".claude/agents/coordinators/$TEAM-coordinator.md"
sed -i "s/{TEAM}/$TEAM/g; s/{TEAM_DISPLAY_NAME}/$(echo $TEAM | sed 's/.*/\u&/')/g; s/{AGENT_COUNT}/$AGENT_COUNT/g" ".claude/agents/coordinators/$TEAM-coordinator.md"

echo "✅ Generated $TEAM team infrastructure:"
echo "   - Docker Compose: teams/$TEAM/docker-compose.yml"
echo "   - Coordinator config: teams/$TEAM/config/coordinator/mcp.json"
echo "   - Agent configs: teams/$TEAM/config/agents/agent-*/mcp.json ($AGENT_COUNT agents)"
echo "   - Coordinator agent: .claude/agents/coordinators/$TEAM-coordinator.md"
echo ""
echo "Next steps:"
echo "   1. Review generated files"
echo "   2. Update .env with team-specific API keys"
echo "   3. Deploy: docker-compose -f teams/$TEAM/docker-compose.yml up -d"
```

**Usage:**
```bash
# Generate Marketing team (10 agents)
./bin/generate-team.sh --team marketing --agents 10

# Generate Engineering team (15 agents)
./bin/generate-team.sh --team engineering --agents 15

# Generate Sales team (8 agents)
./bin/generate-team.sh --team sales --agents 8
```

---

## V. Summary

### What You Have ✅
- ✅ Redis coordination (production-ready)
- ✅ Agent spawning (CLI-based, cost-optimized)
- ✅ CFN Loop orchestration (modular, well-tested)
- ✅ ACE system (SQLite knowledge storage)
- ✅ 23 production agents (engineering-focused)
- ✅ 43 CFN skills (extensive library)

### What You Need ⚠️
- ⬜ Docker container orchestration (2-3 weeks)
- ⬜ PostgreSQL migration (1-2 weeks, can defer)
- ⬜ Organizational hierarchy (2 weeks, nice-to-have)
- ⬜ Per-agent MCP configs (1 week)

### Templates Created 🎨
1. Agent Dockerfile (`templates/infrastructure/agent.Dockerfile`)
2. Team Docker Compose (`templates/infrastructure/team-compose.yml`)
3. Agent MCP Config (`templates/mcp/agent-mcp-config.json`)
4. Team Coordinator (`templates/agents/team-coordinator.md`)
5. C-Suite Agents (`templates/agents/csuite/*.md`)
6. Team Management Skills (`templates/skills/team-management/`)
7. Template Generator (`bin/generate-team.sh`)

### Effort Summary
- **Total:** 8-12 weeks
- **Phase 1 (Templates):** 1-2 weeks
- **Phase 2 (Pilot Team):** 1-2 weeks
- **Phase 3 (Full Rollout):** 4 weeks
- **Phase 4 (Optimization):** 4 weeks

**This is a refactoring project, not a rebuild. You're 70% there.**
