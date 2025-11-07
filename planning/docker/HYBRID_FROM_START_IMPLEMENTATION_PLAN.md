# Hybrid Architecture Implementation Plan - From Day 1

## Executive Summary

**Change:** Start with hybrid architecture (Claude Max coordinators + Z.ai workers) from Day 1 instead of pure Claude migration.

**Rationale:**
- Skip pure Claude validation phase (already validated in Sprint 2)
- Avoid migration disruption (deploy correctly first time)
- Prevent rate limit discovery issues (coordinators isolated from start)
- Production-ready architecture immediately

**Timeline Impact:**
- Remove Phase 1 Sprint 1.3 (pure Claude testing)
- Remove Week 22-23 migration work
- **Net savings:** 1 week (12 weeks → 11 weeks)

**Cost Impact:**
- Month 1: $334 (hybrid from start)
- vs Month 1: $100 (pure) + Month 2: $334 (hybrid) = same total cost
- **No cost change**, just earlier hybrid deployment

---

## Revised Epic Timeline

### Phase 1: Infrastructure Templates & Hybrid Setup (Weeks 1-2)

**Sprint 1.1: ACE System Enhancement** (3 days)
- No changes (same as original)

**Sprint 1.2: Docker Templates & Hybrid Routing** (4 days, REVISED)
- Create Docker templates with hybrid routing from start
- Configure team-providers.json with coordinator/worker split
- Enhanced execute-agent.sh with role-based routing
- Docker compose with separate coordinator/worker networks

**Sprint 1.3: Hybrid Routing Validation** (3 days, NEW)
- Test coordinator (Claude Max) → worker (Z.ai) spawning
- Validate Redis context injection with Z.ai workers
- Test cross-team coordinator mesh communication
- Load test with 5 concurrent workers per team

**Original Sprint 1.3 (Pure Claude testing): REMOVED**

### Phase 2: Team Deployments (Weeks 3-6, UNCHANGED)

**Sprint 2.1: Marketing Pilot** (Week 3)
- Deploy marketing-coordinator (Claude Max)
- Spawn 3 test workers (Z.ai)
- 48-hour validation period

**Sprint 2.2: Engineering Deployment** (Week 4)
- Deploy engineering-coordinator (Claude Max)
- Spawn 5 test workers (Z.ai)
- Validate complex workflows (code review, testing)

**Sprint 2.3: Sales + Support Deployment** (Week 5)
- Deploy sales-coordinator + support-coordinator (Claude Max)
- Spawn workers for both teams (Z.ai)
- Test cross-team escalations

**Sprint 2.4: Finance Deployment** (Week 6)
- Deploy finance-coordinator (Claude Max)
- All 5 teams operational with hybrid architecture

### Phase 3: C-Suite + Optimization (Weeks 7-9, UNCHANGED)

**Sprint 3.1: C-Suite Deployment** (Week 7)
- Deploy C-Suite agents (optional 6th Claude Max subscription OR rotate across teams)

**Sprint 3.2: Cost Optimization** (Week 8)
- Worker model tiering (Haiku for simple tasks, Sonnet for complex)
- Batch spawning optimization
- Playbook-driven execution patterns

**Sprint 3.3: Monitoring & Dashboards** (Week 9)
- Grafana dashboards (per-team Z.ai costs, coordinator health)
- Alerting (rate limits, worker failures, cost anomalies)

### Phase 4: Operational Hardening (Weeks 10-11, REVISED)

**Sprint 4.1: Production Testing** (Week 10)
- Load test: 50 concurrent workers across all teams
- Failover testing: Coordinator restart, Redis connection loss
- Security audit: Container isolation, MCP permissions

**Sprint 4.2: Documentation & Handoff** (Week 11)
- Operational runbooks
- Troubleshooting guides
- Cost optimization playbooks
- Handoff to operations team

**Original Week 12: REMOVED (migration work no longer needed)**

---

## Phase 1 Sprint 1.2 Details (Revised for Hybrid)

### Deliverables

**1. Team Providers Configuration with Hybrid Routing**

**File:** `.claude/cfn-config/team-providers.json`

```json
{
  "teams": {
    "marketing": {
      "coordinator": {
        "provider": "anthropic",
        "apiKeyEnvVar": "MARKETING_COORDINATOR_API_KEY",
        "subscription": "claude-max-marketing",
        "model": "claude-sonnet-4-20250514"
      },
      "workers": {
        "provider": "zai",
        "apiKeyEnvVar": "ZAI_API_KEY",
        "billing": "pay-as-you-go",
        "defaultModel": "claude-3-5-haiku-20241022",
        "complexModel": "claude-3-5-sonnet-20241022"
      }
    },
    "engineering": {
      "coordinator": {
        "provider": "anthropic",
        "apiKeyEnvVar": "ENGINEERING_COORDINATOR_API_KEY",
        "subscription": "claude-max-engineering",
        "model": "claude-sonnet-4-20250514"
      },
      "workers": {
        "provider": "zai",
        "apiKeyEnvVar": "ZAI_API_KEY",
        "billing": "pay-as-you-go",
        "defaultModel": "claude-3-5-haiku-20241022",
        "complexModel": "claude-3-5-sonnet-20241022"
      }
    },
    "sales": {
      "coordinator": {
        "provider": "anthropic",
        "apiKeyEnvVar": "SALES_COORDINATOR_API_KEY",
        "subscription": "claude-max-sales",
        "model": "claude-sonnet-4-20250514"
      },
      "workers": {
        "provider": "zai",
        "apiKeyEnvVar": "ZAI_API_KEY",
        "billing": "pay-as-you-go",
        "defaultModel": "claude-3-5-haiku-20241022",
        "complexModel": "claude-3-5-sonnet-20241022"
      }
    },
    "support": {
      "coordinator": {
        "provider": "anthropic",
        "apiKeyEnvVar": "SUPPORT_COORDINATOR_API_KEY",
        "subscription": "claude-max-support",
        "model": "claude-sonnet-4-20250514"
      },
      "workers": {
        "provider": "zai",
        "apiKeyEnvVar": "ZAI_API_KEY",
        "billing": "pay-as-you-go",
        "defaultModel": "claude-3-5-haiku-20241022",
        "complexModel": "claude-3-5-sonnet-20241022"
      }
    },
    "finance": {
      "coordinator": {
        "provider": "anthropic",
        "apiKeyEnvVar": "FINANCE_COORDINATOR_API_KEY",
        "subscription": "claude-max-finance",
        "model": "claude-sonnet-4-20250514"
      },
      "workers": {
        "provider": "zai",
        "apiKeyEnvVar": "ZAI_API_KEY",
        "billing": "pay-as-you-go",
        "defaultModel": "claude-3-5-haiku-20241022",
        "complexModel": "claude-3-5-sonnet-20241022"
      }
    }
  },
  "csuite": {
    "provider": "anthropic",
    "apiKeyEnvVar": "CSUITE_COORDINATOR_API_KEY",
    "subscription": "claude-max-csuite",
    "model": "claude-sonnet-4-20250514",
    "fallback": "engineering"
  },
  "workerModelSelection": {
    "simpleKeywords": ["extract", "summarize", "list", "count", "validate", "format"],
    "complexKeywords": ["design", "architect", "review", "analyze", "optimize", "debug"],
    "defaultToSimple": true
  }
}
```

