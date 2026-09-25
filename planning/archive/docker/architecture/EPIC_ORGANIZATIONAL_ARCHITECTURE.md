# AI Organizational Architecture - Docker Migration Epic

**Epic ID:** cfn-organizational-architecture
**Status:** Not Started
**Duration:** 12 weeks
**Investment:** $56,000
**Dependencies:** Marketing n8n MCP Integration Epic

---

## Executive Summary

Transform Claude Flow Novice from ephemeral CLI-based agent execution to a **Docker-based organizational architecture** with hierarchical teams, coordinators, and persistent playbook-driven knowledge. Combines the efficiency of **short-lived agents** (spawn per task, exit when done) with the power of **long-term organizational memory** (ACE system playbooks that accumulate lessons over time).

**Key Innovation:** Agents are ephemeral (no idle overhead), but knowledge is eternal (playbooks survive agent termination).

---

## Vision: Human-Like AI Organization

### Organizational Structure

```
C-Suite (Strategic Leadership)
├── CEO - Vision, priorities, cross-org decisions
├── CTO - Technical roadmap, architecture
├── COO - Operations, resource allocation
├── CFO - Budget, cost optimization
└── CISO - Security, compliance

Team Coordinators (Tactical Management)
├── Marketing Coordinator (10 agents)
├── Engineering Coordinator (15 agents)
├── Sales Coordinator (8 agents)
├── Support Coordinator (10 agents)
└── Finance Coordinator (5 agents)

Individual Agents (Operational Execution)
└── Ephemeral task-specific agents
    - Spawn when needed
    - Load team playbook
    - Execute task
    - Store lessons
    - Exit
```

### Agent Lifecycle: Ephemeral with Persistent Knowledge

```
1. Coordinator receives task
   ↓
2. Coordinator spawns ephemeral agent (Docker exec or CLI)
   ↓
3. Agent loads playbook from ACE system
   - Personal lessons (scope=agent, owner_id=agent-123)
   - Team lessons (scope=team, team_id=marketing)
   - Org lessons (scope=org)
   ↓
4. Agent executes task (informed by 100+ lessons)
   ↓
5. Agent stores new lessons to playbook
   ↓
6. Agent exits (process terminates)
   ↓
7. Next agent spawned for next task
   - Loads same playbook (sees previous agent's lessons)
   - Knowledge compounds over time
```

**Benefits:**
- ✅ No idle agents consuming resources (cost-efficient)
- ✅ Clean state per task (no context pollution)
- ✅ Organizational knowledge accumulates (playbook grows)
- ✅ Consistency across agents (shared playbook)

---

## Architecture Principles

### 1. Ephemeral Agents (Not Persistent Workers)

**Pattern:** Spawn → Load Playbook → Execute → Store Lessons → Exit

**Why Not Persistent?**
- Idle overhead: 48 agents running 24/7 = high cost
- Context pollution: Agent memory from task 1 affects task 2
- Fixed roster: Can't change agent types mid-workflow
- Resource waste: Pay for 48 agents even if only using 5

**Why Ephemeral?**
- Zero idle cost: Agents only exist during active work
- Clean state: Each task gets fresh agent
- Adaptive: Spawn different specialist for iteration 2
- Cost-efficient: Pay only for task execution

### 2. Playbook-Driven Knowledge (Not In-Process Memory)

**Pattern:** Lessons stored in ACE system, loaded by every agent

**Storage:**
```sql
-- PostgreSQL (production)
CREATE TABLE context_reflections (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,                    -- "Use bcrypt for passwords"
  scope TEXT CHECK (scope IN ('agent', 'team', 'org')),
  owner_id TEXT,                            -- agent-123, team-marketing, org
  team_id TEXT,                             -- marketing, engineering, etc.
  confidence REAL,                          -- 0.95 (high confidence)
  success_count INTEGER,                    -- 52 (worked 52 times)
  total_count INTEGER,                      -- 53 (tried 53 times)
  tags TEXT[],                              -- {security, authentication, bcrypt}
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX idx_scope_owner ON context_reflections (scope, owner_id);
CREATE INDEX idx_team ON context_reflections (team_id);
CREATE INDEX idx_tags ON context_reflections USING GIN (tags);
CREATE INDEX idx_confidence ON context_reflections (confidence DESC);
```

