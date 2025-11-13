# Corporate AI Organization - Phased Implementation Plan

**Version:** 1.0.0
**Date:** 2025-11-12
**Timeline:** 12 weeks
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phase 0: Foundation Setup](#phase-0-foundation-setup-week-1)
3. [Phase 1: File System & MCP Isolation](#phase-1-file-system--mcp-isolation-weeks-2-3)
4. [Phase 2: Team Coordinator Layer](#phase-2-team-coordinator-layer-weeks-4-5)
5. [Phase 3: Knowledge Persistence](#phase-3-knowledge-persistence-weeks-6-7)
6. [Phase 4: Network Security](#phase-4-network-security-week-8)
7. [Phase 5: Agent Recovery & Failover](#phase-5-agent-recovery--failover-week-9)
8. [Phase 6: Production Hardening](#phase-6-production-hardening-week-10)
9. [Phase 7: Testing & Validation](#phase-7-testing--validation-week-11)
10. [Phase 8: Production Deployment](#phase-8-production-deployment-week-12)
11. [Risk Management](#risk-management)
12. [Success Criteria](#success-criteria)

---

## 1. Executive Summary

### 1.1 Objectives

Transform the current Docker-based CFN Loop coordinator into a corporate-style AI organization with:
- **Strong isolation** between teams (file system, MCP, network)
- **Hierarchical coordination** (Main Coordinator → Team Coordinators → Agents)
- **Fault-tolerant knowledge persistence** (Redis → PostgreSQL → S3)
- **Production-grade security** (network segmentation, least privilege, audit logging)

### 1.2 Timeline

| Phase | Duration | Deliverable | Dependencies |
|-------|----------|-------------|--------------|
| Phase 0 | 1 week | Foundation infrastructure | None |
| Phase 1 | 2 weeks | File & MCP isolation | Phase 0 |
| Phase 2 | 2 weeks | Team coordinator layer | Phase 1 |
| Phase 3 | 2 weeks | Knowledge persistence | Phase 2 |
| Phase 4 | 1 week | Network security | Phase 3 |
| Phase 5 | 1 week | Recovery mechanisms | Phase 4 |
| Phase 6 | 1 week | Production hardening | Phase 5 |
| Phase 7 | 1 week | Testing & validation | Phase 6 |
| Phase 8 | 1 week | Production deployment | Phase 7 |
| **Total** | **12 weeks** | Production-ready system | - |

### 1.3 Resources Required

**Personnel:**
- 1 Technical Lead (full-time, 12 weeks)
- 2 Backend Engineers (full-time, 12 weeks)
- 1 DevOps Engineer (full-time, 8 weeks: Phase 4-8)
- 1 QA Engineer (part-time, 4 weeks: Phase 7-8)

**Infrastructure:**
- Development: 1 Linux VM (32GB RAM, 16 cores)
- Staging: 1 Linux VM (64GB RAM, 32 cores)
- Production: 1 Linux server (128GB RAM, 64 cores)
- Storage: PostgreSQL (managed), Redis (managed), S3-compatible storage

**Budget:**
- Development infrastructure: $500/month
- Staging infrastructure: $1000/month
- Production infrastructure: $3000/month
- Testing AI API costs: $500 (one-time)
- **Total (3 months):** $14,000

---

## Phase 0: Foundation Setup (Week 1)

### 0.1 Objectives

- Set up development environment
- Create base Docker images
- Initialize database schemas
- Configure version control

### 0.2 Tasks

**Day 1-2: Development Environment**

```bash
# 1. Clone repository
git clone https://github.com/your-org/cfn-corporate.git
cd cfn-corporate

# 2. Create directory structure
mkdir -p {docker/{coordinator,agents},config/{teams,redis,postgres,mcp-configs},scripts,tests}

# 3. Initialize Node.js projects
cd docker/coordinator
npm init -y
npm install dockerode redis pg jsonwebtoken dotenv

# 4. Set up TypeScript
npm install -D typescript @types/node ts-node
npx tsc --init
```

**Day 3-4: Database Setup**

```sql
-- File: config/postgres/init.sql

CREATE DATABASE cfn_corporate;

\c cfn_corporate;

-- Create schemas (see ARCHITECTURE.md section 4.3)
-- agents, playbooks, knowledge_entries, task_history, etc.

-- Create initial admin user
INSERT INTO team_coordinators (id, team_id, status, budget_allocated)
VALUES (gen_random_uuid(), 'system', 'active', 0);
```

**Day 5: Docker Images**

```dockerfile
# File: docker/coordinator/Dockerfile.base
FROM node:20-alpine
RUN apk add --no-cache docker-cli redis postgresql-client
WORKDIR /app
# ... (see ARCHITECTURE.md section 2.2)
```

```bash
# Build base images
docker build -f docker/coordinator/Dockerfile.base -t cfn-coordinator-base:v0.1.0 .
docker build -f docker/agents/Dockerfile.base -t cfn-agent-base:v0.1.0 .
```

### 0.3 Deliverables

- [ ] Development environment configured
- [ ] Git repository initialized with branching strategy
- [ ] PostgreSQL database with initial schema
- [ ] Redis instances (shared + 4 team instances)
- [ ] Base Docker images built and tagged
- [ ] CI/CD pipeline skeleton (GitHub Actions)

### 0.4 Acceptance Criteria

- [ ] `docker-compose up` starts all infrastructure services
- [ ] PostgreSQL schema migrations run successfully
- [ ] Redis instances accessible and authenticated
- [ ] Base images build without errors
- [ ] Unit tests pass (100% coverage on utilities)

---

## Phase 1: File System & MCP Isolation (Weeks 2-3)

### 1.1 Objectives

- Implement team-based workspace isolation
- Create MCP configuration system
- Generate team-specific agent images
- Validate isolation boundaries

### 1.2 Tasks

**Week 2: Workspace Isolation**

```bash
# Day 1-2: Create workspace structure
mkdir -p /workspace/{frontend,backend,infrastructure,tests}

# Populate with sample code
cp -r existing-frontend-code /workspace/frontend/
cp -r existing-backend-code /workspace/backend/
cp -r existing-infra-code /workspace/infrastructure/
cp -r existing-tests /workspace/tests/

# Day 3-4: Modify coordinator spawning logic
# File: docker/coordinator/src/team-coordinator.ts

function getWorkspaceMount(team: string, role: string): string {
  const mounts = {
    'frontend': {
      path: '/workspace/frontend',
      mode: 'rw'
    },
    'backend': {
      path: '/workspace/backend',
      mode: 'rw'
    },
    'devops': {
      path: '/workspace/infrastructure',
      mode: 'rw'
    },
    'qa': {
      path: '/workspace/tests',
      mode: 'rw'
    }
  };

  const teamMount = mounts[team];
  return `${teamMount.path}:/workspace:${teamMount.mode}`;
}

// Day 5: Test workspace isolation
// Spawn frontend agent → verify cannot access /workspace/backend
```

**Week 3: MCP Configuration System**

```javascript
// Day 1-3: Implement MCP config generator
// File: .docker/mcp-configs/scripts/generate-config.js

const fs = require('fs');
const path = require('path');

function generateAgentConfig(team, role, agentId) {
  const base = JSON.parse(fs.readFileSync('base.json', 'utf8'));
  const teamBase = JSON.parse(fs.readFileSync(`teams/${team}/team-base.json`, 'utf8'));
  const agentConfig = JSON.parse(fs.readFileSync(`teams/${team}/agents/${role}.json`, 'utf8'));

  // Deep merge configurations
  const merged = deepMerge(base, teamBase, agentConfig);

  // Substitute environment variables
  const configStr = JSON.stringify(merged, null, 2)
    .replace(/\${REDIS_HOST}/g, `cfn-redis-${team}`)
    .replace(/\${REDIS_NAMESPACE}/g, `team:${team}:agent:${role}:${agentId}`);

  return JSON.parse(configStr);
}

// Day 4-5: Create team-specific configs
// frontend: playwright-mcp, browser-devtools-mcp
// backend: postgres-mcp, docker-mcp
// devops: docker-mcp, kubernetes-mcp
// qa: playwright-mcp (read-only source)

// Test: spawn agent with config, verify MCP access
```

### 1.3 Deliverables

- [ ] Workspace directory structure created
- [ ] Team-specific Docker volume mounts implemented
- [ ] MCP config generator script functional
- [ ] Team-specific MCP configs created (4 teams x 3 roles = 12 configs)
- [ ] Agent Dockerfiles updated with team-specific MCP installs
- [ ] Integration tests for isolation

### 1.4 Acceptance Criteria

- [ ] Frontend agent cannot read `/workspace/backend/` (verified with test)
- [ ] Backend agent cannot access `playwright-mcp` (verified with test)
- [ ] QA agent has read-only access to `/workspace/frontend/` and `/workspace/backend/`
- [ ] MCP config inheritance works (base → team → agent)
- [ ] Agents spawn successfully with correct MCP servers

### 1.5 Testing

```bash
# Test 1: File isolation
docker exec cfn-agent-frontend-001 ls /workspace/backend
# Expected: Permission denied or directory not mounted

# Test 2: MCP isolation
docker exec cfn-agent-frontend-001 npx claude-flow-novice mcp list
# Expected: Only playwright-mcp, browser-devtools-mcp, redis-mcp, filesystem-mcp

# Test 3: QA read-only access
docker exec cfn-agent-qa-001 touch /workspace/frontend/test.txt
# Expected: Read-only file system error
```

---

## Phase 2: Team Coordinator Layer (Weeks 4-5)

### 2.1 Objectives

- Implement team coordinator container
- Build agent spawning and management
- Implement budget tracking
- Create main coordinator orchestration

### 2.2 Tasks

**Week 4: Team Coordinator Implementation**

```typescript
// Day 1-3: Implement team coordinator
// File: docker/coordinator/src/team-coordinator.ts

import Docker from 'dockerode';
import Redis from 'ioredis';
import { Pool } from 'pg';

interface TeamState {
  teamId: string;
  agents: Map<string, AgentInfo>;
  taskQueue: Task[];
  budgetAllocated: number;
  budgetSpent: number;
  maxAgents: number;
}

class TeamCoordinator {
  private state: TeamState;
  private docker: Docker;
  private redis: Redis;
  private postgres: Pool;

  async initialize() {
    // Load configuration
    this.state = {
      teamId: process.env.TEAM_ID!,
      agents: new Map(),
      taskQueue: [],
      budgetAllocated: parseFloat(process.env.BUDGET_ALLOCATED!),
      budgetSpent: 0,
      maxAgents: parseInt(process.env.MAX_AGENTS!)
    };

    // Connect to infrastructure
    this.docker = new Docker();
    this.redis = new Redis({
      host: process.env.REDIS_HOST!,
      port: 6379,
      password: process.env.REDIS_PASSWORD
    });
    this.postgres = new Pool({
      host: process.env.POSTGRES_HOST!,
      database: 'cfn_corporate',
      user: process.env.POSTGRES_USER!,
      password: process.env.POSTGRES_PASSWORD!
    });

    // Subscribe to channels
    await this.redis.subscribe(`coordinator:${this.state.teamId}:inbox`);
    await this.redis.subscribe('coordination:cross-team');
    await this.redis.subscribe('main:directives');

    // Start monitoring loops
    this.startAgentMonitoring();
    this.startBudgetTracking();
  }

  async spawnAgent(role: string, task: Task): Promise<AgentInfo | null> {
    // Check budget
    const estimatedCost = this.estimateTaskCost(task);
    if (this.state.budgetSpent + estimatedCost > this.state.budgetAllocated) {
      await this.escalateToMainCoordinator({
        type: 'budget-exceeded',
        team: this.state.teamId,
        requested: estimatedCost,
        available: this.state.budgetAllocated - this.state.budgetSpent
      });
      return null;
    }

    // Check agent limit
    if (this.state.agents.size >= this.state.maxAgents) {
      this.state.taskQueue.push({role, task});
      return null;
    }

    // Generate MCP config
    const agentId = this.generateAgentId(role);
    const mcpConfig = this.buildMCPConfig(role, agentId);
    await fs.writeFile(`/tmp/mcp-${agentId}.json`, JSON.stringify(mcpConfig));

    // Create container
    const container = await this.docker.createContainer({
      Image: `cfn-agent-${this.state.teamId}:latest`,
      Env: [
        `TEAM_ID=${this.state.teamId}`,
        `AGENT_ID=${agentId}`,
        `AGENT_ROLE=${role}`,
        `TASK_PROMPT=${task.description}`,
        `REDIS_NAMESPACE=team:${this.state.teamId}:agent:${role}:${agentId}`,
        ...this.getTeamEnvVars()
      ],
      HostConfig: {
        NetworkMode: `team-${this.state.teamId}`,
        Binds: [
          `${this.getWorkspacePath(role)}:/workspace:${this.getAccessMode(role)}`,
          `/tmp/mcp-${agentId}.json:/home/claude/.config/claude/claude_desktop_config.json:ro`
        ],
        Memory: this.getMemoryLimit(role),
        CpuShares: this.getCpuShares(role)
      },
      Labels: {
        'cfn.component': 'agent',
        'cfn.team': this.state.teamId,
        'cfn.role': role,
        'cfn.agent-id': agentId
      }
    });

    await container.start();

    // Register agent
    const agentInfo: AgentInfo = {
      id: agentId,
      containerId: container.id,
      role,
      status: 'spawning',
      spawnedAt: new Date(),
      currentTask: task,
      lastHeartbeat: new Date()
    };

    this.state.agents.set(agentId, agentInfo);

    await this.postgres.query(
      'INSERT INTO agents (id, team_id, role, status, spawned_at) VALUES ($1, $2, $3, $4, $5)',
      [agentId, this.state.teamId, role, 'active', new Date()]
    );

    return agentInfo;
  }
}

// Day 4-5: Implement monitoring and budget tracking
// See PSEUDOCODE.md sections 2.4 and 7.1
```

**Week 5: Main Coordinator Implementation**

```typescript
// Day 1-3: Implement main coordinator
// File: docker/coordinator/src/main-coordinator.ts

class MainCoordinator {
  private teamCoordinators: Map<string, TeamCoordinatorInfo>;
  private redis: Redis;
  private postgres: Pool;
  private docker: Docker;

  async initialize() {
    // Load configuration
    const teams = process.env.TEAMS!.split(',');

    // Spawn team coordinators
    for (const team of teams) {
      const coordinator = await this.spawnTeamCoordinator(team);
      this.teamCoordinators.set(team, coordinator);
    }

    // Start monitoring
    this.startCoordinatorMonitoring();
    this.startOrgBudgetTracking();
  }

  async spawnTeamCoordinator(team: string): Promise<TeamCoordinatorInfo> {
    // See PSEUDOCODE.md section 1.2
  }

  async handleResourceRequest(request: ResourceRequest): Promise<ResourceResponse> {
    // See PSEUDOCODE.md section 1.3
  }
}

// Day 4-5: Integration testing
// Test: Main coordinator → Team coordinator → Agent spawning
```

### 2.3 Deliverables

- [ ] Team coordinator implementation complete
- [ ] Agent spawning and lifecycle management working
- [ ] Budget tracking functional
- [ ] Main coordinator implementation complete
- [ ] Cross-team resource allocation working
- [ ] Integration tests passing

### 2.4 Acceptance Criteria

- [ ] Main coordinator can spawn 4 team coordinators
- [ ] Team coordinators can spawn agents (up to maxAgents limit)
- [ ] Budget tracking prevents overspending
- [ ] Escalation to main coordinator works
- [ ] Agent heartbeat monitoring detects failures
- [ ] Task queue processes correctly when agents become available

### 2.5 Testing

```bash
# Test 1: Team coordinator spawning
npm run test:integration -- --test-pattern "team-coordinator-spawn"

# Test 2: Agent lifecycle
npm run test:integration -- --test-pattern "agent-lifecycle"

# Test 3: Budget enforcement
npm run test:integration -- --test-pattern "budget-tracking"

# Test 4: Cross-team coordination
npm run test:integration -- --test-pattern "cross-team-resource"
```

---

## Phase 3: Knowledge Persistence (Weeks 6-7)

### 3.1 Objectives

- Implement Redis hot storage
- Implement PostgreSQL warm storage
- Create knowledge migration pipeline
- Test agent recovery with knowledge restoration

### 3.2 Tasks

**Week 6: Redis Hot Storage**

```typescript
// Day 1-2: Implement knowledge storage
// File: docker/agents/src/knowledge-manager.ts

class KnowledgeManager {
  private redis: Redis;
  private namespace: string;

  async updateKnowledge(category: string, entries: KnowledgeEntry[]) {
    for (const entry of entries) {
      const key = `${this.namespace}:knowledge:${category}:${entry.key}`;

      const data = {
        value: entry.value,
        confidence: entry.confidence,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        times_used: 0
      };

      // Store with 7-day TTL
      await this.redis.setex(key, 604800, JSON.stringify(data));
    }
  }

  async loadKnowledge(): Promise<Record<string, any>> {
    const keys = await this.redis.keys(`${this.namespace}:knowledge:*`);
    const knowledge: Record<string, any> = {};

    for (const key of keys) {
      const dataJson = await this.redis.get(key);
      if (dataJson) {
        const parts = key.split(':');
        const category = parts[parts.length - 2];
        const entryName = parts[parts.length - 1];

        if (!knowledge[category]) {
          knowledge[category] = {};
        }

        knowledge[category][entryName] = JSON.parse(dataJson);
      }
    }

    return knowledge;
  }
}

// Day 3-4: Implement playbook management
// File: docker/agents/src/playbook-manager.ts

class PlaybookManager {
  private postgres: Pool;
  private agentId: string;

  async savePlaybook(playbook: Playbook) {
    await this.postgres.query(
      `INSERT INTO playbooks (id, agent_id, team_id, playbook_name, playbook_content, version)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        playbook.id,
        this.agentId,
        this.teamId,
        playbook.name,
        JSON.stringify(playbook.content),
        playbook.version
      ]
    );
  }

  async loadPlaybooks(): Promise<Playbook[]> {
    const result = await this.postgres.query(
      `SELECT id, playbook_name, playbook_content, version, success_rate, times_used
       FROM playbooks
       WHERE agent_id = $1
       ORDER BY times_used DESC, success_rate DESC`,
      [this.agentId]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.playbook_name,
      content: row.playbook_content,
      version: row.version,
      successRate: row.success_rate,
      timesUsed: row.times_used
    }));
  }
}

// Day 5: Test knowledge persistence
// Spawn agent → complete task with learnings → verify Redis storage
// Restart agent → verify knowledge loaded from Redis
```

**Week 7: Knowledge Migration & Recovery**

```typescript
// Day 1-2: Implement migration pipeline
// File: scripts/migrate-knowledge.ts

async function migrateRedisToPostgres() {
  const redisKeys = await redis.keys('team:*:agent:*:knowledge:*');

  for (const key of redisKeys) {
    const dataJson = await redis.get(key);
    if (!dataJson) continue;

    const data = JSON.parse(dataJson);
    const parts = key.split(':');
    const team = parts[1];
    const role = parts[3];
    const agentId = parts[4];
    const category = parts[6];

    await postgres.query(
      `INSERT INTO knowledge_entries (owner_id, team_id, scope, category, content, confidence)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (owner_id, category, content) DO UPDATE
       SET confidence = GREATEST(knowledge_entries.confidence, $6),
           updated_at = NOW()`,
      [agentId, team, 'agent', category, data.value, data.confidence]
    );
  }
}

// Schedule migration: cron job every 24 hours
// crontab -e
// 0 2 * * * cd /app && npm run migrate-knowledge

// Day 3-4: Implement agent recovery
// File: docker/coordinator/src/recovery-manager.ts

class RecoveryManager {
  async handleAgentFailure(agentId: string, agent: AgentInfo) {
    // Stop failed container
    await this.docker.getContainer(agent.containerId).stop();
    await this.docker.getContainer(agent.containerId).remove();

    // Load state from Redis
    const stateKey = `team:${agent.team}:agent:${agent.role}:${agentId}:state`;
    const stateJson = await this.redis.get(stateKey);
    const state = stateJson ? JSON.parse(stateJson) : null;

    // Spawn new container with same agent ID (preserves knowledge namespace)
    const recoveredAgent = await this.spawnAgent(agent.role, state?.currentTask || null);

    // Agent will automatically load knowledge from Redis on startup
    // If Redis is empty, it will fall back to PostgreSQL

    return recoveredAgent;
  }
}

// Day 5: Test recovery
// Spawn agent → simulate crash → verify recovery with knowledge intact
```

### 3.3 Deliverables

- [ ] Redis knowledge storage implemented
- [ ] PostgreSQL playbook storage implemented
- [ ] Knowledge migration pipeline functional
- [ ] Agent recovery with knowledge restoration working
- [ ] Automated migration cron job configured
- [ ] Recovery tests passing

### 3.4 Acceptance Criteria

- [ ] Agent can save knowledge to Redis
- [ ] Agent can load knowledge from Redis on startup
- [ ] Knowledge migrates from Redis to PostgreSQL after 7 days
- [ ] Agent recovery preserves all knowledge
- [ ] Playbooks persist across agent restarts
- [ ] Migration completes within 5 minutes for 10k entries

### 3.5 Testing

```bash
# Test 1: Knowledge persistence
npm run test:integration -- --test-pattern "knowledge-persistence"

# Test 2: Playbook management
npm run test:integration -- --test-pattern "playbook-lifecycle"

# Test 3: Knowledge migration
npm run test:integration -- --test-pattern "knowledge-migration"

# Test 4: Agent recovery
npm run test:integration -- --test-pattern "agent-recovery"

# Test 5: Knowledge loss measurement
# Expected: <1 second of work lost (last Redis snapshot)
npm run test:integration -- --test-pattern "knowledge-loss"
```

---

## Phase 4: Network Security (Week 8)

### 4.1 Objectives

- Create team-specific networks
- Implement firewall rules
- Enable TLS encryption
- Audit network isolation

### 4.2 Tasks

**Day 1-2: Network Creation**

```bash
# Create networks
bash scripts/create-networks.sh

# Verify network isolation
docker network ls | grep cfn
docker network inspect team-frontend
docker network inspect team-backend
```

**Day 3-4: Firewall Configuration**

```bash
# Configure iptables rules
sudo bash scripts/configure-firewall.sh

# Verify firewall rules
sudo iptables -L DOCKER-USER -n -v

# Test isolation
docker exec cfn-agent-frontend-001 ping 172.18.2.11
# Expected: Network unreachable (blocked by firewall)
```

**Day 5: TLS Encryption**

```bash
# Generate certificates
openssl req -x509 -newkey rsa:4096 \
  -keyout config/tls/redis.key \
  -out config/tls/redis.crt \
  -days 365 -nodes \
  -subj "/CN=cfn-redis-shared"

# Configure Redis with TLS
# File: config/redis/shared.conf
tls-port 6380
tls-cert-file /tls/redis.crt
tls-key-file /tls/redis.key
tls-ca-cert-file /tls/ca.crt

# Update clients to use TLS
const redis = new Redis({
  host: 'cfn-redis-shared',
  port: 6380,
  tls: {
    ca: fs.readFileSync('/tls/ca.crt')
  }
});
```

### 4.3 Deliverables

- [ ] Team-specific networks created
- [ ] Firewall rules configured and tested
- [ ] TLS encryption enabled (Redis, PostgreSQL)
- [ ] Network isolation audit passed
- [ ] Security documentation updated

### 4.4 Acceptance Criteria

- [ ] Agents cannot communicate across team networks
- [ ] Agents can only reach team coordinator and team Redis
- [ ] Team coordinators can reach main coordinator
- [ ] All Redis connections use TLS
- [ ] All PostgreSQL connections use TLS
- [ ] Network isolation verified with penetration testing

### 4.5 Testing

```bash
# Test 1: Cross-team blocking
docker exec cfn-agent-frontend-001 nc -zv 172.18.2.11 22
# Expected: Connection refused or timeout

# Test 2: Coordinator reachability
docker exec cfn-agent-frontend-001 nc -zv 172.18.1.10 6379
# Expected: Connection succeeded

# Test 3: TLS enforcement
docker exec cfn-agent-frontend-001 redis-cli -h cfn-redis-frontend -p 6379
# Expected: TLS required error

docker exec cfn-agent-frontend-001 redis-cli -h cfn-redis-frontend -p 6380 --tls
# Expected: Connection succeeded
```

---

## Phase 5: Agent Recovery & Failover (Week 9)

### 5.1 Objectives

- Implement heartbeat monitoring
- Create agent recovery workflow
- Implement team coordinator failover
- Test recovery time objectives

### 5.2 Tasks

**Day 1-2: Heartbeat Monitoring**

```typescript
// File: docker/agents/src/heartbeat.ts

async function heartbeatLoop() {
  while (true) {
    await sendHeartbeat();
    await sleep(30000); // Every 30 seconds
  }
}

async function sendHeartbeat() {
  const heartbeatKey = `team:${teamId}:agent:${agentId}:heartbeat`;

  const data = {
    agent_id: agentId,
    timestamp: new Date().toISOString(),
    status: 'active',
    current_task: currentTask?.id || null,
    memory_usage: process.memoryUsage().heapUsed,
    cpu_usage: process.cpuUsage()
  };

  await redis.setex(heartbeatKey, 90, JSON.stringify(data));
}

// File: docker/coordinator/src/agent-monitor.ts

async function monitorAgents() {
  while (true) {
    const now = Date.now();

    for (const [agentId, agent] of state.agents) {
      const timeSinceHeartbeat = now - agent.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > 90000) { // 90 seconds
        console.log(`Agent heartbeat timeout: ${agentId}`);
        await handleAgentFailure(agentId, agent);
      }
    }

    await sleep(30000); // Check every 30 seconds
  }
}
```

**Day 3-4: Coordinator Failover**

```typescript
// File: docker/coordinator/src/main-coordinator.ts

async function monitorTeamCoordinator(team: string) {
  let missedHeartbeats = 0;

  while (true) {
    const heartbeatKey = `coordinator:${team}:heartbeat`;
    const heartbeat = await redis.get(heartbeatKey);

    if (!heartbeat) {
      missedHeartbeats++;
      console.log(`Missed heartbeat for coordinator: ${team} (${missedHeartbeats}/3)`);

      if (missedHeartbeats >= 3) {
        console.log(`Coordinator failure detected: ${team}`);
        await handleCoordinatorFailure(team);
        break;
      }
    } else {
      missedHeartbeats = 0;
    }

    await sleep(30000);
  }
}

async function handleCoordinatorFailure(team: string) {
  // Check for standby coordinator
  const standby = await findStandbyCoordinator(team);

  if (standby) {
    // Promote standby
    await promoteStandbyCoordinator(team, standby);
  } else {
    // Spawn new coordinator
    await spawnTeamCoordinator(team);
  }
}
```

**Day 5: Recovery Testing**

```bash
# Test 1: Agent recovery
# Kill agent container
docker kill cfn-agent-frontend-001

# Wait for detection (90 seconds)
# Verify new agent spawned with same ID
# Verify knowledge restored

# Test 2: Coordinator recovery
# Kill team coordinator
docker kill cfn-team-coordinator-frontend

# Wait for detection (90 seconds)
# Verify new coordinator spawned
# Verify agents reconnect
```

### 5.3 Deliverables

- [ ] Heartbeat monitoring implemented
- [ ] Agent recovery workflow functional
- [ ] Coordinator failover implemented
- [ ] Recovery time objectives met
- [ ] Failover tests passing

### 5.4 Acceptance Criteria

- [ ] Agent failure detected within 90 seconds
- [ ] Agent recovery completes within 2 minutes
- [ ] Knowledge loss <1 second of work
- [ ] Coordinator failure detected within 90 seconds
- [ ] Coordinator failover completes within 2 minutes
- [ ] All agents reconnect to new coordinator

### 5.5 Testing

```bash
# Chaos testing
npm run test:chaos -- --scenario agent-crash --count 5
npm run test:chaos -- --scenario coordinator-crash --count 3

# Recovery time measurement
npm run test:performance -- --metric recovery-time

# Knowledge loss measurement
npm run test:performance -- --metric knowledge-loss
```

---

## Phase 6: Production Hardening (Week 10)

### 6.1 Objectives

- Implement audit logging
- Add security scanning
- Configure monitoring and alerting
- Performance optimization

### 6.2 Tasks

**Day 1-2: Audit Logging**

```typescript
// File: docker/shared/src/audit-logger.ts

class AuditLogger {
  private postgres: Pool;

  async log(event: AuditEvent) {
    await this.postgres.query(
      `INSERT INTO audit_logs (
        event_type, actor_type, actor_id, team_id,
        action, resource_type, resource_id, result, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.eventType,
        event.actorType,
        event.actorId,
        event.teamId,
        event.action,
        event.resourceType,
        event.resourceId,
        event.result,
        JSON.stringify(event.metadata)
      ]
    );
  }
}

// Integrate into all critical operations
await auditLogger.log({
  eventType: 'authentication',
  actorType: 'agent',
  actorId: agentId,
  action: 'agent_spawn',
  result: 'success'
});
```

**Day 3: Security Scanning**

```bash
# Docker image scanning
docker scan cfn-agent-frontend:latest

# Dependency vulnerability scanning
npm audit --production

# SAST (Static Application Security Testing)
npx eslint-plugin-security --init
npx eslint src/ --ext .ts

# Container runtime security
docker run --security-opt=no-new-privileges --cap-drop=ALL ...
```

**Day 4: Monitoring & Alerting**

```yaml
# File: config/prometheus.yml

scrape_configs:
  - job_name: 'cfn-coordinators'
    static_configs:
      - targets: ['172.18.0.10:9090', '172.18.0.11:9090']

  - job_name: 'cfn-agents'
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        filters:
          - name: label
            values: ['cfn.component=agent']

# File: config/alertmanager.yml

route:
  group_by: ['alertname', 'team']
  receiver: 'pagerduty'

receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '${PAGERDUTY_KEY}'

# Alerts
- alert: AgentHighMemory
  expr: container_memory_usage_bytes{cfn_component="agent"} > 3.5e9
  for: 5m
  labels:
    severity: warning

- alert: CoordinatorDown
  expr: up{job="cfn-coordinators"} == 0
  for: 1m
  labels:
    severity: critical
```

**Day 5: Performance Optimization**

```typescript
// Connection pooling
const redisPool = new RedisCluster([
  { host: 'cfn-redis-shared', port: 6379 }
], {
  redisOptions: {
    connectionPoolSize: 10
  }
});

// Database query optimization
CREATE INDEX CONCURRENTLY idx_task_history_team_time
  ON task_history (team_id, start_time DESC);

// Docker layer caching
FROM node:20-alpine AS base
RUN apk add --no-cache docker-cli

FROM base AS dependencies
COPY package*.json ./
RUN npm ci --only=production

FROM base AS runtime
COPY --from=dependencies /app/node_modules ./node_modules
COPY dist/ ./dist/
```

### 6.3 Deliverables

- [ ] Audit logging fully implemented
- [ ] Security scans passing (no critical vulnerabilities)
- [ ] Prometheus + Grafana dashboards configured
- [ ] Alerting rules configured
- [ ] Performance optimizations applied
- [ ] Load testing completed

### 6.4 Acceptance Criteria

- [ ] All critical actions logged to audit table
- [ ] Docker images have no critical vulnerabilities
- [ ] Metrics collected and visualized
- [ ] Alerts fire correctly for test scenarios
- [ ] System handles 50 concurrent agents
- [ ] P95 latency <500ms for task assignment

### 6.5 Testing

```bash
# Load testing
npm run test:load -- --agents 50 --duration 30m

# Security audit
npm run security:audit

# Performance benchmarking
npm run test:performance -- --baseline v0.1.0
```

---

## Phase 7: Testing & Validation (Week 11)

### 7.1 Objectives

- End-to-end testing
- Security penetration testing
- Performance benchmarking
- User acceptance testing

### 7.2 Tasks

**Day 1-2: End-to-End Testing**

```typescript
// File: tests/e2e/full-workflow.test.ts

describe('Full Corporate Workflow', () => {
  it('should complete task through full hierarchy', async () => {
    // 1. Main coordinator receives task
    const task = {
      description: 'Fix TypeScript errors in /workspace/frontend/src/App.tsx',
      priority: 'high'
    };

    // 2. Main coordinator assigns to frontend team
    const assignment = await mainCoordinator.assignTask(task);
    expect(assignment.team).toBe('frontend');

    // 3. Frontend team coordinator spawns React specialist
    await waitFor(() => teamCoordinator.getAgentCount() > 0, { timeout: 60000 });

    const agents = teamCoordinator.getAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].role).toBe('react-specialist');

    // 4. Agent executes task
    await waitFor(() => agents[0].status === 'completed', { timeout: 300000 });

    // 5. Verify results
    const result = await agents[0].getResult();
    expect(result.success).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.85);

    // 6. Verify knowledge persisted
    const knowledge = await redis.get(`team:frontend:agent:react-specialist:${agents[0].id}:knowledge:*`);
    expect(knowledge).toBeDefined();

    // 7. Verify audit trail
    const auditLogs = await postgres.query(
      'SELECT * FROM audit_logs WHERE actor_id = $1',
      [agents[0].id]
    );
    expect(auditLogs.rows.length).toBeGreaterThan(0);
  });
});
```

**Day 3: Penetration Testing**

```bash
# Network isolation testing
nmap -sP 172.18.1.0/24  # Should only show team-frontend containers

# Privilege escalation attempts
docker exec cfn-agent-frontend-001 whoami
# Expected: claude (non-root)

docker exec cfn-agent-frontend-001 sudo apt-get update
# Expected: sudo: command not found

# File access violations
docker exec cfn-agent-frontend-001 cat /workspace/backend/src/main.ts
# Expected: Permission denied or file not found

# MCP access violations
docker exec cfn-agent-frontend-001 psql -h cfn-postgres -U cfn_admin
# Expected: Command not found (no postgres-mcp for frontend)
```

**Day 4: Performance Benchmarking**

```bash
# Baseline metrics
npm run benchmark -- --scenario baseline

# Scaling test
npm run benchmark -- --scenario scale-up --agents 100

# Recovery performance
npm run benchmark -- --scenario recovery --failure-rate 0.1

# Knowledge migration performance
npm run benchmark -- --scenario migration --entries 100000
```

**Day 5: User Acceptance Testing**

```bash
# UAT scenarios
1. Deploy new feature across frontend + backend teams
2. Simulate budget constraint and verify escalation
3. Test cross-team resource sharing
4. Verify agent recovery with knowledge preservation
5. Test coordinator failover with ongoing tasks
```

### 7.3 Deliverables

- [ ] E2E test suite (>95% coverage)
- [ ] Security penetration test report
- [ ] Performance benchmark report
- [ ] UAT sign-off documentation
- [ ] Bug fixes for issues found

### 7.4 Acceptance Criteria

- [ ] All E2E tests pass
- [ ] No critical security vulnerabilities found
- [ ] Performance meets targets (see Success Criteria)
- [ ] UAT scenarios complete successfully
- [ ] Documentation updated with findings

---

## Phase 8: Production Deployment (Week 12)

### 8.1 Objectives

- Deploy to production environment
- Configure monitoring and alerting
- Create runbooks
- Train operations team

### 8.2 Tasks

**Day 1-2: Production Deployment**

```bash
# 1. Build production images
docker build -f docker/coordinator/Dockerfile.main -t cfn-main-coordinator:v1.0.0 .
docker build -f docker/coordinator/Dockerfile.team -t cfn-team-coordinator:v1.0.0 .
docker build -f docker/agents/Dockerfile.frontend -t cfn-agent-frontend:v1.0.0 .
docker build -f docker/agents/Dockerfile.backend -t cfn-agent-backend:v1.0.0 .

# 2. Push to registry
docker push your-registry.com/cfn-main-coordinator:v1.0.0

# 3. Deploy infrastructure
terraform apply -var-file=production.tfvars

# 4. Deploy application
docker-compose -f docker-compose.prod.yml up -d

# 5. Verify deployment
bash scripts/health-check.sh
```

**Day 3: Monitoring & Alerting**

```bash
# Configure Prometheus
kubectl apply -f k8s/prometheus/

# Configure Grafana dashboards
bash scripts/import-dashboards.sh

# Test alerts
bash scripts/trigger-test-alert.sh
```

**Day 4: Runbooks & Documentation**

```markdown
# Runbook: Agent Failure Recovery

## Symptoms
- Agent heartbeat timeout alert
- Task stuck in "in-progress" state

## Investigation
1. Check agent logs: `docker logs <container-id>`
2. Check Redis heartbeat: `redis-cli GET team:<team>:agent:<id>:heartbeat`
3. Check PostgreSQL: `SELECT * FROM agents WHERE id = '<agent-id>'`

## Resolution
1. Manual recovery: `docker restart <container-id>`
2. If restart fails: Let auto-recovery handle it (2 minute timeout)
3. Verify knowledge restored: Check Redis namespace

## Escalation
If recovery fails 3+ times: Page on-call engineer
```

**Day 5: Operations Training**

```bash
# Training topics
1. System architecture overview
2. Common troubleshooting scenarios
3. Runbook walkthrough
4. Alert response procedures
5. Rollback procedures
```

### 8.3 Deliverables

- [ ] Production deployment complete
- [ ] Monitoring dashboards live
- [ ] Runbooks documented
- [ ] Operations team trained
- [ ] Post-deployment validation passed

### 8.4 Acceptance Criteria

- [ ] All services healthy in production
- [ ] Monitoring shows green metrics
- [ ] Sample tasks complete successfully
- [ ] Ops team can respond to alerts
- [ ] Rollback plan tested

---

## Risk Management

### High-Priority Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Knowledge loss during migration | Medium | High | Implement checksums, test with synthetic data |
| Network isolation bypass | Low | Critical | Extensive penetration testing, security audit |
| Budget overspend during testing | High | Medium | Use cheap providers (Z.ai), set hard limits |
| Agent recovery failure | Medium | High | Implement retry logic, standby agents |
| Coordinator single point of failure | Medium | High | Implement HA standby coordinators |

### Medium-Priority Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Performance degradation at scale | Medium | Medium | Load testing, caching optimization |
| MCP config conflicts | Medium | Low | Config validation, automated testing |
| Team workspace path errors | Low | Medium | Unit tests, integration tests |

---

## Success Criteria

### Functional Requirements

- [ ] ✅ Frontend agents cannot access backend files
- [ ] ✅ Backend agents cannot access playwright-mcp
- [ ] ✅ Knowledge survives agent restarts
- [ ] ✅ Team coordinators manage 10-50 agents
- [ ] ✅ Main coordinator orchestrates 4 teams
- [ ] ✅ Budget tracking prevents overspending
- [ ] ✅ Cross-team resource sharing works

### Non-Functional Requirements

| Metric | Target | Actual |
|--------|--------|--------|
| Agent spawn time | <30 seconds | TBD |
| Agent recovery time | <2 minutes | TBD |
| Knowledge loss | <1 second | TBD |
| Task assignment latency | <1 second | TBD |
| System uptime | 99.9% | TBD |
| Concurrent agents | 100+ | TBD |
| Cost per task | <$0.10 | TBD |

### Production Readiness

- [ ] Security audit passed (no critical vulnerabilities)
- [ ] Performance benchmarks met
- [ ] Failover tested successfully
- [ ] Monitoring and alerting operational
- [ ] Runbooks documented
- [ ] Operations team trained
- [ ] Disaster recovery plan validated

---

## Appendix

### A. Team Roster

**Technical Lead:** Jane Doe
**Backend Engineers:** John Smith, Alice Johnson
**DevOps Engineer:** Bob Williams
**QA Engineer:** Sarah Davis

### B. Communication Plan

- **Daily standup:** 9:00 AM (15 minutes)
- **Weekly sprint review:** Fridays 2:00 PM (1 hour)
- **Slack channel:** #cfn-corporate
- **Issue tracker:** GitHub Issues

### C. Dependencies

- Docker 20.10+
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- TypeScript 5+

### D. Glossary

- **CFN:** Claude Flow Novice
- **MCP:** Model Context Protocol
- **TTL:** Time To Live
- **RTO:** Recovery Time Objective
- **RPO:** Recovery Point Objective

---

**End of Implementation Plan v1.0.0**