**2. Role-Based Provider Routing**

**File:** `.claude/skills/cfn-agent-execution/execute-agent.sh` (enhanced)

```bash
#!/usr/bin/env bash
##############################################################################
# Agent Execution Script (Hybrid Routing Edition)
#
# Executes CLI-spawned agents with role-based provider routing:
# - Coordinators: Claude Max (strategic intelligence, orchestration)
# - Workers: Z.ai (implementation, cost-optimized)
#
# Environment Variables:
#   AGENT_TYPE      - Agent type/name (e.g., "marketing-coordinator", "marketing-content-writer")
#   AGENT_ROLE      - Agent role: "coordinator" or "worker" (auto-inferred if not set)
#   TEAM_ID         - Team identifier (auto-inferred from agent type if not set)
#   TASK_COMPLEXITY - Task complexity: "simple" or "complex" (for worker model selection)
#   ... (other vars same as before)
##############################################################################

set -euo pipefail

# Validate required environment variables
if [ -z "${AGENT_TYPE:-}" ]; then
  echo "Error: AGENT_TYPE environment variable required" >&2
  exit 1
fi

if [ -z "${PROMPT_FILE:-}" ] || [ ! -f "${PROMPT_FILE:-}" ]; then
  echo "Error: PROMPT_FILE must be set and file must exist" >&2
  exit 1
fi

# Default values
AGENT_ID="${AGENT_ID:-${AGENT_TYPE}-1}"
TASK_ID="${TASK_ID:-}"
ITERATION="${ITERATION:-1}"
MODE="${MODE:-cli}"

# STEP 1: Determine agent role (coordinator vs worker)
AGENT_ROLE="${AGENT_ROLE:-worker}"  # Default to worker
if [[ "$AGENT_TYPE" =~ -coordinator$ ]]; then
  AGENT_ROLE="coordinator"
fi

# STEP 2: Determine team from agent type or TEAM_ID env var
TEAM_ID="${TEAM_ID:-}"
if [ -z "$TEAM_ID" ]; then
  # Infer team from agent type
  # Examples:
  #   "marketing-coordinator" → "marketing"
  #   "marketing-content-writer" → "marketing"
  #   "engineering-backend-dev" → "engineering"
  TEAM_ID=$(echo "$AGENT_TYPE" | sed 's/-coordinator$//' | cut -d'-' -f1)
fi

echo "=== Agent Execution (Hybrid Routing) ==="
echo "Agent Type: $AGENT_TYPE"
echo "Agent ID: $AGENT_ID"
echo "Agent Role: $AGENT_ROLE"
echo "Team: $TEAM_ID"
echo "Task ID: ${TASK_ID:-N/A}"
echo "Iteration: $ITERATION"
echo "Mode: $MODE"
echo ""

# STEP 3: Load team-specific provider config based on role
API_PROVIDER="anthropic"
API_KEY_ENV_VAR="ANTHROPIC_API_KEY"
AGENT_MODEL="claude-3-5-sonnet-20241022"  # Default model

if [ -f ".claude/cfn-config/team-providers.json" ]; then
  if [ "$AGENT_ROLE" = "coordinator" ]; then
    # Coordinators use Claude Max
    TEAM_CONFIG=$(jq -r ".teams.\"$TEAM_ID\".coordinator // .csuite" .claude/cfn-config/team-providers.json)

    if [ "$TEAM_CONFIG" != "null" ]; then
      API_PROVIDER=$(echo "$TEAM_CONFIG" | jq -r '.provider // "anthropic"')
      API_KEY_ENV_VAR=$(echo "$TEAM_CONFIG" | jq -r '.apiKeyEnvVar // "ANTHROPIC_API_KEY"')
      AGENT_MODEL=$(echo "$TEAM_CONFIG" | jq -r '.model // "claude-3-5-sonnet-20241022"')
    fi
  else
    # Workers use Z.ai with model selection based on task complexity
    TEAM_CONFIG=$(jq -r ".teams.\"$TEAM_ID\".workers" .claude/cfn-config/team-providers.json)

    if [ "$TEAM_CONFIG" != "null" ]; then
      API_PROVIDER=$(echo "$TEAM_CONFIG" | jq -r '.provider // "zai"')
      API_KEY_ENV_VAR=$(echo "$TEAM_CONFIG" | jq -r '.apiKeyEnvVar // "ZAI_API_KEY"')

      # Model selection: simple tasks use Haiku, complex use Sonnet
      TASK_COMPLEXITY="${TASK_COMPLEXITY:-simple}"
      if [ "$TASK_COMPLEXITY" = "complex" ]; then
        AGENT_MODEL=$(echo "$TEAM_CONFIG" | jq -r '.complexModel // "claude-3-5-sonnet-20241022"')
      else
        AGENT_MODEL=$(echo "$TEAM_CONFIG" | jq -r '.defaultModel // "claude-3-5-haiku-20241022"')
      fi
    fi
  fi
fi

# STEP 4: Resolve API key from environment
API_KEY="${!API_KEY_ENV_VAR}"

if [ -z "$API_KEY" ]; then
  echo "Error: API key not found in environment variable $API_KEY_ENV_VAR" >&2
  exit 1
fi

echo "API Provider: $API_PROVIDER"
echo "API Key Source: $API_KEY_ENV_VAR"
echo "Model: $AGENT_MODEL"
echo ""

# STEP 5: Read prompt from file
PROMPT=$(cat "$PROMPT_FILE")

echo "=== Agent Prompt (First 500 chars) ==="
echo "$PROMPT" | head -c 500
echo "..."
echo ""

# STEP 6: Execute agent via appropriate API
# TODO: Replace this section with actual API client integration
echo "=== Agent Execution Status ==="
echo "✅ Agent prompt prepared successfully"
echo "⚠️  Note: Direct API execution will be implemented in Sprint 1.3"
echo ""
echo "Execution Plan:"
echo "1. Call ${API_PROVIDER} API with model ${AGENT_MODEL}"
echo "2. Pass prompt from ${PROMPT_FILE}"
echo "3. Stream response and execute tools (bash_execute, write_file, read_file)"
echo "4. Store output in Redis for coordinator retrieval"
echo ""

# STEP 7: CFN Loop completion protocol (for CFN Loop agents)
if [ -n "$TASK_ID" ]; then
  echo "=== CFN Loop Completion Protocol ==="
  echo "This agent will execute the following protocol:"
  echo ""
  echo "1. Execute task work"
  echo "2. redis-cli lpush \"swarm:${TASK_ID}:${AGENT_ID}:done\" \"complete\""
  echo "3. ./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \\"
  echo "     --task-id \"$TASK_ID\" \\"
  echo "     --agent-id \"$AGENT_ID\" \\"
  echo "     --confidence 0.85 \\"
  echo "     --iteration $ITERATION"
  echo "4. Exit (ephemeral worker, no waiting mode needed)"
  echo ""
fi

# Clean up prompt file
rm -f "$PROMPT_FILE"

# Exit with success (temporary until real execution implemented)
exit 0
```