**Scope Hierarchy:**
```
Agent loads lessons from 3 scopes (inheritance):
1. Personal (scope=agent, owner_id=email-campaign-developer)
2. Team (scope=team, team_id=marketing)
3. Org (scope=org)

Priority: agent > team > org (for conflicting lessons)
```

### 3. Container Isolation (Not Shared Host)

**Pattern:** Each team gets isolated Docker network

**Marketing Team Infrastructure:**
```yaml
# teams/marketing/docker-compose.yml
version: '3.8'
services:
  coordinator:
    build: ../../templates/infrastructure/agent.Dockerfile
    container_name: marketing-coordinator
    networks:
      - marketing-team-net
    environment:
      - TEAM_ID=marketing
      - REDIS_HOST=redis
      - POSTGRES_HOST=postgres
    volumes:
      - ./.claude:/app/.claude
      - ./config/coordinator:/app/config

  # No persistent agent containers
  # Agents spawned on-demand by coordinator via:
  # docker exec marketing-coordinator npx cfn agent email-campaigns

networks:
  marketing-team-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

**Benefits:**
- Network isolation: Marketing can't access Engineering network
- Resource limits: cgroup enforcement (CPU, memory)
- Security: Compromised agent can't breach other teams
- Fault tolerance: Team failure doesn't affect other teams

---

## Phase Breakdown

### Phase 1: Infrastructure Templates & ACE Enhancement (2 weeks)

**Objective:** Prepare migration infrastructure, enhance ACE system for team scoping

**Key Deliverables:**
1. **ACE System Enhancement**
   - Add scope, owner_id, team_id columns to schema
   - SQLite → PostgreSQL migration script
   - Scope hierarchy implementation (agent > team > org)
   - Automatic context injection/reflection hooks

2. **Docker Templates**
   - Agent Dockerfile (multi-stage build)
   - Team docker-compose template
   - Per-agent MCP configuration template
   - Coordinator agent template
   - C-Suite agent templates

3. **Automation**
   - Template generator script (`bin/generate-team.sh`)
   - Automatic playbook loading (pre-spawn hook)
   - Automatic lesson storage (post-completion hook)

**Success Criteria:**
- PostgreSQL schema supports team isolation
- Context injection <500ms (fast playbook loading)
- Templates generate valid Docker configs
- Agent receives /tmp/context-{id}.json with relevant lessons

---

### Phase 2: Pilot Team - Marketing (2 weeks)

**Objective:** Deploy Marketing team as pilot, validate playbook-driven workflow

**Key Deliverables:**
1. **Marketing Team Deployment**
   - Docker network with isolated containers
   - Marketing coordinator agent
   - 10 agent configs (email, social, analytics, etc.)
   - Team-specific MCP configurations

2. **Playbook Workflow**
   - Seed marketing playbook with 10 initial lessons
   - Execute 5 test tasks through coordinator
   - Validate playbook accumulation (grows to 15+ lessons)
   - Measure playbook effectiveness (consistency, learning rate)

**Success Criteria:**
- Marketing team operational (coordinator + ephemeral agents)
- Agents successfully load team playbook (scope=team:marketing)
- Playbook grows from 10 → 18 lessons after 5 tasks
- Task completion time <5 minutes for simple tasks
- Team isolation validated (can't access other teams)

---

### Phase 3: Full Rollout (4 weeks)

**Objective:** Deploy all teams + C-Suite, enable cross-team coordination

**Key Deliverables:**
1. **All Teams Deployed**
   - Engineering (15 agents + coordinator)
   - Sales (8 agents + coordinator)
   - Support (10 agents + coordinator)
   - Finance (5 agents + coordinator)

2. **C-Suite Agents**
   - CEO, CTO, COO, CFO, CISO
   - Strategic oversight and escalation handling
   - Org-wide playbook management

3. **Cross-Team Coordination**
   - Peer-to-peer coordinator communication
   - Escalation paths (agent → coordinator → C-Suite)
   - Resource sharing protocol

**Success Criteria:**
- All 5 teams operational (48 agents + 5 coordinators)
- C-Suite receives reports from all coordinators
- Cross-team task execution validated
- Escalation workflow validated (blocker → C-Suite decision)
- Each team has isolated playbook (100+ total org lessons)

---

### Phase 4: Optimization (4 weeks)

**Objective:** Cost optimization, playbook intelligence, production hardening

**Key Deliverables:**
1. **Playbook Intelligence**
   - Automatic deduplication (merge similar lessons)
   - Quality curation (archive low-confidence lessons)
   - Promotion (team lessons → org lessons for high-confidence)
   - Playbook curator agent (automated maintenance)

2. **Cost Optimization**
   - Budget tracking per team
   - Auto-scaling (spawn more agents when needed)
   - Idle container shutdown (save $200/month)
   - Cost reduced by 30% vs baseline

3. **Production Hardening**
   - Disaster recovery playbook
   - Agent recovery <2 minutes
   - Daily playbook backups to S3
   - Security audit (container isolation, MCP permissions)

**Success Criteria:**
- Playbook size reduced by 30% (deduplication + archival)
- High-confidence lessons promoted to org playbook
- Cost reduced to $10.5k/month (from $15k baseline)
- Agent recovery validated (<2 minutes from crash to resume)
- Security audit passes (zero critical vulnerabilities)

---

## Key Innovations

### 1. Ephemeral Agents with Eternal Knowledge

**Traditional Approach (Persistent Agents):**
```
Agent spawns → Runs 24/7 → Accumulates knowledge in process memory → Crashes → Knowledge lost
```

**Our Approach (Ephemeral + Playbook):**
```
Agent spawns → Loads playbook → Executes task → Stores lessons → Exits → Knowledge persists
Next agent → Loads same playbook → Sees previous lessons → Builds upon them
```

**Impact:**
- 95% cost reduction (no idle agents)
- Knowledge survives agent termination
- Consistency across all agents (shared playbook)

### 2. Scope Hierarchy (Agent → Team → Org)

**Problem:** How to share knowledge without polluting namespaces?

**Solution:** Three-tier scope system

```
Personal Lessons (scope=agent):
- "I prefer snake_case for variable names"
- Low priority, only visible to this agent