**3. Docker Compose with Hybrid Architecture**

**File:** `docker-compose.hybrid.yml`

```yaml
version: '3.8'

services:
  ##############################################################################
  # Team Coordinators (Claude Max)
  ##############################################################################

  marketing-coordinator:
    image: claude-flow-novice:latest
    container_name: marketing-coordinator
    environment:
      - TEAM_ID=marketing
      - AGENT_ROLE=coordinator
      # Claude Max subscription
      - MARKETING_COORDINATOR_API_KEY=${MARKETING_COORDINATOR_API_KEY}
      # Z.ai for spawning workers
      - ZAI_API_KEY=${ZAI_API_KEY}
      # Infrastructure
      - REDIS_URL=redis://redis:6379
      - POSTGRES_URL=${POSTGRES_URL}
    volumes:
      - ./.claude:/app/.claude:ro
      - ./src:/app/src:ro
      - marketing-playbooks:/app/playbooks
    networks:
      - marketing-network
      - coordinator-mesh
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    command: ["node", "src/coordinators/team-coordinator.js", "--team=marketing"]

  engineering-coordinator:
    image: claude-flow-novice:latest
    container_name: engineering-coordinator
    environment:
      - TEAM_ID=engineering
      - AGENT_ROLE=coordinator
      - ENGINEERING_COORDINATOR_API_KEY=${ENGINEERING_COORDINATOR_API_KEY}
      - ZAI_API_KEY=${ZAI_API_KEY}
      - REDIS_URL=redis://redis:6379
      - POSTGRES_URL=${POSTGRES_URL}
    volumes:
      - ./.claude:/app/.claude:ro
      - ./src:/app/src:ro
      - engineering-playbooks:/app/playbooks
    networks:
      - engineering-network
      - coordinator-mesh
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    command: ["node", "src/coordinators/team-coordinator.js", "--team=engineering"]

  sales-coordinator:
    image: claude-flow-novice:latest
    container_name: sales-coordinator
    environment:
      - TEAM_ID=sales
      - AGENT_ROLE=coordinator
      - SALES_COORDINATOR_API_KEY=${SALES_COORDINATOR_API_KEY}
      - ZAI_API_KEY=${ZAI_API_KEY}
      - REDIS_URL=redis://redis:6379
      - POSTGRES_URL=${POSTGRES_URL}
    volumes:
      - ./.claude:/app/.claude:ro
      - ./src:/app/src:ro
      - sales-playbooks:/app/playbooks
    networks:
      - sales-network
      - coordinator-mesh
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    command: ["node", "src/coordinators/team-coordinator.js", "--team=sales"]

  support-coordinator:
    image: claude-flow-novice:latest
    container_name: support-coordinator
    environment:
      - TEAM_ID=support
      - AGENT_ROLE=coordinator
      - SUPPORT_COORDINATOR_API_KEY=${SUPPORT_COORDINATOR_API_KEY}
      - ZAI_API_KEY=${ZAI_API_KEY}
      - REDIS_URL=redis://redis:6379
      - POSTGRES_URL=${POSTGRES_URL}
    volumes:
      - ./.claude:/app/.claude:ro
      - ./src:/app/src:ro
      - support-playbooks:/app/playbooks
    networks:
      - support-network
      - coordinator-mesh
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    command: ["node", "src/coordinators/team-coordinator.js", "--team=support"]

  finance-coordinator:
    image: claude-flow-novice:latest
    container_name: finance-coordinator
    environment:
      - TEAM_ID=finance
      - AGENT_ROLE=coordinator
      - FINANCE_COORDINATOR_API_KEY=${FINANCE_COORDINATOR_API_KEY}
      - ZAI_API_KEY=${ZAI_API_KEY}
      - REDIS_URL=redis://redis:6379
      - POSTGRES_URL=${POSTGRES_URL}
    volumes:
      - ./.claude:/app/.claude:ro
      - ./src:/app/src:ro
      - finance-playbooks:/app/playbooks
    networks:
      - finance-network
      - coordinator-mesh
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    command: ["node", "src/coordinators/team-coordinator.js", "--team=finance"]

  ##############################################################################
  # Shared Infrastructure
  ##############################################################################

  redis:
    image: redis:7-alpine
    container_name: cfn-redis
    networks:
      - coordinator-mesh
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    container_name: cfn-postgres
    environment:
      - POSTGRES_DB=playbooks
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    networks:
      - coordinator-mesh
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql:ro
    restart: unless-stopped

  ##############################################################################
  # Monitoring & Observability
  ##############################################################################

  grafana:
    image: grafana/grafana:latest
    container_name: cfn-grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
    networks:
      - coordinator-mesh
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources:ro
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:latest
    container_name: cfn-prometheus
    networks:
      - coordinator-mesh
    ports:
      - "9090:9090"
    volumes:
      - prometheus-data:/prometheus
      - ./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    restart: unless-stopped

networks:
  # Team-isolated networks (workers spawn here)
  marketing-network:
    internal: true
  engineering-network:
    internal: true
  sales-network:
    internal: true
  support-network:
    internal: true
  finance-network:
    internal: true

  # Coordinator mesh (cross-team communication)
  coordinator-mesh:
    internal: false

volumes:
  # Team playbook storage
  marketing-playbooks:
  engineering-playbooks:
  sales-playbooks:
  support-playbooks:
  finance-playbooks:

  # Infrastructure
  redis-data:
  postgres-data:
  grafana-data:
  prometheus-data:
```

**4. Environment Variables Template**

**File:** `.env.hybrid.example`

```bash
##############################################################################
# Hybrid Architecture Environment Variables
##############################################################################

# Claude Max Subscriptions (5 teams)
# Each coordinator requires a separate Claude Max subscription ($20/month)
MARKETING_COORDINATOR_API_KEY=sk-ant-api03-your-marketing-key
ENGINEERING_COORDINATOR_API_KEY=sk-ant-api03-your-engineering-key
SALES_COORDINATOR_API_KEY=sk-ant-api03-your-sales-key
SUPPORT_COORDINATOR_API_KEY=sk-ant-api03-your-support-key
FINANCE_COORDINATOR_API_KEY=sk-ant-api03-your-finance-key

# Optional: C-Suite subscription (can rotate across teams if not provided)
CSUITE_COORDINATOR_API_KEY=sk-ant-api03-your-csuite-key

# Z.ai API Key (shared by all workers, pay-as-you-go billing)
# Workers spawn with Z.ai provider automatically
ZAI_API_KEY=your-zai-api-key-here

# PostgreSQL (playbook storage)
POSTGRES_USER=cfn_user
POSTGRES_PASSWORD=your-secure-password-here
POSTGRES_URL=postgresql://cfn_user:your-secure-password-here@postgres:5432/playbooks

# Redis (coordination & pub/sub)
REDIS_URL=redis://redis:6379

# Monitoring
GRAFANA_PASSWORD=your-grafana-password

##############################################################################
# Cost Tracking Configuration
##############################################################################

# Z.ai cost tracking (optional, for budget alerts)
ZAI_MONTHLY_BUDGET=500  # USD
ZAI_ALERT_THRESHOLD=0.8  # Alert at 80% of budget

# Expected monthly costs:
# - Coordinators: 5 × $20 = $100 (Claude Max subscriptions)
# - Workers: ~$234 (468M tokens @ $0.50/1M, based on 70 spawns/day across all teams)
# - Total: ~$334/month
```

**5. Worker Spawning with Z.ai Provider**

**File:** `.claude/skills/cfn-agent-spawning/spawn-worker.sh` (new)

```bash
#!/usr/bin/env bash
##############################################################################
# Spawn Worker Agent (Hybrid Architecture)
#
# Spawns ephemeral worker agent with Z.ai provider for cost optimization.
# Called by coordinators when executing tasks.
#
# Usage:
#   ./scripts/spawn-worker.sh AGENT_TYPE TASK_ID AGENT_ID [TASK_COMPLEXITY]
#
# Examples:
#   ./scripts/spawn-worker.sh marketing-content-writer task-123 writer-1 simple
#   ./scripts/spawn-worker.sh engineering-backend-dev task-456 backend-1 complex
##############################################################################

set -euo pipefail

AGENT_TYPE="${1:-}"
TASK_ID="${2:-}"
AGENT_ID="${3:-${AGENT_TYPE}-1}"
TASK_COMPLEXITY="${4:-simple}"

if [ -z "$AGENT_TYPE" ] || [ -z "$TASK_ID" ]; then
  echo "Error: AGENT_TYPE and TASK_ID required" >&2
  echo "Usage: $0 AGENT_TYPE TASK_ID [AGENT_ID] [TASK_COMPLEXITY]" >&2
  exit 1
fi

# Determine team from agent type
TEAM_ID=$(echo "$AGENT_TYPE" | cut -d'-' -f1)

echo "=== Spawning Worker Agent ==="
echo "Agent Type: $AGENT_TYPE"
echo "Agent ID: $AGENT_ID"
echo "Team: $TEAM_ID"
echo "Task ID: $TASK_ID"
echo "Task Complexity: $TASK_COMPLEXITY"
echo ""

# Retrieve context from Redis
echo "Retrieving context from Redis..."
CONTEXT=$(redis-cli HGETALL "cfn_loop:task:${TASK_ID}:context" 2>/dev/null || echo "")

if [ -z "$CONTEXT" ]; then
  echo "Warning: No context found in Redis for task $TASK_ID" >&2
  CONTEXT="Generic task execution"
fi

# Retrieve playbooks from ACE system
echo "Loading playbooks from ACE system..."
PLAYBOOKS=$(./.claude/skills/cfn-ace-system/invoke-context-inject.sh \
  --agent-id "$AGENT_ID" \
  --team-id "$TEAM_ID" \
  --scope "agent,team,org" \
  --format "bullet" \
  2>/dev/null || echo "")

# Build agent prompt
PROMPT_FILE="/tmp/worker-prompt-${AGENT_ID}.txt"
cat > "$PROMPT_FILE" <<EOF
You are ${AGENT_TYPE}, a specialized worker agent in the ${TEAM_ID} team.

TASK CONTEXT:
${CONTEXT}

ORGANIZATIONAL PLAYBOOKS:
${PLAYBOOKS}

INSTRUCTIONS:
1. Execute the task described in the context above
2. Apply relevant playbook patterns to your work
3. Report confidence score (0.0-1.0) when complete
4. Store new lessons learned via ACE reflection

COMPLETION PROTOCOL:
1. redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
2. ./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \\
     --task-id "${TASK_ID}" \\
     --agent-id "${AGENT_ID}" \\
     --confidence [YOUR_CONFIDENCE] \\
     --iteration 1
3. Exit (you are ephemeral, do not enter waiting mode)
EOF

# Spawn worker via CLI with hybrid routing
echo "Spawning worker via CLI with Z.ai provider..."
export AGENT_TYPE
export AGENT_ID
export TEAM_ID
export TASK_ID
export AGENT_ROLE="worker"
export TASK_COMPLEXITY
export PROMPT_FILE

# Execute agent (will use Z.ai provider based on AGENT_ROLE=worker)
./.claude/skills/cfn-agent-execution/execute-agent.sh

echo ""
echo "✅ Worker spawned successfully"
echo "   Monitor completion: redis-cli blpop \"swarm:${TASK_ID}:${AGENT_ID}:done\" 0"
```