Team Lessons (scope=team):
- "Marketing emails perform best on Tuesday 10am EST"
- Medium priority, visible to all marketing agents

Org Lessons (scope=org):
- "Use environment variables for API keys (${VAR_NAME})"
- High priority, visible to all agents across all teams
```

**Conflict Resolution:** Agent > Team > Org

### 3. Automatic Context Injection/Reflection

**Problem:** Agents forget to load/store lessons (manual invoke)

**Solution:** Orchestrator automatically invokes before/after every spawn

```bash
# orchestrate.sh (before spawning agent)
./.claude/skills/cfn-ace-system/invoke-context-inject.sh \
  --task-id "$TASK_ID" \
  --agent-type "email-campaigns" \
  --tags "email,mailchimp,campaigns" \
  --scope "team:marketing" \
  > /tmp/context-$AGENT_ID.json

# Spawn agent with context file
npx cfn agent email-campaigns \
  --task-id "$TASK_ID" \
  --context-file "/tmp/context-$AGENT_ID.json"

# orchestrate.sh (after agent completes)
./.claude/skills/cfn-ace-system/invoke-context-reflect.sh \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --auto-extract  # Parse agent output for lessons
```

**Impact:**
- Zero manual invoke required
- 100% playbook coverage (every agent uses playbook)
- Automatic lesson extraction from agent output

---

## Technical Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Containerization | Docker + Docker Compose | Agent isolation, network segmentation |
| Orchestration | Docker Swarm (MVP) → K8s (future) | Multi-node scaling |
| Database | PostgreSQL 15 | ACE system playbook storage |
| Cache | Redis 7 | Coordination, pub/sub messaging |
| Storage | S3 | Daily playbook backups |
| Monitoring | Prometheus + Grafana | Metrics, dashboards |
| Logging | ELK Stack | Centralized log aggregation |

---

## Cost Analysis

### Current Baseline (Marketing Epic, 57 Agents)

```
CLI spawning (no coordinator):
- Agent cost: $1,260/agent × 57 agents = $71,820
- Infrastructure: Minimal (shared Redis/SQLite)
- Total: ~$72,000 (18 weeks)
```

### Organizational Architecture (48 Agents + 5 Coordinators)

```
Phase 1-4 Investment: $56,000 (12 weeks)