### Acceptance Criteria

**Sprint 1.2 Complete When:**
- ✅ `.claude/cfn-config/team-providers.json` created with coordinator/worker split
- ✅ `execute-agent.sh` enhanced with role-based routing (coordinator vs worker)
- ✅ `spawn-worker.sh` created for Z.ai worker spawning
- ✅ `docker-compose.hybrid.yml` created with 5 coordinators + infrastructure
- ✅ `.env.hybrid.example` documented with all API keys
- ✅ JSON schema validation passes for team-providers.json
- ✅ Docker compose syntax validation passes

**Sprint 1.3 Complete When:**
- ✅ Test: Coordinator (Claude Max) spawns worker (Z.ai) successfully
- ✅ Test: Worker retrieves context from Redis
- ✅ Test: Worker loads playbooks from ACE system (PostgreSQL)
- ✅ Test: Worker reports confidence and exits cleanly
- ✅ Test: 5 concurrent workers spawn without rate limit conflicts
- ✅ Test: Cross-team coordinator communication (mesh network)
- ✅ Cost tracking: Z.ai usage logged per team

---

## Pre-Deployment Checklist (Week 1, Before Sprint 1.2)

### 1. Purchase Subscriptions & API Keys

**Claude Max Subscriptions (5 required):**
- [ ] Marketing team subscription ($20/month)
- [ ] Engineering team subscription ($20/month)
- [ ] Sales team subscription ($20/month)
- [ ] Support team subscription ($20/month)
- [ ] Finance team subscription ($20/month)
- [ ] Optional: C-Suite subscription ($20/month)

**Z.ai API Key (1 required):**
- [ ] Create Z.ai account at https://z.ai
- [ ] Purchase pay-as-you-go API key
- [ ] Initial budget: $100 (covers ~200M tokens, 30 days at low usage)

**Total Upfront Cost:**
- 5 Claude Max subscriptions: $100/month
- Z.ai initial credit: $100 (one-time)
- **Total Month 1:** $200

### 2. Infrastructure Setup

**Local Development:**
- [ ] Install Docker Desktop (or Docker Engine + Docker Compose)
- [ ] Install Redis CLI: `brew install redis` (macOS) or `apt install redis-tools` (Linux)
- [ ] Install PostgreSQL client: `brew install postgresql` or `apt install postgresql-client`
- [ ] Install jq: `brew install jq` or `apt install jq`

**Cloud Infrastructure (Optional for Week 1, Required by Week 3):**
- [ ] Provision cloud VMs (AWS EC2, GCP Compute Engine, or Azure VMs)
- [ ] Configure VPC/networking (isolated networks per team)
- [ ] Set up persistent volumes (EBS, Persistent Disks, or Azure Disks)
- [ ] Configure secrets management (AWS Secrets Manager, GCP Secret Manager, or Azure Key Vault)

### 3. Security Hardening

**API Key Storage:**
- [ ] Create `.env` file from `.env.hybrid.example`
- [ ] Add `.env` to `.gitignore` (NEVER commit API keys)
- [ ] Rotate placeholder keys in `.env.hybrid.example`
- [ ] Document API key rotation policy (90 days)

**Container Isolation:**
- [ ] Verify team networks are `internal: true` (no external access)
- [ ] Verify coordinator-mesh network allows cross-team communication
- [ ] Test worker cannot access other team's Redis keys
- [ ] Test worker cannot query other team's PostgreSQL playbooks

**MCP Permissions (Per Container):**
- [ ] Define MCP server configs per team (different n8n accounts, separate credentials)
- [ ] Test marketing agent cannot access engineering n8n workflows
- [ ] Document MCP isolation strategy

### 4. Cost Monitoring Setup

**Z.ai Usage Tracking:**
- [ ] Create cost tracking script: `scripts/track-zai-costs.sh`
- [ ] Store daily costs in Redis: `cfn:costs:YYYY-MM-DD:TEAM_ID`
- [ ] Set up daily cost summary cron job
- [ ] Configure budget alerts (email/Slack when >80% of monthly budget)

**Grafana Dashboard:**
- [ ] Create dashboard: "Hybrid Architecture Costs"
- [ ] Panel 1: Daily Z.ai costs per team (stacked area chart)
- [ ] Panel 2: Claude Max subscription costs (static $100/month)
- [ ] Panel 3: Cost per agent spawn (gauge, target <$0.05)
- [ ] Panel 4: Monthly cost projection (based on current usage)

---

## Sprint 1.3: Hybrid Routing Validation (3 days)

### Day 1: Single Worker Test

**Goal:** Validate coordinator → worker spawning with Z.ai

**Test Script:** `tests/hybrid-architecture/01-single-worker-spawn.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Test 1: Single Worker Spawn (Marketing Team) ==="

# Step 1: Start infrastructure
docker-compose -f docker-compose.hybrid.yml up -d redis postgres
sleep 5

# Step 2: Inject test context into Redis
TASK_ID="test-single-worker-$(date +%s)"
redis-cli HSET "cfn_loop:task:${TASK_ID}:context" \
  "deliverables" "Create test file: /tmp/test-worker-output.txt" \
  "acceptanceCriteria" "File exists with content 'Hello from Z.ai worker'" \
  "teamId" "marketing"

# Step 3: Spawn coordinator (Claude Max) via docker exec
docker-compose -f docker-compose.hybrid.yml up -d marketing-coordinator
sleep 10

# Step 4: Coordinator spawns worker (Z.ai)
docker exec marketing-coordinator bash -c "
  export TASK_ID='${TASK_ID}'
  export AGENT_TYPE='marketing-content-writer'
  export AGENT_ID='writer-test-1'
  ./.claude/skills/cfn-agent-spawning/spawn-worker.sh \
    marketing-content-writer ${TASK_ID} writer-test-1 simple
"

# Step 5: Wait for worker completion (max 60 seconds)
echo "Waiting for worker completion..."
timeout 60 redis-cli blpop "swarm:${TASK_ID}:writer-test-1:done" 0 || {
  echo "❌ Test failed: Worker did not complete within 60 seconds"
  exit 1
}

# Step 6: Verify confidence score reported
CONFIDENCE=$(redis-cli HGET "cfn_loop:task:${TASK_ID}:confidence" "writer-test-1")
if [ -z "$CONFIDENCE" ]; then
  echo "❌ Test failed: No confidence score reported"
  exit 1
fi

echo "✅ Test passed: Worker completed with confidence $CONFIDENCE"

# Step 7: Verify Z.ai provider was used
COST=$(redis-cli HGET "cfn:costs:$(date +%Y-%m-%d):marketing" "worker_cost")
if [ "$COST" = "0" ] || [ -z "$COST" ]; then
  echo "⚠️  Warning: No Z.ai cost recorded (expected ~$0.01-0.05)"
else
  echo "✅ Z.ai cost recorded: \$$COST"
fi

# Cleanup
docker-compose -f docker-compose.hybrid.yml down
```

**Expected Output:**
```
=== Test 1: Single Worker Spawn (Marketing Team) ===
Waiting for worker completion...
✅ Test passed: Worker completed with confidence 0.87
✅ Z.ai cost recorded: $0.03
```

### Day 2: Concurrent Workers Test

**Goal:** Validate 5 concurrent workers per team without rate limit conflicts

**Test Script:** `tests/hybrid-architecture/02-concurrent-workers.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Test 2: Concurrent Workers (5 per team) ==="

# Start infrastructure + all coordinators
docker-compose -f docker-compose.hybrid.yml up -d
sleep 15

TASK_ID="test-concurrent-$(date +%s)"

# Spawn 5 workers per team concurrently
TEAMS=("marketing" "engineering" "sales" "support" "finance")
WORKER_COUNT=5

for TEAM in "${TEAMS[@]}"; do
  echo "Spawning ${WORKER_COUNT} workers for ${TEAM} team..."

  for i in $(seq 1 $WORKER_COUNT); do
    AGENT_ID="${TEAM}-worker-${i}"

    # Inject context
    redis-cli HSET "cfn_loop:task:${TASK_ID}:context" \
      "deliverables" "Worker ${i} task for ${TEAM}" \
      "teamId" "${TEAM}"

    # Spawn worker in background
    docker exec "${TEAM}-coordinator" bash -c "
      ./.claude/skills/cfn-agent-spawning/spawn-worker.sh \
        ${TEAM}-agent ${TASK_ID} ${AGENT_ID} simple
    " &
  done
done

# Wait for all workers (max 120 seconds)
echo "Waiting for 25 workers to complete (5 teams × 5 workers)..."
COMPLETED=0
START_TIME=$(date +%s)

while [ $COMPLETED -lt 25 ]; do
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))

  if [ $ELAPSED -gt 120 ]; then
    echo "❌ Test failed: Not all workers completed within 120 seconds"
    echo "   Completed: $COMPLETED / 25"
    exit 1
  fi

  # Count completed workers
  COMPLETED=$(redis-cli KEYS "swarm:${TASK_ID}:*:done" | wc -l)
  echo "Progress: $COMPLETED / 25 workers completed"
  sleep 5
done

echo "✅ Test passed: All 25 workers completed"

# Verify no rate limit errors
RATE_LIMIT_ERRORS=$(docker logs marketing-coordinator 2>&1 | grep -c "rate limit" || true)
if [ $RATE_LIMIT_ERRORS -gt 0 ]; then
  echo "❌ Test failed: $RATE_LIMIT_ERRORS rate limit errors detected"
  exit 1
fi

echo "✅ No rate limit errors detected"

# Verify costs recorded for all teams
for TEAM in "${TEAMS[@]}"; do
  COST=$(redis-cli HGET "cfn:costs:$(date +%Y-%m-%d):${TEAM}" "worker_cost")
  echo "${TEAM} team Z.ai cost: \$$COST"
done

# Cleanup
docker-compose -f docker-compose.hybrid.yml down
```

**Expected Output:**
```
=== Test 2: Concurrent Workers (5 per team) ===
Spawning 5 workers for marketing team...
... (spawn logs)
Progress: 5 / 25 workers completed
Progress: 12 / 25 workers completed
Progress: 20 / 25 workers completed
Progress: 25 / 25 workers completed
✅ Test passed: All 25 workers completed
✅ No rate limit errors detected
marketing team Z.ai cost: $0.15
engineering team Z.ai cost: $0.18
... (other teams)
```

### Day 3: Cross-Team Coordination Test

**Goal:** Validate coordinator mesh communication (engineering escalates to C-Suite)