Monthly Operating Cost:
- 5 Coordinators: $160/month each = $800/month
- Ephemeral agents: Pay only when running = $8,000/month
- Infrastructure (PostgreSQL, Redis, Docker): $1,200/month
- Monitoring (Prometheus, Grafana): $500/month
- Total: $10,500/month

With optimization (Phase 4):
- Cost reduction: 30%
- Optimized monthly: $10,500 → $7,350/month
```

### ROI Analysis

```
Investment: $56,000 (one-time)
Monthly savings vs baseline: $15,000 - $7,350 = $7,650/month
Payback period: $56,000 / $7,650 = 7.3 months

Year 1 savings: $7,650 × 12 - $56,000 = $35,800
Year 2+ savings: $7,650 × 12 = $91,800/year
```

**Additional Benefits:**
- Knowledge accumulation (playbook value compounds)
- Consistency (reduced errors, faster task completion)
- Scalability (add teams without redesign)

---

## Migration Path from Marketing Epic

**Timeline:**
```
Weeks 1-18: Marketing Epic (CLI spawning, SQLite ACE)
Weeks 19-30: Organizational Architecture Migration

Week 19-20: Phase 1 (Infrastructure templates, ACE enhancement)
Week 21-22: Phase 2 (Marketing team migrated to Docker)
Week 23-26: Phase 3 (Deploy Engineering, Sales, Support, Finance + C-Suite)
Week 27-30: Phase 4 (Optimization, production hardening)
```

**Migration Strategy:**
1. Marketing epic completes with CLI spawning (weeks 1-18)
2. Marketing team becomes pilot for Docker migration (weeks 21-22)
3. Existing marketing agents' ACE lessons migrated to PostgreSQL
4. Marketing coordinator manages same 10-15 agents (now in Docker)
5. Other teams deployed fresh with new playbooks

**Zero Disruption:** Marketing epic delivers ROI before migration starts.

---

## Success Metrics

| Metric | Target | Validation |
|--------|--------|-----------|
| Teams operational | 5 | All teams processing tasks |
| Total agents | 48 + 5 coordinators | Docker ps shows all containers |
| Playbook lessons | 100+ | PostgreSQL query count |
| Playbook load time | <500ms | Benchmark context injection |
| Agent recovery time | <2 minutes | Crash simulation test |
| Cost reduction | 30% | Monthly spending report |
| Cross-team coordination | Working | Execute cross-team task |
| Container isolation | Validated | Security audit passes |
| C-Suite oversight | Working | Escalation workflow test |

---

## Risks and Mitigations

| Risk | Severity | Mitigation | Status |
|------|----------|-----------|--------|
| Docker network breaks Redis | Medium | Test Redis pub/sub across networks (Phase 1) | Open |
| PostgreSQL migration downtime | Medium | Dual-write (SQLite + PostgreSQL) during Phase 1 | Open |
| Coordinator overhead reduces savings | Low | Validated 150-agent capacity, 10-agent teams OK | Mitigated |
| Playbook growth slows injection | Low | PostgreSQL indexes, target <500ms | Open |

---

## Next Steps

1. **Review epic config:** `planning/docker/cfn-organizational-architecture-epic.json`
2. **Complete marketing epic:** Weeks 1-18 (prerequisite)
3. **Week 19: Start Phase 1** - Infrastructure templates + ACE enhancement
4. **Week 21: Deploy pilot** - Marketing team migrated to Docker
5. **Week 23: Full rollout** - All teams + C-Suite operational
6. **Week 27: Optimize** - Cost reduction, playbook intelligence, production ready

---

**Document Status:** Initial Draft
**Created:** 2025-10-30
**Epic Owner:** Infrastructure & Architecture Team