**Test Script:** `tests/hybrid-architecture/03-cross-team-coordination.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Test 3: Cross-Team Coordination ==="

# Start all coordinators
docker-compose -f docker-compose.hybrid.yml up -d
sleep 15

TASK_ID="test-cross-team-$(date +%s)"

# Engineering coordinator detects critical issue and escalates to C-Suite
echo "Simulating engineering escalation to C-Suite..."

# Step 1: Engineering coordinator spawns worker
redis-cli HSET "cfn_loop:task:${TASK_ID}:context" \
  "issue" "Critical security vulnerability detected in production" \
  "severity" "P0" \
  "teamId" "engineering"

docker exec engineering-coordinator bash -c "
  ./.claude/skills/cfn-agent-spawning/spawn-worker.sh \
    engineering-security-analyst ${TASK_ID} security-1 complex
"

# Step 2: Worker detects issue and signals escalation
timeout 60 redis-cli blpop "swarm:${TASK_ID}:security-1:done" 0

CONFIDENCE=$(redis-cli HGET "cfn_loop:task:${TASK_ID}:confidence" "security-1")
echo "Security analyst confidence: $CONFIDENCE"

# Step 3: Engineering coordinator publishes escalation to coordinator mesh
docker exec engineering-coordinator bash -c "
  redis-cli PUBLISH coordinator-mesh '{
    \"type\": \"escalation\",
    \"from\": \"engineering\",
    \"to\": \"csuite\",
    \"taskId\": \"${TASK_ID}\",
    \"severity\": \"P0\",
    \"summary\": \"Critical security vulnerability requires immediate CTO review\"
  }'
"

# Step 4: C-Suite coordinator receives escalation (simulate with manual check)
echo "Verifying C-Suite can receive escalation..."
ESCALATION_RECEIVED=$(redis-cli PUBSUB NUMSUB coordinator-mesh | awk '{print $2}')

if [ "$ESCALATION_RECEIVED" -gt 0 ]; then
  echo "✅ Test passed: C-Suite coordinator subscribed to mesh"
else
  echo "❌ Test failed: C-Suite coordinator not subscribed to mesh"
  exit 1
fi

# Step 5: Verify coordinators use Claude Max, workers use Z.ai
ENGINEERING_PROVIDER=$(docker exec engineering-coordinator bash -c "
  grep 'API Provider:' /tmp/coordinator-*.log | tail -1 | awk '{print \$3}'
")

WORKER_PROVIDER=$(redis-cli HGET "cfn:agent:security-1:metadata" "provider")

echo "Engineering coordinator provider: $ENGINEERING_PROVIDER (expect: anthropic)"
echo "Worker provider: $WORKER_PROVIDER (expect: zai)"

if [ "$ENGINEERING_PROVIDER" != "anthropic" ]; then
  echo "❌ Test failed: Coordinator not using Claude Max"
  exit 1
fi

if [ "$WORKER_PROVIDER" != "zai" ]; then
  echo "❌ Test failed: Worker not using Z.ai"
  exit 1
fi

echo "✅ Test passed: Coordinator (Claude Max) + Worker (Z.ai) validated"

# Cleanup
docker-compose -f docker-compose.hybrid.yml down
```

**Expected Output:**
```
=== Test 3: Cross-Team Coordination ===
Simulating engineering escalation to C-Suite...
Security analyst confidence: 0.72
Verifying C-Suite can receive escalation...
✅ Test passed: C-Suite coordinator subscribed to mesh
Engineering coordinator provider: anthropic (expect: anthropic)
Worker provider: zai (expect: zai)
✅ Test passed: Coordinator (Claude Max) + Worker (Z.ai) validated
```

---

## Updated Epic Configuration

**File:** `planning/docker/cfn-organizational-architecture-epic-hybrid.json`

```json
{
  "epicId": "cfn-organizational-architecture-hybrid",
  "name": "AI Organizational Architecture - Hybrid from Start",
  "description": "Deploy Docker-based organizational structure with hybrid routing (Claude Max coordinators + Z.ai workers) from Day 1. Skips pure Claude validation phase.",
  "status": "not_started",
  "owner": "Infrastructure & Architecture Team",
  "estimatedDuration": "11 weeks",
  "dependencies": ["cfn-marketing-n8n-mcp-integration"],
  "overviewFile": "planning/docker/EPIC_ORGANIZATIONAL_ARCHITECTURE.md",
  "architecturePattern": "hybrid-coordinators-workers",
  "securityModel": "container-isolation-with-per-agent-mcp",
  "costModel": {
    "coordinators": {
      "provider": "anthropic",
      "billing": "subscription",
      "monthlyCost": 100,
      "count": 5
    },
    "workers": {
      "provider": "zai",
      "billing": "pay-as-you-go",
      "estimatedMonthlyCost": 234,
      "tokenRate": 0.50,
      "estimatedTokens": 468000000
    },
    "totalMonthlyCost": 334,
    "totalAnnualCost": 4008
  },

  "phases": [
    {
      "phaseId": "phase-1-infrastructure-hybrid",
      "name": "Infrastructure Templates & Hybrid Routing Setup",
      "description": "Create Docker templates with hybrid routing (Claude Max coordinators + Z.ai workers) from Day 1. Includes ACE enhancement and validation tests.",
      "file": "planning/docker/PHASE_1_INFRASTRUCTURE_HYBRID.md",
      "status": "not_started",
      "dependencies": [],
      "estimatedDuration": "2 weeks",
      "weeks": "1-2",
      "budget": 8000,

      "sprints": [
        {
          "sprintId": "sprint-1.1",
          "name": "ACE System Enhancement - Scope & Team Support",
          "status": "not_started",
          "duration": "3 days",
          "week": 1,
          "dependencies": [],
          "deliverables": [
            "ACE schema migration: Add scope, owner_id, team_id columns",
            ".claude/skills/cfn-ace-system/migrate-schema.sh (SQLite → PostgreSQL)",
            "tests/ace-system/test-scope-isolation.sh"
          ],
          "acceptanceCriteria": [
            "PostgreSQL schema created with scope fields",
            "Context injection supports --scope=agent|team|org",
            "Team isolation validated (marketing can't see engineering lessons)"
          ]
        },
        {
          "sprintId": "sprint-1.2",
          "name": "Docker Templates & Hybrid Routing Configuration",
          "status": "not_started",
          "duration": "4 days",
          "week": 1,
          "dependencies": ["sprint-1.1"],
          "deliverables": [
            ".claude/cfn-config/team-providers.json (coordinator/worker split)",
            ".claude/skills/cfn-agent-execution/execute-agent.sh (role-based routing)",
            ".claude/skills/cfn-agent-spawning/spawn-worker.sh (Z.ai worker spawning)",
            "docker-compose.hybrid.yml (5 coordinators + infrastructure)",
            ".env.hybrid.example (API key template)"
          ],
          "acceptanceCriteria": [
            "team-providers.json includes coordinator (Claude Max) + worker (Z.ai) configs",
            "execute-agent.sh routes coordinators to Claude Max, workers to Z.ai",
            "Docker compose syntax valid, all services defined",
            "Environment template documents all required API keys"
          ]
        },
        {
          "sprintId": "sprint-1.3",
          "name": "Hybrid Routing Validation Tests",
          "status": "not_started",
          "duration": "3 days",
          "week": 2,
          "dependencies": ["sprint-1.2"],
          "deliverables": [
            "tests/hybrid-architecture/01-single-worker-spawn.sh",
            "tests/hybrid-architecture/02-concurrent-workers.sh",
            "tests/hybrid-architecture/03-cross-team-coordination.sh",
            "Cost tracking script: scripts/track-zai-costs.sh",
            "Monitoring dashboard: monitoring/grafana/dashboards/hybrid-costs.json"
          ],
          "acceptanceCriteria": [
            "Single worker spawns successfully with Z.ai provider",
            "5 concurrent workers per team (25 total) complete without rate limit errors",
            "Cross-team coordinator communication works (engineering → C-Suite escalation)",
            "Coordinators use Claude Max, workers use Z.ai (validated via logs)",
            "Z.ai costs tracked per team in Redis"
          ]
        }
      ],

      "successCriteria": [
        "Hybrid routing operational: Coordinators (Claude Max) + Workers (Z.ai)",
        "All 3 validation tests pass (single worker, concurrent, cross-team)",
        "No rate limit conflicts between coordinators and workers",
        "Cost tracking functional (Z.ai usage logged per team)",
        "Docker infrastructure deployed locally, ready for cloud migration"
      ]
    },

    {
      "phaseId": "phase-2-team-deployments",
      "name": "Gradual Team Deployments (Hybrid Architecture)",
      "description": "Deploy all 5 teams with hybrid architecture. Marketing pilot week 3, remaining teams weeks 4-6.",
      "file": "planning/docker/PHASE_2_TEAM_DEPLOYMENTS.md",
      "status": "not_started",
      "dependencies": ["phase-1-infrastructure-hybrid"],
      "estimatedDuration": "4 weeks",
      "weeks": "3-6",
      "budget": 16000,

      "sprints": [
        {
          "sprintId": "sprint-2.1",
          "name": "Marketing Pilot (Hybrid)",
          "duration": "1 week",
          "week": 3,
          "deliverables": [
            "marketing-coordinator deployed (Claude Max)",
            "3 test workers spawned (Z.ai)",
            "48-hour validation report"
          ],
          "acceptanceCriteria": [
            "Marketing coordinator spawns workers successfully",
            "Workers complete tasks with >0.85 average confidence",
            "Z.ai costs <$5 for 48-hour test period",
            "No rate limit errors"
          ]
        },
        {
          "sprintId": "sprint-2.2",
          "name": "Engineering Deployment",
          "duration": "1 week",
          "week": 4
        },
        {
          "sprintId": "sprint-2.3",
          "name": "Sales + Support Deployment",
          "duration": "1 week",
          "week": 5
        },
        {
          "sprintId": "sprint-2.4",
          "name": "Finance Deployment",
          "duration": "1 week",
          "week": 6
        }
      ]
    },

    {
      "phaseId": "phase-3-csuite-optimization",
      "name": "C-Suite Deployment & Cost Optimization",
      "description": "Deploy C-Suite agents, implement cost optimization strategies (model tiering, batching, playbooks).",
      "duration": "3 weeks",
      "weeks": "7-9",
      "budget": 12000
    },

    {
      "phaseId": "phase-4-operational-hardening",
      "name": "Production Testing & Operational Hardening",
      "description": "Load testing, security audit, documentation, handoff to operations.",
      "duration": "2 weeks",
      "weeks": "10-11",
      "budget": 8000
    }
  ],

  "totalInvestment": 44000,
  "estimatedAnnualSavings": 91800,
  "paybackPeriod": "5.8 months",
  "roi": "208%",

  "keyChanges": [
    "Hybrid routing from Day 1 (no pure Claude phase)",
    "Timeline reduced: 12 weeks → 11 weeks (removed migration work)",
    "Cost model: $334/month ($100 Claude Max + $234 Z.ai workers)",
    "Production-validated architecture (Sprint 2 CFN Loop tests)",
    "Rate limit isolation: Coordinators never blocked by worker load"
  ]
}
```

---

## Summary of Changes

### Removed
- ❌ Sprint 1.3: Pure Claude validation (no longer needed)
- ❌ Week 22-23: Migration from pure Claude to hybrid (deploy hybrid from start)
- ❌ Week 12: Extended migration buffer

### Added
- ✅ Sprint 1.2: Hybrid routing configuration (coordinator/worker split from Day 1)
- ✅ Sprint 1.3: Hybrid routing validation tests (single worker, concurrent, cross-team)
- ✅ Cost tracking: Z.ai usage per team from Day 1
- ✅ Model tiering configuration: Haiku for simple tasks, Sonnet for complex

### Net Impact
- **Timeline:** 12 weeks → 11 weeks (1 week saved)
- **Budget:** $56,000 → $44,000 ($12,000 saved, less migration work)
- **Risk:** Lower (deploy correctly once vs migrate mid-project)
- **Cost:** Same total ($334/month steady state)

---

## Next Steps

1. **Purchase subscriptions** (5 Claude Max + 1 Z.ai) - Week 1
2. **Deploy `claude-code-expert` agent** to implement Sprint 1.2 configuration files
3. **Run validation tests** (Sprint 1.3) locally before cloud deployment
4. **Deploy marketing pilot** (Week 3) with hybrid architecture
5. **Scale to all teams** (Weeks 4-6)
